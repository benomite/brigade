// @ts-check
// L'équipe d'un projet (ticket 4029, épique 4024, spec 2026-11-23-autonomy-trust-control.md, C1, C2, C4) : en tête de la
// vue du projet, un badge par agent — supervisor et closer d'abord, puis manager, pass et chaque cook, dans la même
// forme. Chaque badge dit l'état de l'agent, son dernier geste et quand, et sa prochaine passe telle que le runtime la
// dit. Un clic ouvre son fil sous la rangée : ses derniers gestes, une ligne chacun avec sa raison et son issue, ses deux
// compteurs, son niveau d'autonomie — observe, propose, act — que le chef change d'un clic, et les gestes qui attendent
// son OK, un bouton chacun. Un nouveau clic sur le badge le referme.
// Les données passent par autonomie/source.js, et par lui seul : la vue n'appelle que `source.lire`, `source.regler` et
// `source.approuver`. Une lecture qui ne rend rien ne pose aucune équipe ; une lecture qui échoue, ou qui ne se lit pas,
// se dit en une ligne, son détail au survol ; un geste qui échoue aussi, et rien ne change à l'écran.
// Avec `ouvrir`, un clic sur un badge ouvre aussi l'onglet Agents sur son agent (ticket 4117), où l'agent a ses réglages et
// ses derniers gestes ; le badge reste le résumé, et son fil — où le chef règle le niveau et donne son OK — s'ouvre toujours.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { heureUtc } from "../activite-du-cook.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { NON_ATTEINT, PAS_ENCORE } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Agent} Agent */
/** @typedef {import("./source.js").Niveau} Niveau */

// Les trois niveaux, dans l'ordre où l'agent gagne la confiance du chef, et ce que chacun veut dire (spec, C4), au survol.
/** @type {readonly Niveau[]} */
const NIVEAUX = ["observe", "propose", "act"];
const SENS = { observe: "It says what it would do.", propose: "It waits for your OK, in one click.", act: "It does it, then says so." };
// Supervisor et closer d'abord, puis manager et pass ; les cooks ensuite, dans l'ordre où le runtime les publie.
const EN_TETE = ["supervisor", "closer", "manager", "pass"];

const TITRE = "The agents";
const INDISPONIBLE = NON_ATTEINT("the agents");
const ILLISIBLE = "the agents' reading is not readable";
const NIVEAU = "autonomy";
const PAR_LUI = "fixed by itself";
const AU_CHEF = "handed to the chef";
const EN_ATTENTE = "awaits your OK";
const AUCUN_GESTE = PAS_ENCORE("gesture");
const OK = "OK";
/** @param {string} agent */
const NIVEAU_NON_CHANGE = (agent) => `${agent}'s level was not changed`;
/** @param {string} agent */
const NON_APPROUVE = (agent) => `${agent}'s gesture was not approved`;

// Ce qu'un enregistrement doit porter pour se montrer : un champ qui manque ne s'invente pas, la lecture se dit illisible.
/** @type {((un: any) => boolean)[]} */
const FORME = [
  (un) => typeof un?.agent === "string",
  (un) => typeof un.state === "string",
  (un) => typeof un.lastGesture?.line === "string",
  (un) => typeof un.lastGesture.at === "string",
  (un) => typeof un.nextRun?.text === "string",
  (un) => NIVEAUX.includes(un.autonomy),
  (un) => typeof un.counters?.fixedBySelf === "number",
  (un) => typeof un.counters.handedToChef === "number",
  (un) => Array.isArray(un.gestures),
  (un) => Array.isArray(un.pending),
];
/** @param {unknown} lus @returns {lus is Agent[]} */
const seLit = (lus) => Array.isArray(lus) && lus.every((un) => FORME.every((porte) => porte(un)));

/** @param {Agent[]} agents */
const dansLOrdre = (agents) => {
  const rang = (/** @type {Agent} */ un) => (EN_TETE.includes(un.agent) ? EN_TETE.indexOf(un.agent) : EN_TETE.length);
  return [...agents].sort((a, b) => rang(a) - rang(b));
};

/** @param {Error | unknown} erreur */
const detailDe = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// L'équipe posée dans `cadre`, la section en tête de la vue du projet. `lire(projet)` la relit — à l'ouverture du
// projet, à chaque lecture de son rail ; `montrer(projet)` la montre pour le projet affiché, et la cache pour tout autre.
/** @param {Fabrique} doc @param {any} cadre @param {{ ouvrir?: (agent: string) => void }} [options] */
export function tenirLEquipe(doc, cadre, { ouvrir } = {}) {
  const element = doc.createElement("div");
  element.className = "equipe";
  element.ariaLabel = TITRE;
  cadre.replaceChildren(element);
  cadre.hidden = true;
  /** @type {string | undefined} */
  let projet;
  /** @type {string | undefined} */
  let affiche;
  /** @type {Agent[] | null} */
  let agents = null;
  /** @type {{ ligne: string, detail: string } | null} */
  let echec = null;
  /** @type {string | null} */
  let ouvert = null;
  let demande = 0;
  // Les gestes partis, que le chef ne peut pas refaire tant qu'ils n'ont pas répondu ; et ceux qui ont échoué, par agent.
  /** @type {Set<string>} */
  const partis = new Set();
  /** @type {Map<string, { ligne: string, detail: string }>} */
  const rates = new Map();

  /** @param {string} nom */
  const lire = (nom) => {
    if (nom !== projet) {
      projet = nom;
      agents = null;
      echec = null;
      ouvert = null;
      rates.clear();
    }
    const la = ++demande;
    void Promise.resolve()
      .then(() => source.lire(nom))
      .then(
        (lus) => {
          if (la !== demande) return;
          if (lus === null) [agents, echec] = [null, null];
          else if (seLit(lus)) [agents, echec] = [lus, null];
          else [agents, echec] = [null, { ligne: ILLISIBLE, detail: JSON.stringify(lus).slice(0, 400) }];
          rendre();
        },
        (/** @type {unknown} */ erreur) => {
          if (la !== demande) return;
          [agents, echec] = [null, { ligne: INDISPONIBLE, detail: detailDe(erreur) }];
          rendre();
        },
      );
  };

  /** @param {string | undefined} nom */
  const montrer = (nom) => {
    affiche = nom;
    rendre();
  };

  const rendre = () => {
    cadre.hidden = affiche === undefined || affiche !== projet || (agents === null && echec === null);
    if (echec !== null) return void element.replaceChildren(ligneErreur(doc, echec.ligne, echec.detail));
    if (agents === null) return void element.replaceChildren();
    const rangee = doc.createElement("div");
    rangee.className = "badges";
    rangee.role = "group";
    rangee.ariaLabel = TITRE;
    const enOrdre = dansLOrdre(agents);
    rangee.append(...enOrdre.map(badge));
    const lui = enOrdre.find((un) => un.agent === ouvert);
    element.replaceChildren(rangee, ...(lui === undefined ? [] : [fil(lui)]));
  };

  /** @param {Agent} agent */
  const badge = (agent) => {
    const cree = doc.createElement("button");
    cree.type = "button";
    cree.className = agent.agent === ouvert ? "badge ouvert" : "badge";
    cree.dataset.agent = agent.agent;
    cree.dataset.etat = agent.state.startsWith("broken") ? "casse" : "";
    cree.ariaExpanded = String(agent.agent === ouvert);
    const tete = doc.createElement("span");
    tete.className = "tete";
    tete.append(texte("nom", agent.agent), texte("etat", agent.state), texte("niveau", agent.autonomy));
    cree.append(tete, texte("geste", `${agent.lastGesture.line} · ${heureUtc(agent.lastGesture.at)}`), texte("prochaine", agent.nextRun.text));
    // Une ligne trop longue pour le badge y est coupée d'une ellipse : entière au survol.
    for (const ligne of cree.children) ligne.title = ligne.textContent;
    if (agent.pending.length > 0) cree.append(texte("attente", `${agent.pending.length} ${EN_ATTENTE}`));
    cree.addEventListener("click", () => {
      ouvert = ouvert === agent.agent ? null : agent.agent;
      rendre();
      ouvrir?.(agent.agent);
    });
    return cree;
  };

  /** @param {Agent} agent */
  const fil = (agent) => {
    const cadreDuFil = doc.createElement("section");
    cadreDuFil.className = "fil";
    cadreDuFil.ariaLabel = `${agent.agent}'s thread`;
    const tete = doc.createElement("div");
    tete.className = "tete";
    const titre = doc.createElement("h3");
    titre.textContent = agent.agent;
    const compteurs = doc.createElement("p");
    compteurs.className = "compteurs";
    compteurs.textContent = `${PAR_LUI} ${agent.counters.fixedBySelf} · ${AU_CHEF} ${agent.counters.handedToChef}`;
    tete.append(titre, compteurs, niveaux(agent));
    cadreDuFil.append(tete);
    const rate = rates.get(agent.agent);
    if (rate !== undefined) cadreDuFil.append(ligneErreur(doc, rate.ligne, rate.detail, { alerte: true }));
    if (agent.pending.length > 0) cadreDuFil.append(attente(agent));
    if (agent.gestures.length === 0) cadreDuFil.append(ligneVide(doc, AUCUN_GESTE));
    else {
      const liste = doc.createElement("ul");
      liste.className = "derniers-gestes";
      for (const geste of agent.gestures) {
        const ligne = doc.createElement("li");
        ligne.textContent = `${heureUtc(geste.at)} · ${geste.line} (${geste.reason}): ${geste.outcome}`;
        liste.append(ligne);
      }
      cadreDuFil.append(liste);
    }
    return cadreDuFil;
  };

  /** @param {Agent} agent */
  const niveaux = (agent) => {
    const groupe = doc.createElement("div");
    groupe.className = "niveaux";
    groupe.role = "group";
    groupe.ariaLabel = `${agent.agent}'s ${NIVEAU}`;
    groupe.append(texte("nom", NIVEAU));
    for (const niveau of NIVEAUX) {
      const choix = bouton(doc, niveau, () => regler(agent, niveau), { sorte: "discret" });
      choix.ariaPressed = String(niveau === agent.autonomy);
      choix.title = SENS[niveau];
      choix.disabled = partis.has(`${agent.agent} niveau`);
      groupe.append(choix);
    }
    return groupe;
  };

  /** @param {Agent} agent @param {Niveau} niveau */
  const regler = (agent, niveau) => {
    const cle = `${agent.agent} niveau`;
    if (niveau === agent.autonomy || partis.has(cle)) return;
    partis.add(cle);
    rates.delete(agent.agent);
    rendre();
    void Promise.resolve()
      .then(() => source.regler(agent.agent, niveau, projet ?? ""))
      .then(
        () => void (agent.autonomy = niveau),
        (/** @type {unknown} */ erreur) => void rates.set(agent.agent, { ligne: NIVEAU_NON_CHANGE(agent.agent), detail: detailDe(erreur) }),
      )
      .then(() => {
        partis.delete(cle);
        rendre();
      });
  };

  /** @param {Agent} agent */
  const attente = (agent) => {
    const liste = doc.createElement("ul");
    liste.className = "en-attente";
    liste.ariaLabel = `${agent.agent}: ${EN_ATTENTE}`;
    for (const geste of agent.pending) {
      const ligne = doc.createElement("li");
      const ok = bouton(doc, OK, () => approuver(agent, geste.id), { sorte: "recommande" });
      ok.disabled = partis.has(`${agent.agent} ${geste.id}`);
      ligne.append(texte("ligne", geste.line), ok);
      liste.append(ligne);
    }
    return liste;
  };

  /** @param {Agent} agent @param {string} id */
  const approuver = (agent, id) => {
    const cle = `${agent.agent} ${id}`;
    if (partis.has(cle)) return;
    partis.add(cle);
    rates.delete(agent.agent);
    rendre();
    void Promise.resolve()
      .then(() => source.approuver(agent.agent, id, projet ?? ""))
      .then(
        () => void (agent.pending = agent.pending.filter((geste) => geste.id !== id)),
        (/** @type {unknown} */ erreur) => void rates.set(agent.agent, { ligne: NON_APPROUVE(agent.agent), detail: detailDe(erreur) }),
      )
      .then(() => {
        partis.delete(cle);
        rendre();
      });
  };

  /** @param {string} classe @param {string} dit */
  const texte = (classe, dit) => {
    const pose = doc.createElement("span");
    pose.className = classe;
    pose.textContent = dit;
    return pose;
  };

  return { element, lire, montrer };
}
