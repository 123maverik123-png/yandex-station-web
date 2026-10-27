package main

import (
	"os"
	"strings"
	"testing"
)

func TestMatchTrigger(t *testing.T) {
	triggers := defaults().Triggers
	for phrase, want := range map[string]string{
		"Спроси gpt сколько будет 2 + 2":      "сколько будет 2 + 2",
		"Спроси GPT, сколько будет 2 + 2?":    "сколько будет 2 + 2?",
		"спроси чат gpt: почему небо голубое": "почему небо голубое",
		"Спроси нейросеть":                    "",
		"Спроси джипити, что такое ёж":        "что такое ёж",
	} {
		got, ok := matchTrigger(phrase, triggers)
		if !ok || got != want {
			t.Errorf("%q → %q, %v; want %q", phrase, got, ok, want)
		}
	}
	for _, phrase := range []string{"включи музыку", "спроси gptfoo почему", "расскажи спроси gpt"} {
		if _, ok := matchTrigger(phrase, triggers); ok {
			t.Errorf("%q не должна срабатывать", phrase)
		}
	}
}

func TestParseLine(t *testing.T) {
	ev, ok := parseLine("[1978:2016] [2026-10-26 17:26:48.127] [sdk] [info] [alice_state_machine.cpp:416] onRequestStateChanged: LISTENING, recognizedPhrase='Спроси gpt сколько будет 2 + 2'")
	if !ok || ev.kind != "phrase" || ev.phrase != "Спроси gpt сколько будет 2 + 2" {
		t.Fatalf("%+v %v", ev, ok)
	}
	// BUSY с той же фразой — не второй вопрос
	if ev, _ := parseLine("onAliceStateChanged: BUSY, recognizedPhrase='Спроси gpt'"); ev.kind == "phrase" {
		t.Fatal("BUSY не должен давать фразу")
	}
	for line, kind := range map[string]string{
		"onPhraseSpotted: алиса {…}":                         "spotted",
		"onAliceStateChanged: SPEAKING, outputSpeech='Окей'": "speaking",
		"onAliceStateChanged: LISTENING":                     "listening",
		"onAliceStateChanged: IDLE":                          "idle",
	} {
		if ev, ok := parseLine(line); !ok || ev.kind != kind {
			t.Errorf("%q → %+v", line, ev)
		}
	}
}

func TestForSpeech(t *testing.T) {
	if got := forSpeech("**Ответ:** «да»\n\n# Итог", 100); got != "Ответ: да Итог" {
		t.Errorf("%q", got)
	}
	long := strings.Repeat("Первое предложение. ", 30)
	got := forSpeech(long, 100)
	if len([]rune(got)) > 100 || !strings.HasSuffix(got, ".") {
		t.Errorf("обрезка по предложению: %q", got)
	}
}

func TestStripThinking(t *testing.T) {
	if got := stripThinking("<think>долго</think>Четыре."); got != "Четыре." {
		t.Errorf("%q", got)
	}
}

func TestKeysPerProvider(t *testing.T) {
	path := t.TempDir() + "/config.json"
	os.WriteFile(path, []byte(`{"llm":{"base_url":"https://api.example.com/v1/","api_key":"old"},
		"tts":{"base_url":"https://tts.example.com/v1"},
		"keys":{"https://api.example.com/v1":"llm-key","https://other.example.com/v1":"other"}}`), 0600)
	c, err := loadConfig(path)
	if err != nil || c.LLM.APIKey != "llm-key" || c.TTS.APIKey != "" {
		t.Fatalf("%v %q %q", err, c.LLM.APIKey, c.TTS.APIKey)
	}
	if c.keyFor("HTTPS://other.example.com/v1/", "") != "other" {
		t.Fatal("адрес с другим регистром и «/» — тот же провайдер")
	}
}

func TestRingFrame(t *testing.T) {
	r, g, b, ok := parseColor("#ff8a00")
	if !ok || r != 0xff || g != 0x8a || b != 0 {
		t.Fatal(r, g, b, ok)
	}
	if _, _, _, ok := parseColor("red"); ok {
		t.Fatal("не цвет")
	}
	f := ringFrame(r, g, b, 1)
	if len(f) != 9 || f[0] != 0 || f[1] != 0x8a || f[2] != 0xff { // B, G, R на каждый из 3 пикселей
		t.Fatalf("% x", f)
	}
	if ringFrame(r, g, b, 0)[2] != 0 {
		t.Fatal("нулевая яркость гасит кольцо")
	}
}

func TestModePhrases(t *testing.T) {
	path := t.TempDir() + "/config.json"
	os.WriteFile(path, []byte(`{"mode":{"follow_up":false}}`), 0600)
	c, _ := loadConfig(path)
	if c.Mode.TimeoutMin != 10 || len(c.Mode.Enter) == 0 || len(c.Mode.Exit) == 0 || c.Mode.FollowUp {
		t.Fatalf("%+v", c.Mode)
	}
	if _, ok := matchTrigger("Переключись на GPT, пожалуйста", c.Mode.Enter); !ok {
		t.Fatal("фраза включения")
	}
	if _, ok := matchTrigger("Верни Алису", c.Mode.Exit); !ok {
		t.Fatal("фраза выключения")
	}
	if _, ok := matchTrigger("включи музыку", c.Mode.Enter); ok {
		t.Fatal("обычная просьба не включает режим")
	}
}

func TestRadioHelpers(t *testing.T) {
	stations := []Station{{"Groove Salad", "http://ice1.somafm.com/groovesalad-128-mp3"}, {"Радио Рекорд", "https://radiorecord.hostingradio.ru/rr_main96.aacp"}}
	for said, want := range map[string]string{"groove salad": "Groove Salad", "грув салад": "", "рекорд": "Радио Рекорд", "радио рекорд": "Радио Рекорд"} {
		st, ok := findStation(said, stations)
		if (want == "") == ok || st.Name != want {
			t.Errorf("%q → %q %v", said, st.Name, ok)
		}
	}
	for u, ok := range map[string]bool{"http://a.b/c.mp3": true, "https://a.b:8000/x?y=1": true, "ftp://a.b": false,
		`http://a.b/"x`: false, "http://a.b/x y": false, "http://a.b/!x": false, "file:///etc/passwd": false} {
		if validStreamURL(u) != ok {
			t.Errorf("%q", u)
		}
	}
	if parseStreamTitle("StreamTitle='Artist - Song';StreamUrl='';\x00\x00") != "Artist - Song" {
		t.Fatal("ICY")
	}
	if !alicePlayback("Включи музыку") || alicePlayback("какая погода") {
		t.Fatal("просьба что-то включить")
	}
}

func TestFatalStreamErrors(t *testing.T) {
	if !fatalStreamError("souphttpsrc0: Bad Request") || fatalStreamError("souphttpsrc0: Internal data stream error.") {
		t.Fatal("400 — не повторяем, обрыв связи — повторяем")
	}
}
