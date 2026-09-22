#!/usr/bin/env node
import { ProviderVault } from './provider-vault.mjs';
import { LLMClient } from './client.mjs';
import { LocalScanner } from './scanner.mjs';
import { PromptCompressor } from './compressor.mjs';
import { CouncilEngine } from './council.mjs';
import { TokenLedger } from './ledger.mjs';
import { PresetVault } from './presets.mjs';
import { ResponseCache } from './cache.mjs';

const vault = new ProviderVault();
const ledger = new TokenLedger();
const presetVault = new PresetVault();
const cache = new ResponseCache();
const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
Antigravity Universal LLM Gateway (agy-llm)
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
  agy-llm preset [list|show|add|del]     Manage expert personas & prompt presets
  agy-llm cache [stats|clear|prune]      Inspect or manage dynamic response cache
  agy-llm ask [--stream] [--no-cache]    Query with live streaming, persona, or cache
  agy-llm remove <provider_key>          Remove a provider from vault

Examples:
  agy-llm list
  agy-llm test dahl
  agy-llm ask --stream "Explain SQLite WAL mode"
  agy-llm council "Should I use Redis or PostgreSQL for background queues?"
  agy-llm models dahl
  agy-llm add my_local http://localhost:11434/v1 ollama qwen2.5-coder:latest
  agy-llm ask "What is the fastest sorting algorithm in python?"
`);
}

async function run() {
  try {
    switch (command) {
      case 'list': {
        const config = vault.load();
        const active = config.active_provider;
        console.log('\n--- Configured LLM Providers in Antigravity Vault ---');
        for (const [key, p] of Object.entries(config.providers || {})) {
          const isActive = key === active ? ' [ACTIVE]' : '';
          const hasKey = p.api_key && p.api_key.trim() ? '✔ key set' : '✖ no key';
          console.log(`- ${key}${isActive}`);
          console.log(`    Name:    ${p.name || key}`);
          console.log(`    BaseURL: ${p.base_url}`);
          console.log(`    Default: ${p.default_model || 'none'}`);
          console.log(`    Status:  ${hasKey}`);
        }
        console.log('');
        break;
      }

      case 'active': {
        const active = vault.getActiveProvider();
        console.log(`Active provider: ${active.key} (${active.name}) -> ${active.base_url}`);
        break;
      }

      case 'set': {
        const target = args[1];
        if (!target) return console.error('Please specify provider key.');
        vault.setActiveProvider(target);
        console.log(`Active provider changed to "${target}".`);
        break;
      }

      case 'test': {
        const target = args[1];
        const resolved = vault.resolveProvider({ providerKey: target });
        console.log(`Testing connection to ${resolved.name || resolved.key} at ${resolved.base_url}...`);
        const result = await LLMClient.testConnection({
          baseUrl: resolved.base_url,
          apiKey: resolved.api_key,
          customHeaders: resolved.headers || {}
        });
        if (result.success) {
          console.log(`✔ SUCCESS (${result.latency_ms}ms) - Found ${result.available_models_count} models.`);
          if (result.models_sample?.length) {
            console.log(`  Sample models: ${result.models_sample.join(', ')}`);
          }
        } else {
          console.error(`✖ FAILED (${result.latency_ms}ms): ${result.error}`);
        }
        break;
      }

      case 'models': {
        const target = args[1];
        const resolved = vault.resolveProvider({ providerKey: target });
        console.log(`Fetching models from ${resolved.base_url}...`);
        const models = await LLMClient.listModels({
          baseUrl: resolved.base_url,
          apiKey: resolved.api_key,
          customHeaders: resolved.headers || {}
        });
        console.log(`Found ${models.length} models:`);
        models.forEach(m => console.log(`  - ${m.id}`));
        break;
      }

      case 'add': {
        const [_, key, baseUrl, apiKey, model] = args;
        if (!key || !baseUrl) {
          return console.error('Usage: agy-llm add <key> <base_url> [api_key] [default_model]');
        }
        vault.setProvider(key, {
          name: key.toUpperCase(),
          base_url: baseUrl,
          api_key: apiKey || '',
          default_model: model || 'default'
        });
        console.log(`✔ Provider "${key}" added/updated.`);
        break;
      }

      case 'ask': {
        let shouldCompress = false;
        let shouldStream = false;
        let noCache = false;
        let presetName = null;
        let promptArgs = args.slice(1);

        for (let i = 0; i < promptArgs.length; i++) {
          if (promptArgs[i] === '--compress') {
            shouldCompress = true;
            promptArgs.splice(i, 1);
            i--;
          } else if (promptArgs[i] === '--stream') {
            shouldStream = true;
            promptArgs.splice(i, 1);
            i--;
          } else if (promptArgs[i] === '--no-cache') {
            noCache = true;
            promptArgs.splice(i, 1);
            i--;
          } else if (promptArgs[i] === '--preset' && promptArgs[i + 1]) {
            presetName = promptArgs[i + 1];
            promptArgs.splice(i, 2);
            i--;
          }
        }

        let prompt = promptArgs.join(' ');
        if (!prompt) return console.error('Please provide a prompt to ask.');
        
        let compStats = null;
        if (shouldCompress) {
          const comp = PromptCompressor.compress(prompt);
          compStats = comp;
          prompt = comp.compressed;
          console.log(`[RTK Token-Saver]: Compressed prompt from ~${comp.original_tokens} to ~${comp.compressed_tokens} tokens (Saved ${comp.savings_percent}).`);
        }

        let systemPrompt = null;
        let temperature = 0.7;
        let targetModel = null;

        if (presetName) {
          const p = presetVault.getPreset(presetName);
          if (!p) {
            return console.error(`Preset "${presetName}" not found. Run "agy-llm preset list" to view presets.`);
          }
          systemPrompt = p.system_prompt;
          if (p.temperature !== undefined) temperature = p.temperature;
          if (p.default_model) targetModel = p.default_model;
          console.log(`[Persona Active]: ${p.title || p.name} (temp: ${temperature})`);
        }

        const resolved = vault.getActiveProvider();
        const modelToUse = targetModel || resolved.default_model;
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const keyParams = {
          provider: resolved.key,
          model: modelToUse,
          messages,
          temperature,
          maxTokens: null
        };

        if (!noCache) {
          const hit = cache.get(keyParams);
          if (hit) {
            console.log(`\n⚡ CACHE HIT (0ms) | Saved ~${hit.tokens_saved} tokens ($${hit.est_usd_saved} USD) | Hits: ${hit.hit_count}\n`);
            if (hit.reasoning) {
              console.log(`[Reasoning]\n${hit.reasoning}\n`);
            }
            console.log(hit.content);

            ledger.record({
              provider: resolved.key,
              model: modelToUse,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              latencyMs: 0,
              tool: 'cli_ask_cached'
            });
            break;
          }
        }

        console.log(`Querying ${resolved.name} [${modelToUse}]...`);

        if (shouldStream) {
          let hasReasoning = false;
          let hasContent = false;
          console.log('\n--- Live Streaming Response ---');

          const streamRes = await LLMClient.chatCompletionStream({
            baseUrl: resolved.base_url,
            apiKey: resolved.api_key,
            model: modelToUse,
            messages,
            temperature,
            onReasoning: (chunk) => {
              if (!hasReasoning) {
                hasReasoning = true;
                process.stdout.write('\n[Thinking]\n');
              }
              process.stdout.write(chunk);
            },
            onToken: (chunk) => {
              if (hasReasoning && !hasContent) {
                process.stdout.write('\n\n[Response]\n');
              }
              hasContent = true;
              process.stdout.write(chunk);
            }
          });

          console.log(`\n\n⚡ ${streamRes.tokens_generated} tokens | ${streamRes.tokens_per_sec} tok/s | TTFT: ${streamRes.ttft_ms}ms | Latency: ${(streamRes.latency_ms / 1000).toFixed(2)}s`);

          if (!noCache) {
            cache.set(keyParams, {
              model: streamRes.model,
              content: streamRes.content,
              reasoning: streamRes.reasoning,
              usage: streamRes.usage
            });
          }

          ledger.record({
            provider: resolved.key,
            model: modelToUse,
            promptTokens: streamRes.usage?.prompt_tokens || 0,
            completionTokens: streamRes.usage?.completion_tokens || streamRes.tokens_generated,
            totalTokens: streamRes.usage?.total_tokens || streamRes.tokens_generated,
            latencyMs: streamRes.latency_ms,
            tool: 'cli_ask_stream'
          });
          break;
        }

        const res = await LLMClient.chatCompletion({
          baseUrl: resolved.base_url,
          apiKey: resolved.api_key,
          model: modelToUse,
          messages,
          temperature
        });

        if (!noCache) {
          cache.set(keyParams, {
            model: res.model,
            content: res.content,
            reasoning: res.reasoning,
            usage: res.usage
          });
        }

        console.log(`\nResponse (${res.latency_ms}ms):\n`);
        if (res.reasoning) {
          console.log(`[Reasoning]\n${res.reasoning}\n`);
        }
        console.log(res.content);

        ledger.record({
          provider: resolved.key,
          model: modelToUse,
          promptTokens: res.usage?.prompt_tokens || 0,
          completionTokens: res.usage?.completion_tokens || 0,
          totalTokens: res.usage?.total_tokens || 0,
          latencyMs: res.latency_ms,
          tool: 'cli_ask'
        });
        break;
      }

      case 'compress': {
        const text = args.slice(1).join(' ');
        if (!text) return console.error('Usage: agy-llm compress <text>');
        const res = PromptCompressor.compress(text);
        console.log('\n--- Compressed Text ---');
        console.log(res.compressed);
        console.log('\n--- Token Metrics ---');
        console.log(`Original:   ~${res.original_tokens} tokens (${res.original_chars} chars)`);
        console.log(`Compressed: ~${res.compressed_tokens} tokens (${res.compressed_chars} chars)`);
        console.log(`Saved:      ~${res.saved_tokens} tokens (${res.savings_percent} savings)`);
        break;
      }

      case 'cascade': {
        const sub = args[1];
        if (sub === 'set') {
          const chain = args.slice(2);
          if (chain.length === 0) return console.error('Usage: agy-llm cascade set <prov1> <prov2> ...');
          vault.setFallbackChain(chain);
          console.log(`✔ Fallback cascade set to: ${chain.join(' -> ')}`);
        } else {
          const chain = vault.getFallbackChain();
          console.log('\n--- Active Fallback Cascade Sequence ---');
          console.log(chain.map((k, idx) => `  ${idx + 1}. ${k}`).join('\n'));
          console.log('\nIf the primary provider hits 429 rate limit or 5xx outage, the bridge automatically falls over down this list.');
        }
        break;
      }

      case 'scan': {
        console.log('\nScanning local network ports for active AI services...');
        console.log('Probing ports: 11434 (Ollama), 1234 (LM Studio), 20128 (9Router/OmniRoute), 4000 (FreeLLMAPI), 8000 (vLLM), 8080 (LocalAI), 1337 (Jan)...');
        
        const scan = await LocalScanner.scanAll();
        console.log(`\nScan Complete: ${scan.online_count} online service(s) found across ${scan.total_scanned} probed endpoints.\n`);
        
        if (scan.online_count === 0) {
          console.log('✖ No local AI services currently running.');
          console.log('  Tip: Start Ollama (`ollama serve`), LM Studio, 9Router, or FreeLLMAPI and re-run `agy-llm scan`.');
        } else {
          for (const s of scan.online_services) {
            console.log(`✔ [ONLINE] ${s.name} (${s.latency_ms}ms)`);
            console.log(`    Base URL: ${s.baseUrl}`);
            console.log(`    Models (${s.models_count}): ${s.models.slice(0, 5).join(', ')}${s.models_count > 5 ? '...' : ''}`);
          }
          const synced = LocalScanner.syncWithVault(vault, scan);
          console.log(`\n✔ Automatically synced ${synced.length} service(s) into your Antigravity provider vault.`);
        }
        break;
      }

      case 'council': {
        let promptArgs = args.slice(1);
        let membersArg = null;
        let judgeArg = null;
        let customMembers = [];

        for (let i = 0; i < promptArgs.length; i++) {
          if (promptArgs[i] === '--members' && promptArgs[i + 1]) {
            membersArg = promptArgs[i + 1];
            promptArgs.splice(i, 2);
            i--;
          } else if (promptArgs[i] === '--judge' && promptArgs[i + 1]) {
            judgeArg = promptArgs[i + 1];
            promptArgs.splice(i, 2);
            i--;
          }
        }

        const prompt = promptArgs.join(' ');
        if (!prompt) {
          return console.error('Please provide a prompt for council deliberation. Example: agy-llm council "Should I use Redis or PostgreSQL for background queues?"');
        }

        if (membersArg) {
          customMembers = membersArg.split(',').map((m, idx) => {
            const [p, ...rest] = m.trim().split(':');
            return {
              provider: p,
              model: rest.join(':') || undefined,
              role_description: `Deliberating Member #${idx + 1}`
            };
          });
        }

        let customJudge = null;
        if (judgeArg) {
          const [p, ...rest] = judgeArg.trim().split(':');
          customJudge = { provider: p, model: rest.join(':') || undefined };
        }

        const councilEngine = new CouncilEngine(vault, ledger);
        console.log('\n🏛️  Initiating Multi-Model AI Council Deliberation...');
        console.log(`Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}"\n`);

        const deliberation = await councilEngine.deliberate({
          prompt,
          members: customMembers,
          judge: customJudge
        });

        console.log('--- 📋 Council Members Feedback ---');
        for (const m of deliberation.council_members) {
          const icon = m.status === 'success' ? '✔' : '✖';
          console.log(`\n${icon} [${m.member}] (${m.latency_ms}ms):`);
          if (m.status === 'success') {
            const preview = m.content.length > 350 ? m.content.slice(0, 350) + '...\n[truncated for CLI preview]' : m.content;
            console.log(preview);
          } else {
            console.log(`Error: ${m.error}`);
          }
        }

        console.log('\n======================================================');
        console.log(`⚖️  CHIEF JUSTICE CONSENSUS VERDICT [${deliberation.judge.name}]`);
        console.log('======================================================\n');
        console.log(deliberation.consensus);
        console.log(`\n✔ Council Deliberation complete in ${(deliberation.summary.total_latency_ms / 1000).toFixed(2)}s (${deliberation.summary.successful_members}/${deliberation.summary.total_members} members contributed).`);
        break;
      }

      case 'ledger': {
        const sub = args[1];
        if (sub === 'clear' || sub === 'reset') {
          ledger.clear();
          console.log('\n✔ Antigravity Local LLM Ledger has been reset.');
          break;
        }

        const stats = ledger.getAnalytics({ limit: 15 });
        console.log('\n======================================================');
        console.log('📊  ANTIGRAVITY LOCAL LLM COST & TOKEN LEDGER');
        console.log('======================================================');
        console.log(`Ledger File:   ${stats.ledger_file}`);
        console.log(`Total Queries: ${stats.total_queries}`);
        console.log(`Total Tokens:  ${stats.total_tokens.toLocaleString()} (Prompt: ${stats.total_prompt_tokens.toLocaleString()}, Output: ${stats.total_completion_tokens.toLocaleString()})`);
        console.log(`Est. Cost:     ${stats.total_cost_usd} USD\n`);

        console.log('--- 🏢 Breakdown By Provider ---');
        const pEntries = Object.entries(stats.providers);
        if (pEntries.length === 0) {
          console.log('No provider activity logged yet.');
        } else {
          for (const [p, val] of pEntries) {
            console.log(`- ${p.padEnd(16)} | Queries: ${String(val.queries).padStart(4)} | Tokens: ${String(val.tokens.toLocaleString()).padStart(8)} | Cost: $${val.cost_usd.toFixed(5)}`);
          }
        }

        console.log('\n--- 🤖 Breakdown By Model ---');
        const mEntries = Object.entries(stats.models);
        if (mEntries.length === 0) {
          console.log('No model activity logged yet.');
        } else {
          for (const [m, val] of mEntries) {
            console.log(`- ${m.padEnd(36)} | Queries: ${String(val.queries).padStart(3)} | Tokens: ${String(val.tokens.toLocaleString()).padStart(7)} | Cost: $${val.cost_usd.toFixed(5)}`);
          }
        }

        console.log('\n--- 🕒 Recent Transactions (Last 15) ---');
        if (stats.recent_transactions.length === 0) {
          console.log('No recent transactions recorded.');
        } else {
          for (const tx of stats.recent_transactions) {
            const time = tx.timestamp ? tx.timestamp.replace('T', ' ').slice(0, 19) : 'now';
            console.log(`[${time}] ${tx.target.padEnd(42)} ${String(tx.tokens).padStart(6)} tok | ${tx.cost.padStart(8)} | ${tx.latency}`);
          }
        }
        console.log('');
        break;
      }

      case 'preset': {
        const sub = args[1] || 'list';

        if (sub === 'list') {
          const list = presetVault.listPresets();
          console.log('\n--- 🧠 Antigravity System Personas & Prompt Presets ---');
          for (const p of list) {
            const tag = p.is_builtin ? '[BUILT-IN]' : '[CUSTOM]';
            console.log(`\n• ${p.name.padEnd(20)} ${tag} (temp: ${p.temperature})`);
            console.log(`  Title: ${p.title}`);
            console.log(`  Desc:  ${p.description}`);
          }
          console.log(`\nUsage: agy-llm ask --preset <name> "<prompt>"`);
          console.log(`       agy-llm preset show <name>`);
          console.log(`       agy-llm preset add <name> --prompt "..." [--temp 0.3]\n`);
          break;
        }

        if (sub === 'show') {
          const name = args[2];
          if (!name) return console.error('Usage: agy-llm preset show <name>');
          const p = presetVault.getPreset(name);
          if (!p) return console.error(`Preset "${name}" not found.`);
          console.log(`\n======================================================`);
          console.log(`🧠 PRESET: ${p.name} [${p.is_builtin ? 'BUILT-IN' : 'CUSTOM'}]`);
          console.log(`======================================================`);
          console.log(`Title:       ${p.title}`);
          console.log(`Temperature: ${p.temperature ?? 0.7}`);
          console.log(`Description: ${p.description}`);
          console.log(`\n--- System Prompt ---\n${p.system_prompt}\n`);
          break;
        }

        if (sub === 'add') {
          const name = args[2];
          if (!name) return console.error('Usage: agy-llm preset add <name> --prompt "..." [--temp 0.3]');
          let prompt = null;
          let temp = 0.7;
          let desc = 'Custom preset';

          for (let i = 3; i < args.length; i++) {
            if (args[i] === '--prompt' && args[i + 1]) {
              prompt = args[i + 1];
              i++;
            } else if (args[i] === '--temp' && args[i + 1]) {
              temp = parseFloat(args[i + 1]);
              i++;
            } else if (args[i] === '--desc' && args[i + 1]) {
              desc = args[i + 1];
              i++;
            }
          }

          if (!prompt) return console.error('Error: --prompt "<system_prompt>" is required.');

          presetVault.setPreset(name, {
            title: name,
            description: desc,
            system_prompt: prompt,
            temperature: temp
          });
          console.log(`✔ Custom preset "${name}" saved to vault.`);
          break;
        }

        if (sub === 'delete' || sub === 'del' || sub === 'remove') {
          const name = args[2];
          if (!name) return console.error('Usage: agy-llm preset delete <name>');
          presetVault.deletePreset(name);
          console.log(`✔ Preset "${name}" deleted.`);
          break;
        }

        console.error(`Unknown preset command "${sub}". Available: list, show, add, delete`);
        break;
      }

      case 'cache': {
        const sub = args[1] || 'stats';
        if (sub === 'stats') {
          const s = cache.stats();
          console.log('\n======================================================');
          console.log('⚡  ANTIGRAVITY DYNAMIC RESPONSE CACHE');
          console.log('======================================================');
          console.log(`Cache File:    ${s.file_path}`);
          console.log(`File Size:     ${s.file_size_kb} KB`);
          console.log(`Total Entries: ${s.total_entries}`);
          console.log(`Cache Hits:    ${s.hits}`);
          console.log(`Cache Misses:  ${s.misses}`);
          console.log(`Hit Ratio:     ${s.hit_rate}`);
          console.log(`Tokens Saved:  ~${s.tokens_saved}`);
          console.log(`Est. Savings:  ${s.est_usd_saved}\n`);
          break;
        }

        if (sub === 'clear') {
          const res = cache.clear();
          console.log(`✔ Cache cleared. Removed ${res.cleared} entries.`);
          break;
        }

        if (sub === 'prune') {
          const res = cache.prune();
          console.log(`✔ Pruned ${res.pruned} expired entries. ${res.remaining} active entries remain.`);
          break;
        }

        if (sub === 'inspect') {
          const limit = parseInt(args[2], 10) || 10;
          const items = cache.inspect(limit);
          console.log(`\n--- Recent Cached Responses (Top ${items.length}) ---`);
          if (items.length === 0) {
            console.log('Cache is currently empty.');
          } else {
            for (const item of items) {
              console.log(`- [${item.hash}] ${item.provider}/${item.model} (hits: ${item.hits})`);
              console.log(`    Snippet: ${item.snippet}`);
              console.log(`    Created: ${item.created_at} | Expires: ${item.expires_at}`);
            }
          }
          console.log('');
          break;
        }

        console.error(`Unknown cache command "${sub}". Available: stats, clear, prune, inspect`);
        break;
      }

      case 'remove': {
        const target = args[1];
        if (!target) return console.error('Please specify provider key.');
        vault.removeProvider(target);
        console.log(`Provider "${target}" removed.`);
        break;
      }

      default:
        printHelp();
        break;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

run();
