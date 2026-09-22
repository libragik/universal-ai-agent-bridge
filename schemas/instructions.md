# Universal LLM Bridge MCP Instructions

The `universal-llm-bridge` gives Antigravity the ability to communicate with ANY external LLM via standard OpenAI-compatible `/v1` endpoints (e.g. Dahl, DeepSeek, OpenRouter, Groq, Cerebras, Ollama, LM Studio, FreeLLMAPI, 9Router, OmniRoute, or custom servers).

## Available Tools:
1. `llm_query`:
   - Query an external LLM for code analysis, second opinions, alternative logic, or translation.
   - Use `provider` (e.g., "dahl", "deepseek", "groq", "ollama") or supply `endpoint_url` directly.
   - Always check reasoning output when querying reasoning models (DeepSeek-R1, MiniMax, QwQ).
2. `llm_list_models`:
   - Inspect live models from `GET /v1/models` to confirm valid model IDs.
3. `llm_test_connection`:
   - Test endpoint availability, network round-trip latency, and token allocation.
4. `llm_manage_providers`:
   - Add new custom `/v1` endpoints, update keys, or switch the active default provider.
5. `llm_compare`:
   - Run prompt simultaneously against multiple models to compare speed, tokens, and output quality.
