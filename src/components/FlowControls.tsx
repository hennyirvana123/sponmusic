import { useState } from 'react';
import { setKeyboardOctave } from '@/lib/live';
export default function FlowControls(){const [transpose,setTranspose]=useState(0);return <div className="panel my-4 p-4 text-xs text-purple-200"><label>Transpose keyboard <select value={transpose} onChange={e=>{const n=Number(e.target.value);setTranspose(n);setKeyboardOctave(n/12);}}>{Array.from({length:49},(_,i)=>i-24).map(n=><option key={n} value={n}>{n>0?'+':''}{n} semitone</option>)}</select></label><p className="mt-2">Flow Play · Main langsung, pilih instrumen, dan rekam video not turun.</p></div>;}
