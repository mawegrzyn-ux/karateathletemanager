import {
  MANDATORY_NAV_KEYS,
  availableNavTabs,
  type NavRoleContext,
} from "../utils/navTabs";

// Shared by the personal "Customize menu" page and a club manager's
// "force a menu for all athletes" section - a simple selected-list
// (reorder via ▲/▼, remove via ✕) plus a remaining-options "+ Add" list,
// same search-picker spirit as the app's other membership editors but
// without a search box since these lists are always short. Reorder uses
// icon buttons rather than drag-and-drop since this is a touch-first,
// mobile-first app (native HTML5 drag-and-drop doesn't work well on
// touch without extra plumbing this app has deliberately avoided
// elsewhere - see the training module wizard's own Back/Next buttons).
export function NavTabsEditor({
  ctx,
  value,
  onChange,
  readOnly = false,
}: {
  ctx: NavRoleContext;
  value: string[];
  onChange: (keys: string[]) => void;
  readOnly?: boolean;
}) {
  const available = availableNavTabs(ctx);
  const byKey = new Map(available.map((t) => [t.key, t]));
  const selected = value.map((k) => byKey.get(k)).filter(Boolean) as NonNullable<
    ReturnType<typeof byKey.get>
  >[];
  const remaining = available.filter((t) => !value.includes(t.key));

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index >= value.length - 1) return;
    const next = [...value];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
        <span className="text-xs font-medium text-stone-600">Your tabs</span>
        <div className="flex flex-col gap-2">
          {selected.map((tab, i) => {
            const mandatory = MANDATORY_NAV_KEYS.includes(tab.key);
            return (
              <div
                key={tab.key}
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2"
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="flex-1 font-medium">{tab.label}</span>
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      aria-label={`Move ${tab.label} up`}
                      className="flex h-9 w-9 items-center justify-center text-stone-500 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(i)}
                      disabled={i === selected.length - 1}
                      aria-label={`Move ${tab.label} down`}
                      className="flex h-9 w-9 items-center justify-center text-stone-500 disabled:opacity-30"
                    >
                      ▼
                    </button>
                    {!mandatory && (
                      <button
                        type="button"
                        onClick={() => onChange(value.filter((k) => k !== tab.key))}
                        aria-label={`Remove ${tab.label}`}
                        className="flex h-9 w-9 items-center justify-center text-red-700"
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!readOnly && remaining.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
          <span className="text-xs font-medium text-stone-600">Add a tab</span>
          <div className="flex flex-col gap-2">
            {remaining.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onChange([...value, tab.key])}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-left"
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="flex-1 font-medium">{tab.label}</span>
                <span className="text-sm font-medium text-red-600">+ Add</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
