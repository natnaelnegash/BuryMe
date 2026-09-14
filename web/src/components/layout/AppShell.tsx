import type { ReactNode } from "react";

import { TopNav } from "./TopNav.js";
import styles from "./AppShell.module.css";

// The chrome every authenticated screen sits inside — top nav plus the body
// container whose padding and 20px stack gap come straight from the Figma
// Screen Shell template.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <TopNav />
      <main className={styles.body}>{children}</main>
    </div>
  );
}
