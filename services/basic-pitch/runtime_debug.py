import json
import logging
import os
from contextvars import ContextVar
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

current = ContextVar('pipeline_debug', default=None)
log = logging.getLogger('uvicorn.error')


def update(**values):
    record = current.get()
    if record is not None:
        record.update(values)
        log.info('pipeline job=%s %s', record.get('job_id'), json.dumps(values))


def initial(job_id):
    return dict(job_id=job_id, stage='queued', separation_enabled=None,
                separation_job_id=None, separation_status=None,
                vocals_downloaded=False, instrumental_downloaded=False,
                vocal_note_count=None, instrumental_note_count=None,
                transcription_note_count=None, final_note_count=None,
                used_full_mix_fallback=None)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def diagnostics(model_ready):
    base = os.environ.get('SOURCE_SEPARATION_URL', '').strip().rstrip('/')
    result = dict(source_separation_url_configured=bool(base), basic_pitch_ready=model_ready,
                  source_separation_health=None, source_separation_diagnostics=None,
                  pipeline_ready=False, errors=[])
    parsed = urlsplit(base)
    if not base:
        result['errors'].append('SOURCE_SEPARATION_NOT_CONFIGURED')
        return result
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        result['errors'].append('SOURCE_SEPARATION_URL_INVALID')
        return result
    opener = build_opener(NoRedirect())
    for path, field in [('health', 'source_separation_health'), ('diagnostics', 'source_separation_diagnostics')]:
        try:
            with opener.open(Request(base + '/' + path), timeout=10) as response:
                data = response.read(65537)
                if len(data) > 65536:
                    raise ValueError()
                body = json.loads(data)
                if not isinstance(body, dict):
                    raise ValueError()
                # Allowlist values: no remote error text, URLs, environment or paths.
                result[field] = {k: body[k] for k in ('ready', 'alive', 'busy', 'modelAvailable') if isinstance(body.get(k), bool)}
                for key, allowed in [('engine', ('demucs',)), ('model', ('htdemucs',)), ('modelStatus', ('ready', 'loading', 'failed'))]:
                    if body.get(key) in allowed:
                        result[field][key] = body[key]
        except Exception:
            result['errors'].append(path.upper() + '_REQUEST_OR_RESPONSE_FAILED')
    health = result['source_separation_health'] or {}
    remote = result['source_separation_diagnostics'] or {}
    result['pipeline_ready'] = bool(model_ready and health.get('ready') is True and remote.get('engine') == 'demucs' and remote.get('model') == 'htdemucs' and remote.get('modelAvailable') is True and remote.get('modelStatus') == 'ready')
    return result
