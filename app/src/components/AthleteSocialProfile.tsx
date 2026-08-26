import { useEffect, useRef, useState } from "react";
import { useApi } from "../hooks/useApi";
import { usePhotoPalette } from "../lib/colorPalette";
import { renderFormattedText } from "../utils/formatText";
import {
  Avatar,
  BeltSwatch,
  DeleteButton,
  Drawer,
  MediaField,
  Spinner,
  Toast,
  isVideoUrl,
  uploadFile,
} from "./ui";

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

export type ShareKind = "event" | "event_item" | "grading" | "competition_result" | "kata";

export interface Post {
  id: number;
  athlete_id: number;
  title: string | null;
  body: string | null;
  image_url: string | null;
  voice_note_url: string | null;
  share_kind: ShareKind | null;
  created_at: string;
  share_event_id: number | null;
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
  share_kata_id: number | null;
  share_kata_name: string | null;
  share_kata_style: string | null;
  share_kata_wkf_number: number | null;
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

export function ShareBadge({ post }: { post: Post }) {
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
  if (post.share_kind === "kata") {
    if (!post.share_kata_name) return null;
    return (
      <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm">
        <span className="font-medium text-stone-700">🥋 {post.share_kata_name}</span>
        {post.share_kata_style && (
          <span className="text-stone-500">{post.share_kata_style}</span>
        )}
        {post.share_kata_wkf_number != null && (
          <span className="text-stone-500">WKF #{post.share_kata_wkf_number}</span>
        )}
      </div>
    );
  }
  if (post.share_kind === "competition_result") {
    if (!post.share_competition_name) return null;
    return (
      <div className="flex flex-col gap-0.5 text-sm">
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

export function PostCard({
  post,
  profile,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  accentColor,
}: {
  post: Post;
  profile: SocialProfile;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (post: Post) => void;
  onDelete: (id: number) => void;
  accentColor: string;
}) {
  return (
    <div
      className="relative flex flex-col gap-2 border-b bg-white p-4"
      style={{ borderBottomColor: `${accentColor}40` }}
    >
      {(canEdit || canDelete) && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(post)}
              aria-label="Edit post"
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500"
            >
              ✏️
            </button>
          )}
          {canDelete && (
            <DeleteButton
              onClick={() => onDelete(post.id)}
              itemLabel="this post"
              iconOnly
            />
          )}
        </div>
      )}
      <div className="relative isolate -mx-4 -mt-4 flex items-center gap-2 px-4 pb-2 pt-2">
        {/* A cut-out tab behind the author/date, echoing the diagonal
            accent shapes used elsewhere (cover photo edge, nav wedge) -
            tapers off well before the edit/delete icons' corner so it
            never runs under them. `isolate` gives this row its own
            stacking context so the `-z-10` shape stays scoped here
            instead of sinking behind unrelated page content (the parent
            `relative` alone doesn't create one). Padding matches the
            edit/delete icons' own top-2 offset so the smaller avatar
            here lines up with that 32px icon row instead of sitting
            noticeably lower. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-stone-100"
          style={{ clipPath: "polygon(0 0, 78% 0, 65% 100%, 0 100%)" }}
        />
        <Avatar
          name={`${profile.first_name} ${profile.last_name}`}
          url={profile.photo_url}
          size={24}
        />
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium">
            {profile.first_name} {profile.last_name}
          </span>
          <span className="text-xs text-stone-500">
            {new Date(post.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      {post.title && (
        <h3
          className="font-display text-lg uppercase tracking-wide"
          style={{ color: accentColor }}
        >
          {post.title}
        </h3>
      )}
      {post.body && (
        <p className="whitespace-pre-wrap text-sm">{renderFormattedText(post.body)}</p>
      )}
      {post.image_url && (
        isVideoUrl(post.image_url) ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={post.image_url} controls className="max-h-80 w-full object-cover" />
        ) : (
          <img src={post.image_url} alt="" className="max-h-80 w-full object-cover" />
        )
      )}
      {post.voice_note_url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={post.voice_note_url} controls className="w-full" />
      )}
      <ShareBadge post={post} />
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

// Hand-rolled, minimal shape for the parts of the Web Speech API this
// actually uses - TypeScript's bundled lib.dom.d.ts ships the supporting
// SpeechRecognitionResult/ResultList/Alternative types but not
// SpeechRecognition itself or its event (it's a non-standard, vendor-
// prefixed API on most browsers), so there's nothing built-in to extend.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; [alt: number]: { transcript: string } };
  };
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function voiceNoteExtension(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

// Records a voice note (MediaRecorder) while simultaneously live-
// transcribing speech into the composer's note body via the browser's own
// Speech Recognition, when available - no third-party transcription API
// or key. The recorded clip itself is uploaded and kept only for
// playback; the transcription lands straight in `body` (the same field a
// typed note uses) rather than a second, separate structured field.
// Feature-detected on both fronts: recording alone (no live transcript)
// still works wherever MediaRecorder exists but Speech Recognition
// doesn't (notably Safari/iOS), and the whole control hides itself where
// MediaRecorder itself is unavailable.
function VoiceNoteRecorder({
  value,
  onChange,
  onTranscript,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const supportsRecording = typeof MediaRecorder !== "undefined";

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);

      const RecognitionCtor = getSpeechRecognitionCtor();
      if (RecognitionCtor) {
        const recognition = new RecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) text += event.results[i][0].transcript;
          }
          if (text.trim()) onTranscript(text.trim());
        };
        // Transcription is a bonus, not required - a failure (offline,
        // unsupported locale, a permission race) just leaves the
        // recording itself running without live-filled text.
        recognition.onerror = () => {};
        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }
    } catch {
      onError("Couldn't access the microphone");
    }
  }

  async function stop() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);

    setUploading(true);
    try {
      const file = new File([blob], `voice-note.${voiceNoteExtension(blob.type)}`, {
        type: blob.type,
      });
      onChange(await uploadFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to upload voice note");
    } finally {
      setUploading(false);
    }
  }

  if (!supportsRecording) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-stone-700">Voice note</span>
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={value} controls className="h-9 flex-1" />
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove voice note"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
          >
            🗑
          </button>
        </div>
      ) : recording ? (
        <button
          type="button"
          onClick={stop}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 font-medium text-red-700"
        >
          ⏹ Stop recording
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={uploading}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-stone-300 font-medium text-stone-600 disabled:opacity-50"
        >
          {uploading ? <Spinner /> : "🎙 Record voice note"}
        </button>
      )}
    </div>
  );
}

export function Composer({
  athleteId,
  post,
  fixedShare,
  onSaved,
  showToast,
}: {
  athleteId: number;
  post?: Post;
  // When set, the post is always logged against this one share target
  // (e.g. a kata, from the Kata tracker page) rather than letting the
  // athlete pick one via "Share from schedule" - that button and the
  // share row's remove (✕) affordance are both hidden, since there's
  // nothing to change.
  fixedShare?: { kind: ShareKind; id: number; label: string };
  onSaved: (post: Post) => void;
  showToast: (message: string) => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [imageUrl, setImageUrl] = useState(post?.image_url ?? "");
  const [voiceNoteUrl, setVoiceNoteUrl] = useState(post?.voice_note_url ?? "");
  const [share, setShare] = useState<{ kind: ShareKind; id: number; label: string } | null>(
    fixedShare ?? null
  );
  const [picking, setPicking] = useState(false);
  const [shareable, setShareable] = useState<Shareable | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function openPicker() {
    setPicking(true);
    if (!shareable) {
      api
        .get<Shareable>(`/athletes/${athleteId}/shareable`)
        .then(setShareable)
        .catch(() => setShareable({ events: [], items: [], gradings: [], competitionResults: [] }));
    }
  }

  // Minimal formatting toolbar: wraps the current textarea selection in
  // **/* markers (rendered back into <strong>/<em> in the feed) rather
  // than pulling in a rich-text editor dependency.
  function wrapSelection(marker: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const selected = body.slice(start, end);
    const next = `${body.slice(0, start)}${marker}${selected}${marker}${body.slice(end)}`;
    setBody(next);
    const cursor = selected ? end + marker.length * 2 : start + marker.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function submit() {
    if (!title.trim() && !body.trim() && !imageUrl && !voiceNoteUrl && !share) return;
    setSubmitting(true);
    try {
      if (post) {
        const { post: updated } = await api.patch<{ post: Post }>(
          `/athletes/${athleteId}/posts/${post.id}`,
          {
            title: title.trim() || null,
            body: body.trim() || null,
            image_url: imageUrl || null,
            voice_note_url: voiceNoteUrl || null,
          }
        );
        onSaved(updated);
      } else {
        const { post: created } = await api.post<{ post: Post }>(
          `/athletes/${athleteId}/posts`,
          {
            title: title.trim() || undefined,
            body: body.trim() || undefined,
            image_url: imageUrl || undefined,
            voice_note_url: voiceNoteUrl || undefined,
            share_kind: share?.kind,
            share_id: share?.id,
          }
        );
        onSaved(created);
        setTitle("");
        setBody("");
        setImageUrl("");
        setVoiceNoteUrl("");
        setShare(null);
      }
    } catch {
      showToast(post ? "Failed to save post" : "Failed to post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => wrapSelection("**")}
          aria-label="Bold"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 font-bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("*")}
          aria-label="Italic"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 italic"
        >
          I
        </button>
      </div>
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind?"
        className="min-h-[100px] rounded-xl border border-stone-300 px-3 py-2"
        autoFocus
      />
      <MediaField
        label="Photo or video"
        kind="image"
        allowVideo
        value={imageUrl}
        onChange={setImageUrl}
        onError={showToast}
      />
      <VoiceNoteRecorder
        value={voiceNoteUrl}
        onChange={setVoiceNoteUrl}
        onTranscript={(text) => setBody((prev) => (prev.trim() ? `${prev} ${text}` : text))}
        onError={showToast}
      />
      {share && (
        <div className="flex items-center justify-between rounded-xl bg-stone-100 px-3 py-2 text-sm">
          <span>{share.label}</span>
          {!fixedShare && (
            <button
              type="button"
              onClick={() => setShare(null)}
              className="text-stone-500"
            >
              ✕
            </button>
          )}
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
        {!post && !fixedShare && (
          <button
            type="button"
            onClick={openPicker}
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 text-sm font-medium text-stone-600"
          >
            Share from schedule
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={
            submitting ||
            (!title.trim() && !body.trim() && !imageUrl && !voiceNoteUrl && !share)
          }
          className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
        >
          {post ? "Save" : "Post"}
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
  accentColor,
}: {
  athleteId: number;
  profile: SocialProfile;
  canPost: boolean;
  canModerate: boolean;
  showToast: (message: string) => void;
  accentColor: string;
}) {
  const api = useApi();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

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
        <div className="-mx-4 flex flex-col">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              profile={profile}
              canEdit={canPost}
              canDelete={canPost || canModerate}
              onEdit={setEditingPost}
              onDelete={remove}
              accentColor={accentColor}
            />
          ))}
        </div>
      )}

      {canPost && (
        <>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            aria-label="New post"
            className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-3xl leading-none text-white shadow-lg"
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
              onSaved={(post) => {
                setPosts((prev) => (prev ? [post, ...prev] : [post]));
                setComposerOpen(false);
              }}
              showToast={showToast}
            />
          </Drawer>
          <Drawer
            open={editingPost !== null}
            onClose={() => setEditingPost(null)}
            title="Edit post"
          >
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
        </>
      )}
    </div>
  );
}

// The athlete's social profile: a full-bleed cover photo (self-editable,
// falls back to their initials avatar) with name (header font, matching
// the app's Oswald-based heading convention) and belt overlaid, a
// diagonal bottom edge, a bio, and a Facebook-style feed they can post
// freeform notes/photos to or share their own training/competition/
// grading history into via a floating "+" button that opens the composer
// in a Drawer. For isSelf, everything defaults to a read-only view
// (matching the rest of the app's read-only-until-edit convention) - a
// pencil icon overlaid on the cover photo's top-right corner (the
// "editing" prop, controlled by the parent so it can gate its own
// editable sections too, e.g. Profile.tsx's Account form) toggles into
// the editable cover-photo/bio form, and a public/private icon right next
// to it (🌐/🔒, icon-only, no label) directly toggles is_public_profile
// regardless of editing state - it's a one-tap action, not a field to
// edit. A non-self viewer (only reachable at all if the profile is
// public, per the backend's canViewSocialProfile gate) always gets the
// read-only header + feed, no icons. Each post in the feed is edge-to-
// edge (no side margins/rounding, just a bottom divider) with an
// edit/delete icon pair in its own top-right corner (self-only; delete
// reuses the shared DeleteButton's confirm-modal in its iconOnly form
// rather than a bespoke second confirmation mechanism) - edit reopens the
// same composer used to create posts, now supporting an optional title
// and a minimal Bold/Italic toolbar that wraps the textarea selection in
// safe **/* markers rendered back into <strong>/<em> (never raw HTML).
// The cover photo's bottom edge - two flat "levels" (a taller left plateau,
// a shorter right plateau) joined by one short diagonal, rather than a
// single corner-to-corner diagonal. COVER_HEIGHT_PX must match the h-64
// (256px) applied to the cover photo box below, since the accent line's
// SVG viewBox uses it to keep the y-axis unscaled (only x stretches to
// the box's width) so the stroke width renders at its literal pixel size.
const COVER_HEIGHT_PX = 256;
const COVER_RIGHT_Y = COVER_HEIGHT_PX * 0.8;
const COVER_CLIP_PATH = `polygon(0 0, 100% 0, 100% 80%, 58% 80%, 42% 100%, 0 100%)`;
const COVER_EDGE_POINTS = `100,${COVER_RIGHT_Y} 58,${COVER_RIGHT_Y} 42,${COVER_HEIGHT_PX} 0,${COVER_HEIGHT_PX}`;

export function AthleteSocialProfile({
  athleteId,
  isSelf,
  editing = false,
  onToggleEdit,
}: {
  athleteId: number;
  isSelf: boolean;
  editing?: boolean;
  onToggleEdit?: () => void;
}) {
  const api = useApi();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const palette = usePhotoPalette(profile?.photo_url);

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

  const accentColor = palette?.accentText ?? "#dc2626";

  return (
    <div className="flex flex-col">
      <div className="relative h-64 w-full">
        <div
          className="absolute inset-0 flex flex-col justify-end bg-stone-800 bg-cover bg-center"
          style={{
            ...(profile.photo_url ? { backgroundImage: `url(${profile.photo_url})` } : {}),
            clipPath: COVER_CLIP_PATH,
          }}
        >
          {!profile.photo_url && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Avatar
                name={`${profile.first_name} ${profile.last_name}`}
                size={96}
              />
            </div>
          )}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
            style={
              palette
                ? {
                    background: `linear-gradient(to top, ${palette.primaryDark}f2 0%, ${palette.primaryDark}59 55%, transparent 100%)`,
                  }
                : undefined
            }
          />
          {isSelf && (
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePublic(!profile.is_public_profile)}
                aria-label={
                  profile.is_public_profile
                    ? "Make profile private"
                    : "Make profile public"
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-lg text-white backdrop-blur"
              >
                {profile.is_public_profile ? "🌐" : "🔒"}
              </button>
              <button
                type="button"
                onClick={onToggleEdit}
                aria-label={editing ? "Done editing" : "Edit profile"}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-lg text-white backdrop-blur"
              >
                {editing ? "✓" : "✏️"}
              </button>
            </div>
          )}
          <div
            className="relative flex max-w-[75%] flex-col gap-1 p-4 text-white"
            style={palette ? { color: palette.textOnPrimaryDark } : undefined}
          >
            <span className="font-display text-2xl uppercase tracking-wide [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
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
        {/* Traces the same two-level step the clip-path above cuts into the
            photo, unclipped itself so the stroke isn't cut off mid-line -
            colored from the photo's own palette so it reads as an accent
            of the image rather than a fixed brand color. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 100 ${COVER_HEIGHT_PX}`}
          preserveAspectRatio="none"
        >
          <polyline
            points={COVER_EDGE_POINTS}
            fill="none"
            stroke={accentColor}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-3 bg-stone-100 p-4">
        {isSelf && editing && (
          <MediaField
            label="Cover photo"
            kind="image"
            value={profile.photo_url ?? ""}
            onChange={updatePhoto}
            onError={showToast}
          />
        )}
        {isSelf && editing ? (
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
        ) : (
          <p
            className="text-sm text-stone-700"
            style={palette ? { color: palette.accentText } : undefined}
          >
            {profile.bio ||
              (isSelf ? "No bio yet. Tap ✏️ to add one." : null)}
          </p>
        )}
        <PostsFeed
          athleteId={athleteId}
          profile={profile}
          canPost={isSelf}
          canModerate={false}
          showToast={showToast}
          accentColor={accentColor}
        />
      </div>
      {toast && <Toast message={toast} />}
    </div>
  );
}
