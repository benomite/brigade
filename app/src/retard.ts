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
// Et l'app ne met rien à jour : `git pull` dans un clone est un geste du chef, et
// elle ne change de code qu'à son lancement. À la demande, elle écrit la commande
// dans un shell, sans l'envoyer — la règle de gestes.ts.
//
// Rien n'est veillé en continu : une lecture au démarrage, et à chaque retour à la
// fenêtre, comme pour le fichier des projets.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Projet } from "./config.ts";
import { depotDe } from "./installation.ts";
import { CONTROLE, type Terminal } from "./terminaux.ts";

// `delaiMs` : passé ce délai, une commande de `git` est arrêtée — l'origine se joint par le
// réseau. `jetable` : où se pose le dossier d'objets jetable ; le dossier temporaire du poste, sinon.
export type Reglages = { git: string; delaiMs: number; jetable?: string };

// Ce qu'une lecture a obtenu d'un clone. `suivie` : la branche de l'origine que la sienne
// suit, celle que `git pull` irait chercher. `tete` : le commit sur lequel il est.
// `retard` : les commits de l'origine qu'il n'a pas ; `avance` : les siens, que l'origine n'a pas.
// Sans nombres, la raison — et ce qui s'est lu quand même.
export type Lu = { racine: string; branche: string; suivie: string; tete: string; retard: number; avance: number } | { racine?: string; tete?: string; raison: string };

// Ce que `git` écrit d'une origine peut redire son adresse, et l'adresse porter un jeton.
export const sansJeton = (texte: string) => texte.replace(/:\/\/[^/@\s'"]+@/g, "://…@");

// Ce par quoi deux clones sont ceux d'un même dépôt : le dépôt GitHub de leur origine, quelle
// que soit l'écriture de l'adresse — sinon l'adresse elle-même.
export function identite(origine: string): string {
  const adresse = origine.trim();
  return depotDe(adresse)?.toLowerCase() ?? adresse.replace(/\/+$/, "").replace(/\.git$/, "");
}

type Rendu = { sortie: string } | { dit: string };

// Une commande de `git` dans un dossier. Jamais d'exception, et jamais de question — ni au
// terminal, ni par une fenêtre (`GIT_ASKPASS` vide, `SSH_ASKPASS_REQUIRE`) : la lecture part
// à chaque retour à la fenêtre, et une origine qui demande un mot de passe est une origine qui
// n'a pas répondu. Ce que le trousseau ou l'agent `ssh` du poste savent déjà sert tel quel.
function git(reglages: Reglages, dossier: string, args: readonly string[], signal?: AbortSignal, env: NodeJS.ProcessEnv = {}): Promise<Rendu> {
  return new Promise((resoudre) => {
    execFile(reglages.git, ["-C", dossier, ...args], { timeout: reglages.delaiMs, maxBuffer: 1024 * 1024, signal, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS_REQUIRE: "never", GIT_OPTIONAL_LOCKS: "0", ...env } }, (erreur, sortie, erreurs) => {
      if (erreur === null) return resoudre({ sortie: sortie.replace(/\n+$/, "") });
      const ecrit = erreurs.split("\n").find((ligne) => ligne.trim() !== "")?.trim();
      resoudre({ dit: sansJeton(erreur.killed ? `stopped after ${reglages.delaiMs / 1000} s, no response` : (ecrit ?? erreur.message)) });
    });
  });
}

// Un dossier d'objets de plus, tel que `GIT_ALTERNATE_OBJECT_DIRECTORIES` le lit : ses
// chemins se séparent par « : », et celui qui en porte un s'écrit entre guillemets.
const alternat = (chemin: string) => (/^"|:/.test(chemin) ? `"${chemin.replace(/[\\"]/g, "\\$&")}"` : chemin);

// Lit le retard du clone où est ce dossier, sur la branche de l'origine qu'il suit. Rien
// n'est écrit dans le clone ; ce qui ne se lit pas est une raison, jamais un zéro.
export async function lireRetard(reglages: Reglages, dossier: string, signal?: AbortSignal): Promise<Lu> {
  const sommet = await git(reglages, dossier, ["rev-parse", "--show-toplevel"], signal);
  if ("dit" in sommet) return { raison: `${dossier} is not in a git clone the app can read (\`git rev-parse --show-toplevel\`: ${sommet.dit})` };
  const racine = sommet.sortie;
  const commit = await git(reglages, racine, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], signal);
  if ("dit" in commit) return { racine, raison: `the clone ${racine} has no commit to compare with those of its origin` };
  const tete = commit.sortie;
  const courante = await git(reglages, racine, ["symbolic-ref", "--quiet", "--short", "HEAD"], signal);
  if ("dit" in courante) return { racine, tete, raison: `the clone ${racine} is on no branch (detached HEAD): nothing says which branch of its origin it follows` };
  const branche = courante.sortie;
  const amont = await git(reglages, racine, ["for-each-ref", "--format=%(upstream:remotename)%09%(upstream:remoteref)%09%(upstream:short)", `refs/heads/${branche}`], signal);
  const [distant = "", reference = "", suivie = ""] = "dit" in amont ? [] : (amont.sortie.split("\n")[0] ?? "").split("\t");
  // « . » : elle suit une autre branche du clone, pas une branche de l'origine.
  if (distant === "" || distant === "." || reference === "") return { racine, tete, raison: `in the clone ${racine}, the branch “${branche}” follows no branch of an origin: there is nothing to compare it with` };

  const annonce = await git(reglages, racine, ["ls-remote", distant, reference], signal);
  if ("dit" in annonce) return { racine, tete, raison: `the origin did not answer (\`git ls-remote ${distant} ${reference}\`): ${annonce.dit}` };
  const [, la] = /^([0-9a-f]{40,64})\t/.exec(annonce.sortie.split("\n").find((ligne) => ligne.endsWith(`\t${reference}`)) ?? "") ?? [];
  if (la === undefined) return { racine, tete, raison: `“${suivie}” no longer exists on the origin: the branch “${branche}” of the clone ${racine} has nothing left to follow` };
  if (la === tete) return { racine, branche, suivie, tete, retard: 0, avance: 0 };

  const compter = async (env?: NodeJS.ProcessEnv): Promise<Lu> => {
    const compte = await git(reglages, racine, ["rev-list", "--left-right", "--count", `${tete}...${la}`], signal, env);
    const [, avance, retard] = /^(\d+)\t(\d+)$/.exec("dit" in compte ? "" : compte.sortie) ?? [];
    if (avance === undefined || retard === undefined) return { racine, tete, raison: `the commits between the clone ${racine} and “${suivie}” could not be counted (\`git rev-list\`)${"dit" in compte ? `: ${compte.dit}` : ""}` };
    return { racine, branche, suivie, tete, retard: Number(retard), avance: Number(avance) };
  };
  // Le clone a déjà ce commit — il a rapatrié sans s'y mettre, ou il est en avance : rien à rapatrier.
  if (!("dit" in (await git(reglages, racine, ["cat-file", "-e", `${la}^{commit}`], signal)))) return compter();

  // Sinon ce qui manque est rapatrié à côté, pas dans le clone : ses objets sont lus, aucun n'y est posé.
  const manque = (dit: string): Lu => ({ racine, tete, raison: `the origin has commits the clone ${racine} does not have, and they could not be counted (fetched outside the clone, by \`git fetch ${distant} ${reference}\`): ${dit}` });
  const objets = await git(reglages, racine, ["rev-parse", "--git-path", "objects"], signal);
  if ("dit" in objets) return manque(objets.dit);
  let jetable: string | undefined;
  try {
    jetable = await mkdtemp(join(reglages.jetable ?? tmpdir(), "brigade-retard-"));
    const env = { GIT_OBJECT_DIRECTORY: jetable, GIT_ALTERNATE_OBJECT_DIRECTORIES: alternat(resolve(racine, objets.sortie)) };
    // Ni FETCH_HEAD, ni étiquette, ni branche suivie mise à jour au passage (`--refmap=`), ni
    // élagage, ni ménage — quoi que la configuration du chef demande à ses propres `git fetch`.
    const rapatrie = await git(reglages, racine, ["fetch", "--quiet", "--no-write-fetch-head", "--no-tags", "--no-prune", "--no-prune-tags", "--no-recurse-submodules", "--no-auto-maintenance", "--refmap=", distant, reference], signal, env);
    return "dit" in rapatrie ? manque(rapatrie.dit) : await compter(env);
  } catch (erreur) {
    return manque(erreur instanceof Error ? erreur.message : String(erreur));
  } finally {
    if (jetable !== undefined) await rm(jetable, { recursive: true, force: true }).catch(() => {});
  }
}

// L'état d'un clone, tel que la vue le pose : un mot par couleur.
export type Etat = "a-jour" | "en-retard" | "a-relancer" | "pas-lu";
// Un clone lu. `id` : « app » pour le code de l'app, la racine du clone pour celui d'un
// projet — c'est par lui que la vue demande la commande. `tete` : son état en une ligne,
// sans l'heure. `commande` : ce qui le met à jour, montré et écrit à la demande ; rien,
// tant qu'il n'est pas en retard.
export type Clone = { id: string; etat: Etat; tete: string; lignes: string[]; commande?: string };
// Ce qui se pose en tête de « Tous les projets ». `a` : l'instant de la lecture.
// `alerte` : ce que la barre en dit quel que soit l'écran — rien, tant que rien n'est périmé.
export type Vu = { a: string; clones: Clone[]; alerte?: string };

export const APP = "app";

const commits = (nombre: number) => `${nombre} commit${nombre > 1 ? "s" : ""}`;
const court = (commit: string) => commit.slice(0, 7);
const nommes = (noms: readonly string[]) => noms.map((nom) => `“${nom}”`).join(", ");
// Un chemin tel que le shell du poste le rendra à `git` : entier, sans rien en exécuter.
const chemin = (texte: string) => (/^[A-Za-z0-9@%+=:,./_-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);
// La commande du chef. Elle nomme son clone : où qu'elle soit écrite, c'est lui qu'elle met à jour.
const miseAJour = (racine: string) => `git -C ${chemin(racine)} pull`;
const A_TOI = "The app updates nothing by itself: it is your action, at the moment you choose.";

const A_RELANCER = "THIS APP IS RUNNING OLDER CODE THAN ITS CLONE";

// Un clone tel qu'il se pose, et ce que la barre en dit quel que soit l'écran — rien, tant qu'il n'est pas périmé.
type Dit = { clone: Clone; alerte?: string };

// Ce que l'app dit de son propre code. `relance` : son clone n'est plus sur le commit de son
// lancement — de combien de commits, quand ils se comptent. `memes` : les projets dont le
// dossier est ce clone.
function direApp(lu: Lu, relance: { lance: string; plus: number | undefined } | undefined, memes: readonly string[]): Dit {
  const aussi = memes.length === 0 ? [] : [`It is also the clone of the project${memes.length > 1 ? "s" : ""} ${nommes(memes)}: its second reads the same code there.`];
  const relancer =
    relance === undefined || lu.tete === undefined
      ? []
      : [
          `Its clone${lu.racine === undefined ? "" : ` (${lu.racine})`} is no longer on the commit it was launched on (${court(relance.lance)}, now ${court(lu.tete)}${relance.plus === undefined || relance.plus === 0 ? "" : `: ${commits(relance.plus)} more`}).`,
          "It only changes code when it launches: relaunch it to run its clone's code.",
        ];
  const aRelancer = (suite: string[]): Dit => ({ clone: { id: APP, etat: "a-relancer", tete: A_RELANCER, lignes: [...relancer, ...suite, ...aussi] }, alerte: `${A_RELANCER.toLowerCase()}: relaunch needed` });
  if ("raison" in lu) {
    if (relancer.length > 0) return aRelancer([`How far this clone is behind its origin was not read: ${lu.raison}.`]);
    return { clone: { id: APP, etat: "pas-lu", tete: "how far this app's code is behind its origin was not read", lignes: [lu.raison, "So nothing says this code is up to date.", ...aussi] } };
  }
  const enAvance = lu.avance === 0 ? [] : [`Its clone also has ${commits(lu.avance)} that ${lu.suivie} does not have.`];
  if (lu.retard > 0) {
    const commande = miseAJour(lu.racine);
    return {
      clone: {
        id: APP,
        etat: "en-retard",
        tete: `THIS APP'S CODE IS ${commits(lu.retard).toUpperCase()} BEHIND ${lu.suivie}`,
        lignes: [
          "What this app shows may be out of date: what was delivered since is not in it — a screen, an action, a reading.",
          `Its clone: ${lu.racine}, on the branch ${lu.branche}.`,
          ...enAvance,
          `${A_TOI} \`${commande}\`, then relaunch it: it only changes code when it launches.`,
          ...relancer,
          ...aussi,
        ],
        commande,
      },
      alerte: `this app's code is ${commits(lu.retard)} behind ${lu.suivie}`,
    };
  }
  if (relancer.length > 0) return aRelancer([`Its clone is up to date with ${lu.suivie}.`, ...enAvance]);
  return { clone: { id: APP, etat: "a-jour", tete: `this app's code is up to date with ${lu.suivie}`, lignes: [...enAvance, ...aussi] } };
}

// Ce qu'elle dit du clone d'un projet qui est un clone de brigade, sans être celui de l'app.
function direProjet(racine: string, noms: readonly string[], lu: Lu): Dit {
  const [de, DE] = noms.length > 1 ? ["of the projects", "OF THE PROJECTS"] : ["of the project", "OF THE PROJECT"];
  if ("raison" in lu) return { clone: { id: racine, etat: "pas-lu", tete: `how far the clone ${de} ${nommes(noms)} is behind its origin was not read`, lignes: [lu.raison, "So nothing says this clone is up to date."] } };
  const enAvance = lu.avance === 0 ? [] : [`It also has ${commits(lu.avance)} that ${lu.suivie} does not have.`];
  if (lu.retard === 0) return { clone: { id: racine, etat: "a-jour", tete: `the clone ${de} ${nommes(noms)} is up to date with ${lu.suivie}`, lignes: enAvance } };
  const commande = miseAJour(lu.racine);
  return {
    clone: {
      id: racine,
      etat: "en-retard",
      tete: `THE CLONE ${DE} ${nommes(noms)} IS ${commits(lu.retard).toUpperCase()} BEHIND ${lu.suivie}`,
      lignes: [
        "It is a brigade clone, like this app's: what its second reads there — the roles, the docs, the code — may be out of date.",
        `Its clone: ${lu.racine}, on the branch ${lu.branche}.`,
        ...enAvance,
        `${A_TOI} \`${commande}\`.`,
      ],
      commande,
    },
    alerte: `the clone ${de} ${nommes(noms)} is ${commits(lu.retard)} behind ${lu.suivie}`,
  };
}

// Tient ce qui se dit des clones : le code de l'app, et les clones de brigade parmi les
// projets. `app` : le dossier de l'app, dans son clone. `relire` lit — au démarrage, au
// retour à la fenêtre, quand les projets changent — et rien ne lit entre deux.
export function tenirRetards(options: { reglages: Reglages; app: string; projets(): readonly Projet[]; surLecture(vu: Vu): void }) {
  const { reglages } = options;
  // Le commit sur lequel l'app a été lancée : celui de sa première lecture. `null` : il ne s'y est pas lu.
  let lance: string | null | undefined;
  let tenu: Vu | undefined;
  // Ce qui s'écrit pour chaque clone en retard, et les projets dont c'est le dossier.
  let ecrits = new Map<string, { commande: string; projets: readonly string[] }>();
  let enCours: Promise<void> | undefined;
  let encore = false;
  let ferme = false;
  const arret = new AbortController();

  const racineDe = async (dossier: string) => {
    const sommet = await git(reglages, dossier, ["rev-parse", "--show-toplevel"], arret.signal);
    return "dit" in sommet ? undefined : sommet.sortie;
  };
  const origineDe = async (racine: string) => {
    const origine = await git(reglages, racine, ["remote", "get-url", "origin"], arret.signal);
    return "dit" in origine || origine.sortie === "" ? undefined : identite(origine.sortie);
  };

  async function lire(): Promise<void> {
    const a = new Date().toISOString();
    const app = await lireRetard(reglages, options.app, arret.signal);
    if (lance === undefined) lance = app.tete ?? null;
    let relance: { lance: string; plus: number | undefined } | undefined;
    if (typeof lance === "string" && app.racine !== undefined && app.tete !== undefined && app.tete !== lance) {
      const plus = await git(reglages, app.racine, ["rev-list", "--count", `${lance}..${app.tete}`], arret.signal);
      relance = { lance, plus: "dit" in plus || !/^\d+$/.test(plus.sortie) ? undefined : Number(plus.sortie) };
    }

    // Parmi les projets qui s'ouvrent : ceux dont le dossier est le clone de l'app, et ceux
    // dont le clone a la même origine qu'elle — un clone de brigade. Les autres ne sont pas lus.
    const origine = app.racine === undefined ? undefined : await origineDe(app.racine);
    const memes: string[] = [];
    const autres = new Map<string, string[]>();
    for (const projet of options.projets()) {
      if (projet.refus !== undefined) continue;
      const racine = await racineDe(projet.dossier);
      if (racine === undefined) continue;
      if (racine === app.racine) memes.push(projet.nom);
      else if (autres.has(racine)) autres.get(racine)?.push(projet.nom);
      else if (origine !== undefined && (await origineDe(racine)) === origine) autres.set(racine, [projet.nom]);
    }

    const dits = [direApp(app, relance, memes)];
    for (const [racine, noms] of autres) dits.push(direProjet(racine, noms, await lireRetard(reglages, racine, arret.signal)));
    if (ferme) return;
    const clones = dits.map(({ clone }) => clone);
    const alerte = dits.find((dit) => dit.alerte !== undefined)?.alerte;
    ecrits = new Map(clones.flatMap(({ id, commande }) => (commande === undefined ? [] : [[id, { commande, projets: id === APP ? memes : (autres.get(id) ?? []) }]])));
    tenu = { a, clones, ...(alerte === undefined ? {} : { alerte }) };
    options.surLecture(tenu);
  }

  return {
    // Une lecture à la fois. Demandée pendant qu'une autre est en route — un retour à la
    // fenêtre —, elle est celle-là : rien de plus n'est lu. `apresChangement` : les projets
    // ont changé, et la lecture en route a pu lire ceux d'avant — une autre la suit, une
    // seule. Rendue quand il n'y a plus rien à lire.
    relire(apresChangement = false): Promise<void> {
      if (ferme) return Promise.resolve();
      if (enCours !== undefined) {
        encore ||= apresChangement;
        return enCours;
      }
      enCours = (async () => {
        do {
          encore = false;
          await lire();
        } while (encore && !ferme);
      })().finally(() => (enCours = undefined));
      return enCours;
    },

    // La dernière lecture — rien, avant la première.
    vu: (): Vu | undefined => tenu,

    // Écrit la mise à jour d'un clone dans un shell, sans l'envoyer — ou dit pourquoi rien
    // n'est écrit. La vue nomme le clone, jamais une commande ; rien, pour un clone qui n'est
    // pas en retard. Un shell de l'app vit dans l'espace d'un projet : celui dont c'est le
    // dossier, sinon le premier qui s'ouvre — la commande nomme son clone.
    ecrire(terminaux: { shell(projet: Projet, ecrit: string): Terminal }, id: unknown): Terminal | { refus: string } | undefined {
      const ecrit = typeof id === "string" ? ecrits.get(id) : undefined;
      if (ecrit === undefined) return undefined;
      if (CONTROLE.test(ecrit.commande)) return { refus: "nothing is written: this clone's path has a control character, and a line break would have sent the command" };
      const ouvrables = options.projets().filter((projet) => projet.refus === undefined);
      const espace = ouvrables.find((projet) => ecrit.projets.includes(projet.nom)) ?? ouvrables[0];
      if (espace === undefined) return { refus: `nothing is written: no project opens here, and an app shell lives in a project's space — copy the command: \`${ecrit.commande}\`` };
      return terminaux.shell(espace, ecrit.commande);
    },

    // L'app se ferme : ce qui se lisait encore est arrêté, et ne dit plus rien.
    fermer(): void {
      ferme = true;
      arret.abort();
    },
  };
}
