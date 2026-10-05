import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** F11 toggles full screen, Escape leaves it. Works in Tauri and in a browser. */
async function setFullscreen(next: boolean | 'toggle'): Promise<void> {
  if (isTauri()) {
    const window = getCurrentWindow();
    const target = next === 'toggle' ? !(await window.isFullscreen()) : next;
    await window.setFullscreen(target);
    return;
  }
  const isFull = document.fullscreenElement !== null;
  const target = next === 'toggle' ? !isFull : next;
  if (target && !isFull) await document.documentElement.requestFullscreen();
  if (!target && isFull) await document.exitFullscreen();
}

export function installFullscreenKeys(): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'F11') {
      event.preventDefault();
      void setFullscreen('toggle');
    } else if (event.key === 'Escape' && isTauri()) {
      void setFullscreen(false);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
