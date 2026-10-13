import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/Button.js";
import { StateCard } from "../components/ui/StateCard.js";
import styles from "./NotFoundPage.module.css";

// Figma: State — Not Found (39:1871). The same block ErrorState shows for a
// NOT_FOUND response, reached here by a URL that matches no route at all.
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <StateCard
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
    </div>
  );
}
