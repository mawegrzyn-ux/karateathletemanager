import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../hooks/useApi";
import { Field } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Log in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
        >
          Log in
        </button>
      </form>
      <p className="text-sm text-stone-600">
        No account?{" "}
        <Link to="/register" className="font-medium text-red-700">
          Register
        </Link>
      </p>
    </div>
  );
}
