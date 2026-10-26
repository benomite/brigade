// @ts-check
// La fiabilité des cooks d'un projet (le ticket 987), en section de son onglet Cooks depuis le ticket 1699 — elle était
// la page Settings → Reliability : sur ses derniers tickets servis.
// En tête, trois chiffres — la part livrée du premier coup face à son seuil, le nombre moyen d'essais
// par ticket, les tokens perdus en essais ratés face au leur —, puis les causes d'échec qui reviennent
// le plus, trois au plus, chacune avec son nombre, sa part et ses derniers tickets, dont un clic ouvre la
// fiche. Un chiffre au-delà de son seuil passe en rouge, comme la ligne `drift` de la file le signale.
// Tout est lu par le process principal (fiabilite.ts) : la vue pose. Pas encore assez de tickets servis
// pour mesurer, la page le dit en une ligne — jamais des zéros.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { lectureIndisponible } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../fiabilite.ts").Vu} Vu */
/** @typedef {import("../fiabilite.ts").Mesure} Mesure */

export const TITRE = "reliability of the cooks";
export const CAUSES = "most frequent causes of failure";
export const PREMIER_COUP = "delivered on the first try";
export const ESSAIS = "attempts per ticket";
export const PERDUS = "tokens lost on failed attempts";
export const LECTURE = "reading…";
export const NON_COMMUNIQUE = "not communicated";

const nombre = (/** @type {number} */ valeur, decimales = 0) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });
const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un chiffre : son libellé, sa valeur, et ce à quoi il se compare. `depasse` : il a franchi son seuil.
/** @param {Fabrique} doc @param {string} libelle @param {string} valeur @param {string} face @param {boolean} depasse */
function chiffre(doc, libelle, valeur, face, depasse) {
  const pose = cree(doc, "div");
  pose.className = depasse ? "chiffre depasse" : "chiffre";
  if (depasse) pose.role = "alert";
  const total = cree(doc, "p", valeur);
  total.className = "total";
  const seuil = cree(doc, "p", face);
  seuil.className = "seuil";
  pose.append(cree(doc, "h3", libelle), total, seuil);
  return pose;
}

// Les trois chiffres, et la ligne qui dit sur quels tickets ils portent.
/** @param {Fabrique} doc @param {Mesure} mesure */
function chiffres(doc, { fenetre, retenus, ecartes, premierCoup, essaisMoyens, perdus }) {
  const ligne = cree(doc, "div");
  ligne.className = "chiffres";
  const { premiers, pourcent, seuil, seuilPose, sous } = premierCoup;
  ligne.append(
    chiffre(doc, PREMIER_COUP, `${premiers} of ${premierCoup.retenus} · ${pourcent}%`, `${sous ? "under its threshold" : "threshold"} of ${seuil}%${seuilPose ? "" : " (default)"}`, sous),
    chiffre(doc, ESSAIS, nombre(essaisMoyens, 1), "on average", false),
    perdus === null
      ? chiffre(doc, PERDUS, NON_COMMUNIQUE, "", false)
      : chiffre(
          doc,
          PERDUS,
          `${perdus.minimum ? "≥ " : ""}${nombre(perdus.tokens)}`,
          `over the last ${perdus.merges} merge${s(perdus.merges)} · ${perdus.seuil === null ? "no ceiling set" : `${perdus.depasse ? "over its ceiling" : "ceiling"} of ${nombre(perdus.seuil)}`}`,
          perdus.depasse,
        ),
  );
  const portee = cree(doc, "p", `${retenus} merged of the last ${fenetre} tickets served${ecartes === 0 ? "" : ` — ${ecartes} not merged, left out`}`);
  portee.className = "portee";
  return [ligne, portee];
}

// Les causes qui reviennent le plus : une ligne chacune, et ses derniers tickets en boutons.
/** @param {Fabrique} doc @param {Mesure["causes"]} causes @param {(ticket: number, bouton: any) => void} ouvrir */
function lesCauses(doc, causes, ouvrir) {
  const bloc = cree(doc, "div");
  bloc.className = "causes-fiabilite";
  bloc.append(cree(doc, "h2", CAUSES));
  if (causes === null || causes.rates === 0) {
    const vide = cree(doc, "p", causes === null ? NON_COMMUNIQUE : "no failed attempt");
    vide.className = "sans";
    bloc.append(vide);
    return bloc;
  }
  const liste = cree(doc, "ol");
  liste.className = "causes";
  for (const { titre, essais, pourcent, tickets } of causes.causes) {
    const item = cree(doc, "li");
    const dit = cree(doc, "span", titre);
    dit.className = "titre";
    const combien = cree(doc, "span", `${essais} attempt${s(essais)}`);
    combien.className = "essais";
    const part = cree(doc, "span", `${pourcent}%`);
    part.className = "part";
    const derniers = cree(doc, "span");
    derniers.className = "tickets";
    for (const ticket of tickets) {
      const bouton = cree(doc, "button", `#${ticket}`);
      bouton.className = "mono";
      bouton.title = `open the sheet of #${ticket}`;
      bouton.addEventListener("click", () => ouvrir(ticket, bouton));
      derniers.append(bouton);
    }
    item.append(dit, combien, part, derniers);
    liste.append(item);
  }
  const total = cree(doc, "p", `of ${causes.rates} failed attempt${s(causes.rates)}`);
  total.className = "portee";
  bloc.append(liste, total);
  return bloc;
}

// La page entière. `vu` indéfini : la première lecture est en route.
/** @param {Fabrique} doc @param {Vu | undefined} vu @param {(ticket: number, bouton: any) => void} ouvrir */
export function poserFiabilite(doc, vu, ouvrir) {
  const tete = cree(doc, "div");
  tete.className = "tete-fiabilite";
  tete.append(cree(doc, "h2", TITRE));
  if (vu === undefined) {
    const lecture = cree(doc, "p", LECTURE);
    lecture.className = "sans";
    tete.append(lecture);
    return [tete];
  }
  if ("sans" in vu) {
    tete.append(lectureIndisponible(doc, "the reliability could not be read", vu.sans));
    return [tete];
  }
  if ("pasAssez" in vu) {
    const { servis, fenetre } = vu.pasAssez;
    const dit = cree(
      doc,
      "p",
      servis < fenetre
        ? `not enough tickets served yet to measure: ${servis} of the ${fenetre} it takes`
        : `none of the last ${fenetre} tickets served is merged yet: nothing to measure`,
    );
    dit.className = "pas-assez";
    tete.append(dit);
    return [tete];
  }
  tete.append(...chiffres(doc, vu.mesure));
  return [tete, lesCauses(doc, vu.mesure.causes, ouvrir)];
}
