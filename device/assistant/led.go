package main

// Подсветка кольца, пока модель думает: свой цвет «дышит» через /dev/fb0, как это делает сама Алиса.
// Так видно, что вопрос ушёл ассистенту, а не Алисе. Только Лайт 2: кольцо — framebuffer из 3 пикселей
// по 24 бита в порядке B, G, R. Когда мы гасим кольцо, им снова управляет Алиса.

import (
	"context"
	"math"
	"os"
	"strconv"
	"strings"
	"time"
)

const fbDir = "/sys/class/graphics/fb0/"

type LED struct {
	Enabled bool   `json:"enabled"`
	Color   string `json:"color"` // #rrggbb
}

func ringSupported() bool {
	size, _ := os.ReadFile(fbDir + "virtual_size")
	bpp, _ := os.ReadFile(fbDir + "bits_per_pixel")
	return strings.TrimSpace(string(size)) == "3,1" && strings.TrimSpace(string(bpp)) == "24"
}

func parseColor(s string) (r, g, b byte, ok bool) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	v, err := strconv.ParseUint(s, 16, 32)
	if len(s) != 6 || err != nil {
		return 0, 0, 0, false
	}
	return byte(v >> 16), byte(v >> 8), byte(v), true
}

// ringFrame — кадр кольца с яркостью k (0…1).
func ringFrame(r, g, b byte, k float64) []byte {
	frame := make([]byte, 0, 9)
	for i := 0; i < 3; i++ {
		frame = append(frame, byte(float64(b)*k), byte(float64(g)*k), byte(float64(r)*k))
	}
	return frame
}

// glow горит, пока не отменят ctx, затем гасит кольцо; done закрывается, когда кольцо уже погашено.
func glow(ctx context.Context, c LED, done chan<- struct{}) {
	defer close(done)
	if !c.Enabled || !ringSupported() {
		return
	}
	r, g, b, ok := parseColor(c.Color)
	if !ok {
		r, g, b, _ = parseColor(defaults().LED.Color)
	}
	f, err := os.OpenFile("/dev/fb0", os.O_WRONLY, 0)
	if err != nil {
		return
	}
	defer f.Close()
	defer f.WriteAt(ringFrame(0, 0, 0, 0), 0)
	start := time.Now()
	tick := time.NewTicker(40 * time.Millisecond)
	defer tick.Stop()
	for {
		k := 0.2 + 0.8*(0.5-0.5*math.Cos(2*math.Pi*time.Since(start).Seconds()/1.6))
		f.WriteAt(ringFrame(r, g, b, k), 0)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
