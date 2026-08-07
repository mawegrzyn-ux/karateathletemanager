import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, useApi } from "../hooks/useApi";
import { DeleteButton, Spinner, Toast } from "../components/ui";

type Status = {
  admin_configured: boolean;
  connected: boolean;
  google_email: string | null;
  needs_reauth: boolean;
};

export default function GoogleCalendarConnect() {
  const api = useApi();
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function refresh() {
    api
      .get<Status>("/google-calendar/status")
      .then(setStatus)
      .catch(() => setStatus(undefined));
  }

  useEffect(() => {
    refresh();
    if (searchParams.get("connected")) {
      showToast("Google Calendar connected");
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("error")) {
      showToast("Couldn't connect Google Calendar - try again");
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnect() {
    try {
      await api.del("/google-calendar/disconnect");
      showToast("Disconnected");
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function connect() {
    // A real navigation, not fetch - Google's consent screen needs to
    // actually render in the browser.
    window.location.href = "/api/google-calendar/connect";
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Google Calendar</h1>

      {status === undefined ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : !status.admin_configured ? (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-sm text-stone-600">
            Google Calendar sync isn't set up yet - ask your admin to
            configure it under More → Google Calendar.
          </p>
        </div>
      ) : status.connected && !status.needs_reauth ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
          <span className="text-sm font-medium text-green-700">✓ Connected</span>
          {status.google_email && (
            <span className="text-sm text-stone-600">{status.google_email}</span>
          )}
          <p className="text-sm text-stone-600">
            Every Schedule event you're on automatically syncs to this
            Google Calendar - no further action needed.
          </p>
          <DeleteButton
            onClick={disconnect}
            itemLabel="your Google Calendar connection"
            label="Disconnect"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
          {status.connected && status.needs_reauth && (
            <span className="text-sm font-medium text-amber-700">
              Your connection needs to be renewed
            </span>
          )}
          <p className="text-sm text-stone-600">
            Connect your Google account to automatically sync Schedule
            events you're on into your own Google Calendar. You only need
            to do this once.
          </p>
          <button
            onClick={connect}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            {status.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </button>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
