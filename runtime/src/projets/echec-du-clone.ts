// Un clone en échec, dit au chef : pourquoi en une phrase, le compte GitHub
// sous lequel la station clone, et le geste qui le lève — le plus souvent sur
// GitHub, avec la page où le faire. Jamais la sortie brute de git comme
// message : elle reste dans `detail`, que l'app ne montre que derrière un lien
// « details ».
//
// Le 22 oct. 2026 (#1390), la box ne clonait pas ACME-tech/widgets, et la
// page disait « clone de … en échec — failed to run git: exit status 128 » :
// la dernière ligne de gh, pas celle de git. GitHub répond « Repository not
// found » aussi bien pour un dépôt qui n'existe pas que pour un compte qui ne
// le voit pas, ou un jeton qui ne l'inclut pas : la station s'enquiert donc,
// auprès de son `gh`, de son compte, du type de son jeton (un jeton
// fine-grained ne couvre que les dépôts qu'on lui choisit) et de l'existence
// du propriétaire du dépôt.
import { promisify } from "node:util";
import { execFile } from "../sans-invite.ts";

export type CauseDuClone =
  | "unreachable"
  | "not-logged-in"
  | "sso-required"
  | "ssh-rewrite"
  | "no-read-access"
  | "repository-missing"
  | "token-excludes-repository"
  | "account-cannot-see"
  | "unknown";

// Ce que la station publie d'un clone en échec (`demande.ts`, `clone`). En
// anglais : c'est l'app qui les montre. `ou` : où le geste se fait ; `liens` :
// les pages GitHub où le faire ; `compte` : le compte GitHub de la station,
// s'il a pu être lu ; `detail` : ce que gh et git ont dit, tel quel ;
// `reessaieToutesLes` : en secondes, l'écart entre deux essais — le prochain
// vient au plus tard dans ce délai. Un écart, pas un instant : le suivi ne se
// réécrit que s'il change, et un instant changerait à chaque essai.
export type EchecDuClone = {
  cause: CauseDuClone;
  raison: string;
  geste: string;
  ou: string;
  liens: string[];
  compte: string | null;
  detail: string;
  reessaieToutesLes: number;
};

export type TypeDeJeton = "fine-grained" | "classic" | "oauth" | "app";

// Ce que le `gh` de la station dit de lui-même, après un clone en échec. Null :
// il n'a pas pu le dire. `proprietaire` : le compte ou l'organisation qui porte
// le dépôt existe sur GitHub.
export type Enquete = { compte: string | null; jeton: TypeDeJeton | null; proprietaire: boolean | null };

export const ENQUETE_MUETTE: Enquete = { compte: null, jeton: null, proprietaire: null };

// Le type d'un jeton GitHub, lu sur son préfixe — le jeton lui-même n'est
// gardé nulle part.
export function typeDeJeton(jeton: string): TypeDeJeton | null {
  const net = jeton.trim();
  if (net.startsWith("github_pat_")) return "fine-grained";
  if (net.startsWith("ghp_")) return "classic";
  if (net.startsWith("gho_")) return "oauth";
  if (net.startsWith("ghu_") || net.startsWith("ghs_")) return "app";
  return null;
}

// Les pages GitHub du geste.
export const PAGE_DES_JETONS_FINS = "https://github.com/settings/personal-access-tokens";
export const PAGE_DES_JETONS = "https://github.com/settings/tokens";
export const pageDesAcces = (depot: string) => `https://github.com/${depot}/settings/access`;

// Ce que la page garde de la sortie de gh et de git, au plus.
const DETAIL_MAX = 2000;

const RESEAU = /could not resolve host|could not resolve hostname|failed to connect|couldn't connect|connection (timed out|refused|reset|closed)|operation timed out|network is unreachable|temporary failure in name resolution|early eof|returned error: 5\d\d|error connecting to|dial tcp|i\/o timeout|no such host/i;
const SSH = /host key verification failed|permission denied \(publickey/i;
const SSO = /saml|single sign-on|\bsso\b/i;
const IDENTIFIANTS = /could not read (username|password)|terminal prompts disabled|authentication failed|invalid username or password|returned error: 401|bad credentials|http 401|gh auth login|not logged in/i;
const INTERDIT = /returned error: 403|permission to .* denied|access denied|http 403/i;
const INTROUVABLE = /repository not found|could not resolve to a repository|does not appear to be a git repository|returned error: 404|not found/i;

export type Lecture = { station: string; depot: string; erreurs: string; enquete: Enquete; reessaieToutesLes: number };

// Ce qu'un clone en échec veut dire, et le geste qui le lève. Pur.
export function lireLEchecDuClone({ station, depot, erreurs, enquete, reessaieToutesLes }: Lecture): EchecDuClone {
  const { compte, jeton, proprietaire } = enquete;
  const proprio = depot.split("/")[0] ?? depot;
  const qui = compte ?? "the station's GitHub account";
  // En tête de phrase : un nom de compte s'écrit tel qu'il est.
  const Qui = compte ?? "The station's GitHub account";
  const sonJeton = compte === null ? "the station's GitHub token" : `the token used by ${compte}`;
  const surLaStation = `On ${station}, under the account that runs it.`;
  const echec = (cause: CauseDuClone, raison: string, geste: string, ou: string, liens: string[] = []): EchecDuClone => ({
    cause,
    raison,
    geste,
    ou,
    liens,
    compte,
    detail: erreurs.trim().slice(0, DETAIL_MAX),
    reessaieToutesLes,
  });
  if (RESEAU.test(erreurs)) {
    return echec("unreachable", `${station} cannot reach GitHub to clone ${depot}: the network or GitHub is down.`, `Nothing to do if GitHub is down: the station retries by itself. If it lasts, check the network of ${station}.`, surLaStation);
  }
  if (SSH.test(erreurs)) {
    return echec(
      "ssh-rewrite",
      `${station} clones ${depot} over HTTPS, but its git settings send GitHub addresses to ssh, which refuses it.`,
      `Remove the \`url.<…>.insteadOf\` setting that sends https://github.com/ to ssh from the git configuration of ${station} (\`git config --global --get-regexp '^url\\.'\` lists them).`,
      surLaStation,
    );
  }
  if (SSO.test(erreurs)) {
    const page = jeton === "fine-grained" ? PAGE_DES_JETONS_FINS : jeton === "classic" ? PAGE_DES_JETONS : `https://github.com/orgs/${proprio}/sso`;
    return echec("sso-required", `${proprio} requires single sign-on, and ${sonJeton} is not authorized for it, so ${station} cannot clone ${depot}.`, `Authorize ${sonJeton} for the single sign-on of ${proprio}, on GitHub.`, "On GitHub.", [page]);
  }
  if (IDENTIFIANTS.test(erreurs)) {
    return echec("not-logged-in", `The GitHub CLI of ${station} is not logged in, or its token has expired, so it cannot clone ${depot}.`, `Run \`gh auth login\` on ${station}, under the account that runs it.`, surLaStation);
  }
  if (INTERDIT.test(erreurs)) {
    return echec("no-read-access", `${Qui} may not read ${depot}, so ${station} cannot clone it.`, `Give ${qui} read access to ${depot}, in the repository's settings.`, "On GitHub.", [pageDesAcces(depot)]);
  }
  if (INTROUVABLE.test(erreurs)) {
    if (proprietaire === false) {
      return echec("repository-missing", `${depot} does not exist: GitHub has no account or organization named ${proprio}.`, `Check how ${depot} is written; if it is wrong, remove the project from the app and add it again with the repository's exact name.`, "In the app, on the project's page.");
    }
    if (jeton === "fine-grained") {
      const proprietaireDuJeton = compte === null || compte.toLowerCase() === proprio.toLowerCase() ? "" : ` (its resource owner must be ${proprio})`;
      return echec(
        "token-excludes-repository",
        `${sonJeton[0]?.toUpperCase()}${sonJeton.slice(1)} does not include ${depot}, so GitHub answers that it does not exist and ${station} cannot clone it.`,
        `Add ${depot} to the repositories of ${sonJeton}${proprietaireDuJeton}: edit the token, and select ${depot} under “Repository access”.`,
        "On GitHub, in the fine-grained tokens of the account.",
        [PAGE_DES_JETONS_FINS],
      );
    }
    return echec(
      "account-cannot-see",
      `${Qui} cannot see ${depot}: either it does not exist under this name, or ${qui} is not one of its collaborators.`,
      `Invite ${qui} as a collaborator of ${depot}; if ${depot} is not its exact name, remove the project from the app and add it again.`,
      "On GitHub, in the repository's settings.",
      [pageDesAcces(depot)],
    );
  }
  return echec("unknown", `${station} could not clone ${depot}, for a reason it does not recognise.`, `The station retries by itself; the details say what git answered — ask for help with them if it lasts.`, surLaStation);
}

export type OptionsDEnquete = { gh: string; depot: string; env?: NodeJS.ProcessEnv; delaiMs?: number };

const lancer = promisify(execFile);

// Ce que le `gh` de la station dit de son compte, de son jeton et du
// propriétaire du dépôt. Chaque question qui échoue rend null : l'enquête ne
// fait jamais échouer ce qu'elle explique.
export async function enqueter({ gh, depot, env = process.env, delaiMs = 15_000 }: OptionsDEnquete): Promise<Enquete> {
  const options = { env: { ...env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" }, timeout: delaiMs, encoding: "utf8" as const };
  const proprio = depot.split("/")[0] ?? depot;
  const [compte, jeton, proprietaire] = await Promise.all([
    lancer(gh, ["api", "user", "--jq", ".login"], options).then(
      ({ stdout }) => String(stdout).trim() || null,
      () => null,
    ),
    lancer(gh, ["auth", "token"], options).then(
      ({ stdout }) => typeDeJeton(String(stdout)),
      () => null,
    ),
    lancer(gh, ["api", `users/${proprio}`, "--silent"], options).then(
      () => true,
      (erreur: { stderr?: unknown }) => (/http 404|not found/i.test(String(erreur.stderr ?? "")) ? false : null),
    ),
  ]);
  return { compte, jeton, proprietaire };
}
