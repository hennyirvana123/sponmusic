import { defineHandler } from 'nitro';
import { modelUrl } from '../../../utils/piano-model';
import { pianoArrangement } from '../../../utils/piano-arrangement';
import pkg from '@tonejs/midi';

export default defineHandler(async event => {
  const headers = {'Cache-Control': 'no-store'};
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers});
  const job = new URL(event.req.url).searchParams.get('job_id');
  if (job && !/^[a-f0-9]{32}$/.test(job)) return reply({error: 'INVALID_JOB_ID'}, 400);
  let base: URL;
  try {
    base = new URL(modelUrl());
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error();
    base.pathname = base.pathname.replace(/\/+$/, '').replace(/\/transcribe$/, '');
  } catch { return reply({error: 'BASIC_PITCH_URL_NOT_CONFIGURED_OR_INVALID'}, 503); }
  const signal = AbortSignal.timeout(35000);
  async function fetchData(path: string, limit: number) {
    const url = new URL(base); url.pathname += path;
    const response = await fetch(url, {signal, redirect: 'error'});
    if (!response.ok) { await response.body?.cancel(); throw Error(`UPSTREAM_HTTP_${response.status}`); }
    if (!response.body) throw Error('EMPTY_RESPONSE');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > limit) throw Error('RESPONSE_TOO_LARGE'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return {bytes, bpm: Number(response.headers.get('x-estimated-bpm'))};
  }
  try {
    if (!job) {
      const result = JSON.parse(new TextDecoder().decode((await fetchData('/diagnostics', 65536)).bytes));
      return reply(result);
    }
    const state = JSON.parse(new TextDecoder().decode((await fetchData(`/transcribe/${job}`, 65536)).bytes));
    const diagnostics = state.diagnostics || {};
    if (state.status === 'completed') {
      const {bytes, bpm} = await fetchData(`/transcribe/${job}/download`, 2000000);
      const source = new pkg.Midi(bytes);
      diagnostics.arrangement_input_tracks = source.tracks.map(t => ({name: t.name, note_count: t.notes.length}));
      try {
        const arranged = new pkg.Midi(pianoArrangement(bytes, bpm >= 40 && bpm <= 240 ? bpm : undefined));
        diagnostics.final_note_count = arranged.tracks.reduce((sum, t) => sum + t.notes.length, 0);
        diagnostics.final_tracks = arranged.tracks.map(t => ({name: t.name, note_count: t.notes.length}));
        diagnostics.arrangement_check = 'recomputed_from_job_midi';
      } catch { diagnostics.arrangement_error = 'ARRANGEMENT_FAILED'; }
    }
    return reply({job_id: job, status: state.status, diagnostics});
  } catch (error) {
    const message = error instanceof Error && /^UPSTREAM_HTTP_\d+$/.test(error.message) ? error.message : 'DIAGNOSTICS_REQUEST_OR_RESPONSE_FAILED';
    return reply({error: message}, 502);
  }
});
