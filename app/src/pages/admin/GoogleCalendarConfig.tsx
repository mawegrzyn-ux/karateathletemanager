import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { DeleteButton, Spinner, Toast } from "../../components/ui";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Athens",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function SecretField({
  label,
  path,
  placeholder,
}: {
  label: string;
  path: string;
  placeholder: string;
}) {
  const api = useApi();
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function refresh() {
    api
      .get<{ configured: boolean }>(path)
      .then((res) => setConfigured(res.configured))
      .catch(() => setConfigured(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await api.patch(path, { api_key: value.trim() });
      setValue("");
      showToast(`${label} saved`);
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Failed to save ${label}`);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    try {
      await api.del(path);
      showToast(`${label} removed`);
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {configured === undefined ? (
        <Spinner />
      ) : (
        <>
          <span
            className={`text-sm font-medium ${
              configured ? "text-green-700" : "text-stone-500"
            }`}
          >
            {configured ? "✓ Configured" : "Not configured"}
          </span>

          <form onSubmit={save} className="flex flex-col gap-3">
            <input
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
            <button
              type="submit"
              disabled={saving || !value.trim()}
              className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>

          {configured && (
            <DeleteButton onClick={clear} itemLabel={label} label="Remove" />
          )}
        </>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

function DefaultTimezoneField() {
  const api = useApi();
  const [value, setValue] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    api
      .get<{ value: string }>("/admin/settings/default-timezone")
      .then((res) => setValue(res.value))
      .catch(() => setValue("UTC"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onChange(next: string) {
    setValue(next);
    try {
      await api.patch("/admin/settings/default-timezone", { value: next });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to save timezone");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
      <span className="text-sm font-medium text-stone-700">Default timezone</span>
      <p className="text-sm text-stone-600">
        Used to translate Schedule event times onto members' Google
        Calendars - this app has no per-club timezone yet, so one value
        covers every synced event.
      </p>
      {value === undefined ? (
        <Spinner />
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

export default function GoogleCalendarConfig() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Google Calendar</h1>
      <p className="text-sm text-stone-600">
        Lets each member connect their own Google account under More →
        Google Calendar, automatically syncing Schedule events they're on
        into their own primary Google Calendar. Create an OAuth 2.0 client
        in Google Cloud Console (scope{" "}
        <span className="font-mono text-xs">calendar.events</span>) and
        paste the Client ID/Secret below.
      </p>

      <SecretField
        label="Client ID"
        path="/admin/settings/google-client-id"
        placeholder="xxxxxxxx.apps.googleusercontent.com"
      />
      <SecretField
        label="Client secret"
        path="/admin/settings/google-client-secret"
        placeholder="GOCSPX-..."
      />
      <DefaultTimezoneField />
    </div>
  );
}
