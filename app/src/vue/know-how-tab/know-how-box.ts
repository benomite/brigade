// Le savoir-faire du projet, côté process principal (ticket 4241, épique 4140) : lu, réécrit et retiré par la commande du
// runtime `know-how` (runtime/src/savoir-faire/commande.ts), là où la cuisine du projet tourne, comme ses tickets récurrents
// (vue/recurring/recurring-box.ts) :
//   - `know-how` : `{"entries":[{id, text, ticket}]}` ;
//   - `know-how edit <id> '<text>'` : `{"ok":true,"entry":<l'entrée>}` ; `know-how remove <id>` : `{"ok":true}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit en une ligne, le détail au survol (source.js la lève).
import type { Lu, Rendu } from "../../box.ts";
import { cite } from "../../box.ts";
import { detailDe, sansLaCommand } from "../../settings-du-project.ts";

export type Entree = { id: string; text: string; ticket: number };
export type ReadDuKnowHow = { entries: Entree[] } | { refus: string; detail?: string };
// Un changement fait.
const FAIT = { ok: true } as const;
export type EcritureDuKnowHow = typeof FAIT | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
// L'id d'une entrée, tel que le runtime l'écrit (`L3`) : rien qu'une commande lirait autrement.
const IDENTIFIANT = /^L[1-9]\d*$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerDe(rendu: Rendu): unknown {
  try {
    return JSON.parse(rendu.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Une entrée telle que le runtime la rend, vérifiée ; `null` si elle ne se lit pas.
function entreeLue(brut: unknown): Entree | null {
  if (!estObjet(brut)) return null;
  const { id, text, ticket } = brut;
  if (typeof id !== "string" || !IDENTIFIANT.test(id) || typeof text !== "string" || !Number.isSafeInteger(ticket) || (ticket as number) <= 0) return null;
  return { id, text, ticket: ticket as number };
}

// Les entrées du projet ; sinon, pourquoi elles ne se lisent pas. Une seule entrée qui ne se lit pas rend toute la lecture
// illisible : l'écran n'en montre pas une partie comme si c'était tout.
async function lireLeKnowHow(project: string, lu: Lu | undefined, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<ReadDuKnowHow> {
  if (lu === undefined) return { refus: `know-how unavailable: “${project}” has no station — it is read where its kitchen runs` };
  const rendu = await lancer(lu, "know-how");
  if (sansLaCommand(rendu)) return { refus: "know-how unavailable: this station's runtime does not give it yet — update it", detail: detailDe(rendu) };
  const answer = rendu.erreur === null ? answerDe(rendu) : null;
  const liste = estObjet(answer) && Array.isArray(answer.entries) ? answer.entries.map(entreeLue) : null;
  if (liste === null || liste.some((entree) => entree === null)) return { refus: "know-how unavailable", detail: detailDe(rendu) };
  return { entries: liste as Entree[] };
}

// La commande d'un geste, ou pourquoi rien ne part.
function commandDuAction(action: { edit: unknown; text: unknown } | { remove: unknown }): { commande: string } | { refus: string } {
  const id = "edit" in action ? action.edit : action.remove;
  if (typeof id !== "string" || !IDENTIFIANT.test(id)) return { refus: "nothing was sent: this is not an entry of the know-how" };
  if (!("edit" in action)) return { commande: `know-how remove ${id}` };
  if (typeof action.text !== "string" || action.text.trim() === "") return { refus: "nothing was sent: an entry cannot be empty" };
  return { commande: `know-how edit ${id} ${cite(action.text)}` };
}

// Réécrit ou retire une entrée par le runtime du projet : `{ok: true}`, ou la ligne du refus.
async function ecrireLeKnowHow(project: string, lu: Lu | undefined, action: { edit: unknown; text: unknown } | { remove: unknown }, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<EcritureDuKnowHow> {
  const ecrite = commandDuAction(action);
  if ("refus" in ecrite) return ecrite;
  if (lu === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to change it` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommand(rendu)) return { refus: "nothing was changed: this station's runtime does not know the know-how yet — update it", detail: detailDe(rendu) };
  const answer = answerDe(rendu);
  if (estObjet(answer) && answer.ok === true) return FAIT;
  if (estObjet(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") return { refus: answer.message.split("\n")[0] ?? "", detail: detailDe(rendu) };
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailDe(rendu) };
}

// Les gestes du pont (`lireLeSavoirFaire`, `modifierLeSavoirFaire`, `retirerDuSavoirFaire`, preload.cjs) : main.ts les
// branche d'une ligne, avec ce qu'il sait du projet.
export function brancherLeKnowHow(
  ipc: { handle(canal: string, ecouter: (event: unknown, ...args: unknown[]) => unknown): void },
  kitchenDuProject: (name: unknown) => { vise: { nom: string } | undefined; lu: Lu | undefined },
  lancer: (lu: Lu, command: string) => Promise<Rendu>,
): void {
  const parti = (name: unknown) => ({ refus: `“${String(name)}” is no longer in the projects file` });
  ipc.handle("lireLeSavoirFaire", (_, name) => {
    const { vise, lu } = kitchenDuProject(name);
    return vise === undefined ? parti(name) : lireLeKnowHow(vise.nom, lu, lancer);
  });
  ipc.handle("modifierLeSavoirFaire", (_, name, id, texte) => {
    const { vise, lu } = kitchenDuProject(name);
    return vise === undefined ? parti(name) : ecrireLeKnowHow(vise.nom, lu, { edit: id, text: texte }, lancer);
  });
  ipc.handle("retirerDuSavoirFaire", (_, name, id) => {
    const { vise, lu } = kitchenDuProject(name);
    return vise === undefined ? parti(name) : ecrireLeKnowHow(vise.nom, lu, { remove: id }, lancer);
  });
}
