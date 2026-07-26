import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../hooks/useApi";
import { Spinner, Toast } from "./ui";

interface Club {
  id: number;
  name: string;
}

interface Invite {
  email: string;
  club_id: number | null;
  club_name: string | null;
  token: string;
  expires_at: string;
}

// Lets an admin/club-admin generate a shareable link that lets whoever it's
// sent to create their own login pre-linked to this specific athlete/coach/
// referee profile (and, optionally, pre-joined to a club), auto-approved -
// no email is actually sent (the app has no mailer), the admin copies the
// link and shares it themselves. `endpoint` is the profile's own
// `/:id/invite-link` route (athletes.js/coaches.js/referees.js all expose
// one); a 403 from it (not a club admin of a club this profile belongs to,
// nor of the club picked when the invite was created) means this viewer
// can't manage invites for this profile at all, so the whole section hides
// itself rather than showing a button that would just fail.
export function ProfileInviteLink({
  endpoint,
  showClubPicker,
}: {
  endpoint: string;
  showClubPicker: boolean;
}) {
  const api = useApi();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [forbidden, setForbidden] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [email, setEmail] = useState("");
  const [clubId, setClubId] = useState<number | null>(null);
  const [clubQuery, setClubQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setInvite(undefined);
    setForbidden(false);
    api
      .get<{ invite: Invite | null }>(endpoint)
      .then((res) => setInvite(res.invite))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        setInvite(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    if (!showClubPicker) return;
    api
      .get<{ clubs: Club[] }>("/public/clubs")
      .then((res) => setClubs(res.clubs))
      .catch(() => setClubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showClubPicker]);

  if (forbidden) return null;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ invite: Invite }>(endpoint, {
        email: email.trim(),
        club_id: showClubPicker ? clubId : undefined,
      });
      setInvite(res.invite);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate link");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke() {
    await api.del(endpoint);
    setInvite(null);
    setEmail("");
    setClubId(null);
  }

  function copyLink(url: string) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("Link copied"))
      .catch(() => showToast("Couldn't copy link"));
  }

  const inviteUrl = invite
    ? `${window.location.origin}/register?invite=${invite.token}`
    : null;
  const clubResults = clubs.filter((c) =>
    c.name.toLowerCase().includes(clubQuery.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
      <span className="text-xs font-medium text-stone-600">
        Invite to create account
      </span>
      <p className="text-xs text-stone-500">
        Generate a link for this person to create their own login, already
        linked to this profile{showClubPicker ? " and, optionally, a club" : ""}
        . They're approved automatically.
      </p>

      {invite === undefined ? (
        <Spinner />
      ) : invite ? (
        <>
          <p className="text-xs text-stone-600">
            Invited <strong>{invite.email}</strong>
            {invite.club_name && (
              <>
                {" "}
                · joining <strong>{invite.club_name}</strong>
              </>
            )}
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl ?? ""}
              onFocus={(e) => e.target.select()}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => copyLink(inviteUrl!)}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm font-medium"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={revoke}
            className="min-h-[44px] rounded-xl border border-red-200 text-sm font-medium text-red-700"
          >
            Revoke
          </button>
        </>
      ) : (
        <form onSubmit={generate} className="flex flex-col gap-2">
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 bg-white px-3 text-sm"
          />
          {showClubPicker && (
            <div className="flex flex-col gap-1 rounded-xl bg-white p-2">
              <span className="text-xs font-medium text-stone-600">
                Club (optional)
              </span>
              <input
                value={clubQuery}
                onChange={(e) => setClubQuery(e.target.value)}
                placeholder="Search clubs..."
                className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm"
              />
              <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                {clubResults.map((c) => {
                  const selected = clubId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClubId(selected ? null : c.id)}
                      className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left text-sm ${
                        selected
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-stone-200"
                      }`}
                    >
                      <span>{c.name}</span>
                      <span>{selected ? "✓ Selected" : "Select"}</span>
                    </button>
                  );
                })}
                {clubResults.length === 0 && (
                  <p className="px-1 py-2 text-xs text-stone-500">No matches.</p>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] rounded-xl border border-stone-300 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Generating..." : "Generate link"}
          </button>
        </form>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
