import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from test_profiles import fresh_server
import profiles
import server
import multi


class AdbListing(unittest.TestCase):
    def test_windows_crlf_is_not_part_of_remote_name(self):
        s = fresh_server()
        result = Mock(returncode=0, stdout=b'000041ed 00000010 00000020 folder\r\n', stderr=b'')
        with patch.object(s.subprocess, 'run', return_value=result):
            self.assertEqual(s.Adb('adb', 'device').ls('/tmp')[0][3], 'folder')

    def test_form_feed_in_name_is_kept(self):
        s = fresh_server()
        result = Mock(returncode=0, stdout=b'000081a4 00000001 00000020 a\x0cb\r\n', stderr=b'')
        with patch.object(s.subprocess, 'run', return_value=result):
            self.assertEqual([e[3] for e in s.Adb('adb', 'device').ls('/tmp')], ['a\x0cb'])


class Station2Colors(unittest.TestCase):
    def test_primaries_and_mixed_colors_use_rgbx_and_preview_reads_same_channels(self):
        s = fresh_server(); profiles.install(s, 'station2')
        panel = s.Panel(Mock())
        panel.adb.shell.return_value = ('', '', 0)
        frames = []
        panel.adb.push.side_effect = lambda path, dest: frames.append(Path(path).read_bytes())
        # This device's LED controller consumes RGBX despite reporting BGRX fb offsets.
        for rgb in ((255,0,0),(0,255,0),(0,0,255),(255,255,255),(108,71,255),(255,102,0),(11,37,83)):
            panel.ring(dict(zip(('red','green','blue'),rgb)))
            self.assertEqual(frames[-1],bytes((*rgb,0))*89)
            panel.adb.read_bytes.return_value = frames[-1]
            self.assertEqual(panel.clock_state()['ring_all'],[list(rgb)]*89)


class UpdateLifecycle(unittest.TestCase):
    def test_multi_stops_children_before_replacing_process(self):
        events = Mock(); workers = Mock()
        events.attach_mock(workers.stop, 'stop')
        with patch.object(multi.server,'restart_self') as restart:
            events.attach_mock(restart,'restart')
            multi.restart_workers(workers)
        self.assertEqual([call[0] for call in events.mock_calls],['stop','restart'])
    def test_update_uses_configured_restart_after_install(self):
        callback = Mock(); updater = server.PanelUpdater(restart=callback)
        updater.check = Mock(return_value={'update':True,'latest':'0.1.4','install':'zip'})
        updater._from_zip = Mock()
        with patch.object(server.threading,'Timer') as timer:
            result = updater.update()
        updater._from_zip.assert_called_once_with('0.1.4')
        self.assertEqual(result['version'],'0.1.4')
        timer.assert_called_once_with(1.0,callback)
        timer.return_value.start.assert_called_once()

    def test_failed_install_does_not_schedule_restart(self):
        updater = server.PanelUpdater(restart=Mock())
        updater.check = Mock(return_value={'update':True,'latest':'0.1.4','install':'zip'})
        updater._from_zip = Mock(side_effect=OSError('download failed'))
        with patch.object(server.threading,'Timer') as timer, self.assertRaises(OSError):
            updater.update()
        timer.assert_not_called()
        self.assertFalse(updater.lock.locked())


class YamServices(unittest.TestCase):
    def test_service_fallback_and_unrelated_errors(self):
        panel = server.Panel(Mock())
        panel._yam = Mock(side_effect=[server.AdbError('package launch mode does not support this command'), {}])
        panel.yam_action('run','example')
        self.assertEqual(panel._yam.call_args.args,('POST','/api/plugins/example/service/start'))
        panel._yam = Mock(side_effect=server.AdbError('permission denied'))
        with self.assertRaisesRegex(server.AdbError,'permission denied'):
            panel.yam_action('run','example')
        self.assertEqual(panel._yam.call_count,1)
