// Connecter cet ordinateur à GitHub, d'un bouton (#1434) : le geste est celui qu'il faut quand les stations du
// chef ne se lisent pas, ou qu'un projet ne se clone pas, faute de compte — `gh auth login --web`, par le
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
export type Connected = { connecte: true; compte?: string | null };
export type StartOfConnection = { code: string; page: string } | Connected | { refus: string; detail?: string };
// Ce qu'il en est advenu : connecté, ou pourquoi pas.
export type EndOfConnection = Connected | { refus: string; detail?: string };

export type ConnectionOptions = {
  // La commande de connexion (`signInToGitHub`), telle quelle : son premier mot est le `gh` de l'ordinateur.
  commande: () => Promise<string[]>;
  env: Record<string, string | undefined>;
  // Ouvre une page dans le navigateur du chef.
  ouvrir: (address: string) => unknown;
  apres: (end: EndOfConnection) => void;
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
const ENTRY = /press enter/i;
// Les couleurs que `gh` poserait malgré `NO_COLOR`.
const COLORS = /\x1b\[[0-9;]*m/g;

const lastLine = (text: string) =>
  text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .at(-1) ?? "";

export function holdConnectionGitHub(options: ConnectionOptions): () => Promise<StartOfConnection> {
  let inProgress: Promise<StartOfConnection> | undefined;
  return () => {
    if (inProgress !== undefined) return inProgress;
    const launches = (async (): Promise<StartOfConnection> => {
      const [gh = "gh", ...args] = await options.commande();
      return new Promise<StartOfConnection>((resolve) => {
        let output = "";
        let start: StartOfConnection | undefined;
        const begin = (rendered: StartOfConnection) => {
          if (start !== undefined) return;
          start = rendered;
          resolve(rendered);
        };
        const child = spawn(gh, args, { windowsHide: true, env: { ...options.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
        const guard = setTimeout(() => child.kill(), options.gardeMs ?? GUARD_MS);
        // `gh` lit Entrée sur son entrée : fermée trop tôt, l'écriture échoue — sans rien arrêter.
        child.stdin.on("error", () => undefined);
        // `gh` en vie mais illisible : on le dit au lieu de tourner jusqu'à la garde.
        const reading = setTimeout(() => {
          if (start !== undefined) return;
          const detail = output.trim().slice(-DETAIL_MAX);
          inProgress = undefined;
          begin({ refus: "GitHub sign-in did not show a code the app could read, so it was stopped.", detail: detail === "" ? "gh said nothing." : detail });
          child.kill();
        }, options.lectureMs ?? READ_MS);
        const read = (piece: Buffer) => {
          output = `${output}${piece.toString().replace(COLORS, "")}`.slice(-16_384);
          if (start !== undefined) return;
          const code = CODE.exec(output)?.[1];
          const vue = PAGE.exec(output)?.[0];
          if (code === undefined || vue === undefined) return;
          const page = /^https?:\/\//i.test(vue) ? vue : `https://${vue}`;
          // Il attend Entrée pour ouvrir la page lui-même ; sinon, c'est l'app qui l'ouvre.
          if (ENTRY.test(output)) child.stdin.write("\n");
          else void Promise.resolve(options.ouvrir(page)).catch(() => undefined);
          clearTimeout(reading);
          begin({ code: code.toUpperCase(), page });
        };
        child.stdout.on("data", read);
        child.stderr.on("data", read);
        child.once("error", (error: NodeJS.ErrnoException) => {
          clearTimeout(guard);
          clearTimeout(reading);
          begin(
            error.code === "ENOENT"
              ? { refus: `The GitHub CLI (\`${gh}\`) is not installed on this computer, so brigade cannot sign you in to GitHub.`, detail: error.message }
              : { refus: `The GitHub sign-in could not be started on this computer: ${error.message}.`, detail: error.message },
          );
          inProgress = undefined;
        });
        child.once("close", (code, signal) => {
          clearTimeout(guard);
          clearTimeout(reading);
          inProgress = undefined;
          const detail = output.trim().slice(-DETAIL_MAX);
          const said = lastLine(output).replace(/[.\s]+$/, "");
          const comment = signal === null ? `code ${code}` : signal;
          if (start === undefined) {
            begin(code === 0 ? { connecte: true } : { refus: `GitHub sign-in did not start (${comment})${said === "" ? "" : `: ${said}`}.`, detail });
            return;
          }
          if (!("code" in start)) return;
          options.apres(code === 0 ? { connecte: true } : { refus: `GitHub sign-in did not finish (${comment})${said === "" ? "" : `: ${said}`}.`, detail });
        });
      });
    })();
    inProgress = launches;
    return launches;
  };
}

// Le geste qui connecte ce `gh` : dans le navigateur, sans rien demander au terminal que la connexion ne demande pas, et en
// HTTPS — le protocole des clones (#1390).
export const signInToGitHub = (gh: string): string[] => [gh, "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"];

// Le compte GitHub que ce `gh` tient (#2475, épique #2473) : le premier lancement et « Add a project » le disent, « Connected to
// GitHub as … », sans que le chef ait rien à taper. La question est `gh api user --jq .login` ; son échec se lit par le
// jugement d'un `gh` en échec (`failureOfGh`) — un `gh` sans compte n'est pas une panne, c'est l'étape à faire.
export type AccountGitHub = { login: string } | { nonConnecte: true } | { refus: string; detail?: string; lien?: string };

// Ce qu'un `gh` en échec veut dire : le compte à connecter, ou pourquoi GitHub ne se lit pas.
type FailureOfGh = (gh: string, delayMs: number, error: { code?: string | number | null; killed?: boolean; message: string }, errors: string) => { state: "sign-in-required" } | { state: "unavailable"; cause: string; detail?: string; link?: string };
export type OptionsOfAccount = { gh: string; env: Record<string, string | undefined>; echecDeGh?: FailureOfGh; delaiMs?: number };

// Ce que `gh` dit quand il n'a pas de compte, ou un jeton refusé — et son code de sortie dans ce cas (« authentication
// required ») ; quand GitHub limite le compte ; quand le réseau manque.
const SIGNED_OUT = /gh auth login|not logged in|authentication required|requires authentication|bad credentials|HTTP 401/i;
const CODE_SIGNED_OUT = 4;
const LIMITED = /rate limit|HTTP 429/i;
const NETWORK = /error connecting|could not resolve|no such host|dial tcp|network is unreachable|connection refused|connection reset|i\/o timeout|TLS handshake|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i;
export const failureOfGh: FailureOfGh = (_gh, _delayMs, error, errors) => {
  const detail = errors.trim() || error.message;
  if (error.code === "ENOENT") return { state: "unavailable", cause: "gh-missing", link: "https://cli.github.com", detail };
  if (error.killed === true) return { state: "unavailable", cause: "timeout", detail };
  if (error.code === CODE_SIGNED_OUT || SIGNED_OUT.test(errors)) return { state: "sign-in-required" };
  if (LIMITED.test(errors)) return { state: "unavailable", cause: "rate-limit", detail };
  if (NETWORK.test(errors)) return { state: "unavailable", cause: "network", detail };
  return { state: "unavailable", cause: "github", detail };
};

const DELAY_OF_ACCOUNT_MS = 30_000;
// Ce qui retient la lecture, en une phrase : le détail — ce que `gh` a écrit — reste au survol.
const REASONS: Record<string, (gh: string, delayMs: number) => string> = {
  "gh-missing": (gh) => `The GitHub CLI (\`${gh}\`) is not installed on this computer, and brigade reads your GitHub account through it.`,
  timeout: (_, delayMs) => `GitHub gave no answer within ${Math.round(delayMs / 1000)} s, so your GitHub account could not be read.`,
  "rate-limit": () => "GitHub is limiting this account's calls for now, so your GitHub account could not be read.",
  network: () => "GitHub cannot be reached from this computer, so your GitHub account could not be read: check its network connection.",
};

export function readTheAccountGitHub(options: OptionsOfAccount): Promise<AccountGitHub> {
  const delayMs = options.delaiMs ?? DELAY_OF_ACCOUNT_MS;
  return new Promise((render) => {
    execFile(options.gh, ["api", "user", "--jq", ".login"], { timeout: delayMs, windowsHide: true, env: { ...options.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) => {
      const login = String(output).trim();
      if (error === null && login !== "") return render({ login });
      const readOne = (options.echecDeGh ?? failureOfGh)(options.gh, delayMs, error ?? { message: "gh gave no login" }, String(errors));
      if (readOne.state === "sign-in-required") return render({ nonConnecte: true });
      const reason = REASONS[readOne.cause]?.(options.gh, delayMs) ?? "GitHub did not say which account this computer is connected to.";
      render({ refus: reason, ...(readOne.detail === undefined ? {} : { detail: readOne.detail }), ...(readOne.link === undefined ? {} : { lien: readOne.link }) });
    });
  });
}
