package main

// Свои интернет-радиостанции. Поток играет встроенный в прошивку GStreamer (maind --gst-launch) — тот же, что у самой
// Алисы: звук смешивается с ней, громкость общая. Название трека читаем отдельным запросом по ICY-метаданным:
// модуля icydemux в прошивке нет, поэтому сам поток запрашиваем без них (iradio-mode=false).

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Station struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type Radio struct {
	Stations []Station `json:"stations"`
	Voice    bool      `json:"voice"` // включать и выключать голосом
	Play     []string  `json:"play"`  // «включи станцию …»
	Stop     []string  `json:"stop"`  // «выключи станцию»
}

// Сертификаты прошивки: без них souphttpsrc не открывает HTTPS-потоки.
const caFile = quasar + "/ca-certificates.crt"

// validStreamURL — адрес попадает в описание конвейера GStreamer, поэтому только http(s) и без кавычек и пробелов.
func validStreamURL(raw string) bool {
	if len(raw) > 500 || strings.ContainsAny(raw, "\"'\\ \t\r\n!") {
		return false
	}
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

type player struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	station Station
	paused  bool // остановлен на время разговора с Алисой
	title   string
	err     string
	gen     int // поколение: старые наблюдатели метаданных и процессы узнают, что их сменили
}

func (p *player) Start(st Station) error {
	if !validStreamURL(st.URL) {
		return errors.New("адрес потока — http(s)://…, без кавычек и пробелов")
	}
	p.mu.Lock()
	p.killLocked()
	p.station, p.paused, p.title, p.err = st, false, "", ""
	p.gen++
	gen := p.gen
	err := p.spawnLocked()
	p.mu.Unlock()
	if err == nil {
		go p.watchTitle(gen, st.URL)
	}
	return err
}

func (p *player) spawnLocked() error {
	pipeline := fmt.Sprintf(`souphttpsrc location="%s" iradio-mode=false ssl-ca-file=%s ! decodebin ! audioconvert ! audioresample ! alsasink`,
		p.station.URL, caFile)
	cmd := exec.Command(quasar+"/maind", "--gst-launch", pipeline)
	cmd.Env = append(os.Environ(), "LD_LIBRARY_PATH="+quasar+"/libs")
	out, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout
	if err = cmd.Start(); err != nil {
		return err
	}
	p.cmd = cmd
	gen := p.gen
	go func() {
		// GStreamer пишет ошибки в свой журнал: «ERROR from souphttpsrc0: …» — показываем их в панели
		sc := bufio.NewScanner(out)
		sc.Buffer(make([]byte, 64<<10), 64<<10)
		for sc.Scan() {
			line := sc.Text()
			if i := strings.Index(line, "ERROR from "); i >= 0 {
				msg := line[i+len("ERROR from "):]
				if j := strings.Index(msg, " debug:"); j > 0 {
					msg = msg[:j]
				}
				p.mu.Lock()
				if p.gen == gen {
					p.err = msg
				}
				p.mu.Unlock()
			}
		}
		cmd.Wait()
		p.mu.Lock()
		if p.cmd == cmd {
			p.cmd = nil
			if !p.paused && p.err == "" {
				p.err = "поток прервался"
			}
		}
		p.mu.Unlock()
	}()
	return nil
}

func (p *player) killLocked() {
	if p.cmd != nil {
		p.cmd.Process.Kill()
		p.cmd = nil
	}
}

func (p *player) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.killLocked()
	p.station, p.paused, p.title, p.err = Station{}, false, "", ""
	p.gen++
}

// Pause — на время разговора с Алисой, как она сама приглушает свою музыку.
func (p *player) Pause() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil || p.paused {
		return false
	}
	p.killLocked()
	p.paused = true
	return true
}

func (p *player) Resume() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.paused && p.station.URL != "" {
		p.paused = false
		p.spawnLocked()
	}
}

// Active — играет или ждёт конца разговора с Алисой.
func (p *player) Active() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.cmd != nil || p.paused
}

func (p *player) Status() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	return map[string]any{"playing": p.cmd != nil, "paused": p.paused, "name": p.station.Name, "url": p.station.URL,
		"title": p.title, "error": p.err}
}

func (p *player) watchTitle(gen int, stream string) {
	for {
		title := icyTitle(stream)
		p.mu.Lock()
		if p.gen != gen {
			p.mu.Unlock()
			return
		}
		p.title = title
		p.mu.Unlock()
		time.Sleep(20 * time.Second)
	}
}

// icyTitle — «сейчас играет» по ICY: просим метаданные, пропускаем icy-metaint байт звука и читаем блок
// «StreamTitle='…';». Станция без метаданных — пустая строка.
func icyTitle(stream string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", stream, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Icy-MetaData", "1")
	req.Header.Set("User-Agent", "yandex-station-web/"+version)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	every, _ := strconv.Atoi(resp.Header.Get("icy-metaint"))
	if every <= 0 || every > 1<<20 {
		return ""
	}
	r := bufio.NewReader(resp.Body)
	if _, err = io.CopyN(io.Discard, r, int64(every)); err != nil {
		return ""
	}
	n, err := r.ReadByte()
	if err != nil || n == 0 {
		return ""
	}
	meta := make([]byte, int(n)*16)
	if _, err = io.ReadFull(r, meta); err != nil {
		return ""
	}
	return parseStreamTitle(string(meta))
}

func parseStreamTitle(meta string) string {
	const key = "StreamTitle='"
	i := strings.Index(meta, key)
	if i < 0 {
		return ""
	}
	s := meta[i+len(key):]
	if j := strings.Index(s, "';"); j >= 0 {
		s = s[:j]
	}
	return strings.TrimSpace(strings.TrimRight(s, "\x00"))
}

// findStation — станция по названию, сказанному голосом: точное совпадение, затем вхождение, затем больше общих слов.
func findStation(said string, stations []Station) (Station, bool) {
	said = normalize(said)
	if said == "" {
		return Station{}, false
	}
	best, score := -1, 0
	for i, st := range stations {
		name := normalize(st.Name)
		switch {
		case name == said:
			return st, true
		case strings.Contains(name, said) || strings.Contains(said, name):
			if score < 100 {
				best, score = i, 100
			}
		default:
			common := 0
			for _, w := range strings.Fields(said) {
				if len([]rune(w)) > 1 && strings.Contains(" "+name+" ", " "+w+" ") {
					common++
				}
			}
			if common > score {
				best, score = i, common
			}
		}
	}
	if best < 0 {
		return Station{}, false
	}
	return stations[best], true
}

// alicePlayback — просьба к Алисе что-то включить: после неё своё радио не возобновляем, иначе заиграют оба.
func alicePlayback(phrase string) bool {
	for _, w := range []string{"включи", "поставь", "играй", "запусти", "продолжи", "послушать", "сыграй"} {
		if strings.HasPrefix(normalize(phrase), w) {
			return true
		}
	}
	return false
}
