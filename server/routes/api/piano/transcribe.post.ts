import { defineHandler } from 'nitro';
import { audioResponse } from '../../../utils/audio-response';
export default defineHandler(event => audioResponse(event.req, true));
