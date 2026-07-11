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
      {title ? (
        eyebrow ? (
          <h3 className="card-title">{title}</h3>
        ) : (
          <h2 className="card-title">{title}</h2>
        )
      ) : null}
      {children}
    </section>
  );
}
