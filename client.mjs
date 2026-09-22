/**
 * Resilient OpenAI-compatible /v1 HTTP Client
 */
export class LLMClient {
  static async request({
    url,
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 60000
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal
      });

      clearTimeout(timer);

      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw_text: text };
        }
      }

      if (!response.ok) {
        const errorMsg =
          data?.error?.message ||
          data?.message ||
          data?.raw_text ||
          `HTTP ${response.status} ${response.statusText}`;
        const error = new Error(`Provider API error (${response.status}): ${errorMsg}`);
        error.status = response.status;
        error.details = data;
        throw error;
      }

      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s on ${url}`);
      }
      throw err;
    }
  }

  static async chatCompletion({
    baseUrl,
    apiKey,
    model,
    messages,
    temperature = 0.7,
    maxTokens = null,
    customHeaders = {},
    timeoutMs = 90000
  }) {
    const startTime = Date.now();
    const endpoint = `${baseUrl}/chat/completions`;

    const headers = {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...customHeaders
    };

    const payload = {
      model,
      messages,
      temperature
    };

    if (maxTokens) {
      payload.max_tokens = maxTokens;
    }

    const data = await this.request({
      url: endpoint,
      method: 'POST',
      headers,
      body: payload,
      timeoutMs
    });

    const latencyMs = Date.now() - startTime;
    const choice = data?.choices?.[0];
    const message = choice?.message || {};

    let content = message.content || '';
    let reasoning = message.reasoning_content || null;

    // Also extract <think> tags if model embedded reasoning directly into content
    if (!reasoning && typeof content === 'string' && content.includes('<think>')) {
      const match = content.match(/<think>([\s\S]*?)<\/think>/i);
      if (match) {
        reasoning = match[1].trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
      }
    }

    return {
      content,
      reasoning,
      model: data.model || model,
      finish_reason: choice?.finish_reason || 'unknown',
      usage: data.usage || null,
      latency_ms: latencyMs,
      raw_id: data.id || null
    };
  }

  static async listModels({
    baseUrl,
    apiKey,
    customHeaders = {},
    timeoutMs = 15000
  }) {
    const endpoint = `${baseUrl}/models`;
    const headers = {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...customHeaders
    };

    const data = await this.request({
      url: endpoint,
      method: 'GET',
      headers,
      timeoutMs
    });

    // OpenAI standard is { data: [ { id: '...' }, ... ] }
    let rawList = [];
    if (Array.isArray(data)) {
      rawList = data;
    } else if (Array.isArray(data?.data)) {
      rawList = data.data;
    } else if (Array.isArray(data?.models)) {
      rawList = data.models;
    }

    return rawList.map(m => ({
      id: m.id || m.name,
      owned_by: m.owned_by || null,
      created: m.created || null
    }));
  }

  static async generateImage({
    baseUrl,
    apiKey,
    model = 'dall-e-3',
    prompt,
    size = '1024x1024',
    quality = 'standard',
    customHeaders = {},
    timeoutMs = 120000
  }) {
    const startTime = Date.now();
    const endpoint = `${baseUrl}/images/generations`;

    const headers = {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...customHeaders
    };

    const payload = {
      model,
      prompt,
      size,
      quality,
      n: 1
    };

    const data = await this.request({
      url: endpoint,
      method: 'POST',
      headers,
      body: payload,
      timeoutMs
    });

    const latencyMs = Date.now() - startTime;
    const item = data?.data?.[0] || {};

    let localPath = null;
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const outDir = path.join(os.homedir(), '.gemini', 'antigravity', 'scratch', 'generated_images');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `img_${timestamp}.png`;
    const targetFile = path.join(outDir, filename);

    if (item.b64_json) {
      fs.writeFileSync(targetFile, Buffer.from(item.b64_json, 'base64'));
      localPath = targetFile;
    } else if (item.url) {
      try {
        const imgRes = await fetch(item.url);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(targetFile, buffer);
        localPath = targetFile;
      } catch {
        // Fall back to keeping URL if download fails
      }
    }

    return {
      prompt,
      model,
      url: item.url || null,
      local_path: localPath,
      revised_prompt: item.revised_prompt || null,
      latency_ms: latencyMs
    };
  }

  static async generateVideo({
    baseUrl,
    apiKey,
    model = 'video-model',
    prompt,
    duration = 5,
    customHeaders = {},
    timeoutMs = 300000
  }) {
    const startTime = Date.now();
    const endpoint = `${baseUrl}/videos/generations`;

    const headers = {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...customHeaders
    };

    const payload = {
      model,
      prompt,
      duration
    };

    const data = await this.request({
      url: endpoint,
      method: 'POST',
      headers,
      body: payload,
      timeoutMs
    });

    const latencyMs = Date.now() - startTime;
    const item = data?.data?.[0] || data || {};

    return {
      prompt,
      model,
      url: item.url || item.video_url || null,
      task_id: item.task_id || data.id || null,
      status: item.status || 'processing',
      latency_ms: latencyMs
    };
  }

  static async testConnection({
    baseUrl,
    apiKey,
    customHeaders = {},
    timeoutMs = 15000
  }) {
    const start = Date.now();
    try {
      const models = await this.listModels({ baseUrl, apiKey, customHeaders, timeoutMs });
      const latency = Date.now() - start;
      return {
        success: true,
        latency_ms: latency,
        available_models_count: models.length,
        models_sample: models.slice(0, 10).map(m => m.id),
        message: `Successfully connected to ${baseUrl} (${latency}ms). Found ${models.length} available models.`
      };
    } catch (err) {
      return {
        success: false,
        latency_ms: Date.now() - start,
        error: err.message,
        message: `Connection failed for ${baseUrl}: ${err.message}`
      };
    }
  }
}
