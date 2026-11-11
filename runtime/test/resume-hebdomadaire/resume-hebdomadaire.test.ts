// Le résumé hebdomadaire de la cuisine (#3261) contre un faux GitHub et une
// horloge fixée : au jour réglé (lundi par défaut), une fois par semaine ; un
// résumé par projet, rangé par thèmes, chaque ligne avec son ticket ; un
// markdown sans chemin, sans empreinte, sans « PR » ; l'autonomie quand ses
// chiffres existent, puis ce qui attend le chef ; gardé, relu, et notifié une
// fois par projet.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { entrerDansTodo, type Proposition } from "../../src/carte-todo.ts";
import type { IssueDepuis, PR } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as rapport } from "../../src/rapport-cli.ts";
import { reglagesDuTexte, ReglageRefuse, texteDuFichier } from "../../src/reglages-projet/reglages.ts";
import { DOSSIER_DES_RESUMES, fichierDuResume, lireLeResume, notifieurParMention, passerLeResume, type GitHubDuResume, type Notifieur, type OptionsDuResume } from "../../src/resume-hebdomadaire/cuisine.ts";
import { jourDuResume, semaineAResumer } from "../../src/resume-hebdomadaire/jour.ts";
import { pourUnProductOwner, resumeDeLaSemaine, TITRE_ATTENTE, TITRE_AUTONOMIE, type ResumeHebdomadaire } from "../../src/resume-hebdomadaire/resume.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

// Lundi 9 novembre 2026 : la semaine résumée va du lundi 2 au dimanche 8.
const LUNDI = "2026-11-09";
const a = (jour: string, heure = "10:00:00") => new Date(`${jour}T${heure}Z`);

type Ticket = { number: number; title: string; closedAt: string; merged: boolean; body?: string; labels?: string[]; evenements?: unknown[]; commentaires?: { body: string; association: string; createdAt: string }[] };

// Un faux GitHub : des issues fermées, la PR qui ferme chacune, les épiques ; il
// compte ses lectures et peut tomber.
function fauxGitHub(depot: string, tickets: Ticket[], options: { epiques?: Record<number, string>; evenements?: boolean } = {}) {
  let lectures = 0;
  let panne: string | null = null;
  const lire = () => {
    lectures++;
    if (panne !== null) throw new Error(panne);
  };
  const issue = (t: Ticket): IssueDepuis => ({ number: t.number, title: t.title, labels: t.labels ?? [], state: "closed", createdAt: "2026-10-01T00:00:00Z", updatedAt: t.closedAt, url: `https://github.com/${depot}/issues/${t.number}`, body: t.body ?? "", association: "OWNER", closedAt: t.closedAt });
  const github: GitHubDuResume = {
    async issuesDepuis(instant) {
      lire();
      return tickets.filter((t) => t.closedAt >= instant).map(issue);
    },
    async prQuiFerme(numero) {
      lire();
      const t = tickets.find((un) => un.number === numero);
      return t?.merged ? ({ number: 1000 + numero, url: "", base: "main", sha: "", state: "closed", merged: true, enRetard: false, mergeePar: null } satisfies PR) : null;
    },
    async issue(numero) {
      lire();
      const titre = options.epiques?.[numero];
      return titre === undefined ? null : { number: numero, title: titre, labels: [], state: "open", createdAt: "", updatedAt: "", url: "" };
    },
    async commentaires(numero) {
      lire();
      return (tickets.find((t) => t.number === numero)?.commentaires ?? []).map((c) => ({ ...c, author: "benomite" }));
    },
    ...(options.evenements === false
      ? {}
      : {
          async evenements(numero: number) {
            lire();
            return tickets.find((t) => t.number === numero)?.evenements ?? [];
          },
        }),
    async creerIssue() {
      return assert.fail("the summary does not create an issue under a fake notifier");
    },
    async fermerIssue() {
      return assert.fail("the summary does not close an issue under a fake notifier");
    },
  };
  return { github, lectures: () => lectures, tomber: (message: string | null) => void (panne = message) };
}

// Un faux notifieur : chaque résumé notifié ; il peut refuser.
function fauxNotifieur() {
  const recus: ResumeHebdomadaire[] = [];
  let refus: string | null = null;
  const notifieur: Notifieur = {
    async notifier(resume) {
      if (refus !== null) throw new Error(refus);
      recus.push(resume);
    },
  };
  return { notifieur, recus, refuser: (message: string | null) => void (refus = message) };
}

const PRODUIT: Proposition = {
  type: "product",
  raison: "product-choice",
  resume: "The ticket adds a saved list. It can be kept per project or shared by all of them.",
  enonce: "One list per project, or one for all projects?",
  choix: [{ texte: "One list per project." }, { texte: "One list for all projects." }],
};

const fire = (le: string) => ({ event: "labeled", label: { name: "fire" }, created_at: le });

// Un projet : son état, son journal (la file du chef), son faux GitHub, et un passage à un instant.
function projet(t: TestContext, nom: string, tickets: Ticket[], options: { epiques?: Record<number, string>; evenements?: boolean; reglages?: unknown; cartes?: number[] } = {}) {
  const repertoireEtat = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireEtat, { maintenant: () => a(LUNDI, "08:00:00") });
  aArreter(t, () => journal.fermer());
  for (const carte of options.cartes ?? []) entrerDansTodo(journal, nom, carte, PRODUIT, "manager");
  const depot = `acme/${nom}`;
  const gh = fauxGitHub(depot, tickets, options);
  const notif = fauxNotifieur();
  const dits: string[] = [];
  const opts = (le: Date): OptionsDuResume => ({ projet: nom, depot, repertoireEtat, github: gh.github, base: journal.base, reglages: () => options.reglages ?? { integrationBranch: "main" }, notifieur: notif.notifieur, avertir: (ligne) => dits.push(ligne), maintenant: () => le });
  return { repertoireEtat, gh, notif, dits, passer: (le: Date) => passerLeResume(opts(le)) };
}

const SERVIS: Ticket[] = [
  { number: 11, title: "Show the saved list on the home screen", closedAt: "2026-11-03T09:00:00Z", merged: true, body: "Epic: #5\n\nContext", evenements: [fire("2026-11-02T09:00:00Z")] },
  { number: 12, title: "fix: the list forgets its order after a restart", closedAt: "2026-11-05T09:00:00Z", merged: true, evenements: [fire("2026-11-04T09:00:00Z"), { event: "labeled", label: { name: "blocked-on-human" }, created_at: "2026-11-04T12:00:00Z" }] },
  { number: 13, title: "Export the list as a spreadsheet", closedAt: "2026-11-08T22:00:00Z", merged: true, evenements: [fire("2026-11-06T09:00:00Z")] },
  // Fermé sans merge, fermé avant la semaine, fermé après : aucun n'est servi cette semaine.
  { number: 14, title: "Won't do", closedAt: "2026-11-04T09:00:00Z", merged: false },
  { number: 15, title: "Served last week", closedAt: "2026-11-01T23:00:00Z", merged: true },
  { number: 16, title: "Served today", closedAt: "2026-11-09T01:00:00Z", merged: true },
];

test("unset, the summary is made on Monday only, once per week; with weeklySummaryDay set to thursday, on Thursday only, once per week (fake clock)", async (t) => {
  const p = projet(t, "alpha", SERVIS, { epiques: { 5: "Saved lists" } });
  assert.equal(await p.passer(a("2026-11-08")), "pas-le-jour");
  assert.equal(await p.passer(a("2026-11-10")), "pas-le-jour");
  assert.equal(p.notif.recus.length, 0);
  assert.equal(await p.passer(a(LUNDI)), "notifie");
  assert.equal(await p.passer(a(LUNDI, "18:00:00")), "deja-notifie");
  assert.equal(await p.passer(a("2026-11-12")), "pas-le-jour");
  assert.equal(await p.passer(a("2026-11-16")), "notifie");
  assert.deepEqual(p.notif.recus.map((r) => [r.weekStart, r.weekEnd]), [["2026-11-02", "2026-11-08"], ["2026-11-09", "2026-11-15"]]);

  const jeudi = projet(t, "beta", SERVIS, { reglages: { integrationBranch: "main", weeklySummaryDay: "thursday" } });
  assert.equal(await jeudi.passer(a(LUNDI)), "pas-le-jour");
  assert.equal(await jeudi.passer(a("2026-11-11")), "pas-le-jour");
  assert.equal(await jeudi.passer(a("2026-11-12")), "notifie");
  assert.equal(await jeudi.passer(a("2026-11-12", "23:00:00")), "deja-notifie");
  assert.equal(await jeudi.passer(a("2026-11-16")), "pas-le-jour");
  assert.equal(await jeudi.passer(a("2026-11-19")), "notifie");
  assert.deepEqual(jeudi.notif.recus.map((r) => [r.weekStart, r.weekEnd]), [["2026-11-05", "2026-11-11"], ["2026-11-12", "2026-11-18"]]);
  assert.deepEqual(semaineAResumer(a("2026-11-12"), "thursday")?.debut, a("2026-11-05", "00:00:00"));
});

test("a weeklySummaryDay that is not a day produces nothing and says why; the project settings refuse it, and write a valid one", async (t) => {
  assert.equal(jourDuResume(undefined), "monday");
  assert.equal(jourDuResume({ integrationBranch: "main" }), "monday");
  assert.throws(() => jourDuResume({ weeklySummaryDay: "Lundi" }), /not a day of the week/);
  const p = projet(t, "alpha", SERVIS, { reglages: { weeklySummaryDay: "someday" } });
  assert.equal(await p.passer(a(LUNDI)), "echec");
  assert.equal(p.notif.recus.length, 0);
  assert.equal(p.gh.lectures(), 0);
  assert.match(p.dits.join("\n"), /weekly summary — not produced: weeklySummaryDay is "someday"/);
  assert.equal(existsSync(join(p.repertoireEtat, DOSSIER_DES_RESUMES)), false);

  assert.throws(() => reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", weeklySummaryDay: "funday" })), (erreur) => erreur instanceof ReglageRefuse && erreur.cle === "weeklySummaryDay");
  const lus = reglagesDuTexte(JSON.stringify({ version: 1, integrationBranch: "main", weeklySummaryDay: "friday" }));
  assert.equal(lus.weeklySummaryDay, "friday");
  assert.match(texteDuFichier(lus), /"weeklySummaryDay": "friday"/);
});

test("a fixture week with served tickets in two projects gives two records, each with themes, every line with its ticketNumber and ticketUrl, and one notification per project", async (t) => {
  const alpha = projet(t, "alpha", SERVIS, { epiques: { 5: "Saved lists" } });
  const beta = projet(t, "beta", [{ number: 40, title: "Invite a teammate by email", closedAt: "2026-11-04T10:00:00Z", merged: true }]);
  assert.equal(await alpha.passer(a(LUNDI)), "notifie");
  assert.equal(await beta.passer(a(LUNDI)), "notifie");
  assert.equal(alpha.notif.recus.length, 1);
  assert.equal(beta.notif.recus.length, 1);
  const [ra] = alpha.notif.recus;
  const [rb] = beta.notif.recus;
  assert.ok(ra && rb);
  assert.equal(ra.project, "alpha");
  assert.equal(rb.project, "beta");
  assert.deepEqual(
    ra.themes.map((theme) => [theme.title, theme.lines.map((l) => l.ticketNumber)]),
    [["Saved lists", [11]], ["Improvements", [13]], ["Fixes", [12]]],
  );
  assert.deepEqual(rb.themes.map((theme) => theme.title), ["Improvements"]);
  for (const record of [ra, rb]) {
    assert.ok(record.themes.length > 0);
    for (const ligne of record.themes.flatMap((theme) => theme.lines)) {
      assert.ok(Number.isInteger(ligne.ticketNumber));
      assert.equal(ligne.ticketUrl, `https://github.com/acme/${record.project}/issues/${ligne.ticketNumber}`);
      assert.ok(record.markdown.includes(`([#${ligne.ticketNumber}](${ligne.ticketUrl}))`));
    }
  }
  assert.equal(ra.themes[2]?.lines[0]?.text, "Fixed: the list forgets its order after a restart");
  // Les deux sont gardés, chacun dans l'état de son projet, et se relisent par projet et par semaine.
  assert.deepEqual(lireLeResume(alpha.repertoireEtat, "alpha", "2026-11-02"), ra);
  assert.deepEqual(lireLeResume(beta.repertoireEtat, "beta", "2026-11-02"), rb);
  assert.equal(lireLeResume(alpha.repertoireEtat, "beta", "2026-11-02"), null);
  assert.equal(lireLeResume(alpha.repertoireEtat, "alpha", "2026-10-26"), null);
});

test("the markdown has no file path, no commit hash, and no 'PR' or 'pull request' wording", async (t) => {
  const jargon: Ticket[] = [
    { number: 21, title: "feat(#21): `runtime/src/rail.ts` shows the rail on the phone (PR #88)", closedAt: "2026-11-03T09:00:00Z", merged: true },
    { number: 22, title: "fix: revert 8b6cb9a in main.ts so the pull request list loads", closedAt: "2026-11-03T10:00:00Z", merged: true },
    { number: 23, title: "Merge pull request from cook/23-github: PRs list in docs/app.md and app/src/", closedAt: "2026-11-03T11:00:00Z", merged: true, body: "Epic: #6" },
    { number: 24, title: "Pick one and/or the other", closedAt: "2026-11-03T12:00:00Z", merged: true },
  ];
  const p = projet(t, "alpha", jargon, { epiques: { 6: "Rework of `app/src/vue/` (see 5dabed0)" }, cartes: [30] });
  assert.equal(await p.passer(a(LUNDI)), "notifie");
  const [record] = p.notif.recus;
  assert.ok(record);
  const texte = record.markdown.replace(/\]\(https:\/\/github\.com\/[^)]*\)/g, "]");
  assert.doesNotMatch(texte, /[\w-]+\.(?:ts|md|js|json)\b/);
  assert.doesNotMatch(texte, /\b(?:runtime|app|docs|src)\//);
  assert.doesNotMatch(texte, /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/i);
  assert.doesNotMatch(texte, /\bPRs?\b|pull request/i);
  assert.match(texte, /Pick one and\/or the other/);
  assert.equal(pourUnProductOwner("feat(#21): `runtime/src/rail.ts` shows the rail on the phone (PR #88)"), "shows the rail on the phone (change #88)");
});

test("with autonomy figures the markdown ends with the autonomy section then 'Waiting for the chef'; without them, no autonomy section and the waiting section still ends the text", async (t) => {
  const avec = projet(t, "alpha", SERVIS, { cartes: [30] });
  assert.equal(await avec.passer(a(LUNDI)), "notifie");
  const [r1] = avec.notif.recus;
  assert.ok(r1);
  assert.deepEqual(r1.autonomy, { tickets: 3, servedWithoutHuman: 2, shareWithoutHuman: 2 / 3, medianLeadTimeMs: 24 * 3600_000, sentBack: 0, shareSentBack: 0 });
  const titres = r1.markdown.split("\n").filter((ligne) => ligne.startsWith("## "));
  assert.deepEqual(titres.slice(-2), [`## ${TITRE_AUTONOMIE}`, `## ${TITRE_ATTENTE}`]);
  assert.match(r1.markdown, /- Served without asking you anything: 2 of 3 \(67%\)/);
  assert.deepEqual(r1.waiting, [{ text: "One list per project, or one for all projects?", ticketNumber: 30, ticketUrl: "https://github.com/acme/alpha/issues/30" }]);
  assert.match(r1.markdown, /## Waiting for the chef\n\n- One list per project, or one for all projects\? \(\[#30\]\(https:\/\/github\.com\/acme\/alpha\/issues\/30\)\)\n$/);

  // Sans lecture des événements, pas de chiffres : pas de section, l'attente finit le texte.
  const sans = projet(t, "beta", SERVIS, { evenements: false });
  assert.equal(await sans.passer(a(LUNDI)), "notifie");
  const [r2] = sans.notif.recus;
  assert.ok(r2);
  assert.equal(r2.autonomy, undefined);
  assert.doesNotMatch(r2.markdown, /Autonomy/);
  assert.match(r2.markdown, /\n## Waiting for the chef\n\nNothing is waiting for you\.\n$/);
  // Une semaine sans ticket compté n'a pas de chiffres non plus.
  const vide = resumeDeLaSemaine({ project: "gamma", weekStart: "2026-11-02", weekEnd: "2026-11-08", servis: [], autonomie: { debut: "", fin: "", tickets: 0, sansHumain: 0, partSansHumain: null, delaiMedianMs: null, renvoyes: 0, partRenvoyee: null, avecHumain: [] }, attentes: [] });
  assert.equal(vide.autonomy, undefined);
  assert.match(vide.markdown, /Nothing was served this week\.\n\n## Waiting for the chef\n\nNothing is waiting for you\.\n$/);
});

test("a GitHub read that fails writes nothing and is retried; a refused notification keeps the record and only renotifies; an unreadable file is left as is", async (t) => {
  const p = projet(t, "alpha", SERVIS);
  p.gh.tomber("HTTP 502");
  assert.equal(await p.passer(a(LUNDI)), "echec");
  assert.equal(existsSync(fichierDuResume(p.repertoireEtat, "2026-11-02")), false);
  assert.match(p.dits.join("\n"), /not produced, retried later today: HTTP 502/);
  p.gh.tomber(null);
  p.notif.refuser("no chef resolved");
  assert.equal(await p.passer(a(LUNDI, "10:10:00")), "echec");
  assert.ok(lireLeResume(p.repertoireEtat, "alpha", "2026-11-02"));
  assert.match(p.dits.join("\n"), /written, the chef not notified, retried later today: no chef resolved/);
  const lectures = p.gh.lectures();
  p.notif.refuser(null);
  assert.equal(await p.passer(a(LUNDI, "10:20:00")), "notifie");
  assert.equal(p.gh.lectures(), lectures, "renotified without reading GitHub again");
  assert.equal(p.notif.recus.length, 1);

  const q = projet(t, "beta", SERVIS);
  mkdirSync(join(q.repertoireEtat, DOSSIER_DES_RESUMES), { recursive: true });
  writeFileSync(fichierDuResume(q.repertoireEtat, "2026-11-02"), "{ not json");
  assert.equal(await q.passer(a(LUNDI)), "echec");
  assert.equal(readFileSync(fichierDuResume(q.repertoireEtat, "2026-11-02"), "utf8"), "{ not json");
  assert.equal(q.notif.recus.length, 0);
  assert.match(q.dits.join("\n"), /its file does not read, left as is/);
  assert.throws(() => lireLeResume(q.repertoireEtat, "beta", "2026-11-02"));
});

test("the mention notifier opens an issue whose body @-mentions the chef with the summary, closes it at once, and refuses without a chef", async () => {
  const record = resumeDeLaSemaine({ project: "alpha", weekStart: "2026-11-02", weekEnd: "2026-11-08", servis: [], attentes: [] });
  const creees: { titre: string; corps: string; labels: string[] }[] = [];
  const fermees: number[] = [];
  const github = {
    async creerIssue(issue: { titre: string; corps: string; labels: string[] }) {
      creees.push(issue);
      return 77;
    },
    async fermerIssue(numero: number) {
      fermees.push(numero);
    },
  };
  await notifieurParMention(github, () => "benomite").notifier(record);
  assert.equal(creees.length, 1);
  assert.equal(creees[0]?.titre, "Weekly kitchen summary — alpha, 2026-11-02 to 2026-11-08");
  assert.deepEqual(creees[0]?.labels, []);
  const lignes = creees[0]?.corps.split("\n") ?? [];
  assert.equal(lignes[0], "<!-- brigade:weekly-summary project=alpha week=2026-11-02 -->");
  assert.match(lignes[1] ?? "", /^@benomite /);
  assert.ok(creees[0]?.corps.endsWith(record.markdown));
  assert.deepEqual(fermees, [77]);
  await assert.rejects(notifieurParMention(github, async () => null).notifier(record), /no chef resolved/);
  assert.equal(creees.length, 1);
});

test("`report -- --week <date>` prints the project's stored summary as JSON, and fails when there is none", async (t) => {
  const p = projet(t, "alpha", SERVIS);
  assert.equal(await p.passer(a(LUNDI)), "notifie");
  const dits: string[] = [];
  const redits: string[] = [];
  rapport({ args: ["--week", "2026-11-02"], env: { BRIGADE_STATE_DIR: p.repertoireEtat, BRIGADE_PROJECT: "alpha" }, dire: (l) => dits.push(l), redire: (l) => redits.push(l) });
  assert.deepEqual(JSON.parse(dits.join("\n")), p.notif.recus[0]);
  assert.throws(() => rapport({ args: ["--week", "2026-10-26"], env: { BRIGADE_STATE_DIR: p.repertoireEtat, BRIGADE_PROJECT: "alpha" }, dire: () => {}, redire: (l) => redits.push(l) }));
  assert.match(redits.join("\n"), /no weekly summary of alpha for the week starting 2026-10-26/);
  assert.throws(() => rapport({ args: ["--week", "monday"], env: { BRIGADE_STATE_DIR: p.repertoireEtat }, dire: () => {}, redire: () => {} }));
});
