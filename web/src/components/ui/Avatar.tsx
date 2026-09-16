import styles from "./Avatar.module.css";

export type AvatarAccent = "teal" | "amber" | "indigo" | "gray";

interface AvatarProps {
  /** The person's name — only its first letter is rendered. */
  name: string;
  size?: 40 | 44 | 52 | 56;
  accent?: AvatarAccent;
}

export function Avatar({ name, size = 44, accent = "teal" }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={[styles.avatar, styles[`s${size}`], styles[accent]].join(" ")}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
