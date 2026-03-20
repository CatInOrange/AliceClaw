from __future__ import annotations

import json
import urllib.error
import urllib.request
from urllib.parse import urlencode

from .base import TtsBackend


class GptSoVitsBackend(TtsBackend):
    """GPT-SoVITS FastAPI backend.

    This backend targets the server's OpenAI-compatible endpoint:
      POST /v1/audio/speech

    The OpenAPI schema provided indicates a JSON request body of shape:
      { model, input, voice, response_format, speed, other_params }

    Implemented defensively:
    - If the response is audio/*, return bytes directly.
    - If the response is JSON, try to resolve a downloadable path via /outputs/{result_path}.
    """

    def synthesize(self, text: str, overrides: dict | None = None) -> tuple[bytes, str]:
        tts = dict(self.config)
        if overrides:
            # Minimal overrides support; allow passing OpenAI-like fields.
            for key in (
                'baseUrl',
                'model',
                'voice',
                'response_format',
                'speed',
                'other_params',
            ):
                if overrides.get(key) not in (None, ''):
                    tts[key] = overrides[key]

        if not tts.get('enabled', True):
            raise RuntimeError('tts is disabled')
        if not str(text or '').strip():
            raise ValueError('text is required')

        base_url = str(tts.get('baseUrl') or '').rstrip('/')
        if not base_url:
            raise ValueError('gpt-sovits requires chat.tts.baseUrl (e.g. http://127.0.0.1:9880)')

        # GPT-SoVITS OpenAI-compatible endpoint expects:
        # - model: one of /v1/models ids (e.g. "GSVI-v4")
        # - voice: a speaker/voice name from /models/{version}
        voice = str(tts.get('voice') or tts.get('gptSovitsVoice') or '').strip() or '星穹铁道-中文-三月七'
        model = str(tts.get('model') or tts.get('version') or '').strip() or 'GSVI-v4'

        payload: dict = {
            'model': model,
            'input': str(text),
            'voice': voice,
            'response_format': str(tts.get('responseFormat') or tts.get('response_format') or 'wav'),
            'speed': float(tts.get('speed') or 1.0),
        }
        other_params = tts.get('otherParams') or tts.get('other_params')
        if isinstance(other_params, dict):
            # Server schema defines other_params with defaults; send an object explicitly for compatibility.
            payload['other_params'] = other_params
        elif other_params is None:
            payload['other_params'] = {}

        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        # Important: bypass env proxies for LAN IPs (common to have http_proxy set).
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        req = urllib.request.Request(
            f"{base_url}/v1/audio/speech",
            data=body,
            method='POST',
            headers={
                'Content-Type': 'application/json',
                # Some deployments ignore Authorization; keep empty by default.
                **({'Authorization': f"Bearer {tts['apiKey']}"} if str(tts.get('apiKey') or '').strip() else {}),
            },
        )

        try:
            with opener.open(req, timeout=float(tts.get('timeoutSeconds') or 120)) as resp:
                content_type = (resp.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
                data = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')
            raise RuntimeError(f"gpt-sovits HTTP {exc.code}: {detail[:500]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"gpt-sovits unavailable: {exc}") from exc

        if content_type.startswith('audio/') and data:
            return data, content_type

        # JSON fallback
        try:
            obj = json.loads(data.decode('utf-8', errors='replace')) if data else {}
        except json.JSONDecodeError:
            raise RuntimeError(f"gpt-sovits returned non-audio, non-json response (Content-Type={content_type})")

        # Try common keys for downloadable outputs.
        result_path = (
            obj.get('result_path')
            or obj.get('resultPath')
            or obj.get('path')
            or obj.get('output')
            or obj.get('file')
        )
        if isinstance(result_path, str) and result_path:
            # /outputs/{result_path} is declared in the OpenAPI.
            dl_url = f"{base_url}/outputs/{result_path.lstrip('/')}"
            try:
                with opener.open(dl_url, timeout=float(tts.get('timeoutSeconds') or 120)) as resp:
                    ct = (resp.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
                    audio = resp.read()
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode('utf-8', errors='replace')
                raise RuntimeError(f"gpt-sovits download HTTP {exc.code}: {detail[:500]}") from exc
            except urllib.error.URLError as exc:
                raise RuntimeError(f"gpt-sovits download unavailable: {exc}") from exc
            if ct.startswith('audio/') and audio:
                return audio, ct

        # Some servers may return a direct URL.
        url = obj.get('url') or obj.get('download_url') or obj.get('downloadUrl')
        if isinstance(url, str) and url.startswith('http'):
            try:
                with opener.open(url, timeout=float(tts.get('timeoutSeconds') or 120)) as resp:
                    ct = (resp.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
                    audio = resp.read()
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode('utf-8', errors='replace')
                raise RuntimeError(f"gpt-sovits url HTTP {exc.code}: {detail[:500]}") from exc
            except urllib.error.URLError as exc:
                raise RuntimeError(f"gpt-sovits url unavailable: {exc}") from exc
            if ct.startswith('audio/') and audio:
                return audio, ct

        if isinstance(obj, dict) and obj.get('error'):
            raise RuntimeError(f"gpt-sovits error: {obj.get('error')}")
        raise RuntimeError(f"gpt-sovits returned no audio. Content-Type={content_type}; keys={list(obj.keys())[:20]}")
