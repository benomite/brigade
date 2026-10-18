// Le grant `merge` vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run grant                              l'état du grant, ce qu'il en reste, ce qu'aucun grant n'autorise, ses derniers gestes et usages
//   npm --prefix runtime run grant -- enable merge             la pass merge ce qu'elle juge vert, sans échéance
//   npm --prefix runtime run grant -- enable merge --for 4h    … pendant quatre heures, puis il s'éteint seul
//   npm --prefix runtime run grant -- enable merge --until 18h30 --uses 10
//   npm --prefix runtime run grant -- extend merge --for 2h    un grant en cours, sans le révoquer
//   npm --prefix runtime run grant -- revoke merge             elle s'arrête à la PR ouverte
// Une échéance : `--until` (2026-10-12, 2026-10-12T18:00, 18h30 — heure de la
// box, UTC ; la commande dit ce qu'elle a compris avant d'écrire) ou `--for` (30min, 4h, 2d ; `2j` répond encore), et `--uses <n>` ; `extend` prend
// aussi `--no-expiry`. Les anciens mots (`activer`, `prolonger`, `revoquer`,
// `--jusqu-a`, `--pour`, `--usages`, `--sans-echeance`) répondent encore, en
// disant le nouveau (`commandes.ts`).
// Toute la sortie est en anglais ; l'app la relit, et lit aussi l'ancien français
// (app/src/grants.ts), car une box peut ne pas être à jour.
// Une commande s'écrit dans le journal ; la pass du runtime qui tourne lit le
// grant à sa prochaine décision de merge, sans redémarrage.
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import type { ActionDeGrant } from "./evenements/pass.ts";
import { direSansGrantEn } from "./attend.ts";
import { dureeEn as duree } from "./etat.ts";
import { ACTIONS, commanderGrant, COMMANDES, direCompris, direGrant, gestesDuGrant, GrantRefuse, JAMAIS_ACCORDEES, jamaisAccordee, lireEcheance, refuserJamaisAccordee, type Commande } from "./grant.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { bilanSansGrant, etatDuGrant, usagesDuGrant } from "./projections/pass.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run grant -- [<command> merge [<deadline>]]",
  "  enable merge [--until <date or time> | --for <duration>] [--uses <n>]",
  "  extend merge (--until <date or time> | --for <duration> | --uses <n> | --no-expiry)",
  "  revoke merge",
].join("\n");
const USAGES_MONTRES = 10;

export function principal({ args: tapes, env, dire, redire }: Appel): void {
  const args = enAnglais("grant", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  // Ce qu'est devenu le merge que le grant a autorisé.
  const SUITES: Record<string, string> = { done: "merged", failed: "not merged" };

  function montrer(journal: Journal, maintenant: Date): void {
    const { base } = journal;
    for (const action of ACTIONS) ligne(`grant ${action}`, direGrant(etatDuGrant(base, action, maintenant), maintenant, duree));
    JAMAIS_ACCORDEES.forEach(({ action, ligne: interdit }, i) => ligne(i === 0 ? "never granted" : "", `${action} — ${interdit}`));
    const gestes = gestesDuGrant(journal);
    ligne("latest actions", gestes.length === 0 ? "none" : "");
    for (const geste of gestes) dire(`  ${geste}`);
    const usages = usagesDuGrant(base, USAGES_MONTRES);
    ligne("latest uses", usages.length === 0 ? "none" : "");
    for (const usage of usages) {
      const suite = usage.outcome === null ? "merge under way" : (SUITES[usage.outcome] ?? usage.outcome);
      dire(`  ${usage.at}  #${usage.ticket}  ${usage.action} on ${usage.base}  ${usage.pr}  ${usage.sha.slice(0, 7)}  verdict no. ${usage.verdict}  ${suite}`);
    }
    // Ce que le chef a fait de ce que la pass a arrêté faute de grant : de quoi décider de l'accorder.
    const sansGrant = direSansGrantEn(bilanSansGrant(base));
    if (sansGrant !== null) dire(sansGrant);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [commande, action, ...options] = args;
  // Voir le grant n'écrit rien.
  const montre = args.length === 0;
  // Ce qu'aucun grant n'autorise est refusé avant tout le reste, quelle que
  // soit la commande : le refus s'écrit au journal, s'il y en a un.
  const interdite = jamaisAccordee(action);
  if (interdite) {
    const journal = existsSync(cheminJournal(repertoireEtat)) ? ouvrirJournal(repertoireEtat) : null;
    try {
      echouer(1, refuserJamaisAccordee(journal, interdite));
    } finally {
      journal?.fermer();
    }
  }
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
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  // L'heure donnée à `--until` est celle de la box, en UTC : la commande dit
  // ce qu'elle a compris avant toute autre ligne, et avant d'écrire.
  if (!montre && echeance.until !== undefined && options.includes("--until")) dire(`brigade : ${direCompris(echeance.until, maintenant, duree)}`);

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
      redire("brigade : this log does not have the grants' state yet: restart the runtime, which recomputes it");
      throw new Sortie(1);
    } else throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
