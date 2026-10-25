import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import access


class OpenSSLTests(unittest.TestCase):
    def test_explicit_path_can_contain_spaces(self):
        with tempfile.TemporaryDirectory(prefix='openssl test ') as directory:
            executable=Path(directory)/'openssl.exe';executable.touch()
            with patch.dict(os.environ, {'PANEL_OPENSSL':str(executable)}):
                self.assertEqual(access.find_openssl(),str(executable))

    def test_missing_dependency_has_actionable_message(self):
        with patch.dict(os.environ,{'PANEL_OPENSSL':''}), patch.object(access.shutil,'which',return_value=None), patch.object(Path,'is_file',return_value=False):
            with self.assertRaisesRegex(access.AccessError,'PANEL_OPENSSL.*--https-port 0'):
                access.find_openssl()

    def test_missing_program_never_escapes_as_winerror(self):
        with patch.object(access,'find_openssl',return_value='openssl'), patch.object(access.subprocess,'run',side_effect=FileNotFoundError()):
            with self.assertRaisesRegex(access.AccessError,'Не удалось запустить OpenSSL'):
                access._openssl('version',cwd='.')

    @unittest.skipUnless(os.name=='nt','Windows Git layout')
    def test_git_openssl_is_found_without_path_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            program=Path(directory)/'Git/usr/bin/openssl.exe';program.parent.mkdir(parents=True);program.touch()
            with patch.dict(os.environ,{'PANEL_OPENSSL':'','ProgramFiles':directory}), patch.object(access.shutil,'which',return_value=None):
                self.assertEqual(access.find_openssl(),str(program))
