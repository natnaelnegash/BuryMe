import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell.js";
import { useAuth } from "./hooks/useAuth.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NewRequestPage } from "./pages/NewRequestPage.js";
import { ObligationsPage } from "./pages/ObligationsPage.js";
import { ProfileEditPage } from "./pages/ProfileEditPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { RequestsPage } from "./pages/RequestsPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { TelebirrPage } from "./pages/TelebirrPage.js";

// Gates on auth status, then drops the screen into the app shell (top nav +
// body container) that every authenticated screen shares in the design. The
// auth screens deliberately sit outside it — their Figma frames have no nav.
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <p>Loading…</p>;
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (status === "needs-registration") return <Navigate to="/register" replace />;
  return <AppShell>{children}</AppShell>;
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
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile/edit"
        element={
          <RequireAuth>
            <ProfileEditPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile/telebirr"
        element={
          <RequireAuth>
            <TelebirrPage />
          </RequireAuth>
        }
      />
      <Route
        path="/search"
        element={
          <RequireAuth>
            <SearchPage />
          </RequireAuth>
        }
      />
      <Route
        path="/requests"
        element={
          <RequireAuth>
            <RequestsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/requests/new"
        element={
          <RequireAuth>
            <NewRequestPage />
          </RequireAuth>
        }
      />
      <Route
        path="/obligations"
        element={
          <RequireAuth>
            <ObligationsPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
