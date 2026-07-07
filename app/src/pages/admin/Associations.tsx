import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner } from "../../components/ui";

interface Association {
  id: number;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export default function Associations() {
  const api = useApi();
  const [associations, setAssociations] = useState<Association[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

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

  async function createAssociation(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { association } = await api.post<{ association: Association }>(
      "/admin/associations",
      { name: newName }
    );
    setAssociations((prev) => (prev ? [...prev, association] : [association]));
    setNewName("");
  }

  async function updateAssociation(id: number, patch: Partial<Association>) {
    const { association } = await api.patch<{ association: Association }>(
      `/admin/associations/${id}`,
      patch
    );
    setAssociations((prev) =>
      prev ? prev.map((a) => (a.id === id ? association : a)) : prev
    );
  }

  async function deleteAssociation(id: number) {
    await api.del(`/admin/associations/${id}`);
    setAssociations((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!associations)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Associations</h1>

      <form onSubmit={createAssociation} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New association name"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-red-700 px-4 font-medium text-white"
        >
          Add
        </button>
      </form>

      {associations.map((a) => (
        <div
          key={a.id}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <input
              defaultValue={a.name}
              onBlur={(e) => {
                if (e.target.value !== a.name) {
                  updateAssociation(a.id, { name: e.target.value });
                }
              }}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2 font-medium"
            />
            <button
              onClick={() => deleteAssociation(a.id)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm text-red-700"
            >
              Delete
            </button>
          </div>
          <input
            defaultValue={a.contact_email ?? ""}
            placeholder="Contact email"
            onBlur={(e) => {
              if (e.target.value !== (a.contact_email ?? "")) {
                updateAssociation(a.id, { contact_email: e.target.value });
              }
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          />
          <input
            defaultValue={a.contact_phone ?? ""}
            placeholder="Contact phone"
            onBlur={(e) => {
              if (e.target.value !== (a.contact_phone ?? "")) {
                updateAssociation(a.id, { contact_phone: e.target.value });
              }
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          />
          <textarea
            defaultValue={a.description ?? ""}
            placeholder="Description"
            onBlur={(e) => {
              if (e.target.value !== (a.description ?? "")) {
                updateAssociation(a.id, { description: e.target.value });
              }
            }}
            className="rounded-lg border border-slate-300 px-2 py-2"
          />
        </div>
      ))}
    </div>
  );
}
