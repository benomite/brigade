// La cuisine d'un projet, lue de GitHub seul (#2061) : ses issues, leurs labels et ses PR — rien d'autre. Aucune box ne
// publie plus de tableau de la cuisine ; deux stations qui servent le même projet ne peuvent donc pas se contredire, et
// l'app lit ce que l'une et l'autre lisent :
//   - le rail : les issues ouvertes au label `fire`, chacune dans l'état que ses labels, sa PR et la base disent, avec
//     la station qui la tient (vue/rail/github.ts) ;
//   - ce qui est avant le rail : les autres issues ouvertes, rangées d'après leurs labels seuls (`avantLeRailDe`) ;
//   - TODO : ce qui attend le chef (attente-du-chef.ts, #2460), ajouté par l'appelant (main.ts) — la lecture même que le
//     second relaie à son ouverture.
// Ce qui en sort a la forme que la vue du rail lit (tableau/rail.ts) : l'objet de `facts`, les rubriques et les lignes de
// `status`, l'activité des cooks.
//
// Ni la box ni une station ne sont jointes : rien d'autre que GitHub, par l'appel que la plateforme donne (client.ts).
// Ce qui ne se lit pas le dit, jamais un rail vide : GitHub qui ne répond pas ou refuse — chaque fois un échec, et sa
// raison en une phrase, que l'app montre telle quelle.
import { avecLeRail, lireLeRailSurGithub, SIGNES_PAS_LUS, type SignesDeVie } from "../vue/rail/github.ts";
import type { AppelGitHub, ReponseGitHub } from "./client.ts";
import { lectureConditionnelle, type MemoireDesLectures } from "./rail-github.ts";

// Une rubrique de `status` : son titre, et ses lignes.
export type RubriqueDuTableau = { titre: string; lignes: string[] };
// La ligne `status` d'un ticket du rail, et sa priorité (`prio:<n>`, nulle sans).
export type LigneDuRail = { ticket: number; priorite: number | null; ligne: string };
// Une ligne de la file du chef, comme le bloc `awaiting` de `status` l'écrit (rail.ts, `blocAwaiting`) : ce qui la nomme
// en tête de sa ligne (`#18`), son ticket, son titre, d'où elle vient (attente-du-chef.ts), l'instant où elle a commencé
// d'attendre, et ce qui attend puis le geste du chef.
export type LigneDeLaFile = { nom: string; ticket: number | null; titre: string | null; quoi: string; depuis: string; ligne: string };
// L'objet de `facts`, tel que la vue du rail le lit (faits.ts, `comprendre`).
export type FaitsPublies = { [champ: string]: unknown };
// Ce que fait le cook d'un ticket (vue/activite-du-cook.js) : ce que GitHub en dit — la station qui le tient, depuis sa
// prise, et sa PR. Ni ses gestes, ni ses tours, ni ses tokens : seul le journal de sa station les porte.
export type EtapeDuCook = { fait: string; faitEn: string; cible: string | null; depuis: string };
export type ActiviteDuCook = {
  ticket: number;
  titre: string | null;
  run: string;
  station: string | null;
  lanceLe: string;
  finiLe: string | null;
  fin: string | null;
  maintenant: EtapeDuCook | null;
  etapes: EtapeDuCook[];
  tours: number | null;
  tokens: number | null;
  pr: { numero: number | null; url: string } | null;
};
// Ce qui est avant le rail (#1836) : les issues ouvertes que le rail ne porte pas, chacune dans l'un des cinq états que
// la vue range (amont.ts, `GROUPES`), avec ce qui la retient en une ligne.
export type IssueAvantLeRailPubliee = { ticket: number; titre: string; priorite: number | null; etat: string; dit: string };
export type AvantLeRailPublie = { lu: string; issues: IssueAvantLeRailPubliee[] };

export type TableauLu = {
  lu: true;
  // `<owner>/<repo>`.
  depot: string;
  // L'heure de la lecture : les durées que ses lignes disent se comptent jusqu'à elle.
  luLe: string;
  // Les rubriques de `status` que GitHub dit : le rail et les cooks.
  cuisine: { rubriques: RubriqueDuTableau[] };
  faits: FaitsPublies;
  // Ce qui attend le chef, lu de GitHub (attente-du-chef.ts, `avecLAttenteDuChef`) : la file du bloc `awaiting`, et ce qui
  // n'en est pas une entrée mais que le second doit savoir (`bilans`). Vides tant que cette lecture n'est pas posée.
  file: LigneDeLaFile[];
  bilans: string[];
  lignesDuRail: LigneDuRail[];
  activites: ActiviteDuCook[];
  // Absent quand les issues avant le rail n'ont pas été lues.
  avantLeRail?: AvantLeRailPublie;
};
// `horsLigne` : GitHub n'a pas été joint du tout — pas de réseau, une seule cause (#1818). Ce n'est pas une panne : la vue
// garde le dernier rail lu, et le dit hors ligne. Un GitHub joint qui refuse en est une.
export type TableauNonLu = { lu: false; depot: string; luLe: string; raison: string; horsLigne?: true };
export type LectureDuTableauDuDepot = TableauLu | TableauNonLu;

export type OptionsDeLecture = {
  // `<owner>/<repo>` : le dépôt du projet.
  depot: string;
  appeler: AppelGitHub;
  maintenant?: () => Date;
  // Les réponses gardées avec leur ETag : une relecture que GitHub dit inchangée (304) ne coûte rien.
  memoire?: MemoireDesLectures;
  // Les signes de vie des stations du compte, pour l'onglet Cooks (#2358, vue/cooks/signes-de-vie.ts).
  signes?: () => Promise<SignesDeVie>;
};

const DEPOT = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const LABEL_FIRE = "fire";
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;

// La première phrase de ce que GitHub dit d'un refus, sans son point.
function messageDe(data: unknown): string | null {
  const message = typeof data === "object" && data !== null && "message" in data ? data.message : typeof data === "string" ? data : null;
  if (typeof message !== "string") return null;
  const phrase = (message.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/[.\s]+$/, "");
  return phrase === "" || phrase.length > 200 || phrase.startsWith("<") ? null : phrase;
}

// La raison d'une réponse de GitHub qui n'est pas ce que la lecture du rail demande — ses issues, ses PR, leurs
// commentaires ou la base.
function refusDe(depot: string, { status, data }: ReponseGitHub): string {
  const message = messageDe(data);
  if (status === 401) return `GitHub refused the app's GitHub sign-in (HTTP 401)${message === null ? "" : `: ${message}`} — sign in to GitHub again.`;
  if (status === 404) return `GitHub does not show ${depot} (HTTP 404): the repository is private and this app is not signed in to an account that sees it, or it no longer exists.`;
  return `GitHub refused to read the rail of ${depot} (HTTP ${status})${message === null ? "" : `: ${message}`}.`;
}

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const labelsDe = (issue: Brut): string[] => liste(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
const prioriteDe = (labels: readonly string[]): number | null => {
  const lues = labels.flatMap((label) => { const n = /^prio:(\d+)$/.exec(label)?.[1]; return n === undefined ? [] : [Number(n)]; });
  return lues.length === 0 ? null : Math.min(...lues);
};

// L'état avant le rail d'une issue ouverte sans `fire`, d'après ses labels seuls — la box n'est plus là pour dire ce
// que le manager en a jugé : `served-elsewhere` ou `blocked-on-human`, mise de côté ; `epic`, une épique ; `model:` et
// `effort:`, calibrée et prête ; sinon, pas encore calibrée.
export function avantLeRailDe(labels: readonly string[]): { etat: string; dit: string } {
  if (labels.includes("served-elsewhere")) return { etat: "mise-de-cote", dit: "it carries `served-elsewhere`: this kitchen does not serve it" };
  if (labels.includes("blocked-on-human")) return { etat: "mise-de-cote", dit: "it carries `blocked-on-human`: a human decides" };
  if (labels.includes("epic")) return { etat: "epique", dit: "it carries `epic`: not split yet" };
  const calibrage = labels.filter((label) => label.startsWith("model:") || label.startsWith("effort:"));
  if (calibrage.some((label) => label.startsWith("model:")) && calibrage.some((label) => label.startsWith("effort:"))) {
    return { etat: "prete", dit: `calibrated (${calibrage.join(", ")}), without \`fire\`: the rail takes it once \`fire\` is set` };
  }
  return { etat: "non-lue", dit: "not calibrated yet: no `model:` and `effort:` labels" };
}

// Les issues ouvertes que le rail ne porte pas, dans l'ordre où le manager les lit : `prio:` d'abord, sans priorité en
// dernier ; à priorité égale, la plus ancienne.
async function lireAvantLeRail(depot: string, lire: (chemin: string) => Promise<unknown>, lu: string): Promise<AvantLeRailPublie> {
  const issues: Brut[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const lues = liste(await lire(`/repos/${depot}/issues?state=open&sort=created&direction=asc&per_page=${PAR_PAGE}&page=${page}`));
    issues.push(...lues);
    if (lues.length < PAR_PAGE) break;
  }
  const avant = issues.flatMap((issue) => {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") return [];
    const labels = labelsDe(issue);
    if (labels.includes(LABEL_FIRE)) return [];
    return [{ ticket: issue.number, titre: typeof issue.title === "string" ? issue.title : "", priorite: prioriteDe(labels), ...avantLeRailDe(labels) }];
  });
  avant.sort((a, b) => (a.priorite ?? 10) - (b.priorite ?? 10) || a.ticket - b.ticket);
  return { lu, issues: avant };
}

// La lecture vide d'un projet, à l'heure dite : ce que le rail, TODO et ce qui est avant le rail complètent.
const vide = (depot: string, luLe: string): TableauLu => ({
  lu: true,
  depot,
  luLe,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: luLe, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
});

export async function lireLeTableauDuDepot({ depot, appeler, maintenant = () => new Date(), memoire, signes = async () => SIGNES_PAS_LUS }: OptionsDeLecture): Promise<LectureDuTableauDuDepot> {
  const echec = (raison: string, horsLigne?: true): TableauNonLu => ({ lu: false, depot, luLe: maintenant().toISOString(), raison, ...(horsLigne === undefined ? {} : { horsLigne }) });
  if (!DEPOT.test(depot)) return echec(`The project's repository "${depot}" is not an owner/name GitHub repository, so its rail cannot be read. Its folder has no GitHub \`origin\` remote to take it from: in ~/.config/brigade/app.json, give this project the field "depot" with its GitHub repository as value, for example "depot": "acme/kitchen".`);
  const lecteur = memoire === undefined ? appeler : lectureConditionnelle(appeler, memoire);
  // Ce qui a fait rater la lecture : GitHub pas joint du tout, ou sa première réponse qui n'est pas la liste.
  let injoint = false;
  let refus: ReponseGitHub | undefined;
  const suivi: AppelGitHub = async (chemin, entetes) => {
    const reponse = await lecteur(chemin, entetes).catch((erreur: unknown) => {
      injoint = true;
      throw erreur;
    });
    if (reponse.status !== 200) refus ??= reponse;
    return reponse;
  };
  const luLe = maintenant();
  let lu: TableauLu;
  try {
    lu = avecLeRail(vide(depot, luLe.toISOString()), await lireLeRailSurGithub({ depot, appeler: suivi, maintenant: () => luLe }), await signes());
  } catch (erreur) {
    const dit = (erreur instanceof Error ? erreur.message : String(erreur)).trim().split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    if (injoint) return echec(`GitHub could not be reached to read the rail of ${depot}${dit === "" ? "" : `: ${dit}`}.`, true);
    return echec(refus === undefined ? `The rail of ${depot} was not read from GitHub: ${dit}.` : refusDe(depot, refus));
  }
  // Ce qui est avant le rail ne se lit pas : la vue n'en dit rien, et le rail reste lu.
  const lire = async (chemin: string) => {
    const reponse = await lecteur(chemin);
    if (reponse.status !== 200) throw new Error(`HTTP ${reponse.status}`);
    return reponse.data;
  };
  const avantLeRail = await lireAvantLeRail(depot, lire, lu.luLe).catch(() => undefined);
  return avantLeRail === undefined ? lu : { ...lu, avantLeRail };
}

// Ce que la vue reçoit de l'activité des cooks d'un projet, à chaque lecture de son rail (#1846, vue/activite-du-cook.js) :
// l'heure de la lecture, et ce que GitHub dit de chaque cook.
export type ActivitesPubliees = { projet: string; lu: string; activites: ActiviteDuCook[] };
export function activitesPubliees(projet: string, lu: TableauLu): ActivitesPubliees {
  return { projet, lu: lu.luLe, activites: lu.activites };
}
