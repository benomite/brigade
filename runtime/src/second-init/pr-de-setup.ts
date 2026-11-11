// La fin de la mise en place d'un projet par son second (#3169, épique #3164) :
// la pull request de setup, ouverte avec les valeurs arrêtées — la branche
// d'intégration, les checks, les zones de fichiers —, sa carte dans le TODO du
// chef, et ce que le second lui dit pour finir.
//
// Rien n'est refait ici de ce qui existe :
//   - la PR est celle qu'ouvre le script de `/brigade:init` de l'app
//     (`app/src/plugin/init.sh`) : ses fichiers, dans un worktree jetable sur
//     `brigade/init`, puis la PR — sa dernière ligne dit `pr <url>`, ou
//     `unchanged` quand la branche d'intégration porte déjà tout ;
//   - la carte est celle des cartes du chef sur GitHub
//     (`github-seul/carte-todo/carte-todo.ts`, `poserCarte`) : `chef-todo` et un
//     commentaire marqué, sur une issue — l'app ne lit pas de carte sur une PR.
//     L'issue de la carte est ouverte une fois, retrouvée par son marqueur
//     ensuite ; la PR la nomme (`Closes #n`), et la merger la ferme : la carte
//     quitte le TODO. Son choix, `- [merge] Merge #<pr>`, merge la PR depuis le TODO.
//
// Le message dit au chef, en mots simples, que c'est à lui de merger : la PR
// règle ce qui jugera chaque livraison à venir. Et ce qui suit : une fois
// mergée, le projet se montre prêt. Les phrases sont en anglais : c'est le
// second qui les dit, dans la langue du chef.
//
// La commande, que `/brigade:init` lance depuis le dossier du projet (`init.md`) :
//
//   node runtime/src/second-init/pr-de-setup.ts <script de /brigade:init> [<ses arguments>…]
//
// Ses arguments passent au script tels quels. Elle rend le message sur sa
// sortie, code 0 ; ou une phrase sur sa sortie d'erreur, code 1 — rien n'est
// dit ouvert qui ne l'est pas. `BRIGADE_GH_BIN` nomme le `gh` qui en tient lieu.
import { DE_CONFIANCE } from "../alimenter.ts";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHub, type GitHub, type PR } from "../github.ts";
import { leverCarte, lireCarte, poserCarte, type Carte, type GitHubDesCartes } from "../github-seul/carte-todo/carte-todo.ts";
import { execFile } from "../sans-invite.ts";

// La branche sur laquelle le script de `/brigade:init` ouvre la PR.
export const BRANCHE = "brigade/init";
// Ce qui marque l'issue de la carte : la mise en place rejouée la retrouve.
export const MARQUEUR = "<!-- brigade:setup-pr -->";
export const TITRE = "Merge the setup pull request";

// Ce que la PR règle, dit au chef.
export const RAISON = "it sets what will judge every future delivery: the integration branch every delivery lands on, the checks every delivery must pass, and the file zones each ticket writes in";

// Ce que la mise en place demande à GitHub, et rien de plus.
export type GitHubDuSetup = GitHubDesCartes & Pick<GitHub, "prDeBranche" | "ouvertes" | "creerIssue" | "ecrireCorps">;

// Ce que le script a rendu : sa dernière ligne.
export type FinDuScript = { pr: string } | { inchange: true };

export function finDuScript(sortie: string): FinDuScript | null {
  const derniere = sortie.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
  if (derniere === "unchanged") return { inchange: true };
  const pr = /^pr (https:\/\/\S+)$/.exec(derniere)?.[1];
  return pr === undefined ? null : { pr };
}

// Le dépôt et le numéro d'une adresse de PR de GitHub, ou null.
export function prDeLAdresse(url: string): { depot: string; numero: number } | null {
  const lu = /^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)\/?$/.exec(url.trim());
  return lu === null ? null : { depot: lu[1] as string, numero: Number(lu[2]) };
}

// La carte : sa question sur la première ligne, son choix, puis pourquoi c'est au chef.
export function carteDeLaPr(pr: number, base: string): Carte {
  return {
    sorte: "merge-by-hand",
    texte: [`Merge the setup pull request #${pr}?`, `- [merge] Merge #${pr}`, "", `Only you merge it: ${RAISON}. Once it is merged on \`${base}\`, the project shows as ready.`].join("\n"),
  };
}

// Ce que le second dit pour finir.
export function messageDeFin({ url, base, carte }: { url: string; base: string; carte: number }): string {
  return [
    `I opened the setup pull request: ${url}.`,
    `You are the one to merge it, not me, because ${RAISON}.`,
    `It waits for you as a card in the TODO (#${carte}).`,
    `Once it is merged on \`${base}\`, the project shows as ready.`,
  ].join(" ");
}

// Ce que le second dit quand la branche d'intégration porte déjà la mise en place.
export const MESSAGE_INCHANGE = "The integration branch already carries the setup: there is no pull request to merge, and the project is set up.";

// L'issue de la carte, ouverte une fois : retrouvée parmi les ouvertes par son
// marqueur — posé par quelqu'un qui a la main sur le dépôt —, sinon créée.
async function issueDeLaCarte(github: GitHubDuSetup): Promise<number> {
  const sondage = await github.ouvertes();
  const existante = sondage.inchange ? undefined : sondage.issues.find((issue) => issue.body.includes(MARQUEUR) && DE_CONFIANCE.includes(issue.association));
  if (existante !== undefined) return existante.number;
  return github.creerIssue({ titre: TITRE, corps: `${MARQUEUR}\nThe setup pull request of this project waits for the chef's merge. Merging it closes this issue.`, labels: [] });
}

// Pose la carte de la PR dans le TODO, et la PR nomme son issue : la merger la
// ferme. Une carte qui attend déjà, mais pour une autre PR (la précédente,
// fermée sans merge), est levée puis reposée : la carte nomme celle à merger.
export async function poserLaCarteDeLaPr(github: GitHubDuSetup, pr: number, base: string): Promise<number> {
  const carte = await issueDeLaCarte(github);
  const voulue = carteDeLaPr(pr, base);
  const tenue = await lireCarte(carte, github);
  if (tenue !== null && tenue.sorte === voulue.sorte && tenue.texte !== voulue.texte) await leverCarte(carte, github, voulue.sorte);
  await poserCarte(carte, voulue, github);
  const lue = await github.issue(pr);
  if (lue === null) throw new Error(`the setup pull request #${pr} is no longer on GitHub`);
  const corps = lue.body ?? "";
  const lien = `Closes #${carte}`;
  if (!corps.includes(lien)) await github.ecrireCorps(pr, `${corps.replace(/\s+$/, "")}\n\n${lien}`);
  return carte;
}

// Joue le script de `/brigade:init` dans le dossier du projet : sa sortie, ou
// l'erreur qu'il dit.
export type Script = (script: string, args: readonly string[], dossier: string, env?: Record<string, string | undefined>) => Promise<string>;

const DELAI_DU_SCRIPT_MS = 5 * 60_000;

export const jouerLeScript: Script = (script, args, dossier, env = process.env) =>
  new Promise((resoudre, rejeter) => {
    execFile(script, [...args], { cwd: dossier, env, encoding: "utf8", timeout: DELAI_DU_SCRIPT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (erreur, sortie, sortieErreur) => {
      if (erreur === null) return resoudre(String(sortie));
      const dit = String(sortieErreur ?? "").trim().split(/\r?\n/).at(-1)?.trim();
      rejeter(new Error(dit || erreur.message));
    });
  });

export type OptionsDeLaPr = {
  dossier: string;
  // Le script de `/brigade:init`, et ce qu'il reçoit : les valeurs arrêtées.
  script: string;
  args: readonly string[];
  // Le GitHub du dépôt que la PR nomme.
  github: (depot: string) => GitHubDuSetup;
  env?: Record<string, string | undefined>;
  jouer?: Script;
};

export type PrDeSetup = { etat: "ouverte"; pr: string; numero: number; base: string; carte: number; message: string } | { etat: "inchange"; message: string };

// Ouvre la PR de setup par le script, la relit sur GitHub, pose sa carte, et
// rend le message de fin. Lève, en une phrase, si l'une des trois échoue : la
// PR ouverte mais sans sa carte se dit telle.
export async function ouvrirLaPrDeSetup(options: OptionsDeLaPr): Promise<PrDeSetup> {
  const sortie = await (options.jouer ?? jouerLeScript)(options.script, options.args, options.dossier, options.env);
  const fin = finDuScript(sortie);
  if (fin === null) throw new Error(`the setup script ended without saying which pull request it opened (last line: ${JSON.stringify(sortie.trim().split(/\r?\n/).at(-1) ?? "")})`);
  if ("inchange" in fin) return { etat: "inchange", message: MESSAGE_INCHANGE };
  const adresse = prDeLAdresse(fin.pr);
  if (adresse === null) throw new Error(`the setup script gave ${fin.pr}, which is not a GitHub pull request address`);
  const github = options.github(adresse.depot);
  let lue: PR | null;
  try {
    lue = await github.prDeBranche(BRANCHE);
  } catch (erreur) {
    throw new Error(`the setup script gave ${fin.pr}, but GitHub could not be read to check it is open (${erreur instanceof Error ? erreur.message : String(erreur)}): it may await you on GitHub`);
  }
  if (lue === null || lue.number !== adresse.numero || lue.state !== "open") throw new Error(`the setup pull request ${fin.pr} is not open on GitHub`);
  let carte: number;
  try {
    carte = await poserLaCarteDeLaPr(github, lue.number, lue.base);
  } catch (erreur) {
    throw new Error(`the setup pull request ${fin.pr} is open, but its card could not be put in the TODO (${erreur instanceof Error ? erreur.message : String(erreur)}): merge it on GitHub`);
  }
  return { etat: "ouverte", pr: fin.pr, numero: lue.number, base: lue.base, carte, message: messageDeFin({ url: fin.pr, base: lue.base, carte }) };
}

export async function principal({ args, env, dire, redire }: Appel, options: { dossier?: string; jouer?: Script; github?: (depot: string) => GitHubDuSetup } = {}): Promise<void> {
  const [script, ...suite] = args;
  if (script === undefined || script === "") {
    redire("usage: node runtime/src/second-init/pr-de-setup.ts <setup script> [<its arguments>…]");
    throw new Sortie(2);
  }
  const ouverts: GitHub[] = [];
  const github =
    options.github ??
    ((depot: string) => {
      const ouvert = ouvrirGitHub({ depot, bin: env.BRIGADE_GH_BIN || "gh", usage: "geste" });
      ouverts.push(ouvert);
      return ouvert;
    });
  try {
    const rendu = await ouvrirLaPrDeSetup({ dossier: options.dossier ?? process.cwd(), script, args: suite, github, env, ...(options.jouer ? { jouer: options.jouer } : {}) });
    dire(rendu.message);
  } catch (erreur) {
    redire(`brigade setup: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    throw new Sortie(1);
  } finally {
    for (const ouvert of ouverts) ouvert.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
