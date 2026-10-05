/**
 * Sends interface events to the connectivity hub and returns its actions.
 *
 * Resolution order for every event:
 *   1. The local hub (Python companion on Windows, or the dev hub under vite),
 *      reached on 127.0.0.1 with the per-launch token.
 *   2. The exported declarative connections in hub.json (Android, or when the
 *      local hub is down). Bindings marked `remote` go to the server hub set
 *      in config.hub.remoteUrl, if any.
 *   3. Nothing: an unconnected element simply does nothing.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { devHubConnection } from 'virtual:hub-connection';
import { config } from '../config/config';
import type { ElementId, HubEvent } from './elementIds';
import type { ExportedHub, HubAction, HubConnection, HubEventRequest, HubTimer } from './protocol';

export type HubRoute = 'local' | 'exported' | 'remote' | 'none';

export interface HubResult {
  readonly route: HubRoute;
  readonly actions: readonly HubAction[];
}

const ACTION_TYPES: ReadonlySet<string> = new Set([
  'open_url',
  'dialog',
  'sheet',
  'toast',
  'navigate',
  'call_api',
  'set_text',
  'set_visible',
  'set_setting',
  'remote',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHubAction(value: unknown): value is HubAction {
  return isRecord(value) && typeof value['type'] === 'string' && ACTION_TYPES.has(value['type']);
}

function readActions(value: unknown): readonly HubAction[] {
  if (!isRecord(value) || !Array.isArray(value['actions'])) return [];
  return value['actions'].filter(isHubAction);
}

function isTimer(value: unknown): value is HubTimer {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['every'] === 'number' && value['every'] > 0;
}

/** Validate a manifest from hub.json or the local hub; anything malformed counts as no manifest. */
export function readManifest(value: unknown): ExportedHub | null {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['bindings'])) return null;
  const bindings: Record<string, Record<string, readonly HubAction[]>> = {};
  for (const [id, events] of Object.entries(value['bindings'])) {
    if (!isRecord(events)) continue;
    const clean: Record<string, readonly HubAction[]> = {};
    for (const [event, actions] of Object.entries(events)) {
      if (Array.isArray(actions)) clean[event] = actions.filter(isHubAction);
    }
    bindings[id] = clean;
  }
  const timers = Array.isArray(value['timers']) ? value['timers'].filter(isTimer) : [];
  return { version: 1, bindings, timers };
}

function authHeaders(token: string): Record<string, string> {
  return token === '' ? {} : { Authorization: `Bearer ${token}` };
}

/** What the client needs from its surroundings; replaced in tests. */
export interface HubEnvironment {
  readonly fetch: typeof fetch;
  /** The local hub, if one runs next to the app. */
  readonly discover: () => Promise<HubConnection | null>;
  readonly exportedUrl: string;
  readonly remoteUrl: string;
  readonly remoteToken: string;
  readonly timeoutMs: number;
}

async function discoverLocalHub(): Promise<HubConnection | null> {
  if (devHubConnection !== null) return devHubConnection;
  if (!isTauri()) return null;
  try {
    return await invoke<HubConnection | null>('hub_connection');
  } catch {
    return null;
  }
}

export function defaultEnvironment(): HubEnvironment {
  return {
    fetch: (...args) => fetch(...args),
    discover: discoverLocalHub,
    exportedUrl: `${import.meta.env.BASE_URL}${config.hub.exportedManifestUrl}`,
    remoteUrl: config.hub.remoteUrl,
    remoteToken: config.hub.remoteToken,
    timeoutMs: config.hub.requestTimeoutMs,
  };
}

export class HubClient {
  private connection: Promise<HubConnection | null> | null = null;
  private exported: Promise<ExportedHub | null> | null = null;

  constructor(private readonly env: HubEnvironment = defaultEnvironment()) {}

  async dispatch(
    id: ElementId,
    event: HubEvent,
    payload: Readonly<Record<string, unknown>> = {},
  ): Promise<HubResult> {
    const request: HubEventRequest = { id, event, payload };

    const local = await this.localConnection();
    if (local !== null) {
      try {
        return { route: 'local', actions: await this.post(local.url, local.token, request) };
      } catch {
        // Fall through to the exported connections.
      }
    }

    const exported = await this.exportedHub();
    const actions = exported?.bindings[id]?.[event] ?? [];
    if (actions.length === 0) return { route: 'none', actions: [] };

    if (actions.some((action) => action.type === 'remote')) {
      if (this.env.remoteUrl === '') return { route: 'none', actions: [] };
      try {
        const remote = await this.post(this.env.remoteUrl, this.env.remoteToken, request);
        return { route: 'remote', actions: remote };
      } catch {
        return { route: 'none', actions: [] };
      }
    }
    return { route: 'exported', actions };
  }

  /**
   * Every connection and timer: from the local hub when it runs (so edits to
   * hub.py show up at once), otherwise from hub.json. Null if neither answers.
   */
  async manifest(): Promise<ExportedHub | null> {
    const local = await this.localConnection();
    if (local !== null) {
      try {
        const response = await this.env.fetch(`${local.url}/manifest`, {
          headers: authHeaders(local.token),
          signal: AbortSignal.timeout(this.env.timeoutMs),
        });
        if (response.ok) {
          const manifest = readManifest(await response.json());
          if (manifest !== null) return manifest;
        }
      } catch {
        // Fall back to hub.json.
      }
    }
    return this.exportedHub();
  }

  private async post(baseUrl: string, token: string, request: HubEventRequest): Promise<readonly HubAction[]> {
    const response = await this.env.fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.env.timeoutMs),
    });
    if (!response.ok) throw new Error(`Hub answered ${response.status}`);
    return readActions(await response.json());
  }

  private localConnection(): Promise<HubConnection | null> {
    this.connection ??= this.env.discover().catch(() => null);
    return this.connection;
  }

  private exportedHub(): Promise<ExportedHub | null> {
    this.exported ??= this.env
      .fetch(this.env.exportedUrl)
      .then(async (response) => (response.ok ? readManifest(await response.json()) : null))
      .catch(() => null);
    return this.exported;
  }
}

export const hubClient = new HubClient();
