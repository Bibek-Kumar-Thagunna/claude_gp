import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  KnowledgeSupportAssistantProvider,
  OpenAiSupportAssistantProvider,
} from './support-assistant.provider';
import { retrieveSupportKnowledge } from '../modules/support/support-knowledge';

describe('knowledge support assistant', () => {
  it('answers only when an approved article matched', async () => {
    const provider = new KnowledgeSupportAssistantProvider();
    const articles = retrieveSupportKnowledge('How do I track my order?').map((match) => match.article);
    const answer = await provider.answer({ question: 'How do I track my order?', history: [], articles });
    assert.equal(answer.shouldEscalate, false);
    assert.deepEqual(answer.sourceIds, ['orders-status']);
    assert.match(answer.answer, /Open Orders/);
  });

  it('hands an unsupported question to a person instead of guessing', async () => {
    const answer = await new KnowledgeSupportAssistantProvider().answer({
      question: 'Can you decide this special case?',
      history: [],
      articles: [],
    });
    assert.equal(answer.shouldEscalate, true);
    assert.equal(answer.confidence, 0);
    assert.deepEqual(answer.sourceIds, []);
  });

  it('does not treat common words in an article title as approved evidence', () => {
    const matches = retrieveSupportKnowledge('Can you decide a private exception for me?');
    assert.deepEqual(matches, []);
  });

  it('normalizes ordinary plurals and requires context for broad terms', () => {
    assert.equal(retrieveSupportKnowledge('How do refunds work?')[0]?.article.id, 'refund-process');
    assert.deepEqual(retrieveSupportKnowledge('Can you change my phone?'), []);
    assert.equal(retrieveSupportKnowledge('What is my order status?')[0]?.article.id, 'orders-status');
  });
});

describe('OpenAI support assistant safety contract', () => {
  it('moderates first, disables provider storage and rejects invented source ids', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      const requestBody = init?.body;
      if (typeof requestBody !== 'string') assert.fail('Support assistant request body must be JSON');
      const requestUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      const parsed = JSON.parse(requestBody) as Record<string, unknown>;
      calls.push({ url: requestUrl, body: parsed });
      const response = calls.length === 1
        ? { results: [{ flagged: false }] }
        : { output_text: JSON.stringify({ answer: 'Use the order timeline.', confidence: 0.94, shouldEscalate: false, escalationReason: null, sourceIds: ['orders-status', 'invented-policy'] }) };
      return Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
    };
    try {
      const provider = new OpenAiSupportAssistantProvider('secret', 'gpt-5-mini', 'https://api.openai.com/v1', 5000);
      const article = retrieveSupportKnowledge('track order', 1)[0]?.article;
      assert.ok(article);
      const answer = await provider.answer({ question: 'track order', history: [], articles: [article] });
      assert.match(calls[0]?.url ?? '', /moderations$/);
      assert.match(calls[1]?.url ?? '', /responses$/);
      assert.equal(calls[1]?.body.store, false);
      assert.deepEqual(answer.sourceIds, ['orders-status']);
      assert.equal(answer.shouldEscalate, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not send a flagged message to generation', async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify({ results: [{ flagged: true }] }), { status: 200 }));
    };
    try {
      const provider = new OpenAiSupportAssistantProvider('secret', 'gpt-5-mini', 'https://api.openai.com/v1', 5000);
      const answer = await provider.answer({ question: 'unsafe input', history: [], articles: [] });
      assert.equal(calls, 1);
      assert.equal(answer.shouldEscalate, true);
      assert.equal(answer.sourceIds.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
