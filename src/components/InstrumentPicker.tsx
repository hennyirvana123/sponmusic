import { useState } from 'react';
import { Instrument, instruments, setInstrument } from '@/lib/instruments';
export default function InstrumentPicker() {
  const [value, setValue] = useState<Instrument>('piano');
  return <label className="flex items-center gap-2 text-xs text-purple-200"><span>Instrumen</span><select aria-label="Pilih instrumen" title="Suara sintesis instrumen" value={value} onChange={e=>{const next=e.target.value as Instrument;setValue(next);setInstrument(next);e.currentTarget.blur();}}>{Object.entries(instruments).map(([id,preset])=><option key={id} value={id}>{preset.name}</option>)}</select></label>;
}
