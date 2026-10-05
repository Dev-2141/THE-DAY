/// <reference types="vite/client" />

interface Window {
  /** Development only: the running stage and scene, for inspection tools. */
  __theDay?: {
    readonly stage: import('./scene/Stage').Stage;
    readonly scene: import('./scene/composition').Scene;
  };
}

declare module 'virtual:hub-connection' {
  /** Set by tooling/vite-plugin-hub.ts under `vite`; null in production builds. */
  export const devHubConnection: { readonly url: string; readonly token: string } | null;
}
