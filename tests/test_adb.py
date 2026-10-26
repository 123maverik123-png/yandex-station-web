import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class AdbDiscoveryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="adb discovery ")
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        for context in (
            patch.dict(os.environ, {"ADB": "", "ANDROID_HOME": "", "ANDROID_SDK_ROOT": ""}),
            patch.object(server, "ROOT", self.home / "project"),
            patch.object(server.shutil, "which", return_value=None),
            patch.object(Path, "home", return_value=self.home),
        ):
            context.start()
            self.addCleanup(context.stop)

    def executable(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
        return str(path)

    def test_android_studio_on_macos_without_path_entry(self):
        adb = self.executable(self.home / "Library/Android/sdk/platform-tools/adb")
        with patch.object(server.sys, "platform", "darwin"):
            self.assertEqual(server.find_adb(), adb)

    def test_custom_sdk_directory_with_spaces(self):
        executable = "adb.exe" if os.name == "nt" else "adb"
        sdk = self.home / "custom Android SDK"
        adb = self.executable(sdk / "platform-tools" / executable)
        for variable in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
            with self.subTest(variable=variable), patch.dict(os.environ, {variable: str(sdk)}):
                self.assertEqual(server.find_adb(), adb)

    def test_explicit_adb_takes_precedence_over_macos_sdk(self):
        self.executable(self.home / "Library/Android/sdk/platform-tools/adb")
        explicit = self.executable(self.home / "chosen tools/adb")
        with patch.object(server.sys, "platform", "darwin"), patch.dict(os.environ, {"ADB": explicit}):
            self.assertEqual(server.find_adb(), explicit)


class TransferTests(unittest.TestCase):
    def test_slow_reply_during_file_transfer_is_not_a_disconnect(self):
        adb = server.Adb("adb", "192.0.2.1:5555")
        conn = server.Connection(adb)
        with patch.object(server.subprocess, "run", side_effect=server.subprocess.TimeoutExpired("adb", 4)) as run:
            with adb._transfer():
                self.assertTrue(conn._alive())
            run.assert_not_called()
            self.assertFalse(conn._alive())
        self.assertEqual(adb.transfers, 0)
