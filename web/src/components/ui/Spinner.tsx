import styles from "./Spinner.module.css";

// Not a Figma component — the design file has no loading state, so this is
// built from the design system's own tokens (teal, 1.5px strokes) to sit
// alongside the grounded primitives without inventing a new visual language.
//
// The arc takes `currentColor`, so it adapts to wherever it is placed: teal
// on a page, white inside a filled button, gray in muted copy.
interface SpinnerProps {
  /** Diameter in px. 16 sits on a line of body text; 24 suits a page. */
  size?: number;
  /** Centre it in a padded block — the page- and list-level loading state. */
  block?: boolean;
  /**
   * What screen readers announce in place of the visual. Name the thing
   * being fetched where the context isn't obvious from the heading.
   */
  label?: string;
}

export function Spinner({ size = 24, block = false, label = "Loading" }: SpinnerProps) {
  const ring = (
    <span
      className={styles.ring}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 10)) }}
    />
  );

  // `role="status"` rather than `role="progressbar"`: there is no determinate
  // value to report, and status politely announces the label once.
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
