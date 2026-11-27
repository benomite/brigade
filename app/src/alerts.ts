// La bande d'alertes d'un projet, en tête de son espace : elle répond à une seule
// question — est-ce que ça peut tourner ? — sur quatre états, ceux des quatre pannes
// silencieuses du 2026-10-13 (docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md) :
// le manager, la cuisine — la version en service n'en est plus une : le paquet de la
// station la met en place lui-même.
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
// d'un titre et d'une valeur (`decrireEtat`) —, le manager de la
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
import type { Shown } from "./awaiting.ts";
import type { Failure, Reading } from "./box.ts";
import { COMMAND as FACTS, understand, duration, isOutsideLine, tick, titleOfFailure, type DecisionUrgent, type Facts } from "./facts.ts";
import { COMMAND as MANAGER, managerOf, type Switch } from "./manager.ts";
import { hourHM } from "./format.ts";
import { lineOfTheLimit } from "./vue/banner-limit-github.ts";
import type { Control, Shown as Verification } from "./service.ts";

// `station` et `box` : ce qu'un projet installé a perdu — une station, un geste de box. `urgence` :
// toute la cuisine attend le chef.
export type Subject = "urgence" | "github" | "manager" | "cuisine" | "station" | "box" | "renouvellement" | "verification" | "injoignable";
// Ce que le bouton d'une ligne appelle : une demande au second, faite de ce que la ligne dit (request.ts) ; un onglet de
// contenu (tabs.ts).
// `relire` : relire la box tout de suite, au lieu d'attendre le tour de la veille (#728).
export type Call = { demande: true } | { onglet: string } | { relire: true };
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
export type Alert = { sujet: Subject; verifie: boolean; ton: string; dit: string; pourquoi?: string; consignes?: string[]; releve?: string; geste: string; bouton?: string; appel?: Call; prix: string; verification?: Verification; disjoncteur?: true };
// La bande d'un projet : vide, les quatre états ont été lus, et vont bien.
// Ce que la bande d'un projet dit de lui sur sa case de la barre : toute la cuisine qui l'attend, une
// chose à faire, ou rien de vérifié. Une bande vide n'a pas de signal — c'est que les quatre états
// ont été lus, et vont bien.
export type Signal = { etat: "urgence" | "alerte" | "non-verifie" | "injoignable"; dit: string };
// L'état de l'interrupteur du projet, pour l'interrupteur de son espace (#906, #1406) : allumé ou
// éteint, tel qu'il vient d'être lu — sans le délai d'affichage d'une ligne de la bande. Un seul pour
// tout le projet : le manager le suit, et c'est sa ligne qui le dit —
// allumé, les tickets lancés sont pris, le manager juge et découpe, une livraison verte est mergée.
// `dit` : ce que la tête du rail en dit, éteint — la même phrase que la ligne de la bande.
// `releve` : la ligne `manager` du runtime, mot pour mot, que l'interrupteur montre au survol.
// `sans` : pourquoi il n'est pas lu — ce n'est jamais « éteint ».
export type StateOfManager = { allume: boolean; dit?: string; releve: string } | Without;
// `horsLigne` : l'app n'a pas joint GitHub depuis cet instant (#1818) — la bande est alors vide, sans signal.
export type Band = { projet: string; alertes: Alert[]; signal?: Signal; manager?: StateOfManager; horsLigne?: string };

// Un état que l'app n'a pas : pourquoi, dans ses mots.
export type Without = { sans: string };
// Ce que la bande lit d'un projet. `status` : sa sortie, le bloc `attend` mis à part ou non ;
// `attend` : ce bloc, quand il a été mis à part (awaiting.ts, `mettreAPart`).
// `controle` : ce que la box a dit d'un projet installé, ses stations et ses manques (service.ts) —
// absent, rien n'en a été lu : un projet pas encore installé, ou pas encore contrôlé.
export type Read = { projet: string; faits: Facts | Without; status: string | Without; attend?: string; manager: Switch | Without; controle?: Control; limite?: LimitOfTheApp };

// Ce que l'app a lu de sa propre limite : GitHub refuse ses appels, et `reprise` est l'instant où il les rend, nul s'il ne le dit pas.
export type LimitOfTheApp = { reprise: string | null };

const s = (howMany: number) => (howMany > 1 ? "s" : "");
const court = (commit: string) => commit.slice(0, 12);
const NO = "none: nothing changes on the station";
const READ = "none: reading changes nothing on the station";
const REREAD_FACTS = `wait for it to be read: \`${FACTS}\` is re-read every 30 s`;
// Le geste d'une ligne qui demande de lire, de juger ou d'agir sur la box : une demande au second.
const REQUEST = { demande: true } as const;

// Une ligne « non vérifié » : l'état n'est pas dit, et ce n'est pas « sain ».
type NotSays = { pourquoi: string; releve?: string; geste: string; prix: string; appel?: Call };
const notChecks = (subject: Subject, said: string, { pourquoi: why, releve: reading, geste: action, prix: price, appel: call }: NotSays): Alert => ({
  sujet: subject,
  verifie: false,
  ton: "gris",
  dit: said,
  pourquoi: why,
  ...(reading === undefined ? {} : { releve: reading }),
  geste: action,
  ...(call === undefined ? {} : { appel: call }),
  prix: price,
});

// --- La limite d'appels de GitHub --------------------------------------------------
//
// La box et l'app parlent à GitHub avec le même compte : la limite est la même pour les deux. La box
// la dit dans `faits` (`limiteGithub`, lu sur le compteur de la station) ; l'app, elle, la lit de sa
// propre erreur de limite (stations/stations.ts) — c'est elle qui reste quand la box ne passe plus
// par GitHub. Une seule ligne, l'heure de reprise à l'heure locale du chef, jamais le texte de `gh`.
// Elle n'attend rien du chef : elle tombe d'elle-même quand les appels reprennent.
function ofTheLimit(facts: Facts | Without, limit: LimitOfTheApp | undefined): Alert[] {
  // La box dit laquelle, depuis quand et retour vers quand (`github`, ticket 2147) : sa ligne prend la place de celle qui ne dit que la reprise.
  if (!("sans" in facts) && facts.github !== undefined) return [{ sujet: "github", verifie: true, ton: "jaune", ...lineOfTheLimit(facts.github), geste: "nothing to do: the calls resume by themselves when GitHub lifts the limit", prix: NO }];
  const resumption = limit !== undefined ? limit.reprise : "sans" in facts ? null : (facts.limiteGithub ?? null);
  if (limit === undefined && ("sans" in facts || facts.limiteGithub === undefined)) return [];
  return [
    {
      sujet: "github",
      verifie: true,
      ton: "jaune",
      dit: `GitHub is rate-limiting calls, back around ${resumption === null ? "a time GitHub does not give" : hourHM(resumption)}`,
      geste: "nothing to do: the calls resume by themselves when GitHub lifts the limit",
      prix: NO,
    },
  ];
}

// Le rythme des écritures de la box (#2226) : `status` le dit sur sa ligne `github` (`held by the GitHub
// write budget — N of 450 in the last hour, next write at HH:MM`). GitHub n'a rien refusé : la box
// retient ses propres écritures, et la ligne tombe d'elle-même quand la fenêtre le permet.
const WRITES_HELD = /^held by the GitHub write budget(?![\p{L}\p{N}_])/u;
function ofWritesHeld(status: string | Without): Alert[] {
  const readOne = statusRead(status);
  if (typeof readOne !== "string") return [];
  return headsOf(readOne)
    .filter(({ titre: title, valeur: value }) => title === "github" && WRITES_HELD.test(value))
    .map(({ valeur: value }): Alert => ({
      sujet: "github",
      verifie: true,
      ton: "jaune",
      dit: value,
      pourquoi: "the box paces its own writes to GitHub to stay under its limits: no cook is lost, the writes wait their turn",
      geste: "nothing to do: the writes resume by themselves at the time given",
      prix: NO,
    }));
}

// --- L'urgence ----------------------------------------------------------------
//
// Plus rien ne cuit, et c'est le chef que toute la cuisine attend : pas une
// panne parmi d'autres, la seule chose qui, faite, relance tout. Sa ligne passe au-dessus de toutes
// les autres, marquée à part. Elle dit qui attend quoi — la décision qui retient le plus de tickets —,
// depuis combien de temps tout est à l'arrêt — un âge entre deux heures de la box —, les tickets
// retenus, et la ligne du bloc `attend` de chaque décision en cause, mot pour mot : ce qui attend,
// puis le geste. Chacune garde aussi sa carte dans T'attend. Une décision qui ne retient qu'une partie
// du rail n'est pas une urgence : la box n'en donne pas, rien ne se dit ici — et un runtime d'avant le
// champ n'en dit rien non plus : ce qu'il ne donne pas, les autres lignes le disent déjà.

// Ce que la cuisine attend du chef, d'après le mot de la cause
// (`CAUSES_D_URGENCE`) et ce qui nomme la décision. Un mot que l'app n'a pas ici se dit tel quel.
const EXPECTED: ReadonlyMap<string, (decision: string) => string> = new Map([
  ["merge", (decision: string) => `your merge of ${decision}`],
  ["remontée", (decision: string) => `your decision on ${decision}, escalated by the pass`],
  ["PR fermée", (decision: string) => `your decision on ${decision}, whose PR was closed`],
  ["connexion", (station: string) => `you to reconnect Max on ${station}`],
  ["session", () => "you to reconnect the Max session"],
  ["base rouge", () => "you to clear the red base"],
  ["setup", () => "you to unblock the project setup"],
]);
const expected = ({ decision, cause }: DecisionUrgent) => EXPECTED.get(cause)?.(decision) ?? `you on ${decision} (${cause})`;
// Une décision en cause, comme le bloc `attend` l'écrit : ce qui la nomme, puis sa ligne.
const inCause = ({ decision, geste: action }: DecisionUrgent) => `${decision}  ${action}`;

function ofTheEmergency(facts: Facts | Without): Alert[] {
  if ("sans" in facts || facts.urgence == null) return [];
  const emergency = facts.urgence;
  const { retenus: retainedOnes, autres: others } = emergency;
  const also = others.length === 0 ? "" : ` — also held by ${others.map(({ decision }) => decision).join(", ")}`;
  return [
    {
      sujet: "urgence",
      verifie: true,
      ton: "rouge",
      dit: `the whole kitchen is waiting for ${expected(emergency)} — at a standstill for ${duration(Date.parse(facts.lu) - Date.parse(emergency.depuis))}`,
      pourquoi: `${retainedOnes.length} ticket${s(retainedOnes.length)} held, none can cook until you act: ${retainedOnes.map((ticket) => `#${ticket}`).join(", ")}${also}`,
      releve: [emergency, ...others].map(inCause).join("\n"),
      geste: `do what ${emergency.decision} waits for, as the station writes it`,
      appel: REQUEST,
      prix: "none: nothing is cooking — once you act, the held tickets start again, on your quota",
    },
  ];
}

// Une décision du chef qui ne retient que ses tickets : la cuisine n'est pas à l'arrêt, et la ligne
// ne le dit jamais — « toute la cuisine » n'est que dans l'urgence, quand rien ne peut cuire. Elle
// nomme la décision et combien de tickets elle retient vraiment, ceux qui l'attendent.
function ofHeld(facts: Facts | Without): Alert[] {
  if ("sans" in facts || facts.urgence != null) return [];
  return (facts.retenues ?? []).map((retainedOne) => ({
    sujet: "cuisine",
    verifie: true,
    ton: "jaune",
    dit: `waiting for ${expected(retainedOne)}: ${retainedOne.retenus.length} ticket${s(retainedOne.retenus.length)} held, the other tickets keep cooking`,
    pourquoi: `held by ${retainedOne.decision}: ${retainedOne.retenus.map((ticket) => `#${ticket}`).join(", ")}`,
    releve: inCause(retainedOne),
    geste: `do what ${retainedOne.decision} waits for, as the station writes it`,
    prix: "none: the held tickets start again once you act, on your quota",
  }));
}

// --- L'interrupteur GitHub seul refusé ----------------------------------------------
//
// Le projet est servi sur GitHub seul et le runtime a refusé cet état : il ne cuit rien tant que la raison tient, et
// ne le dit que dans son log. `facts` porte la raison (`githubSeul`, ticket 2161) ; la ligne la redit, en tête.
function ofRefusalOfGitHubOnly(facts: Facts | Without): Alert[] {
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
      prix: NO,
    },
  ];
}

// --- Le manager ---------------------------------------------------------------

// L'interrupteur du projet (#1406) : le manager le suit, et sa ligne le dit. Tant que la file ne porte
// pas son état (#438), l'app le lit elle-même : avant sa première lecture, il n'est pas dit.
export const MANAGER_NOT_SAYS = "first reading of `manager` in progress: the queue does not say whether the project is on (#438). This is not “on”";

// Éteint, ce que la tête du rail en dit, et la ligne de la bande : une seule phrase, la même partout.
export const MANAGER_OFF = "project off — nothing new is taken, split or merged";
// La ligne `manager` telle que le runtime l'écrit.
const readingOf = ({ mot: word, depuis: since, par: by, dit: said }: Switch) => `${word}${since === undefined ? "" : ` since ${since} (by ${by})`} — ${said}`;

// Éteint, le projet reste une ligne de la bande : c'est elle qui fait le signal de la case du projet,
// dans la barre. Dans l'espace du projet, la vue ne la pose pas : son interrupteur et la tête du rail
// le disent (#906, #1406) — `manager`, sur la bande.
function ofManager(manager: Switch | Without): Alert[] {
  if ("sans" in manager) return [notChecks("manager", "project switch not verified", { pourquoi: manager.sans, geste: "wait for it to be read: `manager` is re-read every 30 s", prix: READ })];
  if (manager.allume) return [];
  return [
    {
      sujet: "manager",
      verifie: true,
      ton: "rouge",
      dit: MANAGER_OFF,
      releve: readingOf(manager),
      geste: "nothing to do from the app: the project is off on its station",
      prix: "none: the app writes nothing here",
    },
  ];
}
const stateOfManager = (manager: Switch | Without): StateOfManager => ("sans" in manager ? manager : { allume: manager.allume, ...(manager.allume ? {} : { dit: MANAGER_OFF }), releve: readingOf(manager) });

// --- La cuisine -------------------------------------------------------------

// Une ligne de tête de `status` : son titre, sa valeur, et les lignes qui la précisent
// (`ligne` : le titre complété d'espaces jusqu'à onze caractères).
type Head = { titre: string; valeur: string; suite: string[] };
const LINE_OF_HEAD = /^(\S+) +(\S.*)$/;
const SUITE_OF_HEAD = /^ {11}(\S.*)$/;

// Les lignes de tête de `status` : celles d'avant sa première ligne vide.
export function headsOf(status: string): Head[] {
  const heads: Head[] = [];
  for (const line of status.split("\n")) {
    if (line.trim() === "") break;
    const [, title, value] = LINE_OF_HEAD.exec(line) ?? [];
    const [, suite] = SUITE_OF_HEAD.exec(line) ?? [];
    if (title !== undefined && value !== undefined) heads.push({ titre: title, valeur: value, suite: [] });
    else if (suite !== undefined) heads.at(-1)?.suite.push(suite);
  }
  return heads;
}

// Ce que la valeur d'une ligne dit de la panne, et le geste qu'elle nomme après ` : ` (ou, en
// anglais, `: `) — la forme des lignes `stations` et `connection` (`connexion`, #928). Sans geste
// nommé, la ligne entière.
function cut(value: string): { releve: string; geste?: string } {
  const french = value.lastIndexOf(" : ");
  if (french !== -1) return { releve: value.slice(0, french), geste: value.slice(french + 3) };
  const english = value.lastIndexOf(": ");
  return english === -1 ? { releve: value } : { releve: value.slice(0, english), geste: value.slice(english + 2) };
}

const RESUME = "queued tickets start again at once, on your quota";
// Ce que coûte le redémarrage du runtime : la box ne dit pas ce qui est en vol.
const RESTART = "a runtime restart: what is in flight is interrupted — the station does not say what is";
// Le disjoncteur ouvert, tel que la ligne `cuisine` / `kitchen` de `status` le dit : en français
// ou en anglais (#928).
const RED = /^(?:ROUGE|RED)(?![\p{L}\p{N}_])/u;
const BREAKER = /disjoncteur OUVERT|breaker OPEN/;
// Pourquoi il s'est ouvert, en clair sur la ligne : le nombre de lancements échoués de suite que `status` écrit — « the latest
// launches failed in a row » quand la ligne ne le dit pas.
const FAILURES_OF_SUITE = /(\d+) (?:échecs? (?:de suite|d.affilée)|failures? in a row)/;
function chained(value: string): string {
  const n = FAILURES_OF_SUITE.exec(value)?.[1];
  return n === undefined ? "the latest launches failed in a row" : `${n} launch${n === "1" ? "" : "es"} failed in a row`;
}
// L'interrupteur du projet éteint (#1406), tel que la ligne `kitchen` le dit : la ligne du projet
// éteint le dit déjà (`duManager`), une seule fois.
const OFF = /^SWITCHED OFF(?![\p{L}\p{N}_])/u;
const offTheProject = (status: string) => headsOf(status).some(({ titre: title, valeur: value }) => KITCHEN.includes(title) && OFF.test(value));
// Les titres des lignes de tête que #928 a traduits : l'app lit les deux.
export const KITCHEN = ["cuisine", "kitchen"];
export const CONNECTION = ["connexion", "connection"];

// Ce qui retient la cuisine, d'après les lignes de tête de `status` : une ligne par cause
// que l'app sait lire.
function causesOfHeld(status: string): Alert[] {
  return headsOf(status).flatMap(({ titre: title, valeur: value, suite }): Alert[] => {
    if (KITCHEN.includes(title) && BREAKER.test(value))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: `breaker open: ${chained(value)}, no cook goes any more`,
          releve: value.slice(value.search(BREAKER)),
          geste: "nothing to press: the station closes the breaker itself once the check that tripped it passes",
          prix: "none",
          disjoncteur: true,
        },
      ];
    if (title === "stations") {
      const { releve: reading, geste: action } = cut(value);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "no station declared: no cook goes, the kitchen is frozen", releve: reading, geste: action ?? "declare a station, then restart the runtime", appel: REQUEST, prix: RESTART }];
    }
    if (CONNECTION.includes(title)) {
      const { releve: reading, geste: action } = cut(value);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "Max connection down: no ticket is taken any more", releve: reading, geste: action ?? "reconnect, then resume the kitchen", appel: REQUEST, prix: RESUME }];
    }
    if (title === "base" && RED.test(value))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "base red: the station takes no more tickets, the pass neither judges nor merges",
          releve: [value, ...suite].join("\n"),
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
function statusRead(status: string | Without): string | Without {
  if (typeof status !== "string") return status;
  return headsOf(status).some(({ titre: title }) => KITCHEN.includes(title)) ? status : { sans: NO_KITCHEN };
}

// --- Le setup du projet -------------------------------------------------------

// La ligne de tête `setup` de `status` (`decrireSetup`) : `BLOCKED for …
// on <commit> — …` (`BLOQUÉ depuis …` avant #928). Absente, le setup du projet n'est pas bloqué : rien à dire.
const SETUP_BLOCKED = /^(?:BLOQUÉ|BLOCKED)(?![\p{L}\p{N}_])/u;
const blocksTheSetup = (status: string) => headsOf(status).some(({ titre: title, valeur: value }) => title === "setup" && SETUP_BLOCKED.test(value));

// L'entrée `setup` du bloc `attend` (`decrireAttentes`) : deux espaces,
// `setup`, deux espaces, depuis quand, deux espaces, puis la cause et le geste — c'est ce qui en
// est repris, mot pour mot, avec les lignes qui la précisent, sans leur retrait. Rien quand le
// texte n'en a pas. Depuis quand se dit `depuis …` ou `for …` (#927).
const HEAD_OF_SETUP = /^ {2}setup {2}(?:(?:depuis|for) \S.*? {2})?(\S.*)$/;
const SUITE_OF_ENTRY = /^ {6}(\S.*)$/;
export function entryOfSetup(text: string): string | undefined {
  const lines = text.split("\n");
  const rank = lines.findIndex((line) => HEAD_OF_SETUP.test(line));
  const [, line] = HEAD_OF_SETUP.exec(lines[rank] ?? "") ?? [];
  if (line === undefined) return undefined;
  const suite: string[] = [];
  for (const next of lines.slice(rank + 1)) {
    const [, precise] = SUITE_OF_ENTRY.exec(next) ?? [];
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
const LIFT_THE_SETUP = "clear its cause as the station says — declare the refused host in `.claude/brigade/reseau` of the project, or fix the project's setup — then merge on the integration branch";
const PRICE_OF_SETUP = "no cook is interrupted: the setups resume by themselves once the integration branch moves";
function ofSetup(facts: Facts | Without, status: string | Without, awaiting: string | undefined): Alert[] {
  const readOne = statusRead(status);
  if (typeof readOne !== "string" || !blocksTheSetup(readOne)) return [];
  const entry = entryOfSetup(awaiting ?? readOne);
  const elsewhere = !("sans" in facts) && facts.etat === "ouverte";
  return [
    {
      sujet: "cuisine",
      verifie: true,
      ton: elsewhere ? "jaune" : "rouge",
      dit: elsewhere
        ? "project setup impossible: no worktree is set up on its main station, for any ticket — only a remote station still cooks"
        : "project setup impossible: no worktree is set up, no cook goes, for any ticket",
      // Sans l'entrée du bloc, la ligne de tête : elle renvoie au bloc, qui n'a pas été lu.
      ...(entry === undefined ? { pourquoi: "its cause and its action are in the `attend` block of `status`, which this reading does not carry", releve: headsOf(readOne).find(({ titre: title }) => title === "setup")?.valeur ?? "" } : { releve: entry }),
      geste: LIFT_THE_SETUP,
      appel: REQUEST,
      prix: PRICE_OF_SETUP,
    },
  ];
}

function ofTheKitchen(project: string, facts: Facts | Without, status: string | Without): Alert[] {
  if ("sans" in facts) return [notChecks("cuisine", "kitchen state not verified", { pourquoi: facts.sans, geste: REREAD_FACTS, prix: READ })];
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
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "nothing to do from the app: the kitchen is stopped on its station", prix: "none: the app writes nothing here" }];
    case "retenue": {
      const readOne = statusRead(status);
      const causes = typeof readOne === "string" ? causesOfHeld(readOne) : [];
      // Retenue par le seul setup bloqué, ou par l'interrupteur du projet éteint : leur ligne le dit déjà.
      // Sans `status` lu, rien ne dit qu'une cause est seule à la retenir.
      if (typeof readOne === "string" && (causes.length > 0 || blocksTheSetup(readOne) || offTheProject(readOne))) return causes;
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "jaune",
          dit: "kitchen held: it is running, but no cook goes any more",
          pourquoi: typeof readOne === "string" ? "`status` gives no cause the app can read" : `its cause was not read: ${readOne.sans}`,
          geste: "read its cause: `status`, in the panel",
          appel: REQUEST,
          prix: READ,
        },
      ];
    }
    default:
      return [notChecks("cuisine", "kitchen state not verified", { pourquoi: `the kitchen is “${facts.etat}” according to \`${FACTS}\`, a word the app does not know`, geste: "update the app", prix: NO })];
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
// (`jugerReglageDuGeste`), et ce que
// leur absence empêche, en mots simples.
const ACTIONS_OF_BOX = [
  { section: "« Le geste d'installation »", nom: "install a project", empeche: "installing a project on this station by its installation action would be refused" },
] as const;
const ON_THE_BOX = "the station itself: whoever has `sudo` there runs it — the app sends nothing";
const RECHECKS = "the alert leaves once the station says it is back: the app checks again every 5 min, and when this space opens";

// Combien de passages de suite le renouvellement de la session Max peut rater avant que la bande
// le dise : un seul échec peut être un accident, deux de suite sont un renouvellement qui ne se
// rétablit pas. À changer ici, nulle part ailleurs.
export const FAILURES_FOR_ALERT = 2;

// Le renouvellement en échec répété : la ligne reste tant que la vérification le dit, et sort au
// premier passage réussi. L'échéance de la session n'est pas relue ici : une session tombée, la
// file le dit d'elle-même (une station déconnectée).
// Le verdict d'une vérification lue, joint à la ligne qui en vient — pas une panne : celle-là a sa ligne.
const verdictOf = (control: Control): { verification?: Verification } => {
  const { verification } = control;
  return verification !== undefined && (verification.etat === "pret" || verification.etat === "pas-pret") ? { verification } : {};
};

// Une vérification plantée : un problème de brigade, pas du projet — le chef n'a rien à faire, et la
// ligne ne lui demande rien. Elle sort au premier contrôle qui va au bout.
function ofAOutage(control: Control | undefined): Alert[] {
  const verification = control?.verification;
  if (verification === undefined || verification.etat !== "plantee") return [];
  return [
    {
      sujet: "verification",
      verifie: true,
      ton: "jaune",
      dit: verification.titre,
      geste: "nothing to do: this is on brigade, which fixes it — the check is replayed by itself",
      prix: NO,
      verification,
    },
  ];
}

function ofRenewal(control: Control | undefined): Alert[] {
  const failure = control?.renouvellement;
  if (failure === undefined || failure.echecs < FAILURES_FOR_ALERT) return [];
  return [
    {
      sujet: "renouvellement",
      verifie: true,
      ton: "rouge",
      dit: `Max renewal failing: ${failure.echecs} runs in a row — the session will expire if it is not restored`,
      releve: failure.raison,
      geste: "`journalctl -u brigade-renouvellement.service` on the station says more; fix what it names",
      appel: REQUEST,
      prix: `none for the kitchen: it is done on ${ON_THE_BOX}; ${RECHECKS}`,
      ...(control === undefined ? {} : verdictOf(control)),
    },
  ];
}

function ofLosses(control: Control | undefined, status: string | Without): Alert[] {
  if (control === undefined) return [];
  const { stations, manques: gaps = [] } = control;
  const losses: Alert[] = [];
  if (stations !== undefined) {
    const provided = new Set(stations.proposees.map(({ nom: name }) => name));
    // Une station distante tourne sur un poste : ce que cette machine fournit n'en dit rien.
    for (const { nom: name, moteur: engine } of stations.declarees.filter(({ distante: remote }) => !remote)) {
      // Le manque qui dit son moteur introuvable par le service : la station ne lance rien, même
      // si la commande qui la propose le trouve encore — et il porte le geste qui le remet, mot pour mot.
      const notFound = gaps.find(({ texte: text }) => text.startsWith(`\`${engine}\` est introuvable`));
      if (provided.has(name) && notFound === undefined) continue;
      const reading = notFound?.texte ?? stations.absent;
      losses.push({
        sujet: "station",
        verifie: true,
        ton: "rouge",
        dit: `station “${name}” missing: its main station no longer provides it — no cook goes there`,
        ...(reading === null ? {} : { releve: reading }),
        geste: notFound?.geste ?? `put \`${engine}\` back on the station, where the service finds it — \`installation\` there gives the exact command`,
        appel: REQUEST,
        prix: `none for the kitchen: it is done on ${ON_THE_BOX}; ${RECHECKS}`,
        ...verdictOf(control),
      });
    }
  }
  // Plus aucune station déclarée : la ligne `stations` de `status`, quand elle est lue, le dit déjà.
  const saysByStatus = typeof status === "string" && headsOf(status).some(({ titre: title }) => title === "stations");
  const withoutStation = gaps.find(({ etape: step }) => step === "stations");
  if (withoutStation !== undefined && !saysByStatus && (stations === undefined || stations.declarees.length === 0)) {
    losses.push({
      sujet: "station",
      verifie: true,
      ton: "rouge",
      dit: "no station declared any more: no cook goes, tickets wait on the rail",
      releve: withoutStation.texte,
      geste: withoutStation.geste ?? "declare a station again: `installation stations` on its main station lists those it provides",
      appel: REQUEST,
      prix: `none: the declaration is read at the runtime's next wake-up, without a restart; ${RECHECKS}`,
      ...verdictOf(control),
    });
  }
  for (const { section, nom: name, empeche: prevents } of ACTIONS_OF_BOX) {
    const lack = gaps.find(({ geste: action }) => action?.includes(section));
    if (lack === undefined) continue;
    losses.push({
      sujet: "box",
      verifie: true,
      ton: "jaune",
      dit: `station action “${name}” missing: ${prevents}`,
      releve: lack.texte,
      geste: lack.geste ?? `set it up again on the station — docs/installer.md, ${section}`,
      appel: REQUEST,
      prix: `none: no cook is interrupted — it is done on ${ON_THE_BOX}; ${RECHECKS}`,
      ...verdictOf(control),
    });
  }
  return losses;
}

// Le mot du bouton d'un geste, d'après ce que l'alerte appelle : une
// demande au second, un onglet, une relecture.
export function buttonOf({ appel: call }: Pick<Alert, "appel">): string | undefined {
  if (call === undefined) return undefined;
  if ("demande" in call) return "ask the second";
  if ("onglet" in call) return call.onglet === "parametres" ? "open Settings" : `open the ${call.onglet} tab`;
  return "try again now";
}
const withButton = (alert: Alert): Alert => {
  const button = buttonOf(alert);
  return button === undefined ? alert : { ...alert, bouton: button };
};

// La bande d'un projet, d'après ce qui en a été lu : l'urgence, le manager, la cuisine — et
// son setup —, et ce que le projet installé a perdu.
export function alerts({ projet: project, faits: facts, status, attend: awaiting, manager, controle: control, limite: limit }: Read): Alert[] {
  return byGravite([...ofTheEmergency(facts), ...ofRefusalOfGitHubOnly(facts), ...ofHeld(facts), ...ofTheLimit(facts, limit), ...ofWritesHeld(status), ...ofManager(manager), ...ofTheKitchen(project, facts, status), ...ofSetup(facts, status, awaiting), ...ofLosses(control, statusRead(status)), ...ofRenewal(control), ...ofAOutage(control)].map(withButton));
}

// La plus grave d'abord : l'urgence au-dessus de tout, puis une alerte lue avant un état non vérifié,
// le rouge avant le reste. Le tri est stable : à gravité égale, l'ordre de la bande (manager, cuisine) tient.
const GRAVITE = (alert: Alert) => (alert.sujet === "urgence" ? -1 : (alert.verifie ? 0 : 10) + (alert.ton === "rouge" ? 0 : alert.ton === "jaune" ? 1 : 2));
const byGravite = (band: Alert[]): Alert[] => band.map((alert, rank) => ({ alerte: alert, rang: rank })).sort((a, b) => GRAVITE(a.alerte) - GRAVITE(b.alerte) || a.rang - b.rang).map(({ alerte: alert }) => alert);

// Le signal d'une bande, pour la case de son projet : l'urgence l'emporte sur tout, et se dit comme
// telle — pas comme une alerte ordinaire ; puis une alerte vérifiée ; sinon un état non vérifié,
// nommé comme tel — jamais lu comme sain. Même logique que la bande : rien n'y est recalculé.
export function signalOf(band: readonly Alert[]): Signal | undefined {
  // La box ne répond pas : un mot, et ce qu'on en sait — le reste de la bande n'a pas pu être lu.
  const silentOne = band.find(({ sujet: subject }) => subject === "injoignable");
  if (silentOne !== undefined) return { etat: "injoignable", dit: silentOne.dit };
  const views = band.filter(({ verifie: checks }) => checks);
  const urgentes = views.filter(({ sujet: subject }) => subject === "urgence");
  if (urgentes.length > 0) return { etat: "urgence", dit: [...urgentes, ...views.filter(({ sujet: subject }) => subject !== "urgence")].map(({ dit: said }) => said).join(" ; ") };
  if (views.length > 0) return { etat: "alerte", dit: views.map(({ dit: said }) => said).join(" ; ") };
  if (band.length > 0) return { etat: "non-verifie", dit: band.map(({ dit: said }) => said).join(" ; ") };
  return undefined;
}

// --- La box ne répond pas ----------------------------------------------------------
//
// Une box qui ne répond pas fait rater, d'un coup, tout ce que l'app lit d'elle : le manager, la
// version, la cuisine. Trois « non vérifié » pour une seule cause, chacun avec un geste
// qui n'y change rien (#728). Passé ce nombre de lectures de `faits` ratées de suite — la box pas
// jointe, pas la commande qui échoue —, la bande ne dit plus qu'une ligne : la box, depuis quand,
// pourquoi, et ce que le chef peut y faire. Elle sort dès que la box répond.
export const READS_FOR_UNREACHABLE = 2;

// La cause d'une station pas arrivée, en mots simples — d'après ce qu'elle a écrit, jamais redit tel quel.
export function causeOfSilence(error: string): string {
  if (/could not resolve hostname|name or service not known|no address associated|nodename nor servname/i.test(error)) return "address not found — the name of this station resolves to nothing";
  if (/connection refused/i.test(error)) return "connection refused — the machine answers, but nothing accepts the connection there";
  return "no answer — the machine does not reply";
}

type WithoutAnswer = { depuis: string; a: string; lectures: number; cause: string };

function ofTheBoxSilent({ depuis: since, a, lectures: readings, cause }: WithoutAnswer): Alert {
  return {
    sujet: "injoignable",
    verifie: true,
    ton: "rouge",
    dit: `station unreachable since ${hourHM(since)}, ${duration(Date.parse(a) - Date.parse(since))} ago — the state of the kitchen has been unknown since then`,
    consignes: ["check that the machine is on and reachable", "restart it if it no longer answers", "then try again"],
    pourquoi: `${cause} — ${readings} readings in a row failed`,
    geste: "try again — and if it lasts, look at the machine at its host",
    bouton: "try again",
    appel: { relire: true },
    prix: READ,
  };
}

// --- L'app hors ligne ---------------------------------------------------------------
//
// Sans réseau, tout ce que l'app lit de GitHub rate d'un coup : le manager, la cuisine. Deux
// « non vérifié » pour une seule cause, qui n'est pas une panne, et aucun geste qui y change rien (#1818). Dès qu'une
// lecture n'a pas joint GitHub du tout (board/read.ts, `horsLigne`), la bande se tait : ni ligne, ni signal — la
// vue garde le dernier rail lu, et un seul signe dit depuis quand l'app est hors ligne. Ce qui avait été lu n'est pas
// effacé : à la première lecture qui joint GitHub, la bande se redessine de ce qu'elle dit, et une vraie panne —
// GitHub qui refuse — y entre comme avant.

// --- Ce qui est tenu, projet par projet -----------------------------------------

const FACTS_NOT_YET = "first reading in progress";
const STATUS_NOT_READ = "`status` is only read for the project shown, or for all of them in “All projects” — not for this one right now";
const STATUS_NOT_STILL = "first reading of `status` in progress";

// Ce qu'une lecture ratée dit, dans les mots de la carte du projet (facts.ts, `titreDEchec`).
const rate = (command: string, reading: Failure) =>
  `\`${command}\` was not read: ${titleOfFailure(reading, `REACHED, BUT \`${command}\` DID NOT ANSWER`).toLowerCase()}`;

// Les dernières lectures de chaque projet, tenues par le process principal, et la bande
// qui s'en dessine. Chaque réception rend la bande du projet à redessiner. Rien n'y est
// gardé d'une lecture qui n'est plus rafraîchie : ce qu'elle disait redevient « non vérifié ».
// Une alerte non vérifiée n'est dite qu'établie : lue deux fois de suite par la lecture dont elle vient.
// Une lecture qui rate une fois et réussit au tour suivant ne montre rien ; une box qui ne répond pas
// deux lectures de suite le dit — une fois, et la ligne reste tant que ça dure.
export const READS_FOR_ESTABLISH = 2;
// Une ligne dite reste au moins ce temps (ms), même si l'état est levé aussitôt : le temps d'être lue.
// Elle part à la première réception qui suit — `faits` est relu toutes les 30 s.
export const DISPLAY_MINIMUM = 20_000;
// Ce qui est dit « pas encore lu » le temps d'une première lecture ne se montre jamais : l'app attend son résultat.
const IN_PROGRESS = [FACTS_NOT_YET, STATUS_NOT_STILL, MANAGER_NOT_SAYS];

type Source = "faits" | "status" | "manager" | "controle";
// Quelles lectures disent chaque sujet : une réception ne compte que pour les alertes qu'elle a relues.
const READS_OF: Record<Subject, readonly Source[]> = {
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
const key = ({ sujet: subject, dit: said }: Alert) => `${subject}\u0000${said}`;

export function holdBands({ maintenant: now = Date.now, etablir: establish = READS_FOR_ESTABLISH, minimum = DISPLAY_MINIMUM }: { maintenant?: () => number; etablir?: number; minimum?: number } = {}) {
  const facts = new Map<string, Facts | Without>();
  const statuses = new Map<string, string | Without>();
  // Le bloc `attend` du dernier `status` lu, mis à part : il ne vit qu'avec lui.
  const attends = new Map<string, string>();
  const managers = new Map<string, Switch | Without>();
  // Le dernier contrôle d'un projet installé (service.ts) : il vaut jusqu'au suivant.
  const checks = new Map<string, Control>();
  // La limite que l'app a lue elle-même sur GitHub : elle vaut jusqu'à la lecture suivante des stations.
  let limitOfTheApp: LimitOfTheApp | undefined;
  // Ce que la bande de chaque projet dit maintenant : le suivi de chaque ligne, et la bande rendue.
  // `origine` : la lecture dont l'alerte vient ; `rates` : ses échecs de suite, et eux seuls.
  type Tracking = { origine?: Source; rates: number; dite?: { alerte: Alert; depuis: number } };
  const tracked = new Map<string, Map<string, Tracking>>();
  const renderedEntries = new Map<string, Band>();
  // La box d'un projet qui ne répond pas : depuis quand, et combien de lectures de `faits` de suite.
  const silences = new Map<string, WithoutAnswer>();
  // L'app hors ligne pour un projet : depuis la première lecture de la série qui n'a pas joint GitHub.
  const outsideLine = new Map<string, string>();
  // Une lecture hors ligne le note, et ne change rien de ce qui était lu ; une lecture qui a joint GitHub le lève — pas
  // une commande en échec, qui ne dit rien du réseau.
  const outside = (reading: Reading): boolean => {
    if (!isOutsideLine(reading)) {
      if (!("erreur" in reading) || reading.duTableau === true) outsideLine.delete(reading.projet);
      return false;
    }
    outsideLine.set(reading.projet, outsideLine.get(reading.projet) ?? reading.a);
    return true;
  };
  const raw = (project: string): Alert[] => {
    const awaiting = attends.get(project);
    const control = checks.get(project);
    return alerts({
      projet: project,
      faits: facts.get(project) ?? { sans: FACTS_NOT_YET },
      status: statuses.get(project) ?? { sans: STATUS_NOT_READ },
      ...(awaiting === undefined ? {} : { attend: awaiting }),
      manager: managers.get(project) ?? { sans: MANAGER_NOT_SAYS },
      ...(control === undefined ? {} : { controle: control }),
      ...(limitOfTheApp === undefined ? {} : { limite: limitOfTheApp }),
    });
  };
  // La bande à dire après une réception de `source` : l'état lu, passé par ce que le chef a le temps de lire.
  // Un contenu identique à la précédente rend la même bande (même objet) : rien ne bouge.
  // La lecture dont une alerte non vérifiée vient : celle qui n'a pas pu dire, dont l'alerte reprend les mots.
  // Faute de mots reconnus (un mot que l'app ne connaît pas), la première lecture du sujet — celle qui l'a dit.
  const originOf = (project: string, alert: Alert): Source => {
    const without: Partial<Record<Source, string>> = {};
    const f = facts.get(project);
    if (f !== undefined && "sans" in f) without.faits = f.sans;
    const st = statuses.get(project);
    if (st !== undefined && typeof st !== "string") without.status = st.sans;
    const m = managers.get(project);
    if (m !== undefined && "sans" in m) without.manager = m.sans;
    const why = alert.pourquoi ?? "";
    const found = READS_OF[alert.sujet].find((source) => without[source] !== undefined && why.includes(without[source]));
    return found ?? READS_OF[alert.sujet][0] ?? "faits";
  };
  const band = (project: string, source?: Source): Band => {
    const since = outsideLine.get(project);
    if (since !== undefined) {
      const manager = stateOfManager(managers.get(project) ?? { sans: MANAGER_NOT_SAYS });
      const before = renderedEntries.get(project);
      if (before !== undefined && before.horsLigne === since && before.alertes.length === 0 && JSON.stringify(before.manager) === JSON.stringify(manager)) return before;
      const renderedOne: Band = { projet: project, alertes: [], manager, horsLigne: since };
      renderedEntries.set(project, renderedOne);
      return renderedOne;
    }
    const silence = silences.get(project);
    if (silence !== undefined && silence.lectures >= READS_FOR_UNREACHABLE) {
      const triees = [ofTheBoxSilent(silence)];
      const manager = stateOfManager(managers.get(project) ?? { sans: MANAGER_NOT_SAYS });
      const before = renderedEntries.get(project);
      if (before !== undefined && before.horsLigne === undefined && JSON.stringify(before.alertes) === JSON.stringify(triees) && JSON.stringify(before.manager) === JSON.stringify(manager)) return before;
      const renderedOne: Band = { projet: project, alertes: triees, signal: signalOf(triees), manager };
      renderedEntries.set(project, renderedOne);
      return renderedOne;
    }
    const instant = now();
    const tracking = tracked.get(project) ?? new Map<string, Tracking>();
    tracked.set(project, tracking);
    const readEntries = raw(project);
    const present = new Set<string>();
    const saidEntries: Alert[] = [];
    for (const alert of readEntries) {
      const k = key(alert);
      if (!alert.verifie && IN_PROGRESS.some((word) => alert.pourquoi?.includes(word))) continue;
      present.add(k);
      const state = tracking.get(k) ?? { rates: 0 };
      tracking.set(k, state);
      // Seule la lecture dont l'alerte vient la compte : la réception d'une autre source du même sujet n'établit rien, et ne défait rien.
      if (!alert.verifie) {
        const origin = originOf(project, alert);
        if (state.origine !== origin) state.rates = 0;
        state.origine = origin;
        if (source === origin) state.rates++;
      }
      if (state.dite !== undefined || alert.verifie || state.rates >= establish) {
        state.dite = { alerte: alert, depuis: state.dite?.depuis ?? instant };
        saidEntries.push(alert);
      }
    }
    for (const [k, state] of tracking) {
      if (present.has(k)) continue;
      // La lecture dont elle vient, réussie, repart de zéro, même si la ligne reste dite le temps d'être lue.
      if (source !== undefined && source === state.origine) state.rates = 0;
      if (state.dite !== undefined && instant - state.dite.depuis < minimum) saidEntries.push(state.dite.alerte);
      else tracking.delete(k);
    }
    const triees = byGravite(saidEntries);
    const manager = stateOfManager(managers.get(project) ?? { sans: MANAGER_NOT_SAYS });
    const before = renderedEntries.get(project);
    if (before !== undefined && before.horsLigne === undefined && JSON.stringify(before.alertes) === JSON.stringify(triees) && JSON.stringify(before.manager) === JSON.stringify(manager)) return before;
    const renderedOne: Band = { projet: project, alertes: triees, signal: signalOf(triees), manager };
    renderedEntries.set(project, renderedOne);
    return renderedOne;
  };
  // Ce qu'une lecture prouve de la box : pas jointe, elle compte — mais seule celle de `faits`, qui
  // est lue pour chaque projet, à chaque tour ; jointe, tout est remis à zéro.
  const note = (reading: Reading, account: boolean): void => {
    if (!("erreur" in reading) || reading.atteinte) return void silences.delete(reading.projet);
    const before = silences.get(reading.projet);
    silences.set(reading.projet, {
      depuis: before?.depuis ?? reading.a,
      a: reading.a,
      lectures: (before?.lectures ?? 0) + (account ? 1 : 0),
      cause: causeOfSilence(reading.erreur),
    });
  };
  return {
    // La barre est posée : `faits` va être lu pour chacun de ces projets. Ce qui en était
    // lu est oublié ; un projet qui n'en est plus n'a plus rien de tenu.
    ouvrir(projects: readonly string[]): Band[] {
      facts.clear();
      for (const heldOnes of [statuses, attends, managers, checks, silences, outsideLine, tracked, renderedEntries]) for (const project of heldOnes.keys()) if (!projects.includes(project)) heldOnes.delete(project);
      return projects.map((project) => band(project));
    },
    // Une lecture de `faits`.
    faits(reading: Reading): Band {
      if (outside(reading)) return band(reading.projet, "faits");
      note(reading, true);
      if ("erreur" in reading) facts.set(reading.projet, { sans: rate(FACTS, reading) });
      else {
        const readOne = understand(reading.sorties.find(({ commande: command }) => command === FACTS)?.texte ?? "");
        facts.set(reading.projet, "informe" in readOne ? { sans: `the station did not return the shape of \`${FACTS}\`: ${readOne.informe}` } : readOne);
      }
      return band(reading.projet, "faits");
    },
    // La lecture des stations sur GitHub : si GitHub limite les appels du compte, chaque projet le dit.
    limite(vue: LimitOfTheApp | undefined): Band[] {
      limitOfTheApp = vue;
      return [...tracked.keys()].map((project) => band(project));
    },
    // Une lecture de `status`, son bloc `attend` mis à part : les lignes de tête restent.
    status(shownOne: Shown): Band {
      if (outside(shownOne)) return band(shownOne.projet, "status");
      note(shownOne, false);
      const text = "erreur" in shownOne ? undefined : shownOne.sorties.find(({ commande: command }) => command === "status")?.texte;
      statuses.set(shownOne.projet, "erreur" in shownOne ? { sans: rate("status", shownOne) } : (text ?? { sans: "the reading did not return `status`" }));
      if ("erreur" in shownOne || shownOne.attend === undefined) attends.delete(shownOne.projet);
      else attends.set(shownOne.projet, shownOne.attend);
      return band(shownOne.projet, "status");
    },
    // La veille de `status` lit désormais ces projets : pour ceux-là, la première lecture est en
    // route ; les autres ne sont plus lus, et ce qui en était lu est lâché.
    veiller(projects: readonly string[]): Band[] {
      const keys = new Set([...statuses.keys(), ...projects]);
      for (const project of keys) {
        attends.delete(project);
        if (projects.includes(project)) statuses.set(project, { sans: STATUS_NOT_STILL });
        else statuses.delete(project);
      }
      return [...keys].map((project) => band(project));
    },
    // Une lecture de `manager` — celle de la veille du manager, ou celle de l'onglet : l'état du manager, ou pourquoi il n'est pas lu.
    manager(reading: Reading): Band {
      if (outside(reading)) return band(reading.projet, "manager");
      note(reading, false);
      const output = "erreur" in reading ? undefined : reading.sorties.find(({ commande: command }) => command === MANAGER)?.texte;
      const readOne = output === undefined ? undefined : managerOf(output);
      managers.set(
        reading.projet,
        "erreur" in reading ? { sans: rate(MANAGER, reading) } : readOne === undefined ? { sans: "the reading did not return `manager`" } : "informe" in readOne ? { sans: `the output of \`manager\` does not have the expected shape: ${readOne.informe}` } : readOne.interrupteur,
      );
      return band(reading.projet, "manager");
    },
    // Ce que l'installation d'un projet dit de lui (service.ts, `Guide`) : installé et contrôlé, ce
    // qu'il a perdu ; sinon rien — un projet qui s'installe a son écran, pas d'alerte de perte.
    controle(project: string, control: Control | undefined): Band {
      if (control === undefined) checks.delete(project);
      else checks.set(project, control);
      return band(project, "controle");
    },
    // La ligne que la vue nomme par son sujet et ce qu'elle dit, telle que la bande la dit
    // maintenant — rien, si elle n'y est plus : la vue ne fait pas dire à la bande ce qu'elle a cessé de dire.
    alerte(project: unknown, subject: unknown, said: unknown): Alert | undefined {
      if (typeof project !== "string") return undefined;
      return (renderedEntries.get(project) ?? band(project)).alertes.find((alert) => alert.sujet === subject && alert.dit === said);
    },
  };
}
