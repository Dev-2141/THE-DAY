import { useState } from 'react';
import { hubClient, type HubRoute } from '../hub/client';
import { runActions, type HubSurface } from '../hub/runActions';

const ROUTE_LABEL: Record<HubRoute, string> = {
  local: 'local hub',
  exported: 'hub.json',
  remote: 'remote hub',
  none: 'no connection',
};

/** Development button that proves the interface → hub → interface round trip. */
export function HubTestButton({ surface }: { readonly surface: HubSurface }) {
  const [route, setRoute] = useState<HubRoute | null>(null);
  const [busy, setBusy] = useState(false);

  const ping = async (): Promise<void> => {
    setBusy(true);
    const result = await hubClient.dispatch('dev.hub_test', 'tap', { sentAt: Date.now() });
    setRoute(result.route);
    setBusy(false);
    if (result.actions.length === 0) {
      surface.toast('The hub did not answer. The interface keeps working without it.');
    }
    runActions(result.actions, surface);
  };

  return (
    <div className="hub-test">
      <button type="button" onClick={() => void ping()} disabled={busy}>
        {busy ? 'Calling hub…' : 'Test hub'}
      </button>
      {route !== null && <span className="hub-test__route">via {ROUTE_LABEL[route]}</span>}
    </div>
  );
}
