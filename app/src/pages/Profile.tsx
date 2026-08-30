import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth, type GuardianAthlete } from "../context/AuthContext";
import { useProfileSwitching } from "../hooks/useProfileSwitching";
import { ApiError } from "../hooks/useApi";
import { Field, MediaField, Toast } from "../components/ui";
import { AthleteSelfProfile } from "../components/AthleteSelfProfile";
import { StaffSelfProfile } from "../components/StaffSelfProfile";
import { AthleteSocialProfile } from "../components/AthleteSocialProfile";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { switchTargets, canSwitch, chooseTarget } = useProfileSwitching();
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const showActiveNav = user?.status === "active" && user.role;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        phone,
        date_of_birth: dateOfBirth || undefined,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col pt-[env(safe-area-inset-top)]">
      {user?.role === "athlete" && user.athlete_id && (
        <AthleteSocialProfile
          athleteId={user.athlete_id}
          isSelf
          editing={editing}
          onToggleEdit={() => setEditing((e) => !e)}
        />
      )}
      <div className="flex flex-1 flex-col justify-center gap-6 p-6">
        {(user?.role !== "athlete" || editing) && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
            <p className="text-sm text-stone-600">{user?.email}</p>
          </div>
        )}

        {canSwitch && (
          <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-card">
            <span className="text-sm font-medium text-stone-700">Acting as</span>
            <div className="flex flex-col gap-2">
              {switchTargets.map((target) => (
                <button
                  key={target.key}
                  type="button"
                  onClick={() => chooseTarget(target)}
                  className={`flex min-h-[44px] items-center justify-between rounded-xl border px-4 py-2 text-left font-medium ${
                    target.active
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-stone-200"
                  }`}
                >
                  <span className="flex flex-col">
                    <span>{target.label}</span>
                    {target.name && (
                      <span className="text-xs font-normal text-stone-500">
                        {target.name}
                      </span>
                    )}
                  </span>
                  {target.active && <span className="text-sm">✓ Active</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {user?.role === "athlete" && user.athlete_id && editing && (
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <AthleteSelfProfile athleteId={user.athlete_id} />
          </div>
        )}
        {user?.role === "coach" && user.coach_id && (
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <StaffSelfProfile kind="coach" id={user.coach_id} />
          </div>
        )}
        {user?.role === "referee" && user.referee_id && (
          <div className="rounded-2xl bg-white p-4 shadow-card">
            <StaffSelfProfile kind="referee" id={user.referee_id} />
          </div>
        )}

        {(user?.role !== "athlete" || editing) && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="font-semibold">Account</h2>
            <MediaField
              label="Avatar"
              kind="image"
              value={user?.photo_url ?? ""}
              onChange={(url) => updateProfile({ photo_url: url })}
              onError={showToast}
            />
            <Field label="First name">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Last name">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Phone number">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {saved && <p className="text-sm text-green-700">Saved.</p>}
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
          </form>
        )}

        <LinkGuardian />
        {toast && <Toast message={toast} />}

        {showActiveNav && (
          <Link to="/" className="text-center text-sm font-medium text-red-700">
            Back to app
          </Link>
        )}
      </div>
    </div>
  );
}

// Extracts the token from a pasted full guardian-invite link
// (?guardian=<token>), or treats the input as the bare token itself if
// it isn't a URL - covers both "clicked" and "entered via their profile"
// per the guardian-invite link's own two redemption paths.
function extractGuardianToken(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("guardian") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function LinkGuardian() {
  const { linkGuardian } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<GuardianAthlete | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmed(null);
    setSubmitting(true);
    try {
      const athlete = await linkGuardian(extractGuardianToken(value));
      setConfirmed(athlete);
      setValue("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
      <h2 className="font-semibold">Link a guardian</h2>
      <p className="text-sm text-stone-600">
        Ask an athlete (or their coach) for their guardian invite link,
        then paste it here to access their profile.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste link or code"
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
        />
        <button
          type="submit"
          disabled={submitting || !value.trim()}
          className="min-h-[44px] rounded-full bg-red-600 px-4 font-medium text-white disabled:opacity-50"
        >
          Link
        </button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {confirmed && (
        <p className="text-sm text-green-700">
          Linked to {confirmed.first_name} {confirmed.last_name}. Switch to
          it from "Acting as" above.
        </p>
      )}
    </div>
  );
}
