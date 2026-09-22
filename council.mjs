/**
 * Universal LLM Bridge - Multi-Model Consensus / Council Mode
 * Orchestrates multi-model deliberation, parallel execution, and automated Chief Justice synthesis.
 */

import { LLMClient } from './client.mjs';

export class CouncilEngine {
  constructor(vault, ledger = null, presetVault = null) {
    this.vault = vault;
    this.ledger = ledger;
    this.presetVault = presetVault;
  }

  /**
   * Resilient single-model query with automatic fallback to alternate models on HTTP 429/5xx
   */
  async queryWithResilience({
    providerKey,
    preferredModel,
    baseUrl,
    apiKey,
    messages,
    temperature = 0.7,
    customHeaders = {},
    timeoutMs = 45000
  }) {
    const p = providerKey ? this.vault.getProvider(providerKey) : null;
    const modelsToTry = [preferredModel];
    if (p) {
      const alternates = p.fallback_models || p.models || [];
      for (const alt of alternates) {
        if (!modelsToTry.includes(alt)) modelsToTry.push(alt);
      }
    }

    let lastErr = null;
    for (const m of modelsToTry) {
      try {
        const res = await LLMClient.chatCompletion({
          baseUrl,
          apiKey,
          model: m,
          messages,
          temperature,
          customHeaders,
          timeoutMs
        });
        return { ...res, modelUsed: m };
      } catch (err) {
        lastErr = err;
        const isRetryable = err.status === 429 || (err.status >= 500 && err.status < 600) || String(err.message).includes('429');
        if (!isRetryable) {
          throw err;
        }
      }
    }
    throw lastErr;
  }

  /**
   * Resolve members list. If empty or partial, automatically resolve from:
   * 1. Explicit members list
   * 2. Active provider + fallback providers from cascade
   */
  resolveMembers(members = []) {
    if (Array.isArray(members) && members.length > 0) {
      return members.map((m, idx) => {
        const resolved = this.vault.resolveProvider({
          providerKey: m.provider,
          endpointUrl: m.endpoint_url,
          apiKey: m.api_key,
          model: m.model
        });
        const modelName = m.model || resolved.default_model;
        let role = m.role_description;
        let memberSystemPrompt = null;
        if (m.preset && this.presetVault) {
          const p = this.presetVault.getPreset(m.preset);
          if (p) {
            role = role || p.title || p.name;
            memberSystemPrompt = p.system_prompt;
          }
        }
        return {
          id: `member_${idx + 1}`,
          providerKey: resolved.key,
          name: m.name || `${resolved.name || resolved.key} (${modelName})`,
          baseUrl: resolved.base_url,
          apiKey: resolved.api_key,
          model: modelName,
          customHeaders: resolved.headers || {},
          roleDescription: role || 'Specialist Advisor',
          systemPrompt: memberSystemPrompt
        };
      });
    }

    // Default: use active provider + fallback provider(s)
    const active = this.vault.getActiveProvider();
    const resolvedList = [];

    resolvedList.push({
      id: 'member_1',
      providerKey: active.key,
      name: `${active.name} (${active.default_model})`,
      baseUrl: active.base_url,
      apiKey: active.api_key,
      model: active.default_model,
      customHeaders: active.headers || {},
      roleDescription: 'Primary Council Member'
    });

    const chain = this.vault.getFallbackChain();
    for (const key of chain) {
      if (key !== active.key) {
        const p = this.vault.getProvider(key);
        if (p && p.base_url) {
          resolvedList.push({
            id: `member_${resolvedList.length + 1}`,
            providerKey: key,
            name: `${p.name || key} (${p.default_model || 'default'})`,
            baseUrl: p.base_url,
            apiKey: p.api_key,
            model: p.default_model || 'default',
            customHeaders: p.headers || {},
            roleDescription: 'Advisory Council Member'
          });
          break;
        }
      }
    }

    // If only 1 member resolved (e.g. single configured provider), use alternate models
    if (resolvedList.length < 2 && Array.isArray(active.models) && active.models.length > 1) {
      const altModel = active.models.find(m => m !== active.default_model);
      if (altModel) {
        resolvedList.push({
          id: `member_${resolvedList.length + 1}`,
          providerKey: active.key,
          name: `${active.name} (${altModel})`,
          baseUrl: active.base_url,
          apiKey: active.api_key,
          model: altModel,
          customHeaders: active.headers || {},
          roleDescription: 'Alternative Model Specialist'
        });
      }
    }

    return resolvedList;
  }

  /**
   * Deliberate upon a prompt across multiple council members and synthesize a final verdict.
   */
  async deliberate({
    prompt,
    system_prompt = null,
    members = [],
    judge = null,
    temperature = 0.7,
    synthesis_instruction = null,
    timeout_ms = 45000
  }) {
    if (!prompt) {
      throw new Error('prompt is required for council deliberation');
    }

    const startTime = Date.now();
    const resolvedMembers = this.resolveMembers(members);

    if (resolvedMembers.length === 0) {
      throw new Error('No valid council members configured for deliberation.');
    }

    // Stage 1: Parallel Deliberation
    const memberPromises = resolvedMembers.map(async (m) => {
      const mStart = Date.now();
      const messages = [];
      const sys = m.systemPrompt || system_prompt;
      if (sys) {
        messages.push({ role: 'system', content: sys });
      }
      messages.push({ role: 'user', content: prompt });

      try {
        const res = await this.queryWithResilience({
          providerKey: m.providerKey,
          preferredModel: m.model,
          baseUrl: m.baseUrl,
          apiKey: m.apiKey,
          messages,
          temperature,
          customHeaders: m.customHeaders,
          timeoutMs: timeout_ms
        });

        const modelUsed = res.modelUsed || m.model;
        if (this.ledger) {
          this.ledger.record({
            provider: m.providerKey || m.name,
            model: modelUsed,
            promptTokens: res.usage?.prompt_tokens || 0,
            completionTokens: res.usage?.completion_tokens || 0,
            totalTokens: res.usage?.total_tokens || 0,
            latencyMs: res.latency_ms,
            tool: 'llm_council_member'
          });
        }

        return {
          id: m.id,
          member: m.name,
          role: m.roleDescription,
          model: modelUsed,
          status: 'success',
          latency_ms: res.latency_ms,
          content: res.content,
          reasoning: res.reasoning || null,
          usage: res.usage || null
        };
      } catch (err) {
        return {
          id: m.id,
          member: m.name,
          role: m.roleDescription,
          model: m.model,
          status: 'failed',
          latency_ms: Date.now() - mStart,
          error: err.message
        };
      }
    });

    const memberResults = await Promise.all(memberPromises);
    const successful = memberResults.filter(r => r.status === 'success');

    if (successful.length === 0) {
      const errDetails = memberResults.map(m => `[${m.member}]: ${m.error}`).join('; ');
      throw new Error(`All council members failed to respond: ${errDetails}`);
    }

    // Stage 2: Synthesis by Chief Justice (Judge)
    let resolvedJudge;
    if (judge) {
      const r = this.vault.resolveProvider({
        providerKey: judge.provider,
        endpointUrl: judge.endpoint_url,
        apiKey: judge.api_key,
        model: judge.model
      });
      const judgeModel = judge.model || r.default_model;
      resolvedJudge = {
        name: judge.name || `Chief Justice: ${r.name || r.key} (${judgeModel})`,
        providerKey: r.key,
        baseUrl: r.base_url,
        apiKey: r.api_key,
        model: judgeModel,
        customHeaders: r.headers || {}
      };
    } else {
      const active = this.vault.getActiveProvider();
      resolvedJudge = {
        name: `Chief Justice: ${active.name} (${active.default_model})`,
        providerKey: active.key,
        baseUrl: active.base_url,
        apiKey: active.api_key,
        model: active.default_model,
        customHeaders: active.headers || {}
      };
    }

    // Compile deliberation dossier
    const deliberationDossier = successful.map((m, idx) => {
      return `### Council Member #${idx + 1}: ${m.member} [Role: ${m.role}]\n` +
             (m.reasoning ? `**Internal Reasoning:**\n${m.reasoning}\n\n` : '') +
             `**Proposed Solution:**\n${m.content}\n`;
    }).join('\n---\n\n');

    const judgeSystemPrompt = `You are the Chief Justice and Lead Architect of the Multi-Model AI Council.
Your duty is to review the candidate submissions, adjudicate differing viewpoints, detect hallucinations or subtle logical bugs, and synthesize a single, authoritative, production-grade consensus solution.`;

    const judgeUserPrompt = `=== USER TASK ===
${prompt}

=== INDEPENDENT COUNCIL SUBMISSIONS ===
${deliberationDossier}

=== SYNTHESIS INSTRUCTIONS ===
${synthesis_instruction || 'Please structure your response as follows:\n1. **Council Deliberation & Comparative Critique**: Contrast member answers, identifying agreements, disagreements, unique strengths, or overlooked edge cases.\n2. **Consensus Verdict & Final Solution**: Provide the definitive, complete, high-quality solution incorporating the council’s best insights.'}`;

    const judgeRes = await this.queryWithResilience({
      providerKey: resolvedJudge.providerKey,
      preferredModel: resolvedJudge.model,
      baseUrl: resolvedJudge.baseUrl,
      apiKey: resolvedJudge.apiKey,
      messages: [
        { role: 'system', content: judgeSystemPrompt },
        { role: 'user', content: judgeUserPrompt }
      ],
      temperature: 0.4,
      customHeaders: resolvedJudge.customHeaders,
      timeoutMs: timeout_ms
    });

    const judgeModelUsed = judgeRes.modelUsed || resolvedJudge.model;
    if (this.ledger) {
      this.ledger.record({
        provider: resolvedJudge.providerKey || resolvedJudge.name,
        model: judgeModelUsed,
        promptTokens: judgeRes.usage?.prompt_tokens || 0,
        completionTokens: judgeRes.usage?.completion_tokens || 0,
        totalTokens: judgeRes.usage?.total_tokens || 0,
        latencyMs: judgeRes.latency_ms,
        tool: 'llm_council_judge'
      });
    }

    const totalLatency = Date.now() - startTime;

    return {
      consensus: judgeRes.content,
      judge: {
        name: resolvedJudge.name,
        model: judgeModelUsed,
        latency_ms: judgeRes.latency_ms,
        reasoning: judgeRes.reasoning || null,
        usage: judgeRes.usage || null
      },
      council_members: memberResults,
      summary: {
        total_members: memberResults.length,
        successful_members: successful.length,
        failed_members: memberResults.length - successful.length,
        total_latency_ms: totalLatency
      }
    };
  }
}
