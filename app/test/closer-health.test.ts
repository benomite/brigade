// Le closer d'un projet, sur Kitchen > Health (#2491) : l'app lit ses passes sur GitHub — les issues de fermeture que le
// runtime ouvre, et la PR de chacune —, ses vérifications en plus (`.claude/brigade/closer-checks.md`) et ses réglages
// (`closer.*` de `.claude/brigade/projet.json`). Un réglage changé se propose par une pull request vers la branche
// d'intégration (#2920) : le fichier proposé est de ceux que le runtime lit, et c'est sa valeur qu'il applique une fois
// mergé. Une vérification ajoutée ou retirée se propose de même ; la liste en vigueur ne change qu'au merge.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brancheDuTicket } from "../../runtime/src/brigade-github.ts";
import { corpsDeLaFermeture, estUneFermeture, marqueDeFermeture, titreDeLaFermeture } from "../../runtime/src/closer-github-passe/closer-github-passe.ts";
import { COOKS_PAR_DEFAUT, RETRAITS_PAR_DEFAUT, TOKENS_PAR_DEFAUT } from "../../runtime/src/closing/settings.ts";
import { CLES_DU_CLOSER, reglagesDuTexte } from "../../runtime/src/reglages-projet/reglages.ts";
import { changeTheSetting, changeTheVerifications, readTheCloser, readPass, SETTINGS, textOfVerifications, VERIFICATIONS, verificationsOf } from "../src/closer-health.ts";
import { FILE } from "../src/caps-duration.ts";
import { PROPOSES } from "../src/settings-of-project.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/board/client.ts";

const REPOSITORY = "chef/parade";
const PROJECT = { version: 1, integrationBranch: "main", defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, closer: { maxTokens: 300000 }, drift: { ticketTokens: 900 } };
const SHA = "9f3c2a17b4e0d6c5a8b1f2e3d4c5b6a7f8e9d0c1";

// Le corps d'une issue de fermeture, tel que le runtime l'écrit.
const bodyText = (time?: string[]) =>
  corpsDeLaFermeture({
    base: "main",
    sha: SHA,
    merges: 21,
    pente: [
      { fenetre: 20, merges: 20, ajoute: 3120, retire: 840 },
      { fenetre: 100, merges: 21, ajoute: 3300, retire: 900 },
    ] as never,
    proposes: [
      { id: "D1", quoi: "24 identical lines of code: `a.js:1-24` = `b.js:40-63`" },
      { id: "M1", quoi: "export `vieux` of `c.ts:12` — referenced nowhere" },
    ] as never,
    ecartes: 3,
    zone: ["a.js", "b.js", "c.ts"],
    retraits: 500,
    ...(time === undefined ? {} : { temps: time }),
  });

// Un GitHub en mémoire : les fichiers de chaque branche (contenu et `sha` qui change à chaque écriture) — `main` au
// départ, une branche créée part de la tête d'une autre et en copie les fichiers —, les issues que la recherche rend, les
// PR de chaque branche, et celles que l'app ouvre ; chaque demande notée — et, pour un chemin nommé (`METHODE chemin`
// pour une écriture), la réponse qu'il rend à la place.
function github({ fichiers: files = {}, issues = [], prs = {}, refus: refusal = {} }: { fichiers?: Record<string, string>; issues?: unknown[]; prs?: Record<string, Record<string, unknown>[]>; refus?: Record<string, AnswerGitHub> } = {}) {
  const branches = new Map([["main", new Map(Object.entries(files).map(([path, text]) => [path, { texte: text, sha: 1 }]))]]);
  const requests: string[] = [];
  const writtenOnes: Record<string, unknown>[] = [];
  const openEntries: Record<string, unknown>[] = [];
  const content = (path: string) => /^\/repos\/chef\/parade\/contents\/([^?]+)/.exec(path)?.[1];
  const refuses = (request: string) => Object.entries(refusal).find(([start]) => request.startsWith(start))?.[1];
  const client: ClientOfThePriority = {
    lire: async (path) => {
      requests.push(`GET ${path}`);
      const refused = refuses(path);
      if (refused !== undefined) return refused;
      const file = content(path);
      if (file !== undefined) {
        const ref = new URL(path, "https://api.github.com").searchParams.get("ref") ?? "main";
        const readOne = branches.get(ref)?.get(file);
        return readOne === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: { content: Buffer.from(readOne.texte).toString("base64"), sha: `sha${readOne.sha}` } };
      }
      if (path === `/repos/${REPOSITORY}`) return { status: 200, data: { default_branch: "main" } };
      const top = /\/git\/ref\/heads\/(.+)$/.exec(path)?.[1];
      if (top !== undefined) return branches.has(top) ? { status: 200, data: { object: { sha: `tete-${top}` } } } : { status: 404, data: { message: "Not Found" } };
      if (path.startsWith("/search/issues?")) return { status: 200, data: { items: issues } };
      const head = /\/pulls\?state=all&head=([^&]+)/.exec(path)?.[1];
      if (head !== undefined) return { status: 200, data: prs[decodeURIComponent(head)] ?? [] };
      const pr = /\/pulls\/(\d+)$/.exec(path)?.[1];
      const found = Object.values(prs).flat().find(({ number }) => String(number) === pr);
      return found === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: found };
    },
    ecrire: async (methode, path, bodyWritten) => {
      requests.push(`${methode} ${path}`);
      const refused = refuses(`${methode} ${path}`);
      if (refused !== undefined) return refused;
      const received = bodyWritten as Record<string, unknown>;
      if (path === `/repos/${REPOSITORY}/git/refs`) {
        const departure = [...branches.entries()].find(([name]) => received.sha === `tete-${name}`)?.[1] ?? assert.fail(`une branche créée d'aucune tête : ${String(received.sha)}`);
        branches.set(String(received.ref).replace("refs/heads/", ""), new Map([...departure].map(([c, f]) => [c, { ...f }])));
        return { status: 201, data: {} };
      }
      if (path === `/repos/${REPOSITORY}/pulls`) {
        openEntries.push(received);
        return { status: 201, data: { number: 60 + openEntries.length, html_url: `https://github.com/${REPOSITORY}/pull/${60 + openEntries.length}` } };
      }
      const file = content(path) ?? "";
      writtenOnes.push({ ...received, fichier: file });
      const on = branches.get(String(received.branch ?? "main")) ?? assert.fail("une écriture sur une branche inconnue");
      const before = on.get(file);
      if (before !== undefined && received.sha !== `sha${before.sha}`) return { status: 409, data: { message: "sha does not match" } };
      on.set(file, { texte: Buffer.from(received.content as string, "base64").toString("utf8"), sha: (before?.sha ?? 0) + 1 });
      return { status: 200, data: {} };
    },
  };
  // `texte(fichier, branche)` : un fichier sur une branche — `main` par défaut, celle de la dernière PR ouverte avec `"pr"`.
  const text = (file: string, branch = "main") => branches.get(branch === "pr" ? String(openEntries.at(-1)?.head) : branch)?.get(file)?.texte;
  return { client, demandes: requests, ecrits: writtenOnes, ouvertes: openEntries, texte: text };
}
const json = (object: unknown) => `${JSON.stringify(object, null, 2)}\n`;
const issue = (number: number, body: string, others: Record<string, unknown> = {}) => ({ number, title: titreDeLaFermeture("main"), html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-10-10T08:00:00Z", state: "closed", author_association: "OWNER", body, ...others });

describe("le closer, dans le dépôt du projet", () => {
  test("l'app connaît exactement les réglages du closer du runtime, et ses défauts", () => {
    assert.deepEqual(SETTINGS.map(({ cle: key }) => key), [...CLES_DU_CLOSER]);
    const defaults = Object.fromEntries(SETTINGS.map(({ cle: key, defaut: fallback }) => [key, fallback]));
    assert.deepEqual(defaults, { calibration: null, cooksBelow: COOKS_PAR_DEFAUT, maxTokens: TOKENS_PAR_DEFAUT, maxRemovedLines: RETRAITS_PAR_DEFAUT });
  });

  test("une passe se lit dans le corps que le runtime écrit : sa base, ses candidats, la dérive, les temps", () => {
    const body = bodyText(["Times stable: 4 tickets measured since the last pass, and no drift. No correction ticket is opened or changed."]);
    assert.ok(estUneFermeture(body) && body.startsWith(marqueDeFermeture(SHA)));
    const readEntry = readPass({ number: 2531, created_at: "2026-10-10T08:00:00Z", state: "open", body }) ?? assert.fail("pas lue");
    assert.equal(readEntry.sha, SHA);
    assert.equal(readEntry.ouverte, true);
    assert.deepEqual(readEntry.candidats.map(({ id }) => id), ["D1", "M1"]);
    assert.equal(readEntry.restants, 3);
    assert.deepEqual(readEntry.derive, ["last 20 merges: +3,120 / −840 (3.7:1)", "last 21 merges: +3,300 / −900 (3.7:1)"]);
    assert.match(readEntry.temps[0] ?? "", /^Times stable/);
    assert.equal(readPass({ number: 1, created_at: "2026-10-10T08:00:00Z", state: "open", body: "## Context\n\nan ordinary ticket" }), null);
  });

  test("tout se lit sur la branche d'intégration : réglages, vérifications en plus, passes et ce que chacune a retiré", async () => {
    const repository = github({
      fichiers: { [FILE]: json(PROJECT), [VERIFICATIONS]: textOfVerifications(["Unused CSS classes"]) },
      issues: [
        issue(2477, bodyText()),
        issue(2531, bodyText(), { state: "open" }),
        issue(2400, bodyText(), { author_association: "NONE" }),
        issue(2390, "a title that looks like one, without the mark"),
      ],
      prs: {
        [`chef:${brancheDuTicket(2477)}`]: [{ number: 2480, html_url: `https://github.com/${REPOSITORY}/pull/2480`, merged_at: "2026-10-09T08:00:00Z", merged: true, deletions: 1234, additions: 56 }],
      },
    });
    const readOne = await readTheCloser({ depot: REPOSITORY, branche: "main", client: repository.client });

    assert.ok("liste" in readOne.reglages);
    assert.deepEqual(readOne.reglages.liste.map(({ cle: key, valeur: value }) => [key, value]), [
      ["calibration", null],
      ["cooksBelow", null],
      ["maxTokens", 300000],
      ["maxRemovedLines", null],
    ]);
    assert.deepEqual(readOne.verifications, { liste: ["Unused CSS classes"] });
    assert.ok("liste" in readOne.passes);
    assert.deepEqual(readOne.passes.liste.map(({ numero: number, ouverte: openOne, pr }) => [number, openOne, pr]), [
      [2531, true, null],
      [2477, false, { numero: 2480, url: `https://github.com/${REPOSITORY}/pull/2480`, mergee: true, retirees: 1234, ajoutees: 56 }],
    ]);
    assert.ok(repository.demandes.includes(`GET /repos/${REPOSITORY}/contents/${FILE}?ref=main`));
    assert.ok(repository.demandes.includes(`GET /repos/${REPOSITORY}/pulls?state=all&head=${encodeURIComponent(`chef:${brancheDuTicket(2531)}`)}&per_page=10`), "la PR d'une passe est celle de la branche de son cook");
  });

  test("une lecture qui échoue ne retire pas les autres ; un dépôt sans fichiers n'a ni réglage posé ni vérification", async () => {
    const repository = github({ refus: { "/search/issues": { status: 401, data: { message: "Bad credentials" } } } });
    const readOne = await readTheCloser({ depot: REPOSITORY, branche: "main", client: repository.client });
    assert.deepEqual(readOne.passes, { sans: "the closer's passes unavailable", detail: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
    assert.deepEqual(readOne.verifications, { liste: [] });
    assert.ok("liste" in readOne.reglages && readOne.reglages.liste.every(({ valeur: value }) => value === null));
  });
});

describe("les réglages du closer, proposés depuis Health", () => {
  test("un réglage changé est proposé par une PR vers main — le reste gardé —, c'est la valeur que le runtime lit une fois mergé, et main n'a pas bougé", async () => {
    const repository = github({ fichiers: { [FILE]: json(PROJECT) } });
    assert.deepEqual(await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "maxRemovedLines", saisie: "800", client: repository.client }), {
      propose: PROPOSES,
      pr: `https://github.com/${REPOSITORY}/pull/61`,
      numero: 61,
      cle: "maxRemovedLines",
      valeur: 800,
    });
    assert.deepEqual(repository.demandes, [`GET /repos/${REPOSITORY}/contents/${FILE}?ref=main`, `GET /repos/${REPOSITORY}/git/ref/heads/main`, `POST /repos/${REPOSITORY}/git/refs`, `PUT /repos/${REPOSITORY}/contents/${FILE}`, `POST /repos/${REPOSITORY}/pulls`]);
    const first = repository.texte(FILE, "pr") ?? assert.fail("pas de fichier proposé");
    assert.deepEqual(reglagesDuTexte(first).closer, { maxTokens: 300000, maxRemovedLines: 800 });
    assert.deepEqual(await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "calibration", saisie: { model: "opus", effort: "high" }, client: repository.client }), {
      propose: PROPOSES,
      pr: `https://github.com/${REPOSITORY}/pull/62`,
      numero: 62,
      cle: "calibration",
      valeur: { model: "opus", effort: "high" },
    });
    await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "cooksBelow", saisie: " 2 ", client: repository.client });
    // Chaque changement a sa branche, partie de main, et sa PR vers main.
    const freshOnes = repository.ouvertes.map(({ head }) => String(head));
    assert.equal(new Set(freshOnes).size, 3);
    assert.deepEqual(
      repository.ecrits.map(({ message, branch, sha }) => [message, freshOnes.indexOf(String(branch)), sha]),
      [
        ["brigade: set closer.maxRemovedLines to 800 (from the app, Kitchen > Health)", 0, "sha1"],
        ["brigade: set closer.calibration to opus / high (from the app, Kitchen > Health)", 1, "sha1"],
        ["brigade: set closer.cooksBelow to 2 (from the app, Kitchen > Health)", 2, "sha1"],
      ],
    );
    assert.deepEqual(repository.ouvertes.map(({ base }) => base), ["main", "main", "main"]);
    const text = repository.texte(FILE, "pr") ?? assert.fail("pas de fichier proposé");
    assert.deepEqual(JSON.parse(text).defaultCalibrations, PROJECT.defaultCalibrations);
    assert.deepEqual(reglagesDuTexte(text).closer, { cooksBelow: 2, maxTokens: 300000 });
    // Relu sur main : la valeur en vigueur, celle d'avant — la PR vaut une fois mergée.
    assert.equal(repository.texte(FILE), json(PROJECT));
    const readOne = await readTheCloser({ depot: REPOSITORY, branche: "main", client: repository.client });
    assert.ok("liste" in readOne.reglages);
    assert.equal(readOne.reglages.liste.find(({ cle: key }) => key === "maxRemovedLines")?.valeur, null);
  });

  test("vide, le retrait du réglage est proposé ; la valeur déjà là n'ouvre rien ; sans fichier, il est créé ; sans branche, celle par défaut", async () => {
    const repository = github({ fichiers: { [FILE]: json(PROJECT) } });
    assert.deepEqual(await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "maxTokens", saisie: "300000", client: repository.client }), { fait: "unchanged: the repository already says so", cle: "maxTokens", valeur: 300000 });
    assert.equal(repository.ecrits.length, 0);
    assert.equal(repository.ouvertes.length, 0);
    await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "maxTokens", saisie: "", client: repository.client });
    assert.equal(JSON.parse(repository.texte(FILE, "pr") ?? "{}").closer, undefined, "plus aucun réglage : le closer sort du fichier");

    const fresh = github();
    await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "calibration", saisie: { model: "sonnet", effort: "medium" }, client: fresh.client });
    assert.deepEqual(reglagesDuTexte(fresh.texte(FILE, "pr") ?? assert.fail("pas de fichier")), { integrationBranch: "main", closer: { calibration: { model: "sonnet", effort: "medium" } } });

    const withoutBranch = github({ fichiers: { [FILE]: json(PROJECT) } });
    assert.ok("propose" in (await changeTheSetting({ depot: REPOSITORY, branche: null, cle: "maxRemovedLines", saisie: "800", client: withoutBranch.client })));
    assert.ok(withoutBranch.demandes.includes(`GET /repos/${REPOSITORY}`), "la branche par défaut est lue");
    assert.equal(withoutBranch.ouvertes[0]?.base, "main");
  });

  test("chaque étape que GitHub refuse : rien n'est proposé, rien ne se dit fait, main n'a pas bougé, le détail est gardé", async () => {
    const not: AnswerGitHub = { status: 422, data: { message: "Refused here" } };
    for (const [step, what] of [
      [`/repos/${REPOSITORY}/git/ref/heads/main`, "the reading of main"],
      [`POST /repos/${REPOSITORY}/git/refs`, "the branch brigade/setting-"],
      [`PUT /repos/${REPOSITORY}/contents/${FILE}`, `the change of ${FILE}`],
      [`POST /repos/${REPOSITORY}/pulls`, "the pull request of brigade/setting-"],
    ] as const) {
      const repository = github({ fichiers: { [FILE]: json(PROJECT) }, refus: { [step]: not } });
      const rendered = await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: "maxRemovedLines", saisie: "800", client: repository.client });
      assert.ok("refus" in rendered, step);
      assert.equal(rendered.refus, `nothing was proposed: GitHub did not open the pull request of ${FILE}`);
      assert.ok(rendered.detail?.startsWith(`GitHub refused ${what}`) && rendered.detail.includes("(HTTP 422): Refused here"), `${step}: ${rendered.detail}`);
      assert.equal(repository.texte(FILE), json(PROJECT), step);
      assert.equal(repository.ouvertes.length, 0, step);
    }
  });

  test("une valeur que le runtime refuserait n'écrit rien, et se dit", async () => {
    for (const [key, input] of [
      ["maxRemovedLines", "0"],
      ["maxTokens", "12.5"],
      ["cooksBelow", "deux"],
      ["calibration", { model: "opus", effort: "" }],
      ["calibration", { model: "gpt", effort: "high" }],
      ["drift", "3"],
    ] as const) {
      const repository = github({ fichiers: { [FILE]: json(PROJECT) } });
      const rendered = await changeTheSetting({ depot: REPOSITORY, branche: "main", cle: key, saisie: input, client: repository.client });
      assert.ok("refus" in rendered && rendered.refus.startsWith("nothing was changed"), `${key} = ${JSON.stringify(input)}`);
      assert.equal(repository.ecrits.length, 0);
      assert.equal(repository.ouvertes.length, 0);
    }
  });
});

describe("les vérifications en plus, proposées depuis Health", () => {
  test("une vérification ajoutée est proposée par une PR vers main ; la liste en vigueur reste celle de main ; déjà là, rien ; retirée, son retrait est proposé", async () => {
    const repository = github();
    const added = await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "  Unused   CSS classes ", client: repository.client });
    assert.deepEqual(added, { propose: PROPOSES, pr: `https://github.com/${REPOSITORY}/pull/61`, numero: 61, geste: "ajouter", verification: "Unused CSS classes", liste: [] });
    assert.deepEqual(repository.demandes, [`GET /repos/${REPOSITORY}/contents/${VERIFICATIONS}?ref=main`, `GET /repos/${REPOSITORY}/git/ref/heads/main`, `POST /repos/${REPOSITORY}/git/refs`, `PUT /repos/${REPOSITORY}/contents/${VERIFICATIONS}`, `POST /repos/${REPOSITORY}/pulls`]);
    const [pr] = repository.ouvertes;
    assert.deepEqual([pr?.base, pr?.title], ["main", "brigade: add a check of the closer"]);
    assert.deepEqual(repository.ecrits.map(({ fichier: file, branch, sha }) => [file, branch, sha]), [[VERIFICATIONS, pr?.head, undefined]], "créé sur la branche neuve, jamais sur main");
    const text = repository.texte(VERIFICATIONS, "pr") ?? assert.fail("pas de fichier proposé");
    assert.match(text, /^# The closer's extra checks\n/);
    assert.deepEqual(verificationsOf(text), ["Unused CSS classes"]);
    // main n'a pas bougé : la liste relue est celle en vigueur.
    assert.equal(repository.texte(VERIFICATIONS), undefined);
    assert.deepEqual((await readTheCloser({ depot: REPOSITORY, branche: "main", client: repository.client })).verifications, { liste: [] });

    // Sur un fichier déjà là : le reste gardé, le `sha` lu sur main.
    const tenu = github({ fichiers: { [VERIFICATIONS]: textOfVerifications(["Unused CSS classes"]) } });
    await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Doc sentences naming removed code", client: tenu.client });
    assert.equal(tenu.ecrits[0]?.sha, "sha1");
    assert.deepEqual(verificationsOf(tenu.texte(VERIFICATIONS, "pr") ?? ""), ["Unused CSS classes", "Doc sentences naming removed code"]);
    assert.deepEqual(await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Unused CSS classes", client: tenu.client }), { fait: "unchanged: the closer already has this check", liste: ["Unused CSS classes"] });
    assert.equal(tenu.ouvertes.length, 1);
    const removedOne = await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "retirer", saisie: "Unused CSS classes", client: tenu.client });
    assert.ok("propose" in removedOne && removedOne.geste === "retirer");
    assert.equal(tenu.ouvertes.at(-1)?.title, "brigade: remove a check of the closer");
    assert.deepEqual(verificationsOf(tenu.texte(VERIFICATIONS, "pr") ?? "x"), []);
    assert.deepEqual(verificationsOf(tenu.texte(VERIFICATIONS) ?? ""), ["Unused CSS classes"], "main n'a pas bougé");

    // Sans branche connue : celle par défaut du dépôt.
    const withoutBranch = github();
    assert.ok("propose" in (await changeTheVerifications({ depot: REPOSITORY, branche: null, geste: "ajouter", saisie: "Unused CSS", client: withoutBranch.client })));
    assert.ok(withoutBranch.demandes.includes(`GET /repos/${REPOSITORY}`));
    assert.equal(withoutBranch.ouvertes[0]?.base, "main");
  });

  test("une vérification vide ou trop longue n'écrit rien ; GitHub qui refuse la lecture se dit, son détail à part", async () => {
    const repository = github();
    for (const input of ["", "   ", "x".repeat(201)]) assert.ok("refus" in (await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: input, client: repository.client })));
    assert.equal(repository.ecrits.length, 0);
    assert.equal(repository.ouvertes.length, 0);
    const refuses = github({ refus: { [`/repos/${REPOSITORY}/contents/${VERIFICATIONS}`]: { status: 403, data: { message: "Resource not accessible" } } } });
    assert.deepEqual(await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Unused CSS", client: refuses.client }), {
      refus: `nothing was changed: ${VERIFICATIONS} was not read on GitHub`,
      detail: `GitHub refused the reading of ${VERIFICATIONS} (HTTP 403): Resource not accessible`,
    });
  });

  test("chaque étape que GitHub refuse : rien n'est proposé, rien ne se dit fait, main n'a pas bougé, le détail est gardé", async () => {
    const not: AnswerGitHub = { status: 422, data: { message: "Refused here" } };
    for (const [step, what] of [
      [`/repos/${REPOSITORY}/git/ref/heads/main`, "the reading of main"],
      [`POST /repos/${REPOSITORY}/git/refs`, "the branch brigade/setting-"],
      [`PUT /repos/${REPOSITORY}/contents/${VERIFICATIONS}`, `the change of ${VERIFICATIONS}`],
      [`POST /repos/${REPOSITORY}/pulls`, "the pull request of brigade/setting-"],
    ] as const) {
      const repository = github({ fichiers: { [VERIFICATIONS]: textOfVerifications(["Unused CSS classes"]) }, refus: { [step]: not } });
      const rendered = await changeTheVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Doc sentences", client: repository.client });
      assert.ok("refus" in rendered, step);
      assert.equal(rendered.refus, `nothing was proposed: GitHub did not open the pull request of ${VERIFICATIONS}`);
      assert.ok(rendered.detail?.startsWith(`GitHub refused ${what}`) && rendered.detail.includes("(HTTP 422): Refused here"), `${step}: ${rendered.detail}`);
      assert.deepEqual(verificationsOf(repository.texte(VERIFICATIONS) ?? ""), ["Unused CSS classes"], step);
      assert.equal(repository.ouvertes.length, 0, step);
    }
  });
});
