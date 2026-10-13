import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ErrorState } from "../components/domain/ErrorState.js";
import { PersonRow } from "../components/domain/PersonRow.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { Spinner } from "../components/ui/Spinner.js";
import { StateCard } from "../components/ui/StateCard.js";
import { useSearchUsersQuery } from "../hooks/useUsers.js";
import styles from "./SearchPage.module.css";

// Figma: Screen — User Discovery (38:1533).
export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Results follow typing (debounced in the hook). The form and its button
  // remain so Enter still works and so an impatient search skips the wait.
  const { data, isSearching, searchNow, term, error } = useSearchUsersQuery(query);

  const results = data ?? [];
  const searched = term.length >= 2;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    searchNow();
  }

  return (
    <CenteredLayout
      title="Find people"
      subtitle="Search registered users by name, phone number, or email."
      width={720}
      back
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.searchRow}>
          <Field
            label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, or email"
            minLength={2}
            maxLength={100}
            required
          />
          <Button type="submit" disabled={query.trim().length < 2}>
            Search
          </Button>
        </div>

        {error && <ErrorState error={error} onRetry={searchNow} inset />}

        {/* While refining a term the previous results stay up, so the spinner
            sits beside them rather than replacing them. */}
        {isSearching && results.length === 0 && <Spinner block label="Searching for people" />}

        {searched && !error && !isSearching && results.length === 0 && (
          <StateCard
            inset
            glyph="?"
            accent="gray"
            title="No one found"
            body="Only registered users appear here. Try a different name or number."
            action={
              <Button kind="secondary" size="small" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        )}

        {results.length > 0 && (
          <>
            {isSearching && (
              <p className={styles.searching}>
                <Spinner size={14} label="Searching for people" /> Searching…
              </p>
            )}
            <div className={styles.results}>
              {results.map((user) => (
                <PersonRow
                  key={user.user_id}
                  name={user.display_name}
                  action={
                    <Button
                      type="button"
                      kind="secondary"
                      size="small"
                      onClick={() =>
                        navigate(`/requests/new?to=${encodeURIComponent(user.user_id)}`)
                      }
                    >
                      Request
                    </Button>
                  }
                />
              ))}
            </div>
          </>
        )}

        <Note color="gray">Only registered BuryMe users appear in search results.</Note>
      </form>
    </CenteredLayout>
  );
}
