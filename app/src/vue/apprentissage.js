// @ts-check
// Sous les causes corrigées, sur la page Reliability (ticket 1058, épique 1034) : ce que les cooks ont appris
// au projet. Ses leçons — provisoires et promues —, chacune avec sa date, les tickets qui l'ont proposée et le
// nombre de cooks qui l'ont reçue ; une promue a son lien, qui ouvre sa ligne dans le carnet du projet sur
// GitHub, et ne crée rien. Puis ses profils, chacun avec son domaine, son carnet et les tickets qu'il a
// cuisinés. Un ticket ouvre sa fiche, comme ceux des causes. Tant que le projet n'a ni leçon ni profil, une
// phrase le dit, à la place d'une liste vide.
// Tout est lu par le process principal (apprentissage.ts) : la vue pose.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../apprentissage.ts").Apprentissage} Apprentissage */
/** @typedef {import("../apprentissage.ts").Lecon} Lecon */
/** @typedef {import("../apprentissage.ts").ProfilApprisLu} Profil */
/** @typedef {import("../apprentissage.ts").Progres} Progres */
/** @typedef {import("../apprentissage.ts").Livraison} Livraison */

export const TITRE = "what the cooks learned";
export const RIEN_APPRIS = "The cooks have learned nothing on this project yet: no lesson, no profile.";
export const LECONS = "lessons";
export const PROFILS = "profiles";
export const AUCUNE_LECON = "no lesson yet";
export const AUCUN_PROFIL = "no profile yet";
export const PROVISOIRE = "provisional";
export const PROMUE = "promoted";
export const LIEN = "open in the notebook";
export const CARNET_VIDE = "empty";
export const AUCUN_TICKET = "none yet";
export const PREMIER_COUP = "delivered on the first try";
export const ESSAIS = "attempts per ticket";
// Un côté sans ticket mergé : les mots, jamais 0 ni NaN.
export const PAS_ASSEZ = "not enough tickets yet";

// Ce que chaque statut veut dire, au survol de sa pastille.
export const DIT_PROVISOIRE = "provisional: proposed by the retro of a cook, given to the next cooks, not in the project's notebook";
export const DIT_PROMUE = "promoted: in the project's notebook, in its repository — to remove it, open a PR yourself";
const SANS_ADRESSE = "the station gave no GitHub address for this notebook: the app does not open it";
const OUVRE = "opens its line in the project's notebook on GitHub — no branch, no PR is created";
// Les états qu'une leçon d'un carnet de profil peut prendre (runtime/src/carnet/carnet.ts).
/** @type {Record<string, string>} */
const ETATS = { promoted: PROMUE, retired: "retired", expired: "expired" };

const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");
// Une date du runtime (AAAA-MM-JJ), comme la vue les dit ailleurs : le jour lui-même, quel que soit le fuseau.
const jour = (/** @type {string} */ date) => {
  const instant = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(instant) ? date : new Date(instant).toLocaleDateString("en-US", { timeZone: "UTC" });
};

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Des tickets, sous leur libellé : chacun son numéro, en monospace, qui ouvre sa fiche — ou `vide` s'il n'y
// en a aucun.
/** @param {Fabrique} doc @param {string} libelle @param {number[]} tickets @param {string} vide @param {(ticket: number, bouton: any) => void} ouvrir */
function lesTickets(doc, libelle, tickets, vide, ouvrir) {
  const ligne = cree(doc, "span");
  ligne.className = "tickets";
  ligne.append(cree(doc, "span", libelle));
  if (tickets.length === 0) {
    const aucun = cree(doc, "span", vide);
    aucun.className = "aucun";
    ligne.append(aucun);
  }
  for (const ticket of tickets) {
    const bouton = cree(doc, "button", `#${ticket}`);
    bouton.type = "button";
    bouton.className = "mono";
    bouton.title = `open the sheet of #${ticket}`;
    bouton.addEventListener("click", () => ouvrir(ticket, bouton));
    ligne.append(bouton);
  }
  return ligne;
}

// Un identifiant de leçon, en monospace : il se recopie.
/** @param {Fabrique} doc @param {string} id */
function identifiant(doc, id) {
  const pose = cree(doc, "code", id);
  pose.className = "id mono";
  return pose;
}

// Un nombre d'essais ou une part, dit sans zéros inutiles.
const nombre = (/** @type {number} */ n) => String(Math.round(n * 10) / 10);

// Un côté de la mesure : le chiffre, ou les mots quand aucun ticket mergé n'y est.
/** @param {Fabrique} doc @param {string} cote @param {Livraison | null} livraison @param {(l: Livraison) => string} dit */
function unCote(doc, cote, livraison, dit) {
  const pose = cree(doc, "span");
  pose.className = "cote";
  if (livraison === null) pose.className = "cote absent";
  pose.append(cree(doc, "span", cote));
  const valeur = cree(doc, "span", livraison === null ? PAS_ASSEZ : dit(livraison));
  valeur.className = "valeur";
  pose.append(valeur);
  return pose;
}

// Ce que la leçon ou le profil a changé : la part livrée du premier coup et les essais moyens, avant puis
// après son entrée.
/** @param {Fabrique} doc @param {Progres} progres */
function leProgres(doc, progres) {
  const bloc = cree(doc, "div");
  bloc.className = "progres";
  /** @type {[string, (l: Livraison) => string][]} */
  const mesures = [
    [PREMIER_COUP, (l) => `${Math.round(l.premierCoup * 100)}% (${l.premiers} of ${l.retenus})`],
    [ESSAIS, (l) => `${nombre(l.essaisMoyens)} on average`],
  ];
  for (const [libelle, dit] of mesures) {
    const ligne = cree(doc, "p");
    ligne.className = "mesure";
    const titre = cree(doc, "span", libelle);
    titre.className = "libelle";
    ligne.append(titre, unCote(doc, "before", progres.avant, dit), unCote(doc, "after", progres.apres, dit));
    bloc.append(ligne);
  }
  return bloc;
}

// Une leçon : son statut — son sens au survol —, son identifiant et son texte, puis sa date, ses tickets et
// ses cooks ; promue, son lien vers sa ligne du carnet.
/** @param {Fabrique} doc @param {Lecon} lecon @param {(ticket: number, bouton: any) => void} ouvrir @param {(id: string) => void} ouvrirLaLigne */
function uneLecon(doc, lecon, ouvrir, ouvrirLaLigne) {
  const promue = lecon.statut === "promue";
  const item = cree(doc, "li");
  item.className = "lecon";
  if (promue) item.className = "lecon promue";

  const tete = cree(doc, "div");
  tete.className = "tete-lecon";
  // La pastille est le déclencheur de son survol : son sens s'y lit sans icône de plus.
  const pastille = cree(doc, "span", promue ? PROMUE : PROVISOIRE);
  pastille.className = "statut";
  pastille.tabIndex = 0;
  const statut = survol(doc, promue ? DIT_PROMUE : DIT_PROVISOIRE, pastille);
  const texte = cree(doc, "span", lecon.texte);
  texte.className = "texte";
  tete.append(statut, identifiant(doc, lecon.id), texte);

  const details = cree(doc, "p");
  details.className = "details";
  const depuis = cree(doc, "span", `since ${jour(lecon.date)}`);
  const cooks = cree(doc, "span", lecon.cooks === 0 ? "received by no cook yet" : `received by ${lecon.cooks} cook${s(lecon.cooks)}`);
  cooks.className = "cooks";
  details.append(depuis, lesTickets(doc, "proposed by", lecon.tickets, "no ticket", ouvrir), cooks);
  if (lecon.lien !== undefined) {
    const lien = cree(doc, "button", LIEN);
    lien.type = "button";
    lien.className = "lien";
    lien.title = lecon.lien.ouvrable ? OUVRE : SANS_ADRESSE;
    lien.disabled = !lecon.lien.ouvrable;
    lien.addEventListener("click", () => ouvrirLaLigne(lecon.id));
    details.append(lien);
  }
  item.append(tete, details, leProgres(doc, lecon.progres));
  return item;
}

// Un profil : son nom et son domaine, son carnet — chaque leçon par son identifiant et son texte, son état
// quand elle n'est plus promue —, et les tickets qu'il a cuisinés.
/** @param {Fabrique} doc @param {Profil} profil @param {(ticket: number, bouton: any) => void} ouvrir */
function unProfil(doc, profil, ouvrir) {
  const item = cree(doc, "li");
  item.className = "profil-appris";

  const tete = cree(doc, "div");
  tete.className = "tete-lecon";
  const nom = cree(doc, "strong", profil.nom);
  nom.className = "nom";
  const domaine = cree(doc, "span");
  domaine.className = "domaine";
  const zone = cree(doc, "code", profil.domaine);
  zone.className = "mono";
  domaine.append("for ", zone);
  tete.append(nom, domaine);

  const carnet = cree(doc, "div");
  carnet.className = "carnet";
  const titre = cree(doc, "span", "notebook");
  titre.className = "libelle";
  if (profil.carnet.length === 0) {
    const vide = cree(doc, "span", CARNET_VIDE);
    vide.className = "aucun";
    carnet.append(titre, vide);
  } else {
    titre.textContent = `notebook, ${profil.carnet.length} lesson${s(profil.carnet.length)}`;
    const lecons = cree(doc, "ul");
    for (const { id, texte, etat } of profil.carnet) {
      const lecon = cree(doc, "li");
      if (etat !== "promoted") lecon.className = "sortie";
      lecon.append(identifiant(doc, id), cree(doc, "span", texte));
      if (etat !== "promoted") {
        const dit = cree(doc, "span", ETATS[etat] ?? etat);
        dit.className = "etat";
        lecon.append(dit);
      }
      lecons.append(lecon);
    }
    carnet.append(titre, lecons);
  }

  const details = cree(doc, "p");
  details.className = "details";
  details.append(lesTickets(doc, "cooked", profil.tickets, AUCUN_TICKET, ouvrir));
  item.append(tete, carnet, details, leProgres(doc, profil.progres));
  return item;
}

// Une partie de la section — les leçons, ou les profils —, sous son titre et leur nombre ; sans rien, une ligne.
/** @param {Fabrique} doc @param {string} titre @param {any[]} items @param {string} vide */
function partie(doc, titre, items, vide) {
  const bloc = cree(doc, "div");
  bloc.className = "partie";
  bloc.append(cree(doc, "h3", items.length === 0 ? titre : `${titre} · ${items.length}`));
  if (items.length === 0) {
    const aucun = cree(doc, "p", vide);
    aucun.className = "sans";
    bloc.append(aucun);
    return bloc;
  }
  const liste = cree(doc, "ol");
  liste.append(...items);
  bloc.append(liste);
  return bloc;
}

// La section entière. `apprentissage` absent : les faits du projet ne sont pas lus, rien n'est posé. Lus,
// sans leçon ni profil : une phrase, et aucune liste.
/** @param {Fabrique} doc @param {Apprentissage | undefined} apprentissage @param {{ ouvrir: (ticket: number, bouton: any) => void, ouvrirLaLigne: (id: string) => void }} gestes */
export function poserApprentissage(doc, apprentissage, gestes) {
  if (apprentissage === undefined) return [];
  const bloc = cree(doc, "div");
  bloc.className = "apprentissage-fiabilite";
  bloc.append(cree(doc, "h2", TITRE));
  const { lecons, profils } = apprentissage;
  if (lecons.length === 0 && profils.length === 0) {
    const rien = cree(doc, "p", RIEN_APPRIS);
    rien.className = "rien-appris";
    bloc.append(rien);
    return [bloc];
  }
  bloc.append(
    partie(doc, LECONS, lecons.map((lecon) => uneLecon(doc, lecon, gestes.ouvrir, gestes.ouvrirLaLigne)), AUCUNE_LECON),
    partie(doc, PROFILS, profils.map((profil) => unProfil(doc, profil, gestes.ouvrir)), AUCUN_PROFIL),
  );
  return [bloc];
}
