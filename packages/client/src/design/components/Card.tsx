import type { ReactNode } from "react";

interface Props {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, eyebrow, children, className = "" }: Props) {
  return (
    <section className={`card ${className}`.trim()}>
      {eyebrow ? <h2>{eyebrow}</h2> : null}
      {title ? <div className="card-title">{title}</div> : null}
      {children}
    </section>
  );
}
