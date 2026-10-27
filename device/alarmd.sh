#!/bin/sh
# Будильник веб-панели. Работает на самой колонке: компьютер с панелью для него не нужен, интернет — тоже.
# Интернет нужен только Алисе (музыка, утреннее шоу): если его нет или Алиса за полминуты так ничего и
# не включила, играет выбранный звук.
#
# alarms.conf, по строке на будильник (пишет панель):
#   id|вкл|ЧЧ:ММ|дни|режим|запрос|файл звука|название звука|громкость 1–10|нарастание, с|выкл. через, мин|отложить, мин|подпись
# дни — цифры 1–7 (пн–вс), пусто — один раз; режим: sound | wave | show | music | text.

D=/data/quasar/webpanel/alarm
CONF=$D/alarms.conf
LAST=$D/last_fired
SNOOZE=$D/snooze
LOG=$D/alarm.log
STATE=/tmp/webpanel_alarm.state
CMD=/tmp/webpanel_alarm.cmd
FIRE=/tmp/webpanel_alarm.fire
MLOG=/data/quasar/daemons_logs/maind.log
Q=/system/vendor/quasar
[ -f $D/localtime ] && export TZ=:$D/localtime
RING_LEDS="red:ring1 green:ring1 blue:ring1 red:ring2 green:ring2 blue:ring2 red:ring3 green:ring3 blue:ring3"

log() {
    echo "$(date '+%d.%m %H:%M:%S') $*" >> $LOG
    [ "$(wc -c < $LOG)" -gt 30000 ] && tail -n 150 $LOG > $LOG.t && mv $LOG.t $LOG
}

# Громкость Алисы 0–10 → значение ALSA Master (как platformToAlsaMap у Quasar: 0→0, 1→49, 20→255).
alsa_of() { p=$(($1 * 2)); [ $p -le 0 ] && echo 0 || echo $((49 + (p - 1) * 206 / 19)); }
get_alsa() { amixer get Master | sed -n 's/.*Front Left: Playback \([0-9]*\).*/\1/p'; }
set_alsa() { amixer -q set Master "$1" 2>/dev/null; }

playing() { grep -q "state: RUNNING" /proc/asound/card*/pcm*p/sub*/status 2>/dev/null; }

online() {
    ping -c 1 -W 3 77.88.8.8 >/dev/null 2>&1 || ping -c 1 -W 3 8.8.8.8 >/dev/null 2>&1 ||
        wget -q -T 5 -O /dev/null http://ya.ru 2>/dev/null
}

# Текстовые запросы Алисе — через отладочный CLI maind: команда «q», текст — следующей строкой.
alice() {
    (
        sleep 2
        for t in "$@"; do printf 'q\n'; sleep 0.5; printf '%s\n' "$t"; sleep 2.5; done
        printf 'x\n'; sleep 1
    ) | LD_LIBRARY_PATH=$Q/libs $Q/maind --cli >/dev/null 2>&1 &
    ap=$!
    i=0; while kill -0 $ap 2>/dev/null && [ $i -lt 40 ]; do sleep 1; i=$((i + 1)); done
    kill $ap 2>/dev/null
}

# Кольцо — через framebuffer, как у самого Quasar; после будильника возвращаем его Quasar.
# Только если /dev/fb0 — кольцо Лайт 2 (3 пикселя): на других моделях там может быть экран.
FB_RING=; [ "$(cat /sys/class/graphics/fb0/virtual_size 2>/dev/null)" = "3,1" ] && FB_RING=1
ring() { [ -n "$FB_RING" ] && echo -e -n "$1$1$1" > /dev/fb0 2>/dev/null; }
ring_release() {
    for n in $RING_LEDS; do
        t=/sys/class/leds/plum:$n/trigger
        grep -q '\[led_ring_fb\]' $t || echo led_ring_fb > $t
    done
    ring '\x00\x00\x00'
}

# Ждём, что Алиса действительно заиграла: музыка — звук держится 6 с подряд, свой запрос — хоть какой-то ответ.
wait_alice() {
    need=6; [ "$1" = text ] && need=1
    i=0; run=0
    while [ $i -lt 30 ]; do
        [ -f $CMD ] && return 0
        if playing; then run=$((run + 1)); [ $run -ge $need ] && return 0; else run=0; fi
        sleep 1; i=$((i + 1))
    done
    return 1
}

fire() {
    id=$1 mode=$2 query=$3 sound=$4 vol=$5 ramp=$6 dur=$7 snz=$8
    rm -f $CMD
    orig=$(get_alsa)
    target=$(alsa_of $vol)
    start=$target; [ "$ramp" -gt 0 ] && start=$(alsa_of 1)
    via=sound
    echo "ringing|$id|$(date +%s)|starting" > $STATE
    if [ "$mode" != sound ]; then
        case $mode in
            wave) q="включи мою волну" ;;
            show) q="включи утреннее шоу" ;;
            music) q="включи $query" ;;
            *) q=$query ;;
        esac
        if ! online; then
            log "$id: нет интернета — играет свой звук"
        else
            v=$vol; [ "$ramp" -gt 0 ] && v=1
            alice "громкость $v" "$q"
            if wait_alice $mode; then via=alice; log "$id: Алиса — «$q»"
            else log "$id: Алиса не включила «$q» — играет свой звук"; fi
        fi
    fi
    echo "ringing|$id|$(date +%s)|$via" > $STATE
    apid=
    if [ $via = sound ]; then
        f=$D/$sound; [ -f "$f" ] || f=$D/default.wav
        log "$id: звук $(basename "$f")"
        set_alsa $start
        (while [ ! -f $CMD ]; do aplay -q "$f" 2>/dev/null || sleep 1; done) &
        apid=$!
    fi
    # Кнопка Алисы или голос («Алиса, …») выключают будильник. Следим за новыми строками лога maind.
    off=$(wc -c < $MLOG 2>/dev/null || echo 0)
    t=0 quiet=0 synced=0 why=
    while :; do
        [ -f $CMD ] && { why=$(cat $CMD); break; }
        size=$(wc -c < $MLOG 2>/dev/null || echo 0)
        [ "$size" -lt "$off" ] && off=0
        if [ "$size" -gt "$off" ]; then
            if tail -c +$((off + 1)) $MLOG | head -c $((size - off)) | grep -q -E "Button click: activate|VOICEPRINT_MATCH"; then
                why=button; break
            fi
            off=$size
        fi
        if [ "$ramp" -gt 0 ] && [ $t -le "$ramp" ]; then
            set_alsa $((start + (target - start) * t / ramp))
        elif [ $via = alice ] && [ $synced = 0 ]; then
            synced=1; [ "$ramp" -gt 0 ] && alice "громкость $vol"
        fi
        if [ $via = alice ]; then
            # Музыку выключили голосом или кнопкой — будильник тоже закончился.
            if playing; then quiet=0; else quiet=$((quiet + 1)); [ $quiet -ge 8 ] && { why=ended; break; }; fi
        else
            [ $((t % 2)) = 0 ] && ring '\xff\x47\x6c' || ring '\x40\x12\x1b'
        fi
        [ "$dur" -gt 0 ] && [ $t -ge $((dur * 60)) ] && { why=timeout; break; }
        sleep 1; t=$((t + 1))
    done
    [ -z "$why" ] && why=stop
    touch $CMD
    if [ -n "$apid" ]; then
        kill $apid 2>/dev/null; killall aplay 2>/dev/null; sleep 0.3; killall aplay 2>/dev/null
        set_alsa $orig
        ring_release
    elif [ "$why" != ended ]; then
        alice "стоп"
    fi
    if [ "$why" = snooze ] && [ "$snz" -gt 0 ]; then
        echo "$(($(date +%s) + snz * 60))|$id" > $SNOOZE
        log "$id: отложен на $snz мин"
    else
        log "$id: выключен ($why)"
    fi
    rm -f $CMD
    echo "idle" > $STATE
}

# Строка конфига → fire
run_id() {
    line=$(grep "^$1|" $CONF 2>/dev/null | head -n 1)
    [ -n "$line" ] || return
    IFS='|' read -r id on tm days mode query sound sname vol ramp dur snz label <<EOF
$line
EOF
    fire "$id" "$mode" "$query" "$sound" "${vol:-5}" "${ramp:-0}" "${dur:-0}" "${snz:-9}" < /dev/null
}

check_minute() {
    now=$(date +%H:%M) dow=$(date +%u) stamp=$(date +%Y%m%d%H%M) ep=$(date +%s)
    if [ -f $SNOOZE ]; then
        IFS='|' read -r sat sid < $SNOOZE
        if [ "$ep" -ge "${sat:-0}" ]; then rm -f $SNOOZE; run_id "$sid"; fi
    fi
    [ -f $CONF ] || return
    due=
    while IFS='|' read -r id on tm days mode rest; do
        [ "$on" = 1 ] && [ "$tm" = "$now" ] || continue
        case "$days" in "" | *"$dow"*) ;; *) continue ;; esac
        grep -q "^$id $stamp\$" $LAST 2>/dev/null && continue
        echo "$id $stamp" >> $LAST
        [ -z "$days" ] && sed -i "s/^$id|1|/$id|0|/" $CONF
        due="$due $id"
    done < $CONF
    [ -f $LAST ] && tail -n 50 $LAST > $LAST.t && mv $LAST.t $LAST
    for id in $due; do run_id "$id"; done
}

echo idle > $STATE
log "запущен, время на колонке $(date '+%H:%M %Z')"
while :; do
    check_minute
    # До начала следующей минуты; раз в секунду проверяем «проверить сейчас» из панели.
    s=$(date +%S); s=${s#0}
    i=$((60 - s))
    while [ $i -gt 0 ]; do
        if [ -f $FIRE ]; then id=$(cat $FIRE); rm -f $FIRE; log "$id: проверка из панели"; run_id "$id"; break; fi
        sleep 1; i=$((i - 1))
    done
done
