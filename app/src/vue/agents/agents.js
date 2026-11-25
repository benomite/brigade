// @ts-check
// L'onglet Agents de la vue d'un projet (ticket 4224, épique 4117), à côté de Rail, Stations et Settings : une carte par
// agent que le runtime publie. Chaque carte dit son nom, son rôle en une phrase, son état — idle, working on #N, broken —,
// sa prochaine passe, et ses chiffres des 7 derniers jours, chacun avec ce qu'il veut dire à côté. Ses réglages sont sur la
// même carte : une rangée de réglage chacun (composants/reglage) — un champ pour un réglage modifiable, qui s'applique dès
// qu'il change, sans « save » ; pour un autre, où il se change (`livesIn`), sans champ. Un changement dit, sous sa rangée,
// quand il a été fait et par qui ; un refus dit sa raison, et la valeur en vigueur reste. Un clic sur le nom d'un agent
// ouvre ses derniers gestes, chacun avec sa raison ; un nouveau clic les referme.
// Les données passent par agents/source.js, et par lui seul. Une lecture qui échoue, ou qui ne se lit pas, se dit en une
// ligne, son détail au survol ; rien ne s'invente à sa place.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { heureUtc } from "../activite-du-cook.js";
import { bouton } from "../composants/bouton/bouton.js";
import { interrupteur } from "../composants/interrupteur/interrupteur.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { ditDuReglage, rangeeDeReglage } from "../composants/reglage/reglage.js";
import { ENREGISTREMENT, LECTURE, LECTURE_DE, NON_ATTEINT, PAS_ENCORE } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Agent} Agent */
/** @typedef {import("./source.js").Champ} Champ */
/** @typedef {import("./source.js").Geste} Geste */
/** @typedef {{ ligne: string, detail: string }} Echec */

const TITRE = "The agents";
const AUCUN_AGENT = PAS_ENCORE("agent");
const SEPT_JOURS = "Last 7 days";
const PROCHAINE = "next run:";
const SES_REGLAGES = "Settings";
const SES_GESTES = "Last gestures";
const AUCUN_GESTE = PAS_ENCORE("gesture");
const POURQUOI = "why:";
const UN_NOMBRE = "a number is expected";
/** @param {string} quoi */
const ILLISIBLE = (quoi) => `${quoi} is not readable`;
// Les niveaux d'autonomie (spec 2026-11-23-autonomy-trust-control.md, C4), dans l'ordre où l'agent gagne la confiance du chef.
const NIVEAUX = ["observe", "propose", "act"];

/** @param {any} un */
const estUnChiffre = (un) => typeof un?.label === "string" && typeof un.value === "string" && typeof un.meaning === "string";
// Ce qu'un enregistrement doit porter pour se montrer : un champ qui manque ne s'invente pas, la lecture se dit illisible.
/** @type {((un: any) => boolean)[]} */
const AGENT = [
  (un) => typeof un?.id === "string",
  (un) => typeof un.name === "string",
  (un) => typeof un.role === "string",
  (un) => ["idle", "working", "broken"].includes(un.state),
  (un) => typeof un.nextRun === "string",
  (un) => Array.isArray(un.figures) && un.figures.every(estUnChiffre),
];
/** @type {((un: any) => boolean)[]} */
const CHAMP = [
  (un) => typeof un?.key === "string",
  (un) => typeof un.label === "string",
  (un) => typeof un.editable === "boolean",
];
/** @type {((un: any) => boolean)[]} */
const GESTE = [
  (un) => typeof un?.at === "string",
  (un) => typeof un.summary === "string",
  (un) => typeof un.reason === "string",
];
/** @param {unknown} lus @param {((un: any) => boolean)[]} forme */
const listeDe = (lus, forme) => Array.isArray(lus) && lus.every((un) => forme.every((porte) => porte(un)));

/** @param {Error | unknown} erreur */
const detailDe = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));
/** @param {string} iso */
const quand = (iso) => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${heureUtc(iso)}`);
// L'état d'un agent, en mots : idle, working on #N — son issue —, broken.
/** @param {Agent} agent */
export const etatDit = (agent) => (agent.state === "working" && typeof agent.workingOn === "number" ? `working on #${agent.workingOn}` : agent.state);
// Ce qu'une rangée dit de son dernier changement : quand, et par qui.
/** @param {Champ} champ */
export const changementDit = ({ changedAt, changedBy }) => [`changed`, ...(changedAt === null ? [] : [quand(changedAt)]), ...(changedBy === null ? [] : [`by ${changedBy}`])].join(" ");

// L'onglet, posé dans `element`. `lire(projet)` relit les agents ; `montrer(projet)` les relit seulement pour un autre projet
// que celui lu. `valeurs()` : les modèles et les efforts que l'app connaît, pour les listes de ces deux réglages.
/** @param {Fabrique} doc @param {{ valeurs?: () => { modeles: readonly string[], efforts: readonly string[] } }} [options] */
export function tenirLesAgents(doc, { valeurs = () => ({ modeles: [], efforts: [] }) } = {}) {
  const element = doc.createElement("section");
  element.className = "agents";
  element.ariaLabel = TITRE;
  /** @type {string | undefined} */
  let projet;
  /** @type {Agent[] | null} */
  let agents = null;
  /** @type {Echec | null} */
  let echec = null;
  let demande = 0;
  // Les réglages de chaque agent : lus, ou l'échec de leur lecture ; rien tant qu'ils sont en route.
  /** @type {Map<string, Champ[] | Echec>} */
  const reglages = new Map();
  // Ce que le dernier changement de chaque réglage a rendu (`<agent> <clé>`) : en route, ou son refus.
  /** @type {Map<string, import("../composants/reglage/reglage.js").Dit>} */
  const dits = new Map();
  // La valeur que chaque changement en route envoie : son champ la montre jusqu'à la réponse.
  /** @type {Map<string, unknown>} */
  const envoyees = new Map();
  // L'agent dont les gestes sont ouverts, et ce que leur lecture a rendu.
  /** @type {string | null} */
  let ouvert = null;
  /** @type {Geste[] | Echec | null} */
  let gestes = null;

  /** @param {string} nom */
  const lire = (nom) => {
    projet = nom;
    ouvert = null;
    gestes = null;
    const la = ++demande;
    void Promise.resolve()
      .then(() => source.lire())
      .then(
        (lus) => {
          if (la !== demande) return;
          if (listeDe(lus, AGENT)) [agents, echec] = [/** @type {Agent[]} */ (lus), null];
          else [agents, echec] = [null, { ligne: ILLISIBLE("The agents' reading"), detail: JSON.stringify(lus ?? null).slice(0, 400) }];
          reglages.clear();
          dits.clear();
          rendre();
          for (const agent of agents ?? []) lireLesReglages(agent.id, la);
        },
        (/** @type {unknown} */ erreur) => {
          if (la !== demande) return;
          [agents, echec] = [null, { ligne: NON_ATTEINT("the agents"), detail: detailDe(erreur) }];
          rendre();
        },
      );
  };

  /** @param {string} id @param {number} la */
  const lireLesReglages = (id, la) => {
    void Promise.resolve()
      .then(() => source.reglages(id))
      .then(
        (lus) => {
          const champs = /** @type {{ fields?: unknown } | null | undefined} */ (lus)?.fields;
          reglages.set(id, listeDe(champs, CHAMP) ? /** @type {Champ[]} */ (champs) : { ligne: ILLISIBLE("Its settings' reading"), detail: JSON.stringify(lus ?? null).slice(0, 400) });
        },
        (/** @type {unknown} */ erreur) => void reglages.set(id, { ligne: NON_ATTEINT("its settings"), detail: detailDe(erreur) }),
      )
      .then(() => {
        if (la === demande) rendre();
      });
  };

  /** @param {string} nom */
  const montrer = (nom) => {
    if (nom !== projet) lire(nom);
  };

  const rendre = () => {
    if (echec !== null) return void element.replaceChildren(ligneErreur(doc, echec.ligne, echec.detail));
    if (agents === null) return void element.replaceChildren(ligneVide(doc, LECTURE_DE("the agents")));
    if (agents.length === 0) return void element.replaceChildren(ligneVide(doc, AUCUN_AGENT));
    element.replaceChildren(...agents.map(carte));
  };

  /** @param {Agent} agent */
  const carte = (agent) => {
    const pose = doc.createElement("article");
    pose.className = `agent-carte ${agent.state}`;
    pose.dataset.etat = agent.state;
    pose.ariaLabel = agent.name;
    const tete = doc.createElement("header");
    tete.className = "tete";
    const nom = bouton(doc, agent.name, () => basculer(agent.id), { sorte: "discret" });
    nom.className = `${nom.className} nom`;
    nom.ariaExpanded = String(ouvert === agent.id);
    tete.append(nom, texte("span", "etat", etatDit(agent)));
    pose.append(tete, texte("p", "role", agent.role), texte("p", "prochaine", `${PROCHAINE} ${agent.nextRun}`), chiffres(agent));
    pose.append(sesReglages(agent));
    if (ouvert === agent.id) pose.append(sesGestes());
    return pose;
  };

  /** @param {Agent} agent */
  const chiffres = (agent) => {
    const pose = doc.createElement("section");
    pose.className = "chiffres";
    pose.append(texte("h4", "", SEPT_JOURS));
    const liste = doc.createElement("ul");
    for (const { label, value, meaning } of agent.figures) {
      const ligne = doc.createElement("li");
      // Le libellé et son sens, nus dans la ligne de leur valeur : rien ne les sépare d'elle.
      ligne.append(texte("strong", "valeur", value), `${label} — ${meaning}`);
      liste.append(ligne);
    }
    pose.append(liste);
    return pose;
  };

  /** @param {Agent} agent */
  const sesReglages = (agent) => {
    const pose = doc.createElement("section");
    pose.className = "reglages";
    pose.append(texte("h4", "", SES_REGLAGES));
    const lus = reglages.get(agent.id);
    if (lus === undefined) pose.append(ligneVide(doc, LECTURE));
    else if (!Array.isArray(lus)) pose.append(ligneErreur(doc, lus.ligne, lus.detail));
    else if (lus.length === 0) pose.append(ligneVide(doc, PAS_ENCORE("setting")));
    else pose.append(...lus.map((champ) => rangee(agent, champ)));
    return pose;
  };

  /** @param {Agent} agent @param {Champ} champ */
  const rangee = (agent, champ) => {
    const dit = dits.get(`${agent.id} ${champ.key}`);
    const valeur = [texte("strong", "mono", String(champ.value ?? "")), texte("small", "source", champ.source ?? "")];
    const changement = champ.changedAt === null && champ.changedBy === null ? [] : [texte("p", "change", changementDit(champ))];
    // Sans contrôle, la rangée dit où il se change, sous son nom.
    if (!champ.editable) return rangeeDeReglage(doc, { nom: champ.label, cle: champ.key, niveau: texte("small", "vit", champ.livesIn ?? ""), valeur, dessous: changement, classe: "fige" });
    const enRoute = dit !== undefined && "enCours" in dit;
    return rangeeDeReglage(doc, { nom: champ.label, cle: champ.key, valeur, controle: [controle(agent, champ, enRoute)], dessous: [...changement, ...ditDuReglage(doc, dit)] });
  };

  // Le contrôle d'un réglage : une glissière pour un oui / non (la pause), une liste pour le modèle, l'effort et le niveau
  // d'autonomie, un champ de nombre pour une limite, un champ de texte sinon.
  /** @param {Agent} agent @param {Champ} champ @param {boolean} enRoute */
  const controle = (agent, champ, enRoute) => {
    if (champ.kind === "boolean") return interrupteur(doc, { texte: champ.value === true ? "on" : "off", allume: champ.value === true, libelle: champ.label, actif: !enRoute }, (allume) => changer(agent, champ, allume));
    const liste = { model: valeurs().modeles, effort: valeurs().efforts, autonomy: NIVEAUX }[champ.key];
    const entree = doc.createElement(liste === undefined ? "input" : "select");
    if (liste !== undefined) {
      for (const choix of new Set([...liste, String(champ.value ?? "")])) {
        const option = texte("option", "", choix);
        option.value = choix;
        entree.append(option);
      }
    } else entree.type = champ.kind !== "number" ? "number" : "text";
    entree.ariaLabel = champ.label;
    entree.value = String((enRoute ? envoyees.get(`${agent.id} ${champ.key}`) : champ.value) ?? "");
    entree.disabled = enRoute;
    entree.addEventListener("change", () => {
      if (champ.kind !== "number") return changer(agent, champ, entree.value);
      const nombre = Number(entree.value);
      if (entree.value.trim() === "" || !Number.isFinite(nombre)) {
        dits.set(`${agent.id} ${champ.key}`, { refus: UN_NOMBRE });
        return rendre();
      }
      changer(agent, champ, nombre);
    });
    return entree;
  };

  /** @param {Agent} agent @param {Champ} champ @param {unknown} valeur */
  const changer = (agent, champ, valeur) => {
    const cle = `${agent.id} ${champ.key}`;
    const la = demande;
    dits.set(cle, { enCours: ENREGISTREMENT });
    envoyees.set(cle, valeur);
    rendre();
    void Promise.resolve()
      .then(() => source.changer(agent.id, champ.key, valeur))
      .then(
        (rendu) => {
          dits.delete(cle);
          const lus = reglages.get(agent.id);
          if (listeDe([rendu], CHAMP) && Array.isArray(lus)) reglages.set(agent.id, lus.map((un) => (un.key === champ.key ? /** @type {Champ} */ (rendu) : un)));
          else lireLesReglages(agent.id, la);
        },
        (/** @type {unknown} */ erreur) => void dits.set(cle, { refus: detailDe(erreur) }),
      )
      .then(() => {
        if (la === demande) rendre();
      });
  };

  /** @param {string} id */
  const basculer = (id) => {
    ouvert = ouvert === id ? null : id;
    gestes = null;
    rendre();
    if (ouvert === null) return;
    void Promise.resolve()
      .then(() => source.gestes(id))
      .then(
        (lus) => void (gestes = listeDe(lus, GESTE) ? /** @type {Geste[]} */ (lus) : { ligne: ILLISIBLE("Its gestures' reading"), detail: JSON.stringify(lus ?? null).slice(0, 400) }),
        (/** @type {unknown} */ erreur) => void (gestes = { ligne: NON_ATTEINT("its gestures"), detail: detailDe(erreur) }),
      )
      .then(() => {
        if (ouvert === id) rendre();
      });
  };

  const sesGestes = () => {
    const pose = doc.createElement("section");
    pose.className = "gestes";
    pose.append(texte("h4", "", SES_GESTES));
    if (gestes === null) pose.append(ligneVide(doc, LECTURE));
    else if (!Array.isArray(gestes)) pose.append(ligneErreur(doc, gestes.ligne, gestes.detail));
    else if (gestes.length === 0) pose.append(ligneVide(doc, AUCUN_GESTE));
    else {
      const liste = doc.createElement("ol");
      for (const { at, summary, reason, issue } of gestes) {
        const ligne = doc.createElement("li");
        ligne.append(texte("span", "quoi", `${summary} — ${POURQUOI} ${reason}`), texte("small", "quand", [quand(at), ...(typeof issue === "number" ? [`#${issue}`] : [])].join(" · ")));
        liste.append(ligne);
      }
      pose.append(liste);
    }
    return pose;
  };

  /** @param {string} balise @param {string} classe @param {string} dit */
  const texte = (balise, classe, dit) => {
    const pose = doc.createElement(balise);
    if (classe !== "") pose.className = classe;
    pose.textContent = dit;
    return pose;
  };

  rendre();
  return { element, lire, montrer };
}
