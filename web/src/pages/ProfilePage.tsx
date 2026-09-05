import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import { updateProfile, verifyTelebirr } from "../api/users.js";
import { useAuth } from "../hooks/useAuth.js";

export function ProfilePage() {
  const { buryMeUser, refetch } = useAuth();
  const [displayName, setDisplayName] = useState(buryMeUser?.display_name ?? "");
  const [telebirrNumber, setTelebirrNumber] = useState("");
  const [telebirr, setTelebirr] = useState(buryMeUser?.telebirr ?? null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [telebirrError, setTelebirrError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTelebirr, setSavingTelebirr] = useState(false);

  if (!buryMeUser) return null;

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      await updateProfile({ display_name: displayName });
      await refetch();
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleTelebirrSubmit(e: FormEvent) {
    e.preventDefault();
    setTelebirrError(null);
    setSavingTelebirr(true);
    try {
      const account = await verifyTelebirr({ telebirr_number: telebirrNumber });
      setTelebirr(account);
      setTelebirrNumber("");
    } catch (err) {
      setTelebirrError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSavingTelebirr(false);
    }
  }

  return (
    <main>
      <h1>Profile</h1>

      <section>
        <h2>Display name</h2>
        <form onSubmit={handleProfileSubmit}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={50}
            required
          />
          <button type="submit" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save"}
          </button>
        </form>
        {profileError && <p role="alert">{profileError}</p>}
      </section>

      <section>
        <h2>Telebirr</h2>
        <p>
          Status: {telebirr?.verification_status ?? "Unverified"}
          {telebirr?.telebirr_number ? ` (${telebirr.telebirr_number})` : ""}
        </p>
        <form onSubmit={handleTelebirrSubmit}>
          <input
            value={telebirrNumber}
            onChange={(e) => setTelebirrNumber(e.target.value)}
            placeholder="09XXXXXXXX or +2519XXXXXXXX"
            required
          />
          <button type="submit" disabled={savingTelebirr}>
            {savingTelebirr ? "Saving…" : "Verify"}
          </button>
        </form>
        {telebirrError && <p role="alert">{telebirrError}</p>}
      </section>
    </main>
  );
}
