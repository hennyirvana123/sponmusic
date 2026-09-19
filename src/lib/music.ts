export type Note = { id: string; pitch: number; step: number; length: number };
export type Project = { name: string; bpm: number; notes: Note[] };
export const isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
export const noteName = (pitch: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pitch % 12] + (Math.floor(pitch / 12) - 1);
export const pitches = Array.from({ length: 45 }, (_, i) => 36 + i);
const whites = pitches.filter(p => !isBlack(p));
const blacks = pitches.filter(isBlack);
export const keyMap: Record<string, number> = {};
[...'ZXCVBNMQWERTYUIOP'].forEach((k, i) => keyMap[k.toLowerCase()] = whites[i]);
[...'DFG1234567890'].forEach((k, i) => keyMap[k.toLowerCase()] = blacks[i]);
keyMap[','] = keyMap.q;
let ctx: AudioContext | undefined;
let master: GainNode | undefined;
export type VisualNoteEvent = { id: string; pitch: number; on: boolean };
const listeners = new Set<(event: VisualNoteEvent) => void>();
export function subscribeNotes(listener: (event: VisualNoteEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function initAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  if (!master) { master = ctx.createGain(); master.connect(ctx.destination); }
}
export function recordingAudio() {
  initAudio();
  const destination = ctx!.createMediaStreamDestination();
  master!.connect(destination);
  return { stream: destination.stream, release: () => { master!.disconnect(destination); destination.stream.getTracks().forEach(t => t.stop()); } };
}
const voices = new Set<() => void>();
export function setVolume(value: number) { if (master) master.gain.value = value; }
export function sound(pitch: number, volume = .65, duration?: number) {
  initAudio();
  master!.gain.value = volume;
  const id = crypto.randomUUID();
  listeners.forEach(listener => listener({id, pitch, on: true}));
  const now = ctx!.currentTime;
  const envelope = ctx!.createGain();
  envelope.connect(master!);
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(.2, now + .008);
  envelope.gain.exponentialRampToValueAtTime(.045, now + 1.5);
  const oscillators = [1, 2, 3].map((harmonic) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine'; osc.frequency.value = 440 * 2 ** ((pitch - 69) / 12) * harmonic;
    gain.gain.value = 1 / (harmonic * harmonic);
    osc.connect(gain); gain.connect(envelope); osc.start(); return osc;
  });
  let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true;
    listeners.forEach(listener => listener({id, pitch, on: false}));
    const t = ctx!.currentTime;
    envelope.gain.cancelScheduledValues(t);
    envelope.gain.setTargetAtTime(.0001, t, .07);
    oscillators.forEach(o => o.stop(t + .4));
    setTimeout(() => envelope.disconnect(), 500);
    voices.delete(stop);
  };
  voices.add(stop);
  if (duration !== undefined) setTimeout(stop, duration * 1000);
  return stop;
}
export function silence() { voices.forEach(stop => stop()); }
export const demo: Project = { name: 'Midnight thoughts', bpm: 120, notes: [
  [60,0,4],[64,4,2],[67,6,2],[71,8,4],[67,12,2],[64,14,2],
  [62,16,4],[65,20,2],[69,22,2],[72,24,4],[69,28,2],[65,30,2],
  [60,32,4],[64,36,2],[67,38,2],[71,40,4],[74,44,4],
  [69,48,4],[67,52,4],[64,56,4],[60,60,4],
  [48,0,8],[55,8,8],[50,16,8],[57,24,8],[48,32,8],[55,40,8],[53,48,8],[55,56,8]
].map(([pitch,step,length], i) => ({id: `demo-${i}`, pitch, step, length})) };
export function projectSteps(notes: Note[]) { return Math.max(64, Math.ceil(notes.reduce((end, n) => Math.max(end, n.step + n.length), 0) / 16) * 16); }
export function validProject(p: unknown): p is Project {
  if (!p || typeof p !== 'object') return false;
  const v = p as Project;
  return typeof v.name === 'string' && v.name.length <= 100 && Number.isFinite(v.bpm) && v.bpm >= 40 && v.bpm <= 240 && Array.isArray(v.notes) && v.notes.length <= 30000 && new Set(v.notes.map(n => n?.id)).size === v.notes.length && v.notes.every(n => n && typeof n.id === 'string' && Number.isInteger(n.pitch) && n.pitch >= 0 && n.pitch <= 127 && Number.isFinite(n.step) && n.step >= 0 && Number.isFinite(n.length) && n.length > 0 && n.step + n.length <= 65536);
}
