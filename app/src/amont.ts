// Ce qui est avant le rail (#1836) : un rail vide ne veut pas dire un projet fini. L'app le lit sur le tableau de la
// cuisine (`avantLeRail`, docs/runtime/tableau-de-cuisine.md), que tableau/rail.ts rend dans la forme de la sortie de
// `manager upstream` : les issues ouvertes du dépôt que le rail ne porte pas encore, chacune dans l'un des cinq états
// que la box publie, avec ce qui la retient en une ligne. L'app n'y déduit rien : elle compte ce que la box liste,
// range chaque issue sous le mot qu'elle porte, et pose ce que la box en dit, mot pour mot. Une lecture ratée n'est
// jamais « rien avant le rail ».
// En tête du rail, une petite barre empilée — une part par état, de la longueur de son compte, les comptes au survol —
// qui déplie la colonne Backlog ; et, quand le rail est vide, ce qu'il y a avant lui, et si le manager le lit — son état
// vient de `manager` (manager.ts).
import type { Lecture } from "./box.ts";
import { estHorsLigne, titreDEchec, type Carte } from "./faits.ts";
import { entete, type Entete } from "./fiche.ts";
import { voir as voirManager, type Vu as VuManager } from "./manager.ts";

export const COMMANDE = "manager upstream";

// Une issue telle que le tableau la donne. `priorite` : celle de son label `prio:`, nulle sans.
export type Donnee = { ticket: number; titre: string; url: string; priorite: number | null; etat: string; dit: string };
// La sortie de `manager upstream` : l'heure de la box à la lecture des issues, le dépôt lu, les issues.
export type Amont = { lu: string; depot: string; issues: Donnee[] };

// Les cinq états de la liste fermée (runtime/src/amont.ts, `ETATS_AVANT_LE_RAIL`), dans l'ordre où la barre et la
// colonne les posent, et ce que chacun veut dire en mots simples. Un mot que la box ajouterait se pose après eux, tel
// quel.
export const GROUPES = [
  { etat: "non-lue", nom: "not read yet" },
  { etat: "incomplete", nom: "refused as incomplete" },
  { etat: "epique", nom: "epic, not split yet" },
  { etat: "prete", nom: "ready, not fired" },
  { etat: "mise-de-cote", nom: "set aside" },
] as const;

// Une issue de la colonne : son numéro, son titre, ce qui la retient. `ouvrable` : son issue s'ouvre d'un clic —
// l'adresse reste au process principal. `fiche` : l'en-tête de sa fiche (fiche.ts). `carte` : la carte que la colonne
// Backlog pose, celle du rail — son numéro qui ouvre l'issue, sa priorité, son titre, et sur sa ligne ce qui la retient.
export type Issue = { ticket: number; titre: string; dit: string; ouvrable: boolean; fiche: Entete; carte: Carte };
export type Groupe = { etat: string; nom: string; issues: Issue[] };
// Ce que la vue pose, sans rien calculer : le nombre, les groupes et ce que la barre dit au survol (`survol`) — ou,
// `sans`, pourquoi rien n'est compté. `vide` : ce qui se lit à la place du rail quand aucun ticket n'y est.
// `nonPublie` : le tableau de la cuisine, lu frais, ne porte pas ce qui est avant le rail — rien n'est dit ni compté,
// pas même « pas lu ».
export type Vu = { projet: string; demande: number; a: string; vide: string } & ({ compte: number; lu: string; groupes: Groupe[]; survol: string } | { sans: string } | { nonPublie: true });

class Informe extends Error {}
const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`“${champ}” is not ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "an object");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "a string"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "a non-negative integer"));

// La sortie de `manager upstream`, champ pour champ — ou en quoi elle n'en est pas la forme. Rien
// n'y est complété : un champ qui manque refuse la forme entière ; un champ de plus est laissé de côté.
export function comprendre(sortie: string): Amont | { informe: string } {
  if (sortie.trim() === "") return { informe: "the command returned nothing" };
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return { informe: "it is not JSON" };
  }
  try {
    const racine = objet(lu, "the output");
    const issues = Array.isArray(racine.issues) ? racine.issues : refuser("issues", "a list");
    return {
      lu: texte(racine.lu, "lu"),
      depot: texte(racine.depot, "depot"),
      issues: issues.map((brute: unknown, rang) => {
        const champ = `issues[${rang}]`;
        const issue = objet(brute, champ);
        return {
          ticket: entier(issue.ticket, `${champ}.ticket`),
          titre: texte(issue.titre, `${champ}.titre`),
          url: texte(issue.url, `${champ}.url`),
          priorite: issue.priorite === null ? null : entier(issue.priorite, `${champ}.priorite`),
          etat: texte(issue.etat, `${champ}.etat`),
          dit: texte(issue.dit, `${champ}.dit`),
        };
      }),
    };
  } catch (erreur) {
    if (erreur instanceof Informe) return { informe: erreur.message };
    throw erreur;
  }
}

const ouvrable = (url: string) => URL.parse(url)?.protocol === "https:";

// Les issues rangées sous leur mot, dans l'ordre des groupes, chacune dans l'ordre de la box.
export function grouper(issues: readonly Donnee[]): Groupe[] {
  const mots = [...GROUPES.map(({ etat }) => etat as string), ...new Set(issues.map(({ etat }) => etat))];
  return [...new Set(mots)].flatMap((etat) => {
    const siennes = issues.filter((issue) => issue.etat === etat);
    if (siennes.length === 0) return [];
    const nom = GROUPES.find((groupe) => groupe.etat === etat)?.nom ?? etat;
    return [
      {
        etat,
        nom,
        issues: siennes.map(({ ticket, titre, url, priorite, dit }) => {
          const fiche = entete({ titre, url, prio: priorite });
          return {
            ticket,
            titre,
            dit,
            ouvrable: ouvrable(url),
            fiche,
            carte: { ticket, titre, ouvrable: ouvrable(url), attendu: false, attend: [], dit: [], fiche, ligne: dit, ...(priorite === null ? {} : { prio: `prio:${priorite}` }) },
          };
        }),
      },
    ];
  });
}

const PAS_LU = "what is before the rail was not read";
const PAS_RIEN = "This is not “nothing before the rail”";

// La sortie de la commande, dans une lecture qui en a une.
const sortieDe = (lecture: Lecture) => ("erreur" in lecture ? undefined : comprendre(lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte ?? ""));

// Pourquoi la lecture ne compte rien : une sortie qui n'a pas la forme, ou l'échec de la veille.
// Les codes sont ceux d'une commande du runtime : 1, GitHub ou le journal n'a pas été lu ; 2, elle
// a été refusée — par un runtime d'avant elle, qui ne connaît pas `upstream`. Tout autre vient du
// geste. Le code, c'est l'app qui l'a écrit, au bout de ce que la commande a rendu (box.ts).
function sansLecture(lecture: Lecture, informe: string | undefined): string {
  if (!("erreur" in lecture)) return `${PAS_LU} in what the Kitchen board gave: ${informe ?? "it has no output"}. ${PAS_RIEN}`;
  const code = Number(/→ exit code (\d+)$/.exec(lecture.erreur)?.[1]);
  // Lue du tableau de la cuisine (#1694) : sa raison, en une phrase — aucune station n'a été jointe.
  const pourquoi = lecture.duTableau === true
    ? lecture.erreur.replace(/[.\s]+$/, "")
    : lecture.atteinte && lecture.cas === null && code === 2
      ? "the station's runtime refused `manager upstream` (code 2) — if it is older than this app, it does not know this reading yet: update brigade on the station"
      : lecture.atteinte && lecture.cas === null && code === 1
        ? "the station answered, but `manager upstream` read neither GitHub nor its log (code 1)"
        : titreDEchec(lecture, "REACHED, BUT `manager upstream` DID NOT ANSWER");
  return `${PAS_LU}: ${pourquoi}. ${PAS_RIEN}`;
}

const pluriel = (nombre: number, mot: string) => `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
const detailDe = (groupes: Groupe[]) => groupes.map(({ nom, issues }) => `${issues.length} ${nom}`).join(" · ");

// Ce que la barre dit au survol : le total, puis le compte de chaque état — son seul texte.
function survolDe(issues: number, groupes: Groupe[]): string {
  if (issues === 0) return "nothing before the rail: every open issue of the repository is on it";
  return `${pluriel(issues, "issue")} before the rail — ${detailDe(groupes)}`;
}

// Ce que le manager fait de ce qui est en amont, d'après son état lu — jamais deviné.
function direManager(manager: VuManager | undefined): string {
  if (manager === undefined || "sans" in manager) return "the manager's state was not read: whether it is reading them is not known";
  return manager.interrupteur.allume
    ? "the manager is on: it reads them at each wake-up, judges what it has not read and splits the epics"
    : "the manager is off: it reads none of them, and nothing new enters the rail until you turn it on";
}

// Ce qui se lit à la place du rail quand aucun ticket n'y est : rien avant lui, ce qui est avant lui et ce que le
// manager en fait — ou pourquoi ce qui est avant lui n'a pas été lu.
function direVide(compte: { issues: number; groupes: Groupe[] } | { sans: string }, manager: VuManager | undefined): string {
  if ("sans" in compte) return `nothing on the rail — ${compte.sans}`;
  if (compte.issues === 0) return "nothing on the rail, nothing before it";
  return `nothing on the rail — ${pluriel(compte.issues, "issue")} before it (${detailDe(compte.groupes)}) — ${direManager(manager)}`;
}

// Ce qu'une lecture de ce qui est avant le rail donne à poser, avec le dernier état du manager lu.
export function voir(lecture: Lecture, manager?: VuManager): Vu {
  const { projet, demande, a } = lecture;
  // Le tableau est frais et lisible, mais ne publie pas ce qui est avant le rail : la vue n'en dit rien (#1770). Hors ligne
  // non plus : le rail gardé n'a pas à dire que ce qui est avant lui n'a pas été lu (#1818).
  if (("pasPublie" in lecture && lecture.pasPublie === true) || estHorsLigne(lecture)) return { projet, demande, a, nonPublie: true, vide: "nothing on the rail" };
  const amont = sortieDe(lecture);
  if (amont === undefined || "informe" in amont) {
    const sans = sansLecture(lecture, amont?.informe);
    return { projet, demande, a, sans, vide: direVide({ sans }, manager) };
  }
  const groupes = grouper(amont.issues);
  return { projet, demande, a, compte: amont.issues.length, lu: amont.lu, groupes, survol: survolDe(amont.issues.length, groupes), vide: direVide({ issues: amont.issues.length, groupes }, manager) };
}

// Ce qui est en amont de chaque projet, tenu par le process principal : la dernière lecture, le
// dernier état du manager — de quoi redire la phrase du rail vide quand l'un ou l'autre change —,
// et l'adresse de chaque issue, que la vue ne voit jamais.
export function tenirAmont() {
  const lectures = new Map<string, Lecture>();
  const managers = new Map<string, VuManager>();
  const amonts = new Map<string, Amont>();
  return {
    recevoir(lecture: Lecture): Vu {
      lectures.set(lecture.projet, lecture);
      const lu = sortieDe(lecture);
      if (lu === undefined || "informe" in lu) amonts.delete(lecture.projet);
      else amonts.set(lecture.projet, lu);
      return voir(lecture, managers.get(lecture.projet));
    },
    // Une lecture de `manager` : son état change la phrase du rail vide d'un projet dont l'amont est lu.
    manager(lecture: Lecture): Vu | undefined {
      managers.set(lecture.projet, voirManager(lecture));
      const derniere = lectures.get(lecture.projet);
      return derniere === undefined ? undefined : voir(derniere, managers.get(lecture.projet));
    },
    // Les projets dont l'amont se lit désormais : ce qui a été lu des autres est lâché.
    veiller(projets: readonly string[]): void {
      for (const projet of [...lectures.keys()]) {
        if (projets.includes(projet)) continue;
        lectures.delete(projet);
        amonts.delete(projet);
      }
    },
    // L'adresse de l'issue de ce ticket, telle que la box l'a donnée à la dernière lecture — en https seulement.
    adresse(projet: unknown, ticket: unknown): string | undefined {
      const url = typeof projet === "string" ? amonts.get(projet)?.issues.find((issue) => issue.ticket === ticket)?.url : undefined;
      return url !== undefined && ouvrable(url) ? url : undefined;
    },
  };
}
