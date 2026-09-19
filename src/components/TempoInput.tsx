import { useEffect, useState } from 'react';

export default function TempoInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    const next = draft.trim() === '' || !Number.isFinite(parsed) ? value : Math.max(40, Math.min(240, parsed));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return <input aria-label="Tempo BPM" title="40–240 BPM. Tekan Enter untuk menerapkan." type="number" min={40} max={240} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onFocus={e => e.currentTarget.select()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); } }} />;
}
