import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, useApi } from "../hooks/useApi";
import { Field } from "../components/ui";

interface Club {
  id: number;
  name: string;
}

export default function Register() {
  const { register } = useAuth();
  const api = useApi();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wantsAthlete, setWantsAthlete] = useState(false);
  const [wantsCoach, setWantsCoach] = useState(false);
  const [clubId, setClubId] = useState<number | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<{ clubs: Club[] }>("/public/clubs")
      .then((res) => setClubs(res.clubs))
      .catch(() => setClubs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, {
        wants_athlete: wantsAthlete,
        wants_coach: wantsCoach,
        requested_club_id: clubId,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">
            I'm joining as (optional)
          </span>
          <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 px-3">
            <input
              type="checkbox"
              checked={wantsAthlete}
              onChange={(e) => setWantsAthlete(e.target.checked)}
            />
            An athlete
          </label>
          <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 px-3">
            <input
              type="checkbox"
              checked={wantsCoach}
              onChange={(e) => setWantsCoach(e.target.checked)}
            />
            A coach
          </label>
        </div>

        <ClubPicker selectedId={clubId} options={clubs} onSelect={setClubId} />

        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-lg bg-red-700 font-medium text-white disabled:opacity-50"
        >
          Register
        </button>
      </form>
      <p className="text-sm text-slate-600">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-red-700">
          Log in
        </Link>
      </p>
    </div>
  );
}

function ClubPicker({
  selectedId,
  options,
  onSelect,
}: {
  selectedId: number | null;
  options: Club[];
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        Club (optional)
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clubs..."
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
              <span>{o.name}</span>
              <span className="text-sm">
                {selected ? "✓ Selected" : "Select"}
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
