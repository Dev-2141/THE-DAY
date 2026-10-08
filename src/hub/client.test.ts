import { describe, expect, it, vi } from 'vitest';
import { HubClient, readManifest, type HubEnvironment } from './client';
import type { ExportedHub } from './protocol';

const MANIFEST: ExportedHub = {
  version: 1,
  bindings: {
    'btn.enter': { tap: [{ type: 'navigate', screen: 'enter' }] },
    'btn.settings': { long_press: [{ type: 'remote', function: 'my_feature' }] },
  },
  timers: [{ id: 'app', every: 60 }],
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fetch that answers by URL; anything unlisted fails like an unreachable server. */
function fakeFetch(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>): typeof fetch {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (route === undefined) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(route(init));
  }) as unknown as typeof fetch;
}

function env(overrides: Partial<HubEnvironment>): HubEnvironment {
  return {
    fetch: fakeFetch({}),
    discover: () => Promise.resolve(null),
    exportedUrl: '/hub.json',
    remoteUrl: '',
    remoteToken: '',
    timeoutMs: 50,
    ...overrides,
  };
}

describe('HubClient', () => {
  it('uses the local hub when it answers, sending the token', async () => {
    let auth = '';
    const client = new HubClient(
      env({
        discover: () => Promise.resolve({ url: 'http://127.0.0.1:9', token: 'secret' }),
        fetch: fakeFetch({
          'http://127.0.0.1:9/event': (init) => {
            auth = new Headers(init?.headers).get('Authorization') ?? '';
            return json({ actions: [{ type: 'toast', text: 'Hi' }, { type: 'not-an-action' }] });
          },
        }),
      }),
    );
    const result = await client.dispatch('dev.hub_test', 'tap');
    expect(result).toEqual({ route: 'local', actions: [{ type: 'toast', text: 'Hi' }] });
    expect(auth).toBe('Bearer secret');
  });

  it('falls back to hub.json when the local hub is unreachable', async () => {
    const client = new HubClient(
      env({
        discover: () => Promise.resolve({ url: 'http://127.0.0.1:9', token: 't' }),
        fetch: fakeFetch({ '/hub.json': () => json(MANIFEST) }),
      }),
    );
    expect(await client.dispatch('btn.enter', 'tap')).toEqual({
      route: 'exported',
      actions: [{ type: 'navigate', screen: 'enter' }],
    });
  });

  it('falls back when the local hub hangs, after the timeout', async () => {
    const hanging: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/hub.json') return Promise.resolve(json(MANIFEST));
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))),
      );
    }) as typeof fetch;
    const client = new HubClient(
      env({ discover: () => Promise.resolve({ url: 'http://127.0.0.1:9', token: '' }), fetch: hanging, timeoutMs: 30 }),
    );
    const result = await client.dispatch('btn.enter', 'tap');
    expect(result.route).toBe('exported');
  });

  it('does nothing for an unconnected element, and keeps working with no hub at all', async () => {
    const client = new HubClient(env({ fetch: fakeFetch({ '/hub.json': () => json(MANIFEST) }) }));
    expect(await client.dispatch('scene.grass', 'tap')).toEqual({ route: 'none', actions: [] });

    const nothing = new HubClient(env({ fetch: fakeFetch({ '/hub.json': () => json({}, 404) }) }));
    expect(await nothing.dispatch('btn.enter', 'tap')).toEqual({ route: 'none', actions: [] });
    expect(await nothing.manifest()).toBeNull();
  });

  it('sends custom Python functions to the server hub, and only there', async () => {
    const without = new HubClient(env({ fetch: fakeFetch({ '/hub.json': () => json(MANIFEST) }) }));
    expect(await without.dispatch('btn.settings', 'long_press')).toEqual({ route: 'none', actions: [] });

    const withServer = new HubClient(
      env({
        remoteUrl: 'https://hub.example.test',
        remoteToken: 'r',
        fetch: fakeFetch({
          '/hub.json': () => json(MANIFEST),
          'https://hub.example.test/event': () => json({ actions: [{ type: 'toast', text: 'From the server' }] }),
        }),
      }),
    );
    expect(await withServer.dispatch('btn.settings', 'long_press')).toEqual({
      route: 'remote',
      actions: [{ type: 'toast', text: 'From the server' }],
    });
  });

  it('reads the manifest from the local hub first, then from hub.json', async () => {
    const local = new HubClient(
      env({
        discover: () => Promise.resolve({ url: 'http://127.0.0.1:9', token: '' }),
        fetch: fakeFetch({ 'http://127.0.0.1:9/manifest': () => json(MANIFEST), '/hub.json': () => json({ version: 1, bindings: {} }) }),
      }),
    );
    expect((await local.manifest())?.timers).toEqual([{ id: 'app', every: 60 }]);

    const exported = new HubClient(env({ fetch: fakeFetch({ '/hub.json': () => json(MANIFEST) }) }));
    expect(Object.keys((await exported.manifest())?.bindings ?? {})).toEqual(['btn.enter', 'btn.settings']);
  });
});

describe('readManifest', () => {
  it('rejects anything malformed and drops bad entries', () => {
    expect(readManifest(null)).toBeNull();
    expect(readManifest({ version: 2, bindings: {} })).toBeNull();
    expect(
      readManifest({
        version: 1,
        bindings: { 'btn.enter': { tap: [{ type: 'toast', text: 'ok' }, { nope: true }] }, broken: 3 },
        timers: [{ id: 'app', every: 0 }, { id: 'app', every: 5 }],
      }),
    ).toEqual({
      version: 1,
      bindings: { 'btn.enter': { tap: [{ type: 'toast', text: 'ok' }] } },
      timers: [{ id: 'app', every: 5 }],
    });
  });
});
