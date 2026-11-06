// @ts-check
// La section « capacités et cooks » de la page d'une station (ticket 2645, épique 2497) : ce que la machine sait faire,
// le plafond de cooks que la station partage entre ses projets, et les projets qu'elle sert avec la part de cooks
// qu'elle donne à chacun. Tout cela vit sur la machine : chaque réglage porte la marque de son niveau (`contexte.niveau`,
// que la coque pose).
// - Cet ordinateur : une capacité se déclare d'ici, le plafond se change d'ici.
// - Une autre station : la section se montre sans se régler (`contexte.lectureSeule`) — jamais de champ ni de bouton.
// - Les projets servis ne se règlent pas ici : seule leur part de cooks paraît, aucun autre réglage du projet.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément.

import { boutonAction } from "../../../briques.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/**
 * Ce que la coque lit de la station : ses capacités détectées et déclarées ; son plafond de cooks ; ses projets servis,
 * chacun avec sa part de cooks en pour cent ; et les gestes de cet ordinateur — absents ailleurs.
 * @typedef {{
 *   capacites?: { detectees?: string[], declarees?: string[], declarer?: (nom: string) => void },
 *   plafond?: { valeur?: number, regler?: (valeur: number) => void },
 *   projets?: { nom: string, part: number }[],
 * }} CapacitesEtCooks
 */

export const INCONNU = "unknown";
export const DECLARER = "Declare";
export const ENREGISTRER = "Save";
export const AUCUNE = "none";
export const SURVOL_DE_LA_DECLARATION = "Tells the project this machine can do it; the station does not check.";

/** @param {Fabrique} doc @param {any} contexte */
export function poserSection(doc, contexte) {
  /** @type {CapacitesEtCooks} */
  const donnees = contexte.capacitesEtCooks ?? {};
  const racine = doc.createElement("div");
  racine.className = "capacites-et-cuisiniers";
  racine.append(capacites(doc, contexte, donnees.capacites ?? {}), plafond(doc, contexte, donnees.plafond ?? {}), projets(doc, contexte, donnees.projets ?? []));
  return racine;
}

// Une ligne de réglage : son nom, la marque de son niveau, puis ce qu'elle montre.
/** @param {Fabrique} doc @param {string} nom @param {any} marque */
function reglage(doc, nom, marque) {
  const racine = doc.createElement("div");
  racine.className = "reglage";
  racine.dataset.reglage = nom;
  const titre = doc.createElement("strong");
  titre.textContent = nom;
  racine.append(titre, marque);
  return racine;
}

/** @param {Fabrique} doc @param {string} classe @param {string} texte */
function texte(doc, classe, texte) {
  const span = doc.createElement("span");
  span.className = classe;
  span.textContent = texte;
  return span;
}

// Un champ et son bouton : le bouton lit le champ au clic et le dit au geste.
/** @param {Fabrique} doc @param {{ nom: string, libelle: string, type: string, valeur: string, geste: (saisi: string) => void }} champ */
function champ(doc, { nom, libelle, type, valeur, geste }) {
  const entree = doc.createElement("input");
  entree.type = type;
  entree.value = valeur;
  entree.ariaLabel = nom;
  return [entree, boutonAction(doc, libelle, () => geste(entree.value), { recommande: true })];
}

/** @param {Fabrique} doc @param {any} contexte @param {NonNullable<CapacitesEtCooks["capacites"]>} capacites */
function capacites(doc, contexte, { detectees = [], declarees = [], declarer }) {
  const racine = reglage(doc, "capabilities", contexte.niveau("capacites"));
  const liste = doc.createElement("div");
  liste.className = "valeur";
  const dites = [...detectees.map((nom) => ({ nom, origine: "detected" })), ...declarees.filter((nom) => !detectees.includes(nom)).map((nom) => ({ nom, origine: "declared" }))];
  if (dites.length === 0) liste.append(texte(doc, "capacite", AUCUNE));
  for (const { nom, origine } of dites) {
    const capacite = texte(doc, "capacite", `${nom} (${origine})`);
    capacite.dataset.origine = origine;
    liste.append(capacite);
  }
  racine.append(liste);
  if (!contexte.lectureSeule && declarer !== undefined) {
    const declare = declarer;
    const [entree, bouton] = champ(doc, {
      nom: "capability to declare",
      libelle: DECLARER,
      type: "text",
      valeur: "",
      geste(saisi) {
        const nom = saisi.trim();
        if (nom !== "" && !detectees.includes(nom) && !declarees.includes(nom)) declare(nom);
      },
    });
    racine.append(entree, bouton);
  }
  return racine;
}

/** @param {Fabrique} doc @param {any} contexte @param {NonNullable<CapacitesEtCooks["plafond"]>} plafond */
function plafond(doc, contexte, { valeur, regler }) {
  const racine = reglage(doc, "cook cap", contexte.niveau("cooks"));
  const connu = typeof valeur === "number" && Number.isInteger(valeur) && valeur > 0;
  racine.append(texte(doc, "valeur", connu ? String(valeur) : INCONNU));
  if (!contexte.lectureSeule && regler !== undefined) {
    const change = regler;
    const [entree, bouton] = champ(doc, {
      nom: "overall cook cap",
      libelle: ENREGISTRER,
      type: "number",
      valeur: connu ? String(valeur) : "",
      geste(saisi) {
        const voulu = Number(saisi);
        if (saisi.trim() !== "" && Number.isInteger(voulu) && voulu > 0 && voulu !== valeur) change(voulu);
      },
    });
    racine.append(entree, bouton);
  }
  return racine;
}

// Les projets servis : leur nom et la part de cooks de la station qu'ils reçoivent — rien d'autre du projet.
/** @param {Fabrique} doc @param {any} contexte @param {NonNullable<CapacitesEtCooks["projets"]>} projets */
function projets(doc, contexte, projets) {
  const racine = doc.createElement("div");
  racine.className = "projets-servis";
  if (projets.length === 0) racine.append(texte(doc, "valeur", AUCUNE));
  for (const { nom, part } of projets) {
    const ligne = reglage(doc, nom, contexte.niveau("station-part-de-cooks"));
    ligne.dataset.projet = nom;
    ligne.append(texte(doc, "valeur", Number.isFinite(part) ? `${part}% of cooks` : INCONNU));
    racine.append(ligne);
  }
  return racine;
}
