#!/usr/bin/env node
import readline from 'node:readline';
import { ProviderVault } from './provider-vault.mjs';
import { LLMClient } from './client.mjs';
import { LocalScanner } from './scanner.mjs';
import { PromptCompressor } from './compressor.mjs';
import { CouncilEngine } from './council.mjs';
import { TokenLedger } from './ledger.mjs';
import { PresetVault } from './presets.mjs';

const vault = new ProviderVault();
const ledger = new TokenLedger();
const presetVault = new PresetVault();
const councilEngine = new CouncilEngine(vault, ledger, presetVault);

const TOOLS = [
  {
    name: 'llm_query',
    description: 'Query ANY external LLM using an OpenAI-compatible /v1 endpoint (e.g. Dahl, DeepSeek, OpenRouter, Groq, Ollama, LM Studio, FreeLLMAPI, 9Router, OmniRoute, or any custom endpoint). Supports reasoning/thinking extraction, custom system prompts, and ad-hoc endpoint overrides.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The user prompt or query to send to the model.'
        },
        system_prompt: {
          type: 'string',
          description: 'Optional system instructions or role specification.'
        },
        model: {
          type: 'string',
          description: 'The specific model name/ID (e.g., "MiniMaxAI/MiniMax-M2.7", "deepseek-ai/DeepSeek-V4-Flash-0731", "deepseek-reasoner", "llama-3.3-70b-versatile"). If omitted, uses the provider default.'
        },
        provider: {
          type: 'string',
          description: 'The provider alias to use from vault: "dahl", "openrouter", "deepseek", "groq", "ollama", "lmstudio", "freellmapi", "9router", "omniroute", "cerebras", or custom name. Defaults to active provider.'
        },
        endpoint_url: {
          type: 'string',
          description: 'Ad-hoc OpenAI-compatible /v1 base URL (e.g., "https://inference.dahl.global/v1" or "http://localhost:11434/v1"). Overrides the provider vault.'
        },
        api_key: {
          type: 'string',
          description: 'Ad-hoc API key to use with the endpoint_url or provider.'
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0.0 to 1.0). Default is 0.7.'
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens to generate.'
        },
        fallback: {
          type: 'boolean',
          description: 'Enable smart zero-downtime fallback cascade if the primary provider returns HTTP 429 (rate limit) or 5xx error. Default is true.'
        },
        fallback_chain: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom array of provider keys to try in sequence if primary fails (e.g. ["dahl", "groq", "deepseek", "ollama"]).'
        },
        compress_tokens: {
          type: 'boolean',
          description: 'Enable RTK Smart Prompt Compression to strip redundant whitespace, duplicate logs, and deep library stack traces, saving 20%-40% on input tokens. Default is false.'
        },
        preset: {
          type: 'string',
          description: "Name of system persona or prompt preset to apply (e.g. 'security-auditor', 'systems-architect', 'code-simplifier', 'quant-trader', 'fullstack-reviewer', 'explain-like-pro', or custom preset name). Automatically injects specialized system prompt and optimal temperature."
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'llm_list_models',
    description: 'List available models from an OpenAI-compatible /v1 endpoint by calling GET /v1/models.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'The provider alias from the vault (e.g., "dahl", "openrouter", "ollama", "groq").'
        },
        endpoint_url: {
          type: 'string',
          description: 'Ad-hoc /v1 base URL to inspect directly.'
        },
        api_key: {
          type: 'string',
          description: 'Ad-hoc API key for the endpoint.'
        }
      }
    }
  },
  {
    name: 'llm_test_connection',
    description: 'Test connectivity, latency, and credentials for any LLM endpoint or configured provider.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'The provider alias to test (e.g., "dahl", "groq", "ollama", "openrouter").'
        },
        endpoint_url: {
          type: 'string',
          description: 'Ad-hoc /v1 base URL to test directly.'
        },
        api_key: {
          type: 'string',
          description: 'Ad-hoc API key for testing.'
        }
      }
    }
  },
  {
    name: 'llm_manage_providers',
    description: 'Manage configured LLM providers in your Antigravity vault. List all providers, add a new endpoint, set active default, or update API keys.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get_active', 'set_active', 'add_or_update', 'remove', 'get_fallback_cascade', 'set_fallback_cascade'],
          description: 'Action to perform on the vault.'
        },
        fallback_cascade: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of provider keys to set as the fallback cascade sequence.'
        },
        provider_key: {
          type: 'string',
          description: 'Unique key/alias for the provider (e.g., "my_vllm", "dahl", "work_proxy").'
        },
        name: {
          type: 'string',
          description: 'Human-readable display name for the provider.'
        },
        base_url: {
          type: 'string',
          description: 'The OpenAI-compatible /v1 base URL (e.g., "https://inference.dahl.global/v1").'
        },
        api_key: {
          type: 'string',
          description: 'The API key for authentication.'
        },
        default_model: {
          type: 'string',
          description: 'Default model name to use when none is specified.'
        },
        description: {
          type: 'string',
          description: 'Optional description of this provider.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'llm_compare',
    description: 'Benchmark and compare responses to the exact same prompt across multiple models or providers in parallel (e.g. Dahl vs DeepSeek vs Groq vs Ollama).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to send to all candidate models.'
        },
        system_prompt: {
          type: 'string',
          description: 'Optional system prompt for all candidates.'
        },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              model: { type: 'string' },
              endpoint_url: { type: 'string' },
              api_key: { type: 'string' }
            }
          },
          description: 'List of target models/providers to compare.'
        }
      },
      required: ['prompt', 'candidates']
    }
  },
  {
    name: 'llm_generate_image',
    description: 'Generate an image using ANY external /v1 endpoint that supports image generation (e.g., SiliconFlow, Together AI, OpenAI DALL-E, OpenRouter, or local ComfyUI/Diffusers bridge). Saves the generated image locally and returns an embeddable file path.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate.'
        },
        model: {
          type: 'string',
          description: 'The image generation model (e.g. "black-forest-labs/FLUX.1-schnell", "dall-e-3", "stabilityai/stable-diffusion-3-medium").'
        },
        provider: {
          type: 'string',
          description: 'Provider alias from vault (e.g. "siliconflow", "together", "openai", "openrouter").'
        },
        endpoint_url: {
          type: 'string',
          description: 'Ad-hoc /v1 base URL supporting /v1/images/generations.'
        },
        api_key: {
          type: 'string',
          description: 'API key for authentication.'
        },
        size: {
          type: 'string',
          description: 'Image dimensions, e.g. "1024x1024", "1792x1024", "1024x1792". Default "1024x1024".'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'llm_generate_video',
    description: 'Generate a video using an external /v1 endpoint that supports video generation (e.g., SiliconFlow LTX-Video, Together, MiniMax Hailuo Video, or custom video bridge).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the video to generate.'
        },
        model: {
          type: 'string',
          description: 'Video model name (e.g., "Lightricks/LTX-Video", "kling", "cogvideox").'
        },
        provider: {
          type: 'string',
          description: 'Provider alias from vault.'
        },
        endpoint_url: {
          type: 'string',
          description: 'Ad-hoc /v1 base URL supporting /v1/videos/generations.'
        },
        api_key: {
          type: 'string',
          description: 'API key for authentication.'
        },
        duration: {
          type: 'number',
          description: 'Duration in seconds (e.g. 5).'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'llm_autodetect',
    description: 'Auto-scan local network ports for running AI servers (Ollama on 11434, LM Studio on 1234, 9Router/OmniRoute on 20128, FreeLLMAPI on 4000, vLLM on 8000, LocalAI on 8080, Jan on 1337). Detects online engines, lists their active models, and automatically syncs them into your Antigravity vault.',
    inputSchema: {
      type: 'object',
      properties: {
        auto_sync: {
          type: 'boolean',
          description: 'If true (default), automatically adds/updates discovered local engines into your provider vault.'
        },
        custom_ports: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Optional additional local ports to probe (e.g. [8001, 9000]).'
        },
        timeout_ms: {
          type: 'integer',
          description: 'Timeout in milliseconds per probe (default 1200).'
        }
      }
    }
  },
  {
    name: 'llm_compress_prompt',
    description: 'Compress any prompt, code block, log output, or stack trace using RTK Smart Compression to strip redundant whitespace, duplicate lines, and deep library frames while maintaining code semantics. Returns token savings metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text or code to compress.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'llm_council',
    description: 'Multi-Model Consensus & Council Deliberation. Broadcasts a complex problem, code architecture, or security audit in parallel to multiple LLM council members (e.g. Dahl, DeepSeek, Groq, Ollama), then automatically uses a designated Chief Justice / Synthesizer model to critique, cross-examine, and deliver the single optimal consensus solution.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The complex task, technical dilemma, code bug, or architectural question for council deliberation.'
        },
        system_prompt: {
          type: 'string',
          description: 'Optional system prompt applied to all council member models.'
        },
        members: {
          type: 'array',
          description: 'List of council member models/providers. Defaults to active provider + fallback chain if omitted.',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string', description: "Provider alias from vault (e.g. 'dahl', 'groq', 'ollama')." },
              model: { type: 'string', description: 'Model ID to query for this member.' },
              name: { type: 'string', description: "Custom label (e.g. 'Security Auditor', 'Rust Expert')." },
              role_description: { type: 'string', description: 'Domain specialty description.' },
              endpoint_url: { type: 'string', description: 'Ad-hoc /v1 URL.' },
              api_key: { type: 'string', description: 'Ad-hoc API key.' }
            }
          }
        },
        judge: {
          type: 'object',
          description: 'Chief Justice / Synthesizer configuration. Defaults to active default model.',
          properties: {
            provider: { type: 'string', description: 'Provider alias from vault for the judge.' },
            model: { type: 'string', description: 'Model ID for synthesis.' },
            name: { type: 'string', description: 'Display name of judge.' },
            endpoint_url: { type: 'string' },
            api_key: { type: 'string' }
          }
        },
        synthesis_instruction: {
          type: 'string',
          description: "Custom adjudication instructions for the Chief Justice (e.g. 'Focus on lowest latency and minimal memory footprint')."
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature for member generation (default 0.7).'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'llm_get_analytics',
    description: 'Retrieve comprehensive cost, token usage, and latency analytics from the Antigravity Local LLM Ledger. View total tokens spent, estimated USD expenditure, breakdowns per provider (Dahl, Groq, DeepSeek, Ollama) and per model, or reset ledger statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'clear'],
          description: "Action to perform: 'get' (default) returns current analytics and recent transactions; 'clear' resets the ledger counters."
        },
        provider: {
          type: 'string',
          description: 'Optional filter: get analytics or transactions specifically for this provider alias.'
        },
        model: {
          type: 'string',
          description: 'Optional filter: get analytics or transactions for this specific model.'
        },
        limit: {
          type: 'integer',
          description: 'Number of recent query transactions to include (default 20).'
        }
      }
    }
  },
  {
    name: 'llm_presets',
    description: "Manage and inspect expert System Personas and Prompt Presets (e.g. 'security-auditor', 'systems-architect', 'code-simplifier', 'quant-trader', 'fullstack-reviewer', 'explain-like-pro'). List available personas, view system prompts, or save custom domain presets to the vault.",
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update', 'delete'],
          description: "Action to perform on preset vault: 'list' (default), 'get', 'create', 'update', 'delete'."
        },
        name: {
          type: 'string',
          description: "Preset name/key (e.g. 'security-auditor', 'systems-architect', 'my-custom-preset')."
        },
        title: {
          type: 'string',
          description: 'Display title for the preset.'
        },
        description: {
          type: 'string',
          description: 'Short explanation of the persona or domain specialty.'
        },
        system_prompt: {
          type: 'string',
          description: 'The system prompt defining the persona expertise and guidelines (required for create/update).'
        },
        temperature: {
          type: 'number',
          description: 'Recommended sampling temperature (0.0 to 1.0).'
        },
        default_model: {
          type: 'string',
          description: 'Optional model to bind to this preset.'
        }
      }
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'llm_query': {
      if (args.preset) {
        const found = presetVault.getPreset(args.preset);
        if (!found) {
          throw new Error(`Preset "${args.preset}" not found. Available presets: ${presetVault.listPresets().map(p => p.name).join(', ')}`);
        }
        if (!args.system_prompt) {
          args.system_prompt = found.system_prompt;
        } else {
          args.system_prompt = `${found.system_prompt}\n\nAdditional Instructions:\n${args.system_prompt}`;
        }
        if (args.temperature === undefined && found.temperature !== undefined) {
          args.temperature = found.temperature;
        }
        if (!args.model && found.default_model) {
          args.model = found.default_model;
        }
      }

      let messages = [];
      if (args.system_prompt) {
        messages.push({ role: 'system', content: args.system_prompt });
      }
      messages.push({ role: 'user', content: args.prompt });

      let compressionStats = null;
      if (args.compress_tokens) {
        const comp = PromptCompressor.compressMessages(messages);
        messages = comp.messages;
        compressionStats = comp.stats;
      }

      // Build the candidate sequence:
      // If ad-hoc endpoint_url is passed without custom chain, try it directly
      if (args.endpoint_url && !args.fallback_chain) {
        const resolved = vault.resolveProvider({
          endpointUrl: args.endpoint_url,
          apiKey: args.api_key,
          model: args.model
        });

        const result = await LLMClient.chatCompletion({
          baseUrl: resolved.base_url,
          apiKey: resolved.api_key,
          model: args.model || resolved.default_model,
          messages,
          temperature: args.temperature ?? 0.7,
          maxTokens: args.max_tokens ?? null,
          customHeaders: resolved.headers || {}
        });

        ledger.record({
          provider: 'adhoc',
          model: result.model,
          promptTokens: result.usage?.prompt_tokens || 0,
          completionTokens: result.usage?.completion_tokens || 0,
          totalTokens: result.usage?.total_tokens || 0,
          latencyMs: result.latency_ms,
          tool: 'llm_query'
        });

        return {
          provider_used: 'Ad-hoc Endpoint',
          base_url: resolved.base_url,
          model: result.model,
          latency: `${result.latency_ms}ms`,
          reasoning: result.reasoning || null,
          content: result.content,
          usage: result.usage,
          ...(compressionStats && compressionStats.saved_tokens > 0 ? {
            compression: {
              tokens_saved: compressionStats.saved_tokens,
              savings: compressionStats.savings_percent,
              original_tokens_est: compressionStats.original_tokens,
              compressed_tokens_est: compressionStats.compressed_tokens
            }
          } : {})
        };
      }

      // Smart Fallback Cascade
      const fallbackEnabled = args.fallback !== false;
      const chain = args.fallback_chain || vault.getFallbackChain(args.provider);
      const candidatesToTry = fallbackEnabled ? chain : [chain[0]];

      const fallbackHistory = [];
      let lastError = null;

      for (let i = 0; i < candidatesToTry.length; i++) {
        const providerKey = candidatesToTry[i];
        let resolved;
        try {
          resolved = vault.resolveProvider({
            providerKey,
            apiKey: i === 0 ? args.api_key : null,
            model: i === 0 ? args.model : null
          });
        } catch (resolveErr) {
          continue;
        }

        // Models to attempt on this provider
        const modelsToTry = [];
        const preferredModel = (i === 0 && args.model) ? args.model : resolved.default_model;
        if (preferredModel) modelsToTry.push(preferredModel);

        // If provider specifies fallback models or has a model list, append them
        const alternateModels = Array.isArray(resolved.fallback_models)
          ? resolved.fallback_models
          : Array.isArray(resolved.models)
          ? resolved.models
          : [];
        for (const m of alternateModels) {
          if (!modelsToTry.includes(m)) modelsToTry.push(m);
        }

        for (const modelAttempt of modelsToTry) {
          try {
            const result = await LLMClient.chatCompletion({
              baseUrl: resolved.base_url,
              apiKey: resolved.api_key,
              model: modelAttempt,
              messages,
              temperature: args.temperature ?? 0.7,
              maxTokens: args.max_tokens ?? null,
              customHeaders: resolved.headers || {}
            });

            ledger.record({
              provider: resolved.key || resolved.name,
              model: result.model,
              promptTokens: result.usage?.prompt_tokens || 0,
              completionTokens: result.usage?.completion_tokens || 0,
              totalTokens: result.usage?.total_tokens || 0,
              latencyMs: result.latency_ms,
              tool: 'llm_query'
            });

            return {
              provider_used: resolved.name || resolved.key,
              base_url: resolved.base_url,
              model: result.model,
              latency: `${result.latency_ms}ms`,
              reasoning: result.reasoning || null,
              content: result.content,
              usage: result.usage,
              fallback_occurred: fallbackHistory.length > 0,
              ...(fallbackHistory.length > 0 ? { fallback_history: fallbackHistory } : {}),
              ...(compressionStats && compressionStats.saved_tokens > 0 ? {
                compression: {
                  tokens_saved: compressionStats.saved_tokens,
                  savings: compressionStats.savings_percent,
                  original_tokens_est: compressionStats.original_tokens,
                  compressed_tokens_est: compressionStats.compressed_tokens
                }
              } : {})
            };
          } catch (attemptErr) {
            fallbackHistory.push({
              provider: resolved.key,
              model: modelAttempt,
              status: attemptErr.status || 'network_error',
              error: attemptErr.message
            });
            lastError = attemptErr;

            if (!fallbackEnabled || (!attemptErr.isRetryable && attemptErr.status === 401)) {
              throw attemptErr;
            }
          }
        }
      }

      throw new Error(
        `All candidates in fallback cascade failed (${candidatesToTry.join(' -> ')}):\n` +
        fallbackHistory.map(h => `  [${h.provider} (${h.model})]: ${h.error}`).join('\n')
      );
    }

    case 'llm_list_models': {
      const resolved = vault.resolveProvider({
        providerKey: args.provider,
        endpointUrl: args.endpoint_url,
        apiKey: args.api_key
      });

      const models = await LLMClient.listModels({
        baseUrl: resolved.base_url,
        apiKey: resolved.api_key,
        customHeaders: resolved.headers || {}
      });

      return {
        provider: resolved.name || resolved.key,
        base_url: resolved.base_url,
        count: models.length,
        models
      };
    }

    case 'llm_test_connection': {
      const resolved = vault.resolveProvider({
        providerKey: args.provider,
        endpointUrl: args.endpoint_url,
        apiKey: args.api_key
      });

      const testResult = await LLMClient.testConnection({
        baseUrl: resolved.base_url,
        apiKey: resolved.api_key,
        customHeaders: resolved.headers || {}
      });

      return {
        provider: resolved.name || resolved.key,
        base_url: resolved.base_url,
        ...testResult
      };
    }

    case 'llm_manage_providers': {
      const action = args.action;
      if (action === 'list') {
        const providers = vault.getProviders();
        const active = vault.getActiveProvider();
        return {
          active_provider: active.key,
          providers: Object.entries(providers).map(([key, p]) => ({
            key,
            name: p.name,
            base_url: p.base_url,
            default_model: p.default_model,
            has_api_key: Boolean(p.api_key && p.api_key.trim()),
            description: p.description
          }))
        };
      }

      if (action === 'get_active') {
        return vault.getActiveProvider();
      }

      if (action === 'set_active') {
        if (!args.provider_key) {
          throw new Error('provider_key is required for set_active');
        }
        const active = vault.setActiveProvider(args.provider_key);
        return { message: `Active provider set to "${active}"`, active_provider: active };
      }

      if (action === 'add_or_update') {
        if (!args.provider_key) throw new Error('provider_key is required');
        const updateData = {};
        if (args.name) updateData.name = args.name;
        if (args.base_url) updateData.base_url = args.base_url;
        if (args.api_key !== undefined) updateData.api_key = args.api_key;
        if (args.default_model) updateData.default_model = args.default_model;
        if (args.description) updateData.description = args.description;

        const updated = vault.setProvider(args.provider_key, updateData);
        return {
          message: `Provider "${args.provider_key}" saved successfully.`,
          provider: {
            key: args.provider_key,
            ...updated,
            api_key: updated.api_key ? '***configured***' : ''
          }
        };
      }

      if (action === 'get_fallback_cascade') {
        const cascade = vault.getFallbackChain();
        return {
          fallback_cascade: cascade,
          description: 'Automatic failover sequence when a provider encounters HTTP 429 rate limit or 5xx server downtime.'
        };
      }

      if (action === 'set_fallback_cascade') {
        if (!Array.isArray(args.fallback_cascade)) {
          throw new Error('fallback_cascade must be an array of provider keys');
        }
        const updated = vault.setFallbackChain(args.fallback_cascade);
        return {
          message: 'Fallback cascade updated successfully.',
          fallback_cascade: updated
        };
      }

      throw new Error(`Unknown action "${action}"`);
    }

    case 'llm_compare': {
      const candidates = args.candidates || [];
      if (candidates.length === 0) {
        throw new Error('Please provide at least one candidate in candidates array.');
      }

      const results = await Promise.allSettled(
        candidates.map(async cand => {
          const resolved = vault.resolveProvider({
            providerKey: cand.provider,
            endpointUrl: cand.endpoint_url,
            apiKey: cand.api_key,
            model: cand.model
          });
          const modelName = cand.model || resolved.default_model;
          const messages = [];
          if (args.system_prompt) {
            messages.push({ role: 'system', content: args.system_prompt });
          }
          messages.push({ role: 'user', content: args.prompt });

          const res = await LLMClient.chatCompletion({
            baseUrl: resolved.base_url,
            apiKey: resolved.api_key,
            model: modelName,
            messages,
            customHeaders: resolved.headers || {}
          });

          ledger.record({
            provider: resolved.key || resolved.name,
            model: modelName,
            promptTokens: res.usage?.prompt_tokens || 0,
            completionTokens: res.usage?.completion_tokens || 0,
            totalTokens: res.usage?.total_tokens || 0,
            latencyMs: res.latency_ms,
            tool: 'llm_compare'
          });

          return {
            target: `${resolved.name || resolved.key} (${modelName})`,
            latency: `${res.latency_ms}ms`,
            reasoning: res.reasoning,
            content: res.content,
            usage: res.usage
          };
        })
      );

      return {
        prompt: args.prompt,
        comparisons: results.map((r, i) => {
          if (r.status === 'fulfilled') {
            return r.value;
          }
          return {
            target: JSON.stringify(candidates[i]),
            error: r.reason?.message || String(r.reason)
          };
        })
      };
    }

    case 'llm_generate_image': {
      const resolved = vault.resolveProvider({
        providerKey: args.provider,
        endpointUrl: args.endpoint_url,
        apiKey: args.api_key
      });

      const model = args.model || 'dall-e-3';
      const result = await LLMClient.generateImage({
        baseUrl: resolved.base_url,
        apiKey: resolved.api_key,
        model,
        prompt: args.prompt,
        size: args.size || '1024x1024',
        customHeaders: resolved.headers || {}
      });

      return {
        provider_used: resolved.name || resolved.key,
        model,
        local_path: result.local_path,
        url: result.url,
        markdown_embed: result.local_path
          ? `![Generated Image](file:///${result.local_path.replace(/\\/g, '/')})`
          : result.url
          ? `![Generated Image](${result.url})`
          : null,
        revised_prompt: result.revised_prompt,
        latency: `${result.latency_ms}ms`
      };
    }

    case 'llm_generate_video': {
      const resolved = vault.resolveProvider({
        providerKey: args.provider,
        endpointUrl: args.endpoint_url,
        apiKey: args.api_key
      });

      const model = args.model || 'video-model';
      const result = await LLMClient.generateVideo({
        baseUrl: resolved.base_url,
        apiKey: resolved.api_key,
        model,
        prompt: args.prompt,
        duration: args.duration || 5,
        customHeaders: resolved.headers || {}
      });

      return {
        provider_used: resolved.name || resolved.key,
        model,
        url: result.url,
        task_id: result.task_id,
        status: result.status,
        latency: `${result.latency_ms}ms`
      };
    }

    case 'llm_autodetect': {
      const scan = await LocalScanner.scanAll({
        timeoutMs: args.timeout_ms || 1200,
        customPorts: args.custom_ports || []
      });

      let synced = [];
      if (args.auto_sync !== false && scan.online_count > 0) {
        synced = LocalScanner.syncWithVault(vault, scan);
      }

      return {
        message: scan.online_count > 0
          ? `Discovered ${scan.online_count} online local AI service(s).`
          : 'No local AI services currently detected on standard ports (11434, 1234, 20128, 4000, 8000, 8080, 1337, 5000).',
        online_count: scan.online_count,
        online_services: scan.online_services,
        vault_synced: synced,
        total_scanned: scan.total_scanned
      };
    }

    case 'llm_compress_prompt': {
      const res = PromptCompressor.compress(args.text);
      return {
        original_tokens_est: res.original_tokens,
        compressed_tokens_est: res.compressed_tokens,
        saved_tokens: res.saved_tokens,
        savings_percent: res.savings_percent,
        compressed_text: res.compressed
      };
    }

    case 'llm_council': {
      return await councilEngine.deliberate({
        prompt: args.prompt,
        system_prompt: args.system_prompt,
        members: args.members,
        judge: args.judge,
        temperature: args.temperature,
        synthesis_instruction: args.synthesis_instruction
      });
    }

    case 'llm_get_analytics': {
      if (args.action === 'clear') {
        ledger.clear();
        return {
          message: 'Local LLM Ledger statistics have been reset successfully.',
          status: 'cleared'
        };
      }

      return ledger.getAnalytics({
        limit: args.limit || 20,
        provider: args.provider,
        model: args.model
      });
    }

    case 'llm_presets': {
      const action = args.action || 'list';
      if (action === 'list') {
        const list = presetVault.listPresets();
        return {
          presets: list,
          count: list.length
        };
      }

      if (action === 'get') {
        if (!args.name) throw new Error('Preset "name" is required for get action.');
        const p = presetVault.getPreset(args.name);
        if (!p) throw new Error(`Preset "${args.name}" not found.`);
        return { preset: p };
      }

      if (action === 'create' || action === 'update') {
        if (!args.name) throw new Error('Preset "name" is required.');
        if (!args.system_prompt) throw new Error('"system_prompt" is required.');
        const saved = presetVault.setPreset(args.name, {
          title: args.title,
          description: args.description,
          system_prompt: args.system_prompt,
          temperature: args.temperature,
          default_model: args.default_model
        });
        return {
          message: `Preset "${args.name}" saved successfully.`,
          preset: saved
        };
      }

      if (action === 'delete') {
        if (!args.name) throw new Error('Preset "name" is required.');
        presetVault.deletePreset(args.name);
        return {
          message: `Preset "${args.name}" deleted successfully.`
        };
      }

      throw new Error(`Unknown action "${action}"`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Stdio JSON-RPC MCP Server Engine
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result) {
  const payload = {
    jsonrpc: '2.0',
    id,
    result
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function sendError(id, code, message, data = null) {
  const payload = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

rl.on('line', async line => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (err) {
    sendError(null, -32700, `Parse error: ${err.message}`);
    return;
  }

  const { id, method, params } = message;

  // Notification (no ID)
  if (id === undefined || id === null) {
    return;
  }

  try {
    switch (method) {
      case 'initialize': {
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'universal-llm-bridge',
            version: '1.0.0'
          }
        });
        break;
      }

      case 'tools/list': {
        sendResponse(id, {
          tools: TOOLS
        });
        break;
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = params || {};
        try {
          const result = await handleToolCall(name, toolArgs || {});
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ],
            isError: false
          });
        } catch (toolErr) {
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: toolErr.message,
                    details: toolErr.details || null
                  },
                  null,
                  2
                )
              }
            ],
            isError: true
          });
        }
        break;
      }

      default:
        sendError(id, -32601, `Method not found: ${method}`);
        break;
    }
  } catch (handlerErr) {
    sendError(id, -32603, `Internal error: ${handlerErr.message}`);
  }
});

process.on('uncaughtException', err => {
  process.stderr.write(`[universal-llm-bridge] Uncaught error: ${err.stack || err}\n`);
});
