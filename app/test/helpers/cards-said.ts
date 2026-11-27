// De quoi poser sur la fiche d'un ticket l'histoire, la rétro et la discussion que la vue sait dire, sans lire
// GitHub : la fiche reçoit des `Histoire` et des `Discussion` déjà dites (story.ts, discussion.ts) ; les essais
// et les captures d'écran les composent ici, de faits écrits à la main.
import type { Discussion, MessageSays } from "../../src/discussion.ts";
import { duration } from "../../src/facts.ts";
import { instant, NOT_COMMUNICATED, type StepSaid, type Story, type LessonSaid, type RetroSaid } from "../../src/story.ts";
import { linksOf, render } from "../../src/markdown.ts";

export type StepRaw = { kind: "arrived" | "taken" | "delivered" | "reviewed" | "judged" | "merged" | "served"; at: string; station?: string; verdict?: "green" | "red"; summary?: string; by?: string; run?: string };
export type RetroRaw = { at: string; text: string | null; lessons: { kind: "propose" | "reconfirm"; id: string; text: string }[] };
export type StoryRaw = { ticket?: number; steps: StepRaw[]; cost: { attempts: number; tokens: number | null; durationMs: number | null; incomplete: boolean }; retro?: RetroRaw | null };

const WORDINGS: Record<StepRaw["kind"], (step: StepRaw) => Omit<StepSaid, "at">> = {
  arrived: () => ({ libelle: "arrived" }),
  taken: ({ station }) => ({ libelle: station === undefined ? "taken" : `taken by ${station}` }),
  delivered: () => ({ libelle: "delivered" }),
  reviewed: ({ verdict, summary }) => ({ libelle: `reviewed: ${verdict}`, ton: verdict === "green" ? "vert" : "rouge", ...(summary ? { detail: summary } : {}) }),
  judged: ({ verdict }) => ({ libelle: `judged: ${verdict}`, ton: verdict === "green" ? "vert" : "rouge" }),
  merged: ({ by }) => ({ libelle: by === "outside" ? "merged (outside the pass)" : "merged" }),
  served: () => ({ libelle: "served without a merge" }),
};

const retroSaid = (retro: RetroRaw | null | undefined): RetroSaid => {
  if (retro === undefined) return { sans: "retro not communicated: this station does not give it yet" };
  if (retro === null) return { aucune: "no retro for this ticket yet" };
  const lessons = retro.lessons.slice(0, 3).map(({ kind, id, text }): LessonSaid => ({ id, texte: text, reconfirmee: kind === "reconfirm" }));
  return { at: instant(retro.at), texte: retro.text === "" ? null : retro.text, lecons: lessons };
};

// L'histoire d'un ticket servi, dite ; `retro` absente : la fiche ne dit rien de sa rétro.
export function storyOf(raw: StoryRaw): Story {
  const { attempts, tokens, durationMs, incomplete } = raw.cost;
  return {
    etapes: raw.steps.map((step) => ({ ...WORDINGS[step.kind](step), at: instant(step.at) })),
    cout: { tokens: tokens === null ? NOT_COMMUNICATED : String(tokens), duree: durationMs === null ? NOT_COMMUNICATED : duration(durationMs), essais: String(attempts), minimum: incomplete },
    retro: retroSaid(raw.retro),
  };
}

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
  return { titre: issue.title, ouverte: issue.state !== "closed", messages, liens: [...new Set(messages.flatMap(({ blocs: blocks }) => linksOf(blocks)))] };
}
