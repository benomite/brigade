// La base d'intégration vue et commandée par le chef, depuis son propre process :
//   npm --prefix runtime run base              ce que son dernier contrôle a dit
//   npm --prefix runtime run base -- rejouer   rouge, ses gates sont rejouées sans attendre un commit
// Une base rouge retient la cuisine : aucun ticket n'est pris, rien n'est mergé
// sous grant. La pass ne rejoue ses gates que si elle bouge — ou à ce geste,
// pour un rouge qui ne tient pas au code (un test instable, un délai dépassé).
// La demande s'écrit dans le journal ; la pass du runtime qui tourne la lit à
// son réveil, sans redémarrage.
import { existsSync } from "node:fs";
import { direBaseRouge, direControleRetenu, direPanne, direRejeu } from "./dire-base.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { controleRetenu, etatDeLaBase } from "./projections/pass.ts";
import { sessionEnCours } from "./projections/sessions.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run base -- [rejouer]";
const AUTEUR = "chef";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

function montrer(journal: Journal): void {
  const controle = etatDeLaBase(journal.base);
  const retenu = controleRetenu(journal.base);
  if (controle?.outcome === "red") {
    for (const ligne of direBaseRouge(controle, retenu)) console.log(ligne);
    return;
  }
  if (controle === null) console.log(retenu === null ? "base jamais contrôlée : aucun merge n'a encore eu à être vérifié sur elle" : "base jamais contrôlée");
  else if (controle.outcome === "green") console.log(`base verte au dernier contrôle, le ${controle.at} (${controle.sha.slice(0, 7)})`);
  else console.log(`base non contrôlée : ses gates n'ont pas pu être jouées le ${controle.at} (${controle.sha.slice(0, 7)})${direPanne(controle.reason)} — rien n'est retenu`);
  // Des merges attendent leur contrôle, et il ne part pas.
  if (retenu !== null) console.log(`  ${direControleRetenu(retenu, (instant) => instant)}`);
}

// Écrit la demande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction.
function rejouer(journal: Journal): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
    const controle = etatDeLaBase(base);
    if (controle?.outcome !== "red") return "rien à rejouer : la base n'est pas rouge";
    if (controle.recheck !== null) return `rejeu déjà demandé le ${controle.recheck.at} : ${direRejeu(controle.recheck, (instant) => instant, controleRetenu(base))}`;
    const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : la commande vaudra à son prochain démarrage)";
    journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "base.recheck-requested", payload: {} });
    return `rejeu demandé : la pass rejoue les gates de la base sur sa tête actuelle, sans attendre un commit — vertes, la retenue tombe ; rouges, elle reste. Si la machine sature ou si la base ne se rapatrie pas, il attend ; si l'essai ne se fait pas, le rouge reste et la demande est à refaire : \`run status\` dit lequel, et pourquoi${absent}`;
  });
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const montre = args.length === 0;
if (!montre && (args.length !== 1 || args[0] !== "rejouer")) echouer(2, USAGE);
// Une commande ouvre le journal en écriture : sans ce contrôle, elle en
// créerait un là où il n'y en a pas.
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
try {
  if (montre) montrer(journal);
  else console.log(`brigade : ${rejouer(journal)}`);
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant ce contrôle.
  if (journalPasRejoue(erreur)) {
    echouer(1, "ce journal n'a pas encore l'état de la base : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
} finally {
  journal.fermer();
}
