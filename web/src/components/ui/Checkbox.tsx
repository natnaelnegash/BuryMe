import styles from "./Checkbox.module.css";

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={[styles.box, checked ? styles.on : ""].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {checked && <span className={styles.tick}>✓</span>}
    </span>
  );
}
