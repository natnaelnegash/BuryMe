import styles from "./Toggle.module.css";

// Figma: Toggle component set (66:743) — 46×26 track, radius 13, 3px
// padding, 20px knob; teal when On, border-grey when Off.
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name — the visible label usually sits beside the control. */
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={[styles.track, checked ? styles.on : ""].filter(Boolean).join(" ")}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
