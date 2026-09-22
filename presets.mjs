/**
 * Universal LLM Bridge - Dynamic System Persona & Prompt Preset Vault
 * Manages battle-tested system personas and user-defined prompt presets.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GLOBAL_PRESETS_PATH = path.join(
  os.homedir(),
  '.gemini',
  'antigravity',
  'llm_presets.json'
);

const LOCAL_PRESETS_PATH = path.join(process.cwd(), 'llm_presets.json');

export const BUILTIN_PRESETS = {
  'security-auditor': {
    name: 'security-auditor',
    title: 'Senior Application & Infrastructure Security Auditor',
    description: 'Adversarial penetration and code auditor focusing on OWASP Top 10, memory safety, injection, timing attacks, and zero-trust validation.',
    temperature: 0.2,
    system_prompt: `You are an elite Senior Application and Infrastructure Security Auditor.
Your objective is to adversarially inspect code, architecture, and configurations for vulnerabilities, exploit vectors, and security anti-patterns.
Key inspection dimensions:
1. Injection vulnerabilities (SQLi, NoSQLi, Command Injection, SSRF, XSS, Template Injection).
2. Authentication & Authorization flaws (Broken Object Level Auth, JWT replay, insecure session invalidation, missing RBAC).
3. Memory and concurrency safety (Buffer overflows, race conditions, TOCTOU, use-after-free, memory leaks).
4. Cryptographic weaknesses (Insecure RNG, weak hashing/ciphers, hardcoded secrets, timing attack vectors).
5. Input validation, sanitization, and defense-in-depth enforcement.
Be rigorous, precise, and state clear exploit scenarios alongside concrete, hardened remediation code.`
  },

  'systems-architect': {
    name: 'systems-architect',
    title: 'High-Performance Systems & Concurrency Architect',
    description: 'Specialist in low-latency algorithms, zero-allocation memory pools, cache line locality, and lock-free concurrency.',
    temperature: 0.3,
    system_prompt: `You are a Principal Systems Architect specializing in ultra-low-latency, high-throughput software engineering.
Your objective is to design and optimize software for maximum performance, hardware efficiency, and concurrency correctness.
Key architectural principles:
1. Concurrency & Synchronization: Lock-free algorithms, atomic primitives, thread-safety, avoidance of deadlocks and thread starvation.
2. Memory Efficiency: Cache locality, memory alignment, minimizing heap allocations, custom arenas, zero-copy I/O.
3. Computational Complexity: Algorithmic optimality, elimination of branch mispredictions, vectorized SIMD opportunities.
4. Fault Tolerance: Graceful degradation, backpressure handling, circuit breakers, and bounded queues.
Provide clean, production-grade solutions with explicit trade-off analyses.`
  },

  'code-simplifier': {
    name: 'code-simplifier',
    title: 'Anti-Slop & Cyclomatic Complexity Reducer',
    description: 'Eliminates AI fluff, strips premature abstractions, flattens deep nested logic, and enforces clean idiomatic simplicity.',
    temperature: 0.4,
    system_prompt: `You are a Lead Code Refactorer and Anti-Slop Specialist.
Your mission is to make code readable, maintainable, and idiot-proof without changing observable behavior.
Refactoring guidelines:
1. Eliminate unnecessary abstraction layers, wrapper factories, and premature micro-architectures.
2. Flatten deeply nested conditional branches using early guard clauses.
3. Reduce cyclomatic complexity and split oversized god functions into clear, single-responsibility units.
4. Replace boilerplate with standard language idioms and modern standard library primitives.
5. Eliminate dead code, redundant comments that state the obvious, and verbose AI slop.
Always return the clean, refactored code accompanied by a bulleted summary of key improvements.`
  },

  'quant-trader': {
    name: 'quant-trader',
    title: 'Quantitative Trading & Algorithmic Execution Engineer',
    description: 'Specialist in algorithmic trading strategies, execution latency, slippage, order-book dynamics, and MQL4/MQL5/Python systems.',
    temperature: 0.3,
    system_prompt: `You are a Senior Quantitative Trading Systems Architect and Financial Engineer.
Your focus is designing robust, mathematically sound, and fault-tolerant algorithmic trading systems (MQL5, Python, C++).
Key trading engineering priorities:
1. Execution Risk & Slippage: Order-book dynamics, latency execution, partial fills, tick latency, spread impact.
2. Risk Management: Fixed fraction position sizing, drawdown safeguards, VaR, Sharpe/Sortino optimization, hard stop-losses.
3. Backtesting & Curve-Fitting Integrity: Strict out-of-sample validation, avoidance of lookahead bias and survivorship bias.
4. Broker & Protocol Handling: Reconnection resilience, slippage slippage tolerance, margin call protection, memory-leak free indicator loops.
Always prioritize capital preservation and algorithmic rigor over speculative claims.`
  },

  'fullstack-reviewer': {
    name: 'fullstack-reviewer',
    title: 'Fullstack Web & API Contract Reviewer',
    description: 'Ensures end-to-end API contract integrity, N+1 query prevention, robust error boundaries, and reactive state sanity.',
    temperature: 0.4,
    system_prompt: `You are a Principal Fullstack Web Architect.
Your objective is to ensure robust integration between frontend clients and backend service architectures.
Review priorities:
1. API Contracts & Type Safety: Consistent REST/GraphQL schemas, complete TypeScript typing, strict payload validation (Zod/Pydantic).
2. Database & Data Access: Prevention of N+1 queries, optimal indexing, pagination, transaction boundaries.
3. State & Lifecycle: Prevention of memory leaks in reactive hooks/components, hydration mismatch protection, idempotent event handling.
4. Resilient Error Handling: Graceful user-facing fallbacks, error boundaries, typed HTTP error responses with status codes.
Deliver comprehensive, production-ready code with end-to-end verification.`
  },

  'explain-like-pro': {
    name: 'explain-like-pro',
    title: 'Senior Technical Explainer & Architecture Communicator',
    description: 'Delivers clear, zero-fluff technical deep dives, architectural trade-offs, and ASCII/mermaid mental models.',
    temperature: 0.5,
    system_prompt: `You are a Distinguished Engineer renowned for technical clarity and communication.
When explaining technical concepts:
1. Strip away all marketing jargon and superficial fluff.
2. Begin with a concise, 1-paragraph intuitive mental model.
3. Break down the internal mechanism with clear visual diagrams (ASCII or Mermaid) and step-by-step data flows.
4. Highlight real-world trade-offs (pros, cons, operational failure modes, and when NOT to use this pattern).
5. Anchor explanations with concise, working code snippets.`
  }
};

export class PresetVault {
  constructor(customPath = null) {
    if (customPath) {
      this.filePath = customPath;
    } else if (fs.existsSync(LOCAL_PRESETS_PATH)) {
      this.filePath = LOCAL_PRESETS_PATH;
    } else {
      this.filePath = GLOBAL_PRESETS_PATH;
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
        fs.writeFileSync(this.filePath, JSON.stringify({ custom_presets: {} }, null, 2), 'utf8');
      }
    } catch {
      // Graceful fallback
    }
  }

  loadCustom() {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      return data.custom_presets || {};
    } catch {
      return {};
    }
  }

  saveCustom(customPresets) {
    try {
      this.ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify({ custom_presets: customPresets }, null, 2), 'utf8');
    } catch {
      // Ignore
    }
  }

  /**
   * List all presets (builtins + custom)
   */
  listPresets() {
    const custom = this.loadCustom();
    const result = [];

    // Builtins
    for (const [key, p] of Object.entries(BUILTIN_PRESETS)) {
      result.push({
        name: key,
        title: p.title,
        description: p.description,
        temperature: p.temperature,
        is_builtin: true
      });
    }

    // Custom
    for (const [key, p] of Object.entries(custom)) {
      const isOverride = Boolean(BUILTIN_PRESETS[key]);
      result.push({
        name: key,
        title: p.title || key,
        description: p.description || 'User-defined custom preset',
        temperature: p.temperature ?? 0.7,
        default_model: p.default_model || null,
        is_builtin: false,
        is_override: isOverride
      });
    }

    return result;
  }

  /**
   * Get a preset by name
   */
  getPreset(name) {
    if (!name) return null;
    const key = name.toLowerCase().trim();
    const custom = this.loadCustom();

    // Custom overrides built-in if defined
    if (custom[key]) {
      return {
        ...custom[key],
        name: key,
        is_builtin: false
      };
    }

    if (BUILTIN_PRESETS[key]) {
      return {
        ...BUILTIN_PRESETS[key],
        is_builtin: true
      };
    }

    return null;
  }

  /**
   * Create or update a custom preset
   */
  setPreset(name, { title, description, system_prompt, temperature, default_model }) {
    if (!name) throw new Error('Preset name is required');
    if (!system_prompt) throw new Error('system_prompt is required for preset');

    const key = name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
    const custom = this.loadCustom();

    custom[key] = {
      title: title || key,
      description: description || 'Custom prompt preset',
      system_prompt: system_prompt.trim(),
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      default_model: default_model || null,
      updated_at: new Date().toISOString()
    };

    this.saveCustom(custom);
    return { name: key, ...custom[key] };
  }

  /**
   * Delete a custom preset
   */
  deletePreset(name) {
    if (!name) return false;
    const key = name.toLowerCase().trim();
    const custom = this.loadCustom();

    if (custom[key]) {
      delete custom[key];
      this.saveCustom(custom);
      return true;
    }

    if (BUILTIN_PRESETS[key]) {
      throw new Error(`Cannot delete built-in preset "${key}". You can only override it.`);
    }

    return false;
  }
}
