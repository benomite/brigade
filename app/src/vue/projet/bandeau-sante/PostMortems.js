// @ts-check
// Les post-mortems de panne du projet (#4023), dans la section de Settings du projet : le nombre de pannes vues d'abord par
// le chef sur les 7 derniers jours, puis chaque post-mortem, le plus récent d'abord, avec ses cinq champs. Un champ que rien
// n'a dit se dit « not recorded », jamais inventé. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../projets/post-mortems.ts").VueDesPostMortems} Vue */

const TITRE = "Outage post-mortems";
const VUS_PAR_LE_CHEF = "Seen first by the chef, last 7 days";
const AUCUN = "No outage over 30 minutes has left a post-mortem.";
const PAS_LUS = "The project's post-mortems were not read.";
const PAS_DIT = "not recorded";

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} texte */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  if (classe !== "") n.className = classe;
  n.textContent = texte;
  return n;
}

/** @param {Fabrique} doc @param {Vue | undefined} vue */
export function poserBlocPostMortems(doc, vue) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet post-mortems";
  bloc.dataset.bloc = "post-mortems";
  bloc.ariaLabel = TITRE;
  bloc.append(noeud(doc, "h3", "", TITRE));
  if (vue === undefined) {
    bloc.append(noeud(doc, "p", "sans-mesure", PAS_LUS));
    return bloc;
  }
  const compte = noeud(doc, "p", "vus-par-le-chef", "");
  compte.append(noeud(doc, "span", "nom", `${VUS_PAR_LE_CHEF}: `), noeud(doc, "strong", "nombre", String(vue.vusParLeChef)));
  bloc.append(compte);
  if (vue.lignes.length === 0) {
    bloc.append(noeud(doc, "p", "sans-mesure", AUCUN));
    return bloc;
  }
  const liste = doc.createElement("ul");
  liste.className = "post-mortems-liste";
  for (const ligne of vue.lignes) {
    const rangee = doc.createElement("li");
    rangee.append(
      noeud(doc, "div", "cause", `Cause: ${ligne.cause}`),
      noeud(doc, "div", "duree", `Duration: ${ligne.duree}`),
      noeud(doc, "div", "vu-en-premier", `Seen first by: ${ligne.vuEnPremier}`),
      noeud(doc, "div", "corrige", `Fixed by: ${ligne.corrige ?? PAS_DIT}`),
      noeud(doc, "div", "ticket", `Fix ticket: ${ligne.ticket ?? PAS_DIT}`),
    );
    liste.append(rangee);
  }
  bloc.append(liste);
  return bloc;
}
