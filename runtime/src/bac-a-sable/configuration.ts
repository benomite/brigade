// La configuration du bac à sable de Claude Code pour un cook du Mac : ce que
// la station passe à `claude` (`--settings`) pour qu'un cook ordinaire ne
// touche, sur le Mac du chef, qu'à son ticket. Il écrit dans son worktree et
// dans les caches du projet, nulle part ailleurs ; il ne lit ni `~/.ssh`, ni
// les identifiants du chef, ni ses accès de prod ; il ne joint que les hôtes
// de la liste réseau du projet — liste vide, aucun. Il peut ouvrir un port
// local (`allowLocalBinding`, #3541 : Gradle parle à son démon par un port
// local), sur la boucle locale seulement ; cela n'ajoute aucun hôte joignable.
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
// Le cook d'un ticket de setup (#2888) part en mode `default` : `claude`
// demande toute écriture sous un `.claude/` avant de lire les règles `allow`,
// et `dontAsk` refuse toute demande — aucune règle n'y ouvre `.claude/brigade/`.
// Lancé en `-p`, `claude` n'y pose aucune question : chaque demande va au
// crochet PermissionRequest (`crochet-brigade.ts`), qui n'ouvre que Write et
// Edit sous `.claude/brigade/` du worktree ; sans sa réponse, elle est
// refusée, comme en `dontAsk`. Le bac à sable ne change pas : ses commandes y
// écrivent déjà, sous le worktree.
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
import { DECLARATION_BAC_A_SABLE, DeclarationRefusee, type DeclarationBacASable } from "./declaration.ts";
import { droitsDInstallation } from "../sandbox/installation.ts";
import { entreesReseau, type ServiceLocal } from "../sandbox/services-locaux.ts";

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
// ticket) — le seul droit de lecture que la configuration ajoute. `brigade` :
// le ticket du cook ne livre que `.claude/brigade/` (setup du dépôt) ; seul il
// y écrit. `services` : les services locaux que le projet déclare
// (`sandbox/services-locaux.ts`), joignables sur la boucle locale, eux seuls.
// `declaration` : ce que le dépôt déclare dans `bac-a-sable.json`
// (`declaration.ts`) ; ses dossiers d'`ecriture` s'ajoutent à ceux du cook,
// dans les limites de `ecritureDeclaree`. `etat` : le répertoire où le
// runtime tient son état — aucun dossier déclaré n'y touche.
export type Cook = { worktree: string; caches: string[]; hotes: Regle[]; home: string; prod?: string[]; lit?: string[]; brigade?: boolean; services?: ServiceLocal[]; declaration?: DeclarationBacASable; etat?: string };

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
    network: { allowedDomains: string[]; strictAllowlist: true; allowLocalBinding: true; allowAllUnixSockets: false };
  };
  hooks: { PreToolUse: typeof CROCHET_BASH; PermissionRequest?: ReturnType<typeof crochetBrigade> };
  permissions: { allow: string[]; deny: string[]; disableBypassPermissionsMode: "disable" };
};

export type ConfigDeBacASable = { modeDePermission: "dontAsk" | "default"; reglages: Reglages };

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

// Ce que Brigade tient sous le compte du chef, en plus de ce qu'aucun cook ne
// lit : `claude` entier — sa connexion, ses réglages, ses crochets. Relatif à `~`.
const ETAT_DE_BRIGADE = [".claude"];

// Un nom de fichier ou de dossier qui porte des identifiants ou des jetons.
const SECRET = /credential|token|secret/i;

// Un dossier d'`ecriture` de la déclaration du projet, en chemin absolu — ou
// le refus, qui nomme l'entrée et la limite qu'elle passe. Relatif, il est sous
// le worktree et y reste. Absolu ou sous `~` : jamais la racine, le compte
// entier ou au-dessus ; jamais un secret du chef ni l'état de Brigade, ni un
// dossier qui en contient ; jamais un nom d'identifiants ou de jetons.
function ecritureDeclaree(entree: string, cook: { worktree: string; home: string; interdits: string[]; etat: string | undefined }): string {
  const { worktree, home } = cook;
  const refus = (limite: string) => new DeclarationRefusee(`\`${DECLARATION_BAC_A_SABLE}\`, ecriture « ${entree} » : ${limite} — la déclaration est refusée en entier`);
  const relatif = entree !== "~" && !entree.startsWith("~/") && !posix.isAbsolute(entree);
  let lieu: string;
  try {
    lieu = chemin(relatif ? posix.join(worktree, entree) : entree, home, "dossier déclaré");
  } catch (erreur) {
    throw refus(erreur instanceof Error ? erreur.message : String(erreur));
  }
  if (relatif && !sous(worktree, lieu)) throw refus(`un chemin relatif reste sous le worktree (${worktree}), il n'en sort pas par « .. »`);
  if (SECRET.test(lieu.slice(sous(worktree, lieu) ? worktree.length : 0))) throw refus("un dossier déclaré ne porte pas d'identifiants ni de jetons (credential, token, secret)");
  if (sous(worktree, lieu)) return lieu;
  if (lieu === "/") throw refus("un cook n'écrit jamais à la racine du système de fichiers");
  if (sous(lieu, home)) throw refus(`un cook n'écrit ni dans le compte entier (${home}), ni au-dessus`);
  const proteges = [...cook.interdits, ...ETAT_DE_BRIGADE.map((relatif) => posix.join(home, relatif)), ...(cook.etat === undefined ? [] : [chemin(cook.etat, home, "état du runtime")])];
  const touche = proteges.find((protege) => sous(protege, lieu) || sous(lieu, protege));
  if (touche !== undefined) throw refus(`un dossier déclaré n'est ni ne contient les secrets du chef ou l'état de Brigade (${touche})`);
  return lieu;
}

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

// Le crochet qui ouvre au cook d'un ticket de setup Write et Edit sous
// `.claude/brigade/` de son worktree. Le worktree passe encodé : la commande
// est lue par un shell, et un chemin peut porter `"`, `$` ou une espace ;
// encodé, il ne porte plus rien qu'un shell lise entre guillemets.
const CROCHET_DE_BRIGADE = fileURLToPath(new URL("./crochet-brigade.ts", import.meta.url));
const crochetBrigade = (worktree: string) => [{ matcher: "Write|Edit", hooks: [{ type: "command" as const, command: `"${process.execPath}" "${CROCHET_DE_BRIGADE}" "${encodeURIComponent(worktree)}"` }] }];

// Ce que le cook lit quand `claude` lui refuse une commande : le refus de
// `dontAsk` est un message fixe, qui ne dit pas quoi faire à la place.
export const CONSIGNE_DE_REFUS =
  "Si une commande Bash t'est refusée avec « Permission to use Bash has been denied because Claude Code is running in don't ask mode », ce n'est pas une panne : seules les commandes de vérification du projet sont autorisées, dans ton worktree. À la place, joue ses tests et ses linters ainsi : `./node_modules/.bin/<outil> <args>` (vitest, prettier, eslint…, sans `..`), éventuellement précédé de variables (`DATABASE_URL=… LLM_MODE=mock ./node_modules/.bin/vitest run <chemin>`), ou `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm typecheck` (aussi `npm`, `yarn`, `pnpm run <script>`). Pas de `&&`, de `|`, de redirection ni de guillemets dans ces commandes, et pas de `cd` hors du worktree ; les lectures (`ls`, `cat`, `head`, `tail`, `wc`, `pwd`) passent seules, et on peut les enchaîner avec `;`. Ne contourne pas un refus : si rien de cela ne convient, dis dans ton compte-rendu ce que tu voulais lancer.";

export function configurer(cook: Cook): ConfigDeBacASable {
  if (!posix.isAbsolute(cook.home)) throw new BacASableInvalide(`répertoire du compte (« ${cook.home} ») : un chemin absolu est attendu`);
  const home = chemin(cook.home, cook.home, "répertoire du compte");
  const interdits = unique([...LECTURES_INTERDITES.map((relatif) => posix.join(home, relatif)), ...(cook.prod ?? []).map((acces) => chemin(acces, home, "accès de prod"))]);
  const worktree = chemin(cook.worktree, home, "worktree");
  // Les `ports` de la déclaration n'ajoutent rien ici : le bac à sable de
  // Claude Code n'ouvre la boucle locale qu'en entier (`allowLocalBinding`),
  // sans champ qui la borne à un port, et l'ouvre déjà (#3541).
  const declares = (cook.declaration?.ecriture ?? []).map((entree) => ecritureDeclaree(entree, { worktree, home, interdits, etat: cook.etat }));
  const ecrits = unique([worktree, ...cook.caches.map((cache) => chemin(cache, home, "cache du projet")), ...droitsDInstallation(home), ...declares]);
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
  const setup = cook.brigade === true;
  return {
    modeDePermission: setup ? "default" : "dontAsk",
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
        network: { allowedDomains: unique([...hotes.flatMap(({ noms }) => noms), ...entreesReseau(cook.services ?? [])]), strictAllowlist: true, allowLocalBinding: true, allowAllUnixSockets: false },
      },
      hooks: { PreToolUse: CROCHET_BASH, ...(setup ? { PermissionRequest: crochetBrigade(ecrits[0]!) } : {}) },
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
