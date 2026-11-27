// @ts-check
// La section « Folders and sandbox » de la page d'une station (ticket 2644, épique 2497) : où la station garde les clones
// et les worktrees de ses cooks, l'état de son bac à sable, et la porte réseau — ce qu'un cook peut joindre. Chaque
// réglage est une rangée de réglage (components/setting, ticket 2920) avec la marque de son niveau (« this machine ») :
// il vit sur la machine, jamais dans le dépôt, donc aucune PR. Sur la station de cet ordinateur, un dossier et la porte se
// changent d'un champ qui s'applique dès qu'il change — pas de « Save » ; retirer un hôte se confirme en ligne. Sur une
// autre station (`lectureSeule`), la section montre sans offrir de changer.
// La section ne touche ni `document` ni le pont : la coque lui donne une fabrique et `contexte.reglages`, qui lit et écrit.

import { buttonAction, hover } from "../../../bricks.js";
import { confirmationOfAction } from "../../../components/confirmation/confirmation.js";
import { lineError } from "../../../components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "../../../components/setting/setting.js";
import { levelOf } from "../../../levels.js";
import { apply, NOTHING_N_A_CHANGE } from "../apply.js";
import { READING, NOT_REACHED } from "../../../lexicon.js";

/** @typedef {import("../../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../components/setting/setting.js").Says} Says */
/**
 * Ce que la station dit d'elle-même. `hotes` : la porte réseau, chaque hôte avec ce qui l'ouvre ; `ajoutes` seuls se retirent.
 * @typedef {{ clones: string, worktrees: string, bac: "on" | "off", hotes: { hote: string, origine: string, ajoute: boolean }[] }} Settings
 */
/** @typedef {{ refus: string, detail?: string }} Refusal */
/**
 * @typedef {{
 *   lire(): Promise<Settings | Refusal>,
 *   ecrire?(change: { clones?: string, worktrees?: string, hotes?: string[] }): Promise<{ fait: string } | Refusal>,
 * }} Port
 */

export const CLONES = "where this station keeps the clone of each project — the copy it fetches and cooks from";
export const WORKTREES = "where this station puts the worktrees of its cooks — each cook writes only in its own";
export const SANDBOX = {
  on: { dit: "on", survol: "cooks run in Claude Code's sandbox: they write only in their own worktree, and reach only the hosts below" },
  off: { dit: "off", survol: "this station runs its cooks without a sandbox — you chose to continue without it" },
};
export const DOOR = "the network hosts a cook may reach — everything else is refused";
export const UNAVAILABLE = NOT_REACHED("folders and sandbox");
export const WITHOUT_READ = "this app does not read them";
export const OTHER_STATION = "not available for this station";
export const ON_ITS_COMPUTER = "its folders and hosts are read and changed on its own computer";
export const NOT_STILL = " — the station does not apply this setting yet";
export const REMOVE = "remove";
export const CLOSE = (/** @type {string} */ host) => `Close ${host}? Cooks on this station can no longer reach it.`;
export const CLOSE_YES = "close it";
export const CLOSE_NOT = "keep it open";

/** @param {Fabrique} doc @param {string} balise @param {string} text @param {string} [classe] */
function withIt(doc, balise, text, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

/** @param {Fabrique} doc @param {{ station: { nom: string }, lectureSeule: boolean, reglages?: Port }} context */
export function setSection(doc, context) {
  const root = doc.createElement("div");
  root.className = "dossiers-et-bac-a-sable";
  const port = context.lectureSeule ? undefined : context.reglages;
  // Ce que le dernier changement a rendu, sous son réglage — un seul parle à la fois —, et l'hôte dont le retrait se confirme.
  /** @type {Record<string, Says | undefined>} */
  let saidOnes = {};
  /** @type {string | undefined} */
  let aRemove;
  /** @type {Settings | undefined} */
  let last;

  const render = () => {
    if (last !== undefined) root.replaceChildren(...lines(last));
  };
  const read = async () => {
    const readOnes = context.lectureSeule ? { refus: OTHER_STATION, detail: ON_ITS_COMPUTER } : port === undefined ? { refus: UNAVAILABLE, detail: WITHOUT_READ } : await port.lire().catch((/** @type {unknown} */ e) => ({ refus: UNAVAILABLE, detail: e instanceof Error ? e.message : String(e) }));
    if ("refus" in readOnes) return root.replaceChildren(lineError(doc, readOnes.refus, readOnes.detail ?? ""));
    last = readOnes;
    render();
  };

  // Un changement s'applique dès que son contrôle change, par le seul geste d'écriture de la section ; la section se relit
  // ensuite, et ce qu'il a rendu se dit sous son réglage.
  /** @param {"clones" | "worktrees" | "porte"} key @param {any} row @param {any[]} checks @param {{ clones?: string, worktrees?: string, hotes?: string[] }} change */
  const write = async (key, row, checks, change) => {
    const said = await apply(doc, row, checks, () => port?.ecrire?.(change) ?? { refus: NOTHING_N_A_CHANGE, detail: "this app cannot write them" });
    saidOnes = { [key]: said };
    await read();
  };

  /** @param {Settings} readOnes */
  function lines(readOnes) {
    const editable = port?.ecrire !== undefined;
    /** @param {"clones" | "worktrees"} key @param {string} name @param {string} help */
    const folder = (key, name, help) => {
      const row = rowOfSetting(doc, { nom: name, cle: key, niveau: levelOf(doc, "dossier"), valeur: [withIt(doc, "span", readOnes[key], "mono"), hover(doc, help + NOT_STILL)], dessous: saysOfSetting(doc, saidOnes[key]) });
      if (editable) {
        const field = doc.createElement("input");
        field.type = "text";
        field.value = readOnes[key];
        field.ariaLabel = `Change the ${name}`;
        field.addEventListener("change", () => {
          const wanted = String(field.value).trim();
          if (wanted !== readOnes[key]) void write(key, row, [field], { [key]: wanted });
        });
        row.children[2].append(field);
      }
      return row;
    };
    const sandbox = SANDBOX[readOnes.bac];
    const added = readOnes.hotes.filter(({ ajoute: adds }) => adds).map(({ hote: host }) => host);
    const door = [];
    /** @type {any[]} */
    const checks = [];
    for (const { hote: host, origine: origin, ajoute: adds } of readOnes.hotes) {
      const oneOf = withIt(doc, "span", host, "mono");
      oneOf.className = "mono hote";
      oneOf.dataset.hote = host;
      oneOf.append(hover(doc, origin));
      if (editable && adds) {
        // Retirer un hôte ferme la porte aux cooks : le geste se confirme en ligne, sous la porte.
        const remove = buttonAction(doc, REMOVE, () => {
          aRemove = host;
          render();
        });
        checks.push(remove.children[0]);
        oneOf.append(remove);
      }
      door.push(oneOf);
    }
    const row = rowOfSetting(doc, { nom: "network door", cle: "porte", niveau: levelOf(doc, "porte"), valeur: [...door, hover(doc, DOOR + NOT_STILL)] });
    if (editable) {
      const field = doc.createElement("input");
      field.type = "text";
      field.placeholder = "registry.npmjs.org";
      field.ariaLabel = "Host to open";
      checks.push(field);
      field.addEventListener("change", () => {
        const wanted = String(field.value).trim();
        if (wanted !== "") void write("porte", row, checks, { hotes: [...added, wanted] });
      });
      row.children[2].append(field);
      const host = aRemove;
      if (host !== undefined && added.includes(host)) {
        const confirmation = confirmationOfAction(
          doc,
          { titre: CLOSE(host), oui: CLOSE_YES, non: CLOSE_NOT },
          {
            oui: () => {
              aRemove = undefined;
              confirmation.remove();
              void write("porte", row, checks, { hotes: added.filter((h) => h !== host) });
            },
            non: () => {
              aRemove = undefined;
              render();
            },
          },
        );
        row.append(confirmation);
      }
    }
    row.append(...saysOfSetting(doc, saidOnes.porte));
    return [
      folder("clones", "clones folder", CLONES),
      folder("worktrees", "worktrees folder", WORKTREES),
      rowOfSetting(doc, { nom: "sandbox", cle: "bac", niveau: levelOf(doc, "ordinaires"), valeur: [withIt(doc, "span", sandbox.dit), hover(doc, sandbox.survol)] }),
      row,
    ];
  }

  root.append(withIt(doc, "p", READING, "dit"));
  return read().then(() => root);
}
