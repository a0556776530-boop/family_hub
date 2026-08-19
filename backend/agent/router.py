from __future__ import annotations
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agent.memory import ExecutionContext


# Real model names only — verified against Groq and Gemini APIs
GROQ_FAST     = 'llama-3.3-70b-versatile'
GROQ_FALLBACK = 'llama-3.1-70b-versatile'
GROQ_TINY     = 'llama3-8b-8192'
GROQ_COMPOUND = 'compound-beta'
GEMINI_FLASH  = 'gemini-2.0-flash'
GEMINI_25     = 'gemini-2.5-flash'
GEMINI_PRO    = 'gemini-1.5-pro'


class ModelRouter:
    """Selects the right model + client for each agent task."""

    def for_understanding(self) -> tuple:
        """Fast, cheap classification — JSON output expected."""
        return self._groq_client(), GROQ_FAST

    def for_planning(self, complexity: str) -> tuple:
        """Planning needs JSON + strong instruction following."""
        client = self._gemini_client() or self._groq_client()
        model  = GEMINI_FLASH if self._gemini_client() else GROQ_FAST
        return client, model

    def for_response(self, context: 'ExecutionContext') -> tuple:
        """
        Main response streaming.
        • Has search results → try Gemini native (Google Search grounding) first
        • Otherwise → Gemini OpenAI-compat → Groq
        """
        if context.has_search_results:
            # Prefer native Gemini for grounded responses
            if self._gemini_native_available():
                return 'gemini-native', GEMINI_FLASH
        client = self._gemini_client() or self._groq_client()
        model  = GEMINI_25 if self._gemini_client() else GROQ_FAST
        return client, model

    def for_fallback(self) -> tuple:
        return self._groq_client(), GROQ_FALLBACK

    # ── Clients ─────────────────────────────────────────────────────────────

    @staticmethod
    def _gemini_client():
        try:
            from openai import OpenAI
            key = os.environ.get('GEMINI_API_KEY', '')
            if not key:
                return None
            return OpenAI(api_key=key, base_url='https://generativelanguage.googleapis.com/v1beta/openai/')
        except Exception:
            return None

    @staticmethod
    def _groq_client():
        try:
            from groq import Groq
            key = os.environ.get('GROQ_API_KEY', '')
            if not key:
                return None
            return Groq(api_key=key)
        except Exception:
            return None

    @staticmethod
    def _gemini_native_available() -> bool:
        try:
            import google.generativeai
            return bool(os.environ.get('GEMINI_API_KEY', ''))
        except Exception:
            return False
