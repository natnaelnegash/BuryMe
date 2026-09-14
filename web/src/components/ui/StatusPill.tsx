import type { ReactNode } from "react";

import styles from "./StatusPill.module.css";

export type PillStatus = "teal" | "amber" | "indigo" | "gray" | "red";

interface StatusPillProps {
  status?: PillStatus;
  size?: "default" | "small";
  children: ReactNode;
}

export function StatusPill({ status = "teal", size = "default", children }: StatusPillProps) {
  return <span className={[styles.pill, styles[size], styles[status]].join(" ")}>{children}</span>;
}
