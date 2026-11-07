// Le relevé des mesures, en lecture seule :
//   npm --prefix runtime run measures                 par tranches de 10 merges
//   npm --prefix runtime run measures -- --by <n>     par tranches de <n> merges
//   npm --prefix runtime run measures -- --last <n>   les renvois des <n> derniers tickets mergés (20 par défaut)
// Les renvois et leurs causes se lisent dans `temps-tickets.json` du clone (`BRIGADE_REPO_DIR`),
// où la station écrit au merge ce que GitHub dit de chaque ticket (#2707) : le journal ne le sait plus.
// Les merges sont ceux de la branche d'intégration du clone, et leurs cooks ceux que les flux des
// cooks GitHub de la station disent (`closer-github-passe/derive-github.ts`) : le journal ne voit
// plus un merge depuis #2061 (#2707).
// L'ancienne option `--par` répond encore, en disant la nouvelle (`commandes.ts`).
// La commande n'écrit jamais, et répond pendant que le runtime tourne.
import { enAnglais } from "./commandes.ts";
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decrireReleve, PAR_DEFAUT } from "./mesures.ts";
import { decrireCauses } from "./causes-des-ratages.ts";
import { causesDesTemps, parcoursDesTemps, qualiteLue } from "./qualite-github.ts";
import { lesTempsDesTickets } from "./temps-ticket/ligne-status.ts";
import { direLeReleveGitHub, releveGitHubDeLaStation } from "./mesures-github.ts";
import { seuilsEnVigueur } from "./projections/measures.ts";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { coutsDesFlux, ticketDuMerge, type MergeDuClone } from "./closer-github-passe/derive-github.ts";
import { describeCallsPerTicket, measureCallsPerTicket, type PerTicket } from "./mesures/appels-par-ticket.ts";
import { ciDurationSection } from "./measures/ci-duration.ts";
import { decrireRenvois, DERNIERS_PAR_DEFAUT, mesurerRenvois } from "./renvois.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run measures -- [--by <number of merges>] [--last <number of tickets>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = enAnglais("measures", process.argv.slice(2), (ligne) => console.error(ligne));
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
// Chaque option une fois au plus, suivie d'un entier positif.
const options = new Map<string, number>();
for (let i = 0; i < args.length; i += 2) {
  const [option, valeur] = [args[i] ?? "", args[i + 1]];
  if (!["--by", "--last"].includes(option) || options.has(option) || valeur === undefined || !/^[1-9][0-9]*$/.test(valeur)) echouer(2, USAGE);
  options.set(option, Number(valeur));
}
const par = options.get("--by") ?? PAR_DEFAUT;
const derniers = options.get("--last") ?? DERNIERS_PAR_DEFAUT;

// Les merges de la branche d'intégration du clone, le plus ancien d'abord, tels que la passe du
// closer les lit (`lectureDuClone`), sans rapatrier : la commande ne touche pas au clone. Sans
// clone, ou illisible, aucun.
function mergesDuClone(clone: string | undefined, branche: string | undefined): MergeDuClone[] {
  if (!clone || !branche) return [];
  let sortie: string;
  try {
    sortie = execFileSync("git", ["log", "--first-parent", "-n", "100", "--format=%cI%x09%s", `origin/${branche}`], { cwd: clone, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return [];
  }
  return sortie
    .split("\n")
    .filter((ligne) => ligne !== "")
    .map((ligne) => {
      const [at = "", ...sujet] = ligne.split("\t");
      return { at, ticket: ticketDuMerge(sujet.join("\t")) };
    })
    .reverse();
}

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  const { base } = journal;
  const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null;
  const couts = coutsDesFlux(join(repertoireEtat, "github-seul"));
  const livraisons = mergesDuClone(process.env.BRIGADE_REPO_DIR, process.env.BRIGADE_BASE_BRANCH).map(({ at, ticket }) => ({ ticket, at, measures: {}, state: {}, gatesS: null, cooks: ticket === null ? [] : couts(ticket) }));
  for (const ligne of decrireReleve({ projet, livraisons, seuils: seuilsEnVigueur(base) }, par)) console.log(ligne);
  console.log("");
  const connus = lesTempsDesTickets(process.env.BRIGADE_REPO_DIR).enregistrements.filter(({ qualite }) => qualiteLue(qualite) !== null);
  for (const ligne of decrireRenvois(mesurerRenvois(parcoursDesTemps(connus), derniers))) console.log(ligne);
  console.log("");
  for (const ligne of decrireCauses(causesDesTemps(connus.slice(-derniers)))) console.log(ligne);
  // The ledger snapshot (`perTicket`) comes from `github/budget-appels.ts`, which is not on main yet:
  // until it lands every merged ticket reads as unknown.
  const perTicket: PerTicket = {};
  console.log("");
  for (const ligne of describeCallsPerTicket(measureCallsPerTicket(livraisons, perTicket))) console.log(ligne);
  // Rien de relevé, c'est aucune minute limitée et aucune écriture.
  const github = releveGitHubDeLaStation(process.env.BRIGADE_STATION_DIR, Date.now()) ?? { minutesLimitees: 0, pointEcritures: 0 };
  console.log("");
  for (const ligne of direLeReleveGitHub(github)) console.log(ligne);
  const ci = await ciDurationSection(process.env.BRIGADE_GITHUB_REPO);
  if (ci.length > 0) console.log("");
  for (const ligne of ci) console.log(ligne);
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant ce relevé.
  if (journalPasRejoue(erreur)) echouer(1, "this log does not have the measures report yet: restart the runtime, which recomputes it");
  throw erreur;
} finally {
  journal.fermer();
}
