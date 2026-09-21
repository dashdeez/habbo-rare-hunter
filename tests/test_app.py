import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch, Mock
import requests
import app as hunter


class HuntTests(unittest.TestCase):
    def setUp(self):
        self.client = hunter.app.test_client()
        hunter.lookup_cached.cache_clear()

    def test_requested_hunt(self):
        with patch.object(hunter, 'lookup_paced', return_value={'status': 'unverified', 'detail': 'No public profile'}):
            response = self.client.post('/api/hunt', json={
                'categories': ['words', 'names', 'three', 'four', 'clean'],
                'limit': 100, 'minimum': 60})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['generated'], 100)
        self.assertEqual(len(payload['results']), 100)
        self.assertEqual(len({r['name'] for r in payload['results']}), 100)
        for row in payload['results']:
            self.assertGreaterEqual(row['score'], 60)
            self.assertIsNotNone(hunter.VALID.fullmatch(row['name']))
            self.assertEqual(row['status'], 'unverified')

    def test_timeout_returns_partial_results_and_cancels_queue(self):
        def lookup(name, bucket):
            if name == 'slow':
                time.sleep(.2)
            return {'status': 'taken', 'detail': 'Found'}
        with ThreadPoolExecutor(max_workers=1) as pool:
            with patch.object(hunter, 'LOOKUP_POOL', pool), patch.object(hunter, 'lookup_paced', side_effect=lookup) as mocked, patch.dict(hunter.app.config, CHECK_TIMEOUT=.05):
                started = time.monotonic()
                rows = hunter.check_names([{'name': n} for n in ['fast', 'slow', 'queued', '!']])
                self.assertLess(time.monotonic() - started, .15)
                self.assertEqual([r['status'] for r in rows], ['taken', 'unknown', 'unknown', 'invalid'])
        self.assertEqual(mocked.call_count, 2)

    def test_invalid_input_is_json_error(self):
        for body in [[], {'limit': 'bad'}, {'minimum': None}, {'limit': 1.5}, {'categories': ['bad']}, {'categories': 'words'}]:
            with self.subTest(body=body):
                response = self.client.post('/api/hunt', json=body)
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.get_json())
        response = self.client.post('/api/hunt', data='{', content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.get_json())
        self.assertEqual(self.client.post('/api/check', json={'names': 42}).status_code, 400)
        self.assertEqual(self.client.get('/api/hunt').status_code, 405)
        self.assertIn('error', self.client.get('/api/missing').get_json())

    def test_unexpected_errors_are_json(self):
        with patch.object(hunter, 'generate', side_effect=RuntimeError('private failure')):
            with self.assertLogs(hunter.app.logger, level='ERROR'):
                response = self.client.post('/api/hunt', json={})
        self.assertEqual(response.status_code, 500)
        self.assertIn('error', response.get_json())
        self.assertNotIn('private failure', response.get_data(as_text=True))

    def test_habbo_errors_and_profiles(self):
        cases = [(200, {'name': 'ace'}, 'taken'), (404, {}, 'unverified'),
                 (429, {}, 'unknown'), (502, {}, 'unknown'), (200, [], 'unknown'),
                 (200, {}, 'unknown')]
        for status, payload, expected in cases:
            hunter.lookup_cached.cache_clear()
            with patch.object(hunter.requests, 'get', return_value=Mock(status_code=status, json=Mock(return_value=payload))):
                self.assertEqual(hunter.lookup_cached('ace', 0)['status'], expected)
        hunter.lookup_cached.cache_clear()
        with patch.object(hunter.requests, 'get', return_value=Mock(status_code=200, json=Mock(side_effect=ValueError('invalid json')))):
            self.assertEqual(hunter.lookup_cached('ace', 0)['status'], 'unknown')
        hunter.lookup_cached.cache_clear()
        with patch.object(hunter.requests, 'get', side_effect=requests.Timeout):
            self.assertEqual(hunter.lookup_cached('ace', 0)['status'], 'unknown')

    def test_regex_and_manual_split(self):
        with patch.object(hunter, 'lookup_paced', return_value={'status': 'taken', 'detail': 'Found'}):
            response = self.client.post('/api/check', json={'names': 'ace, ACE\nfoo-bar\tfoo.bar foo_bar !'})
        rows = response.get_json()['results']
        self.assertEqual([r['name'] for r in rows], ['ace', 'foo-bar', 'foo.bar', 'foo_bar', '!'])
        self.assertEqual(rows[-1]['status'], 'invalid')
        self.assertEqual(hunter.check_names([]), [])


if __name__ == '__main__':
    unittest.main()
