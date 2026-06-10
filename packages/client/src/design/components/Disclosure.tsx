import type { ReactNode } from "react";

interface Props {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Disclosure({ summary, children, defaultOpen = false }: Props) {
  return (
    <details className="disclosure" open={defaultOpen || undefined}>
      <summary>{summary}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
