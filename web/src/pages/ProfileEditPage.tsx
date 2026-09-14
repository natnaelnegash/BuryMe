import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { useAuth } from "../hooks/useAuth.js";
import { useUpdateProfile } from "../hooks/useUsers.js";
import styles from "./ProfileEditPage.module.css";

// Figma: Screen — Profile Edit (38:1751). Same column/card shape as Profile
// and Telebirr Verification, with the one editable field the contract's
// UpdateProfileRequest exposes.
export function ProfileEditPage() {
  const navigate = useNavigate();
  const { buryMeUser, refetch } = useAuth();
  const [displayName, setDisplayName] = useState(buryMeUser?.display_name ?? "");
  const updateProfile = useUpdateProfile();

  if (!buryMeUser) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateProfile.mutate(
      { display_name: displayName },
      {
        onSuccess: async () => {
          await refetch();
          navigate("/profile");
        },
      },
    );
  }

  const error = updateProfile.isError
    ? updateProfile.error instanceof ApiError
      ? updateProfile.error.message
      : "Something went wrong."
    : null;

  return (
    <CenteredLayout title="Edit profile" subtitle="Change how your name appears to others." width={680} back>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          label="Full name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={50}
          required
          error={error}
        />
        <Field label="Phone number" value={buryMeUser.identifier} readOnlyLook />
        <div className={styles.actions}>
          <Button type="submit" block disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" kind="ghost" block onClick={() => navigate("/profile")}>
            Cancel
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
