// Le grant `merge` vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run grant                              l'état du grant, ce qu'il en reste, ses derniers gestes et usages
//   npm --prefix runtime run grant -- activer merge             la pass merge ce qu'elle juge vert, sans échéance
//   npm --prefix runtime run grant -- activer merge --pour 4h   … pendant quatre heures, puis il s'éteint seul
//   npm --prefix runtime run grant -- activer merge --jusqu-a 18h30 --usages 10
//   npm --prefix runtime run grant -- prolonger merge --pour 2h  un grant en cours, sans le révoquer
//   npm --prefix runtime run grant -- revoquer merge            elle s'arrête à la PR ouverte
// Une échéance : `--jusqu-a` (2026-10-12, 2026-10-12T18:00, 18h30 — heure de la
// machine) ou `--pour` (30min, 4h, 2j), et `--usages <n>` ; `prolonger` prend
// aussi `--sans-echeance`.
// Une commande s'écrit dans le journal ; la pass du runtime qui tourne lit le
// grant à sa prochaine décision de merge, sans redémarrage.
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import type { ActionDeGrant } from "./evenements/pass.ts";
import { direSansGrant } from "./attend.ts";
import { duree } from "./etat.ts";
import { ACTIONS, commanderGrant, COMMANDES, direGrant, gestesDuGrant, GrantRefuse, lireEcheance, type Commande } from "./grant.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { bilanSansGrant, etatDuGrant, usagesDuGrant } from "./projections/pass.ts";

const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run grant -- [<commande> merge [<échéance>]]",
  "  activer merge [--jusqu-a <date ou heure> | --pour <durée>] [--usages <n>]",
  "  prolonger merge (--jusqu-a <date ou heure> | --pour <durée> | --usages <n> | --sans-echeance)",
  "  revoquer merge",
].join("\n");
const USAGES_MONTRES = 10;

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  // Ce qu'est devenu le merge que le grant a autorisé.
  const SUITES: Record<string, string> = { done: "mergée", failed: "non mergée" };

  function montrer(journal: Journal, maintenant: Date): void {
    const { base } = journal;
    for (const action of ACTIONS) ligne(`grant ${action}`, direGrant(etatDuGrant(base, action, maintenant), maintenant, duree));
    const gestes = gestesDuGrant(journal);
    ligne("derniers gestes", gestes.length === 0 ? "aucun" : "");
    for (const geste of gestes) dire(`  ${geste}`);
    const usages = usagesDuGrant(base, USAGES_MONTRES);
    ligne("derniers usages", usages.length === 0 ? "aucun" : "");
    for (const usage of usages) {
      const suite = usage.outcome === null ? "merge en cours" : (SUITES[usage.outcome] ?? usage.outcome);
      dire(`  ${usage.at}  #${usage.ticket}  ${usage.action} sur ${usage.base}  ${usage.pr}  ${usage.sha.slice(0, 7)}  verdict n° ${usage.verdict}  ${suite}`);
    }
    // Ce que le chef a fait de ce que la pass a arrêté faute de grant : de quoi décider de l'accorder.
    const sansGrant = direSansGrant(bilanSansGrant(base));
    if (sansGrant !== null) dire(sansGrant);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const [commande, action, ...options] = args;
  // Voir le grant n'écrit rien.
  const montre = args.length === 0;
  if (!montre && (!COMMANDES.includes(commande as Commande) || !ACTIONS.includes(action as ActionDeGrant))) echouer(2, USAGE);
  const maintenant = new Date();
  let echeance;
  try {
    echeance = lireEcheance(options, maintenant);
  } catch (erreur) {
    if (erreur instanceof GrantRefuse) echouer(2, `${erreur.message}\n${USAGE}`);
    throw erreur;
  }
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) montrer(journal, maintenant);
    else dire(`brigade : ${commanderGrant(journal, commande as Commande, action as ActionDeGrant, echeance, maintenant, duree)}`);
  } catch (erreur) {
    if (erreur instanceof GrantRefuse) {
      redire(`brigade : ${erreur.message}`);
      throw new Sortie(1);
    } else if (journalPasRejoue(erreur)) {
      // Rien ne donne leur forme du jour aux tables d'un journal écrit par un
      // runtime d'avant la pass, ou d'avant l'échéance des grants.
      redire("brigade : ce journal n'a pas encore l'état des grants : redémarrer le runtime, qui le recalcule");
      throw new Sortie(1);
    } else throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
