import { LLMClient } from './client.mjs';

export const KNOWN_LOCAL_PROBES = [
  {
    key: 'ollama',
    name: 'Ollama Local Engine',
    baseUrl: 'http://localhost:11434/v1',
    port: 11434,
    defaultKey: 'ollama',
    description: 'Local GPU/CPU offline model runner'
  },
  {
    key: 'lmstudio',
    name: 'LM Studio Server',
    baseUrl: 'http://localhost:1234/v1',
    port: 1234,
    defaultKey: 'lmstudio',
    description: 'Local OpenAI-compatible server in LM Studio'
  },
  {
    key: '9router',
    name: '9Router / OmniRoute Proxy',
    baseUrl: 'http://localhost:20128/v1',
    port: 20128,
    defaultKey: '9router',
    description: 'Subscription cascade & RTK token proxy'
  },
  {
    key: 'freellmapi',
    name: 'FreeLLMAPI Aggregator',
    baseUrl: 'http://localhost:4000/v1',
    port: 4000,
    defaultKey: 'freellmapi',
    description: 'Self-hosted free quota aggregator'
  },
  {
    key: 'vllm',
    name: 'vLLM Local Server',
    baseUrl: 'http://localhost:8000/v1',
    port: 8000,
    defaultKey: '',
    description: 'High-throughput local vLLM instance'
  },
  {
    key: 'localai',
    name: 'LocalAI / llama.cpp',
    baseUrl: 'http://localhost:8080/v1',
    port: 8080,
    defaultKey: '',
    description: 'Self-hosted OpenAI alternative'
  },
  {
    key: 'jan',
    name: 'Jan Desktop Server',
    baseUrl: 'http://localhost:1337/v1',
    port: 1337,
    defaultKey: '',
    description: 'Jan local AI assistant runtime'
  },
  {
    key: 'textgen',
    name: 'Text Generation WebUI',
    baseUrl: 'http://localhost:5000/v1',
    port: 5000,
    defaultKey: '',
    description: 'Oobabooga text-generation-webui API'
  }
];

export class LocalScanner {
  static async probeEndpoint(probe, timeoutMs = 1200) {
    const start = Date.now();
    try {
      const models = await LLMClient.listModels({
        baseUrl: probe.baseUrl,
        apiKey: probe.defaultKey || '',
        timeoutMs
      });
      const latency = Date.now() - start;
      return {
        online: true,
        key: probe.key,
        name: probe.name,
        baseUrl: probe.baseUrl,
        port: probe.port,
        latency_ms: latency,
        models_count: models.length,
        models: models.map(m => m.id),
        default_model: models[0]?.id || 'default',
        description: probe.description
      };
    } catch {
      return {
        online: false,
        key: probe.key,
        name: probe.name,
        baseUrl: probe.baseUrl,
        port: probe.port
      };
    }
  }

  static async scanAll({ timeoutMs = 1200, customPorts = [] } = {}) {
    const probes = [...KNOWN_LOCAL_PROBES];

    // Add any custom ports if provided
    for (const port of customPorts) {
      if (!probes.some(p => p.port === port)) {
        probes.push({
          key: `custom_${port}`,
          name: `Custom Local (${port})`,
          baseUrl: `http://localhost:${port}/v1`,
          port,
          defaultKey: '',
          description: `Custom local endpoint on port ${port}`
        });
      }
    }

    const results = await Promise.all(
      probes.map(p => this.probeEndpoint(p, timeoutMs))
    );

    const online = results.filter(r => r.online);
    const offline = results.filter(r => !r.online);

    return {
      total_scanned: probes.length,
      online_count: online.length,
      online_services: online,
      offline_ports: offline.map(o => o.port)
    };
  }

  static syncWithVault(vault, scanResults) {
    const addedOrUpdated = [];
    for (const service of scanResults.online_services) {
      const existing = vault.getProviders()[service.key] || {};
      const updated = vault.setProvider(service.key, {
        name: existing.name || service.name,
        base_url: service.baseUrl,
        api_key: existing.api_key || service.defaultKey || 'local',
        default_model: existing.default_model || service.default_model,
        models: service.models,
        description: service.description
      });
      addedOrUpdated.push({
        key: service.key,
        name: service.name,
        models_count: service.models.length,
        default_model: updated.default_model
      });
    }
    return addedOrUpdated;
  }
}
