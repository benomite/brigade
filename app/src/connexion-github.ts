// Connecter cet ordinateur à GitHub, d'un bouton (#1434) : le geste est celui que le runtime nomme
// quand il ne peut pas lire les stations du chef, ou cloner un projet, faute de compte
// (`connexionGitHub`, runtime/src/appairage/stations-du-chef.ts) — `gh auth login --web`, par le
// `gh` de l'ordinateur, et rien d'autre ne parle à GitHub. L'app le lance sans terminal : `gh` dit
// un code à usage unique et la page où le taper. L'app ouvre cette page dans le navigateur — ou
// laisse `gh` l'ouvrir quand il attend Entrée pour le faire —, et la vue montre le code. La
// connexion faite, ou ratée, la vue en est avertie, et relit les stations.
//
// Un seul login à la fois : un second clic, pendant que le premier attend le chef, rend le même
// code sans rien lancer de plus. Au-delà de la garde, le login est arrêté, et un clic le relance.
import { execFile, spawn } from "node:child_process";

// Ce que la vue montre une fois le login parti : le code à taper, et la page où le taper.
// `connecte` : `gh` a fini sans code à taper — il l'était déjà. `compte` : le compte GitHub connecté, quand on le
// sait — le pont du téléphone le dit (app/android/web/pont.js, le ticket 2500), `gh` ici non.
export type Connecte = { connecte: true; compte?: string | null };
export type DebutDeConnexion = { code: string; page: string } | Connecte | { refus: string; detail?: string };
// Ce qu'il en est advenu : connecté, ou pourquoi pas.
export type FinDeConnexion = Connecte | { refus: string; detail?: string };

export type OptionsConnexion = {
  // La commande que le runtime nomme, telle quelle : son premier mot est le `gh` de l'ordinateur.
  commande: () => Promise<string[]>;
  env: Record<string, string | undefined>;
  // Ouvre une page dans le navigateur du chef.
  ouvrir: (adresse: string) => unknown;
  apres: (fin: FinDeConnexion) => void;
  gardeMs?: number;
};

// Le temps laissé au chef pour taper le code : au-delà, le login est arrêté.
const GARDE_MS = 15 * 60_000;
const DETAIL_MAX = 2_000;
// Ce que `gh` écrit (cli/cli, internal/authflow) : « ! First copy your one-time code: ABCD-1234 »,
// puis, s'il peut attendre Entrée, « Press Enter to open https://github.com/login/device in your
// browser... » — sinon « Open this URL to continue in your web browser: https://github.com/login/device ».
const CODE = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i;
const PAGE = /(?:https?:\/\/)?[\w.-]+\/login\/device\b\S*/i;
const ENTREE = /press enter/i;
// Les couleurs que `gh` poserait malgré `NO_COLOR`.
const COULEURS = /\x1b\[[0-9;]*m/g;

const derniereLigne = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "")
    .at(-1) ?? "";

export function tenirConnexionGitHub(options: OptionsConnexion): () => Promise<DebutDeConnexion> {
  let enCours: Promise<DebutDeConnexion> | undefined;
  return () => {
    if (enCours !== undefined) return enCours;
    const lance = (async (): Promise<DebutDeConnexion> => {
      const [gh = "gh", ...args] = await options.commande();
      return new Promise<DebutDeConnexion>((resoudre) => {
        let sortie = "";
        let debut: DebutDeConnexion | undefined;
        const commencer = (rendu: DebutDeConnexion) => {
          if (debut !== undefined) return;
          debut = rendu;
          resoudre(rendu);
        };
        const enfant = spawn(gh, args, { windowsHide: true, env: { ...options.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
        const garde = setTimeout(() => enfant.kill(), options.gardeMs ?? GARDE_MS);
        // `gh` lit Entrée sur son entrée : fermée trop tôt, l'écriture échoue — sans rien arrêter.
        enfant.stdin.on("error", () => undefined);
        const lire = (morceau: Buffer) => {
          sortie = `${sortie}${morceau.toString().replace(COULEURS, "")}`.slice(-16_384);
          if (debut !== undefined) return;
          const code = CODE.exec(sortie)?.[1];
          const vue = PAGE.exec(sortie)?.[0];
          if (code === undefined || vue === undefined) return;
          const page = /^https?:\/\//i.test(vue) ? vue : `https://${vue}`;
          // Il attend Entrée pour ouvrir la page lui-même ; sinon, c'est l'app qui l'ouvre.
          if (ENTREE.test(sortie)) enfant.stdin.write("\n");
          else void Promise.resolve(options.ouvrir(page)).catch(() => undefined);
          commencer({ code: code.toUpperCase(), page });
        };
        enfant.stdout.on("data", lire);
        enfant.stderr.on("data", lire);
        enfant.once("error", (erreur: NodeJS.ErrnoException) => {
          clearTimeout(garde);
          commencer(
            erreur.code === "ENOENT"
              ? { refus: `The GitHub CLI (\`${gh}\`) is not installed on this computer, so brigade cannot sign you in to GitHub.`, detail: erreur.message }
              : { refus: `The GitHub sign-in could not be started on this computer: ${erreur.message}.`, detail: erreur.message },
          );
          enCours = undefined;
        });
        enfant.once("close", (code, signal) => {
          clearTimeout(garde);
          enCours = undefined;
          const detail = sortie.trim().slice(-DETAIL_MAX);
          const dit = derniereLigne(sortie).replace(/[.\s]+$/, "");
          const comment = signal === null ? `code ${code}` : signal;
          if (debut === undefined) {
            commencer(code === 0 ? { connecte: true } : { refus: `GitHub sign-in did not start (${comment})${dit === "" ? "" : `: ${dit}`}.`, detail });
            return;
          }
          if (!("code" in debut)) return;
          options.apres(code === 0 ? { connecte: true } : { refus: `GitHub sign-in did not finish (${comment})${dit === "" ? "" : `: ${dit}`}.`, detail });
        });
      });
    })();
    enCours = lance;
    return lance;
  };
}

// Le compte GitHub que ce `gh` tient (#2475, épique #2473) : l'étape du compte du parcours d'ajout le dit, « Connected to
// GitHub as … », sans que le chef ait rien à taper. La question est celle que le runtime pose déjà au `gh` d'une station
// (`gh api user --jq .login`, runtime/src/projets/echec-du-clone.ts) ; son échec se lit par le runtime (`echecDeGh`,
// runtime/src/appairage/stations-du-chef.ts) — un `gh` sans compte n'est pas une panne, c'est l'étape à faire.
export type CompteGitHub = { login: string } | { nonConnecte: true } | { refus: string; detail?: string; lien?: string };

type EchecDeGh = typeof import("../../runtime/src/appairage/stations-du-chef.ts").echecDeGh;
export type OptionsDuCompte = { gh: string; env: Record<string, string | undefined>; echecDeGh: EchecDeGh; delaiMs?: number };

const DELAI_DU_COMPTE_MS = 30_000;
// Ce qui retient la lecture, en une phrase : le détail — ce que `gh` a écrit — reste au survol.
const RAISONS: Record<string, (gh: string, delaiMs: number) => string> = {
  "gh-missing": (gh) => `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade reads your GitHub account through it.`,
  timeout: (_, delaiMs) => `GitHub gave no answer within ${Math.round(delaiMs / 1000)} s, so your GitHub account could not be read.`,
  "rate-limit": () => "GitHub is limiting this account's calls for now, so your GitHub account could not be read.",
  network: () => "GitHub cannot be reached from this computer, so your GitHub account could not be read: check its network connection.",
};

export function lireLeCompteGitHub(options: OptionsDuCompte): Promise<CompteGitHub> {
  const delaiMs = options.delaiMs ?? DELAI_DU_COMPTE_MS;
  return new Promise((rendre) => {
    execFile(options.gh, ["api", "user", "--jq", ".login"], { timeout: delaiMs, windowsHide: true, env: { ...options.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
      const login = String(sortie).trim();
      if (erreur === null && login !== "") return rendre({ login });
      const lu = options.echecDeGh(options.gh, delaiMs, erreur ?? { message: "gh gave no login" }, String(erreurs));
      if (lu.state === "sign-in-required") return rendre({ nonConnecte: true });
      const raison = RAISONS[lu.cause]?.(options.gh, delaiMs) ?? "GitHub did not say which account this computer is connected to.";
      rendre({ refus: raison, ...(lu.detail === undefined ? {} : { detail: lu.detail }), ...(lu.link === undefined ? {} : { lien: lu.link }) });
    });
  });
}
