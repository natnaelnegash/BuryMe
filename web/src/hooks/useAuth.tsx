import type { Schemas } from "@buryme/shared";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../api/client.js";
import { getMe } from "../api/auth.js";
import { auth } from "../api/firebase.js";

export type AuthStatus = "loading" | "signed-out" | "needs-registration" | "ready";

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  buryMeUser: Schemas["User"] | null;
  status: AuthStatus;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [buryMeUser, setBuryMeUser] = useState<Schemas["User"] | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  async function loadProfile() {
    try {
      const user = await getMe();
      setBuryMeUser(user);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setBuryMeUser(null);
        setStatus("needs-registration");
        return;
      }
      throw err;
    }
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setBuryMeUser(null);
        setStatus("signed-out");
        return;
      }
      setStatus("loading");
      await loadProfile();
    });
    // `loadProfile` intentionally omitted — it's stable across renders
    // (recreated each render but functionally identical) and this effect
    // should only ever re-subscribe on mount/unmount.
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, buryMeUser, status, refetch: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}
