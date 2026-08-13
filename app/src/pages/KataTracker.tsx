import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { Spinner, Drawer, AddButton, Badge, Toast } from "../components/ui";
import { Composer, PostCard, type Post, type SocialProfile } from "../components/AthleteSocialProfile";

interface Kata {
  id: number;
  name: string;
  style: string | null;
  wkf_number: number | null;
}

interface KataLogEvent {
  id: number;
  title: string;
  start_date: string;
  notes: string | null;
}

interface KataLogItem {
  id: number;
  event_id: number;
  title: string;
  item_date: string;
  notes: string | null;
}

// Search box + result list, same shape as the app's other single-select
// pickers (Schedule.tsx's SingleSelectPicker, admin/Clubs.tsx's
// AssociationPicker) - but this one also lets the athlete add a kata
// that's missing from the catalog, since the point of this page is
// logging a performance, not just browsing the reference list.
function KataPicker({
  katas,
  onPick,
  onCreate,
}: {
  katas: Kata[];
  onPick: (kata: Kata) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const q = query.trim().toLowerCase();
  const results = katas.filter((k) => k.name.toLowerCase().includes(q));
  const exactMatch = katas.some((k) => k.name.toLowerCase() === q);

  async function handleCreate() {
    setCreating(true);
    try {
      await onCreate(query.trim());
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Kata tracker</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search katas..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        autoFocus
      />
      <div className="flex flex-col gap-2">
        {results.map((k) => (
          <button
            key={k.id}
            onClick={() => onPick(k)}
            className="flex min-h-[44px] items-center justify-between rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            <span>
              {k.name}
              {k.style && (
                <span className="ml-2 text-xs font-normal text-stone-500">
                  {k.style}
                </span>
              )}
            </span>
            {k.wkf_number != null && <Badge>WKF #{k.wkf_number}</Badge>}
          </button>
        ))}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No katas found.</p>
        )}
      </div>
      {query.trim() && !exactMatch && (
        <button
          type="button"
          disabled={creating}
          onClick={handleCreate}
          className="min-h-[44px] rounded-xl border border-dashed border-red-300 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          + Add "{query.trim()}" as a new kata
        </button>
      )}
    </div>
  );
}

// The athlete's per-kata tracking view: pick a kata (or add one missing
// from the catalog), then log performances against it - a photo/video
// plus the app's usual Bold/Italic "wysiwyg-lite" note (reusing the same
// Composer/PostCard the social profile feed uses, just scoped to one
// kata via share_kind: "kata" instead of the athlete's whole feed), and
// a read-only pull of anything already logged on the calendar as a
// kata_performance event/item against this same kata (Schedule.tsx).
export default function KataTracker() {
  const api = useApi();
  const { user } = useAuth();
  const athleteId = user?.role === "athlete" ? user.athlete_id : null;

  const [katas, setKatas] = useState<Kata[] | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [selected, setSelected] = useState<Kata | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [log, setLog] = useState<{ events: KataLogEvent[]; items: KataLogItem[] } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (!athleteId) return;
    api
      .get<{ katas: Kata[] }>("/katas")
      .then((res) => setKatas(res.katas))
      .catch(() => setKatas([]));
    api
      .get<{ athlete: SocialProfile }>(`/athletes/${athleteId}/social-profile`)
      .then((res) => setProfile(res.athlete))
      .catch(() => showToast("Failed to load your profile"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId || !selected) return;
    setPosts(null);
    setLog(null);
    api
      .get<{ posts: Post[] }>(`/athletes/${athleteId}/posts?kata_id=${selected.id}`)
      .then((res) => setPosts(res.posts))
      .catch(() => setPosts([]));
    api
      .get<{ events: KataLogEvent[]; items: KataLogItem[] }>(
        `/athletes/${athleteId}/kata-log?kata_id=${selected.id}`
      )
      .then(setLog)
      .catch(() => setLog({ events: [], items: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, selected]);

  async function createKata(name: string) {
    if (!name) return;
    try {
      const { kata } = await api.post<{ kata: Kata }>("/katas", { name });
      setKatas((prev) => (prev ? [...prev, kata] : [kata]));
      setSelected(kata);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add kata");
    }
  }

  async function removePost(id: number) {
    if (!athleteId) return;
    await api.del(`/athletes/${athleteId}/posts/${id}`);
    setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
  }

  if (!athleteId) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <h1 className="text-2xl font-bold tracking-tight">Kata tracker</h1>
        <p className="text-sm text-stone-500">
          Kata performances are logged against your own athlete profile.
          Switch to your athlete profile from the Profile tab to start
          tracking.
        </p>
      </div>
    );
  }

  if (!katas || !profile) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (!selected) {
    return <KataPicker katas={katas} onPick={setSelected} onCreate={createKata} />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="min-h-[44px] text-sm font-medium text-stone-500"
        >
          ‹ Katas
        </button>
        <AddButton onClick={() => setComposerOpen(true)} />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{selected.name}</h1>
        {(selected.style || selected.wkf_number != null) && (
          <div className="flex gap-2">
            {selected.style && <Badge>{selected.style}</Badge>}
            {selected.wkf_number != null && <Badge>WKF #{selected.wkf_number}</Badge>}
          </div>
        )}
      </div>

      {log && (log.events.length > 0 || log.items.length > 0) && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-stone-500">From your calendar</h2>
          <div className="flex flex-col gap-2">
            {log.events.map((e) => (
              <div key={`e-${e.id}`} className="rounded-xl bg-white px-4 py-3 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-xs text-stone-500">{e.start_date.slice(0, 10)}</span>
                </div>
                {e.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{e.notes}</p>
                )}
              </div>
            ))}
            {log.items.map((i) => (
              <div key={`i-${i.id}`} className="rounded-xl bg-white px-4 py-3 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{i.title}</span>
                  <span className="text-xs text-stone-500">{i.item_date.slice(0, 10)}</span>
                </div>
                {i.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{i.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-stone-500">Performance posts</h2>
        {posts === null ? (
          <Spinner />
        ) : posts.length === 0 ? (
          <p className="px-1 py-2 text-sm text-stone-500">
            No posts yet for this kata. Tap + to log one.
          </p>
        ) : (
          <div className="-mx-4 flex flex-col">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                profile={profile}
                canEdit
                canDelete
                onEdit={setEditingPost}
                onDelete={removePost}
                accentColor="#dc2626"
              />
            ))}
          </div>
        )}
      </div>

      <Drawer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={`New post · ${selected.name}`}
      >
        <Composer
          athleteId={athleteId}
          fixedShare={{ kind: "kata", id: selected.id, label: `🥋 ${selected.name}` }}
          onSaved={(post) => {
            setPosts((prev) => (prev ? [post, ...prev] : [post]));
            setComposerOpen(false);
          }}
          showToast={showToast}
        />
      </Drawer>
      <Drawer open={editingPost !== null} onClose={() => setEditingPost(null)} title="Edit post">
        {editingPost && (
          <Composer
            athleteId={athleteId}
            post={editingPost}
            onSaved={(updated) => {
              setPosts((prev) =>
                prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev
              );
              setEditingPost(null);
            }}
            showToast={showToast}
          />
        )}
      </Drawer>
      {toast && <Toast message={toast} />}
    </div>
  );
}
