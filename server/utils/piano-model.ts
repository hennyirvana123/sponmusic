import { useRuntimeConfig } from 'nitro';
import { pianoArrangement } from './piano-arrangement';
export function modelUrl(): string { return String(useRuntimeConfig().pianoModelUrl || ''); }
export async function arrange(audio: Uint8Array, mime: string, signal: AbortSignal): Promise<Uint8Array> {
  const url = new URL(modelUrl());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Konfigurasi URL model tidak valid.');
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(audio)], {type:mime}), mime==='audio/wav'?'audio.wav':'audio.mp3');
  form.append('task','transcription');
  const response = await fetch(url, {method:'POST', body:form, signal, redirect:'error'});
  if (!response.ok) throw new Error('Model menolak pemrosesan audio.');
  if (!response.body) throw new Error('Model tidak mengembalikan MIDI.');
  const reader = response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new Error('Hasil MIDI melebihi 2 MB.');chunks.push(value);} } finally {await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(new TextDecoder().decode(bytes.slice(0,4))!=='MThd')throw new Error('Respons model bukan file MIDI.');
  const bpm=Number(response.headers.get('x-estimated-bpm'));
  return pianoArrangement(bytes,Number.isFinite(bpm)&&bpm>=40&&bpm<=240?bpm:undefined);
}
