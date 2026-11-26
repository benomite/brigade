// Le récapitulatif d'un projet, côté process principal (ticket 3581, épique 3579) : ce que la cuisine a fait depuis que le
// chef a regardé, lu par la commande `recap` du runtime là où la cuisine du projet tourne (runtime/src/recap/), et le
// marqueur « vu jusqu'à » avancé par elle une fois le récapitulatif montré :
//   - `recap <owner>/<repo>` : le récapitulatif, une ligne de JSON ;
//   - `recap <owner>/<repo> seen <until>` : `{"ok":true,"seenUntil":<instant>}`, ou `{"ok":false,"message":<la ligne du refus>}`
//     avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol — jamais lue comme « rien ne s'est passé ».
import type { Lu, Rendu } from "../../box.ts";
import { detailDe, sansLaCommand } from "../../settings-du-project.ts";
import type { Arret } from "../../../../runtime/src/recap/arrets.ts";
import type { Recap } from "../../../../runtime/src/recap/recap.ts";
import type { Renvoye } from "../../../../runtime/src/recap/renvois.ts";
import type { Servi } from "../../../../runtime/src/recap/servis.ts";

export type { Recap };
// Ce que la lecture rend : le récapitulatif, ou pourquoi il ne se lit pas.
export type ReadDuRecap = { recap: Recap } | { sans: string; detail?: string };
// Ce que le marquage rend : le marqueur après lui, ou la ligne du refus.
export type MarqueDuRecap = { seenUntil: string } | { refus: string; detail?: string };

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const INDISPONIBLE = "recap unavailable";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const estTexte = (valeur: unknown): valeur is string => typeof valeur === "string";
const estInstant = (valeur: unknown): valeur is string => estTexte(valeur) && !Number.isNaN(Date.parse(valeur));
const estAdresse = (valeur: unknown): valeur is string => estTexte(valeur) && valeur.startsWith("https://github.com/");
const estTicket = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur > 0;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

const isServed = (v: unknown): v is Servi => estObjet(v) && estTicket(v.ticket) && estTexte(v.title) && estAdresse(v.url) && estTicket(v.pr) && estAdresse(v.prUrl) && estInstant(v.servedAt);
const renvoye = (v: unknown): v is Renvoye => estObjet(v) && estTicket(v.ticket) && estAdresse(v.url) && (v.kind === "sent-back" || v.kind === "refused") && estTexte(v.reason) && estInstant(v.at);
const stop = (v: unknown): v is Arret => estObjet(v) && estInstant(v.at) && (v.ticket === null || estTicket(v.ticket)) && ["stop", "breaker", "duration", "tokens"].includes(String(v.guardrail)) && estTexte(v.line);

// Le récapitulatif tel que le runtime l'écrit, ou null s'il n'en a pas la forme.
function recapLu(brut: unknown): Recap | null {
  if (!estObjet(brut) || !estTexte(brut.repository) || !estInstant(brut.since) || !estInstant(brut.until)) return null;
  const { served, sentBack, stops } = brut;
  if (!Array.isArray(served) || !served.every(isServed) || !Array.isArray(sentBack) || !sentBack.every(renvoye) || !Array.isArray(stops) || !stops.every(stop)) return null;
  return { repository: brut.repository, since: brut.since, until: brut.until, served, sentBack, stops };
}

// Le récapitulatif du projet, là où sa cuisine tourne ; sinon, pourquoi il ne se lit pas.
export async function lireLeRecap(project: string, lu: Lu | undefined, repository: string, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<ReadDuRecap> {
  if (lu === undefined) return { sans: `${INDISPONIBLE}: ${project} has no station — it is read where its kitchen runs` };
  if (!REPOSITORY.test(repository)) return { sans: `${INDISPONIBLE}: the GitHub repository of ${project} is not known` };
  const rendu = await lancer(lu, `recap ${repository}`);
  if (sansLaCommand(rendu)) return { sans: `${INDISPONIBLE}: this station's runtime does not give it yet — update it`, detail: detailDe(rendu) };
  const recap = rendu.erreur === null ? recapLu(answerDe(rendu)) : null;
  return recap === null ? { sans: INDISPONIBLE, detail: detailDe(rendu) } : { recap };
}

// Le récapitulatif a été montré jusqu'à `until` : le marqueur du projet y avance, là où sa cuisine tourne.
export async function marquerLeRecap(project: string, lu: Lu | undefined, repository: string, until: unknown, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<MarqueDuRecap> {
  if (!estInstant(until) || !/^[0-9TZ:.+-]+$/.test(until)) return { refus: "nothing was marked: this is not an instant" };
  if (lu === undefined) return { refus: `nothing was marked: ${project} has no station` };
  if (!REPOSITORY.test(repository)) return { refus: `nothing was marked: the GitHub repository of ${project} is not known` };
  const rendu = await lancer(lu, `recap ${repository} seen ${until}`);
  if (sansLaCommand(rendu)) return { refus: "nothing was marked: this station's runtime does not keep the recap yet — update it", detail: detailDe(rendu) };
  const answer = answerDe(rendu);
  if (estObjet(answer) && answer.ok === true && estInstant(answer.seenUntil)) return { seenUntil: answer.seenUntil };
  if (estObjet(answer) && answer.ok === false && estTexte(answer.message) && answer.message !== "") return { refus: answer.message.split("\n")[0] ?? "", detail: detailDe(rendu) };
  return { refus: "nothing was marked: the runtime's answer could not be read", detail: detailDe(rendu) };
}
