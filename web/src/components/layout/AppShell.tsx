import type { ReactNode } from "react";

import { TopNav } from "./TopNav.js";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <TopNav />
      <main className={styles.body}>{children}</main>
    </div>
  );
}
