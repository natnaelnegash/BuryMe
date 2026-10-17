import styles from "./LandingPage.module.css";

interface BrowserFrameProps {
  src: string;
  alt: string;
  /** Display size of the screenshot area in the design, used as its aspect ratio. */
  shot: { width: number; height: number };
  eager?: boolean;
}

export function BrowserFrame({ src, alt, shot, eager = false }: BrowserFrameProps) {
  return (
    <div className={styles.frame}>
      <div className={styles.chrome} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <img
        className={styles.shot}
        src={src}
        alt={alt}
        style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
        loading={eager ? "eager" : "lazy"}
      />
    </div>
  );
}
