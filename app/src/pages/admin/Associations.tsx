import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
} from "../../components/ui";

interface Association {
  id: number;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

const EMPTY_FORM = { name: "", description: "", contact_email: "", contact_phone: "" };

export default function Associations() {
  const api = useApi();
  const [associations, setAssociations] = useState<Association[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Association>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    api
      .get<{ associations: Association[] }>("/admin/associations")
      .then((res) => setAssociations(res.associations))
      .catch(() => setError("Failed to load associations"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createAssociation(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { association } = await api.post<{ association: Association }>(
      "/admin/associations",
      form
    );
    setAssociations((prev) => (prev ? [...prev, association] : [association]));
    setDrawer("closed");
  }

  async function updateAssociation(id: number, patch: Partial<Association>) {
    const { association } = await api.patch<{ association: Association }>(
      `/admin/associations/${id}`,
      patch
    );
    setAssociations((prev) =>
      prev ? prev.map((a) => (a.id === id ? association : a)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id
        ? association
        : prev
    );
  }

  async function deleteAssociation(id: number) {
    await api.del(`/admin/associations/${id}`);
    setAssociations((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!associations)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Associations</h1>
        <AddButton onClick={openCreate} />
      </div>

      <div className="flex flex-col gap-2">
        {associations.map((a) => (
          <button
            key={a.id}
            onClick={() => setDrawer(a)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
          >
            {a.name}
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New association"
      >
        <form onSubmit={createAssociation} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) =>
                setForm({ ...form, contact_email: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={form.contact_phone}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </Field>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-red-700 font-medium text-white"
          >
            Create
          </button>
        </form>
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.name ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                defaultValue={editing.name}
                onBlur={(e) => {
                  if (e.target.value !== editing.name) {
                    updateAssociation(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Contact email">
              <input
                defaultValue={editing.contact_email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_email ?? "")) {
                    updateAssociation(editing.id, {
                      contact_email: e.target.value,
                    });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Contact phone">
              <input
                defaultValue={editing.contact_phone ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_phone ?? "")) {
                    updateAssociation(editing.id, {
                      contact_phone: e.target.value,
                    });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Description">
              <textarea
                defaultValue={editing.description ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.description ?? "")) {
                    updateAssociation(editing.id, {
                      description: e.target.value,
                    });
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </Field>
            <DeleteButton
              onClick={() => deleteAssociation(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
