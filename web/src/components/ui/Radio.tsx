import styles from "./Radio.module.css";

// Figma: Radio component set (29:962) — a 22px box holding a 20px ring with a
// 2px stroke; Selected=True turns the ring teal and adds a 10px teal dot.
// Purely presentational: the surrounding OptionCard / PersonRow owns the
// click and the aria state.
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
