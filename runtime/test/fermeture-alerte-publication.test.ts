import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Sortie } from "../src/appel.ts";
import { commentaireDeFermeture, fermerLesAlertes, principal, tagDeLAlerte, type AlerteOuverte, type GitHubDesAlertes } from "../src/fermeture-alerte-publication.ts";

const RUN = "https://github.com/benomite/brigade/actions/runs/19283746501";
const ALERTE: AlerteOuverte = { number: 3084, title: "publier-app: app-v1.0.185 was not published, a build failed", body: "The run https://github.com/benomite/brigade/actions/runs/1 did not publish app-v1.0.185.\n\n- `mac`: failure\n" };

// Un GitHub en mémoire : les issues, leurs commentaires, les releases publiées et les runs réussis par commit.
function fauxGitHub({ issues = [ALERTE], publiees = {} as Record<string, string>, runs = {} as Record<string, string>, commentaires = {} as Record<number, string[]> } = {}) {
  const etat = { ouvertes: new Set(issues.map((issue) => issue.number)), commentaires: new Map(Object.entries(commentaires).map(([n, c]) => [Number(n), [...c]])), postes: [] as { numero: number; corps: string }[], fermees: [] as number[] };
  const github: GitHubDesAlertes = {
    issuesOuvertes: async () => issues.filter((issue) => etat.ouvertes.has(issue.number)),
    release: async (tag) => (publiees[tag] === undefined ? null : { commit: publiees[tag] }),
    runSurLeCommit: async (commit) => runs[commit] ?? null,
    commentaires: async (numero) => etat.commentaires.get(numero) ?? [],
    commenter: async (numero, corps) => {
      etat.postes.push({ numero, corps });
      etat.commentaires.set(numero, [...(etat.commentaires.get(numero) ?? []), corps]);
    },
    fermerIssue: async (numero) => {
      etat.fermees.push(numero);
      etat.ouvertes.delete(numero);
    },
  };
  return { github, etat };
}

test("the alert tag is read from the title, and only from a publier-app 'was not published' title", () => {
  assert.equal(tagDeLAlerte("publier-app: app-v1.0.185 was not published, a build failed"), "app-v1.0.185");
  assert.equal(tagDeLAlerte("publier-app: app-v1.0.185 was not published, GitHub retired a runner image"), "app-v1.0.185");
  assert.equal(tagDeLAlerte("publier-app: app-v1.0.185 was published"), null);
  assert.equal(tagDeLAlerte("Why was app-v1.0.185 was not published?"), null);
  assert.equal(tagDeLAlerte("publier-app: app-v1.0.185 was not publishedness"), null);
});

test("an open alert naming app-v1.0.185 is closed once app-v1.0.185 is published, with one line naming the run", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.185": "abc123" }, runs: { abc123: RUN } });
  const resultats = await fermerLesAlertes({ github });
  assert.deepEqual(resultats, [{ numero: 3084, tag: "app-v1.0.185", fermee: true, run: RUN }]);
  assert.deepEqual(etat.fermees, [3084]);
  assert.equal(etat.postes.length, 1);
  const { corps } = etat.postes[0] as { corps: string };
  assert.equal(corps, commentaireDeFermeture("app-v1.0.185", RUN));
  assert.equal(corps.split("\n").length, 1);
  assert.ok(corps.includes(RUN));
});

test("the run that has just published the alert's release is the one named, without a lookup", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.185": "abc123" } });
  const courant = "https://github.com/benomite/brigade/actions/runs/42";
  await fermerLesAlertes({ github: { ...github, runSurLeCommit: async () => assert.fail("no lookup for the current run") }, courant: { tag: "app-v1.0.185", run: courant } });
  assert.deepEqual(etat.postes, [{ numero: 3084, corps: commentaireDeFermeture("app-v1.0.185", courant) }]);
  assert.deepEqual(etat.fermees, [3084]);
});

test("an alert whose release is not published stays open and gets no comment", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.184": "abc" }, runs: { abc: RUN } });
  const resultats = await fermerLesAlertes({ github, courant: { tag: "app-v1.0.186", run: RUN } });
  assert.deepEqual(resultats, [{ numero: 3084, tag: "app-v1.0.185", fermee: false, raison: "app-v1.0.185 is not published" }]);
  assert.deepEqual(etat.postes, []);
  assert.deepEqual(etat.fermees, []);
});

test("running the step twice posts no second comment and does not fail", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.185": "abc123" }, runs: { abc123: RUN } });
  await fermerLesAlertes({ github });
  assert.deepEqual(await fermerLesAlertes({ github }), []);
  assert.equal(etat.postes.length, 1);
});

test("an alert a previous pass commented without closing is closed without a second comment", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.185": "abc123" }, runs: { abc123: RUN }, commentaires: { 3084: [commentaireDeFermeture("app-v1.0.185", RUN)] } });
  const resultats = await fermerLesAlertes({ github });
  assert.equal(resultats[0]?.fermee, true);
  assert.deepEqual(etat.postes, []);
  assert.deepEqual(etat.fermees, [3084]);
});

test("issues whose title is not a 'was not published' alert are never closed nor commented", async () => {
  const autres: AlerteOuverte[] = [
    { number: 1, title: "app-v1.0.185 was not published, a build failed", body: "" },
    { number: 2, title: "Ship app-v1.0.185", body: "did not publish app-v1.0.185" },
    { number: 3, title: "publier-app: secrets", body: "" },
  ];
  const { github, etat } = fauxGitHub({ issues: autres, publiees: { "app-v1.0.185": "abc123" }, runs: { abc123: RUN } });
  assert.deepEqual(await fermerLesAlertes({ github, courant: { tag: "app-v1.0.185", run: RUN } }), []);
  assert.deepEqual(etat.postes, []);
  assert.deepEqual(etat.fermees, []);
});

test("an alert that also reports a later release still unpublished stays open", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.185": "abc123" }, runs: { abc123: RUN }, commentaires: { 3084: ["The run https://x/runs/2 did not publish app-v1.0.186.\n"] } });
  const [resultat] = await fermerLesAlertes({ github });
  assert.deepEqual(resultat, { numero: 3084, tag: "app-v1.0.185", fermee: false, raison: "it also reports app-v1.0.186, which is not published" });
  assert.deepEqual(etat.postes, []);
  assert.deepEqual(etat.fermees, []);
});

test("a published release with no successful run found stays open: no run is made up", async () => {
  const { github, etat } = fauxGitHub({ publiees: { "app-v1.0.185": "abc123" } });
  const [resultat] = await fermerLesAlertes({ github });
  assert.equal(resultat?.fermee, false);
  assert.deepEqual(etat.postes, []);
  assert.deepEqual(etat.fermees, []);
});

test("a release that cannot be read leaves its alert open, flagged, and the other alerts are still served", async () => {
  const deux: AlerteOuverte[] = [ALERTE, { number: 3090, title: "publier-app: app-v1.0.186 was not published, a build failed", body: "" }];
  const { github, etat } = fauxGitHub({ issues: deux, publiees: { "app-v1.0.186": "def" }, runs: { def: RUN } });
  const lire = github.release;
  github.release = async (tag) => (tag === "app-v1.0.185" ? Promise.reject(new Error("GitHub answered 502")) : lire(tag));
  const resultats = await fermerLesAlertes({ github });
  assert.deepEqual(resultats[0], { numero: 3084, tag: "app-v1.0.185", fermee: false, raison: "GitHub answered 502", echec: true });
  assert.equal(resultats[1]?.fermee, true);
  assert.deepEqual(etat.fermees, [3090]);
});

// Le GitHub de l'API REST, sur un port local : ce que la commande du workflow lit et écrit.
async function fausseApi(etat: { releases: Record<string, { draft: boolean; target_commitish: string } | "panne">; ouvertes: Set<number>; commentaires: Map<number, string[]>; appels: string[] }) {
  const issues = [
    { number: 3084, title: ALERTE.title, body: ALERTE.body },
    { number: 3091, title: "publier-app: app-v1.0.186 was not published, a build failed", body: null },
    { number: 3092, title: "A feature", body: "" },
    { number: 3093, title: "publier-app: app-v1.0.185 was not published, a build failed", body: "", pull_request: {} },
  ];
  const repondre = (res: ServerResponse, statut: number, corps: unknown) => {
    res.writeHead(statut, { "content-type": "application/json" });
    res.end(JSON.stringify(corps));
  };
  const serveur = createServer(async (req: IncomingMessage, res) => {
    let texte = "";
    for await (const morceau of req) texte += morceau;
    const url = new URL(req.url ?? "/", "http://x");
    etat.appels.push(`${req.method} ${url.pathname}`);
    assert.equal(req.headers.authorization, "Bearer jeton");
    const chemin = url.pathname.replace("/repos/benomite/brigade", "");
    if (req.method === "GET" && chemin === "/issues") return repondre(res, 200, url.searchParams.get("page") === "1" ? issues.filter((issue) => etat.ouvertes.has(issue.number)) : []);
    const release = /^\/releases\/tags\/(.+)$/.exec(chemin);
    if (release) {
      const lue = etat.releases[decodeURIComponent(release[1] as string)];
      return lue === undefined ? repondre(res, 404, { message: "Not Found" }) : lue === "panne" ? repondre(res, 502, { message: "Bad Gateway" }) : repondre(res, 200, lue);
    }
    if (chemin === "/actions/workflows/publier-app.yml/runs") {
      assert.equal(url.searchParams.get("status"), "success");
      return repondre(res, 200, { workflow_runs: url.searchParams.get("head_sha") === "abc123" ? [{ html_url: `${RUN}-relance`, created_at: "2026-11-09T12:00:00Z" }, { html_url: RUN, created_at: "2026-11-08T12:00:00Z" }] : [] });
    }
    const commentaires = /^\/issues\/(\d+)\/comments$/.exec(chemin);
    if (commentaires) {
      const numero = Number(commentaires[1]);
      if (req.method === "POST") {
        etat.commentaires.set(numero, [...(etat.commentaires.get(numero) ?? []), (JSON.parse(texte) as { body: string }).body]);
        return repondre(res, 201, {});
      }
      return repondre(res, 200, (etat.commentaires.get(numero) ?? []).map((body) => ({ body })));
    }
    const issue = /^\/issues\/(\d+)$/.exec(chemin);
    if (issue && req.method === "PATCH") {
      assert.equal((JSON.parse(texte) as { state: string }).state, "closed");
      etat.ouvertes.delete(Number(issue[1]));
      return repondre(res, 200, {});
    }
    repondre(res, 500, { message: `unexpected ${req.method} ${url.pathname}` });
  });
  await new Promise<void>((resolu) => serveur.listen(0, "127.0.0.1", resolu));
  return { api: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`, fermer: () => new Promise<void>((resolu) => serveur.close(() => resolu())) };
}

async function jouer(env: Record<string, string>) {
  const dites: string[] = [];
  const redites: string[] = [];
  let code = 0;
  try {
    await principal({ args: [], env, dire: (ligne) => dites.push(ligne), redire: (ligne) => redites.push(ligne) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { dites, redites, code };
}

test("the workflow's command closes the published alert through the REST API, leaves the others open, and a second run posts nothing", async () => {
  const etat = { releases: { "app-v1.0.185": { draft: false, target_commitish: "abc123" } } as Record<string, { draft: boolean; target_commitish: string } | "panne">, ouvertes: new Set([3084, 3091, 3092, 3093]), commentaires: new Map<number, string[]>(), appels: [] as string[] };
  const api = await fausseApi(etat);
  try {
    const env = { GH_TOKEN: "jeton", GH_REPO: "benomite/brigade", GITHUB_API_URL: api.api };
    const premier = await jouer(env);
    assert.equal(premier.code, 0);
    assert.deepEqual(premier.dites, [`#3084 closed: app-v1.0.185 is published by the run ${RUN}.`, "#3091 stays open: app-v1.0.186 is not published."]);
    assert.deepEqual([...etat.ouvertes].sort(), [3091, 3092, 3093]);
    assert.deepEqual(etat.commentaires.get(3084), [commentaireDeFermeture("app-v1.0.185", RUN)]);
    assert.equal(etat.commentaires.get(3091), undefined);
    const second = await jouer(env);
    assert.equal(second.code, 0);
    assert.deepEqual(second.dites, ["#3091 stays open: app-v1.0.186 is not published."]);
    assert.equal(etat.commentaires.get(3084)?.length, 1);
    assert.ok(!etat.appels.some((appel) => appel.endsWith("/issues/3092") || appel.startsWith("PATCH /repos/benomite/brigade/issues/3093")));
  } finally {
    await api.fermer();
  }
});

test("the workflow's command names its own run for the release it has just published", async () => {
  const etat = { releases: { "app-v1.0.186": { draft: false, target_commitish: "def456" } } as Record<string, { draft: boolean; target_commitish: string } | "panne">, ouvertes: new Set([3091]), commentaires: new Map<number, string[]>(), appels: [] as string[] };
  const api = await fausseApi(etat);
  try {
    const courant = "https://github.com/benomite/brigade/actions/runs/77";
    const { code } = await jouer({ GH_TOKEN: "jeton", GH_REPO: "benomite/brigade", GITHUB_API_URL: api.api, TAG: "app-v1.0.186", RUN_URL: courant });
    assert.equal(code, 0);
    assert.deepEqual(etat.commentaires.get(3091), [commentaireDeFermeture("app-v1.0.186", courant)]);
    assert.ok(!etat.ouvertes.has(3091));
  } finally {
    await api.fermer();
  }
});

test("the workflow's command keeps an alert open and ends red when its release cannot be read", async () => {
  const etat = { releases: { "app-v1.0.185": "panne" } as Record<string, { draft: boolean; target_commitish: string } | "panne">, ouvertes: new Set([3084]), commentaires: new Map<number, string[]>(), appels: [] as string[] };
  const api = await fausseApi(etat);
  try {
    const { code, redites } = await jouer({ GH_TOKEN: "jeton", GH_REPO: "benomite/brigade", GITHUB_API_URL: api.api });
    assert.equal(code, 1);
    assert.match(redites[0] ?? "", /^::error::#3084 stays open, GitHub could not be read or written: GitHub answered 502/);
    assert.ok(etat.ouvertes.has(3084));
    assert.equal(etat.commentaires.get(3084), undefined);
  } finally {
    await api.fermer();
  }
});

test("the workflow's command refuses to run without its token, its repository, or with a tag but no run", async () => {
  assert.equal((await jouer({ GH_REPO: "benomite/brigade" })).code, 2);
  assert.equal((await jouer({ GH_TOKEN: "jeton" })).code, 2);
  assert.equal((await jouer({ GH_TOKEN: "jeton", GH_REPO: "benomite/brigade", TAG: "app-v1.0.185" })).code, 2);
});
