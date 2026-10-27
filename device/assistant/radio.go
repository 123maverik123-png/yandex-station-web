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
	// переподключение: интернет-радио иногда на секунду пропадает, а GStreamer после этого не продолжает сам
	retries  int
	retrying bool
	started  time.Time
}

const radioRetries = 5

// fatalStreamError — ошибки, которые повтор не исправит: сервер отказал (4xx) или формат не поддерживается.
func fatalStreamError(msg string) bool {
	for _, s := range []string{"Bad Request", "Forbidden", "Not Found", "Unauthorized", "Missing", "missing a plug-in"} {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}

func (p *player) Start(st Station) error {
	if !validStreamURL(st.URL) {
		return errors.New("адрес потока — http(s)://…, без кавычек и пробелов")
	}
	p.mu.Lock()
	p.killLocked()
	p.station, p.paused, p.title, p.err = st, false, "", ""
	p.retries, p.retrying = 0, false
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
	p.cmd, p.started = cmd, time.Now()
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
		defer p.mu.Unlock()
		if p.cmd != cmd || p.gen != gen {
			return // остановили, поставили на паузу или включили другую станцию
		}
		p.cmd = nil
		if p.err == "" {
			p.err = "поток прервался"
		}
		if time.Since(p.started) > time.Minute {
			p.retries = 0 // долго играло — это новый обрыв, а не цепочка неудач
		}
		if fatalStreamError(p.err) || p.retries >= radioRetries {
			return
		}
		p.retries++
		p.retrying = true
		delay := time.Duration(p.retries) * 2 * time.Second
		go func() {
			time.Sleep(delay)
			p.mu.Lock()
			defer p.mu.Unlock()
			if p.gen == gen && p.retrying && p.cmd == nil && !p.paused {
				p.retrying, p.err = false, ""
				p.spawnLocked()
			}
		}()
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
	p.retries, p.retrying = 0, false
	p.gen++
}

// Pause — на время разговора с Алисой, как она сама приглушает свою музыку.
func (p *player) Pause() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.paused || p.cmd == nil && !p.retrying {
		return false
	}
	p.killLocked()
	p.paused, p.retrying = true, false
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
	return p.cmd != nil || p.paused || p.retrying
}

func (p *player) Status() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	return map[string]any{"playing": p.cmd != nil, "paused": p.paused, "name": p.station.Name, "url": p.station.URL,
		"title": p.title, "error": p.err, "retrying": p.retrying}
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

// findStation — станция по названию, сказанному голосом. Алиса пишет распознанное как слышит: «флакс» вместо FLUX,
// «lo fi» вместо Lofi, другой падеж. Поэтому сравниваем без пробелов, латиницу переводим в кириллицу и прощаем
// несколько букв; точное совпадение и вхождение — по-прежнему главнее.
func findStation(said string, stations []Station) (Station, bool) {
	if normalize(said) == "" {
		return Station{}, false
	}
	saidKeys := spokenKeys(said)
	best, bestScore := -1, 0.0
	for i, st := range stations {
		score := 0.0
		for _, a := range saidKeys {
			for _, b := range spokenKeys(st.Name) {
				switch {
				case a == b:
					return st, true
				case strings.Contains(a, b) || strings.Contains(b, a):
					score = max(score, 0.9)
				default:
					la, lb := len([]rune(a)), len([]rune(b))
					if d := float64(levenshtein(a, b)) / float64(max(la, lb)); d <= 0.3 {
						score = max(score, 0.8-d)
					}
				}
			}
		}
		if score > bestScore {
			best, bestScore = i, score
		}
	}
	if best < 0 {
		return Station{}, false
	}
	return stations[best], true
}

// spokenKeys — варианты написания названия для сравнения: без пробелов и знаков, и то же кириллицей.
func spokenKeys(s string) []string {
	plain := strings.ReplaceAll(normalize(s), " ", "")
	if plain == "" {
		return nil
	}
	cyr := translit(plain)
	if cyr == plain {
		return []string{plain}
	}
	return []string{plain, cyr}
}

var latinDigraphs = []struct{ from, to string }{
	{"sch", "щ"}, {"sh", "ш"}, {"ch", "ч"}, {"zh", "ж"}, {"kh", "х"}, {"ts", "ц"}, {"ya", "я"}, {"yu", "ю"},
	{"yo", "е"}, {"ph", "ф"}, {"th", "т"}, {"oo", "у"}, {"ee", "и"}, {"ck", "к"},
}

var latinLetters = map[rune]string{'a': "а", 'b': "б", 'c': "к", 'd': "д", 'e': "е", 'f': "ф", 'g': "г", 'h': "х",
	'i': "и", 'j': "дж", 'k': "к", 'l': "л", 'm': "м", 'n': "н", 'o': "о", 'p': "п", 'q': "к", 'r': "р", 's': "с",
	't': "т", 'u': "у", 'v': "в", 'w': "в", 'x': "кс", 'y': "и", 'z': "з"}

// translit — латиница как её прочитал бы русский: «flux» → «флукс», «lofi» → «лофи».
func translit(s string) string {
	for _, d := range latinDigraphs {
		s = strings.ReplaceAll(s, d.from, d.to)
	}
	var b strings.Builder
	for _, r := range s {
		if v, ok := latinLetters[r]; ok {
			b.WriteString(v)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func levenshtein(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur := make([]int, len(rb)+1)
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
		}
		prev = cur
	}
	return prev[len(rb)]
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
