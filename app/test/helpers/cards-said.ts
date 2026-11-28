// De quoi poser sur la fiche d'un ticket la discussion que la vue sait dire, sans lire
// GitHub : la fiche reçoit des `Histoire` et des `Discussion` déjà dites (story.ts, discussion.ts) ; les essais
// et les captures d'écran les composent ici, de faits écrits à la main.
import type { Discussion, MessageSays } from "../../src/discussion.ts";
import { render } from "../../src/markdown.ts";

const instant = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export type IssueRaw = { issue: { title: string; state: string; body: { author: string; at: string; body: string }; comments: { author: string; at: string; body: string }[] } };

const said = ({ author, at, body }: { author: string; at: string; body: string }, bodyText: boolean): MessageSays => ({
  auteur: author === "" ? "a deleted GitHub account" : author,
  at: instant(at),
  blocs: render(body),
  ...(bodyText ? { corps: true as const, source: body } : {}),
});

// L'issue d'un ticket et ses commentaires, dits : le corps d'abord, puis du plus ancien au plus récent.
export function discussionOf({ issue }: IssueRaw): Discussion {
  const messages = [said(issue.body, true), ...issue.comments.map((comment) => said(comment, false))];
  return { titre: issue.title, ouverte: issue.state !== "closed", messages };
}
