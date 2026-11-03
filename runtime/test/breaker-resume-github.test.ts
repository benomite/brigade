// Le chef reprend une cuisine retenue par son disjoncteur depuis GitHub (#2139) :
// un `/resume` posé par qui a la main sur le dépôt, après l'ouverture, sur
// l'issue ouverte labellisée `brigade:breaker-open`, referme le disjoncteur au
// sondage suivant — comme `guardrails resume`. Tout autre commentaire est ignoré.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { avecRail } from "../src/alimenter.ts";
import { LABEL_DU_DISJONCTEUR, reprendreParGitHub } from "../src/breaker-resume-github.ts";
import { brancherGardeFous } from "../src/garde-fous.ts";
import type { Commentaire, GitHub, Issue } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDesGardeFous } from "../src/projections/guardrails.ts";
import { demarrer } from "../src/runtime.ts";
import { fauxGitHub, issue } from "./aides/cuisine.ts";
import { aArreter, DEPOT, ENV_ENFANT, FAUX_CLAUDE, horloge, JOUR_HORLOGE, jusqua, repertoireTemporaire } from "./outils.ts";

const OUVERT_LE = `${JOUR_HORLOGE}T10:00:00.000Z`;
const APRES = `${JOUR_HORLOGE}T10:05:00Z`;
const ISSUE = 600;

// GitHub, tel que ce module le lit : les issues qui ont bougé depuis un instant,
// et les commentaires de chacune. Un commentaire posé fait bouger son issue.
function github() {
  const issues = new Map<number, Issue>();
  const commentaires = new Map<number, Commentaire[]>();
  const lectures = { issues: 0, commentaires: 0 };
  const faux: GitHub = {
    ...fauxGitHub().github,
    async issuesDepuis(instant) {
      lectures.issues++;
      return [...issues.values()].filter((lue) => Date.parse(lue.updatedAt) >= Date.parse(instant)).map((lue) => ({ ...lue, body: "", association: "OWNER" }));
    },
    async commentaires(numero) {
      lectures.commentaires++;
      return commentaires.get(numero) ?? [];
    },
  };
  return {
    github: faux,
    lectures,
    ouvrir: (numero = ISSUE, autres: Partial<Issue> = {}) => void issues.set(numero, issue(numero, [LABEL_DU_DISJONCTEUR], { updatedAt: OUVERT_LE, ...autres })),
    commenter(numero: number, body: string, { association = "COLLABORATOR", createdAt = APRES, author = "chef" } = {}) {
      commentaires.set(numero, [...(commentaires.get(numero) ?? []), { body, author, association, createdAt }]);
      const connue = issues.get(numero);
      if (connue) issues.set(numero, { ...connue, updatedAt: createdAt > connue.updatedAt ? createdAt : connue.updatedAt });
    },
  };
}

// Un journal dont le disjoncteur s'est ouvert à OUVERT_LE.
function disjoncte(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(OUVERT_LE) });
  aArreter(t, () => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  const ouvert = () => etatDesGardeFous(journal.base).breakerOpenedAt !== null;
  const reprises = () => journal.tout().filter((fait) => fait.type === "kitchen.resumed").map((fait) => fait.author);
  return { journal, ouvert, reprises };
}

test("un `/resume` d'un collaborateur, posé après l'ouverture sur l'issue labellisée, referme le disjoncteur comme `guardrails resume`", async (t) => {
  const { journal, ouvert, reprises } = disjoncte(t);
  const gh = github();
  gh.ouvrir();
  gh.commenter(ISSUE, "/resume");

  const fait = await reprendreParGitHub(journal, gh.github);

  assert.deepEqual(fait, { quoi: "reprise", dit: "breaker closed: cooks can be launched again (no runtime is running: the command will apply at its next start)", issue: ISSUE, author: "chef", createdAt: APRES });
  assert.equal(ouvert(), false);
  // Le fait même qu'écrit la commande du chef.
  assert.deepEqual(reprises(), ["chef"]);
  // Refermé, il ne se rejoue pas, et GitHub n'est plus lu.
  const lues = { ...gh.lectures };
  assert.deepEqual(await reprendreParGitHub(journal, gh.github), { quoi: "rien" });
  assert.deepEqual(gh.lectures, lues);
  assert.deepEqual(reprises(), ["chef"]);
});

test("le propriétaire et les membres reprennent aussi la cuisine ; le corps se lit sans ses blancs autour", async (t) => {
  for (const association of ["OWNER", "MEMBER"]) {
    const { journal, ouvert } = disjoncte(t);
    const gh = github();
    gh.ouvrir();
    gh.commenter(ISSUE, "/resume\n", { association });
    assert.equal((await reprendreParGitHub(journal, gh.github)).quoi, "reprise");
    assert.equal(ouvert(), false);
  }
});

const IGNORES: Array<[string, (gh: ReturnType<typeof github>) => void]> = [
  ["d'un auteur qui n'a pas la main sur le dépôt", (gh) => gh.commenter(ISSUE, "/resume", { association: "NONE" })],
  ["d'un contributeur sans droit d'écriture", (gh) => gh.commenter(ISSUE, "/resume", { association: "CONTRIBUTOR" })],
  ["posé avant l'ouverture du disjoncteur", (gh) => gh.commenter(ISSUE, "/resume", { createdAt: `${JOUR_HORLOGE}T09:59:59Z` })],
  ["posé à l'instant même de l'ouverture", (gh) => gh.commenter(ISSUE, "/resume", { createdAt: OUVERT_LE })],
  ["dont le corps dit autre chose", (gh) => gh.commenter(ISSUE, "/resume please")],
  ["dont le corps cite la commande", (gh) => gh.commenter(ISSUE, "> /resume")],
  ["sans la barre", (gh) => gh.commenter(ISSUE, "resume")],
];

for (const [cas, poser] of IGNORES) {
  test(`un commentaire ${cas} ne referme pas le disjoncteur`, async (t) => {
    const { journal, ouvert, reprises } = disjoncte(t);
    const gh = github();
    gh.ouvrir();
    poser(gh);

    assert.deepEqual(await reprendreParGitHub(journal, gh.github), { quoi: "rien" });
    assert.equal(gh.lectures.commentaires, 1);
    assert.equal(ouvert(), true);
    assert.deepEqual(reprises(), []);
  });
}

test("sans issue labellisée ouverte, il n'y a rien à faire : un `/resume` ailleurs, ou sur l'issue fermée, ne compte pas", async (t) => {
  const { journal, ouvert } = disjoncte(t);
  const gh = github();
  assert.deepEqual(await reprendreParGitHub(journal, gh.github), { quoi: "rien" });

  // Une issue sans le label, et l'issue du disjoncteur, fermée.
  gh.ouvrir(601, { labels: ["fire"] });
  gh.commenter(601, "/resume");
  gh.ouvrir(ISSUE, { state: "closed" });
  gh.commenter(ISSUE, "/resume");

  assert.deepEqual(await reprendreParGitHub(journal, gh.github), { quoi: "rien" });
  assert.equal(gh.lectures.commentaires, 0);
  assert.equal(ouvert(), true);
});

test("le disjoncteur fermé, rien n'est lu sur GitHub", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const gh = github();
  gh.ouvrir();
  gh.commenter(ISSUE, "/resume");

  assert.deepEqual(await reprendreParGitHub(journal, gh.github), { quoi: "rien" });
  assert.deepEqual(gh.lectures, { issues: 0, commentaires: 0 });
});

test("dans le runtime, le sondage qui suit le `/resume` du chef referme le disjoncteur, et un cook peut repartir", async (t) => {
  const gh = github();
  gh.ouvrir(ISSUE, { updatedAt: `${JOUR_HORLOGE}T09:00:00Z` });
  const runtime = brancherGardeFous(
    { plafonds: { durationMs: 60 * 60_000, tokens: 2_000_000, idleMs: 10 * 60_000 }, seuilDisjoncteur: 1, graceMs: 2000 },
    avecRail(demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 2, maintenant: horloge() }), {
      depot: DEPOT,
      dureeBailMs: 600_000,
      gh: "gh",
      github: gh.github,
    }),
  );
  t.after(() => runtime.arreter("test"));
  const cook = (ticket: number, scenario: string) => runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario } });
  const ouvert = () => etatDesGardeFous(runtime.journal.base).breakerOpenedAt !== null;

  await cook(7, "echec").fin;
  assert.equal(ouvert(), true);
  assert.throws(() => cook(8, "fini"), /disjoncteur/);

  // Un commentaire qui ne compte pas : un sondage le lit, le disjoncteur reste ouvert.
  gh.commenter(ISSUE, "/resume", { association: "NONE", createdAt: `${JOUR_HORLOGE}T12:00:00Z` });
  await jusqua(() => gh.lectures.commentaires > 0);
  assert.equal(ouvert(), true);

  gh.commenter(ISSUE, "/resume", { createdAt: `${JOUR_HORLOGE}T12:01:00Z` });
  await jusqua(() => !ouvert());
  assert.deepEqual(
    runtime.journal.tout().filter((fait) => fait.type === "kitchen.resumed").map((fait) => fait.author),
    ["chef"],
  );
  assert.equal((await cook(8, "fini").fin).outcome, "ok");
});
