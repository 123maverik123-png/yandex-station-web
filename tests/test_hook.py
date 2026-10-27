"""Подключение хука к загрузке: команды выполняются настоящим sh во временной папке вместо колонки."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class LocalAdb:
    def __init__(self, root):
        self.root = root

    def shell(self, command, timeout=15, check=True):
        p = subprocess.run(["sh", "-c", command], capture_output=True, text=True)
        return p.stdout, p.stderr, p.returncode

    def push(self, local, remote, timeout=120):
        shutil.copy(local, remote)


def gnu_sed():
    """На колонке sed из busybox (как GNU); BSD sed в macOS понимает -i и «1a» иначе — там этот тест не о чём."""
    try:
        return subprocess.run(["sed", "--version"], capture_output=True).returncode == 0
    except OSError:
        return False


@unittest.skipIf(shutil.which("sh") is None or not gnu_sed(), "нужны sh и sed как на колонке (GNU/busybox)")
class RootkeeperHook(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        web, keeper, caller = self.root / "webpanel", self.root / "rootkeeper.sh", self.root / "onboot.sh"
        values = {"WEB_DIR": str(web), "BOOT_HOOK": str(web / "boot_hook.sh"), "ROOTKEEPER": str(keeper),
                  "ROOTKEEPER_CREATED": f"{keeper}.webpanel.created", "ROOTKEEPER_CALLER": str(caller),
                  "BOOT_CUSTOM": str(web / "boot.bin"), "SOUND_CUSTOM": str(web / "s"), "BOOT_ALWAYS": str(web / "a"),
                  "YAM_AUTOSTART": str(web / "y"), "ALARM_CONF": str(web / "al"), "HOSTS_CUSTOM": str(web / "h"),
                  "ASSIST_CONF": str(web / "as")}
        values["ROOTKEEPER_DROP_CREATED"] = server.ROOTKEEPER_DROP_CREATED.replace(server.ROOTKEEPER, str(keeper))
        for name, value in values.items():
            p = patch.object(server, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.keeper, self.caller = keeper, caller
        self.panel = server.Panel(LocalAdb(self.root))

    def test_missing_rootkeeper_is_created_when_boot_calls_it_and_removed_on_rollback(self):
        self.caller.write_text(f"[ -x {self.keeper} ] && {self.keeper} &\n")
        self.panel._ensure_hook()
        text = self.keeper.read_text()
        self.assertTrue(text.startswith("#!/bin/sh\n"))
        self.assertIn(server.HOOK_MARK, text)
        self.assertTrue(Path(server.ROOTKEEPER_CREATED).exists())
        self.panel._drop_hook_if_unused()
        self.assertFalse(self.keeper.exists())
        self.assertFalse(Path(server.ROOTKEEPER_CREATED).exists())

    def test_not_created_when_boot_does_not_call_it(self):
        self.caller.write_text("echo nothing\n")
        with self.assertRaises(server.AdbError):
            self.panel._ensure_hook()
        self.assertFalse(self.keeper.exists())

    def test_existing_rootkeeper_keeps_its_own_lines(self):
        self.keeper.write_text("#!/bin/sh\nstart_root_things\n")
        self.panel._ensure_hook()
        self.panel._drop_hook_if_unused()
        self.assertEqual(self.keeper.read_text(), "#!/bin/sh\nstart_root_things\n")


if __name__ == "__main__":
    unittest.main()
