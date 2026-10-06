import styles from "./Avatar.module.css";

export type AvatarAccent = "teal" | "amber" | "indigo" | "gray";

interface AvatarBase {
  size?: 40 | 44 | 52 | 56;
  accent?: AvatarAccent;
}

/**
 * Either a person — whose initial is derived — or a bare glyph. The Figma
 * component set takes free text in its `Initial` property, which the state
 * blocks (39:1817, 66:1037) override with "+", "🔔", "⇄" and the like; those
 * can't go through `name`, since deriving an initial would split a
 * multi-byte glyph in half.
 */
type AvatarProps = AvatarBase & ({ name: string; glyph?: never } | { glyph: string; name?: never });

export function Avatar({ name, glyph, size = 44, accent = "teal" }: AvatarProps) {
  const content = glyph ?? ((name ?? "").trim().charAt(0).toUpperCase() || "?");
  return (
    <span
      className={[styles.avatar, styles[`s${size}`], styles[accent]].join(" ")}
      aria-hidden="true"
    >
      {content}
    </span>
  );
}
