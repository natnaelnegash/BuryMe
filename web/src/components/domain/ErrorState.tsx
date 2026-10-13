import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { ApiError, NetworkError } from "../../api/client.js";
import { auth } from "../../api/firebase.js";
import { Button } from "../ui/Button.js";
import { StateCard } from "../ui/StateCard.js";

type Kind = "offline" | "expired" | "missing" | "payment" | "generic";

function classify(error: unknown): Kind {
  if (error === null || error === undefined) return "missing";
  if (error instanceof NetworkError) return "offline";
  if (!(error instanceof ApiError)) return "generic";
  switch (error.code) {
    case "UNAUTHENTICATED":
      return "expired";
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

export function hasErrorBlock(error: unknown): boolean {
  return classify(error) !== "generic";
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
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
