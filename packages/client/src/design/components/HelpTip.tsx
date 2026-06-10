interface Props {
  text: string;
  label?: string;
}

/** Hover/focus tooltip for non-obvious concepts. */
export function HelpTip({ text, label = "More info" }: Props) {
  return (
    <span className="help-tip" tabIndex={0} role="note" aria-label={text} title={text}>
      <span aria-hidden="true">?</span>
      <span className="help-tip-popup">{text}</span>
      <span className="sr-only">
        {label}: {text}
      </span>
    </span>
  );
}
