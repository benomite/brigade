// Le réseau d'un projet : la liste blanche de ce qu'il joint — Anthropic,
// GitHub, et ce que son dépôt déclare —, et de quoi faire passer par la porte
// tout ce que le runtime lance. La porte elle-même est dans `porte.ts` ; ce
// qui refuse une connexion qui la contourne est l'unité systemd, pas ce code.
import { setGlobalProxyFromEnv } from "node:http";
import { connect } from "node:net";
import type { Fait } from "./evenements.ts";
import { lire } from "./plafonds.ts";
import type { Runtime } from "./runtime.ts";

// Ce que le dépôt du projet déclare : un hôte par ligne.
export const DECLARATION_RESEAU = ".claude/brigade/reseau";

export type Origine = "anthropic" | "github" | "project";

// `port` nul : 443 et 80. `sousDomaines` : l'hôte et tout ce qui est sous lui.
export type Regle = { hote: string; sousDomaines: boolean; port: number | null; origine: Origine };

const PORTS_PAR_DEFAUT = [443, 80];

const domaines = (origine: Origine, ...hotes: string[]): Regle[] => hotes.map((hote) => ({ hote, sousDomaines: true, port: null, origine }));

// Ce sans quoi aucun cook ne travaille. Aucun registre de paquets : ceux du
// projet sont ceux qu'il nomme.
export const REGLES_DE_BASE: Regle[] = [...domaines("anthropic", "anthropic.com", "claude.ai", "claude.com"), ...domaines("github", "github.com", "githubusercontent.com")];

export const POURQUOI: Record<Origine, string> = {
  anthropic: "Anthropic — le modèle, par la connexion Max",
  github: "GitHub — le dépôt, les issues, les archives",
  project: `déclaré par le dépôt (\`${DECLARATION_RESEAU}\`)`,
};

// Un nom d'hôte, un `*.` devant pour ses sous-domaines, un port derrière pour
// autre chose que 443 et 80. Deux labels au moins : `*.com` ouvrirait un bout
// d'Internet, pas un hôte du projet. Jamais une adresse : le dernier label
// commence par une lettre.
const HOTE = /^(\*\.)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?)(?::([1-9][0-9]{0,4}))?$/;

function regleDe(ligne: string): Regle | string {
  const [, etoile, hote, port] = HOTE.exec(ligne) ?? [];
  if (hote === undefined) return "ce n'est pas un hôte — attendu un nom (registry.npmjs.org), `*.` devant pour ses sous-domaines, `:port` derrière pour un autre port que 443 et 80 ; jamais une adresse";
  if (port !== undefined && Number(port) > 65535) return "ce port n'existe pas";
  return { hote, sousDomaines: etoile !== undefined, port: port === undefined ? null : Number(port), origine: "project" };
}

// Lit la déclaration du dépôt. `hotes` : les lignes qui ouvrent quelque chose,
// telles qu'elles s'écrivent ; `problemes` : celles qui n'ouvrent rien.
export function lireDeclaration(texte: string): { hotes: string[]; problemes: string[] } {
  const hotes: string[] = [];
  const problemes: string[] = [];
  texte.split("\n").forEach((brute, rang) => {
    const ligne = brute.trim().toLowerCase();
    if (ligne === "" || ligne.startsWith("#") || hotes.includes(ligne)) return;
    const regle = regleDe(ligne);
    if (typeof regle === "string") problemes.push(`ligne ${rang + 1} de \`${DECLARATION_RESEAU}\` (« ${brute.trim().slice(0, 80)} ») : ${regle}`);
    else hotes.push(ligne);
  });
  return { hotes, problemes };
}

// La liste blanche d'un projet : le socle, puis ce que son dépôt déclare.
export function reglesDuProjet(hotes: string[]): Regle[] {
  return [...REGLES_DE_BASE, ...hotes.map(regleDe).filter((regle) => typeof regle !== "string")];
}

export function autorise(regles: Regle[], hote: string, port: number): boolean {
  const vise = hote.toLowerCase().replace(/\.$/, "");
  return regles.some(
    (regle) => (vise === regle.hote || (regle.sousDomaines && vise.endsWith(`.${regle.hote}`))) && (regle.port === null ? PORTS_PAR_DEFAUT.includes(port) : regle.port === port),
  );
}

export const direRegle = (regle: Regle) => `${regle.hote}${regle.sousDomaines ? " et ses sous-domaines" : ""}${regle.port === null ? "" : `, port ${regle.port}`}`;

// Lit `BRIGADE_PROXY_PORT` : le port de la porte du projet, sur la boucle
// locale. Sans la variable, null : le réseau est ouvert, et le runtime le dit.
export function configReseau(env: NodeJS.ProcessEnv): number | null {
  const port = lire(env, "BRIGADE_PROXY_PORT", 0, "un port, de 1 à 65535", (valeur) => Number.isSafeInteger(valeur) && valeur >= 1 && valeur <= 65535);
  return port === 0 ? null : port;
}

// Ce qui fait passer un process par la porte : `claude`, `git`, `gh`, `npm`,
// `curl` et Node lisent ces variables. La boucle locale n'y passe pas — les
// ports que le setup exporte se joignent directement.
export function variablesDeRelais(port: number): Record<string, string> {
  const porte = `http://127.0.0.1:${port}`;
  const directs = "localhost,127.0.0.1,::1";
  return { HTTPS_PROXY: porte, HTTP_PROXY: porte, https_proxy: porte, http_proxy: porte, NO_PROXY: directs, no_proxy: directs, NODE_USE_ENV_PROXY: "1" };
}

// Fait passer le runtime lui-même par la porte, et tout ce qu'il lancera :
// ses enfants héritent de son environnement.
export function passerParLaPorte(port: number): void {
  Object.assign(process.env, variablesDeRelais(port));
  setGlobalProxyFromEnv();
}

// Une adresse que personne ne porte (TEST-NET-1) : aucune connexion n'y
// aboutit, et seul un filtre la refuse sur-le-champ.
const NULLE_PART = { host: "192.0.2.1", port: 443 };
const DELAI_DE_SONDE_MS = 2000;

// L'unité refuse-t-elle une connexion qui contourne la porte ? Vrai : le
// noyau l'a refusée. Faux : elle est partie. Null : la machine n'a aucune
// route, rien ne se prouve.
export function sonderLeFiltre(connecter: typeof connect = connect): Promise<boolean | null> {
  return new Promise((resoudre) => {
    const prise = connecter(NULLE_PART);
    const rendre = (verdict: boolean | null) => {
      prise.destroy();
      resoudre(verdict);
    };
    prise.setTimeout(DELAI_DE_SONDE_MS, () => rendre(false));
    prise.once("connect", () => rendre(false));
    prise.once("error", (erreur: NodeJS.ErrnoException) => rendre(erreur.code === "EPERM" || erreur.code === "EACCES" ? true : erreur.code === "ENETUNREACH" || erreur.code === "EHOSTUNREACH" ? null : false));
  });
}

const AUTEUR = "runtime";

// Publie au journal ce que le dépôt déclare sur sa branche d'intégration, au
// démarrage puis à chaque tick, quand cela change : la porte lit sa liste là,
// et le chef aussi. `declaration` : le fichier tel que la base le porte, ou
// null.
export function brancherReseau(runtime: Runtime, options: { base: string; declaration: () => string | null; avertir?: (message: string) => void }): void {
  const { journal, projet } = runtime;
  const avertir = options.avertir ?? ((message: string) => console.error(message));
  const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
  const publier = () => {
    try {
      const { hotes, problemes } = lireDeclaration(options.declaration() ?? "");
      const declare = { base: options.base, hosts: hotes, problems: problemes };
      journal.base.transaction(() => {
        const dernier = journal.duType("network.declared", 1)[0]?.payload ?? { base: options.base, hosts: [], problems: [] };
        if (JSON.stringify(dernier) !== JSON.stringify(declare)) noter({ type: "network.declared", payload: declare });
      });
    } catch (erreur) {
      avertir(`brigade : liste blanche du réseau non publiée — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  publier();
  runtime.surReveil((cause) => void (cause === "tick" && publier()));
}
