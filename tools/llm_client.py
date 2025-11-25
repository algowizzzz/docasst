"""Direct Anthropic API integration for LLM operations."""

import os
from typing import Optional
from anthropic import Anthropic

_client: Optional[Anthropic] = None


def get_llm_client() -> Anthropic:
    """Get or create Anthropic client."""
    global _client
    if _client is None:
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        _client = Anthropic(api_key=api_key)
    return _client


def is_llm_available() -> bool:
    """Check if LLM is configured."""
    return os.getenv('ANTHROPIC_API_KEY') is not None
