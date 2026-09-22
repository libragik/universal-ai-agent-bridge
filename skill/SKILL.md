---
name: universal-llm
description: Route queries, code reviews, and reasoning to ANY external OpenAI-compatible /v1 LLM endpoint (Dahl, OpenRouter, DeepSeek, Groq, Ollama, LM Studio, FreeLLMAPI, 9Router, OmniRoute, vLLM). Use when the user asks to test or use an external LLM API, connect an endpoint, compare models, or configure AI routers.
---

# Universal LLM Gateway for Google Antigravity Desktop

This skill enables Google Antigravity Desktop to connect to, query, test, and manage any external OpenAI-compatible `/v1` endpoint.

## Supported Providers & Protocols
- **Dahl High-Throughput Cluster** (`https://inference.dahl.global/v1`) — Pre-configured with active key
- **OpenRouter** (`https://openrouter.ai/api/v1`) — Unified gateway to 300+ models
- **DeepSeek Official** (`https://api.deepseek.com/v1`) — V3 and R1 reasoning
- **Groq LPU** (`https://api.groq.com/openai/v1`) — Ultra-low latency 500+ tok/s
- **Cerebras Wafer** (`https://api.cerebras.ai/v1`) — Ultra-fast Llama 3.3
- **Ollama (Local Offline)** (`http://localhost:11434/v1`)
- **LM Studio (Local Offline)** (`http://localhost:1234/v1`)
- **FreeLLMAPI Aggregator** (`http://localhost:4000/v1`)
- **9Router / OmniRoute** (`http://localhost:20128/v1`)
- **Any Custom vLLM / LiteLLM / FastChat / TGI Endpoint**

---

## MCP Tools Available

### 1. `llm_query`
Send prompts to any provider or ad-hoc endpoint:
- **`prompt`**: Prompt text
- **`model`**: Model name (e.g., `MiniMaxAI/MiniMax-M2.7`, `deepseek-chat`, `llama-3.3-70b-versatile`)
- **`provider`**: Saved alias (`dahl`, `openrouter`, `groq`, `ollama`, etc.)
- **`endpoint_url`** & **`api_key`**: Directly query any arbitrary `/v1` URL on-the-fly
- **`fallback`**: (Default `true`) Zero-downtime failover cascade upon encountering HTTP 429 (rate/concurrency limit) or 5xx outage
- **`fallback_chain`**: Custom sequence of provider keys to attempt (e.g., `["dahl", "groq", "deepseek", "ollama"]`)
- **`compress_tokens`**: (Default `false`) Enables RTK Smart Prompt Compression to strip redundant whitespace, duplicate logs, and deep stack frames, reducing input tokens by 20%-40%
- **`stream`**: (Default `false`) Enables SSE streaming mode with live token telemetry (Time-To-First-Token, tokens/sec velocity, and token counts)
- **`preset`**: System persona preset key (e.g., `security-auditor`, `systems-architect`)

### 2. `llm_list_models`
Discover available models by calling `GET /v1/models` on any endpoint.

### 3. `llm_test_connection`
Test endpoint reachability, measure latency in milliseconds, and verify API token validity.

### 4. `llm_manage_providers`
Add new endpoints, update credentials, list configured vaults, or switch default active provider without restarting Antigravity.

### 5. `llm_compare`
Run an identical prompt across multiple endpoints or models concurrently to compare output quality, latency, and reasoning traces.

### 6. `llm_autodetect`
Auto-scans local ports (`11434`, `1234`, `20128`, `4000`, `8000`, `8080`, `1337`) for running AI servers (Ollama, LM Studio, 9Router, FreeLLMAPI, vLLM, Jan, LocalAI), pulls all live loaded models, and auto-syncs them into the vault.

### 7. `llm_compress_prompt`
Standalone text compressor tool. Returns compressed text alongside exact token savings and percentage reduction.

### 8. `llm_council`
Multi-Model Consensus & Council Deliberation. Broadcasts a complex prompt, code architecture dilemma, or security audit in parallel to multiple LLM council members (e.g. Dahl, DeepSeek, Groq, Ollama), then automatically uses a designated Chief Justice / Synthesizer model to critique, cross-examine, and deliver the single optimal consensus solution.
- **`prompt`**: The complex task, code review, or dilemma
- **`members`**: Array of member providers/models with custom roles (defaults to active provider + fallback chain)
- **`judge`**: Synthesizer model (defaults to active default model)
- **`synthesis_instruction`**: Optional custom instructions for the Chief Justice verdict

### 9. `llm_get_analytics`
Query the Local Cost & Token Usage Ledger. Retrieves real-time token consumption, estimated USD expenditure, and breakdowns per provider and model.
- **`action`**: `"get"` (default) or `"clear"` (reset statistics)
- **`provider`**: Optional filter for a specific provider
- **`model`**: Optional filter for a specific model
- **`limit`**: Number of recent transactions to view (default 20)

### 10. `llm_presets`
Manage and apply expert System Personas and Prompt Presets (e.g. `security-auditor`, `systems-architect`, `code-simplifier`, `quant-trader`, `fullstack-reviewer`, `explain-like-pro`).
- **`action`**: `"list"` (default), `"get"`, `"create"`, `"update"`, `"delete"`
- **`name`**: Preset key (e.g. `"security-auditor"`, `"custom-preset"`)
- In `llm_query` and `llm_council`: Pass `preset: "security-auditor"` to automatically inject specialized system instructions and calibrated temperatures without manually copying prompts.

---

## Terminal CLI Management: `agy-llm`

You can also run commands directly from the Antigravity integrated terminal or Windows PowerShell:
```bash
# Manage and list expert system personas
agy-llm preset list
agy-llm preset show security-auditor

# Query using an expert persona
agy-llm ask --preset security-auditor "Audit this authentication endpoint"

# View token expenditure and cost analytics
agy-llm ledger

# Reset ledger
agy-llm ledger clear

# Convene a Multi-Model Council
agy-llm council "Compare Redis vs PostgreSQL for task queues"

# List all providers in the vault
agy-llm list

# Test provider connectivity & latency
agy-llm test dahl

# Fetch live models from endpoint
agy-llm models dahl

# Add a new custom endpoint
agy-llm add my_proxy https://my-custom-proxy.com/v1 my_secret_token custom-model

# Live real-time token streaming with TTFT and tokens/sec telemetry
agy-llm ask --stream "Explain SQLite WAL mode"

# Stream with an expert persona
agy-llm ask --stream --preset security-auditor "Audit this authentication flow"

# Test a prompt
agy-llm ask "Write a fast binary search in Rust"
```
