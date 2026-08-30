import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { Spinner, Avatar, BeltSwatch, DeleteButton } from "./ui";
import { CompetitionResultsSection } from "./CompetitionResults";
import { GuardianInviteLink } from "./GuardianInviteLink";

interface Guardian {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  grade_id: number | null;
  join_date: string;
  photo_url: string | null;
  medical_notes: string | null;
  is_active: boolean;
}

interface KarateStyle {
  id: number;
  name: string;
}

interface Grade {
  id: number;
  kind: string;
  rank_order: number;
  name: string;
  belt_color: string;
  club_id: number | null;
  club_name: string | null;
}

interface Grading {
  id: number;
  grade_id: number;
  graded_at: string;
  grading_body: string | null;
  examiner: string | null;
  passed: boolean;
  next_grade_due: string | null;
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

export function LinkedGuardians({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [guardians, setGuardians] = useState<Guardian[] | null>(null);

  useEffect(() => {
    api
      .get<{ guardians: Guardian[] }>(`/athletes/${athleteId}/guardians`)
      .then((res) => setGuardians(res.guardians))
      .catch(() => setGuardians([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function handleUnlink(guardian: Guardian) {
    await api.del(`/athletes/${athleteId}/guardians/${guardian.id}`);
    setGuardians((prev) =>
      prev ? prev.filter((g) => g.id !== guardian.id) : prev
    );
  }

  if (!guardians || guardians.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
      <span className="text-sm font-medium text-stone-700">
        Linked guardians
      </span>
      {guardians.map((g) => {
        const name =
          g.first_name || g.last_name
            ? `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim()
            : g.email;
        return (
          <div key={g.id} className="flex items-center justify-between gap-2">
            <span className="text-sm text-stone-600">{name}</span>
            <DeleteButton
              onClick={() => handleUnlink(g)}
              itemLabel={name}
              label="Unlink"
              iconOnly
            />
          </div>
        );
      })}
    </div>
  );
}

export function AthleteSelfProfile({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [styleNames, setStyleNames] = useState<string[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradings, setGradings] = useState<Grading[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ athlete: Athlete }>(`/athletes/${athleteId}`),
      api.get<{ styleIds: number[] }>(`/athletes/${athleteId}/styles`),
      api.get<{ styles: KarateStyle[] }>("/karate-styles"),
      api.get<{ grades: Grade[] }>("/grades"),
      api.get<{ gradings: Grading[] }>(`/athletes/${athleteId}/gradings`),
    ])
      .then(([athleteRes, styleIdsRes, stylesRes, gradesRes, gradingsRes]) => {
        setAthlete(athleteRes.athlete);
        const ids = new Set(styleIdsRes.styleIds);
        setStyleNames(
          stylesRes.styles.filter((s) => ids.has(s.id)).map((s) => s.name)
        );
        setGrades(gradesRes.grades);
        setGradings(gradingsRes.gradings);
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
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">Grade</span>
        <span className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3">
          {(() => {
            const grade = grades.find((g) => g.id === athlete.grade_id);
            return grade ? (
              <>
                <BeltSwatch color={grade.belt_color} />
                {grade.name}
              </>
            ) : (
              "—"
            );
          })()}
        </span>
      </div>
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

      {gradings.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">
            Grading history
          </span>
          <div className="flex flex-col gap-1">
            {gradings.map((g) => {
              const grade = grades.find((gr) => gr.id === g.grade_id);
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    {grade && <BeltSwatch color={grade.belt_color} />}
                    <span className={g.passed ? "" : "text-red-700"}>
                      {grade?.name ?? "Unknown grade"}
                      {!g.passed && " (not passed)"}
                    </span>
                  </span>
                  <span className="text-sm text-stone-500">
                    {g.graded_at.slice(0, 10)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CompetitionResultsSection athleteId={athlete.id} />

      <LinkedGuardians athleteId={athlete.id} />
      <GuardianInviteLink endpoint={`/athletes/${athlete.id}/guardian-invite-link`} />
    </div>
  );
}
