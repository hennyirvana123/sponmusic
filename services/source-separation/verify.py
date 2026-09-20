"""Independent verifier. No generated input; stdout contains one JSON report."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import urllib.error
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--audio', required=True)
    parser.add_argument('--output', default='verification-output')
    parser.add_argument('--timeout', type=int, default=1800)
    args = parser.parse_args()
    report = {'stage': 'stage1-source-separation', 'status': 'not_verified', 'warnings': [], 'requests': []}
    def fail(code, detail):
        report.update(error=code, detail=detail)
        raise RuntimeError(code)
    def request(path, data=None, headers=None, expected=200):
        try:
            with urllib.request.urlopen(urllib.request.Request(args.url.rstrip('/')+path, data=data, headers=headers or {}), timeout=90) as response:
                report['requests'].append({'path': path, 'status': response.status})
                if response.status != expected:
                    fail('HTTP_ERROR', f'{path}: unexpected HTTP {response.status}')
                body = response.read(64_000_001)
                if len(body) > 64_000_000:
                    fail('RESPONSE_TOO_LARGE', path)
                return body
        except urllib.error.HTTPError as exc:
            report['requests'].append({'path': path, 'status': exc.code})
            fail('HTTP_ERROR', f'{path}: HTTP {exc.code}; {exc.read(2000).decode(errors="replace")}')
        except (urllib.error.URLError, TimeoutError) as exc:
            fail('SERVICE_UNREACHABLE', str(exc))
    try:
        audio = Path(args.audio)
        if not audio.is_file():
            fail('TEST_AUDIO_MISSING', 'Provide an existing permitted MP3/WAV file')
        if audio.stat().st_size == 0 or audio.stat().st_size > 20_000_000:
            fail('INVALID_INPUT', 'Input must be non-empty and at most 20 MB')
        import soundfile as sf
        import numpy as np
        try:
            probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(audio)], capture_output=True, text=True, check=True, timeout=30)
            duration = float(json.loads(probe.stdout)['format']['duration'])
        except Exception:
            fail('INPUT_PROBE_FAILED', 'ffprobe must be installed and input must be decodable')
        if not math.isfinite(duration) or not .25 <= duration <= 60:
            fail('INVALID_INPUT_DURATION', str(duration))
        report['inputDurationSeconds'] = duration
        health = json.loads(request('/health'))
        diag = json.loads(request('/diagnostics'))
        report.update(engine=diag.get('engine'), model=diag.get('model'), version=diag.get('version'))
        if not health.get('ready') or not diag.get('modelAvailable'):
            fail(diag.get('errorCode') or 'MODEL_UNAVAILABLE', 'Model is not ready')
        if diag.get('engine') != 'demucs' or diag.get('model') != 'htdemucs' or 'vocals' not in diag.get('sources', []):
            fail('MODEL_MISMATCH', 'Expected Demucs htdemucs with vocals source')
        boundary = uuid.uuid4().hex
        payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="input.audio"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+audio.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
        job = json.loads(request('/separate', payload, {'Content-Type': 'multipart/form-data; boundary='+boundary}, 202))
        job_id = job.get('job_id', '')
        if len(job_id) != 32 or any(c not in '0123456789abcdef' for c in job_id):
            fail('INVALID_JOB', 'Invalid job ID')
        deadline = time.monotonic()+args.timeout
        while True:
            state = json.loads(request('/separate/'+job_id))
            if state.get('status') == 'failed':
                fail(state.get('error_code', 'SEPARATION_FAILED'), state.get('error', 'Unknown failure'))
            if state.get('status') == 'completed':
                break
            if state.get('status') not in ('queued', 'processing'):
                fail('INVALID_JOB_STATUS', str(state.get('status')))
            if time.monotonic() >= deadline:
                fail('VERIFICATION_TIMEOUT', 'No completion within deadline; resource failure is not proven')
            time.sleep(3)
        report['processingSeconds'] = state.get('processing_seconds')
        if state.get('analysis', {}).get('model') != 'htdemucs':
            fail('MODEL_MISMATCH', 'Job model provenance missing')
        folder = Path(args.output)/job_id
        folder.mkdir(parents=True, exist_ok=True)
        hashes = {}; frames = {}; rates = {}; arrays = {}
        for stem in ('vocals', 'instrumental', 'original'):
            path = folder/(stem+'.wav')
            path.write_bytes(request(f'/separate/{job_id}/{stem}'))
            samples, rate = sf.read(path, dtype='float32', always_2d=True)
            info = sf.info(path)
            if info.format not in ('WAV', 'WAVEX') or rate < 8000 or rate > 192000 or samples.shape[1] not in (1, 2) or not len(samples) or not np.isfinite(samples).all():
                fail('INVALID_STEM_AUDIO', stem)
            seconds = len(samples)/rate
            if abs(seconds-duration) > .15:
                fail('STEM_DURATION_MISMATCH', stem)
            hashes[stem] = hashlib.sha256(path.read_bytes()).hexdigest()
            frames[stem] = len(samples); rates[stem] = rate; arrays[stem] = samples
            report[stem+'DurationSeconds'] = seconds
            report[stem+'FileSizeBytes'] = path.stat().st_size
            report[stem+'Audio'] = {'sampleRate': rate, 'channels': samples.shape[1], 'peak': float(np.max(np.abs(samples)))}
            if np.max(np.abs(samples)) < 1e-7:
                fail('SILENT_STEM_REQUIRES_REVIEW', stem+' is silent; this is not proof of fake inference')
        if len(set(frames.values())) != 1 or len(set(rates.values())) != 1:
            fail('STEM_ALIGNMENT_MISMATCH', 'Frame counts/sample rates differ')
        if len(set(hashes.values())) != 3 or any(np.array_equal(arrays[a], arrays[b]) for a,b in [('vocals','instrumental'),('vocals','original'),('instrumental','original')]):
            fail('DUPLICATE_STEMS', 'Identical file or decoded audio detected')
        report.update(status='verified', sha256=hashes, outputDirectory=str(folder), warnings=['File validity and service provenance verified; listening required. Hash differences do not independently prove model execution. CPU/RAM not measured.'])
    except RuntimeError as exc:
        if 'error' not in report:
            report.update(error='VERIFICATION_FAILED', detail=str(exc))
    except Exception as exc:
        report.update(error='VERIFICATION_FAILED', detail=str(exc))
    print(json.dumps(report, indent=2))
    return 0 if report['status'] == 'verified' else 1

if __name__ == '__main__':
    sys.exit(main())
