import { useState } from 'react';
import { Note, isBlack, noteName, projectSteps } from '@/lib/music';
export default function PianoRoll({ notes, step, playing, length, erase, onChange, preview }: { notes: Note[]; step: number; playing: boolean; length: number; erase: boolean; onChange: (notes: Note[]) => void; preview: (p: number) => void }) {
  const [page,setPage]=useState(0);
  const pages=Math.ceil(projectSteps(notes)/64);
  const current=playing?Math.floor(step/64):Math.min(page,pages-1);
  const offset=current*64;
  const high=notes.reduce((v,n)=>Math.max(v,n.pitch),84);
  const low=notes.reduce((v,n)=>Math.min(v,n.pitch),48);
  const rows=Array.from({length:high-low+1},(_,i)=>high-i);
  return <><div className="flex items-center justify-between px-4 py-2 text-xs text-purple-200"><button disabled={playing||current===0} onClick={()=>setPage(current-1)}>← Sebelumnya</button><span>Bar {current*4+1}–{current*4+4} / {pages*4}</span><button disabled={playing||current>=pages-1} onClick={()=>setPage(current+1)}>Berikutnya →</button></div><div className="roll-scroll"><div className="roll-content">
    <div className="roll-ruler"><div className="ruler-label">BAR</div>{[1,2,3,4].map(b=><div className="bar-label" key={b}>{current*4+b}</div>)}</div>
    <div className="roll-body">{rows.map(p=><div className={`roll-row ${isBlack(p)?'dark-row':''}`} key={p}><button className="pitch-label" onClick={()=>preview(p)}>{noteName(p)}</button><div className="row-cells" onClick={e=>{if(erase)return;const r=e.currentTarget.getBoundingClientRect();const s=offset+Math.min(63,Math.floor((e.clientX-r.left)/r.width*64));onChange([...notes,{id:crypto.randomUUID(),pitch:p,step:s,length}]);preview(p);}}>
    {Array.from({length:16},(_,i)=><span className="beat-cell" key={i}/>)}
    {notes.filter(n=>n.pitch===p&&n.step<offset+64&&n.step+n.length>offset).map(n=>{const left=Math.max(n.step,offset);const right=Math.min(n.step+n.length,offset+64);return <button key={n.id} className="midi-note" title="Klik: hapus. Seret tepi kanan: durasi." style={{left:`${(left-offset)/64*100}%`,width:`${(right-left)/64*100}%`}} onClick={e=>{e.stopPropagation();onChange(notes.filter(v=>v.id!==n.id));}}><span>{noteName(p)}</span><i onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.stopPropagation();const x=e.clientX;const width=e.currentTarget.parentElement!.parentElement!.getBoundingClientRect().width;const el=e.currentTarget;el.setPointerCapture(e.pointerId);el.onpointermove=ev=>onChange(notes.map(v=>v.id===n.id?{...v,length:Math.max(.25,Math.min(65536-n.step,n.length+Math.round((ev.clientX-x)/width*64)))}:v));el.onpointerup=()=>{el.onpointermove=null;};}}/></button>;})}
    </div></div>)}{playing&&<div className="playhead" style={{left:`calc(52px + (100% - 52px) * ${(step-offset)/64})`}}/>}</div>
  </div></div></>;
}
