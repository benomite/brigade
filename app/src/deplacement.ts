// Le rang d'une carte dans la colonne « On the rail » (ticket 1347) : le chef la glisse et la lâche entre deux
// autres, et un seul appel du runtime la place — `rail move <ticket> --before <autre>` ou `--after <autre>`
// (docs/runtime/journal-et-rail.md, #1345). Le runtime tient l'ordre : il l'écrit au journal, le sert dans cet
// ordre, et `facts` comme `status` le rendent tel quel — après une relecture ou un redémarrage, la colonne le montre.
// Placée parmi des cartes d'une autre priorité, la carte prend la leur : c'est le runtime qui la change. Il refuse
// de mettre un ticket devant un ticket qu'il attend, en une phrase qui le nomme ; rien n'a bougé, et la vue la dit.
// La commande se compose ici, jamais dans la vue : la vue nomme le ticket glissé, son voisin et le côté.
import { echecLa, type Lu, type Rendu } from "./box.ts";

export type Cote = "before" | "after";
export const COTES: readonly Cote[] = ["before", "after"];

// Ce qu'il en est advenu : placé — `dit`, ce que le runtime en dit —, ou rien n'a bougé, et pourquoi en une phrase,
// ce que la station a rendu au survol.
export type RenduDuDeplacement = { place: true; dit: string } | { refus: string; detail: string };

// La commande du runtime, telle qu'elle part après `brigade <projet>`.
export const deplacer = (ticket: number, voisin: number, cote: Cote) => `rail move ${ticket} --${cote} ${voisin}`;

// Un constat, pas une consigne : la commande et ce que la station a rendu sont au survol.
export const SANS_GESTE = "not moved: this station's runtime cannot reorder the rail yet";
export const PAS_LU = "not moved: the rail is not read yet";
const PAS_JOINTE = "not moved: the station could not be asked";

const numero = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 1;

// La dernière ligne non vide d'une sortie : ce que le runtime dit en dernier.
const derniere = (sortie: string) => sortie.split("\n").map((ligne) => ligne.trim()).filter(Boolean).at(-1) ?? "";

// Le refus du runtime, en une phrase : `brigade : #22 is not touched: <raison> — cost: <prix>` (runtime/src/montrer-rail.ts)
// en donne la raison, qui nomme le ticket attendu. Une ligne d'une autre forme est dite telle quelle.
export function raisonDuRefus(ligne: string): string {
  const dite = ligne.replace(/^brigade : /, "");
  const raison = /^#\d+ is not touched: (.*?)(?: — cost: .*)?$/.exec(dite)?.[1] ?? dite;
  return raison === "" ? "not moved: the station does not say why" : `${raison.charAt(0).toUpperCase()}${raison.slice(1).replace(/\.?$/, ".")}`;
}

// Place `ticket` juste avant ou juste après `voisin`, là où la cuisine du projet tourne (`lu`). L'un et l'autre
// doivent être dans la colonne « On the rail » des derniers `facts` du projet (`enFile`) : rien ne part pour une
// carte qui a quitté la file sous les yeux du chef.
//   0  placé
//   1  le runtime a refusé — sa dernière ligne dit pourquoi
//   2, 66  le runtime de la station ne connaît pas `rail move`
// Jamais d'exception.
export async function deplacerLaCarte(
  lu: Lu | undefined,
  enFile: ReadonlySet<number> | undefined,
  ticket: unknown,
  voisin: unknown,
  cote: unknown,
  lancer: (lu: Lu, commande: string) => Promise<Rendu>,
  delaiMs: number,
): Promise<RenduDuDeplacement> {
  if (!numero(ticket) || !numero(voisin) || ticket === voisin) return { refus: "not moved: the card names no other ticket to sit next to", detail: "" };
  if (cote !== "before" && cote !== "after") return { refus: `not moved: “${String(cote)}” is neither before nor after`, detail: "" };
  if (lu === undefined) return { refus: "not moved: the project has no station — there is no command to run", detail: "" };
  if (enFile === undefined) return { refus: PAS_LU, detail: "" };
  const ailleurs = [ticket, voisin].find((un) => !enFile.has(un));
  if (ailleurs !== undefined) return { refus: `not moved: #${ailleurs} is no longer on the rail — it left the queue since the last read`, detail: "" };
  const rendu = await lancer(lu, deplacer(ticket, voisin, cote));
  const { erreur } = rendu;
  if (erreur === null) return { place: true, dit: derniere(rendu.sortie) };
  const echec = echecLa(lu.cuisine, { ...rendu, erreur }, delaiMs);
  if (erreur.killed !== true && erreur.code === 1) return { refus: raisonDuRefus(derniere(rendu.erreurs) || derniere(rendu.sortie)), detail: echec.erreur };
  if (erreur.killed !== true && (erreur.code === 2 || erreur.code === 66)) return { refus: SANS_GESTE, detail: echec.erreur };
  return { refus: `${PAS_JOINTE} — ${echec.atteinte ? "reached, but it did not answer: the next read shows where the card is" : "not reached"}`, detail: echec.erreur };
}
