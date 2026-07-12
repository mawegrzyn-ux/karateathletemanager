import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  BeltSwatch,
  BELT_COLOR_OPTIONS,
} from "../components/ui";

interface Grade {
  id: number;
  kind: string;
  rank_order: number;
  name: string;
  belt_color: string;
  club_id: number | null;
  club_name: string | null;
}

const EMPTY_FORM = {
  name: "",
  kind: "kyu",
  rank_order: 1,
  belt_color: "white",
};

export default function Grades() {
  const api = useApi();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Grade>("closed");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    api
      .get<{ grades: Grade[] }>("/grades")
      .then((res) => setGrades(res.grades))
      .catch(() => setError("Failed to load grades"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createGrade(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { grade } = await api.post<{ grade: Grade }>("/admin/grades", form);
    setGrades((prev) => (prev ? [...prev, grade] : [grade]));
    setDrawer("closed");
  }

  async function updateGrade(id: number, patch: Record<string, unknown>) {
    const { grade } = await api.patch<{ grade: Grade }>(
      `/admin/grades/${id}`,
      patch
    );
    setGrades((prev) => (prev ? prev.map((g) => (g.id === id ? grade : g)) : prev));
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? grade : prev
    );
  }

  async function deleteGrade(id: number) {
    await api.del(`/admin/grades/${id}`);
    setGrades((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!grades)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const standard = grades
    .filter((g) => g.club_id == null)
    .sort((a, b) => a.rank_order - b.rank_order);
  const kyu = standard.filter((g) => g.kind === "kyu");
  const dan = standard.filter((g) => g.kind === "dan");

  const clubOverrides = grades.filter((g) => g.club_id != null);
  const clubGroups = new Map<string, Grade[]>();
  for (const g of clubOverrides) {
    const key = g.club_name ?? "Club";
    if (!clubGroups.has(key)) clubGroups.set(key, []);
    clubGroups.get(key)!.push(g);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Grades</h1>
        {isAdmin && <AddButton onClick={openCreate} />}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-stone-500">Kyu grades</h2>
        <div className="flex flex-col gap-2">
          {kyu.map((g) => (
            <GradeRow key={g.id} grade={g} isAdmin={isAdmin} onOpen={() => setDrawer(g)} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-stone-500">Dan grades</h2>
        <div className="flex flex-col gap-2">
          {dan.map((g) => (
            <GradeRow key={g.id} grade={g} isAdmin={isAdmin} onOpen={() => setDrawer(g)} />
          ))}
        </div>
      </div>

      {clubGroups.size > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-stone-500">Club grades</h2>
          <p className="text-xs text-stone-500">
            These clubs use their own grade list instead of the standard
            one above. Manage them from that club's page.
          </p>
          {[...clubGroups.entries()].map(([clubName, clubGrades]) => (
            <div key={clubName} className="flex flex-col gap-2">
              <span className="text-xs font-medium text-stone-600">
                {clubName}
              </span>
              <div className="flex flex-col gap-2">
                {clubGrades
                  .sort((a, b) => a.rank_order - b.rank_order)
                  .map((g) => (
                    <div
                      key={g.id}
                      className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-card"
                    >
                      <BeltSwatch color={g.belt_color} />
                      {g.name}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New grade"
      >
        <form onSubmit={createGrade} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Kind">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              <option value="kyu">Kyu</option>
              <option value="dan">Dan</option>
            </select>
          </Field>
          <Field label="Rank order">
            <input
              type="number"
              value={form.rank_order}
              onChange={(e) =>
                setForm({ ...form, rank_order: Number(e.target.value) || 1 })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Belt color">
            <select
              value={form.belt_color}
              onChange={(e) => setForm({ ...form, belt_color: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              {BELT_COLOR_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
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
        title={editing?.name ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                defaultValue={editing.name}
                onBlur={(e) => {
                  if (e.target.value !== editing.name) {
                    updateGrade(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Kind">
              <select
                value={editing.kind}
                onChange={(e) => updateGrade(editing.id, { kind: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              >
                <option value="kyu">Kyu</option>
                <option value="dan">Dan</option>
              </select>
            </Field>
            <Field label="Rank order">
              <input
                type="number"
                defaultValue={editing.rank_order}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isInteger(value) && value !== editing.rank_order) {
                    updateGrade(editing.id, { rank_order: value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Belt color">
              <select
                value={editing.belt_color}
                onChange={(e) =>
                  updateGrade(editing.id, { belt_color: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              >
                {BELT_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <DeleteButton
              onClick={() => deleteGrade(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function GradeRow({
  grade,
  isAdmin,
  onOpen,
}: {
  grade: Grade;
  isAdmin: boolean;
  onOpen: () => void;
}) {
  const content = (
    <>
      <BeltSwatch color={grade.belt_color} />
      {grade.name}
    </>
  );

  if (!isAdmin) {
    return (
      <div className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-card">
        {content}
      </div>
    );
  }

  return (
    <button
      onClick={onOpen}
      className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
    >
      {content}
    </button>
  );
}
