import { pianoArrangement } from './piano-arrangement';
export class ModelError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function modelUrl(): string { return (process.env.BASIC_PITCH_URL || '').trim(); }
function endpoint(): URL {
  try {
    const url = new URL(modelUrl());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error();
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/transcribe') ? path : `${path}/transcribe`;
    return url;
  } catch { throw new ModelError(503,'MODEL_CONFIG_INVALID','URL Basic Pitch tidak valid. Isi URL Render atau URL lengkap /transcribe.'); }
}
export async function transcribe(audio: Uint8Array, mime: string, signal: AbortSignal): Promise<{midi:Uint8Array;bpm?:number}> {
  const url = endpoint();
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(audio)], {type:mime}), mime==='audio/wav'?'audio.wav':'audio.mp3');
  form.append('task','transcription');
  let response: Response;
  try { response = await fetch(url, {method:'POST', body:form, signal, redirect:'error'}); }
  catch(e) { if(signal.aborted)throw e;throw new ModelError(502,'MODEL_UNREACHABLE','Service Basic Pitch tidak dapat dijangkau. Periksa URL dan status deployment Render.'); }
  if (!response.ok) {
    await response.body?.cancel();
    if([429,503].includes(response.status))throw new ModelError(503,'MODEL_BUSY','Basic Pitch sedang sibuk atau model belum siap. Tunggu lalu coba lagi.');
    if(response.status===413)throw new ModelError(413,'MODEL_AUDIO_LIMIT','Basic Pitch menolak ukuran/durasi audio. Maksimal 20 MB dan 60 detik.');
    if(response.status===415)throw new ModelError(415,'MODEL_DECODE_FAILED','Basic Pitch tidak dapat membaca audio. Gunakan MP3/WAV yang valid.');
    if(response.status===422)throw new ModelError(422,'MODEL_NO_NOTES','Audio terlalu pendek, tidak valid, senyap, atau tidak menghasilkan not.');
    if([408,504].includes(response.status))throw new ModelError(504,'MODEL_TIMEOUT','Pemrosesan Basic Pitch melewati batas waktu. Coba audio lebih pendek.');
    throw new ModelError(502,'MODEL_HTTP_ERROR',`Service Basic Pitch mengembalikan HTTP ${response.status}. Periksa endpoint /transcribe dan log service.`);
  }
  if(response.status===202){
    const job=await response.json();if(!/^[a-f0-9]{32}$/.test(job.job_id))throw new ModelError(502,'MODEL_JOB_INVALID','Job model tidak valid.');
    const jobUrl=new URL(url);jobUrl.pathname+='/'+job.job_id;
    while(true){
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      const statusResponse=await fetch(jobUrl,{signal,redirect:'error'});
      if(!statusResponse.ok)throw new ModelError(statusResponse.status,'MODEL_JOB_ERROR',`Status job HTTP ${statusResponse.status}`);
      const state=await statusResponse.json();
      if(state.status==='failed')throw new ModelError(422,'MODEL_JOB_FAILED',typeof state.error==='string'?state.error:'Transkripsi gagal');
      if(state.status==='completed'){const downloadUrl=new URL(jobUrl);downloadUrl.pathname+='/download';response=await fetch(downloadUrl,{signal,redirect:'error'});if(!response.ok)throw new ModelError(502,'MODEL_DOWNLOAD_FAILED',`Download HTTP ${response.status}`);break;}
      if(!['queued','processing'].includes(state.status))throw new ModelError(502,'MODEL_JOB_INVALID','Status model tidak valid');
      await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},3000);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
    }
  }
  if (!response.body) throw new ModelError(502,'MODEL_INVALID_MIDI','Model tidak mengembalikan MIDI.');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new ModelError(502,'MODEL_MIDI_TOO_LARGE','Hasil MIDI melebihi 2 MB.');chunks.push(value);}}
  catch(e){if(e instanceof ModelError||signal.aborted)throw e;throw new ModelError(502,'MODEL_RESPONSE_INTERRUPTED','Transfer MIDI dari Basic Pitch terputus. Coba lagi.');}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(new TextDecoder().decode(bytes.slice(0,4))!=='MThd')throw new ModelError(502,'MODEL_INVALID_MIDI','Respons Basic Pitch bukan file MIDI yang valid.');
  const bpm=Number(response.headers.get('x-estimated-bpm'));
  return {midi:bytes,bpm:Number.isFinite(bpm)&&bpm>=40&&bpm<=240?bpm:undefined};
}
export async function arrange(audio:Uint8Array,mime:string,signal:AbortSignal):Promise<Uint8Array>{
 const result=await transcribe(audio,mime,signal);
 try{const { pianoArrangement }=await import('./piano-arrangement');return pianoArrangement(result.midi,result.bpm);}
 catch{throw new ModelError(502,'MODEL_INVALID_MIDI','MIDI tidak valid atau aransemen gagal. Tidak ada fallback.');}
}
