// La cloison du projet, vue et éprouvée par le chef, depuis son propre process :
//   npm --prefix runtime run partition                        ce qui est masqué, ce que le réseau laisse passer, ce qu'il a refusé et pourquoi
//   npm --prefix runtime run partition -- probe [<essais>]     lance de vraies sondes dans la cloison, et mesure ce qu'elle coûte par cook
// L'ancien mot `eprouver` répond encore, en disant le nouveau (`commandes.ts`).
// La première lit le journal : aucune configuration à ouvrir. La seconde lit
// l'environnement du service, comme le runtime, et ne lance aucun cook.
import { existsSync } from "node:fs";
import { geste } from "./geste.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { configCloison, direFichiers, direReseau } from "./cloison.ts";
import { eprouver } from "./eprouver.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { configMachine, lireMemoireTotale, PART_MEMOIRE, seuilMemoire } from "./machine.ts";
import { AUTRES_HOTES } from "./porte.ts";
import { DECLARATION_RESEAU, direRegle, POURQUOI, reglesDuProjet } from "./reseau.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run partition -- [probe [<tries>]]";
const REFUS_MONTRES = 10;
const ESSAIS_PAR_DEFAUT = 20;
// Le parallélisme que le jalon vise (#98) : le coût d'un cook s'y multiplie.
const COOKS = 30;

const nombre = (valeur: number, decimales = 1) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });

export async function principal({ args: tapes, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  function montrer(journal: Journal): void {
    const etat = journal.duType("isolation.configured", 1)[0];
    if (etat === undefined) {
      return void dire("brigade : this log says nothing about the partition — the runtime has not started since it was introduced: restart it");
    }
    const { sandbox, proxy } = etat.payload;
    dire(`partition of project “${etat.project}”, as the runtime found it on ${etat.at}\n`);
    ligne("files", sandbox ? "PARTITIONED" : "OPEN");
    dire(`  ${direFichiers(sandbox)}`);
    if (sandbox) {
      dire("  a launch finds only its worktree and its own view of the clone's `.git` (the real objects, its own config, its own hooks); the account's home directory is read-only — what is written there, `~/.claude` included, belongs to the project; /tmp stays writable");
    }
    dire("");
    ligne("network", proxy ? (proxy.enforced === false ? "ALLOWLIST NOT ENFORCED" : "ALLOWLIST") : "OPEN");
    dire(`  ${direReseau(proxy)}`);
    if (!proxy) return;

    const declare = journal.duType("network.declared", 1)[0]?.payload;
    dire("\nwhat gets through");
    for (const regle of reglesDuProjet(declare?.hosts ?? [])) dire(`  ${direRegle(regle).padEnd(48)}${POURQUOI[regle.origine]}${regle.origine === "project" && declare ? `, on \`${declare.base}\`` : ""}`);
    for (const probleme of declare?.problems ?? []) dire(`  OPENS NOTHING — ${probleme}`);
    dire(`everything else is refused. To open a host: a line in \`${DECLARATION_RESEAU}\`, merged on the integration branch.`);

    const refus = journal.duType("network.refused", REFUS_MONTRES);
    dire(`\nlatest refusals${refus.length === 0 ? ": none" : ""}`);
    for (const { at, payload } of refus.reverse()) {
      if (payload.host === AUTRES_HOTES) {
        dire(`  ${at}  ${"other hosts still".padEnd(40)}${nombre(payload.count, 0)} attempts  past a hundred hosts refused in ten minutes, they are no longer named`);
        continue;
      }
      dire(`  ${at}  ${`${payload.host}:${payload.port}`.padEnd(40)}${payload.count > 1 ? `${nombre(payload.count, 0)} attempts  ` : ""}not on the allowlist`);
    }
  }

  async function jouerLesSondes(essais: number): Promise<number> {
    const etat = env.BRIGADE_STATE_DIR ?? "";
    const clone = env.BRIGADE_REPO_DIR || echouer(2, "BRIGADE_REPO_DIR is not set — run this command with the service's environment");
    const cloison = configCloison(env, { repertoireEtat: etat, clone });
    if (cloison === null) {
      dire(`brigade : nothing to probe — ${direFichiers(null)}`);
      return 1;
    }
    const { sondes, cout } = await eprouver(cloison, { claude: env.BRIGADE_CLAUDE_BIN || "claude", env, essais });
    for (const sonde of sondes) dire(`  ${(sonde.tient === true ? "holds" : sonde.tient === false ? "DOES NOT HOLD" : "unproven").padEnd(14)}${sonde.quoi} — ${sonde.detail}`);
    if (cout !== null) {
      const surcoutMs = Math.max(0, cout.cloisonneMs - cout.nuMs);
      dire(`\ncost of a partitioned launch (median of ${cout.essais} launches of \`true\`)`);
      ligne("  time", `${nombre(cout.cloisonneMs)} ms, against ${nombre(cout.nuMs)} ms without the partition: +${nombre(surcoutMs)} ms per launch`);
      if (cout.memoireKo === null) ligne("  memory", "not measurable on this machine (no /proc)");
      else {
        const seuil = seuilMemoire({ memoireTotale: lireMemoireTotale() }, configMachine(env));
        const origine = seuil.origine === "env" ? "BRIGADE_MIN_FREE_MEMORY_MB" : `default: ${PART_MEMOIRE * 100}% of the machine's ${nombre(seuil.origine.totalMb, 0)} MB, BRIGADE_MIN_FREE_MEMORY_MB to set it`;
        ligne("  memory", `${nombre(cout.memoireKo / 1024)} MB resident while the launch lives (the \`bwrap\` processes)`);
        ligne(`  at ${COOKS} cooks`, `+${nombre((cout.memoireKo * COOKS) / 1024)} MB, +${nombre(surcoutMs * COOKS)} ms of startup added up — the station keeps ${nombre(seuil.mo, 0)} MB free (${origine})`);
      }
    }
    const manques = sondes.filter((sonde) => sonde.tient === false).length;
    dire(manques === 0 ? `\nbrigade : the partition holds what it announces — the network filter, for its part, is read at runtime startup (\`${geste("partition", env)}\`)` : `\nbrigade : ${manques} probe${manques > 1 ? "s" : ""} failed: the partition does not hold what it announces`);
    return manques === 0 ? 0 : 1;
  }

  const args = enAnglais("partition", tapes, redire);
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);

  if (args[0] === "probe" && args.length <= 2) {
    const essais = args[1] === undefined ? ESSAIS_PAR_DEFAUT : Number(args[1]);
    if (!Number.isSafeInteger(essais) || essais < 1) echouer(2, USAGE);
    try {
      const code = await jouerLesSondes(essais);
      if (code !== 0) throw new Sortie(code);
      return;
    } catch (erreur) {
      if (erreur instanceof ConfigInvalide) echouer(2, erreur.message);
      throw erreur;
    }
  }
  if (args.length !== 0) echouer(2, USAGE);
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    montrer(journal);
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
