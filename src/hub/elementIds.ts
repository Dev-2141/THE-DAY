/**
 * Every interactive or addressable part of THE DAY, by stable ID.
 *
 * These IDs are the contract between the interface and `hub/hub.py`.
 * Never rename one that is already wired in the hub; add new ones instead.
 * `hub/hub_core` reads this file to warn about typos in `hub.py`, so keep
 * each ID as a plain single-quoted string on its own line.
 */
export const ELEMENT_IDS = [
  // Application-level events (app_start, timer).
  'app',

  // The whole interface (set_visible "ui" hides or shows it for a clean view).
  'ui',

  // Glass buttons on the home screen.
  'btn.enter',
  'btn.settings',
  'btn.hide_ui',

  // Glass buttons on the ENTER screen.
  'btn.back',
  'btn.website',

  // The glass settings panel (set_visible opens, closes or toggles it).
  'panel.settings',

  // Settings panel controls.
  'settings.time_zone',
  'settings.hour_format',
  'settings.show_seconds',
  'settings.motion_intensity',
  'settings.quality',
  'settings.sound',

  // Text.
  'text.title',
  'text.time',
  'text.date',

  // Tappable scene objects.
  'scene.ship',
  'scene.beam',
  'scene.dome_left',
  'scene.dome_right',
  'scene.aircraft',
  'scene.wreck',
  'scene.grass',

  // Development tools.
  'dev.hub_test',
] as const;

export type ElementId = (typeof ELEMENT_IDS)[number];

export const HUB_EVENTS = ['tap', 'long_press', 'hover', 'app_start', 'timer'] as const;

export type HubEvent = (typeof HUB_EVENTS)[number];
