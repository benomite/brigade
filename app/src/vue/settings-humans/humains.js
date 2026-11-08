// @ts-check
// Les humains du projet sous Settings (ticket 2930, épique 2926) : ceux que son `.claude/brigade/projet.json` déclare
// (`humans`, ticket 2759), une rangée chacun — son login et ses rôles. Ajouter un humain par une rangée neuve, changer ses
// rôles ou le retirer s'applique au changement, sans « Save » : chaque geste part tout de suite au service. Les humains
// vivent dans le dépôt : un changement s'y écrit par une PR, et la rangée le dit — puis le lien de la PR, une fois
// ouverte. Refusé (login inconnu, pas d'accès au dépôt), le refus se dit en une ligne sur la rangée du login concerné,
// et la rangée revient à ce qui était : elle ne dit pas le changement fait.
//
// Le service a ce contrat : `list()` rend les humains ; `save(humain)` en ajoute ou en change un ; `remove(login)` en
// retire un ; chaque écriture rend le lien de la PR, ou un refus d'une ligne. Ce module ne touche pas `document` : il
// reçoit de quoi créer un élément (briques.js), et le conteneur où se poser.

import { boutonAction, caseACocher, lectureIndisponible, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {"product" | "design" | "review" | "client-contact"} Role */
/** @typedef {{ login: string, roles: Role[] }} Humain */
// Ce qu'une écriture rend : le lien de la PR ouverte, ou le refus en une ligne — son détail, s'il y en a, au survol.
/** @typedef {{ pr: string } | { refus: string, detail?: string }} Rendu */
// `list` rend `undefined` quand le pont ne porte pas les humains (un téléphone) : la section ne se pose pas ; `{ sans }` quand
// ils ne se lisent pas : la section le dit en une ligne.
/** @typedef {{ list(): Promise<Humain[] | { sans: string, detail?: string } | undefined>, save(humain: Humain): Promise<Rendu>, remove(login: string): Promise<Rendu> }} Service */
// Une rangée : le login, les rôles montrés, ceux d'avant le dernier geste — ce qui revient sur un refus —, si c'est une
// rangée neuve, le geste en cours, la PR ouverte et ce qu'elle fait, ou le refus.
/**
 * @typedef {{
 *   cle: string,
 *   login: string,
 *   roles: Role[],
 *   avant: Role[],
 *   neuve: boolean,
 *   enCours?: boolean,
 *   pr?: { url: string, retrait: boolean },
 *   refus?: { ligne: string, detail: string },
 * }} Rangee
 */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Rangee[] }} Etat */

export const ROLES = /** @type {const} */ (["product", "design", "review", "client-contact"]);
export const TITRE = "humans";
export const MOTS = {
  aide: "The people who work on this project, with their roles. They are kept in the project's repository (.claude/brigade/projet.json): each change is proposed as a pull request, and applies once merged.",
  source: "written to projet.json through a pull request",
  enCours: "writing to projet.json…",
  propose: "proposed in",
  retraitPropose: "removal proposed in",
  vide: "No human is declared for this project.",
  premier: "add the first human",
  ajouter: "add a human",
  retirer: "remove",
  annuler: "cancel",
  login: "GitHub login",
  indisponible: "humans unavailable",
  rienEnvoye: "nothing was written: no answer from the service",
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le numéro d'une PR, lu dans son lien ; un lien sans numéro se dit « pull request ».
/** @param {string} url */
export function nomDeLaPr(url) {
  const numero = /\/pull\/(\d+)/.exec(url)?.[1];
  return numero === undefined ? "pull request" : `PR #${numero}`;
}

// Ce que dit la colonne du milieu : où le changement s'écrit, qu'il s'écrit, ou la PR qui le porte, avec son lien.
/** @param {Fabrique} doc @param {Rangee} rangee @param {(url: string) => void} ouvrir */
function sourceDe(doc, rangee, ouvrir) {
  const source = cree(doc, "p");
  source.className = "source";
  if (rangee.enCours === true) source.append(cree(doc, "small", MOTS.enCours));
  else if (rangee.pr === undefined) source.append(cree(doc, "small", MOTS.source));
  else {
    const { url, retrait } = rangee.pr;
    source.className = "source propose";
    const lien = boutonAction(doc, nomDeLaPr(url), () => ouvrir(url));
    lien.className = "action ouvrir-la-pr";
    if (lien.children[0] !== undefined) lien.children[0].title = url;
    source.append(cree(doc, "small", retrait ? MOTS.retraitPropose : MOTS.propose), lien);
  }
  return source;
}

// Une rangée : le login — un champ, sur une rangée neuve —, d'où vient sa valeur, ses rôles en cases et « remove » ;
// dessous, le refus du dernier geste, en une ligne.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Rangee, gestes: { ecrire: (rangee: Rangee, roles: Role[], login: string) => void, retirer: (rangee: Rangee) => void, annuler: (rangee: Rangee) => void, ouvrir: (url: string) => void } }} options
 */
export function poserUnHumain(doc, { rangee, gestes }) {
  const racine = cree(doc, "div");
  racine.className = rangee.neuve ? "humain neuf" : "humain";
  racine.dataset.login = rangee.login;
  const occupe = rangee.enCours === true;
  // Une rangée dont le retrait est proposé ne se change plus : sa PR est ouverte.
  const fige = occupe || rangee.pr?.retrait === true;

  /** @type {any} */
  let saisie;
  if (rangee.neuve && rangee.pr === undefined) {
    saisie = cree(doc, "input");
    saisie.type = "text";
    saisie.className = "login mono";
    saisie.ariaLabel = MOTS.login;
    saisie.placeholder = MOTS.login;
    saisie.spellcheck = false;
    saisie.value = rangee.login;
    saisie.disabled = occupe;
    // Le login s'écrit sans rien envoyer ; il part quand le champ change — Entrée, ou le focus qui s'en va.
    saisie.addEventListener("input", () => {
      rangee.login = saisie.value;
    });
    saisie.addEventListener("change", () => {
      if (saisie.value.trim() !== "") gestes.ecrire(rangee, rangee.roles, saisie.value.trim());
    });
    racine.append(saisie);
  } else {
    const nom = cree(doc, "strong", rangee.login);
    nom.className = "login mono";
    racine.append(nom);
  }
  racine.append(sourceDe(doc, rangee, gestes.ouvrir));

  const champ = cree(doc, "p");
  champ.className = "champ";
  for (const role of ROLES) {
    const coche = caseACocher(doc, { nom: role, dit: "", cochee: rangee.roles.includes(role) }, (cochee) => {
      const roles = ROLES.filter((pris) => (pris === role ? cochee : rangee.roles.includes(pris)));
      // Une rangée neuve sans login garde ses cases : rien ne part tant qu'il n'est pas écrit.
      if (rangee.neuve && rangee.pr === undefined && rangee.login.trim() === "") rangee.roles = roles;
      else gestes.ecrire(rangee, roles, rangee.login.trim());
    });
    coche.className = "role";
    /** @type {any} */
    const caseCochee = coche.children[0];
    if (caseCochee !== undefined) caseCochee.disabled = fige;
    champ.append(coche);
  }
  const garderLaRangee = rangee.neuve && rangee.pr === undefined;
  const geste = boutonAction(doc, garderLaRangee ? MOTS.annuler : MOTS.retirer, () => (garderLaRangee ? gestes.annuler(rangee) : gestes.retirer(rangee)));
  geste.className = garderLaRangee ? "action annuler" : "action retirer";
  /** @type {any} */
  const bouton = geste.children[0];
  if (bouton !== undefined) {
    bouton.disabled = fige;
    if (!garderLaRangee) bouton.ariaLabel = `remove ${rangee.login}`;
  }
  champ.append(geste);
  racine.append(champ);

  if (rangee.refus !== undefined) {
    const refus = cree(doc, "p");
    refus.className = "refus";
    refus.role = "alert";
    refus.append(cree(doc, "span", rangee.refus.ligne));
    if (rangee.refus.detail.trim() !== "") refus.append(survol(doc, rangee.refus.detail));
    racine.append(refus);
  }
  return racine;
}

// La section : son titre, son aide au survol et « add a human » ; puis une rangée par humain — ou, sans aucun, la ligne
// vide et de quoi ajouter le premier. Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: Etat, gestes: { ajouter: () => void, ecrire: (rangee: Rangee, roles: Role[], login: string) => void, retirer: (rangee: Rangee) => void, annuler: (rangee: Rangee) => void, ouvrir: (url: string) => void } }} options
 */
export function poserLesHumains(doc, { etat, gestes }) {
  if (etat.lecture === "sans" || etat.lecture === "en-cours") return null;
  const section = cree(doc, "section");
  section.className = "humains-du-projet";
  section.ariaLabel = "The project's humans";
  const tete = cree(doc, "div");
  tete.className = "tete";
  const titre = cree(doc, "span", TITRE);
  titre.className = "nom";
  titre.append(survol(doc, MOTS.aide));
  tete.append(titre);
  section.append(tete);
  if (etat.lecture === "refus") {
    section.append(lectureIndisponible(doc, etat.ligne, etat.detail));
    return section;
  }
  if (etat.rangees.length === 0) {
    const vide = cree(doc, "p");
    vide.className = "aucun";
    const premier = boutonAction(doc, MOTS.premier, gestes.ajouter, { recommande: true });
    premier.className = "action ajouter";
    vide.append(cree(doc, "span", MOTS.vide), premier);
    section.append(vide);
    return section;
  }
  const ajouter = boutonAction(doc, MOTS.ajouter, gestes.ajouter);
  ajouter.className = "action ajouter";
  tete.append(ajouter);
  section.append(...etat.rangees.map((rangee) => poserUnHumain(doc, { rangee, gestes })));
  return section;
}

/** @param {unknown} erreur */
const message = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qu'une écriture a rendu, lu : un lien de PR, ou un refus — toute autre réponse est un refus, jamais une PR devinée.
/** @param {unknown} rendu @returns {{ pr: string } | { refus: string, detail: string }} */
export function renduLu(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { pr, refus, detail } = /** @type {Record<string, unknown>} */ (rendu);
    if (typeof pr === "string" && pr.trim() !== "") return { pr: pr.trim() };
    // Le refus tient en une ligne : sa première, le reste au survol.
    if (typeof refus === "string" && refus.trim() !== "") {
      const [ligne = "", ...reste] = refus.trim().split("\n");
      return { refus: ligne.trim(), detail: [...reste, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// L'état des humains de chaque projet, d'une ouverture à l'autre, tenu par le conteneur de la page : une PR ouverte
// reste dite tant que la page vit.
/** @type {WeakMap<object, Map<string, Etat>>} */
const etatsDesConteneurs = new WeakMap();
let neuves = 0;

// Monte la section dans son conteneur, pour un projet : lit les humains, les pose, et répond aux gestes. Le conteneur
// retient le projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} conteneur
 * @param {{ projet: string, service: Service, ouvrir: (url: string) => void }} options
 */
export async function monterLesHumains(doc, conteneur, { projet, service, ouvrir }) {
  conteneur.dataset.projet = projet;
  /** @type {Map<string, Etat>} */
  const etats = etatsDesConteneurs.get(conteneur) ?? new Map();
  etatsDesConteneurs.set(conteneur, etats);
  const poser = () => {
    if (conteneur.dataset.projet !== projet) return;
    const pose = poserLesHumains(doc, { etat: etats.get(projet) ?? { lecture: "en-cours" }, gestes });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  };
  const rangees = () => {
    const etat = etats.get(projet);
    return etat?.lecture === "lue" ? etat.rangees : null;
  };

  /** @param {Rangee} rangee @param {Role[]} roles @param {string} login */
  async function ecrire(rangee, roles, login) {
    if (rangee.enCours === true) return;
    rangee.login = login;
    rangee.roles = roles;
    rangee.enCours = true;
    rangee.refus = undefined;
    poser();
    /** @type {unknown} */
    let recu;
    try {
      recu = await service.save({ login, roles });
    } catch (erreur) {
      recu = { refus: MOTS.rienEnvoye, detail: message(erreur) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("pr" in lu) {
      rangee.pr = { url: lu.pr, retrait: false };
      rangee.avant = roles;
    } else {
      rangee.refus = { ligne: lu.refus, detail: lu.detail };
      // Rien n'a changé : les rôles reviennent à ce qui était.
      rangee.roles = rangee.avant;
    }
    poser();
  }

  /** @param {Rangee} rangee */
  async function retirer(rangee) {
    if (rangee.enCours === true) return;
    rangee.enCours = true;
    rangee.refus = undefined;
    poser();
    /** @type {unknown} */
    let recu;
    try {
      recu = await service.remove(rangee.login);
    } catch (erreur) {
      recu = { refus: MOTS.rienEnvoye, detail: message(erreur) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("pr" in lu) rangee.pr = { url: lu.pr, retrait: true };
    else rangee.refus = { ligne: lu.refus, detail: lu.detail };
    poser();
  }

  const gestes = {
    ajouter: () => {
      const liste = rangees();
      if (liste === null) return;
      liste.push({ cle: `neuve-${++neuves}`, login: "", roles: [], avant: [], neuve: true });
      poser();
    },
    /** @param {Rangee} rangee @param {Role[]} roles @param {string} login */
    ecrire: (rangee, roles, login) => void ecrire(rangee, roles, login),
    /** @param {Rangee} rangee */
    retirer: (rangee) => void retirer(rangee),
    /** @param {Rangee} rangee */
    annuler: (rangee) => {
      const liste = rangees();
      if (liste === null) return;
      etats.set(projet, { lecture: "lue", rangees: liste.filter((autre) => autre !== rangee) });
      poser();
    },
    ouvrir,
  };

  // Une lecture déjà faite se pose tout de suite, avec ce que le chef y a fait ; la relecture la remplace sans perdre
  // une PR ouverte ni une rangée neuve.
  poser();
  /** @type {Etat} */
  let lu;
  try {
    const humains = await service.list();
    if (humains === undefined) lu = { lecture: "sans" };
    else if (!Array.isArray(humains)) lu = { lecture: "refus", ligne: typeof humains?.sans === "string" ? humains.sans : MOTS.indisponible, detail: humains?.detail ?? JSON.stringify(humains) };
    else {
      const avant = rangees() ?? [];
      const declares = humains.map((humain) => {
        const roles = ROLES.filter((role) => humain.roles.includes(role));
        const tenue = avant.find((rangee) => rangee.login.toLowerCase() === humain.login.toLowerCase());
        return tenue?.pr !== undefined || tenue?.enCours === true ? tenue : { cle: humain.login, login: humain.login, roles, avant: roles, neuve: false };
      });
      // Une rangée neuve écrite depuis, que le dépôt déclare maintenant, n'est plus neuve.
      const restantes = avant.filter((rangee) => rangee.neuve && !declares.some((declare) => declare.login.toLowerCase() === rangee.login.toLowerCase()));
      lu = { lecture: "lue", rangees: [...declares, ...restantes] };
    }
  } catch (erreur) {
    lu = { lecture: "refus", ligne: MOTS.indisponible, detail: message(erreur) };
  }
  etats.set(projet, lu);
  poser();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — la
// section ne se pose pas — et une écriture le dit en refus.
/**
 * @param {Partial<Pick<import("../pont.d.ts").Pont, "listerLesHumains" | "enregistrerUnHumain" | "retirerUnHumain">>} pont
 * @param {string} projet
 * @returns {Service}
 */
export function serviceDuPont(pont, projet) {
  return {
    list: async () => (typeof pont.listerLesHumains === "function" ? pont.listerLesHumains(projet) : undefined),
    save: async (humain) => (typeof pont.enregistrerUnHumain === "function" ? pont.enregistrerUnHumain(projet, humain) : { refus: MOTS.rienEnvoye }),
    remove: async (login) => (typeof pont.retirerUnHumain === "function" ? pont.retirerUnHumain(projet, login) : { refus: MOTS.rienEnvoye }),
  };
}
