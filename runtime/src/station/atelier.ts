// Le déménagement d'un projet vers l'atelier de la station
// (`configuration.ts`, `atelierDeLaStation`) : un projet servi avant que son
// clone et ses worktrees ne vivent dans l'atelier les a encore sous le
// répertoire de la station — sur le Mac du chef, sous `~/.config/brigade`, où
// aucun cook du bac à sable ne travaille. La station l'y déménage avant
// d'ouvrir sa cuisine, sans que le chef ait rien à faire.
//
// Rien n'est copié, rien n'est retiré : le clone et chaque worktree sont
// renommés tels quels — fichiers non commités, branches et remises compris —,
// puis `git` y retrouve ses liens (`git worktree repair`). Ce qui ne se
// déménage pas reste où il est, et se dit : la cuisine s'ouvre quand même, et
// le rattrapage du nettoyage le dit gardé tant qu'il n'est pas rangé. Un
// worktree n'est jamais retiré ici — c'est au nettoyage de commiter sur sa
// branche ce qui y traîne avant de le retirer.
//
// Sous le verrou du projet : aucun runtime ne le sert pendant qu'on déplace
// son clone. Tenu par un autre, rien ne bouge — la cuisine sera refusée de
// toute façon, et réessayée dès qu'il est libre.
import { execFileSync } from "../sans-invite.ts";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { prendreVerrou, VerrouTenu } from "../verrou.ts";
import { ETATS, lieuxSousLaStation, type LieuxDuProjet } from "./configuration.ts";

// Les worktrees jetables de la pass, sous ceux des cooks (`depot.ts`).
const ESSAIS = ".essais";
// Un fichier `.git` de worktree tient en une ligne.
const LIGNE_MAX = 4096;
const DELAI_MS = 120_000;
// Ni guetteur de fichiers, ni hook : rien de ce que nommerait la
// configuration du clone n'est lancé.
const SANS_COMMANDE = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];

export type Demenagement = {
  // Ce qui a bougé, une ligne chacun.
  deplaces: string[];
  // Ce qui reste à l'ancienne place, et pourquoi.
  restes: string[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// La ligne d'un fichier ordinaire — ni lien, ni tube.
function uneLigne(chemin: string): string | null {
  try {
    const fichier = lstatSync(chemin);
    return fichier.isFile() && fichier.size <= LIGNE_MAX ? readFileSync(chemin, "utf8").trim() : null;
  } catch {
    return null;
  }
}

const reel = (chemin: string): string | null => {
  try {
    return realpathSync.native(chemin);
  } catch {
    return null;
  }
};

// Renomme `de` en `vers`, si `vers` n'existe pas. Rend la raison d'un refus,
// ou null.
function renommer(de: string, vers: string): string | null {
  if (existsSync(vers)) return `${vers} existe déjà`;
  try {
    mkdirSync(dirname(vers), { recursive: true });
    renameSync(de, vers);
    return null;
  } catch (erreur) {
    // Sur un autre volume, un renommage n'est plus possible : copier puis
    // retirer, ce serait retirer un travail qu'on n'a pas relu.
    return (erreur as NodeJS.ErrnoException).code === "EXDEV" ? `${dirname(vers)} est sur un autre volume : rien n'est copié` : message(erreur);
  }
}

const lister = (repertoire: string): string[] => {
  try {
    return readdirSync(repertoire).sort();
  } catch {
    return [];
  }
};

// Les worktrees d'un répertoire : ceux des cooks, et les jetables de la pass.
const worktreesSous = (repertoire: string): string[] => lister(repertoire).flatMap((nom) => (nom === ESSAIS ? lister(join(repertoire, nom)).map((essai) => join(ESSAIS, essai)) : [nom]));

export type OptionsDemenagement = {
  // Le clone que la station tient à sa place : il déménage avec ses
  // worktrees. Faux quand la ligne du projet nomme le sien
  // (`BRIGADE_REPO_DIR`) : celui-là ne bouge pas, ses worktrees seuls
  // déménagent.
  cloneDeLaStation: boolean;
  env?: NodeJS.ProcessEnv;
};

// Déménage le clone et les worktrees d'un projet de leur place sous le
// répertoire de la station vers `lieux` — ceux que la station lui donne
// désormais. Rien à faire — mêmes lieux, rien à l'ancienne place —, rend un
// déménagement vide.
export function demenagerVersLAtelier(racine: string, nom: string, lieux: LieuxDuProjet, options: OptionsDemenagement): Demenagement {
  const { env } = options;
  const ancien = lieuxSousLaStation(racine, nom);
  const bilan: Demenagement = { deplaces: [], restes: [] };
  const [clone, worktrees] = [resolve(lieux.clone), resolve(lieux.worktrees)];
  const cloneADeplacer = options.cloneDeLaStation && resolve(ancien.clone) !== clone && existsSync(ancien.clone);
  if (!cloneADeplacer && (resolve(ancien.worktrees) === worktrees || worktreesSous(ancien.worktrees).length === 0)) return bilan;

  const etat = join(racine, ETATS, nom);
  let verrou = null;
  if (existsSync(join(etat, "lock.db"))) {
    try {
      verrou = prendreVerrou(etat);
    } catch (erreur) {
      if (erreur instanceof VerrouTenu) return bilan;
      throw erreur;
    }
  }
  try {
    // Le clone d'abord : les worktrees ne retrouvent leurs liens que vers lui.
    // Un clone déjà dans l'atelier est celui que la cuisine ouvrira ; l'ancien
    // reste, et ses worktrees avec lui — leurs liens mènent à lui seul.
    if (cloneADeplacer) {
      const refus = renommer(ancien.clone, clone);
      if (refus !== null) {
        bilan.restes.push(`le clone reste à ${ancien.clone} — ${refus}`);
        if (worktreesSous(ancien.worktrees).length > 0) bilan.restes.push(`ses worktrees restent à ${ancien.worktrees}, accrochés à ce clone`);
        return bilan;
      }
      bilan.deplaces.push(`clone : ${ancien.clone} → ${clone}`);
    }
    if (resolve(ancien.worktrees) === worktrees) return bilan;
    // Les liens du clone vers ses worktrees, et des worktrees vers lui : ceux
    // de `git worktree`, sous le `.git` du clone.
    let commun: string | null = null;
    try {
      commun = reel(resolve(clone, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: clone, env, timeout: DELAI_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()));
    } catch {
      // Pas de clone lisible : aucun worktree ne retrouverait ses liens.
    }
    for (const relatif of worktreesSous(ancien.worktrees)) {
      const [de, vers] = [join(ancien.worktrees, relatif), join(worktrees, relatif)];
      const rester = (pourquoi: string) => void bilan.restes.push(`le worktree ${de} reste où il est — ${pourquoi}`);
      // Un répertoire sans `.git` n'est plus un worktree — une préparation à
      // moitié faite : il déménage tel quel, et le nettoyage le traite là
      // comme il l'aurait traité ici.
      if (lstatSync(join(de, ".git"), { throwIfNoEntry: false }) === undefined) {
        const refus = renommer(de, vers);
        if (refus === null) bilan.deplaces.push(`répertoire : ${de} → ${vers}`);
        else rester(refus);
        continue;
      }
      // Un worktree dit lui-même où sont ses liens dans le clone : une seule
      // ligne, `gitdir: <clone>/.git/worktrees/<nom>`. Celui qui ne la porte
      // pas, ou qui nomme un lien que le clone n'a pas, n'est pas déplacé :
      // `git` ne saurait pas l'y raccrocher.
      if (commun === null) {
        rester(`le clone ${clone} n'est pas un dépôt git lisible`);
        continue;
      }
      const designe = /^gitdir: (.+)$/.exec(uneLigne(join(de, ".git")) ?? "")?.[1];
      const lien = designe === undefined ? null : join(commun, "worktrees", basename(designe));
      if (lien === null || !lstatSync(lien, { throwIfNoEntry: false })?.isDirectory()) {
        rester(designe === undefined ? "son fichier `.git` ne désigne pas le clone" : `le clone n'a pas son lien (${lien})`);
        continue;
      }
      const refus = renommer(de, vers);
      if (refus !== null) {
        rester(refus);
        continue;
      }
      try {
        execFileSync("git", [...SANS_COMMANDE, "worktree", "repair", vers], { cwd: clone, env, timeout: DELAI_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (erreur) {
        bilan.restes.push(`le worktree ${vers} est déplacé, mais \`git worktree repair\` a échoué — ${message(erreur)}`);
        continue;
      }
      const repare = /^gitdir: (.+)$/.exec(uneLigne(join(vers, ".git")) ?? "")?.[1];
      if (repare === undefined || reel(resolve(vers, repare)) !== reel(lien)) {
        bilan.restes.push(`le worktree ${vers} est déplacé, mais ne désigne pas encore son lien dans le clone`);
        continue;
      }
      bilan.deplaces.push(`worktree : ${de} → ${vers}`);
    }
    // Vidés, les répertoires de l'ancienne place partent ; un reste les garde.
    for (const vide of [join(ancien.worktrees, ESSAIS), ancien.worktrees]) {
      try {
        if (existsSync(vide) && readdirSync(vide).length === 0) rmdirSync(vide);
      } catch {
        // Ce n'est qu'un répertoire vide.
      }
    }
    return bilan;
  } finally {
    verrou?.relacher();
  }
}
