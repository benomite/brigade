// @ts-check
// Les post-mortems de panne du projet (ticket 4023), dans la section de Settings du projet : le nombre de pannes vues d'abord par
// le chef sur les 7 derniers jours, puis chaque post-mortem, le plus récent d'abord, avec ses cinq champs. Un champ que rien
// n'a dit se dit « not recorded », jamais inventé. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../projects/post-mortems.ts").VueOfPostMortems} Vue */

const TITLE = "Outage post-mortems";
const SEEN_BY_THE_CHEF = "Seen first by the chef, last 7 days";
const NO = "No outage over 30 minutes has left a post-mortem.";
const NOT_READ = "The project's post-mortems were not read.";
const NOT_SAYS = "not recorded";

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} text */
function node(doc, balise, classe, text) {
  const n = doc.createElement(balise);
  if (classe !== "") n.className = classe;
  n.textContent = text;
  return n;
}

/** @param {Fabrique} doc @param {Vue | undefined} vue */
export function setBlockPostMortems(doc, vue) {
  const block = doc.createElement("section");
  block.className = "bloc-du-projet post-mortems";
  block.dataset.bloc = "post-mortems";
  block.ariaLabel = TITLE;
  block.append(node(doc, "h3", "", TITLE));
  if (vue === undefined) {
    block.append(node(doc, "p", "sans-mesure", NOT_READ));
    return block;
  }
  const account = node(doc, "p", "vus-par-le-chef", "");
  account.append(node(doc, "span", "nom", `${SEEN_BY_THE_CHEF}: `), node(doc, "strong", "nombre", String(vue.vusParLeChef)));
  block.append(account);
  if (vue.lignes.length === 0) {
    block.append(node(doc, "p", "sans-mesure", NO));
    return block;
  }
  const list = doc.createElement("ul");
  list.className = "post-mortems-liste";
  for (const line of vue.lignes) {
    const row = doc.createElement("li");
    row.append(
      node(doc, "div", "cause", `Cause: ${line.cause}`),
      node(doc, "div", "duree", `Duration: ${line.duree}`),
      node(doc, "div", "vu-en-premier", `Seen first by: ${line.vuEnPremier}`),
      node(doc, "div", "corrige", `Fixed by: ${line.corrige ?? NOT_SAYS}`),
      node(doc, "div", "ticket", `Fix ticket: ${line.ticket ?? NOT_SAYS}`),
    );
    list.append(row);
  }
  block.append(list);
  return block;
}
