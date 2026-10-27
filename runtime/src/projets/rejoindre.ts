// Ajouter un ordinateur à un projet qu'une autre station sert déjà (#1789,
// épique #1785) : il rejoint la cuisine qui tourne, il n'en ouvre pas une
// seconde. Deux cuisines d'un même dépôt ne partagent aucun verrou : elles
// prendraient le même ticket, ouvriraient deux PR et répondraient deux fois au
// Kitchen board.
//
// Avant de rien préparer d'un projet que l'app lui demande — qu'elle l'y dise
// principale (une case cochée sur la page de la station) ou non (« + station »
// sur la page du projet, #1830) : ni clone, ni journal, ni décision, ni ligne —,
// la station regarde les stations appairées du
// compte (`appairage/stations-du-chef.ts`, la lecture que `secondaires.ts` fait
// déjà) : chacune publie, dans sa présence, les projets qu'elle sert et leur
// dépôt. L'issue de l'ajout est l'une de trois :
//   - `seule` : aucune autre station ne sert ce dépôt — elle en devient la
//     principale, comme avant ; une ligne qui ne la dit pas principale attend
//     que la sienne le serve ;
//   - `rejointe` : une autre station le sert et se lit en ligne — elle n'en
//     ouvre pas la cuisine : elle publie dans son gist d'appairage
//     (`FICHIER_REJOINTES`) qu'elle la rejoint, et la principale la déclare au
//     journal du projet comme une station de plus (`secondaires.ts`). La
//     principale garde son manager et sa pass ;
//   - `refusee` : elle ne peut pas la rejoindre — GitHub ne dit pas qui le sert,
//     la station qui le sert ne se lit pas en ligne, ou celle-ci n'est pas
//     appairée et la principale ne la verrait pas. `phrase` le dit, en une
//     phrase, en anglais : c'est l'app qui la montre. Rien n'est créé, rien ne
//     part sur GitHub ; elle réévalue à la lecture suivante.
//
// Une station qui sert déjà le projet (sa ligne est dans son bloc) ne se pose
// pas la question : elle le sert.
import type { StationAppairee } from "../appairage/stations-du-chef.ts";
import { capacitesLues } from "./demande.ts";
import { machineDe } from "./preparer.ts";
import { pourquoiPasAtteinte, type LectureDesAppairees } from "./secondaires.ts";

// Écrit par la station seule, dans son gist d'appairage : les cuisines qu'elle
// a rejointes, une par projet.
//   { "brigade": "cuisines-rejointes", "format": 1, "projets": [
//     { "nom": "shop", "depot": "acme/shop", "principale": "box",
//       "cooks": 2, "fournit": ["code", "raisonnement", "macos"] } ] }
// `principale` : la station dont elle a rejoint la cuisine ; `cooks` et
// `fournit` : ce que la principale déclare d'elle au journal du projet.
export const FICHIER_REJOINTES = "brigade-cuisines-rejointes.json";
const FORMAT = 1;

export type CuisineRejointe = { nom: string; depot: string; principale: string; cooks: number; fournit: string[] };

// L'issue d'un ajout, telle que le suivi du projet la publie (`rejoindre`) —
// `seule` n'y paraît pas : le projet est alors préparé comme tout autre.
export type IssueDeLAjout = { issue: "seule" } | { issue: "rejointe"; principale: { nom: string; gist: string } } | { issue: "refusee"; phrase: string };
export type Rejoindre = { issue: "rejointe"; principale: string } | { issue: "refusee"; phrase: string };

const minuscules = (texte: string) => texte.toLowerCase();
const sansPoint = (texte: string) => texte.trim().replace(/[.\s]+$/, "");

// L'issue de l'ajout du dépôt `depot` sur cette station (`soi` : son nom, et son
// gist d'appairage, null tant qu'elle n'est pas appairée). `lecture` : les
// stations appairées du compte, ou la panne qui a empêché de les lire ; null
// quand la station ne les lit pas — elle est alors seule, comme avant.
export function issueDeLAjout(lecture: LectureDesAppairees | { panne: string } | null, depot: string, soi: { nom: string; gist: string | null }): IssueDeLAjout {
  if (lecture === null) return { issue: "seule" };
  const illisible = (raison: string): IssueDeLAjout => ({ issue: "refusee", phrase: `GitHub could not tell whether another station already serves ${depot} (${sansPoint(raison)}), so this computer starts no kitchen for it and asks again at its next reading.` });
  if ("panne" in lecture) return illisible(lecture.panne);
  const { etat } = lecture;
  if (etat.state !== "listed") return illisible(etat.reason);
  // Ce même ordinateur sous un gist plus ancien n'est pas une autre cuisine.
  const ici = machineDe(soi.nom);
  const leServent = etat.stations.filter((station) => station.cooks && station.id !== soi.gist && machineDe(station.name) !== ici && station.projects.some(({ repository }) => repository !== null && minuscules(repository) === minuscules(depot)));
  if (leServent.length === 0) return { issue: "seule" };
  const enLigne = leServent.find((station) => station.online);
  if (enLigne === undefined) {
    const [premiere] = leServent as [StationAppairee];
    const { dit } = pourquoiPasAtteinte(premiere.lastSeen, premiere.stoppedAt);
    return { issue: "refusee", phrase: `${depot} is already served by ${premiere.name}, which is not reached (${dit.replace(/^not reached: /, "")}), so this computer cannot join its kitchen and starts no second one.` };
  }
  if (soi.gist === null) return { issue: "refusee", phrase: `${depot} is already served by ${enLigne.name}, and this computer's station is not paired in the app, so that kitchen cannot see it and this computer starts no second one.` };
  return { issue: "rejointe", principale: { nom: enLigne.name, gist: enLigne.id } };
}

// Ce que le suivi en publie, pour l'app.
export const rejoindreDe = (issue: Exclude<IssueDeLAjout, { issue: "seule" }>): Rejoindre => (issue.issue === "rejointe" ? { issue: "rejointe", principale: issue.principale.nom } : issue);

export function documentDesRejointes(rejointes: readonly CuisineRejointe[]): string {
  return `${JSON.stringify({ brigade: "cuisines-rejointes", format: FORMAT, projets: rejointes }, null, 2)}\n`;
}

// Les cuisines qu'une station dit avoir rejointes. Illisible, ou d'un format
// plus récent : aucune — la principale n'en déclare rien.
export function rejointesLues(brut: string | undefined): CuisineRejointe[] {
  if (brut === undefined) return [];
  let lu: { brigade?: unknown; format?: unknown; projets?: unknown };
  try {
    lu = JSON.parse(brut) as typeof lu;
  } catch {
    return [];
  }
  if (lu === null || typeof lu !== "object" || lu.brigade !== "cuisines-rejointes" || typeof lu.format !== "number" || lu.format > FORMAT || !Array.isArray(lu.projets)) return [];
  return (lu.projets as unknown[]).flatMap((brut) => {
    const { nom, depot, principale, cooks, fournit } = (brut ?? {}) as Record<string, unknown>;
    if (typeof nom !== "string" || typeof depot !== "string" || typeof principale !== "string" || typeof cooks !== "number" || !Number.isSafeInteger(cooks) || cooks < 1) return [];
    return [{ nom, depot, principale, cooks, fournit: capacitesLues(fournit).capacites }];
  });
}
