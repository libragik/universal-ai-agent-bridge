#!/usr/bin/env node
import { ProviderVault } from './provider-vault.mjs';
import { LLMClient } from './client.mjs';
import { LocalScanner } from './scanner.mjs';

const vault = new ProviderVault();
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
  agy-llm ask <prompt>                   Quick test query using active provider
  agy-llm remove <provider_key>          Remove a provider from vault

Examples:
  agy-llm list
  agy-llm test dahl
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
        const prompt = args.slice(1).join(' ');
        if (!prompt) return console.error('Please provide a prompt to ask.');
        const resolved = vault.getActiveProvider();
        console.log(`Querying ${resolved.name} [${resolved.default_model}]...`);
        const res = await LLMClient.chatCompletion({
          baseUrl: resolved.base_url,
          apiKey: resolved.api_key,
          model: resolved.default_model,
          messages: [{ role: 'user', content: prompt }]
        });
        console.log(`\nResponse (${res.latency_ms}ms):\n`);
        if (res.reasoning) {
          console.log(`[Reasoning]\n${res.reasoning}\n`);
        }
        console.log(res.content);
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
