import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth, type Child } from "../context/AuthContext";
import { ApiError, useApi } from "../hooks/useApi";
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

      <LinkChild />

      {showActiveNav && (
        <Link to="/" className="text-center text-sm font-medium text-red-700">
          Back to app
        </Link>
      )}
    </div>
  );
}

function LinkChild() {
  const api = useApi();
  const { linkChild } = useAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Child | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<{ children: Child[] }>("/auth/my-children")
      .then((res) => setChildren(res.children))
      .catch(() => setChildren([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmed(null);
    setSubmitting(true);
    try {
      const child = await linkChild(pin);
      setConfirmed(child);
      setChildren((prev) => (prev ? [...prev, child] : [child]));
      setPin("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <h2 className="font-semibold">Link a child</h2>
      <p className="text-sm text-slate-600">
        Ask your child (or their coach) for the 6-digit code from their
        athlete profile, then enter it here.
      </p>

      {children && children.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">
            Your children
          </span>
          {children.map((c) => (
            <span key={c.id} className="text-sm text-slate-600">
              {c.first_name} {c.last_name}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 tracking-widest"
        />
        <button
          type="submit"
          disabled={submitting || pin.length !== 6}
          className="min-h-[44px] rounded-lg bg-red-700 px-4 font-medium text-white disabled:opacity-50"
        >
          Link
        </button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {confirmed && (
        <p className="text-sm text-green-700">
          Linked to {confirmed.first_name} {confirmed.last_name}.
        </p>
      )}
    </div>
  );
}
