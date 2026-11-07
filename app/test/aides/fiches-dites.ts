// De quoi poser sur la fiche d'un ticket l'histoire, la rétro et la discussion que la vue sait dire, sans lire
// GitHub : la fiche reçoit des `Histoire` et des `Discussion` déjà dites (histoire.ts, discussion.ts) ; les essais
// et les captures d'écran les composent ici, de faits écrits à la main.
import type { Discussion, MessageDit } from "../../src/discussion.ts";
import { duree } from "../../src/faits.ts";
import { instant, NON_COMMUNIQUE, type EtapeDite, type Histoire, type LeconDite, type RetroDite } from "../../src/histoire.ts";
import { liensDe, rendre } from "../../src/markdown.ts";

export type EtapeBrute = { kind: "arrived" | "taken" | "delivered" | "reviewed" | "judged" | "merged" | "served"; at: string; station?: string; verdict?: "green" | "red"; summary?: string; by?: string; run?: string };
export type RetroBrute = { at: string; text: string | null; lessons: { kind: "propose" | "reconfirm"; id: string; text: string }[] };
export type HistoireBrute = { ticket?: number; steps: EtapeBrute[]; cost: { attempts: number; tokens: number | null; durationMs: number | null; incomplete: boolean }; retro?: RetroBrute | null };

const LIBELLES: Record<EtapeBrute["kind"], (etape: EtapeBrute) => Omit<EtapeDite, "at">> = {
  arrived: () => ({ libelle: "arrived" }),
  taken: ({ station }) => ({ libelle: station === undefined ? "taken" : `taken by ${station}` }),
  delivered: () => ({ libelle: "delivered" }),
  reviewed: ({ verdict, summary }) => ({ libelle: `reviewed: ${verdict}`, ton: verdict === "green" ? "vert" : "rouge", ...(summary ? { detail: summary } : {}) }),
  judged: ({ verdict }) => ({ libelle: `judged: ${verdict}`, ton: verdict === "green" ? "vert" : "rouge" }),
  merged: ({ by }) => ({ libelle: by === "outside" ? "merged (outside the pass)" : "merged" }),
  served: () => ({ libelle: "served without a merge" }),
};

const retroDite = (retro: RetroBrute | null | undefined): RetroDite => {
  if (retro === undefined) return { sans: "retro not communicated: this station does not give it yet" };
  if (retro === null) return { aucune: "no retro for this ticket yet" };
  const lecons = retro.lessons.slice(0, 3).map(({ kind, id, text }): LeconDite => ({ id, texte: text, reconfirmee: kind === "reconfirm" }));
  return { at: instant(retro.at), texte: retro.text === "" ? null : retro.text, lecons };
};

// L'histoire d'un ticket servi, dite ; `retro` absente : la fiche ne dit rien de sa rétro.
export function histoireDe(brute: HistoireBrute): Histoire {
  const { attempts, tokens, durationMs, incomplete } = brute.cost;
  return {
    etapes: brute.steps.map((etape) => ({ ...LIBELLES[etape.kind](etape), at: instant(etape.at) })),
    cout: { tokens: tokens === null ? NON_COMMUNIQUE : String(tokens), duree: durationMs === null ? NON_COMMUNIQUE : duree(durationMs), essais: String(attempts), minimum: incomplete },
    retro: retroDite(brute.retro),
  };
}

export type IssueBrute = { issue: { title: string; state: string; body: { author: string; at: string; body: string }; comments: { author: string; at: string; body: string }[] } };

const dit = ({ author, at, body }: { author: string; at: string; body: string }, corps: boolean): MessageDit => ({
  auteur: author === "" ? "a deleted GitHub account" : author,
  at: instant(at),
  blocs: rendre(body),
  ...(corps ? { corps: true as const } : {}),
});

// L'issue d'un ticket et ses commentaires, dits : le corps d'abord, puis du plus ancien au plus récent.
export function discussionDe({ issue }: IssueBrute): Discussion {
  const messages = [dit(issue.body, true), ...issue.comments.map((commentaire) => dit(commentaire, false))];
  return { titre: issue.title, ouverte: issue.state !== "closed", messages, liens: [...new Set(messages.flatMap(({ blocs }) => liensDe(blocs)))] };
}
