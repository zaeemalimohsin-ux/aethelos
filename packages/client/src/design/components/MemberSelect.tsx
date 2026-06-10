import { useId } from "react";
import { shortKey } from "../../app/format.js";

interface Props {
  label: string;
  hint?: string;
  members: string[];
  value: string;
  onChange: (pubkey: string) => void;
  exclude?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function MemberSelect({
  label,
  hint,
  members,
  value,
  onChange,
  exclude,
  placeholder = "Choose a member…",
  disabled,
}: Props) {
  const id = useId();
  const options = members.filter((m) => m !== exclude);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{options.length === 0 ? "No members yet" : placeholder}</option>
        {options.map((m) => (
          <option key={m} value={m}>
            Member {shortKey(m, 8)}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
