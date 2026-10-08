// Le grant `merge` vu et commandé par le chef, depuis son propre process :
//   npm --prefix runtime run grant                     l'état du grant, et ses derniers usages
//   npm --prefix runtime run grant -- activer merge    la pass merge ce qu'elle juge vert
//   npm --prefix runtime run grant -- revoquer merge   elle s'arrête à la PR ouverte
// Une commande s'écrit dans le journal ; la pass du runtime qui tourne lit le
// grant à sa prochaine décision de merge, sans redémarrage.
import { existsSync } from "node:fs";
import type { ActionDeGrant } from "./evenements/pass.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { etatDuGrant, usagesDuGrant } from "./projections/pass.ts";
import { sessionEnCours } from "./projections/sessions.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run grant -- [activer merge | revoquer merge]";
const AUTEUR = "chef";
const ACTIONS: ActionDeGrant[] = ["merge"];
const USAGES_MONTRES = 10;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(22)}${valeur}`);

// Ce qu'est devenu le merge que le grant a autorisé.
const SUITES: Record<string, string> = { done: "mergée", failed: "non mergée" };

function montrer(journal: Journal): void {
  const { base } = journal;
  for (const action of ACTIONS) {
    const grant = etatDuGrant(base, action);
    ligne(
      `grant ${action}`,
      grant === null
        ? "ABSENT — jamais donné : la pass s'arrête à la PR ouverte, rien n'est mergé"
        : grant.active
          ? `ACTIF depuis le ${grant.since} (par ${grant.by}) — une pass verte est mergée sans toi`
          : `RÉVOQUÉ depuis le ${grant.since} (par ${grant.by}) — la pass s'arrête à la PR ouverte`,
    );
  }
  const usages = usagesDuGrant(base, USAGES_MONTRES);
  ligne("derniers usages", usages.length === 0 ? "aucun" : "");
  for (const usage of usages) {
    const suite = usage.outcome === null ? "merge en cours" : (SUITES[usage.outcome] ?? usage.outcome);
    console.log(`  ${usage.at}  #${usage.ticket}  ${usage.action} sur ${usage.base}  ${usage.pr}  ${usage.sha.slice(0, 7)}  verdict n° ${usage.verdict}  ${suite}`);
  }
}

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction.
function commander(journal: Journal, commande: "activer" | "revoquer", action: ActionDeGrant): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
    const grant = etatDuGrant(base, action);
    const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : la commande vaudra à son prochain démarrage)";

    if (commande === "activer") {
      if (grant?.active) return `grant ${action} déjà actif depuis le ${grant.since}`;
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "grant.activated", payload: { action } });
      return `grant ${action} actif : toute pass verte à partir de maintenant est mergée par le runtime — pas les livraisons déjà arrêtées${absent}`;
    }
    if (!grant?.active) return `rien à révoquer : le grant ${action} n'est pas actif`;
    journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "grant.revoked", payload: { action } });
    return `grant ${action} révoqué : la pass s'arrête désormais à la PR ouverte${absent}`;
  });
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [commande, action] = args;
const montre = args.length === 0;
if (!montre && (args.length !== 2 || (commande !== "activer" && commande !== "revoquer") || !ACTIONS.includes(action as ActionDeGrant))) echouer(2, USAGE);
// Une commande ouvre le journal en écriture : sans ce contrôle, elle en
// créerait un là où il n'y en a pas.
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
try {
  if (montre) montrer(journal);
  else console.log(`brigade : ${commander(journal, commande as "activer" | "revoquer", action as ActionDeGrant)}`);
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant la pass.
  if (journalPasRejoue(erreur)) {
    echouer(1, "ce journal n'a pas encore l'état des grants : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
} finally {
  journal.fermer();
}
