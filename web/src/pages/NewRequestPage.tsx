import { useNavigate, useSearchParams } from "react-router-dom";

import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Note } from "../components/ui/Note.js";
import { OptionCard } from "../components/ui/OptionCard.js";
import styles from "./NewRequestPage.module.css";

// Figma: Screen — New (chooser) (49:2727). Routes into the Lend / Borrow
// flows; the `?to=` recipient from Search is carried through untouched.
export function NewRequestPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const suffix = params.get("to") ? `?to=${encodeURIComponent(params.get("to") as string)}` : "";

  return (
    <CenteredLayout
      title="What do you want to record?"
      subtitle="Every obligation on BuryMe starts from one of these three."
      width={680}
      back
    >
      <p className={styles.heading}>Choose a starting point</p>
      <OptionCard
        trailing="chevron"
        title="Lend money"
        description="Record money you’ve given, or will send through the app"
        onClick={() => navigate(`/requests/new/lend${suffix}`)}
      />
      <OptionCard
        trailing="chevron"
        title="Borrow money"
        description="Ask someone for money with terms you propose"
        onClick={() => navigate(`/requests/new/borrow${suffix}`)}
      />
      <OptionCard
        trailing="chevron"
        title="Group expense"
        description="Split a bill you paid across up to 50 people"
        onClick={() => navigate("/expenses/new")}
      />
      <Note color="gray">Repayment requests start from an obligation, not here.</Note>
    </CenteredLayout>
  );
}
