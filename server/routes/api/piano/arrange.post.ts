import { defineHandler } from 'nitro';
import { arrange, modelUrl } from '../../../utils/piano-model';
const json=(status:number,message:string,code:string)=>Response.json({message,code},{status});
let busy=false;
export default defineHandler(async event=>{
 const req=event.req;
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json(403,'Origin tidak diizinkan.','ORIGIN');
 if(busy)return json(429,'Server sedang memproses audio. Coba lagi nanti.','BUSY');
 if(!req.body)return json(400,'Audio belum dipilih.','NO_AUDIO');
 if(Number(req.headers.get('content-length')||0)>20_000_000)return json(413,'Audio maksimal 20 MB.','SIZE');
 const mime=req.headers.get('content-type')?.split(';')[0];
 if(!['audio/mpeg','audio/wav','audio/x-wav'].includes(mime||''))return json(415,'Gunakan MP3 atau WAV.','FORMAT');
 busy=true;
 try {
 const reader=req.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20_000_000)return json(413,'Audio maksimal 20 MB.','SIZE');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const text=new TextDecoder();const wav=text.decode(bytes.slice(0,4))==='RIFF'&&text.decode(bytes.slice(8,12))==='WAVE';
 const mp3=text.decode(bytes.slice(0,3))==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);
 if(!size||!(wav||mp3))return json(415,'Isi file tidak dikenali sebagai MP3/WAV.','INVALID_AUDIO');
 if(!modelUrl())return json(503,'Audio valid. Model AI belum terhubung; tidak ada MIDI yang dihasilkan.','MODEL_NOT_CONFIGURED');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);const abort=()=>controller.abort();req.signal.addEventListener('abort',abort,{once:true});
 try{const midi=await arrange(bytes,wav?'audio/wav':'audio/mpeg',controller.signal);return new Response(new Uint8Array(midi),{headers:{'Content-Type':'audio/midi','Content-Disposition':'attachment; filename="piano-arrangement.mid"','Cache-Control':'no-store'}});}catch{return json(502,'Model gagal atau melewati batas waktu 2 menit. Tidak ada hasil palsu yang dibuat.','MODEL_FAILED');}finally{clearTimeout(timer);req.signal.removeEventListener('abort',abort);}
 }finally{busy=false;}
});
