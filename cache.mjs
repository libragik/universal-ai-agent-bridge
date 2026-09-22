import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Universal LLM Bridge - Dynamic Response Caching & Semantic Cache Engine
 * High-performance, zero-dependency LRU cache with SHA-256 canonical hashing,
 * TTL expiration, token savings estimation, and hit telemetry.
 */

const DEFAULT_TTL_SECONDS = 86400; // 24 hours
const MAX_CACHE_ENTRIES = 2000;

export class ResponseCache {
  constructor(customPath = null) {
    this.filePath = customPath || this._resolveDefaultPath();
    this.memoryData = null;
  }

  _resolveDefaultPath() {
    const homeDir = os.homedir();
    const primaryDir = path.join(homeDir, '.gemini', 'antigravity');
    try {
      if (!fs.existsSync(primaryDir)) {
        fs.mkdirSync(primaryDir, { recursive: true });
      }
      return path.join(primaryDir, 'llm_cache.json');
    } catch {
      return path.resolve('./llm_cache.json');
    }
  }

  load() {
    if (this.memoryData) return this.memoryData;

    if (!fs.existsSync(this.filePath)) {
      this.memoryData = {
        version: 1,
        created_at: new Date().toISOString(),
        stats: {
          hits: 0,
          misses: 0,
          tokens_saved: 0,
          est_usd_saved: 0
        },
        entries: {}
      };
      this.save();
      return this.memoryData;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.memoryData = JSON.parse(raw);
      if (!this.memoryData.stats) {
        this.memoryData.stats = { hits: 0, misses: 0, tokens_saved: 0, est_usd_saved: 0 };
      }
      if (!this.memoryData.entries) {
        this.memoryData.entries = {};
      }
      return this.memoryData;
    } catch (err) {
      console.error(`[Cache] Warning: Failed to parse cache file (${err.message}). Initializing clean cache.`);
      this.memoryData = {
        version: 1,
        created_at: new Date().toISOString(),
        stats: { hits: 0, misses: 0, tokens_saved: 0, est_usd_saved: 0 },
        entries: {}
      };
      return this.memoryData;
    }
  }

  save() {
    if (!this.memoryData) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.memoryData, null, 2), 'utf8');
    } catch (err) {
      console.error(`[Cache] Failed to save cache: ${err.message}`);
    }
  }

  /**
   * Compute deterministic SHA-256 hash for query parameters
   */
  generateKey({
    provider = '',
    model = '',
    messages = [],
    temperature = 0.7,
    maxTokens = null
  }) {
    // Canonical representation
    const canonicalMessages = (messages || []).map(m => ({
      role: (m.role || '').toLowerCase().trim(),
      content: typeof m.content === 'string' ? m.content.trim() : JSON.stringify(m.content)
    }));

    const keyObj = {
      p: (provider || '').toLowerCase().trim(),
      m: (model || '').trim(),
      msgs: canonicalMessages,
      t: Number(temperature || 0).toFixed(2),
      max: maxTokens ? Number(maxTokens) : null
    };

    const serialized = JSON.stringify(keyObj);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Retrieve response from cache if present and unexpired
   */
  get(keyParams) {
    const data = this.load();
    const hash = this.generateKey(keyParams);
    const entry = data.entries[hash];

    if (!entry) {
      data.stats.misses = (data.stats.misses || 0) + 1;
      this.save();
      return null;
    }

    // Check expiration
    if (entry.expires_at) {
      const expiresTime = new Date(entry.expires_at).getTime();
      if (Date.now() > expiresTime) {
        delete data.entries[hash];
        data.stats.misses = (data.stats.misses || 0) + 1;
        this.save();
        return null;
      }
    }

    // Cache hit!
    entry.hit_count = (entry.hit_count || 0) + 1;
    entry.last_accessed = new Date().toISOString();

    const promptTokens = entry.usage?.prompt_tokens || 0;
    const completionTokens = entry.usage?.completion_tokens || 0;
    const totalTokens = entry.usage?.total_tokens || (promptTokens + completionTokens);

    data.stats.hits = (data.stats.hits || 0) + 1;
    data.stats.tokens_saved = (data.stats.tokens_saved || 0) + totalTokens;
    
    // Approximate cost savings ($0.50 / 1M tokens baseline average)
    const savedUsd = (totalTokens / 1_000_000) * 0.50;
    data.stats.est_usd_saved = Number(((data.stats.est_usd_saved || 0) + savedUsd).toFixed(6));

    this.save();

    return {
      cached: true,
      hash,
      content: entry.content,
      reasoning: entry.reasoning || null,
      model: entry.model,
      provider: entry.provider,
      hit_count: entry.hit_count,
      created_at: entry.created_at,
      expires_at: entry.expires_at,
      usage: entry.usage || {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens
      },
      tokens_saved: totalTokens,
      est_usd_saved: Number(savedUsd.toFixed(6))
    };
  }

  /**
   * Save response into cache with TTL and LRU enforcement
   */
  set(keyParams, response, ttlSeconds = DEFAULT_TTL_SECONDS) {
    const data = this.load();
    const hash = this.generateKey(keyParams);
    const now = new Date();

    let expiresAt = null;
    if (ttlSeconds !== null && ttlSeconds !== undefined && ttlSeconds !== 0) {
      expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    }

    const entry = {
      hash,
      provider: keyParams.provider || 'unknown',
      model: response.model || keyParams.model || 'unknown',
      created_at: now.toISOString(),
      last_accessed: now.toISOString(),
      expires_at: expiresAt,
      hit_count: 0,
      content: response.content || '',
      reasoning: response.reasoning || null,
      usage: response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    data.entries[hash] = entry;

    // LRU eviction if entry limit exceeded
    const entryKeys = Object.keys(data.entries);
    if (entryKeys.length > MAX_CACHE_ENTRIES) {
      this._evictOldest(data, entryKeys.length - MAX_CACHE_ENTRIES);
    }

    this.save();
    return hash;
  }

  _evictOldest(data, count) {
    const sorted = Object.values(data.entries).sort((a, b) => {
      const timeA = new Date(a.last_accessed || a.created_at).getTime();
      const timeB = new Date(b.last_accessed || b.created_at).getTime();
      return timeA - timeB;
    });

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      delete data.entries[sorted[i].hash];
    }
  }

  /**
   * Remove expired entries
   */
  prune() {
    const data = this.load();
    const now = Date.now();
    let prunedCount = 0;

    for (const [hash, entry] of Object.entries(data.entries)) {
      if (entry.expires_at) {
        if (now > new Date(entry.expires_at).getTime()) {
          delete data.entries[hash];
          prunedCount++;
        }
      }
    }

    if (prunedCount > 0) {
      this.save();
    }

    return { pruned: prunedCount, remaining: Object.keys(data.entries).length };
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const data = this.load();
    const count = Object.keys(data.entries).length;
    data.entries = {};
    data.stats.hits = 0;
    data.stats.misses = 0;
    data.stats.tokens_saved = 0;
    data.stats.est_usd_saved = 0;
    this.save();
    return { cleared: count };
  }

  /**
   * Return comprehensive cache analytics & health metrics
   */
  stats() {
    const data = this.load();
    const totalEntries = Object.keys(data.entries).length;
    const hits = data.stats.hits || 0;
    const misses = data.stats.misses || 0;
    const totalRequests = hits + misses;
    const hitRate = totalRequests > 0 ? ((hits / totalRequests) * 100).toFixed(1) : '0.0';

    let fileSizeBytes = 0;
    try {
      if (fs.existsSync(this.filePath)) {
        fileSizeBytes = fs.statSync(this.filePath).size;
      }
    } catch {
      // ignore
    }

    return {
      file_path: this.filePath,
      file_size_kb: Number((fileSizeBytes / 1024).toFixed(2)),
      total_entries: totalEntries,
      hits,
      misses,
      hit_rate: `${hitRate}%`,
      tokens_saved: data.stats.tokens_saved || 0,
      est_usd_saved: `$${(data.stats.est_usd_saved || 0).toFixed(4)} USD`
    };
  }

  /**
   * List recent cached items for inspection
   */
  inspect(limit = 10) {
    const data = this.load();
    const items = Object.values(data.entries)
      .sort((a, b) => new Date(b.last_accessed || b.created_at).getTime() - new Date(a.last_accessed || a.created_at).getTime())
      .slice(0, limit)
      .map(e => ({
        hash: e.hash.slice(0, 12) + '...',
        provider: e.provider,
        model: e.model,
        hits: e.hit_count,
        snippet: (e.content || '').slice(0, 80).replace(/\n/g, ' ') + '...',
        created_at: e.created_at,
        expires_at: e.expires_at || 'never'
      }));

    return items;
  }
}
