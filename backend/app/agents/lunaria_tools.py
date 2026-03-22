from __future__ import annotations

from typing import Protocol

from ..services.mem0_service import get_mem0_service
from .base import ChatRequest

DEFAULT_MEMORY_LIMIT = 5


class LunariaTool(Protocol):
    def definition(self) -> dict:
        raise NotImplementedError

    def invoke(self, *, arguments: dict, request: ChatRequest) -> dict:
        raise NotImplementedError


def build_lunaria_run_id(provider_config: dict, request: ChatRequest) -> str:
    session_key = f"agent:{request.agent}:{request.session_name}" if request.agent and request.session_name else ""
    context = request.context or {}
    return str(context.get("runId") or session_key or context.get("routeKey") or "").strip()


def resolve_lunaria_memory_scope(provider_config: dict, request: ChatRequest) -> tuple[str, str, str]:
    user_id = str(provider_config.get("userId") or "default").strip() or "default"
    agent_id = str(request.agent or provider_config.get("agent") or "").strip()
    run_id = build_lunaria_run_id(provider_config, request)
    return user_id, agent_id, run_id


def normalize_memory_results(raw: object) -> list[dict]:
    if isinstance(raw, dict):
        items = raw.get("results") or raw.get("memories") or []
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    return [item for item in items if isinstance(item, dict)]


class SearchMemoryTool:
    def __init__(self, provider_config: dict):
        self.provider_config = provider_config

    def definition(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": "search_memory",
                "description": "Search relevant memories for the current user, agent, or session.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer"},
                        "scope": {"type": "string", "enum": ["user", "agent", "session"]},
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
            },
        }

    def invoke(self, *, arguments: dict, request: ChatRequest) -> dict:
        user_id, agent_id, run_id = resolve_lunaria_memory_scope(self.provider_config, request)
        query = str(arguments.get("query") or "").strip()
        if not query:
            raise ValueError("search_memory requires query")

        limit = max(1, min(int(arguments.get("limit") or DEFAULT_MEMORY_LIMIT), 10))
        scope = str(arguments.get("scope") or "agent").strip().lower()
        if scope not in {"user", "agent", "session"}:
            scope = "agent"

        results = normalize_memory_results(
            get_mem0_service(self.provider_config).search(
                query=query,
                user_id=user_id,
                agent_id=agent_id,
                run_id=run_id,
                limit=limit,
                scope=scope,
            )
        )
        return {"results": results}


def get_lunaria_tools(provider_config: dict) -> list[LunariaTool]:
    return [SearchMemoryTool(provider_config)]
