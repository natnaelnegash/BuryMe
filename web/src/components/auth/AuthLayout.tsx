import type { ReactNode } from "react";

import styles from "./AuthLayout.module.css";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  /** Card contents — the only part that differs between auth screens. */
  children: ReactNode;
  /** The link line under the card, e.g. "Already have an account? Log in". */
  footer?: ReactNode;
  /** Figma shows a "← Back" control above the brand on the OTP screen. */
  onBack?: () => void;
}

export function AuthLayout({ title, subtitle, children, footer, onBack }: AuthLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.body}>
        <div className={styles.host}>
          {onBack && (
            <button type="button" className={styles.back} onClick={onBack}>
              ← &nbsp;Back
            </button>
          )}

          <div className={styles.brand}>
            <span className={styles.brandDot} aria-hidden="true" />
            <span className={styles.brandName}>BuryMe</span>
          </div>

          <div className={styles.head}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>

          <div className={styles.card}>{children}</div>

          {footer && <p className={styles.footer}>{footer}</p>}
        </div>
      </div>
    </main>
  );
}
