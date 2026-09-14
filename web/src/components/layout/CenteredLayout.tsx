import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import styles from "./CenteredLayout.module.css";

interface CenteredLayoutProps {
  title: string;
  subtitle: string;
  /** Column width from the Figma frame — 680 for Profile/Telebirr, 720 for Search. */
  width: number;
  /** Renders the "← Back" control; navigates back in history by default. */
  back?: boolean | (() => void);
  /** Card contents. */
  children: ReactNode;
  /** Anything that belongs in the column but outside the card. */
  after?: ReactNode;
}

export function CenteredLayout({
  title,
  subtitle,
  width,
  back = false,
  children,
  after,
}: CenteredLayoutProps) {
  const navigate = useNavigate();
  const onBack = typeof back === "function" ? back : back ? () => navigate(-1) : undefined;

  return (
    <div className={styles.host} style={{ maxWidth: width }}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack}>
          ← &nbsp;Back
        </button>
      )}
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>
      <section className={styles.card}>{children}</section>
      {after}
    </div>
  );
}
