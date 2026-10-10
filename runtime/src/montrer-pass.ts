// Montre la pass, en lecture seule :
//   npm --prefix runtime run pass               les livraisons : où en est leur jugement, leurs renvois, leur PR
//   npm --prefix runtime run pass -- <ticket>   l'histoire d'un ticket : chaque verdict, et ce qui l'a produit
import { direBaseRouge, direControleRetenu, direPanne } from "./dire-base.ts";
import { direEssai } from "./essai.ts";
import type { Evenement } from "./evenements.ts";
import type { ChoixDeReaction } from "./evenements/manager.ts";
import type { CI, Finding, Gates, Review } from "./evenements/pass.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { RENVOIS_MAX } from "./pass.ts";
import { controleRetenu, etatDeLaBase, lirePass, mergesAVerifier, passDuTicket, type PassDeTicket, type Phase } from "./projections/pass.ts";

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
  replaying: "verte, gates rejouées sur le résultat du merge",
  waiting: "EN ATTENTE — verte, non mergée",
  merging: "merge en cours",
  merged: "mergée",
  served: "servie sans merge — ticket sans diff",
  held: "ARRÊTÉE — verte, non mergée",
  returned: "rouge, renvoyée au cook",
  deferred: "rouge, au manager",
  escalated: "REMONTÉE AU CHEF",
  closed: "PR FERMÉE SANS MERGE",
};

// Passé les renvois de la pass, ce sont des relances que le manager a décidées.
const renvois = (pass: PassDeTicket) => {
  const relances = pass.returns - RENVOIS_MAX;
  return relances <= 0 ? `renvois ${pass.returns}/${RENVOIS_MAX}` : `renvois ${RENVOIS_MAX}/${RENVOIS_MAX}, ${relances} relance${relances > 1 ? "s" : ""} du manager`;
};

function decrire(pass: PassDeTicket): string {
  const phase = `${PHASES[pass.phase] ?? pass.phase}${pass.reason === null ? "" : ` (${pass.reason})`}`;
  return [`#${pass.ticket}`, phase, renvois(pass), `depuis ${pass.since}`, pass.pr ?? (pass.noDiff ? "sans diff" : null)].filter((champ) => champ !== null).join("  ");
}

const GATES: Record<Gates["outcome"], string> = { green: "vertes", red: "rouges", timeout: "arrêtées au plafond", skipped: "non jouées" };
// Le plafond de durée des gates, franchi : la pass ne le juge pas. Seul rouge,
// il laisse les gates vertes sous un code de sortie qui ne l'est pas.
const direPlafond = (gates: Gates) => (gates.overCeiling ? ", leur plafond de durée franchi mais non jugé" : "");
const direGates = (gates: Gates) =>
  `${GATES[gates.outcome] ?? gates.outcome}${gates.outcome === "green" ? direPlafond(gates) : ""}${gates.code === null ? "" : ` (code ${gates.code})`}`;
// Leurs lignes FAIL, puis ce dépassement — qui n'en est pas une pour la pass.
const echecs = (gates: Gates) => [
  ...gates.failures.map((echec) => `      ${echec}`),
  ...(gates.overCeiling ? [`      plafond de durée franchi, non jugé par la pass — ${gates.overCeiling.line}`] : []),
];
const CIS: Record<CI["outcome"], string> = { green: "verte", red: "rouge", none: "aucun check", skipped: "non lue" };

const REVIEWS: Record<Review["outcome"], string> = { green: "rien de bloquant", red: "bloquant", skipped: "non appelé" };

const constat = (finding: Finding) =>
  `      reviewer — ${finding.severity === "blocking" ? "BLOQUANT" : "remarque"}${finding.file === null ? "" : ` (${finding.file})`} : ${finding.text}`;

// Ce que le manager a fait d'une livraison que la pass lui a passée.
const REACTIONS: Record<ChoixDeReaction, string> = {
  retry: "renvoie au même calibrage",
  raise: "monte le calibrage",
  split: "redécoupe le ticket",
  escalate: "remonte au chef",
};

const indenter = (texte: string) => texte.split("\n").map((ligne) => `      ${ligne}`).join("\n");

// Une ligne par fait de la pass, puis ce qui a produit chaque verdict.
function raconter(evenement: Evenement): string[] {
  const tete = `  ${evenement.at}  `;
  switch (evenement.type) {
    case "pass.started":
      return [`${tete}jugement de ${evenement.payload.pr ?? "la livraison sans diff"} sur ${evenement.payload.sha.slice(0, 7)} (run ${evenement.payload.run})`];
    case "pass.pr-opened":
      return [`${tete}PR ouverte par la pass, la station n'ayant pas pu l'ouvrir : ${evenement.payload.pr}${evenement.payload.reconciled ? " — retrouvée après coup, au redémarrage" : ""}`];
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
      // Un verdict d'avant le reviewer n'en porte pas ; ni de déclarations, s'il
      // date d'avant que la pass ne les regarde.
      const declarations = evenement.payload.declarations ?? [];
      const review: Review | undefined = evenement.payload.review;
      const relu = review ? ` · reviewer ${REVIEWS[review.outcome] ?? review.outcome}${review.run === null ? "" : ` (run ${review.run})`}` : "";
      return [
        `${tete}verdict n° ${evenement.seq} : ${verdict === "green" ? "VERT" : "ROUGE"} — ${noDiff ? "ticket sans diff, ni gates ni CI" : `gates ${direGates(gates)} · CI ${CIS[ci.outcome] ?? ci.outcome}`}${relu}${judgeModified ? " · la livraison touche à ses juges" : ""}${declarations.length > 0 ? ` · elle touche à ce que le projet s'ouvre (${declarations.join(", ")})` : ""}`,
        ...echecs(gates),
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
    case "pass.rehearsed":
      return [`${tete}${direEssai(evenement.payload)}`];
    case "merge.done":
      return [
        `${tete}mergée ${evenement.payload.by === "pass" ? "par la pass" : "hors du runtime (à la main)"}${typeof evenement.payload.actor === "string" ? `, sous l'identité ${evenement.payload.actor}` : ""}${evenement.payload.reconciled ? " — constaté après coup, au redémarrage" : ""}`,
      ];
    case "merge.failed":
      return [`${tete}merge non abouti : ${evenement.payload.reason}`];
    case "pass.held":
      return [`${tete}la pass s'arrête là, sans merger : ${evenement.payload.reason}${typeof evenement.payload.expired === "string" ? ` — le grant s'était éteint seul le ${evenement.payload.expired}` : ""}`];
    case "pass.base-moved": {
      const { base, behind, overlap, replay } = evenement.payload;
      const avance = `la base a avancé de ${behind} commit${behind > 1 ? "s" : ""} sous cette livraison (${base.slice(0, 7)})`;
      return replay
        ? [`${tete}${avance}, sur des fichiers qu'elle touche aussi : gates rejouées sur le résultat du merge`, ...overlap.map((fichier) => `      ${fichier}`)]
        : [`${tete}${avance}, sans toucher à ses fichiers : mergée sans rejeu, les gates seront jouées sur la base après merge`];
    }
    case "pass.replayed": {
      const { base, gates, findings } = evenement.payload;
      return [
        `${tete}gates rejouées sur le résultat du merge dans ${base.slice(0, 7)} : ${gates.outcome === "skipped" ? "non jouées" : direGates(gates)}${gates.outcome === "green" ? "" : " — le verdict devient ROUGE"}`,
        ...echecs(gates),
        ...findings.map(indenter),
      ];
    }
    case "pass.outdated":
      return [`${tete}GitHub exige une branche à jour et refuse le merge — le verdict devient ROUGE`, ...evenement.payload.findings.map(indenter)];
    case "pass.waiting":
      return [`${tete}verte, en attente : ${evenement.payload.reason}`];
    case "base.checked": {
      const { sha, outcome, gates, red, reason } = evenement.payload;
      const pourquoi = reason === undefined ? "la base n'a pas de gates" : `l'essai ne s'est pas fait (${reason})`;
      const nonJouees = red === undefined ? `non jouées, ${pourquoi}` : `non jouées${direPanne(reason)} — la base reste ROUGE, un contrôle non joué ne lève pas le rouge constaté sur ${red.slice(0, 7)}`;
      const dit = outcome === "green" ? `vertes${direPlafond(gates)}` : outcome === "skipped" ? nonJouees : `ROUGES${gates.code === null ? "" : ` (code ${gates.code})`} — merges sous grant suspendus`;
      return [`${tete}gates jouées sur la base après merge (${sha.slice(0, 7)}) : ${dit}`, ...echecs(gates)];
    }
    case "pass.returned": {
      const { n } = evenement.payload;
      return [`${tete}${n <= RENVOIS_MAX ? `renvoi ${n}/${RENVOIS_MAX}` : `relance ${n - RENVOIS_MAX} décidée par le manager`} : les findings repartent à un cook`];
    }
    case "pass.deferred":
      return [`${tete}rouge : la pass passe la main au manager`];
    case "manager.reacted":
      return [`${tete}le manager ${REACTIONS[evenement.payload.choice] ?? evenement.payload.choice} — ${evenement.payload.reason}`];
    case "pass.escalated":
      return [`${tete}remontée au chef : ${evenement.payload.reason}`];
    case "pass.pr-closed":
      return [`${tete}PR fermée sans merge (${evenement.payload.pr}) : la pass ne suit plus cette livraison que pour un merge à la main`];
    case "pass.abandoned":
      return [`${tete}le ticket a quitté le rail : livraison lâchée, ${evenement.payload.pr !== null ? `sa PR reste ouverte (${evenement.payload.pr})` : evenement.payload.closed === true ? "sa PR fermée sans merge" : "sans PR ouverte"}`];
    default:
      return [];
  }
}

// Ce que le chef doit savoir de la base avant de lire les livraisons : rouge,
// plus rien n'est mergé sous grant, plus aucun ticket n'est pris.
function direBase(journal: Journal): string[] {
  const controle = etatDeLaBase(journal.base);
  const retenu = controleRetenu(journal.base);
  const aVerifier = mergesAVerifier(journal.base).map((ticket) => `#${ticket}`);
  const citer = (tickets: string[]) => (tickets.length === 0 ? "" : ` — après le merge de ${tickets.join(", ")}`);
  const rouge = controle?.outcome === "red";
  return [
    ...(rouge ? direBaseRouge(controle, retenu) : []),
    ...(aVerifier.length === 0 ? [] : [`base à vérifier${citer(aVerifier)} : ses gates sont à jouer sur elle-même`]),
    // Rouge, la retenue du contrôle est déjà dite avec elle.
    ...(rouge || retenu === null ? [] : [`${aVerifier.length === 0 ? "base : " : "  "}${direControleRetenu(retenu, (instant) => instant)}`]),
  ];
}

function montrerTicket(journal: Journal, ticket: number): void {
  const pass = passDuTicket(journal.base, ticket);
  // Le contrôle de la base est hors ticket : il se lit chez ceux dont il
  // vérifiait le merge.
  const histoire = journal
    .tout()
    .filter((evenement) => evenement.ticket === ticket || (evenement.type === "base.checked" && evenement.payload.tickets.includes(ticket)))
    .flatMap(raconter);
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
  for (const ligne of direBase(journal)) console.log(ligne);
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
