import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./hooks/useAuth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";

function HomePage() {
  const { buryMeUser } = useAuth();
  return (
    <main>
      <h1>BuryMe</h1>
      <p>
        Welcome{buryMeUser ? `, ${buryMeUser.display_name}` : ""}. Screens land per vertical slice
        (see CLAUDE.md).
      </p>
    </main>
  );
}

// Redirects based on auth status rather than rendering per-route — Slice 1
// only has one real destination (HomePage) once signed in and profiled.
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <p>Loading…</p>;
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (status === "needs-registration") return <Navigate to="/register" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
