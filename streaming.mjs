/**
 * Universal LLM Bridge - Real-Time Streaming & Live Token Velocity Engine
 * Handles Server-Sent Events (SSE), Time-To-First-Token (TTFT), and live tok/s telemetry.
 */

export class StreamHandler {
  /**
   * Consume an OpenAI-compatible /v1/chat/completions SSE stream with callbacks and live telemetry
   */
  static async stream({
    baseUrl,
    apiKey,
    model,
    messages,
    temperature = 0.7,
    maxTokens = null,
    customHeaders = {},
    timeoutMs = 90000,
    onToken = null,
    onReasoning = null,
    onStart = null
  }) {
    const startTime = Date.now();
    let firstTokenTime = null;
    let fullContent = '';
    let fullReasoning = '';
    let tokenCount = 0;
    let serverUsage = null;
    let detectedModel = model;

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...customHeaders
    };

    const payload = {
      model,
      messages,
      temperature,
      stream: true,
      stream_options: { include_usage: true }
    };

    if (maxTokens) {
      payload.max_tokens = maxTokens;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Streaming request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw err;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }
      const err = new Error(`Streaming API error (${response.status}): ${errorBody || response.statusText}`);
      err.status = response.status;
      throw err;
    }

    if (onStart) onStart();

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Comment or empty line

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              break;
            }

            try {
              const json = JSON.parse(dataStr);
              if (json.model) detectedModel = json.model;
              if (json.usage) serverUsage = json.usage;

              const choice = json.choices?.[0];
              const delta = choice?.delta || {};

              // Handle reasoning stream (DeepSeek R1, MiniMax, Qwen)
              if (delta.reasoning_content) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                tokenCount += 1;
                fullReasoning += delta.reasoning_content;
                if (onReasoning) onReasoning(delta.reasoning_content);
              }

              // Handle content stream
              if (delta.content) {
                if (!firstTokenTime) firstTokenTime = Date.now();
                tokenCount += 1;
                fullContent += delta.content;
                if (onToken) onToken(delta.content);
              }
            } catch {
              // Ignore non-JSON SSE frames
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const totalLatencyMs = Date.now() - startTime;
    const ttftMs = firstTokenTime ? (firstTokenTime - startTime) : totalLatencyMs;
    const activeGenerationSeconds = Math.max(0.01, (totalLatencyMs - (ttftMs || 0)) / 1000);
    const tokensPerSec = tokenCount > 0 ? (tokenCount / activeGenerationSeconds) : 0;

    return {
      content: fullContent,
      reasoning: fullReasoning || null,
      model: detectedModel,
      ttft_ms: ttftMs,
      latency_ms: totalLatencyMs,
      tokens_generated: tokenCount,
      tokens_per_sec: Number(tokensPerSec.toFixed(1)),
      usage: serverUsage || {
        prompt_tokens: Math.max(1, Math.ceil(JSON.stringify(messages).length / 4)),
        completion_tokens: tokenCount,
        total_tokens: Math.max(1, Math.ceil(JSON.stringify(messages).length / 4)) + tokenCount
      }
    };
  }

  /**
   * Async generator yielding structured chunk events: { type: 'reasoning'|'token'|'done', text, telemetry }
   */
  static async *createStreamGenerator(options) {
    const queue = [];
    let resolveNext = null;
    let isComplete = false;
    let failure = null;

    const pushChunk = (item) => {
      queue.push(item);
      if (resolveNext) {
        const fn = resolveNext;
        resolveNext = null;
        fn();
      }
    };

    StreamHandler.stream({
      ...options,
      onReasoning: (chunk) => pushChunk({ type: 'reasoning', text: chunk }),
      onToken: (chunk) => pushChunk({ type: 'token', text: chunk })
    }).then(telemetry => {
      isComplete = true;
      pushChunk({ type: 'done', telemetry });
    }).catch(err => {
      failure = err;
      if (resolveNext) {
        const fn = resolveNext;
        resolveNext = null;
        fn();
      }
    });

    while (true) {
      if (queue.length > 0) {
        yield queue.shift();
      } else if (isComplete) {
        break;
      } else if (failure) {
        throw failure;
      } else {
        await new Promise(r => { resolveNext = r; });
      }
    }
  }
}
