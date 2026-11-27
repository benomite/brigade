// Les cartes de TODO de la personne connectée (ticket 2761, épique 2748) : le compte GitHub que le `gh` de cet ordinateur tient
// voit les cartes qui l'attendent, et y répond par les gestes mêmes du chef — la carte reste celle que la lecture de GitHub
// donne (board/wait-of-chef.ts), seule la liste change. Celles qui attendent un autre humain du projet ne sont pas
// perdues : elles se replient sous « Awaiting others », en lecture seule, chacune avec qui elle attend (ticket 2985). La règle :
//   - une carte attend ses assignés sur GitHub ; sans assigné, elle attend le chef — `chef` de `.claude/brigade/projet.json`
//     sur la branche par défaut du dépôt, ou, sans lui, le propriétaire du dépôt — jamais une organisation (3052) ;
//   - le compte connecté voit en propre les cartes qui l'attendent, lui parmi d'autres ; les autres attendent quelqu'un
//     d'autre — le chef compris, qui voit sous « Awaiting others » les cartes assignées à un autre que lui ;
//   - un compte ou un chef qui ne se lit pas ne retire rien : la liste reste celle du chef, jamais un TODO vidé à tort.
import type { CallGitHub } from "../../board/client.ts";

export const FILE_OF_PROJECT = ".claude/brigade/projet.json";
// Le compte se relit au plus toutes les cinq minutes : un `gh api user` par lecture du rail coûterait un processus toutes
// les trente secondes, par projet.
const DURATION_OF_ACCOUNT_MS = 5 * 60_000;

// Qui regarde, et qui est le chef du projet : `null` quand on ne le sait pas.
export type Look = { login: string | null; chef: string | null };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Une carte qui attend un autre que le compte connecté, et qui elle attend : ses assignés, ou le chef.
export type WaitOfOthers<T> = { attente: T; qui: string[] };
// Les cartes partagées pour `login`, chacune dans son ordre : les siennes, et celles qui attendent un autre humain.
export type Share<T> = { siennes: T[]; autres: WaitOfOthers<T>[] };

export function shareTheCards<T extends { assignes?: readonly string[] }>(waits: readonly T[], { login, chef }: Look): Share<T> {
  if (login === null || chef === null) return { siennes: [...waits], autres: [] };
  const share: Share<T> = { siennes: [], autres: [] };
  for (const wait of waits) {
    const who = wait.assignes === undefined || wait.assignes.length === 0 ? [chef] : [...wait.assignes];
    if (who.some((expected) => same(expected, login))) share.siennes.push(wait);
    else share.autres.push({ attente: wait, qui: who });
  }
  return share;
}

// Le propriétaire du dépôt quand c'est une personne ; `organisation` pour une organisation (elle n'est pas un humain qu'on
// attend : le compte connecté est alors le chef par défaut, ticket 3052) ; `null` quand le dépôt ne se lit pas.
async function ownerHuman(call: CallGitHub, repository: string, organisation: string | null): Promise<string | null> {
  const readOne = await call(`/repos/${repository}`);
  if (readOne.status !== 200) return null;
  const owner = (readOne.data as { owner?: { login?: unknown; type?: unknown } } | null)?.owner;
  if (owner?.type === "Organization") return organisation;
  return typeof owner?.login === "string" && owner.login !== "" ? owner.login : repository.split("/")[0] || null;
}

// Le chef du projet : `chef` du fichier du projet, ou le propriétaire du dépôt quand le fichier n'en nomme pas (sauf une
// organisation : alors `parDefaut`, le compte connecté) ; `null` quand le fichier ne se lit pas — rien ne se retire sur une lecture ratée.
export async function readTheChef(call: CallGitHub, repository: string, byDefault: string | null = null): Promise<string | null> {
  try {
    const owner = () => ownerHuman(call, repository, byDefault);
    const readOne = await call(`/repos/${repository}/contents/${FILE_OF_PROJECT}`);
    if (readOne.status === 404) return await owner();
    if (readOne.status !== 200) return null;
    const content = (readOne.data as { content?: unknown } | null)?.content;
    if (typeof content !== "string") return null;
    // `atob`, pas `Buffer` : le téléphone lit ce fichier aussi, dans une WebView (read-github-phone.ts).
    const settings: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content), (sign) => sign.charCodeAt(0))));
    const chef = typeof settings === "object" && settings !== null ? (settings as { chef?: unknown }).chef : undefined;
    return typeof chef === "string" && chef.trim() !== "" ? chef.trim() : await owner();
  } catch {
    return null;
  }
}

// Le login du compte connecté, relu au plus toutes les `dureeMs` ; un compte qui ne se lit pas n'est pas retenu, la
// lecture suivante le redemande. `oublier` : après une connexion, le compte a pu changer.
export function holdTheLogin(read: () => Promise<{ login: string } | object>, options: { dureeMs?: number; maintenant?: () => number } = {}) {
  const duration = options.dureeMs ?? DURATION_OF_ACCOUNT_MS;
  const now = options.maintenant ?? Date.now;
  let held: { login: Promise<string | null>; le: number } | undefined;
  return {
    login(): Promise<string | null> {
      if (held !== undefined && now() - held.le < duration) return held.login;
      const login = read().then(
        (readOne) => ("login" in readOne && typeof readOne.login === "string" ? readOne.login : null),
        () => null,
      );
      const that = { login, le: now() };
      held = that;
      void login.then((readOne) => {
        if (readOne === null && held === that) held = undefined;
      });
      return login;
    },
    oublier() {
      held = undefined;
    },
  };
}

// Ce que la lecture de TODO passe par ici (main.ts, et le téléphone, read-github-phone.ts) : les cartes de ce qui
// attend le chef, partagées pour le compte connecté.
export function shareOfCardsAssigned({ appeler: call, depot: repository, login }: { appeler: CallGitHub; depot: string; login: () => Promise<string | null> }) {
  return async <T extends { assignes?: readonly string[] }>(waits: readonly T[]): Promise<Share<T>> => {
    const who = await login();
    if (who === null) return { siennes: [...waits], autres: [] };
    return shareTheCards(waits, { login: who, chef: await readTheChef(call, repository, who) });
  };
}
