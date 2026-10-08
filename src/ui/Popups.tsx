import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CloseIcon, ExternalIcon } from './glass/icons';
import { GlassIconButton, GlassPanel, GlassPillButton } from './glass/Glass';
import { openExternal } from '../core/openExternal';
import { useHub } from './HubContext';
import { interfaceStore, useInterface, type PopupState } from './interfaceStore';

/** Keep Tab inside an open pop-up, so keyboard users cannot wander behind it. */
function trapFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input, select, iframe, [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * A backdrop click that closes the pop-up, but not the click of the very tap
 * that opened it: on a touch screen the browser sends that click after the
 * pop-up has already appeared under the finger.
 */
function useBackdropClose(close: () => void): () => void {
  const openedAt = useRef(performance.now());
  return () => {
    if (performance.now() - openedAt.current > 450) close();
  };
}

/** Give focus back to whatever had it before the pop-up opened. */
function useRestoreFocus(): void {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previous?.focus();
  }, []);
}

function Popup({ popup }: { readonly popup: PopupState }) {
  const hub = useHub();
  const titleId = useId();
  const textId = useId();
  const [closing, setClosing] = useState(false);
  useRestoreFocus();
  const close = (): void => {
    // With reduced motion there is no closing animation to wait for.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) interfaceStore.closePopup(popup.key);
    else setClosing(true);
  };
  const sheet = popup.kind === 'sheet';
  const onBackdrop = useBackdropClose(close);

  return (
    <div
      className={`popup popup--${popup.kind}${closing ? ' popup--closing' : ''}`}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) interfaceStore.closePopup(popup.key);
      }}
    >
      <div className="popup__backdrop" onClick={onBackdrop} aria-hidden="true" />
      <GlassPanel
        className="popup__panel"
        radius={sheet ? 30 : 28}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={popup.text === '' ? undefined : textId}
        onKeyDown={trapFocus}
      >
        {sheet && <div className="popup__handle" aria-hidden="true" />}
        <h2 id={titleId} className="popup__title">
          {popup.title}
        </h2>
        {popup.text !== '' && (
          <p id={textId} className="popup__text">
            {popup.text}
          </p>
        )}
        <div className="popup__buttons">
          {popup.buttons.map((button, i) => (
            <GlassPillButton
              key={`${button.label}-${i}`}
              label={button.label}
              primary={i === 0 && popup.buttons.length > 1}
              autoFocus={i === 0}
              onPress={() => {
                close();
                hub.run(button.actions);
              }}
            />
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

function WebPanel({ url }: { readonly url: string }) {
  const titleId = useId();
  const [loaded, setLoaded] = useState(false);
  const onBackdrop = useBackdropClose(() => interfaceStore.closeWeb());
  useRestoreFocus();
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Shown as written.
  }

  return (
    <div className="popup popup--web">
      <div className="popup__backdrop" onClick={onBackdrop} aria-hidden="true" />
      <GlassPanel className="web-panel" radius={26} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapFocus}>
        <header className="web-panel__bar">
          <div className="web-panel__title">
            <h2 id={titleId} className="web-panel__host">
              {host}
            </h2>
            <p className="web-panel__hint">Page not showing? Some sites refuse to appear inside apps; open it in the browser.</p>
          </div>
          <GlassIconButton
            label="Open in the browser"
            icon={<ExternalIcon />}
            onPress={() => void openExternal(url)}
          />
          <GlassIconButton label="Close" icon={<CloseIcon />} autoFocus onPress={() => interfaceStore.closeWeb()} />
        </header>
        <div className={`web-panel__frame${loaded ? ' web-panel__frame--loaded' : ''}`}>
          <iframe
            src={url}
            title={host}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </GlassPanel>
    </div>
  );
}

/** The hub's pop-ups: glass dialogs, bottom sheets and the in-app web panel, newest on top. */
export function Popups() {
  const ui = useInterface();
  return (
    <>
      {ui.popups.map((popup) => (
        <Popup key={popup.key} popup={popup} />
      ))}
      {ui.web !== null && <WebPanel key={ui.web.key} url={ui.web.url} />}
    </>
  );
}
