// La bande d'alertes d'un projet, en tête de son espace : elle répond à une seule
// question — est-ce que ça peut tourner ? — sur quatre états, ceux des quatre pannes
// silencieuses du 2026-10-13 (docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md) :
// le manager, la cuisine, le grant — la version en service n'en est plus une : le paquet de la
// station la met en place lui-même (docs/bascule.md).
// **Une alerte est une chose à faire, jamais une chose à savoir** : chaque ligne dit ce
// qui ne va pas, le geste qui le lève et ce que ce geste coûte. Ce qui va bien ne prend
// pas de place — la bande vide, c'est que les quatre ont été lus, et vont bien. Et ce qui
// ne change rien aux cinq minutes à venir n'y entre jamais : l'âge de la sauvegarde, un
// grant actif que le chef a accordé, les transcripts.
// **Le silence est prouvé, jamais supposé** : un état que la box ne dit pas — pas encore
// lu, pas joint, une sortie qui n'a pas la forme, un runtime d'avant le champ — donne une
// ligne « non vérifié » qui le nomme, jamais « tout va bien ». Le manager n'est pas dit par
// la file (#438) : l'app lit elle-même `manager`, pour chaque projet, au rythme de `faits`,
// quel que soit l'onglet affiché. Il n'est « non vérifié » que le temps de la première
// lecture, ou quand cette lecture échoue — et la ligne dit pourquoi.
// D'où vient chaque état : la cuisine de `faits` (faits.ts), la cause d'une
// cuisine retenue et le grant des lignes de tête de `status` — celles que le runtime écrit
// d'un titre et d'une valeur (runtime/src/etat.ts, `decrireEtat`) —, le manager de la
// sortie de `manager` (manager.ts). Le setup du projet bloqué est une cause de la cuisine :
// sa ligne de tête dit qu'il l'est, son entrée `setup` du bloc `attend` en dit la cause et le
// geste — c'est elle que la ligne de la bande reprend. Ce que la box dit se pose mot pour mot ; l'app n'y
// ajoute que ses propres mots, à part. Aucun fait nouveau n'est demandé au runtime.
// Un projet installé dit aussi ce qu'il a perdu depuis son installation : une station que la box
// ne fournit plus, un geste de box qui n'y est plus (« Ce qu'un projet installé a perdu », plus
// bas). Ce n'est pas l'écran d'installation qui revient : c'est une ligne de la bande, avec son geste.
// Le geste d'une ligne est collé à l'état qu'il change, sous l'une de ses trois formes : un
// geste du socle (gestes.ts), direct ou confirmé — la confirmation dit son prix
// (confirmation.ts) ; ou, quand le lever demande de lire, juger ou agir sur la box à côté du
// runtime — déclarer une station, `claude /login`, `systemctl` —, une demande en prose,
// écrite dans le second sans Entrée (demande.ts) : l'app ne la fait jamais partir. Une
// ligne « non vérifié » mène à l'onglet qui lit l'état que la file ne dit pas. Ce module ne lance rien.
// Au-dessus de tout, une ligne à part : l'urgence — plus rien ne cuit, et c'est le chef que toute la
// cuisine attend (« L'urgence », plus bas). Elle vient de `faits`, et la case du projet la dit aussi.
import type { Montree } from "./attend.ts";
import type { Echec, Lecture } from "./box.ts";
import { COMMANDE as FAITS, comprendre, duree, tick, titreDEchec, type DecisionUrgente, type Faits } from "./faits.ts";
import { GRANTS } from "./gestes.ts";
import { COMMANDE as MANAGER, managerDe, type Interrupteur } from "./manager.ts";
import { heureHM } from "./format.ts";
import type { Controle, Montree as Verification } from "./service.ts";

// `station` et `box` : ce qu'un projet installé a perdu — une station, un geste de box. `urgence` :
// toute la cuisine attend le chef.
export type Sujet = "urgence" | "github" | "manager" | "cuisine" | "grant" | "station" | "box" | "renouvellement" | "verification" | "injoignable";
// Ce que le bouton d'une ligne appelle : un geste du socle (gestes.ts), et le grant qu'il
// nomme ; une demande au second, faite de ce que la ligne dit (demande.ts) ; un onglet de
// contenu (onglets.ts).
// `relire` : relire la box tout de suite, au lieu d'attendre le tour de la veille (#728).
export type Appel = { geste: string; grant?: string } | { demande: true } | { onglet: string } | { relire: true };
// Une ligne de la bande. `verifie` faux : la box ne dit pas cet état, et la ligne le dit.
// `dit` : ce qui ne va pas, dans les mots de l'app ; `pourquoi` : ce qu'elle en sait de plus,
// dans ses mots aussi. `releve` : ce que la box en a écrit, mot pour mot — absent quand elle
// n'en a rien écrit. `geste` : ce qui le lève ; `appel` : ce que son bouton appelle — absent,
// le geste ne se joue pas depuis l'app. `prix` : ce que le geste coûte. `verification` : pour une ligne qui vient d'une vérification,
// le verdict que l'écran Verify pose — la même phrase, les mêmes lignes de manque.
// `bouton` : ce que dit le bouton du geste, en quelques mots — jamais une commande ni une phrase de
// mode d'emploi : celles-là (`geste`, `pourquoi`, `releve`, `prix`) se lisent au survol. Absent, la
// ligne n'a pas de geste à faire depuis l'app.
export type Alerte = { sujet: Sujet; verifie: boolean; ton: string; dit: string; pourquoi?: string; consignes?: string[]; releve?: string; geste: string; bouton?: string; appel?: Appel; prix: string; verification?: Verification };
// La bande d'un projet : vide, les quatre états ont été lus, et vont bien.
// Ce que la bande d'un projet dit de lui sur sa case de la barre : toute la cuisine qui l'attend, une
// chose à faire, ou rien de vérifié. Une bande vide n'a pas de signal — c'est que les quatre états
// ont été lus, et vont bien.
export type Signal = { etat: "urgence" | "alerte" | "non-verifie" | "injoignable"; dit: string };
// L'état du manager, pour son interrupteur dans l'espace du projet (#906) : allumé ou éteint, tel
// qu'il vient d'être lu — sans le délai d'affichage d'une ligne de la bande. `dit` : ce que la tête
// du rail en dit, éteint — la même phrase que la ligne de la bande. `releve` : la ligne `manager` du
// runtime, mot pour mot, que l'interrupteur montre au survol. `sans` : pourquoi il n'est pas lu — ce
// n'est jamais « éteint ».
export type EtatDuManager = { allume: boolean; dit?: string; releve: string } | Sans;
// L'état du grant `merge`, pour son interrupteur, à côté de celui du manager (#907) : actif ou non, tel
// que les lignes de tête de `status` le disent — une ligne `merge ACTIF…` le dit actif ; `merge ÉTEINT
// SEUL…`, éteint de lui-même (`seul`) ; sans ligne, il n'est pas actif : le runtime écrit toujours un
// grant actif. `releve` : sa ligne, mot pour mot, que l'interrupteur montre au survol — absente quand
// `status` n'en a pas. `sans` : pourquoi il n'est pas lu — ce n'est jamais « éteint ».
export type EtatDuGrant = { actif: boolean; seul?: true; releve?: string } | Sans;
export type Bande = { projet: string; alertes: Alerte[]; signal?: Signal; manager?: EtatDuManager; merge?: EtatDuGrant };

// Un état que l'app n'a pas : pourquoi, dans ses mots.
export type Sans = { sans: string };
// Ce que la bande lit d'un projet. `status` : sa sortie, le bloc `attend` mis à part ou non ;
// `attend` : ce bloc, quand il a été mis à part (attend.ts, `mettreAPart`).
// `controle` : ce que la box a dit d'un projet installé, ses stations et ses manques (service.ts) —
// absent, rien n'en a été lu : un projet pas encore installé, ou pas encore contrôlé.
export type Lu = { projet: string; faits: Faits | Sans; status: string | Sans; attend?: string; manager: Interrupteur | Sans; controle?: Controle; limite?: LimiteDeLApp };

// Ce que l'app a lu de sa propre limite : GitHub refuse ses appels, et `reprise` est l'instant où il les rend, nul s'il ne le dit pas.
export type LimiteDeLApp = { reprise: string | null };

const s = (combien: number) => (combien > 1 ? "s" : "");
const court = (commit: string) => commit.slice(0, 12);
const AUCUN = "none: nothing changes on the station";
const LIRE = "none: reading changes nothing on the station";
const RELIRE_FAITS = `wait for it to be read: \`${FAITS}\` is re-read every 30 s`;
// Le geste d'une ligne qui demande de lire, de juger ou d'agir sur la box : une demande au second.
const DEMANDE = { demande: true } as const;

// Une ligne « non vérifié » : l'état n'est pas dit, et ce n'est pas « sain ».
type NonDit = { pourquoi: string; releve?: string; geste: string; prix: string; appel?: Appel };
const nonVerifie = (sujet: Sujet, dit: string, { pourquoi, releve, geste, prix, appel }: NonDit): Alerte => ({
  sujet,
  verifie: false,
  ton: "gris",
  dit,
  pourquoi,
  ...(releve === undefined ? {} : { releve }),
  geste,
  ...(appel === undefined ? {} : { appel }),
  prix,
});

// --- La limite d'appels de GitHub --------------------------------------------------
//
// La box et l'app parlent à GitHub avec le même compte : la limite est la même pour les deux. La box
// la dit dans `faits` (`limiteGithub`, lu sur le compteur de la station) ; l'app, elle, la lit de sa
// propre erreur de limite (stations/stations.ts) — c'est elle qui reste quand la box ne passe plus
// par GitHub. Une seule ligne, l'heure de reprise à l'heure locale du chef, jamais le texte de `gh`.
// Elle n'attend rien du chef : elle tombe d'elle-même quand les appels reprennent.
function deLaLimite(faits: Faits | Sans, limite: LimiteDeLApp | undefined): Alerte[] {
  const reprise = limite !== undefined ? limite.reprise : "sans" in faits ? null : (faits.limiteGithub ?? null);
  if (limite === undefined && ("sans" in faits || faits.limiteGithub === undefined)) return [];
  return [
    {
      sujet: "github",
      verifie: true,
      ton: "jaune",
      dit: `GitHub is rate-limiting calls, back around ${reprise === null ? "a time GitHub does not give" : heureHM(reprise)}`,
      geste: "nothing to do: the calls resume by themselves when GitHub lifts the limit",
      prix: AUCUN,
    },
  ];
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
const enCause = ({ decision, geste }: DecisionUrgente) => `${decision}  ${geste}`;

function deLUrgence(faits: Faits | Sans): Alerte[] {
  if ("sans" in faits || faits.urgence == null) return [];
  const urgence = faits.urgence;
  const { retenus, autres } = urgence;
  const aussi = autres.length === 0 ? "" : ` — also held by ${autres.map(({ decision }) => decision).join(", ")}`;
  return [
    {
      sujet: "urgence",
      verifie: true,
      ton: "rouge",
      dit: `the whole kitchen is waiting for ${attendu(urgence)} — at a standstill for ${duree(Date.parse(faits.lu) - Date.parse(urgence.depuis))}`,
      pourquoi: `${retenus.length} ticket${s(retenus.length)} held, none can cook until you act: ${retenus.map((ticket) => `#${ticket}`).join(", ")}${aussi}`,
      releve: [urgence, ...autres].map(enCause).join("\n"),
      geste: `do what ${urgence.decision} waits for, as the station writes it`,
      appel: DEMANDE,
      prix: "none: nothing is cooking — once you act, the held tickets start again, on your quota",
    },
  ];
}

// --- Le manager ---------------------------------------------------------------

// Tant que la file ne porte pas son état (#438), l'app le lit elle-même : avant sa première lecture, il n'est pas dit.
export const MANAGER_PAS_DIT = "first reading of `manager` in progress: the queue does not say the manager's state (#438). This is not “on”";
// docs/runtime/manager.md, « Le manager » : ce qu'allumer engage (allumage.ts, `AVERTISSEMENT`).
const PRIX_ALLUMER = "it judges the whole open backlog, and what it judges executable is taken at once — what that commits is counted when you act";

// Éteint, ce que la tête du rail en dit, et la ligne de la bande : une seule phrase, la même partout.
export const MANAGER_ETEINT = "manager off — nothing new comes in";
// La ligne `manager` telle que le runtime l'écrit.
const releveDe = ({ mot, depuis, par, dit }: Interrupteur) => `${mot}${depuis === undefined ? "" : ` since ${depuis} (by ${par})`} — ${dit}`;

// Éteint, le manager reste une ligne de la bande : c'est elle qui fait le signal de la case du projet,
// dans la barre. Dans l'espace du projet, la vue ne la pose pas : son interrupteur et la tête du rail
// le disent (#906) — `manager`, sur la bande.
function duManager(manager: Interrupteur | Sans): Alerte[] {
  if ("sans" in manager) return [nonVerifie("manager", "manager state not verified", { pourquoi: manager.sans, geste: "wait for it to be read: `manager` is re-read every 30 s — or open it in the Manager tab", prix: LIRE, appel: { onglet: "manager" } })];
  if (manager.allume) return [];
  return [
    {
      sujet: "manager",
      verifie: true,
      ton: "rouge",
      dit: MANAGER_ETEINT,
      releve: releveDe(manager),
      geste: "turn the manager on",
      appel: { geste: "manager-allumer" },
      prix: PRIX_ALLUMER,
    },
  ];
}
const etatDuManager = (manager: Interrupteur | Sans): EtatDuManager => ("sans" in manager ? manager : { allume: manager.allume, ...(manager.allume ? {} : { dit: MANAGER_ETEINT }), releve: releveDe(manager) });

// --- La cuisine -------------------------------------------------------------

// Une ligne de tête de `status` : son titre, sa valeur, et les lignes qui la précisent
// (runtime/src/etat.ts, `ligne` : le titre complété d'espaces jusqu'à onze caractères).
type Tete = { titre: string; valeur: string; suite: string[] };
const LIGNE_DE_TETE = /^(\S+) +(\S.*)$/;
const SUITE_DE_TETE = /^ {11}(\S.*)$/;

// Les lignes de tête de `status` : celles d'avant sa première ligne vide.
export function tetesDe(status: string): Tete[] {
  const tetes: Tete[] = [];
  for (const ligne of status.split("\n")) {
    if (ligne.trim() === "") break;
    const [, titre, valeur] = LIGNE_DE_TETE.exec(ligne) ?? [];
    const [, suite] = SUITE_DE_TETE.exec(ligne) ?? [];
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
const ROUGE = /^(?:ROUGE|RED)(?![\p{L}\p{N}_])/u;
const DISJONCTEUR = /disjoncteur OUVERT|breaker OPEN/;
// Les titres des lignes de tête que #928 a traduits : l'app lit les deux.
export const CUISINE = ["cuisine", "kitchen"];
export const CONNEXION = ["connexion", "connection"];

// Ce qui retient la cuisine, d'après les lignes de tête de `status` : une ligne par cause
// que l'app sait lire.
function causesDeRetenue(status: string): Alerte[] {
  return tetesDe(status).flatMap(({ titre, valeur, suite }): Alerte[] => {
    if (CUISINE.includes(titre) && DISJONCTEUR.test(valeur))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "breaker open: the latest launches failed in a row, no cook goes any more",
          releve: valeur.slice(valeur.search(DISJONCTEUR)),
          geste: "resume the kitchen, once you have read why they fail",
          appel: { geste: "reprendre" },
          prix: `the breaker closes: ${REPRENDRE}`,
        },
      ];
    if (titre === "stations") {
      const { releve, geste } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "no station declared: no cook goes, the kitchen is frozen", releve, geste: geste ?? "declare a station, then restart the runtime", appel: DEMANDE, prix: REDEMARRAGE }];
    }
    if (CONNEXION.includes(titre)) {
      const { releve, geste } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "Max connection down: no ticket is taken any more", releve, geste: geste ?? "reconnect, then resume the kitchen", appel: DEMANDE, prix: REPRENDRE }];
    }
    if (titre === "base" && ROUGE.test(valeur))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "base red: the station takes no more tickets, the pass neither judges nor merges",
          releve: [valeur, ...suite].join("\n"),
          geste: "clear what makes it red, then replay its gates — its last line gives the action",
          appel: DEMANDE,
          prix: "no cook is interrupted: its gates are replayed",
        },
      ];
    return [];
  });
}

// Le statut lu d'un projet, ou pourquoi il ne l'est pas.
const PAS_DE_CUISINE = "the output of `status` has no `kitchen` line: this is not a shape the app can read";
function statusLu(status: string | Sans): string | Sans {
  if (typeof status !== "string") return status;
  return tetesDe(status).some(({ titre }) => CUISINE.includes(titre)) ? status : { sans: PAS_DE_CUISINE };
}

// --- Le setup du projet -------------------------------------------------------

// La ligne de tête `setup` de `status` (runtime/src/etat.ts, `decrireSetup`) : `BLOCKED for …
// on <commit> — …` (`BLOQUÉ depuis …` avant #928). Absente, le setup du projet n'est pas bloqué : rien à dire.
const SETUP_BLOQUE = /^(?:BLOQUÉ|BLOCKED)(?![\p{L}\p{N}_])/u;
const bloqueLeSetup = (status: string) => tetesDe(status).some(({ titre, valeur }) => titre === "setup" && SETUP_BLOQUE.test(valeur));

// L'entrée `setup` du bloc `attend` (runtime/src/attend.ts, `decrireAttentes`) : deux espaces,
// `setup`, deux espaces, depuis quand, deux espaces, puis la cause et le geste — c'est ce qui en
// est repris, mot pour mot, avec les lignes qui la précisent, sans leur retrait. Rien quand le
// texte n'en a pas. Depuis quand se dit `depuis …` ou `for …` (#927).
const TETE_DE_SETUP = /^ {2}setup {2}(?:(?:depuis|for) \S.*? {2})?(\S.*)$/;
const SUITE_D_ENTREE = /^ {6}(\S.*)$/;
export function entreeDeSetup(texte: string): string | undefined {
  const lignes = texte.split("\n");
  const rang = lignes.findIndex((ligne) => TETE_DE_SETUP.test(ligne));
  const [, ligne] = TETE_DE_SETUP.exec(lignes[rang] ?? "") ?? [];
  if (ligne === undefined) return undefined;
  const suite: string[] = [];
  for (const suivante of lignes.slice(rang + 1)) {
    const [, precise] = SUITE_D_ENTREE.exec(suivante) ?? [];
    if (precise === undefined) break;
    suite.push(precise);
  }
  return [ligne, ...suite].join("\n");
}

// Le setup du projet bloqué : plus aucun worktree n'est préparé sur la box, pour aucun ticket,
// tant que la branche d'intégration ne bouge pas. La ligne reprend ce que le runtime en dit dans
// sa file — la cause en clair, et le geste —, et sort d'elle-même quand il ne le dit plus. Une
// station distante, qui prépare son setup sur son poste, cuisine encore : la cuisine est alors
// ouverte, et la ligne le dit, moins grave.
const LEVER_LE_SETUP = "clear its cause as the station says — declare the refused host in `.claude/brigade/reseau` of the project, or fix the project's setup — then merge on the integration branch";
const PRIX_DU_SETUP = "no cook is interrupted: the setups resume by themselves once the integration branch moves";
function duSetup(faits: Faits | Sans, status: string | Sans, attend: string | undefined): Alerte[] {
  const lu = statusLu(status);
  if (typeof lu !== "string" || !bloqueLeSetup(lu)) return [];
  const entree = entreeDeSetup(attend ?? lu);
  const ailleurs = !("sans" in faits) && faits.etat === "ouverte";
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
      appel: DEMANDE,
      prix: PRIX_DU_SETUP,
    },
  ];
}

function deLaCuisine(projet: string, faits: Faits | Sans, status: string | Sans): Alerte[] {
  if ("sans" in faits) return [nonVerifie("cuisine", "kitchen state not verified", { pourquoi: faits.sans, geste: RELIRE_FAITS, prix: LIRE })];
  switch (faits.etat) {
    case "ouverte":
      return [];
    case "éteinte":
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "runtime stopped: nothing is running, no ticket is taken",
          pourquoi: tick(faits),
          geste: `start it on the station: \`systemctl start brigade@${projet}\``,
          appel: DEMANDE,
          prix: "no cook is interrupted: nothing is running — queued tickets start again, on your quota",
        },
      ];
    case "arrêtée":
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: REPRENDRE }];
    case "retenue": {
      const lu = statusLu(status);
      const causes = typeof lu === "string" ? causesDeRetenue(lu) : [];
      // Retenue par le seul setup bloqué : sa ligne le dit déjà.
      // Sans `status` lu, rien ne dit qu'une cause est seule à la retenir.
      if (typeof lu === "string" && (causes.length > 0 || bloqueLeSetup(lu))) return causes;
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "jaune",
          dit: "kitchen held: it is running, but no cook goes any more",
          pourquoi: typeof lu === "string" ? "`status` gives no cause the app can read" : `its cause was not read: ${lu.sans}`,
          geste: "read its cause: `status`, in the panel",
          appel: DEMANDE,
          prix: LIRE,
        },
      ];
    }
    default:
      return [nonVerifie("cuisine", "kitchen state not verified", { pourquoi: `the kitchen is “${faits.etat}” according to \`${FAITS}\`, a word the app does not know`, geste: "update the app", prix: AUCUN })];
  }
}

// --- Le grant ---------------------------------------------------------------

// Une ligne `grant` de `status` (runtime/src/etat.ts, `decrireGrants`) : `<action> ACTIVE…`,
// `<action> ACTIVE, EXPIRING SOON: …`, `<action> LAPSED … ago` — ou, avant #928, `ACTIF`,
// `BIENTÔT ÉTEINT`, `ÉTEINT SEUL il y a …`. Absente, aucun grant ne vaut ni ne s'est éteint
// seul — ou le chef l'a révoqué : rien à dire.
const GRANT = /^(\S+) (ACTIF|ACTIVE|ÉTEINT SEUL|LAPSED)(?![\p{L}\p{N}_])/u;
const ACTIF_OU_ETEINT = { ACTIF: true, ACTIVE: true, "ÉTEINT SEUL": false, LAPSED: false } as const;
const BIENTOT_ETEINT = /BIENTÔT ÉTEINT|EXPIRING SOON/u;
const MERGE_SANS_TOI = "a green pass will be merged without you";
// Le grant que l'espace du projet pose en interrupteur (#907) : les autres restent des lignes de la bande.
export const MERGE = "merge";

// L'état du grant `merge`, d'après les lignes de tête de `status` : la ligne de la bande, s'il y en a une, dit la même chose.
export function etatDuMerge(status: string | Sans): EtatDuGrant {
  const lu = statusLu(status);
  if (typeof lu !== "string") return lu;
  const ligne = tetesDe(lu).find(({ titre, valeur }) => titre === "grant" && valeur.startsWith(`${MERGE} `));
  if (ligne === undefined) return { actif: false };
  const [, , mot] = GRANT.exec(ligne.valeur) ?? [];
  if (mot === undefined) return { sans: `the app cannot read this \`grant\` line of \`status\`: “${ligne.valeur}”` };
  return ACTIF_OU_ETEINT[mot as keyof typeof ACTIF_OU_ETEINT] ? { actif: true, releve: ligne.valeur } : { actif: false, seul: true, releve: ligne.valeur };
}

function duGrant(status: string | Sans): Alerte[] {
  const lu = statusLu(status);
  const lireGrants = { geste: "read it: the Grants tab reads `grant` on the station", prix: LIRE, appel: { onglet: "grants" } };
  if (typeof lu !== "string") return [nonVerifie("grant", "grant state not verified", { pourquoi: lu.sans, ...lireGrants })];
  return tetesDe(lu)
    .filter(({ titre }) => titre === "grant")
    .flatMap(({ valeur }): Alerte[] => {
      const [, action, mot] = GRANT.exec(valeur) ?? [];
      if (action === undefined) return [nonVerifie("grant", "grant state not verified", { pourquoi: "the app cannot read this `grant` line of `status`", releve: valeur, ...lireGrants })];
      if (!ACTIF_OU_ETEINT[mot as keyof typeof ACTIF_OU_ETEINT])
        return [
          {
            sujet: "grant",
            verifie: true,
            ton: "rouge",
            dit: `grant \`${action}\` lapsed: the pass stops at the open PR, nothing is merged without you any more`,
            releve: valeur,
            geste: `enable \`${action}\` again`,
            ...(GRANTS.includes(action) ? { appel: { geste: "grant-activer", grant: action } } : {}),
            prix: MERGE_SANS_TOI,
          },
        ];
      // Actif : c'est le chef qui l'a accordé. Il ne se dit que lorsqu'il va s'éteindre.
      if (!BIENTOT_ETEINT.test(valeur)) return [];
      return [
        {
          sujet: "grant",
          verifie: true,
          ton: "jaune",
          dit: `grant \`${action}\` expiring soon: then, the pass will stop at the open PR`,
          releve: valeur,
          geste: `extend it without revoking it: \`grant extend ${action}\` (docs/runtime/pass-merge.md, “Le prolonger”)`,
          appel: DEMANDE,
          prix: MERGE_SANS_TOI,
        },
      ];
    });
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
const GESTES_DE_BOX = [
  { section: "« Le geste d'installation »", nom: "install a project", empeche: "installing a project on this station by its installation action would be refused" },
] as const;
const SUR_LA_BOX = "the station itself: whoever has `sudo` there runs it — the app sends nothing";
const RECONTROLE = "the alert leaves once the station says it is back: the app checks again every 5 min, and when this space opens";

// Combien de passages de suite le renouvellement de la session Max peut rater avant que la bande
// le dise : un seul échec peut être un accident, deux de suite sont un renouvellement qui ne se
// rétablit pas. À changer ici, nulle part ailleurs.
export const ECHECS_POUR_ALERTER = 2;

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
function dUnePanne(controle: Controle | undefined): Alerte[] {
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

function duRenouvellement(controle: Controle | undefined): Alerte[] {
  const echec = controle?.renouvellement;
  if (echec === undefined || echec.echecs < ECHECS_POUR_ALERTER) return [];
  return [
    {
      sujet: "renouvellement",
      verifie: true,
      ton: "rouge",
      dit: `Max renewal failing: ${echec.echecs} runs in a row — the session will expire if it is not restored`,
      releve: echec.raison,
      geste: "`journalctl -u brigade-renouvellement.service` on the station says more; fix what it names",
      appel: DEMANDE,
      prix: `none for the kitchen: it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
      ...(controle === undefined ? {} : verdictDe(controle)),
    },
  ];
}

function desPertes(controle: Controle | undefined, status: string | Sans): Alerte[] {
  if (controle === undefined) return [];
  const { stations, manques = [] } = controle;
  const pertes: Alerte[] = [];
  if (stations !== undefined) {
    const fournies = new Set(stations.proposees.map(({ nom }) => nom));
    // Une station distante tourne sur un poste : ce que cette machine fournit n'en dit rien.
    for (const { nom, moteur } of stations.declarees.filter(({ distante }) => !distante)) {
      // Le manque qui dit son moteur introuvable par le service : la station ne lance rien, même
      // si la commande qui la propose le trouve encore — et il porte le geste qui le remet, mot pour mot.
      const introuvable = manques.find(({ texte }) => texte.startsWith(`\`${moteur}\` est introuvable`));
      if (fournies.has(nom) && introuvable === undefined) continue;
      const releve = introuvable?.texte ?? stations.absent;
      pertes.push({
        sujet: "station",
        verifie: true,
        ton: "rouge",
        dit: `station “${nom}” missing: its main station no longer provides it — no cook goes there`,
        ...(releve === null ? {} : { releve }),
        geste: introuvable?.geste ?? `put \`${moteur}\` back on the station, where the service finds it — \`installation\` there gives the exact command`,
        appel: DEMANDE,
        prix: `none for the kitchen: it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
        ...verdictDe(controle),
      });
    }
  }
  // Plus aucune station déclarée : la ligne `stations` de `status`, quand elle est lue, le dit déjà.
  const ditParStatus = typeof status === "string" && tetesDe(status).some(({ titre }) => titre === "stations");
  const sansStation = manques.find(({ etape }) => etape === "stations");
  if (sansStation !== undefined && !ditParStatus && (stations === undefined || stations.declarees.length === 0)) {
    pertes.push({
      sujet: "station",
      verifie: true,
      ton: "rouge",
      dit: "no station declared any more: no cook goes, tickets wait on the rail",
      releve: sansStation.texte,
      geste: sansStation.geste ?? "declare a station again: `installation stations` on its main station lists those it provides",
      appel: DEMANDE,
      prix: `none: the declaration is read at the runtime's next wake-up, without a restart; ${RECONTROLE}`,
      ...verdictDe(controle),
    });
  }
  for (const { section, nom, empeche } of GESTES_DE_BOX) {
    const manque = manques.find(({ geste }) => geste?.includes(section));
    if (manque === undefined) continue;
    pertes.push({
      sujet: "box",
      verifie: true,
      ton: "jaune",
      dit: `station action “${nom}” missing: ${empeche}`,
      releve: manque.texte,
      geste: manque.geste ?? `set it up again on the station — docs/installer.md, ${section}`,
      appel: DEMANDE,
      prix: `none: no cook is interrupted — it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
      ...verdictDe(controle),
    });
  }
  return pertes;
}

// Le mot du bouton d'un geste, d'après ce que l'alerte appelle : le geste du socle par son nom, une
// demande au second, un onglet. Un geste que l'app ne sait pas nommer garde le début de sa phrase,
// avant tout ce qui ressemble à une commande ou à une explication.
const BOUTONS_DE_GESTE: Readonly<Record<string, string>> = { "manager-allumer": "turn the manager on", reprendre: "resume the kitchen" };
export function boutonDe({ geste, appel }: Pick<Alerte, "geste" | "appel">): string | undefined {
  if (appel === undefined) return undefined;
  if ("demande" in appel) return "ask the second";
  if ("onglet" in appel) return `open the ${appel.onglet} tab`;
  if ("relire" in appel) return "try again now";
  if (appel.geste === "grant-activer" && appel.grant !== undefined) return `enable ${appel.grant} again`;
  return BOUTONS_DE_GESTE[appel.geste] ?? (geste.split(/[:,—`]/)[0] ?? geste).trim();
}
const avecBouton = (alerte: Alerte): Alerte => {
  const bouton = boutonDe(alerte);
  return bouton === undefined ? alerte : { ...alerte, bouton };
};

// La bande d'un projet, d'après ce qui en a été lu : l'urgence, le manager, la cuisine — et
// son setup —, le grant, et ce que le projet installé a perdu.
export function alertes({ projet, faits, status, attend, manager, controle, limite }: Lu): Alerte[] {
  return parGravite([...deLUrgence(faits), ...deLaLimite(faits, limite), ...duManager(manager), ...deLaCuisine(projet, faits, status), ...duSetup(faits, status, attend), ...duGrant(status), ...desPertes(controle, statusLu(status)), ...duRenouvellement(controle), ...dUnePanne(controle)].map(avecBouton));
}

// La plus grave d'abord : l'urgence au-dessus de tout, puis une alerte lue avant un état non vérifié,
// le rouge avant le reste. Le tri est stable : à gravité égale, l'ordre de la bande (manager, cuisine,
// grant) tient.
const GRAVITE = (alerte: Alerte) => (alerte.sujet === "urgence" ? -1 : (alerte.verifie ? 0 : 10) + (alerte.ton === "rouge" ? 0 : alerte.ton === "jaune" ? 1 : 2));
const parGravite = (bande: Alerte[]): Alerte[] => bande.map((alerte, rang) => ({ alerte, rang })).sort((a, b) => GRAVITE(a.alerte) - GRAVITE(b.alerte) || a.rang - b.rang).map(({ alerte }) => alerte);

// Le signal d'une bande, pour la case de son projet : l'urgence l'emporte sur tout, et se dit comme
// telle — pas comme une alerte ordinaire ; puis une alerte vérifiée ; sinon un état non vérifié,
// nommé comme tel — jamais lu comme sain. Même logique que la bande : rien n'y est recalculé.
export function signalDe(bande: readonly Alerte[]): Signal | undefined {
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
// version, la cuisine, le grant. Quatre « non vérifié » pour une seule cause, chacun avec un geste
// qui n'y change rien (#728). Passé ce nombre de lectures de `faits` ratées de suite — la box pas
// jointe, pas la commande qui échoue —, la bande ne dit plus qu'une ligne : la box, depuis quand,
// pourquoi, et ce que le chef peut y faire. Elle sort dès que la box répond.
export const LECTURES_POUR_INJOIGNABLE = 2;

// La cause d'un `ssh` pas arrivé, en mots simples — d'après ce qu'il a écrit, jamais redit tel quel.
export function causeDuSilence(erreur: string): string {
  if (/could not resolve hostname|name or service not known|no address associated|nodename nor servname/i.test(erreur)) return "address not found — the name your `ssh` uses for this station resolves to nothing";
  if (/connection refused/i.test(erreur)) return "connection refused — the machine answers, but nothing accepts `ssh` there";
  return "no answer — the machine does not reply to `ssh`";
}

type SansReponse = { depuis: string; a: string; lectures: number; cause: string };

function deLaBoxMuette({ depuis, a, lectures, cause }: SansReponse): Alerte {
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

// --- Ce qui est tenu, projet par projet -----------------------------------------

const FAITS_PAS_ENCORE = "first reading in progress";
const STATUS_PAS_LU = "`status` is only read for the project shown, or for all of them in “All projects” — not for this one right now";
const STATUS_PAS_ENCORE = "first reading of `status` in progress";

// Ce qu'une lecture ratée dit, dans les mots de la carte du projet (faits.ts, `titreDEchec`).
const rate = (commande: string, lecture: Echec) =>
  `\`${commande}\` was not read: ${titreDEchec(lecture, `REACHED, BUT \`${commande}\` DID NOT ANSWER`).toLowerCase()}`;

// Les dernières lectures de chaque projet, tenues par le process principal, et la bande
// qui s'en dessine. Chaque réception rend la bande du projet à redessiner. Rien n'y est
// gardé d'une lecture qui n'est plus rafraîchie : ce qu'elle disait redevient « non vérifié ».
// Une alerte non vérifiée n'est dite qu'établie : lue deux fois de suite par la lecture dont elle vient.
// Une lecture qui rate une fois et réussit au tour suivant ne montre rien ; une box qui ne répond pas
// deux lectures de suite le dit — une fois, et la ligne reste tant que ça dure.
export const LECTURES_POUR_ETABLIR = 2;
// Une ligne dite reste au moins ce temps (ms), même si l'état est levé aussitôt : le temps d'être lue.
// Elle part à la première réception qui suit — `faits` est relu toutes les 30 s.
export const AFFICHAGE_MINIMUM = 20_000;
// Ce qui est dit « pas encore lu » le temps d'une première lecture ne se montre jamais : l'app attend son résultat.
const EN_COURS = [FAITS_PAS_ENCORE, STATUS_PAS_ENCORE, MANAGER_PAS_DIT];

type Source = "faits" | "status" | "manager" | "controle";
// Quelles lectures disent chaque sujet : une réception ne compte que pour les alertes qu'elle a relues.
const LECTURES_DE: Record<Sujet, readonly Source[]> = {
  urgence: ["faits"],
  github: ["faits"],
  manager: ["manager"],
  cuisine: ["faits", "status"],
  grant: ["status"],
  station: ["controle", "status"],
  box: ["controle", "status"],
  renouvellement: ["controle"],
  verification: ["controle"],
  injoignable: ["faits"],
};
const cle = ({ sujet, dit }: Alerte) => `${sujet}\u0000${dit}`;

export function tenirBandes({ maintenant = Date.now, etablir = LECTURES_POUR_ETABLIR, minimum = AFFICHAGE_MINIMUM }: { maintenant?: () => number; etablir?: number; minimum?: number } = {}) {
  const faits = new Map<string, Faits | Sans>();
  const statuts = new Map<string, string | Sans>();
  // Le bloc `attend` du dernier `status` lu, mis à part : il ne vit qu'avec lui.
  const attends = new Map<string, string>();
  const managers = new Map<string, Interrupteur | Sans>();
  // Le dernier contrôle d'un projet installé (service.ts) : il vaut jusqu'au suivant.
  const controles = new Map<string, Controle>();
  // La limite que l'app a lue elle-même sur GitHub : elle vaut jusqu'à la lecture suivante des stations.
  let limiteDeLApp: LimiteDeLApp | undefined;
  // Ce que la bande de chaque projet dit maintenant : le suivi de chaque ligne, et la bande rendue.
  // `origine` : la lecture dont l'alerte vient ; `rates` : ses échecs de suite, et eux seuls.
  type Suivi = { origine?: Source; rates: number; dite?: { alerte: Alerte; depuis: number } };
  const suivis = new Map<string, Map<string, Suivi>>();
  const rendues = new Map<string, Bande>();
  // La box d'un projet qui ne répond pas : depuis quand, et combien de lectures de `faits` de suite.
  const silences = new Map<string, SansReponse>();
  const brute = (projet: string): Alerte[] => {
    const attend = attends.get(projet);
    const controle = controles.get(projet);
    return alertes({
      projet,
      faits: faits.get(projet) ?? { sans: FAITS_PAS_ENCORE },
      status: statuts.get(projet) ?? { sans: STATUS_PAS_LU },
      ...(attend === undefined ? {} : { attend }),
      manager: managers.get(projet) ?? { sans: MANAGER_PAS_DIT },
      ...(controle === undefined ? {} : { controle }),
      ...(limiteDeLApp === undefined ? {} : { limite: limiteDeLApp }),
    });
  };
  // La bande à dire après une réception de `source` : l'état lu, passé par ce que le chef a le temps de lire.
  // Un contenu identique à la précédente rend la même bande (même objet) : rien ne bouge.
  // La lecture dont une alerte non vérifiée vient : celle qui n'a pas pu dire, dont l'alerte reprend les mots.
  // Faute de mots reconnus (un mot que l'app ne connaît pas), la première lecture du sujet — celle qui l'a dit.
  const origineDe = (projet: string, alerte: Alerte): Source => {
    const sans: Partial<Record<Source, string>> = {};
    const f = faits.get(projet);
    if (f !== undefined && "sans" in f) sans.faits = f.sans;
    const st = statuts.get(projet);
    if (st !== undefined && typeof st !== "string") sans.status = st.sans;
    const m = managers.get(projet);
    if (m !== undefined && "sans" in m) sans.manager = m.sans;
    const pourquoi = alerte.pourquoi ?? "";
    const trouvee = LECTURES_DE[alerte.sujet].find((source) => sans[source] !== undefined && pourquoi.includes(sans[source]));
    return trouvee ?? LECTURES_DE[alerte.sujet][0] ?? "faits";
  };
  const bande = (projet: string, source?: Source): Bande => {
    const silence = silences.get(projet);
    if (silence !== undefined && silence.lectures >= LECTURES_POUR_INJOIGNABLE) {
      const triees = [deLaBoxMuette(silence)];
      const manager = etatDuManager(managers.get(projet) ?? { sans: MANAGER_PAS_DIT });
      const merge = etatDuMerge(statuts.get(projet) ?? { sans: STATUS_PAS_LU });
      const avant = rendues.get(projet);
      if (avant !== undefined && JSON.stringify(avant.alertes) === JSON.stringify(triees) && JSON.stringify(avant.manager) === JSON.stringify(manager) && JSON.stringify(avant.merge) === JSON.stringify(merge)) return avant;
      const rendue: Bande = { projet, alertes: triees, signal: signalDe(triees), manager, merge };
      rendues.set(projet, rendue);
      return rendue;
    }
    const instant = maintenant();
    const suivi = suivis.get(projet) ?? new Map<string, Suivi>();
    suivis.set(projet, suivi);
    const lues = brute(projet);
    const presentes = new Set<string>();
    const dites: Alerte[] = [];
    for (const alerte of lues) {
      const k = cle(alerte);
      if (!alerte.verifie && EN_COURS.some((mot) => alerte.pourquoi?.includes(mot))) continue;
      presentes.add(k);
      const etat = suivi.get(k) ?? { rates: 0 };
      suivi.set(k, etat);
      // Seule la lecture dont l'alerte vient la compte : la réception d'une autre source du même sujet n'établit rien, et ne défait rien.
      if (!alerte.verifie) {
        const origine = origineDe(projet, alerte);
        if (etat.origine !== origine) etat.rates = 0;
        etat.origine = origine;
        if (source === origine) etat.rates++;
      }
      if (etat.dite !== undefined || alerte.verifie || etat.rates >= etablir) {
        etat.dite = { alerte, depuis: etat.dite?.depuis ?? instant };
        dites.push(alerte);
      }
    }
    for (const [k, etat] of suivi) {
      if (presentes.has(k)) continue;
      // La lecture dont elle vient, réussie, repart de zéro, même si la ligne reste dite le temps d'être lue.
      if (source !== undefined && source === etat.origine) etat.rates = 0;
      if (etat.dite !== undefined && instant - etat.dite.depuis < minimum) dites.push(etat.dite.alerte);
      else suivi.delete(k);
    }
    const triees = parGravite(dites);
    const manager = etatDuManager(managers.get(projet) ?? { sans: MANAGER_PAS_DIT });
    const merge = etatDuMerge(statuts.get(projet) ?? { sans: STATUS_PAS_LU });
    const avant = rendues.get(projet);
    if (avant !== undefined && JSON.stringify(avant.alertes) === JSON.stringify(triees) && JSON.stringify(avant.manager) === JSON.stringify(manager) && JSON.stringify(avant.merge) === JSON.stringify(merge)) return avant;
    const rendue: Bande = { projet, alertes: triees, signal: signalDe(triees), manager, merge };
    rendues.set(projet, rendue);
    return rendue;
  };
  // Ce qu'une lecture prouve de la box : pas jointe, elle compte — mais seule celle de `faits`, qui
  // est lue pour chaque projet, à chaque tour ; jointe, tout est remis à zéro.
  const noter = (lecture: Lecture, compte: boolean): void => {
    if (!("erreur" in lecture) || lecture.atteinte) return void silences.delete(lecture.projet);
    const avant = silences.get(lecture.projet);
    silences.set(lecture.projet, {
      depuis: avant?.depuis ?? lecture.a,
      a: lecture.a,
      lectures: (avant?.lectures ?? 0) + (compte ? 1 : 0),
      cause: causeDuSilence(lecture.erreur),
    });
  };
  return {
    // La barre est posée : `faits` va être lu pour chacun de ces projets. Ce qui en était
    // lu est oublié ; un projet qui n'en est plus n'a plus rien de tenu.
    ouvrir(projets: readonly string[]): Bande[] {
      faits.clear();
      for (const tenus of [statuts, attends, managers, controles, silences, suivis, rendues]) for (const projet of tenus.keys()) if (!projets.includes(projet)) tenus.delete(projet);
      return projets.map((projet) => bande(projet));
    },
    // Une lecture de `faits`.
    faits(lecture: Lecture): Bande {
      noter(lecture, true);
      if ("erreur" in lecture) faits.set(lecture.projet, { sans: rate(FAITS, lecture) });
      else {
        const lu = comprendre(lecture.sorties.find(({ commande }) => commande === FAITS)?.texte ?? "");
        faits.set(lecture.projet, "informe" in lu ? { sans: `the station did not return the shape of \`${FAITS}\`: ${lu.informe}` } : lu);
      }
      return bande(lecture.projet, "faits");
    },
    // La lecture des stations sur GitHub : si GitHub limite les appels du compte, chaque projet le dit.
    limite(vue: LimiteDeLApp | undefined): Bande[] {
      limiteDeLApp = vue;
      return [...suivis.keys()].map((projet) => bande(projet));
    },
    // Une lecture de `status`, son bloc `attend` mis à part : les lignes de tête restent.
    status(montree: Montree): Bande {
      noter(montree, false);
      const texte = "erreur" in montree ? undefined : montree.sorties.find(({ commande }) => commande === "status")?.texte;
      statuts.set(montree.projet, "erreur" in montree ? { sans: rate("status", montree) } : (texte ?? { sans: "the reading did not return `status`" }));
      if ("erreur" in montree || montree.attend === undefined) attends.delete(montree.projet);
      else attends.set(montree.projet, montree.attend);
      return bande(montree.projet, "status");
    },
    // La veille de `status` lit désormais ces projets : pour ceux-là, la première lecture est en
    // route ; les autres ne sont plus lus, et ce qui en était lu est lâché.
    veiller(projets: readonly string[]): Bande[] {
      const touches = new Set([...statuts.keys(), ...projets]);
      for (const projet of touches) {
        attends.delete(projet);
        if (projets.includes(projet)) statuts.set(projet, { sans: STATUS_PAS_ENCORE });
        else statuts.delete(projet);
      }
      return [...touches].map((projet) => bande(projet));
    },
    // Une lecture de `manager` — celle de la veille du manager, ou celle de l'onglet : l'état du manager, ou pourquoi il n'est pas lu.
    manager(lecture: Lecture): Bande {
      noter(lecture, false);
      const sortie = "erreur" in lecture ? undefined : lecture.sorties.find(({ commande }) => commande === MANAGER)?.texte;
      const lu = sortie === undefined ? undefined : managerDe(sortie);
      managers.set(
        lecture.projet,
        "erreur" in lecture ? { sans: rate(MANAGER, lecture) } : lu === undefined ? { sans: "the reading did not return `manager`" } : "informe" in lu ? { sans: `the output of \`manager\` does not have the expected shape: ${lu.informe}` } : lu.interrupteur,
      );
      return bande(lecture.projet, "manager");
    },
    // Ce que l'installation d'un projet dit de lui (service.ts, `Guide`) : installé et contrôlé, ce
    // qu'il a perdu ; sinon rien — un projet qui s'installe a son écran, pas d'alerte de perte.
    controle(projet: string, controle: Controle | undefined): Bande {
      if (controle === undefined) controles.delete(projet);
      else controles.set(projet, controle);
      return bande(projet, "controle");
    },
    // La ligne que la vue nomme par son sujet et ce qu'elle dit, telle que la bande la dit
    // maintenant — rien, si elle n'y est plus : la vue ne fait pas dire à la bande ce qu'elle a cessé de dire.
    alerte(projet: unknown, sujet: unknown, dit: unknown): Alerte | undefined {
      if (typeof projet !== "string") return undefined;
      return (rendues.get(projet) ?? bande(projet)).alertes.find((alerte) => alerte.sujet === sujet && alerte.dit === dit);
    },
  };
}
