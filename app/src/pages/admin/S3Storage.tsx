import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { DeleteButton, Field, Spinner, Toast } from "../../components/ui";

interface S3Config {
  bucket: string | null;
  region: string | null;
  access_key_id: string | null;
  public_base_url: string | null;
  secret_access_key_configured: boolean;
}

const EMPTY_FORM = {
  bucket: "",
  region: "",
  access_key_id: "",
  secret_access_key: "",
  public_base_url: "",
};

export default function S3Storage() {
  const api = useApi();
  const [config, setConfig] = useState<S3Config | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function refresh() {
    api
      .get<S3Config>("/admin/settings/s3-config")
      .then((res) => {
        setConfig(res);
        setForm({
          bucket: res.bucket ?? "",
          region: res.region ?? "",
          access_key_id: res.access_key_id ?? "",
          secret_access_key: "",
          public_base_url: res.public_base_url ?? "",
        });
      })
      .catch(() =>
        setConfig({
          bucket: null,
          region: null,
          access_key_id: null,
          public_base_url: null,
          secret_access_key_configured: false,
        })
      );
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configured =
    !!config?.bucket && !!config?.region && !!config?.access_key_id && config?.secret_access_key_configured;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/admin/settings/s3-config", {
        bucket: form.bucket.trim(),
        region: form.region.trim(),
        access_key_id: form.access_key_id.trim(),
        // Omitted (not sent as "") when left blank, so an admin editing
        // just the bucket/region doesn't have to re-paste a secret
        // they've already saved - the backend's PATCH only touches
        // fields actually present in the body.
        ...(form.secret_access_key.trim()
          ? { secret_access_key: form.secret_access_key.trim() }
          : {}),
        public_base_url: form.public_base_url.trim(),
      });
      showToast("S3 settings saved");
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    try {
      await api.del("/admin/settings/s3-config");
      showToast("S3 settings removed - uploads will use local disk again");
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  if (config === undefined) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">S3 storage</h1>
      <p className="text-sm text-stone-600">
        Once configured, new photo/video uploads (and the app icon) are
        stored in this S3 bucket instead of the server's local disk -
        takes effect immediately, no redeploy needed. Uploads already made
        before this was set up keep working from local disk either way.
        See the app's ARCHITECTURE.md for the exact bucket policy and IAM
        policy this needs on the AWS side.
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
          <Field label="Bucket">
            <input
              value={form.bucket}
              onChange={(e) => setForm({ ...form, bucket: e.target.value })}
              placeholder="nadakarate-media"
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
          </Field>
          <Field label="Region">
            <input
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              placeholder="us-east-1"
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
          </Field>
          <Field label="Access key ID">
            <input
              autoComplete="off"
              value={form.access_key_id}
              onChange={(e) => setForm({ ...form, access_key_id: e.target.value })}
              placeholder="AKIA..."
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
          </Field>
          <Field
            label={
              config.secret_access_key_configured
                ? "Secret access key (leave blank to keep the saved one)"
                : "Secret access key"
            }
          >
            <input
              type="password"
              autoComplete="off"
              value={form.secret_access_key}
              onChange={(e) => setForm({ ...form, secret_access_key: e.target.value })}
              placeholder={config.secret_access_key_configured ? "•••••••• (unchanged)" : ""}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
          </Field>
          <Field label="Public base URL (optional - a CDN/custom domain in front of the bucket)">
            <input
              value={form.public_base_url}
              onChange={(e) => setForm({ ...form, public_base_url: e.target.value })}
              placeholder="https://media.example.com"
              className="min-h-[44px] rounded-xl border border-stone-300 px-3 font-mono text-sm"
            />
          </Field>
          <button
            type="submit"
            disabled={saving || !form.bucket.trim() || !form.region.trim() || !form.access_key_id.trim()}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>

        {configured && (
          <DeleteButton
            onClick={clear}
            itemLabel="the saved S3 settings"
            label="Remove settings"
          />
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
