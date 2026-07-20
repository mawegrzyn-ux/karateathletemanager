import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../hooks/useApi";
import { Spinner } from "../components/ui";

interface ToolAction {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ToolAction[];
}

// Osu needs an Anthropic API key to actually talk to Claude - configured
// from More > Configuration > Osu API key (see admin/OsuApiKey.tsx), not
// here; this page only points there in text, it doesn't link to it, since
// key management now lives solely under Configuration. `configured` starts
// undefined (loading) then flips to a real boolean once GET
// .../anthropic-key resolves; the chat UI only renders once it's true. A
// 409 from the chat endpoint itself (e.g. a key that was removed after
// this page loaded) falls back to the same "not configured" message as a
// defensive backstop.
export default function Osu() {
  const api = useApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ configured: boolean }>("/admin/settings/anthropic-key")
      .then((res) => setConfigured(res.configured))
      .catch(() => setConfigured(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await api.post<{ reply: string; actions: ToolAction[] }>(
        "/osu/chat",
        { messages: next.map(({ role, content }) => ({ role, content })) }
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, actions: res.actions },
      ]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfigured(false);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setSending(false);
    }
  }

  if (configured === undefined) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold tracking-tight">Osu 🥋</h1>
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
          <p className="text-sm text-stone-600">
            Osu needs an Anthropic API key before it can chat. Configure it
            under More → Configuration → Osu API key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="p-4 pb-0">
        <h1 className="text-2xl font-bold tracking-tight">Osu 🥋</h1>
        <p className="text-sm text-stone-600">
          Ask about clubs, athletes, pending sign-ups, or the schedule, search
          the web - or ask Osu to make a change for you.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-sm text-stone-500">
              Try: "list pending sign-ups" or "create a club called Riverside
              Dojo".
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1 ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-card ${
                  m.role === "user"
                    ? "bg-red-600 text-white"
                    : "bg-white text-stone-800"
                }`}
              >
                {m.content}
              </div>
              {m.actions && m.actions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.actions.map((a, j) => (
                    <span
                      key={j}
                      title={JSON.stringify(a.input)}
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        a.error
                          ? "bg-red-50 text-red-700"
                          : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      🔧 {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <Spinner />
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-stone-200 bg-white p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Osu..."
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="min-h-[44px] rounded-full bg-red-600 px-4 font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
