import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { PersonRow } from "../components/domain/PersonRow.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { useSearchUsersQuery } from "../hooks/useUsers.js";
import styles from "./SearchPage.module.css";

// Figma: Screen — User Discovery (38:1533).
export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const { data, isFetching, error } = useSearchUsersQuery(submittedQuery);

  const results = data ?? [];
  const searched = submittedQuery.length >= 2;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmittedQuery(query.trim());
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
          <Button type="submit" disabled={isFetching}>
            {isFetching ? "Searching…" : "Search"}
          </Button>
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error instanceof ApiError ? error.message : "Something went wrong."}
          </p>
        )}

        {searched && !isFetching && results.length === 0 && (
          <p className={styles.empty}>No one matched that search.</p>
        )}

        {results.length > 0 && (
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
                    onClick={() => navigate(`/requests/new?to=${encodeURIComponent(user.user_id)}`)}
                  >
                    Request
                  </Button>
                }
              />
            ))}
          </div>
        )}

        <Note color="gray">Only registered BuryMe users appear in search results.</Note>
      </form>
    </CenteredLayout>
  );
}
