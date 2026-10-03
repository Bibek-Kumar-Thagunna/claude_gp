import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import type { SupportKnowledgeArticle } from '../modules/support/support-knowledge';

export const SUPPORT_ASSISTANT_PROVIDER = Symbol('SUPPORT_ASSISTANT_PROVIDER');

export type SupportAssistantAnswer = {
  answer: string;
  confidence: number;
  shouldEscalate: boolean;
  escalationReason: string | null;
  sourceIds: string[];
  provider: 'knowledge' | 'openai';
};

export type SupportAssistantInput = {
  question: string;
  history: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; body: string }>;
  articles: SupportKnowledgeArticle[];
};

export interface SupportAssistantProvider {
  readonly name: 'knowledge' | 'openai';
  answer(input: SupportAssistantInput): Promise<SupportAssistantAnswer>;
}

export class KnowledgeSupportAssistantProvider implements SupportAssistantProvider {
  readonly name = 'knowledge' as const;

  answer(input: SupportAssistantInput): Promise<SupportAssistantAnswer> {
    const article = input.articles[0];
    if (!article) {
      return Promise.resolve({
        answer: 'I do not have an approved answer for that yet. A GoPasal support person can review it with you.',
        confidence: 0,
        shouldEscalate: true,
        escalationReason: 'No approved knowledge article matched the question.',
        sourceIds: [],
        provider: this.name,
      });
    }
    return Promise.resolve({
      answer: article.answer,
      confidence: 0.82,
      shouldEscalate: false,
      escalationReason: null,
      sourceIds: [article.id],
      provider: this.name,
    });
  }
}

type OpenAiStructuredAnswer = {
  answer: string;
  confidence: number;
  shouldEscalate: boolean;
  escalationReason: string | null;
  sourceIds: string[];
};

export class OpenAiSupportAssistantProvider implements SupportAssistantProvider {
  readonly name = 'openai' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async answer(input: SupportAssistantInput): Promise<SupportAssistantAnswer> {
    const moderation = await this.request('/moderations', {
      model: 'omni-moderation-latest',
      input: input.question,
    }) as { results?: Array<{ flagged?: boolean }> };
    if (moderation.results?.[0]?.flagged) {
      return {
        answer: 'I cannot safely answer that request here. Please contact a GoPasal support person for help.',
        confidence: 0,
        shouldEscalate: true,
        escalationReason: 'The message needs human safety review.',
        sourceIds: [],
        provider: this.name,
      };
    }

    const approvedIds = new Set(input.articles.map((article) => article.id));
    const response = await this.request('/responses', {
      model: this.model,
      store: false,
      instructions: [
        'You are GoPasal customer support for a hyperlocal marketplace in Nepal.',
        'Answer only from APPROVED KNOWLEDGE supplied below. Never invent policy, availability, delivery time, payment state, refund eligibility, legal conclusions, or account facts.',
        'Never ask for or repeat an OTP, password, wallet PIN, card detail, citizenship number, or bank credential.',
        'If the knowledge is insufficient, confidence is below 0.7, or a human must inspect an order/account/refund, set shouldEscalate true and say so plainly.',
        'Keep the answer concise, calm and actionable. sourceIds may contain only supplied article IDs.',
      ].join(' '),
      input: [
        ...input.history.slice(-6).map((item) => ({
          role: item.role === 'CUSTOMER' ? 'user' : 'assistant',
          content: item.body.slice(0, 1200),
        })),
        {
          role: 'user',
          content: `APPROVED KNOWLEDGE (${input.articles.length} articles):\n${input.articles.map((article) => `[${article.id}] ${article.title}\n${article.answer}`).join('\n\n')}\n\nCUSTOMER QUESTION:\n${input.question}`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'gopasal_support_answer',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              answer: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              shouldEscalate: { type: 'boolean' },
              escalationReason: { type: ['string', 'null'] },
              sourceIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['answer', 'confidence', 'shouldEscalate', 'escalationReason', 'sourceIds'],
          },
        },
      },
    });

    const text = this.outputText(response);
    let parsed: OpenAiStructuredAnswer;
    try {
      parsed = JSON.parse(text) as OpenAiStructuredAnswer;
    } catch {
      throw new ServiceUnavailableException('Support assistant returned an unreadable answer');
    }
    const sourceIds = Array.isArray(parsed.sourceIds)
      ? parsed.sourceIds.filter((id): id is string => typeof id === 'string' && approvedIds.has(id))
      : [];
    const confidence = Number.isFinite(parsed.confidence) ? Math.min(1, Math.max(0, parsed.confidence)) : 0;
    const unsupported = sourceIds.length === 0 || confidence < 0.7;
    return {
      answer: typeof parsed.answer === 'string' && parsed.answer.trim()
        ? parsed.answer.trim().slice(0, 4000)
        : 'I could not produce a reliable answer. A support person can help.',
      confidence,
      shouldEscalate: Boolean(parsed.shouldEscalate) || unsupported,
      escalationReason: unsupported
        ? 'The answer was not sufficiently supported by approved knowledge.'
        : typeof parsed.escalationReason === 'string'
          ? parsed.escalationReason.slice(0, 500)
          : null,
      sourceIds,
      provider: this.name,
    };
  }

  private async request(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (cause) {
      const reason = cause instanceof Error && cause.name === 'AbortError' ? 'timed out' : 'was unavailable';
      throw new ServiceUnavailableException(`Support assistant provider ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private outputText(response: unknown): string {
    if (!response || typeof response !== 'object') return '';
    const value = response as { output_text?: unknown; output?: unknown };
    if (typeof value.output_text === 'string') return value.output_text;
    if (!Array.isArray(value.output)) return '';
    for (const item of value.output) {
      if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown }).content)) continue;
      for (const content of (item as { content: unknown[] }).content) {
        if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
          return (content as { text: string }).text;
        }
      }
    }
    return '';
  }
}

export const supportAssistantProviderFactory = {
  provide: SUPPORT_ASSISTANT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): SupportAssistantProvider => {
    const settings = config.get('supportAssistant', { infer: true });
    if (settings.provider === 'knowledge') return new KnowledgeSupportAssistantProvider();
    if (settings.provider === 'openai' && settings.openai.apiKey) {
      return new OpenAiSupportAssistantProvider(
        settings.openai.apiKey,
        settings.openai.model,
        settings.openai.baseUrl,
        settings.timeoutMs,
      );
    }
    throw new Error('SUPPORT_ASSISTANT_PROVIDER=openai requires OPENAI_API_KEY');
  },
};
