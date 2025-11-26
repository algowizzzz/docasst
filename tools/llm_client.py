"""Direct Anthropic API integration for LLM operations."""

import os
from typing import Dict, List, Optional
from anthropic import Anthropic


class LLMClientWrapper:
    """Wrapper around Anthropic client to provide invoke_with_prompt method."""
    
    def __init__(self, client: Anthropic):
        self.client = client
    
    @property
    def messages(self):
        """Expose the underlying client's messages API for direct access."""
        return self.client.messages
    
    def invoke(
        self,
        messages: List[Dict[str, str]],
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        response_format: Optional[str] = None
    ) -> str:
        """
        Invoke LLM with messages (compatible with old LLM client interface).
        
        Args:
            messages: List of {"role": "user"|"assistant", "content": "..."}
            system: Optional system prompt
            temperature: Override default temperature (0.0-1.0)
            max_tokens: Maximum tokens in response
            response_format: "json" to request JSON output (not directly supported, handled in prompt)
            
        Returns:
            LLM response text
        """
        params = {
            "model": "claude-3-opus-20240229",
            "max_tokens": max_tokens or 4096,
            "messages": messages,
        }
        
        if system:
            params["system"] = system
        
        if temperature is not None:
            params["temperature"] = temperature
        
        response = self.client.messages.create(**params)
        
        # Extract text from response
        if hasattr(response, 'content') and response.content:
            text_parts = []
            for block in response.content:
                if hasattr(block, 'text'):
                    text_parts.append(block.text)
                elif isinstance(block, dict) and 'text' in block:
                    text_parts.append(block['text'])
            return "".join(text_parts)
        
        return ""
    
    def invoke_with_prompt(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        response_format: Optional[str] = None,
        max_tokens: int = 4096,
        model: str = "claude-3-opus-20240229"
    ) -> str:
        """
        Simplified invoke with system and user prompts.
        
        Args:
            system_prompt: System instructions
            user_prompt: User query
            temperature: Override default temperature (0.0-1.0)
            response_format: "json" to request JSON output
            max_tokens: Maximum tokens in response
            model: Model to use
            
        Returns:
            LLM response text
        """
        messages = [{"role": "user", "content": user_prompt}]
        
        # Build request parameters
        params = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
            "system": system_prompt,
        }
        
        if temperature is not None:
            params["temperature"] = temperature
        
        # Handle JSON response format
        if response_format == "json":
            # Anthropic doesn't support response_format directly, but we can request JSON in the prompt
            # For now, we'll just call normally and parse JSON from response
            pass
        
        response = self.client.messages.create(**params)
        
        # Extract text from response
        if hasattr(response, 'content') and response.content:
            # Response.content is a list of ContentBlock objects
            text_parts = []
            for block in response.content:
                if hasattr(block, 'text'):
                    text_parts.append(block.text)
                elif isinstance(block, dict) and 'text' in block:
                    text_parts.append(block['text'])
            return "".join(text_parts)
        
        return ""


_client: Optional[Anthropic] = None
_wrapper: Optional[LLMClientWrapper] = None


def get_llm_client() -> LLMClientWrapper:
    """Get or create Anthropic client wrapper."""
    global _client, _wrapper
    if _client is None:
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        _client = Anthropic(api_key=api_key)
        _wrapper = LLMClientWrapper(_client)
    return _wrapper


def is_llm_available() -> bool:
    """Check if LLM is configured."""
    return os.getenv('ANTHROPIC_API_KEY') is not None
