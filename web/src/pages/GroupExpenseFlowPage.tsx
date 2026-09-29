import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { PersonRow } from "../components/domain/PersonRow.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Checkbox } from "../components/ui/Checkbox.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { Toggle } from "../components/ui/Toggle.js";
import { useAuth } from "../hooks/useAuth.js";
import { useCreateGroupExpense } from "../hooks/useGroupExpenses.js";
import { useSearchUsersQuery } from "../hooks/useUsers.js";
import { todayIso } from "../lib/dates.js";
import { formatMoney } from "../lib/money.js";
import styles from "./GroupExpenseFlowPage.module.css";

// Figma: Flow — Group Expense · Step 1 (27:330 / host 27:360) and Step 2
// (27:410 / host 27:440). Two steps: pick who's splitting, then enter the
// total and each person's share. The payer's own share is counted in the
// total but never becomes an obligation (§8.12).
//
// Deviation from the frames: they have no due-date field, but the spawned
// obligations need one (contract CreateGroupExpenseInput.due_date), so
// "Repayment due date" sits under the total/date row.

type Participant = Schemas["UserSummary"];

export function GroupExpenseFlowPage() {
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const create = useCreateGroupExpense();

  const [step, setStep] = useState<1 | 2>(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Step 1 — participants.
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const { data: results, isFetching } = useSearchUsersQuery(submittedQuery);
  const [selected, setSelected] = useState<Participant[]>([]);
  const [includeMe, setIncludeMe] = useState(true);

  // Step 2 — amounts.
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [shares, setShares] = useState<Record<string, string>>({});
  const [myShare, setMyShare] = useState("");

  const totalNumber = Number(total) || 0;
  const assigned = useMemo(() => {
    const participantSum = selected.reduce((sum, p) => sum + (Number(shares[p.user_id]) || 0), 0);
    return participantSum + (includeMe ? Number(myShare) || 0 : 0);
  }, [selected, shares, includeMe, myShare]);
  const balanced = totalNumber > 0 && Math.abs(assigned - totalNumber) <= 0.01;

  // Search results minus anyone already picked, and never the payer — they
  // join via the "include me" toggle instead.
  const candidates = (results ?? []).filter((u) => u.user_id !== buryMeUser?.user_id);

  function toggleParticipant(user: Participant) {
    setStepError(null);
    setSelected((current) =>
      current.some((p) => p.user_id === user.user_id)
        ? current.filter((p) => p.user_id !== user.user_id)
        : current.length >= 50
          ? current
          : [...current, user],
    );
  }

  function splitEqually() {
    const parts = selected.length + (includeMe ? 1 : 0);
    if (!(totalNumber > 0) || parts === 0) return;
    // Give everyone the floor share and hand the rounding remainder to the
    // last person, so the shares always reconstruct the total exactly.
    const base = Math.floor((totalNumber / parts) * 100) / 100;
    const remainder = Math.round((totalNumber - base * parts) * 100) / 100;
    const next: Record<string, string> = {};
    selected.forEach((p, i) => {
      const isLast = !includeMe && i === selected.length - 1;
      next[p.user_id] = String(isLast ? Math.round((base + remainder) * 100) / 100 : base);
    });
    setShares(next);
    if (includeMe) setMyShare(String(Math.round((base + remainder) * 100) / 100));
  }

  function handleContinue() {
    if (selected.length === 0) {
      setStepError("Pick at least one person to split this with.");
      return;
    }
    setStepError(null);
    setStep(2);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (description.trim().length < 3)
      return setStepError("Give this expense a short description.");
    if (!(totalNumber > 0)) return setStepError("Enter the total amount.");
    if (!dueDate) return setStepError("Choose when the shares are due back.");
    if (selected.some((p) => !(Number(shares[p.user_id]) > 0))) {
      return setStepError("Every participant needs a share.");
    }
    if (includeMe && !(Number(myShare) > 0)) return setStepError("Enter your own share.");
    if (!balanced) return setStepError("The shares have to add up to the total.");
    setStepError(null);

    create.mutate(
      {
        total_amount: { amount: totalNumber, currency: "ETB" },
        description: description.trim(),
        expense_date: expenseDate,
        due_date: dueDate,
        payer_share_included: includeMe,
        ...(includeMe
          ? { payer_share_amount: { amount: Number(myShare), currency: "ETB" as const } }
          : {}),
        participants: selected.map((p) => ({
          participant_user_id: p.user_id,
          assigned_amount: { amount: Number(shares[p.user_id]), currency: "ETB" as const },
        })),
      },
      { onSuccess: (expense) => navigate(`/expenses/${expense.expense_id}`) },
    );
  }

  const error =
    stepError ??
    (create.error
      ? create.error instanceof ApiError
        ? create.error.message
        : "Something went wrong."
      : null);

  if (step === 1) {
    return (
      <CenteredLayout
        title="New Group Expense"
        subtitle="Who’s splitting this expense?"
        width={720}
        back={() => navigate("/requests/new")}
        step={{ current: 1, total: 2 }}
      >
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQuery(query.trim());
          }}
        >
          <Field
            label="Add participants"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone number"
            minLength={2}
            maxLength={100}
          />

          {/* "Include Me Toggle" (43:1935) — field-bg card, radius 12. */}
          <div className={styles.includeMe}>
            <span className={styles.includeCol}>
              <span className={styles.includeTitle}>Include me in this split</span>
              <span className={styles.includeSub}>
                Your share is counted in the total. No obligation is created for it.
              </span>
            </span>
            <Toggle checked={includeMe} onChange={setIncludeMe} label="Include me in this split" />
          </div>

          {selected.map((user) => (
            <PersonRow
              key={user.user_id}
              name={user.display_name}
              selected
              onSelect={() => toggleParticipant(user)}
              action={<Checkbox checked />}
            />
          ))}
          {candidates
            .filter((u) => !selected.some((p) => p.user_id === u.user_id))
            .map((user) => (
              <PersonRow
                key={user.user_id}
                name={user.display_name}
                onSelect={() => toggleParticipant(user)}
                action={<Checkbox checked={false} />}
              />
            ))}
          {submittedQuery.length >= 2 && !isFetching && candidates.length === 0 && (
            <p className={styles.caption}>No one matched that search.</p>
          )}

          <p className={styles.caption}>
            {selected.length} participant{selected.length === 1 ? "" : "s"} selected · up to 50
          </p>

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <div className={styles.btnRow}>
            <Button type="button" kind="ghost" block onClick={() => navigate("/requests/new")}>
              Cancel
            </Button>
            <Button type="button" block onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </form>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout
      title="Amount & Shares"
      subtitle="Enter the total, then give each person their share"
      width={720}
      back={() => setStep(1)}
      step={{ current: 2, total: 2 }}
    >
      <form className={styles.stack} onSubmit={handleSubmit}>
        <Field
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner at Yod Abyssinia"
          minLength={3}
          maxLength={200}
          required
        />

        {/* "Two Up" (77:1182) — two FILL fields, gap 16. */}
        <div className={styles.twoUp}>
          <Field
            label="Total amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="2,100 ETB"
            required
          />
          <Field
            label="Expense date"
            type="date"
            value={expenseDate}
            max={todayIso()}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </div>

        <Field
          label="Repayment due date"
          type="date"
          value={dueDate}
          min={expenseDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />

        <p className={styles.groupLabel}>Each person’s share</p>
        <Button type="button" kind="ghost" block onClick={splitEqually}>
          Split equally
        </Button>

        <div className={styles.shares}>
          {selected.map((p) => (
            <div key={p.user_id} className={styles.shareRow}>
              <span className={styles.shareName}>{p.display_name}</span>
              <input
                className={styles.shareInput}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                aria-label={`${p.display_name}'s share`}
                value={shares[p.user_id] ?? ""}
                onChange={(e) => setShares((s) => ({ ...s, [p.user_id]: e.target.value }))}
              />
            </div>
          ))}
          {includeMe && (
            <div className={styles.shareRow}>
              <span className={styles.shareName}>You</span>
              <input
                className={styles.shareInput}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                aria-label="Your share"
                value={myShare}
                onChange={(e) => setMyShare(e.target.value)}
              />
            </div>
          )}
          <SummaryRow
            label="Assigned"
            value={`${formatMoney({ amount: assigned, currency: "ETB" })} of ${formatMoney({ amount: totalNumber, currency: "ETB" })}`}
            tone={balanced ? "teal" : "amber"}
            divider={false}
          />
        </div>

        <Note color="indigo">
          Split equally fills these in for you.
          {includeMe
            ? " Your own share is counted in the total but creates no obligation."
            : " Each participant will owe you their share."}
        </Note>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.btnRow}>
          <Button type="button" kind="ghost" block onClick={() => setStep(1)}>
            Back
          </Button>
          <Button type="submit" block disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create Expense"}
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
