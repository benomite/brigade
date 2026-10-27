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
// que la principale déclare sans qu'elles s'y soient encore annoncées, et celles que l'app lui a ajoutées et qui n'en sont
// pas encore. La principale — elle tient le manager et la pass — vient d'abord, marquée, avec le geste qui en change ;
// chaque station dit si elle est atteinte, ce qu'elle fournit (le bloc « what each station provides » y est fondu, son
// « edit » compris), ses cooks à la fois, et, quand elle ne peut pas cuire, pourquoi en une ligne.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction } from "./briques.js";
import { niveauDe } from "./niveaux.js";
import { ceQuElleFournit, motDuLieu } from "./stations-declarees.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../cuisson.ts").LigneDeStation} Ligne */
/** @typedef {import("../faits.ts").Cook} Cook */
/** @typedef {import("../cuisson.ts").GesteDeCuisson} Geste */
/** @typedef {import("../projets/demande.ts").AccesBloque} Acces */
/** @typedef {import("../projets/demande.ts").Refus} Refus */
/** @typedef {import("../projets/demande.ts").EchecDuClone} Clone */
/** @typedef {import("../accueil.ts").PlafondsDeStation} Plafonds */
/** @typedef {import("../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {import("./stations-declarees.js").Editer} Editer */
/**
 * Une station du projet telle que l'app la connaît par GitHub (vue.js, `cuisineDe`) : son gist, son nom, si c'est sa
 * principale, ce que sa pastille en dit (`dit`, `ton`, `survol`), et, ajoutée mais bloquée ou pas atteinte, pourquoi en
 * quelques mots et ce que le chef y fait (`pourquoi`, `geste`), et les autorisations GitHub qu'elle attend. `station` : le
 * nom sous lequel la principale la déclare, quand elle le dit.
 * @typedef {{ id: string, nom: string, station?: string, principale: boolean, dit: string, ton?: string, survol: string, pourquoi: string, geste: string, autoriser: readonly string[] }} Appairee
 */
/**
 * Une station du bloc : son nom ; `principale` : elle tourne là où tournent le manager et la pass ; sa ligne de `facts`,
 * sa déclaration, et ce que l'app en sait par GitHub — chacun absent quand sa source ne la nomme pas.
 * @typedef {{ nom: string, principale: boolean, ligne?: Ligne, declaree?: StationDeclaree, appairee?: Appairee }} StationDuBloc
 */
/**
 * Où tournent les stations du projet, et de quoi éditer chacune (stations-declarees.js) : les stations que ce poste joue,
 * sa cuisine qui tourne ici, sa box, son nom.
 * @typedef {{ jouees: readonly string[], ici: boolean, hote?: string, projet?: string, editer?: Editer }} Lieu
 */
// Ce que le dernier réglage du plafond a rendu pour une station : la phrase, refusée ou non, et son détail au survol.
/** @typedef {{ dit: string, refus: boolean, detail: string }} DitDuPlafond */
// Ce qu'un clic a rendu pour une station : la phrase, refusée ou non, le détail au survol, et le mot de la
// station au moment du clic — elle s'efface quand la station en a changé.
/** @typedef {{ dit: string, refus: boolean, detail: string, etat: string }} Dit */

export const TITRE = "Its stations";
export const AUCUN_COOK = "no cook running";
export const OUVRIR_COOKS = "open Cooks";

// Le rôle d'une station (ticket 1786) : la principale tient le manager et la pass, les autres cuisent à côté. Au survol.
export const ROLES = {
  principale: { mot: "main station", survol: "it runs the project's manager and its pass, and cooks its tickets too" },
  cuisson: { mot: "cooking station", survol: "it cooks the project's tickets beside the main station: it runs neither its manager nor its pass" },
};
// Atteinte ou non : ce que sa pastille dit. Une distante que rien ne dit atteinte ni perdue n'est pas dite verte.
export const ATTEINTE = { oui: "reached", non: "not reached", inconnue: "no word" };
export const ATTEINTE_INCONNUE = "the main station does not say whether it reaches this station: it says so of the stations added from the app";
export const ATTEINTE_PRINCIPALE = "the app reads its kitchen: this page comes from it";
// Une station déclarée qui ne s'est pas encore annoncée à la principale ne cuit pas.
export const PAS_ANNONCEE = { pourquoi: "not signed in yet", geste: "the main station has not heard from it yet: it takes no ticket until it does" };
export const RELIRE = { libelle: "check again", survol: "reads GitHub again, to see whether the station has spoken" };
// Ce qu'elle fournit : sa déclaration le dit ; une station que la principale ne déclare pas encore n'a rien dit.
export const FOURNIT = "Provides";
export const FOURNIT_PAS_DIT = "not declared on the main station yet";
// Le changement de principale : le déménagement de la cuisine, que l'en-tête du projet ouvre (ticket 1095).
export const CHANGER_LA_PRINCIPALE = { libelle: "move the kitchen", survol: "moves the manager and the pass to another of your stations: the choice opens at the top of the page" };

// Le plafond de cooks du projet sur la station (ticket 1292) : ce qu'il vaut, d'où il vient, et ses deux gestes.
export const POSER_LE_PLAFOND = "set the cap";
export const PLAFOND_PAR_DEFAUT = "back to the default";
// Ce que dit une station saturée : ce qui la sature, et ce que baisser le plafond change — et ne change pas.
export const BAISSER_LE_PLAFOND = "Lowering the cap makes this project run fewer cooks at once; the machine's load does not drop right away.";

// Ce que chaque bouton dit, ce qu'il dit tant que le clic attend sa réponse, ce qu'il fait — au survol du bouton —,
// et son prix, nul quand il ne coûte rien : arrêter ne coupe rien et ne perd rien ; relancer remet ses cooks au
// travail, sur le quota du chef. Le prix passe en survol, jamais sous le bouton.
/** @type {Readonly<Record<Geste, { libelle: string, enCours: string, fait: string, prix: string | null }>>} */
export const BOUTONS = {
  stop: { libelle: "stop cooking", enCours: "stopping…", fait: "it takes no more tickets of this project; its running cooks finish — delivered, or their ticket goes back to the rail", prix: null },
  start: { libelle: "start cooking", enCours: "starting…", fait: "it takes the project's tickets again", prix: "its cooks spend what cooks spend, on your quota" },
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Les cooks en cours d'une station, une ligne chacun : son ticket et son titre (l'écran étroit).
/** @param {Fabrique} doc @param {readonly Cook[]} siens */
function lignesDeCooks(doc, siens) {
  const cooks = cree(doc, "ul");
  cooks.className = siens.length === 0 ? "cooks vide" : "cooks";
  cooks.append(
    ...(siens.length === 0
      ? [cree(doc, "li", AUCUN_COOK)]
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

// Les cooks en cours d'une station, la carte de son ticket chacun, telle que `carte` la pose.
/** @param {Fabrique} doc @param {string} station @param {readonly Cook[]} siens @param {(cook: Cook) => any} carte */
function cartesDeCooks(doc, station, siens, carte) {
  if (siens.length === 0) {
    const vide = cree(doc, "p", AUCUN_COOK);
    vide.className = "aucun-cook";
    return vide;
  }
  const cartes = cree(doc, "ol");
  cartes.className = "cartes";
  cartes.ariaLabel = `tickets in progress on ${station}`;
  cartes.append(...siens.map(carte));
  return cartes;
}

// Sous une station : le plafond du projet sur elle comme sa box le dit (`3 at most — 8 cores`), en une phrase ce qui
// la sature quand elle l'est, le champ et ses deux gestes — le nombre, ou le retour au défaut quand le chef l'a réglé.
// Le plafond neuf se lit à la lecture qui suit le geste ; `en cours` : le geste attend sa réponse.
/**
 * @param {Fabrique} doc @param {string} station @param {Plafonds} cap @param {DitDuPlafond | "en cours" | undefined} rendu
 * @param {{ lire: (station: string) => string, ecrire: (station: string, valeur: string) => void } | undefined} saisies @param {(station: string, valeur: string) => void} regler
 */
function plafondDeLaStation(doc, station, cap, rendu, saisies, regler) {
  const attend = rendu === "en cours";
  const plafond = cree(doc, "p", `Cooks at once: ${cap.plafond.dit}`);
  plafond.className = "plafond-de-station";
  plafond.append(niveauDe(doc, "cooks"));
  const lignes = [plafond];
  if (cap.retenue !== undefined) {
    const sature = cree(doc, "p", `Saturated on ${cap.retenue.ressources} — ${cap.retenue.detail}. ${BAISSER_LE_PLAFOND}`);
    sature.className = "retenue-de-station";
    lignes.push(sature);
  }
  const champ = cree(doc, "input");
  champ.type = "text";
  champ.inputMode = "numeric";
  champ.placeholder = "cooks at once";
  champ.ariaLabel = `cook cap on ${station}`;
  champ.value = saisies?.lire(station) ?? "";
  champ.addEventListener("input", () => saisies?.ecrire(station, champ.value));
  champ.disabled = attend;
  const regle = cree(doc, "p");
  regle.className = "regle-le-plafond-de-station";
  const poser = boutonAction(doc, POSER_LE_PLAFOND, () => regler(station, champ.value.trim()), { recommande: true, prix: "no running cook is stopped; the station launches no more while it is above — 0 lifts the limit" });
  const clic = poser.children[0];
  if (clic !== undefined) clic.disabled = attend;
  regle.append(champ, poser);
  if (cap.plafond.parLeChef) {
    const retour = boutonAction(doc, PLAFOND_PAR_DEFAUT, () => regler(station, "auto"), { prix: "withdraws your cap: the one derived from the machine's cores returns" });
    const clicRetour = retour.children[0];
    if (clicRetour !== undefined) clicRetour.disabled = attend;
    regle.append(retour);
  }
  lignes.push(regle);
  if (rendu !== undefined && rendu !== "en cours") {
    const dit = cree(doc, "p", rendu.dit);
    dit.className = rendu.refus ? "dit refus" : "dit";
    if (rendu.detail !== "") dit.title = rendu.detail;
    lignes.push(dit);
  }
  return lignes;
}

// Le nom de la machine d'une station, comme la principale le tire de son nom pour la déclarer `<machine>/claude`
// (runtime/src/projets/preparer.ts, `machineDe`) : de quoi reconnaître une station ajoutée tant que la principale ne dit pas
// encore sous quel nom elle la déclare.
/** @param {string} nom */
const machineDe = (nom) => nom.toLowerCase().replace(/[^\p{Ll}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "station";

// Les stations du bloc, chacune une fois : celles de `facts`, dans son ordre, puis celles que la principale déclare sans
// qu'elles s'y soient annoncées, puis celles que l'app connaît par GitHub et qu'aucune des deux ne nomme. Une station de la
// machine de la principale — non distante — en est (`principale`), et la principale que l'app connaît s'y rattache ; elles
// viennent d'abord, et la première est la principale du bloc.
/** @param {readonly Ligne[]} lignes @param {readonly StationDeclaree[]} declarees @param {readonly Appairee[]} appairees @returns {StationDuBloc[]} */
export function stationsDuBloc(lignes, declarees = [], appairees = []) {
  /** @type {StationDuBloc[]} */
  const rangs = lignes.map((ligne) => ({ nom: ligne.station, principale: !ligne.distante, ligne }));
  for (const declaree of declarees) {
    const tenu = rangs.find(({ nom }) => nom === declaree.nom);
    if (tenu !== undefined) tenu.declaree = declaree;
    else rangs.push({ nom: declaree.nom, principale: !declaree.distante, declaree });
  }
  const principale = appairees.find((appairee) => appairee.principale);
  if (principale !== undefined) {
    const siennes = rangs.filter((rang) => rang.principale);
    if (siennes.length === 0) rangs.push({ nom: principale.nom, principale: true, appairee: principale });
    for (const rang of siennes) rang.appairee = principale;
  }
  for (const appairee of appairees) {
    if (appairee === principale) continue;
    const libres = rangs.filter((rang) => !rang.principale && rang.appairee === undefined);
    const sienne = libres.find(({ nom }) => nom === appairee.station) ?? (appairee.station === undefined ? libres.find(({ nom }) => nom.split("/")[0] === machineDe(appairee.nom)) : undefined);
    if (sienne !== undefined) sienne.appairee = appairee;
    else rangs.push({ nom: appairee.nom, principale: false, appairee });
  }
  return [...rangs.filter((rang) => rang.principale), ...rangs.filter((rang) => !rang.principale)];
}

// Si une station est atteinte : ce que l'app en sait par GitHub ; à défaut, la principale l'est — sa cuisine se lit —, et
// d'une distante, rien ne le dit.
/** @param {StationDuBloc} rang @returns {{ mot: string, ton: string, survol: string }} */
function atteinteDe({ principale, appairee }) {
  if (appairee !== undefined) {
    const survol = [appairee.dit, appairee.survol].filter((ligne, i, lignes) => ligne !== "" && lignes.indexOf(ligne) === i).join("\n");
    if (appairee.ton === "vert") return { mot: ATTEINTE.oui, ton: "vert", survol };
    return { mot: principale && appairee.ton === "rouge" ? appairee.dit : ATTEINTE.non, ton: appairee.ton === "rouge" ? "rouge" : "gris", survol };
  }
  if (principale) return { mot: ATTEINTE.oui, ton: "vert", survol: ATTEINTE_PRINCIPALE };
  return { mot: ATTEINTE.inconnue, ton: "gris", survol: ATTEINTE_INCONNUE };
}

// Pourquoi une station ne cuit pas, quand ni sa ligne de `facts` ni son mot ne le disent : ajoutée mais bloquée ou pas
// atteinte, ce que l'app en sait ; déclarée sans s'être annoncée, qu'elle ne l'a pas fait.
// `parGitHub` : c'est GitHub qui le dit — le relire peut le changer.
/** @param {StationDuBloc} rang @returns {{ pourquoi: string, geste: string, parGitHub: boolean } | undefined} */
function retenueDe({ ligne, appairee }) {
  if (appairee !== undefined && appairee.pourquoi !== "") return { pourquoi: appairee.pourquoi, geste: appairee.geste, parGitHub: true };
  if (ligne === undefined) return { ...PAS_ANNONCEE, parGitHub: false };
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
    const relu = cree(doc, "button", RELIRE.libelle);
    relu.type = "button";
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
      const ouvre = cree(doc, "button", `authorize on GitHub: ${url.replace(/^https:\/\/github\.com\/apps\/([^/]+).*$/, "$1")}`);
      ouvre.type = "button";
      ouvre.addEventListener("click", () => autoriser(url));
      pose.append(ouvre);
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

// Le changement de principale, sur sa ligne : le bouton du déménagement — grisé, avec pourquoi au survol, quand il n'est
// pas offert.
/** @param {Fabrique} doc @param {{ offert: boolean, pourquoiPas: string, ouvrir: () => void }} deplacer */
function changerLaPrincipale(doc, deplacer) {
  const pose = cree(doc, "p");
  pose.className = "principale-de-station";
  const bouton = cree(doc, "button", CHANGER_LA_PRINCIPALE.libelle);
  bouton.type = "button";
  bouton.className = "changer-la-principale";
  bouton.title = deplacer.offert ? CHANGER_LA_PRINCIPALE.survol : deplacer.pourquoiPas;
  bouton.disabled = !deplacer.offert;
  bouton.addEventListener("click", () => deplacer.ouvrir());
  pose.append(bouton);
  return pose;
}

// La section des stations, ou null : `facts` ne les donne pas. `enCours` : les stations dont un clic attend sa
// réponse, et lequel ; `dits` : ce que le dernier clic de chacune a rendu. `pastille` : celle de la vue. `carte` :
// la carte du ticket d'un cook, celle du kanban — sans elle, une ligne par cook. `tete` : ce qui se lit sous son titre,
// avant les stations — la ligne de la cuisine du projet, où sa carte est fondue (ticket 1456).
// `declarees` : les stations que la principale déclare (installation stations --json) ; `appairees` : celles que l'app
// connaît par GitHub ; `lieu` : où elles tournent, et de quoi les éditer ; `deplacer` : le changement de principale ;
// `relire`, `autoriser` : les gestes d'une station ajoutée qui ne cuit pas encore (ticket 1786).
/**
 * @param {Fabrique} doc
 * @param {{ lignes: readonly Ligne[] | undefined, enCours: ReadonlyMap<string, Geste>, dits: ReadonlyMap<string, Dit>, jouer: (station: string, geste: Geste) => void, pastille: (mot: string, ton: string | undefined) => any, carte?: (cook: Cook) => any, plafonds?: Readonly<Record<string, Plafonds>>, plafondsDits?: ReadonlyMap<string, DitDuPlafond | "en cours">, saisies?: { lire: (station: string) => string, ecrire: (station: string, valeur: string) => void }, regler?: (station: string, valeur: string) => void, tete?: readonly any[], declarees?: readonly StationDeclaree[], appairees?: readonly Appairee[], lieu?: Lieu, deplacer?: { offert: boolean, pourquoiPas: string, ouvrir: () => void }, relire?: (id: string) => unknown, autoriser?: (url: string) => void }} options
 */
export function poserLesStations(doc, { lignes, enCours, dits, jouer, pastille, carte, plafonds, plafondsDits, saisies, regler, tete = [], declarees = [], appairees = [], lieu, deplacer, relire, autoriser }) {
  if (lignes === undefined) return null;
  const section = cree(doc, "section");
  section.className = "stations-de-cuisson";
  section.ariaLabel = TITRE;
  if (carte !== undefined) section.dataset.cartes = "";
  const rangs = stationsDuBloc(lignes, declarees, appairees);
  const premiere = rangs.find((rang) => rang.principale);
  const liste = cree(doc, "ol");
  liste.append(
    ...rangs.map((rang) => {
      const { ligne } = rang;
      const pose = cree(doc, "li");
      pose.className = "station-de-cuisson";
      pose.dataset.station = rang.nom;
      // Une seule principale : une autre station de sa machine cuit à côté d'elle.
      const sonRole = rang === premiere ? "principale" : "cuisson";
      pose.dataset.role = sonRole;
      // Son nom, son rôle, et où elle tourne.
      const nom = cree(doc, "span");
      nom.className = "nom";
      const appele = cree(doc, "strong", rang.nom);
      appele.className = "mono";
      const role = cree(doc, "small", ROLES[sonRole].mot);
      role.className = "role";
      role.title = ROLES[sonRole].survol;
      const ou = rang.declaree !== undefined && lieu !== undefined ? [motDuLieu(doc, rang.declaree, lieu)] : (ligne?.distante ?? !rang.principale) ? [cree(doc, "small", "remote")] : [];
      nom.append(appele, role, ...ou);
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
      // Ses cooks en cours : arrêtée, ce sont ceux qui finissent. Leurs cartes ferment le bloc, sous son geste.
      const cooks = carte === undefined ? lignesDeCooks(doc, ligne?.cooks ?? []) : cartesDeCooks(doc, rang.nom, ligne?.cooks ?? [], carte);
      pose.append(nom, etat, ...(carte === undefined ? [cooks] : []));
      // Le geste : un seul bouton, et seulement quand c'est d'elle que l'arrêt vient ou s'en va.
      if (ligne !== undefined && ligne.geste !== null) {
        const geste = ligne.geste;
        const attendu = enCours.get(ligne.station);
        const bouton = boutonAction(doc, attendu === undefined ? BOUTONS[geste].libelle : BOUTONS[attendu].enCours, () => jouer(ligne.station, geste), { prix: BOUTONS[geste].prix });
        bouton.className = "action geste-de-cuisson";
        const clic = bouton.children[0];
        if (clic !== undefined) {
          clic.ariaLabel = `${BOUTONS[geste].libelle} on ${ligne.station}`;
          clic.title = BOUTONS[geste].fait;
          clic.disabled = attendu !== undefined;
        }
        pose.append(bouton);
      }
      // Ce que le dernier clic a rendu, tant que la station n'a pas changé de mot.
      const rendu = ligne === undefined ? undefined : dits.get(ligne.station);
      if (ligne !== undefined && rendu !== undefined && rendu.etat === ligne.etat) {
        const dit = cree(doc, "p", rendu.dit);
        dit.className = rendu.refus ? "dit refus" : "dit";
        if (rendu.detail !== "") dit.title = rendu.detail;
        pose.append(dit);
      }
      // Pourquoi elle ne cuit pas, en une ligne.
      const retenue = retenueDe(rang);
      if (retenue !== undefined) pose.append(ligneDeRetenue(doc, rang, retenue, { ...(relire === undefined ? {} : { relire }), ...(autoriser === undefined ? {} : { autoriser }) }));
      // La principale : le geste qui en change, une fois.
      if (rang === premiere && deplacer !== undefined) pose.append(changerLaPrincipale(doc, deplacer));
      // Ce qu'elle fournit, puis ses cooks à la fois.
      if (lieu !== undefined) pose.append(...fournitDe(doc, rang, lieu, declarees.length));
      const cap = plafonds?.[rang.nom];
      if (cap !== undefined && regler !== undefined) pose.append(...plafondDeLaStation(doc, rang.nom, cap, plafondsDits?.get(rang.nom), saisies, regler));
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
 * @param {{ alerte: string | null, refusee: boolean, acces: Acces | null, clone?: Clone | null, refus: Refus | null, gates?: string | null, ouvrir: () => void }} options
 */
export function ligneDAlerte(doc, { alerte, refusee, acces, clone = null, refus, gates = null, ouvrir }) {
  const causes = [
    ...(gates === null ? [] : [gates]),
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
