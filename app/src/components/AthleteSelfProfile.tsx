import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { Spinner, Avatar } from "./ui";

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
  photo_url: string | null;
  medical_notes: string | null;
  is_active: boolean;
}

interface KarateStyle {
  id: number;
  name: string;
}

export function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <span className="flex min-h-[44px] items-center rounded-xl border border-stone-200 bg-stone-50 px-3">
        {value}
      </span>
    </div>
  );
}

export function LinkParentPin({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [pin, setPin] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function generate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ pin: string; expires_at: string }>(
        `/athletes/${athleteId}/generate-pin`,
        {}
      );
      setPin(res.pin);
      setExpiresAt(res.expires_at);
    } catch {
      setError("Failed to generate a PIN");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
      <span className="text-sm font-medium text-stone-700">
        Link a parent
      </span>
      <p className="text-sm text-stone-600">
        Generate a one-time code and share it with your parent. They enter
        it on their own profile to link to yours.
      </p>
      {pin && (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-white py-3">
          <span className="text-3xl font-semibold tracking-widest">
            {pin}
          </span>
          <span className="text-xs text-stone-500">
            Expires {new Date(expiresAt!).toLocaleTimeString()} or once used
          </span>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={generate}
        disabled={submitting}
        className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
      >
        {pin ? "Generate new PIN" : "Generate PIN"}
      </button>
    </div>
  );
}

export function AthleteSelfProfile({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [styleNames, setStyleNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ athlete: Athlete }>(`/athletes/${athleteId}`),
      api.get<{ styleIds: number[] }>(`/athletes/${athleteId}/styles`),
      api.get<{ styles: KarateStyle[] }>("/karate-styles"),
    ])
      .then(([athleteRes, styleIdsRes, stylesRes]) => {
        setAthlete(athleteRes.athlete);
        const ids = new Set(styleIdsRes.styleIds);
        setStyleNames(
          stylesRes.styles.filter((s) => ids.has(s.id)).map((s) => s.name)
        );
      })
      .catch(() => setError("Failed to load your athlete profile"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!athlete)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar
          name={`${athlete.first_name} ${athlete.last_name}`}
          url={athlete.photo_url}
          size={56}
        />
        <h1 className="text-2xl font-bold tracking-tight">
          {athlete.first_name} {athlete.last_name}
        </h1>
      </div>
      <ReadOnlyField label="Belt" value={athlete.belt} />
      <ReadOnlyField
        label="Styles"
        value={styleNames.length > 0 ? styleNames.join(", ") : "—"}
      />
      <ReadOnlyField
        label="Date of birth"
        value={athlete.date_of_birth ?? "—"}
      />
      <ReadOnlyField label="Email" value={athlete.email ?? "—"} />
      <ReadOnlyField label="Phone" value={athlete.phone ?? "—"} />
      <ReadOnlyField
        label="Emergency contact name"
        value={athlete.emergency_name ?? "—"}
      />
      <ReadOnlyField
        label="Emergency phone"
        value={athlete.emergency_phone ?? "—"}
      />
      <ReadOnlyField label="Join date" value={athlete.join_date.slice(0, 10)} />
      <ReadOnlyField
        label="Medical notes"
        value={athlete.medical_notes ?? "—"}
      />

      <LinkParentPin athleteId={athlete.id} />
    </div>
  );
}
