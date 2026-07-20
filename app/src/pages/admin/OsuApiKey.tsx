import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { DeleteButton, Spinner, Toast } from "../../components/ui";

export default function OsuApiKey() {
  const api = useApi();
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function refresh() {
    api
      .get<{ configured: boolean }>("/admin/settings/anthropic-key")
      .then((res) => setConfigured(res.configured))
      .catch(() => setConfigured(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!key.trim() || saving) return;
    setSaving(true);
    try {
      await api.patch("/admin/settings/anthropic-key", { api_key: key.trim() });
      setKey("");
      showToast("API key saved");
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    try {
      await api.del("/admin/settings/anthropic-key");
      showToast("API key removed");
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  if (configured === undefined) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Osu API key</h1>
      <p className="text-sm text-stone-600">
        Osu (the admin chatbot under More) needs an Anthropic API key to talk
        to Claude. Create one at{" "}
        <span className="font-medium">console.anthropic.com</span> and paste
        it below - it's saved on the server and takes effect immediately, no
        redeploy needed.
      </p>

      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
        <span
          className={`text-sm font-medium ${
            configured ? "text-green-700" : "text-stone-500"
          }`}
        >
          {configured ? "✓ Configured" : "Not configured"}
        </span>

        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">
              {configured ? "Replace key" : "Anthropic API key"}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !key.trim()}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>

        {configured && (
          <DeleteButton
            onClick={clear}
            itemLabel="the saved Osu API key"
            label="Remove key"
          />
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
