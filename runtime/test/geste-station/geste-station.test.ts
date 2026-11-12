// Un geste sur GitHub qu'un cook demande, la station le fait, et le cook
// reprend (#3136). Les tests passent par la station (`stationDuDepot`), sur un
// faux GitHub : le faux `claude` est un cook qui finit sur un `<bloque>`, ou le
// manager consulté, reconnu à la marque de sa consigne.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import type { GitHub } from "../../src/github.ts";
import { lireLesGestesDuManager, lireLesGestesGitHub } from "../../src/geste-station/geste-station.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const TICKET = 75;
const AUTRE = 80;
const TITRE_DU_GESTE = "**Station `box` — the cook asked for a GitHub gesture: the station made it, no card for the chef.**";
const TECHNIQUE = JSON.stringify({ issue: "technique", reponse: "go on", decision: "the cook goes on with the result posted on the ticket" });

// Une station dont le premier cook du ticket s'arrête bloqué sur `question`, et
// dont le manager lit le geste `geste` ; les suivants bloquent sur une question
// technique, à laquelle le manager répond. `echec` : l'erreur que GitHub rend
// à l'appel du geste.
async function demande(t: TestContext, { question, geste, issues, tours = 2, echec = null }: { question: string; geste: string; issues?: unknown[]; tours?: number; echec?: Error | null }) {
  const repertoire = mkdtempSync(join(tmpdir(), "geste-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Context\n\nAudit the closing pass.");
  faux.feu(AUTRE, ["bug", "triage"], "another issue");
  const cooks: string[][] = [];
  let consultations = 0;
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    let message: string;
    if (consulte) {
      consultations += 1;
      message = consultations === 1 ? JSON.stringify({ issue: "geste", geste, ...(issues === undefined ? {} : { issues_a_ouvrir: issues }), question_en: question }) : TECHNIQUE;
    } else {
      cooks.push(args);
      message = `I stopped.\n<livrable>\n<bloque>${cooks.length === 1 ? question : "Do I go on?"}</bloque>\n</livrable>`;
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client = fauxClient(faux);
  const bas = faux.pour("box");
  const appels: string[] = [];
  const relances: number[] = [];
  const echouer = () => {
    if (echec !== null) throw echec;
  };
  const github: GitHub = {
    ...client,
    creerIssue: async (issue) => {
      appels.push(`creerIssue ${issue.titre}`);
      echouer();
      return bas.creerIssue(issue);
    },
    commenter: async (numero, corps) => {
      if (numero !== TICKET) echouer();
      await client.commenter(numero, corps);
    },
    labelliser: async (numero, labels) => {
      appels.push(`labelliser #${numero} ${labels.join(",")}`);
      if (numero !== TICKET) echouer();
      await client.labelliser(numero, labels);
    },
    delabelliser: async (numero, label) => {
      appels.push(`delabelliser #${numero} ${label}`);
      if (numero !== TICKET) echouer();
      await client.delabelliser(numero, label);
    },
    relancerLesEchecs: async (run) => {
      echouer();
      relances.push(run);
    },
  };
  const avertissements: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: (texte) => void avertissements.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < tours; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const commentaires = (numero: number) => (faux.commentaires.get(numero) ?? []).map((c) => c.body);
  return { faux, cooks, appels, relances, avertissements, ticket: faux.ticket(TICKET), commentaires, consigneDuCook: (n: number) => cooks[n]?.[(cooks[n]?.indexOf("-p") ?? -2) + 1] ?? "" };
}

// Aucune carte du chef : ni `blocked-on-human` posé, ni commentaire de carte.
function sansCarte({ appels, ticket, commentaires }: Awaited<ReturnType<typeof demande>>) {
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "the ticket is not held for the chef");
  assert.equal(appels.some((appel) => appel.startsWith(`labelliser #${TICKET}`) && appel.includes(A_LA_MAIN)), false, "blocked-on-human is never set");
  assert.equal(commentaires(TICKET).some((corps) => corps.startsWith("**Gesture for the chef") || corps.startsWith("**Question for the chef")), false, "no TODO card for the chef");
}

// Le geste fait : son résultat sur le ticket, le label retiré, le ticket rendu
// à la cuisine, et le cook qui le reprend lit le résultat.
function repris(lu: Awaited<ReturnType<typeof demande>>, resultat: string) {
  const { ticket, cooks, appels, commentaires, consigneDuCook } = lu;
  const poste = commentaires(TICKET).find((corps) => corps.startsWith(TITRE_DU_GESTE));
  assert.ok(poste?.includes(`- ${resultat}`), poste ?? "no result posted");
  assert.ok(appels.includes(`delabelliser #${TICKET} ${A_LA_MAIN}`), "the blocking label is removed");
  assert.equal(ticket.labels.has(LABEL_TAKEN), false);
  assert.equal(ticket.labels.has("fire"), true, "the ticket stays on the rail");
  assert.equal(cooks.length, 2, "a cook resumed the ticket at the next turn");
  assert.ok(consigneDuCook(1).includes(resultat), "the resuming cook reads the result");
  assert.equal(commentaires(TICKET).some((corps) => corps.startsWith(MARQUE_D_ECHEC)), false, "a gesture made is not a failed cook");
  sansCarte(lu);
}

test("the 2026-11-10 case: the cook asks for an issue opened and its number recorded — the station opens it, posts its number on the ticket, removes the blocking label and the cook resumes, with no card for the chef", async (t) => {
  const lu = await demande(t, {
    question: "I found that the closing pass drops the last comment. Open an issue for this finding and give me its number, so I record it in my report.",
    geste: 'Run `gh issue create --repo faux/depot --title "Closing pass drops the last comment" --body "Found by the cook of #75." --label bug,triage`, then post the new issue number on #75 and remove `blocked-on-human`',
  });
  const [ouverte] = lu.faux.creations;
  assert.equal(ouverte, 900);
  assert.deepEqual(lu.appels.filter((appel) => appel.startsWith("creerIssue")), ["creerIssue Closing pass drops the last comment"], "the station opened it, once");
  assert.equal(lu.faux.ticket(900).corps, "Found by the cook of #75.");
  assert.deepEqual([...lu.faux.ticket(900).labels], ["bug", "triage"]);
  repris(lu, "#900 = Closing pass drops the last comment");
});

test("comment: the station posts it where the cook asked, says so on the ticket, and the cook resumes", async (t) => {
  const lu = await demande(t, { question: "Please tell #80 that its fix lands with this ticket.", geste: `\`gh issue comment ${AUTRE} --body "Fixed by #75, which lands with its PR."\`` });
  assert.deepEqual(lu.commentaires(AUTRE), ["Fixed by #75, which lands with its PR."]);
  repris(lu, `A comment is posted on #${AUTRE}.`);
});

test("set a label: the station sets it, says so on the ticket, and the cook resumes", async (t) => {
  const lu = await demande(t, { question: "#80 must be marked as a regression.", geste: `gh issue edit ${AUTRE} --add-label regression` });
  assert.equal(lu.faux.ticket(AUTRE).labels.has("regression"), true);
  repris(lu, `On #${AUTRE}: \`regression\` set.`);
});

test("remove a label: the station removes it, says so on the ticket, and the cook resumes", async (t) => {
  const lu = await demande(t, { question: "#80 is triaged now; its triage label must go.", geste: `Run \`gh pr edit ${AUTRE} --remove-label triage\`` });
  assert.equal(lu.faux.ticket(AUTRE).labels.has("triage"), false);
  repris(lu, `On #${AUTRE}: \`triage\` removed.`);
});

test("rerun a check: the station reruns its failed jobs, says so on the ticket, and the cook resumes", async (t) => {
  const lu = await demande(t, { question: "The flaky check of my PR must be rerun.", geste: "Run `gh run rerun 4242 --failed` on the PR's tests check" });
  assert.deepEqual(lu.relances, [4242]);
  repris(lu, "The failed jobs of run 4242 are rerun.");
});

test("a GitHub call that fails is reported on the ticket with its error: never dropped, never a card asking the chef to run the command", async (t) => {
  const lu = await demande(t, { question: "Open an issue for my finding.", geste: '`gh issue create --title "A finding" --body "details"`', tours: 1, echec: new Error("gh api repos/faux/depot/issues : HTTP 502 Bad Gateway") });
  const [rapport] = lu.commentaires(TICKET).filter((corps) => corps.startsWith(MARQUE_D_ECHEC));
  assert.match(rapport ?? "", /the cook asked for a GitHub gesture \(open an issue\), and the station's GitHub call failed: gh api repos\/faux\/depot\/issues : HTTP 502 Bad Gateway/);
  assert.equal(lu.commentaires(TICKET).some((corps) => corps.startsWith(TITRE_DU_GESTE)), false, "no success is claimed");
  assert.equal(lu.ticket.labels.has(LABEL_TAKEN), false, "the ticket is given back to the kitchen");
  sansCarte(lu);
});

test("a gesture that fails midway says what was already done, so nothing is redone blindly", async (t) => {
  const lu = await demande(t, { question: "Open an issue, then mark #999.", geste: '`gh issue create --title "A finding"` then `gh issue edit 999 --add-label regression`', tours: 1 });
  assert.deepEqual(lu.faux.creations, [900]);
  const [rapport] = lu.commentaires(TICKET).filter((corps) => corps.startsWith(MARQUE_D_ECHEC));
  assert.match(rapport ?? "", /\(change the labels of #999\), and the station's GitHub call failed: #999 inconnu \(already done: #900 = A finding\)/);
  sansCarte(lu);
});

// Le cas de #3228 : cinq issues de suivi demandées par le cook.
const SUIVIS = [
  { titre: "Closing pass drops the last comment", corps: "The closing pass reads one comment short.", suit: "the dropped last comment", labels: ["bug"] },
  { titre: "Pass ignores the design label", corps: "A `cook:design` delivery goes to review without its captures.", suit: "design deliveries without captures" },
  { titre: "Manager retranslates the cook's question", corps: "The card quotes the question twice.", suit: "the doubled question on the card" },
  { titre: "Station restart loses the wait", corps: "A waiting ticket is taken at once after a restart.", suit: "waits lost on restart" },
  { titre: "Gates time out on the app suite", corps: "The app suite exceeds the gates' clock on a loaded station.", suit: "" },
];

test("the #3228 case: the cook asks for five follow-up issues — the station opens the five with the cook's titles and bodies, posts one `<number> = <what it tracks>` line per issue, and the cook resumes with that list; nothing in TODO", async (t) => {
  const lu = await demande(t, {
    question: "Before I deliver, open these five follow-up issues and give me their numbers.",
    geste: "Open the five follow-up issues the cook listed",
    issues: SUIVIS,
  });
  assert.deepEqual(lu.faux.creations, [900, 901, 902, 903, 904]);
  assert.deepEqual(
    lu.appels.filter((appel) => appel.startsWith("creerIssue")),
    SUIVIS.map(({ titre }) => `creerIssue ${titre}`),
  );
  assert.deepEqual(lu.faux.creations.map((n) => lu.faux.ticket(n).corps), SUIVIS.map(({ corps }) => corps));
  assert.deepEqual([...lu.faux.ticket(900).labels], ["bug"]);
  const lignes = ["#900 = the dropped last comment", "#901 = design deliveries without captures", "#902 = the doubled question on the card", "#903 = waits lost on restart", "#904 = Gates time out on the app suite"];
  const poste = lu.commentaires(TICKET).find((corps) => corps.startsWith(TITRE_DU_GESTE)) ?? "";
  assert.deepEqual(poste.split("\n").filter((ligne) => ligne.startsWith("- ")), lignes.map((ligne) => `- ${ligne}`), "one line per issue");
  for (const ligne of lignes) repris(lu, ligne);
});

// Rien d'ouvert, aucune carte : le ticket dit pourquoi en une ligne.
function refuse(lu: Awaited<ReturnType<typeof demande>>, pourquoi: RegExp) {
  assert.deepEqual(lu.faux.creations, [], "no issue is opened");
  const [rapport] = lu.commentaires(TICKET).filter((corps) => corps.startsWith(MARQUE_D_ECHEC));
  const ligne = (rapport ?? "").split("\n")[1] ?? "";
  assert.match(ligne, /^Station `box`: the cook stopped without a delivery — the cook asked for a GitHub gesture the station makes, and the station could not make it: /);
  assert.match(ligne, pourquoi);
  assert.equal(lu.ticket.labels.has(LABEL_TAKEN), false, "the ticket is given back to the kitchen");
  sansCarte(lu);
}

test("a template command (`--title \"<title>\" --body \"<body>\"`) opens no placeholder issue: the ticket says why in one line, and no card reaches the chef", async (t) => {
  const lu = await demande(t, { question: "Open my five follow-up issues.", geste: 'For each of the five issues, run `gh issue create --title "<title>" --body "<body>" --label product-question`', tours: 1 });
  refuse(lu, /the title of the issue to open is the placeholder “<title>”, not the cook's title$/);
});

test("a listed follow-up issue with a placeholder or no body opens none of them: the station never opens half the list", async (t) => {
  const lu = await demande(t, { question: "Open my follow-up issues.", geste: "Open the cook's follow-up issues", issues: [SUIVIS[0], { titre: "Second finding", corps: "<body>", suit: "the second finding" }], tours: 1 });
  refuse(lu, /the body of follow-up issue 2 of 2 \(“Second finding”\) is the placeholder “<body>”, not the cook's content$/);
  const vide = await demande(t, { question: "Open my follow-up issues.", geste: "Open the cook's follow-up issues", issues: [{ titre: "A finding" }], tours: 1 });
  refuse(vide, /follow-up issue 1 of 1 \(“A finding”\) has no body$/);
});

test("“run `gh issue create` five times” is a GitHub gesture the station makes, written so it cannot run it: the ticket says why, never a card asking the chef to run the commands", async (t) => {
  const lu = await demande(t, { question: "Open my five follow-up issues.", geste: "Gesture for the chef: run `gh issue create` five times, once per finding of the cook", tours: 1 });
  refuse(lu, /not as commands it can run whole, with their real values: Gesture for the chef: run `gh issue create` five times/);
});

test("only the gh commands the station makes are read; any other gesture stays the chef's, whole", () => {
  assert.deepEqual(lireLesGestesGitHub("Run `gh issue create -t 'Title with \"quotes\"' -b \"line \\\"one\\\"\" -l a -l b,c`"), [{ sorte: "issue", titre: 'Title with "quotes"', corps: 'line "one"', labels: ["a", "b", "c"] }]);
  assert.deepEqual(lireLesGestesGitHub("gh pr comment #12 --body=done"), [{ sorte: "commentaire", numero: 12, corps: "done" }]);
  assert.deepEqual(lireLesGestesGitHub("`gh run rerun 7`"), [{ sorte: "relance", run: 7 }]);
  assert.deepEqual(lireLesGestesGitHub("`gh issue create -t A` then `gh issue edit 3 --add-label x --remove-label y`"), [
    { sorte: "issue", titre: "A", corps: "", labels: [] },
    { sorte: "labels", numero: 3, poser: ["x"], retirer: ["y"] },
  ]);
  for (const autre of [
    "Run `gh auth refresh -s project` under the station's account",
    "Grant the station write access to the repo",
    "`gh issue create -t A` then `gh secret set TOKEN`",
    '`gh issue create --title "$(cat title.txt)"`',
    "`gh issue create --title A --assignee chef`",
    "`gh issue create --body without-title`",
    '`gh issue create --repo other/repo --title "A"`',
    "`gh issue comment 3`",
    "`gh issue edit 3 --title B`",
    "`gh run rerun 7 --job 9`",
    "`gh issue create --title 'unclosed`",
  ]) {
    assert.equal(lireLesGestesGitHub(autre, "faux/depot"), null, autre);
  }
  assert.equal(lireLesGestesGitHub('`gh issue create -R faux/depot -t "A"`', null), null, "with no served repo known, no repo is assumed");
  assert.notEqual(lireLesGestesGitHub('`gh issue create -R Faux/Depot -t "A"`', "faux/depot"), null);
});

test("a gesture that is not the station's stays the chef's card; one the station makes but cannot read is refused, never carded", () => {
  const avis = (geste: string) => ({ issue: "geste" as const, geste });
  for (const chef of ["Run `gh auth refresh -s project` under the station's account", "Grant the station write access to the repo", "`gh issue create -t A` then `gh secret set TOKEN`", '`gh issue create --repo other/repo --title "A"`']) {
    assert.equal(lireLesGestesDuManager(avis(chef), "faux/depot"), null, chef);
  }
  for (const station of ["Run gh issue create five times", "`gh issue comment 3`", "`gh issue edit 3 --title B`", '`gh issue create -R faux/depot --title "$(cat t)"`']) {
    assert.ok("refus" in (lireLesGestesDuManager(avis(station), "faux/depot") ?? {}), station);
  }
  assert.deepEqual(lireLesGestesDuManager(avis("`gh issue create -t A -b B`"), null), { gestes: [{ sorte: "issue", titre: "A", corps: "B", labels: [] }] });
});
