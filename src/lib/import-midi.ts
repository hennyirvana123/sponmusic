import { Midi } from '@tonejs/midi';
import { Project, validProject } from './music';

export async function importMidi(file: File): Promise<Project> {
  if (file.size > 2_000_000) throw new Error('File MIDI maksimal 2 MB.');
  const midi = new Midi(await file.arrayBuffer());
  const bpm = Math.max(40, Math.min(240, Math.round(midi.header.tempos[0]?.bpm || 120)));
  // Convert absolute MIDI times to a fixed-tempo timeline, retaining tempo changes in note positions.
  const notes = midi.tracks.flatMap(track => track.notes.map(n => ({
    id: crypto.randomUUID(), pitch: n.midi,
    step: n.time * bpm / 15,
    length: Math.max(.01, n.duration * bpm / 15),
  })));
  if (!notes.length) throw new Error('MIDI ini tidak berisi not.');
  const project = {name: file.name.replace(/\.(mid|midi)$/i, '').slice(0,100), bpm, notes};
  if (!validProject(project)) throw new Error('MIDI melebihi batas 30.000 not atau 4.096 bar.');
  return project;
}
