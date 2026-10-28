import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def panel():
    p = server.Panel(Mock())
    p.written = None
    p._alarm_sounds_ready = lambda needed: setattr(p, "needed", needed)
    p._alarm_write = lambda conf, lines, extra="": setattr(p, "written", (conf, lines))
    p.scenes = lambda: {"scenes": [], "running": []}
    return p


class ScenesSave(unittest.TestCase):
    """Сценарии уходят на колонку данными: шаг и аргументы, без символов, которые сломали бы конфиг."""

    def save(self, *steps, **scene):
        p = panel()
        p.scenes_save({"scenes": [{"id": "ab1", "name": "Ночь", "time": "23:00", "days": "12345", "steps": list(steps), **scene}]})
        return p

    def test_lines(self):
        p = self.save({"kind": "vol", "level": 2, "ramp": 60}, {"kind": "query", "text": "включи | режим\nне беспокоить"},
                      {"kind": "ring", "color": "#6C47FF", "secs": 9999}, {"kind": "wait", "secs": 30}, {"kind": "stop"},
                      {"kind": "sound", "sound": "sys:common/timer.wav"})
        conf, lines = p.written
        self.assertEqual(conf, server.SCENES_CONF)
        self.assertEqual(lines, ["S|ab1|1|time|23:00|12345|Ночь", "A|ab1|vol|2|60", "A|ab1|query|включи   режим не беспокоить|",
                                 "A|ab1|ring|6c47ff|600", "A|ab1|wait|30|", "A|ab1|stop||", "A|ab1|sound|default.wav|sys:common/timer.wav"])

    def test_boot_trigger_has_no_time(self):
        p = self.save({"kind": "stop"}, trigger="boot", time="")
        self.assertEqual(p.written[1][0], "S|ab1|1|boot||12345|Ночь")

    def test_rejects(self):
        for steps, kw in ((({"kind": "rm"},), {}), (({"kind": "query", "text": " "},), {}), (({"kind": "ring", "color": "red"},), {}),
                          ((), {}), (({"kind": "stop"},), {"time": "25:00"})):
            with self.assertRaises(server.AdbError, msg=(steps, kw)):
                self.save(*steps, **kw)

    def test_parse_back(self):
        p = server.Panel(Mock())
        p.adb.shell.return_value = ("S|ab1|0|boot|||Утро\nA|ab1|vol|3|0\nA|ab1|ring|ff0000|5\nA|zz|stop||\n<<<\nab1\n", "", 0)
        r = p.scenes()
        self.assertEqual(r["running"], ["ab1"])
        self.assertEqual(r["scenes"][0]["steps"], [{"kind": "vol", "level": 3, "ramp": 0}, {"kind": "ring", "color": "#ff0000", "secs": 5}])

    def test_daemon_runs_steps_as_data(self):
        script = server.alarm_script().decode()
        self.assertIn('while IFS=\'|\' read -r _ _ kind a b; do step "$kind" "$a" "$b"', script)
        code = "\n".join(l for l in script.splitlines() if not l.lstrip().startswith("#"))
        self.assertNotIn("eval", code)


if __name__ == "__main__":
    unittest.main()
