import { useRuntimeConfig } from 'nitro';
import { pianoArrangement } from './piano-arrangement';
export class ModelError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function modelUrl(): string { return String(useRuntimeConfig().pianoModelUrl || '').trim(); }
function endpoint(): URL {
  try {
    const url = new URL(modelUrl());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error();
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/transcribe') ? path : `${path}/transcribe`;
    return url;
  } catch { throw new ModelError(503,'MODEL_CONFIG_INVALID','URL Basic Pitch tidak valid. Isi URL Render atau URL lengkap /transcribe.'); }
}
export async function arrange(audio: Uint8Array, mime: string, signal: AbortSignal): Promise<Uint8Array> {
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
  if (!response.body) throw new ModelError(502,'MODEL_INVALID_MIDI','Model tidak mengembalikan MIDI.');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new ModelError(502,'MODEL_MIDI_TOO_LARGE','Hasil MIDI melebihi 2 MB.');chunks.push(value);}}
  catch(e){if(e instanceof ModelError||signal.aborted)throw e;throw new ModelError(502,'MODEL_RESPONSE_INTERRUPTED','Transfer MIDI dari Basic Pitch terputus. Coba lagi.');}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(new TextDecoder().decode(bytes.slice(0,4))!=='MThd')throw new ModelError(502,'MODEL_INVALID_MIDI','Respons Basic Pitch bukan file MIDI yang valid.');
  const bpm=Number(response.headers.get('x-estimated-bpm'));
  try{return pianoArrangement(bytes,Number.isFinite(bpm)&&bpm>=40&&bpm<=240?bpm:undefined);}
  catch{throw new ModelError(502,'MODEL_INVALID_MIDI','MIDI transkripsi rusak, tidak berisi not, atau melebihi batas aransemen. Tidak ada MIDI pengganti yang dibuat.');}
}
