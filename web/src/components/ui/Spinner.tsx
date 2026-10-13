import styles from "./Spinner.module.css";

interface SpinnerProps {
  size?: number;
  block?: boolean;
  label?: string;
}

export function Spinner({ size = 24, block = false, label = "Loading" }: SpinnerProps) {
  const ring = (
    <span
      className={styles.ring}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 10)) }}
    />
  );

  return block ? (
    <div className={styles.block} role="status" aria-label={label}>
      {ring}
    </div>
  ) : (
    <span className={styles.inline} role="status" aria-label={label}>
      {ring}
    </span>
  );
}
