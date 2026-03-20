from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import AgentBackend, ChatRequest, StreamEmitter
from .common import build_openai_headers, build_system_prompt, extract_text_from_message_content, log_chat_request, log_chat_response


class OpenAICompatibleAgentBackend(AgentBackend):
    def _build_user_content(self, request: ChatRequest) -> str | list[dict]:
        """Build user message content, supporting both text-only and multimodal (Vision) formats."""
        if not request.attachments:
            return request.user_text

        # Multimodal content: text + images
        content: list[dict] = [{"type": "text", "text": request.user_text}]
        for attachment in request.attachments:
            content.append(attachment.to_openai_content())
        return content

    def _build_payload(self, request: ChatRequest, *, stream: bool = False) -> dict:
        system_prompt = build_system_prompt(request)
        log_chat_request(self.provider_config, request, system_prompt)

        user_content = self._build_user_content(request)

        payload = {
            "model": self.provider_config.get("model") or "gpt-5.4",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.7,
        }
        if stream:
            payload["stream"] = True
        return payload

    def _build_request(self, request: ChatRequest, *, stream: bool = False) -> urllib.request.Request:
        body = json.dumps(self._build_payload(request, stream=stream)).encode("utf-8")
        return urllib.request.Request(
            f"{str(self.provider_config.get('baseUrl') or '').rstrip('/')}/chat/completions",
            data=body,
            method="POST",
            headers=build_openai_headers(str(self.provider_config.get("apiKey") or "")),
        )

    def _result_payload(self, *, data: dict, text: str, request: ChatRequest) -> dict:
        return {
            "reply": text,
            "provider": self.provider_config.get("id") or "openai-compatible",
            "providerLabel": self.provider_config.get("name") or "OpenAI-Compatible API",
            "model": data.get("model") or (self.provider_config.get("model") or "gpt-5.4"),
            "usage": data.get("usage") or {},
            "agent": request.agent or "",
            "session": request.session_name or "",
            "sessionKey": f"agent:{request.agent}:{request.session_name}" if request.agent and request.session_name else "",
            "state": "final",
        }

    def send_chat(self, request: ChatRequest) -> dict:
        req = self._build_request(request)
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"chat backend HTTP {exc.code}: {detail[:500]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"chat backend unavailable: {exc}") from exc

        data = json.loads(raw.decode("utf-8"))
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("chat backend returned no choices")
        message = choices[0].get("message") or {}
        text = extract_text_from_message_content(message.get("content")) or "……我刚刚没组织出可显示的回复。"
        log_chat_response(self.provider_config, reply=text, state="final", streamed=False)
        return self._result_payload(data=data, text=text, request=request)

    def stream_chat(self, request: ChatRequest, emit: StreamEmitter) -> dict:
        req = self._build_request(request, stream=True)
        accumulated = ""
        final_data: dict = {}
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                while True:
                    raw_line = response.readline()
                    if not raw_line:
                        break
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    final_data = chunk or final_data
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    delta_text = extract_text_from_message_content(delta.get("content"))
                    if not delta_text and isinstance(delta.get("content"), str):
                        delta_text = delta.get("content", "")
                    if delta_text:
                        accumulated += delta_text
                        emit({"type": "delta", "delta": delta_text, "reply": accumulated})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"chat backend HTTP {exc.code}: {detail[:500]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"chat backend unavailable: {exc}") from exc

        if not accumulated:
            fallback = self.send_chat(request)
            emit({"type": "delta", "delta": fallback["reply"], "reply": fallback["reply"]})
            return fallback
        log_chat_response(self.provider_config, reply=accumulated, state="final", streamed=True)
        return self._result_payload(data=final_data, text=accumulated, request=request)
