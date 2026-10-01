import { defineHandler } from 'nitro';
import { v2Configured } from '../../../utils/arrangement-v2';

export default defineHandler(() => {
  const configured = v2Configured();
  return {
    configured,
    status: configured ? 'configured' : 'not_configured',
    message: configured
      ? 'Endpoint YourMT3 V2 dikonfigurasi; readiness model belum diverifikasi oleh status ini. Raw MIDI diteruskan ke aransemen piano.'
      : 'AI_TRANSCRIBE_V2_URL belum dikonfigurasi dengan URL yang valid.',
    maxBytes: 20_000_000,
    formats: ['mp3', 'wav'],
    transcription: 'yourmt3',
    engine: 'mt3-infer',
    arrangement: 'rule-based-piano-v1',
  };
});
