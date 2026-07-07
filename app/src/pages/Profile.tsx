import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../hooks/useApi";
import { Field } from "../components/ui";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const showActiveNav = user?.status === "active" && user.role;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        phone,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-sm text-slate-600">{user?.email}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="First name">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3"
          />
        </Field>
        <Field label="Last name">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3"
          />
        </Field>
        <Field label="Phone number">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3"
          />
        </Field>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {saved && <p className="text-sm text-green-700">Saved.</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-lg bg-red-700 font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>
      {showActiveNav && (
        <Link to="/" className="text-center text-sm font-medium text-red-700">
          Back to app
        </Link>
      )}
    </div>
  );
}
