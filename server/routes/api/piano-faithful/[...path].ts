import { defineHandler } from 'nitro';

class BodyLimitError extends Error {}

export default defineHandler(async event => {
  const req = event.req;
  const path = new URL(req.url).pathname.split('/api/piano-faithful/')[1] || '';
  const error = (status: number, message: string) => Response.json({message}, {status, headers: {'Cache-Control': 'no-store'}});
  const canonical = /^transcribe(?:\/[a-f0-9]{32}(?:\/download\/(?:raw|cleaned))?)?$/.test(path);
  const legacy = /^(submit|[a-f0-9]{32}(\/download\/(raw|cleaned))?)$/.test(path);
  if (!canonical && !legacy) return error(400, 'Invalid experiment path');
  const submit = path === 'submit' || path === 'transcribe';
  if (req.method !== (submit ? 'POST' : 'GET')) return error(405, 'Method not allowed');
  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return error(403, 'Origin not allowed');
  let base: URL;
  try {
    base = new URL(process.env.PIANO_FAITHFUL_URL || '');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error();
    const upstreamPath = canonical ? path : 'transcribe' + (submit ? '' : '/' + path);
    base.pathname = base.pathname.replace(/\/+$/, '') + '/' + upstreamPath;
  } catch { return error(503, 'PIANO_FAITHFUL_URL belum dikonfigurasi untuk service eksperimen.'); }
  async function read(body: ReadableStream<Uint8Array> | null, limit: number) {
    if (!body) throw Error('Empty body');
    const reader = body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    try { while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new BodyLimitError(); parts.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const data = new Uint8Array(size); let offset = 0;
    for (const part of parts) { data.set(part, offset); offset += part.length; }
    return data;
  }
  const timeout = AbortSignal.timeout(45000);
  let readingUpload = false;
  try {
    let body: FormData | Uint8Array | undefined;
    const headers = new Headers();
    if (submit) {
      if (!req.body) return error(400, 'Audio belum dikirim');
      const contentType = req.headers.get('content-type') || '';
      const mime = contentType.split(';')[0].trim().toLowerCase();
      const multipart = mime === 'multipart/form-data';
      if (canonical && !multipart) return error(415, 'Gunakan multipart/form-data dengan field audio');
      if (!multipart && !['audio/mpeg', 'audio/wav'].includes(mime)) return error(415, 'Expected MP3/WAV');
      if (multipart && !/;\s*boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType)) return error(400, 'Multipart boundary wajib tersedia');
      // Allow multipart envelope overhead; the service enforces the 20 MB file limit.
      const limit = multipart ? 21_000_000 : 20_000_000;
      if (Number(req.headers.get('content-length')) > limit) return error(413, 'Upload melebihi batas ukuran');
      readingUpload = true;
      const data = await read(req.body, limit);
      readingUpload = false;
      if (!data.length) return error(400, 'Audio kosong');
      if (multipart) {
        // Preserve bytes and boundary together, including audio and task fields.
        body = data;
        headers.set('Content-Type', contentType);
      } else {
        body = new FormData();
        body.append('audio', new Blob([data], {type: mime}), mime === 'audio/wav' ? 'audio.wav' : 'audio.mp3');
        body.append('task', 'piano_faithful');
      }
    }
    const response = await fetch(base, {method: submit ? 'POST' : 'GET', headers, body, redirect: 'error', signal: timeout});
    const download = path.includes('/download/');
    const data = await read(response.body, download && response.ok ? 2_000_000 : 65536);
    if (!response.ok) return error(response.status, `Piano AMT HTTP ${response.status}; lihat status job/log service eksperimen.`);
    if (download) {
      if (new TextDecoder().decode(data.slice(0, 4)) !== 'MThd') return error(502, 'Invalid MIDI');
      const variant = path.endsWith('/raw') ? 'raw' : 'cleaned';
      return new Response(data, {headers: {'Content-Type': 'audio/midi', 'Content-Disposition': `attachment; filename="piano-faithful-${variant}.mid"`, 'Cache-Control': 'no-store'}});
    }
    return Response.json(JSON.parse(new TextDecoder().decode(data)), {status: response.status, headers: {'Cache-Control': 'no-store'}});
  } catch (e) {
    if (e instanceof BodyLimitError && readingUpload) return error(413, 'Upload melebihi batas ukuran');
    if (timeout.aborted) return error(504, 'Koneksi service eksperimen timeout; job mungkin masih berjalan.');
    return error(502, 'Eksperimen tidak dapat dijangkau atau respons tidak valid; tidak ada fallback.');
  }
});
