/* Hand-drawn line icons for the design showcase: one pen weight, slightly irregular, overshooting strokes. */

const pen = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...pen}>
      <path d="M6.6 5.2C10 4.8 14.5 5.1 18 4.9C19.6 5 20.4 6 20.3 7.6C20.5 11 20.1 15 20.4 18.4C20.3 19.8 19.4 20.6 17.8 20.5C14 20.2 10 20.7 6.2 20.4C4.6 20.4 3.7 19.5 3.8 18C4 14.5 3.6 10.6 3.9 7.4C4 6 5 5.2 7.4 5.3" />
      <path d="M3.9 9.6C9 9.2 15 9.9 20.3 9.4M8.2 3.1C8.1 4.2 8.3 5.6 8.1 6.6M15.9 3C16 4.1 15.8 5.4 16 6.5" />
      <path d="M8 14.2C9 14.1 10.2 14.3 11 14.1" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...pen}>
      <path d="M8.8 6.6C12.5 6.2 16.5 6.8 20.3 6.4M8.7 12.2C12 11.8 16.8 12.4 19.6 12M8.9 17.6C12.4 17.3 15.6 17.8 18.8 17.5" />
      <path d="M4.2 6.4l.9.3M4.1 12.1l.9.2M4.3 17.5l.8.3" strokeWidth={2.4} />
    </svg>
  );
}

export function CaptureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...pen}>
      <path d="M12.3 3.4C17.2 3.3 20.8 7 20.6 12.1C20.4 17.2 16.8 20.6 11.8 20.5C7 20.4 3.4 16.8 3.5 11.8C3.6 7 7.2 3.5 13.4 3.7" />
      <path d="M12.1 8.1C12 10.7 12.2 13.4 11.9 16M8 12.1C10.7 11.9 13.4 12.2 16.1 11.9" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...pen}>
      <path d="M3.8 7.2C6.8 6.9 9.9 7.3 12.9 7M17.2 7.1C18.3 7 19.3 7.2 20.3 7M3.9 17C5 16.9 6 17.1 6.9 16.9M11.1 17.1C14.2 16.8 17.2 17.2 20.2 16.9" />
      <path d="M15 4.9C16.3 4.8 17.2 5.8 17.1 7.1C17 8.4 16 9.2 14.8 9.1C13.6 9 12.8 8 12.9 6.8C13 5.7 13.9 4.9 15.6 5" />
      <path d="M9 14.9C10.3 14.8 11.2 15.8 11.1 17.1C11 18.4 10 19.2 8.8 19.1C7.6 19 6.8 18 6.9 16.8C7 15.7 7.9 14.9 9.6 15" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...pen}>
      <path d="M5.6 16.8C6.4 15.4 6.2 13.2 6.3 11.2C6.4 7.6 8.8 5.1 12.1 5C15.4 5.1 17.6 7.6 17.7 11.1C17.8 13.3 17.6 15.4 18.6 16.9C14.4 17.3 9.6 17.1 5.2 17.1" />
      <path d="M10.2 19.6C11.2 20.6 12.9 20.5 13.8 19.4M12 3.3C12 3.9 12.1 4.4 12 5" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...pen}>
      <path d="M12.2 3.6C16.9 3.5 20.4 7.1 20.3 12C20.2 16.8 16.7 20.3 11.9 20.2C7.2 20.1 3.7 16.7 3.8 11.8C3.9 7.1 7.4 3.7 13.2 3.9" />
      <path d="M12 7.4C12.1 9 11.9 10.6 12.1 12.2C13.2 12.9 14.4 13.6 15.4 14.4" />
    </svg>
  );
}

/** Empty completion circle for task rows, drawn in one loose stroke. */
export function Circle() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...pen} strokeWidth={1.4}>
      <path d="M12.4 2.6C17.8 2.5 21.6 6.4 21.4 12.1C21.2 17.6 17.4 21.5 11.8 21.4C6.4 21.3 2.6 17.5 2.7 11.9C2.8 6.5 6.6 2.5 13.8 2.9" />
    </svg>
  );
}

/**
 * Small line illustration: a hand holding a pencil over a notebook page.
 * Kept loose and modest, in the spirit of the reference posters.
 */
export function NotebookSketch() {
  return (
    <svg className="dd-sketch" viewBox="0 0 220 140" role="img" aria-label="Mano escribiendo en una libreta" {...pen} strokeWidth={1.5}>
      {/* notebook, slightly rotated page with ruled lines */}
      <path d="M22 34C60 30 104 31 142 28C144 58 146 92 147 124C110 126 64 127 26 129C24 97 23 66 22 34Z" />
      <path d="M30 31C30 64 32 97 34 128" strokeOpacity={0.5} />
      <path d="M42 50C70 49 100 48 128 46M43 66C66 65 96 64 129 62M44 82C70 81 92 80 108 79M45 98C60 97 74 97 86 96" strokeOpacity={0.55} />
      {/* handwriting scribble on the last line */}
      <path d="M88 96C91 92 93 99 96 94C98 90 100 98 103 93C105 90 107 97 110 93" />
      {/* pencil */}
      <path d="M112 92L170 40C173 37 178 38 180 41C182 44 181 48 178 50L120 101Z" />
      <path d="M112 92L108 106L120 101" />
      <path d="M109.5 101.5L108 106L112.5 104.6" fill="currentColor" />
      <path d="M166 44C169 46 172 49 174 53" />
      {/* hand from the right, filled with paper so it sits over the pencil */}
      <path
        style={{ fill: 'var(--bg)' }}
        d="M220 70C205 64 188 56 176 54C166 53 152 60 140 68C134 72 133 79 139 80C146 80 152 76 158 73C150 80 140 86 134 90C130 93 132 99 138 98C150 95 162 90 172 90C178 98 184 104 192 106C202 110 212 112 220 113"
      />
      <path d="M172 90C176 86 181 84 187 86M178 97C182 94 187 93 192 95M139 74C141 73 143 73 144 75" />
    </svg>
  );
}
