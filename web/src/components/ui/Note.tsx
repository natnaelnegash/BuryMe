import type { ReactNode } from "react";

import styles from "./Note.module.css";

export type NoteColor = "teal" | "amber" | "indigo" | "gray";

export function Note({ color = "gray", children }: { color?: NoteColor; children: ReactNode }) {
  return <p className={[styles.note, styles[color]].join(" ")}>{children}</p>;
}
