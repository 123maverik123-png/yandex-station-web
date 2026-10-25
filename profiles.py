"""Explicit hardware profiles. Lite 2 keeps its original implementation by default."""
import os
import shlex
import tempfile
import threading
import time
from pathlib import Path

PROFILES = {
    'lite2': dict(name='Станция Лайт 2', platform='plum', clock=True, boot=True, alarms=True, light=True),
    'station2': dict(name='Станция 2', platform='yandexmidi', clock=False, boot=False, alarms=False, light=True),
    'mini3pro': dict(name='Станция Мини 3 Про', platform='pickle', clock=True, boot=False, alarms=False, light=True),
    # Common ADB features and a distinct 3D model; LED layout has not been verified on hardware.
    'mini3': dict(name='Станция Мини 3', platform='bergamot', clock=False, boot=False, alarms=False, light=False, experimental=True),
}


def install(s, model='lite2'):
    profile = dict(PROFILES[model], id=model)
    profile['light_note'] = ('Подсветка этой модели ещё не проверена.' if not profile['light'] else
                             'Анимация Алисы может заменить выбранный цвет.')
    s.GLAGOL_PLATFORM = profile['platform']
    s.LED_PREFIX = profile['platform']
    original_get, original_post = s.Handler.do_GET, s.Handler.do_POST

    def do_get(self):
        if self.path.split('?')[0] == '/api/profile':
            if not self._guard('/api/profile'):
                self._send(200, profile)
            return
        original_get(self)

    def do_post(self):
        path = self.path.split('?')[0]
        disabled = (not profile['boot'] and (path.startswith('/api/clock/boot') or path.startswith('/api/boot/')) or
                    not profile['alarms'] and path.startswith('/api/alarms') or
                    model != 'lite2' and path in ('/api/footprint/reset', '/api/backup/restore'))
        if disabled:
            if not self._guard(path):
                self._send(400, {'error': 'Эта операция загрузки/восстановления не поддерживается профилем ' + model})
            return
        original_post(self)

    s.Handler.do_GET, s.Handler.do_POST = do_get, do_post
    if model == 'lite2':
        return  # No changes to the original Lite 2 hardware, boot hook, YAM or alarm code.

    P = s.Panel
    original_shell = s.Adb.shell

    def shell(self, command, timeout=15, check=True):
        # Older adbd can print a root-shell banner and lose the remote exit status.
        marker = '__PANEL_' + os.urandom(8).hex() + '__'
        wrapped = (f"printf '{marker}\\n'; sh -c {shlex.quote(command)}; rc=$?; "
                   f"printf '\\n{marker}RC=%s\\n' \"$rc\"")
        out, err, _ = original_shell(self, wrapped, timeout, False)
        if marker + '\n' not in out:
            raise s.AdbError('Нет ответа shell колонки')
        body = out.split(marker + '\n', 1)[1]
        body, separator, result = body.rpartition('\n' + marker + 'RC=')
        if not separator or not result.strip().isdigit():
            raise s.AdbError('Команда колонки не завершилась')
        code = int(result.strip())
        if check and code:
            raise s.AdbError(s.strip_ansi(err or body).strip()[-500:] or f'Код завершения: {code}')
        return body, err, code

    s.Adb.shell = shell

    def alive(self):
        try:
            return self.adb.shell('echo ok', timeout=4)[0].strip() == 'ok'
        except (s.AdbError, s.subprocess.TimeoutExpired):
            return False
    s.Connection._alive = alive

    def version(self):
        if self._version is None:
            out, _, _ = self.adb.shell('cat /system/vendor/quasar/version_full')
            device, _, _ = self.adb.shell(f'{s.QRUN}/maind --device-id 2>/dev/null | tail -1', timeout=20)
            did = device.replace('Device ID:', '').strip()
            self._version = {'quasar_version': out.strip(), 'device_id': did, 'model': model}
            self.glagol.device_id = did or None
            if not self.glagol.host:
                ip, _, _ = self.adb.shell("wpa_cli -i wlan0 status 2>/dev/null | sed -n 's/^ip_address=//p'", check=False)
                self.glagol.host = s.strip_ansi(ip).strip() or None
            self.glagol.wake.set()
        return self._version
    P.version = version

    def unsupported(self=None, *args, **kwargs):
        raise s.AdbError('Функция не проверена для профиля ' + model)

    if not profile['clock']:
        for method in ('clock', 'display_set', 'play_clock', 'clock_frames'):
            setattr(P, method, unsupported)
    # Never connect the Light 2 rootkeeper hook to a different model.
    P._ensure_hook = unsupported
    for method in ('yam_install_daemon', 'yam_update_daemon', 'yam_autostart'):
        if hasattr(P, method):
            setattr(P, method, unsupported)
    P.boot_status = lambda self: dict(supported=False, custom=False, mounted=False, sound_supported=False,
                                    sound_custom=False, sound_mounted=False, hook=False, no_boot_sound=True, always=False)

    # Existing community YAM installations on the new profiles use this layout.
    old = s.YAM_DIR
    for name, value in list(vars(s).items()):
        if name.startswith('YAM') and isinstance(value, str):
            setattr(s, name, value.replace(old, '/data/local/yam'))

    def patterns(self):
        if model != 'mini3pro':
            return {'ring': [], 'clock': []}
        out, _, _ = self.adb.shell(f'find {s.QUASAR}/ledpatterns/clock -maxdepth 1 -type f 2>/dev/null; true')
        return {'ring': [], 'clock': [Path(line).name for line in out.splitlines()]}
    P.patterns = patterns

    def play_pattern(self, kind, name, seconds):
        if kind != 'clock' or model != 'mini3pro':
            return unsupported()
        if name not in self.patterns()['clock']:
            raise s.AdbError('Нет такой анимации')
        return self.play_clock(s.decode_clock_pattern(name, self.adb.read_bytes(f'{s.QUASAR}/ledpatterns/clock/{name}')), seconds)
    P.play_pattern = play_pattern

    def leds(self):
        if model == 'mini3':
            return {'v': [0] * 36, 'ring': [[0, 0, 0]] * 3}
        if model == 'station2':
            temporary = '/tmp/webpanel_fb_' + os.urandom(8).hex()
            try:
                self.adb.shell(f'head -c 356 /dev/fb0 > {temporary}')
                blob = self.adb.read_bytes(temporary)
            finally:
                self.adb.shell(f'rm -f {temporary}', check=False)
            if len(blob) != 356:
                raise s.AdbError('Неожиданный размер световой панели')
            pixels = [[blob[i + 2], blob[i + 1], blob[i]] for i in range(0, 356, 4)]
            representative = [[round(sum(pixel[k] for pixel in pixels[a:b]) / (b-a)) for k in range(3)]
                              for a, b in ((0, 30), (30, 60), (60, 89))]
            return {'v': [0] * 36, 'ring': representative, 'ring_all': pixels}
        names = [f'pickle:white:clock{name}' for name in s.CLOCK_LEDS]
        names += [f'pickle:{color}:ring{i}' for i in range(16) for color in ('red', 'green', 'blue')]
        out, _, _ = self.adb.shell('cd /sys/class/leds; ' + '; '.join(f'cat {name}/brightness' for name in names))
        values = [int(value) for value in out.split() if value.isdigit()]
        if len(values) != 84:
            raise s.AdbError('Неполное состояние светодиодов')
        ring = [values[36+i*3:39+i*3] for i in range(16)]
        return {'v': values[:36], 'ring': [ring[i] for i in (0, 5, 10)], 'ring_all': ring}
    P.clock_state = leds

    class LedStream:
        def __init__(self, adb):
            self.adb, self.at, self.cached, self.lock = adb, 0, {'v': None}, threading.Lock()
        def get(self):
            with self.lock:
                if time.monotonic() - self.at > .4:
                    self.cached, self.at = leds(self), time.monotonic()
                return self.cached
    s.LedStream = LedStream

    def ring(self, data):
        if not profile['light']:
            return unsupported()
        rgb = [max(0, min(255, int(data.get(color, 0)))) for color in ('red', 'green', 'blue')]
        if model == 'mini3pro':
            indices = ' '.join(map(str, range(16)))
            snapshot = f'for i in {indices}; do for c in red green blue; do cat /sys/class/leds/pickle:$c:ring$i/brightness; done; done'
            writes = '; '.join(f'echo {value} > /sys/class/leds/pickle:{color}:ring$i/brightness'
                               for color, value in zip(('red', 'green', 'blue'), rgb))
            self.adb.shell(f'if [ ! -f /tmp/webpanel_ring.before ]; then {{ {snapshot}; }} > /tmp/webpanel_ring.before; fi; for i in {indices}; do {writes}; done')
        else:
            self.adb.shell('test "$(cat /sys/class/graphics/fb0/virtual_size)" = "89,1" && '
                           'test "$(cat /sys/class/graphics/fb0/bits_per_pixel)" = 32 || exit 1; '
                           '[ -f /tmp/webpanel_ring.before ] || head -c 356 /dev/fb0 > /tmp/webpanel_ring.before')
            with tempfile.TemporaryDirectory() as directory:
                frame = Path(directory) / 'frame'
                frame.write_bytes(bytes((rgb[2], rgb[1], rgb[0], 0)) * 89)
                self.adb.push(frame, '/tmp/webpanel_ring.frame')
            self.adb.shell('cat /tmp/webpanel_ring.frame > /dev/fb0')
        return {'ok': True}
    P.ring = ring

    def reset_ring(self):
        if model == 'mini3':
            return {'ok': True}
        if model == 'mini3pro':
            command = ('if [ -s /tmp/webpanel_ring.before ]; then exec 3< /tmp/webpanel_ring.before; '
                       'for i in ' + ' '.join(map(str, range(16))) + '; do for c in red green blue; do '
                       'read v <&3; echo "$v" > /sys/class/leds/pickle:$c:ring$i/brightness; done; done; '
                       'exec 3<&-; rm -f /tmp/webpanel_ring.before; fi')
        else:
            command = 'if [ -s /tmp/webpanel_ring.before ]; then cat /tmp/webpanel_ring.before > /dev/fb0; rm -f /tmp/webpanel_ring.before; fi'
        self.adb.shell(command)
        return {'ok': True, 'leds': [[0, 0, 0]] * 3}
    P.ring_reset = reset_ring
    original_stop = P.stop_pattern
    def stop(self, kind=None):
        if kind in (None, 'ring'):
            self.ring_reset()
        if kind in (None, 'clock') and profile['clock']:
            original_stop(self, 'clock')
        return {'ok': True}
    P.stop_pattern = stop
