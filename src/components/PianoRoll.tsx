import { useRef, useEffect } from 'react';
import { Note, isBlack, noteName } from '@/lib/music';

export default function PianoRoll({ notes, step, playing, length, erase, onChange, preview }: { notes: Note[]; step: number; playing: boolean; length: number; erase: boolean; onChange: (notes: Note[]) => void; preview: (p: number) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const rows = Array.from({length: 45}, (_, i) => 92 - i);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 19 * 22; }, []);
  return <div className="roll-scroll" ref={scroll}><div className="roll-content">
    <div className="roll-ruler"><div className="ruler-label">BAR</div>{[1,2,3,4].map(b => <div className="bar-label" key={b}><b>{String(b).padStart(2,'0')}</b><span>2</span><span>3</span><span>4</span></div>)}</div>
    <div className="roll-body">
      {rows.map(p => <div className={`roll-row ${isBlack(p) ? 'dark-row' : ''}`} key={p}><button className="pitch-label" onClick={() => preview(p)}>{noteName(p)}</button><div className="row-cells" onClick={e => { if (erase) return; const r = e.currentTarget.getBoundingClientRect(); const s = Math.min(63, Math.floor((e.clientX-r.left)/r.width*64)); if (!notes.some(n => n.pitch === p && n.step === s)) { onChange([...notes, {id: crypto.randomUUID(), pitch:p, step:s, length:Math.min(length,64-s)}]); preview(p); } }}>
        {Array.from({length:16},(_,i) => <span className="beat-cell" key={i}/>)}
        {notes.filter(n => n.pitch === p).map(n => <button aria-label={`${noteName(p)}, langkah ${n.step+1}, durasi ${n.length}. Klik untuk menghapus`} title="Klik: hapus · Seret tepi kanan: ubah durasi" key={n.id} className="midi-note" style={{left:`${n.step/64*100}%`,width:`${n.length/64*100}%`}} onClick={e => {e.stopPropagation(); onChange(notes.filter(v => v.id !== n.id));}}><span>{noteName(p)}</span><i onClick={e => e.stopPropagation()} onPointerDown={e => {e.stopPropagation(); const startX=e.clientX; const width=e.currentTarget.parentElement!.parentElement!.getBoundingClientRect().width; const el=e.currentTarget; el.setPointerCapture(e.pointerId); el.onpointermove = ev => { const next=Math.max(1,Math.min(64-n.step,n.length+Math.round((ev.clientX-startX)/width*64))); onChange(notes.map(v => v.id===n.id ? {...v,length:next} : v)); }; el.onpointerup=() => {el.onpointermove=null;}; }}/></button>)}
      </div></div>)}
      {playing && <div className="playhead" style={{left:`calc(52px + (100% - 52px) * ${step/64})`}}/>}
    </div>
  </div></div>;
}
