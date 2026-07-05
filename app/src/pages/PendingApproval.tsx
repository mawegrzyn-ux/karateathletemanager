import { useAuth } from "../context/AuthContext";

export default function PendingApproval() {
  const { user, logout } = useAuth();

  const message =
    user?.status === "disabled"
      ? "Your account has been disabled. Contact a coach or admin for help."
      : "Your account is waiting for admin approval. You'll get full access once a coach or admin assigns your role.";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Almost there</h1>
      <p className="text-slate-600">{message}</p>
      <button
        onClick={() => logout()}
        className="min-h-[44px] rounded-lg border border-slate-300 px-4 font-medium text-slate-700"
      >
        Log out
      </button>
    </div>
  );
}
