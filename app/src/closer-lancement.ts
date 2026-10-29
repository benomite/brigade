// Lancer un nettoyage depuis la partie closer de la page d'un projet (#991, épique 986) : les trois
// gestes que le runtime offre à l'app (runtime/src/fermeture-action/action.ts), lancés une fois sur
// la station de cet ordinateur, comme `manager backlog` (allumage.ts) — l'app n'en double aucun :
//   apercu   `closing preview --json`          ce qu'un nettoyage coûte, ce que le closer va faire — rien n'est écrit
//   lancer   `closing write --json --confirm`  la demande, au « oui » du chef — sans ce « oui », rien ne part
//   annuler  `closing cancel --json`           retire la demande qui attend, avant qu'elle parte
// Le runtime répond par un objet sur une ligne, en 0 comme en 1 (refusé, impossible) : il est rendu
// tel quel à la vue (vue/closer/lancement/lancement.js), qui le dit. Une box pas jointe, un runtime
// qui ne connaît pas le geste, une sortie sans objet : une ligne, et ce que l'app a obtenu, pour le
// survol. Jamais d'exception.
import { echecDe, lancerLa, type Lu, type Reglages } from "./box.ts";
import { titreDEchec } from "./faits.ts";

export const ACTIONS = {
  apercu: "closing preview --json",
  lancer: "closing write --json --confirm",
  annuler: "closing cancel --json",
} as const;
export type Action = keyof typeof ACTIONS;

// Ce qui retient une demande, ou l'a refusée, tel que le runtime le dit (closing/condition.ts).
export type Refus = { reason: string; observed: number | null; limit: number | null; detail: string | null };

// L'aperçu (fermeture-action/apercu.ts) : le prix — nul sans closer réglé —, ce que le closer va
// faire, phrase par phrase, où en est la demande, et ce que deviendrait une demande faite maintenant.
export type Apercu = {
  configured: boolean;
  cost: { model: string; effort: string; maxTokens: number; maxRemovedLines: number; startsBelowCooks: number; text: string } | null;
  does: string[];
  request: { state: "none" } | { state: "waiting"; since: string; stalledAt: string | null; holds: Refus | null; text: string } | { state: "running"; run: string };
  ifRequested: { outcome: "leaves" | "waits" | "already-requested" | "refused" | "impossible"; reason: Refus | null; text: string };
};
// Ce que la demande est devenue (fermeture-action/action.ts, `write`).
export type Demandee =
  | { outcome: "requested"; waits: Refus | null; text: string }
  | { outcome: "already-requested"; since: string; holds: Refus | null; text: string }
  | { outcome: "refused"; reason: Refus; text: string }
  | { outcome: "impossible" | "unconfirmed"; text: string };
// Ce que le retrait est devenu (`cancel`) : `refused`, la passe est partie.
export type Retiree = { outcome: "cancelled"; since: string; text: string } | { outcome: "none"; text: string } | { outcome: "refused"; run: string; text: string };

// Ce que la vue reçoit d'un geste : ce que le runtime a rendu, ou pourquoi rien ne l'a été — `detail`, pour le survol.
export type Rendu = { apercu: Apercu } | { demandee: Demandee } | { retiree: Retiree } | { refus: string; detail: string };

export const SANS_OUI = "nothing was sent: a cleanup leaves only on your “yes”, in front of what it costs";
const PAS_DEMANDE = "the station could not be asked";

// Les issues que chaque geste connaît : une ligne qui n'en porte pas n'est pas sa réponse.
const ISSUES: Record<Exclude<Action, "apercu">, readonly string[]> = {
  lancer: ["requested", "already-requested", "refused", "impossible", "unconfirmed"],
  annuler: ["cancelled", "none", "refused"],
};

// L'objet de la réponse : la dernière ligne de la sortie qui en a la forme.
function reponseDe(action: Action, sortie: string): Rendu | undefined {
  for (const ligne of sortie.split("\n").reverse()) {
    let lu: unknown;
    try {
      lu = JSON.parse(ligne);
    } catch {
      continue;
    }
    if (lu === null || typeof lu !== "object" || Array.isArray(lu)) continue;
    const objet = lu as Record<string, unknown>;
    if (action === "apercu") {
      if (typeof objet.configured === "boolean" && Array.isArray(objet.does) && typeof objet.request === "object" && typeof objet.ifRequested === "object") return { apercu: lu as Apercu };
      continue;
    }
    if (typeof objet.outcome !== "string" || typeof objet.text !== "string" || !ISSUES[action].includes(objet.outcome)) continue;
    return action === "lancer" ? { demandee: lu as Demandee } : { retiree: lu as Retiree };
  }
  return undefined;
}

// Le geste, sur la box du projet. `action` vient de la vue : un nom qu'elle ne connaît pas ne lance
// rien. Le lancement ne part qu'avec `oui` à `true` — la vue ne le passe qu'au « oui » du chef.
export async function agirSurLeCloser(reglages: Reglages, servi: Lu, action: unknown, oui?: unknown): Promise<Rendu | undefined> {
  if (typeof action !== "string" || !Object.hasOwn(ACTIONS, action)) return undefined;
  const voulue = action as Action;
  if (voulue === "lancer" && oui !== true) return { refus: SANS_OUI, detail: "" };
  const rendu = await lancerLa(reglages, servi, ACTIONS[voulue]);
  const { erreur } = rendu;
  // 1 : refusé ou impossible — la réponse est sur la sortie, comme en 0.
  if (erreur === null || (erreur.killed !== true && erreur.code === 1)) {
    const reponse = reponseDe(voulue, rendu.sortie);
    if (reponse !== undefined) return reponse;
    return { refus: `${PAS_DEMANDE}: it did not return the answer of \`${ACTIONS[voulue]}\``, detail: `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}` };
  }
  const echec = echecDe({ ...rendu, erreur }, reglages.delaiMs);
  if (erreur.killed !== true && erreur.code === 2) return { refus: `${PAS_DEMANDE}: its runtime does not know this gesture yet — update brigade on the station`, detail: echec.erreur };
  return { refus: `${PAS_DEMANDE} — ${titreDEchec(echec, "reached, but it did not answer").toLowerCase()}`, detail: echec.erreur };
}
