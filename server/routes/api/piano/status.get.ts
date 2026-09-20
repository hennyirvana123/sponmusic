import { defineHandler } from 'nitro';
import { modelUrl } from '../../../utils/piano-model';
export default defineHandler(() => ({ configured: Boolean(modelUrl()), status: modelUrl()?'configured':'not_configured', message:modelUrl()?'Endpoint model dikonfigurasi; kesiapan model belum diverifikasi.':'Model AI belum terhubung. Upload dapat divalidasi, tetapi transkripsi belum tersedia.', maxBytes:20_000_000, formats:['mp3','wav'] }));
