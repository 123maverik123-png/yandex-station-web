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
