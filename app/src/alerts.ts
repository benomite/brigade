// La bande d'alertes d'un projet, en tête de son espace : elle répond à une seule
// question — est-ce que ça peut tourner ? — sur quatre états, ceux des quatre pannes
// silencieuses du 2026-10-13 (docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md) :
// le manager, la cuisine — la version en service n'en est plus une : le paquet de la
// station la met en place lui-même (docs/bascule.md).
// **Une alerte est une chose à faire, jamais une chose à savoir** : chaque ligne dit ce
// qui ne va pas, le geste qui le lève et ce que ce geste coûte. Ce qui va bien ne prend
// pas de place — la bande vide, c'est que les quatre ont été lus, et vont bien. Et ce qui
// ne change rien aux cinq minutes à venir n'y entre jamais : l'âge de la sauvegarde, un
// les transcripts.
// **Le silence est prouvé, jamais supposé** : un état que la box ne dit pas — pas encore
// lu, pas joint, une sortie qui n'a pas la forme, un runtime d'avant le champ — donne une
// ligne « non vérifié » qui le nomme, jamais « tout va bien ». Le manager n'est pas dit par
// la file (#438) : l'app lit elle-même `manager`, pour chaque projet, au rythme de `faits`,
// quel que soit l'onglet affiché. Il n'est « non vérifié » que le temps de la première
// lecture, ou quand cette lecture échoue — et la ligne dit pourquoi.
// D'où vient chaque état : la cuisine de `faits` (facts.ts), la cause d'une
// cuisine retenue des lignes de tête de `status` — celles que le runtime écrit
// d'un titre et d'une valeur (runtime/src/etat.ts, `decrireEtat`) —, le manager de la
// sortie de `manager` (manager.ts). Le setup du projet bloqué est une cause de la cuisine :
// sa ligne de tête dit qu'il l'est, son entrée `setup` du bloc `attend` en dit la cause et le
// geste — c'est elle que la ligne de la bande reprend. Ce que la box dit se pose mot pour mot ; l'app n'y
// ajoute que ses propres mots, à part. Aucun fait nouveau n'est demandé au runtime.
// Un projet installé dit aussi ce qu'il a perdu depuis son installation : une station que la box
// ne fournit plus, un geste de box qui n'y est plus (« Ce qu'un projet installé a perdu », plus
// bas). Ce n'est pas l'écran d'installation qui revient : c'est une ligne de la bande, avec son geste.
// Le geste d'une ligne est collé à l'état qu'il change, sous l'une de ses trois formes : un
// geste du socle (actions.ts), direct ou confirmé — la confirmation dit son prix
// (confirmation.ts) ; ou, quand le lever demande de lire, juger ou agir sur la box à côté du
// runtime — déclarer une station, `claude /login`, `systemctl` —, une demande en prose,
// écrite dans le second sans Entrée (request.ts) : l'app ne la fait jamais partir. Une
// ligne « non vérifié » mène à l'onglet qui lit l'état que la file ne dit pas. Ce module ne lance rien.
// Au-dessus de tout, une ligne à part : l'urgence — plus rien ne cuit, et c'est le chef que toute la
// cuisine attend (« L'urgence », plus bas). Elle vient de `faits`, et la case du projet la dit aussi.
import type { Montree } from "./awaiting.ts";
import type { Failure, Read } from "./box.ts";
import { COMMAND as FACTS, comprendre, duree, estOutsideLine, tick, titreDFailure, type DecisionUrgente, type Facts } from "./facts.ts";
import { COMMAND as MANAGER, managerDe, type Switch } from "./manager.ts";
import { heureHM } from "./format.ts";
import { lineDeLaLimit } from "./vue/banner-limit-github.ts";
import type { Controle, Montree as Verification } from "./service.ts";

// `station` et `box` : ce qu'un projet installé a perdu — une station, un geste de box. `urgence` :
// toute la cuisine attend le chef.
export type Sujet = "urgence" | "github" | "manager" | "cuisine" | "station" | "box" | "renouvellement" | "verification" | "injoignable";
// Ce que le bouton d'une ligne appelle : un geste du socle (actions.ts) ;
// une demande au second, faite de ce que la ligne dit (request.ts) ; un onglet de
// contenu (onglets.ts).
// `relire` : relire la box tout de suite, au lieu d'attendre le tour de la veille (#728).
export type Call = { geste: string } | { demande: true } | { onglet: string } | { relire: true };
// Une ligne de la bande. `verifie` faux : la box ne dit pas cet état, et la ligne le dit.
// `dit` : ce qui ne va pas, dans les mots de l'app ; `pourquoi` : ce qu'elle en sait de plus,
// dans ses mots aussi. `releve` : ce que la box en a écrit, mot pour mot — absent quand elle
// n'en a rien écrit. `geste` : ce qui le lève ; `appel` : ce que son bouton appelle — absent,
// le geste ne se joue pas depuis l'app. `prix` : ce que le geste coûte. `verification` : pour une ligne qui vient d'une vérification,
// le verdict que l'écran Verify pose — la même phrase, les mêmes lignes de manque.
// `bouton` : ce que dit le bouton du geste, en quelques mots — jamais une commande ni une phrase de
// mode d'emploi : celles-là (`geste`, `pourquoi`, `releve`, `prix`) se lisent au survol. Absent, la
// ligne n'a pas de geste à faire depuis l'app. `disjoncteur` : la ligne du disjoncteur ouvert — une information, sans
// bouton : le chef ne le referme pas (#3911) ; le rail ne la pose donc pas (#4238), la bande la dit.
export type Alert = { sujet: Sujet; verifie: boolean; ton: string; dit: string; pourquoi?: string; consignes?: string[]; releve?: string; geste: string; bouton?: string; appel?: Call; prix: string; verification?: Verification; disjoncteur?: true };
// La bande d'un projet : vide, les quatre états ont été lus, et vont bien.
// Ce que la bande d'un projet dit de lui sur sa case de la barre : toute la cuisine qui l'attend, une
// chose à faire, ou rien de vérifié. Une bande vide n'a pas de signal — c'est que les quatre états
// ont été lus, et vont bien.
export type Signal = { etat: "urgence" | "alerte" | "non-verifie" | "injoignable"; dit: string };
// L'état de l'interrupteur du projet, pour l'interrupteur de son espace (#906, #1406) : allumé ou
// éteint, tel qu'il vient d'être lu — sans le délai d'affichage d'une ligne de la bande. Un seul pour
// tout le projet : le manager le suit, et c'est sa ligne qui le dit (runtime/src/manager-cli.ts) —
// allumé, les tickets lancés sont pris, le manager juge et découpe, une livraison verte est mergée.
// `dit` : ce que la tête du rail en dit, éteint — la même phrase que la ligne de la bande.
// `releve` : la ligne `manager` du runtime, mot pour mot, que l'interrupteur montre au survol.
// `sans` : pourquoi il n'est pas lu — ce n'est jamais « éteint ».
export type StateDuManager = { allume: boolean; dit?: string; releve: string } | Sans;
// `horsLigne` : l'app n'a pas joint GitHub depuis cet instant (#1818) — la bande est alors vide, sans signal.
export type Bande = { projet: string; alertes: Alert[]; signal?: Signal; manager?: StateDuManager; horsLigne?: string };

// Un état que l'app n'a pas : pourquoi, dans ses mots.
export type Sans = { sans: string };
// Ce que la bande lit d'un projet. `status` : sa sortie, le bloc `attend` mis à part ou non ;
// `attend` : ce bloc, quand il a été mis à part (awaiting.ts, `mettreAPart`).
// `controle` : ce que la box a dit d'un projet installé, ses stations et ses manques (service.ts) —
// absent, rien n'en a été lu : un projet pas encore installé, ou pas encore contrôlé.
export type Lu = { projet: string; faits: Facts | Sans; status: string | Sans; attend?: string; manager: Switch | Sans; controle?: Controle; limite?: LimitDeLApp };

// Ce que l'app a lu de sa propre limite : GitHub refuse ses appels, et `reprise` est l'instant où il les rend, nul s'il ne le dit pas.
export type LimitDeLApp = { reprise: string | null };

const s = (combien: number) => (combien > 1 ? "s" : "");
const court = (commit: string) => commit.slice(0, 12);
const AUCUN = "none: nothing changes on the station";
const LIRE = "none: reading changes nothing on the station";
const REREAD_FACTS = `wait for it to be read: \`${FACTS}\` is re-read every 30 s`;
// Le geste d'une ligne qui demande de lire, de juger ou d'agir sur la box : une demande au second.
const REQUEST = { demande: true } as const;

// Une ligne « non vérifié » : l'état n'est pas dit, et ce n'est pas « sain ».
type NonDit = { pourquoi: string; releve?: string; geste: string; prix: string; appel?: Call };
const nonVerifie = (sujet: Sujet, dit: string, { pourquoi, releve, geste: action, prix, appel: call }: NonDit): Alert => ({
  sujet,
  verifie: false,
  ton: "gris",
  dit,
  pourquoi,
  ...(releve === undefined ? {} : { releve }),
  geste: action,
  ...(call === undefined ? {} : { appel: call }),
  prix,
});

// --- La limite d'appels de GitHub --------------------------------------------------
//
// La box et l'app parlent à GitHub avec le même compte : la limite est la même pour les deux. La box
// la dit dans `faits` (`limiteGithub`, lu sur le compteur de la station) ; l'app, elle, la lit de sa
// propre erreur de limite (stations/stations.ts) — c'est elle qui reste quand la box ne passe plus
// par GitHub. Une seule ligne, l'heure de reprise à l'heure locale du chef, jamais le texte de `gh`.
// Elle n'attend rien du chef : elle tombe d'elle-même quand les appels reprennent.
function deLaLimit(facts: Facts | Sans, limit: LimitDeLApp | undefined): Alert[] {
  // La box dit laquelle, depuis quand et retour vers quand (`github`, ticket 2147) : sa ligne prend la place de celle qui ne dit que la reprise.
  if (!("sans" in facts) && facts.github !== undefined) return [{ sujet: "github", verifie: true, ton: "jaune", ...lineDeLaLimit(facts.github), geste: "nothing to do: the calls resume by themselves when GitHub lifts the limit", prix: AUCUN }];
  const resumption = limit !== undefined ? limit.reprise : "sans" in facts ? null : (facts.limiteGithub ?? null);
  if (limit === undefined && ("sans" in facts || facts.limiteGithub === undefined)) return [];
  return [
    {
      sujet: "github",
      verifie: true,
      ton: "jaune",
      dit: `GitHub is rate-limiting calls, back around ${resumption === null ? "a time GitHub does not give" : heureHM(resumption)}`,
      geste: "nothing to do: the calls resume by themselves when GitHub lifts the limit",
      prix: AUCUN,
    },
  ];
}

// Le rythme des écritures de la box (#2226) : `status` le dit sur sa ligne `github` (`held by the GitHub
// write budget — N of 450 in the last hour, next write at HH:MM`). GitHub n'a rien refusé : la box
// retient ses propres écritures, et la ligne tombe d'elle-même quand la fenêtre le permet.
const ECRITURES_RETENUES = /^held by the GitHub write budget(?![\p{L}\p{N}_])/u;
function desEcrituresRetenues(status: string | Sans): Alert[] {
  const lu = statusLu(status);
  if (typeof lu !== "string") return [];
  return tetesDe(lu)
    .filter(({ titre, valeur }) => titre === "github" && ECRITURES_RETENUES.test(valeur))
    .map(({ valeur }): Alert => ({
      sujet: "github",
      verifie: true,
      ton: "jaune",
      dit: valeur,
      pourquoi: "the box paces its own writes to GitHub to stay under its limits: no cook is lost, the writes wait their turn",
      geste: "nothing to do: the writes resume by themselves at the time given",
      prix: AUCUN,
    }));
}

// --- L'urgence ----------------------------------------------------------------
//
// Plus rien ne cuit, et c'est le chef que toute la cuisine attend (runtime/src/urgence.ts) : pas une
// panne parmi d'autres, la seule chose qui, faite, relance tout. Sa ligne passe au-dessus de toutes
// les autres, marquée à part. Elle dit qui attend quoi — la décision qui retient le plus de tickets —,
// depuis combien de temps tout est à l'arrêt — un âge entre deux heures de la box —, les tickets
// retenus, et la ligne du bloc `attend` de chaque décision en cause, mot pour mot : ce qui attend,
// puis le geste. Chacune garde aussi sa carte dans T'attend. Une décision qui ne retient qu'une partie
// du rail n'est pas une urgence : la box n'en donne pas, rien ne se dit ici — et un runtime d'avant le
// champ n'en dit rien non plus : ce qu'il ne donne pas, les autres lignes le disent déjà.

// Ce que la cuisine attend du chef, d'après le mot de la cause (runtime/src/etat.ts,
// `CAUSES_D_URGENCE`) et ce qui nomme la décision. Un mot que l'app n'a pas ici se dit tel quel.
const ATTENDU: ReadonlyMap<string, (decision: string) => string> = new Map([
  ["merge", (decision: string) => `your merge of ${decision}`],
  ["remontée", (decision: string) => `your decision on ${decision}, escalated by the pass`],
  ["PR fermée", (decision: string) => `your decision on ${decision}, whose PR was closed`],
  ["connexion", (station: string) => `you to reconnect Max on ${station}`],
  ["session", () => "you to reconnect the Max session"],
  ["base rouge", () => "you to clear the red base"],
  ["setup", () => "you to unblock the project setup"],
]);
const attendu = ({ decision, cause }: DecisionUrgente) => ATTENDU.get(cause)?.(decision) ?? `you on ${decision} (${cause})`;
// Une décision en cause, comme le bloc `attend` l'écrit : ce qui la nomme, puis sa ligne.
const enCause = ({ decision, geste: action }: DecisionUrgente) => `${decision}  ${action}`;

function deLUrgence(facts: Facts | Sans): Alert[] {
  if ("sans" in facts || facts.urgence == null) return [];
  const urgence = facts.urgence;
  const { retenus, autres } = urgence;
  const aussi = autres.length === 0 ? "" : ` — also held by ${autres.map(({ decision }) => decision).join(", ")}`;
  return [
    {
      sujet: "urgence",
      verifie: true,
      ton: "rouge",
      dit: `the whole kitchen is waiting for ${attendu(urgence)} — at a standstill for ${duree(Date.parse(facts.lu) - Date.parse(urgence.depuis))}`,
      pourquoi: `${retenus.length} ticket${s(retenus.length)} held, none can cook until you act: ${retenus.map((ticket) => `#${ticket}`).join(", ")}${aussi}`,
      releve: [urgence, ...autres].map(enCause).join("\n"),
      geste: `do what ${urgence.decision} waits for, as the station writes it`,
      appel: REQUEST,
      prix: "none: nothing is cooking — once you act, the held tickets start again, on your quota",
    },
  ];
}

// Une décision du chef qui ne retient que ses tickets : la cuisine n'est pas à l'arrêt, et la ligne
// ne le dit jamais — « toute la cuisine » n'est que dans l'urgence, quand rien ne peut cuire. Elle
// nomme la décision et combien de tickets elle retient vraiment, ceux qui l'attendent.
function desRetenues(facts: Facts | Sans): Alert[] {
  if ("sans" in facts || facts.urgence != null) return [];
  return (facts.retenues ?? []).map((retenue) => ({
    sujet: "cuisine",
    verifie: true,
    ton: "jaune",
    dit: `waiting for ${attendu(retenue)}: ${retenue.retenus.length} ticket${s(retenue.retenus.length)} held, the other tickets keep cooking`,
    pourquoi: `held by ${retenue.decision}: ${retenue.retenus.map((ticket) => `#${ticket}`).join(", ")}`,
    releve: enCause(retenue),
    geste: `do what ${retenue.decision} waits for, as the station writes it`,
    prix: "none: the held tickets start again once you act, on your quota",
  }));
}

// --- L'interrupteur GitHub seul refusé ----------------------------------------------
//
// Le projet est servi sur GitHub seul et le runtime a refusé cet état : il ne cuit rien tant que la raison tient, et
// ne le dit que dans son log. `facts` porte la raison (`githubSeul`, ticket 2161) ; la ligne la redit, en tête.
function duRefusalDeGitHubOnly(facts: Facts | Sans): Alert[] {
  if ("sans" in facts || facts.githubSeulRefuse === undefined) return [];
  const { reason } = facts.githubSeulRefuse;
  return [
    {
      sujet: "cuisine",
      verifie: true,
      ton: "jaune",
      dit: `GitHub-only state refused: ${reason} — nothing is cooked for this project`,
      pourquoi: "the project's state lives on GitHub only, and this runtime refuses to serve it, so it takes no ticket",
      geste: "lift what the runtime refuses, then restart it",
      prix: AUCUN,
    },
  ];
}

// --- Le manager ---------------------------------------------------------------

// L'interrupteur du projet (#1406) : le manager le suit, et sa ligne le dit. Tant que la file ne porte
// pas son état (#438), l'app le lit elle-même : avant sa première lecture, il n'est pas dit.
export const MANAGER_PAS_DIT = "first reading of `manager` in progress: the queue does not say whether the project is on (#438). This is not “on”";
// docs/runtime/manager.md, « Le manager » : ce qu'allumer engage (allumage.ts, `AVERTISSEMENT`).
const PRIX_ALLUMER = "the manager judges the whole open backlog, what it judges executable is taken at once, and green deliveries are merged — what that commits is counted when you act";

// Éteint, ce que la tête du rail en dit, et la ligne de la bande : une seule phrase, la même partout.
export const MANAGER_ETEINT = "project off — nothing new is taken, split or merged";
// La ligne `manager` telle que le runtime l'écrit.
const releveDe = ({ mot: word, depuis, par, dit }: Switch) => `${word}${depuis === undefined ? "" : ` since ${depuis} (by ${par})`} — ${dit}`;

// Éteint, le projet reste une ligne de la bande : c'est elle qui fait le signal de la case du projet,
// dans la barre. Dans l'espace du projet, la vue ne la pose pas : son interrupteur et la tête du rail
// le disent (#906, #1406) — `manager`, sur la bande.
function duManager(manager: Switch | Sans): Alert[] {
  if ("sans" in manager) return [nonVerifie("manager", "project switch not verified", { pourquoi: manager.sans, geste: "wait for it to be read: `manager` is re-read every 30 s", prix: LIRE })];
  if (manager.allume) return [];
  return [
    {
      sujet: "manager",
      verifie: true,
      ton: "rouge",
      dit: MANAGER_ETEINT,
      releve: releveDe(manager),
      geste: "switch the project on",
      appel: { geste: "projet-allumer" },
      prix: PRIX_ALLUMER,
    },
  ];
}
const stateDuManager = (manager: Switch | Sans): StateDuManager => ("sans" in manager ? manager : { allume: manager.allume, ...(manager.allume ? {} : { dit: MANAGER_ETEINT }), releve: releveDe(manager) });

// --- La cuisine -------------------------------------------------------------

// Une ligne de tête de `status` : son titre, sa valeur, et les lignes qui la précisent
// (runtime/src/etat.ts, `ligne` : le titre complété d'espaces jusqu'à onze caractères).
type Tete = { titre: string; valeur: string; suite: string[] };
const LINE_DE_TETE = /^(\S+) +(\S.*)$/;
const SUITE_DE_TETE = /^ {11}(\S.*)$/;

// Les lignes de tête de `status` : celles d'avant sa première ligne vide.
export function tetesDe(status: string): Tete[] {
  const tetes: Tete[] = [];
  for (const line of status.split("\n")) {
    if (line.trim() === "") break;
    const [, titre, valeur] = LINE_DE_TETE.exec(line) ?? [];
    const [, suite] = SUITE_DE_TETE.exec(line) ?? [];
    if (titre !== undefined && valeur !== undefined) tetes.push({ titre, valeur, suite: [] });
    else if (suite !== undefined) tetes.at(-1)?.suite.push(suite);
  }
  return tetes;
}

// Ce que la valeur d'une ligne dit de la panne, et le geste qu'elle nomme après ` : ` (ou, en
// anglais, `: `) — la forme des lignes `stations` et `connection` (`connexion`, #928). Sans geste
// nommé, la ligne entière.
function coupee(valeur: string): { releve: string; geste?: string } {
  const francais = valeur.lastIndexOf(" : ");
  if (francais !== -1) return { releve: valeur.slice(0, francais), geste: valeur.slice(francais + 3) };
  const anglais = valeur.lastIndexOf(": ");
  return anglais === -1 ? { releve: valeur } : { releve: valeur.slice(0, anglais), geste: valeur.slice(anglais + 2) };
}

const REPRENDRE = "queued tickets start again at once, on your quota";
// Ce que coûte le redémarrage du runtime : la box ne dit pas ce qui est en vol.
const REDEMARRAGE = "a runtime restart: what is in flight is interrupted — the station does not say what is";
// Le disjoncteur ouvert, tel que la ligne `cuisine` / `kitchen` de `status` le dit : en français
// ou en anglais (#928).
const RED = /^(?:ROUGE|RED)(?![\p{L}\p{N}_])/u;
const BREAKER = /disjoncteur OUVERT|breaker OPEN/;
// Pourquoi il s'est ouvert, en clair sur la ligne : le nombre de lancements échoués de suite que `status` écrit — « the latest
// launches failed in a row » quand la ligne ne le dit pas.
const FAILURES_DE_SUITE = /(\d+) (?:échecs? (?:de suite|d.affilée)|failures? in a row)/;
function enchaines(valeur: string): string {
  const n = FAILURES_DE_SUITE.exec(valeur)?.[1];
  return n === undefined ? "the latest launches failed in a row" : `${n} launch${n === "1" ? "" : "es"} failed in a row`;
}
// L'interrupteur du projet éteint (#1406), tel que la ligne `kitchen` le dit : la ligne du projet
// éteint le dit déjà (`duManager`), une seule fois.
const ETEINT = /^SWITCHED OFF(?![\p{L}\p{N}_])/u;
const eteintLeProject = (status: string) => tetesDe(status).some(({ titre, valeur }) => KITCHEN.includes(titre) && ETEINT.test(valeur));
// Les titres des lignes de tête que #928 a traduits : l'app lit les deux.
export const KITCHEN = ["cuisine", "kitchen"];
export const CONNECTION = ["connexion", "connection"];

// Ce qui retient la cuisine, d'après les lignes de tête de `status` : une ligne par cause
// que l'app sait lire.
function causesDeRetenue(status: string): Alert[] {
  return tetesDe(status).flatMap(({ titre, valeur, suite }): Alert[] => {
    if (KITCHEN.includes(titre) && BREAKER.test(valeur))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: `breaker open: ${enchaines(valeur)}, no cook goes any more`,
          releve: valeur.slice(valeur.search(BREAKER)),
          geste: "nothing to press: the station closes the breaker itself once the check that tripped it passes",
          prix: "none",
          disjoncteur: true,
        },
      ];
    if (titre === "stations") {
      const { releve, geste: action } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "no station declared: no cook goes, the kitchen is frozen", releve, geste: action ?? "declare a station, then restart the runtime", appel: REQUEST, prix: REDEMARRAGE }];
    }
    if (CONNECTION.includes(titre)) {
      const { releve, geste: action } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "Max connection down: no ticket is taken any more", releve, geste: action ?? "reconnect, then resume the kitchen", appel: REQUEST, prix: REPRENDRE }];
    }
    if (titre === "base" && RED.test(valeur))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "base red: the station takes no more tickets, the pass neither judges nor merges",
          releve: [valeur, ...suite].join("\n"),
          geste: "clear what makes it red, then replay its gates — its last line gives the action",
          appel: REQUEST,
          prix: "no cook is interrupted: its gates are replayed",
        },
      ];
    return [];
  });
}

// Le statut lu d'un projet, ou pourquoi il ne l'est pas.
const NO_KITCHEN = "the output of `status` has no `kitchen` line: this is not a shape the app can read";
function statusLu(status: string | Sans): string | Sans {
  if (typeof status !== "string") return status;
  return tetesDe(status).some(({ titre }) => KITCHEN.includes(titre)) ? status : { sans: NO_KITCHEN };
}

// --- Le setup du projet -------------------------------------------------------

// La ligne de tête `setup` de `status` (runtime/src/etat.ts, `decrireSetup`) : `BLOCKED for …
// on <commit> — …` (`BLOQUÉ depuis …` avant #928). Absente, le setup du projet n'est pas bloqué : rien à dire.
const SETUP_BLOCKED = /^(?:BLOQUÉ|BLOCKED)(?![\p{L}\p{N}_])/u;
const blocksTheSetup = (status: string) => tetesDe(status).some(({ titre, valeur }) => titre === "setup" && SETUP_BLOCKED.test(valeur));

// L'entrée `setup` du bloc `attend` (runtime/src/attend.ts, `decrireAttentes`) : deux espaces,
// `setup`, deux espaces, depuis quand, deux espaces, puis la cause et le geste — c'est ce qui en
// est repris, mot pour mot, avec les lignes qui la précisent, sans leur retrait. Rien quand le
// texte n'en a pas. Depuis quand se dit `depuis …` ou `for …` (#927).
const TETE_DE_SETUP = /^ {2}setup {2}(?:(?:depuis|for) \S.*? {2})?(\S.*)$/;
const SUITE_D_ENTREE = /^ {6}(\S.*)$/;
export function entreeDeSetup(texte: string): string | undefined {
  const lines = texte.split("\n");
  const rang = lines.findIndex((line) => TETE_DE_SETUP.test(line));
  const [, line] = TETE_DE_SETUP.exec(lines[rang] ?? "") ?? [];
  if (line === undefined) return undefined;
  const suite: string[] = [];
  for (const suivante of lines.slice(rang + 1)) {
    const [, precise] = SUITE_D_ENTREE.exec(suivante) ?? [];
    if (precise === undefined) break;
    suite.push(precise);
  }
  return [line, ...suite].join("\n");
}

// Le setup du projet bloqué : plus aucun worktree n'est préparé sur la box, pour aucun ticket,
// tant que la branche d'intégration ne bouge pas. La ligne reprend ce que le runtime en dit dans
// sa file — la cause en clair, et le geste —, et sort d'elle-même quand il ne le dit plus. Une
// station distante, qui prépare son setup sur son poste, cuisine encore : la cuisine est alors
// ouverte, et la ligne le dit, moins grave.
const LEVER_LE_SETUP = "clear its cause as the station says — declare the refused host in `.claude/brigade/reseau` of the project, or fix the project's setup — then merge on the integration branch";
const PRIX_DU_SETUP = "no cook is interrupted: the setups resume by themselves once the integration branch moves";
function duSetup(facts: Facts | Sans, status: string | Sans, awaiting: string | undefined): Alert[] {
  const lu = statusLu(status);
  if (typeof lu !== "string" || !blocksTheSetup(lu)) return [];
  const entree = entreeDeSetup(awaiting ?? lu);
  const ailleurs = !("sans" in facts) && facts.etat === "ouverte";
  return [
    {
      sujet: "cuisine",
      verifie: true,
      ton: ailleurs ? "jaune" : "rouge",
      dit: ailleurs
        ? "project setup impossible: no worktree is set up on its main station, for any ticket — only a remote station still cooks"
        : "project setup impossible: no worktree is set up, no cook goes, for any ticket",
      // Sans l'entrée du bloc, la ligne de tête : elle renvoie au bloc, qui n'a pas été lu.
      ...(entree === undefined ? { pourquoi: "its cause and its action are in the `attend` block of `status`, which this reading does not carry", releve: tetesDe(lu).find(({ titre }) => titre === "setup")?.valeur ?? "" } : { releve: entree }),
      geste: LEVER_LE_SETUP,
      appel: REQUEST,
      prix: PRIX_DU_SETUP,
    },
  ];
}

function ofTheKitchen(project: string, facts: Facts | Sans, status: string | Sans): Alert[] {
  if ("sans" in facts) return [nonVerifie("cuisine", "kitchen state not verified", { pourquoi: facts.sans, geste: REREAD_FACTS, prix: LIRE })];
  switch (facts.etat) {
    case "ouverte":
      return [];
    case "éteinte":
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "runtime stopped: nothing is running, no ticket is taken",
          pourquoi: tick(facts),
          geste: `start it on the station: \`systemctl start brigade@${project}\``,
          appel: REQUEST,
          prix: "no cook is interrupted: nothing is running — queued tickets start again, on your quota",
        },
      ];
    case "arrêtée":
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: REPRENDRE }];
    case "retenue": {
      const lu = statusLu(status);
      const causes = typeof lu === "string" ? causesDeRetenue(lu) : [];
      // Retenue par le seul setup bloqué, ou par l'interrupteur du projet éteint : leur ligne le dit déjà.
      // Sans `status` lu, rien ne dit qu'une cause est seule à la retenir.
      if (typeof lu === "string" && (causes.length > 0 || blocksTheSetup(lu) || eteintLeProject(lu))) return causes;
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "jaune",
          dit: "kitchen held: it is running, but no cook goes any more",
          pourquoi: typeof lu === "string" ? "`status` gives no cause the app can read" : `its cause was not read: ${lu.sans}`,
          geste: "read its cause: `status`, in the panel",
          appel: REQUEST,
          prix: LIRE,
        },
      ];
    }
    default:
      return [nonVerifie("cuisine", "kitchen state not verified", { pourquoi: `the kitchen is “${facts.etat}” according to \`${FACTS}\`, a word the app does not know`, geste: "update the app", prix: AUCUN })];
  }
}

// --- Ce qu'un projet installé a perdu ---------------------------------------------
//
// Une fois l'installation terminée, l'écran d'installation ne revient jamais (service.ts,
// `termine`) : ce que le projet perd ensuite se dit ici, comme une alerte, avec son geste. La box
// le dit par deux commandes du runtime, que l'app relit pour un projet installé (service.ts,
// `controler`) : `installation stations --json` — les stations que la machine fournit, celles
// que le projet déclare — et `installation`, dont chaque ligne `MANQUE` porte la flèche du geste
// qui la lève. Deux pertes s'en lisent :
//   une station    déclarée sur cette machine, et que la box ne fournit plus — son moteur n'y est
//                  plus trouvé ; ou plus aucune station déclarée
//   un geste de box  le geste d'installation, que la vérification dit manquer — la flèche le
//                  rattache à sa section de docs/installer.md
// Le reste de ce que `installation` dit manquer n'entre pas ici : c'est l'installation qui le
// règle, ou une autre ligne de la bande qui le dit déjà. Rien de lu, rien de dit : un contrôle
// qui n'a pas pu se faire n'invente aucune perte — et la box pas jointe, les autres lignes le disent.

// Les gestes de box, par la section de docs/installer.md que la flèche de leur manque nomme
// (runtime/src/installation.ts, `jugerReglageDuGeste`), et ce que
// leur absence empêche, en mots simples.
const ACTIONS_DE_BOX = [
  { section: "« Le geste d'installation »", nom: "install a project", empeche: "installing a project on this station by its installation action would be refused" },
] as const;
const SUR_LA_BOX = "the station itself: whoever has `sudo` there runs it — the app sends nothing";
const RECONTROLE = "the alert leaves once the station says it is back: the app checks again every 5 min, and when this space opens";

// Combien de passages de suite le renouvellement de la session Max peut rater avant que la bande
// le dise : un seul échec peut être un accident, deux de suite sont un renouvellement qui ne se
// rétablit pas. À changer ici, nulle part ailleurs.
export const FAILURES_POUR_ALERTER = 2;

// Le renouvellement en échec répété : la ligne reste tant que la vérification le dit, et sort au
// premier passage réussi. L'échéance de la session n'est pas relue ici : une session tombée, la
// file le dit d'elle-même (une station déconnectée).
// Le verdict d'une vérification lue, joint à la ligne qui en vient — pas une panne : celle-là a sa ligne.
const verdictDe = (controle: Controle): { verification?: Verification } => {
  const { verification } = controle;
  return verification !== undefined && (verification.etat === "pret" || verification.etat === "pas-pret") ? { verification } : {};
};

// Une vérification plantée : un problème de brigade, pas du projet — le chef n'a rien à faire, et la
// ligne ne lui demande rien. Elle sort au premier contrôle qui va au bout.
function dUneOutage(controle: Controle | undefined): Alert[] {
  const verification = controle?.verification;
  if (verification === undefined || verification.etat !== "plantee") return [];
  return [
    {
      sujet: "verification",
      verifie: true,
      ton: "jaune",
      dit: verification.titre,
      geste: "nothing to do: this is on brigade, which fixes it — the check is replayed by itself",
      prix: AUCUN,
      verification,
    },
  ];
}

function duRenouvellement(controle: Controle | undefined): Alert[] {
  const failure = controle?.renouvellement;
  if (failure === undefined || failure.echecs < FAILURES_POUR_ALERTER) return [];
  return [
    {
      sujet: "renouvellement",
      verifie: true,
      ton: "rouge",
      dit: `Max renewal failing: ${failure.echecs} runs in a row — the session will expire if it is not restored`,
      releve: failure.raison,
      geste: "`journalctl -u brigade-renouvellement.service` on the station says more; fix what it names",
      appel: REQUEST,
      prix: `none for the kitchen: it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
      ...(controle === undefined ? {} : verdictDe(controle)),
    },
  ];
}

function desPertes(controle: Controle | undefined, status: string | Sans): Alert[] {
  if (controle === undefined) return [];
  const { stations, manques = [] } = controle;
  const pertes: Alert[] = [];
  if (stations !== undefined) {
    const fournies = new Set(stations.proposees.map(({ nom: name }) => name));
    // Une station distante tourne sur un poste : ce que cette machine fournit n'en dit rien.
    for (const { nom: name, moteur: engine } of stations.declarees.filter(({ distante: remote }) => !remote)) {
      // Le manque qui dit son moteur introuvable par le service : la station ne lance rien, même
      // si la commande qui la propose le trouve encore — et il porte le geste qui le remet, mot pour mot.
      const introuvable = manques.find(({ texte }) => texte.startsWith(`\`${engine}\` est introuvable`));
      if (fournies.has(name) && introuvable === undefined) continue;
      const releve = introuvable?.texte ?? stations.absent;
      pertes.push({
        sujet: "station",
        verifie: true,
        ton: "rouge",
        dit: `station “${name}” missing: its main station no longer provides it — no cook goes there`,
        ...(releve === null ? {} : { releve }),
        geste: introuvable?.geste ?? `put \`${engine}\` back on the station, where the service finds it — \`installation\` there gives the exact command`,
        appel: REQUEST,
        prix: `none for the kitchen: it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
        ...verdictDe(controle),
      });
    }
  }
  // Plus aucune station déclarée : la ligne `stations` de `status`, quand elle est lue, le dit déjà.
  const ditParStatus = typeof status === "string" && tetesDe(status).some(({ titre }) => titre === "stations");
  const sansStation = manques.find(({ etape: step }) => step === "stations");
  if (sansStation !== undefined && !ditParStatus && (stations === undefined || stations.declarees.length === 0)) {
    pertes.push({
      sujet: "station",
      verifie: true,
      ton: "rouge",
      dit: "no station declared any more: no cook goes, tickets wait on the rail",
      releve: sansStation.texte,
      geste: sansStation.geste ?? "declare a station again: `installation stations` on its main station lists those it provides",
      appel: REQUEST,
      prix: `none: the declaration is read at the runtime's next wake-up, without a restart; ${RECONTROLE}`,
      ...verdictDe(controle),
    });
  }
  for (const { section, nom: name, empeche } of ACTIONS_DE_BOX) {
    const manque = manques.find(({ geste: action }) => action?.includes(section));
    if (manque === undefined) continue;
    pertes.push({
      sujet: "box",
      verifie: true,
      ton: "jaune",
      dit: `station action “${name}” missing: ${empeche}`,
      releve: manque.texte,
      geste: manque.geste ?? `set it up again on the station — docs/installer.md, ${section}`,
      appel: REQUEST,
      prix: `none: no cook is interrupted — it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
      ...verdictDe(controle),
    });
  }
  return pertes;
}

// Le mot du bouton d'un geste, d'après ce que l'alerte appelle : le geste du socle par son nom, une
// demande au second, un onglet. Un geste que l'app ne sait pas nommer garde le début de sa phrase,
// avant tout ce qui ressemble à une commande ou à une explication.
const BOUTONS_DE_ACTION: Readonly<Record<string, string>> = { "projet-allumer": "switch the project on", reprendre: "resume the kitchen" };
export function buttonDe({ geste: action, appel: call }: Pick<Alert, "geste" | "appel">): string | undefined {
  if (call === undefined) return undefined;
  if ("demande" in call) return "ask the second";
  if ("onglet" in call) return call.onglet === "parametres" ? "open Settings" : `open the ${call.onglet} tab`;
  if ("relire" in call) return "try again now";
  return BOUTONS_DE_ACTION[call.geste] ?? (action.split(/[:,—`]/)[0] ?? action).trim();
}
const avecButton = (alert: Alert): Alert => {
  const button = buttonDe(alert);
  return button === undefined ? alert : { ...alert, bouton: button };
};

// La bande d'un projet, d'après ce qui en a été lu : l'urgence, le manager, la cuisine — et
// son setup —, et ce que le projet installé a perdu.
export function alerts({ projet: project, faits: facts, status, attend: awaiting, manager, controle, limite: limit }: Lu): Alert[] {
  return parGravite([...deLUrgence(facts), ...duRefusalDeGitHubOnly(facts), ...desRetenues(facts), ...deLaLimit(facts, limit), ...desEcrituresRetenues(status), ...duManager(manager), ...ofTheKitchen(project, facts, status), ...duSetup(facts, status, awaiting), ...desPertes(controle, statusLu(status)), ...duRenouvellement(controle), ...dUneOutage(controle)].map(avecButton));
}

// La plus grave d'abord : l'urgence au-dessus de tout, puis une alerte lue avant un état non vérifié,
// le rouge avant le reste. Le tri est stable : à gravité égale, l'ordre de la bande (manager, cuisine) tient.
const GRAVITE = (alert: Alert) => (alert.sujet === "urgence" ? -1 : (alert.verifie ? 0 : 10) + (alert.ton === "rouge" ? 0 : alert.ton === "jaune" ? 1 : 2));
const parGravite = (bande: Alert[]): Alert[] => bande.map((alert, rang) => ({ alerte: alert, rang })).sort((a, b) => GRAVITE(a.alerte) - GRAVITE(b.alerte) || a.rang - b.rang).map(({ alerte: alert }) => alert);

// Le signal d'une bande, pour la case de son projet : l'urgence l'emporte sur tout, et se dit comme
// telle — pas comme une alerte ordinaire ; puis une alerte vérifiée ; sinon un état non vérifié,
// nommé comme tel — jamais lu comme sain. Même logique que la bande : rien n'y est recalculé.
export function signalDe(bande: readonly Alert[]): Signal | undefined {
  // La box ne répond pas : un mot, et ce qu'on en sait — le reste de la bande n'a pas pu être lu.
  const muette = bande.find(({ sujet }) => sujet === "injoignable");
  if (muette !== undefined) return { etat: "injoignable", dit: muette.dit };
  const vues = bande.filter(({ verifie }) => verifie);
  const urgentes = vues.filter(({ sujet }) => sujet === "urgence");
  if (urgentes.length > 0) return { etat: "urgence", dit: [...urgentes, ...vues.filter(({ sujet }) => sujet !== "urgence")].map(({ dit }) => dit).join(" ; ") };
  if (vues.length > 0) return { etat: "alerte", dit: vues.map(({ dit }) => dit).join(" ; ") };
  if (bande.length > 0) return { etat: "non-verifie", dit: bande.map(({ dit }) => dit).join(" ; ") };
  return undefined;
}

// --- La box ne répond pas ----------------------------------------------------------
//
// Une box qui ne répond pas fait rater, d'un coup, tout ce que l'app lit d'elle : le manager, la
// version, la cuisine. Trois « non vérifié » pour une seule cause, chacun avec un geste
// qui n'y change rien (#728). Passé ce nombre de lectures de `faits` ratées de suite — la box pas
// jointe, pas la commande qui échoue —, la bande ne dit plus qu'une ligne : la box, depuis quand,
// pourquoi, et ce que le chef peut y faire. Elle sort dès que la box répond.
export const LECTURES_POUR_INJOIGNABLE = 2;

// La cause d'une station pas arrivée, en mots simples — d'après ce qu'elle a écrit, jamais redit tel quel.
export function causeDuSilence(error: string): string {
  if (/could not resolve hostname|name or service not known|no address associated|nodename nor servname/i.test(error)) return "address not found — the name of this station resolves to nothing";
  if (/connection refused/i.test(error)) return "connection refused — the machine answers, but nothing accepts the connection there";
  return "no answer — the machine does not reply";
}

type SansAnswer = { depuis: string; a: string; lectures: number; cause: string };

function deLaBoxMuette({ depuis, a, lectures, cause }: SansAnswer): Alert {
  return {
    sujet: "injoignable",
    verifie: true,
    ton: "rouge",
    dit: `station unreachable since ${heureHM(depuis)}, ${duree(Date.parse(a) - Date.parse(depuis))} ago — the state of the kitchen has been unknown since then`,
    consignes: ["check that the machine is on and reachable", "restart it if it no longer answers", "then try again"],
    pourquoi: `${cause} — ${lectures} readings in a row failed`,
    geste: "try again — and if it lasts, look at the machine at its host",
    bouton: "try again",
    appel: { relire: true },
    prix: LIRE,
  };
}

// --- L'app hors ligne ---------------------------------------------------------------
//
// Sans réseau, tout ce que l'app lit de GitHub rate d'un coup : le manager, la cuisine. Deux
// « non vérifié » pour une seule cause, qui n'est pas une panne, et aucun geste qui y change rien (#1818). Dès qu'une
// lecture n'a pas joint GitHub du tout (tableau/read.ts, `horsLigne`), la bande se tait : ni ligne, ni signal — la
// vue garde le dernier rail lu, et un seul signe dit depuis quand l'app est hors ligne. Ce qui avait été lu n'est pas
// effacé : à la première lecture qui joint GitHub, la bande se redessine de ce qu'elle dit, et une vraie panne —
// GitHub qui refuse — y entre comme avant.

// --- Ce qui est tenu, projet par projet -----------------------------------------

const FACTS_NOT_YET = "first reading in progress";
const STATUS_PAS_LU = "`status` is only read for the project shown, or for all of them in “All projects” — not for this one right now";
const STATUS_PAS_ENCORE = "first reading of `status` in progress";

// Ce qu'une lecture ratée dit, dans les mots de la carte du projet (facts.ts, `titreDEchec`).
const rate = (command: string, read: Failure) =>
  `\`${command}\` was not read: ${titreDFailure(read, `REACHED, BUT \`${command}\` DID NOT ANSWER`).toLowerCase()}`;

// Les dernières lectures de chaque projet, tenues par le process principal, et la bande
// qui s'en dessine. Chaque réception rend la bande du projet à redessiner. Rien n'y est
// gardé d'une lecture qui n'est plus rafraîchie : ce qu'elle disait redevient « non vérifié ».
// Une alerte non vérifiée n'est dite qu'établie : lue deux fois de suite par la lecture dont elle vient.
// Une lecture qui rate une fois et réussit au tour suivant ne montre rien ; une box qui ne répond pas
// deux lectures de suite le dit — une fois, et la ligne reste tant que ça dure.
export const LECTURES_POUR_ETABLIR = 2;
// Une ligne dite reste au moins ce temps (ms), même si l'état est levé aussitôt : le temps d'être lue.
// Elle part à la première réception qui suit — `faits` est relu toutes les 30 s.
export const DISPLAY_MINIMUM = 20_000;
// Ce qui est dit « pas encore lu » le temps d'une première lecture ne se montre jamais : l'app attend son résultat.
const EN_COURS = [FACTS_NOT_YET, STATUS_PAS_ENCORE, MANAGER_PAS_DIT];

type Source = "faits" | "status" | "manager" | "controle";
// Quelles lectures disent chaque sujet : une réception ne compte que pour les alertes qu'elle a relues.
const LECTURES_DE: Record<Sujet, readonly Source[]> = {
  urgence: ["faits"],
  github: ["faits", "status"],
  manager: ["manager"],
  cuisine: ["faits", "status"],
  station: ["controle", "status"],
  box: ["controle", "status"],
  renouvellement: ["controle"],
  verification: ["controle"],
  injoignable: ["faits"],
};
const cle = ({ sujet, dit }: Alert) => `${sujet}\u0000${dit}`;

export function holdBandes({ maintenant = Date.now, etablir = LECTURES_POUR_ETABLIR, minimum = DISPLAY_MINIMUM }: { maintenant?: () => number; etablir?: number; minimum?: number } = {}) {
  const facts = new Map<string, Facts | Sans>();
  const statuts = new Map<string, string | Sans>();
  // Le bloc `attend` du dernier `status` lu, mis à part : il ne vit qu'avec lui.
  const attends = new Map<string, string>();
  const managers = new Map<string, Switch | Sans>();
  // Le dernier contrôle d'un projet installé (service.ts) : il vaut jusqu'au suivant.
  const controles = new Map<string, Controle>();
  // La limite que l'app a lue elle-même sur GitHub : elle vaut jusqu'à la lecture suivante des stations.
  let limitDeLApp: LimitDeLApp | undefined;
  // Ce que la bande de chaque projet dit maintenant : le suivi de chaque ligne, et la bande rendue.
  // `origine` : la lecture dont l'alerte vient ; `rates` : ses échecs de suite, et eux seuls.
  type Suivi = { origine?: Source; rates: number; dite?: { alerte: Alert; depuis: number } };
  const suivis = new Map<string, Map<string, Suivi>>();
  const rendues = new Map<string, Bande>();
  // La box d'un projet qui ne répond pas : depuis quand, et combien de lectures de `faits` de suite.
  const silences = new Map<string, SansAnswer>();
  // L'app hors ligne pour un projet : depuis la première lecture de la série qui n'a pas joint GitHub.
  const outsideLine = new Map<string, string>();
  // Une lecture hors ligne le note, et ne change rien de ce qui était lu ; une lecture qui a joint GitHub le lève — pas
  // une commande en échec, qui ne dit rien du réseau.
  const outside = (read: Read): boolean => {
    if (!estOutsideLine(read)) {
      if (!("erreur" in read) || read.duTableau === true) outsideLine.delete(read.projet);
      return false;
    }
    outsideLine.set(read.projet, outsideLine.get(read.projet) ?? read.a);
    return true;
  };
  const brute = (project: string): Alert[] => {
    const awaiting = attends.get(project);
    const controle = controles.get(project);
    return alerts({
      projet: project,
      faits: facts.get(project) ?? { sans: FACTS_NOT_YET },
      status: statuts.get(project) ?? { sans: STATUS_PAS_LU },
      ...(awaiting === undefined ? {} : { attend: awaiting }),
      manager: managers.get(project) ?? { sans: MANAGER_PAS_DIT },
      ...(controle === undefined ? {} : { controle }),
      ...(limitDeLApp === undefined ? {} : { limite: limitDeLApp }),
    });
  };
  // La bande à dire après une réception de `source` : l'état lu, passé par ce que le chef a le temps de lire.
  // Un contenu identique à la précédente rend la même bande (même objet) : rien ne bouge.
  // La lecture dont une alerte non vérifiée vient : celle qui n'a pas pu dire, dont l'alerte reprend les mots.
  // Faute de mots reconnus (un mot que l'app ne connaît pas), la première lecture du sujet — celle qui l'a dit.
  const origineDe = (project: string, alert: Alert): Source => {
    const sans: Partial<Record<Source, string>> = {};
    const f = facts.get(project);
    if (f !== undefined && "sans" in f) sans.faits = f.sans;
    const st = statuts.get(project);
    if (st !== undefined && typeof st !== "string") sans.status = st.sans;
    const m = managers.get(project);
    if (m !== undefined && "sans" in m) sans.manager = m.sans;
    const pourquoi = alert.pourquoi ?? "";
    const trouvee = LECTURES_DE[alert.sujet].find((source) => sans[source] !== undefined && pourquoi.includes(sans[source]));
    return trouvee ?? LECTURES_DE[alert.sujet][0] ?? "faits";
  };
  const bande = (project: string, source?: Source): Bande => {
    const depuis = outsideLine.get(project);
    if (depuis !== undefined) {
      const manager = stateDuManager(managers.get(project) ?? { sans: MANAGER_PAS_DIT });
      const avant = rendues.get(project);
      if (avant !== undefined && avant.horsLigne === depuis && avant.alertes.length === 0 && JSON.stringify(avant.manager) === JSON.stringify(manager)) return avant;
      const rendue: Bande = { projet: project, alertes: [], manager, horsLigne: depuis };
      rendues.set(project, rendue);
      return rendue;
    }
    const silence = silences.get(project);
    if (silence !== undefined && silence.lectures >= LECTURES_POUR_INJOIGNABLE) {
      const triees = [deLaBoxMuette(silence)];
      const manager = stateDuManager(managers.get(project) ?? { sans: MANAGER_PAS_DIT });
      const avant = rendues.get(project);
      if (avant !== undefined && avant.horsLigne === undefined && JSON.stringify(avant.alertes) === JSON.stringify(triees) && JSON.stringify(avant.manager) === JSON.stringify(manager)) return avant;
      const rendue: Bande = { projet: project, alertes: triees, signal: signalDe(triees), manager };
      rendues.set(project, rendue);
      return rendue;
    }
    const instant = maintenant();
    const suivi = suivis.get(project) ?? new Map<string, Suivi>();
    suivis.set(project, suivi);
    const lues = brute(project);
    const presentes = new Set<string>();
    const dites: Alert[] = [];
    for (const alert of lues) {
      const k = cle(alert);
      if (!alert.verifie && EN_COURS.some((word) => alert.pourquoi?.includes(word))) continue;
      presentes.add(k);
      const state = suivi.get(k) ?? { rates: 0 };
      suivi.set(k, state);
      // Seule la lecture dont l'alerte vient la compte : la réception d'une autre source du même sujet n'établit rien, et ne défait rien.
      if (!alert.verifie) {
        const origine = origineDe(project, alert);
        if (state.origine !== origine) state.rates = 0;
        state.origine = origine;
        if (source === origine) state.rates++;
      }
      if (state.dite !== undefined || alert.verifie || state.rates >= etablir) {
        state.dite = { alerte: alert, depuis: state.dite?.depuis ?? instant };
        dites.push(alert);
      }
    }
    for (const [k, state] of suivi) {
      if (presentes.has(k)) continue;
      // La lecture dont elle vient, réussie, repart de zéro, même si la ligne reste dite le temps d'être lue.
      if (source !== undefined && source === state.origine) state.rates = 0;
      if (state.dite !== undefined && instant - state.dite.depuis < minimum) dites.push(state.dite.alerte);
      else suivi.delete(k);
    }
    const triees = parGravite(dites);
    const manager = stateDuManager(managers.get(project) ?? { sans: MANAGER_PAS_DIT });
    const avant = rendues.get(project);
    if (avant !== undefined && avant.horsLigne === undefined && JSON.stringify(avant.alertes) === JSON.stringify(triees) && JSON.stringify(avant.manager) === JSON.stringify(manager)) return avant;
    const rendue: Bande = { projet: project, alertes: triees, signal: signalDe(triees), manager };
    rendues.set(project, rendue);
    return rendue;
  };
  // Ce qu'une lecture prouve de la box : pas jointe, elle compte — mais seule celle de `faits`, qui
  // est lue pour chaque projet, à chaque tour ; jointe, tout est remis à zéro.
  const noter = (read: Read, account: boolean): void => {
    if (!("erreur" in read) || read.atteinte) return void silences.delete(read.projet);
    const avant = silences.get(read.projet);
    silences.set(read.projet, {
      depuis: avant?.depuis ?? read.a,
      a: read.a,
      lectures: (avant?.lectures ?? 0) + (account ? 1 : 0),
      cause: causeDuSilence(read.erreur),
    });
  };
  return {
    // La barre est posée : `faits` va être lu pour chacun de ces projets. Ce qui en était
    // lu est oublié ; un projet qui n'en est plus n'a plus rien de tenu.
    ouvrir(projects: readonly string[]): Bande[] {
      facts.clear();
      for (const tenus of [statuts, attends, managers, controles, silences, outsideLine, suivis, rendues]) for (const project of tenus.keys()) if (!projects.includes(project)) tenus.delete(project);
      return projects.map((project) => bande(project));
    },
    // Une lecture de `faits`.
    faits(read: Read): Bande {
      if (outside(read)) return bande(read.projet, "faits");
      noter(read, true);
      if ("erreur" in read) facts.set(read.projet, { sans: rate(FACTS, read) });
      else {
        const lu = comprendre(read.sorties.find(({ commande: command }) => command === FACTS)?.texte ?? "");
        facts.set(read.projet, "informe" in lu ? { sans: `the station did not return the shape of \`${FACTS}\`: ${lu.informe}` } : lu);
      }
      return bande(read.projet, "faits");
    },
    // La lecture des stations sur GitHub : si GitHub limite les appels du compte, chaque projet le dit.
    limite(vue: LimitDeLApp | undefined): Bande[] {
      limitDeLApp = vue;
      return [...suivis.keys()].map((project) => bande(project));
    },
    // Une lecture de `status`, son bloc `attend` mis à part : les lignes de tête restent.
    status(montree: Montree): Bande {
      if (outside(montree)) return bande(montree.projet, "status");
      noter(montree, false);
      const texte = "erreur" in montree ? undefined : montree.sorties.find(({ commande: command }) => command === "status")?.texte;
      statuts.set(montree.projet, "erreur" in montree ? { sans: rate("status", montree) } : (texte ?? { sans: "the reading did not return `status`" }));
      if ("erreur" in montree || montree.attend === undefined) attends.delete(montree.projet);
      else attends.set(montree.projet, montree.attend);
      return bande(montree.projet, "status");
    },
    // La veille de `status` lit désormais ces projets : pour ceux-là, la première lecture est en
    // route ; les autres ne sont plus lus, et ce qui en était lu est lâché.
    veiller(projects: readonly string[]): Bande[] {
      const touches = new Set([...statuts.keys(), ...projects]);
      for (const project of touches) {
        attends.delete(project);
        if (projects.includes(project)) statuts.set(project, { sans: STATUS_PAS_ENCORE });
        else statuts.delete(project);
      }
      return [...touches].map((project) => bande(project));
    },
    // Une lecture de `manager` — celle de la veille du manager, ou celle de l'onglet : l'état du manager, ou pourquoi il n'est pas lu.
    manager(read: Read): Bande {
      if (outside(read)) return bande(read.projet, "manager");
      noter(read, false);
      const sortie = "erreur" in read ? undefined : read.sorties.find(({ commande: command }) => command === MANAGER)?.texte;
      const lu = sortie === undefined ? undefined : managerDe(sortie);
      managers.set(
        read.projet,
        "erreur" in read ? { sans: rate(MANAGER, read) } : lu === undefined ? { sans: "the reading did not return `manager`" } : "informe" in lu ? { sans: `the output of \`manager\` does not have the expected shape: ${lu.informe}` } : lu.interrupteur,
      );
      return bande(read.projet, "manager");
    },
    // Ce que l'installation d'un projet dit de lui (service.ts, `Guide`) : installé et contrôlé, ce
    // qu'il a perdu ; sinon rien — un projet qui s'installe a son écran, pas d'alerte de perte.
    controle(project: string, controle: Controle | undefined): Bande {
      if (controle === undefined) controles.delete(project);
      else controles.set(project, controle);
      return bande(project, "controle");
    },
    // La ligne que la vue nomme par son sujet et ce qu'elle dit, telle que la bande la dit
    // maintenant — rien, si elle n'y est plus : la vue ne fait pas dire à la bande ce qu'elle a cessé de dire.
    alerte(project: unknown, sujet: unknown, dit: unknown): Alert | undefined {
      if (typeof project !== "string") return undefined;
      return (rendues.get(project) ?? bande(project)).alertes.find((alert) => alert.sujet === sujet && alert.dit === dit);
    },
  };
}
