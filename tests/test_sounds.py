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
