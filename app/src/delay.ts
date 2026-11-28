// Le retard d'un clone sur son origine : l'app tourne sur le code d'un clone que
// rien d'autre ne surveille, et un clone en retard, c'est une app qui montre moins
// que ce qui est livré sans le dire. Elle le dit donc — combien de commits — pour
// son propre code, et pour le clone d'un projet quand ce clone est celui de
// brigade : en tête de « Tous les projets », avec l'heure de sa lecture.
//
// Lire n'écrit rien dans le clone. `git ls-remote` dit le commit de l'origine sans
// rien rapatrier ; si le clone ne l'a pas, les commits qui manquent sont rapatriés
// dans un dossier d'objets jetable, hors du clone (`GIT_OBJECT_DIRECTORY`), le temps
// de les compter : ni objet, ni référence, ni FETCH_HEAD n'y est posé — `git status`
// y dit après ce qu'il disait avant.
//
// Son propre code, l'app le met à jour elle-même (catch-up.ts) : à sa prochaine
// ouverture, ou tout de suite au clic sur la ligne qui dit son retard — elle se relance
// alors sur la nouvelle version. Ce module ne fait que dire ; il ne lance rien. Le clone
// d'un projet, lui, reste au chef : à la demande, l'app écrit sa commande dans un shell,
// sans l'envoyer — la règle de gestes.ts.
//
// Rien n'est veillé en continu : une lecture au démarrage, et à chaque retour à la
// fenêtre, comme pour le fichier des projets.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repositoryOf } from "./addition.ts";

// `delaiMs` : passé ce délai, une commande de `git` est arrêtée — l'origine se joint par le
// réseau. `jetable` : où se pose le dossier d'objets jetable ; le dossier temporaire du poste, sinon.
export type Settings = { git: string; delaiMs: number; jetable?: string };

// Ce qu'une lecture a obtenu d'un clone. `suivie` : la branche de l'origine que la sienne
// suit, celle que `git pull` irait chercher. `tete` : le commit sur lequel il est.
// `retard` : les commits de l'origine qu'il n'a pas ; `avance` : les siens, que l'origine n'a pas.
// Sans nombres, la raison — et ce qui s'est lu quand même.
export type Read = { racine: string; branche: string; suivie: string; tete: string; retard: number; avance: number } | { racine?: string; tete?: string; raison: string };

// Ce que `git` écrit d'une origine peut redire son adresse, et l'adresse porter un jeton.
export const withoutToken = (text: string) => text.replace(/:\/\/[^/@\s'"]+@/g, "://…@");

// Ce par quoi deux clones sont ceux d'un même dépôt : le dépôt GitHub de leur origine, quelle
// que soit l'écriture de l'adresse — sinon l'adresse elle-même.
export function identity(origin: string): string {
  const address = origin.trim();
  return repositoryOf(address)?.toLowerCase() ?? address.replace(/\/+$/, "").replace(/\.git$/, "");
}

type Rendered = { sortie: string } | { dit: string };

// Une commande de `git` dans un dossier. Jamais d'exception, et jamais de question — ni au
// terminal, ni par une fenêtre (`GIT_ASKPASS` vide, `SSH_ASKPASS_REQUIRE`) : la lecture part
// à chaque retour à la fenêtre, et une origine qui demande un mot de passe est une origine qui
// n'a pas répondu. Ce que le trousseau du poste sait déjà sert tel quel.
export function git(settings: Settings, folder: string, args: readonly string[], signal?: AbortSignal, env: NodeJS.ProcessEnv = {}): Promise<Rendered> {
  return new Promise((settle) => {
    execFile(settings.git, ["-C", folder, ...args], { windowsHide: true, timeout: settings.delaiMs, maxBuffer: 1024 * 1024, signal, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS_REQUIRE: "never", GIT_OPTIONAL_LOCKS: "0", ...env } }, (error, output, errors) => {
      if (error === null) return settle({ sortie: output.replace(/\n+$/, "") });
      const written = errors.split("\n").find((line) => line.trim() !== "")?.trim();
      settle({ dit: withoutToken(error.killed ? `stopped after ${settings.delaiMs / 1000} s, no response` : (written ?? error.message)) });
    });
  });
}

// Un dossier d'objets de plus, tel que `GIT_ALTERNATE_OBJECT_DIRECTORIES` le lit : ses
// chemins se séparent par « : », et celui qui en porte un s'écrit entre guillemets.
const alternat = (path: string) => (/^"|:/.test(path) ? `"${path.replace(/[\\"]/g, "\\$&")}"` : path);

// La branche de l'origine que suit le clone où est ce dossier — celle que `git pull` irait
// chercher —, et le commit sur lequel il est. Rien n'est écrit ; ce qui ne se lit pas est une raison.
export type Upstream = { racine: string; tete: string; branche: string; distant: string; reference: string; suivie: string } | { racine?: string; tete?: string; raison: string };
export async function readUpstream(settings: Settings, folder: string, signal?: AbortSignal): Promise<Upstream> {
  const top = await git(settings, folder, ["rev-parse", "--show-toplevel"], signal);
  if ("dit" in top) return { raison: `${folder} is not in a git clone the app can read (\`git rev-parse --show-toplevel\`: ${top.dit})` };
  const root = top.sortie;
  const commit = await git(settings, root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], signal);
  if ("dit" in commit) return { racine: root, raison: `the clone ${root} has no commit to compare with those of its origin` };
  const head = commit.sortie;
  const current = await git(settings, root, ["symbolic-ref", "--quiet", "--short", "HEAD"], signal);
  if ("dit" in current) return { racine: root, tete: head, raison: `the clone ${root} is on no branch (detached HEAD): nothing says which branch of its origin it follows` };
  const branch = current.sortie;
  const upstream = await git(settings, root, ["for-each-ref", "--format=%(upstream:remotename)%09%(upstream:remoteref)%09%(upstream:short)", `refs/heads/${branch}`], signal);
  const [distant = "", reference = "", tracked = ""] = "dit" in upstream ? [] : (upstream.sortie.split("\n")[0] ?? "").split("\t");
  // « . » : elle suit une autre branche du clone, pas une branche de l'origine.
  if (distant === "" || distant === "." || reference === "") return { racine: root, tete: head, raison: `in the clone ${root}, the branch “${branch}” follows no branch of an origin: there is nothing to compare it with` };
  return { racine: root, tete: head, branche: branch, distant, reference, suivie: tracked };
}

// Le commit de la branche suivie, tel que l'origine le dit maintenant — sans rien rapatrier.
export async function announcementOf(settings: Settings, upstream: { distant: string; reference: string; suivie: string }, root: string, signal?: AbortSignal): Promise<{ la: string } | { raison: string }> {
  const { distant, reference, suivie: tracked } = upstream;
  const announcement = await git(settings, root, ["ls-remote", distant, reference], signal);
  if ("dit" in announcement) return { raison: `the origin did not answer (\`git ls-remote ${distant} ${reference}\`): ${announcement.dit}` };
  const [, the] = /^([0-9a-f]{40,64})\t/.exec(announcement.sortie.split("\n").find((line) => line.endsWith(`\t${reference}`)) ?? "") ?? [];
  return the === undefined ? { raison: `“${tracked}” no longer exists on the origin: the clone ${root} has nothing left to follow` } : { la: the };
}

// Lit le retard du clone où est ce dossier, sur la branche de l'origine qu'il suit. Rien
// n'est écrit dans le clone ; ce qui ne se lit pas est une raison, jamais un zéro.
export async function readDelay(settings: Settings, folder: string, signal?: AbortSignal): Promise<Read> {
  const upstream = await readUpstream(settings, folder, signal);
  if ("raison" in upstream) return upstream;
  const { racine: root, tete: head, branche: branch, distant, reference, suivie: tracked } = upstream;
  const announcement = await announcementOf(settings, upstream, root, signal);
  if ("raison" in announcement) return { racine: root, tete: head, raison: announcement.raison };
  const { la: the } = announcement;
  if (the === head) return { racine: root, branche: branch, suivie: tracked, tete: head, retard: 0, avance: 0 };

  const count = async (env?: NodeJS.ProcessEnv): Promise<Read> => {
    const account = await git(settings, root, ["rev-list", "--left-right", "--count", `${head}...${the}`], signal, env);
    const [, ahead, delay] = /^(\d+)\t(\d+)$/.exec("dit" in account ? "" : account.sortie) ?? [];
    if (ahead === undefined || delay === undefined) return { racine: root, tete: head, raison: `the commits between the clone ${root} and “${tracked}” could not be counted (\`git rev-list\`)${"dit" in account ? `: ${account.dit}` : ""}` };
    return { racine: root, branche: branch, suivie: tracked, tete: head, retard: Number(delay), avance: Number(ahead) };
  };
  // Le clone a déjà ce commit — il a rapatrié sans s'y mettre, ou il est en avance : rien à rapatrier.
  if (!("dit" in (await git(settings, root, ["cat-file", "-e", `${the}^{commit}`], signal)))) return count();

  // Sinon ce qui manque est rapatrié à côté, pas dans le clone : ses objets sont lus, aucun n'y est posé.
  const lack = (said: string): Read => ({ racine: root, tete: head, raison: `the origin has commits the clone ${root} does not have, and they could not be counted (fetched outside the clone, by \`git fetch ${distant} ${reference}\`): ${said}` });
  const objects = await git(settings, root, ["rev-parse", "--git-path", "objects"], signal);
  if ("dit" in objects) return lack(objects.dit);
  let disposable: string | undefined;
  try {
    disposable = await mkdtemp(join(settings.jetable ?? tmpdir(), "brigade-retard-"));
    const env = { GIT_OBJECT_DIRECTORY: disposable, GIT_ALTERNATE_OBJECT_DIRECTORIES: alternat(resolve(root, objects.sortie)) };
    // Ni FETCH_HEAD, ni étiquette, ni branche suivie mise à jour au passage (`--refmap=`), ni
    // élagage, ni ménage — quoi que la configuration du chef demande à ses propres `git fetch`.
    const bringsHome = await git(settings, root, ["fetch", "--quiet", "--no-write-fetch-head", "--no-tags", "--no-prune", "--no-prune-tags", "--no-recurse-submodules", "--no-auto-maintenance", "--refmap=", distant, reference], signal, env);
    return "dit" in bringsHome ? lack(bringsHome.dit) : await count(env);
  } catch (error) {
    return lack(error instanceof Error ? error.message : String(error));
  } finally {
    if (disposable !== undefined) await rm(disposable, { recursive: true, force: true }).catch(() => {});
  }
}

// L'état d'un clone, tel que la vue le pose : un mot par couleur.
export type State = "a-jour" | "en-retard" | "a-relancer" | "pas-lu";
// Un clone lu. `id` : « app » pour le code de l'app, la racine du clone pour celui d'un
// projet — c'est par lui que la vue demande la commande. `tete` : son état en une ligne,
// sans l'heure. `commande` : ce qui met à jour le clone d'un projet, montré et écrit à la
// demande ; rien, tant qu'il n'est pas en retard. `bouton` : pour le code de l'app, en retard
// ou à relancer, ce que fait le clic — elle passe à la nouvelle version, sans terminal.
export type Clone = { id: string; etat: State; tete: string; lignes: string[]; commande?: string; bouton?: string };
// Ce qui se pose en tête de « Tous les projets ». `a` : l'instant de la lecture.
// `alerte` : ce que la barre en dit quel que soit l'écran — rien, tant que rien n'est périmé.
export type Seen = { a: string; clones: Clone[]; alerte?: string };

export const APP = "app";

const commits = (count: number) => `${count} commit${count > 1 ? "s" : ""}`;
// Un chemin tel que le shell du poste le rendra à `git` : entier, sans rien en exécuter.
const path = (text: string) => (/^[A-Za-z0-9@%+=:,./_-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`);





