// @ts-check
// La section « capacités et cooks » de la page d'une station (ticket 2645, épique 2497) : ce que la machine sait faire,
// le plafond de cooks que la station partage entre ses projets, et les projets qu'elle sert avec la part de cooks
// qu'elle donne à chacun. Tout cela vit sur la machine, jamais dans le dépôt (aucune PR) : chaque réglage est une rangée
// de réglage (composants/reglage, ticket 2920) avec la marque de son niveau (`contexte.niveau`, que la coque pose).
// - Cet ordinateur : une capacité se déclare d'ici, le plafond se change d'ici — d'un champ qui s'applique dès qu'il
//   change, sans « Save » ; le temps qu'il court, la rangée dit « applying… », puis son refus s'il y en a un.
// - Une autre station : la section se montre sans se régler (`contexte.lectureSeule`) — jamais de champ ni de bouton.
// - Les projets servis ne se règlent pas ici : seule leur part de cooks paraît, aucun autre réglage du projet.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément.

import { rangeeDeReglage } from "../../../composants/reglage/reglage.js";
import { appliquer, dire, RIEN_N_A_CHANGE } from "../appliquer.js";
import { CET_ORDINATEUR } from "../../../lexique.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../appliquer.js").Rendu} Rendu */
/**
 * Ce que la coque lit de la station : ses capacités détectées et déclarées ; son plafond de cooks ; ses projets servis,
 * chacun avec sa part de cooks en pour cent ; et les gestes de cet ordinateur — absents ailleurs —, qui rendent ce
 * qu'ils ont fait, leur refus (`{ refus, detail }`), ou rien.
 * @typedef {{
 *   capacites?: { detectees?: string[], declarees?: string[], declarer?: (nom: string) => Rendu | Promise<Rendu> },
 *   plafond?: { valeur?: number, regler?: (valeur: number) => Rendu | Promise<Rendu> },
 *   projets?: { nom: string, part: number }[],
 * }} CapacitesEtCooks
 */

export const INCONNU = "unknown";
export const A_DECLARER = "declare a capability";
export const PLAFOND_ENTIER = "the cook cap is a whole number above zero";
export const AUCUNE = "none";
export const SURVOL_DE_LA_DECLARATION = `Tells the project ${CET_ORDINATEUR} can do it; the station does not check.`;

/** @param {Fabrique} doc @param {any} contexte */
export function poserSection(doc, contexte) {
  /** @type {CapacitesEtCooks} */
  const donnees = contexte.capacitesEtCooks ?? {};
  const racine = doc.createElement("div");
  racine.className = "capacites-et-cuisiniers";
  racine.append(capacites(doc, contexte, donnees.capacites ?? {}), plafond(doc, contexte, donnees.plafond ?? {}), projets(doc, contexte, donnees.projets ?? []));
  return racine;
}

/** @param {Fabrique} doc @param {string} classe @param {string} texte */
function texte(doc, classe, texte) {
  const span = doc.createElement("span");
  span.className = classe;
  span.textContent = texte;
  return span;
}

// Le champ d'un réglage : il s'applique dès qu'il change (`change`), par le geste de la coque, sans bouton ; la rangée le
// dit pendant qu'il court, puis dit ce qu'il a rendu. `voulu` lit ce qui est saisi : rien quand il n'y a rien à changer,
// un refus quand ce qui est saisi ne se règle pas.
/**
 * @param {Fabrique} doc @param {any} rangee
 * @param {{ nom: string, type: string, valeur: string, placeholder?: string, voulu: (saisi: string) => { refus: string, detail?: string } | { appliquer: () => Rendu | Promise<Rendu> } | undefined }} champ
 */
function champ(doc, rangee, { nom, type, valeur, placeholder = "", voulu }) {
  const entree = doc.createElement("input");
  entree.type = type;
  entree.value = valeur;
  entree.placeholder = placeholder;
  entree.ariaLabel = nom;
  entree.addEventListener("change", () => {
    const lu = voulu(String(entree.value));
    if (lu === undefined) return dire(doc, rangee, undefined);
    if ("refus" in lu) return dire(doc, rangee, lu);
    void appliquer(doc, rangee, [entree], lu.appliquer);
  });
  rangee.children[2].append(entree);
  return entree;
}

/** @param {Fabrique} doc @param {any} contexte @param {NonNullable<CapacitesEtCooks["capacites"]>} capacites */
function capacites(doc, contexte, { detectees = [], declarees = [], declarer }) {
  const dites = [...detectees.map((nom) => ({ nom, origine: "detected" })), ...declarees.filter((nom) => !detectees.includes(nom)).map((nom) => ({ nom, origine: "declared" }))];
  const valeur = dites.length === 0 ? [texte(doc, "capacite", AUCUNE)] : [];
  for (const { nom, origine } of dites) {
    const capacite = texte(doc, "capacite", `${nom} (${origine})`);
    capacite.dataset.origine = origine;
    valeur.push(capacite);
  }
  const racine = rangeeDeReglage(doc, { nom: "capabilities", cle: "capabilities", niveau: contexte.niveau("capacites"), valeur });
  if (!contexte.lectureSeule && declarer !== undefined) {
    const declare = declarer;
    champ(doc, racine, {
      nom: "capability to declare",
      type: "text",
      valeur: "",
      placeholder: A_DECLARER,
      voulu(saisi) {
        const nom = saisi.trim();
        if (nom === "" || detectees.includes(nom) || declarees.includes(nom)) return undefined;
        return { appliquer: () => declare(nom) };
      },
    });
  }
  return racine;
}

/** @param {Fabrique} doc @param {any} contexte @param {NonNullable<CapacitesEtCooks["plafond"]>} plafond */
function plafond(doc, contexte, { valeur, regler }) {
  const connu = typeof valeur === "number" && Number.isInteger(valeur) && valeur > 0;
  const racine = rangeeDeReglage(doc, { nom: "cook cap", cle: "cook cap", niveau: contexte.niveau("cooks"), valeur: [connu ? String(valeur) : INCONNU] });
  if (!contexte.lectureSeule && regler !== undefined) {
    const change = regler;
    champ(doc, racine, {
      nom: "overall cook cap",
      type: "number",
      valeur: connu ? String(valeur) : "",
      voulu(saisi) {
        const voulu = Number(saisi);
        if (saisi.trim() === "" || voulu === valeur) return undefined;
        if (!Number.isInteger(voulu) || voulu <= 0) return { refus: RIEN_N_A_CHANGE, detail: PLAFOND_ENTIER };
        return { appliquer: () => change(voulu) };
      },
    });
  }
  return racine;
}

// Les projets servis : leur nom et la part de cooks de la station qu'ils reçoivent — rien d'autre du projet, rien à régler.
/** @param {Fabrique} doc @param {any} contexte @param {NonNullable<CapacitesEtCooks["projets"]>} projets */
function projets(doc, contexte, projets) {
  const racine = doc.createElement("div");
  racine.className = "projets-servis";
  if (projets.length === 0) racine.append(texte(doc, "valeur", AUCUNE));
  for (const { nom, part } of projets) {
    const ligne = rangeeDeReglage(doc, { nom, cle: "part-de-cooks", niveau: contexte.niveau("station-part-de-cooks"), valeur: [Number.isFinite(part) ? `${part}% of cooks` : INCONNU] });
    ligne.dataset.projet = nom;
    racine.append(ligne);
  }
  return racine;
}
