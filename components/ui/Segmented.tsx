'use client';

import { useState } from 'react';

export type SegmentedOption<T extends string = string> = { value: T; label: string };

export type SegmentedProps<T extends string = string> = {
  /** Accessible name of the group, e.g. "Área". */
  label: string;
  options: SegmentedOption<T>[];
  /** Controlled value. Omit to let the control keep its own state. */
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
};

/** Pill segmented control on glass (e.g. Personal / Trabajo); the selected pill is a raised lighter capsule. */
export function Segmented<T extends string = string>({ label, options, value, defaultValue, onChange }: SegmentedProps<T>) {
  const [internal, setInternal] = useState<T | undefined>(defaultValue ?? options[0]?.value);
  const current = value ?? internal;

  return (
    <div role="radiogroup" aria-label={label} className="ui-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === current}
          className="ui-segmented__option"
          onClick={() => {
            if (value === undefined) setInternal(option.value);
            onChange?.(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
