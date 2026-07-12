import { useEffect, useState } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { Spinner, MediaField, Toast } from "../../components/ui";

export default function AppIcon() {
  const api = useApi();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ url: string | null }>("/admin/settings/branding-icon")
      .then((res) => setUrl(res.url))
      .catch(() => setUrl(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function updateIcon(newUrl: string) {
    try {
      const { url: saved } = await api.patch<{ url: string }>(
        "/admin/settings/branding-icon",
        { url: newUrl }
      );
      setUrl(saved);
      showToast("App icon updated");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  if (url === undefined) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">App icon</h1>
      <p className="text-sm text-stone-600">
        This image is used for the app's home-screen icon, browser tab icon,
        and the preview shown when this site's link is shared on social media
        (iMessage, Slack, Facebook, etc). Upload a square image for the best
        result across all of those. Changes apply immediately, without a new
        app deploy.
      </p>

      <MediaField
        label="Icon"
        kind="image"
        value={url ?? ""}
        onChange={updateIcon}
        onError={showToast}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}
