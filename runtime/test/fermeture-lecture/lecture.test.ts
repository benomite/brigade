// La fermeture lue par l'app (`closing --json`) : sans closer, elle le dit et
// rien d'autre ; avec lui, les trois chiffres de l'observation, ses
// trouvailles avec leur fichier et leurs lignes, la dernière demande dans
// chacun de ses états, ce qu'une passe finie a retiré et sa PR, et la dérive
// au seuil du relevé des mesures. Et elle ne change rien : ni demande, ni fait,
// ni octet du journal.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { posixOnly } from "../support/plateforme.ts";
import { principal } from "../../src/closing/command.ts";
import type { Evenement, Fait } from "../../src/evenements.ts";
import type { ReglagesDeFermeture } from "../../src/events/closing.ts";
import { SANS_CLOSER, type LectureDeFermeture } from "../../src/fermeture-lecture/lecture.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { SANS_SEUIL } from "../../src/mesures.ts";
import { PLAFONDS } from "../aides/cuisine.ts";
import { ecrireHistoire, lignes } from "../closing/history.ts";
import { appeler, BASE, depotGit, ENV_GIT, horloge, lancer, repertoireTemporaire } from "../outils.ts";

const REGLAGES: ReglagesDeFermeture = { calibration: { model: "sonnet", effort: "low" }, cooksBelow: 1, tokens: 1000, removedLines: 20 };

const SUITE = Array.from({ length: 8 }, (_, i) => `const ligne${i + 1} = calculer(${i + 1});\n`).join("");
// Le projet : un doublon de huit lignes (D1), deux exports que rien ne nomme
// (M1 `inutile`, M2 `oublie`) ; `vivant` et `garde` vivent.
const PROJET = {
  "src/app.ts": 'import { vivant } from "./libre/outils.ts";\nimport { garde } from "./tenu/outils.ts";\nconsole.log(vivant(), garde());\n',
  "src/libre/outils.ts": "export function vivant() { return 1; }\nexport function inutile() { return 2; }\n",
  "src/tenu/outils.ts": "export function garde() { return 3; }\nexport function oublie() { return 4; }\n",
  "src/libre/a.ts": SUITE,
  "src/libre/b.ts": `// la copie\n${SUITE}`,
};

type Projet = { clone: string; etat: string; noter: (fait: Fait, ticket?: number | null) => void };

// Un projet dont la branche d'intégration porte deux merges, et son journal —
// où le runtime a écrit le closer réglé, sauf si le test dit le contraire.
function projet(t: TestContext, reglages: ReglagesDeFermeture | null = REGLAGES): Projet {
  const { clone } = depotGit(t);
  ecrireHistoire(clone, [{ merge: PROJET }, { merge: { "stock.txt": lignes(4) } }]);
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat, { maintenant: horloge() });
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  if (reglages !== null) noter({ type: "closing.configured", payload: reglages });
  journal.fermer();
  // Chaque fait s'écrit dans un journal rouvert, refermé aussitôt : la lecture
  // le trouve comme le runtime le laisse.
  return {
    clone,
    etat,
    noter: (fait, ticket = null) => {
      const ouvert = ouvrirJournal(etat, { maintenant: horloge("2026-10-08T11:00:00.000Z") });
      ouvert.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
      ouvert.fermer();
    },
  };
}

const env = ({ clone, etat }: Pick<Projet, "clone" | "etat">, autres: Record<string, string> = {}) => ({ ...ENV_GIT, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_STATE_DIR: etat, ...autres });

async function lire(lieu: Pick<Projet, "clone" | "etat">, autres: Record<string, string> = {}): Promise<LectureDeFermeture> {
  const appel = appeler(principal, ["--json"], env(lieu, autres));
  assert.equal(await appel.fin, 0, appel.sortie());
  const sortie = appel.sortie();
  // Un objet, sur une ligne.
  assert.match(sortie, /^\{.*\}\n$/);
  return JSON.parse(sortie);
}

async function demande(lieu: Projet) {
  const lue = await lire(lieu);
  assert.ok(lue.configured);
  return lue.request;
}

// Le répertoire d'état, octet par octet.
function empreinte(repertoire: string): Record<string, string> {
  return Object.fromEntries(readdirSync(repertoire).map((nom) => [nom, createHash("sha1").update(readFileSync(join(repertoire, nom))).digest("hex")]));
}

test("sans closer réglé, la réponse le dit et ne porte aucun champ de l'observation", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  for (const reglages of [null, { ...REGLAGES, calibration: null }]) {
    const lue = await lire(projet(t, reglages));
    assert.deepEqual(lue, { configured: false, text: SANS_CLOSER });
  }
});

test("avec un closer, l'observation donne ses trois chiffres — le ratio, les doublons, les exports morts — et les merges depuis la dernière fermeture", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  for (const ticket of [17, 18, 19]) lieu.noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket);

  const lue = await lire(lieu);
  assert.ok(lue.configured);
  assert.deepEqual(lue.closer, { model: "sonnet", effort: "low", cooksBelow: 1, tokens: 1000, removedLines: 20 });
  assert.ok(lue.observation.readable);
  const { ratio, duplicates, deadExports, mergesSinceCleanup, ref } = lue.observation;
  assert.equal(ref, `origin/${BASE}`);
  assert.equal(mergesSinceCleanup, 3);
  assert.equal(duplicates, 1);
  assert.equal(deadExports, 2);
  // Deux merges : le premier ajoute 24 lignes, le second 4 ; aucun ne retire rien.
  assert.deepEqual(ratio, [
    { window: 20, merges: 2, added: 28, removed: 0, ratio: null, reads: "nothing removed" },
    { window: 50, merges: 2, added: 28, removed: 0, ratio: null, reads: "nothing removed" },
    { window: 100, merges: 2, added: 28, removed: 0, ratio: null, reads: "nothing removed" },
  ]);
  assert.deepEqual(lue.request, { state: "none" });
});

test("le ratio se donne en nombre quand des lignes ont été retirées", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const { clone } = depotGit(t);
  ecrireHistoire(clone, [{ commit: { "stock.txt": lignes(10) } }, { merge: { "a.txt": lignes(10), "stock.txt": lignes(6) } }]);
  const lieu = { clone, etat: projet(t).etat };
  const lue = await lire(lieu);
  assert.ok(lue.configured && lue.observation.readable);
  assert.deepEqual(lue.observation.ratio[0], { window: 20, merges: 1, added: 10, removed: 4, ratio: 2.5, reads: "2.5:1" });
});

test("chaque trouvaille porte son fichier et ses lignes, sous le nom que la passe lui donne", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lue = await lire(projet(t));
  assert.ok(lue.configured);
  assert.deepEqual(lue.findings, [
    { id: "D1", kind: "duplicate", file: "src/libre/a.ts", start: 1, end: 8, lines: 8, copy: { file: "src/libre/b.ts", start: 2, end: 9 } },
    { id: "M1", kind: "dead-export", file: "src/libre/outils.ts", start: 2, end: 2, name: "inutile", onlyTests: [] },
    { id: "M2", kind: "dead-export", file: "src/tenu/outils.ts", start: 2, end: 2, name: "oublie", onlyTests: [] },
  ]);
  for (const trouvaille of lue.findings) assert.ok(trouvaille.file.length > 0 && trouvaille.start >= 1 && trouvaille.end >= trouvaille.start);
});

test("la dérive dit si un seuil est franchi, au seuil que le chef a déclaré au relevé des mesures", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const sansSeuil = await lire(projet(t));
  assert.ok(sansSeuil.configured);
  assert.deepEqual(sansSeuil.drift, { declared: false, crossed: false, crossings: [] });

  const lieu = projet(t);
  lieu.noter({ type: "drift.configured", payload: { limits: { ...SANS_SEUIL, merges: 2 } } });
  lieu.noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/17", sha: "sha-17", by: "pass", reconciled: false } }, 17);
  const sous = await lire(lieu);
  assert.ok(sous.configured);
  assert.deepEqual(sous.drift, { declared: true, crossed: false, crossings: [] });

  for (const ticket of [18, 19]) lieu.noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket);
  const franchi = await lire(lieu);
  assert.ok(franchi.configured);
  assert.deepEqual(franchi.drift, { declared: true, crossed: true, crossings: [{ measure: "merges", observed: 3, limit: 2, text: "3 merges since the last closing for a threshold of 2" }] });
});

test("une demande qui attend dit ce qui la retient : combien de cooks en vol, pour quel seuil", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "cook.launched", payload: { run: "7-enVol", limits: PLAFONDS, stream: "runs/7-enVol.jsonl" } }, 7);
  lieu.noter({ type: "closing.requested", payload: {} });

  const lue = await demande(lieu);
  assert.equal(lue.state, "waiting");
  assert.ok(lue.state === "waiting");
  assert.match(lue.since, /^2026-10-08T11:00/);
  assert.equal(lue.stalledAt, null);
  assert.deepEqual(lue.reason, {
    code: "cooks",
    observed: 1,
    limit: 1,
    detail: "0",
    text: "start condition not met: 1 cook in flight for a threshold of 1 — the pass leaves when there are fewer than the threshold, or when the rail is empty (it carries 0 unserved ticket)",
  });
  assert.match(lue.text, /^closing pass requested on .*, it waits — start condition not met: 1 cook in flight/);
});

test("une demande que rien ne retient plus attend le prochain réveil du runtime, sans motif", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  const lue = await demande(lieu);
  assert.ok(lue.state === "waiting");
  assert.equal(lue.reason, null);
  assert.match(lue.text, /its start condition is met, the runtime starts it at its next wake-up/);
});

test("une demande dite sans issue le dit, et attend toujours", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "cook.launched", payload: { run: "7-enVol", limits: PLAFONDS, stream: "runs/7-enVol.jsonl" } }, 7);
  lieu.noter({ type: "closing.requested", payload: {} });
  lieu.noter({ type: "closing.stalled", payload: { requestedAt: "2026-10-08T11:00:00.000Z", reason: "cooks", observed: 1, limit: 1, detail: "0" } });
  const lue = await demande(lieu);
  assert.ok(lue.state === "waiting");
  assert.match(lue.stalledAt ?? "", /^2026-10-08T11:00/);
  assert.match(lue.text, /^CLOSING PASS WITH NO WAY OUT/);
});

test("une passe partie se lit en train de ranger, avec ce qu'elle tient", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  lieu.noter({ type: "closing.started", payload: { run: "fermeture-3f9c1a2e", base: "01913d7", zone: ["src/libre/outils.ts"], held: [], candidates: 3, limits: { tokens: 1000, removedLines: 20 } } });
  const lue = await demande(lieu);
  assert.deepEqual({ ...lue, since: "" }, { state: "running", run: "fermeture-3f9c1a2e", since: "", base: "01913d7", zone: ["src/libre/outils.ts"], candidates: 3 });
});

test("une demande refusée dit son motif", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  lieu.noter({ type: "closing.refused", payload: { reason: "stopped", observed: null, limit: null, detail: "2026-10-08 10:00" } });
  const lue = await demande(lieu);
  assert.ok(lue.state === "refused");
  assert.deepEqual(lue.reason, { code: "stopped", observed: null, limit: null, detail: "2026-10-08 10:00", text: "the kitchen has been stopped by the chef since 2026-10-08 10:00 — “resume” first" });
  assert.equal(lue.text, lue.reason.text);
});

test("une demande retirée par le chef se lit retirée", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  lieu.noter({ type: "closing.cancelled", payload: {} });
  const lue = await demande(lieu);
  assert.equal(lue.state, "cancelled");
  assert.ok(lue.state === "cancelled" && /^2026-10-08T11:00/.test(lue.at));
});

test("une passe livrée dit ce qu'elle a retiré et l'adresse de sa PR", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  lieu.noter({ type: "closing.started", payload: { run: "fermeture-3f9c1a2e", base: "01913d7", zone: ["src/libre/outils.ts"], held: [], candidates: 3, limits: { tokens: 1000, removedLines: 20 } } });
  lieu.noter({
    type: "closing.ended",
    payload: {
      run: "fermeture-3f9c1a2e",
      outcome: "delivered",
      branch: "cook/fermeture-3f9c1a2e",
      pr: "https://github.com/benomite/brigade/pull/101",
      sha: "abc1234",
      removedLines: 1,
      addedLines: 0,
      files: ["src/libre/outils.ts"],
      removed: [{ id: "M1", what: "export `inutile` of `src/libre/outils.ts:2` — referenced nowhere" }],
      kept: [{ id: "D1", what: "8 identical lines of code", reason: "deux modules qui évoluent à part", before: false }],
      slope: [],
    },
  });
  const lue = await demande(lieu);
  assert.ok(lue.state === "done");
  assert.equal(lue.outcome, "delivered");
  assert.equal(lue.delivered, true);
  assert.equal(lue.pr, "https://github.com/benomite/brigade/pull/101");
  assert.deepEqual(lue.removed, [{ id: "M1", what: "export `inutile` of `src/libre/outils.ts:2` — referenced nowhere" }]);
  assert.equal(lue.removedLines, 1);
  assert.deepEqual(lue.files, ["src/libre/outils.ts"]);
  assert.deepEqual(lue.kept, [{ id: "D1", what: "8 identical lines of code", reason: "deux modules qui évoluent à part", before: false }]);
  assert.match(lue.text, /^delivered: 1 line removed in 1 file/);
});

test("une passe finie sans rien livrer le dit : ni PR, ni retrait", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  lieu.noter({ type: "closing.started", payload: { run: "fermeture-0badf00d", base: "01913d7", zone: [], held: [], candidates: 1, limits: { tokens: 1000, removedLines: 20 } } });
  lieu.noter({ type: "closing.ended", payload: { run: "fermeture-0badf00d", outcome: "tokens", observed: 1200, limit: 1000 } });
  const lue = await demande(lieu);
  assert.ok(lue.state === "done");
  assert.deepEqual({ outcome: lue.outcome, delivered: lue.delivered, pr: lue.pr, removed: lue.removed }, { outcome: "tokens", delivered: false, pr: null, removed: [] });
  assert.match(lue.text, /^stopped: the closing's token cap reached \(1,200 for a cap of 1,000\)/);
});

test("lire ne change rien : aucune demande n'est créée, aucun fait n'est écrit, le journal n'a pas bougé d'un octet", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  // Une demande que rien ne retient : c'est là qu'un geste en trop la ferait partir.
  const lieu = projet(t);
  const types = () => {
    const journal = ouvrirJournal(lieu.etat, { lectureSeule: true });
    try {
      return journal.base.lire<{ type: Evenement["type"] }>("SELECT type FROM events ORDER BY seq").map(({ type }) => type);
    } finally {
      journal.fermer();
    }
  };
  const avant = { types: types(), octets: empreinte(lieu.etat) };
  assert.ok(!avant.types.includes("closing.requested"));
  for (let fois = 0; fois < 3; fois++) await lire(lieu);
  assert.deepEqual(types(), avant.types);
  assert.ok(!types().includes("closing.requested"));
  assert.deepEqual(empreinte(lieu.etat), avant.octets);

  lieu.noter({ type: "closing.requested", payload: {} });
  const demandee = types();
  await lire(lieu);
  assert.deepEqual(types(), demandee);
  assert.equal(types().filter((type) => type === "closing.requested").length, 1);
  assert.ok(!types().includes("closing.started"));
});

test("une branche d'intégration qui ne se lit pas le dit, et la demande et la dérive se lisent quand même", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  lieu.noter({ type: "closing.requested", payload: {} });
  const lue = await lire(lieu, { BRIGADE_BASE_BRANCH: "inconnue" });
  assert.ok(lue.configured);
  assert.ok(!lue.observation.readable);
  assert.match(lue.observation.error, /^the branch `origin\/inconnue` is not in the clone /);
  assert.deepEqual(lue.findings, []);
  assert.equal(lue.request.state, "waiting");
  assert.equal(lue.drift.crossed, false);
});

test("la commande refuse ce qu'elle ne comprend pas, et ne crée aucun journal là où il n'y en a pas", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  const bavard = appeler(principal, ["--json", "write"], env(lieu));
  assert.equal(await bavard.fin, 2);
  assert.match(bavard.sortie(), /^brigade : usage: BRIGADE_STATE_DIR=/);

  for (const variable of ["BRIGADE_STATE_DIR", "BRIGADE_REPO_DIR", "BRIGADE_BASE_BRANCH"]) {
    const appel = appeler(principal, ["--json"], { ...env(lieu), [variable]: "" });
    assert.equal(await appel.fin, 2);
    assert.match(appel.sortie(), new RegExp(`^brigade : ${variable} is not set\n`));
  }

  const vide = repertoireTemporaire(t);
  const sansJournal = appeler(principal, ["--json"], env({ clone: lieu.clone, etat: vide }));
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /^brigade : no log in /);
  assert.deepEqual(readdirSync(vide), []);

  const ailleurs = appeler(principal, ["--json"], env({ clone: repertoireTemporaire(t), etat: lieu.etat }));
  assert.equal(await ailleurs.fin, 2);
  assert.match(ailleurs.sortie(), /is not a git repository/);
});

test("`run closing -- --json` se joue dans son propre process, et rend un objet sur une ligne", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const lieu = projet(t);
  const enfant = lancer(t, join(import.meta.dirname, "../../src/fermeture.ts"), ["--json"], env(lieu));
  assert.equal(await enfant.fin, 0, enfant.sortie());
  const lue: LectureDeFermeture = JSON.parse(enfant.sortie());
  assert.ok(lue.configured);
  assert.equal(lue.findings.length, 3);
});
