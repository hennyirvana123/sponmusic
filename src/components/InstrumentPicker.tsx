import { useState } from 'react';
import { Instrument, instruments, setInstrument } from '@/lib/instruments';
import { prepareGuitar } from '@/lib/music';
import { toast } from 'sonner';
export default function InstrumentPicker() {
  const [value, setValue] = useState<Instrument>('piano');
  const [loading, setLoading] = useState(false);
  const change = async (next: Instrument) => {
    setLoading(true);
    try {
      if (next === 'guitar') await prepareGuitar();
      setValue(next); setInstrument(next);
    } catch { toast.error('Sampel gitar gagal dimuat. Periksa internet lalu pilih Guitar lagi.'); }
    finally { setLoading(false); }
  };
  return <label className="flex flex-wrap items-center gap-2 text-xs text-purple-200"><span>{loading ? 'Memuat sampel gitar…' : 'Instrumen'}</span><select aria-label="Pilih instrumen" disabled={loading} value={value} onChange={e=>{void change(e.target.value as Instrument);e.currentTarget.blur();}}>{Object.entries(instruments).map(([id,preset])=><option key={id} value={id}>{id==='guitar'?'Guitar · Nylon (sample)':preset.name}</option>)}</select>{value==='guitar'&&<small>Sampel MusyngKite</small>}</label>;
}
