// @ts-check
// Les humains du projet sous Settings (ticket 2930, épique 2926) : ceux que son `.claude/brigade/projet.json` déclare
// (`humans`, ticket 2759), une rangée chacun — son login et ses rôles. Ajouter un humain par une rangée neuve, changer ses
// rôles ou le retirer s'applique au changement, sans « Save » : chaque geste part tout de suite au service. Les humains
// vivent dans le dépôt : un changement s'y écrit par une PR, et la rangée le dit — puis le lien de la PR, une fois
// ouverte. Chaque rangée est la rangée de réglage de l'app (composants/setting, ticket 2920) : la ligne qui dit la PR
// (`PAR_PR`) et ce que le dernier geste a rendu (`ditDuReglage`) s'y disent comme partout ailleurs. Refusé (login inconnu, pas d'accès au dépôt), le refus se dit en une ligne sur la rangée du login concerné,
// et la rangée revient à ce qui était : elle ne dit pas le changement fait.
//
// Le service a ce contrat : `list()` rend les humains ; `save(humain)` en ajoute ou en change un ; `remove(login)` en
// retire un ; chaque écriture rend le lien de la PR, ou un refus d'une ligne. Ce module ne touche pas `document` : il
// reçoit de quoi créer un élément (briques.js), et le conteneur où se poser.

import { buttonAction, caseACocher, survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "../composants/setting/setting.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { ANNULER, NON_ATTEINT } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {"product" | "design" | "review" | "client-contact"} Role */
/** @typedef {{ login: string, roles: Role[] }} Human */
// Ce qu'une écriture rend : le lien de la PR ouverte, ou le refus en une ligne — son détail, s'il y en a, au survol.
/** @typedef {{ pr: string } | { refus: string, detail?: string }} Rendu */
// `list` rend `undefined` quand le pont ne porte pas les humains (un téléphone) : la section ne se pose pas ; `{ sans }` quand
// ils ne se lisent pas : la section le dit en une ligne.
/** @typedef {{ list(): Promise<Human[] | { sans: string, detail?: string } | undefined>, save(human: Human): Promise<Rendu>, remove(login: string): Promise<Rendu> }} Service */
// Une rangée : le login, les rôles montrés, ceux d'avant le dernier geste — ce qui revient sur un refus —, ceux que
// projet.json déclare, si c'est une rangée neuve, le geste en cours, la PR ouverte et ce qu'elle fait, ou le refus.
/**
 * @typedef {{
 *   cle: string,
 *   login: string,
 *   roles: Role[],
 *   avant: Role[],
 *   declares: Role[],
 *   neuve: boolean,
 *   enCours?: boolean,
 *   pr?: { url: string, retrait: boolean },
 *   refus?: { ligne: string, detail: string },
 * }} Rangee
 */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Rangee[] }} State */

export const ROLES = /** @type {const} */ (["product", "design", "review", "client-contact"]);
export const TITRE = "humans";
export const MOTS = {
  aide: "The people who work on this project, with their roles. They are kept in the project's repository (.claude/brigade/projet.json): each change is proposed as a pull request, and applies once merged.",
  enCours: "writing to projet.json…",
  retrait: "removal",
  sansRole: "no role",
  pasDeclare: "not declared",
  vide: "No human is declared for this project.",
  premier: "add the first human",
  ajouter: "add a human",
  retirer: "remove",
  annuler: ANNULER,
  login: "GitHub login",
  indisponible: NON_ATTEINT("humans"),
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
export function nameDeLaPr(url) {
  const numero = /\/pull\/(\d+)/.exec(url)?.[1];
  return numero === undefined ? "pull request" : `PR #${numero}`;
}

// Ce que les gestes de la rangée ont rendu, sous elle, dit comme sous toute rangée de réglage : l'écriture en route, ou
// la PR ouverte — celle du retrait se dit « removal » —, puis le refus du dernier geste. Une PR ouverte reste dite sous
// un refus qui la suit : elle est toujours ouverte.
/** @param {Fabrique} doc @param {Rangee} rangee @param {(url: string) => void} ouvrir */
function ditDeLaRangee(doc, rangee, ouvrir) {
  /** @type {any[]} */
  const dit = [];
  if (rangee.enCours === true) dit.push(...ditDuSetting(doc, { enCours: MOTS.enCours }));
  else if (rangee.pr !== undefined) {
    const { url, retrait } = rangee.pr;
    const numero = /\/pull\/(\d+)/.exec(url)?.[1];
    const [line] = ditDuSetting(doc, { pr: url, numero: Number(numero ?? 0), valeur: retrait ? MOTS.retrait : "" }, { ouvrir });
    // Un lien sans numéro se dit « pull request », sans numéro deviné.
    const button = numero === undefined ? line?.children?.[1]?.children?.[0] : undefined;
    if (button !== undefined) button.textContent = nameDeLaPr(url);
    dit.push(line);
  }
  if (rangee.refus !== undefined) dit.push(...ditDuSetting(doc, { refus: rangee.refus.ligne, detail: rangee.refus.detail }));
  return dit;
}

// Les rôles que projet.json déclare pour le login, en vigueur tant qu'aucune PR n'est mergée.
/** @param {Fabrique} doc @param {Rangee} rangee */
function enVigueur(doc, rangee) {
  if (rangee.neuve) return [cree(doc, "small", MOTS.pasDeclare)];
  const roles = cree(doc, "strong", rangee.declares.length === 0 ? MOTS.sansRole : rangee.declares.join(", "));
  roles.className = "roles";
  return [roles];
}

// Une rangée : le login — un champ, sur une rangée neuve —, les rôles en vigueur, ses rôles en cases et « remove » ;
// dessous, la ligne qui dit qu'un changement ouvre une PR, puis ce que le dernier geste a rendu.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Rangee, gestes: { ecrire: (rangee: Rangee, roles: Role[], login: string) => void, retirer: (rangee: Rangee) => void, annuler: (rangee: Rangee) => void, ouvrir: (url: string) => void } }} options
 */
export function poserUnHuman(doc, { rangee, gestes: actions }) {
  const occupe = rangee.enCours === true;
  // Une rangée dont le retrait est proposé ne se change plus : sa PR est ouverte.
  const fige = occupe || rangee.pr?.retrait === true;

  /** @type {any} */
  let saisie;
  /** @type {any} */
  let login;
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
      if (saisie.value.trim() !== "") actions.ecrire(rangee, rangee.roles, saisie.value.trim());
    });
    login = saisie;
  } else {
    login = cree(doc, "strong", rangee.login);
    login.className = "login mono";
  }

  /** @type {any[]} */
  const champ = [];
  for (const role of ROLES) {
    const coche = caseACocher(doc, { nom: role, dit: "", cochee: rangee.roles.includes(role) }, (cochee) => {
      const roles = ROLES.filter((taken) => (taken === role ? cochee : rangee.roles.includes(taken)));
      // Une rangée neuve sans login garde ses cases : rien ne part tant qu'il n'est pas écrit.
      if (rangee.neuve && rangee.pr === undefined && rangee.login.trim() === "") rangee.roles = roles;
      else actions.ecrire(rangee, roles, rangee.login.trim());
    });
    coche.className = "role";
    /** @type {any} */
    const caseCochee = coche.children[0];
    if (caseCochee !== undefined) caseCochee.disabled = fige;
    champ.push(coche);
  }
  const garderLaRangee = rangee.neuve && rangee.pr === undefined;
  const action = buttonAction(doc, garderLaRangee ? MOTS.annuler : MOTS.retirer, () => (garderLaRangee ? actions.annuler(rangee) : actions.retirer(rangee)), { sorte: garderLaRangee ? "discret" : "danger" });
  action.className = garderLaRangee ? "action annuler" : "action retirer";
  /** @type {any} */
  const button = action.children[0];
  if (button !== undefined) {
    button.disabled = fige;
    if (!garderLaRangee) button.ariaLabel = `remove ${rangee.login}`;
  }
  champ.push(action);

  const racine = rangeeDeSetting(doc, { nom: "", valeur: enVigueur(doc, rangee), controle: champ, depot: true, dessous: ditDeLaRangee(doc, rangee, actions.ouvrir) });
  racine.className = rangee.neuve ? "reglage humain neuf" : "reglage humain";
  racine.dataset.login = rangee.login;
  // Le nom de la rangée est le login : écrit, ou son champ sur une rangée neuve.
  racine.children[0].append(login);
  return racine;
}

// La section : son titre, son aide au survol et « add a human » ; puis une rangée par humain — ou, sans aucun, la ligne
// vide et de quoi ajouter le premier. Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: State, gestes: { ajouter: () => void, ecrire: (rangee: Rangee, roles: Role[], login: string) => void, retirer: (rangee: Rangee) => void, annuler: (rangee: Rangee) => void, ouvrir: (url: string) => void } }} options
 */
export function poserLesHumans(doc, { etat: state, gestes: actions }) {
  if (state.lecture === "sans" || state.lecture === "en-cours") return null;
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
  if (state.lecture === "refus") {
    section.append(lineError(doc, state.ligne, state.detail));
    return section;
  }
  if (state.rangees.length === 0) {
    const empty = cree(doc, "div");
    empty.className = "aucun";
    empty.append(lineEmpty(doc, MOTS.vide, { classe: "", balise: "span" }));
    const first = buttonAction(doc, MOTS.premier, actions.ajouter, { recommande: true });
    first.className = "action ajouter";
    empty.append(first);
    section.append(empty);
    return section;
  }
  const ajouter = buttonAction(doc, MOTS.ajouter, actions.ajouter);
  ajouter.className = "action ajouter";
  tete.append(ajouter);
  section.append(...state.rangees.map((rangee) => poserUnHuman(doc, { rangee, gestes: actions })));
  return section;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

// Ce qu'une écriture a rendu, lu : un lien de PR, ou un refus — toute autre réponse est un refus, jamais une PR devinée.
/** @param {unknown} rendu @returns {{ pr: string } | { refus: string, detail: string }} */
export function renduLu(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { pr, refus: refusal, detail } = /** @type {Record<string, unknown>} */ (rendu);
    if (typeof pr === "string" && pr.trim() !== "") return { pr: pr.trim() };
    // Le refus tient en une ligne : sa première, le reste au survol.
    if (typeof refusal === "string" && refusal.trim() !== "") {
      const [line = "", ...reste] = refusal.trim().split("\n");
      return { refus: line.trim(), detail: [...reste, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// L'état des humains de chaque projet, d'une ouverture à l'autre, tenu par le conteneur de la page : une PR ouverte
// reste dite tant que la page vit.
/** @type {WeakMap<object, Map<string, State>>} */
const statesDesConteneurs = new WeakMap();
let neuves = 0;

// Monte la section dans son conteneur, pour un projet : lit les humains, les pose, et répond aux gestes. Le conteneur
// retient le projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} conteneur
 * @param {{ projet: string, service: Service, ouvrir: (url: string) => void }} options
 */
export async function monterLesHumans(doc, conteneur, { projet: project, service, ouvrir }) {
  conteneur.dataset.projet = project;
  /** @type {Map<string, State>} */
  const states = statesDesConteneurs.get(conteneur) ?? new Map();
  statesDesConteneurs.set(conteneur, states);
  const poser = () => {
    if (conteneur.dataset.projet !== project) return;
    const pose = poserLesHumans(doc, { etat: states.get(project) ?? { lecture: "en-cours" }, gestes: actions });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  };
  const rangees = () => {
    const state = states.get(project);
    return state?.lecture === "lue" ? state.rangees : null;
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
    } catch (error) {
      recu = { refus: MOTS.rienEnvoye, detail: message(error) };
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
    } catch (error) {
      recu = { refus: MOTS.rienEnvoye, detail: message(error) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("pr" in lu) rangee.pr = { url: lu.pr, retrait: true };
    else rangee.refus = { ligne: lu.refus, detail: lu.detail };
    poser();
  }

  const actions = {
    ajouter: () => {
      const liste = rangees();
      if (liste === null) return;
      liste.push({ cle: `neuve-${++neuves}`, login: "", roles: [], avant: [], declares: [], neuve: true });
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
      states.set(project, { lecture: "lue", rangees: liste.filter((autre) => autre !== rangee) });
      poser();
    },
    ouvrir,
  };

  // Une lecture déjà faite se pose tout de suite, avec ce que le chef y a fait ; la relecture la remplace sans perdre
  // une PR ouverte ni une rangée neuve.
  poser();
  /** @type {State} */
  let lu;
  try {
    const humans = await service.list();
    if (humans === undefined) lu = { lecture: "sans" };
    else if (!Array.isArray(humans)) lu = { lecture: "refus", ligne: typeof humans?.sans === "string" ? humans.sans : MOTS.indisponible, detail: humans?.detail ?? JSON.stringify(humans) };
    else {
      const avant = rangees() ?? [];
      const declares = humans.map((human) => {
        const roles = ROLES.filter((role) => human.roles.includes(role));
        const tenue = avant.find((rangee) => rangee.login.toLowerCase() === human.login.toLowerCase());
        // Une rangée tenue — sa PR ouverte, son geste en route — reste la même : ses gestes la tiennent. Ce que projet.json
        // déclare y est mis à jour.
        if (tenue !== undefined && (tenue.pr !== undefined || tenue.enCours === true)) {
          tenue.declares = roles;
          return tenue;
        }
        return { cle: human.login, login: human.login, roles, avant: roles, declares: roles, neuve: false };
      });
      // Une rangée neuve écrite depuis, que le dépôt déclare maintenant, n'est plus neuve.
      const restantes = avant.filter((rangee) => rangee.neuve && !declares.some((declare) => declare.login.toLowerCase() === rangee.login.toLowerCase()));
      lu = { lecture: "lue", rangees: [...declares, ...restantes] };
    }
  } catch (error) {
    lu = { lecture: "refus", ligne: MOTS.indisponible, detail: message(error) };
  }
  states.set(project, lu);
  poser();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — la
// section ne se pose pas — et une écriture le dit en refus.
/**
 * @param {Partial<Pick<import("../pont.d.ts").Pont, "listerLesHumains" | "enregistrerUnHumain" | "retirerUnHumain">>} pont
 * @param {string} project
 * @returns {Service}
 */
export function serviceDuPont(pont, project) {
  return {
    list: async () => (typeof pont.listerLesHumains === "function" ? pont.listerLesHumains(project) : undefined),
    save: async (human) => (typeof pont.enregistrerUnHumain === "function" ? pont.enregistrerUnHumain(project, human) : { refus: MOTS.rienEnvoye }),
    remove: async (login) => (typeof pont.retirerUnHumain === "function" ? pont.retirerUnHumain(project, login) : { refus: MOTS.rienEnvoye }),
  };
}
