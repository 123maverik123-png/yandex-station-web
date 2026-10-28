package main

// Сценарии по команде ассистенту: «Алиса, спроси GPT, <фраза>» (или фраза в режиме ассистента) запускает
// сценарий панели вместо вопроса модели. Сценарии хранит и выполняет демон будильника (alarm/scenes.conf):
//   S|id|вкл|voice|фраза, фраза|дни|первая нода|название
// Ассистент только находит сценарий и кладёт его id туда же, куда кнопка «Запустить» в панели.

import (
	"os"
	"strings"
	"time"
)

const (
	scenesConf = "/data/quasar/webpanel/alarm/scenes.conf"
	sceneFire  = "/tmp/webpanel_scene.fire"
)

type voiceScene struct{ id, name string }

// findScene — включённый сценарий, одна из фраз которого совпала с вопросом (без учёта регистра и знаков).
func findScene(conf, question string, now time.Time) (voiceScene, bool) {
	q := normalize(question)
	if q == "" {
		return voiceScene{}, false
	}
	dow := string(rune('0' + (int(now.Weekday())+6)%7 + 1)) // 1 — понедельник, как в панели
	for _, line := range strings.Split(conf, "\n") {
		f := strings.Split(strings.TrimRight(line, "\r"), "|")
		if len(f) != 8 || f[0] != "S" || f[2] != "1" || f[3] != "voice" {
			continue
		}
		if f[5] != "" && !strings.Contains(f[5], dow) {
			continue
		}
		for _, p := range strings.Split(f[4], ",") {
			if normalize(p) == q {
				return voiceScene{id: f[1], name: f[7]}, true
			}
		}
	}
	return voiceScene{}, false
}

// runScene просит демон будильника выполнить сценарий (он проверяет этот файл раз в секунду).
func runScene(id string) error {
	tmp := sceneFire + ".new"
	if err := os.WriteFile(tmp, []byte(id+" voice\n"), 0644); err != nil { // «voice» — для журнала сценариев
		return err
	}
	return os.Rename(tmp, sceneFire)
}
