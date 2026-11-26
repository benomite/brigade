// @ts-check
// La section « Folders and sandbox » de la page d'une station (ticket 2644, épique 2497) : où la station garde les clones
// et les worktrees de ses cooks, l'état de son bac à sable, et la porte réseau — ce qu'un cook peut joindre. Chaque
// réglage est une rangée de réglage (composants/setting, ticket 2920) avec la marque de son niveau (« this machine ») :
// il vit sur la machine, jamais dans le dépôt, donc aucune PR. Sur la station de cet ordinateur, un dossier et la porte se
// changent d'un champ qui s'applique dès qu'il change — pas de « Save » ; retirer un hôte se confirme en ligne. Sur une
// autre station (`lectureSeule`), la section montre sans offrir de changer.
// La section ne touche ni `document` ni le pont : la coque lui donne une fabrique et `contexte.reglages`, qui lit et écrit.

import { buttonAction, survol } from "../../../briques.js";
import { confirmationDeAction } from "../../../composants/confirmation/confirmation.js";
import { lineError } from "../../../composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "../../../composants/setting/setting.js";
import { niveauDe } from "../../../niveaux.js";
import { appliquer, RIEN_N_A_CHANGE } from "../appliquer.js";
import { READ, NON_ATTEINT } from "../../../lexique.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../composants/setting/setting.js").Dit} Dit */
/**
 * Ce que la station dit d'elle-même. `hotes` : la porte réseau, chaque hôte avec ce qui l'ouvre ; `ajoutes` seuls se retirent.
 * @typedef {{ clones: string, worktrees: string, bac: "on" | "off", hotes: { hote: string, origine: string, ajoute: boolean }[] }} Settings
 */
/** @typedef {{ refus: string, detail?: string }} Refusal */
/**
 * @typedef {{
 *   lire(): Promise<Settings | Refusal>,
 *   ecrire?(changement: { clones?: string, worktrees?: string, hotes?: string[] }): Promise<{ fait: string } | Refusal>,
 * }} Port
 */

export const CLONES = "where this station keeps the clone of each project — the copy it fetches and cooks from";
export const WORKTREES = "where this station puts the worktrees of its cooks — each cook writes only in its own";
export const BAC = {
  on: { dit: "on", survol: "cooks run in Claude Code's sandbox: they write only in their own worktree, and reach only the hosts below" },
  off: { dit: "off", survol: "this station runs its cooks without a sandbox — you chose to continue without it" },
};
export const DOOR = "the network hosts a cook may reach — everything else is refused";
export const INDISPONIBLE = NON_ATTEINT("folders and sandbox");
export const SANS_READ = "this app does not read them";
export const AUTRE_STATION = "not available for this station";
export const SUR_SON_ORDINATEUR = "its folders and hosts are read and changed on its own computer";
export const PAS_ENCORE = " — the station does not apply this setting yet";
export const RETIRER = "remove";
export const FERMER = (/** @type {string} */ hote) => `Close ${hote}? Cooks on this station can no longer reach it.`;
export const FERMER_OUI = "close it";
export const FERMER_NON = "keep it open";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

/** @param {Fabrique} doc @param {{ station: { nom: string }, lectureSeule: boolean, reglages?: Port }} context */
export function poserSection(doc, context) {
  const racine = doc.createElement("div");
  racine.className = "dossiers-et-bac-a-sable";
  const port = context.lectureSeule ? undefined : context.reglages;
  // Ce que le dernier changement a rendu, sous son réglage — un seul parle à la fois —, et l'hôte dont le retrait se confirme.
  /** @type {Record<string, Dit | undefined>} */
  let dits = {};
  /** @type {string | undefined} */
  let aRetirer;
  /** @type {Settings | undefined} */
  let derniers;

  const rendre = () => {
    if (derniers !== undefined) racine.replaceChildren(...lines(derniers));
  };
  const lire = async () => {
    const lus = context.lectureSeule ? { refus: AUTRE_STATION, detail: SUR_SON_ORDINATEUR } : port === undefined ? { refus: INDISPONIBLE, detail: SANS_READ } : await port.lire().catch((/** @type {unknown} */ e) => ({ refus: INDISPONIBLE, detail: e instanceof Error ? e.message : String(e) }));
    if ("refus" in lus) return racine.replaceChildren(lineError(doc, lus.refus, lus.detail ?? ""));
    derniers = lus;
    rendre();
  };

  // Un changement s'applique dès que son contrôle change, par le seul geste d'écriture de la section ; la section se relit
  // ensuite, et ce qu'il a rendu se dit sous son réglage.
  /** @param {"clones" | "worktrees" | "porte"} cle @param {any} rangee @param {any[]} controles @param {{ clones?: string, worktrees?: string, hotes?: string[] }} changement */
  const ecrire = async (cle, rangee, controles, changement) => {
    const dit = await appliquer(doc, rangee, controles, () => port?.ecrire?.(changement) ?? { refus: RIEN_N_A_CHANGE, detail: "this app cannot write them" });
    dits = { [cle]: dit };
    await lire();
  };

  /** @param {Settings} lus */
  function lines(lus) {
    const modifiable = port?.ecrire !== undefined;
    /** @param {"clones" | "worktrees"} cle @param {string} name @param {string} aide */
    const dossier = (cle, name, aide) => {
      const rangee = rangeeDeSetting(doc, { nom: name, cle, niveau: niveauDe(doc, "dossier"), valeur: [avec(doc, "span", lus[cle], "mono"), survol(doc, aide + PAS_ENCORE)], dessous: ditDuSetting(doc, dits[cle]) });
      if (modifiable) {
        const champ = doc.createElement("input");
        champ.type = "text";
        champ.value = lus[cle];
        champ.ariaLabel = `Change the ${name}`;
        champ.addEventListener("change", () => {
          const voulu = String(champ.value).trim();
          if (voulu !== lus[cle]) void ecrire(cle, rangee, [champ], { [cle]: voulu });
        });
        rangee.children[2].append(champ);
      }
      return rangee;
    };
    const bac = BAC[lus.bac];
    const ajoutes = lus.hotes.filter(({ ajoute }) => ajoute).map(({ hote }) => hote);
    const door = [];
    /** @type {any[]} */
    const controles = [];
    for (const { hote, origine, ajoute } of lus.hotes) {
      const un = avec(doc, "span", hote, "mono");
      un.className = "mono hote";
      un.dataset.hote = hote;
      un.append(survol(doc, origine));
      if (modifiable && ajoute) {
        // Retirer un hôte ferme la porte aux cooks : le geste se confirme en ligne, sous la porte.
        const retirer = buttonAction(doc, RETIRER, () => {
          aRetirer = hote;
          rendre();
        });
        controles.push(retirer.children[0]);
        un.append(retirer);
      }
      door.push(un);
    }
    const rangee = rangeeDeSetting(doc, { nom: "network door", cle: "porte", niveau: niveauDe(doc, "porte"), valeur: [...door, survol(doc, DOOR + PAS_ENCORE)] });
    if (modifiable) {
      const champ = doc.createElement("input");
      champ.type = "text";
      champ.placeholder = "registry.npmjs.org";
      champ.ariaLabel = "Host to open";
      controles.push(champ);
      champ.addEventListener("change", () => {
        const voulu = String(champ.value).trim();
        if (voulu !== "") void ecrire("porte", rangee, controles, { hotes: [...ajoutes, voulu] });
      });
      rangee.children[2].append(champ);
      const hote = aRetirer;
      if (hote !== undefined && ajoutes.includes(hote)) {
        const confirmation = confirmationDeAction(
          doc,
          { titre: FERMER(hote), oui: FERMER_OUI, non: FERMER_NON },
          {
            oui: () => {
              aRetirer = undefined;
              confirmation.remove();
              void ecrire("porte", rangee, controles, { hotes: ajoutes.filter((h) => h !== hote) });
            },
            non: () => {
              aRetirer = undefined;
              rendre();
            },
          },
        );
        rangee.append(confirmation);
      }
    }
    rangee.append(...ditDuSetting(doc, dits.porte));
    return [
      dossier("clones", "clones folder", CLONES),
      dossier("worktrees", "worktrees folder", WORKTREES),
      rangeeDeSetting(doc, { nom: "sandbox", cle: "bac", niveau: niveauDe(doc, "ordinaires"), valeur: [avec(doc, "span", bac.dit), survol(doc, bac.survol)] }),
      rangee,
    ];
  }

  racine.append(avec(doc, "p", READ, "dit"));
  return lire().then(() => racine);
}
