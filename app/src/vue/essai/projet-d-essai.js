// @ts-check
// Essayer Brigade sur un projet d'essai, dès le premier lancement (ticket 3227, runtime/src/essai-projet/). Sur l'écran du
// premier lancement, à côté de « open this project », « try on a sample project » : un clic crée un petit dépôt privé
// sur le compte GitHub du chef, avec un seul ticket prêt à cuire ; puis les gestes qui existent déjà le mènent jusqu'au
// rail, sans commande ni fichier — la mise en place (`runRepoSetup`), la station de cet ordinateur qui le sert
// (`servirUnProjet`), l'ouverture de son espace (`ouvrirDUneStation`). Un encart, par-dessus l'écran, dit où il en est :
// son dépôt et son ticket, « Your first ticket was served in N minutes. » une fois la PR mergée, et « delete the sample
// repository », qui ne vise que le dépôt noté. Sans la permission de suppression, `gh` la fait accorder — le code à
// taper, comme la connexion — puis la suppression repart d'elle-même. Ce module ne touche pas `document`.

import { boutonAction } from "../briques.js";
import { phrase } from "../onboarding/parcours.js";
import { gestes, ROUVRIR_LA_PAGE, tapeLeCode } from "../parcours-projet/connexion.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { CET_ORDINATEUR, NON_ATTEINT, REESSAYER } from "../lexique.js";
import { manqueDit } from "../ajout-projet/installation-du-depot.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../../../runtime/src/essai-projet/projet-d-essai.ts").VuDeLEssai} Vu */
/** @typedef {import("../../connexion-github.ts").DebutDeConnexion} DebutDeConnexion */
/** @typedef {import("../../connexion-github.ts").FinDeConnexion} FinDeConnexion */
/** @typedef {"creation" | "preparation" | "service" | "ouverture"} Etape */

export const ESSAYER = "try on a sample project";
export const ESSAYER_SURVOL = "Creates a small private repository on your GitHub account, with one ticket ready to cook.";
/** @type {Record<Etape, string>} */
export const ETAPES = {
  creation: "Creating your sample repository on GitHub…",
  preparation: "Setting it up for Brigade…",
  service: `Asking ${CET_ORDINATEUR}'s station to cook it…`,
  ouverture: "Opening it…",
};
export const TITRE = "Your sample project";
export const OUVRIR_LE_TICKET = "open its ticket";
/** @param {number | undefined} ticket */
export const SUR_LE_RAIL = (ticket) => `Its ticket${ticket === undefined ? "" : ` #${ticket}`} is on the rail: a cook takes it, then the pass merges it.`;
export const SERVICE_ILLISIBLE = "Whether it is served cannot be read right now.";
export const SUPPRIMER = "delete the sample repository";
/** @param {string} depot */
export const SUPPRIMER_SURVOL = (depot) => `Deletes ${depot} from GitHub. This cannot be undone.`;
/** @param {string} depot */
export const SUPPRIME = (depot) => `The sample repository ${depot} was deleted.`;
export const PERMISSION = "GitHub needs your permission to delete repositories.";
export const SANS_STATION = `${NON_ATTEINT(`${CET_ORDINATEUR}'s station`)} The sample project is not cooked here.`;
export const SANS_REPONSE = "The app gave no answer.";

// Ce que la vue tient de l'essai. `vu` : ce que le runtime en a noté et lu — absent, pas encore lu. `etape` : la création
// en route. `echec` : ce qui l'a arrêtée. `suppression` : en route, le code de la permission à taper, ou son refus.
// `supprimeIci` : supprimé pendant ce lancement — le dire une fois ; au lancement suivant, l'encart ne se montre plus.
/**
 * @typedef {{
 *   vu?: Vu,
 *   etape?: Etape,
 *   echec?: { raison: string, detail?: string },
 *   suppression?: { enCours?: true, code?: string, page?: string, refus?: string, detail?: string },
 *   supprimeIci?: true,
 * }} EtatDeLEssai
 */
/** @typedef {{ essayer: () => void, supprimer: () => void, ouvrirLaPage: (url: string) => void }} GestesDeLEssai */

/**
 * @typedef {{
 *   projetDEssai?(): Promise<Vu>,
 *   creerLeProjetDEssai?(): Promise<import("../../../../runtime/src/essai-projet/projet-d-essai.ts").Cree>,
 *   supprimerLeProjetDEssai?(depot: string): Promise<import("../../../../runtime/src/essai-projet/projet-d-essai.ts").Suppression>,
 *   demanderLaPermissionDeSuppression?(): Promise<DebutDeConnexion>,
 *   runRepoSetup(depot: string): Promise<import("../ajout-projet/installation-du-depot.js").EtatDuDepot>,
 *   servirUnProjet?(depot: string, servi: boolean): Promise<import("../projets-servis/projets-servis.js").LectureDesProjetsServis | undefined>,
 * }} PontDeLEssai
 */

const dit = (/** @type {unknown} */ erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le nom du projet dans l'app : celui du dépôt, en minuscules, comme « open this project » le nomme.
/** @param {string} depot */
export const nomDuProjet = (depot) => (depot.split("/")[1] ?? depot).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * @param {{ pont: PontDeLEssai, rendre: () => void, ouvrir: (projet: string, depot: string, base: string) => Promise<void> }} options
 */
export function tenirLeProjetDEssai({ pont, rendre, ouvrir }) {
  /** @type {EtatDeLEssai} */
  const etat = {};
  /** @param {string} raison @param {string} [detail] */
  const arreter = (raison, detail) => {
    delete etat.etape;
    etat.echec = detail === undefined ? { raison } : { raison, detail };
    rendre();
  };
  /** @param {Etape} etape */
  const passer = (etape) => {
    etat.etape = etape;
    rendre();
  };

  async function lire() {
    if (pont.projetDEssai === undefined) return;
    try {
      etat.vu = await pont.projetDEssai();
    } catch (erreur) {
      etat.vu = { ...(etat.vu ?? {}), lecture: dit(erreur) };
    }
    rendre();
  }

  // Du bouton au rail : la création, la mise en place, la station de cet ordinateur, puis l'espace du projet. Chaque
  // geste se rejoue sans rien doubler : un second clic reprend le même dépôt.
  async function essayer() {
    if (etat.etape !== undefined || pont.creerLeProjetDEssai === undefined) return;
    delete etat.echec;
    passer("creation");
    try {
      const cree = await pont.creerLeProjetDEssai();
      if ("refus" in cree) return arreter(cree.refus);
      etat.vu = { ...(etat.vu ?? {}), sample: cree.sample };
      const { repository, base } = cree.sample;
      passer("preparation");
      const constat = await pont.runRepoSetup(repository);
      if (!constat.ready) return arreter(manqueDit(repository, constat));
      passer("service");
      const servi = await pont.servirUnProjet?.(repository, true);
      if (servi === undefined) return arreter(SANS_STATION);
      if ("refus" in servi) return arreter(SANS_STATION, servi.refus);
      passer("ouverture");
      await ouvrir(nomDuProjet(repository), repository, base);
    } catch (erreur) {
      return arreter(dit(erreur));
    }
    delete etat.etape;
    rendre();
    await lire();
  }

  // Le dépôt noté, et lui seul : c'est son nom qui part, le runtime refuse tout autre.
  async function supprimer() {
    const projet = etat.vu?.sample;
    if (projet === undefined || projet.deletedAt !== undefined || etat.suppression?.enCours || pont.supprimerLeProjetDEssai === undefined) return;
    etat.suppression = { enCours: true };
    rendre();
    try {
      const fait = await pont.supprimerLeProjetDEssai(projet.repository);
      if ("supprime" in fait) {
        delete etat.suppression;
        etat.vu = { ...(etat.vu ?? {}), sample: fait.supprime };
        etat.supprimeIci = true;
      } else if ("refus" in fait) etat.suppression = { refus: fait.refus };
      else {
        const debut = (await pont.demanderLaPermissionDeSuppression?.()) ?? { refus: SANS_REPONSE };
        if ("connecte" in debut) {
          delete etat.suppression;
          return void (await supprimer());
        }
        etat.suppression = "code" in debut ? { code: debut.code, page: debut.page } : { refus: debut.refus, ...(debut.detail === undefined ? {} : { detail: debut.detail }) };
      }
    } catch (erreur) {
      etat.suppression = { refus: SANS_REPONSE, detail: dit(erreur) };
    }
    rendre();
  }

  // La permission accordée sur la page de GitHub : la suppression repart ; refusée, elle le dit.
  /** @param {FinDeConnexion} fin */
  async function apresLaPermission(fin) {
    if (etat.suppression?.code === undefined) return;
    if ("connecte" in fin) {
      delete etat.suppression;
      return void (await supprimer());
    }
    etat.suppression = { refus: fin.refus, ...(fin.detail === undefined ? {} : { detail: fin.detail }) };
    rendre();
  }

  // Relire GitHub n'a de sens que tant que le ticket attend son merge.
  const aSuivre = () => {
    const projet = etat.vu?.sample;
    return projet?.ticket !== undefined && projet.servedAt === undefined && projet.deletedAt === undefined;
  };

  return { etat, lire, essayer, supprimer, apresLaPermission, aSuivre };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le bouton de l'écran du premier lancement, à côté de « open this project ». Une création en route l'éteint.
/** @param {Fabrique} doc @param {EtatDeLEssai} etat @param {Pick<GestesDeLEssai, "essayer">} geste */
export function boutonDuProjetDEssai(doc, etat, geste) {
  const groupe = boutonAction(doc, ESSAYER, geste.essayer);
  const bouton = groupe.children[0];
  bouton.title = ESSAYER_SURVOL;
  bouton.disabled = etat.etape !== undefined;
  return groupe;
}

// L'encart : rien tant qu'il n'y a ni essai ni création en route ; un dépôt supprimé à un lancement précédent non plus.
/** @param {Fabrique} doc @param {EtatDeLEssai} etat @param {GestesDeLEssai} geste @returns {any[]} */
export function poserLeProjetDEssai(doc, etat, geste) {
  const projet = etat.vu?.sample;
  if (etat.etape === undefined && etat.echec === undefined && (projet === undefined || (projet.deletedAt !== undefined && !etat.supprimeIci))) return [];
  const encart = cree(doc, "div");
  encart.className = "projet-d-essai";
  encart.append(cree(doc, "h3", TITRE));
  // Le lien du dépôt créé : son nom, qui ouvre sa page sur GitHub. Supprimé, il n'est plus qu'un nom.
  if (projet !== undefined && projet.deletedAt === undefined) {
    const depot = boutonAction(doc, projet.repository, () => geste.ouvrirLaPage(projet.url), { sorte: "discret" });
    depot.className = "action depot-d-essai";
    depot.children[0].classList.add("mono");
    depot.children[0].title = projet.url;
    encart.append(depot);
  }
  if (etat.etape !== undefined) {
    const enRoute = cree(doc, "p", ETAPES[etat.etape]);
    enRoute.className = "etape-d-essai";
    enRoute.role = "status";
    encart.append(enRoute);
    return [encart];
  }
  if (etat.echec !== undefined) {
    encart.append(ligneErreur(doc, phrase(doc, "span", etat.echec.raison), etat.echec.detail, { classe: "refus" }), gestes(doc, [boutonAction(doc, REESSAYER, geste.essayer, { recommande: true })]));
    return [encart];
  }
  if (projet === undefined) return [encart];
  if (projet.deletedAt !== undefined) {
    encart.append(cree(doc, "p", SUPPRIME(projet.repository)));
    return [encart];
  }
  if (etat.vu?.served !== undefined) {
    const servi = cree(doc, "p", etat.vu.served);
    servi.className = "service-d-essai";
    encart.append(servi);
  } else {
    encart.append(cree(doc, "p", SUR_LE_RAIL(projet.ticket)));
    if (etat.vu?.lecture !== undefined) encart.append(ligneErreur(doc, SERVICE_ILLISIBLE, etat.vu.lecture));
  }
  const { suppression } = etat;
  if (suppression?.code !== undefined) {
    const page = suppression.page;
    encart.append(cree(doc, "p", PERMISSION), cree(doc, "p", tapeLeCode(suppression.code)));
    if (page !== undefined) encart.append(gestes(doc, [boutonAction(doc, ROUVRIR_LA_PAGE, () => geste.ouvrirLaPage(page))]));
  } else if (suppression?.refus !== undefined) encart.append(ligneErreur(doc, phrase(doc, "span", suppression.refus), suppression.detail, { classe: "refus" }));
  const ticket = projet.ticketUrl;
  const supprimer = boutonAction(doc, SUPPRIMER, geste.supprimer, { sorte: "danger" });
  supprimer.children[0].title = SUPPRIMER_SURVOL(projet.repository);
  supprimer.children[0].disabled = suppression?.enCours === true || suppression?.code !== undefined;
  encart.append(gestes(doc, [...(ticket === undefined ? [] : [boutonAction(doc, OUVRIR_LE_TICKET, () => geste.ouvrirLaPage(ticket), { recommande: etat.vu?.served === undefined })]), supprimer]));
  return [encart];
}
