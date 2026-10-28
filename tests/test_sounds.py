import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def encoders():
    ff = shutil.which("ffmpeg")
    return subprocess.run([ff, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout if ff else ""


def panel(sounds=("common/timer.wav", "common/boot.wav")):
    p = server.Panel(Mock())
    p.sounds = lambda: list(sounds)
    p.ffmpeg = shutil.which("ffmpeg")
    return p


class SoundOverrides(unittest.TestCase):
    """Свои системные звуки: bind mount поверх стандартного, без копий оригиналов."""

    def test_only_listed_sounds(self):
        p = panel()
        for name in ("../../etc/passwd", "common/../../x", "nope.wav"):
            with self.assertRaisesRegex(server.AdbError, "нет такого звука"):
                p.sound_reset(name)
        p.adb.shell.assert_not_called()

    def test_boot_sound_goes_through_boot_tab(self):
        p = panel()
        p.boot_sound_reset, p._remove_override = Mock(), Mock()
        p.sounds_custom = lambda: {"custom": []}
        p.sound_reset("common/boot.wav")
        p.boot_sound_reset.assert_called_once()
        p.sound_reset("common/timer.wav")
        p._remove_override.assert_called_once_with(f"{server.OVR_DIR}/sounds/common/timer.wav",
                                                   f"{server.SOUNDS_DIR}/common/timer.wav")

    def test_custom_list(self):
        p = panel()
        p.adb.shell.return_value = (f"./common/timer.wav\n./ru-RU/x.opus\n@boot\n{server.SOUNDS_DIR}/common/timer.wav\n"
                                    f"{server.SOUNDS_DIR}/common/boot.wav\n", "", 0)
        r = p.sounds_custom()
        self.assertEqual(r["custom"], ["common/boot.wav", "common/timer.wav", "ru-RU/x.opus"])
        self.assertEqual(r["pending"], ["ru-RU/x.opus"])   # лежит, но не смонтирован

    def test_hook_binds_override_tree(self):
        self.assertIn(f'bind "{server.OVR_DIR}/${{f#./}}" "{server.QUASAR}/${{f#./}}"', server.BOOT_HOOK_SCRIPT)

    def test_backup_names_cannot_escape(self):
        ok = server.Panel.BACKUP_FILES.fullmatch
        self.assertTrue(ok("override/sounds/common/timer.wav"))
        for bad in ("override/sounds/../x", "override/sounds/a/../b", "override/sounds/.x", "override/ledpatterns/x"):
            self.assertFalse(ok(bad), bad)

    @unittest.skipUnless("libopus" in encoders() and "libmp3lame" in encoders(), "нужен ffmpeg с libopus и libmp3lame")
    def test_transcodes_to_original_codec(self):
        ff = shutil.which("ffmpeg")
        tone = lambda *args: subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                                             "sine=frequency=440:duration=0.3", *args, "pipe:1"],
                                            capture_output=True, check=True).stdout
        opus_mono = tone("-ac", "1", "-c:a", "libopus", "-f", "ogg")
        mp3_stereo = tone("-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-f", "mp3")
        wav = tone("-ac", "1", "-ar", "22050", "-f", "wav")
        p = panel()
        self.assertEqual(p._audio_like(opus_mono, wav)[:4], b"OggS")
        self.assertEqual(p._audio_like(wav, mp3_stereo)[:4], b"RIFF")
        out = p._audio_like(mp3_stereo, opus_mono)
        self.assertTrue(out[:2] == b"\xff\xfb" or out[:3] == b"ID3", out[:4])


if __name__ == "__main__":
    unittest.main()


class AnimOverrides(unittest.TestCase):
    """Свои анимации кольца и часов — те же подмены, что у звуков."""

    def test_led_validation(self):
        good = "loop\nff0000 00ff00 0000ff 200\nsmooth 100\ngradient 0 0000ff 1 0000ff 60000\nrotate ff0000 000000 000000 50\n# —\n"
        self.assertEqual(server.check_led(good), good)
        for bad in ("rm -rf /", "ff0000 00ff00 0000ff 200; reboot", "loop\n$(id)", "loop", "ff0000 1\n" * 10000):
            with self.assertRaises(server.AdbError):
                server.check_led(bad)

    def test_led_parse(self):
        r = server.parse_led("loop\nff0000 00ff00 0000ff 200\n")
        self.assertEqual((r["loop"], r["simple"], r["frames"][0]["c"][1], r["frames"][0]["ms"]), (True, True, [0, 255, 0], 200))
        self.assertFalse(server.parse_led("smooth 10\nff0000 00ff00 0000ff 200\n")["simple"])

    def test_only_listed_animations(self):
        p = server.Panel(Mock())
        p.patterns = lambda: {"ring": ["qc.led"], "clock": ["boot.binscled.zst", "blink.binscled.zst"]}
        for kind, name in (("ring", "../../etc/passwd"), ("clock", "qc.led"), ("evil", "qc.led")):
            with self.assertRaisesRegex(server.AdbError, "нет такой анимации"):
                p.anim_reset(kind, name)
        self.assertEqual(p._anim_paths("ring", "qc.led")[1], f"{server.OVR_DIR}/ledpatterns/oknix/qc.led")
        p.boot_reset, p._remove_override, p.anim_custom = Mock(), Mock(), Mock()
        p.anim_reset("clock", "boot.binscled.zst")
        p.boot_reset.assert_called_once()   # заставка — по-старому, через вкладку «Запуск»
        p._remove_override.assert_not_called()

    def test_custom_list(self):
        p = server.Panel(Mock())
        p.adb.shell.return_value = ("./oknix/qc.led\n./clock/blink.binscled.zst\n./other/x\n@boot\n", "", 0)
        self.assertEqual(p.anim_custom(), {"ring": ["qc.led"], "clock": ["blink.binscled.zst", "boot.binscled.zst"]})

    def test_backup_names(self):
        ok = server.Panel.BACKUP_FILES.fullmatch
        self.assertTrue(ok("override/ledpatterns/oknix/timer.led"))
        for bad in ("override/ledpatterns/x/a", "override/ledpatterns/oknix/../a", "override/ledpatterns/oknix/a/b"):
            self.assertFalse(ok(bad), bad)
