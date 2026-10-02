import { defineHandler } from 'nitro';
import { arrangementV2Jobs } from '../../../../utils/arrangement-v2';

export default defineHandler(event => arrangementV2Jobs(event.req));
