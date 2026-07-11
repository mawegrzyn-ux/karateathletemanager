import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { Spinner, Avatar, Field, MediaField, Toast } from "./ui";

interface StaffRecord {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  qualifications: string | null;
  photo_url: string | null;
}

// Coaches and referees are both self-editable "staff" profiles with the
// same shape (name, contact info, qualifications, photo) — this covers
// both rather than duplicating near-identical components.
export function StaffSelfProfile({
  kind,
  id,
}: {
  kind: "coach" | "referee";
  id: number;
}) {
  const api = useApi();
  const path = kind === "coach" ? "/admin/coaches" : "/admin/referees";
  const [person, setPerson] = useState<StaffRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    api
      .get<Record<string, StaffRecord>>(`${path}/${id}`)
      .then((res) => setPerson(res[kind]))
      .catch(() => setError(`Failed to load your ${kind} profile`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  async function update(patch: Record<string, unknown>) {
    const res = await api.patch<Record<string, StaffRecord>>(
      `${path}/${id}`,
      patch
    );
    setPerson(res[kind]);
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!person)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar
          name={`${person.first_name} ${person.last_name}`}
          url={person.photo_url}
          size={56}
        />
        <h1 className="text-2xl font-bold tracking-tight">
          {person.first_name} {person.last_name}
        </h1>
      </div>

      <MediaField
        label="Photo"
        kind="image"
        value={person.photo_url ?? ""}
        onChange={(url) => update({ photo_url: url || null })}
        onError={showToast}
      />
      <Field label="First name">
        <input
          defaultValue={person.first_name}
          onBlur={(e) => {
            if (e.target.value !== person.first_name) {
              update({ first_name: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Last name">
        <input
          defaultValue={person.last_name}
          onBlur={(e) => {
            if (e.target.value !== person.last_name) {
              update({ last_name: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Email">
        <input
          defaultValue={person.email ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (person.email ?? "")) {
              update({ email: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Phone">
        <input
          defaultValue={person.phone ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (person.phone ?? "")) {
              update({ phone: e.target.value });
            }
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Qualifications">
        <textarea
          defaultValue={person.qualifications ?? ""}
          onBlur={(e) => {
            if (e.target.value !== (person.qualifications ?? "")) {
              update({ qualifications: e.target.value });
            }
          }}
          className="rounded-xl border border-stone-300 px-3 py-2"
        />
      </Field>

      {toast && <Toast message={toast} />}
    </div>
  );
}
