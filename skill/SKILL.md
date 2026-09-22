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

### 2. `llm_list_models`
Discover available models by calling `GET /v1/models` on any endpoint.

### 3. `llm_test_connection`
Test endpoint reachability, measure latency in milliseconds, and verify API token validity.

### 4. `llm_manage_providers`
Add new endpoints, update credentials, list configured vaults, or switch default active provider without restarting Antigravity.

### 5. `llm_compare`
Run an identical prompt across multiple endpoints or models concurrently to compare output quality, latency, and reasoning traces.

---

## Terminal CLI Management: `agy-llm`

You can also run commands directly from the Antigravity integrated terminal or Windows PowerShell:
```bash
# List all providers in the vault
agy-llm list

# Test provider connectivity & latency
agy-llm test dahl

# Fetch live models from endpoint
agy-llm models dahl

# Add a new custom endpoint
agy-llm add my_proxy https://my-custom-proxy.com/v1 my_secret_token custom-model

# Test a prompt
agy-llm ask "Write a fast binary search in Rust"
```
