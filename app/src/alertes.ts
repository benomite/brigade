// La bande d'alertes d'un projet, en tête de son espace : elle répond à une seule
// question — est-ce que ça peut tourner ? — sur quatre états, ceux des quatre pannes
// silencieuses du 2026-10-13 (docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md) :
// le manager, la version en service, la cuisine, le grant.
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
// D'où vient chaque état : la version et la cuisine de `faits` (faits.ts), la cause d'une
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
import { ANNULER, COUPER, DEMANDER, type MiseEnService } from "./version.ts";
import { nombre } from "./format.ts";
import type { Controle } from "./service.ts";

// `station` et `box` : ce qu'un projet installé a perdu — une station, un geste de box. `urgence` :
// toute la cuisine attend le chef.
export type Sujet = "urgence" | "manager" | "version" | "cuisine" | "grant" | "station" | "box";
// Ce que le bouton d'une ligne appelle : un geste du socle (gestes.ts), et le grant qu'il
// nomme ; une demande au second, faite de ce que la ligne dit (demande.ts) ; un onglet de
// contenu (onglets.ts).
export type Appel = { geste: string; grant?: string } | { demande: true } | { onglet: string };
// Une ligne de la bande. `verifie` faux : la box ne dit pas cet état, et la ligne le dit.
// `dit` : ce qui ne va pas, dans les mots de l'app ; `pourquoi` : ce qu'elle en sait de plus,
// dans ses mots aussi. `releve` : ce que la box en a écrit, mot pour mot — absent quand elle
// n'en a rien écrit. `geste` : ce qui le lève ; `appel` : ce que son bouton appelle — absent,
// le geste ne se joue pas depuis l'app. `prix` : ce que le geste coûte. `aussi` : un second
// geste sur le même état, avec ce qu'il coûte.
export type Alerte = { sujet: Sujet; verifie: boolean; ton: string; dit: string; pourquoi?: string; releve?: string; geste: string; appel?: Appel; prix: string; aussi?: { geste: string; appel: Appel; prix: string } };
// La bande d'un projet : vide, les quatre états ont été lus, et vont bien.
// Ce que la bande d'un projet dit de lui sur sa case de la barre : toute la cuisine qui l'attend, une
// chose à faire, ou rien de vérifié. Une bande vide n'a pas de signal — c'est que les quatre états
// ont été lus, et vont bien.
export type Signal = { etat: "urgence" | "alerte" | "non-verifie"; dit: string };
export type Bande = { projet: string; alertes: Alerte[]; signal?: Signal };

// Un état que l'app n'a pas : pourquoi, dans ses mots.
export type Sans = { sans: string };
// Ce que la bande lit d'un projet. `status` : sa sortie, le bloc `attend` mis à part ou non ;
// `attend` : ce bloc, quand il a été mis à part (attend.ts, `mettreAPart`).
// `controle` : ce que la box a dit d'un projet installé, ses stations et ses manques (service.ts) —
// absent, rien n'en a été lu : un projet pas encore installé, ou pas encore contrôlé.
export type Lu = { projet: string; faits: Faits | Sans; status: string | Sans; attend?: string; manager: Interrupteur | Sans; controle?: Controle };

const s = (combien: number) => (combien > 1 ? "s" : "");
const court = (commit: string) => commit.slice(0, 12);
const AUCUN = "none: nothing changes on the box";
const LIRE = "none: reading changes nothing on the box";
const RELIRE_FAITS = `wait for it to be read: \`${FAITS}\` is re-read every 30 s`;
// Le geste d'une ligne qui demande de lire, de juger ou d'agir sur la box : une demande au second.
const DEMANDE = { demande: true } as const;
// Renoncer à une mise en service demandée : rien n'est interrompu.
const RENONCER = { geste: "withdraw the request", appel: { geste: ANNULER }, prix: "none: nothing was launched, no cook is interrupted, and the kitchen takes its tickets again" };

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
      geste: `do what ${urgence.decision} waits for, as the box writes it`,
      appel: DEMANDE,
      prix: "none: nothing is cooking — once you act, the held tickets start again, on your quota",
    },
  ];
}

// --- Le manager ---------------------------------------------------------------

// Tant que la file ne porte pas son état (#438), l'app le lit elle-même : avant sa première lecture, il n'est pas dit.
export const MANAGER_PAS_DIT = "first reading of `manager` in progress: the queue does not say the manager's state (#438). This is not “on”";
// docs/runtime.md, « Le manager » : ce qu'allumer engage (allumage.ts, `AVERTISSEMENT`).
const PRIX_ALLUMER = "it judges the whole open backlog, and what it judges executable is taken at once — what that commits is counted when you act";

function duManager(manager: Interrupteur | Sans): Alerte[] {
  if ("sans" in manager) return [nonVerifie("manager", "manager state not verified", { pourquoi: manager.sans, geste: "wait for it to be read: `manager` is re-read every 30 s — or open it in the Manager tab", prix: LIRE, appel: { onglet: "manager" } })];
  if (manager.allume) return [];
  const { mot, depuis, par, dit } = manager;
  return [
    {
      sujet: "manager",
      verifie: true,
      ton: "rouge",
      dit: "manager off: no issue is judged, nothing new enters the rail",
      // La ligne `manager` telle que le runtime l'écrit.
      releve: `${mot}${depuis === undefined ? "" : ` since ${depuis} (by ${par})`} — ${dit}`,
      geste: "turn the manager on",
      appel: { geste: "manager-allumer" },
      prix: PRIX_ALLUMER,
    },
  ];
}

// --- La version en service, et sa mise en service ----------------------------------

// Ce qu'un redémarrage interromprait, d'après les cooks en vol à la lecture.
const RIEN_EN_VOL = "no cook in flight at this reading, nothing is interrupted";
function interrompus({ enVol, tokens }: MiseEnService): string {
  if (enVol.length === 0) return RIEN_EN_VOL;
  return `${enVol.length} cook${s(enVol.length)} in flight interrupted, ${enVol.length > 1 ? "their tickets start" : "its ticket starts"} over from zero (${nombre(tokens)} tokens already spent)`;
}

// Ce que coûte le redémarrage du runtime.
const prixDuRedemarrage = ({ miseEnService }: Faits): string =>
  `a runtime restart: ${miseEnService === undefined ? "what is in flight is interrupted — the box does not say what is" : interrompus(miseEnService)}`;

function deLaVersion(faits: Faits | Sans): Alerte[] {
  const sansVersion = (dit: Omit<NonDit, "prix"> & { prix?: string }) => [nonVerifie("version", "version in service not verified", { prix: AUCUN, ...dit })];
  if ("sans" in faits) return sansVersion({ pourquoi: faits.sans, geste: RELIRE_FAITS, prix: LIRE });
  const depuis = (instant: string) => duree(Date.parse(faits.lu) - Date.parse(instant));
  const { version, miseEnService } = faits;
  // Une mise en service demandée ou lancée retient la cuisine : c'est elle qui se dit.
  if (miseEnService !== undefined && miseEnService.etat !== "aucune") {
    const { etat, coupe, enVol } = miseEnService;
    const quand = miseEnService.depuis === null ? "" : ` for ${depuis(miseEnService.depuis)}`;
    if (etat === "lancée")
      return [{ sujet: "version", verifie: true, ton: "bleu", dit: `deploy launched${quand}: the runtime is about to restart, no cook goes any more`, geste: "wait: the box action has gone, and cannot be recalled", prix: AUCUN }];
    if (etat !== "demandée") return sansVersion({ pourquoi: `the deploy is “${etat}” according to \`${FAITS}\`, a word the app does not know`, geste: "update the app" });
    if (coupe || enVol.length === 0)
      return [
        {
          sujet: "version",
          verifie: true,
          ton: "jaune",
          dit: `deploy requested${quand}: no cook goes any more, the runtime restarts at its next wake-up`,
          geste: "wait: the box action goes by itself",
          prix: coupe ? interrompus(miseEnService) : RIEN_EN_VOL,
          aussi: RENONCER,
        },
      ];
    return [
      {
        sujet: "version",
        verifie: true,
        ton: "jaune",
        dit: `deploy requested${quand}: it is waiting for a quiet rail — no cook goes any more, ${enVol.length} in flight ${enVol.length > 1 ? "finish" : "finishes"} first`,
        geste: "cut without waiting",
        appel: { geste: COUPER },
        prix: interrompus(miseEnService),
        aussi: RENONCER,
      },
    ];
  }
  if (version === undefined)
    return sansVersion({ pourquoi: "this box's runtime does not give its version in `facts` (#476). This is not “up to date”", geste: "update the box's runtime: it will say it", prix: prixDuRedemarrage(faits), appel: DEMANDE });
  if (version === null)
    return sansVersion({
      pourquoi: "the running runtime has compared nothing with its origin: it has just started, or is not running a version put in place by the switch. This is not “up to date”",
      geste: "wait for its first comparison — if it does not come, serve it through the switch",
    });
  if (version.etat === "à jour") return [];
  if (version.etat === "non comparée")
    return sansVersion({
      pourquoi: "the runtime could not compare its version with its origin. This is not “up to date”",
      ...(version.raison === null ? {} : { releve: version.raison }),
      geste: "clear this reason: the runtime resumes the comparison by itself every 10 min",
      appel: DEMANDE,
    });
  if (version.etat !== "en attente") return sansVersion({ pourquoi: `the version is “${version.etat}” according to \`${FAITS}\`, a word the app does not know`, geste: "update the app" });
  const livraisons = version.livraisons === null ? "" : ` — ${version.livraisons} deliver${version.livraisons > 1 ? "ies" : "y"} not in service`;
  return [
    {
      sujet: "version",
      verifie: true,
      ton: "jaune",
      dit: `a version has been waiting for ${depuis(version.depuis)}${livraisons}`,
      pourquoi: `${version.branche ?? "its origin"} (${court(version.enAttente ?? "")}) is waiting, ${court(version.enService)} is in service`,
      geste: "deploy",
      // Sans ce qui est en vol, le geste ne s'offre pas : sa confirmation n'aurait pas de prix.
      ...(miseEnService === undefined ? {} : { appel: { geste: DEMANDER } }),
      prix:
        miseEnService === undefined
          ? "not costed: the box does not say what is in flight, and the action is not offered"
          : miseEnService.enVol.length === 0
            ? RIEN_EN_VOL
            : `wait for a quiet rail: no cook interrupted, but none goes until then — or cut: ${interrompus(miseEnService)}`,
    },
  ];
}

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

// Ce que la valeur d'une ligne dit de la panne, et le geste qu'elle nomme après ` : ` —
// la forme des lignes `stations` et `connexion`. Sans geste nommé, la ligne entière.
function coupee(valeur: string): { releve: string; geste?: string } {
  const coupe = valeur.lastIndexOf(" : ");
  return coupe === -1 ? { releve: valeur } : { releve: valeur.slice(0, coupe), geste: valeur.slice(coupe + 3) };
}

const REPRENDRE = "queued tickets start again at once, on your quota";
const DISJONCTEUR = "disjoncteur OUVERT";

// Ce qui retient la cuisine, d'après les lignes de tête de `status` : une ligne par cause
// que l'app sait lire. La mise en service n'en est pas : la ligne de la version la dit.
function causesDeRetenue(status: string, faits: Faits): Alerte[] {
  return tetesDe(status).flatMap(({ titre, valeur, suite }): Alerte[] => {
    if (titre === "cuisine" && valeur.includes(DISJONCTEUR))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "breaker open: the latest launches failed in a row, no cook goes any more",
          releve: valeur.slice(valeur.indexOf(DISJONCTEUR)),
          geste: "resume the kitchen, once you have read why they fail",
          appel: { geste: "reprendre" },
          prix: `the breaker closes: ${REPRENDRE}`,
        },
      ];
    if (titre === "stations") {
      const { releve, geste } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "no station declared: no cook goes, the kitchen is frozen", releve, geste: geste ?? "declare a station, then restart the runtime", appel: DEMANDE, prix: prixDuRedemarrage(faits) }];
    }
    if (titre === "connexion") {
      const { releve, geste } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "Max connection down: no ticket is taken any more", releve, geste: geste ?? "reconnect, then resume the kitchen", appel: DEMANDE, prix: REPRENDRE }];
    }
    if (titre === "base" && valeur.startsWith("ROUGE"))
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
const PAS_DE_CUISINE = "the output of `status` has no `cuisine` line: this is not a shape the app can read";
function statusLu(status: string | Sans): string | Sans {
  if (typeof status !== "string") return status;
  return tetesDe(status).some(({ titre }) => titre === "cuisine") ? status : { sans: PAS_DE_CUISINE };
}

// --- Le setup du projet -------------------------------------------------------

// La ligne de tête `setup` de `status` (runtime/src/etat.ts, `decrireSetup`) : `BLOQUÉ depuis …
// sur <commit> — …`. Absente, le setup du projet n'est pas bloqué : rien à dire.
const SETUP_BLOQUE = "BLOQUÉ";
const bloqueLeSetup = (status: string) => tetesDe(status).some(({ titre, valeur }) => titre === "setup" && valeur.startsWith(SETUP_BLOQUE));

// L'entrée `setup` du bloc `attend` (runtime/src/attend.ts, `decrireAttentes`) : deux espaces,
// `setup`, deux espaces, depuis quand, deux espaces, puis la cause et le geste — c'est ce qui en
// est repris, mot pour mot, avec les lignes qui la précisent, sans leur retrait. Rien quand le
// texte n'en a pas.
const TETE_DE_SETUP = /^ {2}setup {2}(?:depuis \S.*? {2})?(\S.*)$/;
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
const LEVER_LE_SETUP = "clear its cause as the box says — declare the refused host in `.claude/brigade/reseau` of the project, or fix the project's setup — then merge on the integration branch";
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
        ? "project setup impossible: no worktree is set up on the box, for any ticket — only a remote station still cooks"
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
          geste: `start it on the box: \`systemctl start brigade@${projet}\``,
          appel: DEMANDE,
          prix: "no cook is interrupted: nothing is running — queued tickets start again, on your quota",
        },
      ];
    case "arrêtée":
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: REPRENDRE }];
    case "retenue": {
      const lu = statusLu(status);
      const causes = typeof lu === "string" ? causesDeRetenue(lu, faits) : [];
      // Retenue par la seule mise en service, ou par le seul setup bloqué : leur ligne le dit déjà.
      // Sans `status` lu, rien ne dit qu'une cause est seule à la retenir.
      const parLaMiseEnService = faits.miseEnService !== undefined && faits.miseEnService.etat !== "aucune";
      if (typeof lu === "string" && (causes.length > 0 || parLaMiseEnService || bloqueLeSetup(lu))) return causes;
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

// Une ligne `grant` de `status` (runtime/src/etat.ts, `decrireGrants`) : `<action> ACTIF…`,
// `<action> ACTIF, BIENTÔT ÉTEINT : …`, `<action> ÉTEINT SEUL il y a …`. Absente, aucun grant
// ne vaut ni ne s'est éteint seul — ou le chef l'a révoqué : rien à dire.
const GRANT = /^(\S+) (ACTIF|ÉTEINT SEUL)\b/;
const MERGE_SANS_TOI = "a green pass will be merged without you";

function duGrant(status: string | Sans): Alerte[] {
  const lu = statusLu(status);
  const lireGrants = { geste: "read it: the Grants tab reads `grant` on the box", prix: LIRE, appel: { onglet: "grants" } };
  if (typeof lu !== "string") return [nonVerifie("grant", "grant state not verified", { pourquoi: lu.sans, ...lireGrants })];
  return tetesDe(lu)
    .filter(({ titre }) => titre === "grant")
    .flatMap(({ valeur }): Alerte[] => {
      const [, action, mot] = GRANT.exec(valeur) ?? [];
      if (action === undefined) return [nonVerifie("grant", "grant state not verified", { pourquoi: "the app cannot read this `grant` line of `status`", releve: valeur, ...lireGrants })];
      if (mot === "ÉTEINT SEUL")
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
      if (!valeur.includes("BIENTÔT ÉTEINT")) return [];
      return [
        {
          sujet: "grant",
          verifie: true,
          ton: "jaune",
          dit: `grant \`${action}\` expiring soon: then, the pass will stop at the open PR`,
          releve: valeur,
          geste: `extend it without revoking it: \`grant extend ${action}\` (docs/runtime.md, “Le prolonger”)`,
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
//   un geste de box  le geste de mise en service, ou celui d'installation, que la vérification dit
//                  manquer — la flèche les rattache à leur section de docs/installer.md
// Le reste de ce que `installation` dit manquer n'entre pas ici : c'est l'installation qui le
// règle, ou une autre ligne de la bande qui le dit déjà. Rien de lu, rien de dit : un contrôle
// qui n'a pas pu se faire n'invente aucune perte — et la box pas jointe, les autres lignes le disent.

// Les gestes de box, par la section de docs/installer.md que la flèche de leur manque nomme
// (runtime/src/installation.ts, `jugerGesteDeMiseEnService`, `jugerReglageDuGeste`), et ce que
// leur absence empêche, en mots simples.
const GESTES_DE_BOX = [
  { section: "« Le geste de mise en service »", nom: "deploy", empeche: "putting a waiting version into service from the app would fail" },
  { section: "« Le geste d'installation »", nom: "install a project", empeche: "adding a project to this box from the app would be refused" },
] as const;
const SUR_LA_BOX = "the box itself: whoever has `sudo` there runs it — the app sends nothing";
const RECONTROLE = "the alert leaves once the box says it is back: the app checks again every 5 min, and when this space opens";

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
        dit: `station “${nom}” missing: the box no longer provides it — no cook goes there`,
        ...(releve === null ? {} : { releve }),
        geste: introuvable?.geste ?? `put \`${moteur}\` back on the box, where the service finds it — \`installation\` on the box gives the exact command`,
        appel: DEMANDE,
        prix: `none for the kitchen: it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
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
      geste: sansStation.geste ?? "declare a station again: `installation stations` on the box lists those it provides",
      appel: DEMANDE,
      prix: `none: the declaration is read at the runtime's next wake-up, without a restart; ${RECONTROLE}`,
    });
  }
  for (const { section, nom, empeche } of GESTES_DE_BOX) {
    const manque = manques.find(({ geste }) => geste?.includes(section));
    if (manque === undefined) continue;
    pertes.push({
      sujet: "box",
      verifie: true,
      ton: "jaune",
      dit: `box gesture “${nom}” missing: ${empeche}`,
      releve: manque.texte,
      geste: manque.geste ?? `set it up again on the box — docs/installer.md, ${section}`,
      appel: DEMANDE,
      prix: `none: no cook is interrupted — it is done on ${SUR_LA_BOX}; ${RECONTROLE}`,
    });
  }
  return pertes;
}

// La bande d'un projet, d'après ce qui en a été lu : l'urgence, le manager, la version, la cuisine — et
// son setup —, le grant, et ce que le projet installé a perdu.
export function alertes({ projet, faits, status, attend, manager, controle }: Lu): Alerte[] {
  return parGravite([...deLUrgence(faits), ...duManager(manager), ...deLaVersion(faits), ...deLaCuisine(projet, faits, status), ...duSetup(faits, status, attend), ...duGrant(status), ...desPertes(controle, statusLu(status))]);
}

// La plus grave d'abord : l'urgence au-dessus de tout, puis une alerte lue avant un état non vérifié,
// le rouge avant le reste. Le tri est stable : à gravité égale, l'ordre de la bande (manager, version,
// cuisine, grant) tient.
const GRAVITE = (alerte: Alerte) => (alerte.sujet === "urgence" ? -1 : (alerte.verifie ? 0 : 10) + (alerte.ton === "rouge" ? 0 : alerte.ton === "jaune" ? 1 : 2));
const parGravite = (bande: Alerte[]): Alerte[] => bande.map((alerte, rang) => ({ alerte, rang })).sort((a, b) => GRAVITE(a.alerte) - GRAVITE(b.alerte) || a.rang - b.rang).map(({ alerte }) => alerte);

// Le signal d'une bande, pour la case de son projet : l'urgence l'emporte sur tout, et se dit comme
// telle — pas comme une alerte ordinaire ; puis une alerte vérifiée ; sinon un état non vérifié,
// nommé comme tel — jamais lu comme sain. Même logique que la bande : rien n'y est recalculé.
export function signalDe(bande: readonly Alerte[]): Signal | undefined {
  const vues = bande.filter(({ verifie }) => verifie);
  const urgentes = vues.filter(({ sujet }) => sujet === "urgence");
  if (urgentes.length > 0) return { etat: "urgence", dit: [...urgentes, ...vues.filter(({ sujet }) => sujet !== "urgence")].map(({ dit }) => dit).join(" ; ") };
  if (vues.length > 0) return { etat: "alerte", dit: vues.map(({ dit }) => dit).join(" ; ") };
  if (bande.length > 0) return { etat: "non-verifie", dit: bande.map(({ dit }) => dit).join(" ; ") };
  return undefined;
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
export function tenirBandes() {
  const faits = new Map<string, Faits | Sans>();
  const statuts = new Map<string, string | Sans>();
  // Le bloc `attend` du dernier `status` lu, mis à part : il ne vit qu'avec lui.
  const attends = new Map<string, string>();
  const managers = new Map<string, Interrupteur | Sans>();
  // Le dernier contrôle d'un projet installé (service.ts) : il vaut jusqu'au suivant.
  const controles = new Map<string, Controle>();
  const bande = (projet: string): Bande => {
    const attend = attends.get(projet);
    const controle = controles.get(projet);
    const dites = alertes({
      projet,
      faits: faits.get(projet) ?? { sans: FAITS_PAS_ENCORE },
      status: statuts.get(projet) ?? { sans: STATUS_PAS_LU },
      ...(attend === undefined ? {} : { attend }),
      manager: managers.get(projet) ?? { sans: MANAGER_PAS_DIT },
      ...(controle === undefined ? {} : { controle }),
    });
    return { projet, alertes: dites, signal: signalDe(dites) };
  };
  return {
    // La barre est posée : `faits` va être lu pour chacun de ces projets. Ce qui en était
    // lu est oublié ; un projet qui n'en est plus n'a plus rien de tenu.
    ouvrir(projets: readonly string[]): Bande[] {
      faits.clear();
      for (const tenus of [statuts, attends, managers, controles]) for (const projet of tenus.keys()) if (!projets.includes(projet)) tenus.delete(projet);
      return projets.map(bande);
    },
    // Une lecture de `faits`.
    faits(lecture: Lecture): Bande {
      if ("erreur" in lecture) faits.set(lecture.projet, { sans: rate(FAITS, lecture) });
      else {
        const lu = comprendre(lecture.sorties.find(({ commande }) => commande === FAITS)?.texte ?? "");
        faits.set(lecture.projet, "informe" in lu ? { sans: `the box did not return the shape of \`${FAITS}\`: ${lu.informe}` } : lu);
      }
      return bande(lecture.projet);
    },
    // Une lecture de `status`, son bloc `attend` mis à part : les lignes de tête restent.
    status(montree: Montree): Bande {
      const texte = "erreur" in montree ? undefined : montree.sorties.find(({ commande }) => commande === "status")?.texte;
      statuts.set(montree.projet, "erreur" in montree ? { sans: rate("status", montree) } : (texte ?? { sans: "the reading did not return `status`" }));
      if ("erreur" in montree || montree.attend === undefined) attends.delete(montree.projet);
      else attends.set(montree.projet, montree.attend);
      return bande(montree.projet);
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
      return [...touches].map(bande);
    },
    // Une lecture de `manager` — celle de la veille du manager, ou celle de l'onglet : l'état du manager, ou pourquoi il n'est pas lu.
    manager(lecture: Lecture): Bande {
      const sortie = "erreur" in lecture ? undefined : lecture.sorties.find(({ commande }) => commande === MANAGER)?.texte;
      const lu = sortie === undefined ? undefined : managerDe(sortie);
      managers.set(
        lecture.projet,
        "erreur" in lecture ? { sans: rate(MANAGER, lecture) } : lu === undefined ? { sans: "the reading did not return `manager`" } : "informe" in lu ? { sans: `the output of \`manager\` does not have the expected shape: ${lu.informe}` } : lu.interrupteur,
      );
      return bande(lecture.projet);
    },
    // Ce que l'installation d'un projet dit de lui (service.ts, `Guide`) : installé et contrôlé, ce
    // qu'il a perdu ; sinon rien — un projet qui s'installe a son écran, pas d'alerte de perte.
    controle(projet: string, controle: Controle | undefined): Bande {
      if (controle === undefined) controles.delete(projet);
      else controles.set(projet, controle);
      return bande(projet);
    },
    // La ligne que la vue nomme par son sujet et ce qu'elle dit, telle que la bande la dit
    // maintenant — rien, si elle n'y est plus : la vue ne fait pas dire à la bande ce qu'elle a cessé de dire.
    alerte(projet: unknown, sujet: unknown, dit: unknown): Alerte | undefined {
      if (typeof projet !== "string") return undefined;
      return bande(projet).alertes.find((alerte) => alerte.sujet === sujet && alerte.dit === dit);
    },
  };
}
