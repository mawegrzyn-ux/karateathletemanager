import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  Badge,
} from "../components/ui";

interface Event {
  id: number;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

interface EventItem {
  id: number;
  event_id: number;
  item_type: string;
  title: string;
  item_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  training_module_id: number | null;
  kata_id: number | null;
}

interface Person {
  id: number;
  first_name: string;
  last_name: string;
}

interface TrainingModule {
  id: number;
  title: string;
}

interface Kata {
  id: number;
  name: string;
  style: string | null;
  wkf_number: number | null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_TYPES = [
  "competition",
  "squad_session",
  "training",
  "travel",
  "time_off",
  "seminar",
  "training_camp",
];
const ITEM_TYPES = [...EVENT_TYPES, "rest", "other", "kata_performance"];

const TYPE_LABELS: Record<string, string> = {
  competition: "Competition",
  squad_session: "Squad session",
  training: "Training",
  travel: "Travel",
  time_off: "Time off",
  seminar: "Seminar",
  training_camp: "Training camp",
  rest: "Rest",
  other: "Other",
  kata_performance: "Kata performance",
};

const EMPTY_FORM = {
  title: "",
  event_type: "training",
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  location: "",
  notes: "",
};

const EMPTY_ITEM_FORM = {
  item_type: "training",
  title: "",
  item_date: "",
  start_time: "",
  end_time: "",
  notes: "",
  training_module_id: null as number | null,
  kata_id: null as number | null,
  repeat_freq: "none",
  repeat_until: "",
  repeat_weekdays: [] as number[],
};

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : "";
}

function toTimeInput(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

export default function Schedule() {
  const { user } = useAuth();

  if (user?.is_admin || user?.role === "coach" || user?.role === "athlete") {
    return (
      <ScheduleManager canPickAthletes={!!user.is_admin || user.role === "coach"} />
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Schedule</h1>
      <p className="text-slate-600">
        Ask your coach about upcoming training and events.
      </p>
    </div>
  );
}

function ScheduleManager({ canPickAthletes }: { canPickAthletes: boolean }) {
  const api = useApi();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [athletes, setAthletes] = useState<Person[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [katas, setKatas] = useState<Kata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Event>("closed");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formAthleteIds, setFormAthleteIds] = useState<number[]>([]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    api
      .get<{ events: Event[] }>("/events")
      .then((res) => setEvents(res.events))
      .catch(() => setError("Failed to load schedule"));

    if (canPickAthletes) {
      api
        .get<{ athletes: Person[] }>("/athletes")
        .then((res) => setAthletes(res.athletes))
        .catch(() => setAthletes([]));
    }

    api
      .get<{ modules: TrainingModule[] }>("/training-modules")
      .then((res) => setModules(res.modules))
      .catch(() => setModules([]));

    api
      .get<{ katas: Kata[] }>("/katas")
      .then((res) => setKatas(res.katas))
      .catch(() => setKatas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormAthleteIds([]);
    setDrawer("create");
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.start_date || !form.end_date) return;
    const { event } = await api.post<{ event: Event }>("/events", {
      ...form,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      athlete_ids: canPickAthletes ? formAthleteIds : undefined,
    });
    setEvents((prev) => (prev ? [...prev, event] : [event]));
    setDrawer("closed");
  }

  async function deleteEvent(id: number) {
    await api.del(`/events/${id}`);
    setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    setDrawer("closed");
  }

  function updateEventInList(updated: Event) {
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === updated.id ? updated : e)) : prev
    );
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!events)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const q = query.trim().toLowerCase();
  const filteredEvents = events.filter((e) =>
    `${e.title} ${TYPE_LABELS[e.event_type] ?? e.event_type}`
      .toLowerCase()
      .includes(q)
  );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search schedule..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filteredEvents.map((e) => (
          <button
            key={e.id}
            onClick={() => setDrawer(e)}
            className="flex min-h-[44px] flex-col items-start gap-1 rounded-lg border border-slate-200 px-3 py-2 text-left"
          >
            <span className="font-medium">{e.title}</span>
            <div className="flex items-center gap-2">
              <Badge>{TYPE_LABELS[e.event_type] ?? e.event_type}</Badge>
              <span className="text-xs text-slate-500">
                {toDateInput(e.start_date)}
                {e.end_date !== e.start_date ? ` – ${toDateInput(e.end_date)}` : ""}
                {e.start_time ? ` ${toTimeInput(e.start_time)}` : ""}
                {e.end_time ? `–${toTimeInput(e.end_time)}` : ""}
              </span>
            </div>
          </button>
        ))}
        {filteredEvents.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-500">
            Nothing scheduled yet.
          </p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New event"
      >
        <form onSubmit={createEvent} className="flex flex-col gap-4">
          <Field label="Title">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Type">
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input
              required
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="End date">
            <input
              required
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Start time">
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="End time">
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Location">
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </Field>

          {canPickAthletes && (
            <AthletePicker
              ids={formAthleteIds}
              options={athletes}
              onAdd={(id) => setFormAthleteIds((prev) => [...prev, id])}
              onRemove={(id) =>
                setFormAthleteIds((prev) => prev.filter((i) => i !== id))
              }
            />
          )}

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
        title={editing?.title ?? ""}
      >
        {editing && (
          <EventDetail
            key={editing.id}
            eventId={editing.id}
            canPickAthletes={canPickAthletes}
            allAthletes={athletes}
            modules={modules}
            katas={katas}
            onUpdated={updateEventInList}
            onDeleted={() => deleteEvent(editing.id)}
          />
        )}
      </Drawer>
    </div>
  );
}

function EventDetail({
  eventId,
  canPickAthletes,
  allAthletes,
  modules,
  katas,
  onUpdated,
  onDeleted,
}: {
  eventId: number;
  canPickAthletes: boolean;
  allAthletes: Person[];
  modules: TrainingModule[];
  katas: Kata[];
  onUpdated: (event: Event) => void;
  onDeleted: () => void;
}) {
  const api = useApi();
  const [event, setEvent] = useState<Event | null>(null);
  const [athleteIds, setAthleteIds] = useState<number[]>([]);
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ event: Event; athletes: Person[]; items: EventItem[] }>(
        `/events/${eventId}`
      )
      .then((res) => {
        setEvent(res.event);
        setAthleteIds(res.athletes.map((a) => a.id));
        setItems(res.items);
      })
      .catch(() => setError("Failed to load event"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function updateEvent(patch: Record<string, unknown>) {
    const { event: updated } = await api.patch<{ event: Event }>(
      `/events/${eventId}`,
      patch
    );
    setEvent(updated);
    onUpdated(updated);
  }

  async function setAthletes(ids: number[]) {
    await api.put(`/events/${eventId}/athletes`, { athlete_ids: ids });
    setAthleteIds(ids);
  }

  if (error) return <div className="text-red-700">{error}</div>;
  if (!event || !items)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title">
        <input
          defaultValue={event.title}
          onBlur={(e) => {
            if (e.target.value !== event.title) {
              updateEvent({ title: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        />
      </Field>
      <Field label="Type">
        <select
          value={event.event_type}
          onChange={(e) => updateEvent({ event_type: e.target.value })}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Start date">
        <input
          type="date"
          defaultValue={toDateInput(event.start_date)}
          onChange={(e) => updateEvent({ start_date: e.target.value })}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        />
      </Field>
      <Field label="End date">
        <input
          type="date"
          defaultValue={toDateInput(event.end_date)}
          onChange={(e) => updateEvent({ end_date: e.target.value })}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        />
      </Field>
      <Field label="Start time">
        <input
          type="time"
          defaultValue={toTimeInput(event.start_time)}
          onChange={(e) =>
            updateEvent({ start_time: e.target.value || null })
          }
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        />
      </Field>
      <Field label="End time">
        <input
          type="time"
          defaultValue={toTimeInput(event.end_time)}
          onChange={(e) => updateEvent({ end_time: e.target.value || null })}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        />
      </Field>
      <Field label="Location">
        <input
          defaultValue={event.location ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (event.location ?? "")) {
              updateEvent({ location: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-lg border border-slate-300 px-3"
        />
      </Field>
      <Field label="Notes">
        <textarea
          defaultValue={event.notes ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (event.notes ?? "")) {
              updateEvent({ notes: e.target.value });
            }
          }}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
      </Field>

      {canPickAthletes && (
        <AthletePicker
          ids={athleteIds}
          options={allAthletes}
          onAdd={(id) => setAthletes([...athleteIds, id])}
          onRemove={(id) => setAthletes(athleteIds.filter((i) => i !== id))}
        />
      )}

      <ItemsSection
        eventId={eventId}
        items={items}
        setItems={setItems}
        modules={modules}
        katas={katas}
      />

      <DeleteButton onClick={onDeleted} itemLabel={event.title} />
    </div>
  );
}

function AthletePicker({
  ids,
  options,
  onAdd,
  onRemove,
}: {
  ids: number[];
  options: Person[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        Athletes ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search athletes..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (added ? onRemove(o.id) : onAdd(o.id))}
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200"
              }`}
            >
              <span>
                {o.first_name} {o.last_name}
              </span>
              <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-500">No matches.</p>
        )}
      </div>
    </div>
  );
}

function SingleSelectPicker({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  placeholder: string;
  options: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.label.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(selected ? null : o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200"
              }`}
            >
              <span>{o.label}</span>
              <span className="text-sm">
                {selected ? "✓ Selected" : "+ Select"}
              </span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-slate-500">No matches.</p>
        )}
      </div>
    </div>
  );
}

function weekdayOf(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function kataLabel(k: Kata) {
  const label = k.wkf_number != null ? `${k.wkf_number}. ${k.name}` : k.name;
  return k.style ? `${label} (${k.style})` : label;
}

function ItemsSection({
  eventId,
  items,
  setItems,
  modules,
  katas,
}: {
  eventId: number;
  items: EventItem[];
  setItems: (items: EventItem[]) => void;
  modules: TrainingModule[];
  katas: Kata[];
}) {
  const api = useApi();
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ITEM_FORM);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = [...items].sort((a, b) =>
    `${a.item_date}${a.start_time ?? ""}`.localeCompare(
      `${b.item_date}${b.start_time ?? ""}`
    )
  );

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (
      !addForm.title.trim() ||
      !addForm.item_date ||
      !addForm.start_time ||
      !addForm.end_time
    )
      return;

    const payload: Record<string, unknown> = {
      item_type: addForm.item_type,
      title: addForm.title,
      item_date: addForm.item_date,
      start_time: addForm.start_time,
      end_time: addForm.end_time,
      notes: addForm.notes,
      training_module_id:
        addForm.item_type === "training" ? addForm.training_module_id : null,
      kata_id:
        addForm.item_type === "kata_performance" ? addForm.kata_id : null,
    };
    if (addForm.repeat_freq !== "none") {
      payload.repeat = {
        freq: addForm.repeat_freq,
        until: addForm.repeat_until,
        weekdays:
          addForm.repeat_freq === "weekly"
            ? addForm.repeat_weekdays.length > 0
              ? addForm.repeat_weekdays
              : [weekdayOf(addForm.item_date)]
            : undefined,
      };
    }

    const res = await api.post<{ item?: EventItem; items?: EventItem[] }>(
      `/events/${eventId}/items`,
      payload
    );
    setItems([...items, ...(res.items ?? (res.item ? [res.item] : []))]);
    setAddForm(EMPTY_ITEM_FORM);
    setAdding(false);
  }

  async function updateItem(id: number, patch: Record<string, unknown>) {
    const { item } = await api.patch<{ item: EventItem }>(
      `/events/${eventId}/items/${id}`,
      patch
    );
    setItems(items.map((i) => (i.id === id ? item : i)));
  }

  async function deleteItem(id: number) {
    await api.del(`/events/${eventId}/items/${id}`);
    setItems(items.filter((i) => i.id !== id));
    setExpandedId(null);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        Itinerary ({items.length})
      </span>

      <div className="flex flex-col gap-1">
        {sorted.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : item.id)}
                className="flex min-h-[44px] w-full flex-col items-start gap-1 px-3 py-2 text-left"
              >
                <div className="flex w-full items-center justify-between">
                  <span>{item.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge>{TYPE_LABELS[item.item_type] ?? item.item_type}</Badge>
                    <span className="text-xs text-slate-500">
                      {toDateInput(item.item_date)}
                    </span>
                  </div>
                </div>
                {(item.training_module_id || item.kata_id) && (
                  <span className="text-xs text-slate-500">
                    {item.training_module_id &&
                      modules.find((m) => m.id === item.training_module_id)
                        ?.title}
                    {item.kata_id &&
                      katas.find((k) => k.id === item.kata_id)?.name}
                  </span>
                )}
              </button>
              {expanded && (
                <div className="flex flex-col gap-3 border-t border-slate-200 p-3">
                  <Field label="Title">
                    <input
                      defaultValue={item.title}
                      onBlur={(e) => {
                        if (e.target.value !== item.title) {
                          updateItem(item.id, { title: e.target.value });
                        }
                      }}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={item.item_type}
                      onChange={(e) =>
                        updateItem(item.id, { item_type: e.target.value })
                      }
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Date">
                    <input
                      type="date"
                      defaultValue={toDateInput(item.item_date)}
                      onChange={(e) =>
                        updateItem(item.id, { item_date: e.target.value })
                      }
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    />
                  </Field>
                  <Field label="Start time">
                    <input
                      required
                      type="time"
                      defaultValue={toTimeInput(item.start_time)}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateItem(item.id, { start_time: e.target.value });
                        }
                      }}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    />
                  </Field>
                  <Field label="End time">
                    <input
                      required
                      type="time"
                      defaultValue={toTimeInput(item.end_time)}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateItem(item.id, { end_time: e.target.value });
                        }
                      }}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3"
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      defaultValue={item.notes ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (item.notes ?? "")) {
                          updateItem(item.id, { notes: e.target.value });
                        }
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </Field>
                  {item.item_type === "training" && (
                    <SingleSelectPicker
                      label="Training module"
                      placeholder="Search training modules..."
                      options={modules.map((m) => ({ id: m.id, label: m.title }))}
                      selectedId={item.training_module_id}
                      onSelect={(id) =>
                        updateItem(item.id, { training_module_id: id })
                      }
                    />
                  )}
                  {item.item_type === "kata_performance" && (
                    <SingleSelectPicker
                      label="Kata"
                      placeholder="Search katas..."
                      options={katas.map((k) => ({ id: k.id, label: kataLabel(k) }))}
                      selectedId={item.kata_id}
                      onSelect={(id) =>
                        updateItem(item.id, {
                          kata_id: id,
                          ...(id
                            ? { title: katas.find((k) => k.id === id)?.name }
                            : {}),
                        })
                      }
                    />
                  )}
                  <DeleteButton
                    onClick={() => deleteItem(item.id)}
                    itemLabel={item.title}
                  />
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && !adding && (
          <p className="px-1 py-2 text-sm text-slate-500">
            No itinerary items yet.
          </p>
        )}
      </div>

      {adding ? (
        <form
          onSubmit={addItem}
          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <Field label="Title">
            <input
              required
              value={addForm.title}
              onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Type">
            <select
              value={addForm.item_type}
              onChange={(e) =>
                setAddForm({ ...addForm, item_type: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              required
              type="date"
              value={addForm.item_date}
              onChange={(e) =>
                setAddForm({ ...addForm, item_date: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Start time">
            <input
              required
              type="time"
              value={addForm.start_time}
              onChange={(e) =>
                setAddForm({ ...addForm, start_time: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="End time">
            <input
              required
              type="time"
              value={addForm.end_time}
              onChange={(e) =>
                setAddForm({ ...addForm, end_time: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </Field>

          {addForm.item_type === "training" && (
            <SingleSelectPicker
              label="Training module"
              placeholder="Search training modules..."
              options={modules.map((m) => ({ id: m.id, label: m.title }))}
              selectedId={addForm.training_module_id}
              onSelect={(id) =>
                setAddForm({ ...addForm, training_module_id: id })
              }
            />
          )}
          {addForm.item_type === "kata_performance" && (
            <SingleSelectPicker
              label="Kata"
              placeholder="Search katas..."
              options={katas.map((k) => ({ id: k.id, label: kataLabel(k) }))}
              selectedId={addForm.kata_id}
              onSelect={(id) =>
                setAddForm({
                  ...addForm,
                  kata_id: id,
                  title: id ? katas.find((k) => k.id === id)?.name ?? addForm.title : addForm.title,
                })
              }
            />
          )}

          <Field label="Repeats">
            <select
              value={addForm.repeat_freq}
              onChange={(e) =>
                setAddForm({
                  ...addForm,
                  repeat_freq: e.target.value,
                  repeat_weekdays: [],
                })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          {addForm.repeat_freq !== "none" && (
            <Field label="Repeat until">
              <input
                required
                type="date"
                value={addForm.repeat_until}
                onChange={(e) =>
                  setAddForm({ ...addForm, repeat_until: e.target.value })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
          )}
          {addForm.repeat_freq === "weekly" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">
                Repeat on
              </span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((label, day) => {
                  const active =
                    addForm.repeat_weekdays.length > 0
                      ? addForm.repeat_weekdays.includes(day)
                      : addForm.item_date && weekdayOf(addForm.item_date) === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const base =
                          addForm.repeat_weekdays.length > 0
                            ? addForm.repeat_weekdays
                            : addForm.item_date
                              ? [weekdayOf(addForm.item_date)]
                              : [];
                        const next = base.includes(day)
                          ? base.filter((d) => d !== day)
                          : [...base, day];
                        setAddForm({ ...addForm, repeat_weekdays: next });
                      }}
                      className={`min-h-[36px] min-w-[44px] rounded-lg border px-2 text-sm ${
                        active
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 rounded-lg bg-red-700 font-medium text-white"
            >
              Add
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-[44px] rounded-lg border border-slate-300 font-medium text-slate-700"
        >
          + Add itinerary item
        </button>
      )}
    </div>
  );
}
