import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangementV2Jobs } from '../server/utils/arrangement-v2';

const id = 'a'.repeat(32);
const request = (path: string) => new Request('https://spontion.blitz.cloud/api/piano/jobs/' + path);
const mock = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  (async (url, init) => handler(String(url), init)) as typeof fetch;

test('submit sends file multipart and requires 202 with valid job ID', async () => {
  const submit = () => new Request(request('submit'), {method: 'POST', headers: {'Content-Type': 'audio/wav'}, body: 'audio transport fixture'});
  const response = await arrangementV2Jobs(submit(), mock((url, init) => {
    assert.ok(url.endsWith('/transcribe'));
    assert.equal(init?.method, 'POST');
    assert.ok(init?.body instanceof FormData);
    assert.deepEqual([...init.body.keys()], ['file']);
    return Response.json({job_id: id, status: 'queued'}, {status: 202});
  }));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).job_id, id);
  for (const [jobId, status] of [['bad', 202], [id, 200]] as const) {
    assert.equal((await arrangementV2Jobs(submit(), mock(() => Response.json({job_id: jobId, status: 'queued'}, {status})))).status, 502);
  }
});

for (const status of ['queued', 'processing', 'completed', 'failed']) {
  test('poll preserves ' + status, async () => {
    const response = await arrangementV2Jobs(request(id), mock(url => {
      assert.ok(url.endsWith('/jobs/' + id));
      return Response.json({job_id: id, status, error: status === 'failed' ? {code: 'TRANSCRIPTION_FAILED', stage: 'inference', message: 'Actual upstream failure'} : null});
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, status);
    if (status === 'failed') assert.match(body.error, /Actual upstream failure/);
    if (status === 'completed') assert.equal(body.download_url, '/api/piano/jobs/' + id + '/download');
  });
}

test('mismatched ID and unknown status rejected', async () => {
  for (const body of [{job_id: 'b'.repeat(32), status: 'queued'}, {job_id: id, status: 'unknown'}]) {
    assert.equal((await arrangementV2Jobs(request(id), mock(() => Response.json(body)))).status, 502);
  }
});

test('invalid MIDI produces error, never fallback MIDI', async () => {
  const response = await arrangementV2Jobs(request(id + '/download'), mock(url => {
    assert.ok(url.endsWith('/jobs/' + id + '/midi'));
    return new Response('not MIDI');
  }));
  assert.equal(response.status, 502);
  assert.match(response.headers.get('content-type') || '', /json/);
});

test('upstream HTTP error, network failure and timeout are preserved as errors', async () => {
  const response = await arrangementV2Jobs(request(id), mock(() => Response.json({detail: 'Capacity reached'}, {status: 429})));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).message, 'Capacity reached');
  const broken = mock(() => { throw new Error('connection failure'); });
  assert.equal((await arrangementV2Jobs(request(id), broken)).status, 502);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await arrangementV2Jobs(request(id), broken, controller.signal)).status, 504);
});
