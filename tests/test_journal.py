import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class Redact(unittest.TestCase):
    def test_hides_secrets_and_addresses(self):
        text = server.redact("sk-proj-abcdefghijklmnop y0_AgAAAAABCDEFGHIJKLMNOP token=abcdefghijklmnopqrstu "
                             "192.168.2.115:5555 aa:bb:cc:dd:ee:ff me@mail.ru /home/dimap/x C:\\Users\\Dima\\y")
        for secret in ("abcdefghijklmnop", "ABCDEFGHIJKLMNOP", "abcdefghijklmnopqrstu", "192.168", "aa:bb", "me@", "dimap", "Dima"):
            self.assertNotIn(secret, text)

    def test_keeps_versions(self):
        for keep in ("0.369.1.50.4794654278.20261021.133", "127.0.0.1:8765", "adb 1.0.41"):
            self.assertEqual(server.redact(keep), keep)


class JournalFile(unittest.TestCase):
    def test_repeats_collapse_and_survive_restart(self):
        path = Path(tempfile.mkdtemp()) / "j.jsonl"
        j = server.Journal(); j.open(path)
        for _ in range(3):
            j.add("связь: потеряна", "warn")
        j.add("POST /api/x — ок")
        self.assertIn("(×3)", j.text())
        again = server.Journal(); again.open(path)
        self.assertEqual([i["msg"] for i in again.items], ["связь: потеряна", "POST /api/x — ок"])

    def test_trims_to_limit(self):
        path = Path(tempfile.mkdtemp()) / "j.jsonl"
        j = server.Journal(); j.LIMIT = 50; j.open(path)
        for n in range(450):
            j.add(f"событие {n}")
        self.assertLessEqual(len(path.read_text().splitlines()), 50 + 200)
        self.assertEqual(j.items[-1]["msg"], "событие 449")


class RequestJournal(unittest.TestCase):
    def handler(self, method, path, data=None, headers=None):
        h = SimpleNamespace(command=method, path=path, _jdata=data or {}, headers=headers or {}, JOURNAL_QUIET=server.Handler.JOURNAL_QUIET,
                            JOURNAL_KEYS=server.Handler.JOURNAL_KEYS)
        return lambda **kw: server.Handler._journal(h, **kw)

    def setUp(self):
        server.JOURNAL.items.clear()

    def test_actions_without_secrets(self):
        self.handler("POST", "/api/assistant", {"api_key": "sk-secret-123456789", "name": "x"})()
        self.handler("POST", "/api/volume", {"level": 5})()          # ползунок — не пишем
        self.handler("GET", "/api/status")()                          # опрос — не пишем
        self.handler("GET", "/api/status")(error="Колонка не ответила")
        msgs = [i["msg"] for i in server.JOURNAL.items]
        self.assertEqual(msgs, ["POST /api/assistant (name=x) — ок", "GET /api/status: Колонка не ответила"])
        self.assertNotIn("sk-secret", " ".join(msgs))


if __name__ == "__main__":
    unittest.main()


class SpeakerFinder(unittest.TestCase):
    """Поиск колонки из панели: адрес запоминается, панель перезапускается с ним."""

    def test_restart_replaces_device_args(self):
        from unittest.mock import patch
        cases = {("server.py", "--open", "--device", "1.2.3.4", "--port", "1"): ["server.py", "--port", "1"],
                 ("server.py", "--find", "--port", "1"): ["server.py", "--port", "1"],
                 ("server.py", "--find", "10.0.0.0/24", "--device=x"): ["server.py"]}
        for argv, rest in cases.items():
            with patch.object(server.sys, "argv", list(argv)), patch.object(server.os, "execv") as ex, \
                    patch.object(server.Handler, "panel", None, create=True):
                server.restart_self(device="192.168.1.50:5555")
            self.assertEqual(ex.call_args.args[1][1:], rest + ["--device", "192.168.1.50:5555"])

    def test_use_accepts_only_home_ip(self):
        from unittest.mock import patch
        h = SimpleNamespace()
        for bad in ("8.8.8.8", "evil.com", "abc", "", None, "192.168.1.5; reboot"):
            with self.assertRaises(server.AdbError):
                server.Handler._conn_use(h, bad)
        with patch.object(server, "save_settings") as save, patch.object(server, "load_settings", return_value={}), \
                patch.object(server.threading, "Timer") as timer:
            self.assertEqual(server.Handler._conn_use(h, "192.168.1.50")["serial"], "192.168.1.50:5555")
        save.assert_called_once_with({"device": "192.168.1.50:5555"})
        self.assertEqual(timer.call_args.kwargs["kwargs"], {"device": "192.168.1.50:5555"})


class SayOnSpeaker(unittest.TestCase):
    """«Сказать на колонке»: текст уходит файлом, в команду оболочки не попадает."""

    def test_alice_voice(self):
        p = server.Panel(Mock())
        p.detach = Mock()
        pushed = []
        p.adb.push = lambda local, remote, *a, **k: pushed.append((Path(local).read_text(encoding="utf-8"), remote))
        p.say("ужин; rm -rf / $(id)\nвторая строка")
        self.assertEqual(pushed, [("Повтори за мной: ужин; rm -rf / $(id) вторая строка\n", "/tmp/webpanel_say.txt")])
        script = p.detach.call_args.args[1]
        self.assertNotIn("rm -rf", script)
        self.assertIn("maind --cli", script)

    def test_assistant_voice_and_limits(self):
        p = server.Panel(Mock())
        p.assistant_command = Mock(return_value={"ok": True})
        p.say("привет", "assistant")
        p.assistant_command.assert_called_once_with({"say": "привет"})
        for bad in ("", "   ", "x" * 301):
            with self.assertRaises(server.AdbError):
                p.say(bad)
