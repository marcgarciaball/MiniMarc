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

/** iOS toggle, 51×31 with a 44pt hit area; glacier fill when on. */
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
      <span className="ui-switch__thumb" aria-hidden />
    </button>
  );
}
