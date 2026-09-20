import { defineHandler } from 'nitro';
import { modelUrl } from '../../../../utils/piano-model';
const error=(status:number,message:string)=>Response.json({message,code:`HTTP_${status}`},{status,headers:{'Cache-Control':'no-store'}});
async function bytes(response:Response,limit:number){if(!response.body)throw Error('Empty response');const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Response too large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;}
export default defineHandler(async event=>{
 const req=event.req;const path=new URL(req.url).pathname.split('/api/piano/jobs/')[1]||'';
 if(!/^(submit|[a-f0-9]{32}(\/download)?)$/.test(path))return error(400,'Job tidak valid');
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return error(403,'Origin tidak diizinkan');
 if(!modelUrl())return error(503,'Model belum dikonfigurasi');
 let base:URL;try{base=new URL(modelUrl());if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error();base.pathname=base.pathname.replace(/\/+$/,'').replace(/\/transcribe$/,'')+'/transcribe';}catch{return error(503,'Konfigurasi URL Basic Pitch tidak valid');}
 const submit=path==='submit';if(req.method!==(submit?'POST':'GET'))return error(405,'Metode tidak diizinkan');
 const timeout=AbortSignal.timeout(45000);
 try{
 let body:FormData|undefined;
 if(submit){
 if(!req.body)return error(400,'Audio belum dikirim');
 const mime=req.headers.get('content-type')?.split(';')[0]||'';if(!['audio/mpeg','audio/wav'].includes(mime))return error(415,'Gunakan MP3/WAV');
 const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000000)return error(413,'Maksimal 20 MB');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 if(!size)return error(400,'Audio kosong');
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 body=new FormData();body.append('audio',new Blob([data],{type:mime}),mime==='audio/wav'?'audio.wav':'audio.mp3');body.append('task','transcription');
 }
 if(!submit)base.pathname+='/'+path;
 const response=await fetch(base,{method:submit?'POST':'GET',body,redirect:'error',signal:timeout});
 if(!response.ok){let detail=`Basic Pitch HTTP ${response.status}`;try{const e=JSON.parse(new TextDecoder().decode(await bytes(response,16384)));if(typeof e.detail==='string')detail=e.detail.slice(0,1000);else if(typeof e.message==='string')detail=e.message.slice(0,1000);}catch{}return error(response.status,detail);}
 if(path.endsWith('/download')){
 const data=await bytes(response,2000000);if(new TextDecoder().decode(data.slice(0,4))!=='MThd')return error(502,'Respons Basic Pitch bukan MIDI');
 const bpm=Number(response.headers.get('x-estimated-bpm'));let midi:Uint8Array;
 try{const { pianoArrangement } = await import('../../../../utils/piano-arrangement');midi=pianoArrangement(data,Number.isFinite(bpm)&&bpm>=40&&bpm<=240?bpm:undefined);}catch(e){if(import.meta.dev){console.error('[piano jobs: arrangement import/execution]',e);return error(502,`Arrangement module/execution: ${e instanceof Error?e.message:String(e)}`);}return error(502,'MIDI tidak valid atau tahap aransemen gagal');}
 return new Response(new Uint8Array(midi),{headers:{'Content-Type':'audio/midi','Content-Disposition':'attachment; filename="piano-arrangement.mid"','Cache-Control':'no-store'}});
 }
 const data=JSON.parse(new TextDecoder().decode(await bytes(response,16384)));
 if(!/^[a-f0-9]{32}$/.test(data.job_id)||!['queued','processing','completed','failed'].includes(data.status)||(!submit&&data.job_id!==path))return error(502,'Respons job Basic Pitch tidak valid');
 return Response.json({job_id:data.job_id,status:data.status,error:typeof data.error==='string'?data.error.slice(0,1000):undefined,download_url:data.status==='completed'?`/api/piano/jobs/${data.job_id}/download`:undefined},{status:submit?202:200,headers:{'Cache-Control':'no-store'}});
 }catch{return timeout.aborted?error(504,'Koneksi Basic Pitch timeout; job mungkin masih berjalan'):error(502,'Koneksi Basic Pitch terputus atau respons tidak valid');}
});
