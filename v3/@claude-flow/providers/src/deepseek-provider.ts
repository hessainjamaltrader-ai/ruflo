/**
 * V3 DeepSeek Provider
 *
 * DeepSeek uses an OpenAI-compatible API format.
 * Base URL: https://api.deepseek.com/v1
 * Auth: Bearer token (DEEPSEEK_API_KEY)
 *
 * @module @claude-flow/providers/deepseek-provider
 */

import { BaseProvider, BaseProviderOptions } from './base-provider.js';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  AuthenticationError,
  RateLimitError,
  ModelNotFoundError,
  LLMProviderError,
} from './types.js';

// DeepSeek uses OpenAI-compatible request/response format
interface DeepSeekRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: unknown;
    };
  }>;
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DeepSeekProvider extends BaseProvider {
  readonly name: LLMProvider = 'deepseek';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-coder',
    ],
    maxContextLength: {
      'deepseek-chat': 65536,    // 64K context
      'deepseek-reasoner': 65536,
      'deepseek-coder': 65536,
    },
    maxOutputTokens: {
      'deepseek-chat': 8192,
      'deepseek-reasoner': 8192,
      'deepseek-coder': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: false,       // DeepSeek currently text-only
    supportsAudio: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsBatching: false,
    rateLimit: {
      requestsPerMinute: 500,
      tokensPerMinute: 500000,
      concurrentRequests: 50,
    },
    pricing: {
      'deepseek-chat': {
        promptCostPer1k: 0.00014,    // $0.14 per 1M input tokens
        completionCostPer1k: 0.00028, // $0.28 per 1M output tokens
        currency: 'USD',
      },
      'deepseek-reasoner': {
        promptCostPer1k: 0.00055,
        completionCostPer1k: 0.00219,
        currency: 'USD',
      },
      'deepseek-coder': {
        promptCostPer1k: 0.00014,
        completionCostPer1k: 0.00028,
        currency: 'USD',
      },
    },
  };

  private baseUrl: string = 'https://api.deepseek.com/v1';
  private headers: Record<string, string> = {};

  constructor(options: BaseProviderOptions) {
    super(options);
  }

  protected async doInitialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new AuthenticationError(
        'DeepSeek API key is required. Set DEEPSEEK_API_KEY environment variable.',
        'deepseek'
      );
    }

    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    // Allow custom base URL via config
    if (this.config.apiUrl) {
      this.baseUrl = this.config.apiUrl;
    }

    this.logger.info('DeepSeek provider initialized', {
      baseUrl: this.baseUrl,
      model: this.config.model,
    });
  }

  /**
   * Convert internal LLMRequest to DeepSeek API format (OpenAI-compatible)
   */
  private toDeepSeekRequest(request: LLMRequest): DeepSeekRequest {
    const dsRequest: DeepSeekRequest = {
      model: request.model || this.config.model || 'deepseek-chat',
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        ...(msg.name ? { name: msg.name } : {}),
        ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
        ...(msg.toolCalls ? {
          tool_calls: msg.toolCalls,
        } : {}),
      })),
    };

    if (request.temperature !== undefined) dsRequest.temperature = request.temperature;
    if (request.maxTokens) dsRequest.max_tokens = request.maxTokens;
    if (request.topP !== undefined) dsRequest.top_p = request.topP;
    if (request.frequencyPenalty !== undefined) dsRequest.frequency_penalty = request.frequencyPenalty;
    if (request.presencePenalty !== undefined) dsRequest.presence_penalty = request.presencePenalty;
    if (request.stopSequences?.length) dsRequest.stop = request.stopSequences;
    if (request.stream) dsRequest.stream = request.stream;
    if (request.tools?.length) {
      dsRequest.tools = request.tools;
      dsRequest.tool_choice = request.toolChoice as DeepSeekRequest['tool_choice'] || 'auto';
    }

    return dsRequest;
  }

  /**
   * Convert DeepSeek API response to internal LLMResponse
   */
  private fromDeepSeekResponse(response: DeepSeekResponse, request: LLMRequest): LLMResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new LLMProviderError(
        'DeepSeek returned empty response',
        'EMPTY_RESPONSE',
        'deepseek'
      );
    }

    const model = request.model || this.config.model || 'deepseek-chat';
    const pricing = this.capabilities.pricing?.[model];

    const promptCost = (response.usage.prompt_tokens / 1000) * (pricing?.promptCostPer1k || 0);
    const completionCost = (response.usage.completion_tokens / 1000) * (pricing?.completionCostPer1k || 0);

    return {
      id: response.id,
      model: response.model as LLMModel,
      provider: 'deepseek',
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls as LLMResponse['toolCalls'],
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      cost: {
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost,
        currency: pricing?.currency || 'USD',
      },
      finishReason: choice.finish_reason,
    };
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    const dsRequest = this.toDeepSeekRequest(request);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(dsRequest),
      signal: AbortSignal.timeout(this.config.timeout || 120000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      if (response.status === 401) {
        throw new AuthenticationError(
          `DeepSeek authentication failed: ${errorBody}`,
          'deepseek'
        );
      }
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '30', 10);
        throw new RateLimitError(
          `DeepSeek rate limit exceeded: ${errorBody}`,
          'deepseek',
          retryAfter
        );
      }
      throw new LLMProviderError(
        `DeepSeek API error (${response.status}): ${errorBody}`,
        'API_ERROR',
        'deepseek',
        response.status
      );
    }

    const data: DeepSeekResponse = await response.json();
    return this.fromDeepSeekResponse(data, request);
  }

  async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const dsRequest = this.toDeepSeekRequest({ ...request, stream: true });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(dsRequest),
      signal: AbortSignal.timeout(this.config.timeout || 120000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new LLMProviderError(
        `DeepSeek API error (${response.status}): ${errorBody}`,
        'API_ERROR',
        'deepseek',
        response.status
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new LLMProviderError('No response body', 'NO_BODY', 'deepseek');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              yield {
                type: 'content',
                delta: { content: delta.content },
              };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  type: 'tool_call',
                  delta: {
                    toolCall: {
                      id: tc.id,
                      type: 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || '',
                      },
                    },
                  },
                };
              }
            }

            if (parsed.usage) {
              yield {
                type: 'done',
                usage: {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                },
              };
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }

  async listModels(): Promise<LLMModel[]> {
    return this.capabilities.supportedModels;
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const contextLength = this.capabilities.maxContextLength[model] || 65536;
    const maxOutput = this.capabilities.maxOutputTokens[model] || 8192;

    return {
      model,
      name: model,
      description: `DeepSeek ${model}`,
      contextLength,
      maxOutputTokens: maxOutput,
      supportedFeatures: [
        'streaming',
        'tool_calling',
        'system_messages',
      ],
      pricing: this.capabilities.pricing[model],
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });

      return {
        healthy: response.ok,
        latency: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  destroy(): void {
    this.headers = {};
    super.removeAllListeners();
  }
}
