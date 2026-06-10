import { useEffect, useId, useState } from "react";
import { HelpTip } from "./HelpTip.js";

interface Props {
  label: string;
  help?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}

export function Slider({
  label,
  help,
  value,
  min = 0,
  max = 100,
  step = 1,
  onCommit,
  disabled,
}: Props) {
  const id = useId();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="slider-row">
      <label htmlFor={id} className="slider-label">
        {label}
        {help ? <HelpTip text={help} /> : null}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-valuetext={`${draft}`}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft(v);
        }}
        onMouseUp={() => onCommit(draft)}
        onTouchEnd={() => onCommit(draft)}
        onKeyUp={() => onCommit(draft)}
      />
      <span className="value">{step < 1 ? draft.toFixed(1) : draft}</span>
    </div>
  );
}
