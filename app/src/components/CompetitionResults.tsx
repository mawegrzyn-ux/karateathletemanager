import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { Spinner, Field, DeleteButton } from "./ui";

export interface CompetitionResult {
  id: number;
  athlete_id: number;
  first_name?: string;
  last_name?: string;
  event_id: number | null;
  event_item_id: number | null;
  competition_name: string;
  competition_date: string;
  location: string | null;
  rounds_completed: number | null;
  final_position: string | null;
  notes: string | null;
  created_at: string;
}

const EMPTY_RESULT_FORM = {
  competition_name: "",
  competition_date: "",
  location: "",
  rounds_completed: "",
  final_position: "",
  notes: "",
};

type ResultForm = typeof EMPTY_RESULT_FORM;

function ResultFields({
  form,
  setForm,
}: {
  form: ResultForm;
  setForm: (form: ResultForm) => void;
}) {
  return (
    <>
      <Field label="Competition name">
        <input
          value={form.competition_name}
          onChange={(e) => setForm({ ...form, competition_name: e.target.value })}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={form.competition_date}
          onChange={(e) => setForm({ ...form, competition_date: e.target.value })}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Location">
        <input
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Rounds completed">
        <input
          type="number"
          min={0}
          value={form.rounds_completed}
          onChange={(e) => setForm({ ...form, rounds_completed: e.target.value })}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Final position">
        <input
          value={form.final_position}
          onChange={(e) => setForm({ ...form, final_position: e.target.value })}
          placeholder="e.g. 1st, Gold, Round of 16"
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="rounded-xl border border-stone-300 px-3 py-2"
        />
      </Field>
    </>
  );
}

function resultPayload(form: ResultForm) {
  return {
    competition_name: form.competition_name,
    competition_date: form.competition_date,
    location: form.location || null,
    rounds_completed: form.rounds_completed ? Number(form.rounds_completed) : null,
    final_position: form.final_position || null,
    notes: form.notes || null,
  };
}

function ResultSummary({ result }: { result: CompetitionResult }) {
  return (
    <>
      <span className="flex flex-col">
        <span>{result.competition_name}</span>
        {(result.first_name || result.final_position || result.rounds_completed != null) && (
          <span className="text-xs text-stone-500">
            {result.first_name && `${result.first_name} ${result.last_name} · `}
            {result.final_position && `${result.final_position}`}
            {result.final_position && result.rounds_completed != null && " · "}
            {result.rounds_completed != null && `${result.rounds_completed} rounds`}
          </span>
        )}
      </span>
      <span className="text-sm text-stone-500">
        {result.competition_date.slice(0, 10)}
      </span>
    </>
  );
}

// Athlete-scoped competition results: used on the admin/coach Athletes.tsx
// edit drawer and on AthleteSelfProfile.tsx. Unlike gradings, an athlete
// may record their own result (it's their own performance they're
// reporting), so every call site that renders this is already
// permission-appropriate and the component doesn't gate anything itself.
export function CompetitionResultsSection({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [results, setResults] = useState<CompetitionResult[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_RESULT_FORM);

  useEffect(() => {
    setResults(null);
    setExpandedId(null);
    setAdding(false);
    setForm(EMPTY_RESULT_FORM);
    api
      .get<{ results: CompetitionResult[] }>(`/athletes/${athleteId}/competition-results`)
      .then((res) => setResults(res.results))
      .catch(() => setResults([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function record() {
    if (!form.competition_name.trim() || !form.competition_date) return;
    const { result } = await api.post<{ result: CompetitionResult }>(
      `/athletes/${athleteId}/competition-results`,
      resultPayload(form)
    );
    setResults((prev) => (prev ? [result, ...prev] : [result]));
    setForm(EMPTY_RESULT_FORM);
    setAdding(false);
  }

  async function remove(id: number) {
    await api.del(`/athletes/${athleteId}/competition-results/${id}`);
    setResults((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    setExpandedId((prev) => (prev === id ? null : prev));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Competition results ({results?.length ?? 0})
      </span>
      {results === null ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-1">
          {results.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-stone-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="flex min-h-[44px] w-full items-center justify-between px-3 text-left"
                >
                  <ResultSummary result={r} />
                </button>
                {expanded && (
                  <div className="flex flex-col gap-2 border-t border-stone-100 p-3 text-sm text-stone-600">
                    {r.location && <p>Location: {r.location}</p>}
                    {r.notes && <p>{r.notes}</p>}
                    <DeleteButton
                      onClick={() => remove(r.id)}
                      itemLabel={`this result (${r.competition_name})`}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {results.length === 0 && !adding && (
            <p className="px-1 py-2 text-sm text-stone-500">
              No competition results recorded yet.
            </p>
          )}
          {adding ? (
            <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3">
              <ResultFields form={form} setForm={setForm} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={record}
                  className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white"
                >
                  Record
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="min-h-[44px] rounded-xl border border-dashed border-stone-300 text-sm font-medium text-stone-600"
            >
              + Record result
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Event/item-scoped competition results: used from a schedule item's
// detail view (Schedule.tsx) when its type is 'competition'. Shows every
// result already recorded against this event or event item (any assigned
// athlete's, via the event-scoped GET), and lets the current user capture
// one: an athlete captures their own directly, a coach/admin picks which
// assigned athlete it's for first.
export function EventCompetitionResults({
  eventId,
  eventItemId,
  athletes,
  defaultName,
  defaultDate,
  defaultLocation,
}: {
  eventId: number;
  eventItemId?: number;
  athletes: { id: number; first_name: string; last_name: string }[];
  defaultName: string;
  defaultDate: string;
  defaultLocation: string;
}) {
  const api = useApi();
  const { user } = useAuth();
  const [allResults, setAllResults] = useState<CompetitionResult[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [targetAthleteId, setTargetAthleteId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_RESULT_FORM);

  useEffect(() => {
    setAllResults(null);
    api
      .get<{ results: CompetitionResult[] }>(`/events/${eventId}/competition-results`)
      .then((res) => setAllResults(res.results))
      .catch(() => setAllResults([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const results = (allResults ?? []).filter((r) =>
    eventItemId ? r.event_item_id === eventItemId : r.event_id === eventId && !r.event_item_id
  );

  const isSelfAthlete = user?.role === "athlete" && user.athlete_id;
  const myExistingResult = isSelfAthlete
    ? results.find((r) => r.athlete_id === user.athlete_id)
    : undefined;

  function openForm() {
    setForm({
      ...EMPTY_RESULT_FORM,
      competition_name: defaultName,
      competition_date: defaultDate,
      location: defaultLocation,
    });
    setTargetAthleteId(isSelfAthlete ? (user!.athlete_id as number) : null);
    setAdding(true);
  }

  async function record() {
    if (!targetAthleteId) return;
    if (!form.competition_name.trim() || !form.competition_date) return;
    const { result } = await api.post<{ result: CompetitionResult }>(
      `/athletes/${targetAthleteId}/competition-results`,
      {
        ...resultPayload(form),
        event_id: eventItemId ? null : eventId,
        event_item_id: eventItemId ?? null,
      }
    );
    const athlete = athletes.find((a) => a.id === targetAthleteId);
    setAllResults((prev) =>
      prev
        ? [{ ...result, first_name: athlete?.first_name, last_name: athlete?.last_name }, ...prev]
        : [result]
    );
    setAdding(false);
  }

  async function remove(id: number, athleteId: number) {
    await api.del(`/athletes/${athleteId}/competition-results/${id}`);
    setAllResults((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    setExpandedId((prev) => (prev === id ? null : prev));
  }

  if (allResults === null) {
    return <Spinner />;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Competition results ({results.length})
      </span>
      <div className="flex flex-col gap-1">
        {results.map((r) => {
          const expanded = expandedId === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-stone-200 bg-white">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : r.id)}
                className="flex min-h-[44px] w-full items-center justify-between px-3 text-left"
              >
                <ResultSummary result={r} />
              </button>
              {expanded && (
                <div className="flex flex-col gap-2 border-t border-stone-100 p-3 text-sm text-stone-600">
                  {r.location && <p>Location: {r.location}</p>}
                  {r.notes && <p>{r.notes}</p>}
                  <DeleteButton
                    onClick={() => remove(r.id, r.athlete_id)}
                    itemLabel={`this result (${r.competition_name})`}
                  />
                </div>
              )}
            </div>
          );
        })}
        {results.length === 0 && !adding && (
          <p className="px-1 py-2 text-sm text-stone-500">No results recorded yet.</p>
        )}
        {adding ? (
          <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3">
            {!isSelfAthlete && (
              <Field label="Athlete">
                <select
                  value={targetAthleteId ?? ""}
                  onChange={(e) =>
                    setTargetAthleteId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                >
                  <option value="">Select an athlete...</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.first_name} {a.last_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <ResultFields form={form} setForm={setForm} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={record}
                disabled={!targetAthleteId}
                className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
              >
                Record
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openForm}
            className="min-h-[44px] rounded-xl border border-dashed border-stone-300 text-sm font-medium text-stone-600"
          >
            {myExistingResult ? "+ Record another result" : "+ Record result"}
          </button>
        )}
      </div>
    </div>
  );
}
