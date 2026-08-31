import { useEffect, useState } from "react";
import { ApiError, useApi } from "../hooks/useApi";
import { Spinner, Toast } from "./ui";

// Lets an athlete (or their coach/admin) generate a shareable link that
// lets a guardian either click it (registering a brand-new account,
// pre-linked) or paste it into their own existing profile to link -
// same generate/regenerate/revoke shape as JoinLink (admin/Clubs.tsx),
// since like a club's join link this is multi-use and never expires,
// unlike the single-recipient ProfileInviteLink. `endpoint` is the
// athlete's own `/:id/guardian-invite-link` route.
export function GuardianInviteLink({ endpoint }: { endpoint: string }) {
  const api = useApi();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [forbidden, setForbidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setToken(undefined);
    setForbidden(false);
    api
      .get<{ guardian_invite_token: string | null }>(endpoint)
      .then((res) => setToken(res.guardian_invite_token))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        setToken(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  if (forbidden) return null;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  async function generate() {
    const res = await api.post<{ guardian_invite_token: string }>(
      endpoint,
      {}
    );
    setToken(res.guardian_invite_token);
  }

  async function revoke() {
    await api.del(endpoint);
    setToken(null);
  }

  function copyLink(url: string) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("Link copied"))
      .catch(() => showToast("Couldn't copy link"));
  }

  const inviteUrl = token
    ? `${window.location.origin}/register?guardian=${token}`
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
      <span className="text-xs font-medium text-stone-600">
        Guardian invite link
      </span>
      <p className="text-xs text-stone-500">
        Share this link with a guardian (e.g. a parent) - they can click it
        to create their own login, or paste it into their existing
        profile to link. Either way, they get full access to this
        profile. The same link works for more than one guardian.
      </p>

      {token === undefined ? (
        <Spinner />
      ) : inviteUrl ? (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.target.select()}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => copyLink(inviteUrl)}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm font-medium"
            >
              Copy
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={generate}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 text-sm font-medium"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={revoke}
              className="min-h-[44px] flex-1 rounded-xl border border-red-200 text-sm font-medium text-red-700"
            >
              Revoke
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={generate}
          className="min-h-[44px] rounded-xl border border-stone-300 text-sm font-medium"
        >
          Generate link
        </button>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
