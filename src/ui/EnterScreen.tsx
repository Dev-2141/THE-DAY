import { useEffect, useRef } from 'react';
import { BackIcon } from './glass/icons';
import { GlassIconButton, GlassPanel, GlassPillButton } from './glass/Glass';

/**
 * The screen behind ENTER: a placeholder for the rest of the project. The
 * live scene keeps running behind its glass. Both buttons are wired in
 * hub.py: back (btn.back) returns home, the pill (btn.website) opens a site.
 */
export function EnterScreen() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <section className="screen screen--enter" aria-labelledby="enter-title">
      <GlassIconButton className="screen__back" label="Back" icon={<BackIcon />} hubId="btn.back" />
      <GlassPanel className="enter-panel" radius={32}>
        <p className="enter-panel__kicker">THE DAY</p>
        <h1 id="enter-title" ref={heading} tabIndex={-1} className="enter-panel__title">
          ENTER
        </h1>
        <div className="enter-panel__rule" aria-hidden="true" />
        <p className="enter-panel__text">
          This is a placeholder screen. Connect it to the rest of your project in <code>hub/hub.py</code>.
        </p>
        <GlassPillButton label="Visit website" hubId="btn.website" primary />
      </GlassPanel>
    </section>
  );
}
