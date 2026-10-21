/* Line icons for the design showcase, in the spirit of SF Symbols: 24-unit grid, one 1.8 stroke, round caps. */

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 9.8h17M8 3v3.6M16 3v3.6" />
      <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.75" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.75" cy="17.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CaptureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z" />
    </svg>
  );
}

/** Empty completion circle for task rows (iOS Reminders style). */
export function Circle() {
  return (
    <svg className="dd-check" viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10.25" />
    </svg>
  );
}
