import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  Avatar,
  MediaField,
  Toast,
} from "../../components/ui";

interface Referee {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  qualifications: string | null;
  photo_url: string | null;
  is_active: boolean;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  qualifications: "",
};

export default function Referees() {
  const api = useApi();
  const [referees, setReferees] = useState<Referee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Referee>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [createPhotoUrl, setCreatePhotoUrl] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    api
      .get<{ referees: Referee[] }>("/admin/referees")
      .then((res) => setReferees(res.referees))
      .catch(() => setError("Failed to load referees"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setCreatePhotoUrl("");
    setDrawer("create");
  }

  async function createReferee(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const { referee } = await api.post<{ referee: Referee }>(
      "/admin/referees",
      { ...form, photo_url: createPhotoUrl || null }
    );
    setReferees((prev) => (prev ? [...prev, referee] : [referee]));
    setDrawer("closed");
  }

  async function updateReferee(id: number, patch: Record<string, unknown>) {
    const { referee } = await api.patch<{ referee: Referee }>(
      `/admin/referees/${id}`,
      patch
    );
    setReferees((prev) =>
      prev ? prev.map((r) => (r.id === id ? referee : r)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? referee : prev
    );
  }

  async function deleteReferee(id: number) {
    await api.del(`/admin/referees/${id}`);
    setReferees((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!referees)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filteredReferees = referees.filter((r) =>
    `${r.first_name} ${r.last_name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Referees</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search referees..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filteredReferees.map((r) => (
          <button
            key={r.id}
            onClick={() => setDrawer(r)}
            className="flex min-h-[44px] items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            <Avatar name={`${r.first_name} ${r.last_name}`} url={r.photo_url} />
            {r.first_name} {r.last_name}
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New referee"
      >
        <form onSubmit={createReferee} className="flex flex-col gap-4">
          <MediaField
            label="Photo"
            kind="image"
            value={createPhotoUrl}
            onChange={setCreatePhotoUrl}
            onError={showToast}
          />
          <Field label="First name">
            <input
              required
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Last name">
            <input
              required
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Qualifications">
            <textarea
              value={form.qualifications}
              onChange={(e) =>
                setForm({ ...form, qualifications: e.target.value })
              }
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
          </Field>
          <button
            type="submit"
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            Create
          </button>
        </form>
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing ? `${editing.first_name} ${editing.last_name}` : ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <MediaField
              label="Photo"
              kind="image"
              value={editing.photo_url ?? ""}
              onChange={(url) =>
                updateReferee(editing.id, { photo_url: url || null })
              }
              onError={showToast}
            />
            <Field label="First name">
              <input
                defaultValue={editing.first_name}
                onBlur={(e) => {
                  if (e.target.value !== editing.first_name) {
                    updateReferee(editing.id, { first_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Last name">
              <input
                defaultValue={editing.last_name}
                onBlur={(e) => {
                  if (e.target.value !== editing.last_name) {
                    updateReferee(editing.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Email">
              <input
                defaultValue={editing.email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.email ?? "")) {
                    updateReferee(editing.id, { email: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Phone">
              <input
                defaultValue={editing.phone ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.phone ?? "")) {
                    updateReferee(editing.id, { phone: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Qualifications">
              <textarea
                defaultValue={editing.qualifications ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.qualifications ?? "")) {
                    updateReferee(editing.id, {
                      qualifications: e.target.value,
                    });
                  }
                }}
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) =>
                  updateReferee(editing.id, { is_active: e.target.checked })
                }
              />
              Active
            </label>
            <DeleteButton
              onClick={() => deleteReferee(editing.id)}
              itemLabel={`${editing.first_name} ${editing.last_name}`}
            />
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast} />}
    </div>
  );
}
