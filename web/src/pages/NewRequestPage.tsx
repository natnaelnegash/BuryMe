import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { useCreateRequest } from "../hooks/useRequests.js";
import { useSearchUsersQuery } from "../hooks/useUsers.js";

export function NewRequestPage() {
  const navigate = useNavigate();
  const [requestType, setRequestType] = useState<"Borrow" | "Lend">("Borrow");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [disbursementMethod, setDisbursementMethod] = useState<"Already Given" | "Through App">(
    "Already Given",
  );
  const [formError, setFormError] = useState<string | null>(null);

  const { data: candidates } = useSearchUsersQuery(submittedQuery);
  const createRequestMutation = useCreateRequest();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!recipientId) {
      setFormError("Pick a recipient from the search results first.");
      return;
    }
    const body: Schemas["BorrowRequestInput"] | Schemas["LendRequestInput"] = {
      request_type: requestType,
      recipient_user_id: recipientId,
      amount: { amount: Number(amount), currency: "ETB" },
      purpose,
      proposed_repayment_type: "Lump Sum",
      proposed_due_date: dueDate,
      ...(requestType === "Lend" ? { disbursement_method: disbursementMethod } : {}),
    } as Schemas["BorrowRequestInput"] | Schemas["LendRequestInput"];
    createRequestMutation.mutate(body, { onSuccess: () => navigate("/requests") });
  }

  const error =
    formError ??
    (createRequestMutation.isError
      ? createRequestMutation.error instanceof ApiError
        ? createRequestMutation.error.message
        : "Something went wrong."
      : null);

  return (
    <div>
      <h1>New request</h1>
      <form onSubmit={handleSubmit}>
        <label>
          <input
            type="radio"
            checked={requestType === "Borrow"}
            onChange={() => setRequestType("Borrow")}
          />
          Borrow (I need money)
        </label>
        <label>
          <input
            type="radio"
            checked={requestType === "Lend"}
            onChange={() => setRequestType("Lend")}
          />
          Lend (I'm offering money)
        </label>

        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipient by name/phone/email"
          />
          <button type="button" onClick={() => setSubmittedQuery(query)}>
            Search
          </button>
          <ul>
            {(candidates ?? []).map((c) => (
              <li key={c.user_id}>
                <button type="button" onClick={() => setRecipientId(c.user_id)}>
                  {recipientId === c.user_id ? "✓ " : ""}
                  {c.display_name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (ETB)"
          type="number"
          min="0.01"
          step="0.01"
          required
        />
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Purpose"
          minLength={3}
          maxLength={200}
          required
        />
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" required />
        {requestType === "Lend" && (
          <select
            value={disbursementMethod}
            onChange={(e) =>
              setDisbursementMethod(e.target.value as "Already Given" | "Through App")
            }
          >
            <option value="Already Given">Already given directly</option>
            <option value="Through App">Send through the app</option>
          </select>
        )}
        <button type="submit" disabled={createRequestMutation.isPending}>
          {createRequestMutation.isPending ? "Sending…" : "Send request"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
