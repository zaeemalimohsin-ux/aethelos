import type { InputHTMLAttributes } from "react";
import { useId } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className = "", ...rest }: Props) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input ${error ? "invalid" : ""} ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-desc` : undefined}
        {...rest}
      />
      {error ? (
        <span id={`${id}-desc`} className="error-text" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-desc`} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
