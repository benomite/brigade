// La cloison d'un lancement : ce que le runtime met autour de tout ce qu'il
// lance pour le compte du projet ou du modèle — setup, cook, gates, reviewer,
// juges. Sans image ni démon : `bwrap` (bubblewrap) donne à chaque lancement
// son espace de montage et son espace de process. La frontière passe entre le
// runtime et ce qu'il lance : ce que lui seul doit lire (l'état, les secrets
// et les clés de tous les projets) est masqué, et rien n'est rendu que le
// worktree du lancement. Seul module qui sait comment `bwrap` se pilote.
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Fait } from "./evenements.ts";
import type { EtatDeCloison } from "./evenements/cloison.ts";
import type { Runtime } from "./runtime.ts";
import { ConfigInvalide } from "./runtime.ts";

export type Lancement = { commande: string; args: string[] };

// Ce qu'un lancement retrouve de ce qui est masqué. `depot` : son répertoire
// est un worktree du projet — rendu avec le `.git` du clone, en écriture pour
// qui y travaille (setup, cook, gates), en lecture pour qui le relit. Nul : il
// part d'un répertoire que la cloison ne masque pas. `lit` : d'autres fichiers
// rendus en lecture seule.
export type Acces = { cwd: string; depot: "ecriture" | "lecture" | null; lit?: string[] };

export type Cloison = {
  bin: string;
  // Les répertoires dont un lancement ne voit qu'une place vide.
  masques: string[];
  // Les identifiants du compte Max, montés en lecture seule.
  identifiants: string;
  envelopper(lancement: Lancement, acces: Acces): Lancement;
};

// Le superviseur arrête un cook par SIGTERM au groupe, puis SIGKILL après la
// grâce. `bwrap` ne relaie aucun signal : atteint par le SIGTERM, il mourrait
// en emportant le cook, sans grâce. Il part donc sourd à SIGTERM — et la
// commande retrouve le sien, par `env` (coreutils 8.32 au moins).
const SOURD = 'trap "" TERM; exec "$@"';
const ENTENDRE = ["env", "--default-signal=TERM"];

// Le chemin sans ses liens — jusqu'où il existe : ce qui n'est pas encore
// posé se compare quand même à ce qui l'est.
const reel = (chemin: string): string => {
  const absolu = resolve(chemin);
  if (existsSync(absolu)) return realpathSync(absolu);
  const parent = dirname(absolu);
  return parent === absolu ? absolu : join(reel(parent), basename(absolu));
};
const sous = (racine: string, chemin: string) => {
  const vers = relative(reel(racine), reel(chemin));
  return vers === "" || (!vers.startsWith("..") && !isAbsolute(vers));
};

// Ce qui, dans le répertoire du compte, s'écrit : les caches, et l'état que
// `claude` tient hors de `~/.claude`. Le projet en a les siens ; le reste du
// compte lui est rendu en lecture seule.
const PRIVES_PAR_DEFAUT = [".cache", ".npm", ".claude.json"];

const estUn = (chemin: string, quoi: "isFile" | "isDirectory"): boolean => {
  try {
    return lstatSync(chemin)[quoi]();
  } catch {
    return false;
  }
};

// Pose `source` à `cible` si rien n'y est — pas même un lien, qu'un cook
// aurait laissé là pour faire écrire le runtime ailleurs.
const amorcer = (source: string, cible: string) => {
  try {
    copyFileSync(source, cible, constants.COPYFILE_EXCL);
  } catch {
    // Déjà là, ou rien à copier.
  }
};

// Lit `BRIGADE_SANDBOX_BIN` et `BRIGADE_SANDBOX_HIDDEN`. Sans le binaire,
// null : rien n'est cloisonné, et le runtime le dit. Une cloison qui laisserait
// dehors ce qu'elle doit cacher est un refus de démarrer.
export function configCloison(env: Record<string, string | undefined>, lieux: { repertoireEtat: string; clone: string }): Cloison | null {
  const bin = env.BRIGADE_SANDBOX_BIN;
  const brut = env.BRIGADE_SANDBOX_HIDDEN ?? "";
  if (!bin) {
    if (brut !== "") throw new ConfigInvalide("BRIGADE_SANDBOX_HIDDEN est défini sans BRIGADE_SANDBOX_BIN : rien ne serait masqué — poser le chemin de `bwrap`, ou retirer la variable");
    return null;
  }
  if (!isAbsolute(bin) || !existsSync(bin)) throw new ConfigInvalide(`BRIGADE_SANDBOX_BIN invalide : « ${bin} » — attendu le chemin absolu de \`bwrap\` (/usr/bin/bwrap), et il doit exister`);
  const home = env.HOME;
  if (!home) throw new ConfigInvalide("BRIGADE_SANDBOX_BIN est défini, mais pas HOME : la cloison ne sait pas où le compte garde ses identifiants");
  const masques = [...new Set(brut.split(":").filter(Boolean))];
  if (masques.length === 0) {
    throw new ConfigInvalide("BRIGADE_SANDBOX_BIN est défini sans BRIGADE_SANDBOX_HIDDEN : la cloison ne masquerait rien — y poser les répertoires qui portent l'état et les secrets de tous les projets, séparés par « : » (/var/lib/brigade:/etc/brigade)");
  }
  for (const masque of masques) {
    const refuser = (pourquoi: string): never => {
      throw new ConfigInvalide(`BRIGADE_SANDBOX_HIDDEN invalide : « ${masque} » ${pourquoi}`);
    };
    if (!isAbsolute(masque)) refuser("n'est pas un chemin absolu");
    // Un répertoire vide prend sa place : un fichier ne se masque pas ainsi,
    // et `bwrap` refuserait chaque lancement.
    if (existsSync(masque) && !statSync(masque).isDirectory()) refuser("n'est pas un répertoire — masquer celui qui le contient");
    for (const [garde, quoi] of [[home, "le répertoire du compte : ni `claude` ni `git` n'y trouveraient plus rien"], ["/tmp", "/tmp"], ["/usr", "le système"]] as const) {
      if (sous(masque, garde)) refuser(`masquerait ${quoi}`);
    }
  }
  const aCouvrir: Array<[string, string | undefined]> = [
    ["BRIGADE_STATE_DIR", lieux.repertoireEtat],
    ["BRIGADE_REPO_DIR", lieux.clone],
    ["BRIGADE_SECRETS_FILE", env.BRIGADE_SECRETS_FILE],
    ["BRIGADE_GITHUB_APPS_DIR", env.BRIGADE_GITHUB_APPS_DIR],
  ];
  for (const [variable, chemin] of aCouvrir) {
    if (chemin && !masques.some((masque) => sous(masque, chemin))) {
      throw new ConfigInvalide(`${variable} (${chemin}) n'est sous aucun répertoire de BRIGADE_SANDBOX_HIDDEN (${masques.join(", ")}) : un cook le lirait malgré la cloison — l'y ajouter, ou le déplacer`);
    }
  }

  const prives = [...new Set([...PRIVES_PAR_DEFAUT, ...(env.BRIGADE_SANDBOX_PRIVATE ?? "").split(":").filter(Boolean)])];
  for (const nom of prives) {
    if (nom.includes("/") || nom === "." || nom === "..") {
      throw new ConfigInvalide(`BRIGADE_SANDBOX_PRIVATE invalide : « ${nom} » — attendu des noms d'entrées du répertoire du compte, séparés par « : » (.cargo:.gradle)`);
    }
  }

  const claude = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const identifiants = join(claude, ".credentials.json");
  // Ce qui est au projet, là où la cloison le masque : un lancement ne le
  // retrouve que monté à sa place. Le `~/.claude` du projet — ni les
  // transcripts ni la mémoire d'un autre ; son répertoire de compte, où
  // s'écrit ce qui ne peut pas s'écrire dans le vrai ; et sa vue du `.git`.
  const prive = join(lieux.repertoireEtat, "claude");
  const compte = join(lieux.repertoireEtat, "compte");
  const vues = join(lieux.repertoireEtat, "vues-git");
  const lie = (option: string, chemin: string) => [option, chemin, chemin];

  // Le répertoire du compte, vu d'un lancement : celui du projet, inscriptible,
  // et par-dessus chaque entrée du vrai, en lecture seule. Rien de ce qu'un
  // cook écrit n'arrive donc dans le vrai — que le `git`, le `gh` et le
  // `claude` du runtime lisent et exécutent hors cloison (`~/.gitconfig`, une
  // chaîne d'outils, le binaire `claude` lui-même).
  const leCompte = (): string[] => {
    mkdirSync(compte, { recursive: true });
    let entrees: string[] = [];
    try {
      entrees = readdirSync(home);
    } catch {
      // Un compte sans répertoire : rien à rendre.
    }
    for (const nom of prives) {
      if (estUn(join(home, nom), "isFile")) amorcer(join(home, nom), join(compte, nom));
      else if (!existsSync(join(compte, nom)) && estUn(join(home, nom), "isDirectory")) mkdirSync(join(compte, nom), { recursive: true });
    }
    const rendues = entrees.filter((nom) => !prives.includes(nom) && join(home, nom) !== claude);
    // `-try` : un lien qui ne mène nulle part, ou une entrée partie depuis la
    // lecture du répertoire, n'est pas rendu — et ne fait pas mourir `bwrap`.
    return ["--bind", compte, home, ...rendues.flatMap((nom) => lie("--ro-bind-try", join(home, nom)))];
  };

  // Le `.git` du clone, vu d'un lancement : ses objets et ses références sont
  // les vrais, sa `config` et ses `hooks` sont ceux du worktree. `git config`,
  // un sous-module, husky y écrivent donc sans rien changer à ce que le `git`
  // du runtime lit et exécute hors cloison. La vue vit dans l'état, masquée :
  // un cook ne l'atteint que montée à la place du `.git`.
  // Les clones où le rangement automatique est déjà coupé.
  const sansRangement = new Set<string>();
  const leDepot = (cwd: string, ecrit: boolean): string[] => {
    // Un clone nu est son propre `.git`.
    const git = existsSync(join(lieux.clone, ".git")) ? join(lieux.clone, ".git") : lieux.clone;
    // `packed-refs` est monté seul dans la vue : un cook garde celui du
    // lancement. Si le `git` du runtime y rangeait les références pendant ce
    // temps (`gc --auto`, après un fetch), la branche du cook disparaîtrait de
    // sa vue et son commit suivant naîtrait sans parent. Le clone servi ne
    // range donc jamais seul — ni par le runtime, ni, sa config copiée dans la
    // vue, par le cook.
    if (!sansRangement.has(git) && existsSync(join(git, "config"))) {
      try {
        for (const [cle, valeur] of [["gc.auto", "0"], ["maintenance.auto", "false"]] as const) {
          execFileSync("git", ["config", "--file", join(git, "config"), cle, valeur], { stdio: "ignore" });
        }
        sansRangement.add(git);
      } catch {
        // Une config verrouillée à cet instant : le lancement suivant y revient.
      }
    }
    mkdirSync(vues, { recursive: true });
    // Les vues des worktrees partis partent avec eux.
    for (const nom of readdirSync(vues)) {
      if (!existsSync(decodeURIComponent(nom))) rmSync(join(vues, nom), { recursive: true, force: true });
    }
    const vue = join(vues, encodeURIComponent(resolve(cwd)));
    mkdirSync(vue, { recursive: true });
    let entrees: string[] = [];
    try {
      // `packed-refs` existe avant le lancement : monté, il ne se remplace
      // pas. Né dans la vue, il emporterait avec elle les références qu'un
      // `git pack-refs` du cook y aurait rangées — sa propre branche.
      if (!existsSync(join(git, "packed-refs"))) writeFileSync(join(git, "packed-refs"), "", { flag: "a" });
      entrees = readdirSync(git).filter((nom) => nom !== "config" && nom !== "hooks");
    } catch {
      // Pas encore de clone : la vue seule.
    }
    // La vue telle que le runtime l'attend : ce qu'un cook y aurait laissé à
    // la place d'un point de montage, ou un lien, est retiré avant le
    // lancement suivant. Sa `config`, ses `hooks` et ce que `git` y a posé
    // pour ce worktree restent.
    for (const nom of readdirSync(vue)) {
      const chemin = join(vue, nom);
      const garde = nom === "config" ? estUn(chemin, "isFile") : nom === "hooks" ? estUn(chemin, "isDirectory") : !entrees.includes(nom) && !lstatSync(chemin).isSymbolicLink();
      if (!garde) rmSync(chemin, { recursive: true, force: true });
    }
    mkdirSync(join(vue, "hooks"), { recursive: true });
    amorcer(join(git, "config"), join(vue, "config"));
    const option = ecrit ? "--bind" : "--ro-bind";
    return [
      // En écriture même pour qui relit : `bwrap` y pose ses points de
      // montage. Elle repasse en lecture seule une fois garnie.
      ...["--bind", vue, git],
      // Un répertoire du vrai `.git` est rendu tel quel ; un fichier (`HEAD`,
      // `packed-refs`), en lecture seule : monté, il ne se remplace pas.
      ...entrees.flatMap((nom) => lie(estUn(join(git, nom), "isDirectory") ? option : "--ro-bind", join(git, nom))),
      ...(ecrit ? [] : ["--remount-ro", git]),
      ...lie(option, cwd),
    ];
  };

  return {
    bin,
    masques,
    identifiants,
    envelopper({ commande, args }, acces) {
      mkdirSync(prive, { recursive: true });
      return {
        commande: "/bin/sh",
        args: [
          "-c",
          SOURD,
          "brigade",
          bin,
          "--die-with-parent",
          // Ses process seulement : ni `ps` ni `/proc/<pid>/environ` ne lui
          // montrent un autre cook.
          "--unshare-pid",
          // Dans l'ordre : un montage recouvre ceux qui le précèdent.
          ...["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc"],
          ...lie("--bind", "/tmp"),
          ...leCompte(),
          // Un répertoire qui n'existe pas ne cache rien, et `bwrap` ne peut
          // pas le créer sur une machine en lecture seule : il échouerait.
          ...masques.filter((masque) => existsSync(masque)).flatMap((masque) => ["--tmpfs", masque]),
          ...["--bind", prive, claude],
          ...lie("--ro-bind-try", identifiants),
          ...(acces.lit ?? []).flatMap((fichier) => lie("--ro-bind", fichier)),
          ...(acces.depot === null ? [] : leDepot(acces.cwd, acces.depot === "ecriture")),
          ...["--chdir", acces.cwd, "--"],
          ...ENTENDRE,
          commande,
          ...args,
        ],
      };
    },
  };
}

// Le lancement tel qu'il part : dans la cloison s'il y en a une, tel quel sinon.
export function envelopper(cloison: Cloison | null | undefined, lancement: Lancement, acces: Acces): Lancement {
  return cloison ? cloison.envelopper(lancement, acces) : lancement;
}

const AUTEUR = "runtime";

// Écrit l'état de la cloison au journal s'il a changé : c'est là que le chef
// le lit (`npm run cloison`), sans variable ni fichier d'unité.
export function annoncerCloison(runtime: Runtime, etat: EtatDeCloison): void {
  const { journal, projet } = runtime;
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  journal.base.transaction(() => {
    const dernier = journal.duType("isolation.configured", 1)[0]?.payload;
    if (JSON.stringify(dernier) !== JSON.stringify(etat)) noter({ type: "isolation.configured", payload: etat });
  });
}

// Ce que le runtime dit de sa cloison au démarrage, et que `npm run cloison`
// répète : sans elle, les projets se voient — c'est un choix, il se lit.
export function direFichiers(sandbox: EtatDeCloison["sandbox"]): string {
  return sandbox
    ? `chaque lancement (setup, cook, gates, reviewer, juges) part dans \`${sandbox.bin}\` — masqués : ${sandbox.hidden.join(", ")} ; machine en lecture seule ; identifiants Max en lecture seule (${sandbox.credentials})`
    : "aucune (BRIGADE_SANDBOX_BIN n'est pas défini) : un cook lit tout ce que lit le compte du service — l'état, le clone, les worktrees et les secrets des autres projets compris";
}

export function direReseau(proxy: EtatDeCloison["proxy"]): string {
  if (!proxy) return "ouvert (BRIGADE_PROXY_PORT n'est pas défini) : un cook joint tout ce que joint la machine";
  const filtre =
    proxy.enforced === true
      ? "un envoi direct est refusé par le noyau : l'unité filtre"
      : proxy.enforced === false
        ? "MAIS un envoi direct part : l'unité ne semble rien filtrer (IPAddressDeny), et un process qui ignore HTTPS_PROXY sortirait librement"
        : "le filtre de l'unité n'a pas pu être éprouvé d'ici";
  return `liste blanche, par la porte 127.0.0.1:${proxy.port} — ${filtre}`;
}
