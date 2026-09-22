import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GLOBAL_CONFIG_PATH = path.join(
  os.homedir(),
  '.gemini',
  'antigravity',
  'llm_providers.json'
);

const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'llm_providers.json');

const DEFAULT_CONFIG = {
  active_provider: 'dahl',
  fallback_cascade: ['dahl', 'groq', 'deepseek', 'openrouter', 'ollama'],
  providers: {
    dahl: {
      name: 'Dahl Inference Cluster',
      base_url: 'https://inference.dahl.global/v1',
      api_key: '',
      default_model: 'MiniMaxAI/MiniMax-M2.7',
      fallback_models: ['MiniMaxAI/MiniMax-M2.7', 'zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4-Flash-0731'],
      models: [
        'MiniMaxAI/MiniMax-M2.7',
        'deepseek-ai/DeepSeek-V4-Flash-0731',
        'zai-org/GLM-5.3-Flash'
      ],
      description: 'Dahl high-throughput vLLM cluster with MiniMax, DeepSeek, and GLM'
    },
    openrouter: {
      name: 'OpenRouter',
      base_url: 'https://openrouter.ai/api/v1',
      api_key: '',
      default_model: 'deepseek/deepseek-r1',
      models: ['anthropic/claude-3.7-sonnet', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct'],
      headers: {
        'HTTP-Referer': 'https://antigravity.google',
        'X-Title': 'Google Antigravity'
      },
      description: 'Unified gateway to 300+ models'
    },
    deepseek: {
      name: 'DeepSeek Official API',
      base_url: 'https://api.deepseek.com/v1',
      api_key: '',
      default_model: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      description: 'Official DeepSeek V3 and R1 reasoning'
    },
    groq: {
      name: 'Groq Cloud (Ultra-Fast LPU)',
      base_url: 'https://api.groq.com/openai/v1',
      api_key: '',
      default_model: 'llama-3.3-70b-versatile',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b'],
      description: 'Real-time 500+ tok/s inference'
    },
    siliconflow: {
      name: 'SiliconFlow Multi-Modal',
      base_url: 'https://api.siliconflow.cn/v1',
      api_key: '',
      default_model: 'deepseek-ai/DeepSeek-V3',
      models: ['deepseek-ai/DeepSeek-V3', 'black-forest-labs/FLUX.1-schnell', 'Lightricks/LTX-Video'],
      description: 'Text, Image (FLUX), and Video (LTX-Video) inference'
    },
    cerebras: {
      name: 'Cerebras Inference',
      base_url: 'https://api.cerebras.ai/v1',
      api_key: '',
      default_model: 'llama3.3-70b',
      models: ['llama3.3-70b', 'llama3.1-8b'],
      description: 'Ultra-fast wafer-scale Llama 3.3'
    },
    ollama: {
      name: 'Ollama Local Instance',
      base_url: 'http://localhost:11434/v1',
      api_key: 'ollama',
      default_model: 'qwen2.5-coder:latest',
      models: ['qwen2.5-coder:latest', 'llama3.3:latest', 'deepseek-r1:latest'],
      description: 'Completely offline local models on your GPU/CPU'
    },
    lmstudio: {
      name: 'LM Studio Local Server',
      base_url: 'http://localhost:1234/v1',
      api_key: 'lmstudio',
      default_model: 'local-model',
      models: [],
      description: 'Local OpenAI server running via LM Studio'
    },
    freellmapi: {
      name: 'FreeLLMAPI Aggregator',
      base_url: 'http://localhost:4000/v1',
      api_key: 'freellmapi',
      default_model: 'auto',
      models: [],
      description: 'Local multi-key free quota coordination layer'
    },
    '9router': {
      name: '9Router Subscription Cascade',
      base_url: 'http://localhost:20128/v1',
      api_key: '9router',
      default_model: 'auto',
      models: [],
      description: 'Subscription cascade & RTK token saver proxy'
    },
    omniroute: {
      name: 'OmniRoute Smart Proxy',
      base_url: 'http://localhost:20128/v1',
      api_key: 'omniroute',
      default_model: 'auto',
      models: [],
      description: 'Local multi-strategy proxy & fallback router'
    }
  }
};

export class ProviderVault {
  constructor(configPath = null) {
    if (configPath) {
      this.configPath = configPath;
    } else if (fs.existsSync(LOCAL_CONFIG_PATH)) {
      this.configPath = LOCAL_CONFIG_PATH;
    } else {
      this.configPath = GLOBAL_CONFIG_PATH;
    }
    this.ensureConfigExists();
  }

  ensureConfigExists() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }
  }

  load() {
    try {
      this.ensureConfigExists();
      const raw = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  save(data) {
    this.ensureConfigExists();
    fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf8');
  }

  getProviders() {
    const config = this.load();
    return config.providers || {};
  }

  getActiveProvider() {
    const config = this.load();
    const activeKey = config.active_provider || Object.keys(config.providers || {})[0] || 'dahl';
    const provider = config.providers?.[activeKey] || Object.values(config.providers || {})[0];
    return { key: activeKey, ...provider };
  }

  setActiveProvider(key) {
    const config = this.load();
    if (!config.providers?.[key]) {
      throw new Error(`Provider "${key}" not found in vault. Available: ${Object.keys(config.providers || {}).join(', ')}`);
    }
    config.active_provider = key;
    this.save(config);
    return config.active_provider;
  }

  resolveProvider({ providerKey, endpointUrl, apiKey, model }) {
    const config = this.load();

    if (endpointUrl) {
      return {
        key: 'adhoc',
        name: 'Ad-hoc Endpoint',
        base_url: endpointUrl.replace(/\/+$/, ''),
        api_key: apiKey || '',
        default_model: model || 'default',
        headers: {}
      };
    }

    const key = providerKey || config.active_provider || Object.keys(config.providers || {})[0];
    const found = config.providers?.[key];
    if (!found) {
      throw new Error(`Provider "${key}" is not configured. Add it or pick from: ${Object.keys(config.providers || {}).join(', ')}`);
    }

    return {
      key,
      ...found,
      base_url: (found.base_url || '').replace(/\/+$/, ''),
      api_key: apiKey || found.api_key || '',
      default_model: model || found.default_model
    };
  }

  setProvider(key, data) {
    const config = this.load();
    config.providers = config.providers || {};
    config.providers[key] = {
      ...(config.providers[key] || {}),
      ...data,
      base_url: (data.base_url || config.providers[key]?.base_url || '').replace(/\/+$/, '')
    };
    this.save(config);
    return config.providers[key];
  }

  removeProvider(key) {
    const config = this.load();
    if (config.providers?.[key]) {
      delete config.providers[key];
      if (config.active_provider === key) {
        config.active_provider = Object.keys(config.providers)[0] || null;
      }
      this.save(config);
      return true;
    }
    return false;
  }

  getFallbackChain(primaryKey = null) {
    const config = this.load();
    const globalCascade = config.fallback_cascade || ['dahl', 'groq', 'deepseek', 'openrouter', 'ollama'];
    const active = primaryKey || config.active_provider || globalCascade[0];
    
    const unique = [active];
    for (const key of globalCascade) {
      if (!unique.includes(key) && config.providers?.[key]) {
        // Only include if provider has api_key configured OR is local (ollama/lmstudio)
        const p = config.providers[key];
        const isLocal = p.base_url.includes('localhost') || p.base_url.includes('127.0.0.1');
        if (p.api_key?.trim() || isLocal) {
          unique.push(key);
        }
      }
    }
    return unique;
  }

  setFallbackChain(chain) {
    if (!Array.isArray(chain)) throw new Error('Fallback chain must be an array of provider keys');
    const config = this.load();
    config.fallback_cascade = chain;
    this.save(config);
    return config.fallback_cascade;
  }
}
