import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../components/ui";
import {
  type CompetitionResult,
  EMPTY_RESULT_FORM,
  ResultFields,
  resultPayload,
  ResultSummary,
} from "../components/CompetitionResults";

interface AthleteOption {
  id: number;
  first_name: string;
  last_name: string;
}

function AthletePicker({
  selectedId,
  options,
  onSelect,
}: {
  selectedId: number | null;
  options: AthleteOption[];
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <Field label="Athlete">
      <div className="flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search athletes..."
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {results.map((o) => {
            const selected = selectedId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.id)}
                className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                  selected
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-stone-200"
                }`}
              >
                <span>
                  {o.first_name} {o.last_name}
                </span>
                <span className="text-sm">{selected ? "✓ Selected" : "Select"}</span>
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
          )}
        </div>
      </div>
    </Field>
  );
}

function EditResultForm({
  result,
  showAthleteName,
  onUpdate,
  onDelete,
}: {
  result: CompetitionResult;
  showAthleteName: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {showAthleteName && result.first_name && (
        <p className="text-sm text-stone-600">
          {result.first_name} {result.last_name}
        </p>
      )}
      <Field label="Competition name">
        <input
          defaultValue={result.competition_name}
          onBlur={(e) => {
            if (e.target.value !== result.competition_name) {
              onUpdate({ competition_name: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Date">
        <input
          type="date"
          defaultValue={result.competition_date.slice(0, 10)}
          onBlur={(e) => {
            if (e.target.value !== result.competition_date.slice(0, 10)) {
              onUpdate({ competition_date: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Location">
        <input
          defaultValue={result.location ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (result.location ?? "")) {
              onUpdate({ location: e.target.value || null });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Rounds completed">
        <input
          type="number"
          min={0}
          defaultValue={result.rounds_completed ?? ""}
          onBlur={(e) => {
            const value = e.target.value ? Number(e.target.value) : null;
            if (value !== result.rounds_completed) {
              onUpdate({ rounds_completed: value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Final position">
        <input
          defaultValue={result.final_position ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (result.final_position ?? "")) {
              onUpdate({ final_position: e.target.value || null });
            }
          }}
          placeholder="e.g. 1st, Gold, Round of 16"
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Notes">
        <textarea
          defaultValue={result.notes ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (result.notes ?? "")) {
              onUpdate({ notes: e.target.value || null });
            }
          }}
          className="rounded-xl border border-stone-300 px-3 py-2"
        />
      </Field>
      <DeleteButton onClick={onDelete} itemLabel={result.competition_name} />
    </div>
  );
}

// The Competitions page: a cross-cutting log of every competition result,
// distinct from the athlete-scoped/event-scoped accordion sections
// (CompetitionResultsSection/EventCompetitionResults) that already existed
// - those stay for capturing a result in the context of one athlete's
// profile or one schedule item, this is the "see everything in one place"
// view. Coach/admin see every athlete's results (with a search-based
// athlete picker in the create drawer, per the app's single-select
// picker convention); an athlete sees just their own, recorded either here
// or - already supported - directly from a competition-type schedule item.
export default function Competitions() {
  const api = useApi();
  const { user } = useAuth();
  const isSelfAthlete = user?.role === "athlete" && !!user.athlete_id;
  const canPickAthlete = !!user?.is_admin || user?.role === "coach";

  const [results, setResults] = useState<CompetitionResult[] | null>(null);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | CompetitionResult>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_RESULT_FORM);
  const [targetAthleteId, setTargetAthleteId] = useState<number | null>(null);

  useEffect(() => {
    load();
    if (canPickAthlete) {
      api
        .get<{ athletes: AthleteOption[] }>("/athletes")
        .then((res) => setAthletes(res.athletes))
        .catch(() => setAthletes([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    api
      .get<{ results: CompetitionResult[] }>("/competition-results")
      .then((res) => setResults(res.results))
      .catch(() => setError("Failed to load competitions"));
  }

  function openCreate() {
    setForm(EMPTY_RESULT_FORM);
    setTargetAthleteId(isSelfAthlete ? (user!.athlete_id as number) : null);
    setDrawer("create");
  }

  async function createResult(e: FormEvent) {
    e.preventDefault();
    if (!targetAthleteId) return;
    if (!form.competition_name.trim() || !form.competition_date) return;
    const { result } = await api.post<{ result: CompetitionResult }>(
      `/athletes/${targetAthleteId}/competition-results`,
      resultPayload(form)
    );
    const athlete = athletes.find((a) => a.id === targetAthleteId);
    setResults((prev) =>
      prev
        ? [
            {
              ...result,
              first_name: athlete?.first_name,
              last_name: athlete?.last_name,
            },
            ...prev,
          ]
        : [result]
    );
    setDrawer("closed");
  }

  async function updateResult(
    result: CompetitionResult,
    patch: Record<string, unknown>
  ) {
    const { result: updated } = await api.patch<{ result: CompetitionResult }>(
      `/athletes/${result.athlete_id}/competition-results/${result.id}`,
      patch
    );
    const hydrated = {
      ...updated,
      first_name: result.first_name,
      last_name: result.last_name,
    };
    setResults((prev) =>
      prev ? prev.map((r) => (r.id === result.id ? hydrated : r)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === result.id
        ? hydrated
        : prev
    );
  }

  async function deleteResult(result: CompetitionResult) {
    await api.del(`/athletes/${result.athlete_id}/competition-results/${result.id}`);
    setResults((prev) => (prev ? prev.filter((r) => r.id !== result.id) : prev));
    setDrawer("closed");
  }

  const q = search.trim().toLowerCase();
  const filtered = (results ?? []).filter((r) =>
    `${r.competition_name} ${r.first_name ?? ""} ${r.last_name ?? ""}`
      .toLowerCase()
      .includes(q)
  );

  if (error) return <div className="p-4 text-red-700">{error}</div>;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Competitions</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search competitions..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      {results === null ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => setDrawer(r)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left shadow-card"
            >
              <ResultSummary result={r} />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">
              {results.length === 0
                ? "No competitions recorded yet."
                : "No matches."}
            </p>
          )}
        </div>
      )}

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="Record competition"
      >
        <form onSubmit={createResult} className="flex flex-col gap-4">
          {canPickAthlete && (
            <AthletePicker
              selectedId={targetAthleteId}
              options={athletes}
              onSelect={setTargetAthleteId}
            />
          )}
          <ResultFields form={form} setForm={setForm} />
          <button
            type="submit"
            disabled={!targetAthleteId}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
          >
            Record
          </button>
        </form>
      </Drawer>

      <Drawer
        open={drawer !== "closed" && drawer !== "create"}
        onClose={() => setDrawer("closed")}
        title={
          drawer !== "closed" && drawer !== "create" ? drawer.competition_name : ""
        }
      >
        {drawer !== "closed" && drawer !== "create" && (
          <EditResultForm
            result={drawer}
            showAthleteName={canPickAthlete}
            onUpdate={(patch) => updateResult(drawer, patch)}
            onDelete={() => deleteResult(drawer)}
          />
        )}
      </Drawer>
    </div>
  );
}
