/* Line icons in the spirit of SF Symbols: 24-unit grid, one 1.8 stroke, round caps. */

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

export function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.5 2.4 4.9-5.2" />
    </svg>
  );
}

export function IdeaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <path d="M9.2 17.2h5.6M10 20.2h4" />
      <path d="M12 3.6a5.9 5.9 0 0 0-3.6 10.6c.6.5.9 1.1.9 1.8v.9h5.4V16c0-.7.3-1.3.9-1.8A5.9 5.9 0 0 0 12 3.6z" />
    </svg>
  );
}

export function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <path d="M5.2 8h13.6l-1 11.2a1.6 1.6 0 0 1-1.6 1.4H7.8a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </svg>
  );
}

export function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <rect x="3.8" y="8" width="16.4" height="4.2" rx="1.2" />
      <path d="M5.4 12.2v6.6a1.7 1.7 0 0 0 1.7 1.7h9.8a1.7 1.7 0 0 0 1.7-1.7v-6.6M12 8v12.5" />
      <path d="M12 8c-1-2.6-2.4-4-3.9-4a1.9 1.9 0 0 0 0 4M12 8c1-2.6 2.4-4 3.9-4a1.9 1.9 0 0 1 0 4" />
    </svg>
  );
}

export function TrayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <path d="M3.8 13.5l2.3-7.2A1.8 1.8 0 0 1 7.8 5h8.4a1.8 1.8 0 0 1 1.7 1.3l2.3 7.2v4.7a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8z" />
      <path d="M3.8 13.5h4.5l1.2 2.2h5l1.2-2.2h4.5" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line} strokeWidth={2.2}>
      <path d="M6 12.5l4 3.8 8-8.6" />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...line}>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2" />
      <path d="M5 9v9.2A1.8 1.8 0 0 0 6.8 20h10.4a1.8 1.8 0 0 0 1.8-1.8V9M10 13h4" />
    </svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 12 20" aria-hidden {...line} strokeWidth={2.4}>
      <path d="M9.5 2L2 10l7.5 8" />
    </svg>
  );
}

/** Completion circle for task rows (iOS Reminders style); filled with a check once done. */
export function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none">
      <circle
        cx="12"
        cy="12"
        r="10.25"
        stroke="currentColor"
        strokeWidth={1.5}
        fill={checked ? 'currentColor' : 'none'}
      />
      {checked && (
        <path d="M7.4 12.4l3.1 3 6.1-6.6" stroke="var(--on-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
