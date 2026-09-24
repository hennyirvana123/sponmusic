import asyncio
import hashlib
import time
import unittest
from pathlib import Path

import mido
from fastapi.testclient import TestClient
from app import create_app


class ContractAdapter:
    # Test double only. Never used by production app or presented as inference.
    model = None
    device = 'cpu'

    def process(self, source, output, stage):
        stage('transcribing', 50)
        midi = mido.MidiFile()
        midi.tracks.append(mido.MidiTrack())
        midi.save(output)
        return {'note_count': 0, 'midi_track_count': 1}


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(ContractAdapter()))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json(), {
            'alive': True, 'engine': 'mt3-infer', 'model': 'yourmt3',
            'model_loaded': False, 'device': 'cpu'})

    def test_validation(self):
        self.assertEqual(self.client.post('/transcribe').status_code, 422)
        self.assertEqual(self.client.post('/transcribe', files={'file': ('bad.exe', b'test')}).status_code, 415)
        self.assertEqual(self.client.post('/transcribe', files={'file': ('empty.wav', b'')}).status_code, 400)

    def test_job_and_download(self):
        # Bytes deliberately are not audio: decoding is outside this contract test.
        response = self.client.post('/transcribe', files={'file': ('contract.wav', b'contract fixture')})
        self.assertEqual(response.status_code, 202)
        key = response.json()['job_id']
        deadline = time.monotonic() + 5
        while True:
            state = self.client.get('/jobs/' + key).json()
            self.assertTrue({'job_id', 'status', 'progress', 'error'} <= state.keys())
            if state['status'] in ('completed', 'failed') or time.monotonic() > deadline:
                break
            time.sleep(.01)
        self.assertEqual(state['status'], 'completed')
        response = self.client.get('/jobs/' + key + '/midi')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'MThd'))

    def test_missing(self):
        self.assertEqual(self.client.get('/jobs/missing').status_code, 404)
        self.assertEqual(self.client.get('/jobs/missing/midi').status_code, 404)

    def test_routes_are_isolated(self):
        paths = {route.path for route in self.client.app.routes}
        self.assertNotIn('/ai-arrangement', paths)
        self.assertNotIn('/api/piano/transcribe', paths)

    def test_contract_execution_does_not_touch_production_files(self):
        root = Path(__file__).resolve().parents[2]
        if not (root / 'src').exists():
            self.skipTest('Production tree not included in isolated Docker context')
        targets = [root / 'src', root / 'server', root / 'services/basic-pitch',
                   root / 'services/piano-faithful', root / 'services/source-separation']
        def snapshot():
            return {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                    for target in targets for p in target.rglob('*') if p.is_file()}
        before = snapshot()
        self.client.get('/health')
        self.test_job_and_download()
        self.assertEqual(before, snapshot())


if __name__ == '__main__':
    unittest.main()
