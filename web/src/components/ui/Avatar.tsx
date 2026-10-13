import styles from "./Avatar.module.css";

export type AvatarAccent = "teal" | "amber" | "indigo" | "gray";

interface AvatarBase {
  size?: 40 | 44 | 52 | 56;
  accent?: AvatarAccent;
}

type AvatarProps = AvatarBase & ({ name: string; glyph?: never } | { glyph: string; name?: never });

export function Avatar({ name, glyph, size = 44, accent = "teal" }: AvatarProps) {
  // A glyph is passed through whole — deriving an initial would split a
  // multi-byte character such as an emoji in half.
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
