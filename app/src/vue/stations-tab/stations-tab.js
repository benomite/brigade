// @ts-check
// L'onglet Stations d'un projet, posé (ticket 3195, épique 3194) : un seul composant, qui répond à trois questions.
//   1. Qui le cuit, et est-ce que ça marche : une ligne en tête, dans exactement un de cinq états (state.js, `hautDe`) —
//      verte seulement quand une station en ligne le cuit ou attend son prochain ticket. Hors ligne, elle dit que rien ne
//      cuit, comment ramener la station, et offre de déménager vers cet ordinateur d'un clic ; personne, combien de tickets
//      `fire` attendent, « Cook it on this computer » — recommandé, quand cet ordinateur ne le sert pas encore (ticket 3399)
//      — et « Choose who cooks it ». Le projet éteint, elle le dit à la place de qui le cuit — rien n'y cuit —, et où
//      l'allumer au survol (ticket 3454).
//   2. Une carte par station qui sert le projet, elles seules : son nom, ce qu'elle est en clair, son état à l'instant, ce
//      qu'elle tient du projet (les tickets de ses cooks, ou « idle »), ses deux gestes — « Move to another station »,
//      « Stop cooking here » — et « Details », replié, qui porte ses réglages et ses lectures, chacun avec son contrôle.
//   3. Comment le changer : le choix de station (choice.js), ouvert sous la ligne du haut — qui le cuit, ou où déménager.
//      Quand une station le sert déjà, « Add a station » ouvre le même choix pour en ajouter une (ticket 3402).
// Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js), ce qu'elle a lu et les gestes.

import { buttonAction, replie, survol } from "../briques.js";
import { confirmationDeAction } from "../composants/confirmation/confirmation.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { marque } from "../composants/pill/pill.js";
import { ANNULER, CET_ORDINATEUR, ENREGISTREMENT, READ_DE, OUI } from "../lexique.js";
import { linesDeCooks } from "../stations-de-cooking.js";
import { poserLeQuota } from "../stations-quota/stations-quota.js";
import { poserLesChoice } from "./choice.js";
import { BLOCKED, CHOISIR, CUIRE_ICI, phraseDuHaut, VERS_ICI } from "./state.js";
import { lineDeStandby, standbyTenue } from "../standby-machine/standby-machine.js";
import { linesDuEngine } from "../engine/CardEngine.js";

/** @typedef {import("../composants/pan/pan.js").Fabrique} Fabrique */
/** @typedef {import("./state.js").Haut} Haut */
/** @typedef {import("./state.js").Servante} Servante */
/** @typedef {import("./state.js").Sorte} Sorte */
/** @typedef {import("./choice.js").Choice} Choice */
/**
 * Ce que l'onglet montre.
 *   `projet`      son nom ; `poste` : le nom que l'écran donne à cet ordinateur (« this Mac »).
 *   `lues`        les stations sont lues : sans elles, l'onglet ne dit ni qui cuit ni que personne ne cuit.
 *   `haut`        la ligne du haut ; `ramener` : comment ramener la station hors ligne — ou, le projet éteint, l'allumer —, au
 *                 survol ; `versIci` : cet ordinateur
 *                 peut reprendre sa cuisine — le bouton qui l'y déménage est offert ; `cuireIci` : personne ne le cuit et cet
 *                 ordinateur peut le servir — « Cook it on this computer » est offert.
 *   `servantes`   une carte chacune ; `enCuisson` : la lecture de leurs cooks dit encore vrai (la poêle, ticket 2984).
 *   `choix`       le choix ouvert : son titre, ses choix, s'il déménage la cuisine (son prix se dit), celui qui s'écrit, le
 *                 refus du dernier.
 *   `dit`         ce que le dernier geste a rendu, en une ligne — refusé, son détail au survol.
 *   `deplacable`  le déménagement est offert ; sinon, pourquoi, au survol du bouton.
 *   `arret`       la station dont « Stop cooking here » attend sa confirmation, ou qui s'arrête (`enCours`).
 *   `details`     les lignes de « Details » de chaque station, par sa clé (`cleDe`) ; `ouverts` : celles dont « Details » est
 *                 déplié ; `arret.id` : la clé de la station qui s'arrête.
 *   `lecture`     l'écran étroit : il se lit sans rien régler (ticket 1186) — ni geste, ni « Details ».
 *   `quota`       le quota GitHub du compte (`quotaGithub` des faits) : la affiche, en tête, et son détail par station et projet
 *                 (stations-quota/, ticket 3483) ; absent, pas de quota affiché.
 *   `veille`      ce que la station de cet ordinateur écrit de sa veille (veille-machine/, ticket 3642) : sa carte dit qu'elle
 *                 garde l'ordinateur éveillé tant que c'est vrai.
 *   `moteurIci`   le moteur que la station de cet ordinateur a choisi dans ses réglages (moteur/, ticket 3746) : sa carte le
 *                 dit quand le runtime n'en publie rien.
 *   `quiCuit`     « Choose who cooks it » est offert : l'app connaît le dépôt du projet, et peut y écrire (ticket 3163) ; et,
 *                 quand une station le sert déjà, « Add a station » (ticket 3402).
 * @typedef {{
 *   projet: string,
 *   poste: string,
 *   lues: boolean,
 *   haut: Haut,
 *   ramener?: string,
 *   versIci?: boolean,
 *   cuireIci?: boolean,
 *   servantes: readonly Servante[],
 *   enCuisson?: boolean,
 *   choix?: { titre: string, choix: readonly Choice[], deplacement: boolean, enCours?: string, refus?: { ligne: string, detail: string } },
 *   dit?: { texte: string, refus: boolean, detail?: string },
 *   deplacable: { offert: boolean, pourquoi: string },
 *   arret?: { id: string, enCours: boolean },
 *   details: ReadonlyMap<string, readonly any[]>,
 *   ouverts: ReadonlySet<string>,
 *   lecture?: boolean,
 *   quiCuit?: boolean,
 *   quota?: import("../stations-quota/stations-quota.js").QuotaGithub,
 *   veille?: import("../standby-machine/standby-machine.js").Standby,
 *   moteurIci?: string,
 * }} VuDeLOnglet
 */
/**
 * @typedef {{
 *   choisirQuiCuit(): void,
 *   deplacer(): void,
 *   versIci(): void,
 *   cuireIci(): void,
 *   choisir(choice: Choice): void,
 *   annuler(): void,
 *   arreter(id: string): void,
 *   confirmerArret(id: string): void,
 *   renoncerArret(): void,
 *   basculer(id: string, ouvert: boolean): void,
 * }} ActionsDeLOnglet
 */

export const READ = READ_DE("your stations on GitHub");
export const DEPLACER = "Move to another station";
export const ARRETER = "Stop cooking here";
export const DETAILS = "Details";
export const DETAILS_RESUME = "folders, sandbox, Claude connection, cooks at once, ordinary tickets";
export const AU_REPOS = "idle";
// Ce qu'est chaque station, en clair.
/** @type {(workstation: string) => Record<Sorte, string>} */
export const CE_QU_ELLE_EST = (workstation) => ({
  ici: `${workstation}: cooks while the app is open`,
  box: "always-on box: cooks while your computer sleeps",
  ordinateur: "another computer: cooks while Brigade is open on it",
});
// Son état, au mot de sa pilule.
export const EN_LINE = "online";
export const DEMARRE = "starting";
// Le choix ouvert, son titre.
/** @param {string} project */
export const QUI_CUIT = (project) => `Who cooks ${project}?`;
// Ajouter une station quand une autre le cuit déjà : le même choix, son titre (ticket 3402).
export const AJOUTER = "Add a station";
/** @param {string} project */
export const QUI_D_AUTRE = (project) => `Which station also cooks ${project}?`;
// Le choix ouvert sans aucune station à proposer : chacune le sert déjà, ou aucune n'est connue.
export const AUCUN_CHOICE = "No other station can take it: each of yours already cooks it.";
/** @param {string} project @param {string} de */
export const OU_DEPLACER = (project, de) => `Move ${project}'s kitchen from ${de} to:`;
// Ce que coûte un déménagement, dit sous son choix (le prix de la confirmation d'un geste qui coûte).
export const PRIX_DU_DEPLACEMENT = "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.";
// « Stop cooking here » : ce qu'il fait, en une ligne.
/** @param {string} project @param {string} station */
export const STOP = (project, station) => `Stop cooking ${project} on ${station}?`;
/** @param {string} project @param {string} station */
export const PRIX_DE_L_STOP = (project, station) => `${station} takes no more of ${project}'s tickets; its cooks in flight finish.`;
export const OUI_STOP = OUI("stop cooking here");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le ton de la ligne du haut : vert quand une station le cuit ou attend son prochain ticket, et seulement alors.
/** @param {Haut} haut */
export const tonDuHaut = (haut) => (haut.vert ? "vert" : haut.etat === "deplacement" || haut.etat === "redemarre" ? "jaune" : haut.etat === "hors-ligne" ? "rouge" : "gris");

// La ligne du haut : sa pastille, sa phrase, et ses gestes.
/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {ActionsDeLOnglet} actions */
function lineDuHaut(doc, vu, actions) {
  const { haut } = vu;
  const line = cree(doc, "div");
  line.className = "haut-des-stations";
  line.dataset.etat = haut.etat;
  line.dataset.ton = tonDuHaut(haut);
  line.ariaLive = "polite";
  const phrase = cree(doc, "p");
  phrase.className = "phrase";
  phrase.append(marque(doc, tonDuHaut(haut)), cree(doc, "strong", phraseDuHaut(haut)));
  if ((haut.etat === "hors-ligne" || haut.etat === "eteint") && vu.ramener !== undefined && vu.ramener !== "") phrase.append(survol(doc, vu.ramener));
  line.append(phrase);
  if (haut.etat === "deplacement" && haut.bloque !== null) {
    const blocked = cree(doc, "p", BLOCKED(haut.bloque));
    blocked.className = "bloque";
    line.append(blocked);
  }
  // Les gestes : le cuire ici d'un clic, ou choisir qui le cuit ; ou, rien ne cuisant, le déménager ici d'un clic — vers une
  // autre station, c'est le geste de sa carte. Un choix ouvert les remplace.
  if (vu.choix !== undefined || vu.lecture === true) return line;
  const ici = haut.etat === "personne" && vu.cuireIci === true;
  const boutons = [
    ...(ici ? [buttonAction(doc, CUIRE_ICI, actions.cuireIci, { recommande: true })] : []),
    ...((haut.etat === "personne" || (haut.etat === "eteint" && !haut.servi)) && vu.quiCuit === true ? [buttonAction(doc, CHOISIR, actions.choisirQuiCuit, { recommande: !ici })] : []),
    ...(haut.etat === "hors-ligne" && vu.versIci === true ? [buttonAction(doc, VERS_ICI, actions.versIci, { recommande: true })] : []),
    ...((haut.etat === "cuit" || haut.etat === "hors-ligne" || (haut.etat === "eteint" && haut.servi)) && vu.quiCuit === true ? [buttonAction(doc, AJOUTER, actions.choisirQuiCuit)] : []),
  ];
  if (boutons.length > 0) {
    const pied = cree(doc, "p");
    pied.className = "gestes";
    pied.append(...boutons);
    line.append(pied);
  }
  return line;
}

// « Move to another station » : offert, il ouvre le choix ; sinon il attend, et dit pourquoi au survol.
/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {ActionsDeLOnglet} actions */
function buttonDeDeplacement(doc, { deplacable }, actions) {
  const action = buttonAction(doc, DEPLACER, actions.deplacer);
  const button = action.children?.[0];
  if (button !== undefined && !deplacable.offert) {
    button.disabled = true;
    button.title = deplacable.pourquoi;
  }
  return action;
}

// Le choix ouvert : son titre, la liste (choice.js), et « Cancel » — un déménagement dit aussi son prix.
/** @param {Fabrique} doc @param {NonNullable<VuDeLOnglet["choix"]>} choice @param {ActionsDeLOnglet} actions */
function leChoice(doc, choice, actions) {
  const racine = cree(doc, "section");
  racine.className = "choix-des-stations";
  racine.ariaLabel = choice.titre;
  const attendu = cree(doc, "p", choice.titre);
  attendu.className = "attendu";
  racine.append(attendu);
  const state = { choix: choice.choix, ...(choice.enCours === undefined ? {} : { enCours: choice.enCours }), ...(choice.refus === undefined ? {} : { refus: choice.refus }) };
  racine.append(...poserLesChoice(doc, state, actions.choisir));
  if (choice.choix.length === 0) racine.append(lineEmpty(doc, AUCUN_CHOICE, { classe: "aucun-choix" }));
  if (choice.deplacement) {
    const prix = cree(doc, "p", PRIX_DU_DEPLACEMENT);
    prix.className = "prix";
    racine.append(prix);
  }
  const pied = cree(doc, "p");
  pied.className = "gestes";
  const annuler = buttonAction(doc, ANNULER, actions.annuler);
  const button = annuler.children?.[0];
  if (button !== undefined) button.disabled = choice.enCours !== undefined;
  pied.append(annuler);
  racine.append(pied);
  return racine;
}

// L'état d'une station, à l'instant : sa pilule, son ton — vert seulement en ligne.
/** @param {Servante} station */
export const stateDit = ({ etat: state, dit }) =>
  state === "en-ligne" ? { mot: EN_LINE, ton: "vert" } : state === "demarre" ? { mot: DEMARRE, ton: "jaune" } : state === "redemarre" ? { mot: dit, ton: "jaune" } : { mot: dit, ton: state === "illisible" ? "gris" : "rouge" };

// La clé d'une station de l'onglet : son gist, sinon son nom — une station que le projet nomme sans que l'app la connaisse.
// Ses gestes et son « Details » la retrouvent par elle.
/** @param {Pick<Servante, "id" | "nom">} station */
export const cleDe = ({ id, nom: name }) => (id === "" ? name : id);

// Une carte : la station qui sert le projet.
/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {Servante} station @param {ActionsDeLOnglet} actions */
function card(doc, vu, station, actions) {
  const racine = cree(doc, "section");
  racine.className = "carte-de-station";
  const cle = cleDe(station);
  racine.dataset.station = cle;
  racine.dataset.etat = station.etat;
  racine.ariaLabel = station.nom;
  // Son nom — « this computer » pour celle de cet ordinateur, son nom d'hôte après —, ce qu'elle est, et son état.
  const tete = cree(doc, "header");
  const name = cree(doc, "h4");
  const appele = cree(doc, "strong", station.ici ? CET_ORDINATEUR : station.nom);
  if (!station.ici) appele.className = "mono";
  name.append(appele);
  if (station.ici) {
    const hote = cree(doc, "span", station.nom);
    hote.className = "hote mono";
    name.append(hote);
  }
  const { mot: word, ton } = stateDit(station);
  const state = cree(doc, "span");
  state.className = "pilule etat";
  state.dataset.ton = ton;
  state.append(marque(doc, ton), cree(doc, "strong", word));
  // Ce qui la retient encore — sa machine pleine, la limite de GitHub, son refus — se dit à côté.
  if (station.note !== undefined && station.note !== "") {
    const note = cree(doc, "small", station.note);
    note.className = "note";
    state.append(note);
  }
  tete.append(name, state);
  const ceQuElleEst = cree(doc, "p", CE_QU_ELLE_EST(vu.poste)[station.sorte]);
  ceQuElleEst.className = "ce-qu-elle-est";
  racine.append(tete, ceQuElleEst);
  // Son moteur, et quand ses cooks cuisent sur le secours, sur lequel et jusqu'à quand (moteur/, ticket 3746).
  racine.append(...linesDuEngine(doc, { ...(station.moteur === undefined ? {} : { statut: station.moteur }), ...(station.ici && vu.moteurIci !== undefined ? { choisi: vu.moteurIci } : {}) }));
  // Ce qu'elle n'a pas pu cuire — les dépendances qui ne s'installent pas — se dit en une ligne : le chef sait quoi réparer ou décocher.
  if (station.lacks !== undefined) {
    const manque = cree(doc, "p", `Could not run a ticket: ${station.lacks}`);
    manque.className = "manque";
    racine.append(manque);
  }
  if (station.ici && standbyTenue(vu.veille)) racine.append(lineDeStandby(doc));
  // Ce qu'elle tient du projet : les tickets de ses cooks, ce qu'elle fait tourner d'autre ; rien, elle est au repos.
  const tient = station.cooks.length + station.agents.length > 0;
  racine.append(
    tient
      ? linesDeCooks(doc, station.cooks, station.agents, vu.enCuisson === true && station.etat === "en-ligne")
      : lineEmpty(doc, AU_REPOS, { classe: "au-repos" }),
  );
  // Ses gestes, ou la confirmation de son arrêt — puis, confirmé, qu'il s'écrit. La station où la cuisine déménage n'en a
  // pas tant qu'elle démarre : la ligne du haut suit le déménagement.
  if (vu.arret?.id === cle && vu.arret.enCours) {
    const enCours = cree(doc, "p", ENREGISTREMENT);
    enCours.className = "dit";
    racine.append(enCours);
  } else if (vu.arret?.id === cle) {
    racine.append(
      confirmationDeAction(
        doc,
        { titre: STOP(vu.projet, station.nom), phrase: PRIX_DE_L_STOP(vu.projet, station.nom), oui: OUI_STOP, non: ANNULER },
        { oui: () => actions.confirmerArret(cle), non: actions.renoncerArret },
      ),
    );
  } else if (vu.choix === undefined && vu.lecture !== true && station.etat !== "demarre") {
    const pied = cree(doc, "p");
    pied.className = "gestes";
    pied.append(buttonDeDeplacement(doc, vu, actions), buttonAction(doc, ARRETER, () => actions.arreter(cle), { sorte: "discret" }));
    racine.append(pied);
  }
  // « Details », replié tant que le chef ne l'ouvre pas : ses réglages et ses lectures, chacun avec son contrôle.
  const lines = vu.details.get(cle) ?? [];
  if (lines.length > 0) {
    const contenu = cree(doc, "div");
    contenu.className = "details-de-station";
    contenu.append(...lines);
    racine.append(replie(doc, { titre: DETAILS, resume: DETAILS_RESUME, ouvert: vu.ouverts.has(cle), basculer: (ouvert) => actions.basculer(cle, ouvert) }, [contenu]));
  }
  return racine;
}

/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {ActionsDeLOnglet} actions */
export function poserLOngletDesStations(doc, vu, actions) {
  const racine = cree(doc, "section");
  racine.className = "onglet-des-stations";
  racine.dataset.bloc = "stations-tab";
  racine.ariaLabel = "Stations";
  if (!vu.lues) {
    racine.append(lineEmpty(doc, READ, { classe: "lecture" }));
    return racine;
  }
  racine.append(lineDuHaut(doc, vu, actions));
  if (vu.quota !== undefined) racine.append(poserLeQuota(doc, vu.quota));
  if (vu.dit !== undefined && vu.dit.texte !== "") {
    const dit = cree(doc, "p", vu.dit.texte);
    dit.className = "dit-des-stations";
    racine.append(vu.dit.refus ? lineError(doc, vu.dit.texte, vu.dit.detail ?? "", { classe: "dit-des-stations" }) : dit);
  }
  if (vu.choix !== undefined) racine.append(leChoice(doc, vu.choix, actions));
  if (vu.servantes.length > 0) {
    const cards = cree(doc, "div");
    cards.className = "cartes-des-stations";
    cards.append(...vu.servantes.map((station) => card(doc, vu, station, actions)));
    racine.append(cards);
  }
  return racine;
}
