// Montre la pass, en lecture seule :
//   npm --prefix runtime run pass               les livraisons : où en est leur jugement, leurs renvois, leur PR
//   npm --prefix runtime run pass -- <ticket>   l'histoire d'un ticket : chaque verdict, et ce qui l'a produit
import type { Evenement } from "./evenements.ts";
import type { CI, Finding, Gates, Review } from "./evenements/pass.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { RENVOIS_MAX } from "./pass.ts";
import { lirePass, passDuTicket, type PassDeTicket, type Phase } from "./projections/pass.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run pass -- [<ticket>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

// La phase d'une livraison telle que le chef la lit.
const PHASES: Record<Phase, string> = {
  cooking: "en cuisine",
  delivered: "livrée, à juger",
  judging: "jugement en cours",
  green: "verte, décision à prendre",
  red: "rouge, décision à prendre",
  merging: "merge en cours",
  merged: "mergée",
  served: "servie sans merge — ticket sans diff",
  held: "ARRÊTÉE — verte, non mergée",
  returned: "rouge, renvoyée au cook",
  escalated: "REMONTÉE AU CHEF",
};

const renvois = (pass: PassDeTicket) => `renvois ${pass.returns}/${RENVOIS_MAX}`;

function decrire(pass: PassDeTicket): string {
  const phase = `${PHASES[pass.phase] ?? pass.phase}${pass.reason === null ? "" : ` (${pass.reason})`}`;
  return [`#${pass.ticket}`, phase, renvois(pass), `depuis ${pass.since}`, pass.pr ?? (pass.noDiff ? "sans diff" : null)].filter((champ) => champ !== null).join("  ");
}

const GATES: Record<Gates["outcome"], string> = { green: "vertes", red: "rouges", timeout: "arrêtées au plafond", skipped: "non jouées" };
const CIS: Record<CI["outcome"], string> = { green: "verte", red: "rouge", none: "aucun check", skipped: "non lue" };

const REVIEWS: Record<Review["outcome"], string> = { green: "rien de bloquant", red: "bloquant", skipped: "non appelé" };

const constat = (finding: Finding) =>
  `      reviewer — ${finding.severity === "blocking" ? "BLOQUANT" : "remarque"}${finding.file === null ? "" : ` (${finding.file})`} : ${finding.text}`;

const indenter = (texte: string) => texte.split("\n").map((ligne) => `      ${ligne}`).join("\n");

// Une ligne par fait de la pass, puis ce qui a produit chaque verdict.
function raconter(evenement: Evenement): string[] {
  const tete = `  ${evenement.at}  `;
  switch (evenement.type) {
    case "pass.started":
      return [`${tete}jugement de ${evenement.payload.pr ?? "la livraison sans diff"} sur ${evenement.payload.sha.slice(0, 7)} (run ${evenement.payload.run})`];
    case "pass.reviewed": {
      const { outcome, review, summary, findings, reason, truncated } = evenement.payload;
      const dit = outcome === "unreadable" ? `ILLISIBLE (${reason})` : outcome === "green" ? "rien de bloquant" : "BLOQUANT";
      return [
        `${tete}relecture du reviewer (run ${review}) : ${dit}${truncated ? " — diff coupé dans sa consigne" : ""}`,
        ...(summary === null ? [] : [indenter(summary)]),
        ...findings.map(constat),
      ];
    }
    case "pass.judged": {
      const { verdict, gates, ci, findings, judgeModified, noDiff } = evenement.payload;
      // Un verdict d'avant le reviewer n'en porte pas.
      const review: Review | undefined = evenement.payload.review;
      const relu = review ? ` · reviewer ${REVIEWS[review.outcome] ?? review.outcome}${review.run === null ? "" : ` (run ${review.run})`}` : "";
      return [
        `${tete}verdict n° ${evenement.seq} : ${verdict === "green" ? "VERT" : "ROUGE"} — ${noDiff ? "ticket sans diff, ni gates ni CI" : `gates ${GATES[gates.outcome] ?? gates.outcome}${gates.code === null ? "" : ` (code ${gates.code})`} · CI ${CIS[ci.outcome] ?? ci.outcome}`}${relu}${judgeModified ? " · la livraison touche à ses juges" : ""}`,
        ...gates.failures.map((echec) => `      ${echec}`),
        ...ci.checks.map((check) => `      CI « ${check.name} » : ${check.conclusion}${check.url ? ` — ${check.url}` : ""}`),
        // Les constats bloquants du reviewer sont déjà parmi les findings.
        ...(verdict === "green" ? [] : findings.map(indenter)),
        ...(review?.findings ?? []).filter((finding) => finding.severity === "remark").map(constat),
      ];
    }
    case "pass.served":
      return [`${tete}servie sans merge : rien à merger, autorisé par le verdict n° ${evenement.payload.verdict}`];
    case "grant.used":
      return [`${tete}grant ${evenement.payload.action} utilisé : merge de ${evenement.payload.pr} sur ${evenement.payload.base}, autorisé par le verdict n° ${evenement.payload.verdict}`];
    case "merge.done":
      return [
        `${tete}mergée ${evenement.payload.by === "pass" ? "par la pass" : "hors du runtime (à la main)"}${evenement.payload.reconciled ? " — constaté après coup, au redémarrage" : ""}`,
      ];
    case "merge.failed":
      return [`${tete}merge non abouti : ${evenement.payload.reason}`];
    case "pass.held":
      return [`${tete}la pass s'arrête là, sans merger : ${evenement.payload.reason}`];
    case "pass.returned":
      return [`${tete}renvoi ${evenement.payload.n}/${RENVOIS_MAX} : les findings repartent à un cook`];
    case "pass.escalated":
      return [`${tete}remontée au chef : ${evenement.payload.reason}`];
    default:
      return [];
  }
}

function montrerTicket(journal: Journal, ticket: number): void {
  const pass = passDuTicket(journal.base, ticket);
  const histoire = journal.duTicket(ticket).flatMap(raconter);
  if (!pass && histoire.length === 0) {
    console.log(`le ticket #${ticket} n'est jamais passé par la pass`);
    return;
  }
  console.log(pass ? decrire(pass) : `#${ticket}  a quitté le rail`);
  for (const ligne of histoire) console.log(ligne);
}

function montrer(journal: Journal): void {
  // Un ticket encore en cuisine pour la première fois n'a rien à montrer ici.
  const livraisons = lirePass(journal.base).filter((pass) => pass.phase !== "cooking" || pass.returns > 0);
  if (livraisons.length === 0) console.log("aucune livraison en pass");
  for (const pass of livraisons) console.log(decrire(pass));
}

const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] !== undefined && !/^[1-9][0-9]*$/.test(args[0]))) echouer(2, USAGE);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  if (args[0] === undefined) montrer(journal);
  else montrerTicket(journal, Number(args[0]));
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant la pass.
  if (journalPasRejoue(erreur)) {
    echouer(1, "ce journal n'a pas encore l'état de la pass : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
} finally {
  journal.fermer();
}
