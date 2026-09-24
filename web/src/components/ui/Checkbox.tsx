import styles from "./Checkbox.module.css";

// Figma: Checkbox component set (76:1164) — 20×20, radius 5, 1.5px border;
// teal fill with a white ✓ when On. Presentational: the surrounding row
// owns the click, like ui/Radio.
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
