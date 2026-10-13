import { Avatar, type AvatarAccent } from "./Avatar.js";
import styles from "./AvatarStack.module.css";

const MAX_SHOWN = 2;

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
