/* Line icons for the design showcase only (SF Symbols-like weight). */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" {...stroke} />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" {...stroke} />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" {...stroke} />
      <circle cx="4.75" cy="6.5" r="1.1" fill="currentColor" />
      <circle cx="4.75" cy="12" r="1.1" fill="currentColor" />
      <circle cx="4.75" cy="17.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function CaptureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.75" {...stroke} />
      <path d="M12 8v8M8 12h8" {...stroke} />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" {...stroke} />
      <circle cx="15" cy="7" r="2" {...stroke} />
      <circle cx="9" cy="17" r="2" {...stroke} />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" {...stroke} strokeWidth={2} />
      <path d="M10 20.5h4" {...stroke} strokeWidth={2} />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.5" {...stroke} strokeWidth={2} />
      <path d="M12 7.5V12l3 2" {...stroke} strokeWidth={2} />
    </svg>
  );
}

/** Empty completion circle for task rows. */
export function Circle() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden style={{ color: 'var(--label-tertiary)' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
