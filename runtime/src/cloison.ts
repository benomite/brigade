// La cloison d'un lancement : ce que le runtime met autour de tout ce qu'il
// lance pour le compte du projet ou du modèle — setup, cook, gates, reviewer,
// juges. Sans image ni démon : `bwrap` (bubblewrap) donne à chaque lancement
// son espace de montage et son espace de process. La frontière passe entre le
// runtime et ce qu'il lance : ce que lui seul doit lire (l'état, les secrets
// et les clés de tous les projets) est masqué, et rien n'est rendu que le
// worktree du lancement. Seul module qui sait comment `bwrap` se pilote.
import { existsSync, mkdirSync, realpathSync } from "node:fs";
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

  const claude = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const identifiants = join(claude, ".credentials.json");
  // Le `~/.claude` du projet : ni les transcripts ni la mémoire d'un autre.
  const prive = join(lieux.repertoireEtat, "claude");
  return {
    bin,
    masques,
    identifiants,
    envelopper({ commande, args }, acces) {
      mkdirSync(prive, { recursive: true });
      // Un clone nu est son propre `.git`.
      const git = existsSync(join(lieux.clone, ".git")) ? join(lieux.clone, ".git") : lieux.clone;
      const lie = (option: string, chemin: string) => [option, chemin, chemin];
      // Sa configuration et ses hooks restent hors d'atteinte : le `git` du
      // runtime, hors cloison, les exécuterait.
      const depot =
        acces.depot === "ecriture"
          ? [...lie("--bind", git), ...lie("--ro-bind-try", join(git, "config")), ...lie("--ro-bind-try", join(git, "hooks")), ...lie("--bind", acces.cwd)]
          : acces.depot === "lecture"
            ? [...lie("--ro-bind", git), ...lie("--ro-bind", acces.cwd)]
            : [];
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
          ...lie("--bind", home),
          ...masques.flatMap((masque) => ["--tmpfs", masque]),
          ...["--bind", prive, claude],
          ...lie("--ro-bind-try", identifiants),
          ...(acces.lit ?? []).flatMap((fichier) => lie("--ro-bind", fichier)),
          ...depot,
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
      ? "une connexion directe est refusée par l'unité"
      : proxy.enforced === false
        ? "MAIS une connexion directe aboutit : l'unité ne filtre rien (IPAddressDeny), et un process qui ignore HTTPS_PROXY sort librement"
        : "le filtre de l'unité n'a pas pu être éprouvé (aucune route vers l'extérieur)";
  return `liste blanche, par la porte 127.0.0.1:${proxy.port} — ${filtre}`;
}
