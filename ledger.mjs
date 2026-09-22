/**
 * Universal LLM Bridge - Local Cost & Token Usage Ledger
 * Tracks token consumption and estimates USD costs across all providers, models, and sessions.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GLOBAL_LEDGER_PATH = path.join(
  os.homedir(),
  '.gemini',
  'antigravity',
  'llm_ledger.json'
);

const LOCAL_LEDGER_PATH = path.join(process.cwd(), 'llm_ledger.json');

/**
 * Standard pricing rates (USD per 1,000,000 tokens)
 */
export const PRICING_RATES = {
  // Dahl Cluster: $0.03 flat per 1M tokens
  'dahl': { input: 0.03, output: 0.03 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'deepseek-ai/DeepSeek-V4-Flash-0731': { input: 0.03, output: 0.03 },
  'deepseek': { input: 0.14, output: 0.28 },
  // MiniMax
  'MiniMaxAI/MiniMax-M2.7': { input: 0.03, output: 0.03 },
  'minimax': { input: 0.20, output: 0.80 },
  // GLM
  'zai-org/GLM-5.3-Flash': { input: 0.03, output: 0.03 },
  // Groq LPU
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'deepseek-r1-distill-llama-70b': { input: 0.59, output: 0.79 },
  'groq': { input: 0.50, output: 0.70 },
  // Cerebras
  'cerebras': { input: 0.20, output: 0.20 },
  // OpenRouter / Anthropic / OpenAI
  'anthropic/claude-3.7-sonnet': { input: 3.00, output: 15.00 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openrouter': { input: 1.00, output: 3.00 },
  // Local Engines (100% Free)
  'ollama': { input: 0.00, output: 0.00 },
  'lmstudio': { input: 0.00, output: 0.00 },
  'local': { input: 0.00, output: 0.00 },
  // Universal Fallback
  'default': { input: 0.20, output: 0.40 }
};

export class TokenLedger {
  constructor(customPath = null) {
    if (customPath) {
      this.filePath = customPath;
    } else if (fs.existsSync(LOCAL_LEDGER_PATH)) {
      this.filePath = LOCAL_LEDGER_PATH;
    } else {
      this.filePath = GLOBAL_LEDGER_PATH;
    }
    this.ensureFileExists();
  }

  ensureFileExists() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.filePath)) {
        const initial = {
          created_at: new Date().toISOString(),
          total_queries: 0,
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          total_tokens: 0,
          total_cost_usd: 0.0,
          providers: {},
          models: {},
          transactions: []
        };
        fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2), 'utf8');
      }
    } catch {
      // Fallback gracefully to memory if filesystem is locked
    }
  }

  load() {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {
        total_queries: 0,
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_tokens: 0,
        total_cost_usd: 0.0,
        providers: {},
        models: {},
        transactions: []
      };
    }
  }

  save(data) {
    try {
      this.ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Non-blocking, never crash caller
    }
  }

  /**
   * Resolve price rate for given model and provider
   */
  getRates(providerKey = '', modelName = '') {
    const model = (modelName || '').toLowerCase();
    const provider = (providerKey || '').toLowerCase();

    if (PRICING_RATES[modelName]) return PRICING_RATES[modelName];
    if (PRICING_RATES[providerKey]) return PRICING_RATES[providerKey];

    // Substring match
    if (provider.includes('ollama') || provider.includes('lmstudio') || provider.includes('localhost')) {
      return PRICING_RATES['ollama'];
    }
    if (provider.includes('dahl')) {
      return PRICING_RATES['dahl'];
    }
    if (model.includes('r1')) {
      return PRICING_RATES['deepseek-reasoner'];
    }
    if (model.includes('deepseek')) {
      return PRICING_RATES['deepseek-chat'];
    }
    if (provider.includes('groq')) {
      return PRICING_RATES['groq'];
    }

    return PRICING_RATES['default'];
  }

  /**
   * Record a query transaction into the ledger
   */
  record({
    provider = 'unknown',
    model = 'unknown',
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    latencyMs = 0,
    tool = 'llm_query',
    status = 'success',
    error = null
  }) {
    try {
      const data = this.load();
      const rates = this.getRates(provider, model);

      let pTokens = Number(promptTokens) || 0;
      let cTokens = Number(completionTokens) || 0;
      let tTokens = Number(totalTokens) || (pTokens + cTokens);

      const costUsd = ((pTokens / 1_000_000) * rates.input) + ((cTokens / 1_000_000) * rates.output);

      const transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        tool,
        provider,
        model,
        prompt_tokens: pTokens,
        completion_tokens: cTokens,
        total_tokens: tTokens,
        cost_usd: Number(costUsd.toFixed(7)),
        latency_ms: latencyMs,
        status,
        error: error ? String(error) : null
      };

      // Update Aggregates
      data.total_queries = (data.total_queries || 0) + 1;
      data.total_prompt_tokens = (data.total_prompt_tokens || 0) + pTokens;
      data.total_completion_tokens = (data.total_completion_tokens || 0) + cTokens;
      data.total_tokens = (data.total_tokens || 0) + tTokens;
      data.total_cost_usd = Number(((data.total_cost_usd || 0) + costUsd).toFixed(6));

      // Update Provider Stats
      data.providers = data.providers || {};
      if (!data.providers[provider]) {
        data.providers[provider] = { queries: 0, tokens: 0, cost_usd: 0.0 };
      }
      data.providers[provider].queries += 1;
      data.providers[provider].tokens += tTokens;
      data.providers[provider].cost_usd = Number((data.providers[provider].cost_usd + costUsd).toFixed(6));

      // Update Model Stats
      data.models = data.models || {};
      if (!data.models[model]) {
        data.models[model] = { queries: 0, tokens: 0, cost_usd: 0.0 };
      }
      data.models[model].queries += 1;
      data.models[model].tokens += tTokens;
      data.models[model].cost_usd = Number((data.models[model].cost_usd + costUsd).toFixed(6));

      // Append transaction (limit history to last 1000 items to avoid bloating)
      data.transactions = data.transactions || [];
      data.transactions.push(transaction);
      if (data.transactions.length > 1000) {
        data.transactions = data.transactions.slice(-1000);
      }

      this.save(data);
      return transaction;
    } catch {
      return null;
    }
  }

  /**
   * Get formatted analytics summary
   */
  getAnalytics({ limit = 20, provider = null, model = null } = {}) {
    const data = this.load();
    let txs = data.transactions || [];

    if (provider) {
      txs = txs.filter(t => t.provider.toLowerCase() === provider.toLowerCase());
    }
    if (model) {
      txs = txs.filter(t => t.model.toLowerCase() === model.toLowerCase());
    }

    const recent = txs.slice(-limit).reverse();

    return {
      ledger_file: this.filePath,
      total_queries: data.total_queries || 0,
      total_tokens: data.total_tokens || 0,
      total_prompt_tokens: data.total_prompt_tokens || 0,
      total_completion_tokens: data.total_completion_tokens || 0,
      total_cost_usd: `$${(data.total_cost_usd || 0).toFixed(4)}`,
      total_cost_raw: data.total_cost_usd || 0,
      providers: data.providers || {},
      models: data.models || {},
      recent_transactions: recent.map(t => ({
        timestamp: t.timestamp,
        tool: t.tool,
        target: `${t.provider} [${t.model}]`,
        tokens: t.total_tokens,
        cost: `$${t.cost_usd.toFixed(5)}`,
        latency: `${t.latency_ms}ms`,
        status: t.status
      }))
    };
  }

  /**
   * Clear or reset the ledger
   */
  clear() {
    const fresh = {
      created_at: new Date().toISOString(),
      reset_at: new Date().toISOString(),
      total_queries: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      total_cost_usd: 0.0,
      providers: {},
      models: {},
      transactions: []
    };
    this.save(fresh);
    return fresh;
  }
}
