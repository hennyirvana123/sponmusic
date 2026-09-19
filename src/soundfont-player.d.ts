declare module 'soundfont-player' {
  const Soundfont: {
    instrument(context: AudioContext, name: string, options: { soundfont: string; destination: AudioNode; gain: number; release: number }): Promise<{ play(pitch: number, time: number): { stop(time?: number): void } }>;
  };
  export default Soundfont;
}
