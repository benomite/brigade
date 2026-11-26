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
export type DebutDeConnection = { code: string; page: string } | Connecte | { refus: string; detail?: string };
// Ce qu'il en est advenu : connecté, ou pourquoi pas.
export type FinDeConnection = Connecte | { refus: string; detail?: string };

export type ConnectionOptions = {
  // La commande que le runtime nomme, telle quelle : son premier mot est le `gh` de l'ordinateur.
  commande: () => Promise<string[]>;
  env: Record<string, string | undefined>;
  // Ouvre une page dans le navigateur du chef.
  ouvrir: (adresse: string) => unknown;
  apres: (fin: FinDeConnection) => void;
  gardeMs?: number;
  // Le temps laissé à `gh` pour dire son code et sa page : au-delà, le bouton cesse de tourner.
  lectureMs?: number;
};

// Le temps laissé au chef pour taper le code : au-delà, le login est arrêté.
const GUARD_MS = 15 * 60_000;
const READ_MS = 8_000;
const DETAIL_MAX = 2_000;
// Ce que `gh` écrit (cli/cli, internal/authflow) : « ! First copy your one-time code: ABCD-1234 »,
// puis, s'il peut attendre Entrée, « Press Enter to open https://github.com/login/device in your
// browser... » — sinon « Open this URL to continue in your web browser: https://github.com/login/device ».
// Les versions récentes le formulent autrement (« Your device code is: ABCD-1234 », « One-time code (ABCD-1234) copied to
// clipboard ») : on lit le code qui suit le mot « code », sur la même ligne.
const CODE = /\bcode\b[^\n]*?\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/i;
const PAGE = /(?:https?:\/\/)?[\w.-]+\/login\/device\b\S*/i;
const ENTREE = /press enter/i;
// Les couleurs que `gh` poserait malgré `NO_COLOR`.
const COULEURS = /\x1b\[[0-9;]*m/g;

const derniereLine = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .at(-1) ?? "";

export function holdConnectionGitHub(options: ConnectionOptions): () => Promise<DebutDeConnection> {
  let enCours: Promise<DebutDeConnection> | undefined;
  return () => {
    if (enCours !== undefined) return enCours;
    const lance = (async (): Promise<DebutDeConnection> => {
      const [gh = "gh", ...args] = await options.commande();
      return new Promise<DebutDeConnection>((resoudre) => {
        let sortie = "";
        let debut: DebutDeConnection | undefined;
        const commencer = (rendu: DebutDeConnection) => {
          if (debut !== undefined) return;
          debut = rendu;
          resoudre(rendu);
        };
        const enfant = spawn(gh, args, { windowsHide: true, env: { ...options.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
        const guard = setTimeout(() => enfant.kill(), options.gardeMs ?? GUARD_MS);
        // `gh` lit Entrée sur son entrée : fermée trop tôt, l'écriture échoue — sans rien arrêter.
        enfant.stdin.on("error", () => undefined);
        // `gh` en vie mais illisible : on le dit au lieu de tourner jusqu'à la garde.
        const read = setTimeout(() => {
          if (debut !== undefined) return;
          const detail = sortie.trim().slice(-DETAIL_MAX);
          enCours = undefined;
          commencer({ refus: "GitHub sign-in did not show a code the app could read, so it was stopped.", detail: detail === "" ? "gh said nothing." : detail });
          enfant.kill();
        }, options.lectureMs ?? READ_MS);
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
          clearTimeout(read);
          commencer({ code: code.toUpperCase(), page });
        };
        enfant.stdout.on("data", lire);
        enfant.stderr.on("data", lire);
        enfant.once("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(guard);
          clearTimeout(read);
          commencer(
            error.code === "ENOENT"
              ? { refus: `The GitHub CLI (\`${gh}\`) is not installed on this computer, so brigade cannot sign you in to GitHub.`, detail: error.message }
              : { refus: `The GitHub sign-in could not be started on this computer: ${error.message}.`, detail: error.message },
          );
          enCours = undefined;
        });
        enfant.once("close", (code, signal) => {
          clearTimeout(guard);
          clearTimeout(read);
          enCours = undefined;
          const detail = sortie.trim().slice(-DETAIL_MAX);
          const dit = derniereLine(sortie).replace(/[.\s]+$/, "");
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

// Le compte GitHub que ce `gh` tient (#2475, épique #2473) : le premier lancement et « Add a project » le disent, « Connected to
// GitHub as … », sans que le chef ait rien à taper. La question est celle que le runtime pose déjà au `gh` d'une station
// (`gh api user --jq .login`, runtime/src/projets/echec-du-clone.ts) ; son échec se lit par le runtime (`echecDeGh`,
// runtime/src/appairage/stations-du-chef.ts) — un `gh` sans compte n'est pas une panne, c'est l'étape à faire.
export type AccountGitHub = { login: string } | { nonConnecte: true } | { refus: string; detail?: string; lien?: string };

type FailureDeGh = typeof import("../../runtime/src/appairage/stations-du-chef.ts").echecDeGh;
export type OptionsDuAccount = { gh: string; env: Record<string, string | undefined>; echecDeGh: FailureDeGh; delaiMs?: number };

const DELAY_DU_ACCOUNT_MS = 30_000;
// Ce qui retient la lecture, en une phrase : le détail — ce que `gh` a écrit — reste au survol.
const RAISONS: Record<string, (gh: string, delayMs: number) => string> = {
  "gh-missing": (gh) => `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade reads your GitHub account through it.`,
  timeout: (_, delayMs) => `GitHub gave no answer within ${Math.round(delayMs / 1000)} s, so your GitHub account could not be read.`,
  "rate-limit": () => "GitHub is limiting this account's calls for now, so your GitHub account could not be read.",
  network: () => "GitHub cannot be reached from this computer, so your GitHub account could not be read: check its network connection.",
};

export function lireLeAccountGitHub(options: OptionsDuAccount): Promise<AccountGitHub> {
  const delayMs = options.delaiMs ?? DELAY_DU_ACCOUNT_MS;
  return new Promise((rendre) => {
    execFile(options.gh, ["api", "user", "--jq", ".login"], { timeout: delayMs, windowsHide: true, env: { ...options.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, sortie, erreurs) => {
      const login = String(sortie).trim();
      if (error === null && login !== "") return rendre({ login });
      const lu = options.echecDeGh(options.gh, delayMs, error ?? { message: "gh gave no login" }, String(erreurs));
      if (lu.state === "sign-in-required") return rendre({ nonConnecte: true });
      const raison = RAISONS[lu.cause]?.(options.gh, delayMs) ?? "GitHub did not say which account this computer is connected to.";
      rendre({ refus: raison, ...(lu.detail === undefined ? {} : { detail: lu.detail }), ...(lu.link === undefined ? {} : { lien: lu.link }) });
    });
  });
}
