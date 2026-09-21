import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function PianoFaithful() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{raw: Blob; cleaned: Blob} | null>(null);
  const controller = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    if (!file) return;
    const c = new AbortController(); controller.current = c;
    setBusy(true); setResult(null); setReport(null); setMessage('Mengirim eksperimen piano CPU…');
    const timer = setTimeout(() => c.abort(), 60 * 60 * 1000);
    try {
      if (file.size > 20_000_000) throw Error('Maksimal 20 MB dan 60 detik.');
      const request = async (path: string, init: RequestInit = {}) => {
        const response = await fetch('/api/piano-faithful/' + path, {...init, signal: c.signal});
        if (!response.ok) { const body = await response.json(); throw Error(body.message || `HTTP ${response.status}`); }
        return response;
      };
      const job = await (await request('submit', {method: 'POST', headers: {'Content-Type': /\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg'}, body: file})).json();
      if (!/^[a-f0-9]{32}$/.test(job.job_id)) throw Error('Invalid job ID');
      while (true) {
        const state = await (await request(job.job_id)).json(); setReport(state);
        if (state.status === 'failed') throw Error(`${state.error?.code}: ${state.error?.stage}`);
        if (state.status === 'completed') {
          const raw = await (await request(job.job_id + '/download/raw')).blob();
          const cleaned = await (await request(job.job_id + '/download/cleaned')).blob();
          setResult({raw, cleaned}); setMessage('MIDI tersedia. Kualitas belum dinilai; bandingkan dengan audio asli.'); break;
        }
        if (!['queued', 'processing'].includes(state.status)) throw Error('Invalid job status');
        setMessage(`Job ${job.job_id}: ${state.status}`);
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(wait); c.signal.removeEventListener('abort', cancel); reject(Error('Permintaan dihentikan')); };
          const wait = setTimeout(() => { c.signal.removeEventListener('abort', cancel); resolve(); }, 3000);
          c.signal.addEventListener('abort', cancel, {once: true}); if (c.signal.aborted) cancel();
        });
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Eksperimen gagal'); }
    finally { clearTimeout(timer); setBusy(false); }
  };
  const download = (variant: 'raw' | 'cleaned') => {
    if (!result) return;
    const url = URL.createObjectURL(result[variant]); const a = document.createElement('a');
    a.href = url; a.download = `piano-faithful-${variant}.mid`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="min-h-screen bg-violet-950 p-6 text-violet-50"><section className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-violet-700 bg-violet-900 p-6">
    <p className="text-sm text-violet-200">SPONMUSIC · Eksperimen A/B</p><h1 className="text-3xl font-semibold">Piano faithful · CPU AMT</h1>
    <p>Piano solo saja, 0,25–60 detik. Tanpa Demucs, pYIN, atau aransemen ulang. Basic Pitch production tidak diganti.</p>
    <input aria-label="Audio piano solo" className="block w-full rounded-xl border border-violet-500 p-3" type="file" accept=".mp3,.wav" disabled={busy} onChange={e => {setFile(e.target.files?.[0] || null); setResult(null);}} />
    <Button className="rounded-xl bg-violet-100 text-violet-950 hover:bg-white" disabled={!file || busy} onClick={() => void run()}>{busy ? 'Memproses…' : 'Jalankan piano faithful'}</Button>
    <p role="status" className="break-words">{message}</p>
    {report && <pre className="overflow-auto rounded-xl bg-violet-950 p-4 text-xs">{JSON.stringify(report, null, 2)}</pre>}
    {result && <div className="flex flex-wrap gap-3">
      <Button onClick={() => download('raw')}>Download raw MIDI</Button><Button onClick={() => download('cleaned')}>Download validated MIDI</Button>
      <Button onClick={() => navigate('/studio?mode=midi', {state: {midiFile: new File([result.cleaned], 'piano-faithful.mid', {type: 'audio/midi'}), aiResult: true}})}>Buka Piano Roll / Falling Notes</Button>
    </div>}
    <p className="text-sm text-violet-200">Cleanup hanya validasi: raw dan cleaned identik. Unduhan mempertahankan velocity/CC64 model. Playback Studio saat ini belum mereproduksi velocity dan pedal tersebut; jangan gunakan playback Studio sebagai satu-satunya penilaian fidelity.</p>
  </section></main>;
}
