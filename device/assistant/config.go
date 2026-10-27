package main

import (
	"encoding/json"
	"os"
	"strings"
)

// Настройки пишет веб-панель; программа перечитывает файл, когда он меняется.
type LLM struct {
	BaseURL      string `json:"base_url"`
	APIKey       string `json:"api_key"`
	Model        string `json:"model"`
	SystemPrompt string `json:"system_prompt"`
	MaxTokens    int    `json:"max_tokens"`
	History      int    `json:"history"` // сколько последних пар «вопрос — ответ» помнить
	Proxy        string `json:"proxy"`   // http://, https:// или socks5://; пусто — напрямую
}

type TTS struct {
	Provider string  `json:"provider"` // alice — голосом Алисы; openai — OpenAI-совместимый /audio/speech
	BaseURL  string  `json:"base_url"`
	APIKey   string  `json:"api_key"`
	Model    string  `json:"model"`
	Voice    string  `json:"voice"`
	Speed    float64 `json:"speed"`
}

type Config struct {
	Enabled  bool              `json:"enabled"`
	Triggers []string          `json:"triggers"`
	LLM      LLM               `json:"llm"`
	TTS      TTS               `json:"tts"`
	LED      LED               `json:"led"`
	Keys     map[string]string `json:"keys"` // ключ на каждый адрес API: сменили провайдера — ключ прежнего остался
}

// keyID — один и тот же провайдер при любом написании адреса: без хвостового «/» и регистра хоста.
func keyID(base string) string {
	return strings.ToLower(strings.TrimRight(strings.TrimSpace(base), "/"))
}

// keyFor — ключ для адреса; старые настройки хранили его прямо в llm/tts.
func (c Config) keyFor(base, legacy string) string {
	if k := c.Keys[keyID(base)]; k != "" {
		return k
	}
	return legacy
}

// Без «умной колонки» в промте: иначе модели воображают себя пультом умного дома и отказываются от вопросов.
const defaultPrompt = "Ты эрудированный собеседник и отвечаешь на любые вопросы. Отвечай по-русски и коротко: " +
	"одно-три предложения разговорной речью. Ответ прочитают вслух, поэтому без списков, разметки, эмодзи, ссылок и формул."

func defaults() Config {
	return Config{
		Triggers: []string{"спроси gpt", "спроси джипити", "спроси чат gpt", "спроси нейросеть"},
		LLM:      LLM{SystemPrompt: defaultPrompt, MaxTokens: 500, History: 6},
		TTS:      TTS{Provider: "alice", Model: "tts-1", Speed: 1},
		LED:      LED{Enabled: true, Color: "#ff8a00"},
	}
}

func loadConfig(path string) (Config, error) {
	c := defaults()
	b, err := os.ReadFile(path)
	if err != nil {
		return c, err
	}
	if err = json.Unmarshal(b, &c); err != nil {
		return defaults(), err
	}
	c.LLM.APIKey = c.keyFor(c.LLM.BaseURL, c.LLM.APIKey)
	c.TTS.APIKey = c.keyFor(c.TTS.BaseURL, c.TTS.APIKey)
	if len(c.Triggers) == 0 {
		c.Triggers = defaults().Triggers
	}
	if strings.TrimSpace(c.LLM.SystemPrompt) == "" {
		c.LLM.SystemPrompt = defaultPrompt
	}
	if c.LLM.MaxTokens <= 0 {
		c.LLM.MaxTokens = 500
	}
	if c.LLM.History < 0 {
		c.LLM.History = 0
	}
	if c.TTS.Speed <= 0 {
		c.TTS.Speed = 1
	}
	return c, nil
}
