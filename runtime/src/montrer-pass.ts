// Montre la pass, en lecture seule — sauf `--relaunch`, le geste du chef sur une livraison coincée :
//   npm --prefix runtime run pass               les livraisons : où en est leur jugement, leurs renvois, leur PR
//   npm --prefix runtime run pass -- <ticket>   l'histoire d'un ticket : chaque verdict, et ce qui l'a produit
//   npm --prefix runtime run pass -- <ticket> --json   la même lecture pour l'app : les étapes du ticket et ce qu'il a coûté, un objet JSON sur une ligne (`histoire-ticket.ts`)
//   npm --prefix runtime run pass -- <ticket> --relaunch   relancer le jugement d'une livraison coincée — livrée, jamais jugée, rien dans sa pass —, par la file de la pass ; refusé, rien n'est écrit et la commande sort en 1 (`file-de-la-pass.ts`)
// Et l'issue GitHub de la carte, pour sa fiche dans l'app (`issue-ticket.ts`) :
//   npm --prefix runtime run pass -- <ticket> issue             la lire : son corps, puis ses commentaires du plus ancien au plus récent, chacun avec son auteur et sa date — un objet JSON sur une ligne
//   npm --prefix runtime run pass -- <ticket> comment <texte>   y poster `<texte>`, un seul argument, tel quel — sa seule écriture sur GitHub, et le résultat en JSON sur une ligne
//   npm --prefix runtime run pass -- <ticket> ask [<texte>]     la demande à écrire dans le second : elle nomme l'issue (numéro, titre) et `<texte>`, le contexte saisi — vide, l'issue seule ; rien n'est posté ni écrit, l'app l'inscrit
// Ces trois-là lisent GitHub, pas le journal : elles réclament BRIGADE_GITHUB_REPO,
// pas BRIGADE_STATE_DIR. Elles passent par le `gh` du compte du service
// (BRIGADE_GH_BIN), comme `manager -- backlog` : le commentaire du chef part
// sous ce compte, jamais sous l'App d'un rôle — il n'est ni le manager, ni la
// pass. Une carte sans issue, ou un texte vide, sort en 1 avec `found: false`
// ou `done: false` et sa raison, et rien n'est posté ; une panne de GitHub sort
// en 1, dite sur la sortie d'erreur.
import { existsSync } from "node:fs";
import { configRail } from "./alimenter.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { direBaseRougeEn, direControleRetenuEn, direPanneEn } from "./dire-base.ts";
import { direSansGrantEn } from "./attend.ts";
import { workflowsAttendus } from "./activites.ts";
import type { Base } from "./base.ts";
import type { Evenement } from "./evenements.ts";
import { relancerLeJugement, tourAttendu } from "./file-de-la-pass.ts";
import type { Resultat } from "./geste-ticket.ts";
import type { ChoixDeReaction } from "./events/manager.ts";
import { DIRE_GATES_COUPEES_EN, GATES_COUPEES, motifDArret, motifDeRemontee, type CI, type Finding, type Gates, type Review } from "./events/pass.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { ouvrirGitHub } from "./github.ts";
import { histoireDuTicket } from "./histoire-ticket.ts";
import { commenterIssue, demanderAuSecond, lireIssue, type Demande, type Lecture } from "./issue-ticket.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { RENVOIS_MAX } from "./pass.ts";
import { bilanSansGrant, controleRetenu, etatDeLaBase, lirePass, mergesAVerifier, passDuTicket, type PassDeTicket, type Phase } from "./projections/pass.ts";
import { ConfigInvalide } from "./runtime.ts";
import { DIRE_VERDICT } from "./second-juge.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run pass -- [<ticket> [--json | --relaunch]]",
  "        BRIGADE_GITHUB_REPO=<owner>/<repo> npm --prefix runtime run pass -- <ticket> (issue | comment <text> | ask [<text>])",
].join("\n");

// Seules `issue`, `comment` et `ask` attendent quelque chose — GitHub : les autres rendent la main aussitôt.
export function principal({ args, env, dire, redire }: Appel): void | Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  // La phase d'une livraison telle que le chef la lit.
  const PHASES: Record<Phase, string> = {
    cooking: "taken",
    delivered: "delivered, to be judged",
    judging: "being judged",
    green: "green, decision to make",
    red: "red, decision to make",
    waiting: "QUEUED — neither judged nor merged for now",
    merging: "merging",
    merged: "merged",
    served: "served without a merge — ticket with no diff",
    held: "STOPPED — green, not merged",
    returned: "red, returned to the cook",
    deferred: "red, with the manager",
    escalated: "ESCALATED",
    closed: "PR CLOSED WITHOUT MERGE",
  };

  // Passé les renvois de la pass, ce sont des relances que le manager a décidées.
  const renvois = (pass: PassDeTicket) => {
    const relances = pass.returns - RENVOIS_MAX;
    return relances <= 0 ? `returns ${pass.returns}/${RENVOIS_MAX}` : `returns ${RENVOIS_MAX}/${RENVOIS_MAX}, ${relances} restart${relances > 1 ? "s" : ""} by the manager`;
  };

  // Livrée, elle attend son tour : une autre livraison est dans sa pass.
  const direTour = (tour: { tenant: number; devant: number }) =>
    `delivered, waiting for its turn — #${tour.tenant} is in its pass, ${tour.devant === 0 ? "next in line" : `${tour.devant} ahead of it`}`;

  // Une livraison jugée qui attend la CI dit quels workflows elle attend.
  const attendus = (base: Base, pass: PassDeTicket) => {
    const workflows = pass.phase === "judging" ? workflowsAttendus(base, pass) : null;
    return workflows === null ? "" : ` — waiting for the CI of ${workflows}`;
  };

  function decrire(base: Base, pass: PassDeTicket): string {
    const tour = tourAttendu(base, pass.ticket);
    const phase = `${tour === null ? (PHASES[pass.phase] ?? pass.phase) : direTour(tour)}${pass.reason === null ? "" : ` (${pass.reason}${pass.cause === null ? "" : `: ${pass.cause}`})`}${pass.phase === "waiting" && pass.reason === GATES_COUPEES ? ` — ${DIRE_GATES_COUPEES_EN}` : ""}${attendus(base, pass)}`;
    // Hors du rail, le numéro est celui de la PR, et personne n'y est renvoyé.
    return [pass.horsRail ? `PR #${pass.ticket}  off the rail (run ${pass.run})` : `#${pass.ticket}`, phase, pass.horsRail ? null : renvois(pass), `since ${pass.since}`, pass.pr ?? (pass.noDiff ? "no diff" : null)]
      .filter((champ) => champ !== null)
      .join("  ");
  }

  const GATES: Record<Gates["outcome"], string> = { green: "green", red: "red", timeout: "stopped at the cap", skipped: "not played" };
  // Le plafond de durée des gates, franchi : la pass ne le juge pas. Seul rouge,
  // il laisse les gates vertes sous un code de sortie qui ne l'est pas.
  const direPlafond = (gates: Gates) => (gates.overCeiling ? ", their duration cap exceeded but not judged" : "");
  const direGates = (gates: Gates) =>
    `${GATES[gates.outcome] ?? gates.outcome}${gates.outcome === "green" ? direPlafond(gates) : ""}${gates.code === null ? "" : ` (code ${gates.code})`}`;
  // Leurs lignes FAIL, puis ce dépassement — qui n'en est pas une pour la pass.
  const echecs = (gates: Gates) => [
    ...gates.failures.map((echec) => `      ${echec}`),
    ...(gates.overCeiling ? [`      duration cap exceeded, not judged by the pass — ${gates.overCeiling.line}`] : []),
  ];
  const CIS: Record<CI["outcome"], string> = { green: "green", red: "red", none: "no check", skipped: "not read" };

  const REVIEWS: Record<Review["outcome"], string> = { green: "nothing blocking", red: "blocking", skipped: "not called" };

  const constat = (finding: Finding) =>
    `      reviewer — ${finding.severity === "blocking" ? "BLOCKING" : "remark"}${finding.file === null ? "" : ` (${finding.file})`}: ${finding.text}`;

  // Ce que le manager a fait d'une livraison que la pass lui a passée.
  const REACTIONS: Record<ChoixDeReaction, string> = {
    retry: "returns it at the same calibration",
    raise: "raises the calibration",
    split: "splits the ticket again",
    escalate: "escalates to the chef",
  };

  // Le motif d'un arrêt ou d'une remontée, et ce qui le précise.
  const direMotif = ({ reason, cause }: { reason: string; cause: string | null }) => `${reason}${cause === null ? "" : `: ${cause}`}`;

  const indenter = (texte: string) => texte.split("\n").map((ligne) => `      ${ligne}`).join("\n");

  // Une ligne par fait de la pass, puis ce qui a produit chaque verdict.
  function raconter(evenement: Evenement): string[] {
    const tete = `  ${evenement.at}  `;
    switch (evenement.type) {
      case "pass.entered":
        return [`${tete}entered the pass off the rail: ${evenement.payload.pr}, branch ${evenement.payload.branch} (run ${evenement.payload.run})`];
      case "pass.relaunched":
        return [`${tete}judgement relaunched by the chef: the delivery of run ${evenement.payload.run} is queued in the pass`];
      case "pass.started":
        return [`${tete}judging ${evenement.payload.pr ?? "the delivery with no diff"} on ${evenement.payload.sha.slice(0, 7)} (run ${evenement.payload.run})`];
      case "pass.pr-opened":
        return [`${tete}PR opened by the pass, the station not having been able to open it: ${evenement.payload.pr}${evenement.payload.reconciled ? " — found again afterwards, at restart" : ""}`];
      case "pass.reviewed": {
        const { outcome, review, summary, findings, reason, truncated } = evenement.payload;
        const dit = outcome === "unreadable" ? `UNREADABLE (${reason})` : outcome === "green" ? "nothing blocking" : "BLOCKING";
        return [
          `${tete}reviewer's read (run ${review}): ${dit}${truncated ? " — diff cut in its brief" : ""}`,
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
          `${tete}verdict no. ${evenement.seq}: ${verdict === "green" ? "GREEN" : "RED"} — ${noDiff ? "ticket with no diff, neither gates nor CI" : `gates ${direGates(gates)} · CI ${CIS[ci.outcome] ?? ci.outcome}`}${relu}${judgeModified ? " · the delivery touches its judges" : ""}${declarations.length > 0 ? ` · it touches what the project opens up (${declarations.join(", ")})` : ""}`,
          // Ce sur quoi il porte. Un verdict d'avant — la branche seule — ne le dit pas.
          ...(typeof evenement.payload.base === "string"
            ? [`      judged: ${evenement.payload.sha.slice(0, 7)} merged with the base ${evenement.payload.base.slice(0, 7)} — ${typeof evenement.payload.merged === "string" ? `tree ${evenement.payload.merged.slice(0, 7)}` : "the merge does not go through"}`]
            : []),
          ...echecs(gates),
          ...ci.checks.map((check) => `      CI “${check.name}”: ${check.conclusion}${check.url ? ` — ${check.url}` : ""}`),
          // Les constats bloquants du reviewer sont déjà parmi les findings.
          ...(verdict === "green" ? [] : findings.map(indenter)),
          ...(review?.findings ?? []).filter((finding) => finding.severity === "remark").map(constat),
        ];
      }
      case "pass.ci-rerun": {
        const { sha, runs, checks, tests, alreadyJudged } = evenement.payload;
        const reruns = `run${runs.length > 1 ? "s" : ""} ${runs.join(", ")}`;
        return [
          alreadyJudged
            ? `${tete}CI red on ${sha.slice(0, 7)} in a run a red verdict already judged: failed jobs rerun (${reruns}) before judging again — a return never judges the same CI run twice`
            : `${tete}CI red on ${sha.slice(0, 7)} only on tests the delivery does not touch: failed jobs rerun once (${reruns}) — no return, no card`,
          ...checks.map((check) => `      CI “${check.name}”: ${check.conclusion}${check.url ? ` — ${check.url}` : ""}`),
          ...tests.map((test) => `      failing test: ${test}`),
        ];
      }
      case "pass.test-fix-opening":
        return [`${tete}opening the \`fix\` ticket of the unstable test ${evenement.payload.test}`];
      case "pass.ci-set-aside": {
        const { sha, checks, fixes } = evenement.payload;
        return [
          `${tete}CI red on ${sha.slice(0, 7)} again after its rerun, on the same tests the delivery does not touch: set aside, the delivery is judged without it — no return, no card`,
          ...checks.map((check) => `      CI “${check.name}”: ${check.conclusion}${check.url ? ` — ${check.url}` : ""}`),
          ...fixes.map(({ test, issue, reused }) => `      unstable test: ${test} — \`fix\` ticket #${issue}${reused ? " (already open)" : ""}`),
        ];
      }
      case "pass.ci-excused": {
        const { sha, base, checks } = evenement.payload;
        return [
          `${tete}CI red on ${sha.slice(0, 7)} in jobs never green on ${base}: reported, not judged — no return, no card`,
          ...checks.map((check) => `      CI “${check.name}”: ${check.conclusion}${check.url ? ` — ${check.url}` : ""} — not been green on ${base}`),
        ];
      }
      case "pass.ci-awaited":
        return [`${tete}no check yet on ${evenement.payload.sha.slice(0, 7)}: waiting for the CI of ${evenement.payload.workflows.join(", ")} (runs on PRs to the base)`];
      case "pass.second-judged": {
        const { verdict, reason, judge, model, effort, reviewer } = evenement.payload;
        const par = judge === null ? "not launched" : `run ${judge}, ${model} / ${effort} — the reviewer reads in ${reviewer.model} / ${reviewer.effort}`;
        return [`${tete}second judge (${par}): ${DIRE_VERDICT[verdict] ?? verdict}`, indenter(reason)];
      }
      case "pass.served":
        return [`${tete}served without a merge: nothing to merge, authorized by verdict no. ${evenement.payload.verdict}`];
      case "grant.used":
        return [`${tete}grant ${evenement.payload.action} used: merge of ${evenement.payload.pr} into ${evenement.payload.base}, authorized by verdict no. ${evenement.payload.verdict}`];
      case "merge.done":
        return [
          `${tete}merged ${evenement.payload.by === "pass" ? "by the pass" : "outside the runtime (by hand)"}${typeof evenement.payload.actor === "string" ? `, under the identity ${evenement.payload.actor}` : ""}${evenement.payload.reconciled ? " — noticed afterwards, at restart" : ""}`,
        ];
      case "merge.failed":
        return [`${tete}merge did not go through: ${evenement.payload.reason}`];
      case "pass.held":
        return [`${tete}the pass stops there, without merging: ${direMotif(motifDArret(evenement.payload))}${typeof evenement.payload.expired === "string" ? ` — the grant had lapsed on its own on ${evenement.payload.expired}` : ""}`];
      // Ces deux-là ne s'écrivent plus : la pass jugeait alors la branche seule,
      // puis sa rencontre avec la base au moment de merger.
      case "pass.base-moved": {
        const { base, behind, overlap, replay } = evenement.payload;
        const avance = `the base moved ahead by ${behind} commit${behind > 1 ? "s" : ""} under this delivery (${base.slice(0, 7)})`;
        return replay
          ? [`${tete}${avance}, on files it also touches: gates replayed on the result of the merge`, ...overlap.map((fichier) => `      ${fichier}`)]
          : [`${tete}${avance}, without touching its files: merged without a replay, the gates will be played on the base after the merge`];
      }
      case "pass.replayed": {
        const { base, gates, findings } = evenement.payload;
        return [
          `${tete}gates replayed on the result of the merge into ${base.slice(0, 7)}: ${gates.outcome === "skipped" ? "not played" : direGates(gates)}${gates.outcome === "green" ? "" : " — the verdict becomes RED"}`,
          ...echecs(gates),
          ...findings.map(indenter),
        ];
      }
      case "pass.outdated":
        return [`${tete}GitHub requires an up-to-date branch and refuses the merge — the verdict becomes RED`, ...evenement.payload.findings.map(indenter)];
      case "pass.waiting":
        return [
          `${tete}queued, neither judged nor merged for now: ${evenement.payload.reason}${evenement.payload.reason === GATES_COUPEES ? ` — ${DIRE_GATES_COUPEES_EN}` : ""}`,
        ];
      case "base.checked": {
        const { sha, outcome, gates, red, reason } = evenement.payload;
        const pourquoi = reason === undefined ? "the base has no gates" : `the attempt did not run (${reason})`;
        const nonJouees = red === undefined ? `not played, ${pourquoi}` : `not played${direPanneEn(reason)} — the base stays RED, a check that was not played does not lift the red found on ${red.slice(0, 7)}`;
        const dit = outcome === "green" ? `green${direPlafond(gates)}` : outcome === "skipped" ? nonJouees : `RED${gates.code === null ? "" : ` (code ${gates.code})`} — judgments and merges suspended`;
        return [`${tete}gates played on the base alone (${sha.slice(0, 7)}): ${dit}`, ...echecs(gates)];
      }
      case "pass.returned": {
        const { n, kitchen } = evenement.payload;
        if (kitchen === true) return [`${tete}sent back by the kitchen, using up no return: the findings go back to a cook`];
        return [`${tete}${n <= RENVOIS_MAX ? `return ${n}/${RENVOIS_MAX}` : `restart ${n - RENVOIS_MAX} decided by the manager`}: the findings go back to a cook`];
      }
      case "pass.kitchen-fix-opening":
        return [`${tete}opening the kitchen's \`fix\` ticket on this escalation (${evenement.payload.cause})`];
      case "pass.kitchen-took-over": {
        const { cause, move, issue, reconciled, from, to, reason } = evenement.payload;
        const dit = (calibrage: { model: string; effort: string } | undefined) => (calibrage === undefined ? "?" : `${calibrage.model} / ${calibrage.effort}`);
        const fait = {
          return: "sent back once to a cook",
          fix: `\`fix\` ticket #${issue ?? "?"} opened on its cause${reconciled === true ? " (found again by its marker)" : ""} — the ticket waits for it, set aside`,
          resume: issue === undefined ? "its raised calibration read by the rail: sent back to a cook" : `its \`fix\` ticket #${issue} left the rail: sent back to a cook`,
          raise: `calibration raised from ${dit(from)} to ${dit(to)} — the ticket goes back to a cook once the rail reads it`,
          drop: `dropped, \`fire\` removed — ${reason ?? "the reason is on its issue"}`,
          none: "set aside by a runtime from before #1861: the kitchen takes the escalation up again",
        }[move];
        return [`${tete}the kitchen takes up the escalation (${cause}), not the chef: ${fait}`];
      }
      case "pass.deferred":
        return [`${tete}red: the pass hands over to the manager`];
      case "manager.reacted":
        return [`${tete}the manager ${REACTIONS[evenement.payload.choice] ?? evenement.payload.choice} — ${evenement.payload.reason}`];
      case "pass.escalated":
        return [`${tete}escalated: ${direMotif(motifDeRemontee(evenement.payload))}`];
      case "pass.pr-closed":
        return [`${tete}PR closed without merge (${evenement.payload.pr}): the pass follows this delivery only for a merge by hand — off the rail, not at all`];
      case "pass.abandoned":
        return [`${tete}the ticket left the rail: delivery dropped, ${evenement.payload.pr !== null ? `its PR stays open (${evenement.payload.pr})` : evenement.payload.closed === true ? "its PR closed without merge" : "with no open PR"}`];
      default:
        return [];
    }
  }

  // Ce que le chef doit savoir de la base avant de lire les livraisons : rouge,
  // plus rien n'est jugé ni mergé, plus aucun ticket n'est pris.
  function direBase(journal: Journal): string[] {
    const controle = etatDeLaBase(journal.base);
    const retenu = controleRetenu(journal.base);
    const aVerifier = mergesAVerifier(journal.base).map((ticket) => `#${ticket}`);
    const citer = (tickets: string[]) => (tickets.length === 0 ? "" : ` — after the merge of ${tickets.join(", ")}`);
    const rouge = controle?.outcome === "red";
    return [
      ...(rouge ? direBaseRougeEn(controle, retenu) : []),
      ...(aVerifier.length === 0 ? [] : [`base to check${citer(aVerifier)}: its gates are to be played on itself`]),
      // Rouge, la retenue du contrôle est déjà dite avec elle.
      ...(rouge || retenu === null ? [] : [`${aVerifier.length === 0 ? "base: " : "  "}${direControleRetenuEn(retenu, (instant) => instant, "since")}`]),
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
      dire(`ticket #${ticket} has never been through the pass`);
      return;
    }
    // Hors du rail, la pass cesse de suivre une livraison mergée, ou fermée sans merge.
    const horsRail = histoire.length > 0 && journal.duTicket(ticket).some((evenement) => evenement.type === "pass.entered");
    dire(pass ? decrire(journal.base, pass) : horsRail ? `PR #${ticket}  off the rail — the pass no longer follows it` : `#${ticket}  left the rail`);
    for (const ligne of histoire) dire(ligne);
  }

  function montrer(journal: Journal): void {
    // Un ticket encore en cuisine pour la première fois n'a rien à montrer ici.
    const livraisons = lirePass(journal.base).filter((pass) => pass.phase !== "cooking" || pass.returns > 0);
    for (const ligne of direBase(journal)) dire(ligne);
    if (livraisons.length === 0) dire("no delivery in pass");
    for (const pass of livraisons) dire(decrire(journal.base, pass));
    const sansGrant = direSansGrantEn(bilanSansGrant(journal.base));
    if (sansGrant !== null) dire(sansGrant);
  }

  // L'issue de la carte, lue — ou commentée si `texte` n'est pas null — à
  // l'instant sur GitHub. Le JSON dit la réponse, refus compris ; le code de
  // sortie, si elle est un refus.
  async function surLIssue(ticket: number, texte: string | null, demander = false): Promise<void> {
    let rail: ReturnType<typeof configRail>;
    try {
      rail = configRail(env);
    } catch (erreur) {
      if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
      throw erreur;
    }
    // Un geste du chef : la box ne retient aucun de ses appels (limite-github.ts).
    const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste" });
    let reponse: Lecture | Resultat | Demande;
    try {
      reponse = demander ? await demanderAuSecond(github, ticket, texte) : texte === null ? await lireIssue(github, ticket) : await commenterIssue(github, ticket, texte);
    } catch (erreur) {
      const quoi = demander ? `the request to the second for #${ticket} was not composed` : texte === null ? `the issue of #${ticket} was not read` : `GitHub did not confirm the comment on #${ticket}`;
      echouer(1, `${quoi}: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    } finally {
      github.fermer();
    }
    dire(JSON.stringify(reponse));
    if (!("found" in reponse ? reponse.found : reponse.done)) throw new Sortie(1);
  }

  const [numero, geste] = args;
  if (geste === "issue" || geste === "comment" || geste === "ask") {
    const attendus = geste === "issue" ? [2] : geste === "comment" ? [3] : [2, 3];
    if (!/^[1-9][0-9]*$/.test(numero ?? "") || !attendus.includes(args.length)) echouer(2, USAGE);
    return surLIssue(Number(numero), geste === "issue" ? null : (args[2] ?? ""), geste === "ask");
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const json = args.length === 2 && args[1] === "--json";
  const relancer = args.length === 2 && args[1] === "--relaunch";
  if (args.length > 2 || (args.length === 2 && !json && !relancer) || (args[0] !== undefined && !/^[1-9][0-9]*$/.test(args[0]))) echouer(2, USAGE);
  // La seule écriture au journal de cette commande. Ouvert en écriture, il
  // serait créé là où il n'y en a pas : sans journal, rien n'est relancé.
  if (relancer && !existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: !relancer });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    if (args[0] === undefined) montrer(journal);
    else if (relancer) {
      const relance = relancerLeJugement(journal, Number(args[0]));
      if (!relance.fait) echouer(1, relance.raison);
      dire(`brigade : ${relance.message}`);
    } else if (json) dire(JSON.stringify(histoireDuTicket(journal.base, Number(args[0]))));
    else montrerTicket(journal, Number(args[0]));
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant la pass.
    if (journalPasRejoue(erreur)) {
      echouer(1, "this log does not have the pass state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
