// La cloison d'un lancement : ce que le runtime met autour de tout ce qu'il
// lance pour le compte du projet ou du modèle — setup, cook, gates, reviewer,
// juges. Sans image ni démon : `bwrap` (bubblewrap) donne à chaque lancement
// son espace de montage et son espace de process. La frontière passe entre le
// runtime et ce qu'il lance : ce que lui seul doit lire (l'état, les secrets
// et les clés de tous les projets) est masqué, et rien n'est rendu que le
// worktree du lancement. Seul module qui sait comment `bwrap` se pilote.
import { execFileSync } from "./sans-invite.ts";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Fait } from "./evenements.ts";
import type { EtatDeCloison } from "./events/partition.ts";
import { FICHIER_DU_JETON } from "./jeton-claude.ts";
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
  // Le fichier du jeton longue durée, recouvert d'un fichier vide en lecture
  // seule — null sans jeton.
  jeton: string | null;
  // Le `~/.claude` du projet, monté à la place de celui du compte.
  claude: string;
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
// Vrai si `chemin` est `racine` ou se trouve sous elle, liens résolus.
export const sous = (racine: string, chemin: string) => {
  const vers = relative(reel(racine), reel(chemin));
  return vers === "" || (!vers.startsWith("..") && !isAbsolute(vers));
};

// Ce qui, dans le répertoire du compte, s'écrit : les caches, et l'état que
// `claude` tient hors de `~/.claude`. Le projet en a les siens ; le reste du
// compte lui est rendu en lecture seule.
const PRIVES_PAR_DEFAUT = [".cache", ".npm", ".claude.json"];

// Ce que les outils écrivent sous `~` hors de `~/.cache` : leurs données et
// leur état (`~/.local/share/pnpm`, le store de pnpm). Ces répertoires sont au
// projet, comme le compte, et chaque entrée du vrai y est rendue en lecture
// seule : un outil y crée la sienne, le binaire `claude` posé sous
// `~/.local/bin` reste celui du compte. Un répertoire n'y est mêlé que sous
// un parent qui l'est.
const MELES = [".local", ".local/share", ".local/state"];

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
    if (brut !== "") throw new ConfigInvalide("BRIGADE_SANDBOX_HIDDEN is set without BRIGADE_SANDBOX_BIN: nothing would be hidden — set the path of `bwrap`, or remove the variable");
    return null;
  }
  if (!isAbsolute(bin) || !existsSync(bin)) throw new ConfigInvalide(`invalid BRIGADE_SANDBOX_BIN: “${bin}” — expected the absolute path of \`bwrap\` (/usr/bin/bwrap), and it must exist`);
  const home = env.HOME;
  if (!home) throw new ConfigInvalide("BRIGADE_SANDBOX_BIN is set, but HOME is not: the partition does not know where the account keeps its credentials");
  // Séparés comme ceux de PATH : par « : », et sous Windows — où un chemin
  // porte sa lettre de lecteur — par « ; ».
  const masques = [...new Set(brut.split(delimiter).filter(Boolean))];
  if (masques.length === 0) {
    throw new ConfigInvalide("BRIGADE_SANDBOX_BIN is set without BRIGADE_SANDBOX_HIDDEN: the partition would hide nothing — set the directories that hold the state and the secrets of all projects, separated by “:” (/var/lib/brigade:/etc/brigade)");
  }
  for (const masque of masques) {
    const refuser = (pourquoi: string): never => {
      throw new ConfigInvalide(`invalid BRIGADE_SANDBOX_HIDDEN: “${masque}” ${pourquoi}`);
    };
    if (!isAbsolute(masque)) refuser("is not an absolute path");
    // Un répertoire vide prend sa place : un fichier ne se masque pas ainsi,
    // et `bwrap` refuserait chaque lancement.
    if (existsSync(masque) && !statSync(masque).isDirectory()) refuser("is not a directory — hide the one that contains it");
    for (const [garde, quoi] of [[home, "the account's home directory: neither `claude` nor `git` would find anything there any more"], ["/tmp", "/tmp"], ["/usr", "the system"]] as const) {
      if (sous(masque, garde)) refuser(`would hide ${quoi}`);
    }
  }
  const aCouvrir: Array<[string, string | undefined]> = [
    ["BRIGADE_STATE_DIR", lieux.repertoireEtat],
    ["BRIGADE_REPO_DIR", lieux.clone],
    ["BRIGADE_SECRETS_FILE", env.BRIGADE_SECRETS_FILE],
    ["BRIGADE_GITHUB_APPS_DIR", env.BRIGADE_GITHUB_APPS_DIR],
    [FICHIER_DU_JETON, env[FICHIER_DU_JETON]],
  ];
  for (const [variable, chemin] of aCouvrir) {
    if (chemin && !masques.some((masque) => sous(masque, chemin))) {
      throw new ConfigInvalide(`${variable} (${chemin}) is not under any directory of BRIGADE_SANDBOX_HIDDEN (${masques.join(", ")}): a cook would read it despite the partition — add it there, or move it`);
    }
  }

  const prives = [...new Set([...PRIVES_PAR_DEFAUT, ...(env.BRIGADE_SANDBOX_PRIVATE ?? "").split(":").filter(Boolean)])];
  for (const nom of prives) {
    if (nom.includes("/") || nom === "." || nom === "..") {
      throw new ConfigInvalide(`invalid BRIGADE_SANDBOX_PRIVATE: “${nom}” — expected names of entries of the account's home directory, separated by “:” (.cargo:.gradle)`);
    }
  }

  const claude = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const identifiants = join(claude, ".credentials.json");
  // Ce qui est au projet, là où la cloison le masque : un lancement ne le
  // retrouve que monté à sa place. Le `~/.claude` du projet — ni les
  // transcripts ni la mémoire d'un autre ; son répertoire de compte, où
  // s'écrit ce qui ne peut pas s'écrire dans le vrai ; et sa vue du `.git`.
  const prive = join(lieux.repertoireEtat, "claude");
  // Le jeton longue durée de la connexion Max : `claude` le reçoit par son
  // environnement, pas par son fichier. Masqué avec son répertoire, le fichier
  // est en plus recouvert d'un fichier vide, en lecture seule : lu, il ne dit
  // rien ; écrit, il refuse — comme les identifiants du compte.
  const jeton = env[FICHIER_DU_JETON] || null;
  const vide = join(lieux.repertoireEtat, "jeton-vide");
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
    for (const nom of prives) {
      if (estUn(join(home, nom), "isFile")) amorcer(join(home, nom), join(compte, nom));
      else if (!existsSync(join(compte, nom)) && estUn(join(home, nom), "isDirectory")) mkdirSync(join(compte, nom), { recursive: true });
    }
    const rendre = (dossier: string): string[] => {
      let entrees: string[] = [];
      try {
        entrees = readdirSync(join(home, dossier));
      } catch {
        // Un compte sans répertoire : rien à rendre.
      }
      return entrees.flatMap((nom) => {
        const chemin = join(dossier, nom);
        if ((dossier === "" && prives.includes(nom)) || join(home, chemin) === claude) return [];
        if (MELES.includes(chemin) && estUn(join(home, chemin), "isDirectory")) {
          // Un vrai répertoire, celui du projet : ce qu'un cook y aurait
          // laissé à la place, un lien, ne fait pas écrire le runtime ni
          // monter `bwrap` ailleurs.
          if (!estUn(join(compte, chemin), "isDirectory")) {
            rmSync(join(compte, chemin), { recursive: true, force: true });
            mkdirSync(join(compte, chemin));
          }
          return rendre(chemin);
        }
        // `-try` : un lien qui ne mène nulle part, ou une entrée partie depuis
        // la lecture du répertoire, n'est pas rendu — et ne fait pas mourir `bwrap`.
        return lie("--ro-bind-try", join(home, chemin));
      });
    };
    return ["--bind", compte, home, ...rendre("")];
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
    // pour ce worktree restent — et les points de montage eux-mêmes : un
    // lancement encore vivant sur ce worktree y tient les siens, et en retirer
    // un d'ici le détacherait chez lui, `objects` et `refs` perdus en route.
    // N'est donc retiré que ce qui ne peut pas porter le montage, et qui n'est
    // alors celui d'aucun lancement.
    const porte = (nom: string) => estUn(join(vue, nom), estUn(join(git, nom), "isDirectory") ? "isDirectory" : "isFile");
    for (const nom of readdirSync(vue)) {
      const chemin = join(vue, nom);
      const garde = nom === "config" ? estUn(chemin, "isFile") : nom === "hooks" ? estUn(chemin, "isDirectory") : entrees.includes(nom) ? porte(nom) : !lstatSync(chemin).isSymbolicLink();
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
    jeton,
    claude: prive,
    envelopper({ commande, args }, acces) {
      mkdirSync(prive, { recursive: true });
      // Vide et à lui : ce qui serait là d'autre — un contenu, un lien — part.
      if (jeton !== null && !(estUn(vide, "isFile") && statSync(vide).size === 0)) {
        rmSync(vide, { recursive: true, force: true });
        writeFileSync(vide, "", { flag: "wx", mode: 0o400 });
      }
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
          ...(jeton === null ? [] : ["--ro-bind", vide, jeton]),
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
// le lit (`npm run partition`), sans variable ni fichier d'unité.
export function annoncerCloison(runtime: Runtime, etat: EtatDeCloison): void {
  const { journal, projet } = runtime;
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  journal.base.transaction(() => {
    const dernier = journal.duType("isolation.configured", 1)[0]?.payload;
    if (JSON.stringify(dernier) !== JSON.stringify(etat)) noter({ type: "isolation.configured", payload: etat });
  });
}

// Ce que le runtime dit de sa cloison au démarrage, et que `npm run partition`
// répète : sans elle, les projets se voient — c'est un choix, il se lit.
export function direFichiers(sandbox: EtatDeCloison["sandbox"]): string {
  return sandbox
    ? `every launch (setup, cook, gates, reviewer, judges) runs in \`${sandbox.bin}\` — hidden: ${sandbox.hidden.join(", ")}; machine read-only; Max credentials read-only (${sandbox.credentials})`
    : "none (BRIGADE_SANDBOX_BIN is not set): a cook reads everything the service account reads — the state, the clone, the worktrees and the secrets of the other projects included";
}

export function direReseau(proxy: EtatDeCloison["proxy"]): string {
  if (!proxy) return "open (BRIGADE_PROXY_PORT is not set): a cook reaches everything the machine reaches";
  const filtre =
    proxy.enforced === true
      ? "a direct send is refused by the kernel: the unit filters"
      : proxy.enforced === false
        ? "BUT a direct send goes out: the unit does not seem to filter anything (IPAddressDeny), and a process that ignores HTTPS_PROXY would get out freely"
        : "the unit's filter could not be probed from here";
  return `allowlist, through the door 127.0.0.1:${proxy.port} — ${filtre}`;
}
