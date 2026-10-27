import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class Radio(unittest.TestCase):
    def panel(self, cfg=None):
        panel = server.Panel(Mock())
        panel.stored = cfg or {}
        panel._assist_config = lambda: json.loads(json.dumps(panel.stored))
        panel._assist_write = lambda c: setattr(panel, "stored", c)
        panel._assist_local_md5 = lambda: None
        panel.adb.shell.return_value = ("@installed\n@running\n@status\n{}\n", "", 0)
        return panel

    def test_stations_are_validated_before_the_device(self):
        panel = self.panel()
        for bad in ({"name": "", "url": "http://a.b/x"}, {"name": "x", "url": "ftp://a.b"},
                    {"name": "x", "url": 'http://a.b/"; reboot'}, {"name": "x", "url": "http://a.b/x ! filesink"}):
            with self.assertRaises(server.AdbError):
                panel.radio_set({"stations": [bad]})
            with self.assertRaises(server.AdbError):
                panel.radio_play(bad)
        panel.adb.push.assert_not_called()
        st = panel.radio_set({"stations": [{"name": " Groove Salad ", "url": "http://ice1.somafm.com/groovesalad-128-mp3"}],
                              "voice": False})
        self.assertEqual(st["stations"], [{"name": "Groove Salad", "url": "http://ice1.somafm.com/groovesalad-128-mp3"}])
        self.assertFalse(st["voice"])

    def test_search_keeps_only_playable_streams(self):
        found = [{"name": "Jazz", "url_resolved": "https://jazz.example/stream.mp3", "codec": "MP3", "bitrate": 128},
                 {"name": "HLS", "url_resolved": "https://x.example/a.m3u8", "hls": 1},
                 {"name": "Bad", "url_resolved": "http://x.example/a b"}]
        with patch.object(server.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(found).encode())) as get:
            r = self.panel().radio_search("jazz", "ru")
        self.assertEqual([s["name"] for s in r["stations"]], ["Jazz"])
        self.assertIn("countrycode=RU", get.call_args.args[0].full_url)
        with self.assertRaises(server.AdbError):
            self.panel().radio_search("j")

    def test_alice_station_is_a_text_request(self):
        panel = self.panel()
        panel.glagol = Mock()
        panel.glagol.send.return_value = {"status": "SUCCESS"}
        panel.radio_alice("Европа Плюс")
        panel.glagol.send.assert_called_with({"command": "sendText", "text": "включи радио Европа Плюс"})


if __name__ == "__main__":
    unittest.main()
