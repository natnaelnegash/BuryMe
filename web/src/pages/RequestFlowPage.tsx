import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { PersonRow } from "../components/domain/PersonRow.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { OptionCard } from "../components/ui/OptionCard.js";
import { Spinner } from "../components/ui/Spinner.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useCreateRequest } from "../hooks/useRequests.js";
import { useSearchUsersQuery, useUserQuery } from "../hooks/useUsers.js";
import { formatDate, todayIso } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import styles from "./RequestFlowPage.module.css";

// Figma: Flow — Borrow Request · Steps 1–3 (15:2, 15:79, 15:146) and
// Flow — Lending Record · Steps 1–4 (15:208, 15:286, 15:344, 15:409). The
// two flows share every screen except the Lend-only "Disbursement Method"
// step, so one component drives both from a step list.
//
// Deviations from the frames, all forced by the contract:
//  - a Due date field on the terms step (`proposed_due_date` is required,
//    and the review step already shows it);
//  - "Reason" is required, not optional (`purpose` minLength 3);
//  - the Lend review says the request will be *Pending* — POST /requests
//    creates a Request the borrower must accept, nothing goes Active on
//    create.

type Kind = "borrow" | "lend";
type Step = "recipient" | "disbursement" | "terms" | "review";
type RepaymentType = Schemas["RepaymentType"];
type DisbursementMethod = Schemas["DisbursementMethod"];

interface InstallmentDraft {
  amount: string;
  due_date: string;
}

const STEPS: Record<Kind, Step[]> = {
  borrow: ["recipient", "terms", "review"],
  lend: ["recipient", "disbursement", "terms", "review"],
};

const COPY: Record<Kind, Record<Step, { title: string; subtitle: string }>> = {
  borrow: {
    recipient: { title: "Send a Borrow Request", subtitle: "Choose who you want to borrow from" },
    disbursement: { title: "", subtitle: "" },
    terms: { title: "Request Terms", subtitle: "Set the amount and how you’ll repay" },
    review: { title: "Review & Send", subtitle: "Confirm the details before sending" },
  },
  lend: {
    recipient: { title: "Add a Lending Record", subtitle: "Who are you lending to?" },
    disbursement: { title: "Disbursement Method", subtitle: "How will they receive the money?" },
    terms: { title: "Lending Terms", subtitle: "Set the amount and repayment plan" },
    review: { title: "Review & Create", subtitle: "Confirm before recording this loan" },
  },
};

const EMPTY_INSTALLMENT: InstallmentDraft = { amount: "", due_date: "" };

export function RequestFlowPage() {
  const { kind } = useParams();
  if (kind !== "borrow" && kind !== "lend") return <Navigate to="/requests/new" replace />;
  return <Flow kind={kind} />;
}

function Flow({ kind }: { kind: Kind }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const steps = STEPS[kind];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] as Step;

  // Step 1 — recipient.
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<Schemas["UserSummary"] | null>(null);
  const { data: results, isSearching: searching, searchNow, term } = useSearchUsersQuery(query);
  const preselected = useUserQuery(params.get("to"));
  useEffect(() => {
    if (preselected.data && !recipient) setRecipient(preselected.data);
  }, [preselected.data, recipient]);

  // Step 2 (Lend only) — disbursement.
  const [disbursement, setDisbursement] = useState<DisbursementMethod>("Already Given");

  // Terms.
  const [amount, setAmount] = useState("");
  const [repaymentType, setRepaymentType] = useState<RepaymentType>("Lump Sum");
  const [purpose, setPurpose] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [installments, setInstallments] = useState<InstallmentDraft[]>([
    EMPTY_INSTALLMENT,
    EMPTY_INSTALLMENT,
  ]);
  const [stepError, setStepError] = useState<string | null>(null);

  const createRequest = useCreateRequest();

  const amountNumber = Number(amount);
  const scheduledTotal = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  function next() {
    setStepError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function back() {
    setStepError(null);
    if (stepIndex === 0) navigate("/requests/new");
    else setStepIndex((i) => i - 1);
  }

  function handleRecipientContinue() {
    if (!recipient) {
      setStepError("Pick who this request is for.");
      return;
    }
    next();
  }

  // Light client-side checks so the user isn't sent to review with an
  // obviously broken form — the server's validation stays authoritative.
  function handleTermsContinue(e: FormEvent) {
    e.preventDefault();
    if (!(amountNumber > 0)) return setStepError("Enter an amount greater than zero.");
    if (purpose.trim().length < 3) return setStepError("Give a reason of at least 3 characters.");
    if (!dueDate) return setStepError("Choose a due date.");
    if (repaymentType === "Installments") {
      if (installments.some((i) => !(Number(i.amount) > 0) || !i.due_date)) {
        return setStepError("Every installment needs an amount and a date.");
      }
      if (Math.abs(scheduledTotal - amountNumber) > 0.01) {
        return setStepError("Installments must add up to the amount.");
      }
      const dates = installments.map((i) => i.due_date);
      const ordered = dates.every((d, i) => i === 0 || d > (dates[i - 1] as string));
      if (!ordered) return setStepError("Installment dates must be in ascending order.");
      if ((dates[dates.length - 1] as string) > dueDate) {
        return setStepError("The last installment must fall on or before the due date.");
      }
    }
    next();
  }

  function evenSplit() {
    const n = installments.length;
    if (!(amountNumber > 0) || n === 0) return;
    const base = Math.floor((amountNumber / n) * 100) / 100;
    const remainder = Math.round((amountNumber - base * n) * 100) / 100;
    setInstallments((rows) =>
      rows.map((row, i) => ({
        ...row,
        amount: String(i === n - 1 ? Math.round((base + remainder) * 100) / 100 : base),
      })),
    );
  }

  function updateInstallment(index: number, patch: Partial<InstallmentDraft>) {
    setInstallments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    if (!recipient) return;
    const money: Schemas["Money"] = { amount: amountNumber, currency: "ETB" };
    const schedule =
      repaymentType === "Installments"
        ? {
            proposed_schedule: {
              installments: installments.map((i) => ({
                amount: { amount: Number(i.amount), currency: "ETB" as const },
                due_date: i.due_date,
              })),
            },
          }
        : {};
    const body: Schemas["BorrowRequestInput"] | Schemas["LendRequestInput"] =
      kind === "borrow"
        ? {
            request_type: "Borrow",
            recipient_user_id: recipient.user_id,
            amount: money,
            purpose: purpose.trim(),
            proposed_repayment_type: repaymentType,
            proposed_due_date: dueDate,
            ...schedule,
          }
        : {
            request_type: "Lend",
            recipient_user_id: recipient.user_id,
            amount: money,
            purpose: purpose.trim(),
            proposed_repayment_type: repaymentType,
            proposed_due_date: dueDate,
            disbursement_method: disbursement,
            ...schedule,
          };
    createRequest.mutate(body, { onSuccess: () => navigate("/requests") });
  }

  const submitError = createRequest.isError
    ? createRequest.error instanceof ApiError
      ? createRequest.error.message
      : "Something went wrong."
    : null;

  const copy = COPY[kind][step];
  const firstName = recipient?.display_name.split(" ")[0] ?? "They";

  return (
    <CenteredLayout
      title={copy.title}
      subtitle={copy.subtitle}
      width={720}
      back={back}
      step={{ current: stepIndex + 1, total: steps.length }}
    >
      {step === "recipient" && (
        <form
          className={styles.stack}
          onSubmit={(e) => {
            // Results already follow typing; Enter just skips the debounce.
            e.preventDefault();
            searchNow();
          }}
        >
          <Field
            label="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone number"
            minLength={2}
            maxLength={100}
          />
          {recipient && !(results ?? []).some((u) => u.user_id === recipient.user_id) && (
            <PersonRow
              name={recipient.display_name}
              selected
              onSelect={() => setRecipient(recipient)}
            />
          )}
          {(results ?? []).map((user) => (
            <PersonRow
              key={user.user_id}
              name={user.display_name}
              selected={recipient?.user_id === user.user_id}
              onSelect={() => setRecipient(user)}
            />
          ))}
          {searching && (results ?? []).length === 0 && (
            <Spinner block label="Searching for people" />
          )}
          {term.length >= 2 && !searching && (results ?? []).length === 0 && (
            <p className={styles.empty}>No one matched that search.</p>
          )}
          {stepError && (
            <p role="alert" className={styles.error}>
              {stepError}
            </p>
          )}
          <div className={styles.btnRow}>
            <Button type="button" kind="ghost" block onClick={() => navigate("/requests/new")}>
              Cancel
            </Button>
            <Button type="button" block onClick={handleRecipientContinue}>
              Continue
            </Button>
          </div>
        </form>
      )}

      {step === "disbursement" && (
        <div className={styles.stack} role="radiogroup" aria-label="Disbursement method">
          <OptionCard
            title="Already Given"
            description="I’ve handed over the money — the obligation becomes Active right away"
            selected={disbursement === "Already Given"}
            onClick={() => setDisbursement("Already Given")}
          />
          <OptionCard
            title="Through App"
            description="Send via Chapa to their Telebirr — they must verify Telebirr first"
            selected={disbursement === "Through App"}
            onClick={() => setDisbursement("Through App")}
          />
          <div className={styles.btnRow}>
            <Button type="button" kind="ghost" block onClick={back}>
              Back
            </Button>
            <Button type="button" block onClick={next}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "terms" && (
        <form className={styles.stack} onSubmit={handleTermsContinue}>
          <Field
            label="Amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1,200 ETB"
            required
          />
          <p className={styles.groupLabel}>Repayment type</p>
          <div className={styles.stack} role="radiogroup" aria-label="Repayment type">
            <OptionCard
              title="Lump Sum"
              description="Repay the full amount in a single payment"
              selected={repaymentType === "Lump Sum"}
              onClick={() => setRepaymentType("Lump Sum")}
            />
            <OptionCard
              title="Installments"
              description="Split into fixed scheduled payments"
              selected={repaymentType === "Installments"}
              onClick={() => setRepaymentType("Installments")}
            />
          </div>
          <Field
            label="Reason"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Rent for August"
            minLength={3}
            maxLength={200}
            required
          />
          <Field
            label="Due date"
            type="date"
            value={dueDate}
            min={todayIso()}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />

          {repaymentType === "Installments" && (
            <>
              <div className={styles.scheduleHeader}>
                <span className={styles.groupLabel}>Installment schedule</span>
                <span className={styles.scheduleActions}>
                  <Button
                    type="button"
                    kind="ghost"
                    size="small"
                    onClick={() => setInstallments((rows) => [...rows, EMPTY_INSTALLMENT])}
                    disabled={installments.length >= 60}
                  >
                    Add installment
                  </Button>
                  <Button type="button" kind="ghost" size="small" onClick={evenSplit}>
                    Even split
                  </Button>
                </span>
              </div>
              {installments.map((row, i) => (
                <div key={i} className={styles.instRow}>
                  <span className={styles.instLabel}>Installment {i + 1}</span>
                  <input
                    className={styles.instInput}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="600 ETB"
                    aria-label={`Installment ${i + 1} amount`}
                    value={row.amount}
                    onChange={(e) => updateInstallment(i, { amount: e.target.value })}
                  />
                  <input
                    className={styles.instInput}
                    type="date"
                    min={todayIso()}
                    aria-label={`Installment ${i + 1} due date`}
                    value={row.due_date}
                    onChange={(e) => updateInstallment(i, { due_date: e.target.value })}
                  />
                  {installments.length > 2 && (
                    <button
                      type="button"
                      className={styles.instRemove}
                      aria-label={`Remove installment ${i + 1}`}
                      onClick={() => setInstallments((rows) => rows.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <SummaryRow
                label="Scheduled total"
                value={`${formatMoney({ amount: scheduledTotal, currency: "ETB" })} of ${formatMoney({ amount: amountNumber || 0, currency: "ETB" })}`}
                divider={false}
              />
              <Note color="teal">
                Installments must add up to the amount you are asking for, and each date must fall
                in order on or before {dueDate ? formatDate(dueDate) : "the due date"}.
              </Note>
            </>
          )}

          {stepError && (
            <p role="alert" className={styles.error}>
              {stepError}
            </p>
          )}
          <div className={styles.btnRow}>
            <Button type="button" kind="ghost" block onClick={back}>
              Back
            </Button>
            <Button type="submit" block>
              Continue
            </Button>
          </div>
        </form>
      )}

      {step === "review" && recipient && (
        <div className={styles.stack}>
          <div className={styles.summary}>
            <SummaryRow label="To" value={recipient.display_name} />
            <SummaryRow
              label="Amount"
              value={formatMoney({ amount: amountNumber, currency: "ETB" })}
              tone={kind === "borrow" ? "amber" : "teal"}
            />
            <SummaryRow
              label="Repayment type"
              value={
                repaymentType === "Installments"
                  ? `Installments (${installments.length} payments)`
                  : "Lump Sum"
              }
            />
            {kind === "lend" && <SummaryRow label="Disbursement" value={disbursement} />}
            <SummaryRow label="Due date" value={formatDate(dueDate)} divider={kind === "lend"} />
            {kind === "borrow" && <SummaryRow label="Reason" value={purpose} divider={false} />}
            {kind === "lend" && (
              <SummaryRow
                label="Status on create"
                value={`Pending — ${firstName} must accept`}
                tone="gray"
                divider={false}
              />
            )}
          </div>
          <Note color="indigo">{firstName} can accept, decline, or send one counter-proposal.</Note>
          {submitError && (
            <p role="alert" className={styles.error}>
              {submitError}
            </p>
          )}
          <div className={styles.btnRow}>
            <Button
              type="button"
              kind="ghost"
              block
              onClick={back}
              disabled={createRequest.isPending}
            >
              Back
            </Button>
            <Button type="button" block onClick={submit} disabled={createRequest.isPending}>
              {createRequest.isPending
                ? "Sending…"
                : kind === "borrow"
                  ? "Send Request"
                  : "Create Record"}
            </Button>
          </div>
        </div>
      )}
    </CenteredLayout>
  );
}
