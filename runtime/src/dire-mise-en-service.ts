// La mise en service telle que le chef la lit, dite d'un seul endroit : la
// commande `run mise-en-service` et la file (`attend.ts`) en citent les mêmes
// mots — ce qui est en vol et ce que ça a coûté, où en est la demande, ce que
// le dernier geste de box a donné, et l'essai que le runtime a lancé seul.
import { GESTE_DE_BOX } from "./evenements/mise-en-service.ts";
import { geste } from "./geste.ts";
import type { CookEnVol } from "./projections/garde-fous.ts";
import { reessaiDuClone, versionRatee, type Demande, type Geste, type GesteRendu } from "./projections/mise-en-service.ts";

export const DEMANDER = geste("mise-en-service");
export const COUPER = `${DEMANDER} --couper`;
export const ANNULER = `${DEMANDER} annuler`;
export const VOIR = `${DEMANDER} voir`;

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

const court = (commit: string) => commit.slice(0, 12);

// Ce que disent les codes de sortie du geste de box et de la bascule qu'il
// lance, quand ils rendent la main sans avoir rien arrêté (`deploy/
// brigade-mise-en-service`, `deploy/brigade-bascule`). Les deux qui manquent —
// la version n'a pas démarré, 73 et 74 — arrêtent le runtime : celui qui a
// lancé le geste ne les lit jamais.
export const SENS_DES_CODES: Readonly<Record<number, string>> = {
  64: "le geste a été mal appelé",
  65: "la box ne connaît pas ce projet",
  67: "systemd n'a pas répondu pour une unité du projet",
  69: "le clone de brigade n'a pas pu être mis à jour",
  71: "le clone de brigade n'a pas le commit à poser",
  72: "la version change une unité posée",
  75: "une unité du projet ne prendrait pas la version",
  76: "le geste n'est pas lancé du clone de brigade",
  77: "le geste n'a pas été lancé par root",
};

const lignesDe = (fin: string) => fin.split("\n").filter((ligne) => ligne.trim() !== "");

// Ce que le geste dit de son refus : la dernière ligne qu'il a signée de son
// nom (`brigade-bascule : …`) — celles qui la suivent, en retrait, la
// précisent —, sinon la dernière qu'il a écrite.
function dernierMot(fin: string): string {
  const lignes = lignesDe(fin).map((ligne) => ligne.trim());
  return lignes.findLast((ligne) => /^brigade(-[a-z]+)* : /.test(ligne)) ?? lignes.at(-1) ?? "";
}
const cite = (mot: string) => (mot === "" ? "" : ` — « ${mot} »`);

// Ce que le dernier geste de box a donné quand il n'a pas mis sa version en
// service, pour la file : qu'il a échoué, ce qui est en service, et pourquoi
// en une ligne.
export function direIssue({ lanceLe, avant, issue }: GesteRendu, projet: string): string {
  const reprendre = `à redemander : \`${DEMANDER}\` ; ou à la main : \`sudo brigade-mise-en-service ${projet}\``;
  if (issue.quoi === "returned") {
    const dit =
      issue.refusee !== null
        ? `${court(issue.refusee)} n'a pas démarré${cite(issue.motif ?? dernierMot(issue.fin))} ; la version précédente (${court(issue.servie)}) est revenue en service, le runtime est reparti sur elle le ${issue.le}`
        : `le runtime est reparti le ${issue.le} sur la version d'avant (${court(issue.servie)}), sans que la bascule ait noté de refus${cite(dernierMot(issue.fin))}`;
    return `MISE EN SERVICE ÉCHOUÉE, lancée le ${lanceLe} : ${dit} — ${issue.refusee !== null ? "une version corrigée livrée, " : ""}${reprendre}`;
  }
  const reste = avant === null ? "" : ` ; ${court(avant)} reste en service`;
  if (issue.erreur !== null) return `MISE EN SERVICE ÉCHOUÉE, lancée le ${lanceLe} : le geste de box n'a pas pu être lancé (${issue.erreur})${reste} — ${reprendre}`;
  const mot = cite(dernierMot(issue.fin));
  // Sorti en 0 sans rien redémarrer : il n'avait rien à mettre en service.
  if (issue.code === 0) return `la mise en service lancée le ${lanceLe} n'a rien redémarré : le geste de box a rendu 0 le ${issue.le}${mot} — ${reprendre}`;
  const rendu = issue.code === null ? `la main sur ${issue.signal ?? "un signal"}` : `${issue.code}`;
  const sens = issue.code !== null && Object.hasOwn(SENS_DES_CODES, issue.code) ? ` (${SENS_DES_CODES[issue.code]})` : "";
  return `MISE EN SERVICE ÉCHOUÉE, lancée le ${lanceLe} : le geste de box a rendu ${rendu} le ${issue.le}${sens}, sans rien redémarrer${mot}${reste} — une fois levé ce qu'il dit, ${reprendre}`;
}

// Les dernières lignes que le geste a écrites, à montrer sous ce que la file
// en dit : de quoi comprendre sans ouvrir un terminal. Rien quand elles ne
// portent que la ligne déjà citée.
export function direFin({ issue }: GesteRendu): string[] {
  const lignes = lignesDe(issue.fin);
  return lignes.length < 2 ? [] : ["les dernières lignes du geste de box :", ...lignes.map((ligne) => `│ ${ligne}`)];
}

// --- L'essai lancé seul ------------------------------------------------------

// Un commit tel que la ligne de l'essai le cite : court, comme `git log --oneline`.
const sha = (commit: string) => `\`${commit.slice(0, 7)}\``;
const deux = (nombre: number) => String(nombre).padStart(2, "0");

// L'heure d'un instant, à la minute, à l'heure de la box : « 14:02 ».
export const heureMinute = (instant: string): string => {
  const lu = new Date(instant);
  return `${deux(lu.getHours())}:${deux(lu.getMinutes())}`;
};

// Pourquoi un geste n'a pas mis sa version en service, en une ligne : ce que
// la bascule a noté de son refus, sinon ce que dit son code de sortie, et le
// dernier mot du geste.
export function raisonDeLEchec({ issue }: GesteRendu): string {
  if (issue.quoi === "returned") {
    if (issue.refusee !== null) return issue.motif ?? (dernierMot(issue.fin) || "la bascule n'a pas dit pourquoi");
    return `le runtime est reparti sur la version d'avant sans que la bascule ait noté de refus${cite(dernierMot(issue.fin))}`;
  }
  if (issue.erreur !== null) return `le geste de box n'a pas pu être lancé (${issue.erreur})`;
  const mot = cite(dernierMot(issue.fin));
  if (issue.code === 0) return `le geste de box a rendu 0 sans rien redémarrer${mot}`;
  const rendu = issue.code === null ? `la main sur ${issue.signal ?? "un signal"}` : `${issue.code}`;
  const sens = issue.code !== null && Object.hasOwn(SENS_DES_CODES, issue.code) ? ` (${SENS_DES_CODES[issue.code]})` : "";
  return `le geste de box a rendu ${rendu}${sens}${mot}`;
}

// L'essai qui a raté, pour la file : « essai de `2af33f0` raté à 14:02 :
// <raison> — `4e0d0db` reste en service ». Ce qui reste en service est ce que
// le runtime revenu sert, sinon ce qui servait au lancement. Empêché par le
// clone, l'essai n'a rien essayé : la ligne dit quand il se refait.
export function direEssaiRate(geste: GesteRendu): string {
  const essayee = versionRatee(geste);
  const reste = geste.issue.quoi === "returned" ? geste.issue.servie : geste.avant;
  const reessai = reessaiDuClone(geste);
  const suite = reessai === null ? "" : ` ; la version n'y est pour rien — le clone est celui de toute la box —, elle est réessayée seule à ${heureMinute(new Date(reessai).toISOString())}`;
  return `essai de ${essayee === null ? "la version qui attend" : sha(essayee)} raté à ${heureMinute(geste.issue.le)} : ${raisonDeLEchec(geste)}${reste === null ? "" : ` — ${sha(reste)} reste en service`}${suite}`;
}

// L'essai qui tourne : le geste de box est parti, la cuisine ne s'arrête pas.
export function direEssaiEnCours(geste: Geste): string {
  const cible = geste.cible ?? null;
  return `essai de ${cible === null ? "la version qui attend" : sha(cible)} en cours depuis ${heureMinute(geste.lanceLe)} : la box met la version en service et revient seule à ${geste.avant === null ? "la précédente" : sha(geste.avant)} si elle ne démarre pas — aucun cook n'est retenu`;
}

// La version passée en service : « passé en `2af33f0` à 14:02 ».
export const direPassage = (servie: string, le: string): string => `passé en ${sha(servie)} à ${heureMinute(le)}`;
