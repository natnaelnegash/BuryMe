import type { ReactNode } from "react";

import { Avatar, type AvatarAccent } from "./Avatar.js";
import styles from "./StateCard.module.css";

// Figma: the 14 blocks in "States — Empty & Error" (39:1817) and
// "States — Success & Confirmation" (66:1037). They are one card with
// different content, not fourteen designs: Avatar 56 + title + body +
// optional small button, centred, in the standard white card.
//
// The frames label each block with an overline ("EMPTY · OBLIGATIONS").
// That names the reference block for the design sheet and is not app
// content, so it isn't reproduced here.
interface StateCardProps {
  /** The glyph in the circle — "+", "✉", "🔔", "!", "✓" per the block. */
  glyph: string;
  accent?: AvatarAccent;
  title: string;
  body: string;
  /** The block's CTA, where it has one. The design uses `size="small"`. */
  action?: ReactNode;
  /**
   * Drop the white surface and shadow, keeping the arrangement. For the
   * screens that already sit inside a `CenteredLayout` card, where the
   * block's own card would nest white on white.
   */
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
