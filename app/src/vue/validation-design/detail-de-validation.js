// @ts-check
// Le détail d'une carte « Validate its screen » (ticket 3212, après 3185) : un clic sur la carte, ou sur l'une de ses
// captures, l'ouvre en grand par-dessus l'app — en plein écran sur le téléphone. Dans cet ordre : la question ; le brief
// (ticket 3330), ce que le ticket demandait et ce que le cook a changé à l'écran, pour savoir où regarder ; les captures
// avant et après de chaque écran côte à côte, à la plus grande taille que la fenêtre permet ; le lien de la pull request et
// les deux gestes de la carte, « Validate » et le commentaire avec « Send back to the kitchen ».
// Chaque capture se zoome — molette, pincement, ou ses boutons — et se déplace au glisser. L'avant et l'après d'un écran
// partagent leur vue : zoomer l'une zoome l'autre au même endroit. « One over the other » les pose l'une sur l'autre, et
// « Show after » / « Show before » bascule de l'une à l'autre sur place. « Full size » ouvre une capture seule.
// Un seul écran du ticket à la fois (ticket 3350) : « Screen 2 of 4 » dit où l'on est, « Previous screen » / « Next screen » ou
// les flèches du clavier passent à l'autre ; la question, le brief, le pied et leurs gestes restent à leur place.
// Plusieurs cartes attendent : « Next validation » ouvre la suivante sans repasser par TODO.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, les images déjà posées, l'affichage tenu par la
// vue (qu'il change au zoom sans reposer le détail) et ce que chaque geste appelle, et rend un élément.

import { button } from "../composants/button/button.js";
import { poserLesActions, LIEN } from "./validation-design.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../card-todo.ts").CardDeTodo} CardDeTodo */
/** @typedef {import("../../captures.ts").Moment} Moment */
/** @typedef {import("./validation-design.js").State} State */

// La vue partagée par l'avant et l'après d'un écran : `echelle` (1, l'image entière dans son cadre) et le point de l'image
// au centre du cadre (`x`, `y`, en fraction de l'image). Les deux images reçoivent la même : elles montrent le même endroit,
// quelle que soit la taille de leur cadre.
/** @typedef {{ echelle: number, x: number, y: number }} Vue */
// Ce que la vue tient du détail ouvert, d'une pose à l'autre : `superposees`, l'avant et l'après l'un sur l'autre ;
// `rang`, l'écran du ticket montré ; `montre`, par écran, celle que l'on voit alors ; `seule`, la capture ouverte seule ; `vues`, la vue de chaque écran.
/** @typedef {{ superposees: boolean, rang: number, montre: Map<string, Moment>, seule?: { ecran: string, moment: Moment }, vues: Map<string, Vue> }} Display */

export const FERMER = "Close";
export const ZOOMER = "Zoom in";
export const DEZOOMER = "Zoom out";
export const AJUSTER = "Fit";
export const SUPERPOSER = "One over the other";
export const SIDE_A_SIDE = "Side by side";
export const PLEINE_TAILLE = "Full size";
export const RETOUR = "Back to before and after";
/** @param {Moment} moment */
export const SHOW = (moment) => (moment === "avant" ? "Show before" : "Show after");
/** @param {number} ticket */
export const SUIVANTE = (ticket) => `Next validation (#${ticket})`;

/** @param {number} rang @param {number} total */
export const SCREEN_N_SUR = (rang, total) => `Screen ${rang + 1} of ${total}`;
export const SCREEN_PRECEDENT = "Previous screen";
export const SCREEN_SUIVANT = "Next screen";

export const REQUEST = "What was asked";
export const FAIT = "What was done";
export const SANS_REQUEST = "this card does not say what its ticket asked — open its pull request";
export const SANS_RESUME = "No summary of what was done is available: the cook wrote none for this delivery.";

export const ECHELLE_MAX = 8;
/** @type {Vue} */
export const ENTIERE = { echelle: 1, x: 0.5, y: 0.5 };
const PAS = 1.5;

/** @returns {Display} */
export const displayNeuf = () => ({ superposees: false, rang: 0, montre: new Map(), vues: new Map() });

/** @param {number} valeur @param {number} bas @param {number} haut */
const borne = (valeur, bas, haut) => Math.min(haut, Math.max(bas, valeur));

// La vue tenue dans l'image : l'échelle entre 1 et ECHELLE_MAX, le centre là où le cadre ne sort pas de l'image.
/** @param {Vue} vue @returns {Vue} */
export function bornee({ echelle, x, y }) {
  const e = borne(Number.isFinite(echelle) ? echelle : 1, 1, ECHELLE_MAX);
  const demi = 0.5 / e;
  return { echelle: e, x: borne(Number.isFinite(x) ? x : 0.5, demi, 1 - demi), y: borne(Number.isFinite(y) ? y : 0.5, demi, 1 - demi) };
}

// Zoomer de `facteur` autour d'un point du cadre (`px`, `py`, en fraction du cadre) : le point de l'image qui y est y reste.
/** @param {Vue} vue @param {number} facteur @param {number} [px] @param {number} [py] @returns {Vue} */
export function zoomer(vue, facteur, px = 0.5, py = 0.5) {
  const echelle = borne(vue.echelle * facteur, 1, ECHELLE_MAX);
  const u = vue.x + (px - 0.5) / vue.echelle;
  const v = vue.y + (py - 0.5) / vue.echelle;
  return bornee({ echelle, x: u - (px - 0.5) / echelle, y: v - (py - 0.5) / echelle });
}

// Glisser l'image de `dx`, `dy` (en fraction du cadre) : elle suit le doigt.
/** @param {Vue} vue @param {number} dx @param {number} dy @returns {Vue} */
export const deplacer = (vue, dx, dy) => bornee({ echelle: vue.echelle, x: vue.x - dx / vue.echelle, y: vue.y - dy / vue.echelle });

// Ce que l'image reçoit : le point (`x`, `y`) amené au centre, puis l'échelle autour du centre.
/** @param {Vue} vue */
export const transformDe = ({ echelle, x, y }) => `scale(${echelle}) translate(${(0.5 - x) * 100}%, ${(0.5 - y) * 100}%)`;

// Passer à l'écran d'à côté (`pas` : 1 ou -1) : le rang reste dans la liste. Rend vrai si l'écran a changé. L'écran ouvert seul
// ne change pas : « Back to before and after » d'abord.
/** @param {Display} display @param {number} total @param {number} pas */
export function changerD(display, total, pas) {
  if (display.seule !== undefined) return false;
  const rang = borne(display.rang + pas, 0, Math.max(0, total - 1));
  const change = rang !== display.rang;
  display.rang = rang;
  return change;
}

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le détail, dans son état. `images(ecran, moment)` pose l'image d'une capture — ou sa place, tant qu'elle n'est pas lue.
// `suivante` : le numéro de la carte suivante qui attend, s'il y en a une. `lectureSeule` : rien ne la tranche d'ici.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CardDeTodo} card
 * @param {State} state
 * @param {Display} display
 * @param {{ images: (screen: string, moment: Moment) => any, commentaire: string, cle: string, lectureSeule?: boolean, grand?: boolean, suivante?: number }} posees
 * @param {{ fermer: () => void, reposer: () => void, suivante: () => void, valider: () => void, renvoyer: (comment: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void }} actions
 */
export function poserDetailDeValidation(doc, ticket, card, state, display, { images, commentaire: comment, cle, lectureSeule: readOnly = false, grand = false, suivante }, actions) {
  const racine = cree(doc, "div", "detail-de-validation");
  racine.ariaLabel = `the screen #${ticket} asks you to validate, in large`;
  const tete = cree(doc, "header", "tete-du-detail");
  tete.append(cree(doc, "p", "question-carte", card.question ?? ""));
  const enTete = cree(doc, "div", "gestes-du-detail");
  const { validation, captures } = card;
  const screens = captures?.ecrans ?? [];
  display.rang = borne(display.rang, 0, Math.max(0, screens.length - 1));
  if (screens.length > 1 && display.seule === undefined) {
    const place = cree(doc, "span", "rang-de-l-ecran", SCREEN_N_SUR(display.rang, screens.length));
    place.ariaLive = "polite";
    const precedent = button(doc, SCREEN_PRECEDENT, () => void (changerD(display, screens.length, -1) && actions.reposer()));
    precedent.title = "shows the previous screen of the ticket (left arrow)";
    precedent.disabled = display.rang === 0;
    const suivant = button(doc, SCREEN_SUIVANT, () => void (changerD(display, screens.length, 1) && actions.reposer()));
    suivant.title = "shows the next screen of the ticket (right arrow)";
    suivant.disabled = display.rang === screens.length - 1;
    enTete.append(place, precedent, suivant);
  }
  if (screens.length > 0 && display.seule === undefined) {
    const bascule = button(doc, display.superposees ? SIDE_A_SIDE : SUPERPOSER, () => {
      display.superposees = !display.superposees;
      actions.reposer();
    });
    bascule.ariaPressed = String(display.superposees);
    bascule.title = display.superposees ? "shows before and after side by side" : "shows before and after one over the other, to switch between them in place";
    enTete.append(bascule);
  }
  if (suivante !== undefined) {
    const prochaine = button(doc, SUIVANTE(suivante), actions.suivante);
    prochaine.title = `opens the next design validation that waits for you, #${suivante}`;
    enTete.append(prochaine);
  }
  const fermer = button(doc, FERMER, actions.fermer, { sorte: "discret" });
  fermer.className = `${fermer.className} fermer`.trim();
  enTete.append(fermer);
  tete.append(enTete);
  racine.append(tete);
  if (card.brief !== undefined) racine.append(poserBrief(doc, card.brief));

  const zone = cree(doc, "div", "ecrans-du-detail");
  if (captures?.incomplete !== undefined) {
    const line = cree(doc, "p", "captures-manquantes", captures.incomplete.ligne);
    line.title = captures.incomplete.detail;
    zone.append(line);
  }
  const only = display.seule;
  if (only !== undefined) {
    const capture = screens.find(({ ecran: screen }) => screen === only.ecran)?.[only.moment];
    if (capture !== undefined) zone.append(renderScreen(doc, only.ecran, [{ moment: only.moment, legende: capture.legende }], display, images, actions, { seule: true }));
  } else {
    const montre = screens[display.rang];
    if (montre !== undefined) {
      const paire = [montre.avant, montre.apres].map(({ moment, legende }) => ({ moment, legende }));
      zone.append(renderScreen(doc, montre.ecran, paire, display, images, actions, { seule: false }));
    }
  }
  racine.append(zone);

  const pied = cree(doc, "footer", "pied-du-detail");
  if (validation === undefined || "illisible" in validation) {
    pied.append(cree(doc, "p", "validation-illisible", validation?.illisible ?? "this card does not say which pull request it validates"));
  } else {
    const lien = button(doc, LIEN(validation.ticket), actions.ouvrirPr, { sorte: "discret" });
    lien.className = `${lien.className} lien-de-la-pr`.trim();
    lien.title = "opens the pull request on GitHub";
    pied.append(lien);
    if (!readOnly) pied.append(...poserLesActions(doc, validation, state, { commentaire: comment, cle, grand }, actions));
  }
  racine.append(pied);
  return racine;
}

// Le brief, en deux parties titrées : ce que le ticket demandait, coupé à deux lignes (en entier au survol), et ce que le
// cook a changé à l'écran, un point par ligne — ou qu'il n'en a rien dit.
/** @param {Fabrique} doc @param {import("../../card-todo.ts").BriefDeCard} brief */
function poserBrief(doc, { demande: request, fait }) {
  const bloc = cree(doc, "section", "brief-du-detail");
  bloc.ariaLabel = "what the ticket asked and what was done on the screen";
  const demandee = cree(doc, "div", "partie-du-brief");
  const texte = cree(doc, "p", "demande-du-ticket", request === "" ? SANS_REQUEST : request);
  if (request !== "") texte.title = request;
  demandee.append(cree(doc, "h3", undefined, REQUEST), texte);
  const faite = cree(doc, "div", "partie-du-brief");
  faite.append(cree(doc, "h3", undefined, FAIT));
  if (fait === null) faite.append(cree(doc, "p", "sans-resume", SANS_RESUME));
  else {
    const liste = cree(doc, "ul", "fait-a-l-ecran");
    liste.append(...fait.map((point) => cree(doc, "li", undefined, point)));
    faite.append(liste);
  }
  bloc.append(demandee, faite);
  return bloc;
}

// Un écran : ses captures (l'avant et l'après, ou celle ouverte seule), qui partagent la vue de l'écran, et sa barre — zoomer,
// dézoomer, ajuster ; l'une sur l'autre, la bascule ; seule, le retour.
/**
 * @param {Fabrique} doc @param {string} screen @param {{ moment: Moment, legende: string }[]} captures @param {Display} display
 * @param {(screen: string, moment: Moment) => any} images
 * @param {{ reposer: () => void }} gestes
 * @param {{ seule: boolean }} options
 */
function renderScreen(doc, screen, captures, display, images, { reposer }, { seule: only }) {
  const bloc = cree(doc, "section", "ecran-du-detail");
  bloc.ariaLabel = screen === "" ? "the screen" : `the screen ${screen}`;
  /** @type {any[]} */
  const zoomables = [];
  const appliquer = () => {
    const vue = display.vues.get(screen) ?? ENTIERE;
    for (const image of zoomables) image.style.setProperty("transform", transformDe(vue));
  };
  /** @param {Vue} vue */
  const changer = (vue) => {
    display.vues.set(screen, bornee(vue));
    appliquer();
  };
  const vue = () => display.vues.get(screen) ?? ENTIERE;

  const bar = cree(doc, "div", "barre-de-zoom");
  bar.append(
    button(doc, DEZOOMER, () => changer(zoomer(vue(), 1 / PAS)), { sorte: "discret" }),
    button(doc, ZOOMER, () => changer(zoomer(vue(), PAS)), { sorte: "discret" }),
    button(doc, AJUSTER, () => changer(ENTIERE), { sorte: "discret" }),
  );

  const superposees = !only && display.superposees;
  const paire = cree(doc, "div", superposees ? "paire superposees" : only ? "paire seule" : "paire");
  if (superposees) {
    // L'une sur l'autre : un seul cadre, les deux images dedans ; la bascule montre l'autre sur place, sans rien reposer.
    const montree = () => display.montre.get(screen) ?? "avant";
    const figure = cree(doc, "figure", "capture-zoomable");
    const cadre = cadreZoomable(doc, vue, changer);
    const titre = cree(doc, "figcaption");
    const legende = cree(doc, "span", "legende");
    /** @type {Map<Moment, any>} */
    const poses = new Map();
    for (const { moment } of captures) {
      const image = images(screen, moment);
      image.dataset.moment = moment;
      poses.set(moment, image);
      zoomables.push(image);
      cadre.append(image);
    }
    const autre = () => (montree() === "avant" ? "apres" : "avant");
    const bascule = button(doc, SHOW(autre()), () => {
      display.montre.set(screen, autre());
      show();
    });
    const show = () => {
      for (const [moment, image] of poses) image.hidden = moment !== montree();
      legende.textContent = captures.find(({ moment }) => moment === montree())?.legende ?? "";
      bascule.textContent = SHOW(autre());
      bascule.title = `shows ${autre() === "avant" ? "before" : "after"} in place, at the same spot`;
    };
    show();
    titre.append(legende);
    figure.append(cadre, titre);
    bar.append(bascule);
    paire.append(figure);
  } else {
    for (const { moment, legende } of captures) {
      const figure = cree(doc, "figure", "capture-zoomable");
      figure.dataset.moment = moment;
      const cadre = cadreZoomable(doc, vue, changer);
      const image = images(screen, moment);
      zoomables.push(image);
      cadre.append(image);
      const titre = cree(doc, "figcaption");
      titre.append(cree(doc, "span", "legende", legende));
      if (!only) {
        const pleine = button(
          doc,
          PLEINE_TAILLE,
          () => {
            display.seule = { ecran: screen, moment };
            reposer();
          },
          { sorte: "discret" },
        );
        pleine.title = `opens ${legende} alone, at full size`;
        titre.append(pleine);
      }
      figure.append(cadre, titre);
      paire.append(figure);
    }
  }
  if (only) {
    const retour = button(doc, RETOUR, () => {
      delete display.seule;
      reposer();
    });
    bar.append(retour);
  }
  appliquer();
  bloc.append(bar, paire);
  return bloc;
}

// Le cadre d'une capture : la molette zoome autour du pointeur ; un doigt, ou la souris, glisse l'image ; deux doigts la
// pincent. Rien n'est reposé : la vue change, et les images de l'écran la reçoivent.
/** @param {Fabrique} doc @param {() => Vue} vue @param {(vue: Vue) => void} changer */
function cadreZoomable(doc, vue, changer) {
  const cadre = cree(doc, "div", "cadre");
  /** @param {{ clientX: number, clientY: number }} point */
  const dans = ({ clientX, clientY }) => {
    const { left, top, width, height } = cadre.getBoundingClientRect();
    return width > 0 && height > 0 ? { x: (clientX - left) / width, y: (clientY - top) / height } : undefined;
  };
  cadre.addEventListener(
    "wheel",
    /** @param {WheelEvent} event */ (event) => {
      event.preventDefault();
      const point = dans(event);
      if (point === undefined) return;
      changer(zoomer(vue(), Math.exp(-event.deltaY * 0.002), point.x, point.y));
    },
    { passive: false },
  );
  /** @type {Map<number, { x: number, y: number }>} */
  const pointeurs = new Map();
  cadre.addEventListener("pointerdown", /** @param {PointerEvent} event */ (event) => {
    const point = dans(event);
    if (point === undefined) return;
    event.preventDefault();
    cadre.setPointerCapture?.(event.pointerId);
    pointeurs.set(event.pointerId, point);
  });
  cadre.addEventListener("pointermove", /** @param {PointerEvent} event */ (event) => {
    const avant = pointeurs.get(event.pointerId);
    const point = dans(event);
    if (avant === undefined || point === undefined) return;
    const autres = [...pointeurs].filter(([id]) => id !== event.pointerId).map(([, autre]) => autre);
    pointeurs.set(event.pointerId, point);
    const [autre] = autres;
    if (autre === undefined) return changer(deplacer(vue(), point.x - avant.x, point.y - avant.y));
    // Deux doigts : l'écart qui grandit zoome autour de leur milieu, et le milieu qui bouge emmène l'image avec lui.
    const ecart = (/** @type {{ x: number, y: number }} */ a) => Math.hypot(a.x - autre.x, a.y - autre.y);
    if (ecart(avant) === 0) return;
    const milieu = { x: (point.x + autre.x) / 2, y: (point.y + autre.y) / 2 };
    const ancien = { x: (avant.x + autre.x) / 2, y: (avant.y + autre.y) / 2 };
    changer(deplacer(zoomer(vue(), ecart(point) / ecart(avant), ancien.x, ancien.y), milieu.x - ancien.x, milieu.y - ancien.y));
  });
  const lacher = (/** @type {PointerEvent} */ event) => void pointeurs.delete(event.pointerId);
  cadre.addEventListener("pointerup", lacher);
  cadre.addEventListener("pointercancel", lacher);
  // Un double clic zoome là où il tombe ; zoomé, il rend l'image entière.
  cadre.addEventListener("dblclick", /** @param {MouseEvent} event */ (event) => {
    const point = dans(event);
    if (point === undefined) return;
    changer(vue().echelle > 1 ? ENTIERE : zoomer(vue(), PAS * PAS, point.x, point.y));
  });
  return cadre;
}
