# Universal LLM Bridge for Google Antigravity Desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![MCP Specification](https://img.shields.io/badge/MCP-2024--11--05-blue.svg)](https://modelcontextprotocol.io/)
[![Google Antigravity](https://img.shields.io/badge/Google-Antigravity%20Desktop-4285F4.svg)](https://antigravity.google)

A robust, enterprise-grade Model Context Protocol (MCP) server, Antigravity Skill, and terminal management CLI (`agy-llm`) that connects **Google Antigravity Desktop** to **ANY** OpenAI-compatible `/v1` endpoint in the world.

Use it with cloud inference clusters, local proxies, and offline models:
- **Cloud Clusters**: [Dahl](https://inference.dahl.global/v1), [DeepSeek](https://api.deepseek.com/v1), [OpenRouter](https://openrouter.ai/api/v1), [Groq](https://api.groq.com/openai/v1), [Cerebras](https://api.cerebras.ai/v1), [Together AI](https://api.together.xyz/v1), [SiliconFlow](https://api.siliconflow.cn/v1)
- **Local Multi-Key Proxies**: [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi), [9Router](http://localhost:20128/v1), [OmniRoute](http://localhost:20128/v1)
- **Local Offline Engines**: [Ollama](http://localhost:11434/v1), [LM Studio](http://localhost:1234/v1), [vLLM](http://localhost:8000/v1)

---

## Architecture Overview

Google Antigravity Desktop operates as an agent-first workspace without legacy extension marketplaces. The **Universal LLM Bridge** provides native, uninterrupted connectivity directly into Antigravity's core agent loop:

```
 ┌────────────────────────────────────────────────────────┐
 │               Google Antigravity Desktop               │
 │                                                        │
 │   ┌───────────────┐     ┌───────────┐    ┌─────────┐   │
 │   │ Primary Agent │ <-> │ Universal │ <->│ agy-llm │   │
 │   │ (Gemini/Core) │     │ LLM Skill │    │   CLI   │   │
 │   └───────┬───────┘     └───────────┘    └─────────┘   │
 └───────────┼────────────────────────────────────────────┘
             │ JSON-RPC 2.0 over Stdio (MCP Protocol)
 ┌───────────▼────────────────────────────────────────────┐
 │         Universal LLM Bridge (MCP Server)              │
 │                                                        │
 │  ┌───────────────────────┐   ┌──────────────────────┐  │
 │  │    Provider Vault     │   │   Adaptive Client    │  │
 │  │ (llm_providers.json)  │   │  (/v1 chat, img, vid)│  │
 │  └───────────────────────┘   └──────────┬───────────┘  │
 └─────────────────────────────────────────┼──────────────┘
                                           │
       ┌───────────────────┬───────────────┴───────────────┬──────────────────┐
       ▼                   ▼                               ▼                  ▼
┌──────────────┐    ┌──────────────┐                ┌──────────────┐   ┌──────────────┐
│     Dahl     │    │  DeepSeek /  │                │ Local Router │   │ Local Offline│
│  Inference   │    │  OpenRouter  │                │(FreeLLMAPI / │   │  (Ollama /   │
│   Cluster    │    │  Groq / Mist │                │   9Router)   │   │  LM Studio)  │
└──────────────┘    └──────────────┘                └──────────────┘   └──────────────┘
```

---

## Key Features

1. **Zero-Downtime Smart Fallback Cascade (Auto 429 / 5xx Recovery)**: Automatically recovers from HTTP 429 rate limits, concurrency exhaustion, or 5xx provider outages. When a target model is overwhelmed, it cascades down your configured sequence (e.g. `dahl` → `groq` → `deepseek` → `ollama`) without interrupting the Antigravity agent loop.
2. **Auto-Discovery Port Scanner (Zero-Config Local AI)**: Automatically probes ports `11434` (Ollama), `1234` (LM Studio), `20128` (9Router/OmniRoute), `4000` (FreeLLMAPI), `8000` (vLLM), `8080` (LocalAI), and `1337` (Jan). Detects active services in under 100ms, lists their loaded models, and auto-populates them into your Antigravity vault.
3. **Smart Prompt Compression (RTK Token-Saver)**: Heuristic compression engine that deduplicates repeated log polling lines, truncates deep library stack frames (e.g. node_modules chains), and normalizes whitespace while strictly preserving code indentation and semantics. Slashes input token consumption by 20% to 50%.
4. **Multi-Model Consensus & Council Deliberation (`llm_council`)**: Queries multiple specialized models simultaneously (e.g., DeepSeek for mathematical logic, Claude/MiniMax for instruction following, Ollama for local verification) and dispatches all perspectives to a Chief Justice / Synthesizer model that cross-examines the candidate answers, catches edge bugs, and synthesizes the single definitive consensus verdict.
5. **Local Cost & Token Usage Ledger (`ledger.mjs`, `llm_get_analytics`, `agy-llm ledger`)**: Persistent local transaction accounting that logs input/output tokens across every query and calculates real-time USD expenditures using built-in rate cards (Dahl, DeepSeek, Groq, OpenRouter, and 100% free offline Ollama/LM Studio).
6. **Zero-Dependency Core**: Pure Node.js ESM runtime using native `fetch` and high-speed stdio streams. Boots in ~15ms with zero npm installation overhead.
7. **Multi-Provider Vault**: Store any number of named provider profiles with custom base URLs, tokens, default models, and custom headers.
8. **DeepSeek-R1 / MiniMax Reasoning Extraction**: Automatically parses `<think>` tags and `reasoning_content` properties so reasoning models never break schemas.
9. **Ad-Hoc Endpoint Overrides**: Query any temporary `/v1` endpoint on the fly simply by passing `endpoint_url` and `api_key` in natural language.
10. **Multi-Modal Support**:
   - Text completions via `/v1/chat/completions`
   - Image generation via `/v1/images/generations` (FLUX.1, DALL-E, SD3)
   - Video generation via `/v1/videos/generations` (LTX-Video, Hailuo, Wan2.1)
11. **Cross-Model Comparison & Benchmarking**: Parallel query runner (`llm_compare`) to benchmark code solutions side-by-side across multiple models.
12. **1-Click Portable Installers**: Seamless setup scripts for Windows, macOS, and Linux to clone and use on any PC.

---

## 1-Click Quickstart (For You & Friends)

### On Windows
1. Clone the repository:
   ```powershell
   git clone https://github.com/libragik/universal-llm-bridge.git
   cd universal-llm-bridge
   ```
2. Run the 1-click installer:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
3. Restart Google Antigravity Desktop.

### On macOS / Linux
1. Clone the repository:
   ```bash
   git clone https://github.com/libragik/universal-llm-bridge.git
   cd universal-llm-bridge
   ```
2. Run the installer:
   ```bash
   chmod +x setup.sh && ./setup.sh
   ```
3. Restart Google Antigravity Desktop.

---

## Configuration

Your providers are stored in `~/.gemini/antigravity/llm_providers.json`.

You can configure providers using the terminal CLI:
```bash
# Add or update a provider
agy-llm add dahl https://inference.dahl.global/v1 <YOUR_DAHL_KEY> MiniMaxAI/MiniMax-M2.7
agy-llm add deepseek https://api.deepseek.com/v1 <YOUR_DEEPSEEK_KEY> deepseek-chat
agy-llm add groq https://api.groq.com/openai/v1 <YOUR_GROQ_KEY> llama-3.3-70b-versatile
agy-llm add ollama http://localhost:11434/v1 ollama qwen2.5-coder:latest

# Set your active default provider
agy-llm set dahl

# Test provider latency and model availability
agy-llm test dahl

# List live models from the provider
agy-llm models dahl
```

---

## Tools Reference in Google Antigravity

Once installed, the following tools are available to the Antigravity agent:

### 1. `llm_query`
Sends a prompt or instruction to any external model.
- **Parameters**:
  - `prompt`: The user query or code snippet.
  - `system_prompt`: Optional system instruction.
  - `model`: Target model name (e.g. `MiniMaxAI/MiniMax-M2.7`, `deepseek-reasoner`, `llama-3.3-70b-versatile`).
  - `provider`: Provider alias from vault (`dahl`, `openrouter`, `deepseek`, `groq`, `ollama`, etc.).
  - `endpoint_url` & `api_key`: Optional ad-hoc overrides.
  - `temperature`: Sampling temperature (0.0 - 1.0).

### 2. `llm_list_models`
Discovers live model IDs from `GET /v1/models` on any endpoint.

### 3. `llm_test_connection`
Pings an endpoint, validates API keys, measures round-trip latency, and confirms token allocations.

### 4. `llm_manage_providers`
Allows Antigravity to add, update, remove, or switch providers programmatically via chat.

### 5. `llm_compare`
Sends an identical prompt to 2 or more providers/models simultaneously and returns latency, reasoning, and code output side-by-side.

### 6. `llm_generate_image`
Generates images using standard `/v1/images/generations` endpoints (SiliconFlow FLUX.1, OpenAI DALL-E, etc.). Automatically downloads the image and creates an embeddable markdown image link in Antigravity.

### 7. `llm_generate_video`
Generates videos via `/v1/videos/generations` endpoints (LTX-Video, Hailuo, etc.).

### 8. `llm_autodetect`
Scans local ports (`11434`, `1234`, `20128`, `4000`, `8000`, `8080`, `1337`) for active local AI engines (Ollama, LM Studio, 9Router, FreeLLMAPI, vLLM, Jan) and synchronizes them directly into the provider vault.

### 9. `llm_compress_prompt`
Standalone RTK prompt compressor that cuts redundant whitespace, poll loops, and deep library frames while preserving code structure.

### 10. `llm_council`
Multi-Model Consensus deliberation. Queries multiple models/providers in parallel and runs an automated Chief Justice cross-examination to synthesize the single optimal consensus solution.

### 11. `llm_get_analytics`
Query real-time token counts and estimated USD costs from the local ledger. Breaks down usage per provider and model with recent transaction logs.

---

## Example Antigravity Chat Prompts

You can speak naturally to Antigravity:
- *"Show me my token usage and estimated LLM costs."*
- *"Convene an AI council to debate whether we should use Redis or PostgreSQL for background jobs."*
- *"Use Dahl to check if there are edge cases in this sorting function."*
- *"Run `llm_test_connection` on my Groq endpoint."*
- *"Compare this SQL query optimization between DeepSeek-V3 and MiniMax-M2.7."*
- *"Scan for local running LLMs and add them to my vault."*
- *"List all models currently online on Dahl."*

---

## CLI (`agy-llm`) Reference

```text
Usage:
  agy-llm list                           List all configured providers
  agy-llm active                         Show current active default provider
  agy-llm set <provider_key>             Set active default provider
  agy-llm test [provider_key]            Test connection & latency to provider
  agy-llm models [provider_key]          Fetch live models list from provider
  agy-llm add <key> <url> [key] [model]  Add or update a provider endpoint
  agy-llm cascade [set prov1 prov2...]   View or set the automatic failover cascade
  agy-llm scan                           Auto-scan local ports for running AI engines
  agy-llm compress <text>                Compress prompt text and preview token savings
  agy-llm council [--members p1:m1,p2]   Multi-model consensus deliberation & verdict
  agy-llm ledger [clear]                 View token consumption & estimated USD costs
  agy-llm ask [--compress] <prompt>      Quick test query using active provider
  agy-llm remove <provider_key>          Remove a provider from vault
```

---

## Security & Privacy

- **No Secrets in Git**: `llm_providers.json` and `.env` are automatically ignored by `.gitignore`.
- **Local-Only Communication**: The bridge communicates over local standard I/O (stdio) with Antigravity. No middleman tracking or telemetry.
- **Direct Requests**: All API calls go directly from your local machine to the configured base URL.

---

## License

MIT License — free for individual and commercial use.
