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
const AUCUN = "aucun : rien ne change sur la box";
const LIRE = "aucun : la lecture ne change rien sur la box";
const RELIRE_FAITS = `attendre sa lecture : \`${FAITS}\` est relu toutes les 30 s`;
// Le geste d'une ligne qui demande de lire, de juger ou d'agir sur la box : une demande au second.
const DEMANDE = { demande: true } as const;
// Renoncer à une mise en service demandée : rien n'est interrompu.
const RENONCER = { geste: "renoncer à la demande", appel: { geste: ANNULER }, prix: "aucun : rien n'a été lancé, aucun cook n'est interrompu, et la cuisine reprend ses tickets" };

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
export const MANAGER_PAS_DIT = "première lecture de `manager` en cours : la file ne dit pas l'état du manager (#438). Ce n'est pas « allumé »";
// docs/runtime.md, « Le manager » : ce qu'allumer engage (allumage.ts, `AVERTISSEMENT`).
const PRIX_ALLUMER = "il juge tout le backlog ouvert, et ce qu'il juge exécutable part aussitôt en cuisine — ce que ça engage se compte au moment du geste";

function duManager(manager: Interrupteur | Sans): Alerte[] {
  if ("sans" in manager) return [nonVerifie("manager", "état du manager non vérifié", { pourquoi: manager.sans, geste: "attendre sa lecture : `manager` est relu toutes les 30 s — ou l'ouvrir dans l'onglet Manager", prix: LIRE, appel: { onglet: "manager" } })];
  if (manager.allume) return [];
  const { mot, depuis, par, dit } = manager;
  return [
    {
      sujet: "manager",
      verifie: true,
      ton: "rouge",
      dit: "manager éteint : aucune issue n'est jugée, rien de neuf n'entre sur le rail",
      // La ligne `manager` telle que le runtime l'écrit.
      releve: `${mot}${depuis === undefined ? "" : ` depuis le ${depuis} (par ${par})`} — ${dit}`,
      geste: "allumer le manager",
      appel: { geste: "manager-allumer" },
      prix: PRIX_ALLUMER,
    },
  ];
}

// --- La version en service, et sa mise en service ----------------------------------

// Ce qu'un redémarrage interromprait, d'après les cooks en vol à la lecture.
const RIEN_EN_VOL = "aucun cook en vol à cette lecture, rien n'est interrompu";
function interrompus({ enVol, tokens }: MiseEnService): string {
  if (enVol.length === 0) return RIEN_EN_VOL;
  return `${enVol.length} cook${s(enVol.length)} en vol interrompu${s(enVol.length)}, ${enVol.length > 1 ? "leurs tickets repartent" : "son ticket repart"} de zéro (${nombre(tokens)} tokens déjà dépensés)`;
}

// Ce que coûte le redémarrage du runtime.
const prixDuRedemarrage = ({ miseEnService }: Faits): string =>
  `un redémarrage du runtime : ${miseEnService === undefined ? "ce qui est en vol est interrompu — la box ne dit pas ce qui l'est" : interrompus(miseEnService)}`;

function deLaVersion(faits: Faits | Sans): Alerte[] {
  const sansVersion = (dit: Omit<NonDit, "prix"> & { prix?: string }) => [nonVerifie("version", "version en service non vérifiée", { prix: AUCUN, ...dit })];
  if ("sans" in faits) return sansVersion({ pourquoi: faits.sans, geste: RELIRE_FAITS, prix: LIRE });
  const depuis = (instant: string) => duree(Date.parse(faits.lu) - Date.parse(instant));
  const { version, miseEnService } = faits;
  // Une mise en service demandée ou lancée retient la cuisine : c'est elle qui se dit.
  if (miseEnService !== undefined && miseEnService.etat !== "aucune") {
    const { etat, coupe, enVol } = miseEnService;
    const quand = miseEnService.depuis === null ? "" : ` depuis ${depuis(miseEnService.depuis)}`;
    if (etat === "lancée")
      return [{ sujet: "version", verifie: true, ton: "bleu", dit: `mise en service lancée${quand} : le runtime va redémarrer, plus aucun cook ne part`, geste: "attendre : le geste de box est parti, et ne se rappelle pas", prix: AUCUN }];
    if (etat !== "demandée") return sansVersion({ pourquoi: `la mise en service est « ${etat} » d'après \`${FAITS}\`, un mot que l'app ne connaît pas`, geste: "mettre l'app à jour" });
    if (coupe || enVol.length === 0)
      return [
        {
          sujet: "version",
          verifie: true,
          ton: "jaune",
          dit: `mise en service demandée${quand} : plus aucun cook ne part, le runtime redémarre au prochain réveil`,
          geste: "attendre : le geste de box part seul",
          prix: coupe ? interrompus(miseEnService) : RIEN_EN_VOL,
          aussi: RENONCER,
        },
      ];
    return [
      {
        sujet: "version",
        verifie: true,
        ton: "jaune",
        dit: `mise en service demandée${quand} : elle attend le rail calme — plus aucun cook ne part, ${enVol.length} en vol ${enVol.length > 1 ? "finissent" : "finit"} d'abord`,
        geste: "couper sans attendre",
        appel: { geste: COUPER },
        prix: interrompus(miseEnService),
        aussi: RENONCER,
      },
    ];
  }
  if (version === undefined)
    return sansVersion({ pourquoi: "le runtime de cette box ne donne pas sa version dans `faits` (#476). Ce n'est pas « à jour »", geste: "mettre à jour le runtime de la box : il la dira", prix: prixDuRedemarrage(faits), appel: DEMANDE });
  if (version === null)
    return sansVersion({
      pourquoi: "le runtime en marche n'a rien comparé à son origine : il vient de démarrer, ou ne tourne pas sur une version posée par la bascule. Ce n'est pas « à jour »",
      geste: "attendre sa première comparaison — si elle ne vient pas, le servir par la bascule",
    });
  if (version.etat === "à jour") return [];
  if (version.etat === "non comparée")
    return sansVersion({
      pourquoi: "le runtime n'a pas pu comparer sa version à son origine. Ce n'est pas « à jour »",
      ...(version.raison === null ? {} : { releve: version.raison }),
      geste: "lever ce motif : le runtime reprend la comparaison seul toutes les 10 min",
      appel: DEMANDE,
    });
  if (version.etat !== "en attente") return sansVersion({ pourquoi: `la version est « ${version.etat} » d'après \`${FAITS}\`, un mot que l'app ne connaît pas`, geste: "mettre l'app à jour" });
  const livraisons = version.livraisons === null ? "" : ` — ${version.livraisons} livraison${s(version.livraisons)} pas en service`;
  return [
    {
      sujet: "version",
      verifie: true,
      ton: "jaune",
      dit: `une version attend depuis ${depuis(version.depuis)}${livraisons}`,
      pourquoi: `${version.branche ?? "son origine"} (${court(version.enAttente ?? "")}) attend, ${court(version.enService)} est en service`,
      geste: "mettre en service",
      // Sans ce qui est en vol, le geste ne s'offre pas : sa confirmation n'aurait pas de prix.
      ...(miseEnService === undefined ? {} : { appel: { geste: DEMANDER } }),
      prix:
        miseEnService === undefined
          ? "pas chiffré : la box ne dit pas ce qui est en vol, et le geste ne s'offre pas"
          : miseEnService.enVol.length === 0
            ? RIEN_EN_VOL
            : `attendre le rail calme : aucun cook interrompu, mais plus aucun ne part d'ici là — ou couper : ${interrompus(miseEnService)}`,
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

const REPRENDRE = "les tickets en attente repartent aussitôt, sur ton quota";
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
          dit: "disjoncteur ouvert : les derniers lancements ont échoué d'affilée, plus aucun cook ne part",
          releve: valeur.slice(valeur.indexOf(DISJONCTEUR)),
          geste: "reprendre la cuisine, une fois lu pourquoi ils échouent",
          appel: { geste: "reprendre" },
          prix: `le disjoncteur se referme : ${REPRENDRE}`,
        },
      ];
    if (titre === "stations") {
      const { releve, geste } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "aucune station déclarée : aucun cook ne part, la cuisine est gelée", releve, geste: geste ?? "déclarer une station, puis redémarrer le runtime", appel: DEMANDE, prix: prixDuRedemarrage(faits) }];
    }
    if (titre === "connexion") {
      const { releve, geste } = coupee(valeur);
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "connexion Max tombée : plus aucun ticket n'est pris", releve, geste: geste ?? "se reconnecter, puis reprendre la cuisine", appel: DEMANDE, prix: REPRENDRE }];
    }
    if (titre === "base" && valeur.startsWith("ROUGE"))
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "base rouge : la station ne prend plus de ticket, la pass ne juge ni ne merge",
          releve: [valeur, ...suite].join("\n"),
          geste: "lever ce qui la rend rouge, puis rejouer ses gates — sa dernière ligne dit le geste",
          appel: DEMANDE,
          prix: "aucun cook n'est interrompu : ses gates se rejouent",
        },
      ];
    return [];
  });
}

// Le statut lu d'un projet, ou pourquoi il ne l'est pas.
const PAS_DE_CUISINE = "la sortie de `status` n'a pas de ligne `cuisine` : ce n'est pas la forme que l'app sait lire";
function statusLu(status: string | Sans): string | Sans {
  if (typeof status !== "string") return status;
  return tetesDe(status).some(({ titre }) => titre === "cuisine") ? status : { sans: PAS_DE_CUISINE };
}

function deLaCuisine(projet: string, faits: Faits | Sans, status: string | Sans): Alerte[] {
  if ("sans" in faits) return [nonVerifie("cuisine", "état de la cuisine non vérifié", { pourquoi: faits.sans, geste: RELIRE_FAITS, prix: LIRE })];
  switch (faits.etat) {
    case "ouverte":
      return [];
    case "éteinte":
      return [
        {
          sujet: "cuisine",
          verifie: true,
          ton: "rouge",
          dit: "runtime arrêté : rien ne tourne, aucun ticket n'est pris",
          pourquoi: tick(faits),
          geste: `le démarrer sur la box : \`systemctl start brigade@${projet}\``,
          appel: DEMANDE,
          prix: "aucun cook n'est interrompu : rien ne tourne — les tickets en attente repartent, sur ton quota",
        },
      ];
    case "arrêtée":
      return [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "cuisine arrêtée par ton « stop » : aucun cook ne part, jusqu'à « reprendre »", geste: "reprendre la cuisine", appel: { geste: "reprendre" }, prix: REPRENDRE }];
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
          dit: "cuisine retenue : elle tourne, mais plus aucun cook ne part",
          pourquoi: typeof lu === "string" ? "`status` ne dit aucune cause que l'app sait lire" : `sa cause n'est pas lue : ${lu.sans}`,
          geste: "lire sa cause : `status`, dans le panneau",
          appel: DEMANDE,
          prix: LIRE,
        },
      ];
    }
    default:
      return [nonVerifie("cuisine", "état de la cuisine non vérifié", { pourquoi: `la cuisine est « ${faits.etat} » d'après \`${FAITS}\`, un mot que l'app ne connaît pas`, geste: "mettre l'app à jour", prix: AUCUN })];
  }
}

// --- Le grant ---------------------------------------------------------------

// Une ligne `grant` de `status` (runtime/src/etat.ts, `decrireGrants`) : `<action> ACTIF…`,
// `<action> ACTIF, BIENTÔT ÉTEINT : …`, `<action> ÉTEINT SEUL il y a …`. Absente, aucun grant
// ne vaut ni ne s'est éteint seul — ou le chef l'a révoqué : rien à dire.
const GRANT = /^(\S+) (ACTIF|ÉTEINT SEUL)\b/;
const MERGE_SANS_TOI = "une pass verte sera mergée sans toi";

function duGrant(status: string | Sans): Alerte[] {
  const lu = statusLu(status);
  const lireGrants = { geste: "le lire : l'onglet Grants lit `grant` sur la box", prix: LIRE, appel: { onglet: "grants" } };
  if (typeof lu !== "string") return [nonVerifie("grant", "état du grant non vérifié", { pourquoi: lu.sans, ...lireGrants })];
  return tetesDe(lu)
    .filter(({ titre }) => titre === "grant")
    .flatMap(({ valeur }): Alerte[] => {
      const [, action, mot] = GRANT.exec(valeur) ?? [];
      if (action === undefined) return [nonVerifie("grant", "état du grant non vérifié", { pourquoi: "l'app ne sait pas lire cette ligne `grant` de `status`", releve: valeur, ...lireGrants })];
      if (mot === "ÉTEINT SEUL")
        return [
          {
            sujet: "grant",
            verifie: true,
            ton: "rouge",
            dit: `grant \`${action}\` éteint seul : la pass s'arrête à la PR ouverte, plus rien n'est mergé sans toi`,
            releve: valeur,
            geste: `réaccorder \`${action}\``,
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
          dit: `grant \`${action}\` bientôt éteint : ensuite, la pass s'arrêtera à la PR ouverte`,
          releve: valeur,
          geste: `le prolonger sans le révoquer : \`grant prolonger ${action}\` (docs/runtime.md, « Le prolonger »)`,
          appel: DEMANDE,
          prix: MERGE_SANS_TOI,
        },
      ];
    });
}

// La bande d'un projet, d'après ce qui en a été lu : le manager, la version, la cuisine, le grant.
export function alertes({ projet, faits, status, manager }: Lu): Alerte[] {
  return [...duManager(manager), ...deLaVersion(faits), ...deLaCuisine(projet, faits, status), ...duGrant(status)];
}

// Le signal d'une bande, pour la case de son projet : une alerte vérifiée l'emporte ; sinon un
// état non vérifié, nommé comme tel — jamais lu comme sain. Même logique que la bande : rien n'y est recalculé.
export function signalDe(bande: readonly Alerte[]): Signal | undefined {
  const vues = bande.filter(({ verifie }) => verifie);
  if (vues.length > 0) return { etat: "alerte", dit: vues.map(({ dit }) => dit).join(" ; ") };
  if (bande.length > 0) return { etat: "non-verifie", dit: bande.map(({ dit }) => dit).join(" ; ") };
  return undefined;
}

// --- Ce qui est tenu, projet par projet -----------------------------------------

const FAITS_PAS_ENCORE = "première lecture en cours";
const STATUS_PAS_LU = "`status` n'est lu que pour le projet affiché, ou pour tous dans « Tous les projets » — pas en ce moment pour celui-ci";
const STATUS_PAS_ENCORE = "première lecture de `status` en cours";

// Ce qu'une lecture ratée dit, dans les mots de la carte du projet (faits.ts, `titreDEchec`).
const rate = (commande: string, lecture: Echec) =>
  `\`${commande}\` n'a pas été lu : ${titreDEchec(lecture, `JOINT, MAIS \`${commande}\` N'A PAS RÉPONDU`).toLowerCase()}`;

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
        faits.set(lecture.projet, "informe" in lu ? { sans: `la box n'a pas rendu la forme de \`${FAITS}\` : ${lu.informe}` } : lu);
      }
      return bande(lecture.projet);
    },
    // Une lecture de `status`, son bloc `attend` mis à part : les lignes de tête restent.
    status(montree: Montree): Bande {
      const texte = "erreur" in montree ? undefined : montree.sorties.find(({ commande }) => commande === "status")?.texte;
      statuts.set(montree.projet, "erreur" in montree ? { sans: rate("status", montree) } : (texte ?? { sans: "la lecture n'a pas rendu `status`" }));
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
        "erreur" in lecture ? { sans: rate(MANAGER, lecture) } : lu === undefined ? { sans: "la lecture n'a pas rendu `manager`" } : "informe" in lu ? { sans: `la sortie de \`manager\` n'a pas la forme attendue : ${lu.informe}` } : lu.interrupteur,
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
