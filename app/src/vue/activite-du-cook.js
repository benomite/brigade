// @ts-check
// Ce que fait le cook d'un ticket, sur sa fiche (ticket 1846) : à la place de son terminal, que l'app ne suit pas, ce
// que sa station publie sur le tableau de la cuisine (`activites`, runtime/src/tableau/activites/activites.ts) et que le
// process principal lit sur GitHub, (tableau/lecture.ts). Tant qu'il tourne : sa pilule `cooking`, sa
// station, depuis quand, ses tours et ses tokens ; ce qu'il fait en ce moment ; ses derniers gestes. Fini : comment il a
// fini et quand, et sa PR, qu'un bouton ouvre. La fiche se repose à chaque lecture du tableau : ce qu'elle montre suit le
// cook. Ce qu'elle montre est daté par la lecture de la box — ses durées se comptent jusqu'à elle, comme `status`.
// Un ticket sans cook publié n'a pas de section ; une box qui ne publie pas encore l'activité de ses cooks se dit en une
// ligne, pourquoi au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { lectureIndisponible, survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../runtime/src/tableau/rendu/bloc.ts").ActiviteDuCook} Activite */
/** @typedef {import("../../../runtime/src/tableau/rendu/bloc.ts").EtapeDuCook} Etape */
/**
 * Ce que le process principal envoie d'un projet, à chaque lecture de son tableau : l'heure de la lecture de l'état par
 * la box et l'activité de ses cooks — ou pourquoi elle ne se lit pas.
 * @typedef {{ projet: string, lu: string, activites: readonly Activite[] } | { projet: string, sans: string }} Publiees
 */

export const TITRE = "its cook";
export const EN_COURS = "cooking";
export const SANS_PR = "it opened no PR";
export const INDISPONIBLE = "its cook's activity unavailable";
// D'où vient ce que la section dit, au survol de sa dernière ligne.
export const SOURCE = "What the cook's station publishes on the project's Kitchen board, read on GitHub with this computer's GitHub account — nothing else. It is read again with the board, every 30 seconds, and this sheet follows it.";

// Comment un cook a fini (`fin`, runtime/src/tableau/rendu/bloc.ts), en mots, et la couleur de sa pilule. Un mot qui n'y
// est pas se dit tel quel, pilule grise.
/** @type {Readonly<Record<string, { mot: string, ton: string }>>} */
export const FINS = {
  ok: { mot: "finished", ton: "vert" },
  neutral: { mot: "finished, nothing to deliver", ton: "gris" },
  failed: { mot: "failed", ton: "rouge" },
  guard: { mot: "stopped by a guardrail", ton: "rouge" },
  refused: { mot: "refused", ton: "rouge" },
  stop: { mot: "stopped", ton: "jaune" },
  interrupted: { mot: "interrupted", ton: "jaune" },
};

/** @param {string} fin */
export const finDite = (fin) => FINS[fin] ?? { mot: fin, ton: "gris" };

// Une durée, comme `status` la dit (tableau/rail.ts, `dureeEn`).
/** @param {number} ms */
export function duree(ms) {
  const secondes = Math.max(0, Math.round(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(heures / 24)} d`;
}

// Une heure de la box, en UTC, comme l'histoire de la fiche les dit (histoire.ts, `instant`), sans le jour.
/** @param {string} iso */
export const heureUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toISOString().slice(11, 16)} UTC`);

/** @param {Etape} etape */
export const geste = ({ faitEn, cible }) => (cible === null ? faitEn : `${faitEn} ${cible}`);

// Le cook du ticket que la lecture publie : rien quand elle ne le nomme pas.
/** @param {Publiees | undefined} publiees @param {number} ticket @returns {Activite | undefined} */
export function cookDuTicket(publiees, ticket) {
  return publiees === undefined || "sans" in publiees ? undefined : publiees.activites.find((activite) => activite.ticket === ticket);
}

// La ligne de tête : sa station, depuis quand ou quand il a fini, ses tours et ses tokens — ce que la box a dit seulement.
/** @param {Activite} cook @param {string} lu */
export function teteDuCook(cook, lu) {
  const fini = cook.finiLe !== null;
  const temps = fini ? `at ${heureUtc(/** @type {string} */ (cook.finiLe))}, after ${duree(Date.parse(/** @type {string} */ (cook.finiLe)) - Date.parse(cook.lanceLe))}` : `for ${duree(Date.parse(lu) - Date.parse(cook.lanceLe))}`;
  return [
    temps,
    ...(cook.station === null ? [] : [`on ${cook.station}`]),
    ...(cook.tours === null ? [] : [`${cook.tours} turn${cook.tours === 1 ? "" : "s"}`]),
    ...(cook.tokens === null ? [] : [`${cook.tokens.toLocaleString("en-US")} tokens`]),
  ].join(" · ");
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La section de la fiche : rien pour un ticket que la lecture ne nomme pas, ni avant la première lecture.
// `pastille` : celle de la vue (le mot et son ton). `ouvrirPr` : ouvre la PR du cook — son adresse reste au process principal.
/**
 * @param {Fabrique} doc
 * @param {{ publiees: Publiees | undefined, ticket: number, pastille: (mot: string, ton: string | undefined) => any, ouvrirPr: () => void }} options
 */
export function poserLActiviteDuCook(doc, { publiees, ticket, pastille, ouvrirPr }) {
  if (publiees === undefined) return null;
  const section = cree(doc, "section");
  section.className = "activite-du-cook";
  section.ariaLabel = `what #${ticket}'s cook is doing`;
  if ("sans" in publiees) {
    section.append(cree(doc, "h4", TITRE), lectureIndisponible(doc, INDISPONIBLE, publiees.sans));
    return section;
  }
  const cook = cookDuTicket(publiees, ticket);
  if (cook === undefined) return null;
  const fini = cook.finiLe !== null;
  const { mot, ton } = fini ? finDite(cook.fin ?? "") : { mot: EN_COURS, ton: "vert" };
  const pilule = cree(doc, "span");
  pilule.className = "pilule";
  pilule.dataset.ton = ton;
  pilule.append(pastille(mot, ton), cree(doc, "strong", mot));
  const etat = cree(doc, "p");
  etat.className = "etat";
  etat.append(pilule, cree(doc, "small", teteDuCook(cook, publiees.lu)));
  section.append(cree(doc, "h4", TITRE), etat);
  // Ce qu'il fait en ce moment, tant qu'il tourne : son geste, et depuis quand.
  if (!fini) {
    const maintenant = cree(doc, "p");
    maintenant.className = "maintenant";
    if (cook.maintenant === null) {
      const tu = cree(doc, "span", "its station does not say what it is doing");
      tu.className = "sans";
      maintenant.append(cree(doc, "span", "now"), tu);
    } else maintenant.append(cree(doc, "span", "now"), cree(doc, "strong", geste(cook.maintenant)), cree(doc, "small", `for ${duree(Date.parse(publiees.lu) - Date.parse(cook.maintenant.depuis))}`));
    section.append(maintenant);
  }
  // Ses derniers gestes, le plus ancien d'abord — celui de maintenant est dit au-dessus.
  const passees = fini || cook.maintenant === null ? cook.etapes : cook.etapes.slice(0, -1);
  if (passees.length > 0) {
    const liste = cree(doc, "ol");
    liste.className = "etapes";
    liste.ariaLabel = "its latest steps";
    for (const etape of passees) {
      const ligne = cree(doc, "li");
      ligne.append(cree(doc, "span", geste(etape)), cree(doc, "time", heureUtc(etape.depuis)));
      liste.append(ligne);
    }
    section.append(cree(doc, "p", fini ? "its last steps" : "before that"), liste);
  }
  // Sa PR, dès que la box la connaît ; fini sans PR, une ligne le dit.
  if (cook.pr !== null) {
    const ouvre = cree(doc, "button", cook.pr.numero === null ? "open its PR" : `open PR #${cook.pr.numero}`);
    ouvre.type = "button";
    ouvre.className = "pr";
    ouvre.title = `open #${ticket}'s PR in the browser`;
    ouvre.addEventListener("click", () => ouvrirPr());
    section.append(ouvre);
  } else if (fini) {
    const sans = cree(doc, "p", SANS_PR);
    sans.className = "sans";
    section.append(sans);
  }
  const source = cree(doc, "small", `as the Kitchen board said at ${heureUtc(publiees.lu)}`);
  source.className = "source";
  source.append(survol(doc, SOURCE));
  section.append(source);
  return section;
}
