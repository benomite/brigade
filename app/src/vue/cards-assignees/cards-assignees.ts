// Les cartes de TODO de la personne connectée (ticket 2761, épique 2748) : le compte GitHub que le `gh` de cet ordinateur tient
// voit les cartes qui l'attendent, et y répond par les gestes mêmes du chef — la carte reste celle que la lecture de GitHub
// donne (tableau/wait-du-chef.ts), seule la liste change. Celles qui attendent un autre humain du projet ne sont pas
// perdues : elles se replient sous « Awaiting others », en lecture seule, chacune avec qui elle attend (ticket 2985). La règle :
//   - une carte attend ses assignés sur GitHub ; sans assigné, elle attend le chef — `chef` de `.claude/brigade/projet.json`
//     sur la branche par défaut du dépôt, ou, sans lui, le propriétaire du dépôt — jamais une organisation (3052) ;
//   - le compte connecté voit en propre les cartes qui l'attendent, lui parmi d'autres ; les autres attendent quelqu'un
//     d'autre — le chef compris, qui voit sous « Awaiting others » les cartes assignées à un autre que lui ;
//   - un compte ou un chef qui ne se lit pas ne retire rien : la liste reste celle du chef, jamais un TODO vidé à tort.
import type { CallGitHub } from "../../tableau/client.ts";

export const FICHIER_DU_PROJECT = ".claude/brigade/projet.json";
// Le compte se relit au plus toutes les cinq minutes : un `gh api user` par lecture du rail coûterait un processus toutes
// les trente secondes, par projet.
const DUREE_DU_ACCOUNT_MS = 5 * 60_000;

// Qui regarde, et qui est le chef du projet : `null` quand on ne le sait pas.
export type Regard = { login: string | null; chef: string | null };

const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Une carte qui attend un autre que le compte connecté, et qui elle attend : ses assignés, ou le chef.
export type WaitDAutrui<T> = { attente: T; qui: string[] };
// Les cartes partagées pour `login`, chacune dans son ordre : les siennes, et celles qui attendent un autre humain.
export type Partage<T> = { siennes: T[]; autres: WaitDAutrui<T>[] };

export function partagerLesCards<T extends { assignes?: readonly string[] }>(attentes: readonly T[], { login, chef }: Regard): Partage<T> {
  if (login === null || chef === null) return { siennes: [...attentes], autres: [] };
  const partage: Partage<T> = { siennes: [], autres: [] };
  for (const wait of attentes) {
    const qui = wait.assignes === undefined || wait.assignes.length === 0 ? [chef] : [...wait.assignes];
    if (qui.some((attendu) => meme(attendu, login))) partage.siennes.push(wait);
    else partage.autres.push({ attente: wait, qui });
  }
  return partage;
}

// Le propriétaire du dépôt quand c'est une personne ; `organisation` pour une organisation (elle n'est pas un humain qu'on
// attend : le compte connecté est alors le chef par défaut, ticket 3052) ; `null` quand le dépôt ne se lit pas.
async function proprietaireHuman(appeler: CallGitHub, repository: string, organisation: string | null): Promise<string | null> {
  const lu = await appeler(`/repos/${repository}`);
  if (lu.status !== 200) return null;
  const proprietaire = (lu.data as { owner?: { login?: unknown; type?: unknown } } | null)?.owner;
  if (proprietaire?.type === "Organization") return organisation;
  return typeof proprietaire?.login === "string" && proprietaire.login !== "" ? proprietaire.login : repository.split("/")[0] || null;
}

// Le chef du projet : `chef` du fichier du projet, ou le propriétaire du dépôt quand le fichier n'en nomme pas (sauf une
// organisation : alors `parDefaut`, le compte connecté) ; `null` quand le fichier ne se lit pas — rien ne se retire sur une lecture ratée.
export async function lireLeChef(appeler: CallGitHub, repository: string, parDefaut: string | null = null): Promise<string | null> {
  try {
    const proprietaire = () => proprietaireHuman(appeler, repository, parDefaut);
    const lu = await appeler(`/repos/${repository}/contents/${FICHIER_DU_PROJECT}`);
    if (lu.status === 404) return await proprietaire();
    if (lu.status !== 200) return null;
    const contenu = (lu.data as { content?: unknown } | null)?.content;
    if (typeof contenu !== "string") return null;
    // `atob`, pas `Buffer` : le téléphone lit ce fichier aussi, dans une WebView (read-github-phone.ts).
    const settings: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(contenu), (signe) => signe.charCodeAt(0))));
    const chef = typeof settings === "object" && settings !== null ? (settings as { chef?: unknown }).chef : undefined;
    return typeof chef === "string" && chef.trim() !== "" ? chef.trim() : await proprietaire();
  } catch {
    return null;
  }
}

// Le login du compte connecté, relu au plus toutes les `dureeMs` ; un compte qui ne se lit pas n'est pas retenu, la
// lecture suivante le redemande. `oublier` : après une connexion, le compte a pu changer.
export function holdLeLogin(lire: () => Promise<{ login: string } | object>, options: { dureeMs?: number; maintenant?: () => number } = {}) {
  const duree = options.dureeMs ?? DUREE_DU_ACCOUNT_MS;
  const maintenant = options.maintenant ?? Date.now;
  let tenu: { login: Promise<string | null>; le: number } | undefined;
  return {
    login(): Promise<string | null> {
      if (tenu !== undefined && maintenant() - tenu.le < duree) return tenu.login;
      const login = lire().then(
        (lu) => ("login" in lu && typeof lu.login === "string" ? lu.login : null),
        () => null,
      );
      const ce = { login, le: maintenant() };
      tenu = ce;
      void login.then((lu) => {
        if (lu === null && tenu === ce) tenu = undefined;
      });
      return login;
    },
    oublier() {
      tenu = undefined;
    },
  };
}

// Ce que la lecture de TODO passe par ici (main.ts, et le téléphone, read-github-phone.ts) : les cartes de ce qui
// attend le chef, partagées pour le compte connecté.
export function partageDesCardsAssignees({ appeler, depot: repository, login }: { appeler: CallGitHub; depot: string; login: () => Promise<string | null> }) {
  return async <T extends { assignes?: readonly string[] }>(attentes: readonly T[]): Promise<Partage<T>> => {
    const qui = await login();
    if (qui === null) return { siennes: [...attentes], autres: [] };
    return partagerLesCards(attentes, { login: qui, chef: await lireLeChef(appeler, repository, qui) });
  };
}
