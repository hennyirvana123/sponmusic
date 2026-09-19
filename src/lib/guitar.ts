// A rounded pluck excites the string without a harsh white-noise transient.
export function guitarVoice(context: AudioContext, pitch: number, output: AudioNode) {
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const period = Math.max(2, Math.round(context.sampleRate / frequency - .5));
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 5), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const string = new Float32Array(period);
  for (let i = 0; i < period; i++) {
    const phase = 2 * Math.PI * i / period;
    string[i] = .65 * Math.sin(phase) + .16 * Math.sin(phase * 2) + .045 * Math.sin(phase * 3);
  }
  const damping = Math.exp(-1 / (frequency * 1.8));
  for (let i = 0; i < samples.length; i++) {
    const index = i % period;
    const value = string[index];
    string[index] = damping * .5 * (value + string[(index + 1) % period]);
    samples[i] = value * Math.min(1, i / (context.sampleRate * .008));
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const body = context.createBiquadFilter();
  body.type = 'peaking'; body.frequency.value = 260; body.Q.value = .65; body.gain.value = 2;
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.setValueAtTime(Math.min(context.sampleRate * .4, Math.max(1600, frequency * 2.5)), context.currentTime);
  warmth.frequency.exponentialRampToValueAtTime(Math.min(context.sampleRate * .4, Math.max(950, frequency * 1.4)), context.currentTime + .3);
  warmth.Q.value = .5;
  const level = context.createGain();
  level.gain.value = .65;
  source.connect(body); body.connect(warmth); warmth.connect(level); level.connect(output);
  source.onended = () => { source.disconnect(); body.disconnect(); warmth.disconnect(); level.disconnect(); };
  source.start();
  return source;
}
