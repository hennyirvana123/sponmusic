import { defineHandler } from 'nitro';
import pkg from '@tonejs/midi';
import { diagnosticModelUrl } from '../../../../utils/dev-diagnostic-connection';
import { pianoArrangement } from '../../../../utils/piano-arrangement';
import { arrangementDiagnostic } from '../../../../utils/arrangement-diagnostic';
const { Midi } = pkg;
type N={midi:number;time:number;duration:number};
function metrics(notes:N[],end:number){
 const sorted=[...notes].sort((a,b)=>a.time-b.time||a.midi-b.midi);
 // A deterministic upper-onset proxy, not ground-truth melody, for polyphonic input.
 const groups=new Map<number,N>();for(const n of sorted){const k=Math.round(n.time/.03);const prev=groups.get(k);if(!prev||n.midi>prev.midi)groups.set(k,n);}
 const line=[...groups.values()].sort((a,b)=>a.time-b.time);const intervals=line.slice(1).map((n,i)=>Math.abs(n.midi-line[i].midi));
 let cursor=0,rests=0,restSeconds=0;for(const n of sorted){if(n.time-cursor>=.15){rests++;restSeconds+=n.time-cursor;}cursor=Math.max(cursor,n.time+n.duration);}if(end-cursor>=.15){rests++;restSeconds+=end-cursor;}
 const octaves:Record<string,number>={};for(const n of notes){const o=String(Math.floor(n.midi/12)-1);octaves[o]=(octaves[o]||0)+1;}
 return {total:notes.length,min:notes.length?Math.min(...notes.map(n=>n.midi)):null,max:notes.length?Math.max(...notes.map(n=>n.midi)):null,octaves,intervals9:intervals.filter(i=>i>=9).length,intervals12:intervals.filter(i=>i>=12).length,intervalCount:intervals.length,octaveSwitches:line.slice(1).filter((n,i)=>Math.floor(n.midi/12)!==Math.floor(line[i].midi/12)).length,rests,restSeconds,averageInterval:intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:0,onsetProxyNotes:line.length};
}
export default defineHandler(async event=>{
 if(!import.meta.dev)return new Response(null,{status:404});
 const id=new URL(event.req.url).pathname.split('/').pop()||'';if(!/^[a-f0-9]{32}$/.test(id))return Response.json({message:'Job invalid'},{status:400});
 try{const base=diagnosticModelUrl();base.pathname+=`/${id}/download`;
 const response=await fetch(base,{redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok){
 let detail='(body kosong)';
 if(response.body){const reader=response.body.getReader();const decoder=new TextDecoder();let received=0;let text='';try{while(received<8000){const {done,value}=await reader.read();if(done)break;const part=value.slice(0,8000-received);received+=part.length;text+=decoder.decode(part,{stream:true});}text+=decoder.decode();detail=text||detail;}finally{await reader.cancel().catch(()=>{});}}
 return Response.json({message:'Basic Pitch download gagal',stage:'download-transcription',endpoint:base.pathname,upstreamStatus:response.status,detail},{status:response.status,headers:{'Cache-Control':'no-store'}});
 }
 if(!response.body)throw Error('Empty MIDI');const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error('MIDI exceeds 2 MB');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const raw=new Midi(bytes);const notes=raw.tracks.flatMap(t=>t.notes);if(notes.length>30000)throw Error('Too many notes');const transcription=metrics(notes,raw.duration);
 const bpm=Number(response.headers.get('x-estimated-bpm'));const final=new Midi(pianoArrangement(bytes,Number.isFinite(bpm)&&bpm>=40&&bpm<=240?bpm:undefined));const melody=final.tracks.find(t=>t.name==='Melody · right hand');if(!melody)throw Error('Melody track missing');const result=metrics(melody.notes,raw.duration);
 if(new URL(event.req.url).searchParams.get('detail')==='1')return Response.json(arrangementDiagnostic(bytes,final.toArray()),{headers:{'Cache-Control':'no-store'}});
 const rate=(m:typeof result)=>m.intervals9/Math.max(1,m.intervalCount);const findings:string[]=[];
 if(transcription.intervals9>0)findings.push('TRANSCRIPTION PROBLEM');
 if(rate(transcription)<.1&&rate(result)>rate(transcription)+.1)findings.push('MELODY EXTRACTION PROBLEM');
 if(result.total<transcription.onsetProxyNotes*.4)findings.push('MELODY CANDIDATE/FILTERING PROBLEM');
 if(!findings.length)findings.push('NEEDS AUDIO/PITCH ANALYSIS');
 return Response.json({transcription,melody:result,findings,tracks:final.tracks.map(t=>({name:t.name,notes:t.notes.length})),warning:'Heuristic flags, not proven root cause. Transcription intervals use highest pitch per 30 ms onset bin. Polyphony can create apparent jumps. Silence >=150 ms is a REST proxy, not proof of missing melody. Octave switches mean crossing MIDI octave boundaries. Note loss uses onset proxy, not total polyphonic count. Raw pre-postprocessing MIDI is not available.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({message:e instanceof Error?e.message:'Diagnostic failed'},{status:502});}
});
