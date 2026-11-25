// @ts-check
// L'onglet Agents de la page d'un projet (ticket 4224, épique 4117, écran Project.dc.html) : à côté de Rail, Stations et
// Settings, une carte par agent que `GET /api/agents` rend. Chaque carte dit son nom, son rôle en une phrase, son état —
// idle, `working on #N`, broken, un agent cassé marqué en rouge —, sa prochaine passe, et ses chiffres des 7 derniers jours,
// chacun avec son libellé, sa valeur et son sens écrit à côté. Ses réglages sont dessous, sur la même carte : un champ pour
// chaque réglage qui se change de l'app, qui s'applique dès qu'il change (`PUT /api/agents/:id/settings`) et dit ensuite
// quand et par qui il a été changé ; un refus (400) dit sa raison et garde l'ancienne valeur. Un réglage qui ne se change
// pas de l'app dit où il vit (`livesIn`), sans champ. Un clic sur l'agent ouvre ses derniers gestes, chacun avec sa raison
// (`GET /api/agents/:id/gestures`) ; un agent sans geste le dit.
// Les données passent par agents/source.js, et par lui seul. Une lecture qui échoue, ou qui ne se lit pas, se dit en une
// ligne, son détail au survol : aucune valeur n'est inventée. Ce module ne touche pas `document` : il reçoit de quoi créer
// un élément (briques.js).

import { bouton } from "../composants/bouton/bouton.js";
import { interrupteur } from "../composants/interrupteur/interrupteur.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { marque } from "../composants/pastille/pastille.js";
import { ditDuReglage, rangeeDeReglage } from "../composants/reglage/reglage.js";
import { LECTURE_DE, NON_ATTEINT, PAS_ENCORE } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../composants/reglage/reglage.js").Dit} Dit */
/** @typedef {{ label: string, value: string | number, meaning: string }} Chiffre */
/**
 * Un agent, tel que `GET /api/agents` le rend.
 * @typedef {{ id: string, name: string, role: string, state: "idle" | "working" | "broken", workingOn: number | null, nextRun: string | null, figures: Chiffre[], settings: unknown }} Agent
 */
/**
 * Un réglage, tel que `GET /api/agents/:id/settings` le rend.
 * @typedef {{ key: string, label: string, kind: string, value: unknown, source: string, editable: boolean, livesIn?: string | null, changedAt: string | null, changedBy: string | null }} Champ
 */
/** @typedef {{ at: string, summary: string, reason: string, issue: number | null }} Geste */
/** @typedef {{ ligne: string, detail: string }} Echec */

const TITRE = "Agents";
const ILLISIBLE = "the agents' reading is not readable";
const INDISPONIBLE = NON_ATTEINT("the agents");
const AUCUN_AGENT = PAS_ENCORE("agent");
const AUCUN_GESTE = PAS_ENCORE("gesture");
const REGLAGES = "Settings";
const DERNIERS_GESTES = "Last gestures";
const SEPT_JOURS = "last 7 days";
const VIT_DANS = "lives in";
const EN_COURS = "changing…";
const SANS_LE_PONT = "the app does not carry the agents' API yet";
const NON_CHANGE = "not changed";
const REGLAGES_NON_LUS = "its settings not read";
const GESTES_NON_LUS = "its gestures not read";
const REGLAGE_ILLISIBLE = "this setting is not readable";
/** @param {number | null} ticket */
const AU_TRAVAIL = (ticket) => (ticket === null ? "working" : `working on #${ticket}`);
const ETATS = { idle: "idle", broken: "broken" };
// Le ton de la marque de chaque état (composants/pastille) : un agent cassé est rouge, jamais gris comme un agent au repos.
const TONS = { idle: "gris", working: "vert", broken: "rouge" };
const NIVEAUX = ["observe", "propose", "act"];
// D'où vient une valeur que personne n'a changée depuis l'app.
const SOURCES = { default: "its default", env: "the box's variable", app: "the app" };

// --- Ce que la lecture doit porter -----------------------------------------------------------

/** @param {unknown} un @returns {un is Chiffre} */
const estUnChiffre = (un) => {
  const chiffre = /** @type {any} */ (un);
  return typeof chiffre?.label === "string" && (typeof chiffre.value === "string" || typeof chiffre.value === "number") && typeof chiffre.meaning === "string";
};
/** @param {unknown} un @returns {un is Agent} */
const estUnAgent = (un) => {
  const agent = /** @type {any} */ (un);
  return (
    typeof agent?.id === "string" &&
    typeof agent.name === "string" &&
    typeof agent.role === "string" &&
    ["idle", "working", "broken"].includes(agent.state) &&
    (agent.workingOn === null || Number.isInteger(agent.workingOn)) &&
    (agent.nextRun === null || typeof agent.nextRun === "string") &&
    Array.isArray(agent.figures) &&
    agent.figures.every(estUnChiffre)
  );
};
/** @param {unknown} un @returns {un is Champ} */
const estUnChamp = (un) => {
  const champ = /** @type {any} */ (un);
  return (
    typeof champ?.key === "string" &&
    typeof champ.label === "string" &&
    typeof champ.kind === "string" &&
    typeof champ.editable === "boolean" &&
    (champ.changedAt === null || typeof champ.changedAt === "string") &&
    (champ.changedBy === null || typeof champ.changedBy === "string")
  );
};
/** @param {unknown} un @returns {un is Geste} */
const estUnGeste = (un) => {
  const geste = /** @type {any} */ (un);
  return typeof geste?.at === "string" && typeof geste.summary === "string" && typeof geste.reason === "string" && (geste.issue === null || Number.isInteger(geste.issue));
};
/** @param {unknown} corps @returns {Champ[] | undefined} */
const champsDe = (corps) => {
  const fields = /** @type {any} */ (corps)?.fields;
  return Array.isArray(fields) ? fields : undefined;
};

// La raison qu'une réponse refusée porte (`{ reason }`), ou son statut.
/** @param {{ statut: number, corps: unknown }} reponse */
const raisonDe = (reponse) => {
  const reason = /** @type {any} */ (reponse.corps)?.reason;
  return typeof reason === "string" && reason !== "" ? reason : `the runtime answered ${reponse.statut}`;
};
/** @param {unknown} erreur */
const detailDe = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// --- Les mots de la carte ---------------------------------------------------------------------

// Une date de l'API, en clair, en UTC : « Nov 25, 14:00 UTC ». Ce qui ne se lit pas comme une date est rendu tel quel.
/** @param {string} iso */
const quand = (iso) =>
  Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })} UTC`;

/** @param {Agent} agent */
const etatDit = (agent) => (agent.state === "working" ? AU_TRAVAIL(agent.workingOn) : ETATS[agent.state]);
/** @param {Agent} agent */
const prochaineDite = (agent) => `next run: ${agent.nextRun === null ? "not known" : quand(agent.nextRun)}`;

// Une valeur de réglage, en mots : un interrupteur dit on ou off ; rien de réglé, « not set ».
/** @param {unknown} valeur */
const valeurDite = (valeur) => (valeur === null || valeur === undefined || valeur === "" ? "not set" : valeur === true ? "on" : valeur === false ? "off" : String(valeur));
// D'où vient la valeur en vigueur : changée depuis l'app, quand et par qui ; sinon sa source.
/** @param {Champ} champ */
const provenance = (champ) =>
  champ.changedAt !== null && champ.changedBy !== null ? `changed ${quand(champ.changedAt)} by ${champ.changedBy}` : `from ${SOURCES[/** @type {keyof typeof SOURCES} */ (champ.source)] ?? champ.source}`;

/**
 * Ce qu'un champ tapé envoie : un nombre pour un réglage chiffré qui se lit comme un nombre ; sinon le texte, que le runtime
 * refuse en disant pourquoi.
 * @param {string} kind @param {string} saisie
 */
const valeurEnvoyee = (kind, saisie) => {
  if (kind !== "integer" && kind !== "number") return saisie;
  const nombre = Number(saisie);
  return saisie.trim() !== "" && Number.isFinite(nombre) ? nombre : saisie;
};

// --- L'onglet -----------------------------------------------------------------------------------

/**
 * L'onglet d'un projet, tenu d'une pose à l'autre : `poser(projet)` rend sa section, qui se repose seule quand une lecture
 * ou un réglage répond ; `ouvrir(projet, nom)` ouvre les gestes d'un agent, par son nom ou celui d'un badge (ticket 4029).
 * `valeurs` : les modèles et les efforts qu'une liste propose.
 * @param {Fabrique} doc
 * @param {{ valeurs?: () => { modeles: readonly string[], efforts: readonly string[] } }} [options]
 */
export function tenirLOngletAgents(doc, { valeurs = () => ({ modeles: [], efforts: [] }) } = {}) {
  const section = doc.createElement("section");
  section.className = "onglet-des-agents";
  section.ariaLabel = TITRE;
  section.ariaLive = "polite";
  /** @type {string | undefined} */
  let projet;
  /** @type {Agent[] | null} */
  let agents = null;
  /** @type {Echec | null} */
  let echec = null;
  let demande = 0;
  let luLe = 0;
  /** @type {Map<string, Champ[] | Echec>} */
  const reglages = new Map();
  /** @type {Map<string, Dit>} */
  const dits = new Map();
  /** @type {string | null} */
  let ouvert = null;
  /** @type {Map<string, Geste[] | Echec>} */
  const gestes = new Map();

  /** @param {string} nom */
  const changerDeProjet = (nom) => {
    if (nom === projet) return;
    projet = nom;
    agents = null;
    echec = null;
    luLe = 0;
    ouvert = null;
    reglages.clear();
    dits.clear();
    gestes.clear();
  };

  /** @param {string} nom */
  const lire = (nom) => {
    const la = ++demande;
    luLe = Date.now();
    void Promise.resolve()
      .then(() => source.demander("GET /api/agents", nom))
      .then(
        (reponse) => {
          if (la !== demande || nom !== projet) return;
          if (reponse === null) [agents, echec] = [null, { ligne: INDISPONIBLE, detail: SANS_LE_PONT }];
          else if (reponse.statut !== 200) [agents, echec] = [null, { ligne: INDISPONIBLE, detail: raisonDe(reponse) }];
          else if (Array.isArray(reponse.corps) && reponse.corps.every(estUnAgent)) [agents, echec] = [reponse.corps, null];
          else [agents, echec] = [null, { ligne: ILLISIBLE, detail: JSON.stringify(reponse.corps).slice(0, 400) }];
          for (const agent of agents ?? []) {
            const champs = champsDe(agent.settings);
            if (champs !== undefined) reglages.set(agent.id, champs);
            else if (!reglages.has(agent.id)) lireLesReglages(nom, agent.id);
          }
          if (ouvert !== null && !gestes.has(ouvert)) lireLesGestes(nom, ouvert);
          rendre();
        },
        (/** @type {unknown} */ erreur) => {
          if (la !== demande || nom !== projet) return;
          [agents, echec] = [null, { ligne: INDISPONIBLE, detail: detailDe(erreur) }];
          rendre();
        },
      );
  };

  // Les réglages d'un agent que la liste ne porte pas : lus par leur route.
  /** @param {string} nom @param {string} id */
  const lireLesReglages = (nom, id) => {
    void Promise.resolve()
      .then(() => source.demander(`GET /api/agents/${encodeURIComponent(id)}/settings`, nom))
      .then(
        (reponse) => {
          if (nom !== projet) return;
          const champs = reponse?.statut === 200 ? champsDe(reponse.corps) : undefined;
          reglages.set(id, champs ?? { ligne: REGLAGES_NON_LUS, detail: reponse === null ? SANS_LE_PONT : reponse.statut === 200 ? JSON.stringify(reponse.corps).slice(0, 400) : raisonDe(reponse) });
          rendre();
        },
        (/** @type {unknown} */ erreur) => {
          if (nom !== projet) return;
          reglages.set(id, { ligne: REGLAGES_NON_LUS, detail: detailDe(erreur) });
          rendre();
        },
      );
  };

  /** @param {string} nom @param {string} id */
  const lireLesGestes = (nom, id) => {
    gestes.delete(id);
    void Promise.resolve()
      .then(() => source.demander(`GET /api/agents/${encodeURIComponent(id)}/gestures`, nom))
      .then(
        (reponse) => {
          if (nom !== projet) return;
          if (reponse === null) gestes.set(id, { ligne: GESTES_NON_LUS, detail: SANS_LE_PONT });
          else if (reponse.statut !== 200) gestes.set(id, { ligne: GESTES_NON_LUS, detail: raisonDe(reponse) });
          else if (Array.isArray(reponse.corps) && reponse.corps.every(estUnGeste)) gestes.set(id, reponse.corps);
          else gestes.set(id, { ligne: GESTES_NON_LUS, detail: JSON.stringify(reponse.corps).slice(0, 400) });
          rendre();
        },
        (/** @type {unknown} */ erreur) => {
          if (nom !== projet) return;
          gestes.set(id, { ligne: GESTES_NON_LUS, detail: detailDe(erreur) });
          rendre();
        },
      );
  };

  // Un réglage changé : le PUT part, la rangée dit qu'il est en route ; accepté, la rangée montre la nouvelle valeur, quand
  // et par qui ; refusé, sa raison, et l'ancienne valeur reste.
  /** @param {string} id @param {Champ} champ @param {unknown} valeur */
  const changer = (id, champ, valeur) => {
    const nom = projet;
    if (nom === undefined) return;
    const cle = `${id}/${champ.key}`;
    dits.set(cle, { enCours: EN_COURS });
    rendre();
    void Promise.resolve()
      .then(() => source.demander(`PUT /api/agents/${encodeURIComponent(id)}/settings`, nom, { key: champ.key, value: valeur }))
      .then(
        (reponse) => {
          if (nom !== projet) return;
          if (reponse === null) dits.set(cle, { refus: NON_CHANGE, detail: SANS_LE_PONT });
          else if (reponse.statut === 200 && estUnChamp(reponse.corps)) {
            const nouveau = reponse.corps;
            const tenus = reglages.get(id);
            if (Array.isArray(tenus)) reglages.set(id, tenus.map((un) => (un.key === nouveau.key ? nouveau : un)));
            dits.delete(cle);
          } else if (reponse.statut === 200) dits.set(cle, { refus: NON_CHANGE, detail: `${REGLAGE_ILLISIBLE}: ${JSON.stringify(reponse.corps).slice(0, 400)}` });
          else dits.set(cle, { refus: `${NON_CHANGE}: ${raisonDe(reponse)}` });
          rendre();
        },
        (/** @type {unknown} */ erreur) => {
          if (nom !== projet) return;
          dits.set(cle, { refus: NON_CHANGE, detail: detailDe(erreur) });
          rendre();
        },
      );
  };

  /** @param {string} id */
  const basculer = (id) => {
    if (projet === undefined) return;
    ouvert = ouvert === id ? null : id;
    if (ouvert !== null) lireLesGestes(projet, ouvert);
    rendre();
  };

  const rendre = () => {
    if (echec !== null) return void section.replaceChildren(ligneErreur(doc, echec.ligne, echec.detail));
    if (agents === null) return void section.replaceChildren(texte("p", LECTURE_DE("the agents"), "lecture"));
    if (agents.length === 0) return void section.replaceChildren(ligneVide(doc, AUCUN_AGENT));
    const grille = doc.createElement("div");
    grille.className = "cartes-des-agents";
    grille.append(...agents.map(carte));
    section.replaceChildren(grille);
  };

  /** @param {string} balise @param {string} dit @param {string} [classe] */
  const texte = (balise, dit, classe) => {
    const cree = doc.createElement(balise);
    if (classe !== undefined) cree.className = classe;
    cree.textContent = dit;
    return cree;
  };

  /** @param {Agent} agent */
  const carte = (agent) => {
    const cree = doc.createElement("article");
    cree.className = "carte-d-agent";
    cree.dataset.agent = agent.id;
    cree.dataset.etat = agent.state;
    // Le nom est le bouton qui ouvre ses gestes : un clic sur l'agent, pas sur un de ses champs.
    const nomme = bouton(doc, agent.name, () => basculer(agent.id), { sorte: "discret" });
    nomme.className = "nom-de-l-agent";
    nomme.ariaExpanded = String(ouvert === agent.id);
    const etat = doc.createElement("p");
    etat.className = "etat-de-l-agent";
    etat.dataset.etat = agent.state;
    etat.append(marque(doc, TONS[agent.state]), texte("span", etatDit(agent)));
    const tete = doc.createElement("header");
    tete.append(nomme, etat);
    cree.append(tete, texte("p", agent.role, "role"), texte("p", prochaineDite(agent), "prochaine"), chiffres(agent), sesReglages(agent));
    if (ouvert === agent.id) cree.append(sesGestes(agent));
    return cree;
  };

  /** @param {Agent} agent */
  const chiffres = (agent) => {
    const liste = doc.createElement("dl");
    liste.className = "chiffres-de-l-agent";
    liste.ariaLabel = `${agent.name}, ${SEPT_JOURS}`;
    for (const chiffre of agent.figures) {
      const un = doc.createElement("div");
      un.className = "chiffre";
      const libelle = texte("dt", chiffre.label, "libelle");
      const valeur = texte("dd", String(chiffre.value), "valeur");
      const sens = texte("dd", chiffre.meaning, "sens");
      un.append(valeur, libelle, sens);
      liste.append(un);
    }
    return liste;
  };

  /** @param {Agent} agent */
  const sesReglages = (agent) => {
    const partie = doc.createElement("div");
    partie.className = "reglages-de-l-agent";
    partie.append(texte("h4", REGLAGES));
    const tenus = reglages.get(agent.id);
    if (tenus === undefined) partie.append(texte("p", LECTURE_DE("its settings"), "lecture"));
    else if (!Array.isArray(tenus)) partie.append(ligneErreur(doc, tenus.ligne, tenus.detail));
    else partie.append(...tenus.map((champ) => rangee(agent, champ)));
    return partie;
  };

  /** @param {Agent} agent @param {unknown} champ */
  const rangee = (agent, champ) => {
    if (!estUnChamp(champ)) return ligneErreur(doc, REGLAGE_ILLISIBLE, JSON.stringify(champ).slice(0, 400));
    const dit = dits.get(`${agent.id}/${champ.key}`);
    if (!champ.editable) {
      return rangeeDeReglage(doc, { nom: champ.label, cle: champ.key, classe: "fixe", valeur: [texte("span", `${VIT_DANS} ${champ.livesIn ?? "not said"}`, "vit-dans")] });
    }
    const enCours = dit !== undefined && "enCours" in dit;
    return rangeeDeReglage(doc, {
      nom: champ.label,
      cle: champ.key,
      valeur: [texte("strong", valeurDite(champ.value)), texte("small", provenance(champ), "provenance")],
      controle: [controle(agent, champ, enCours)],
      dessous: ditDuReglage(doc, dit),
    });
  };

  /** @param {Agent} agent @param {Champ} champ @param {boolean} enCours */
  const controle = (agent, champ, enCours) => {
    const libelle = `${agent.name}: ${champ.label}`;
    if (champ.kind === "switch") return interrupteur(doc, { texte: valeurDite(champ.value), allume: typeof champ.value === "boolean" ? champ.value : undefined, libelle, actif: !enCours }, (allume) => changer(agent.id, champ, allume));
    const offerts = champ.kind === "model" ? valeurs().modeles : champ.kind === "effort" ? valeurs().efforts : champ.kind === "autonomy" ? NIVEAUX : undefined;
    if (offerts !== undefined) {
      const liste = doc.createElement("select");
      liste.ariaLabel = libelle;
      liste.disabled = enCours;
      const enVigueur = valeurDite(champ.value);
      for (const offert of offerts.includes(enVigueur) ? offerts : [enVigueur, ...offerts]) {
        const option = doc.createElement("option");
        option.value = offert;
        option.textContent = offert;
        liste.append(option);
      }
      liste.value = enVigueur;
      liste.addEventListener("change", () => {
        if (liste.value !== enVigueur) changer(agent.id, champ, liste.value);
      });
      return liste;
    }
    const champTape = doc.createElement("input");
    champTape.type = champ.kind === "integer" || champ.kind === "number" ? "number" : "text";
    champTape.ariaLabel = libelle;
    champTape.disabled = enCours;
    champTape.value = champ.value === null || champ.value === undefined ? "" : String(champ.value);
    champTape.addEventListener("change", () => changer(agent.id, champ, valeurEnvoyee(champ.kind, champTape.value)));
    return champTape;
  };

  /** @param {Agent} agent */
  const sesGestes = (agent) => {
    const partie = doc.createElement("section");
    partie.className = "gestes-de-l-agent";
    partie.ariaLabel = `${agent.name}: ${DERNIERS_GESTES}`;
    partie.append(texte("h4", DERNIERS_GESTES));
    const lus = gestes.get(agent.id);
    if (lus === undefined) partie.append(texte("p", LECTURE_DE("its gestures"), "lecture"));
    else if (!Array.isArray(lus)) partie.append(ligneErreur(doc, lus.ligne, lus.detail));
    else if (lus.length === 0) partie.append(ligneVide(doc, AUCUN_GESTE));
    else {
      const liste = doc.createElement("ul");
      for (const geste of lus) {
        const ligne = doc.createElement("li");
        const tete = texte("p", `${quand(geste.at)} · ${geste.summary}${geste.issue === null ? "" : ` · #${geste.issue}`}`, "geste");
        ligne.append(tete, texte("p", geste.reason, "raison"));
        liste.append(ligne);
      }
      partie.append(liste);
    }
    return partie;
  };

  return {
    /**
     * La section de l'onglet pour ce projet ; elle se lit à sa première pose, puis au plus une fois la minute.
     * @param {string} nom
     */
    poser(nom) {
      changerDeProjet(nom);
      if (Date.now() - luLe > 60_000) lire(nom);
      rendre();
      return section;
    },
    /**
     * Ouvre les gestes d'un agent — un badge de l'équipe (ticket 4029) dit `cook #14` ou `cook-14` pour un cook.
     * @param {string} nom le projet
     * @param {string} agent
     */
    ouvrir(nom, agent) {
      changerDeProjet(nom);
      const id = /^cook\b/i.test(agent) ? "cook" : agent.toLowerCase();
      if (ouvert === id) return;
      ouvert = id;
      lireLesGestes(nom, id);
    },
  };
}
