// Les gestes git de la station sur le dépôt du projet. Son clone ne sert que
// de souche : elle y rapatrie la base et y accroche des worktrees, jamais elle
// n'y change de branche ni n'y écrit un fichier. Seul module qui lance `git`.
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { ConfigInvalide } from "./runtime.ts";

export type Depot = {
  // Rapatrie la base depuis l'origine et crée le worktree du run, sur une
  // branche neuve qui en part.
  preparer(run: string): Promise<{ worktree: string; branche: string }>;
  // Accroche un worktree neuf à la branche d'une livraison déjà faite : celui
  // du cook d'un renvoi. Rend son chemin.
  reprendre(run: string, branche: string): Promise<string>;
  // Défait ce que `preparer` ou `reprendre` a fait, pour un worktree où aucun
  // cook n'est entré : le worktree, et sa branche si elle est nommée.
  retirer(worktree: string, branche?: string): void;
  // Commite sur sa branche ce qui traîne dans le worktree d'un cook : fichiers
  // suivis modifiés, fichiers neufs que le projet n'ignore pas. Rend ce
  // commit, ou null s'il n'y avait rien. Lève si le worktree n'est plus sur sa
  // branche : le commit n'irait nulle part. Rien n'est poussé.
  recolter(worktree: string, branche: string): string | null;
  // Vrai si le worktree est encore sur sa branche : ce que le cook y a commité
  // est alors sur elle. Faux en tête détachée, ou sur une autre branche.
  surSaBranche(worktree: string, branche: string): boolean;
  // Range le worktree d'un cook : ce qui y traîne est récolté, puis il est
  // retiré, avec ce que le projet ignore. La branche reste. Rend le commit de
  // récolte, ou null. Un worktree déjà absent n'est pas un échec ; ce qui ne
  // peut être ni commité ni retiré lève, et rien n'est touché.
  ranger(worktree: string, branche: string): Promise<string | null>;
  // Supprime la branche locale d'un cook, à condition que tous ses commits
  // soient sur l'origine. Rend vrai si elle n'est plus là, faux si elle reste.
  // La branche distante n'est jamais touchée.
  elaguer(branche: string): Promise<boolean>;
  // Vrai si le clone a encore cette branche. Il peut ne plus l'avoir : une
  // restauration repart d'un clone neuf.
  connait(branche: string): boolean;
  // Le nombre de commits que la branche porte en plus de la base.
  commits(branche: string): number;
  // Pousse la branche du cook sur l'origine. Bloquant : c'est de son succès
  // que dépend la fin du cook.
  pousser(branche: string): void;
  // Ce que l'origine a reçu d'une branche : sa branche de suivi, si elle a été
  // poussée, sinon la branche elle-même. C'est ce que la pass juge — une
  // récolte posée au rangement, jamais poussée, n'en fait pas partie.
  livree(branche: string): string;
  // Le commit de tête d'une branche, ou de ce qui en est livré.
  tete(branche: string): string;
  // Vrai si le worktree ne porte rien d'autre que ce qui est commité : ni
  // fichier suivi modifié, ni fichier neuf que le projet n'ignore pas. C'est
  // ce qui sépare un ticket sans diff d'un travail que le cook a oublié de
  // commiter.
  intact(worktree: string): boolean;
  // Les fichiers que la branche change par rapport à la base.
  changes(branche: string): string[];
  // Le diff de ce que la branche a commité par rapport à la base : ce que le
  // reviewer relit.
  diff(branche: string): string;
  // Tout ce qu'un push de la branche publierait, commit par commit : patchs et
  // messages de ce qu'elle porte en plus de la base et de ce que l'origine a
  // déjà reçu d'elle. Une valeur écrite puis retirée deux commits plus loin y
  // est encore ; un fichier que git tient pour binaire — ou que le cook lui a
  // dit de tenir pour tel — s'y lit comme du texte, et un merge y montre ce
  // qu'il change à chacun de ses parents.
  ajouts(branche: string): string;
  // Ramène la branche du worktree à ce que l'origine a reçu d'elle — à la
  // base, si elle n'a jamais été poussée. Ce qu'elle portait en plus est perdu.
  revenir(worktree: string, branche: string): void;
  // Les commits de récolte que la branche porte en plus de la base : ceux que
  // le cook n'a pas écrits.
  recoltes(branche: string): string[];
  // Les fichiers d'un répertoire, tel que la branche le porte. Vide s'il n'y
  // est pas.
  liste(branche: string, repertoire: string): string[];
  // Ce que le worktree porte à cet instant, réduit à une chaîne : elle ne
  // change que s'il a progressé — un commit, un fichier touché. Ce que le
  // projet ignore (dépendances, logs, builds) n'y entre pas.
  empreinte(worktree: string): string;
  // Les fichiers suivis de la base, telle que le clone la connaît depuis son
  // dernier rapatriement.
  fichiers(): string[];
  // Rapatrie la base depuis l'origine ; rend son commit de tête.
  rapatrier(): Promise<string>;
  // Où une livraison en est de la base rapatriée : le commit d'où sa branche
  // part, et de combien de commits la base l'a dépassée depuis.
  retard(branche: string): { depart: string; commits: number };
  // Les fichiers que la base a reçus depuis ce commit.
  arrives(depuis: string): string[];
  // Un worktree jetable, détaché de toute branche : la base rapatriée, ou —
  // avec `sha` — le résultat de son merge dans la base. Rend son chemin, ou
  // null si les deux sont en conflit. Tout autre échec lève : c'est une panne,
  // pas un conflit. Rien n'est poussé, aucune branche n'est créée ni déplacée.
  essayer(nom: string, sha?: string): Promise<string | null>;
  // Un worktree jetable posé sur le commit de tête d'une branche, détaché
  // d'elle : là où la pass joue les gates d'une livraison et la fait relire.
  poser(nom: string, branche: string): Promise<string>;
  // Retire un worktree jetable — tous, sans nom : ceux qu'un runtime tué a
  // laissés. Absent, il n'y a rien à faire.
  jeter(nom?: string): void;
};

export type OptionsDepot = {
  // Le clone du dépôt du projet, réservé à la station.
  clone: string;
  // La branche d'intégration : d'où partent les worktrees.
  base: string;
  // Le répertoire où vivent les worktrees des cooks.
  worktrees: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
  // Le jeton sous lequel partent les deux gestes réseau, rapatrier et pousser :
  // celui de l'identité cook. Absent, `git` s'authentifie comme le compte le
  // lui a appris. `courant` : pousser bloque, il ne peut pas attendre un jeton.
  jeton?: { frais(): Promise<string>; courant(): string };
};

// L'environnement d'un `git` qui parle à GitHub sous un jeton : un en-tête
// pour github.com seul, posé par la configuration d'environnement — ni dans
// un argument, ni dans un fichier. L'aide aux identifiants du compte est
// coupée, et un clone fait en SSH repasse en HTTPS : rien d'autre que le jeton
// n'authentifie ce geste.
export function environnementReseau(env: NodeJS.ProcessEnv, jeton: string): NodeJS.ProcessEnv {
  const reglages: Array<[string, string]> = [
    ["credential.helper", ""],
    ["http.https://github.com/.extraheader", `Authorization: Basic ${Buffer.from(`x-access-token:${jeton}`).toString("base64")}`],
    ["url.https://github.com/.insteadOf", "git@github.com:"],
    ["url.https://github.com/.insteadOf", "ssh://git@github.com/"],
  ];
  const deja = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  const poses = reglages.flatMap(([cle, valeur], i) => [
    [`GIT_CONFIG_KEY_${deja + i}`, cle],
    [`GIT_CONFIG_VALUE_${deja + i}`, valeur],
  ]);
  return { ...env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: String(deja + reglages.length), ...Object.fromEntries(poses) };
}

const DELAI_MS = 120_000;
// Où vivent les worktrees jetables, sous celui des cooks : un nom qu'aucun run
// ne porte.
const ESSAIS = ".essais";
// Le commit d'un essai n'est sur aucune branche : son auteur ne se lit nulle
// part, mais git en exige un.
// Ni signature ni hook : ce commit-là ne va nulle part, et rien de la
// configuration du clone ne doit l'empêcher.
const IDENTITE = ["-c", "user.name=brigade", "-c", "user.email=brigade@localhost", "-c", "commit.gpgsign=false"];
// Le commit de récolte, lui, reste sur la branche du cook : il se reconnaît à
// son auteur et à son sujet. L'environnement l'emporte sur `-c` : l'identité
// passe par les deux.
const COURRIEL = "brigade@localhost";
const SUJET_DE_RECOLTE = "brigade : récolte — ce que le cook avait laissé non commité dans son worktree";
const ENV_DE_RECOLTE = { GIT_AUTHOR_NAME: "brigade", GIT_AUTHOR_EMAIL: COURRIEL, GIT_COMMITTER_NAME: "brigade", GIT_COMMITTER_EMAIL: COURRIEL };
// Ce qu'un `git` lancé dans le worktree d'un cook ne fait jamais, quoi qu'en
// dise la configuration : ni guetteur de fichiers, ni hook, ni descente dans
// un sous-module.
const SANS_COMMANDE = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "submodule.recurse=false"];
// Un fichier qui désigne un répertoire tient en une ligne.
const LIGNE_MAX = 4096;

// Le chemin tel que le disque l'écrit : sans ses liens, et dans la casse et la
// forme Unicode du volume — celles que `git` écrit dans le `.git` d'un
// worktree, quelle que soit la façon dont le clone a été nommé.
const cheminReel = (chemin: string): string => realpathSync.native(chemin);

// La ligne d'un fichier ordinaire — ni lien, ni tube, qu'un cook aurait mis là
// pour faire lire autre chose, ou attendre sans fin.
const uneLigne = (chemin: string): string | null => {
  try {
    const fichier = lstatSync(chemin);
    return fichier.isFile() && fichier.size <= LIGNE_MAX ? readFileSync(chemin, "utf8").trim() : null;
  } catch {
    return null;
  }
};

// Le poids et la date d'un fichier : réécrire un fichier déjà modifié ne change
// pas sa ligne de statut, mais c'est un progrès.
const trace = (chemin: string): string => {
  try {
    const { size, mtimeMs } = lstatSync(chemin);
    return `${size}@${mtimeMs}`;
  } catch {
    return "absent";
  }
};

const motif = (geste: string, erreur: unknown): Error => {
  const { stderr, message } = erreur as { stderr?: string | Buffer; message?: string };
  return new Error(`${geste} : ${String(stderr ?? "").trim() || message || "échec"}`);
};

// Un fichier tel que l'origine le porte sur la branche d'intégration, d'après
// le dernier rapatriement — pas tel qu'un worktree l'a modifié. Nul : la
// branche ne l'a pas. Lève si `git` n'a pas pu le dire (délai, verrou, clone
// pas encore rapatrié) : illisible n'est pas absent.
export function lireALaBase(lieu: { clone: string; base: string }, chemin: string, env?: NodeJS.ProcessEnv): string | null {
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", args, { cwd: lieu.clone, env, timeout: DELAI_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (erreur) {
      throw motif(`git ${args[0]}`, erreur);
    }
  };
  if (git("ls-tree", "--name-only", `origin/${lieu.base}`, "--", chemin).trim() === "") return null;
  return git("show", `origin/${lieu.base}:${chemin}`);
}

export function ouvrirDepot(options: OptionsDepot): Depot {
  const { clone, base } = options;
  // `git` tourne dans le clone : un chemin relatif s'y résoudrait contre lui,
  // alors que le runtime — qui lance le cook dans ce worktree — le lit depuis
  // son propre répertoire.
  const worktrees = resolve(options.worktrees);
  const reglages = { cwd: clone, env: options.env, timeout: DELAI_MS, encoding: "utf8" } as const;
  const git = (...args: string[]): string => execFileSync("git", args, { ...reglages, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const gitAvec = (env: NodeJS.ProcessEnv | undefined, ...args: string[]) =>
    new Promise<void>((resoudre, rejeter) => {
      execFile("git", args, { ...reglages, env }, (erreur, _stdout, stderr) => (erreur ? rejeter(motif(`git ${args[0]}`, { stderr, message: erreur.message })) : resoudre()));
    });
  const gitAsync = (...args: string[]) => gitAvec(options.env, ...args);
  const sousJeton = (jeton: string) => environnementReseau(options.env ?? process.env, jeton);

  // Le `.git` du clone : là que sont sa configuration, ses objets et ses
  // références.
  let commun: string;
  try {
    commun = cheminReel(resolve(clone, git("rev-parse", "--git-common-dir")));
  } catch {
    throw new ConfigInvalide(`BRIGADE_REPO_DIR invalide : « ${clone} » n'est pas un dépôt git — attendu un clone du dépôt du projet, réservé à la station`);
  }

  // Un seul clone pour tous les cooks : deux rapatriements de la même base, ou
  // deux `git worktree add`, s'y disputent les mêmes verrous. Les préparations
  // passent une par une.
  let file: Promise<unknown> = Promise.resolve();
  const aSonTour = <T>(faire: () => Promise<T>): Promise<T> => {
    const tour = file.then(faire, faire);
    file = tour.catch(() => {});
    return tour;
  };

  // Un worktree désigne lui-même son dépôt, par des fichiers que son cook
  // écrit : son fichier `.git`, puis le `commondir` du répertoire que ce
  // fichier nomme. Un `git -C <worktree>` les suivrait, et lirait comme une
  // configuration ce que le cook a choisi — donc lancerait ce qu'elle nomme,
  // hors de toute cloison. Le runtime les lit lui-même : ils doivent mener au
  // clone, sans quoi `git` n'est pas lancé. Rend le répertoire
  // d'administration du worktree, sous le `.git` du clone.
  const administration = (worktree: string): string => {
    const refuser = (quoi: string): never => {
      throw new Error(`« ${worktree} » ne désigne plus son dépôt dans le clone (${quoi}) : \`git\` n'y est pas lancé, il lirait comme une configuration ce que le cook a mis à la place`);
    };
    if (!existsSync(worktree)) throw new Error(`« ${worktree} » n'existe pas : ce n'est le worktree de personne`);
    const designe = /^gitdir: (.+)$/.exec(uneLigne(join(worktree, ".git")) ?? "")?.[1];
    if (designe === undefined) return refuser("fichier `.git` réécrit");
    const admin = resolve(worktree, designe);
    // Un répertoire du clone, pas un lien qui en sort.
    let reel: string | null = null;
    try {
      reel = cheminReel(admin);
    } catch {
      // Ce que le fichier nomme n'existe pas.
    }
    if (reel === null || reel !== join(commun, "worktrees", basename(admin))) return refuser("fichier `.git` réécrit");
    // `GIT_COMMON_DIR` impose la configuration et les objets, pas les
    // références : celles-là, `git` les cherche encore par ce fichier.
    const partage = uneLigne(join(reel, "commondir"));
    let vers: string | null = null;
    try {
      vers = partage === null ? null : cheminReel(resolve(reel, partage));
    } catch {
      // Ce que le fichier nomme n'existe pas.
    }
    if (vers !== commun) return refuser("`commondir` réécrit");
    return reel;
  };
  // `git`, dans le worktree d'un cook : son dépôt lui est imposé, il ne le
  // découvre pas. La configuration lue est celle du clone, et rien de ce
  // qu'elle nommerait n'est lancé.
  const gitDans = (worktree: string, plus: { env?: NodeJS.ProcessEnv; maxBuffer?: number } = {}) => {
    const debut = [...SANS_COMMANDE, `--git-dir=${administration(worktree)}`, `--work-tree=${resolve(worktree)}`];
    const env = { ...(options.env ?? process.env), ...plus.env, GIT_COMMON_DIR: commun };
    return (...args: string[]): string => execFileSync("git", [...debut, ...args], { ...reglages, env, maxBuffer: plus.maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
  };
  // Sans verrou : un `status` ordinaire rafraîchit l'index, et le cook qui
  // commiterait au même instant buterait sur `index.lock`. Sans plafond de
  // sortie : un worktree chargé de fichiers neufs (des dépendances pas encore
  // ignorées) est celui d'un cook qui écrit, pas un worktree illisible. Sans
  // les sous-modules : pour dire si l'un d'eux a bougé, `git` s'y lance, sous
  // la configuration qu'il y trouve — celle du cook.
  const statutDe = (worktree: string, nonSuivis: "all" | "normal") =>
    gitDans(worktree, { maxBuffer: Infinity })("--no-optional-locks", "status", "--porcelain", "-z", "--ignore-submodules=all", `--untracked-files=${nonSuivis}`);
  // La base, et ce que l'origine a reçu de la branche si elle a été poussée.
  const dejaPublie = (branche: string) => [`origin/${base}`, ...(git("for-each-ref", "--format=%(refname:short)", `refs/remotes/origin/${branche}`) === "" ? [] : [`origin/${branche}`])];
  const rapatrier = async () =>
    gitAvec(options.jeton ? sousJeton(await options.jeton.frais()) : options.env, "fetch", "--quiet", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`);
  const essais = join(worktrees, ESSAIS);
  const jeter = (nom: string) => {
    const essai = join(essais, nom);
    try {
      git("worktree", "remove", "--force", essai);
    } catch {
      // Jamais accroché, ou à moitié : ce qu'il en reste part quand même.
      rmSync(essai, { recursive: true, force: true });
      git("worktree", "prune");
    }
  };

  const surSaBranche = (worktree: string, branche: string): boolean => {
    const dans = gitDans(worktree);
    try {
      return dans("symbolic-ref", "--quiet", "--short", "HEAD").trim() === branche;
    } catch {
      // Tête détachée : un rebase en cours, ou un cook qui a quitté sa branche.
      return false;
    }
  };
  const recolter = (worktree: string, branche: string): string | null => {
    if (!surSaBranche(worktree, branche)) throw new Error(`« ${worktree} » n'est plus sur sa branche \`${branche}\` : ce qui y traîne ne peut pas y être commité`);
    const dans = gitDans(worktree, { env: ENV_DE_RECOLTE, maxBuffer: Infinity });
    try {
      // Tout, sauf les sous-modules que l'index connaît : `git add` se
      // lancerait dans chacun pour savoir s'il a bougé.
      const sousModules = dans("ls-files", "--stage", "-z")
        .split("\0")
        .filter((entree) => entree.startsWith("160000 "))
        .map((entree) => `:(top,literal,exclude)${entree.slice(entree.indexOf("\t") + 1)}`);
      dans("add", "--all", "--", ":/", ...sousModules);
      // Ce que l'index porte de plus que le dernier commit.
      if (dans("diff", "--cached", "--name-only", "--no-renames", "--ignore-submodules=none") === "") return null;
      dans(...IDENTITE, "commit", "--quiet", "--no-verify", "-m", SUJET_DE_RECOLTE);
    } catch (erreur) {
      throw motif("récolte du worktree", erreur);
    }
    return dans("rev-parse", "HEAD").trim();
  };
  // Le journal dit quoi ranger ; le dépôt vérifie où.
  const duCook = (worktree: string) => {
    if (dirname(resolve(worktree)) !== worktrees || resolve(worktree) === essais) throw new Error(`« ${worktree} » est hors du répertoire des worktrees (${worktrees}) : rien n'y est retiré`);
  };

  return {
    rapatrier: () =>
      aSonTour(async () => {
        await rapatrier();
        return git("rev-parse", `origin/${base}`);
      }),
    retard: (branche) => ({
      depart: git("merge-base", `origin/${base}`, branche),
      commits: Number(git("rev-list", "--count", `${branche}..origin/${base}`)),
    }),
    arrives: (depuis) => git("diff", "--name-only", "--no-renames", "-z", depuis, `origin/${base}`).split("\0").filter(Boolean),
    essayer: (nom, sha) =>
      aSonTour(async () => {
        const essai = join(essais, nom);
        await gitAsync("worktree", "add", "--quiet", "--detach", essai, `origin/${base}`);
        if (sha === undefined) return essai;
        try {
          await gitAsync(...IDENTITE, "-C", essai, "merge", "--quiet", "--no-ff", "--no-edit", "--no-verify", sha);
        } catch (erreur) {
          // Un conflit laisse des chemins non fusionnés ; rien d'autre n'en est un.
          let conflit = false;
          try {
            conflit = git("-C", essai, "diff", "--name-only", "--diff-filter=U") !== "";
          } finally {
            jeter(nom);
          }
          if (!conflit) throw erreur;
          return null;
        }
        return essai;
      }),
    poser: (nom, branche) =>
      aSonTour(async () => {
        const essai = join(essais, nom);
        await gitAsync("worktree", "add", "--quiet", "--detach", essai, branche);
        return essai;
      }),
    jeter(nom) {
      if (nom !== undefined) return jeter(nom);
      if (existsSync(essais)) for (const reste of readdirSync(essais)) jeter(reste);
    },
    preparer: (run) =>
      aSonTour(async () => {
        const worktree = join(worktrees, run);
        const branche = `cook/${run}`;
        await rapatrier();
        await gitAsync("worktree", "add", "--quiet", "-b", branche, worktree, `origin/${base}`);
        return { worktree, branche };
      }),
    reprendre: (run, branche) =>
      aSonTour(async () => {
        const worktree = join(worktrees, run);
        // La base rapatriée : le cook du renvoi peut avoir à s'y rebaser.
        await rapatrier();
        await gitAsync("worktree", "add", "--quiet", worktree, branche);
        return worktree;
      }),
    retirer(worktree, branche) {
      git("worktree", "remove", "--force", worktree);
      if (branche !== undefined) git("branch", "--quiet", "-D", branche);
    },
    recolter,
    surSaBranche,
    ranger: (worktree, branche) =>
      aSonTour(async () => {
        duCook(worktree);
        if (existsSync(join(worktree, ".git"))) {
          const recolte = recolter(worktree, branche);
          await gitAsync("worktree", "remove", "--force", worktree);
          return recolte;
        }
        if (existsSync(worktree) && readdirSync(worktree).length > 0) throw new Error(`« ${worktree} » est un répertoire qui n'est plus un worktree git, et qui n'est pas vide : rien n'en est commité ni retiré`);
        rmSync(worktree, { recursive: true, force: true });
        await gitAsync("worktree", "prune");
        return null;
      }),
    elaguer: (branche) =>
      aSonTour(async () => {
        if (git("branch", "--list", branche) === "") return true;
        // Sans réseau : poussé, un commit est atteint par une branche de suivi
        // de l'origine — celle que le push de la station a mise à jour, ou la
        // base une fois la livraison mergée.
        if (Number(git("rev-list", "--count", branche, "--not", "--remotes=origin")) > 0) return false;
        await gitAsync("branch", "--quiet", "-D", branche);
        return true;
      }),
    connait: (branche) => git("branch", "--list", branche) !== "",
    commits(branche) {
      return Number(git("rev-list", "--count", `origin/${base}..${branche}`));
    },
    pousser(branche) {
      try {
        // Forcé : la branche d'un cook n'appartient qu'à la station, et un
        // renvoi peut l'avoir rebasée sur la base.
        const env = options.jeton ? sousJeton(options.jeton.courant()) : options.env;
        execFileSync("git", ["push", "--quiet", "origin", `+refs/heads/${branche}:refs/heads/${branche}`], { ...reglages, env, stdio: ["ignore", "pipe", "pipe"] });
      } catch (erreur) {
        // GitHub refuse à une App sans le droit `workflows` de pousser un
        // changement sous `.github/workflows/`, et le dit.
        if (options.jeton && /without `?workflows`? permission/i.test(String((erreur as { stderr?: unknown }).stderr ?? ""))) {
          throw new Error("git push : droit `workflows` manquant — la livraison touche `.github/workflows/`, que l'identité cook n'a pas le droit de pousser (ce droit ne lui est pas donné : un cook ne réécrit pas la CI du projet) ; à pousser à la main");
        }
        throw motif("git push", erreur);
      }
    },
    livree: (branche) => (git("for-each-ref", "--format=%(refname:short)", `refs/remotes/origin/${branche}`) === "" ? branche : `origin/${branche}`),
    tete: (branche) => git("rev-parse", "--verify", `${branche}^{commit}`),
    intact: (worktree) => statutDe(worktree, "normal") === "",
    // Sans détection des renommages : un fichier déplacé doit se lire aussi à
    // son ancien chemin, sinon sortir un juge de son répertoire passerait
    // pour ne pas y avoir touché.
    // `-z` : un chemin non ASCII tel qu'il s'écrit, pas entre guillemets et
    // en octal — il se compare à une zone.
    changes: (branche) => git("diff", "--name-only", "--no-renames", "-z", `origin/${base}...${branche}`).split("\0").filter(Boolean),
    // Sans plafond de sortie : c'est le reviewer qui borne ce qu'il en lit.
    diff: (branche) =>
      execFileSync("git", ["diff", "--no-renames", "--no-color", "--no-ext-diff", `origin/${base}...${branche}`], {
        ...reglages,
        maxBuffer: Infinity,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ajouts: (branche) =>
      execFileSync(
        "git",
        ["log", "--patch", "--text", "--no-textconv", "--diff-merges=separate", "--no-renames", "--no-color", "--no-ext-diff", "--format=%B", branche, "--not", ...dejaPublie(branche)],
        { ...reglages, maxBuffer: Infinity, stdio: ["ignore", "pipe", "pipe"] },
      ),
    revenir(worktree, branche) {
      gitDans(worktree)("reset", "--quiet", "--hard", dejaPublie(branche).at(-1) ?? `origin/${base}`);
    },
    recoltes: (branche) =>
      git("log", "--format=%H", "--fixed-strings", `--author=<${COURRIEL}>`, `--grep=${SUJET_DE_RECOLTE}`, `origin/${base}..${branche}`).split("\n").filter(Boolean),
    liste(branche, repertoire) {
      try {
        return git("ls-tree", "-z", "--name-only", `${branche}:${repertoire}`).split("\0").filter(Boolean);
      } catch {
        return [];
      }
    },
    // Sans plafond de sortie, et `-z` : un grand dépôt se lit en entier, et un
    // chemin non ASCII tel qu'il s'écrit.
    fichiers: () =>
      execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", `origin/${base}`], { ...reglages, maxBuffer: Infinity, stdio: ["ignore", "pipe", "pipe"] })
        .split("\0")
        .filter(Boolean),
    empreinte(worktree) {
      const statut = statutDe(worktree, "all");
      const empreinte = createHash("sha256").update(gitDans(worktree)("rev-parse", "HEAD").trim()).update(statut);
      const lignes = statut.split("\0");
      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i] ?? "";
        if (ligne === "") continue;
        empreinte.update(trace(join(worktree, ligne.slice(3))));
        // Un renommage tient sur deux entrées : la seconde est l'ancien chemin.
        if ("RC".includes(ligne.charAt(0))) i++;
      }
      return empreinte.digest("hex");
    },
  };
}
