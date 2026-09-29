import { Avatar, type AvatarAccent } from "./Avatar.js";
import styles from "./AvatarStack.module.css";

// Figma: "Avatar Stack" (221:4523). The frames show two overlapping 44px
// avatars however many people are on the bill, so the stack caps at two and
// the count lives in the card's subtitle instead.
const MAX_SHOWN = 2;

// The design alternates teal then amber across the stack.
const ACCENTS = ["teal", "amber", "indigo", "gray"] as const satisfies readonly AvatarAccent[];

export function AvatarStack({ names }: { names: string[] }) {
  return (
    <span className={styles.stack}>
      {names.slice(0, MAX_SHOWN).map((name, i) => (
        <Avatar key={`${name}-${i}`} name={name} size={44} accent={ACCENTS[i % ACCENTS.length]!} />
      ))}
    </span>
  );
}
