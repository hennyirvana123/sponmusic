import { useState } from 'react';
import { Instrument, instruments, setInstrument } from '@/lib/instruments';
import { prepareGuitar } from '@/lib/music';
import { toast } from 'sonner';
export default function InstrumentPicker(){
 const [value,setValue]=useState<Instrument|' '>(' ');const [loading,setLoading]=useState(false);
 const change=async(next:Instrument)=>{setLoading(true);try{if(next!=='lyre')await prepareGuitar(instruments[next].name);setInstrument(next);setValue(next);}catch{toast.error('Sampel gagal dimuat. Periksa internet dan coba lagi.');}finally{setLoading(false);}};
 return <label className="flex gap-2 items-center text-xs text-purple-200">{loading?'Memuat sampel…':'Instrumen'}<select disabled={loading} value={value} aria-label="Pilih instrumen" onChange={e=>{void change(e.target.value as Instrument);e.currentTarget.blur();}}><option value=" " disabled>Piano awal · pilih sampel</option>{Object.entries(instruments).map(([id,p])=><option key={id} value={id}>{p.name} · {id==='lyre'?'sintesis':'sample'}</option>)}</select></label>;
}
