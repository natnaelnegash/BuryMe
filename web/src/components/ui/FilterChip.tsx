import type { ButtonHTMLAttributes } from "react";

import styles from "./FilterChip.module.css";

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function FilterChip({ active = false, children, ...rest }: FilterChipProps) {
  return (
    <button
      type="button"
      className={[styles.chip, active ? styles.active : styles.inactive].join(" ")}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
