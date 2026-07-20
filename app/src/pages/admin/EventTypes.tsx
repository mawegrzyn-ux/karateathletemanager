import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  Badge,
  Toast,
} from "../../components/ui";

interface Club {
  id: number;
  name: string;
}

interface EventType {
  id: number;
  club_id: number;
  key: string;
  label: string;
  icon: string;
  bg_color: string;
  is_standard: boolean;
  created_at: string;
}

const EMPTY_FORM = { key: "", label: "", icon: "📌", bg_color: "#78716c" };
const KEY_RE = /^[a-z0-9_]+$/;

export default function EventTypes() {
  const api = useApi();
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [clubId, setClubId] = useState<number | null>(null);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | EventType>("closed");
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ clubs: Club[] }>("/admin/clubs")
      .then((res) => {
        setClubs(res.clubs);
        if (res.clubs.length > 0) setClubId(res.clubs[0].id);
      })
      .catch(() => setError("Failed to load clubs"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (clubId == null) return;
    setTypes(null);
    api
      .get<{ types: EventType[] }>(`/event-types?club_id=${clubId}`)
      .then((res) => setTypes(res.types))
      .catch(() => setError("Failed to load schedule types"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function showError(err: unknown) {
    showToast(err instanceof ApiError ? err.message : "Something went wrong");
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createType(e: FormEvent) {
    e.preventDefault();
    if (!form.key.trim() || !form.label.trim() || clubId == null) return;
    if (!KEY_RE.test(form.key.trim())) {
      showToast("Key must be lowercase letters, numbers, and underscores");
      return;
    }
    try {
      const { type: created } = await api.post<{ type: EventType }>("/event-types", {
        club_id: clubId,
        key: form.key.trim(),
        label: form.label.trim(),
        icon: form.icon,
        bg_color: form.bg_color,
      });
      setTypes((prev) => (prev ? [...prev, created] : [created]));
      setDrawer("closed");
    } catch (err) {
      showError(err);
    }
  }

  async function updateType(id: number, patch: Record<string, unknown>) {
    try {
      const { type: updated } = await api.patch<{ type: EventType }>(
        `/event-types/${id}`,
        patch
      );
      setTypes((prev) => (prev ? prev.map((t) => (t.id === id ? updated : t)) : prev));
      setDrawer((prev) =>
        prev !== "closed" && prev !== "create" && prev.id === id ? updated : prev
      );
    } catch (err) {
      showError(err);
    }
  }

  async function deleteType(id: number) {
    try {
      await api.del(`/event-types/${id}`);
      setTypes((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
      setDrawer("closed");
    } catch (err) {
      showError(err);
    }
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!clubs)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  if (clubs.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <h1 className="text-2xl font-bold tracking-tight">Schedule types</h1>
        <p className="text-sm text-stone-500">
          Create a club first to manage its schedule types.
        </p>
      </div>
    );
  }

  const selectedClub = clubs.find((c) => c.id === clubId) ?? null;
  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const q = query.trim().toLowerCase();
  const filtered = (types ?? []).filter((t) => t.label.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-3 bg-stone-100 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Schedule types</h1>
          <AddButton onClick={openCreate} />
        </div>

        {clubs.length > 1 && (
          <button
            type="button"
            onClick={() => setClubPickerOpen(true)}
            className="flex min-h-[44px] items-center justify-between rounded-xl bg-white px-3 shadow-card"
          >
            <span className="text-sm font-medium text-stone-700">Club</span>
            <span className="text-sm text-stone-600">
              {selectedClub?.name ?? "Choose a club"} ›
            </span>
          </button>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search schedule types..."
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </div>

      <Drawer
        open={clubPickerOpen}
        onClose={() => setClubPickerOpen(false)}
        title="Choose club"
      >
        <ClubPicker
          options={clubs}
          selectedId={clubId}
          onSelect={(id) => {
            setClubId(id);
            setClubPickerOpen(false);
          }}
        />
      </Drawer>

      {!types ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setDrawer(t)}
              className="flex min-h-[44px] items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-card"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: t.bg_color }}
              >
                {t.icon}
              </span>
              <span className="flex-1 font-medium">{t.label}</span>
              {t.is_standard && <Badge>Standard</Badge>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">
              No schedule types yet.
            </p>
          )}
        </div>
      )}

      <Drawer open={drawer === "create"} onClose={() => setDrawer("closed")} title="New schedule type">
        <form onSubmit={createType} className="flex flex-col gap-4">
          <Field label="Key">
            <input
              value={form.key}
              onChange={(e) =>
                setForm({ ...form, key: e.target.value.toLowerCase() })
              }
              placeholder="e.g. conditioning"
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Label">
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon">
              <input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                maxLength={4}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-center text-xl"
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={form.bg_color}
                onChange={(e) => setForm({ ...form, bg_color: e.target.value })}
                className="h-[44px] w-full rounded-xl border border-stone-300"
              />
            </Field>
          </div>
          <button
            type="submit"
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            Add
          </button>
        </form>
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.label ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            {editing.is_standard && (
              <div>
                <Badge>Standard</Badge>
              </div>
            )}
            <Field label="Key">
              <input
                value={editing.key}
                disabled
                className="min-h-[44px] rounded-xl border border-stone-200 bg-stone-100 px-3 text-stone-500"
              />
            </Field>
            <Field label="Label">
              <input
                key={editing.label}
                defaultValue={editing.label}
                onBlur={(e) => updateType(editing.id, { label: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Icon">
                <input
                  key={editing.icon}
                  defaultValue={editing.icon}
                  onBlur={(e) => updateType(editing.id, { icon: e.target.value })}
                  maxLength={4}
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3 text-center text-xl"
                />
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  value={editing.bg_color}
                  onChange={(e) => updateType(editing.id, { bg_color: e.target.value })}
                  className="h-[44px] w-full rounded-xl border border-stone-300"
                />
              </Field>
            </div>
            {!editing.is_standard && (
              <DeleteButton
                onClick={() => deleteType(editing.id)}
                itemLabel={editing.label}
              />
            )}
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast} />}
    </div>
  );
}

function ClubPicker({
  options,
  selectedId,
  onSelect,
}: {
  options: Club[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clubs..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>{o.name}</span>
              <span className="text-sm">{selected ? "✓ Selected" : "Select"}</span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
        )}
      </div>
    </div>
  );
}
