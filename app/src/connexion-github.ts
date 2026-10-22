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
import { spawn } from "node:child_process";

// Ce que la vue montre une fois le login parti : le code à taper, et la page où le taper.
// `connecte` : `gh` a fini sans code à taper — il l'était déjà.
export type DebutDeConnexion = { code: string; page: string } | { connecte: true } | { refus: string; detail?: string };
// Ce qu'il en est advenu : connecté, ou pourquoi pas.
export type FinDeConnexion = { connecte: true } | { refus: string; detail?: string };

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
