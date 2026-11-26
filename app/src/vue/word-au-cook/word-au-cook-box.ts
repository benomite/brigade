// Le mot au cook, côté process principal (ticket 4048, épique 4043) : le chef écrit une ligne au cook d'un ticket en
// cuisine, depuis sa carte, sans ouvrir sa session. La ligne part par la commande du runtime `send-word` (un autre ticket de
// l'épique la construit), là où la cuisine du projet tourne, comme les tickets récurrents (vue/recurring/recurring-box.ts) :
//   - `send-word '<{"ticket":<n>,"text":<la ligne>}>'` : l'entrée `{ticket, text}`, en un seul mot JSON ;
//   - la réponse, sur la dernière ligne de la sortie : `{"ok":true}` ou `{"ok":false,"reason":<une ligne>}`.
// Ce qui ne se lit pas ne se devine pas : la vue reçoit toujours `{ok: false, reason}` en une ligne, le détail au survol.
import type { Lu, Rendu } from "../../box.ts";
import { cite } from "../../box.ts";
import { detailDe, sansLaCommand } from "../../settings-du-project.ts";
import type { Answer } from "./source.js";


const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// La commande, ou pourquoi rien ne part : un numéro de ticket, et une ligne qui n'est pas vide.
function commandDuWord(entree: unknown): { commande: string } | { refus: string } {
  if (!estObjet(entree) || !Number.isInteger(entree.ticket) || (entree.ticket as number) <= 0) return { refus: "nothing was sent: this is not a ticket" };
  if (typeof entree.text !== "string" || entree.text.trim() === "") return { refus: "nothing was sent: the word is empty" };
  return { commande: `send-word ${cite(JSON.stringify({ ticket: entree.ticket, text: entree.text }))}` };
}

// Envoie le mot au cook du ticket par le runtime du projet : `{ok: true}`, ou la raison en une ligne.
async function envoyerLeWord(project: string, lu: Lu | undefined, entree: unknown, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<Answer> {
  const ecrite = commandDuWord(entree);
  if ("refus" in ecrite) return { ok: false, reason: ecrite.refus };
  if (lu === undefined) return { ok: false, reason: `nothing was sent: “${project}” has no station — there is no runtime to pass it on` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommand(rendu)) return { ok: false, reason: "nothing was sent: this station's runtime cannot pass a word to a cook yet — update it", detail: detailDe(rendu) };
  const answer = answerDe(rendu);
  if (estObjet(answer) && answer.ok === true) return { ok: true };
  if (estObjet(answer) && answer.ok === false && typeof answer.reason === "string" && answer.reason.trim() !== "") {
    return { ok: false, reason: (answer.reason.trim().split("\n")[0] ?? "").replaceAll("`", ""), detail: detailDe(rendu) };
  }
  return { ok: false, reason: "the runtime's answer could not be read: the word may not have reached the cook", detail: detailDe(rendu) };
}

// Le geste du pont (`envoyerUnMot`, preload.cjs) : main.ts le branche d'une ligne, avec ce qu'il sait du projet.
export function brancherLeWordAuCook(
  ipc: { handle(canal: string, ecouter: (event: unknown, ...args: unknown[]) => unknown): void },
  kitchenDuProject: (name: unknown) => { vise: { nom: string } | undefined; lu: Lu | undefined },
  lancer: (lu: Lu, command: string) => Promise<Rendu>,
): void {
  ipc.handle("envoyerUnMot", (_, name, entree) => {
    const { vise, lu } = kitchenDuProject(name);
    return vise === undefined ? { ok: false, reason: `nothing was sent: “${String(name)}” is no longer in the projects file` } : envoyerLeWord(vise.nom, lu, entree, lancer);
  });
}
