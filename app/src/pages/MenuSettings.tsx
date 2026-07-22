import { useState } from "react";
import { ApiError } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { Toast } from "../components/ui";
import { NavTabsEditor } from "../components/NavTabsEditor";
import { resolveNavTabKeys } from "../utils/navTabs";

export default function MenuSettings() {
  const { user, updateNavTabs } = useAuth();
  const [toast, setToast] = useState<string | null>(null);

  if (!user) return null;

  const ctx = { role: user.role, is_admin: user.is_admin };
  const forced = user.club_forced_nav_tabs;
  const keys = resolveNavTabKeys(ctx, forced ?? user.nav_tabs);

  async function handleChange(next: string[]) {
    try {
      await updateNavTabs(next);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Something went wrong");
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Customize menu</h1>
      <p className="text-sm text-stone-500">
        Choose which tabs show up at the bottom of the app, and in what order.
        Schedule and More always stay - everything else is up to you.
      </p>

      {forced ? (
        <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
          Your club manager has set a fixed menu for all athletes, so this
          can't be changed here.
        </p>
      ) : null}

      <NavTabsEditor
        ctx={ctx}
        value={keys}
        onChange={handleChange}
        readOnly={!!forced}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}
