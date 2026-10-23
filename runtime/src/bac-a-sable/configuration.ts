// La configuration du bac à sable de Claude Code pour un cook du Mac : ce que
// la station passe à `claude` (`--settings`) pour qu'un cook ordinaire ne
// touche, sur le Mac du chef, qu'à son ticket. Il écrit dans son worktree et
// dans les caches du projet, nulle part ailleurs ; il ne lit ni `~/.ssh`, ni
// les identifiants du chef, ni ses accès de prod ; il ne joint que les hôtes
// de la liste réseau du projet — liste vide, aucun.
//
// Deux couches, parce que le bac à sable ne garde que les commandes du shell :
//   `sandbox`      ce que Seatbelt impose à chaque commande Bash et à ce
//                  qu'elle lance — fichiers et réseau, tenus par le noyau ;
//   `permissions`  ce que `claude` refuse à ses propres outils (Read, Edit,
//                  Write, WebFetch), qui tournent hors du bac à sable.
// La seconde ne tient qu'en mode `dontAsk` : en `bypassPermissions`, les
// règles qui autorisent n'ont plus d'effet, tout passe sauf ce qui est
// interdit — l'outil Edit écrirait n'importe où. La configuration désactive
// donc ce mode, et dit celui dans lequel le cook part.
//
// Ce que ni l'une ni l'autre ne retire : le répertoire temporaire du compte,
// où `claude` fait écrire les commandes du bac à sable (`$TMPDIR`), et le
// `.git` du clone dont le worktree est issu, sans quoi `git commit` échoue —
// `claude` en refuse `hooks/` et `config`.
//
// Pur : rien n'est lu ni écrit, aucun chemin n'est résolu sur le disque. Les
// chemins se donnent absolus, comme le Mac les voit.
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import type { Regle } from "../reseau.ts";

// Ce que le chef garde sous son répertoire et qu'aucun cook ne lit : ses clés,
// ses identifiants, ses accès. Relatif à `~`.
export const LECTURES_INTERDITES = [
  // La clé vers la box, et celles vers le reste.
  ".ssh",
  ".gnupg",
  // Le trousseau de macOS.
  "Library/Keychains",
  // Les jetons de GitHub et de git.
  ".config/gh",
  ".git-credentials",
  ".netrc",
  // Les accès aux clouds et aux machines de prod.
  ".aws",
  ".azure",
  ".config/gcloud",
  ".kube",
  ".docker",
  ".terraform.d",
  ".config/op",
  // La connexion de `claude` et la configuration de l'app du chef.
  ".claude/.credentials.json",
  ".config/brigade",
];

// Le cook pour lequel la configuration s'écrit. `hotes` : la liste réseau du
// projet, telle que `reseau.ts` la tient — rien n'y est ajouté. `prod` : les
// accès de prod du chef, hors de ceux que `LECTURES_INTERDITES` nomme déjà.
// `lit` : des fichiers, hors du worktree, que la station lui remet à lire (son
// ticket) — le seul droit de lecture que la configuration ajoute.
export type Cook = { worktree: string; caches: string[]; hotes: Regle[]; home: string; prod?: string[]; lit?: string[] };

export type Reglages = {
  env: { npm_config_manage_package_manager_versions: "false" };
  sandbox: {
    enabled: true;
    failIfUnavailable: true;
    allowUnsandboxedCommands: false;
    autoAllowBashIfSandboxed: true;
    excludedCommands: [];
    enableWeakerNestedSandbox: false;
    enableWeakerNetworkIsolation: false;
    filesystem: { allowWrite: string[]; denyWrite: string[]; denyRead: string[] };
    network: { allowedDomains: string[]; strictAllowlist: true; allowLocalBinding: false; allowAllUnixSockets: false };
  };
  hooks: { PreToolUse: typeof CROCHET_BASH };
  permissions: { allow: string[]; deny: string[]; disableBypassPermissionsMode: "disable" };
};

export type ConfigDeBacASable = { modeDePermission: "dontAsk"; reglages: Reglages };

export class BacASableInvalide extends Error {}

// Ce qui ferait d'un chemin un motif dans une règle de permission (`*`, `?`,
// `[`, `{`), ou en fermerait la parenthèse.
const HORS_CHEMIN = /[*?[\]{}()\\\0-\x1f]/;

function chemin(brut: string, home: string, quoi: string): string {
  const deplie = brut === "~" ? home : brut.startsWith("~/") ? posix.join(home, brut.slice(2)) : brut;
  if (!posix.isAbsolute(deplie)) throw new BacASableInvalide(`${quoi} (« ${brut} ») : un chemin absolu est attendu`);
  if (HORS_CHEMIN.test(deplie)) throw new BacASableInvalide(`${quoi} (« ${brut} ») : un chemin ne porte ni motif (* ? [ ] { }), ni parenthèse, ni antislash`);
  const net = posix.normalize(deplie).replace(/\/+$/, "");
  return net === "" ? "/" : net;
}

// Vrai si `enfant` est `parent` ou se trouve sous lui.
const sous = (parent: string, enfant: string) => parent === "/" || enfant === parent || enfant.startsWith(`${parent}/`);

// Vrai si `lieu` est sous un chemin que le cook ne lit pas : un fichier qu'on
// lui remet n'y serait pas lisible.
export function lectureInterdite(home: string, lieu: string): boolean {
  return LECTURES_INTERDITES.some((relatif) => sous(posix.join(home, relatif), posix.normalize(lieu)));
}

const unique = (valeurs: string[]) => [...new Set(valeurs)];

// Un hôte de la liste, comme `reseau.ts` l'a lu : des labels, rien d'autre.
const HOTE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

// Les entrées d'une règle pour `allowedDomains` : `*.hôte` n'y couvre que les
// sous-domaines, l'hôte lui-même s'écrit à part. Sans port, la règle ouvre
// tous les ports de l'hôte — le bac à sable ne sait pas dire « 443 et 80 ».
function domaines(regle: Regle): string[] {
  if (!HOTE.test(regle.hote)) throw new BacASableInvalide(`hôte de la liste réseau (« ${regle.hote} ») : un nom d'hôte est attendu`);
  if (regle.port !== null && !(Number.isSafeInteger(regle.port) && regle.port >= 1 && regle.port <= 65535)) throw new BacASableInvalide(`hôte ${regle.hote} : le port ${regle.port} n'existe pas`);
  const noms = regle.sousDomaines ? [regle.hote, `*.${regle.hote}`] : [regle.hote];
  return regle.port === null ? noms : noms.map((nom) => `${nom}:${regle.port}`);
}

// Une règle de permission sur un chemin absolu : `//` devant, le chemin lui-même
// et tout ce qui est sous lui.
const regles = (outil: string, lieu: string) => [`${outil}(/${lieu})`, `${outil}(/${lieu}/**)`];

// Le crochet qui autorise les commandes de vérification du projet (tests et
// linters, `verification.ts`) : aucune règle `Bash(…)` ne sait les borner.
const CROCHET = fileURLToPath(new URL("./crochet-bash.ts", import.meta.url));
export const CROCHET_BASH = [{ matcher: "Bash", hooks: [{ type: "command" as const, command: `"${process.execPath}" "${CROCHET}"` }] }];

// Ce que le cook lit quand `claude` lui refuse une commande : le refus de
// `dontAsk` est un message fixe, qui ne dit pas quoi faire à la place.
export const CONSIGNE_DE_REFUS =
  "Si une commande Bash t'est refusée avec « Permission to use Bash has been denied because Claude Code is running in don't ask mode », ce n'est pas une panne : seules les commandes de vérification du projet sont autorisées, dans ton worktree. À la place, joue ses tests et ses linters ainsi : `./node_modules/.bin/<outil> <args>` (vitest, prettier, eslint…, sans `..`), éventuellement précédé de variables (`DATABASE_URL=… LLM_MODE=mock ./node_modules/.bin/vitest run <chemin>`), ou `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm typecheck` (aussi `npm`, `yarn`, `pnpm run <script>`). Pas de `&&`, de `|`, de redirection ni de guillemets dans ces commandes, et pas de `cd` hors du worktree ; les lectures (`ls`, `cat`, `head`, `tail`, `wc`, `pwd`) passent seules, et on peut les enchaîner avec `;`. Ne contourne pas un refus : si rien de cela ne convient, dis dans ton compte-rendu ce que tu voulais lancer.";

export function configurer(cook: Cook): ConfigDeBacASable {
  if (!posix.isAbsolute(cook.home)) throw new BacASableInvalide(`répertoire du compte (« ${cook.home} ») : un chemin absolu est attendu`);
  const home = chemin(cook.home, cook.home, "répertoire du compte");
  const interdits = unique([...LECTURES_INTERDITES.map((relatif) => posix.join(home, relatif)), ...(cook.prod ?? []).map((acces) => chemin(acces, home, "accès de prod"))]);
  const ecrits = unique([chemin(cook.worktree, home, "worktree"), ...cook.caches.map((cache) => chemin(cache, home, "cache du projet"))]);
  for (const lieu of ecrits) {
    // Écrire au-dessus du compte, c'est écrire partout dessous : ses fichiers
    // de démarrage, ses clés.
    if (sous(lieu, home)) throw new BacASableInvalide(`${lieu} : un cook n'écrit ni à la racine du compte (${home}), ni au-dessus`);
    const touche = interdits.find((interdit) => sous(interdit, lieu) || sous(lieu, interdit));
    if (touche !== undefined) throw new BacASableInvalide(`${lieu} : un cook n'y écrirait pas sans toucher à ${touche}, qu'il ne doit pas même lire`);
  }
  const lus = unique((cook.lit ?? []).map((fichier) => chemin(fichier, home, "fichier remis au cook")));
  for (const fichier of lus) {
    const touche = interdits.find((interdit) => sous(interdit, fichier));
    if (touche !== undefined) throw new BacASableInvalide(`${fichier} : un fichier remis au cook ne peut pas être sous ${touche}, qu'il ne doit pas lire`);
  }
  const hotes = cook.hotes.map((regle) => ({ regle, noms: domaines(regle) }));
  return {
    modeDePermission: "dontAsk",
    reglages: {
      // Un projet qui fixe `packageManager` (`pnpm@10.x`) fait télécharger
      // cette version à pnpm 10 dès son démarrage, puis vérifier sa signature
      // auprès de registry.npmjs.org : chaque `pnpm <script>` meurt de
      // ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE quand cette requête
      // n'aboutit pas. Ce n'est pas le `fetch` de Node (pnpm a son client, qui
      // lit `https_proxy` en minuscules, que le bac à sable pose). Sans
      // changement de version, ni téléchargement ni vérification : pnpm tourne
      // avec celui qui est installé, réseau ou non. Posé ici, donc pour les
      // seuls lancements du bac à sable ; les autres gardent leur comportement.
      env: { npm_config_manage_package_manager_versions: "false" },
      sandbox: {
        enabled: true,
        // Sans bac à sable, `claude` refuse de partir plutôt que de lancer
        // les commandes à nu ; et une commande refusée n'est jamais rejouée
        // hors du bac à sable.
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        autoAllowBashIfSandboxed: true,
        excludedCommands: [],
        enableWeakerNestedSandbox: false,
        enableWeakerNetworkIsolation: false,
        filesystem: { allowWrite: ecrits, denyWrite: interdits, denyRead: interdits },
        // `strictAllowlist` : un hôte hors de la liste est refusé, quel que
        // soit le mode — sans lui, `bypassPermissions` le laisserait passer.
        network: { allowedDomains: unique(hotes.flatMap(({ noms }) => noms)), strictAllowlist: true, allowLocalBinding: false, allowAllUnixSockets: false },
      },
      hooks: { PreToolUse: CROCHET_BASH },
      permissions: {
        allow: unique([
          ...ecrits.map((lieu) => `Edit(/${lieu}/**)`),
          // Le ticket que la station remet en fichier : les outils de `claude`
          // ne lisent hors du worktree que ce qu'une règle autorise.
          ...lus.map((fichier) => `Read(/${fichier})`),
          // WebFetch suit ses propres règles, pas la liste du bac à sable ; une
          // règle WebFetch ouvre l'hôte sur tous ses ports, elle ne s'écrit
          // donc pas pour un hôte borné à un port.
          ...hotes.flatMap(({ regle, noms }) => (regle.port === null ? noms.map((nom) => `WebFetch(domain:${nom})`) : [])),
        ]),
        deny: interdits.flatMap((interdit) => [...regles("Read", interdit), ...regles("Edit", interdit)]),
        disableBypassPermissionsMode: "disable",
      },
    },
  };
}

// Ce que la station ajoute au lancement d'un cook dans le bac à sable, à la
// place de son `--permission-mode`.
export function argumentsDuBacASable(config: ConfigDeBacASable): string[] {
  return ["--permission-mode", config.modeDePermission, "--settings", JSON.stringify(config.reglages), "--append-system-prompt", CONSIGNE_DE_REFUS];
}
