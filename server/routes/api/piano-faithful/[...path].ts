import { defineHandler } from 'nitro';

export default defineHandler(async event => {
  const req = event.req;
  const path = new URL(req.url).pathname.split('/api/piano-faithful/')[1] || '';
  const error = (status: number, message: string) => Response.json({message}, {status});
  if (!/^(submit|[a-f0-9]{32}(\/download\/(raw|cleaned))?)$/.test(path)) return error(400, 'Invalid experiment path');
  const submit = path === 'submit';
  if (req.method !== (submit ? 'POST' : 'GET')) return error(405, 'Method not allowed');
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return error(403, 'Origin not allowed');
  let base: URL;
  try {
    base = new URL(process.env.PIANO_FAITHFUL_URL || '');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error();
    base.pathname = base.pathname.replace(/\/+$/, '') + '/transcribe' + (submit ? '' : '/' + path);
  } catch { return error(503, 'PIANO_FAITHFUL_URL belum dikonfigurasi untuk service eksperimen.'); }
  async function read(body: ReadableStream<Uint8Array> | null, limit: number) {
    if (!body) throw Error('Empty body');
    const reader = body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > limit) throw Error('Body exceeds size limit'); parts.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const data = new Uint8Array(size); let offset = 0;
    for (const part of parts) { data.set(part, offset); offset += part.length; }
    return data;
  }
  try {
    let body: FormData | undefined;
    if (submit) {
      const mime = req.headers.get('content-type')?.split(';')[0];
      if (!['audio/mpeg', 'audio/wav'].includes(mime || '')) return error(415, 'Expected MP3/WAV');
      if (Number(req.headers.get('content-length')) > 20_000_000) return error(413, 'Maximum 20 MB');
      const data = await read(req.body, 20_000_000);
      body = new FormData();
      body.append('audio', new Blob([data], {type: mime}), mime === 'audio/wav' ? 'audio.wav' : 'audio.mp3');
      body.append('task', 'piano_faithful');
    }
    const response = await fetch(base, {method: submit ? 'POST' : 'GET', body, redirect: 'error', signal: AbortSignal.timeout(45000)});
    const download = path.includes('/download/');
    const data = await read(response.body, download && response.ok ? 2_000_000 : 65536);
    if (!response.ok) return error(response.status, `Piano AMT HTTP ${response.status}; lihat status job/log service eksperimen.`);
    if (download) {
      if (new TextDecoder().decode(data.slice(0, 4)) !== 'MThd') return error(502, 'Invalid MIDI');
      return new Response(data, {headers: {'Content-Type': 'audio/midi', 'Cache-Control': 'no-store'}});
    }
    return Response.json(JSON.parse(new TextDecoder().decode(data)), {status: response.status, headers: {'Cache-Control': 'no-store'}});
  } catch { return error(502, 'Eksperimen tidak dapat dijangkau atau respons tidak valid; tidak ada fallback.'); }
});
