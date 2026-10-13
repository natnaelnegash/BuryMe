import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { ProgressSegments } from "../ui/ProgressSegments.js";
import styles from "./CenteredLayout.module.css";

interface CenteredLayoutProps {
  title: string;
  subtitle: string;
  width: number;
  back?: boolean | (() => void);
  step?: { current: number; total: number };
  children: ReactNode;
  plain?: boolean;
  after?: ReactNode;
}

export function CenteredLayout({
  title,
  subtitle,
  width,
  back = false,
  step,
  children,
  plain = false,
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
      <header className={[styles.head, step ? styles.stepHead : ""].filter(Boolean).join(" ")}>
        {step && (
          <span className={styles.step}>
            Step {step.current} of {step.total}
          </span>
        )}
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {step && <ProgressSegments current={step.current} total={step.total} />}
      </header>
      {plain ? children : <section className={styles.card}>{children}</section>}
      {after}
    </div>
  );
}
