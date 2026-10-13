// La mise en service telle que le chef la lit, dite d'un seul endroit : la
// commande `run mise-en-service` et la file (`attend.ts`) en citent les mêmes
// mots — ce qui est en vol et ce que ça a coûté, où en est la demande, ce que
// le geste de box a rendu.
import { GESTE_DE_BOX } from "./evenements/mise-en-service.ts";
import type { CookEnVol } from "./projections/garde-fous.ts";
import type { Demande, Rendu } from "./projections/mise-en-service.ts";

export const DEMANDER = "run mise-en-service";
export const COUPER = `${DEMANDER} -- --couper`;
export const ANNULER = `${DEMANDER} -- annuler`;
export const VOIR = `${DEMANDER} -- voir`;

// Ce que le runtime lance, et rien d'autre : `sudo`, sans question (`-n`), le
// geste de box par son chemin entier, et le projet pour seul argument.
export const argumentsDuGeste = (projet: string): string[] => ["-n", "--", GESTE_DE_BOX, projet];
export const direGeste = (projet: string) => `\`sudo ${argumentsDuGeste(projet).join(" ")}\``;

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const s = (combien: number) => (combien > 1 ? "s" : "");

// Ce que les cooks en vol ont déjà dépensé, en tout : la somme de leurs
// derniers relevés. Un cook sans relevé n'y compte pour rien — et se dit.
export const tokensEnVol = (cooks: CookEnVol[]): number => cooks.reduce((somme, cook) => somme + (cook.tokens ?? 0), 0);

// Sans ticket : un jugement du manager.
const nommer = (cook: CookEnVol) => (cook.ticket === null ? "manager" : `#${cook.ticket}`);

// « 2 cooks en vol (#12, #14 — 450 775 tokens déjà dépensés) ».
export function resumerEnVol(cooks: CookEnVol[]): string {
  if (cooks.length === 0) return "aucun cook en vol";
  const sansReleve = cooks.filter((cook) => cook.tokens === null).length;
  const reserve = sansReleve === 0 ? "" : `, ${sansReleve} sans relevé encore`;
  return `${cooks.length} cook${s(cooks.length)} en vol (${cooks.map(nommer).join(", ")} — ${nombre(tokensEnVol(cooks))} tokens déjà dépensés${reserve})`;
}

// Les cooks en vol, un par ligne — son ticket, son projet, sa station, ce qu'il
// a déjà dépensé —, sous leur total. `titres` : ceux du rail. `depuis` : une
// durée jusqu'à l'heure de la lecture.
export function decrireEnVol(cooks: CookEnVol[], projet: string, titres: ReadonlyMap<number, string>, depuis: (instant: string) => string): string[] {
  if (cooks.length === 0) return [`${"en vol".padEnd(11)}aucun cook — le rail est calme`];
  return [
    `${"en vol".padEnd(11)}${cooks.length} cook${s(cooks.length)} — ${nombre(tokensEnVol(cooks))} tokens déjà dépensés en tout`,
    ...cooks.map((cook) =>
      [
        `  ${nommer(cook)}`,
        projet,
        cook.station ?? "station inconnue",
        cook.tokens === null || cook.measuredAt === null ? "tokens : pas encore de relevé" : `${nombre(cook.tokens)} tokens déjà dépensés (relevé il y a ${depuis(cook.measuredAt)})`,
        `en vol depuis ${depuis(cook.launchedAt)}`,
        ...(cook.ticket !== null && titres.get(cook.ticket) ? [titres.get(cook.ticket) ?? ""] : []),
      ].join("  "),
    ),
  ];
}

// Où en est la demande, pour la file. `cooks` : ceux qui sont en vol à la
// lecture.
export function direDemande(demande: Demande, cooks: CookEnVol[], projet: string): string {
  if (demande.etat === "launched") {
    return `mise en service lancée le ${demande.lanceeLe ?? demande.depuis} : le geste de box tourne (${direGeste(projet)}), le runtime va être redémarré ; aucun cook ne part d'ici là`;
  }
  const demandee = `mise en service demandée le ${demande.depuis}`;
  if (cooks.length === 0) return `${demandee} : le rail est calme, le geste de box part au prochain réveil du runtime`;
  if (demande.coupe) return `${demandee}, sans attendre le rail calme : le geste de box part au prochain réveil du runtime — ${resumerEnVol(cooks)}, interrompu${s(cooks.length)} par le redémarrage`;
  return `${demandee}, elle attend le rail calme : ${resumerEnVol(cooks)}, aucun n'est interrompu et aucun autre ne part ; le geste de box part seul, une fois, dès que plus aucun n'est en vol — pour ne plus attendre : \`${COUPER}\` ; pour y renoncer : \`${ANNULER}\``;
}

// La dernière ligne que le geste a écrite : ce qu'il dit de son refus.
const dernierMot = (fin: string) => fin.split("\n").map((ligne) => ligne.trim()).filter(Boolean).at(-1) ?? "";

// Ce que le geste de box a rendu sans rien redémarrer, pour la file.
export function direRendu(rendu: Rendu, projet: string): string {
  const mot = dernierMot(rendu.fin);
  const issue =
    rendu.erreur !== null
      ? `le geste de box n'a pas pu être lancé (${rendu.erreur})`
      : `le geste de box a rendu ${rendu.code === null ? `la main sur ${rendu.signal ?? "un signal"}` : rendu.code} le ${rendu.renduLe}${mot === "" ? "" : ` — « ${mot} »`}`;
  return `la mise en service lancée le ${rendu.lanceLe} n'a rien redémarré : ${issue} — à redemander : \`${DEMANDER}\` ; ou à la main : \`sudo brigade-mise-en-service ${projet}\``;
}
