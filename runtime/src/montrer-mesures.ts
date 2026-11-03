// Le relevé des mesures, en lecture seule :
//   npm --prefix runtime run measures                 par tranches de 10 merges
//   npm --prefix runtime run measures -- --by <n>     par tranches de <n> merges
//   npm --prefix runtime run measures -- --last <n>   les renvois des <n> derniers tickets servis (20 par défaut)
// Les tests verts seulement au rejeu de la CI se comptent sur les 10 derniers merges.
// L'ancienne option `--par` répond encore, en disant la nouvelle (`commandes.ts`).
// La commande n'écrit jamais, et répond pendant que le runtime tourne.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decrireReleve, PAR_DEFAUT } from "./mesures.ts";
import { decrireCauses, mesurerCauses } from "./causes-des-ratages.ts";
import { parcoursDesTickets } from "./parcours-des-tickets.ts";
import { mergedDeliveries, seuilsEnVigueur } from "./projections/measures.ts";
import { decrireRenvois, DERNIERS_PAR_DEFAUT, mesurerRenvois } from "./renvois.ts";
import { decrireRejeux, lireRejeux, mesurerRejeux } from "./tests-rejoues.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run measures -- [--by <number of merges>] [--last <number of tickets>]";

export function principal({ args: tapes, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const args = enAnglais("measures", tapes, redire);
  const repertoireEtat = env.BRIGADE_STATE_DIR;
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

  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const { base } = journal;
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null;
    for (const ligne of decrireReleve({ projet, livraisons: mergedDeliveries(base), seuils: seuilsEnVigueur(base) }, par)) dire(ligne);
    dire("");
    const parcours = parcoursDesTickets(base);
    for (const ligne of decrireRenvois(mesurerRenvois(parcours, derniers))) dire(ligne);
    dire("");
    for (const ligne of decrireCauses(mesurerCauses(parcours.slice(-derniers)))) dire(ligne);
    dire("");
    for (const ligne of decrireRejeux(mesurerRejeux(lireRejeux(base)))) dire(ligne);
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant ce relevé.
    if (journalPasRejoue(erreur)) echouer(1, "this log does not have the measures report yet: restart the runtime, which recomputes it");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
