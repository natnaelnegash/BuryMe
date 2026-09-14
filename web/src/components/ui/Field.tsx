import { useId, type InputHTMLAttributes } from "react";

import styles from "./Field.module.css";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Figma: State = Read-only. */
  readOnlyLook?: boolean;
  error?: string | null;
}

export function Field({ label, readOnlyLook = false, error, className, ...rest }: FieldProps) {
  const id = useId();
  const inputClasses = [
    styles.input,
    readOnlyLook ? styles.readonly : "",
    error ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={inputClasses} readOnly={readOnlyLook} {...rest} />
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
