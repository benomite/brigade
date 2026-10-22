// @ts-check
// Sur l'onglet Cooks, sous le plafond de calibrage (ticket 1274) : les rôles de la cuisine du projet — le manager, la
// pass, le reviewer, le second juge, le triage et le closer —, un par ligne : son nom, la ligne qui dit ce qu'il fait,
// et sa dernière action sur le projet avec son heure. Un rôle qui n'a encore rien fait le dit en mots, `no action yet`,
// jamais par un blanc. Sur Cooks, le bloc est replié derrière une ligne (ticket 1456) : `resumeDesRoles` la dit — combien
// de rôles, la plus récente de leurs actions, et ceux qui n'ont encore rien fait. Les rôles, leur ligne et la phrase de leur action viennent de `facts` (runtime/src/roles-cuisine/
// roles.ts) : la vue les pose, elle n'en compose aucun.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").RoleDeCuisine} RoleDeCuisine */

export const TITRE = "kitchen roles";
export const SANS_ACTION = "no action yet";
export const AIDE = "What each role of the kitchen does, and the last thing it did on this project, read from its log. The cooks are on the stations' blocks.";

// L'heure d'une action, dans la locale de l'app (anglaise) : le jour et l'heure, sans les secondes.
/** @param {string} instant */
export const heureDeLAction = (instant) => new Date(instant).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

// La ligne du bloc replié : « 6 roles · latest: pass — merged #12, Oct 13, 2026, 9:41 AM · no action yet: second
// judge ». Un rôle muet se lit sans ouvrir le bloc.
/** @param {RoleDeCuisine[]} roles */
export function resumeDesRoles(roles) {
  const agis = roles.filter(({ latest }) => latest !== null);
  const derniere = agis.reduce((/** @type {RoleDeCuisine | undefined} */ plus, role) => (plus === undefined || Date.parse(role.latest?.at ?? "") > Date.parse(plus.latest?.at ?? "") ? role : plus), undefined);
  const muets = roles.filter(({ latest }) => latest === null).map(({ role }) => role);
  return [
    `${roles.length} role${roles.length > 1 ? "s" : ""}`,
    ...(derniere?.latest == null ? [] : [`latest: ${derniere.role} — ${derniere.latest.what}, ${heureDeLAction(derniere.latest.at)}`]),
    ...(muets.length === 0 ? [] : [`${SANS_ACTION}: ${muets.join(", ")}`]),
  ].join(" · ");
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La dernière action d'un rôle : sa phrase, puis son heure — ou, s'il n'a rien fait, `no action yet`.
/** @param {Fabrique} doc @param {RoleDeCuisine["latest"]} derniere */
function action(doc, derniere) {
  const pose = cree(doc, "span");
  if (derniere === null) {
    pose.className = "derniere-action sans-action";
    pose.textContent = SANS_ACTION;
    return pose;
  }
  pose.className = "derniere-action";
  const quand = cree(doc, "time", heureDeLAction(derniere.at));
  quand.dateTime = derniere.at;
  pose.append(cree(doc, "span", derniere.what), " · ", quand);
  return pose;
}

// Les rôles de la cuisine du projet, ou rien d'un runtime qui ne les donne pas.
/** @param {Fabrique} doc @param {RoleDeCuisine[] | undefined} roles */
export function poserLesRoles(doc, roles) {
  if (roles === undefined || roles.length === 0) return null;
  const section = cree(doc, "section");
  section.className = "roles-cuisine";
  section.ariaLabel = TITRE;
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  const liste = cree(doc, "ul");
  liste.append(
    ...roles.map(({ role, does, latest }) => {
      const ligne = cree(doc, "li");
      ligne.dataset.role = role;
      const nom = cree(doc, "span", role);
      nom.className = "nom-du-role";
      const fait = cree(doc, "span", does);
      fait.className = "ce-qu-il-fait";
      ligne.append(nom, fait, action(doc, latest));
      return ligne;
    }),
  );
  section.append(tete, liste);
  return section;
}
