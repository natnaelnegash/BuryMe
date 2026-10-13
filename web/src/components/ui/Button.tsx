import type { ButtonHTMLAttributes } from "react";

import styles from "./Button.module.css";

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  size?: "default" | "small";
  block?: boolean;
  reason?: string;
}

export function Button({
  kind = "primary",
  size = "default",
  block = false,
  reason,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[size],
    disabled ? styles.disabled : styles[kind],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={[styles.wrapper, block ? styles.block : ""].filter(Boolean).join(" ")}>
      <button className={classes} disabled={disabled} {...rest}>
        {children}
      </button>
      {reason && <span className={styles.reason}>{reason}</span>}
    </span>
  );
}
