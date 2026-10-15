// L'installation de brigade dans un projet, vue et commandée par le chef :
//   npm --prefix runtime run installation                               le projet est-il prêt ? tout ce qui manque, d'un coup
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
import { desinstaller, etapesAReprendre, InstallationRefusee, mesurerSetup, poserLabels, tenir, verifier, type Constat } from "./installation.ts";
import { configMachine, lireMachine } from "./machine.ts";
import { principal as poserDecisions } from "./poser-decisions.ts";
import { principal as protegerBranche } from "./proteger-branche.ts";
import { ConfigInvalide } from "./runtime.ts";
import { configStation } from "./station.ts";

const USAGE = "usage : <environnement du service> npm --prefix runtime run installation -- [labels | setup [<cooks>] | uninstall [--confirm] | etapes [--json | <étape> <état>] | stations [--json | <déclaration>] | protection [--json | poser] | decisions [--json | <décision> <valeur>…]]";
const REFUS = 2;
const MO = 1024 ** 2;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const env = process.env;
const projet = env.BRIGADE_PROJECT || "<projet>";
const nombre = (valeur: number, decimales = 0) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const duree = (ms: number) => (ms >= 60_000 ? `${nombre(ms / 60_000, 1)} min` : `${nombre(ms / 1000, 1)} s`);
const taille = (octets: number) => (octets >= 1024 * MO ? `${nombre(octets / (1024 * MO), 1)} Go` : `${nombre(octets / MO, 1)} Mo`);
const tient = (oui: boolean) => (oui ? "tient" : "NE TIENT PAS");

const TITRES: Record<Constat["ou"], string> = { machine: "Sur la machine", depot: "Dans le dépôt", github: "Sur GitHub" };
const MARQUES: Record<Constat["etat"], string> = { ok: "ok", manque: "MANQUE", note: "à savoir" };

async function montrer(): Promise<number> {
  const constats = await verifier(env);
  for (const ou of ["machine", "depot", "github"] as const) {
    console.log(`\n${TITRES[ou]}`);
    for (const constat of constats.filter((lu) => lu.ou === ou)) {
      console.log(`  ${MARQUES[constat.etat].padEnd(10)}${constat.texte}`);
      if (constat.geste !== undefined) console.log(`            → ${constat.geste}`);
      if (constat.etape !== undefined) console.log(`            → étape à reprendre : ${nommerEtape(constat.etape)} (${constat.etape})`);
    }
  }
  const manques = constats.filter((constat) => constat.etat === "manque").length;
  console.log(
    manques === 0
      ? `\nbrigade : projet « ${projet} » : prêt — rien ne manque pour lancer un cook`
      : `\nbrigade : projet « ${projet} » : ${pluriel(manques, "manque")} : aucun cook ne doit être lancé tant qu'il en reste — à reprendre : ${etapesAReprendre(constats).map(nommerEtape).join(", ")}`,
  );
  return manques === 0 ? 0 : 1;
}

async function labelliser(): Promise<number> {
  const { depot } = configRail(env);
  const { crees, presents } = await poserLabels(env);
  console.log(
    crees.length === 0
      ? `brigade : rien à créer sur ${depot} — les ${pluriel(presents.length, "label")} du rail y sont déjà`
      : `brigade : ${pluriel(crees.length, "label")} créés sur ${depot} : ${crees.join(", ")}${presents.length === 0 ? "" : ` (${nombre(presents.length)} y étaient déjà)`}`,
  );
  return 0;
}

async function mesurer(cooks: number): Promise<number> {
  const station = configStation(env);
  const { dureeBailMs } = configRail(env);
  const mesure = await mesurerSetup(env);
  const sur = `\`${station.base}\` (${mesure.sha.slice(0, 7)})`;
  if (!mesure.pret) {
    console.error(`brigade : setup en échec sur ${sur}, après ${duree(mesure.dureeMs)} — la station ne lancerait aucun cook (86 \`setup-failed\`). Ce qu'il a dit :`);
    console.error(mesure.sortie.trim().split("\n").slice(-20).join("\n"));
    return 1;
  }
  const machine = lireMachine(env.BRIGADE_STATE_DIR ?? ".");
  const tenue = tenir(mesure, { cooks, entrees: station.entreesMax, bailMs: dureeBailMs, disqueLibre: machine.disqueLibre, disqueMinOctets: station.seuils.disqueMinMo * MO });
  const ligne = (titre: string, valeur: string) => console.log(`  ${titre.padEnd(12)}${valeur}`);
  console.log(
    mesure.joue
      ? `brigade : setup joué en ${duree(mesure.dureeMs)} sur ${sur} — une fois, seul, à blanc, charge de la machine ${nombre(machine.charge, 1)} sur ${nombre(machine.coeurs)} cœurs`
      : `brigade : le projet n'a pas de setup sur ${sur} — un worktree neuf part tel quel`,
  );
  ligne("worktree", `${taille(mesure.avantOctets)} à sa création, ${taille(mesure.apresOctets)} une fois le setup passé`);
  ligne("plafond", `${duree(tenue.setup.plafondMs)}, la moitié du bail — au-delà la station arrête le setup : ${tient(tenue.setup.tient)}`);
  console.log(`À ${pluriel(cooks, "cook")}, ${nombre(station.entreesMax)} en entrée à la fois (BRIGADE_MAX_SETUPS)`);
  ligne("entrée", `${pluriel(tenue.entree.vagues, "vague")} de setups : le dernier cook part ${duree(tenue.entree.dernierMs)} après le premier, au mieux — plus si la machine sature`);
  ligne("disque", `${taille(tenue.disque.besoin)} pour ${pluriel(cooks, "worktree")}, ${taille(tenue.disque.disponible)} disponibles une fois la réserve de la station déduite : ${tient(tenue.disque.tient)}`);
  console.log(
    tenue.tient
      ? `brigade : un worktree neuf par cook tient à ${pluriel(cooks, "cook")} sur cette machine`
      : `brigade : un worktree neuf par cook NE TIENT PAS à ${pluriel(cooks, "cook")} sur cette machine — baisser le plafond de cooks (\`${geste(`station cooks <N>`)}\`), alléger le setup, ou partager ce qu'il installe`,
  );
  return tenue.tient ? 0 : 1;
}

function retirer(confirme: boolean): number {
  const bilan = desinstaller(env, { confirme });
  const etat = env.BRIGADE_STATE_DIR;
  const parts = [bilan.clone === null ? [] : [`le clone réservé ${bilan.clone}`], bilan.worktrees === 0 ? [] : [`${pluriel(bilan.worktrees, "worktree")} de cook`]].flat();
  const quoi = parts.join(" et ");
  if (bilan.perdus.length > 0) {
    console.log(`brigade : le clone porte ce que l'origine n'a pas — \`--confirm\` refusera tant qu'il en reste :`);
    for (const perdu of bilan.perdus) console.log(`  ${perdu}`);
  }
  if (bilan.retire) console.log(`brigade : retiré — ${quoi}${bilan.clone === null ? " (le clone réservé n'y était déjà plus)" : ""}`);
  else if (parts.length === 0) console.log("brigade : rien à retirer — ni clone réservé, ni worktree");
  else console.log(`brigade : rien n'est retiré — \`uninstall --confirm\` retirerait ${quoi}`);
  console.log(
    [
      "",
      "Reste à la main, sous un compte qui a `sudo` :",
      `  sudo systemctl disable --now brigade@${projet}.service brigade-sauvegarde@${projet}.timer`,
      `  sudo rm -rf /etc/systemd/system/brigade@${projet}.service.d /etc/systemd/system/brigade-sauvegarde@${projet}.service.d`,
      "  sudo systemctl daemon-reload",
      `Gardé : le journal du projet, ses flux et ses sauvegardes, dans ${etat} — c'est l'histoire de la cuisine ; \`rm -rf\` si tu n'en veux plus.`,
      "Le dépôt reste un dépôt ordinaire : ses issues, ses PR et son historique ne dépendent pas de brigade. Ce qu'elle y laisse — labels, `.claude/brigade/`, bloc de bindings, branches `cook/*` — ne fait rien sans elle et se retire quand tu veux (docs/installer.md).",
    ].join("\n"),
  );
  return 0;
}

const [commande, ...reste] = enAnglais("installation", process.argv.slice(2), (ligne) => console.error(ligne));
try {
  if (commande === undefined) process.exitCode = await montrer();
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
