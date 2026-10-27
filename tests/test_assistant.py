import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class AssistantKeys(unittest.TestCase):
    """Ключи API хранятся на колонке по адресу провайдера и наружу уходят только замаскированными."""

    def panel(self, cfg):
        panel = server.Panel(Mock())
        panel.stored = cfg
        panel._assist_config = lambda: json.loads(json.dumps(panel.stored))
        panel._assist_write = lambda c: setattr(panel, "stored", c)
        panel._assist_local_md5 = lambda: None
        panel.adb.shell.return_value = ("@installed\n@running\n@status\n{}\n", "", 0)
        return panel

    def test_legacy_key_moves_under_its_provider(self):
        panel = self.panel({"llm": {"base_url": "https://api.example.com/v1/", "api_key": "sk-legacy-123456"}})
        st = panel.assistant_set({"enabled": True})
        self.assertNotIn("api_key", panel.stored["llm"])
        self.assertEqual(panel.stored["keys"], {"https://api.example.com/v1": "sk-legacy-123456"})
        self.assertEqual(st["config"]["llm"]["key"], "…3456")
        self.assertNotIn("sk-legacy-123456", json.dumps(st))

    def test_switching_provider_keeps_previous_key(self):
        panel = self.panel({"llm": {"base_url": "https://a.example/v1"}, "keys": {"https://a.example/v1": "key-a-000000001"}})
        panel.assistant_set({"llm": {"base_url": "https://B.example/v1/", "api_key": "key-b-000000002"}})
        self.assertEqual(panel.stored["keys"], {"https://a.example/v1": "key-a-000000001",
                                                "https://b.example/v1": "key-b-000000002"})
        # пустой ключ из формы не стирает сохранённый
        panel.assistant_set({"llm": {"base_url": "https://a.example/v1", "api_key": ""}})
        self.assertEqual(panel.stored["keys"]["https://a.example/v1"], "key-a-000000001")
        panel.assistant_set({"delete_key": "https://b.example/v1/"})
        self.assertEqual(list(panel.stored["keys"]), ["https://a.example/v1"])

    def test_key_needs_address_and_unknown_fields_are_dropped(self):
        panel = self.panel({})
        with self.assertRaises(server.AdbError):
            panel.assistant_set({"llm": {"api_key": "orphan-key-000001"}})
        panel.assistant_set({"llm": {"base_url": "https://x/v1", "evil": 1}, "tts": {"provider": "alice"}})
        self.assertNotIn("evil", panel.stored["llm"])
        with self.assertRaises(server.AdbError):
            panel.assistant_set({"tts": {"provider": "rm -rf"}})

    def test_mode_phrases_and_timeout_are_sanitized(self):
        panel = self.panel({})
        panel.assistant_set({"mode": {"enter": ["  Переключись на GPT ", "", "x" * 100], "exit": ["верни алису"],
                                      "timeout_min": 100000, "follow_up": False, "evil": 1}})
        mode = panel.stored["mode"]
        self.assertEqual(mode["enter"], ["Переключись на GPT", "x" * 60])
        self.assertEqual(mode["exit"], ["верни алису"])
        self.assertEqual(mode["timeout_min"], 240)
        self.assertIs(mode["follow_up"], False)
        self.assertNotIn("evil", mode)

    def test_question_length_checked_before_device(self):
        panel = self.panel({})
        for text in ("", "   ", "я" * 1001):
            with self.assertRaises(server.AdbError):
                panel.assistant_ask(text)
        panel.adb.push.assert_not_called()


class AssistantHook(unittest.TestCase):
    def test_boot_hook_starts_assistant_only_when_configured(self):
        line = next(l for l in server.BOOT_HOOK_SCRIPT.splitlines() if "assistant" in l)
        self.assertTrue(line.startswith(f"[ -f {server.ASSIST_CONF} ] && [ -x {server.ASSISTD} ]"))
        # пока помощник настроен, строку автозапуска из rootkeeper.sh не убираем
        panel = server.Panel(Mock())
        panel._drop_hook_if_unused()
        self.assertIn(f"[ ! -f {server.ASSIST_CONF} ]", panel.adb.shell.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
