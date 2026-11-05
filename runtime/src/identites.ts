// Une identité GitHub par rôle : trois GitHub Apps — cook, pass, manager —, et
// pour chacune un jeton d'installation court, réduit au dépôt du projet et aux
// droits du rôle. Seul module qui lit une clé d'App. Un jeton ne vit qu'en
// mémoire : il n'entre ni au journal, ni dans un message d'erreur, ni dans
// l'environnement d'un cook, de gates ou d'un juge.
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ouvertADAutres } from "./droits.ts";
import { ouvrirGitHub, type GitHub } from "./github.ts";
import { retenirJeton } from "./identifiants.ts";
import { ConfigInvalide } from "./runtime.ts";

// Le reviewer n'y est pas : il n'a aucun geste GitHub — son verdict est publié
// par la pass. Les cooks non plus n'agissent pas eux-mêmes : « cook » est
// l'identité sous laquelle la station livre pour eux.
export const ROLES = ["cook", "pass", "manager"] as const;
export type Role = (typeof ROLES)[number];

// Ce que vaut le jeton de chaque rôle, et rien de plus — quoi que l'App ait
// reçu à sa création. `issues: write` permet de commenter, mais aussi de
// fermer et de labelliser : l'identité cook ne l'a pas.
export const DROITS: Record<Role, Record<string, "read" | "write">> = {
  cook: { contents: "write", pull_requests: "write" },
  pass: { contents: "write", pull_requests: "write", issues: "write", checks: "read", statuses: "read" },
  manager: { issues: "write" },
};

export type ConfigIdentites = {
  apps: Record<Role, { id: string; cle: KeyObject }>;
  // L'API de GitHub. Surchargée par les tests, jamais sur la box.
  api: string;
};

const API = "https://api.github.com";

// L'identifiant d'une App : son « App ID » (un nombre) ou son « Client ID ».
export const ID_D_APP = /^[A-Za-z0-9.]+$/;

// Le répertoire où une station garde les Apps de ses rôles, sous le sien
// (`BRIGADE_STATION_DIR`) : pour chaque rôle, `<rôle>.id` et `<rôle>.pem`. Le
// même sur toute station — la box comme le Mac du chef, où l'app les y range
// (`identites-stations.ts`). Ce répertoire en 700, chaque fichier en 600 : au
// seul compte du service. Il est à côté de l'état des projets (`etat/`), que
// la sauvegarde copie, jamais dessous, et hors de tout dépôt.
export const APPS_DE_LA_STATION = "apps-github";
export const repertoireDesApps = (station: string): string => join(resolve(station), APPS_DE_LA_STATION);

// D'où lire les Apps : `BRIGADE_GITHUB_APPS_DIR` s'il est donné — le réglage
// d'avant, sur la box —, sinon le répertoire de la station. Null : ni l'un ni
// l'autre, le runtime tourne sous l'identité unique du `gh` de la machine.
export function lieuDesApps(env: Record<string, string | undefined>): { repertoire: string; deLaStation: boolean } | null {
  if (env.BRIGADE_GITHUB_APPS_DIR) return { repertoire: env.BRIGADE_GITHUB_APPS_DIR, deLaStation: false };
  if (env.BRIGADE_STATION_DIR) return { repertoire: repertoireDesApps(env.BRIGADE_STATION_DIR), deLaStation: true };
  return null;
}

const dans = (chemin: string, parent: string): boolean => {
  const depuis = relative(parent, chemin);
  return depuis === "" || (!depuis.startsWith("..") && !isAbsolute(depuis));
};

// Ce qu'une clé ne doit jamais rejoindre : ce que la sauvegarde copie, les
// sauvegardes elles-mêmes, le dépôt du projet.
const LIEUX_INTERDITS: Array<[string, string]> = [
  ["BRIGADE_STATE_DIR", "the project's state, which backups copy"],
  ["BRIGADE_BACKUP_DIR", "the backups' destination"],
  ["BRIGADE_REPO_DIR", "the project's repository"],
];

// Pourquoi `repertoire` ne peut pas garder de clé d'App, ou null : il est sous
// l'état d'un projet, ses sauvegardes, son dépôt, ou dans un dépôt git
// quelconque — où un `git add` la publierait.
export function lieuInterdit(repertoire: string, env: Record<string, string | undefined>): string | null {
  const ici = resolve(repertoire);
  for (const [variable, quoi] of LIEUX_INTERDITS) {
    const racine = env[variable];
    if (racine && dans(ici, resolve(racine))) return `it is under ${variable} (${quoi}) — an App key never goes there`;
  }
  for (let dossier = ici; ; dossier = dirname(dossier)) {
    if (existsSync(join(dossier, ".git"))) return `it is inside the git repository "${dossier}" — an App key never goes there`;
    if (dirname(dossier) === dossier) return null;
  }
}

// Le mode du répertoire des Apps s'il laisse entrer d'autres que le compte du
// service (`755`), ou null. Sous Windows, ce sont les ACL de chaque clé qui le
// disent (`droits.ts`) : le répertoire n'a pas de bits de mode.
export function repertoireOuvert(repertoire: string): string | null {
  if (process.platform === "win32") return null;
  const mode = statSync(repertoire).mode & 0o777;
  return (mode & 0o077) === 0 ? null : mode.toString(8);
}

// Retient chaque ligne d'une clé, pour qu'aucune ne sorte jamais du runtime :
// ni au journal, ni dans journald (`masquerLaConsole`), ni dans un flux ou un
// texte publié — le masque des identifiants (`identifiants.ts`) les remplace.
// Une ligne suffit à la reconnaître, où qu'elle soit coupée.
export function retenirCle(pem: string): void {
  for (const ligne of pem.split(/\r?\n/)) {
    if (!ligne.startsWith("-----")) retenirJeton(ligne);
  }
}

const fichiersDesApps = (): string[] => ROLES.flatMap((role) => [`${role}.id`, `${role}.pem`]);

// Lit les Apps : pour chaque rôle, `<rôle>.id` et `<rôle>.pem`, dans le
// répertoire que nomme `BRIGADE_GITHUB_APPS_DIR`, sinon dans celui de la
// station. Null : aucune App — ni la variable, ni rien d'écrit dans le
// répertoire de la station —, le runtime tourne sous l'identité unique du `gh`
// de la machine. Les Apps de la station à moitié écrites, un répertoire ouvert
// à d'autres, ou rangé là où une sauvegarde ou un dépôt la prendrait : refusé.
export function configIdentites(env: Record<string, string | undefined>): ConfigIdentites | null {
  const lieu = lieuDesApps(env);
  if (lieu === null) return null;
  const { repertoire } = lieu;
  const nom = lieu.deLaStation ? "Apps GitHub de la station invalides" : "BRIGADE_GITHUB_APPS_DIR invalide";
  const refuser = (fichier: string, pourquoi: string): never => {
    throw new ConfigInvalide(`${nom} : « ${join(repertoire, fichier)} » ${pourquoi}`);
  };
  if (lieu.deLaStation) {
    if (!existsSync(repertoire)) return null;
    const presents = fichiersDesApps().filter((fichier) => existsSync(join(repertoire, fichier)));
    if (presents.length === 0) return null;
    const ouvert = repertoireOuvert(repertoire);
    if (ouvert !== null) refuser("", `est ouvert à d'autres que le compte du service (mode ${ouvert}) — il garde les clés des Apps GitHub : chmod 700`);
    const manquants = fichiersDesApps().filter((fichier) => !presents.includes(fichier));
    if (manquants.length > 0) refuser("", `ne porte pas les Apps de tous les rôles — il manque ${manquants.join(", ")} : chaque rôle (${ROLES.join(", ")}) a son App, ou aucun`);
    const interdit = lieuInterdit(repertoire, env);
    if (interdit !== null) refuser("", `ne peut pas garder de clé : ${interdit}`);
  }
  const lire = (fichier: string): string => {
    try {
      return readFileSync(join(repertoire, fichier), "utf8");
    } catch {
      return refuser(fichier, `est illisible ou absent — attendu, pour chacun des rôles ${ROLES.join(", ")} : <rôle>.id (l'identifiant de son App) et <rôle>.pem (sa clé privée)`);
    }
  };
  const apps = {} as ConfigIdentites["apps"];
  for (const role of ROLES) {
    const id = lire(`${role}.id`).trim();
    if (!ID_D_APP.test(id)) refuser(`${role}.id`, "ne porte pas un identifiant d'App — attendu son « App ID » (un nombre) ou son « Client ID »");
    const pem = lire(`${role}.pem`);
    retenirCle(pem);
    const ouvert = ouvertADAutres(join(repertoire, `${role}.pem`), "c'est la clé d'une App");
    if (ouvert !== null) refuser(`${role}.pem`, ouvert);
    let cle: KeyObject;
    try {
      cle = createPrivateKey(pem);
    } catch {
      // Sans le motif de `node:crypto` : il peut citer le fichier.
      return refuser(`${role}.pem`, "n'est pas une clé privée — attendu le fichier .pem téléchargé depuis la page de l'App");
    }
    const jumeau = ROLES.find((autre) => apps[autre]?.id === id);
    if (jumeau) {
      throw new ConfigInvalide(`${nom} : « ${jumeau} » et « ${role} » portent la même App (${id}) — une identité par rôle, donc une App par rôle`);
    }
    apps[role] = { id, cle };
  }
  return { apps, api: (env.BRIGADE_GITHUB_API_URL || API).replace(/\/+$/, "") };
}

// Le jeton d'un rôle. `frais` le redemande s'il approche de sa fin ; `courant`
// le rend sans attendre, pour un geste qui ne peut pas — et lève s'il n'y en a
// pas de vivant : c'est l'entretien, au tick, qui en garde toujours un.
export type Jeton = { frais(): Promise<string>; courant(): string };

export type Identites = {
  jeton(role: Role): Jeton;
  // Le compte sous lequel GitHub montre ce que fait le rôle : `<app>[bot]`.
  login(role: Role): Promise<string>;
  // Renouvelle les jetons qui approchent de leur fin. Ne lève jamais : un
  // échec est dit une fois, et retenté à l'appel suivant.
  entretenir(): Promise<void>;
  // Abandonne les échanges en cours.
  fermer(): void;
};

export type OptionsIdentites = ConfigIdentites & {
  // `<owner>/<repo>`
  depot: string;
  maintenant?: () => Date;
  avertir?: (message: string) => void;
  delaiMs?: number;
};

// Un jeton d'installation vit une heure. Un geste part avec dix minutes devant
// lui au moins ; l'entretien renouvelle à mi-vie, pour qu'une panne de GitHub
// d'un quart d'heure ne laisse aucun rôle sans jeton.
const MARGE_MS = 10 * 60_000;
const MARGE_COURANT_MS = 60_000;
const MARGE_ENTRETIEN_MS = 30 * 60_000;
// GitHub refuse un JWT de plus de dix minutes, ou émis dans son futur.
const JWT_AVANCE_S = 60;
const JWT_DUREE_S = 540;

const base64 = (valeur: string | Buffer): string => Buffer.from(valeur).toString("base64url");

export function ouvrirIdentites(options: OptionsIdentites): Identites {
  const { apps, api, depot } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const abandon = new AbortController();

  const jwt = (role: Role): string => {
    const secondes = Math.floor(maintenant().getTime() / 1000);
    const corps = `${base64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64(JSON.stringify({ iat: secondes - JWT_AVANCE_S, exp: secondes + JWT_DUREE_S, iss: apps[role].id }))}`;
    return `${corps}.${base64(sign("RSA-SHA256", Buffer.from(corps), apps[role].cle))}`;
  };

  // Une requête au nom de l'App. Rien de ce qui part — ni de ce qui revient,
  // hors le `message` de GitHub — n'entre dans l'erreur.
  const demander = async (role: Role, methode: "GET" | "POST", chemin: string, corps?: unknown): Promise<{ statut: number; corps: Record<string, unknown> }> => {
    let reponse: Response;
    try {
      reponse = await fetch(`${api}${chemin}`, {
        method: methode,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${jwt(role)}`,
          "x-github-api-version": "2022-11-28",
          ...(corps === undefined ? {} : { "content-type": "application/json" }),
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
        signal: AbortSignal.any([abandon.signal, AbortSignal.timeout(options.delaiMs ?? 30_000)]),
      });
    } catch (erreur) {
      throw new Error(`identité « ${role} » : GitHub injoignable (${methode} ${chemin}) — ${erreur instanceof Error ? (erreur.cause instanceof Error ? erreur.cause.message : erreur.message) : "échec"}`);
    }
    let lu: unknown = null;
    try {
      lu = await reponse.json();
    } catch {}
    return { statut: reponse.status, corps: lu !== null && typeof lu === "object" ? (lu as Record<string, unknown>) : {} };
  };
  const refus = (role: Role, quoi: string, reponse: { statut: number; corps: Record<string, unknown> }): Error =>
    new Error(`identité « ${role} » : ${quoi} — HTTP ${reponse.statut}${typeof reponse.corps.message === "string" ? ` (${reponse.corps.message})` : ""}`);

  const installations = new Map<Role, number>();
  const installation = async (role: Role): Promise<number> => {
    const connue = installations.get(role);
    if (connue !== undefined) return connue;
    const reponse = await demander(role, "GET", `/repos/${depot}/installation`);
    if (reponse.statut === 404) throw new Error(`identité « ${role} » : son App (${apps[role].id}) n'est pas installée sur ${depot}`);
    if (reponse.statut !== 200 || !Number.isSafeInteger(reponse.corps.id)) throw refus(role, `installation de son App sur ${depot} illisible`, reponse);
    installations.set(role, reponse.corps.id as number);
    return reponse.corps.id as number;
  };

  const vivants = new Map<Role, { jeton: string; fin: number }>();
  const enCours = new Map<Role, Promise<string>>();
  const echanger = (role: Role): Promise<string> => {
    const deja = enCours.get(role);
    if (deja) return deja;
    const echange = (async () => {
      const reponse = await demander(role, "POST", `/app/installations/${await installation(role)}/access_tokens`, {
        repositories: [depot.split("/")[1]],
        permissions: DROITS[role],
      });
      // L'App a pu être désinstallée puis réinstallée : son installation se relit.
      if (reponse.statut === 404) installations.delete(role);
      const { token, expires_at } = reponse.corps;
      const fin = typeof expires_at === "string" ? Date.parse(expires_at) : NaN;
      if (reponse.statut !== 201 || typeof token !== "string" || token === "" || Number.isNaN(fin)) throw refus(role, `jeton refusé pour ${depot}`, reponse);
      vivants.set(role, { jeton: token, fin });
      return token;
    })().finally(() => enCours.delete(role));
    enCours.set(role, echange);
    return echange;
  };
  const reste = (role: Role): number => (vivants.get(role)?.fin ?? -Infinity) - maintenant().getTime();

  const logins = new Map<Role, string>();
  const enPanne = new Set<Role>();

  return {
    jeton: (role) => ({
      frais: async () => (reste(role) > MARGE_MS ? (vivants.get(role)?.jeton ?? echanger(role)) : echanger(role)),
      courant() {
        const vivant = vivants.get(role);
        if (!vivant || reste(role) <= MARGE_COURANT_MS) throw new Error(`jeton de l'identité « ${role} » indisponible : GitHub n'en a rendu aucun qui vive encore`);
        return vivant.jeton;
      },
    }),
    async login(role) {
      const connu = logins.get(role);
      if (connu !== undefined) return connu;
      const reponse = await demander(role, "GET", "/app");
      if (reponse.statut !== 200 || typeof reponse.corps.slug !== "string" || reponse.corps.slug === "") throw refus(role, "App illisible", reponse);
      const login = `${reponse.corps.slug}[bot]`;
      logins.set(role, login);
      return login;
    },
    async entretenir() {
      await Promise.all(
        ROLES.filter((role) => reste(role) <= MARGE_ENTRETIEN_MS).map(async (role) => {
          try {
            await echanger(role);
            enPanne.delete(role);
          } catch (erreur) {
            if (abandon.signal.aborted || enPanne.has(role)) return;
            enPanne.add(role);
            avertir(`brigade : ${erreur instanceof Error ? erreur.message : String(erreur)} — retenté à chaque tick`);
          }
        }),
      );
    },
    fermer: () => abandon.abort(),
  };
}

// Les variables par lesquelles `gh` s'authentifierait sans passer par la
// connexion du compte.
export const VARIABLES_GITHUB = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"];

// L'environnement dont partent les cooks, les gates et les juges quand chaque
// rôle a son identité : aucun jeton GitHub, un `gh` qui ne trouve pas la
// connexion du compte (`repertoireVide`), un `git` qui ne demande rien. Une
// propreté, pas une clôture : ces process tournent sous le compte du runtime.
export function environnementSansGitHub(env: NodeJS.ProcessEnv, repertoireVide: string): NodeJS.ProcessEnv {
  const garde = Object.entries(env).filter(([nom]) => !VARIABLES_GITHUB.includes(nom));
  return { ...Object.fromEntries(garde), GH_CONFIG_DIR: repertoireVide, GIT_TERMINAL_PROMPT: "0" };
}

// Le GitHub de chaque module du runtime. Sans identités, un seul pour tous :
// le `gh` de la machine. Avec, chacun agit sous celle de son rôle — et deux
// gestes changent de mains : ce que la station dit et lit sur l'issue passe
// sous l'identité du manager (l'identité cook n'a aucun droit sur les issues),
// et la PR que la pass ouvre pour une livraison restée sans PR est celle d'un
// cook.
export type GitHubs = { rail: GitHub; station: GitHub; pass: GitHub; manager: GitHub; fermer(): void };

export function ouvrirGitHubs(options: { depot: string; bin?: string; identites: Identites | null }): GitHubs {
  const { depot, bin, identites } = options;
  if (identites === null) {
    const unique = ouvrirGitHub({ depot, bin });
    return { rail: unique, station: unique, pass: unique, manager: unique, fermer: unique.fermer };
  }
  const [cook, pass, manager] = ROLES.map((role) => ouvrirGitHub({ depot, bin, jeton: identites.jeton(role).frais, identite: () => identites.login(role), compte: role })) as [GitHub, GitHub, GitHub];
  const fermer = () => {
    for (const github of [cook, pass, manager]) github.fermer();
  };
  return {
    rail: { ...manager, fermer },
    manager: { ...manager, fermer },
    station: { ...cook, commenter: manager.commenter, issue: manager.issue, commentaires: manager.commentaires, fermer },
    pass: { ...pass, ouvrirPR: cook.ouvrirPR, fermer },
    fermer,
  };
}
