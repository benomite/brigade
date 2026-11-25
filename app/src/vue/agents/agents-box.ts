// L'onglet Agents, côté process principal (ticket 4117) : les agents du projet lus, et un réglage changé, là où la cuisine du
// projet tourne — par les commandes du runtime qui existent, comme les tickets récurrents (vue/recurrents/recurrents-box.ts) :
//   - lire : `facts` (les agents, les rôles, la cadence, les budgets de gates, les stations), `setting` (les réglages en
//     vigueur et d'où ils viennent), `switch` (l'interrupteur du projet), `closing --json` (ce que le closer voit sur la base)
//     et `log --last N` (quand une décision a été posée) ; `fiches.ts` en compose un enregistrement par agent ;
//   - changer : `station -- <geste> <valeur>` (reglables.ts) pose une décision du chef dans le journal, que le runtime relit
//     sans redémarrage ; `switch off` met le projet en pause. Rien ne se pose sur la box d'autre façon.
// Ce qui ne se lit pas ne se devine pas : une lecture qui échoue est dite dans la fiche qu'elle fait, sauf `facts` — sans lui,
// aucun agent n'est connu, et la vue reçoit `{sans, detail}`. Un changement rend toujours `{ok: true}` ou `{ok: false, reason}`.
import type { Lu, Rendu } from "../../box.ts";
import { detailDe, reglagesVus, sansLaCommande } from "../../reglages-du-projet.ts";
import { fichesDesAgents, valeurDe, type Changements, type Fiche, type Interrupteur, type Manque } from "./fiches.ts";
import { commandeDe, reglableDe } from "./reglables.ts";

type Lancer = (lu: Lu, commande: string) => Promise<Rendu>;
type Lue = { sortie: string } | Manque;
export type Reponse = { ok: true } | { ok: false; reason: string; detail?: string };

// Le journal relu pour dire quand une décision a été posée : ses derniers événements, les battements du runtime exclus.
export const EVENEMENTS_DU_JOURNAL = 1000;
const DE_LA_PAUSE = ["manager", "cooks", "pass"];
const REFUS_DU_DEPOT = "but the project's repository sets it";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Ce qu'une commande a rendu : sa sortie, ou pourquoi elle n'en a pas — sa phrase en une ligne, le détail au survol.
async function lancee(lancer: Lancer, lu: Lu, commande: string): Promise<Lue> {
  const rendu = await lancer(lu, commande);
  if (sansLaCommande(rendu)) return { sans: `this station's runtime has no \`${commande}\` command — update it`, detail: detailDe(rendu) };
  if (rendu.erreur !== null) return { sans: `\`${commande}\` failed`, detail: detailDe(rendu) };
  return { sortie: rendu.sortie };
}
const manque = (lue: Lue): lue is Manque => "sans" in lue;

// Le JSON d'une sortie : toute la sortie, ou sa dernière ligne qui en est un — `null` si aucune ne l'est.
function jsonDe(sortie: string): unknown {
  for (const candidat of [sortie.trim(), ...sortie.trim().split("\n").reverse()]) {
    try {
      return JSON.parse(candidat);
    } catch {
      // Une autre ligne de la sortie.
    }
  }
  return null;
}

// `switch` : « switch     OFF since 2026-… (by chef) — … » — ou « NOT SET », que rien n'allume ni n'éteint.
export function interrupteurLu(sortie: string): Interrupteur | Manque {
  const lu = /^switch\s+(ON|OFF)\s+since\s+(\S+)\s+\(by ([^,)]+)/m.exec(sortie);
  return lu === null ? { sans: "the project switch is not set, or its answer cannot be read", detail: sortie.trim() } : { on: lu[1] === "ON", since: lu[2] as string, by: (lu[3] as string).trim() };
}

// `log` : « <seq>  <heure>  <projet>  <ticket>  <type>  <auteur>  <charge> » — la dernière décision posée de chaque réglage, et
// le dernier plafond de cooks. Une décision retirée n'est plus posée.
export function changementsLus(sortie: string): Changements {
  const changements: Changements = new Map();
  for (const ligne of sortie.split("\n")) {
    const lu = /^\d+  (\S+)  \S+  \S+  (decision\.set|decision\.withdrawn|station\.capped)  (\S+)  (.*)$/.exec(ligne);
    if (lu === null) continue;
    const [, at, type, by, charge] = lu as unknown as [string, string, string, string, string];
    let payload: unknown = null;
    try {
      payload = JSON.parse(charge);
    } catch {
      continue;
    }
    if (!estObjet(payload)) continue;
    if (type === "station.capped") changements.set("cooks", { at, by });
    else if (typeof payload.name === "string") {
      if (type === "decision.set") changements.set(payload.name, { at, by });
      else changements.delete(payload.name);
    }
  }
  return changements;
}

// Les agents du projet : `{sans, detail}` quand rien ne se lit — pas de station, ou pas de faits.
export async function lireLesAgents(projet: string, lu: Lu | undefined, lancer: Lancer, maintenant: () => Date = () => new Date()): Promise<Fiche[] | Manque> {
  if (lu === undefined) return { sans: `${projet} has no station: its agents are read where its kitchen runs` };
  const [faits, reglages, interrupteur, fermeture, journal] = (await Promise.all(["facts", "setting", "switch", "closing --json", `log --last ${EVENEMENTS_DU_JOURNAL}`].map((commande) => lancee(lancer, lu, commande)))) as [Lue, Lue, Lue, Lue, Lue];
  if (manque(faits)) return { sans: "the agents were not read: the kitchen's facts could not be read", ...(faits.detail === undefined ? {} : { detail: faits.detail }) };
  const lus = jsonDe(faits.sortie);
  if (!estObjet(lus)) return { sans: "the agents were not read: the kitchen's facts are not readable", detail: faits.sortie.slice(0, 400) };
  return fichesDesAgents({
    maintenant: maintenant(),
    faits: lus,
    reglages: manque(reglages) ? reglages : (reglagesVus(reglages.sortie) ?? { sans: "the project's settings are not readable", detail: reglages.sortie.slice(0, 400) }),
    interrupteur: manque(interrupteur) ? interrupteur : interrupteurLu(interrupteur.sortie),
    fermeture: manque(fermeture) ? null : jsonDe(fermeture.sortie),
    changements: manque(journal) ? journal : changementsLus(journal.sortie),
  });
}

const refus = (reason: string, detail?: string): Reponse => ({ ok: false, reason, ...(detail === undefined ? {} : { detail }) });

// Change un réglage d'un agent : la pause d'un agent que l'interrupteur tient, ou une décision du chef que `station` pose.
export async function reglerUnReglage(projet: string, lu: Lu | undefined, agent: unknown, cle: unknown, valeur: unknown, lancer: Lancer): Promise<Reponse> {
  if (lu === undefined) return refus(`nothing was changed: “${projet}” has no station — there is no runtime to tell`);
  if (cle === "paused" && DE_LA_PAUSE.includes(agent as string)) {
    if (valeur !== "paused") return refus("nothing was changed: switching the project on again asks you first — use the switch at the head of the page");
    const rendu = await lancer(lu, "switch off");
    if (sansLaCommande(rendu)) return refus("nothing was changed: this station's runtime has no `switch` command — update it", detailDe(rendu));
    return rendu.erreur === null ? { ok: true } : refus("nothing was changed: the runtime refused to pause the project", detailDe(rendu));
  }
  const reglable = reglableDe(agent, cle);
  if (reglable === undefined) return refus("nothing was changed: this setting cannot be changed from the app");
  const commande = commandeDe(reglable, valeur);
  if (commande === null) return refus(`nothing was changed: “${String(valeur)}” is not a value of this setting`);
  // Le dépôt du projet qui pose le réglage l'emporte sur une décision : elle serait ignorée, mieux vaut ne pas l'écrire.
  const lus = await lancee(lancer, lu, "setting");
  if (!manque(lus)) {
    const vus = reglagesVus(lus.sortie);
    const pose = vus === null || reglable.agent === "cooks" ? undefined : valeurDe(reglable, { reglages: vus, faits: {} });
    if (pose !== undefined && !("sans" in pose) && pose.depot) return refus("nothing was changed: the project's repository sets this one (.claude/brigade/projet.json) — change it there, with a pull request, from Settings");
  }
  const rendu = await lancer(lu, commande);
  if (sansLaCommande(rendu)) return refus("nothing was changed: this station's runtime cannot take this decision — update it", detailDe(rendu));
  if (rendu.erreur !== null) return refus(`nothing was changed: ${(rendu.erreurs.trim().split("\n").at(-1) ?? "").replace(/^brigade : /, "") || "the runtime refused it"}`, detailDe(rendu));
  if (rendu.sortie.includes(REFUS_DU_DEPOT)) return refus("the decision was written, but the project's repository sets this one too: the runtime ignores the decision while it does", detailDe(rendu));
  return { ok: true };
}

// Les deux gestes du pont (`lireLesAgentsDuProjet`, `reglerUnAgent`, preload.cjs) : main.ts les branche d'une ligne.
export function brancherLesAgents(
  ipc: { handle(canal: string, ecouter: (evenement: unknown, ...args: unknown[]) => unknown): void },
  cuisineDuProjet: (nom: unknown) => { vise: { nom: string } | undefined; lu: Lu | undefined },
  lancer: Lancer,
): void {
  ipc.handle("lireLesAgentsDuProjet", (_, nom) => {
    const { vise, lu } = cuisineDuProjet(nom);
    return vise === undefined ? { sans: `${String(nom)} is no longer in the projects file` } : lireLesAgents(vise.nom, lu, lancer);
  });
  ipc.handle("reglerUnAgent", (_, nom, agent, cle, valeur) => {
    const { vise, lu } = cuisineDuProjet(nom);
    return vise === undefined ? refus(`nothing was changed: “${String(nom)}” is no longer in the projects file`) : reglerUnReglage(vise.nom, lu, agent, cle, valeur, lancer);
  });
}
