from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.app.config import get_default_model_id, load_config
from backend.app.agents.registry import create_agent_backend
from backend.app.services.chat_service import ChatService
from backend.app.store import DbConfig, MessageStore, SessionStore


class ChatServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        load_config.cache_clear()

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        db_config = DbConfig(path=Path(self.temp_dir.name) / "chat-service.sqlite3")
        self.sessions = SessionStore(db_config)
        self.messages = MessageStore(db_config)
        self.chat_service = ChatService(sessions=self.sessions, messages=self.messages)
        self.session = self.sessions.create_session(name="automation", select=False)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_persist_user_message_keeps_automation_source(self) -> None:
        self.chat_service.persist_user_message(
            session_id=self.session.id,
            history_text="请观察当前画面并主动搭话",
            attachments=[],
            source="automation",
        )

        messages = self.messages.list_session_messages(self.session.id)

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["source"], "automation")

    def test_resolve_request_defaults_to_supported_provider(self) -> None:
        resolved = self.chat_service.resolve_request(
            {
                "modelId": get_default_model_id(),
                "text": "你好",
            }
        )

        self.assertIn(resolved.provider["type"], {"openclaw-channel", "lunaria"})
        self.assertNotEqual(resolved.provider["type"], "gateway")

    def test_legacy_chat_provider_types_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported provider type: openai-compatible"):
            create_agent_backend(
                {
                    "id": "legacy-openai",
                    "type": "openai-compatible",
                    "baseUrl": "http://127.0.0.1:8317/v1",
                    "model": "gpt-5.4",
                }
            )

        with self.assertRaisesRegex(ValueError, "unsupported provider type: mem0"):
            create_agent_backend(
                {
                    "id": "legacy-mem0",
                    "type": "mem0",
                    "baseUrl": "http://127.0.0.1:8317/v1",
                    "model": "gpt-5.4",
                }
            )


if __name__ == "__main__":
    unittest.main()
