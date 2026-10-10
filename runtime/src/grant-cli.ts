// Le grant `merge` vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run grant                              l'état du grant, ce qu'il en reste, ses derniers gestes et usages
//   npm --prefix runtime run grant -- activer merge             la pass merge ce qu'elle juge vert, sans échéance
//   npm --prefix runtime run grant -- activer merge --pour 4h   … pendant quatre heures, puis il s'éteint seul
//   npm --prefix runtime run grant -- activer merge --jusqu-a 18h30 --usages 10
//   npm --prefix runtime run grant -- prolonger merge --pour 2h  un grant en cours, sans le révoquer
//   npm --prefix runtime run grant -- revoquer merge            elle s'arrête à la PR ouverte
//   npm --prefix runtime run grant -- essai [--depuis 7j]       l'essai à blanc : ce qu'elle aurait mergé, et ce que tu en as fait
// Une échéance : `--jusqu-a` (2026-10-12, 2026-10-12T18:00, 18h30 — heure de la
// machine) ou `--pour` (30min, 4h, 2j), et `--usages <n>` ; `prolonger` prend
// aussi `--sans-echeance`. `--depuis` : une date (2026-10-08, 2026-10-08T14:00)
// ou une durée (48h, 7j).
// Une commande s'écrit dans le journal ; la pass du runtime qui tourne lit le
// grant à sa prochaine décision de merge, sans redémarrage.
import { existsSync } from "node:fs";
import type { ActionDeGrant } from "./evenements/pass.ts";
import { LIRE_LES_ESSAIS, lireOptionsDEssai, montrerEssais } from "./essai.ts";
import { duree } from "./etat.ts";
import { ACTIONS, commanderGrant, COMMANDES, direGrant, gestesDuGrant, GrantRefuse, lireEcheance, type Commande } from "./grant.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { etatDuGrant, usagesDuGrant } from "./projections/pass.ts";

const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run grant -- [<commande> merge [<échéance>]]",
  "  activer merge [--jusqu-a <date ou heure> | --pour <durée>] [--usages <n>]",
  "  prolonger merge (--jusqu-a <date ou heure> | --pour <durée> | --usages <n> | --sans-echeance)",
  "  revoquer merge",
  "  essai [--depuis <date ou durée>]",
].join("\n");
const USAGES_MONTRES = 10;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(22)}${valeur}`);

// Ce qu'est devenu le merge que le grant a autorisé.
const SUITES: Record<string, string> = { done: "mergée", failed: "non mergée" };

function montrer(journal: Journal, maintenant: Date): void {
  const { base } = journal;
  for (const action of ACTIONS) ligne(`grant ${action}`, direGrant(etatDuGrant(base, action, maintenant), maintenant, duree));
  const gestes = gestesDuGrant(journal);
  ligne("derniers gestes", gestes.length === 0 ? "aucun" : "");
  for (const geste of gestes) console.log(`  ${geste}`);
  const usages = usagesDuGrant(base, USAGES_MONTRES);
  ligne("derniers usages", usages.length === 0 ? "aucun" : "");
  for (const usage of usages) {
    const suite = usage.outcome === null ? "merge en cours" : (SUITES[usage.outcome] ?? usage.outcome);
    console.log(`  ${usage.at}  #${usage.ticket}  ${usage.action} sur ${usage.base}  ${usage.pr}  ${usage.sha.slice(0, 7)}  verdict n° ${usage.verdict}  ${suite}`);
  }
  // Ce que la pass aurait mergé sans grant : de quoi décider de l'accorder.
  const essais = base.lire<{ combien: number }>("SELECT count(DISTINCT json_extract(payload, '$.pr')) AS combien FROM events WHERE type = 'pass.rehearsed'")[0]?.combien ?? 0;
  if (essais > 0) ligne("essai à blanc", `${essais} livraison${essais > 1 ? "s" : ""} verte${essais > 1 ? "s" : ""} arrêtée${essais > 1 ? "s" : ""} faute de grant — ce qu'elle aurait mergé : ${LIRE_LES_ESSAIS}`);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [commande, action, ...options] = args;
const essai = commande === "essai";
// Voir le grant et lire l'essai à blanc n'écrivent rien.
const montre = args.length === 0 || essai;
if (!montre && (!COMMANDES.includes(commande as Commande) || !ACTIONS.includes(action as ActionDeGrant))) echouer(2, USAGE);
const maintenant = new Date();
let echeance;
let depuis: string | null = null;
try {
  if (essai) depuis = lireOptionsDEssai(args.slice(1), maintenant);
  echeance = lireEcheance(essai ? [] : options, maintenant);
} catch (erreur) {
  if (erreur instanceof GrantRefuse) echouer(2, `${erreur.message}\n${USAGE}`);
  throw erreur;
}
// Une commande ouvre le journal en écriture : sans ce contrôle, elle en
// créerait un là où il n'y en a pas.
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
try {
  if (essai) for (const lue of montrerEssais(journal.tout(), depuis)) console.log(lue);
  else if (montre) montrer(journal, maintenant);
  else console.log(`brigade : ${commanderGrant(journal, commande as Commande, action as ActionDeGrant, echeance, maintenant, duree)}`);
} catch (erreur) {
  if (erreur instanceof GrantRefuse) {
    console.error(`brigade : ${erreur.message}`);
    process.exitCode = 1;
  } else if (journalPasRejoue(erreur)) {
    // Rien ne donne leur forme du jour aux tables d'un journal écrit par un
    // runtime d'avant la pass, ou d'avant l'échéance des grants.
    console.error("brigade : ce journal n'a pas encore l'état des grants : redémarrer le runtime, qui le recalcule");
    process.exitCode = 1;
  } else throw erreur;
} finally {
  journal.fermer();
}
