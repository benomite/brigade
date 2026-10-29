// Le plafond de cooks d'une station et ce qui la retient, tels que `status` les dit — la page de la
// station les montre mot pour mot, et règle le plafond par la commande qui existe :
// `station cooks <N>`, `station cooks auto` (docs/runtime/station.md). Rien n'est recalculé ici : ni
// les cœurs, ni le seuil de mémoire, la box les a dits.
//
//   cooks      2 running — box: 3 at most — 8 cores, mac/claude: 5 at most — set by you, replaces 3 (8 cores)
//   MACHINE SATURATED for 3 min on memory and CPU — load of 18.4 for at most 12 · 812 MB of memory available for
//              at least 3,205 MB (default: 10% of the machine's 32,050 MB): box takes no more tickets as long as it lasts
//
// Le réglage vaut pour toutes les stations du projet dont la box le reçoit (c'est la portée de la commande) :
// il part donc vers chaque projet dont le `status` lu nomme la station. Il part sur le tableau de la cuisine de chaque
// projet (`/brigade cooks <N | auto>`, docs/tableau-gestes.md, #1845) : ni `ssh`, ni box jointe — la box le joue à son
// tick, et c'est sa réponse sous le geste qui dit s'il est fait.
import { ditParLaBox, enSuite, type DecisionDuChef, type EtatDuGeste } from "./tableau-gestes/gestes.ts";

// `dit` : le plafond comme la box l'écrit — `3 at most — 8 cores`, `no limit — declared`,
// `5 at most — set by you, replaces 3 (8 cores)`. `parLeChef` : il a été réglé, et `remplace` dit ce qu'il remplace.
export type PlafondVu = { dit: string; nombre: number | null; parLeChef: boolean; remplace?: string };
// Ce qui retient la station : les ressources en cause, depuis quand, et pour chacune ce qu'elle a et ce qu'il lui faut.
export type RetenueVue = { depuis: string; ressources: string; detail: string };

const PLAFOND = /^(no limit|\d+ at most) — (?:set by you, replaces (.+?) \(.+\)|.+)$/;
// Le bout de la ligne `cooks` qui compte les cooks coincés, et celui qui compte ceux qui tournent.
const COINCES = / — \d+ STUCK: .*$/;
const EN_COURS = /^(?:none running|\d+ running)(?: — |$)/;
// Entre deux stations : une virgule suivie d'un nom et de deux-points — celle de `set by you, replaces 3` n'en est pas une.
const ENTRE_STATIONS = /, (?=[^\s,:]+: )/;

export function plafondsDe(status: string): Map<string, PlafondVu> {
  const plafonds = new Map<string, PlafondVu>();
  // Pas dans les lignes de tête : `cooks` vient après la première ligne vide de `status`.
  const valeur = /^cooks +(\S.*)$/m.exec(status)?.[1];
  if (valeur === undefined) return plafonds;
  for (const morceau of valeur.replace(COINCES, "").replace(EN_COURS, "").split(ENTRE_STATIONS)) {
    const coupe = morceau.indexOf(": ");
    if (coupe === -1) continue;
    const dit = morceau.slice(coupe + 2);
    const [, nombre, remplace] = PLAFOND.exec(dit) ?? [];
    if (nombre === undefined) continue;
    plafonds.set(morceau.slice(0, coupe), {
      dit,
      nombre: nombre === "no limit" ? null : Number.parseInt(nombre, 10),
      parLeChef: dit.includes(" — set by you, replaces "),
      ...(remplace === undefined ? {} : { remplace }),
    });
  }
  return plafonds;
}

const SATUREE = /^ *MACHINE SATURATED for (.+?) on (.+?) — (.+): (.+?) takes no more tickets as long as it lasts$/gm;

export function retenuesDe(status: string): Map<string, RetenueVue> {
  return new Map([...status.matchAll(SATUREE)].map(([, depuis = "", ressources = "", detail = "", station = ""]) => [station, { depuis, ressources, detail }]));
}

// Ce que le champ du plafond accepte : un nombre — 0 : sans limite —, ou `auto` : le plafond des cœurs revient.
export const VALEUR_DU_PLAFOND = /^(?:0|[1-9][0-9]{0,5}|auto)$/;

export type RenduDuReglage = { fait: string } | { refus: string; detail?: string };

// Ce qui poste une décision sur le tableau de ce projet et la suit jusqu'à la réponse de la box (main.ts).
export type AuTableau = (projet: string, decision: DecisionDuChef) => Promise<EtatDuGeste>;

// Règle le plafond sur la box de chaque projet qui nomme la station, l'un après l'autre, par son tableau. La première
// box qui refuse arrête le tour : ce qui a été réglé avant elle est dit. Une box qui n'a pas encore lu le geste à la fin
// de l'attente ne l'arrête pas : il est posté, elle le jouera à son tick, et la phrase le dit.
export async function reglerLePlafond(cibles: readonly string[], valeur: unknown, auTableau: AuTableau): Promise<RenduDuReglage> {
  if (typeof valeur !== "string" || !VALEUR_DU_PLAFOND.test(valeur)) return { refus: "nothing was changed: the cap is a number of cooks — 0 for no limit — or “auto”" };
  if (cibles.length === 0) return { refus: "nothing was changed: no project the app reads says this station's cap" };
  const faits: string[] = [];
  const postes: string[] = [];
  for (const projet of cibles) {
    const etat = await auTableau(projet, { geste: "cooks", plafond: valeur });
    const deja = faits.length === 0 ? "" : `; already changed for ${faits.join(", ")}`;
    if (etat.etat === "failed") return { refus: `the cap was not changed for ${projet}: ${enSuite(etat.raison)}${deja}` };
    if (etat.etat === "refused") return { refus: `the cap was not changed for ${projet}: its box did not take it${deja}`, detail: `${ditParLaBox(etat.reponse).dit}\n${etat.commentaire.url ?? ""}`.trim() };
    (etat.etat === "pending" ? postes : faits).push(projet);
  }
  const fait = valeur === "auto" ? "the cap is back to the default" : valeur === "0" ? "the cap is lifted: no limit" : `the cap is ${valeur}`;
  if (postes.length === 0) return { fait };
  return { fait: `${fait} once played: posted on the Kitchen board, the box of ${postes.join(", ")} plays it at its next tick${faits.length === 0 ? "" : ` — already changed for ${faits.join(", ")}`}` };
}
