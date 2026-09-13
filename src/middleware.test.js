import { describe, it, expect } from 'vitest';
import { createAIBotMiddleware } from '../middleware.ts';

describe('site middleware (indiestack AI-bot tracking)', () => {
  it('continues the chain for human traffic without tracking', async () => {
    const events = [];
    const mw = createAIBotMiddleware({ websiteId: 'test', onEvent: (e) => events.push(e) });
    const res = await mw(
      new Request('https://slashloop.dev/pricing', {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/126' },
      }),
      { waitUntil: () => {} },
    );
    expect(res).toBeInstanceOf(Response);
    expect(events).toEqual([]);
  });

  it('reports a GPTBot document fetch via waitUntil and continues the chain', async () => {
    const events = [];
    const waited = [];
    const mw = createAIBotMiddleware({ websiteId: 'test', onEvent: (e) => events.push(e) });
    const res = await mw(
      new Request('https://slashloop.dev/', { headers: { 'user-agent': 'GPTBot/1.0' } }),
      { waitUntil: (p) => waited.push(p) },
    );
    expect(res).toBeInstanceOf(Response);
    // Delivery is handed to waitUntil (non-blocking), then sinks locally.
    await Promise.all(waited);
    expect(events).toHaveLength(1);
    expect(events[0].path).toBe('/');
    expect(events[0].ua).toContain('GPTBot');
  });
});
