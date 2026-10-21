'use client';

import { useState } from 'react';

export type SwitchProps = {
  /** Accessible name (the switch has no visible label of its own). */
  label: string;
  /** Controlled value. Omit to let the switch keep its own state. */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
};

/** iOS toggle drawn in ink (spot-ink fill when on), 51×31 with a 44pt hit area. */
export function Switch({ label, checked, defaultChecked = false, onChange, disabled }: SwitchProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const isOn = checked ?? internal;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      disabled={disabled}
      className="ui-switch"
      onClick={() => {
        if (checked === undefined) setInternal(!isOn);
        onChange?.(!isOn);
      }}
    >
      <svg className="ui-switch__track" viewBox="0 0 51 31" aria-hidden>
        <path d="M15.5 2.2C24 1.6 30 2.6 35.6 2.1C44 2.3 49 8 48.9 15.6C48.7 23.5 43 28.8 35 28.9C27 29.3 22 28.4 15.4 28.9C7.5 28.7 2.1 23 2.2 15.4C2.4 7.8 8 2.5 16.8 2.4" />
      </svg>
      <svg className="ui-switch__thumb" viewBox="0 0 27 27" aria-hidden>
        <path d="M13.6 3C20 2.8 24.2 7.4 24 13.8C23.8 20.2 19.6 24.1 13.3 24C7 23.9 2.9 19.6 3.1 13.3C3.3 7.2 7.6 3.1 14.6 3.3" />
      </svg>
    </button>
  );
}
