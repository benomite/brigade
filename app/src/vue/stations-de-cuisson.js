// @ts-check
// Les stations du projet sur l'onglet Cooks (ticket 1185) : une ligne par station — son nom, son mot (cooking,
// stopped, saturated, refused) et ce qu'il veut dire, ses cooks en cours, et un seul bouton, qui arrête ou
// relance la cuisine du projet sur elle, la box comme le Mac ou un autre ordinateur. Sur un écran large, chaque
// station est un bloc, et ses cooks en cours y sont les cartes de leurs tickets — celles du kanban de Rail, qui
// s'ouvrent de même (ticket 1270) ; sur un écran étroit, en lecture seule, une ligne par cook. Le clic part par le process
// principal (cuisson.ts) ; tant qu'il n'a pas répondu, le bouton dit qu'il s'y met. Ce qu'il a fait se dit en une
// ligne sous la station, ce que le runtime a répondu au survol — jusqu'à ce que la lecture suivante la montre
// dans son état neuf.
// Et, sur l'onglet Rail, la ligne qui dit ce qui, du côté des cooks, demande un geste au chef — une station
// saturée, un projet refusé, l'accès au dépôt bloqué — avec de quoi ouvrir Cooks, où ce geste se fait. Une seule
// ligne, quel que soit le nombre de causes ; aucune quand rien ne le demande.
// Le bloc liste toutes les stations qui servent le projet, chacune une fois (ticket 1786) : celles que `facts` donne, celles
// que le journal déclare sans qu'elles s'y soient encore annoncées, et celles que l'app lui a ajoutées et qui n'en sont
// pas encore. Toutes se disent de la même façon, dans l'ordre où elles sont données ; chaque station dit si elle est atteinte, ce qu'elle fournit (le bloc « what each station provides » y est fondu, son
// « edit » compris), ses cooks à la fois, et, quand elle ne peut pas cuire, pourquoi en une ligne.
// Telle que `facts` la voit (ticket 1830), quand il le dit : atteinte ou absente — une distante qui ne s'est
// pas manifestée est absente, et ne se lit jamais « reached · cooking » —, et ce qu'elle fournit.
// Et ce que chaque station fait tourner à côté de ses cooks (ticket 1971) — la pass qui juge une livraison, le manager
// qui juge ou découpe une issue, le triage, le closer qui nettoie le projet : une carte chacun, avant celles des cooks, qui
// dit son rôle, sa station, son ticket, ce qu'il fait et depuis quand ; une ligne chacun sur l'écran étroit. Une station
// qui ne fait rien tourner le dit en une ligne ; une qui ne fait que juger ne se dit pas sans cook.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction } from "./briques.js";
import { niveauDe } from "./niveaux.js";
import { ceQuElleFournit, motDuLieu } from "./stations-declarees.js";
import { bouton } from "./composants/bouton/bouton.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../cuisson.ts").LigneDeStation} Ligne */
/** @typedef {import("../faits.ts").Cook} Cook */
/** @typedef {import("../cuisson.ts").AgentDeStation} Agent */
/** @typedef {import("../projets/demande.ts").AccesBloque} Acces */
/** @typedef {import("../projets/demande.ts").Refus} Refus */
/** @typedef {import("../projets/demande.ts").EchecDuClone} Clone */
/** @typedef {import("../accueil.ts").PlafondsDeStation} Plafonds */
/** @typedef {import("../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {import("./stations-declarees.js").Editer} Editer */
/**
 * Une station du projet telle que l'app la connaît par GitHub (vue.js, `cuisineDe`) : son gist, son nom, si c'est sa
 * ce que sa pastille en dit (`dit`, `ton`, `survol`), et, ajoutée mais bloquée ou pas atteinte, pourquoi en
 * quelques mots et ce que le chef y fait (`pourquoi`, `geste`), et les autorisations GitHub qu'elle attend. `station` : le
 * nom sous lequel le journal la déclare, quand il le dit.
 * @typedef {{ id: string, nom: string, station?: string, dit: string, ton?: string, survol: string, pourquoi: string, geste: string, autoriser: readonly string[] }} Appairee
 */
/**
 * Une station du bloc : son nom ; `distante` : elle tourne sur une autre machine que celle qui lit, quand une source le dit ;
 * sa ligne de `facts`, sa déclaration, et ce que l'app en sait par GitHub — chacun absent quand sa source ne la nomme pas.
 * @typedef {{ nom: string, distante?: boolean, ligne?: Ligne, declaree?: StationDeclaree, appairee?: Appairee }} StationDuBloc
 */
/**
 * Où tournent les stations du projet, et de quoi éditer chacune (stations-declarees.js) : les stations que ce poste joue,
 * sa cuisine qui tourne ici, sa box, son nom.
 * @typedef {{ ici: boolean, projet?: string, editer?: Editer }} Lieu
 */

export const TITRE = "Its stations";
export const RIEN_NE_TOURNE = "nothing running";
// Ce que la cuisine fait tourner hors des cooks de ticket (ticket 1971) : le mot de chaque rôle sur sa carte, et ce qu'il
// est, au survol. Un rôle que l'app ne connaît pas se dit tel quel, sans survol.
/** @type {Readonly<Record<string, string>>} */
export const ROLES_EN_COURS = {
  pass: "the pass judges a delivery: its gates, its CI and the reviewer's review, then merges it or sends it back",
  manager: "the manager judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket",
  triage: "the triage takes up a card that would go to you, and settles it when it can",
  closer: "the closer cleans the project up when you ask it to, and delivers what it removes as a PR",
};
export const OUVRIR_COOKS = "open Cooks";

// Atteinte ou non : ce que sa pastille dit. Une distante que rien ne dit atteinte ni perdue n'est pas dite verte.
export const ATTEINTE = { oui: "reached", non: "not reached", inconnue: "no word", absente: "absent" };
export const ATTEINTE_INCONNUE = "nothing says whether this station is reached";
export const ATTEINTE_ICI = "the app reads its kitchen: this page comes from it";
// Une station déclarée qui ne s'est pas encore annoncée ne cuit pas.
export const PAS_ANNONCEE = { pourquoi: "not signed in yet", geste: "nothing has been heard from it yet: it takes no ticket until it does" };
// Ce que `facts` dit de sa présence, au survol de sa pastille (ticket 1830).
/** @param {string | null | undefined} vueLe */
export const VUE_PAR_LES_FAITS = (vueLe) => `the kitchen hears from it${vueLe === null || vueLe === undefined ? "" : ` — its last request: ${vueLe}`}`;
/** @param {string | null | undefined} vueLe */
export const ABSENTE_DES_FAITS = (vueLe) =>
  vueLe === null || vueLe === undefined ? "the kitchen has never heard from it: it takes no ticket until it does" : `the kitchen has not heard from it since ${vueLe}: it takes no ticket until it does`;
// Une station que la cuisine a vue, et qui s'est tue depuis.
/** @param {string} vueLe */
export const TUE = (vueLe) => ({ pourquoi: `silent since ${vueLe}`, geste: "open Brigade on that computer: it takes tickets again once it asks the kitchen" });
export const RELIRE = { libelle: "check again", survol: "reads GitHub again, to see whether the station has spoken" };
// Ce qu'elle fournit : sa déclaration le dit ; une station que le journal ne déclare pas encore n'a rien dit.
export const FOURNIT = "Provides";
export const FOURNIT_PAS_DIT = "not declared yet";

// Le plafond de cooks du projet sur la station (ticket 1292) : ce qu'il vaut, d'où il vient, et le geste qui ouvre son réglage.
export const POSER_LE_PLAFOND = "set the cap";
// Ce que dit une station saturée : ce qui la sature, et ce que baisser le plafond change — et ne change pas.
export const BAISSER_LE_PLAFOND = "Lowering the cap makes this project run fewer cooks at once; the machine's load does not drop right away.";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Ce qu'un agent fait, et depuis quand : la durée à la lecture, l'heure au survol.
/** @param {Fabrique} doc @param {Agent} agent */
function ceQuIlFait(doc, { fait, pour, depuis }) {
  const dit = cree(doc, "span", `${fait} · for ${pour}`);
  dit.className = "agent-fait";
  dit.title = `since ${depuis}`;
  return dit;
}

// Son rôle, au mot de sa carte, et ce qu'il est au survol.
/** @param {Fabrique} doc @param {string} role */
function motDuRole(doc, role) {
  const mot = cree(doc, "strong", role);
  mot.className = "agent-role";
  const survol = Object.hasOwn(ROLES_EN_COURS, role) ? ROLES_EN_COURS[role] : undefined;
  if (survol !== undefined) mot.title = survol;
  return mot;
}

// Les cooks en cours d'une station, une ligne chacun : son ticket et son titre (l'écran étroit) — après ce qu'elle fait
// tourner d'autre, une ligne chacun : son rôle, son ticket, ce qu'il fait.
/** @param {Fabrique} doc @param {readonly Cook[]} siens @param {readonly Agent[]} agents */
export function lignesDeCooks(doc, siens, agents) {
  const cooks = cree(doc, "ul");
  cooks.className = siens.length === 0 && agents.length === 0 ? "cooks vide" : "cooks";
  cooks.append(
    ...agents.map((agent) => {
      const ligne = cree(doc, "li");
      ligne.className = "agent";
      ligne.dataset.role = agent.role;
      const numero = agent.ticket === null ? [] : [cree(doc, "strong", `#${agent.ticket}`)];
      for (const fort of numero) fort.className = "mono";
      ligne.append(motDuRole(doc, agent.role), ...numero, ceQuIlFait(doc, agent));
      return ligne;
    }),
    ...(siens.length === 0 && agents.length === 0
      ? [cree(doc, "li", RIEN_NE_TOURNE)]
      : siens.map(({ ticket, titre }) => {
          const cook = cree(doc, "li");
          const numero = cree(doc, "strong", `#${ticket}`);
          numero.className = "mono";
          const dit = cree(doc, "span", titre);
          dit.title = titre;
          cook.append(numero, dit);
          return cook;
        })),
  );
  return cooks;
}

// La carte de ce qu'une station fait tourner hors de ses cooks : son rôle et sa station, comme les cartes du rail
// l'étiquettent — le nom court, le nom entier au survol —, son ticket et son titre, ce qu'il fait et depuis quand.
/** @param {Fabrique} doc @param {string} station @param {Agent} agent */
function carteDAgent(doc, station, agent) {
  const carte = cree(doc, "li");
  carte.className = "carte-agent";
  carte.dataset.role = agent.role;
  const tete = cree(doc, "p");
  tete.className = "agent-tete";
  const etiquette = cree(doc, "span", station.split("/")[0]);
  etiquette.className = "etiquette-de-station mono";
  etiquette.title = station;
  tete.append(motDuRole(doc, agent.role), etiquette);
  carte.append(tete);
  if (agent.ticket !== null) {
    const sujet = cree(doc, "p");
    sujet.className = "agent-ticket";
    const numero = cree(doc, "strong", `#${agent.ticket}`);
    numero.className = "mono";
    sujet.append(numero, ...(agent.titre === "" ? [] : [cree(doc, "span", agent.titre)]));
    if (agent.titre !== "") sujet.title = agent.titre;
    carte.append(sujet);
  }
  carte.append(ceQuIlFait(doc, agent));
  return carte;
}

// Les cooks en cours d'une station, la carte de son ticket chacun, telle que `carte` la pose — après la carte de chaque
// agent qu'elle fait tourner d'autre. Rien du tout : une ligne le dit.
/** @param {Fabrique} doc @param {string} station @param {readonly Cook[]} siens @param {readonly Agent[]} agents @param {(cook: Cook) => any} carte */
export function cartesDeCooks(doc, station, siens, agents, carte) {
  if (siens.length === 0 && agents.length === 0) {
    const vide = cree(doc, "p", RIEN_NE_TOURNE);
    vide.className = "aucun-cook";
    return vide;
  }
  const cartes = cree(doc, "ol");
  cartes.className = "cartes";
  cartes.ariaLabel = `in progress on ${station}`;
  cartes.append(...agents.map((agent) => carteDAgent(doc, station, agent)), ...siens.map(carte));
  return cartes;
}

// Sous une station : le plafond du projet sur elle comme sa box le dit (`3 at most — 8 cores`), et en une phrase ce qui
// la sature quand elle l'est. Il se lit seulement : son réglage est la déclaration de la station, sur sa machine.
/** @param {Fabrique} doc @param {Plafonds} cap */
function plafondDeLaStation(doc, cap) {
  const plafond = cree(doc, "p", `Cooks at once: ${cap.plafond.dit}`);
  plafond.className = "plafond-de-station";
  plafond.append(niveauDe(doc, "cooks"));
  const lignes = [plafond];
  if (cap.retenue !== undefined) {
    const sature = cree(doc, "p", `Saturated on ${cap.retenue.ressources} — ${cap.retenue.detail}. ${BAISSER_LE_PLAFOND}`);
    sature.className = "retenue-de-station";
    lignes.push(sature);
  }
  return lignes;
}

// Le nom de la machine d'une station, comme la station le tire de son nom pour la déclarer `<machine>/claude`
// (runtime/src/projets/preparer.ts, `machineDe`) : de quoi reconnaître une station ajoutée tant que le journal ne dit pas
// encore sous quel nom elle la déclare.
/** @param {string} nom */
const machineDe = (nom) => nom.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";

// Les stations du bloc, chacune une fois : celles de `facts`, dans son ordre, puis celles que le journal déclare sans
// qu'elles s'y soient annoncées, puis celles que l'app connaît par GitHub et qu'aucune des deux ne nomme. Une station que
// l'app connaît se rattache à la station du bloc qui porte son nom, ou le nom de sa machine ; sans elle, elle a la sienne.
/** @param {readonly Ligne[]} lignes @param {readonly StationDeclaree[]} declarees @param {readonly Appairee[]} appairees @returns {StationDuBloc[]} */
export function stationsDuBloc(lignes, declarees = [], appairees = []) {
  /** @type {StationDuBloc[]} */
  const rangs = lignes.map((ligne) => ({ nom: ligne.station, distante: ligne.distante, ligne }));
  for (const declaree of declarees) {
    const tenu = rangs.find(({ nom }) => nom === declaree.nom);
    if (tenu !== undefined) tenu.declaree = declaree;
    else rangs.push({ nom: declaree.nom, distante: declaree.distante, declaree });
  }
  for (const appairee of appairees) {
    const libres = rangs.filter((rang) => rang.appairee === undefined);
    const sienne = libres.find(({ nom }) => nom === appairee.station) ?? (appairee.station === undefined ? libres.find(({ nom }) => nom.split("/")[0] === machineDe(appairee.nom)) : undefined);
    if (sienne !== undefined) sienne.appairee = appairee;
    else rangs.push({ nom: appairee.nom, appairee });
  }
  return rangs;
}

// Si une station est atteinte : ce que `facts` en dit — sa cuisine se lit, une distante s'y est manifestée ou non ; à
// défaut, ce que l'app en sait par GitHub ; à défaut encore, celle qui n'est pas distante l'est, et d'une distante, rien
// ne le dit.
/** @param {StationDuBloc} rang @returns {{ mot: string, ton: string, survol: string }} */
function atteinteDe({ distante, appairee, ligne }) {
  if (ligne?.presente !== undefined) {
    if (!ligne.distante) return { mot: ATTEINTE.oui, ton: "vert", survol: ATTEINTE_ICI };
    if (ligne.presente) return { mot: ATTEINTE.oui, ton: "vert", survol: VUE_PAR_LES_FAITS(ligne.vueLe) };
    return { mot: ATTEINTE.absente, ton: "gris", survol: ABSENTE_DES_FAITS(ligne.vueLe) };
  }
  if (appairee !== undefined) {
    const survol = [appairee.dit, appairee.survol].filter((ligne, i, lignes) => ligne !== "" && lignes.indexOf(ligne) === i).join("\n");
    if (appairee.ton === "vert") return { mot: ATTEINTE.oui, ton: "vert", survol };
    return { mot: appairee.ton === "rouge" ? appairee.dit : ATTEINTE.non, ton: appairee.ton === "rouge" ? "rouge" : "gris", survol };
  }
  if (distante === false) return { mot: ATTEINTE.oui, ton: "vert", survol: ATTEINTE_ICI };
  return { mot: ATTEINTE.inconnue, ton: "gris", survol: ATTEINTE_INCONNUE };
}

// Pourquoi une station ne cuit pas, quand ni sa ligne de `facts` ni son mot ne le disent : ajoutée mais bloquée ou pas
// atteinte, ce que l'app en sait ; déclarée sans s'être annoncée, qu'elle ne l'a pas fait.
// `parGitHub` : c'est GitHub qui le dit — le relire peut le changer.
/** @param {StationDuBloc} rang @returns {{ pourquoi: string, geste: string, parGitHub: boolean } | undefined} */
function retenueDe({ ligne, appairee }) {
  if (appairee !== undefined && appairee.pourquoi !== "") return { pourquoi: appairee.pourquoi, geste: appairee.geste, parGitHub: true };
  if (ligne === undefined) return { ...PAS_ANNONCEE, parGitHub: false };
  // Absente : elle ne s'y est jamais manifestée, ou s'est tue depuis.
  if (ligne.distante && ligne.presente === false) return { ...(ligne.vueLe === null || ligne.vueLe === undefined ? PAS_ANNONCEE : TUE(ligne.vueLe)), parGitHub: false };
  return undefined;
}

// La ligne qui dit pourquoi elle ne cuit pas : ses mots, ce que le chef y fait au survol, et ce que l'app sait faire — relire
// GitHub, ouvrir l'autorisation qu'elle attend.
/**
 * @param {Fabrique} doc @param {StationDuBloc} rang @param {{ pourquoi: string, geste: string, parGitHub: boolean }} retenue
 * @param {{ relire?: (id: string) => unknown, autoriser?: (url: string) => void }} gestes
 */
function ligneDeRetenue(doc, rang, retenue, { relire, autoriser }) {
  const pose = cree(doc, "p");
  pose.className = "retenue-de-cuisson";
  const pourquoi = cree(doc, "span", retenue.pourquoi);
  pourquoi.className = "pourquoi";
  pourquoi.title = retenue.geste;
  pose.append(pourquoi);
  const { appairee } = rang;
  if (retenue.parGitHub && appairee !== undefined && appairee.id !== "" && relire !== undefined) {
    const relu = bouton(doc, RELIRE.libelle, undefined);
    relu.className = "relire-la-station";
    relu.title = RELIRE.survol;
    relu.addEventListener("click", () => {
      relu.disabled = true;
      void Promise.resolve(relire(appairee.id)).finally(() => (relu.disabled = false));
    });
    pose.append(relu);
  }
  if (retenue.parGitHub && appairee !== undefined && autoriser !== undefined) {
    for (const url of appairee.autoriser) {
      pose.append(bouton(doc, `authorize on GitHub: ${url.replace(/^https:\/\/github\.com\/apps\/([^/]+).*$/, "$1")}`, () => autoriser(url)));
    }
  }
  return pose;
}

// Ce qu'elle fournit, sur une ligne — et, ouvert, son formulaire dessous, sur toute la largeur (stations-declarees.js).
/** @param {Fabrique} doc @param {StationDuBloc} rang @param {Lieu} lieu @param {number} declarees */
function fournitDe(doc, rang, lieu, declarees) {
  const ligne = cree(doc, "div");
  ligne.className = "fournit-de-station";
  const libelle = cree(doc, "span", FOURNIT);
  libelle.className = "libelle";
  ligne.append(libelle);
  // Sans sa déclaration lue, ce que `facts` dit qu'elle fournit — le journal la déclare ainsi —, sans « edit ».
  const dansLesFaits = rang.ligne?.fournit;
  if (rang.declaree === undefined && dansLesFaits !== undefined) {
    const [capacites] = ceQuElleFournit(doc, { nom: rang.nom, moteur: "", fournit: dansLesFaits, cooks: 0, distante: rang.distante ?? true }, { ici: lieu.ici });
    ligne.append(capacites);
    return [ligne];
  }
  if (rang.declaree === undefined) {
    const rien = cree(doc, "span", FOURNIT_PAS_DIT);
    rien.className = "pas-dit";
    ligne.append(rien);
    return [ligne];
  }
  const [capacites, editer, dessous] = ceQuElleFournit(doc, rang.declaree, { ...lieu, seule: declarees === 1 });
  ligne.append(capacites, ...(editer === undefined ? [] : [editer]));
  return [ligne, ...(dessous === undefined ? [] : [dessous])];
}

// Ses cooks à la fois, quand son runtime ne dit pas encore le plafond du projet sur elle : ce qu'elle déclare, et « set the
// cap », qui ouvre son formulaire — son plafond s'y règle.
/** @param {Fabrique} doc @param {StationDeclaree} declaree @param {Editer | undefined} editer */
function cooksDeclares(doc, declaree, editer) {
  const plafond = cree(doc, "p", `Cooks at once: ${declaree.cooks}`);
  plafond.className = "plafond-de-station";
  plafond.append(niveauDe(doc, "cooks"));
  if (editer === undefined || editer.editee?.nom === declaree.nom) return [plafond];
  const regle = cree(doc, "p");
  regle.className = "regle-le-plafond-de-station ouvre-l-edition";
  const ouvrir = boutonAction(doc, POSER_LE_PLAFOND, () => editer.ouvrir(declaree.nom));
  const clic = ouvrir.children[0];
  if (clic !== undefined) clic.ariaLabel = `${POSER_LE_PLAFOND}: ${declaree.nom}`;
  regle.append(ouvrir);
  return [plafond, regle];
}

// La section des stations, ou null : `facts` ne les donne pas. `pastille` : celle de la vue. `carte` :
// la carte du ticket d'un cook, celle du kanban — sans elle, une ligne par cook. `tete` : ce qui se lit sous son titre,
// avant les stations — la ligne de la cuisine du projet, où sa carte est fondue (ticket 1456).
// `declarees` : les stations que le journal déclare (installation stations --json) ; `appairees` : celles que l'app
// connaît par GitHub ; `lieu` : où elles tournent, et de quoi les éditer ;
// `relire`, `autoriser` : les gestes d'une station ajoutée qui ne cuit pas encore (ticket 1786).
/**
 * @param {Fabrique} doc
 * @param {{ lignes: readonly Ligne[] | undefined, pastille: (mot: string, ton: string | undefined) => any, carte?: (cook: Cook) => any, plafonds?: Readonly<Record<string, Plafonds>>, tete?: readonly any[], declarees?: readonly StationDeclaree[], appairees?: readonly Appairee[], lieu?: Lieu, relire?: (id: string) => unknown, autoriser?: (url: string) => void }} options
 */
export function poserLesStations(doc, { lignes, pastille, carte, plafonds, tete = [], declarees = [], appairees = [], lieu, relire, autoriser }) {
  if (lignes === undefined) return null;
  const section = cree(doc, "section");
  section.className = "stations-de-cuisson";
  section.ariaLabel = TITRE;
  if (carte !== undefined) section.dataset.cartes = "";
  const rangs = stationsDuBloc(lignes, declarees, appairees);
  const liste = cree(doc, "ol");
  liste.append(
    ...rangs.map((rang) => {
      const { ligne } = rang;
      const pose = cree(doc, "li");
      pose.className = "station-de-cuisson";
      pose.dataset.station = rang.nom;
      // Son nom, et où elle tourne.
      const nom = cree(doc, "span");
      nom.className = "nom";
      const appele = cree(doc, "strong", rang.nom);
      appele.className = "mono";
      const ou = rang.declaree !== undefined && lieu !== undefined ? [motDuLieu(doc, rang.declaree, lieu)] : (rang.distante ?? true) ? [cree(doc, "small", "remote")] : [];
      nom.append(appele, ...ou);
      // Atteinte ou non, puis son mot, ce qu'il veut dire en quelques mots, et le reste au survol.
      const etat = cree(doc, "span");
      etat.className = "etat";
      const atteinte = atteinteDe(rang);
      const joint = cree(doc, "span");
      joint.className = "pilule atteinte";
      joint.dataset.ton = atteinte.ton;
      joint.append(pastille(atteinte.mot, atteinte.ton), cree(doc, "strong", atteinte.mot));
      joint.title = atteinte.survol;
      etat.append(joint);
      if (ligne !== undefined) {
        const pilule = cree(doc, "span");
        pilule.className = "pilule";
        if (ligne.ton !== undefined) pilule.dataset.ton = ligne.ton;
        pilule.append(pastille(ligne.etat, ligne.ton), cree(doc, "strong", ligne.etat));
        pilule.title = ligne.survol;
        etat.append(pilule, ...(ligne.dit === "" ? [] : [cree(doc, "small", ligne.dit)]));
      }
      // Ses cooks en cours : arrêtée, ce sont ceux qui finissent — et ce qu'elle fait tourner d'autre. Leurs cartes ferment
      // le bloc, sous son geste.
      const cooks = carte === undefined ? lignesDeCooks(doc, ligne?.cooks ?? [], ligne?.agents ?? []) : cartesDeCooks(doc, rang.nom, ligne?.cooks ?? [], ligne?.agents ?? [], carte);
      pose.append(nom, etat, ...(carte === undefined ? [cooks] : []));
      // Pourquoi elle ne cuit pas, en une ligne.
      const retenue = retenueDe(rang);
      if (retenue !== undefined) pose.append(ligneDeRetenue(doc, rang, retenue, { ...(relire === undefined ? {} : { relire }), ...(autoriser === undefined ? {} : { autoriser }) }));
      // Ce qu'elle fournit, puis ses cooks à la fois.
      if (lieu !== undefined) pose.append(...fournitDe(doc, rang, lieu, declarees.length));
      const cap = plafonds?.[rang.nom];
      if (cap !== undefined) pose.append(...plafondDeLaStation(doc, cap));
      else if (rang.declaree !== undefined) pose.append(...cooksDeclares(doc, rang.declaree, lieu?.editer));
      if (carte !== undefined) pose.append(cooks);
      return pose;
    }),
  );
  section.append(cree(doc, "h3", TITRE), ...tete, liste);
  return section;
}

// Le détail de git, que la raison d'un accès bloqué porte entre parenthèses à sa fin : au survol (depot-retenu.js).
const DETAIL_DE_GIT = /\s*\(git: ([^)]*)\)\.?$/;

// La ligne d'alerte de l'onglet Rail, ou null : rien, du côté des cooks, ne demande un geste au chef.
// `alerte` : ce que les stations en disent (cuisson.ts) ; `refusee` : l'une d'elles y dit déjà un refus ;
// `acces`, `refus` : ce que la station du projet publie de l'accès au dépôt et de son refus (projets/demande.ts).
// Plusieurs causes tiennent sur la même ligne, la plus urgente d'abord : l'accès, que seul le chef lève.
// `clone` : le clone du dépôt en échec (ticket 1390) — sa cause dit plus que le refus qui l'accompagne, et le remplace.
/**
 * @param {Fabrique} doc
 * @param {{ alerte: string | null, refusee: boolean, acces: Acces | null, clone?: Clone | null, refus: Refus | null, ouvrir: () => void }} options
 */
export function ligneDAlerte(doc, { alerte, refusee, acces, clone = null, refus, ouvrir }) {
  const causes = [
    ...(acces === null ? [] : [acces.raison.replace(DETAIL_DE_GIT, "").replace(/\.$/, "")]),
    ...(acces !== null || clone === null ? [] : [clone.raison.replace(/\.$/, "")]),
    ...(alerte === null ? [] : [alerte]),
    ...(refus === null || refusee || clone !== null ? [] : [refus.message.replace(/\.$/, "")]),
  ];
  if (causes.length === 0) return null;
  const pose = cree(doc, "p");
  pose.className = "alerte-de-cuisine";
  pose.role = "alert";
  const dit = cree(doc, "span", `${causes.join(" · ")}.`);
  const lien = cree(doc, "button", OUVRIR_COOKS);
  lien.type = "button";
  lien.className = "lien";
  lien.addEventListener("click", ouvrir);
  pose.append(dit, lien);
  return pose;
}
