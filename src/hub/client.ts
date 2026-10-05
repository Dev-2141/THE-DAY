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
import type { ExportedHub, HubAction, HubConnection, HubEventRequest } from './protocol';

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

function isExportedHub(value: unknown): value is ExportedHub {
  return isRecord(value) && value['version'] === 1 && isRecord(value['bindings']);
}

async function postEvent(
  baseUrl: string,
  token: string,
  request: HubEventRequest,
): Promise<readonly HubAction[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== '') headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/event`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(config.hub.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Hub answered ${response.status}`);
  return readActions(await response.json());
}

export class HubClient {
  private connection: Promise<HubConnection | null> | null = null;
  private exported: Promise<ExportedHub | null> | null = null;

  async dispatch(
    id: ElementId,
    event: HubEvent,
    payload: Readonly<Record<string, unknown>> = {},
  ): Promise<HubResult> {
    const request: HubEventRequest = { id, event, payload };

    const local = await this.localConnection();
    if (local !== null) {
      try {
        return { route: 'local', actions: await postEvent(local.url, local.token, request) };
      } catch {
        // Fall through to the exported connections.
      }
    }

    const exported = await this.exportedHub();
    const actions = exported?.bindings[id]?.[event] ?? [];
    if (actions.length === 0) return { route: 'none', actions: [] };

    if (actions.some((action) => action.type === 'remote')) {
      if (config.hub.remoteUrl === '') return { route: 'none', actions: [] };
      try {
        const remote = await postEvent(config.hub.remoteUrl, config.hub.remoteToken, request);
        return { route: 'remote', actions: remote };
      } catch {
        return { route: 'none', actions: [] };
      }
    }
    return { route: 'exported', actions };
  }

  private localConnection(): Promise<HubConnection | null> {
    this.connection ??= this.discoverConnection();
    return this.connection;
  }

  private async discoverConnection(): Promise<HubConnection | null> {
    if (devHubConnection !== null) return devHubConnection;
    if (!isTauri()) return null;
    try {
      return await invoke<HubConnection | null>('hub_connection');
    } catch {
      return null;
    }
  }

  private exportedHub(): Promise<ExportedHub | null> {
    this.exported ??= fetch(`${import.meta.env.BASE_URL}${config.hub.exportedManifestUrl}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const data: unknown = await response.json();
        return isExportedHub(data) ? data : null;
      })
      .catch(() => null);
    return this.exported;
  }
}

export const hubClient = new HubClient();
