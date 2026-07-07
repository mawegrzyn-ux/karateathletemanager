import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/ui";

interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  belt: string;
  join_date: string;
  medical_notes: string | null;
  is_active: boolean;
}

const BELTS = [
  "white",
  "yellow",
  "orange",
  "green",
  "blue",
  "purple",
  "brown",
  "black",
];

export default function Athletes() {
  const { user } = useAuth();

  if (user?.role !== "admin" && user?.role !== "coach") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Athletes</h1>
        <p className="text-slate-600">
          Ask your coach for your athlete profile and grade info.
        </p>
      </div>
    );
  }

  return <AthletesManager isAdmin={user.role === "admin"} />;
}

function AthletesManager({ isAdmin }: { isAdmin: boolean }) {
  const api = useApi();
  const [athletes, setAthletes] = useState<Athlete[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(q: string) {
    const path = q ? `/athletes?q=${encodeURIComponent(q)}` : "/athletes";
    api
      .get<{ athletes: Athlete[] }>(path)
      .then((res) => setAthletes(res.athletes))
      .catch(() => setError("Failed to load athletes"));
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(query);
  }

  async function createAthlete(e: FormEvent) {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim()) return;
    const { athlete } = await api.post<{ athlete: Athlete }>("/athletes", {
      first_name: newFirstName,
      last_name: newLastName,
    });
    setAthletes((prev) => (prev ? [...prev, athlete] : [athlete]));
    setNewFirstName("");
    setNewLastName("");
  }

  async function updateAthlete(id: number, patch: Record<string, unknown>) {
    const { athlete } = await api.patch<{ athlete: Athlete }>(
      `/athletes/${id}`,
      patch
    );
    setAthletes((prev) =>
      prev ? prev.map((a) => (a.id === id ? athlete : a)) : prev
    );
  }

  async function deleteAthlete(id: number) {
    await api.del(`/athletes/${id}`);
    setAthletes((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!athletes)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Athletes</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg border border-slate-300 px-4 font-medium"
        >
          Search
        </button>
      </form>

      <form onSubmit={createAthlete} className="flex gap-2">
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

      {athletes.map((a) => (
        <div
          key={a.id}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 gap-2">
              <input
                defaultValue={a.first_name}
                onBlur={(e) => {
                  if (e.target.value !== a.first_name) {
                    updateAthlete(a.id, { first_name: e.target.value });
                  }
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2 font-medium"
              />
              <input
                defaultValue={a.last_name}
                onBlur={(e) => {
                  if (e.target.value !== a.last_name) {
                    updateAthlete(a.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2 font-medium"
              />
            </div>
            {isAdmin && (
              <button
                onClick={() => deleteAthlete(a.id)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm text-red-700"
              >
                Delete
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select
              value={a.belt}
              onChange={(e) => updateAthlete(a.id, { belt: e.target.value })}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
            >
              {BELTS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              type="date"
              defaultValue={a.date_of_birth ?? ""}
              onChange={(e) =>
                updateAthlete(a.id, { date_of_birth: e.target.value || null })
              }
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
            />
          </div>

          <input
            defaultValue={a.email ?? ""}
            placeholder="Email"
            onBlur={(e) => {
              if (e.target.value !== (a.email ?? "")) {
                updateAthlete(a.id, { email: e.target.value });
              }
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          />
          <input
            defaultValue={a.phone ?? ""}
            placeholder="Phone"
            onBlur={(e) => {
              if (e.target.value !== (a.phone ?? "")) {
                updateAthlete(a.id, { phone: e.target.value });
              }
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-2"
          />
          <div className="flex gap-2">
            <input
              defaultValue={a.emergency_name ?? ""}
              placeholder="Emergency contact name"
              onBlur={(e) => {
                if (e.target.value !== (a.emergency_name ?? "")) {
                  updateAthlete(a.id, { emergency_name: e.target.value });
                }
              }}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
            />
            <input
              defaultValue={a.emergency_phone ?? ""}
              placeholder="Emergency phone"
              onBlur={(e) => {
                if (e.target.value !== (a.emergency_phone ?? "")) {
                  updateAthlete(a.id, { emergency_phone: e.target.value });
                }
              }}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
            />
          </div>
          <textarea
            defaultValue={a.medical_notes ?? ""}
            placeholder="Medical notes"
            onBlur={(e) => {
              if (e.target.value !== (a.medical_notes ?? "")) {
                updateAthlete(a.id, { medical_notes: e.target.value });
              }
            }}
            className="rounded-lg border border-slate-300 px-2 py-2"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={a.is_active}
              onChange={(e) =>
                updateAthlete(a.id, { is_active: e.target.checked })
              }
            />
            Active
          </label>
        </div>
      ))}
    </div>
  );
}
