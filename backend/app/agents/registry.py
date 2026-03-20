from __future__ import annotations

from .base import AgentBackend
from .openai_compatible import OpenAICompatibleAgentBackend
from .openclaw_channel import OpenClawChannelAgentBackend

AGENT_BACKEND_REGISTRY: dict[str, type[AgentBackend]] = {
    'openai-compatible': OpenAICompatibleAgentBackend,
    'openclaw-channel': OpenClawChannelAgentBackend,
}


def create_agent_backend(provider_config: dict) -> AgentBackend:
    provider_type = str(provider_config.get('type') or '').strip()
    backend_cls = AGENT_BACKEND_REGISTRY.get(provider_type)
    if not backend_cls:
        raise ValueError(f'unsupported provider type: {provider_type}')
    return backend_cls(provider_config)
