// Les cartes de TODO de la personne connectée (#2761, épique #2748) : le compte GitHub que le `gh` de cet ordinateur tient
// voit les cartes qui lui sont assignées sur GitHub, et y répond par les gestes mêmes du chef — la carte reste celle que
// la lecture de GitHub donne (tableau/attente-du-chef.ts), seule la liste change. La règle :
//   - le chef — `chef` de `.claude/brigade/projet.json` sur la branche par défaut du dépôt, ou, sans lui, le propriétaire du
//     dépôt — voit ce qu'il voyait : toutes les cartes, assignées ou non ;
//   - un autre humain ne voit que les cartes dont il est l'un des assignés : ni celles du chef, ni celles d'un autre ;
//   - un compte ou un chef qui ne se lit pas ne retire rien : la liste reste celle du chef, jamais un TODO vidé à tort.
import type { AppelGitHub } from "../../tableau/client.ts";

export const FICHIER_DU_PROJET = ".claude/brigade/projet.json";
// Le compte se relit au plus toutes les cinq minutes : un `gh api user` par lecture du rail coûterait un processus toutes
// les trente secondes, par projet.
const DUREE_DU_COMPTE_MS = 5 * 60_000;

// Qui regarde, et qui est le chef du projet : `null` quand on ne le sait pas.
export type Regard = { login: string | null; chef: string | null };

const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Les cartes que `login` voit, dans leur ordre : toutes pour le chef, celles qui lui sont assignées pour un autre.
export function cartesAssignees<T extends { assignes?: readonly string[] }>(attentes: readonly T[], { login, chef }: Regard): T[] {
  if (login === null || chef === null || meme(login, chef)) return [...attentes];
  return attentes.filter(({ assignes }) => (assignes ?? []).some((assigne) => meme(assigne, login)));
}

// Le chef du projet : `chef` du fichier du projet, ou le propriétaire du dépôt quand le fichier n'en nomme pas ; `null`
// quand le fichier ne se lit pas — rien ne se retire sur une lecture ratée.
export async function lireLeChef(appeler: AppelGitHub, depot: string): Promise<string | null> {
  const proprietaire = depot.split("/")[0] || null;
  try {
    const lu = await appeler(`/repos/${depot}/contents/${FICHIER_DU_PROJET}`);
    if (lu.status === 404) return proprietaire;
    if (lu.status !== 200) return null;
    const contenu = (lu.data as { content?: unknown } | null)?.content;
    if (typeof contenu !== "string") return null;
    const reglages: unknown = JSON.parse(Buffer.from(contenu, "base64").toString("utf8"));
    const chef = typeof reglages === "object" && reglages !== null ? (reglages as { chef?: unknown }).chef : undefined;
    return typeof chef === "string" && chef.trim() !== "" ? chef.trim() : proprietaire;
  } catch {
    return null;
  }
}

// Le login du compte connecté, relu au plus toutes les `dureeMs` ; un compte qui ne se lit pas n'est pas retenu, la
// lecture suivante le redemande. `oublier` : après une connexion, le compte a pu changer.
export function tenirLeLogin(lire: () => Promise<{ login: string } | object>, options: { dureeMs?: number; maintenant?: () => number } = {}) {
  const duree = options.dureeMs ?? DUREE_DU_COMPTE_MS;
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

// Ce que la lecture de TODO passe par ici (main.ts) : les cartes de ce qui attend le chef, réduites à celles du compte
// connecté.
export function filtreDesCartesAssignees({ appeler, depot, login }: { appeler: AppelGitHub; depot: string; login: () => Promise<string | null> }) {
  return async <T extends { assignes?: readonly string[] }>(attentes: readonly T[]): Promise<T[]> => {
    const qui = await login();
    if (qui === null) return [...attentes];
    return cartesAssignees(attentes, { login: qui, chef: await lireLeChef(appeler, depot) });
  };
}
