/** Thin line icons for the glass buttons, drawn to match the poster's hairline rule. */

const common = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
      <circle cx="12" cy="12" r="6.6" />
    </svg>
  );
}

export function HideIcon() {
  return (
    <svg {...common}>
      <path d="M3 12s3.3-6 9-6c1.6 0 3 .45 4.2 1.1M21 12s-1.1 2-3.2 3.7M9.9 17.7c.7.2 1.4.3 2.1.3 5.7 0 9-6 9-6" />
      <path d="M9.6 9.7a3.2 3.2 0 0 0 4.6 4.5" />
      <path d="M4 20 20 4" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...common}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg {...common}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg {...common}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </svg>
  );
}
