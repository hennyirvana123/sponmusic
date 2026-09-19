import { useEffect, useRef, useState } from 'react';
import { Project, Note, projectSteps, noteName } from '@/lib/music';
import { listenLive, setKeyboardOctave } from '@/lib/live';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export default function StudioExtras({project,onProject,step,onSeek,onStop}:{project:Project;onProject:(p:Project)=>void;step:number;onSeek:(s:number)=>void;onStop:()=>void}) {
 const [semitones,setSemitones]=useState(0);const [record,setRecord]=useState(false);const [takes,setTakes]=useState<Project[]>([]);
 const pending=useRef(new Map<number,number>());const notes=useRef<Note[]>([]);const started=useRef(0);const tempo=useRef(120);
 useEffect(()=>listenLive(e=>{if(!started.current)return;const pos=(e.time-started.current)*tempo.current/15000;if(e.on)pending.current.set(e.pitch,pos);else{const s=pending.current.get(e.pitch);if(s!==undefined){notes.current.push({id:crypto.randomUUID(),pitch:e.pitch,step:s,length:Math.max(.1,pos-s)});pending.current.delete(e.pitch);}}}),[]);
 const finish=()=>{const pos=(performance.now()-started.current)*tempo.current/15000;pending.current.forEach((s,pitch)=>notes.current.push({id:crypto.randomUUID(),pitch,step:s,length:Math.max(.1,pos-s)}));pending.current.clear();started.current=0;setRecord(false);if(notes.current.length)setTakes(t=>[...t,{name:`Take ${t.length+1}`,bpm:tempo.current,notes:[...notes.current]}]);};
 useEffect(()=>{if(!record)return;const timer=setTimeout(finish,300000);return()=>clearTimeout(timer);},[record]);
 const transpose=(delta:number)=>{if(project.notes.some(n=>n.pitch+delta<0||n.pitch+delta>127)){toast.error('Nada melewati rentang MIDI.');return;}onStop();onProject({...project,notes:project.notes.map(n=>({...n,pitch:n.pitch+delta})),transpose:(project.transpose??12)+delta});};
 return <section className="panel my-4 p-4 space-y-3">
 <div className="flex flex-wrap gap-4 items-center text-xs">
 <label>Transpose keyboard <select value={semitones} disabled={record} onChange={e=>{const n=Number(e.target.value);setSemitones(n);setKeyboardOctave(n/12);}}>{Array.from({length:49},(_,i)=>i-24).map(n=><option key={n} value={n}>{n>0?'+':''}{n} semitone · Z = {noteName(48+n)}</option>)}</select></label>
 <span>MIDI / proyek</span><Button className="soft-button" disabled={record} onClick={()=>transpose(-1)}>− 1 semitone</Button><Button className="soft-button" disabled={record} onClick={()=>transpose(1)}>+ 1 semitone</Button><Button className="soft-button" disabled={record} onClick={()=>transpose(-(project.transpose??12))}>Reset nada asli MIDI</Button>
 </div><p className="text-xs text-purple-300">1 semitone = C → C♯. Untuk C → D, naikkan +2 semitone. Semua nada bergeser bersama, jarak antar nada tetap.</p>
 <label className="flex items-center gap-3 text-xs">Posisi <input className="flex-1" type="range" min={0} max={projectSteps(project.notes)-1} value={step} onChange={e=>onSeek(Number(e.target.value))}/>Bar {Math.floor(step/16)+1}</label><div className="flex flex-wrap items-center gap-2"><Button className="primary-button" onClick={()=>{if(record){finish();return;}onStop();notes.current=[];pending.current.clear();tempo.current=project.bpm;started.current=performance.now();setRecord(true);}}>{record?'Stop rekam not':'Rekam keyboard → take'}</Button><span className="text-xs text-purple-300">Maks. 5 menit. Take tidak menimpa melodi.</span>{takes.map((t,i)=><Button key={i} className="soft-button" onClick={()=>{onStop();const offset=projectSteps(project.notes);onProject({...project,notes:[...project.notes,...t.notes.map(n=>({...n,id:crypto.randomUUID(),step:offset+n.step*project.bpm/t.bpm,length:n.length*project.bpm/t.bpm}))]});setTakes(v=>v.filter((_,j)=>j!==i));}}>Tambahkan {t.name}</Button>)}</div></section>;
}
