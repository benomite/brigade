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
// Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (bricks.js), ce qu'elle a lu et les gestes.

import { buttonAction, folded, hover } from "../bricks.js";
import { confirmationOfAction } from "../components/confirmation/confirmation.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { brand } from "../components/pill/pill.js";
import { CANCEL, THIS_COMPUTER, RECORDING, READ_OF, YES } from "../lexicon.js";
import { setTheQuota } from "../stations-quota/stations-quota.js";
import { setTheChoice } from "./choice.js";
import { BLOCKED, CHOOSE, COOK_HERE, sentenceOfTop, TO_HERE } from "./state.js";
import { linesOfEngine } from "../engine/CardEngine.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("./state.js").Top} Top */
/** @typedef {import("./state.js").Serving} Serving */
/** @typedef {import("./state.js").Kind} Kind */
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
 *   `moteurIci`   le moteur que la station de cet ordinateur a choisi dans ses réglages (moteur/, ticket 3746) : sa carte le
 *                 dit quand le runtime n'en publie rien.
 *                 ouvert, il remplace les gestes de la ligne du haut. Absent, le bouton est offert, son panneau fermé.
 *   `quiCuit`     « Choose who cooks it » est offert : l'app connaît le dépôt du projet, et peut y écrire (ticket 3163) ; et,
 *                 quand une station le sert déjà, « Add a station » (ticket 3402).
 * @typedef {{
 *   projet: string,
 *   poste: string,
 *   lues: boolean,
 *   haut: Top,
 *   ramener?: string,
 *   versIci?: boolean,
 *   cuireIci?: boolean,
 *   servantes: readonly Serving[],
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
 *   moteurIci?: string,
 * }} SeenOfTheTab
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
 *   basculer(id: string, opened: boolean): void,
 * }} ActionsOfTheTab
 */

export const READING = READ_OF("your stations on GitHub");
export const DISPLACE = "Move to another station";
export const STOP = "Stop cooking here";
export const DETAILS = "Details";
export const DETAILS_RESUME = "folders, sandbox, Claude connection, cooks at once, ordinary tickets";
export const AT_REST = "idle";
// Ce qu'est chaque station, en clair.
/** @type {(workstation: string) => Record<Kind, string>} */
export const WHAT_IT_IS = (workstation) => ({
  ici: `${workstation}: cooks while the app is open`,
  box: "always-on box: cooks while your computer sleeps",
  ordinateur: "another computer: cooks while Brigade is open on it",
});
// Son état, au mot de sa pilule.
export const IN_LINE = "online";
export const STARTS = "starting";
// Le choix ouvert, son titre.
/** @param {string} project */
export const WHO_COOKED = (project) => `Who cooks ${project}?`;
// Ajouter une station quand une autre le cuit déjà : le même choix, son titre (ticket 3402).
export const ADD = "Add a station";
/** @param {string} project */
export const WHO_OF_OTHER = (project) => `Which station also cooks ${project}?`;
// Le choix ouvert sans aucune station à proposer : chacune le sert déjà, ou aucune n'est connue.
export const NO_CHOICE = "No other station can take it: each of yours already cooks it.";
/** @param {string} project @param {string} of */
export const OR_DISPLACE = (project, of) => `Move ${project}'s kitchen from ${of} to:`;
// Ce que coûte un déménagement, dit sous son choix (le prix de la confirmation d'un geste qui coûte).
export const PRICE_OF_DISPLACEMENT = "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.";
// « Stop cooking here » : ce qu'il fait, en une ligne.
/** @param {string} project @param {string} station */
export const STOP_LABEL = (project, station) => `Stop cooking ${project} on ${station}?`;
/** @param {string} project @param {string} station */
export const PRICE_OF_THE_STOP = (project, station) => `${station} takes no more of ${project}'s tickets; its cooks in flight finish.`;
export const YES_STOP = YES("stop cooking here");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Le ton de la ligne du haut : vert quand une station le cuit ou attend son prochain ticket, et seulement alors.
/** @param {Top} top */
export const yourOfTop = (top) => (top.vert ? "vert" : top.etat === "deplacement" || top.etat === "redemarre" ? "jaune" : top.etat === "hors-ligne" ? "rouge" : "gris");

// La ligne du haut : sa pastille, sa phrase, et ses gestes.
/** @param {Fabrique} doc @param {SeenOfTheTab} seenOne @param {ActionsOfTheTab} actions */
function lineOfTop(doc, seenOne, actions) {
  const { haut: top } = seenOne;
  const line = created(doc, "div");
  line.className = "haut-des-stations";
  line.dataset.etat = top.etat;
  line.dataset.ton = yourOfTop(top);
  line.ariaLive = "polite";
  const sentence = created(doc, "p");
  sentence.className = "phrase";
  sentence.append(brand(doc, yourOfTop(top)), created(doc, "strong", sentenceOfTop(top)));
  if ((top.etat === "hors-ligne" || top.etat === "eteint") && seenOne.ramener !== undefined && seenOne.ramener !== "") sentence.append(hover(doc, seenOne.ramener));
  line.append(sentence);
  if (top.etat === "deplacement" && top.bloque !== null) {
    const blocked = created(doc, "p", BLOCKED(top.bloque));
    blocked.className = "bloque";
    line.append(blocked);
  }
  // Les gestes : le cuire ici d'un clic, ou choisir qui le cuit ; ou, rien ne cuisant, le déménager ici d'un clic — vers une
  // autre station, c'est le geste de sa carte. Un choix ouvert les remplace, comme le panneau de « Add a server ».
  if (seenOne.choix !== undefined || seenOne.lecture === true) return line;
  const here = top.etat === "personne" && seenOne.cuireIci === true;
  const buttons = [
    ...(here ? [buttonAction(doc, COOK_HERE, actions.cuireIci, { recommande: true })] : []),
    ...((top.etat === "personne" || (top.etat === "eteint" && !top.servi)) && seenOne.quiCuit === true ? [buttonAction(doc, CHOOSE, actions.choisirQuiCuit, { recommande: !here })] : []),
    ...(top.etat === "hors-ligne" && seenOne.versIci === true ? [buttonAction(doc, TO_HERE, actions.versIci, { recommande: true })] : []),
    ...((top.etat === "cuit" || top.etat === "hors-ligne" || (top.etat === "eteint" && top.servi)) && seenOne.quiCuit === true ? [buttonAction(doc, ADD, actions.choisirQuiCuit)] : []),
  ];
  if (buttons.length > 0) {
    const foot = created(doc, "p");
    foot.className = "gestes";
    foot.append(...buttons);
    line.append(foot);
  }
  return line;
}

// « Move to another station » : offert, il ouvre le choix ; sinon il attend, et dit pourquoi au survol.
/** @param {Fabrique} doc @param {SeenOfTheTab} vu @param {ActionsOfTheTab} actions */
function buttonOfDisplacement(doc, { deplacable: movable }, actions) {
  const action = buttonAction(doc, DISPLACE, actions.deplacer);
  const button = action.children?.[0];
  if (button !== undefined && !movable.offert) {
    button.disabled = true;
    button.title = movable.pourquoi;
  }
  return action;
}

// Le choix ouvert : son titre, la liste (choice.js), et « Cancel » — un déménagement dit aussi son prix.
/** @param {Fabrique} doc @param {NonNullable<SeenOfTheTab["choix"]>} choice @param {ActionsOfTheTab} actions */
function theChoice(doc, choice, actions) {
  const root = created(doc, "section");
  root.className = "choix-des-stations";
  root.ariaLabel = choice.titre;
  const expected = created(doc, "p", choice.titre);
  expected.className = "attendu";
  root.append(expected);
  const state = { choix: choice.choix, ...(choice.enCours === undefined ? {} : { enCours: choice.enCours }), ...(choice.refus === undefined ? {} : { refus: choice.refus }) };
  root.append(...setTheChoice(doc, state, actions.choisir));
  if (choice.choix.length === 0) root.append(lineEmpty(doc, NO_CHOICE, { classe: "aucun-choix" }));
  if (choice.deplacement) {
    const price = created(doc, "p", PRICE_OF_DISPLACEMENT);
    price.className = "prix";
    root.append(price);
  }
  const foot = created(doc, "p");
  foot.className = "gestes";
  const cancel = buttonAction(doc, CANCEL, actions.annuler);
  const button = cancel.children?.[0];
  if (button !== undefined) button.disabled = choice.enCours !== undefined;
  foot.append(cancel);
  root.append(foot);
  return root;
}

// L'état d'une station, à l'instant : sa pilule, son ton — vert seulement en ligne.
/** @param {Serving} station */
export const stateSays = ({ etat: state, dit: said }) =>
  state === "en-ligne" ? { mot: IN_LINE, ton: "vert" } : state === "demarre" ? { mot: STARTS, ton: "jaune" } : state === "redemarre" ? { mot: said, ton: "jaune" } : { mot: said, ton: state === "illisible" ? "gris" : "rouge" };

// La clé d'une station de l'onglet : son gist, sinon son nom — une station que le projet nomme sans que l'app la connaisse.
// Ses gestes et son « Details » la retrouvent par elle.
/** @param {Pick<Serving, "id" | "nom">} station */
export const keyOf = ({ id, nom: name }) => (id === "" ? name : id);

// Une carte : la station qui sert le projet.
/** @param {Fabrique} doc @param {SeenOfTheTab} seenOne @param {Serving} station @param {ActionsOfTheTab} actions */
function card(doc, seenOne, station, actions) {
  const root = created(doc, "section");
  root.className = "carte-de-station";
  const key = keyOf(station);
  root.dataset.station = key;
  root.dataset.etat = station.etat;
  root.ariaLabel = station.nom;
  // Son nom — « this computer » pour celle de cet ordinateur, son nom d'hôte après —, ce qu'elle est, et son état.
  const head = created(doc, "header");
  const name = created(doc, "h4");
  const called = created(doc, "strong", station.ici ? THIS_COMPUTER : station.nom);
  if (!station.ici) called.className = "mono";
  name.append(called);
  if (station.ici) {
    const host = created(doc, "span", station.nom);
    host.className = "hote mono";
    name.append(host);
  }
  const { mot: word, ton: your } = stateSays(station);
  const state = created(doc, "span");
  state.className = "pilule etat";
  state.dataset.ton = your;
  state.append(brand(doc, your), created(doc, "strong", word));
  // Ce qui la retient encore — sa machine pleine, la limite de GitHub, son refus — se dit à côté.
  if (station.note !== undefined && station.note !== "") {
    const note = created(doc, "small", station.note);
    note.className = "note";
    state.append(note);
  }
  head.append(name, state);
  const whatItIs = created(doc, "p", WHAT_IT_IS(seenOne.poste)[station.sorte]);
  whatItIs.className = "ce-qu-elle-est";
  root.append(head, whatItIs);
  // Son moteur, et quand ses cooks cuisent sur le secours, sur lequel et jusqu'à quand (moteur/, ticket 3746).
  root.append(...linesOfEngine(doc, { ...(station.moteur === undefined ? {} : { statut: station.moteur }), ...(station.ici && seenOne.moteurIci !== undefined ? { choisi: seenOne.moteurIci } : {}) }));
  // Ce qu'elle n'a pas pu cuire — les dépendances qui ne s'installent pas — se dit en une ligne : le chef sait quoi réparer ou décocher.
  if (station.lacks !== undefined) {
    const lack = created(doc, "p", `Could not run a ticket: ${station.lacks}`);
    lack.className = "manque";
    root.append(lack);
  }
  root.append(lineEmpty(doc, AT_REST, { classe: "au-repos" }));
  // Ses gestes, ou la confirmation de son arrêt — puis, confirmé, qu'il s'écrit. La station où la cuisine déménage n'en a
  // pas tant qu'elle démarre : la ligne du haut suit le déménagement.
  if (seenOne.arret?.id === key && seenOne.arret.enCours) {
    const inProgress = created(doc, "p", RECORDING);
    inProgress.className = "dit";
    root.append(inProgress);
  } else if (seenOne.arret?.id === key) {
    root.append(
      confirmationOfAction(
        doc,
        { titre: STOP_LABEL(seenOne.projet, station.nom), phrase: PRICE_OF_THE_STOP(seenOne.projet, station.nom), oui: YES_STOP, non: CANCEL },
        { oui: () => actions.confirmerArret(key), non: actions.renoncerArret },
      ),
    );
  } else if (seenOne.choix === undefined && seenOne.lecture !== true && station.etat !== "demarre") {
    const foot = created(doc, "p");
    foot.className = "gestes";
    foot.append(buttonOfDisplacement(doc, seenOne, actions), buttonAction(doc, STOP, () => actions.arreter(key), { sorte: "discret" }));
    root.append(foot);
  }
  // « Details », replié tant que le chef ne l'ouvre pas : ses réglages et ses lectures, chacun avec son contrôle.
  const lines = seenOne.details.get(key) ?? [];
  if (lines.length > 0) {
    const content = created(doc, "div");
    content.className = "details-de-station";
    content.append(...lines);
    root.append(folded(doc, { titre: DETAILS, resume: DETAILS_RESUME, ouvert: seenOne.ouverts.has(key), basculer: (opened) => actions.basculer(key, opened) }, [content]));
  }
  return root;
}

/** @param {Fabrique} doc @param {SeenOfTheTab} seenOne @param {ActionsOfTheTab} actions */
export function setTheTabOfStations(doc, seenOne, actions) {
  const root = created(doc, "section");
  root.className = "onglet-des-stations";
  root.dataset.bloc = "stations-tab";
  root.ariaLabel = "Stations";
  if (!seenOne.lues) {
    root.append(lineEmpty(doc, READING, { classe: "lecture" }));
    return root;
  }
  root.append(lineOfTop(doc, seenOne, actions));
  if (seenOne.quota !== undefined) root.append(setTheQuota(doc, seenOne.quota));
  if (seenOne.dit !== undefined && seenOne.dit.texte !== "") {
    const said = created(doc, "p", seenOne.dit.texte);
    said.className = "dit-des-stations";
    root.append(seenOne.dit.refus ? lineError(doc, seenOne.dit.texte, seenOne.dit.detail ?? "", { classe: "dit-des-stations" }) : said);
  }
  if (seenOne.choix !== undefined) root.append(theChoice(doc, seenOne.choix, actions));
  if (seenOne.servantes.length > 0) {
    const cards = created(doc, "div");
    cards.className = "cartes-des-stations";
    cards.append(...seenOne.servantes.map((station) => card(doc, seenOne, station, actions)));
    root.append(cards);
  }
  return root;
}
