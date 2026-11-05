// @ts-check
// Les stations d'un projet sur GitHub seul, sur l'onglet Cooks (ticket 2358) : chacune telle que GitHub la dit — les tickets
// qu'elle tient sur leurs issues, et son dernier signe de vie dans son gist (runtime/src/stations-github/stations.ts) —,
// la box comme un ordinateur, par la même règle et dans le même bloc. Aucune n'y est principale : toutes prennent,
// cuisent, jugent et mergent. Rien ne s'y lit des `facts` de l'ancien journal, ni des stations qu'il déclarait.
// Chaque station dit, sur sa ligne : atteinte ou non (son signe de vie est frais), et son mot — `cooking`, avec les
// cartes des tickets qu'elle tient, ou `idle`. Une station tue dit, à la place, son dernier signe de vie. Arrêter ou
// relancer une station est un geste de l'ancien chemin, que la boucle de GitHub seul ne lit pas : aucun bouton.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).
import { cartesDeCooks, lignesDeCooks, TITRE } from "../stations-de-cuisson.js";
import { RETENUE } from "../stations-du-compte.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../cuisson.ts").LigneDeStation} Ligne */
/** @typedef {import("../../faits.ts").Cook} Cook */

// Atteinte ou non, au mot de sa pastille, et ce que le mot veut dire au survol.
export const ATTEINTE = {
  oui: "reached",
  non: "not reached",
  inconnue: "no word",
};
export const ATTEINTE_INCONNUE = "no sign of life of this station is read on GitHub: the app knows it only by the tickets it holds";
export const PAS_ATTEINTE = "open Brigade on that computer: its station signs on GitHub again within two minutes";
export const RETENUE_SURVOL = "GitHub's limit holds its calls: it keeps its tickets and its projects, and signs again once the limit lifts";
// Son dernier signe de vie, comme la liste des stations du compte le dit (stations-du-compte.js).
/** @param {string} instant */
export const SIGNE_DE_VIE = (instant) => `last sign of life ${instant.slice(0, 16).replace("T", " ")} UTC`;
export const AUCUNE = "no station serves this project on GitHub yet: one appears here once it is chosen for the project, or takes one of its tickets";
// Les signes de vie illisibles : une ligne, la raison au survol.
export const SIGNES_ILLISIBLES = "your stations' signs of life are not read: only those holding a ticket are listed";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Si elle est atteinte : son signe de vie frais, ou non ; aucun lu, rien ne le dit. Retenue par la limite de GitHub
// (ticket 2443), elle est atteinte et le dit : son signe de vie attend la fin de la limite.
/** @param {Ligne} ligne @returns {{ mot: string, ton: string, survol: string }} */
function atteinteDe({ presente, vueLe, retenue }) {
  const quand = vueLe === null || vueLe === undefined ? "" : SIGNE_DE_VIE(vueLe);
  if (retenue !== undefined) return { mot: RETENUE(retenue), ton: "jaune", survol: [quand, RETENUE_SURVOL].filter((ligne) => ligne !== "").join("\n") };
  if (presente === true) return { mot: ATTEINTE.oui, ton: "vert", survol: quand };
  if (presente === false) return { mot: ATTEINTE.non, ton: "gris", survol: [quand, PAS_ATTEINTE].filter((ligne) => ligne !== "").join("\n") };
  return { mot: ATTEINTE.inconnue, ton: "gris", survol: ATTEINTE_INCONNUE };
}

/**
 * Le bloc des stations, ou null : `cuisson` n'est pas celle d'un projet sur GitHub seul. `carte` : la carte du ticket
 * d'un cook, celle du kanban — sans elle (l'écran étroit), une ligne par cook. `tete` : la ligne de la cuisine du
 * projet, sous le titre.
 * @param {Fabrique} doc
 * @param {{ cuisson: import("../../cuisson.ts").CuissonDuProjet | undefined, pastille: (mot: string, ton: string | undefined) => any, carte?: (cook: Cook) => any, tete?: readonly any[] }} options
 */
export function poserLesStationsSurGithub(doc, { cuisson, pastille, carte, tete = [] }) {
  if (cuisson?.surGithub === undefined) return null;
  const section = cree(doc, "section");
  section.className = "stations-de-cuisson";
  section.ariaLabel = TITRE;
  if (carte !== undefined) section.dataset.cartes = "";
  const dessous = [];
  if (cuisson.surGithub.illisible !== null) {
    const illisible = cree(doc, "p", SIGNES_ILLISIBLES);
    illisible.className = "rien-ne-cuit";
    illisible.title = cuisson.surGithub.illisible;
    dessous.push(illisible);
  }
  if (cuisson.lignes.length === 0) {
    const aucune = cree(doc, "p", AUCUNE);
    aucune.className = "rien-ne-cuit";
    dessous.push(aucune);
  }
  const liste = cree(doc, "ol");
  liste.append(
    ...cuisson.lignes.map((ligne) => {
      const pose = cree(doc, "li");
      pose.className = "station-de-cuisson";
      pose.dataset.station = ligne.station;
      pose.dataset.role = "cuisson";
      pose.dataset.etat = ligne.etat;
      // Son nom, celui de ses prises.
      const nom = cree(doc, "span");
      nom.className = "nom";
      const appele = cree(doc, "strong", ligne.station);
      appele.className = "mono";
      nom.append(appele);
      // Atteinte ou non, puis son mot — ou, tue, son dernier signe de vie.
      const etat = cree(doc, "span");
      etat.className = "etat";
      const atteinte = atteinteDe(ligne);
      const joint = cree(doc, "span");
      joint.className = "pilule atteinte";
      joint.dataset.ton = atteinte.ton;
      joint.append(pastille(atteinte.mot, atteinte.ton), cree(doc, "strong", atteinte.mot));
      joint.title = atteinte.survol;
      etat.append(joint);
      if (ligne.etat === "silent") {
        if (ligne.vueLe !== null && ligne.vueLe !== undefined) etat.append(cree(doc, "small", SIGNE_DE_VIE(ligne.vueLe)));
      } else {
        const mot = cree(doc, "span");
        mot.className = "pilule";
        if (ligne.ton !== undefined) mot.dataset.ton = ligne.ton;
        mot.append(pastille(ligne.etat, ligne.ton), cree(doc, "strong", ligne.etat));
        mot.title = ligne.survol;
        etat.append(mot);
      }
      // Ses cooks : la carte de chaque ticket qu'elle tient, sous sa ligne ; une ligne chacun sur l'écran étroit.
      const cooks = carte === undefined ? lignesDeCooks(doc, ligne.cooks, ligne.agents) : cartesDeCooks(doc, ligne.station, ligne.cooks, ligne.agents, carte);
      pose.append(nom, etat, cooks);
      return pose;
    }),
  );
  section.append(cree(doc, "h3", TITRE), ...tete, ...dessous, ...(cuisson.lignes.length === 0 ? [] : [liste]));
  return section;
}

