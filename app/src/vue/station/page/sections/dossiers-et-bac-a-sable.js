// @ts-check
// La section « Folders and sandbox » de la page d'une station (ticket 2644, épique 2497) : où la station garde les clones
// et les worktrees de ses cooks, l'état de son bac à sable, et la porte réseau — ce qu'un cook peut joindre. Chaque
// réglage porte la marque de son niveau (« this machine »). Sur la station de cet ordinateur, un dossier et la porte se
// changent, d'un champ et d'un bouton ; sur une autre station (`lectureSeule`), la section montre sans offrir de changer.
// La section ne touche ni `document` ni le pont : la coque lui donne une fabrique et `contexte.reglages`, qui lit et écrit.

import { boutonAction, survol } from "../../../briques.js";
import { ligneErreur } from "../../../composants/ligne-erreur/ligne-erreur.js";
import { niveauDe } from "../../../niveaux.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/**
 * Ce que la station dit d'elle-même. `hotes` : la porte réseau, chaque hôte avec ce qui l'ouvre ; `ajoutes` seuls se retirent.
 * @typedef {{ clones: string, worktrees: string, bac: "on" | "off", hotes: { hote: string, origine: string, ajoute: boolean }[] }} Reglages
 */
/** @typedef {{ refus: string, detail?: string }} Refus */
/**
 * @typedef {{
 *   lire(): Promise<Reglages | Refus>,
 *   ecrire?(changement: { clones?: string, worktrees?: string, hotes?: string[] }): Promise<{ fait: string } | Refus>,
 * }} Port
 */

export const CLONES = "where this station keeps the clone of each project — the copy it fetches and cooks from";
export const WORKTREES = "where this station puts the worktrees of its cooks — each cook writes only in its own";
export const BAC = {
  on: { dit: "on", survol: "cooks run in Claude Code's sandbox: they write only in their own worktree, and reach only the hosts below" },
  off: { dit: "off", survol: "this station runs its cooks without a sandbox — you chose to continue without it" },
};
export const PORTE = "the network hosts a cook may reach — everything else is refused";
export const INDISPONIBLE = "folders and sandbox unavailable";
export const SANS_LECTURE = "this app does not read them";
export const AUTRE_STATION = "not available for this station";
export const SUR_SON_ORDINATEUR = "its folders and hosts are read and changed on its own computer";
export const PAS_ENCORE = " — the station does not apply this setting yet";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

/** @param {Fabrique} doc @param {{ nom: string, cle: string, niveau: any, valeur: any[], controle?: any[], dessous?: string }} ligne */
function rangee(doc, { nom, cle, niveau, valeur, controle = [], dessous = "" }) {
  const pose = doc.createElement("div");
  pose.className = "reglage";
  pose.dataset.cle = cle;
  const nomme = avec(doc, "span", nom, "nom");
  nomme.append(niveau);
  const vaut = doc.createElement("p");
  vaut.className = "valeur";
  vaut.append(...valeur);
  const champ = doc.createElement("p");
  champ.className = "champ";
  champ.append(...controle);
  pose.append(nomme, vaut, champ);
  if (dessous !== "") pose.append(ligneErreur(doc, dessous, "", { classe: "dit refus" }));
  return pose;
}

/** @param {Fabrique} doc @param {{ station: { nom: string }, lectureSeule: boolean, reglages?: Port }} contexte */
export function poserSection(doc, contexte) {
  const racine = doc.createElement("div");
  racine.className = "dossiers-et-bac-a-sable";
  const port = contexte.lectureSeule ? undefined : contexte.reglages;
  /** @type {Record<string, string>} */
  let refus = {};

  const lire = async () => {
    const lus = contexte.lectureSeule ? { refus: AUTRE_STATION, detail: SUR_SON_ORDINATEUR } : port === undefined ? { refus: INDISPONIBLE, detail: SANS_LECTURE } : await port.lire().catch((/** @type {unknown} */ e) => ({ refus: INDISPONIBLE, detail: e instanceof Error ? e.message : String(e) }));
    if ("refus" in lus) return racine.replaceChildren(ligneErreur(doc, lus.refus, lus.detail ?? ""));
    racine.replaceChildren(...lignes(lus));
  };

  /** @param {"clones" | "worktrees" | "porte"} cle @param {{ clones?: string, worktrees?: string, hotes?: string[] }} changement */
  const ecrire = async (cle, changement) => {
    const rendu = await (port?.ecrire?.(changement) ?? Promise.resolve({ refus: "nothing was changed", detail: "this app cannot write them" }));
    refus = "refus" in rendu ? { [cle]: rendu.detail === undefined ? rendu.refus : `${rendu.refus} — ${rendu.detail}` } : {};
    await lire();
  };

  /** @param {Reglages} lus */
  function lignes(lus) {
    const modifiable = port?.ecrire !== undefined;
    const niveau = () => niveauDe(doc, "dossier");
    /** @param {"clones" | "worktrees"} cle @param {string} nom @param {string} aide */
    const dossier = (cle, nom, aide) => {
      const controle = [];
      if (modifiable) {
        const champ = doc.createElement("input");
        champ.type = "text";
        champ.value = lus[cle];
        champ.ariaLabel = `Change the ${nom}`;
        controle.push(champ, boutonAction(doc, "save", () => void ecrire(cle, { [cle]: String(champ.value).trim() })));
      }
      return rangee(doc, { nom, cle: "dossier", niveau: niveau(), valeur: [avec(doc, "span", lus[cle], "mono"), survol(doc, aide + PAS_ENCORE)], controle, dessous: refus[cle] ?? "" });
    };
    const bac = BAC[lus.bac];
    const ajoutes = lus.hotes.filter(({ ajoute }) => ajoute);
    const porte = [];
    for (const { hote, origine, ajoute } of lus.hotes) {
      const un = avec(doc, "span", hote, "mono");
      un.className = "mono hote";
      un.dataset.hote = hote;
      un.append(survol(doc, origine));
      if (modifiable && ajoute) un.append(boutonAction(doc, "remove", () => void ecrire("porte", { hotes: ajoutes.map((h) => h.hote).filter((h) => h !== hote) })));
      porte.push(un);
    }
    const controle = [];
    if (modifiable) {
      const champ = doc.createElement("input");
      champ.type = "text";
      champ.placeholder = "registry.npmjs.org";
      champ.ariaLabel = "Host to open";
      controle.push(champ, boutonAction(doc, "open", () => void ecrire("porte", { hotes: [...ajoutes.map((h) => h.hote), String(champ.value).trim()] })));
    }
    return [
      dossier("clones", "clones folder", CLONES),
      dossier("worktrees", "worktrees folder", WORKTREES),
      rangee(doc, { nom: "sandbox", cle: "bac", niveau: niveauDe(doc, "ordinaires"), valeur: [avec(doc, "span", bac.dit), survol(doc, bac.survol)] }),
      rangee(doc, { nom: "network door", cle: "porte", niveau: niveauDe(doc, "porte"), valeur: [...porte, survol(doc, PORTE + PAS_ENCORE)], controle, dessous: refus.porte ?? "" }),
    ];
  }

  racine.append(avec(doc, "p", "reading…", "dit"));
  return lire().then(() => racine);
}
