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
import type { Project } from "./config.ts";
import { repositoryOf } from "./addition.ts";
import { CONTROL, type Terminal } from "./terminals.ts";

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
const court = (commit: string) => commit.slice(0, 7);
const named = (names: readonly string[]) => names.map((name) => `“${name}”`).join(", ");
// Un chemin tel que le shell du poste le rendra à `git` : entier, sans rien en exécuter.
const path = (text: string) => (/^[A-Za-z0-9@%+=:,./_-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`);
// La commande du chef. Elle nomme son clone : où qu'elle soit écrite, c'est lui qu'elle met à jour.
const update = (root: string) => `git -C ${path(root)} pull`;
const A_YOU = "Updating this clone is your action, at the moment you choose:";
// Ce que fait le clic, sur la ligne de l'app.
const PUT_A_DAY = "update and relaunch the app";
const RELAUNCH = "relaunch the app";
const SINON = "Without a click, it switches to the new version the next time it is opened.";

const A_RELAUNCH = "THIS APP IS RUNNING OLDER CODE THAN ITS CLONE";

// Un clone tel qu'il se pose, et ce que la barre en dit quel que soit l'écran — rien, tant qu'il n'est pas périmé.
type Says = { clone: Clone; alerte?: string };

// Ce que l'app dit de son propre code. `relance` : son clone n'est plus sur le commit de son
// lancement — de combien de commits, quand ils se comptent. `memes` : les projets dont le
// dossier est ce clone.
function tellApp(readOne: Read, relaunch: { lance: string; plus: number | undefined } | undefined, same: readonly string[]): Says {
  const also = same.length === 0 ? [] : [`It is also the clone of the project${same.length > 1 ? "s" : ""} ${named(same)}: its second reads the same code there.`];
  const rerun =
    relaunch === undefined || readOne.tete === undefined
      ? []
      : [
          `Its clone${readOne.racine === undefined ? "" : ` (${readOne.racine})`} is no longer on the commit it was launched on (${court(relaunch.lance)}, now ${court(readOne.tete)}${relaunch.plus === undefined || relaunch.plus === 0 ? "" : `: ${commits(relaunch.plus)} more`}).`,
          "It only changes code when it launches: one click relaunches it on its clone's code.",
        ];
  const aRelaunch = (suite: string[]): Says => ({ clone: { id: APP, etat: "a-relancer", tete: A_RELAUNCH, lignes: [...rerun, ...suite, ...also], bouton: RELAUNCH }, alerte: `${A_RELAUNCH.toLowerCase()}: relaunch needed` });
  if ("raison" in readOne) {
    if (rerun.length > 0) return aRelaunch([`How far this clone is behind its origin was not read: ${readOne.raison}.`]);
    return { clone: { id: APP, etat: "pas-lu", tete: "how far this app's code is behind its origin was not read", lignes: [readOne.raison, "So nothing says this code is up to date.", ...also] } };
  }
  const enAhead = readOne.avance === 0 ? [] : [`Its clone also has ${commits(readOne.avance)} that ${readOne.suivie} does not have.`];
  if (readOne.retard > 0) {
    return {
      clone: {
        id: APP,
        etat: "en-retard",
        tete: `THIS APP'S CODE IS ${commits(readOne.retard).toUpperCase()} BEHIND ${readOne.suivie}`,
        lignes: [
          "What this app shows may be out of date: what was delivered since is not in it — a screen, an action, a reading.",
          `Its clone: ${readOne.racine}, on the branch ${readOne.branche}.`,
          ...enAhead,
          // Des commits à lui : le clone ne peut pas simplement avancer, et fusionner reste au chef.
          readOne.avance === 0 ? `One click updates it and relaunches it on the new version — no terminal, nothing to copy. ${SINON}` : `It cannot simply move forward, so it does not update itself. ${A_YOU} \`${update(readOne.racine)}\`, then relaunch it: it only changes code when it launches.`,
          ...rerun,
          ...also,
        ],
        ...(readOne.avance === 0 ? { bouton: PUT_A_DAY } : { commande: update(readOne.racine) }),
      },
      alerte: `this app's code is ${commits(readOne.retard)} behind ${readOne.suivie}`,
    };
  }
  if (rerun.length > 0) return aRelaunch([`Its clone is up to date with ${readOne.suivie}.`, ...enAhead]);
  return { clone: { id: APP, etat: "a-jour", tete: `this app's code is up to date with ${readOne.suivie}`, lignes: [...enAhead, ...also] } };
}

// Ce qu'elle dit du clone d'un projet qui est un clone de brigade, sans être celui de l'app.
function tellProject(root: string, names: readonly string[], readOne: Read): Says {
  const [of, OF] = names.length > 1 ? ["of the projects", "OF THE PROJECTS"] : ["of the project", "OF THE PROJECT"];
  if ("raison" in readOne) return { clone: { id: root, etat: "pas-lu", tete: `how far the clone ${of} ${named(names)} is behind its origin was not read`, lignes: [readOne.raison, "So nothing says this clone is up to date."] } };
  const enAhead = readOne.avance === 0 ? [] : [`It also has ${commits(readOne.avance)} that ${readOne.suivie} does not have.`];
  if (readOne.retard === 0) return { clone: { id: root, etat: "a-jour", tete: `the clone ${of} ${named(names)} is up to date with ${readOne.suivie}`, lignes: enAhead } };
  const command = update(readOne.racine);
  return {
    clone: {
      id: root,
      etat: "en-retard",
      tete: `THE CLONE ${OF} ${named(names)} IS ${commits(readOne.retard).toUpperCase()} BEHIND ${readOne.suivie}`,
      lignes: [
        "It is a brigade clone, like this app's: what its second reads there — the roles, the docs, the code — may be out of date.",
        `Its clone: ${readOne.racine}, on the branch ${readOne.branche}.`,
        ...enAhead,
        `${A_YOU} \`${command}\`.`,
      ],
      commande: command,
    },
    alerte: `the clone ${of} ${named(names)} is ${commits(readOne.retard)} behind ${readOne.suivie}`,
  };
}

// Tient ce qui se dit des clones : le code de l'app, et les clones de brigade parmi les
// projets. `app` : le dossier de l'app, dans son clone — aucun pour l'app installée, qui n'en a
// pas (locations.ts) : rien ne se dit alors de son code, ni des clones de brigade, qui se
// reconnaissent à l'origine du sien. `relire` lit — au démarrage, au retour à la fenêtre, quand
// les projets changent — et rien ne lit entre deux.
export function holdDelays(options: { reglages: Settings; app: string | undefined; projets(): readonly Project[]; surLecture(seenOne: Seen): void }) {
  const { reglages: settings } = options;
  // Le commit sur lequel l'app a été lancée : celui de sa première lecture. `null` : il ne s'y est pas lu.
  let launches: string | null | undefined;
  let tenu: Seen | undefined;
  // Ce qui s'écrit pour chaque clone en retard, et les projets dont c'est le dossier.
  let writtenOnes = new Map<string, { commande: string; projets: readonly string[] }>();
  let inProgress: Promise<void> | undefined;
  let still = false;
  let closes = false;
  const stop = new AbortController();

  const rootOf = async (folder: string) => {
    const top = await git(settings, folder, ["rev-parse", "--show-toplevel"], stop.signal);
    return "dit" in top ? undefined : top.sortie;
  };
  const originOf = async (root: string) => {
    const origin = await git(settings, root, ["remote", "get-url", "origin"], stop.signal);
    return "dit" in origin || origin.sortie === "" ? undefined : identity(origin.sortie);
  };

  async function read(): Promise<void> {
    const a = new Date().toISOString();
    const app = options.app === undefined ? undefined : await readDelay(settings, options.app, stop.signal);
    if (launches === undefined) launches = app?.tete ?? null;
    let relaunch: { lance: string; plus: number | undefined } | undefined;
    if (typeof launches === "string" && app?.racine !== undefined && app.tete !== undefined && app.tete !== launches) {
      const more = await git(settings, app.racine, ["rev-list", "--count", `${launches}..${app.tete}`], stop.signal);
      relaunch = { lance: launches, plus: "dit" in more || !/^\d+$/.test(more.sortie) ? undefined : Number(more.sortie) };
    }

    // Parmi les projets qui s'ouvrent : ceux dont le dossier est le clone de l'app, et ceux
    // dont le clone a la même origine qu'elle — un clone de brigade. Les autres ne sont pas lus.
    const origin = app?.racine === undefined ? undefined : await originOf(app.racine);
    const same: string[] = [];
    const others = new Map<string, string[]>();
    for (const project of options.projets()) {
      if (project.refus !== undefined) continue;
      const root = await rootOf(project.dossier);
      if (root === undefined) continue;
      if (root === app?.racine) same.push(project.nom);
      else if (others.has(root)) others.get(root)?.push(project.nom);
      else if (origin !== undefined && (await originOf(root)) === origin) others.set(root, [project.nom]);
    }

    const saidOnes = app === undefined ? [] : [tellApp(app, relaunch, same)];
    for (const [root, names] of others) saidOnes.push(tellProject(root, names, await readDelay(settings, root, stop.signal)));
    if (closes) return;
    const clones = saidOnes.map(({ clone }) => clone);
    const alert = saidOnes.find((said) => said.alerte !== undefined)?.alerte;
    writtenOnes = new Map(clones.flatMap(({ id, commande: command }) => (command === undefined ? [] : [[id, { commande: command, projets: id === APP ? same : (others.get(id) ?? []) }]])));
    tenu = { a, clones, ...(alert === undefined ? {} : { alerte: alert }) };
    options.surLecture(tenu);
  }

  return {
    // Une lecture à la fois. Demandée pendant qu'une autre est en route — un retour à la
    // fenêtre —, elle est celle-là : rien de plus n'est lu. `apresChangement` : les projets
    // ont changé, et la lecture en route a pu lire ceux d'avant — une autre la suit, une
    // seule. Rendue quand il n'y a plus rien à lire.
    relire(afterChange = false): Promise<void> {
      if (closes) return Promise.resolve();
      if (inProgress !== undefined) {
        still ||= afterChange;
        return inProgress;
      }
      inProgress = (async () => {
        do {
          still = false;
          await read();
        } while (still && !closes);
      })().finally(() => (inProgress = undefined));
      return inProgress;
    },

    // La dernière lecture — rien, avant la première.
    vu: (): Seen | undefined => tenu,

    // Écrit la mise à jour d'un clone dans un shell, sans l'envoyer — ou dit pourquoi rien
    // n'est écrit. La vue nomme le clone, jamais une commande ; rien, pour un clone qui n'est
    // pas en retard. Un shell de l'app vit dans l'espace d'un projet : celui dont c'est le
    // dossier, sinon le premier qui s'ouvre — la commande nomme son clone.
    ecrire(terminals: { shell(project: Project, written: string): Terminal }, id: unknown): Terminal | { refus: string } | undefined {
      const written = typeof id === "string" ? writtenOnes.get(id) : undefined;
      if (written === undefined) return undefined;
      if (CONTROL.test(written.commande)) return { refus: "nothing is written: this clone's path has a control character, and a line break would have sent the command" };
      const openable = options.projets().filter((project) => project.refus === undefined);
      const space = openable.find((project) => written.projets.includes(project.nom)) ?? openable[0];
      if (space === undefined) return { refus: `nothing is written: no project opens here, and an app shell lives in a project's space — copy the command: \`${written.commande}\`` };
      return terminals.shell(space, written.commande);
    },

    // L'app se ferme : ce qui se lisait encore est arrêté, et ne dit plus rien.
    fermer(): void {
      closes = true;
      stop.abort();
    },
  };
}
