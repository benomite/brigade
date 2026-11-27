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

import { button } from "../components/button/button.js";
import { setTheActions, LINK } from "./validation-design.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../card-todo.ts").CardOfTodo} CardOfTodo */
/** @typedef {import("../../captures.ts").Moment} Moment */
/** @typedef {import("./validation-design.js").State} State */

// La vue partagée par l'avant et l'après d'un écran : `echelle` (1, l'image entière dans son cadre) et le point de l'image
// au centre du cadre (`x`, `y`, en fraction de l'image). Les deux images reçoivent la même : elles montrent le même endroit,
// quelle que soit la taille de leur cadre.
/** @typedef {{ echelle: number, x: number, y: number }} Vue */
// Ce que la vue tient du détail ouvert, d'une pose à l'autre : `superposees`, l'avant et l'après l'un sur l'autre ;
// `rang`, l'écran du ticket montré ; `montre`, par écran, celle que l'on voit alors ; `seule`, la capture ouverte seule ; `vues`, la vue de chaque écran.
/** @typedef {{ superposees: boolean, rang: number, montre: Map<string, Moment>, seule?: { ecran: string, moment: Moment }, vues: Map<string, Vue> }} Display */

export const CLOSE = "Close";
export const ZOOM_IN = "Zoom in";
export const ZOOM_OUT = "Zoom out";
export const ADJUST = "Fit";
export const OVERLAY = "One over the other";
export const SIDE_A_SIDE = "Side by side";
export const FULL_SIZE = "Full size";
export const RETURN = "Back to before and after";
/** @param {Moment} moment */
export const SHOW = (moment) => (moment === "avant" ? "Show before" : "Show after");
/** @param {number} ticket */
export const NEXT = (ticket) => `Next validation (#${ticket})`;

/** @param {number} rank @param {number} total */
export const SCREEN_N_ON = (rank, total) => `Screen ${rank + 1} of ${total}`;
export const SCREEN_PREVIOUS = "Previous screen";
export const SCREEN_NEXT = "Next screen";

export const REQUEST = "What was asked";
export const DONE = "What was done";
export const WITHOUT_REQUEST = "this card does not say what its ticket asked — open its pull request";
export const WITHOUT_RESUME = "No summary of what was done is available: the cook wrote none for this delivery.";

export const SCALE_MAX = 8;
/** @type {Vue} */
export const WHOLE = { echelle: 1, x: 0.5, y: 0.5 };
const NOT = 1.5;

/** @returns {Display} */
export const displayNew = () => ({ superposees: false, rang: 0, montre: new Map(), vues: new Map() });

/** @param {number} value @param {number} bottom @param {number} top */
const bound = (value, bottom, top) => Math.min(top, Math.max(bottom, value));

// La vue tenue dans l'image : l'échelle entre 1 et ECHELLE_MAX, le centre là où le cadre ne sort pas de l'image.
/** @param {Vue} vue @returns {Vue} */
export function bounded({ echelle: scale, x, y }) {
  const e = bound(Number.isFinite(scale) ? scale : 1, 1, SCALE_MAX);
  const half = 0.5 / e;
  return { echelle: e, x: bound(Number.isFinite(x) ? x : 0.5, half, 1 - half), y: bound(Number.isFinite(y) ? y : 0.5, half, 1 - half) };
}

// Zoomer de `facteur` autour d'un point du cadre (`px`, `py`, en fraction du cadre) : le point de l'image qui y est y reste.
/** @param {Vue} vue @param {number} facteur @param {number} [px] @param {number} [py] @returns {Vue} */
export function zoomIn(vue, facteur, px = 0.5, py = 0.5) {
  const scale = bound(vue.echelle * facteur, 1, SCALE_MAX);
  const u = vue.x + (px - 0.5) / vue.echelle;
  const v = vue.y + (py - 0.5) / vue.echelle;
  return bounded({ echelle: scale, x: u - (px - 0.5) / scale, y: v - (py - 0.5) / scale });
}

// Glisser l'image de `dx`, `dy` (en fraction du cadre) : elle suit le doigt.
/** @param {Vue} vue @param {number} dx @param {number} dy @returns {Vue} */
export const displace = (vue, dx, dy) => bounded({ echelle: vue.echelle, x: vue.x - dx / vue.echelle, y: vue.y - dy / vue.echelle });

// Ce que l'image reçoit : le point (`x`, `y`) amené au centre, puis l'échelle autour du centre.
/** @param {Vue} vue */
export const transformOf = ({ echelle: scale, x, y }) => `scale(${scale}) translate(${(0.5 - x) * 100}%, ${(0.5 - y) * 100}%)`;

// Passer à l'écran d'à côté (`pas` : 1 ou -1) : le rang reste dans la liste. Rend vrai si l'écran a changé. L'écran ouvert seul
// ne change pas : « Back to before and after » d'abord.
/** @param {Display} display @param {number} total @param {number} not */
export function changeOf(display, total, not) {
  if (display.seule !== undefined) return false;
  const rank = bound(display.rang + not, 0, Math.max(0, total - 1));
  const change = rank !== display.rang;
  display.rang = rank;
  return change;
}

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [text] */
function created(doc, balise, classe, text) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Le détail, dans son état. `images(ecran, moment)` pose l'image d'une capture — ou sa place, tant qu'elle n'est pas lue.
// `suivante` : le numéro de la carte suivante qui attend, s'il y en a une. `lectureSeule` : rien ne la tranche d'ici.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CardOfTodo} card
 * @param {State} state
 * @param {Display} display
 * @param {{ images: (screen: string, moment: Moment) => any, commentaire: string, cle: string, lectureSeule?: boolean, grand?: boolean, suivante?: number }} posees
 * @param {{ fermer: () => void, reposer: () => void, suivante: () => void, valider: () => void, renvoyer: (comment: string) => void, ecrire: (text: string) => void, ouvrirPr: () => void }} actions
 */
export function setDetailOfValidation(doc, ticket, card, state, display, { images, commentaire: comment, cle: key, lectureSeule: readOnly = false, grand = false, suivante: next }, actions) {
  const root = created(doc, "div", "detail-de-validation");
  root.ariaLabel = `the screen #${ticket} asks you to validate, in large`;
  const head = created(doc, "header", "tete-du-detail");
  head.append(created(doc, "p", "question-carte", card.question ?? ""));
  const enHead = created(doc, "div", "gestes-du-detail");
  const { validation, captures } = card;
  const screens = captures?.ecrans ?? [];
  display.rang = bound(display.rang, 0, Math.max(0, screens.length - 1));
  if (screens.length > 1 && display.seule === undefined) {
    const place = created(doc, "span", "rang-de-l-ecran", SCREEN_N_ON(display.rang, screens.length));
    place.ariaLive = "polite";
    const previous = button(doc, SCREEN_PREVIOUS, () => void (changeOf(display, screens.length, -1) && actions.reposer()));
    previous.title = "shows the previous screen of the ticket (left arrow)";
    previous.disabled = display.rang === 0;
    const following = button(doc, SCREEN_NEXT, () => void (changeOf(display, screens.length, 1) && actions.reposer()));
    following.title = "shows the next screen of the ticket (right arrow)";
    following.disabled = display.rang === screens.length - 1;
    enHead.append(place, previous, following);
  }
  if (screens.length > 0 && display.seule === undefined) {
    const toggle = button(doc, display.superposees ? SIDE_A_SIDE : OVERLAY, () => {
      display.superposees = !display.superposees;
      actions.reposer();
    });
    toggle.ariaPressed = String(display.superposees);
    toggle.title = display.superposees ? "shows before and after side by side" : "shows before and after one over the other, to switch between them in place";
    enHead.append(toggle);
  }
  if (next !== undefined) {
    const nextOne = button(doc, NEXT(next), actions.suivante);
    nextOne.title = `opens the next design validation that waits for you, #${next}`;
    enHead.append(nextOne);
  }
  const close = button(doc, CLOSE, actions.fermer, { sorte: "discret" });
  close.className = `${close.className} fermer`.trim();
  enHead.append(close);
  head.append(enHead);
  root.append(head);
  if (card.brief !== undefined) root.append(setBrief(doc, card.brief));

  const zone = created(doc, "div", "ecrans-du-detail");
  if (captures?.incomplete !== undefined) {
    const line = created(doc, "p", "captures-manquantes", captures.incomplete.ligne);
    line.title = captures.incomplete.detail;
    zone.append(line);
  }
  const only = display.seule;
  if (only !== undefined) {
    const capture = screens.find(({ ecran: screen }) => screen === only.ecran)?.[only.moment];
    if (capture !== undefined) zone.append(renderScreen(doc, only.ecran, [{ moment: only.moment, legende: capture.legende }], display, images, actions, { seule: true }));
  } else {
    const shows = screens[display.rang];
    if (shows !== undefined) {
      const pair = [shows.avant, shows.apres].map(({ moment, legende: legend }) => ({ moment, legende: legend }));
      zone.append(renderScreen(doc, shows.ecran, pair, display, images, actions, { seule: false }));
    }
  }
  root.append(zone);

  const foot = created(doc, "footer", "pied-du-detail");
  if (validation === undefined || "illisible" in validation) {
    foot.append(created(doc, "p", "validation-illisible", validation?.illisible ?? "this card does not say which pull request it validates"));
  } else {
    const link = button(doc, LINK(validation.ticket), actions.ouvrirPr, { sorte: "discret" });
    link.className = `${link.className} lien-de-la-pr`.trim();
    link.title = "opens the pull request on GitHub";
    foot.append(link);
    if (!readOnly) foot.append(...setTheActions(doc, validation, state, { commentaire: comment, cle: key, grand }, actions));
  }
  root.append(foot);
  return root;
}

// Le brief, en deux parties titrées : ce que le ticket demandait, coupé à deux lignes (en entier au survol), et ce que le
// cook a changé à l'écran, un point par ligne — ou qu'il n'en a rien dit.
/** @param {Fabrique} doc @param {import("../../card-todo.ts").BriefOfCard} brief */
function setBrief(doc, { demande: request, fait: done }) {
  const block = created(doc, "section", "brief-du-detail");
  block.ariaLabel = "what the ticket asked and what was done on the screen";
  const requested = created(doc, "div", "partie-du-brief");
  const text = created(doc, "p", "demande-du-ticket", request === "" ? WITHOUT_REQUEST : request);
  if (request !== "") text.title = request;
  requested.append(created(doc, "h3", undefined, REQUEST), text);
  const doneOne = created(doc, "div", "partie-du-brief");
  doneOne.append(created(doc, "h3", undefined, DONE));
  if (done === null) doneOne.append(created(doc, "p", "sans-resume", WITHOUT_RESUME));
  else {
    const list = created(doc, "ul", "fait-a-l-ecran");
    list.append(...done.map((point) => created(doc, "li", undefined, point)));
    doneOne.append(list);
  }
  block.append(requested, doneOne);
  return block;
}

// Un écran : ses captures (l'avant et l'après, ou celle ouverte seule), qui partagent la vue de l'écran, et sa barre — zoomer,
// dézoomer, ajuster ; l'une sur l'autre, la bascule ; seule, le retour.
/**
 * @param {Fabrique} doc @param {string} screen @param {{ moment: Moment, legende: string }[]} captures @param {Display} display
 * @param {(screen: string, moment: Moment) => any} images
 * @param {{ reposer: () => void }} gestes
 * @param {{ seule: boolean }} options
 */
function renderScreen(doc, screen, captures, display, images, { reposer: rest }, { seule: only }) {
  const block = created(doc, "section", "ecran-du-detail");
  block.ariaLabel = screen === "" ? "the screen" : `the screen ${screen}`;
  /** @type {any[]} */
  const zoomables = [];
  const apply = () => {
    const vue = display.vues.get(screen) ?? WHOLE;
    for (const image of zoomables) image.style.setProperty("transform", transformOf(vue));
  };
  /** @param {Vue} vue */
  const change = (vue) => {
    display.vues.set(screen, bounded(vue));
    apply();
  };
  const vue = () => display.vues.get(screen) ?? WHOLE;

  const bar = created(doc, "div", "barre-de-zoom");
  bar.append(
    button(doc, ZOOM_OUT, () => change(zoomIn(vue(), 1 / NOT)), { sorte: "discret" }),
    button(doc, ZOOM_IN, () => change(zoomIn(vue(), NOT)), { sorte: "discret" }),
    button(doc, ADJUST, () => change(WHOLE), { sorte: "discret" }),
  );

  const overlaid = !only && display.superposees;
  const pair = created(doc, "div", overlaid ? "paire superposees" : only ? "paire seule" : "paire");
  if (overlaid) {
    // L'une sur l'autre : un seul cadre, les deux images dedans ; la bascule montre l'autre sur place, sans rien reposer.
    const shownOne = () => display.montre.get(screen) ?? "avant";
    const figure = created(doc, "figure", "capture-zoomable");
    const frame = frameZoomable(doc, vue, change);
    const title = created(doc, "figcaption");
    const legend = created(doc, "span", "legende");
    /** @type {Map<Moment, any>} */
    const poses = new Map();
    for (const { moment } of captures) {
      const image = images(screen, moment);
      image.dataset.moment = moment;
      poses.set(moment, image);
      zoomables.push(image);
      frame.append(image);
    }
    const other = () => (shownOne() === "avant" ? "apres" : "avant");
    const toggle = button(doc, SHOW(other()), () => {
      display.montre.set(screen, other());
      show();
    });
    const show = () => {
      for (const [moment, image] of poses) image.hidden = moment !== shownOne();
      legend.textContent = captures.find(({ moment }) => moment === shownOne())?.legende ?? "";
      toggle.textContent = SHOW(other());
      toggle.title = `shows ${other() === "avant" ? "before" : "after"} in place, at the same spot`;
    };
    show();
    title.append(legend);
    figure.append(frame, title);
    bar.append(toggle);
    pair.append(figure);
  } else {
    for (const { moment, legende: legend } of captures) {
      const figure = created(doc, "figure", "capture-zoomable");
      figure.dataset.moment = moment;
      const frame = frameZoomable(doc, vue, change);
      const image = images(screen, moment);
      zoomables.push(image);
      frame.append(image);
      const title = created(doc, "figcaption");
      title.append(created(doc, "span", "legende", legend));
      if (!only) {
        const full = button(
          doc,
          FULL_SIZE,
          () => {
            display.seule = { ecran: screen, moment };
            rest();
          },
          { sorte: "discret" },
        );
        full.title = `opens ${legend} alone, at full size`;
        title.append(full);
      }
      figure.append(frame, title);
      pair.append(figure);
    }
  }
  if (only) {
    const back = button(doc, RETURN, () => {
      delete display.seule;
      rest();
    });
    bar.append(back);
  }
  apply();
  block.append(bar, pair);
  return block;
}

// Le cadre d'une capture : la molette zoome autour du pointeur ; un doigt, ou la souris, glisse l'image ; deux doigts la
// pincent. Rien n'est reposé : la vue change, et les images de l'écran la reçoivent.
/** @param {Fabrique} doc @param {() => Vue} vue @param {(vue: Vue) => void} change */
function frameZoomable(doc, vue, change) {
  const frame = created(doc, "div", "cadre");
  /** @param {{ clientX: number, clientY: number }} point */
  const inside = ({ clientX, clientY }) => {
    const { left, top, width, height } = frame.getBoundingClientRect();
    return width > 0 && height > 0 ? { x: (clientX - left) / width, y: (clientY - top) / height } : undefined;
  };
  frame.addEventListener(
    "wheel",
    /** @param {WheelEvent} event */ (event) => {
      event.preventDefault();
      const point = inside(event);
      if (point === undefined) return;
      change(zoomIn(vue(), Math.exp(-event.deltaY * 0.002), point.x, point.y));
    },
    { passive: false },
  );
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  frame.addEventListener("pointerdown", /** @param {PointerEvent} event */ (event) => {
    const point = inside(event);
    if (point === undefined) return;
    event.preventDefault();
    frame.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, point);
  });
  frame.addEventListener("pointermove", /** @param {PointerEvent} event */ (event) => {
    const before = pointers.get(event.pointerId);
    const point = inside(event);
    if (before === undefined || point === undefined) return;
    const others = [...pointers].filter(([id]) => id !== event.pointerId).map(([, other]) => other);
    pointers.set(event.pointerId, point);
    const [other] = others;
    if (other === undefined) return change(displace(vue(), point.x - before.x, point.y - before.y));
    // Deux doigts : l'écart qui grandit zoome autour de leur milieu, et le milieu qui bouge emmène l'image avec lui.
    const gap = (/** @type {{ x: number, y: number }} */ a) => Math.hypot(a.x - other.x, a.y - other.y);
    if (gap(before) === 0) return;
    const middle = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 };
    const old = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
    change(displace(zoomIn(vue(), gap(point) / gap(before), old.x, old.y), middle.x - old.x, middle.y - old.y));
  });
  const release = (/** @type {PointerEvent} */ event) => void pointers.delete(event.pointerId);
  frame.addEventListener("pointerup", release);
  frame.addEventListener("pointercancel", release);
  // Un double clic zoome là où il tombe ; zoomé, il rend l'image entière.
  frame.addEventListener("dblclick", /** @param {MouseEvent} event */ (event) => {
    const point = inside(event);
    if (point === undefined) return;
    change(vue().echelle > 1 ? WHOLE : zoomIn(vue(), NOT * NOT, point.x, point.y));
  });
  return frame;
}
