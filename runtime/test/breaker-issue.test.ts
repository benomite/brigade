// Le disjoncteur vu de GitHub (#2138) : son ouverture crée une issue labellisée
// qui dit pourquoi, une seconde ouverture n'en crée pas d'autre, et sa
// fermeture commente puis ferme l'issue. Un faux client GitHub tient les issues.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  brancherIssueDuDisjoncteur,
  DEFINITION_DU_LABEL,
  disjoncteurDuJournal,
  LABEL_DU_DISJONCTEUR,
  publieurDuDisjoncteur,
  clientGitHubDuDisjoncteur,
  publierLeDisjoncteur,
  type ClientDuDisjoncteur,
} from "../src/breaker-issue.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirLimite } from "../src/limite-github.ts";
import type { CauseReveil, Runtime } from "../src/runtime.ts";
import { DEPOT, fauxGh, jusqua, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const OUVERTURE = "2026-11-03T12:00:00.000Z";
const REPRISE = "2026-11-03T14:30:00.000Z";

// Une cuisine dont le test tient l'horloge, au seuil de deux échecs d'affilée.
function cuisine(t: TestContext) {
  let instant = "2026-11-03T11:00:00.000Z";
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait });
  noter({ type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 2 } } as Fait);
  let runs = 0;
  const echouer = (ticket: number, code: number | null) => {
    const run = `${ticket}-${String(++runs).padStart(8, "0")}`;
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl` } } as Fait, ticket);
    noter({ type: "cook.exited", payload: { run, outcome: "failed", code, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } } as Fait, ticket);
  };
  // Deux échecs d'affilée, le second de #2087 sorti en 1 : le disjoncteur s'ouvre à `ouverture`.
  const disjoncter = (ouverture = OUVERTURE) => {
    echouer(2086, 2);
    echouer(2087, 1);
    instant = ouverture;
    noter({ type: "breaker.opened", payload: { failures: 2, threshold: 2 } } as Fait);
  };
  const reprendre = () => {
    instant = REPRISE;
    noter({ type: "kitchen.resumed", payload: {} } as Fait);
  };
  return { journal, disjoncter, reprendre };
}

type IssueFausse = { numero: number; titre: string; corps: string; labels: string[]; ouverte: boolean; commentaires: string[] };

// GitHub tel que le disjoncteur le voit : les issues du dépôt, ses labels, et chaque geste reçu.
function fauxGitHub(depart: IssueFausse[] = []) {
  const issues = [...depart];
  const labels = new Set<string>(issues.flatMap((issue) => issue.labels));
  const gestes: string[] = [];
  let panne: Error | null = null;
  const client: ClientDuDisjoncteur = {
    async ouvertesAuLabel(label) {
      gestes.push(`lire ${label}`);
      if (panne) throw panne;
      return issues.filter((issue) => issue.ouverte && issue.labels.includes(label)).map(({ numero, corps }) => ({ numero, corps }));
    },
    async assurerLabel(label) {
      gestes.push(`label ${label.name}`);
      labels.add(label.name);
    },
    async creer({ titre, corps, labels: sesLabels }) {
      gestes.push("creer");
      const numero = 3000 + issues.length;
      issues.push({ numero, titre, corps, labels: sesLabels, ouverte: true, commentaires: [] });
      return numero;
    },
    async commenter(numero, corps) {
      gestes.push(`commenter #${numero}`);
      issues.find((issue) => issue.numero === numero)?.commentaires.push(corps);
    },
    async fermer(numero) {
      gestes.push(`fermer #${numero}`);
      const issue = issues.find((candidate) => candidate.numero === numero);
      if (issue) issue.ouverte = false;
    },
  };
  const ouvertes = () => issues.filter((issue) => issue.ouverte && issue.labels.includes(LABEL_DU_DISJONCTEUR));
  return { client, issues, labels, gestes, ouvertes, tomberEnPanne: (erreur: Error | null) => void (panne = erreur) };
}

test("à l'ouverture du disjoncteur, une issue labellisée dit le ticket en échec, son code de sortie et l'heure d'ouverture — le label est créé", async (t) => {
  const { journal, disjoncter } = cuisine(t);
  const github = fauxGitHub();
  disjoncter();

  const numero = await publierLeDisjoncteur(github.client, PROJET, disjoncteurDuJournal(journal.base));

  const [issue, ...autres] = github.ouvertes();
  assert.equal(autres.length, 0);
  assert.equal(issue?.numero, numero);
  assert.deepEqual(issue.labels, [LABEL_DU_DISJONCTEUR]);
  assert.ok(github.labels.has(DEFINITION_DU_LABEL.name), "le label est créé");
  assert.match(issue.titre, /brigade/);
  assert.match(issue.corps, /\*\*Failing ticket\*\*: #2087$/m);
  assert.match(issue.corps, /\*\*Exit code\*\*: 1$/m);
  assert.match(issue.corps, new RegExp(`\\*\\*Opened at\\*\\*: ${OUVERTURE}$`, "m"));
  // Les échecs comptés, du plus ancien au plus récent.
  assert.match(issue.corps, /- #2086: exit code 2, .*\n- #2087: exit code 1,/);
});

test("ouvrir deux fois de suite ne crée pas une seconde issue ouverte — ni le même publieur, ni celui d'un runtime redémarré", async (t) => {
  const { journal, disjoncter } = cuisine(t);
  const github = fauxGitHub();
  disjoncter();
  const voulu = disjoncteurDuJournal(journal.base);

  const premiere = await publierLeDisjoncteur(github.client, PROJET, voulu);
  const seconde = await publierLeDisjoncteur(github.client, PROJET, voulu);
  assert.equal(seconde, premiere);

  // Un publieur tient sa dernière publication : il ne relit pas GitHub pour rien.
  const publieur = publieurDuDisjoncteur(journal.base, PROJET, { client: github.client });
  await publieur.passer();
  const lectures = github.gestes.filter((geste) => geste.startsWith("lire")).length;
  await publieur.passer();
  await publieur.passer("log");
  assert.equal(github.gestes.filter((geste) => geste.startsWith("lire")).length, lectures);

  assert.equal(github.ouvertes().length, 1);
  assert.equal(github.gestes.filter((geste) => geste === "creer").length, 1);
});

test("à la fermeture, l'issue reçoit un commentaire qui dit la cuisine reprise, puis est fermée", async (t) => {
  const { journal, disjoncter, reprendre } = cuisine(t);
  const github = fauxGitHub();
  const publieur = publieurDuDisjoncteur(journal.base, PROJET, { client: github.client });
  disjoncter();
  await publieur.passer();
  const [issue] = github.ouvertes();
  assert.ok(issue);

  reprendre();
  await publieur.passer("log");

  assert.equal(github.ouvertes().length, 0);
  assert.equal(issue.ouverte, false);
  assert.equal(issue.commentaires.length, 1);
  assert.match(issue.commentaires[0] ?? "", /kitchen is resumed/);
  assert.match(issue.commentaires[0] ?? "", new RegExp(REPRISE));
  // Le commentaire part avant la fermeture.
  assert.deepEqual(github.gestes.slice(-2), [`commenter #${issue.numero}`, `fermer #${issue.numero}`]);

  // Rouvert plus tard, le disjoncteur a une nouvelle issue.
  disjoncter("2026-11-03T16:00:00.000Z");
  await publieur.passer("log");
  assert.equal(github.ouvertes().length, 1);
  assert.notEqual(github.ouvertes()[0]?.numero, issue.numero);
});

test("un disjoncteur refermé pendant que le runtime était arrêté ferme l'issue au démarrage ; l'issue d'un autre projet n'est pas touchée", async (t) => {
  const { journal, disjoncter, reprendre } = cuisine(t);
  const autre = { numero: 12, titre: "Kitchen compta held", corps: "<!-- brigade:breaker-open project=compta -->\nheld", labels: [LABEL_DU_DISJONCTEUR], ouverte: true, commentaires: [] };
  const github = fauxGitHub([autre]);
  disjoncter();
  await publieurDuDisjoncteur(journal.base, PROJET, { client: github.client }).passer();
  assert.equal(github.ouvertes().length, 2);

  reprendre();
  // Le runtime suivant ne sait rien de ce qui a été publié avant lui.
  await publieurDuDisjoncteur(journal.base, PROJET, { client: github.client }).passer();

  assert.deepEqual(
    github.ouvertes().map(({ numero }) => numero),
    [12],
  );
  assert.deepEqual(autre.commentaires, []);
});

test("branché au runtime : publié au premier réveil qui voit le disjoncteur ; un échec se dit une fois et ne se rejoue qu'au tick", async (t) => {
  const { journal, disjoncter, reprendre } = cuisine(t);
  const github = fauxGitHub();
  const avertissements: string[] = [];
  const ecouteurs = new Set<(cause: CauseReveil) => void>();
  const reveiller = (cause: CauseReveil) => {
    for (const ecouter of ecouteurs) ecouter(cause);
  };
  const runtime: Runtime = {
    projet: PROJET,
    journal,
    surReveil(ecouter) {
      ecouteurs.add(ecouter);
      return () => ecouteurs.delete(ecouter);
    },
    arreter() {},
  };
  assert.equal(brancherIssueDuDisjoncteur(runtime, { client: github.client, avertir: (ligne) => avertissements.push(ligne) }), runtime);
  // La passe d'emblée, disjoncteur fermé : une lecture, rien à fermer.
  await jusqua(() => github.gestes.length === 1);

  disjoncter();
  reveiller("log");
  await jusqua(() => github.ouvertes().length === 1);

  github.tomberEnPanne(new Error("HTTP 502"));
  reprendre();
  reveiller("log");
  await jusqua(() => avertissements.length === 1);
  assert.match(avertissements[0] ?? "", /HTTP 502/);
  const lectures = github.gestes.length;
  reveiller("log");
  reveiller("log");
  assert.equal(github.gestes.length, lectures, "après un échec, une écriture du journal ne rejoue rien");
  reveiller("tick");
  await jusqua(() => github.gestes.length === lectures + 1);
  assert.equal(avertissements.length, 1, "le même échec ne se redit pas");

  github.tomberEnPanne(null);
  reveiller("tick");
  await jusqua(() => github.ouvertes().length === 0);
});

test("le client réel, contre un faux `gh` : la liste ouverte au label sans les PR, le label déjà là accepté, l'issue créée, commentée et fermée", { skip: process.platform === "win32" && "le faux `gh` est un script bash" }, async (t) => {
  const gh = fauxGh(t);
  const client = clientGitHubDuDisjoncteur({ depot: DEPOT, bin: gh.bin, limite: ouvrirLimite() });
  const AU_LABEL = `repos/${DEPOT}/issues?labels=brigade%3Abreaker-open&state=open&per_page=100`;
  gh.repondre(AU_LABEL, { corps: [{ number: 7, body: "le corps" }, { number: 8, body: "", pull_request: {} }] });
  assert.deepEqual(await client.ouvertesAuLabel(LABEL_DU_DISJONCTEUR), [{ numero: 7, corps: "le corps" }]);

  // 422 : le label existe déjà — ce n'est pas un échec.
  gh.repondre(`repos/${DEPOT}/labels`, { statut: 422, corps: { message: "Validation Failed" } });
  await client.assurerLabel(DEFINITION_DU_LABEL);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "--input", "-", "-X", "POST", `repos/${DEPOT}/labels`]);
  gh.repondre(`repos/${DEPOT}/labels`, { statut: 403, corps: { message: "Forbidden" } });
  await assert.rejects(client.assurerLabel(DEFINITION_DU_LABEL), /HTTP 403/);

  gh.repondre(`repos/${DEPOT}/issues`, { statut: 201, corps: { number: 12 } });
  assert.equal(await client.creer({ titre: "Kitchen held", corps: "le corps", labels: [LABEL_DU_DISJONCTEUR] }), 12);
  gh.repondre(`repos/${DEPOT}/issues/12/comments`, { statut: 201, corps: {} });
  await client.commenter(12, "resumed");
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "--input", "-", "-X", "POST", `repos/${DEPOT}/issues/12/comments`]);
  gh.repondre(`repos/${DEPOT}/issues/12`, { corps: { number: 12, state: "closed" } });
  await client.fermer(12);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "--input", "-", "-X", "PATCH", `repos/${DEPOT}/issues/12`]);
});
