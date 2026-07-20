import type { ReactNode } from "react";

// Minimal, safe "WYSIWYG-lite" formatting shared by the post composer/feed
// (AthleteSocialProfile.tsx - **/* markers from its Bold/Italic toolbar) and
// Osu's chat window (Osu.tsx - Claude's replies routinely contain markdown
// bold/inline-code even though nothing in that UI ever prompts the user to
// type it) - turns **bold**, *italic*, and `code` back into real elements at
// render time, never raw HTML, so there's no injection risk from either a
// post body or a model response.
export function renderFormattedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key++}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-stone-100 px-1 py-0.5 text-[0.9em]">
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
