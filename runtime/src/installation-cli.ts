// L'installation de brigade dans un projet, vue et commandée par le chef :
//   npm --prefix runtime run installation                               le projet est-il prêt ? tout ce qui manque, d'un coup
//   npm --prefix runtime run installation -- --json                     le même verdict, pour un programme : un objet JSON, sur une ligne (`verdict.ts`)
//   npm --prefix runtime run installation -- labels                     crée sur le dépôt les labels du rail qui y manquent
//   npm --prefix runtime run installation -- setup [<cooks>]            joue le setup à blanc, le mesure, dit s'il tient à <cooks> cooks
//   npm --prefix runtime run installation -- uninstall [--confirm]      retire le clone réservé et les worktrees
//   npm --prefix runtime run installation -- etapes [...]               les étapes de l'installation, leur état, l'étape courante (`etapes-cli.ts`)
//   npm --prefix runtime run installation -- stations [...]             les stations que la machine fournit ; déclare celles que le chef choisit (`declarer-stations.ts`)
//   npm --prefix runtime run installation -- protection [...]           la branche d'intégration sur GitHub ; la protège (`proteger-branche.ts`)
//   npm --prefix runtime run installation -- decisions [...]            les décisions que l'installation pose, chacune avec son choix expliqué ; pose les réponses (`poser-decisions.ts`)
// Elle lit l'environnement du service, comme le runtime : aucune ne lance de
// cook, aucune ne consomme de quota, et seules `etapes`, `stations`,
// `protection` et `decisions` écrivent au journal, quand le chef y note une
// étape, y déclare ses stations, protège sa branche ou pose ses décisions —
// `installation` le lit, en lecture seule, pour la connexion Max. Le parcours
// entier est dans docs/installer.md. Les anciens mots (`desinstaller`,
// `--confirmer`) répondent encore, en disant le nouveau (`commandes.ts`).
import { configRail } from "./alimenter.ts";
import { geste } from "./geste.ts";
import { Sortie } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { principal as declarerStations } from "./declarer-stations.ts";
import { nommerEtape, principal as etapes } from "./etapes-cli.ts";
import { uninstall, etapesAReprendre, InstallationRefusee, mesurerSetup, poserLabels, tenir, verifier, type Constat } from "./installation.ts";
import { configMachine, lireMachine } from "./machine.ts";
import { principal as poserDecisions } from "./poser-decisions.ts";
import { principal as protegerBranche } from "./proteger-branche.ts";
import { ConfigInvalide } from "./runtime.ts";
import { configStation } from "./station.ts";
import { verdictDeVerification } from "./verdict.ts";

const USAGE = "usage: <service environment> npm --prefix runtime run installation -- [labels | setup [<cooks>] | uninstall [--confirm] | etapes [--json | <step> <state>] | stations [--json | <declaration>] | protection [--json | poser] | decisions [--json | <decision> <value>…] | --json]";
const REFUS = 2;
const MO = 1024 ** 2;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const env = process.env;
const projet = env.BRIGADE_PROJECT || "<project>";
const nombre = (valeur: number, decimales = 0) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const duree = (ms: number) => (ms >= 60_000 ? `${nombre(ms / 60_000, 1)} min` : `${nombre(ms / 1000, 1)} s`);
const taille = (octets: number) => (octets >= 1024 * MO ? `${nombre(octets / (1024 * MO), 1)} GB` : `${nombre(octets / MO, 1)} MB`);
const tient = (oui: boolean) => (oui ? "holds" : "DOES NOT HOLD");

const TITRES: Record<Constat["ou"], string> = { machine: "On the machine", depot: "In the repository", github: "On GitHub" };
const MARQUES: Record<Constat["etat"], string> = { ok: "ok", manque: "MISSING", note: "note" };

// Ce que la vérification écrit, ligne à ligne, à `console` : la sortie
// standard, ou la sortie brute jointe au verdict — les mêmes lignes, que l'app
// lit telles quelles (app/src/service.ts, `manquesDe`).
function ecrire(constats: Constat[], console: { log: (ligne: string) => void }): number {
  for (const ou of ["machine", "depot", "github"] as const) {
    console.log(`\n${TITRES[ou]}`);
    for (const constat of constats.filter((lu) => lu.ou === ou)) {
      console.log(`  ${MARQUES[constat.etat].padEnd(10)}${constat.texte}`);
      if (constat.geste !== undefined) console.log(`            → ${constat.geste}`);
      if (constat.etape !== undefined) console.log(`            → step to resume: ${nommerEtape(constat.etape)} (${constat.etape})`);
    }
  }
  const manques = constats.filter((constat) => constat.etat === "manque").length;
  console.log(
    manques === 0
      ? `\nbrigade : project “${projet}” : ready — nothing is missing to launch a cook`
      : `\nbrigade : project “${projet}” : ${nombre(manques)} missing : no cook must be launched while any is left — to resume: ${etapesAReprendre(constats).map(nommerEtape).join(", ")}`,
  );
  return manques === 0 ? 0 : 1;
}

async function montrer(): Promise<number> {
  return ecrire(await verifier(env), console);
}

// Le verdict, pour un programme (`verdict.ts`) : jamais une erreur — une
// vérification qui plante en est un. Le code reste celui du texte : 0 prêt, 1 sinon.
async function juger(): Promise<number> {
  const verdict = await verdictDeVerification(
    () => verifier(env),
    (constats) => {
      let brut = "";
      ecrire(constats, { log: (ligne) => void (brut += `${ligne}\n`) });
      return brut;
    },
  );
  console.log(JSON.stringify(verdict));
  return verdict.verdict === "pret" ? 0 : 1;
}

async function labelliser(): Promise<number> {
  const { depot } = configRail(env);
  const { crees, presents } = await poserLabels(env);
  console.log(
    crees.length === 0
      ? `brigade : nothing to create on ${depot} — the ${pluriel(presents.length, "label")} of the rail are already there`
      : `brigade : ${pluriel(crees.length, "label")} created on ${depot}: ${crees.join(", ")}${presents.length === 0 ? "" : ` (${nombre(presents.length)} were already there)`}`,
  );
  return 0;
}

async function mesurer(cooks: number): Promise<number> {
  const station = configStation(env);
  const { dureeBailMs: leaseDurationMs } = configRail(env);
  const measure = await mesurerSetup(env);
  const sur = `\`${station.base}\` (${measure.sha.slice(0, 7)})`;
  if (!measure.pret) {
    console.error(`brigade : setup failed on ${sur}, after ${duree(measure.dureeMs)} — the station would launch no cook (86 \`setup-failed\`). What it said:`);
    console.error(measure.sortie.trim().split("\n").slice(-20).join("\n"));
    return 1;
  }
  const machine = lireMachine(env.BRIGADE_STATE_DIR ?? ".");
  const tenue = tenir(measure, { cooks, entrees: station.entreesMax, leaseMs: leaseDurationMs, disqueLibre: machine.disqueLibre, disqueMinOctets: station.seuils.disqueMinMo * MO });
  const ligne = (titre: string, valeur: string) => console.log(`  ${titre.padEnd(12)}${valeur}`);
  console.log(
    measure.joue
      ? `brigade : setup played in ${duree(measure.dureeMs)} on ${sur} — once, alone, as a dry run, machine load ${nombre(machine.charge, 1)} on ${nombre(machine.coeurs)} cores`
      : `brigade : the project has no setup on ${sur} — a fresh worktree starts as it is`,
  );
  ligne("worktree", `${taille(measure.avantOctets)} when created, ${taille(measure.apresOctets)} once the setup has run`);
  ligne("cap", `${duree(tenue.setup.plafondMs)}, half the lease — beyond it the station stops the setup: ${tient(tenue.setup.tient)}`);
  console.log(`At ${pluriel(cooks, "cook")}, ${nombre(station.entreesMax)} entering at a time (BRIGADE_MAX_SETUPS)`);
  ligne("intake", `${pluriel(tenue.entree.vagues, "wave")} of setups: the last cook starts ${duree(tenue.entree.dernierMs)} after the first, at best — later if the machine saturates`);
  ligne("disk", `${taille(tenue.disque.besoin)} for ${pluriel(cooks, "worktree")}, ${taille(tenue.disque.disponible)} available once the station's reserve is deducted: ${tient(tenue.disque.tient)}`);
  console.log(
    tenue.tient
      ? `brigade : a fresh worktree per cook holds at ${pluriel(cooks, "cook")} on this machine`
      : `brigade : a fresh worktree per cook DOES NOT HOLD at ${pluriel(cooks, "cook")} on this machine — lower the cooks cap (\`${geste(`station cooks <N>`)}\`), lighten the setup, or share what it installs`,
  );
  return tenue.tient ? 0 : 1;
}

function retirer(confirme: boolean): number {
  const bilan = uninstall(env, { confirme });
  const etat = env.BRIGADE_STATE_DIR;
  const parts = [bilan.clone === null ? [] : [`the reserved clone ${bilan.clone}`], bilan.worktrees === 0 ? [] : [`${pluriel(bilan.worktrees, "cook worktree")}`]].flat();
  const quoi = parts.join(" and ");
  if (bilan.perdus.length > 0) {
    console.log(`brigade : the clone carries what the origin does not have — \`--confirm\` will refuse as long as any remains:`);
    for (const perdu of bilan.perdus) console.log(`  ${perdu}`);
  }
  if (bilan.retire) console.log(`brigade : removed — ${quoi}${bilan.clone === null ? " (the reserved clone was already gone)" : ""}`);
  else if (parts.length === 0) console.log("brigade : nothing to remove — neither a reserved clone nor a worktree");
  else console.log(`brigade : nothing is removed — \`uninstall --confirm\` would remove ${quoi}`);
  console.log(
    [
      "",
      "Left to do by hand, under an account that has `sudo`:",
      `  sudo systemctl disable --now brigade@${projet}.service brigade-sauvegarde@${projet}.timer`,
      `  sudo rm -rf /etc/systemd/system/brigade@${projet}.service.d /etc/systemd/system/brigade-sauvegarde@${projet}.service.d`,
      "  sudo systemctl daemon-reload",
      `Kept: the project's log, its streams and its backups, in ${etat} — it is the kitchen's history; \`rm -rf\` if you no longer want it.`,
      "The repository stays an ordinary repository: its issues, its PRs and its history do not depend on brigade. What brigade leaves there — labels, `.claude/brigade/`, the bindings block, `cook/*` branches — does nothing without it and can be removed whenever you like (docs/installer.md).",
    ].join("\n"),
  );
  return 0;
}

const [commande, ...reste] = enAnglais("installation", process.argv.slice(2), (ligne) => console.error(ligne));
try {
  if (commande === undefined) process.exitCode = await montrer();
  else if (commande === "--json" && reste.length === 0) process.exitCode = await juger();
  else if (commande === "labels" && reste.length === 0) process.exitCode = await labelliser();
  // Sans nombre, la mesure se fait pour ce que le projet déclare : tous les
  // cooks que ses stations peuvent faire tourner à la fois.
  else if (commande === "setup" && reste.length <= 1 && /^[1-9][0-9]*$/.test(reste[0] ?? "1")) {
    process.exitCode = await mesurer(Number(reste[0] ?? Math.max(1, configStation(env).stations.reduce((somme, station) => somme + station.cooks, 0))));
  }
  else if (commande === "uninstall" && (reste.length === 0 || (reste.length === 1 && reste[0] === "--confirm"))) process.exitCode = retirer(reste.length === 1);
  else if (commande === "etapes") await etapes({ args: reste, env, dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
  else if (commande === "stations") declarerStations({ args: reste, env, dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
  else if (commande === "protection") await protegerBranche({ args: reste, env, dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
  else if (commande === "decisions") poserDecisions({ args: reste, env, dire: (ligne) => console.log(ligne), redire: (ligne) => console.error(ligne) });
  else echouer(REFUS, USAGE);
} catch (erreur) {
  // `etapes`, `stations`, `protection` et `decisions` ont dit elles-mêmes ce qui les arrête : reste leur code.
  if (erreur instanceof Sortie) process.exitCode = erreur.code;
  else if (erreur instanceof ConfigInvalide) echouer(REFUS, `${erreur.message}\n${USAGE}`);
  else if (erreur instanceof InstallationRefusee) echouer(1, erreur.message);
  else echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
