import { describe, expect, it, vi } from 'vitest';
import type { HubAction } from './protocol';
import { isWebUrl, runActions, type HubSurface } from './runActions';
import { fillTemplate } from './template';

function surface(): HubSurface & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    toast: (text) => calls.push(`toast:${text}`),
    popup: (a) => calls.push(`${a.type}:${a.title}`),
    openUrl: (url, target) => calls.push(`open:${target}:${url}`),
    navigate: (screen) => calls.push(`navigate:${screen}`),
    setText: (target, text) => calls.push(`text:${target}:${text}`),
    setVisible: (target, visible) => calls.push(`visible:${target}:${String(visible)}`),
    setSetting: (key, value) => calls.push(`setting:${key}:${String(value)}`),
  };
}

describe('runActions', () => {
  it('carries out every action type in order', async () => {
    const s = surface();
    const actions: HubAction[] = [
      { type: 'toast', text: 'Hi' },
      { type: 'dialog', title: 'Mothership', text: '', buttons: [] },
      { type: 'sheet', title: 'Notes', text: '', buttons: [] },
      { type: 'open_url', url: 'https://example.com', target: 'panel' },
      { type: 'navigate', screen: 'enter' },
      { type: 'set_text', target: 'text.time', text: 'SIGNAL' },
      { type: 'set_visible', target: 'panel.settings', visible: 'toggle' },
      { type: 'set_setting', key: 'time.hour12', value: false },
      { type: 'remote', function: 'my_feature' },
    ];
    await runActions(actions, s);
    expect(s.calls).toEqual([
      'toast:Hi',
      'dialog:Mothership',
      'sheet:Notes',
      'open:panel:https://example.com',
      'navigate:enter',
      'text:text.time:SIGNAL',
      'visible:panel.settings:toggle',
      'setting:time.hour12:false',
    ]);
  });

  it('never opens anything but a web address', async () => {
    const s = surface();
    await runActions(
      [
        { type: 'open_url', url: 'javascript:alert(1)', target: 'browser' },
        { type: 'open_url', url: 'file:///C:/Windows', target: 'panel' },
        { type: 'open_url', url: 'not a url', target: 'browser' },
      ],
      s,
    );
    expect(s.calls).toEqual([]);
    expect(isWebUrl('https://example.com/a?b=c')).toBe(true);
    expect(isWebUrl('http://localhost:5173')).toBe(true);
  });

  it('calls an API from hub.json and shows its result only as text', async () => {
    const s = surface();
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ today: { label: 'Clear skies' }, next: 'https://evil.test' }))),
    ) as unknown as typeof fetch;
    await runActions(
      [
        {
          type: 'call_api',
          url: 'https://api.example.test/today',
          method: 'GET',
          body: null,
          present: { kind: 'set_text', template: '{today.label}', target: 'text.date' },
        },
        {
          type: 'call_api',
          url: 'https://api.example.test/today',
          method: 'GET',
          body: null,
          present: { kind: 'toast', template: 'Next: {next}', target: null },
        },
      ],
      s,
      fetcher,
    );
    expect(s.calls).toEqual(['text:text.date:Clear skies', 'toast:Next: https://evil.test']);
  });

  it('keeps going when an API call fails', async () => {
    const s = surface();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = vi.fn(() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch;
    await runActions(
      [
        { type: 'call_api', url: 'https://down.test', method: 'GET', body: null, present: { kind: 'toast', template: '{}', target: null } },
        { type: 'toast', text: 'still here' },
      ],
      s,
      failing,
    );
    expect(s.calls).toEqual(['toast:still here']);
    warn.mockRestore();
  });
});

describe('fillTemplate (same results as the Python hub)', () => {
  const data = { a: { b: 'x', n: 3, list: [10, 'twenty'] }, s: 'text', z: null };
  it.each([
    ['{a.b}', 'x'],
    ['{a.n}', '3'],
    ['{a.list.1}', 'twenty'],
    ['{a.list.9}', ''],
    ['{missing.field}', ''],
    ['{z}', 'null'],
    ['{a.list}', '[10,"twenty"]'],
    ['{}', '{"a":{"b":"x","n":3,"list":[10,"twenty"]},"s":"text","z":null}'],
    ['Say {s}!', 'Say text!'],
  ])('%s -> %s', (template, expected) => {
    expect(fillTemplate(template, data)).toBe(expected);
  });
});
