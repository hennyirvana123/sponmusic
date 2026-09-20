import threading
import time
import unittest
from fastapi.testclient import TestClient
from app import create_app

class JobsTest(unittest.TestCase):
    def test_lifecycle(self):
        release = threading.Event()
        entered = threading.Event()
        def processor(path, directory, model):
            entered.set()
            release.wait(5)
            # Test double only: never used by production inference.
            if open(path, 'rb').read().endswith(b'fail'):
                raise RuntimeError('Basic Pitch chunk 2/3 failed')
            return b'MThd-test-fixture', 120
        with TestClient(create_app(lambda: object(), processor)) as client:
            self.assertFalse(client.get('/health').json()['busy'])
            first = client.post('/transcribe', files={'audio': ('a.mp3', b'ID3test')})
            self.assertEqual(first.status_code, 202)
            key = first.json()['job_id']
            self.assertTrue(entered.wait(2))
            self.assertTrue(client.get('/health').json()['busy'])
            second = client.post('/transcribe', files={'audio': ('b.mp3', b'ID3fail')}).json()['job_id']
            self.assertEqual(client.get('/transcribe/'+second).json()['status'], 'queued')
            self.assertEqual(client.get('/transcribe/'+key+'/download').status_code, 409)
            release.set()
            for _ in range(100):
                if client.get('/transcribe/'+second).json()['status'] == 'failed': break
                time.sleep(.02)
            self.assertEqual(client.get('/transcribe/'+key).json()['status'], 'completed')
            download = client.get('/transcribe/'+key+'/download')
            self.assertEqual(download.status_code, 200)
            self.assertEqual(download.headers['content-type'], 'audio/midi')
            self.assertIn('chunk 2/3', client.get('/transcribe/'+second).json()['error'])
            self.assertEqual(client.get('/transcribe/missing').status_code, 404)

if __name__ == '__main__':
    unittest.main()
