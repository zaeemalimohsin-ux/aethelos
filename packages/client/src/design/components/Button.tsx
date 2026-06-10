import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  block?: boolean;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: "",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  children,
  ...rest
}: Props) {
  const classes = [
    "btn",
    variantClass[variant],
    size === "sm" ? "sm" : "",
    block ? "block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
