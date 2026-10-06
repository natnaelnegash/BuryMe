import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell.js";
import { Spinner } from "./components/ui/Spinner.js";
import { useAuth } from "./hooks/useAuth.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { DisbursementPage } from "./pages/DisbursementPage.js";
import { GroupExpenseDetailPage } from "./pages/GroupExpenseDetailPage.js";
import { GroupExpenseFlowPage } from "./pages/GroupExpenseFlowPage.js";
import { MakePaymentPage } from "./pages/MakePaymentPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NewRequestPage } from "./pages/NewRequestPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { NotificationPreferencesPage } from "./pages/NotificationPreferencesPage.js";
import { NotificationsPage } from "./pages/NotificationsPage.js";
import { ObligationDetailPage } from "./pages/ObligationDetailPage.js";
import { ObligationsPage } from "./pages/ObligationsPage.js";
import { ProfileEditPage } from "./pages/ProfileEditPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { RecordPaymentPage } from "./pages/RecordPaymentPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { RequestDetailPage } from "./pages/RequestDetailPage.js";
import { RequestFlowPage } from "./pages/RequestFlowPage.js";
import { RequestsPage } from "./pages/RequestsPage.js";
import { SettlementProposePage, SettlementRespondPage } from "./pages/SettlementPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { TelebirrPage } from "./pages/TelebirrPage.js";
import { TelebirrVerifyPage } from "./pages/TelebirrVerifyPage.js";

// Gates on auth status, then drops the screen into the app shell (top nav +
// body container) that every authenticated screen shares in the design. The
// auth screens deliberately sit outside it — their Figma frames have no nav.
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Spinner block label="Signing you in" />;
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
        path="/profile/telebirr/verify"
        element={
          <RequireAuth>
            <TelebirrVerifyPage />
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
        path="/requests/new/:kind"
        element={
          <RequireAuth>
            <RequestFlowPage />
          </RequireAuth>
        }
      />
      <Route
        path="/requests/:id"
        element={
          <RequireAuth>
            <RequestDetailPage />
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
      <Route
        path="/obligations/:id"
        element={
          <RequireAuth>
            <ObligationDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/obligations/:id/disburse"
        element={
          <RequireAuth>
            <DisbursementPage />
          </RequireAuth>
        }
      />
      <Route
        path="/obligations/:id/pay"
        element={
          <RequireAuth>
            <MakePaymentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/obligations/:id/record"
        element={
          <RequireAuth>
            <RecordPaymentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/expenses/new"
        element={
          <RequireAuth>
            <GroupExpenseFlowPage />
          </RequireAuth>
        }
      />
      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/notifications/preferences"
        element={
          <RequireAuth>
            <NotificationPreferencesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settlements/new/:counterpartyId"
        element={
          <RequireAuth>
            <SettlementProposePage />
          </RequireAuth>
        }
      />
      <Route
        path="/settlements/:id"
        element={
          <RequireAuth>
            <SettlementRespondPage />
          </RequireAuth>
        }
      />
      <Route
        path="/expenses/:id"
        element={
          <RequireAuth>
            <GroupExpenseDetailPage />
          </RequireAuth>
        }
      />
      {/* Inside RequireAuth so an unknown URL keeps the nav rather than
          dropping the shell. A signed-out visitor is sent to /login first. */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <NotFoundPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
