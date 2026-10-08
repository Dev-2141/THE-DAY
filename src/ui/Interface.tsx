import type { Settings } from '../core/settings';
import { EnterScreen } from './EnterScreen';
import { HideIcon } from './glass/icons';
import { GlassIconButton, GlassPillButton } from './glass/Glass';
import { useInterface } from './interfaceStore';
import { SettingsMorph } from './SettingsMorph';
import { useIdle } from './useIdle';

interface InterfaceProps {
  readonly settings: Settings;
  readonly reducedMotion: boolean;
}

/**
 * The glass interface in front of the scene. On the home screen: the hide
 * and settings buttons in the top corner, clear of the title, and the ENTER
 * pill near the bottom, below the time and date. It fades out after a few
 * seconds without input and returns on any touch or mouse movement; the
 * hide button removes it entirely for a clean view.
 */
export function Interface({ settings, reducedMotion }: InterfaceProps) {
  const ui = useInterface();
  const home = ui.screen === 'home';
  const busy = !home || ui.settingsOpen || ui.popups.length > 0 || ui.web !== null;
  const idle = useIdle(!busy && !ui.uiHidden);
  const classes = ['interface'];
  if (idle) classes.push('interface--idle');
  if (ui.uiHidden) classes.push('interface--hidden');

  return (
    <div className={classes.join(' ')} inert={ui.uiHidden}>
      {home && (
        <>
          <nav className="corner" aria-label="View">
            <GlassIconButton hubId="btn.hide_ui" label="Hide the interface" icon={<HideIcon />} />
            {!ui.hidden.has('btn.settings') && (
              <SettingsMorph open={ui.settingsOpen} settings={settings} reducedMotion={reducedMotion} />
            )}
          </nav>
          <div className="enter-dock">
            <GlassPillButton hubId="btn.enter" label="ENTER" primary className="enter-pill" />
          </div>
        </>
      )}
      {ui.screen === 'enter' && <EnterScreen />}
    </div>
  );
}
