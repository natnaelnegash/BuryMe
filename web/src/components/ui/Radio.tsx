import styles from "./Radio.module.css";

export function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      className={[styles.radio, selected ? styles.selected : ""].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {selected && <span className={styles.dot} />}
    </span>
  );
}
