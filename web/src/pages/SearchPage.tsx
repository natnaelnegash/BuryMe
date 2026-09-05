import { useState, type FormEvent } from "react";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { searchUsers } from "../api/users.js";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Schemas["UserSummary"][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSearching(true);
    try {
      setResults(await searchUsers(query));
    } catch (err) {
      setResults([]);
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main>
      <h1>Find people</h1>
      <form onSubmit={handleSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone, or email"
          minLength={2}
          maxLength={100}
          required
        />
        <button type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {results.map((user) => (
          <li key={user.user_id}>{user.display_name}</li>
        ))}
      </ul>
    </main>
  );
}
