import Soundfont from 'soundfont-player';
type Player = { play: (pitch: number, time: number) => { stop: (time?: number) => void } };
let player: Player | undefined;
let loading: Promise<void> | undefined;
export function loadGuitar(context: AudioContext, output: AudioNode): Promise<void> {
  if (player) return Promise.resolve();
  loading ??= Soundfont.instrument(context, 'acoustic_guitar_nylon', {
    soundfont: 'MusyngKite', destination: output, gain: .55, release: .25,
  }).then((loaded: Player) => { player = loaded; }).catch((error: unknown) => { loading = undefined; throw error; });
  return loading;
}
export function guitarVoice(context: AudioContext, pitch: number) {
  if (!player) throw new Error('Sampel gitar belum dimuat.');
  return player.play(pitch, context.currentTime);
}
