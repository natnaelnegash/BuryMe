import type { ReactNode } from "react";

import { Avatar, type AvatarAccent } from "./Avatar.js";
import styles from "./StateCard.module.css";

interface StateCardProps {
  glyph: string;
  accent?: AvatarAccent;
  title: string;
  body: string;
  action?: ReactNode;
  inset?: boolean;
}

export function StateCard({
  glyph,
  accent = "teal",
  title,
  body,
  action,
  inset = false,
}: StateCardProps) {
  return (
    <section className={[styles.card, inset ? styles.inset : ""].filter(Boolean).join(" ")}>
      <Avatar glyph={glyph} size={56} accent={accent} />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {action}
    </section>
  );
}
