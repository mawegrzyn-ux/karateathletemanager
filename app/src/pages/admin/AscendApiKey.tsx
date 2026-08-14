import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { DeleteButton, Spinner, Toast } from "../../components/ui";

// Which upstream response shape each button is being used to inspect -
// see api/src/routes/ascendApi.js for why these are raw passthroughs
// rather than a real search/import endpoint yet.
const ENDPOINTS = [
  { key: "bodyparts", label: "Body parts" },
  { key: "equipments", label: "Equipments" },
  { key: "muscles", label: "Muscles" },
  { key: "exercisetypes", label: "Exercise types" },
  { key: "exercises", label: "Exercises (sample)" },
] as const;

export default function AscendApiKey() {
  const api = useApi();
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<{ endpoint: string; json: string } | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function refresh() {
    api
      .get<{ configured: boolean }>("/admin/settings/ascendapi-key")
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
      await api.patch("/admin/settings/ascendapi-key", { api_key: key.trim() });
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
      await api.del("/admin/settings/ascendapi-key");
      showToast("API key removed");
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function test(endpointKey: string) {
    setTesting(endpointKey);
    setResult(null);
    try {
      const json = await api.get(`/admin/ascend-api/${endpointKey}`);
      setResult({ endpoint: endpointKey, json: JSON.stringify(json, null, 2) });
    } catch (err) {
      setResult({
        endpoint: endpointKey,
        json: `Error: ${err instanceof ApiError ? err.message : "Request failed"}`,
      });
    } finally {
      setTesting(null);
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
      <h1 className="text-2xl font-bold tracking-tight">AscendAPI key</h1>
      <p className="text-sm text-stone-600">
        AscendAPI's ExerciseDB will let Training modules pull real exercise
        data (video/image, target muscles, equipment, instructions) instead
        of typing/uploading everything by hand. Paste a RapidAPI key below -
        it's saved on the server and takes effect immediately, no redeploy
        needed.
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
              {configured ? "Replace key" : "RapidAPI key"}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="x-rapidapi-key..."
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
            itemLabel="the saved AscendAPI key"
            label="Remove key"
          />
        )}
      </div>

      {configured && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
          <span className="text-sm font-medium text-stone-700">
            Test connection
          </span>
          <p className="text-xs text-stone-500">
            This app's sandbox couldn't reach AscendAPI directly during
            development - tap a button below (from the deployed app) to see
            the real response shape for that endpoint.
          </p>
          <div className="flex flex-wrap gap-2">
            {ENDPOINTS.map((e) => (
              <button
                key={e.key}
                type="button"
                disabled={testing !== null}
                onClick={() => test(e.key)}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-sm font-medium disabled:opacity-50"
              >
                {testing === e.key ? "Loading..." : e.label}
              </button>
            ))}
          </div>
          {result && (
            <pre className="max-h-96 overflow-auto rounded-xl bg-stone-900 p-3 text-xs text-stone-100">
              {result.json}
            </pre>
          )}
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
