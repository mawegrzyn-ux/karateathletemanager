import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import { Avatar, BeltSwatch, DeleteButton, Drawer, MediaField, Spinner, Toast } from "./ui";

export interface SocialProfile {
  id: number;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  bio: string | null;
  is_public_profile: boolean;
  grade_name: string | null;
  belt_color: string | null;
}

type ShareKind = "event" | "event_item" | "grading" | "competition_result";

export interface Post {
  id: number;
  athlete_id: number;
  body: string | null;
  image_url: string | null;
  share_kind: ShareKind | null;
  created_at: string;
  share_event_title: string | null;
  share_event_date: string | null;
  share_item_title: string | null;
  share_item_date: string | null;
  share_grade_name: string | null;
  share_grade_color: string | null;
  share_graded_at: string | null;
  share_passed: boolean | null;
  share_competition_name: string | null;
  share_competition_date: string | null;
  share_final_position: string | null;
  share_rounds_completed: number | null;
}

interface Shareable {
  events: { id: number; title: string; start_date: string }[];
  items: { id: number; title: string; item_date: string }[];
  gradings: { id: number; graded_at: string; grade_name: string }[];
  competitionResults: {
    id: number;
    competition_name: string;
    competition_date: string;
  }[];
}

function ShareBadge({ post }: { post: Post }) {
  if (post.share_kind === "event" || post.share_kind === "event_item") {
    const title =
      post.share_kind === "event" ? post.share_event_title : post.share_item_title;
    const date =
      post.share_kind === "event" ? post.share_event_date : post.share_item_date;
    if (!title) return null;
    return (
      <div className="flex items-center justify-between rounded-xl bg-stone-100 px-3 py-2 text-sm">
        <span className="font-medium text-stone-700">🗓️ {title}</span>
        {date && <span className="text-stone-500">{date.slice(0, 10)}</span>}
      </div>
    );
  }
  if (post.share_kind === "grading") {
    if (!post.share_grade_name) return null;
    return (
      <div className="flex items-center justify-between rounded-xl bg-stone-100 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-stone-700">
          {post.share_grade_color && <BeltSwatch color={post.share_grade_color} />}
          🥋 {post.share_grade_name}
          {post.share_passed === false && " (not passed)"}
        </span>
        {post.share_graded_at && (
          <span className="text-stone-500">{post.share_graded_at.slice(0, 10)}</span>
        )}
      </div>
    );
  }
  if (post.share_kind === "competition_result") {
    if (!post.share_competition_name) return null;
    return (
      <div className="flex flex-col gap-0.5 rounded-xl bg-stone-100 px-3 py-2 text-sm">
        <span className="flex items-center justify-between">
          <span className="font-medium text-stone-700">
            🏆 {post.share_competition_name}
          </span>
          {post.share_competition_date && (
            <span className="text-stone-500">
              {post.share_competition_date.slice(0, 10)}
            </span>
          )}
        </span>
        {(post.share_final_position || post.share_rounds_completed != null) && (
          <span className="text-xs text-stone-500">
            {post.share_final_position}
            {post.share_final_position && post.share_rounds_completed != null && " · "}
            {post.share_rounds_completed != null &&
              `${post.share_rounds_completed} rounds`}
          </span>
        )}
      </div>
    );
  }
  return null;
}

function PostCard({
  post,
  profile,
  canDelete,
  onDelete,
}: {
  post: Post;
  profile: SocialProfile;
  canDelete: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <Avatar
          name={`${profile.first_name} ${profile.last_name}`}
          url={profile.photo_url}
          size={32}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {profile.first_name} {profile.last_name}
          </span>
          <span className="text-xs text-stone-500">
            {new Date(post.created_at).toLocaleString()}
          </span>
        </div>
      </div>
      {post.body && <p className="whitespace-pre-wrap text-sm">{post.body}</p>}
      {post.image_url && (
        <img
          src={post.image_url}
          alt=""
          className="max-h-80 w-full rounded-xl object-cover"
        />
      )}
      <ShareBadge post={post} />
      {canDelete && (
        <DeleteButton onClick={() => onDelete(post.id)} itemLabel="this post" />
      )}
    </div>
  );
}

function ShareFromSchedulePicker({
  shareable,
  onPick,
}: {
  shareable: Shareable;
  onPick: (kind: ShareKind, id: number, label: string) => void;
}) {
  return (
    <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-xl bg-stone-50 p-2">
      {shareable.competitionResults.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600">
            Competition results
          </span>
          {shareable.competitionResults.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() =>
                onPick(
                  "competition_result",
                  r.id,
                  `🏆 ${r.competition_name} (${r.competition_date.slice(0, 10)})`
                )
              }
              className="flex min-h-[40px] items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-left text-sm"
            >
              <span>{r.competition_name}</span>
              <span className="text-stone-500">
                {r.competition_date.slice(0, 10)}
              </span>
            </button>
          ))}
        </div>
      )}
      {shareable.gradings.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600">Gradings</span>
          {shareable.gradings.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() =>
                onPick("grading", g.id, `🥋 ${g.grade_name} (${g.graded_at.slice(0, 10)})`)
              }
              className="flex min-h-[40px] items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-left text-sm"
            >
              <span>{g.grade_name}</span>
              <span className="text-stone-500">{g.graded_at.slice(0, 10)}</span>
            </button>
          ))}
        </div>
      )}
      {shareable.items.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600">
            Schedule items
          </span>
          {shareable.items.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() =>
                onPick("event_item", i.id, `🗓️ ${i.title} (${i.item_date.slice(0, 10)})`)
              }
              className="flex min-h-[40px] items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-left text-sm"
            >
              <span>{i.title}</span>
              <span className="text-stone-500">{i.item_date.slice(0, 10)}</span>
            </button>
          ))}
        </div>
      )}
      {shareable.events.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600">Events</span>
          {shareable.events.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() =>
                onPick("event", e.id, `🗓️ ${e.title} (${e.start_date.slice(0, 10)})`)
              }
              className="flex min-h-[40px] items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-left text-sm"
            >
              <span>{e.title}</span>
              <span className="text-stone-500">{e.start_date.slice(0, 10)}</span>
            </button>
          ))}
        </div>
      )}
      {shareable.events.length === 0 &&
        shareable.items.length === 0 &&
        shareable.gradings.length === 0 &&
        shareable.competitionResults.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">
            Nothing to share yet.
          </p>
        )}
    </div>
  );
}

function Composer({
  athleteId,
  onPosted,
  showToast,
}: {
  athleteId: number;
  onPosted: (post: Post) => void;
  showToast: (message: string) => void;
}) {
  const api = useApi();
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [share, setShare] = useState<{ kind: ShareKind; id: number; label: string } | null>(
    null
  );
  const [picking, setPicking] = useState(false);
  const [shareable, setShareable] = useState<Shareable | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openPicker() {
    setPicking(true);
    if (!shareable) {
      api
        .get<Shareable>(`/athletes/${athleteId}/shareable`)
        .then(setShareable)
        .catch(() => setShareable({ events: [], items: [], gradings: [], competitionResults: [] }));
    }
  }

  async function submit() {
    if (!body.trim() && !imageUrl && !share) return;
    setSubmitting(true);
    try {
      const { post } = await api.post<{ post: Post }>(`/athletes/${athleteId}/posts`, {
        body: body.trim() || undefined,
        image_url: imageUrl || undefined,
        share_kind: share?.kind,
        share_id: share?.id,
      });
      onPosted(post);
      setBody("");
      setImageUrl("");
      setShare(null);
    } catch {
      showToast("Failed to post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind?"
        className="min-h-[100px] rounded-xl border border-stone-300 px-3 py-2"
        autoFocus
      />
      <MediaField
        label="Photo"
        kind="image"
        value={imageUrl}
        onChange={setImageUrl}
        onError={showToast}
      />
      {share && (
        <div className="flex items-center justify-between rounded-xl bg-stone-100 px-3 py-2 text-sm">
          <span>{share.label}</span>
          <button
            type="button"
            onClick={() => setShare(null)}
            className="text-stone-500"
          >
            ✕
          </button>
        </div>
      )}
      {picking && (
        <ShareFromSchedulePicker
          shareable={
            shareable ?? { events: [], items: [], gradings: [], competitionResults: [] }
          }
          onPick={(kind, id, label) => {
            setShare({ kind, id, label });
            setPicking(false);
          }}
        />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={openPicker}
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 text-sm font-medium text-stone-600"
        >
          Share from schedule
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || (!body.trim() && !imageUrl && !share)}
          className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </div>
  );
}

function PostsFeed({
  athleteId,
  profile,
  canPost,
  canModerate,
  showToast,
}: {
  athleteId: number;
  profile: SocialProfile;
  canPost: boolean;
  canModerate: boolean;
  showToast: (message: string) => void;
}) {
  const api = useApi();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    setPosts(null);
    api
      .get<{ posts: Post[] }>(`/athletes/${athleteId}/posts`)
      .then((res) => setPosts(res.posts))
      .catch(() => setPosts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function remove(id: number) {
    await api.del(`/athletes/${athleteId}/posts/${id}`);
    setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
  }

  return (
    <div className="flex flex-col gap-3">
      {posts === null ? (
        <Spinner />
      ) : posts.length === 0 ? (
        <p className="px-1 py-2 text-sm text-stone-500">No posts yet.</p>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            profile={profile}
            canDelete={canPost || canModerate}
            onDelete={remove}
          />
        ))
      )}

      {canPost && (
        <>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            aria-label="New post"
            className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-3xl leading-none text-white shadow-lg"
          >
            +
          </button>
          <Drawer
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            title="New post"
          >
            <Composer
              athleteId={athleteId}
              onPosted={(post) => {
                setPosts((prev) => (prev ? [post, ...prev] : [post]));
                setComposerOpen(false);
              }}
              showToast={showToast}
            />
          </Drawer>
        </>
      )}
    </div>
  );
}

// The athlete's social profile: a full-bleed cover photo (self-editable,
// falls back to their initials avatar) with name/belt overlaid, a bio, a
// self-controlled "make my profile public" toggle (no coach/admin approval
// needed), and a Facebook-style feed they can post freeform notes/photos to
// or share their own training/competition/grading history into via a
// floating "+" button that opens the composer in a Drawer. isSelf renders
// the editable cover-photo/bio/toggle/composer; a non-self viewer (only
// reachable at all if the profile is public, per the backend's
// canViewSocialProfile gate) gets a read-only header + feed.
export function AthleteSocialProfile({
  athleteId,
  isSelf,
}: {
  athleteId: number;
  isSelf: boolean;
}) {
  const api = useApi();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    setProfile(null);
    setError(null);
    api
      .get<{ athlete: SocialProfile }>(`/athletes/${athleteId}/social-profile`)
      .then((res) => {
        setProfile(res.athlete);
        setBio(res.athlete.bio ?? "");
      })
      .catch(() => setError("This profile is private."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function saveBio() {
    if (bio === (profile?.bio ?? "")) return;
    const { athlete } = await api.patch<{ athlete: { bio: string } }>(
      `/athletes/${athleteId}/social-profile`,
      { bio }
    );
    setProfile((prev) => (prev ? { ...prev, bio: athlete.bio } : prev));
  }

  async function togglePublic(isPublic: boolean) {
    const { athlete } = await api.patch<{ athlete: { is_public_profile: boolean } }>(
      `/athletes/${athleteId}/social-profile`,
      { is_public_profile: isPublic }
    );
    setProfile((prev) =>
      prev ? { ...prev, is_public_profile: athlete.is_public_profile } : prev
    );
  }

  async function updatePhoto(photoUrl: string) {
    const { athlete } = await api.patch<{ athlete: { photo_url: string | null } }>(
      `/athletes/${athleteId}/social-profile`,
      { photo_url: photoUrl || null }
    );
    setProfile((prev) => (prev ? { ...prev, photo_url: athlete.photo_url } : prev));
  }

  if (error) return <p className="p-6 text-sm text-stone-500">{error}</p>;
  if (!profile)
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col">
      <div
        className="relative flex h-56 w-full flex-col justify-end bg-stone-800 bg-cover bg-center"
        style={
          profile.photo_url ? { backgroundImage: `url(${profile.photo_url})` } : undefined
        }
      >
        {!profile.photo_url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar
              name={`${profile.first_name} ${profile.last_name}`}
              size={96}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="relative flex flex-col gap-1 p-4 text-white">
          <span className="text-2xl font-bold tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            {profile.first_name} {profile.last_name}
          </span>
          {profile.grade_name && (
            <span className="flex items-center gap-1 text-sm [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
              {profile.belt_color && <BeltSwatch color={profile.belt_color} />}
              {profile.grade_name}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {isSelf ? (
          <>
            <MediaField
              label="Cover photo"
              kind="image"
              value={profile.photo_url ?? ""}
              onChange={updatePhoto}
              onError={showToast}
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-stone-700">Bio</span>
              <textarea
                key={profile.bio ?? ""}
                defaultValue={bio}
                onChange={(e) => setBio(e.target.value)}
                onBlur={saveBio}
                placeholder="Tell people about yourself..."
                className="min-h-[80px] rounded-xl border border-stone-300 px-3 py-2"
              />
            </label>
            <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-stone-50 px-3">
              <span className="text-sm font-medium text-stone-700">
                Make my profile public
              </span>
              <input
                type="checkbox"
                checked={profile.is_public_profile}
                onChange={(e) => togglePublic(e.target.checked)}
                className="h-5 w-5"
              />
            </label>
            <p className="text-xs text-stone-500">
              {profile.is_public_profile
                ? "Any signed-in user of the app can view your profile and posts."
                : "Only you, your coaches, and admins can see your profile and posts."}
            </p>
          </>
        ) : (
          profile.bio && <p className="text-sm text-stone-700">{profile.bio}</p>
        )}
        <PostsFeed
          athleteId={athleteId}
          profile={profile}
          canPost={isSelf}
          canModerate={false}
          showToast={showToast}
        />
      </div>
      {toast && <Toast message={toast} />}
    </div>
  );
}
