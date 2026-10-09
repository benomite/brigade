// La cloison du projet, vue et éprouvée par le chef, depuis son propre process :
//   npm --prefix runtime run cloison                        ce qui est masqué, ce que le réseau laisse passer, ce qu'il a refusé et pourquoi
//   npm --prefix runtime run cloison -- eprouver [<essais>]  lance de vraies sondes dans la cloison, et mesure ce qu'elle coûte par cook
// La première lit le journal : aucune configuration à ouvrir. La seconde lit
// l'environnement du service, comme le runtime, et ne lance aucun cook.
import { existsSync } from "node:fs";
import { configCloison, direFichiers, direReseau } from "./cloison.ts";
import { eprouver } from "./eprouver.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { configMachine } from "./machine.ts";
import { AUTRES_HOTES } from "./porte.ts";
import { DECLARATION_RESEAU, direRegle, POURQUOI, reglesDuProjet } from "./reseau.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run cloison -- [eprouver [<essais>]]";
const REFUS_MONTRES = 10;
const ESSAIS_PAR_DEFAUT = 20;
// Le parallélisme que le jalon vise (#98) : le coût d'un cook s'y multiplie.
const COOKS = 30;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const nombre = (valeur: number, decimales = 1) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(22)}${valeur}`);

function montrer(journal: Journal): void {
  const etat = journal.duType("isolation.configured", 1)[0];
  if (etat === undefined) {
    return void console.log("brigade : ce journal ne dit rien de la cloison — le runtime n'a pas démarré depuis qu'elle existe : le redémarrer");
  }
  const { sandbox, proxy } = etat.payload;
  console.log(`cloison du projet « ${etat.project} », telle que le runtime l'a trouvée le ${etat.at}\n`);
  ligne("fichiers", sandbox ? "CLOISONNÉS" : "OUVERTS");
  console.log(`  ${direFichiers(sandbox)}`);
  if (sandbox) {
    console.log("  un lancement ne retrouve que son worktree et sa vue du `.git` du clone (les vrais objets, sa propre config, ses propres hooks) ; le répertoire du compte est en lecture seule — ce qui s'y écrit, `~/.claude` compris, est au projet ; /tmp reste en écriture");
  }
  console.log("");
  ligne("réseau", proxy ? (proxy.enforced === false ? "LISTE BLANCHE NON TENUE" : "LISTE BLANCHE") : "OUVERT");
  console.log(`  ${direReseau(proxy)}`);
  if (!proxy) return;

  const declare = journal.duType("network.declared", 1)[0]?.payload;
  console.log("\nce qui passe");
  for (const regle of reglesDuProjet(declare?.hosts ?? [])) console.log(`  ${direRegle(regle).padEnd(48)}${POURQUOI[regle.origine]}${regle.origine === "project" && declare ? `, sur \`${declare.base}\`` : ""}`);
  for (const probleme of declare?.problems ?? []) console.log(`  N'OUVRE RIEN — ${probleme}`);
  console.log(`tout le reste est refusé. Pour ouvrir un hôte : une ligne dans \`${DECLARATION_RESEAU}\`, mergée sur la branche d'intégration.`);

  const refus = journal.duType("network.refused", REFUS_MONTRES);
  console.log(`\nderniers refus${refus.length === 0 ? " : aucun" : ""}`);
  for (const { at, payload } of refus.reverse()) {
    if (payload.host === AUTRES_HOTES) {
      console.log(`  ${at}  ${"d'autres hôtes encore".padEnd(40)}${nombre(payload.count, 0)} tentatives  au-delà de cent hôtes refusés en dix minutes, ils ne sont plus nommés`);
      continue;
    }
    console.log(`  ${at}  ${`${payload.host}:${payload.port}`.padEnd(40)}${payload.count > 1 ? `${nombre(payload.count, 0)} tentatives  ` : ""}absent de la liste blanche`);
  }
}

async function jouerLesSondes(essais: number): Promise<number> {
  const env = process.env;
  const etat = env.BRIGADE_STATE_DIR ?? "";
  const clone = env.BRIGADE_REPO_DIR || echouer(2, "BRIGADE_REPO_DIR n'est pas défini — lancer cette commande avec l'environnement du service");
  const cloison = configCloison(env, { repertoireEtat: etat, clone });
  if (cloison === null) {
    console.log(`brigade : rien à éprouver — ${direFichiers(null)}`);
    return 1;
  }
  const { sondes, cout } = await eprouver(cloison, { claude: env.BRIGADE_CLAUDE_BIN || "claude", env, essais });
  for (const sonde of sondes) console.log(`  ${(sonde.tient === true ? "tient" : sonde.tient === false ? "NE TIENT PAS" : "non prouvé").padEnd(14)}${sonde.quoi} — ${sonde.detail}`);
  if (cout !== null) {
    const surcoutMs = Math.max(0, cout.cloisonneMs - cout.nuMs);
    console.log(`\ncoût d'un lancement cloisonné (médiane de ${cout.essais} lancements de \`true\`)`);
    ligne("  temps", `${nombre(cout.cloisonneMs)} ms, contre ${nombre(cout.nuMs)} ms sans cloison : +${nombre(surcoutMs)} ms par lancement`);
    if (cout.memoireKo === null) ligne("  mémoire", "non mesurable sur cette machine (pas de /proc)");
    else {
      const seuil = configMachine(env).memoireMinMo;
      ligne("  mémoire", `${nombre(cout.memoireKo / 1024)} Mo résidents tant que le lancement vit (les process \`bwrap\`)`);
      ligne(`  à ${COOKS} cooks`, `+${nombre((cout.memoireKo * COOKS) / 1024)} Mo, +${nombre(surcoutMs * COOKS)} ms de démarrage cumulés — la station garde ${nombre(seuil, 0)} Mo libres (BRIGADE_MIN_FREE_MEMORY_MB)`);
    }
  }
  const manques = sondes.filter((sonde) => sonde.tient === false).length;
  console.log(manques === 0 ? "\nbrigade : la cloison tient ce qu'elle annonce — le filtre du réseau, lui, se lit au démarrage du runtime (`npm run cloison`)" : `\nbrigade : ${manques} sonde${manques > 1 ? "s" : ""} en échec : la cloison ne tient pas ce qu'elle annonce`);
  return manques === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);

if (args[0] === "eprouver" && args.length <= 2) {
  const essais = args[1] === undefined ? ESSAIS_PAR_DEFAUT : Number(args[1]);
  if (!Number.isSafeInteger(essais) || essais < 1) echouer(2, USAGE);
  try {
    process.exit(await jouerLesSondes(essais));
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, erreur.message);
    throw erreur;
  }
}
if (args.length !== 0) echouer(2, USAGE);
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);
const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
try {
  montrer(journal);
} finally {
  journal.fermer();
}
