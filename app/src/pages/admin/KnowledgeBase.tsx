import { useEffect, useState } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field, Badge, Toast } from "../../components/ui";

type SourceType = "pdf" | "docx" | "text" | "html" | "link" | "image";

interface KbDocument {
  id: number;
  title: string;
  source_type: SourceType;
  source_url: string | null;
  raw_text: string | null;
  status: "ready" | "failed";
  error_message: string | null;
  created_at: string;
  chunk_count: number;
}

interface SearchResult {
  title: string;
  content: string | null;
  image_url: string | null;
  source_url: string | null;
  source_type: SourceType;
}

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  pdf: "PDF",
  docx: "Word doc",
  text: "Text",
  html: "HTML",
  link: "Link",
  image: "Image",
};

// Not a MediaField (image/video only) - this posts straight to
// POST /kb/documents rather than the generic /api/uploads, since a
// document upload also needs text extraction/chunking/embedding that the
// generic upload endpoint has no place for. Uses fetch directly (not
// useApi(), which always JSON.stringifies) since this is a multipart
// FormData body.
function CreateDocumentForm({
  onCreated,
  onError,
}: {
  onCreated: (doc: KbDocument) => void;
  onError: (message: string) => void;
}) {
  const api = useApi();
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    if (mode === "file" && !file) return;
    if (mode === "link" && !linkUrl.trim()) return;
    setSubmitting(true);
    try {
      let document: KbDocument;
      if (mode === "file") {
        const formData = new FormData();
        formData.append("file", file!);
        if (title.trim()) formData.append("title", title.trim());
        const res = await fetch("/api/kb/documents", { method: "POST", body: formData });
        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(body?.error?.message ?? "Upload failed");
        document = body.document;
      } else {
        const res = await api.post<{ document: KbDocument }>("/kb/documents", {
          source_type: "link",
          source_url: linkUrl.trim(),
          title: title.trim() || undefined,
        });
        document = res.document;
      }
      if (document.status === "failed") {
        onError(document.error_message ?? "Failed to process that document");
      }
      onCreated(document);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add document");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-full bg-stone-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex-1 rounded-full px-3 py-1 ${
            mode === "file" ? "bg-white shadow-card" : "text-stone-500"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex-1 rounded-full px-3 py-1 ${
            mode === "link" ? "bg-white shadow-card" : "text-stone-500"
          }`}
        >
          Paste link
        </button>
      </div>
      <Field label="Title (optional)">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      {mode === "file" ? (
        <Field label="File (PDF, Word doc, text, HTML, or image)" key="file">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.html,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </Field>
      ) : (
        <Field label="URL" key="link">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || (mode === "file" ? !file : !linkUrl.trim())}
        className="flex min-h-[44px] items-center justify-center rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
      >
        {submitting ? <Spinner /> : "Add"}
      </button>
    </div>
  );
}

export default function KnowledgeBase() {
  const api = useApi();
  const [documents, setDocuments] = useState<KbDocument[] | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | KbDocument>("closed");
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    api
      .get<{ documents: KbDocument[] }>("/kb/documents")
      .then((res) => setDocuments(res.documents))
      .catch(() => showToast("Failed to load documents"));
  }

  async function deleteDocument(id: number) {
    await api.del(`/kb/documents/${id}`);
    setDocuments((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    setDrawer("closed");
  }

  async function runSearch() {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res = await api.get<{ results: SearchResult[] }>(
        `/kb/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
      setSearchResults(res.results);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  if (!documents) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const filtered = documents.filter((d) =>
    d.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Knowledge base</h1>
        <AddButton onClick={() => setDrawer("create")} />
      </div>
      <p className="text-sm text-stone-600">
        Documents, links, and images uploaded here get embedded so Osu can
        search them for grounded answers - see More &gt; Configuration &gt;
        Voyage AI key if search isn't working yet.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search documents..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((d) => (
          <button
            key={d.id}
            onClick={() => setDrawer(d)}
            className="flex min-h-[44px] items-center justify-between rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            <span className="truncate pr-2">{d.title}</span>
            <div className="flex shrink-0 gap-2">
              {d.status === "failed" && <Badge>Failed</Badge>}
              <Badge>{SOURCE_TYPE_LABELS[d.source_type]}</Badge>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No documents yet.</p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
        <span className="text-sm font-semibold text-stone-500">Test search</span>
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Try a question an athlete might ask..."
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || !searchQuery.trim()}
            className="min-h-[44px] rounded-xl border border-stone-300 px-4 text-sm font-medium disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>
        {searchResults && (
          <div className="flex flex-col gap-2">
            {searchResults.length === 0 && (
              <p className="text-sm text-stone-500">No results.</p>
            )}
            {searchResults.map((r, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-xl bg-stone-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge>{SOURCE_TYPE_LABELS[r.source_type]}</Badge>
                </div>
                {r.content && <p className="text-sm text-stone-600">{r.content}</p>}
                {r.image_url && (
                  <img src={r.image_url} alt="" className="max-h-32 rounded-lg object-cover" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer open={drawer === "create"} onClose={() => setDrawer("closed")} title="Add document">
        {drawer === "create" && (
          <CreateDocumentForm
            onCreated={(doc) => {
              setDocuments((prev) => (prev ? [doc, ...prev] : [doc]));
              setDrawer("closed");
            }}
            onError={showToast}
          />
        )}
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.title ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Badge>{SOURCE_TYPE_LABELS[editing.source_type]}</Badge>
              {editing.status === "failed" && <Badge>Failed</Badge>}
            </div>
            {editing.status === "failed" && editing.error_message && (
              <p className="text-sm text-red-700">{editing.error_message}</p>
            )}
            {editing.source_url && (
              <a
                href={editing.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-red-600 underline"
              >
                Open source
              </a>
            )}
            <p className="text-xs text-stone-500">
              {editing.chunk_count} chunk{editing.chunk_count === 1 ? "" : "s"}
            </p>
            {editing.raw_text && (
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                {editing.raw_text.slice(0, 2000)}
              </p>
            )}
            <DeleteButton onClick={() => deleteDocument(editing.id)} itemLabel={editing.title} />
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast} />}
    </div>
  );
}
