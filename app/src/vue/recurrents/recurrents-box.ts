// Les tickets récurrents du projet, côté process principal (ticket 3231, épique 3216) : lus et changés par la commande du
// runtime `recurring` (runtime/src/recurrents/commande.ts, ticket 3230), là où la cuisine du projet tourne, comme ses humains
// (humains-du-projet.ts) :
//   - `recurring` : `{"recurring":[{id, title, body, rhythm, paused, nextDate}]}` ;
//   - `recurring pause <id>`, `recurring resume <id>` : `{"ok":true,"recurring":<le ticket récurrent>}` ;
//   - `recurring remove <id>` : `{"ok":true}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol.
import type { Lu, Rendu } from "../../box.ts";
import { detailDe, sansLaCommande } from "../../reglages-du-projet.ts";

export type Rythme = { kind: "daily" } | { kind: "weekly"; weekday: number } | { kind: "monthly"; dayOfMonth: number };
export type Recurrent = { id: string; title: string; body: string; rhythm: Rythme; paused: boolean; nextDate: string };
export type LectureDesRecurrents = Recurrent[] | { sans: string; detail?: string };
export type Geste = "pause" | "resume" | "remove";
// Ce qu'un geste rend : le ticket récurrent changé (pause, resume), `retire` (remove), ou la ligne du refus.
export type EcritureDUnRecurrent = { recurrent: Recurrent } | { retire: true } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const entre = (valeur: unknown, min: number, max: number) => typeof valeur === "number" && Number.isInteger(valeur) && valeur >= min && valeur <= max;
// L'identifiant d'un ticket récurrent, tel que le runtime l'écrit : un mot, sans rien qu'une commande lirait autrement.
const IDENTIFIANT = /^[A-Za-z0-9_-]{1,64}$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function reponseDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

function rythmeLu(brut: unknown): Rythme | null {
  if (!estObjet(brut)) return null;
  if (brut.kind === "daily") return { kind: "daily" };
  if (brut.kind === "weekly" && entre(brut.weekday, 1, 7)) return { kind: "weekly", weekday: brut.weekday as number };
  if (brut.kind === "monthly" && entre(brut.dayOfMonth, 1, 31)) return { kind: "monthly", dayOfMonth: brut.dayOfMonth as number };
  return null;
}

// Un ticket récurrent tel que le runtime le rend, vérifié ; `null` s'il ne se lit pas.
export function recurrentLu(brut: unknown): Recurrent | null {
  if (!estObjet(brut)) return null;
  const { id, title, body, paused, nextDate } = brut;
  const rhythm = rythmeLu(brut.rhythm);
  if (typeof id !== "string" || !IDENTIFIANT.test(id) || typeof title !== "string" || title.trim() === "" || typeof paused !== "boolean" || typeof nextDate !== "string" || !JOUR.test(nextDate) || rhythm === null) return null;
  return { id, title, body: typeof body === "string" ? body : "", rhythm, paused, nextDate };
}

// Les tickets récurrents du projet, là où sa cuisine tourne ; sinon, pourquoi ils ne se lisent pas. Un seul ticket qui ne
// se lit pas rend toute la lecture illisible : la liste n'en montre pas une partie comme si c'était tout.
export async function lireLesRecurrents(projet: string, lu: Lu | undefined, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<LectureDesRecurrents> {
  if (lu === undefined) return { sans: `${projet} has no station: its recurring tickets are read where its kitchen runs` };
  const rendu = await lancer(lu, "recurring");
  if (sansLaCommande(rendu)) return { sans: "recurring tickets unavailable: this station's runtime does not give them yet — update it", detail: detailDe(rendu) };
  const reponse = rendu.erreur === null ? reponseDe(rendu) : null;
  const liste = estObjet(reponse) && Array.isArray(reponse.recurring) ? reponse.recurring.map(recurrentLu) : null;
  if (liste === null || liste.some((recurrent) => recurrent === null)) return { sans: "recurring tickets unavailable", detail: detailDe(rendu) };
  return liste as Recurrent[];
}

// Suspend, reprend ou retire un ticket récurrent par le runtime du projet : ce qu'il rend, ou la ligne du refus.
export async function ecrireUnRecurrent(projet: string, lu: Lu | undefined, geste: unknown, id: unknown, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<EcritureDUnRecurrent> {
  if (geste !== "pause" && geste !== "resume" && geste !== "remove") return { refus: "nothing was sent: this is not a gesture on a recurring ticket" };
  if (typeof id !== "string" || !IDENTIFIANT.test(id)) return { refus: "nothing was sent: this is not a recurring ticket's id" };
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no runtime to change it` };
  const rendu = await lancer(lu, `recurring ${geste} ${id}`);
  if (sansLaCommande(rendu)) return { refus: "nothing was changed: this station's runtime does not know recurring tickets yet — update it", detail: detailDe(rendu) };
  const reponse = reponseDe(rendu);
  if (estObjet(reponse) && reponse.ok === true) {
    if (geste === "remove") return { retire: true };
    const recurrent = recurrentLu(reponse.recurring);
    if (recurrent !== null) return { recurrent };
  }
  if (estObjet(reponse) && reponse.ok === false && typeof reponse.message === "string" && reponse.message !== "") {
    return { refus: (reponse.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailDe(rendu) };
  }
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailDe(rendu) };
}
