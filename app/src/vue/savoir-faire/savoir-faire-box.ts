// Le savoir-faire du projet, côté process principal (ticket 4241, épique 4140) : lu, réécrit et retiré par la commande du
// runtime `know-how` (runtime/src/savoir-faire/commande.ts), là où la cuisine du projet tourne, comme ses tickets récurrents
// (vue/recurrents/recurrents-box.ts) :
//   - `know-how` : `{"entries":[{id, text, ticket}]}` ;
//   - `know-how edit <id> '<text>'` : `{"ok":true,"entry":<l'entrée>}` ; `know-how remove <id>` : `{"ok":true}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit en une ligne, le détail au survol (source.js la lève).
import type { Lu, Rendu } from "../../box.ts";
import { cite } from "../../box.ts";
import { detailDe, sansLaCommande } from "../../reglages-du-projet.ts";

export type Entree = { id: string; text: string; ticket: number };
export type LectureDuSavoirFaire = { entries: Entree[] } | { refus: string; detail?: string };
// Un changement fait.
const FAIT = { ok: true } as const;
export type EcritureDuSavoirFaire = typeof FAIT | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
// L'id d'une entrée, tel que le runtime l'écrit (`L3`) : rien qu'une commande lirait autrement.
const IDENTIFIANT = /^L[1-9]\d*$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function reponseDe(rendu: Rendu): unknown {
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
async function lireLeSavoirFaire(projet: string, lu: Lu | undefined, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<LectureDuSavoirFaire> {
  if (lu === undefined) return { refus: `know-how unavailable: “${projet}” has no station — it is read where its kitchen runs` };
  const rendu = await lancer(lu, "know-how");
  if (sansLaCommande(rendu)) return { refus: "know-how unavailable: this station's runtime does not give it yet — update it", detail: detailDe(rendu) };
  const reponse = rendu.erreur === null ? reponseDe(rendu) : null;
  const liste = estObjet(reponse) && Array.isArray(reponse.entries) ? reponse.entries.map(entreeLue) : null;
  if (liste === null || liste.some((entree) => entree === null)) return { refus: "know-how unavailable", detail: detailDe(rendu) };
  return { entries: liste as Entree[] };
}

// La commande d'un geste, ou pourquoi rien ne part.
function commandeDuGeste(geste: { edit: unknown; text: unknown } | { remove: unknown }): { commande: string } | { refus: string } {
  const id = "edit" in geste ? geste.edit : geste.remove;
  if (typeof id !== "string" || !IDENTIFIANT.test(id)) return { refus: "nothing was sent: this is not an entry of the know-how" };
  if (!("edit" in geste)) return { commande: `know-how remove ${id}` };
  if (typeof geste.text !== "string" || geste.text.trim() === "") return { refus: "nothing was sent: an entry cannot be empty" };
  return { commande: `know-how edit ${id} ${cite(geste.text)}` };
}

// Réécrit ou retire une entrée par le runtime du projet : `{ok: true}`, ou la ligne du refus.
async function ecrireLeSavoirFaire(projet: string, lu: Lu | undefined, geste: { edit: unknown; text: unknown } | { remove: unknown }, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<EcritureDuSavoirFaire> {
  const ecrite = commandeDuGeste(geste);
  if ("refus" in ecrite) return ecrite;
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no runtime to change it` };
  const rendu = await lancer(lu, ecrite.commande);
  if (sansLaCommande(rendu)) return { refus: "nothing was changed: this station's runtime does not know the know-how yet — update it", detail: detailDe(rendu) };
  const reponse = reponseDe(rendu);
  if (estObjet(reponse) && reponse.ok === true) return FAIT;
  if (estObjet(reponse) && reponse.ok === false && typeof reponse.message === "string" && reponse.message !== "") return { refus: reponse.message.split("\n")[0] ?? "", detail: detailDe(rendu) };
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailDe(rendu) };
}

// Les gestes du pont (`lireLeSavoirFaire`, `modifierLeSavoirFaire`, `retirerDuSavoirFaire`, preload.cjs) : main.ts les
// branche d'une ligne, avec ce qu'il sait du projet.
export function brancherLeSavoirFaire(
  ipc: { handle(canal: string, ecouter: (evenement: unknown, ...args: unknown[]) => unknown): void },
  cuisineDuProjet: (nom: unknown) => { vise: { nom: string } | undefined; lu: Lu | undefined },
  lancer: (lu: Lu, commande: string) => Promise<Rendu>,
): void {
  const parti = (nom: unknown) => ({ refus: `“${String(nom)}” is no longer in the projects file` });
  ipc.handle("lireLeSavoirFaire", (_, nom) => {
    const { vise, lu } = cuisineDuProjet(nom);
    return vise === undefined ? parti(nom) : lireLeSavoirFaire(vise.nom, lu, lancer);
  });
  ipc.handle("modifierLeSavoirFaire", (_, nom, id, texte) => {
    const { vise, lu } = cuisineDuProjet(nom);
    return vise === undefined ? parti(nom) : ecrireLeSavoirFaire(vise.nom, lu, { edit: id, text: texte }, lancer);
  });
  ipc.handle("retirerDuSavoirFaire", (_, nom, id) => {
    const { vise, lu } = cuisineDuProjet(nom);
    return vise === undefined ? parti(nom) : ecrireLeSavoirFaire(vise.nom, lu, { remove: id }, lancer);
  });
}
