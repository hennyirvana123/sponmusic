import { defineHandler } from 'nitro';
import { modelUrl } from '../../../../utils/piano-model';
import { pianoArrangement } from '../../../../utils/piano-arrangement';
export default defineHandler(async event=>{
 const req=event.req;const path=new URL(req.url).pathname.split('/api/piano/jobs/')[1]||'';
 if(!/^(submit|[a-f0-9]{32}(\/download)?)$/.test(path))return Response.json({message:'Job tidak valid'},{status:400});
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({message:'Origin tidak diizinkan'},{status:403});
 if(!modelUrl())return Response.json({message:'Model belum dikonfigurasi'},{status:503});
 const base=modelUrl().replace(/\/+$/,'').replace(/\/transcribe$/,'');
 const submit=path==='submit';if(req.method!==(submit?'POST':'GET'))return new Response(null,{status:405});
 try{
 let body:FormData|undefined;
 if(submit){
 if(!req.body)return new Response(null,{status:400});const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000000)return Response.json({message:'Maksimal 20 MB'},{status:413});chunks.push(value);}}finally{await reader.cancel();}
 const mime=req.headers.get('content-type')||'';if(!['audio/mpeg','audio/wav'].includes(mime))return new Response(null,{status:415});
 body=new FormData();body.append('audio',new Blob(chunks as BlobPart[],{type:mime}),mime==='audio/wav'?'audio.wav':'audio.mp3');body.append('task','transcription');
 }
 const response=await fetch(`${base}/transcribe${submit?'':'/'+path}`,{method:submit?'POST':'GET',body,redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok){let detail='Basic Pitch HTTP '+response.status;try{const e=await response.json();if(typeof e.detail==='string')detail=e.detail;}catch{}return Response.json({message:detail},{status:response.status});}
 if(path.endsWith('/download')){
 const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error('MIDI terlalu besar');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}
 const bpm=Number(response.headers.get('x-estimated-bpm'));const midi=pianoArrangement(bytes,Number.isFinite(bpm)&&bpm>=40&&bpm<=240?bpm:undefined);
 return new Response(new Uint8Array(midi),{headers:{'Content-Type':'audio/midi','Content-Disposition':'attachment; filename="piano-arrangement.mid"','Cache-Control':'no-store'}});
 }
 const data=await response.json();if(!/^[a-f0-9]{32}$/.test(data.job_id)||!['queued','processing','completed','failed'].includes(data.status))throw Error('Respons job tidak valid');
 return Response.json({job_id:data.job_id,status:data.status,error:data.error,download_url:data.status==='completed'?`/api/piano/jobs/${data.job_id}/download`:undefined},{status:submit?202:200,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({message:'Koneksi model timeout, respons tidak valid, atau MIDI gagal diproses. Coba polling kembali.'},{status:502});}
});
