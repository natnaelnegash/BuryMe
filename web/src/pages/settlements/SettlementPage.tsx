import { useNavigate, useParams } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { ErrorState } from "../components/domain/ErrorState.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Avatar } from "../components/ui/Avatar.js";
import { Button } from "../components/ui/Button.js";
import { Note } from "../components/ui/Note.js";
import { Spinner } from "../components/ui/Spinner.js";
import { StatusPill } from "../components/ui/StatusPill.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useObligationsQuery } from "../hooks/useObligations.js";
import {
  useAcceptSettlement,
  useCreateSettlementSuggestion,
  useDeclineSettlement,
  useSettlementSuggestionQuery,
} from "../hooks/useSettlements.js";
import { formatMoney } from "../lib/money.js";
import styles from "./SettlementPage.module.css";

// Figma: Screen — Bilateral Settlement (27:525) and Screen — Bilateral
// Settlement · Respond (49:3034 / host 49:3064). One layout, two modes:
// proposing a settlement to someone, and responding to the one they sent.
// The card, the three Summary Rows and the net line are identical; only the
// copy and the two buttons differ.

type Obligation = Schemas["Obligation"];

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

interface CardProps {
  counterpartyName: string;
  pill: string;
  /** What the counterparty still owes the viewer. */
  theyOwe: Schemas["Money"] | null;
  /** What the viewer still owes the counterparty. */
  youOwe: Schemas["Money"] | null;
  net: Schemas["Money"];
  /** Whether the net lands in the viewer's pocket. */
  netIncoming: boolean;
  note: string;
  children: React.ReactNode;
}

// The shared card body — "R Head" (27:561), the "Sum" stack (27:570), the
// teal Note (27:583) and the button row (27:585).
function SettlementCard({
  counterpartyName,
  pill,
  theyOwe,
  youOwe,
  net,
  netIncoming,
  note,
  children,
}: CardProps) {
  return (
    <div className={styles.stack}>
      <div className={styles.head}>
        <Avatar name={counterpartyName} size={52} />
        <div className={styles.headCol}>
          <span className={styles.name}>{counterpartyName}</span>
          <span className={styles.sub}>Two open obligations between you</span>
        </div>
        <StatusPill status="teal">{pill}</StatusPill>
      </div>

      <div className={styles.sum}>
        <SummaryRow label="They owe you" value={theyOwe ? formatMoney(theyOwe) : "—"} tone="teal" />
        <SummaryRow label="You owe them" value={youOwe ? formatMoney(youOwe) : "—"} tone="amber" />
        <SummaryRow label="Obligations settled" value="2" />
        <div className={styles.netRow}>
          <span className={styles.netLabel}>{netIncoming ? "Net you receive" : "Net you pay"}</span>
          <span className={styles.netValue}>{formatMoney(net)}</span>
        </div>
      </div>

      <Note color="teal">{note}</Note>

      <div className={styles.btnRow}>{children}</div>
    </div>
  );
}

// ── Propose (27:525) ────────────────────────────────────────────────────

export function SettlementProposePage() {
  const { counterpartyId } = useParams<{ counterpartyId: string }>();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const create = useCreateSettlementSuggestion();

  // The pair is the viewer's own two obligations, so the amounts to show
  // come straight off the list they can already see. The backend does the
  // pairing again on submit — this is display only.
  const { data, isLoading } = useObligationsQuery({ limit: 100 });
  const open = (data?.data ?? []).filter(
    (o) => o.status === "Active" || o.status === "Partially Paid",
  );
  const theyOwe = open.find(
    (o) => o.lender.user_id === uid && o.borrower.user_id === counterpartyId,
  );
  const youOwe = open.find(
    (o) => o.borrower.user_id === uid && o.lender.user_id === counterpartyId,
  );
  const counterparty = theyOwe?.borrower ?? youOwe?.lender;

  if (isLoading) return <Spinner block label="Loading obligations" />;

  if (!theyOwe || !youOwe || !counterparty) {
    return (
      <CenteredLayout
        title="Nothing to settle"
        subtitle="Settling needs one open obligation in each direction between you."
        width={680}
        back
      >
        <p className={styles.muted}>
          You and this person don’t both have an open obligation right now.
        </p>
      </CenteredLayout>
    );
  }

  const net = netBetween(theyOwe, youOwe);

  return (
    <CenteredLayout
      title={`Settle Up with ${counterparty.display_name}`}
      subtitle="You both owe each other — one payment clears both."
      width={680}
      back
    >
      <SettlementCard
        counterpartyName={counterparty.display_name}
        pill="Ready to settle"
        theyOwe={theyOwe.outstanding_balance}
        youOwe={youOwe.outstanding_balance}
        net={net.amount}
        netIncoming={net.incoming}
        note={`Settling cancels both obligations and records a single ${formatMoney(net.amount)} transfer.`}
      >
        <Button kind="ghost" block onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button
          block
          disabled={create.isPending}
          onClick={() =>
            create.mutate(counterpartyId as string, {
              onSuccess: (s) => navigate(`/settlements/${s.suggestion_id}`, { replace: true }),
            })
          }
        >
          {create.isPending ? "Sending…" : "Send Settlement Suggestion"}
        </Button>
      </SettlementCard>
      {create.error && (
        <p role="alert" className={styles.error}>
          {errorMessage(create.error)}
        </p>
      )}
    </CenteredLayout>
  );
}

// ── Respond (49:3034) ───────────────────────────────────────────────────

export function SettlementRespondPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const uid = buryMeUser?.user_id;
  const { data: suggestion, isLoading, error } = useSettlementSuggestionQuery(id);
  const accept = useAcceptSettlement();
  const decline = useDeclineSettlement();
  const { data: obligations } = useObligationsQuery({ limit: 100 });

  if (isLoading) return <Spinner block label="Loading settlement suggestion" />;
  if (error || !suggestion) {
    return (
      <CenteredLayout
        title="Settlement Suggested"
        subtitle="This settlement couldn’t be loaded."
        width={680}
        back
      >
        <ErrorState error={error} inset />
      </CenteredLayout>
    );
  }

  const isUserA = suggestion.user_a.user_id === uid;
  const counterparty = isUserA ? suggestion.user_b : suggestion.user_a;
  const myResponse = isUserA ? suggestion.user_a_response : suggestion.user_b_response;
  const theirResponse = isUserA ? suggestion.user_b_response : suggestion.user_a_response;
  const netIncoming = suggestion.net_recipient.user_id === uid;

  // The obligation the viewer borrows on is theirs to pay; the other is
  // what the counterparty owes them.
  const byId = new Map((obligations?.data ?? []).map((o) => [o.obligation_id, o] as const));
  const mine = byId.get(isUserA ? suggestion.obligation_id_a : suggestion.obligation_id_b);
  const theirs = byId.get(isUserA ? suggestion.obligation_id_b : suggestion.obligation_id_a);

  const pending = suggestion.status === "Pending" && myResponse === "Pending";
  const busy = accept.isPending || decline.isPending;
  const err = errorMessage(accept.error) ?? errorMessage(decline.error);

  const subtitle = pending
    ? `${counterparty.display_name} accepted — your response is needed to settle both obligations`
    : suggestion.status === "Accepted"
      ? "Both of you accepted — the obligations are settled."
      : suggestion.status === "Declined"
        ? "This settlement was declined. Both obligations are unchanged."
        : `Waiting on ${counterparty.display_name} to respond.`;

  return (
    <CenteredLayout title="Settlement Suggested" subtitle={subtitle} width={680} back>
      <SettlementCard
        counterpartyName={counterparty.display_name}
        pill={
          suggestion.status === "Accepted"
            ? "Settled"
            : suggestion.status === "Declined"
              ? "Declined"
              : theirResponse === "Accepted"
                ? "They accepted"
                : "Awaiting their response"
        }
        theyOwe={theirs?.outstanding_balance ?? null}
        youOwe={mine?.outstanding_balance ?? null}
        net={suggestion.net_amount}
        netIncoming={netIncoming}
        note={
          pending
            ? "Both of you must accept before the obligations settle. Declining leaves them unchanged."
            : `Settling cancels both obligations and records a single ${formatMoney(suggestion.net_amount)} transfer.`
        }
      >
        {pending ? (
          <>
            <Button
              kind="ghost"
              block
              disabled={busy}
              onClick={() =>
                decline.mutate(id as string, { onSuccess: () => navigate("/", { replace: true }) })
              }
            >
              {decline.isPending ? "Declining…" : "Decline"}
            </Button>
            <Button block disabled={busy} onClick={() => accept.mutate(id as string)}>
              {accept.isPending ? "Accepting…" : "Accept settlement"}
            </Button>
          </>
        ) : (
          <Button kind="ghost" block onClick={() => navigate("/obligations")}>
            Back to Obligations
          </Button>
        )}
      </SettlementCard>
      {err && (
        <p role="alert" className={styles.error}>
          {err}
        </p>
      )}
    </CenteredLayout>
  );
}

// Display-only netting for the propose screen — the authoritative figure is
// computed server-side when the suggestion is created.
function netBetween(theyOwe: Obligation, youOwe: Obligation) {
  const them = theyOwe.outstanding_balance.amount;
  const you = youOwe.outstanding_balance.amount;
  const incoming = them >= you;
  return {
    incoming,
    amount: {
      amount: Math.abs(Math.round((them - you) * 100) / 100),
      currency: "ETB" as const,
    },
  };
}
