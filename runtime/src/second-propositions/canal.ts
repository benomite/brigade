// Le canal entre le second et l'app (#1519, épique #1518) : la proposition en
// cours du second (`proposition.ts`) — une liste de choix, ou un geste —, qu'il
// publie, que l'app suit, et que la réponse du chef efface.
//
// Le canal est un fichier, un par dossier de projet, sur l'ordinateur du chef :
// le second y écrit d'un process (la commande ci-dessous, qu'il lance comme ses
// autres commandes), l'app le lit d'un autre. Il porte une proposition au plus :
//   - publier remplace la proposition d'avant, d'un seul `rename` — un abonné ne
//     tient jamais deux propositions, ni une moitié d'une ;
//   - effacer (le second est passé à autre chose) retire le fichier ;
//   - la réponse du chef — un clic, ou une réponse tapée dans le terminal — le
//     retire aussi, mais seulement s'il porte encore la proposition à laquelle
//     elle répond (son `id`) : une proposition publiée entre-temps reste.
// L'abonné (`suivreLaProposition`) reçoit la proposition en cours dès qu'il
// s'abonne, puis chaque fois qu'elle change, et null quand il n'y en a plus.
//
// Le fichier est `~/.config/brigade/second/<clé du dossier>.json`, la même clé
// pour le second, lancé dans le dossier du projet, et pour l'app, qui le connaît
// par `app.json` (`fichierDeProposition`) ; `BRIGADE_SECOND_PROPOSAL` en nomme
// un autre.
//
// Rien ici ne lance la commande d'un geste : c'est le chef qui la fait, dans
// l'onglet Second. Le canal la garde, la rend, et l'oublie.
//
// L'app l'importe, ou lance la commande, dans le dossier du projet :
//
//   node runtime/src/second-propositions/canal.ts choices <valeur> <libellé> [<valeur> <libellé>]…
//   node runtime/src/second-propositions/canal.ts gesture <commande>
//   node runtime/src/second-propositions/canal.ts clear
//   node runtime/src/second-propositions/canal.ts show
//   node runtime/src/second-propositions/canal.ts answered <id> click [<valeur>]
//   node runtime/src/second-propositions/canal.ts answered <id> text
//
// qui rend son état en une ligne JSON : `published` et la proposition, `cleared`,
// `current` et la proposition (ou null), `answered`, ou `refused` et `reason` —
// code 0, sauf un refus (1) et un usage faux (2).
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, constants, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { aProposer, propositionLue, Refus, reponseLue, type Proposition } from "./proposition.ts";

export const VARIABLE_DU_CANAL = "BRIGADE_SECOND_PROPOSAL";

// Le fichier du canal pour le projet de ce dossier.
export function fichierDeProposition(dossier: string, env: Record<string, string | undefined> = process.env): string {
  const nomme = env[VARIABLE_DU_CANAL];
  if (nomme !== undefined && nomme !== "") return resolve(nomme);
  let vrai = resolve(dossier);
  try {
    vrai = realpathSync(vrai);
  } catch {
    // Un dossier qui n'existe pas encore garde sa clé de chemin.
  }
  const cle = createHash("sha256").update(vrai).digest("hex").slice(0, 16);
  return join(env.HOME || homedir(), ".config", "brigade", "second", `${cle}.json`);
}

const absent = (erreur: unknown) => (erreur as NodeJS.ErrnoException).code === "ENOENT";

// Ce que porte le fichier : la proposition en cours, ou null — aucun fichier, ou
// un fichier qui n'en a pas la forme.
function lire(chemin: string): Proposition | null {
  let brut: string;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch (erreur) {
    if (absent(erreur)) return null;
    throw erreur;
  }
  try {
    return propositionLue(JSON.parse(brut));
  } catch {
    return null;
  }
}

// Un fichier de passage, à côté du canal : un `rename` ne traverse pas les disques.
const passage = (chemin: string, sorte: string) => `${chemin}.${randomUUID()}.${sorte}`;

export function propositionActuelle(chemin: string): Proposition | null {
  return lire(chemin);
}

// Publie la proposition du second, à la place de celle d'avant. Lève un `Refus`
// pour ce qui n'a pas la forme d'une proposition.
export function publier(chemin: string, brute: unknown, maintenant: () => Date = () => new Date()): Proposition {
  const proposition: Proposition = { ...aProposer(brute), id: randomUUID(), at: maintenant().toISOString() };
  mkdirSync(dirname(chemin), { recursive: true });
  const ecrit = passage(chemin, "tmp");
  writeFileSync(ecrit, `${JSON.stringify(proposition)}\n`);
  try {
    renameSync(ecrit, chemin);
  } catch (erreur) {
    rmSync(ecrit, { force: true });
    throw erreur;
  }
  return proposition;
}

// Le second est passé à autre chose : plus de proposition. Rend celle qui l'était.
export function effacer(chemin: string): Proposition | null {
  const avant = lire(chemin);
  rmSync(chemin, { force: true });
  return avant;
}

export type Repondue = { state: "answered"; proposal: Proposition } | { state: "refused"; reason: string; current: Proposition | null };

// L'app signale que le chef a répondu : la proposition qu'il a vue s'efface, et
// les abonnés le reçoivent. Rien ne s'efface d'une autre proposition que celle-là.
export function repondre(chemin: string, brute: unknown): Repondue {
  const actuelle = lire(chemin);
  if (actuelle === null) return { state: "refused", reason: "nothing to answer: the second has no proposal", current: null };
  const changee = (current: Proposition | null): Repondue => ({ state: "refused", reason: "nothing to answer: the second's proposal changed since it was read", current });
  const nommee = typeof brute === "object" && brute !== null ? (brute as { id?: unknown }).id : undefined;
  if (typeof nommee === "string" && nommee !== actuelle.id) return changee(actuelle);
  let reponse;
  try {
    reponse = reponseLue(brute, actuelle);
  } catch (erreur) {
    if (erreur instanceof Refus) return { state: "refused", reason: erreur.message, current: actuelle };
    throw erreur;
  }
  // Le fichier est pris d'un `rename`, puis lu : ce qui a été pris est bien ce
  // qui est effacé. Une proposition publiée juste avant est remise, si aucune
  // autre ne l'a remplacée depuis.
  const pris = passage(chemin, "answered");
  try {
    renameSync(chemin, pris);
  } catch (erreur) {
    if (absent(erreur)) return changee(null);
    throw erreur;
  }
  const prise = lire(pris);
  if (prise?.id === reponse.id) {
    rmSync(pris, { force: true });
    return { state: "answered", proposal: prise };
  }
  try {
    linkSync(pris, chemin);
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      try {
        copyFileSync(pris, chemin, constants.COPYFILE_EXCL);
      } catch {
        // Une proposition plus récente tient déjà le canal.
      }
    }
  }
  rmSync(pris, { force: true });
  return changee(lire(chemin));
}

export type Suivi = { actuelle(): Proposition | null; arreter(): void };

// Suit le canal : `ecouter` reçoit la proposition en cours tout de suite, puis à
// chaque changement — une autre proposition, ou null quand elle est effacée ou
// répondue. Jamais deux fois la même d'affilée.
export function suivreLaProposition(chemin: string, ecouter: (proposition: Proposition | null) => void): Suivi {
  const dossier = dirname(chemin);
  const nom = basename(chemin);
  mkdirSync(dossier, { recursive: true });
  let tenue: Proposition | null = null;
  let arrete = false;
  const relire = () => {
    if (arrete) return;
    const lue = lire(chemin);
    if ((lue?.id ?? null) === (tenue?.id ?? null)) return;
    tenue = lue;
    ecouter(lue);
  };
  // C'est le dossier qui est veillé : le fichier y arrive par un `rename`, et en part.
  const veille: FSWatcher = watch(dossier, (_, fichier) => {
    if (fichier === null || fichier === nom) relire();
  });
  // Un dossier retiré sous la veille la ferme : le suivi s'arrête, sans faire tomber l'app.
  veille.on("error", () => {});
  tenue = lire(chemin);
  ecouter(tenue);
  return {
    actuelle: () => tenue,
    arreter: () => {
      arrete = true;
      veille.close();
    },
  };
}

const USAGE = [
  "usage: node runtime/src/second-propositions/canal.ts choices <value> <label> [<value> <label>]…",
  "       node runtime/src/second-propositions/canal.ts gesture <command>",
  "       node runtime/src/second-propositions/canal.ts clear | show",
  "       node runtime/src/second-propositions/canal.ts answered <id> click [<value>] | answered <id> text",
];

function usage(appel: Appel): never {
  for (const ligne of USAGE) appel.redire(ligne);
  throw new Sortie(2);
}

export function principal(appel: Appel, dossier: string = process.cwd()): void {
  const [sorte, ...reste] = appel.args;
  const chemin = fichierDeProposition(dossier, appel.env);
  const refuser = (reason: string): never => {
    appel.dire(JSON.stringify({ state: "refused", reason }));
    throw new Sortie(1);
  };
  const publie = (brute: unknown) => {
    try {
      appel.dire(JSON.stringify({ state: "published", proposal: publier(chemin, brute) }));
    } catch (erreur) {
      if (erreur instanceof Refus) refuser(erreur.message);
      throw erreur;
    }
  };
  if (sorte === "choices") {
    if (reste.length === 0 || reste.length % 2 !== 0) usage(appel);
    const choices = [];
    for (let i = 0; i < reste.length; i += 2) choices.push({ value: reste[i], label: reste[i + 1] });
    return publie({ kind: "choices", choices });
  }
  // La commande d'un geste est un seul argument, pris tel quel : rien ne la recompose.
  if (sorte === "gesture") {
    if (reste.length !== 1) usage(appel);
    return publie({ kind: "gesture", command: reste[0] });
  }
  if (sorte === "clear" || sorte === "show") {
    if (reste.length !== 0) usage(appel);
    if (sorte === "clear") {
      effacer(chemin);
      return appel.dire(JSON.stringify({ state: "cleared" }));
    }
    return appel.dire(JSON.stringify({ state: "current", proposal: propositionActuelle(chemin) }));
  }
  if (sorte === "answered") {
    const [id, par, valeur, ...trop] = reste;
    if (id === undefined || trop.length > 0 || (par !== "click" && par !== "text") || (par === "text" && valeur !== undefined)) usage(appel);
    const rendu = repondre(chemin, par === "text" ? { id, by: "text" } : { id, by: "click", ...(valeur === undefined ? {} : { value: valeur }) });
    if (rendu.state !== "answered") refuser(rendu.reason);
    return appel.dire(JSON.stringify(rendu));
  }
  usage(appel);
}

if (import.meta.main) await enProcess((appel) => principal(appel));
