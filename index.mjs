#!/usr/bin/env node
import readline from 'node:readline';
import { ProviderVault } from './provider-vault.mjs';
import { LLMClient } from './client.mjs';

const vault = new ProviderVault();

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
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'llm_query': {
      const messages = [];
      if (args.system_prompt) {
        messages.push({ role: 'system', content: args.system_prompt });
      }
      messages.push({ role: 'user', content: args.prompt });

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

        return {
          provider_used: 'Ad-hoc Endpoint',
          base_url: resolved.base_url,
          model: result.model,
          latency: `${result.latency_ms}ms`,
          reasoning: result.reasoning || null,
          content: result.content,
          usage: result.usage
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

            return {
              provider_used: resolved.name || resolved.key,
              base_url: resolved.base_url,
              model: result.model,
              latency: `${result.latency_ms}ms`,
              reasoning: result.reasoning || null,
              content: result.content,
              usage: result.usage,
              fallback_occurred: fallbackHistory.length > 0,
              ...(fallbackHistory.length > 0 ? { fallback_history: fallbackHistory } : {})
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
