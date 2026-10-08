/**
 * The glass component set: a round icon button, a pill button with a label,
 * and a glass panel. Each is translucent with the live scene blurred and
 * bent behind it, carries a thin specular rim and a soft inner highlight
 * that follow the light (the pointer or the device tilt), and responds to
 * touch with a squash, a spring back and a ripple of light.
 *
 * Buttons with a `hubId` send tap, long press and hover to the hub; the hub
 * can hide them or change their label. Buttons without one run `onPress`.
 */
import { forwardRef, useImperativeHandle, useRef, type HTMLAttributes, type ReactNode } from 'react';
import type { ElementId } from '../../hub/elementIds';
import { useHubGestures } from '../HubContext';
import { useInterface } from '../interfaceStore';
import { useGlass } from './useGlass';
import { usePressFeedback } from './usePressFeedback';

interface GlassButtonProps {
  /** Accessible name; the pill also shows it. */
  readonly label: string;
  readonly hubId?: ElementId;
  readonly onPress?: () => void;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly className?: string;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly autoFocus?: boolean;
  readonly title?: string;
}

interface ShellProps extends GlassButtonProps {
  readonly shape: 'icon' | 'pill';
  readonly children: ReactNode;
}

const GlassButtonShell = forwardRef<HTMLButtonElement, ShellProps>(function GlassButtonShell(
  { shape, label, hubId, onPress, payload, className, expanded, controls, autoFocus, title, children },
  forwarded,
) {
  const ref = useRef<HTMLButtonElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLButtonElement);
  useGlass(ref, 'round');
  const press = usePressFeedback(ref);
  const gestures = useHubGestures(hubId ?? null, { ...(payload ? { payload } : {}), ...(onPress ? { onTap: onPress } : {}) });

  return (
    <button
      ref={ref}
      type="button"
      className={`glass glass--${shape}${className ? ` ${className}` : ''}`}
      aria-label={shape === 'icon' ? label : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      title={title ?? (shape === 'icon' ? label : undefined)}
      // Pop-ups move focus to their first button, for keyboard and screen-reader users.
      autoFocus={autoFocus}
      data-hub-id={hubId}
      onClick={gestures.onClick}
      onPointerDown={(event) => {
        press.onPointerDown(event);
        gestures.onPointerDown(event);
      }}
      onPointerUp={() => {
        press.release();
        gestures.onPointerUp();
      }}
      onPointerCancel={() => {
        press.release();
        gestures.onPointerCancel();
      }}
      onPointerEnter={gestures.onPointerEnter}
      onPointerLeave={() => {
        press.release();
        gestures.onPointerLeave();
      }}
      onContextMenu={gestures.onContextMenu}
    >
      <span className="glass__content">{children}</span>
    </button>
  );
});

/** A round glass button with an icon. Hidden when the hub hides its element. */
export const GlassIconButton = forwardRef<HTMLButtonElement, GlassButtonProps & { readonly icon: ReactNode }>(
  function GlassIconButton({ icon, ...props }, ref) {
    const ui = useInterface();
    if (props.hubId !== undefined && ui.hidden.has(props.hubId)) return null;
    return (
      <GlassButtonShell ref={ref} shape="icon" {...props}>
        {icon}
      </GlassButtonShell>
    );
  },
);

/** A pill-shaped glass button with a label, which the hub can change. */
export function GlassPillButton(props: GlassButtonProps & { readonly icon?: ReactNode; readonly primary?: boolean }) {
  const ui = useInterface();
  if (props.hubId !== undefined && ui.hidden.has(props.hubId)) return null;
  const label = (props.hubId !== undefined ? ui.labels[props.hubId] : undefined) ?? props.label;
  const { icon, primary, className, ...rest } = props;
  return (
    <GlassButtonShell
      shape="pill"
      {...rest}
      label={label}
      className={`${primary ? 'glass--primary ' : ''}${className ?? ''}`.trim()}
    >
      {icon}
      <span className="glass__label">{label}</span>
    </GlassButtonShell>
  );
}

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Corner radius in px. */
  readonly radius?: number;
}

/** A glass panel: the surface for dialogs, sheets, the settings and the web panel. */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(function GlassPanel(
  { radius = 28, className, style, children, ...rest },
  forwarded,
) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLDivElement);
  useGlass(ref, radius, { bezel: 26, strength: 30, blur: 14 });
  return (
    <div
      ref={ref}
      className={`glass glass--panel${className ? ` ${className}` : ''}`}
      style={{ ...style, borderRadius: radius }}
      {...rest}
    >
      {children}
    </div>
  );
});
