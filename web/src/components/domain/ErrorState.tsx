import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { ApiError, NetworkError } from "../../api/client.js";
import { auth } from "../../api/firebase.js";
import { Button } from "../ui/Button.js";
import { StateCard } from "../ui/StateCard.js";

// Figma: the four error blocks of "States — Empty & Error" (39:1817) —
// Network Error, Session Expired, Not Found, Payment Failed. Which one a
// failure deserves is decided from the thrown error rather than at each call
// site, so the same condition can't be dressed two different ways on two
// screens. Copy is the design's, verbatim.
//
// Only page-level failures belong here. A rejected mutation inside a form
// (VALIDATION_ERROR, STATUS_CONFLICT, BALANCE_EXCEEDED) still reports itself
// inline next to the field or button that caused it — `hasErrorBlock` is how
// a screen tells the two apart.

type Kind = "offline" | "expired" | "missing" | "payment" | "generic";

function classify(error: unknown): Kind {
  // Nothing loaded and no reason given — the `error || !data` branches reach
  // here when a fetch succeeded but returned nothing, which is a missing
  // record as far as the reader is concerned.
  if (error === null || error === undefined) return "missing";
  if (error instanceof NetworkError) return "offline";
  if (!(error instanceof ApiError)) return "generic";
  switch (error.code) {
    case "UNAUTHENTICATED":
      return "expired";
    // The design's Not Found copy covers both on purpose — "doesn't exist, or
    // you don't have access to it" — and for a record you aren't party to the
    // API deliberately can't tell them apart.
    case "NOT_FOUND":
    case "UNAUTHORIZED":
      return "missing";
    case "PAYMENT_GATEWAY_UNAVAILABLE":
    case "PAYMENT_GATEWAY_ERROR":
      return "payment";
    default:
      return "generic";
  }
}

/**
 * Whether a designed block covers this failure. Screens that normally report
 * an error inline use it to promote the ones that deserve the full block.
 */
export function hasErrorBlock(error: unknown): boolean {
  return classify(error) !== "generic";
}

interface ErrorStateProps {
  error: unknown;
  /** Wires up "Retry" / "Try again" where the caller can re-run the request. */
  onRetry?: () => void;
  /** Passed through to StateCard for screens already inside a card. */
  inset?: boolean;
}

export function ErrorState({ error, onRetry, inset = false }: ErrorStateProps) {
  const navigate = useNavigate();

  switch (classify(error)) {
    case "offline":
      return (
        <StateCard
          inset={inset}
          glyph="!"
          accent="amber"
          title="You’re offline"
          body="You’re offline. Please check your connection and try again."
          action={
            onRetry && (
              <Button kind="secondary" size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
        />
      );

    case "expired":
      // Signing out is what sends them to /login: the auth listener sees it
      // and RequireAuth redirects.
      return (
        <StateCard
          inset={inset}
          glyph="⏱"
          accent="gray"
          title="Your session has expired"
          body="Your session has expired. Please log in again."
          action={
            <Button size="small" onClick={() => void signOut(auth)}>
              Log in again
            </Button>
          }
        />
      );

    case "missing":
      return (
        <StateCard
          inset={inset}
          glyph="?"
          accent="gray"
          title="We couldn’t find that"
          body="The record doesn’t exist, or you don’t have access to it."
          action={
            <Button kind="secondary" size="small" onClick={() => navigate("/obligations")}>
              Back to Obligations
            </Button>
          }
        />
      );

    case "payment":
      return (
        <StateCard
          inset={inset}
          glyph="!"
          accent="amber"
          title="Payment couldn’t be processed"
          body="Your payment could not be processed. Please try again or use a different method."
          action={
            onRetry && (
              <Button size="small" onClick={onRetry}>
                Try again
              </Button>
            )
          }
        />
      );

    default:
      // No block covers the remaining codes, so this borrows the error
      // treatment and shows the server's own message, which §12.1 guarantees
      // is user-safe. Title and glyph are mine.
      return (
        <StateCard
          inset={inset}
          glyph="!"
          accent="amber"
          title="Something went wrong"
          body={
            error instanceof ApiError ? error.message : "Something went wrong. Please try again."
          }
          action={
            onRetry && (
              <Button kind="secondary" size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
        />
      );
  }
}
