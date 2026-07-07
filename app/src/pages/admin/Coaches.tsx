import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner } from "../../components/ui";

interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
}

interface Coach {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  qualifications: string | null;
  role: string;
  athlete_id: number | null;
  is_active: boolean;
}

const ROLES = ["head coach", "assistant"];

export default function Coaches() {
  const api = useApi();
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<{ coaches: Coach[] }>("/admin/coaches"),
      api.get<{ athletes: Athlete[] }>("/athletes"),
    ])
      .then(([coachesRes, athletesRes]) => {
        setCoaches(coachesRes.coaches);
        setAthletes(athletesRes.athletes);
      })
      .catch(() => setError("Failed to load coaches"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCoach(e: FormEvent) {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim()) return;
    const { coach } = await api.post<{ coach: Coach }>("/admin/coaches", {
      first_name: newFirstName,
      last_name: newLastName,
    });
    setCoaches((prev) => (prev ? [...prev, coach] : [coach]));
    setNewFirstName("");
    setNewLastName("");
  }

  async function updateCoach(id: number, patch: Record<string, unknown>) {
    const { coach } = await api.patch<{ coach: Coach }>(
      `/admin/coaches/${id}`,
      patch
    );
    setCoaches((prev) =>
      prev ? prev.map((c) => (c.id === id ? coach : c)) : prev
    );
  }

  async function deleteCoach(id: number) {
    await api.del(`/admin/coaches/${id}`);
    setCoaches((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!coaches)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Coaches</h1>

      <form onSubmit={createCoach} className="flex gap-2">
        <input
          value={newFirstName}
          onChange={(e) => setNewFirstName(e.target.value)}
          placeholder="First name"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3"
        />
        <input
          value={newLastName}
          onChange={(e) => setNewLastName(e.target.value)}
          placeholder="Last name"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-red-700 px-4 font-medium text-white"
        >
          Add
        </button>
      </form>

      {coaches.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 gap-2">
              <input
                defaultValue={c.first_name}
                onBlur={(e) => {
                  if (e.target.value !== c.first_name) {
                    updateCoach(c.id, { first_name: e.target.value });
                  }
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2 font-medium"
              />
              <input
                defaultValue={c.last_name}
                onBlur={(e) => {
                  if (e.target.value !== c.last_name) {
                    updateCoach(c.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2 font-medium"
              />
            </div>
            <button
              onClick={() => deleteCoach(c.id)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm text-red-700"
            >
              Delete
            </button>
          </div>

          <select
            value={c.role}
            onChange={(e) => updateCoach(c.id, { role: e.target.value })}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <input
            defaultValue={c.email ?? ""}
            placeholder="Email"
            onBlur={(e) => {
              if (e.target.value !== (c.email ?? "")) {
                updateCoach(c.id, { email: e.target.value });
              }
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          />
          <input
            defaultValue={c.phone ?? ""}
            placeholder="Phone"
            onBlur={(e) => {
              if (e.target.value !== (c.phone ?? "")) {
                updateCoach(c.id, { phone: e.target.value });
              }
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          />
          <textarea
            defaultValue={c.qualifications ?? ""}
            placeholder="Qualifications"
            onBlur={(e) => {
              if (e.target.value !== (c.qualifications ?? "")) {
                updateCoach(c.id, { qualifications: e.target.value });
              }
            }}
            className="rounded-lg border border-slate-300 px-2 py-2"
          />

          <select
            value={c.athlete_id ?? ""}
            onChange={(e) =>
              updateCoach(c.id, {
                athlete_id: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          >
            <option value="">Not also an athlete</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.first_name} {a.last_name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={c.is_active}
              onChange={(e) =>
                updateCoach(c.id, { is_active: e.target.checked })
              }
            />
            Active
          </label>
        </div>
      ))}
    </div>
  );
}
