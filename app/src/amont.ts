// Ce qui n'est pas encore sur le rail : un rail vide ne veut pas dire un projet fini. L'app le lit
// là où le runtime le donne — `manager upstream` (runtime/src/amont.ts, docs/runtime/manager.md, « En amont
// du rail ») : les issues ouvertes du dépôt que le rail ne porte pas, lues sur GitHub par la box, et
// ce qui arrive à chacune, dans un mot d'une liste fermée, d'après son journal et ses labels. L'app
// n'y déduit rien : elle compte ce que la box liste, range chaque issue sous le mot qu'elle porte,
// et pose ce que la box en dit, mot pour mot. Une lecture ratée n'est jamais « rien à venir ».
// À côté du rail, un nombre — « 23 upcoming » — qui ouvre la liste ; et, quand le rail est vide, ce
// qu'il y a en amont, et si le manager les lit — son état vient de `manager` (manager.ts).
import type { Lecture } from "./box.ts";
import { titreDEchec } from "./faits.ts";
import { entete, type Entete } from "./fiche.ts";
import { voir as voirManager, type Vu as VuManager } from "./manager.ts";

export const COMMANDE = "manager upstream";

// Une issue telle que la box la donne. `priorite` : celle de son label `prio:`, nulle sans.
export type Donnee = { ticket: number; titre: string; url: string; priorite: number | null; etat: string; dit: string };
// La sortie de `manager upstream` : l'heure de la box à la lecture, le dépôt lu, les issues.
export type Amont = { lu: string; depot: string; issues: Donnee[] };

// Les mots de la liste fermée, dans l'ordre où la liste les pose, et ce que chacun veut dire en
// mots simples. Les cinq premiers sont ceux du chef ; les trois suivants, des passages : une issue
// qui entre sur le rail, une épique dont les tickets portent le travail, une issue servie restée
// ouverte. Un mot que la box ajouterait se pose après eux, tel quel.
export const GROUPES = [
  { etat: "non-lue", nom: "not yet read by the manager" },
  { etat: "epique", nom: "epic, not yet split" },
  { etat: "attend", nom: "awaiting your answer — it is also in TODO" },
  { etat: "ecartee", nom: "set aside by the manager" },
  { etat: "sortie", nom: "off the rail — still open" },
  { etat: "en-route", nom: "on its way to the rail" },
  { etat: "decoupee", nom: "epic split — its tickets carry the work" },
  { etat: "servie", nom: "served — its issue is still open" },
] as const;

// Une ligne de la liste : son numéro, son titre, ce que la box en dit. `ouvrable` : son issue
// s'ouvre d'un clic — l'adresse reste au process principal. `fiche` : l'en-tête de sa fiche (fiche.ts).
export type Issue = { ticket: number; titre: string; dit: string; ouvrable: boolean; fiche: Entete };
export type Groupe = { etat: string; nom: string; issues: Issue[] };
// Ce que la vue pose, sans rien calculer : le nombre et la liste — ou, `sans`, pourquoi rien n'est
// compté. `vide` : ce qui se lit à la place du rail quand aucun ticket n'y est.
// `nonPublie` : le tableau de la cuisine, lu frais, ne porte pas ce qui est à venir — rien n'est dit ni compté, pas même « pas lu ».
export type Vu = { projet: string; demande: number; a: string; vide: string } & ({ compte: number; lu: string; groupes: Groupe[] } | { sans: string } | { nonPublie: true });

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
        issues: siennes.map(({ ticket, titre, url, priorite, dit }) => ({
          ticket,
          titre,
          dit,
          ouvrable: ouvrable(url),
          fiche: entete({ titre, url, prio: priorite }),
        })),
      },
    ];
  });
}

const PAS_LU = "what is upcoming was not read";
const PAS_RIEN = "This is not “nothing upcoming”";

// La sortie de la commande, dans une lecture qui en a une.
const sortieDe = (lecture: Lecture) => ("erreur" in lecture ? undefined : comprendre(lecture.sorties.find(({ commande }) => commande === COMMANDE)?.texte ?? ""));

// Pourquoi la lecture ne compte rien : une sortie qui n'a pas la forme, ou l'échec de la veille.
// Les codes sont ceux d'une commande du runtime : 1, GitHub ou le journal n'a pas été lu ; 2, elle
// a été refusée — par un runtime d'avant elle, qui ne connaît pas `upstream`. Tout autre vient du
// geste, ou de `ssh`. Le code, c'est l'app qui l'a écrit, au bout de ce que `ssh` a rendu (box.ts).
function sansLecture(lecture: Lecture, informe: string | undefined): string {
  if (!("erreur" in lecture)) return `${PAS_LU} in what the station returned: ${informe ?? "it has no output"}. ${PAS_RIEN}`;
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

// Ce que le manager fait de ce qui est en amont, d'après son état lu — jamais deviné.
function direManager(manager: VuManager | undefined): string {
  if (manager === undefined || "sans" in manager) return "the manager's state was not read: whether it is reading them is not known";
  return manager.interrupteur.allume
    ? "the manager is on: it reads them at each wake-up, judges what it has not read and splits the epics"
    : "the manager is off: it reads none of them, and nothing new enters the rail until you turn it on";
}

// Ce qui se lit à la place du rail quand aucun ticket n'y est : rien à venir, ce qui est à venir et
// ce que le manager en fait — ou pourquoi ce qui est à venir n'a pas été lu.
function direVide(compte: { issues: number; groupes: Groupe[] } | { sans: string }, manager: VuManager | undefined): string {
  if ("sans" in compte) return `nothing on the rail — ${compte.sans}`;
  if (compte.issues === 0) return "nothing on the rail, nothing upcoming";
  const detail = compte.groupes.map(({ nom, issues }) => `${issues.length} ${nom}`).join(" · ");
  return `nothing on the rail — ${pluriel(compte.issues, "issue")} upcoming (${detail}) — ${direManager(manager)}`;
}

// Ce qu'une lecture de `manager upstream` donne à poser, avec le dernier état du manager lu.
export function voir(lecture: Lecture, manager?: VuManager): Vu {
  const { projet, demande, a } = lecture;
  // Le tableau est frais et lisible, mais ne publie pas ce qui est à venir : la vue n'en dit rien (#1770).
  if ("pasPublie" in lecture && lecture.pasPublie === true) return { projet, demande, a, nonPublie: true, vide: "nothing on the rail" };
  const amont = sortieDe(lecture);
  if (amont === undefined || "informe" in amont) {
    const sans = sansLecture(lecture, amont?.informe);
    return { projet, demande, a, sans, vide: direVide({ sans }, manager) };
  }
  const groupes = grouper(amont.issues);
  return { projet, demande, a, compte: amont.issues.length, lu: amont.lu, groupes, vide: direVide({ issues: amont.issues.length, groupes }, manager) };
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
