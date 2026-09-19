import { Midi } from '@tonejs/midi';
import { Note, Project, validProject } from './music';
export type MidiImport = { name: string; bpm: number; tracks: { id: number; name: string; instrument: string; piano: boolean; notes: Note[] }[] };
export async function readMidi(file: File): Promise<MidiImport> {
  if(file.size>2_000_000) throw Error('File MIDI maksimal 2 MB.');
  const midi=new Midi(await file.arrayBuffer());
  const bpm=Math.max(40,Math.min(240,Math.round(midi.header.tempos[0]?.bpm||120)));
  const tracks=midi.tracks.map((track,id)=>({id,name:track.name||`Track ${id+1}`,instrument:track.instrument.name,piano:!track.instrument.percussion&&track.instrument.number<=7,
    notes:track.notes.map(n=>({id:crypto.randomUUID(),pitch:n.midi-12,step:n.time*bpm/15,length:Math.max(.01,n.duration*bpm/15)}))
  })).filter(t=>t.notes.length);
  if(!tracks.length) throw Error('MIDI ini tidak berisi not.');
  return {name:file.name.replace(/\.(mid|midi)$/i,'').slice(0,100),bpm,tracks};
}
export function selectedMidi(data: MidiImport, ids: number[]): Project {
  const notes=data.tracks.filter(t=>ids.includes(t.id)).flatMap(t=>t.notes);
  if(!notes.length) throw Error('Pilih minimal satu track.');
  if(notes.some(n=>n.pitch<0)) throw Error('Track terpilih mengandung nada terlalu rendah untuk diturunkan 1 oktaf.');
  const project={name:data.name,bpm:data.bpm,notes};
  if(!validProject(project)) throw Error('Track terpilih melebihi batas 30.000 not atau 4.096 bar.');
  return project;
}
