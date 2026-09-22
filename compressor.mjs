/**
 * Smart Prompt Compressor (RTK Token-Saver)
 * Reduces prompt token footprint by 20%-40% while preserving code structure and semantics.
 */
export class PromptCompressor {
  /**
   * Approximate token count using standard ~4 chars per token heuristic
   */
  static estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // BPE tokenizers average ~3.7 to 4.2 characters per token in code/English
    return Math.max(1, Math.ceil(text.length / 3.8));
  }

  /**
   * Compress stack traces by truncating deep external library frames
   */
  static compressStackTraces(text) {
    if (!text) return text;
    // Compress node_modules or site-packages chains
    return text.replace(
      /((?:\s+at\s+.*(?:node_modules|[/\\]lib[/\\]python|[/\\]site-packages)[^\n]*\n){3,})/g,
      (match) => {
        const lines = match.trim().split('\n');
        return `    at [Internal/Library Frames: ${lines.length} hidden]\n`;
      }
    );
  }

  /**
   * Compress repetitive log output (e.g. repeated polling loops)
   */
  static compressRepetitiveLines(text) {
    if (!text) return text;
    const lines = text.split('\n');
    const result = [];
    let repeatCount = 1;
    let prevLine = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === prevLine && line.trim().length > 5) {
        repeatCount++;
      } else {
        if (repeatCount > 2) {
          result.push(`    ... [previous line repeated ${repeatCount - 1} more times] ...`);
        } else if (repeatCount === 2) {
          result.push(prevLine);
        }
        result.push(line);
        prevLine = line;
        repeatCount = 1;
      }
    }

    if (repeatCount > 2) {
      result.push(`    ... [previous line repeated ${repeatCount - 1} more times] ...`);
    } else if (repeatCount === 2) {
      result.push(prevLine);
    }

    return result.join('\n');
  }

  /**
   * Compress excessive whitespaces while preserving indentation in code
   */
  static compressWhitespace(text) {
    if (!text) return text;
    return text
      // Collapse 3+ newlines to 2 newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace on each line
      .replace(/[ \t]+$/gm, '')
      // Remove trailing and leading blank padding
      .trim();
  }

  /**
   * Strip markdown horizontal rules and redundant divider padding
   */
  static compressMarkdownBoilerplate(text) {
    if (!text) return text;
    return text
      // Replace duplicate divider lines
      .replace(/(?:[-*_]{3,}\s*){2,}/g, '---\n')
      // Clean HTML comments that aren't critical directives
      .replace(/<!--(?!.*(slide|preserve|keep)).*?-->/gs, '');
  }

  /**
   * Full compression pipeline for a single string
   */
  static compress(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return {
        compressed: text,
        original_chars: 0,
        compressed_chars: 0,
        original_tokens: 0,
        compressed_tokens: 0,
        saved_tokens: 0,
        savings_percent: '0%'
      };
    }

    const origChars = text.length;
    const origTokens = this.estimateTokens(text);

    let result = text;
    result = this.compressStackTraces(result);
    result = this.compressRepetitiveLines(result);
    result = this.compressMarkdownBoilerplate(result);
    result = this.compressWhitespace(result);

    const compChars = result.length;
    const compTokens = this.estimateTokens(result);
    const savedTokens = Math.max(0, origTokens - compTokens);
    const savingsPercent = origTokens > 0 ? `${Math.round((savedTokens / origTokens) * 100)}%` : '0%';

    return {
      compressed: result,
      original_chars: origChars,
      compressed_chars: compChars,
      original_tokens: origTokens,
      compressed_tokens: compTokens,
      saved_tokens: savedTokens,
      savings_percent: savingsPercent
    };
  }

  /**
   * Compresses an array of chat messages in-place
   */
  static compressMessages(messages, options = {}) {
    if (!Array.isArray(messages)) return { messages, stats: null };

    let totalOriginalTokens = 0;
    let totalCompressedTokens = 0;

    const compressedMessages = messages.map(msg => {
      if (typeof msg.content === 'string') {
        const res = this.compress(msg.content, options);
        totalOriginalTokens += res.original_tokens;
        totalCompressedTokens += res.compressed_tokens;
        return {
          ...msg,
          content: res.compressed
        };
      }
      return msg;
    });

    const saved = Math.max(0, totalOriginalTokens - totalCompressedTokens);
    const savingsPercent = totalOriginalTokens > 0 ? `${Math.round((saved / totalOriginalTokens) * 100)}%` : '0%';

    return {
      messages: compressedMessages,
      stats: {
        original_tokens: totalOriginalTokens,
        compressed_tokens: totalCompressedTokens,
        saved_tokens: saved,
        savings_percent: savingsPercent
      }
    };
  }
}
