// assistantd — свой голосовой помощник на Яндекс Станции: «Алиса, спроси GPT …» уходит выбранной модели
// (OpenAI-совместимый API), ответ Алисы отменяется, ответ модели читает Алиса или OpenAI-совместимый TTS.
// Работает на самой колонке; настройки, команды и состояние — файлы, которые читает и пишет веб-панель.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

var version = "dev"

const (
	maindLog   = "/data/quasar/daemons_logs/maind.log"
	sayLimit   = 900 // символов в одном «Повтори за мной»: длиннее Алиса читает минуту и больше
	historyMax = 20
)

type entry struct {
	At       int64  `json:"at"`
	Source   string `json:"source"` // voice — голосом, panel — проверка из панели
	Question string `json:"question"`
	Answer   string `json:"answer,omitempty"`
	Error    string `json:"error,omitempty"`
	Ms       int64  `json:"ms,omitempty"`
}

type Daemon struct {
	cfgPath, statusPath, cmdPath string

	mu       sync.Mutex
	cfg      Config
	cfgErr   string
	cfgMod   time.Time
	state    string // idle, thinking, speaking
	err      string
	history  []entry
	convo    []message
	lastTurn time.Time
	cancel   context.CancelFunc
	dirty    bool

	alice aliceCLI
	// своя речь Алисы: после неё она по привычке слушает ещё 5 секунд — это гасим
	sayAt    time.Time
	ours     bool
	wokeUser bool
}

func (d *Daemon) reload() {
	st, err := os.Stat(d.cfgPath)
	if err != nil || st.ModTime().Equal(d.cfgMod) {
		return
	}
	c, err := loadConfig(d.cfgPath)
	d.mu.Lock()
	d.cfg, d.cfgMod, d.cfgErr, d.dirty = c, st.ModTime(), "", true
	if err != nil {
		d.cfgErr = "настройки не прочитаны: " + err.Error()
	}
	d.mu.Unlock()
}

func (d *Daemon) set(state, errText string) {
	d.mu.Lock()
	d.state, d.dirty = state, true
	if errText != "" || state == "thinking" {
		d.err = errText
	}
	d.mu.Unlock()
}

func (d *Daemon) writeStatus() {
	d.mu.Lock()
	if !d.dirty {
		d.mu.Unlock()
		return
	}
	d.dirty = false
	s := map[string]any{"pid": os.Getpid(), "version": version, "state": d.state, "error": d.err,
		"config_error": d.cfgErr, "enabled": d.cfg.Enabled, "history": d.history, "at": time.Now().Unix()}
	d.mu.Unlock()
	b, _ := json.Marshal(s)
	tmp := d.statusPath + ".tmp"
	if os.WriteFile(tmp, b, 0600) == nil {
		os.Rename(tmp, d.statusPath)
	}
}

// ask — один вопрос: модель → озвучка. Новый вопрос прерывает предыдущий.
func (d *Daemon) ask(question, source string) {
	d.mu.Lock()
	if d.cancel != nil {
		d.cancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	d.cancel = cancel
	c := d.cfg
	if time.Since(d.lastTurn) > 10*time.Minute {
		d.convo = nil
	}
	msgs := append([]message{{"system", c.LLM.SystemPrompt}}, d.convo...)
	msgs = append(msgs, message{"user", question})
	d.mu.Unlock()

	go func() {
		defer cancel()
		started := time.Now()
		e := entry{At: started.Unix(), Source: source, Question: question}
		finish := func(err error) {
			if err != nil && ctx.Err() == context.Canceled {
				return // прервал следующий вопрос — он и запишет историю
			}
			if err != nil {
				e.Error = err.Error()
				log.Printf("ошибка: %v", err)
			}
			e.Ms = time.Since(started).Milliseconds()
			d.mu.Lock()
			d.history = append(d.history, e)
			if len(d.history) > historyMax {
				d.history = d.history[len(d.history)-historyMax:]
			}
			d.mu.Unlock()
			d.set("idle", e.Error)
		}
		d.set("thinking", "")
		glowCtx, stopGlow := context.WithCancel(ctx)
		glowDone := make(chan struct{})
		go glow(glowCtx, c.LED, glowDone)
		unglow := func() { stopGlow(); <-glowDone }
		defer unglow()
		answer, err := chat(ctx, c.LLM, msgs)
		if err != nil {
			unglow()
			finish(err)
			return
		}
		e.Answer = answer
		d.mu.Lock()
		d.convo = append(d.convo, message{"user", question}, message{"assistant", answer})
		if n := 2 * c.LLM.History; len(d.convo) > n {
			d.convo = d.convo[len(d.convo)-n:]
		}
		d.lastTurn = time.Now()
		d.mu.Unlock()
		d.set("speaking", "")
		if c.TTS.Provider != "openai" {
			unglow() // дальше кольцом управляет сама Алиса: она читает ответ со своей анимацией
		}
		err = d.speak(ctx, c, answer)
		unglow()
		finish(err)
	}()
}

func (d *Daemon) speak(ctx context.Context, c Config, text string) error {
	if c.TTS.Provider == "openai" {
		wav, err := speech(ctx, c.TTS, c.LLM.Proxy, text)
		if err != nil {
			return err
		}
		cmd := exec.CommandContext(ctx, "/usr/bin/aplay", "-q", "-")
		cmd.Stdin = bytes.NewReader(wav)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("aplay: %v %s", err, bytes.TrimSpace(out))
		}
		return nil
	}
	d.mu.Lock()
	d.sayAt, d.ours, d.wokeUser = time.Now(), false, false
	d.mu.Unlock()
	return d.alice.Say(forSpeech(text, sayLimit))
}

func (d *Daemon) onEvent(ev logEvent) {
	d.mu.Lock()
	c := d.cfg
	recent := time.Since(d.sayAt) < time.Minute
	switch ev.kind {
	case "spotted":
		d.wokeUser = true
	case "speaking":
		if recent {
			d.ours, d.wokeUser = true, false
		}
	case "listening":
		if d.ours && !d.wokeUser {
			d.ours = false
			d.mu.Unlock()
			d.alice.Cancel() // Алиса договорила наш ответ и ждёт продолжения — не ждём
			return
		}
	case "idle":
		d.ours = false
	}
	d.mu.Unlock()
	if ev.kind != "phrase" || !c.Enabled {
		return
	}
	question, ok := matchTrigger(ev.phrase, c.Triggers)
	if !ok {
		return
	}
	d.alice.Cancel() // до того, как Алиса начнёт отвечать сама: у неё на это около секунды
	log.Printf("вопрос голосом (%d симв.)", len([]rune(question)))
	switch normalize(question) {
	case "":
		return
	case "новый разговор", "забудь", "забудь все":
		d.mu.Lock()
		d.convo = nil
		d.mu.Unlock()
		d.speak(context.Background(), c, "Хорошо, начинаем новый разговор.")
		return
	}
	d.ask(question, "voice")
}

// command — запрос из панели: {"ask": "текст"} (проверка без голоса) или {"stop": true}.
func (d *Daemon) command() {
	b, err := os.ReadFile(d.cmdPath)
	if err != nil {
		return
	}
	os.Remove(d.cmdPath)
	var cmd struct {
		Ask  string `json:"ask"`
		Stop bool   `json:"stop"`
	}
	if json.Unmarshal(b, &cmd) != nil {
		return
	}
	if cmd.Stop {
		d.mu.Lock()
		if d.cancel != nil {
			d.cancel()
		}
		d.mu.Unlock()
		d.alice.Cancel()
		d.set("idle", "")
	}
	if cmd.Ask != "" {
		d.ask(cmd.Ask, "panel")
	}
}

// follow читает журнал с конца (старые разговоры при перезапуске не повторяются) и переживает его ротацию.
func (d *Daemon) follow(ctx context.Context, path string) {
	var f *os.File
	var info os.FileInfo
	var offset int64
	var pending []byte
	first := true
	tick := time.NewTicker(200 * time.Millisecond)
	defer tick.Stop()
	buf := make([]byte, 64<<10)
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		d.reload()
		d.command()
		d.writeStatus()
		st, err := os.Stat(path)
		if err != nil {
			continue
		}
		if f == nil || !os.SameFile(info, st) || st.Size() < offset {
			if f != nil {
				f.Close()
			}
			if f, err = os.Open(path); err != nil {
				f = nil
				continue
			}
			info, offset, pending = st, 0, nil
			if first {
				offset, first = st.Size(), false
			}
			f.Seek(offset, io.SeekStart)
		}
		for {
			n, _ := f.Read(buf)
			if n == 0 {
				break
			}
			offset += int64(n)
			pending = append(pending, buf[:n]...)
			for {
				i := bytes.IndexByte(pending, '\n')
				if i < 0 {
					break
				}
				if ev, ok := parseLine(string(pending[:i])); ok {
					d.onEvent(ev)
				}
				pending = pending[i+1:]
			}
			if len(pending) > 1<<20 {
				pending = nil
			}
		}
	}
}

func main() {
	dir := flag.String("dir", "/data/quasar/webpanel/assistant", "папка с config.json")
	showVersion := flag.Bool("version", false, "показать версию")
	models := flag.String("models", "", "вывести модели API в JSON; значение — файл с base_url/api_key/proxy поверх настроек или -")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}
	if *models != "" {
		printModels(*dir+"/config.json", *models)
		return
	}
	log.SetFlags(log.Ldate | log.Ltime)
	d := &Daemon{cfgPath: *dir + "/config.json", statusPath: "/tmp/webpanel_assistant.json",
		cmdPath: "/tmp/webpanel_assistant.cmd", state: "idle", cfg: defaults(), dirty: true}
	d.reload()
	log.Printf("assistantd %s запущен", version)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	go func() {
		if err := d.alice.Warm(); err != nil {
			log.Printf("CLI Алисы не запустился: %v", err)
		}
	}()
	d.follow(ctx, maindLog)
	d.alice.Close()
	os.Remove(d.statusPath)
}
