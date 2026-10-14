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
// sortie de `manager` (manager.ts). Ce que la box dit se pose mot pour mot ; l'app n'y
// ajoute que ses propres mots, à part. Aucun fait nouveau n'est demandé au runtime.
// Le geste d'une ligne est collé à l'état qu'il change, sous l'une de ses trois formes : un
// geste du socle (gestes.ts), direct ou confirmé — la confirmation dit son prix
// (confirmation.ts) ; ou, quand le lever demande de lire, juger ou agir sur la box à côté du
// runtime — déclarer une station, `claude /login`, `systemctl` —, une demande en prose,
// écrite dans le second sans Entrée (demande.ts) : l'app ne la fait jamais partir. Une
// ligne « non vérifié » mène à l'onglet qui lit l'état que la file ne dit pas. Ce module ne lance rien.
import type { Montree } from "./attend.ts";
import type { Echec, Lecture } from "./box.ts";
import { COMMANDE as FAITS, comprendre, duree, tick, titreDEchec, type Faits } from "./faits.ts";
import { GRANTS } from "./gestes.ts";
import { COMMANDE as MANAGER, managerDe, type Interrupteur } from "./manager.ts";
import { ANNULER, COUPER, DEMANDER, type MiseEnService } from "./version.ts";

export type Sujet = "manager" | "version" | "cuisine" | "grant";
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
// Ce que la bande d'un projet dit de lui sur sa case de la barre : une chose à faire, ou rien de
// vérifié. Une bande vide n'a pas de signal — c'est que les quatre états ont été lus, et vont bien.
export type Signal = { etat: "alerte" | "non-verifie"; dit: string };
export type Bande = { projet: string; alertes: Alerte[]; signal?: Signal };

// Un état que l'app n'a pas : pourquoi, dans ses mots.
export type Sans = { sans: string };
// Ce que la bande lit d'un projet. `status` : sa sortie, le bloc `attend` mis à part ou non.
export type Lu = { projet: string; faits: Faits | Sans; status: string | Sans; manager: Interrupteur | Sans };

const s = (combien: number) => (combien > 1 ? "s" : "");
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
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
    return sansVersion({ pourquoi: "this box's runtime does not give its version in `faits` (#476). This is not “up to date”", geste: "update the box's runtime: it will say it", prix: prixDuRedemarrage(faits), appel: DEMANDE });
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
      // Retenue par la seule mise en service : la ligne de la version le dit déjà. Sans `status`
      // lu, rien ne dit qu'elle est seule à la retenir.
      const parLaMiseEnService = faits.miseEnService !== undefined && faits.miseEnService.etat !== "aucune";
      if (typeof lu === "string" && (causes.length > 0 || parLaMiseEnService)) return causes;
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
          geste: `extend it without revoking it: \`grant prolonger ${action}\` (docs/runtime.md, “Le prolonger”)`,
          appel: DEMANDE,
          prix: MERGE_SANS_TOI,
        },
      ];
    });
}

// La bande d'un projet, d'après ce qui en a été lu : le manager, la version, la cuisine, le grant.
export function alertes({ projet, faits, status, manager }: Lu): Alerte[] {
  return parGravite([...duManager(manager), ...deLaVersion(faits), ...deLaCuisine(projet, faits, status), ...duGrant(status)]);
}

// La plus grave d'abord : une alerte lue avant un état non vérifié, le rouge avant le reste. Le tri
// est stable : à gravité égale, l'ordre de la bande (manager, version, cuisine, grant) tient.
const GRAVITE = (alerte: Alerte) => (alerte.verifie ? 0 : 10) + (alerte.ton === "rouge" ? 0 : alerte.ton === "jaune" ? 1 : 2);
const parGravite = (bande: Alerte[]): Alerte[] => bande.map((alerte, rang) => ({ alerte, rang })).sort((a, b) => GRAVITE(a.alerte) - GRAVITE(b.alerte) || a.rang - b.rang).map(({ alerte }) => alerte);

// Le signal d'une bande, pour la case de son projet : une alerte vérifiée l'emporte ; sinon un
// état non vérifié, nommé comme tel — jamais lu comme sain. Même logique que la bande : rien n'y est recalculé.
export function signalDe(bande: readonly Alerte[]): Signal | undefined {
  const vues = bande.filter(({ verifie }) => verifie);
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
  const managers = new Map<string, Interrupteur | Sans>();
  const bande = (projet: string): Bande => {
    const dites = alertes({ projet, faits: faits.get(projet) ?? { sans: FAITS_PAS_ENCORE }, status: statuts.get(projet) ?? { sans: STATUS_PAS_LU }, manager: managers.get(projet) ?? { sans: MANAGER_PAS_DIT } });
    return { projet, alertes: dites, signal: signalDe(dites) };
  };
  return {
    // La barre est posée : `faits` va être lu pour chacun de ces projets. Ce qui en était
    // lu est oublié ; un projet qui n'en est plus n'a plus rien de tenu.
    ouvrir(projets: readonly string[]): Bande[] {
      faits.clear();
      for (const tenus of [statuts, managers]) for (const projet of tenus.keys()) if (!projets.includes(projet)) tenus.delete(projet);
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
      return bande(montree.projet);
    },
    // La veille de `status` lit désormais ces projets : pour ceux-là, la première lecture est en
    // route ; les autres ne sont plus lus, et ce qui en était lu est lâché.
    veiller(projets: readonly string[]): Bande[] {
      const touches = new Set([...statuts.keys(), ...projets]);
      for (const projet of touches) {
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
    // La ligne que la vue nomme par son sujet et ce qu'elle dit, telle que la bande la dit
    // maintenant — rien, si elle n'y est plus : la vue ne fait pas dire à la bande ce qu'elle a cessé de dire.
    alerte(projet: unknown, sujet: unknown, dit: unknown): Alerte | undefined {
      if (typeof projet !== "string") return undefined;
      return bande(projet).alertes.find((alerte) => alerte.sujet === sujet && alerte.dit === dit);
    },
  };
}
