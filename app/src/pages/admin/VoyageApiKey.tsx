import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { DeleteButton, Spinner, Toast } from "../../components/ui";

export default function VoyageApiKey() {
  const api = useApi();
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function refresh() {
    api
      .get<{ configured: boolean }>("/admin/settings/voyage-key")
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
      await api.patch("/admin/settings/voyage-key", { api_key: key.trim() });
      setKey("");
      setTestResult(null);
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
      await api.del("/admin/settings/voyage-key");
      setTestResult(null);
      showToast("API key removed");
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{ dimensions: number }>("/admin/settings/voyage-key/test", {});
      setTestResult(`✓ Connected - embeddings are ${res.dimensions} dimensions`);
    } catch (err) {
      setTestResult(`Error: ${err instanceof ApiError ? err.message : "Test failed"}`);
    } finally {
      setTesting(false);
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
      <h1 className="text-2xl font-bold tracking-tight">Voyage AI key</h1>
      <p className="text-sm text-stone-600">
        Voyage AI embeds every document/link/image added to Osu's Knowledge
        base (More &gt; Admin &gt; Knowledge base) so it can be searched.
        Paste a Voyage API key below - it's saved on the server and takes
        effect immediately, no redeploy needed.
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
              {configured ? "Replace key" : "Voyage API key"}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="pa-..."
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
            itemLabel="the saved Voyage AI key"
            label="Remove key"
          />
        )}
      </div>

      {configured && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
          <span className="text-sm font-medium text-stone-700">Test connection</span>
          <button
            type="button"
            disabled={testing}
            onClick={testConnection}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm font-medium disabled:opacity-50"
          >
            {testing ? "Testing..." : "Embed a test string"}
          </button>
          {testResult && <p className="text-sm text-stone-700">{testResult}</p>}
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
