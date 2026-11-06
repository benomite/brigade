// Un `blocked-on-human` sans question écrite sur la carte est un échec, pas un
// cran normal (CLAUDE.md, « Brigade's goal: autonomy »). Une carte TODO pose une
// question au chef — choix de produit, choix de design, ou relecture —, jamais
// ce qu'un agent peut trancher.
//
// `poserALaMain` est le seul endroit qui pose le label : avec une question non
// vide, elle l'écrit en commentaire sur la carte puis pose le label ; sans, le
// label n'est pas posé, et le cas est compté. Le compte est cumulé, jamais remis
// à zéro, et vit dans le répertoire d'état du projet (`blocages-sans-question.json`).
// `status` le dit (ligne `blocked w/o q`) et `facts` le rend en entier,
// `blockedWithoutQuestion` : l'onglet Health et le closer lisent ce nom.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { A_LA_MAIN, type GitHubDuTour } from "./brigade-github.ts";

export const FICHIER_BLOCAGES_SANS_QUESTION = "blocages-sans-question.json";

// Le compte courant ; 0 quand le fichier manque ou ne se lit pas.
export function lireBlocagesSansQuestion(repertoireEtat: string | undefined): number {
  if (!repertoireEtat) return 0;
  try {
    const lu: unknown = JSON.parse(readFileSync(join(repertoireEtat, FICHIER_BLOCAGES_SANS_QUESTION), "utf8"));
    const n = typeof lu === "object" && lu !== null ? (lu as Record<string, unknown>).blockedWithoutQuestion : undefined;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Compte un blocage de plus et rend le compte.
export function compterUnBlocageSansQuestion(repertoireEtat: string): number {
  const n = lireBlocagesSansQuestion(repertoireEtat) + 1;
  const chemin = join(repertoireEtat, FICHIER_BLOCAGES_SANS_QUESTION);
  mkdirSync(repertoireEtat, { recursive: true });
  writeFileSync(`${chemin}.tmp`, JSON.stringify({ blockedWithoutQuestion: n }));
  renameSync(`${chemin}.tmp`, chemin);
  return n;
}

export type Pose = { pose: true } | { pose: false; echec: string };

export async function poserALaMain(
  { github, repertoireEtat }: { github: Pick<GitHubDuTour, "commenter" | "labelliser">; repertoireEtat?: string | undefined },
  ticket: number,
  question: string | null | undefined,
): Promise<Pose> {
  const dite = question?.trim() ?? "";
  if (dite === "") {
    if (repertoireEtat) compterUnBlocageSansQuestion(repertoireEtat);
    return { pose: false, echec: `#${ticket}: \`${A_LA_MAIN}\` asked for with no question written on the card — not applied; the kitchen decides` };
  }
  await github.commenter(ticket, dite);
  await github.labelliser(ticket, [A_LA_MAIN]);
  return { pose: true };
}
