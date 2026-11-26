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
import { changerLeSetting, changerLesVerifications, lireLeCloser, lirePass, SETTINGS, texteDesVerifications, VERIFICATIONS, verificationsDu } from "../src/closer-sante.ts";
import { FICHIER } from "../src/caps-duree.ts";
import { PROPOSE } from "../src/settings-du-project.ts";
import type { ClientDeLaPriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/tableau/client.ts";

const REPOSITORY = "chef/parade";
const PROJECT = { version: 1, integrationBranch: "main", defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, closer: { maxTokens: 300000 }, drift: { ticketTokens: 900 } };
const SHA = "9f3c2a17b4e0d6c5a8b1f2e3d4c5b6a7f8e9d0c1";

// Le corps d'une issue de fermeture, tel que le runtime l'écrit.
const corps = (time?: string[]) =>
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
function github({ fichiers = {}, issues = [], prs = {}, refus: refusal = {} }: { fichiers?: Record<string, string>; issues?: unknown[]; prs?: Record<string, Record<string, unknown>[]>; refus?: Record<string, AnswerGitHub> } = {}) {
  const branches = new Map([["main", new Map(Object.entries(fichiers).map(([chemin, texte]) => [chemin, { texte, sha: 1 }]))]]);
  const demandes: string[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const ouvertes: Record<string, unknown>[] = [];
  const contenu = (chemin: string) => /^\/repos\/chef\/parade\/contents\/([^?]+)/.exec(chemin)?.[1];
  const refuse = (request: string) => Object.entries(refusal).find(([debut]) => request.startsWith(debut))?.[1];
  const client: ClientDeLaPriority = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      const refusee = refuse(chemin);
      if (refusee !== undefined) return refusee;
      const fichier = contenu(chemin);
      if (fichier !== undefined) {
        const ref = new URL(chemin, "https://api.github.com").searchParams.get("ref") ?? "main";
        const lu = branches.get(ref)?.get(fichier);
        return lu === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: { content: Buffer.from(lu.texte).toString("base64"), sha: `sha${lu.sha}` } };
      }
      if (chemin === `/repos/${REPOSITORY}`) return { status: 200, data: { default_branch: "main" } };
      const tete = /\/git\/ref\/heads\/(.+)$/.exec(chemin)?.[1];
      if (tete !== undefined) return branches.has(tete) ? { status: 200, data: { object: { sha: `tete-${tete}` } } } : { status: 404, data: { message: "Not Found" } };
      if (chemin.startsWith("/search/issues?")) return { status: 200, data: { items: issues } };
      const head = /\/pulls\?state=all&head=([^&]+)/.exec(chemin)?.[1];
      if (head !== undefined) return { status: 200, data: prs[decodeURIComponent(head)] ?? [] };
      const pr = /\/pulls\/(\d+)$/.exec(chemin)?.[1];
      const trouvee = Object.values(prs).flat().find(({ number }) => String(number) === pr);
      return trouvee === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: trouvee };
    },
    ecrire: async (methode, chemin, corpsEcrit) => {
      demandes.push(`${methode} ${chemin}`);
      const refusee = refuse(`${methode} ${chemin}`);
      if (refusee !== undefined) return refusee;
      const recu = corpsEcrit as Record<string, unknown>;
      if (chemin === `/repos/${REPOSITORY}/git/refs`) {
        const depart = [...branches.entries()].find(([name]) => recu.sha === `tete-${name}`)?.[1] ?? assert.fail(`une branche créée d'aucune tête : ${String(recu.sha)}`);
        branches.set(String(recu.ref).replace("refs/heads/", ""), new Map([...depart].map(([c, f]) => [c, { ...f }])));
        return { status: 201, data: {} };
      }
      if (chemin === `/repos/${REPOSITORY}/pulls`) {
        ouvertes.push(recu);
        return { status: 201, data: { number: 60 + ouvertes.length, html_url: `https://github.com/${REPOSITORY}/pull/${60 + ouvertes.length}` } };
      }
      const fichier = contenu(chemin) ?? "";
      ecrits.push({ ...recu, fichier });
      const sur = branches.get(String(recu.branch ?? "main")) ?? assert.fail("une écriture sur une branche inconnue");
      const avant = sur.get(fichier);
      if (avant !== undefined && recu.sha !== `sha${avant.sha}`) return { status: 409, data: { message: "sha does not match" } };
      sur.set(fichier, { texte: Buffer.from(recu.content as string, "base64").toString("utf8"), sha: (avant?.sha ?? 0) + 1 });
      return { status: 200, data: {} };
    },
  };
  // `texte(fichier, branche)` : un fichier sur une branche — `main` par défaut, celle de la dernière PR ouverte avec `"pr"`.
  const texte = (fichier: string, branch = "main") => branches.get(branch === "pr" ? String(ouvertes.at(-1)?.head) : branch)?.get(fichier)?.texte;
  return { client, demandes, ecrits, ouvertes, texte };
}
const json = (objet: unknown) => `${JSON.stringify(objet, null, 2)}\n`;
const issue = (number: number, body: string, autres: Record<string, unknown> = {}) => ({ number, title: titreDeLaFermeture("main"), html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-10-10T08:00:00Z", state: "closed", author_association: "OWNER", body, ...autres });

describe("le closer, dans le dépôt du projet", () => {
  test("l'app connaît exactement les réglages du closer du runtime, et ses défauts", () => {
    assert.deepEqual(SETTINGS.map(({ cle }) => cle), [...CLES_DU_CLOSER]);
    const defauts = Object.fromEntries(SETTINGS.map(({ cle, defaut }) => [cle, defaut]));
    assert.deepEqual(defauts, { calibration: null, cooksBelow: COOKS_PAR_DEFAUT, maxTokens: TOKENS_PAR_DEFAUT, maxRemovedLines: RETRAITS_PAR_DEFAUT });
  });

  test("une passe se lit dans le corps que le runtime écrit : sa base, ses candidats, la dérive, les temps", () => {
    const body = corps(["Times stable: 4 tickets measured since the last pass, and no drift. No correction ticket is opened or changed."]);
    assert.ok(estUneFermeture(body) && body.startsWith(marqueDeFermeture(SHA)));
    const lue = lirePass({ number: 2531, created_at: "2026-10-10T08:00:00Z", state: "open", body }) ?? assert.fail("pas lue");
    assert.equal(lue.sha, SHA);
    assert.equal(lue.ouverte, true);
    assert.deepEqual(lue.candidats.map(({ id }) => id), ["D1", "M1"]);
    assert.equal(lue.restants, 3);
    assert.deepEqual(lue.derive, ["last 20 merges: +3,120 / −840 (3.7:1)", "last 21 merges: +3,300 / −900 (3.7:1)"]);
    assert.match(lue.temps[0] ?? "", /^Times stable/);
    assert.equal(lirePass({ number: 1, created_at: "2026-10-10T08:00:00Z", state: "open", body: "## Context\n\nan ordinary ticket" }), null);
  });

  test("tout se lit sur la branche d'intégration : réglages, vérifications en plus, passes et ce que chacune a retiré", async () => {
    const repository = github({
      fichiers: { [FICHIER]: json(PROJECT), [VERIFICATIONS]: texteDesVerifications(["Unused CSS classes"]) },
      issues: [
        issue(2477, corps()),
        issue(2531, corps(), { state: "open" }),
        issue(2400, corps(), { author_association: "NONE" }),
        issue(2390, "a title that looks like one, without the mark"),
      ],
      prs: {
        [`chef:${brancheDuTicket(2477)}`]: [{ number: 2480, html_url: `https://github.com/${REPOSITORY}/pull/2480`, merged_at: "2026-10-09T08:00:00Z", merged: true, deletions: 1234, additions: 56 }],
      },
    });
    const lu = await lireLeCloser({ depot: REPOSITORY, branche: "main", client: repository.client });

    assert.ok("liste" in lu.reglages);
    assert.deepEqual(lu.reglages.liste.map(({ cle, valeur }) => [cle, valeur]), [
      ["calibration", null],
      ["cooksBelow", null],
      ["maxTokens", 300000],
      ["maxRemovedLines", null],
    ]);
    assert.deepEqual(lu.verifications, { liste: ["Unused CSS classes"] });
    assert.ok("liste" in lu.passes);
    assert.deepEqual(lu.passes.liste.map(({ numero, ouverte, pr }) => [numero, ouverte, pr]), [
      [2531, true, null],
      [2477, false, { numero: 2480, url: `https://github.com/${REPOSITORY}/pull/2480`, mergee: true, retirees: 1234, ajoutees: 56 }],
    ]);
    assert.ok(repository.demandes.includes(`GET /repos/${REPOSITORY}/contents/${FICHIER}?ref=main`));
    assert.ok(repository.demandes.includes(`GET /repos/${REPOSITORY}/pulls?state=all&head=${encodeURIComponent(`chef:${brancheDuTicket(2531)}`)}&per_page=10`), "la PR d'une passe est celle de la branche de son cook");
  });

  test("une lecture qui échoue ne retire pas les autres ; un dépôt sans fichiers n'a ni réglage posé ni vérification", async () => {
    const repository = github({ refus: { "/search/issues": { status: 401, data: { message: "Bad credentials" } } } });
    const lu = await lireLeCloser({ depot: REPOSITORY, branche: "main", client: repository.client });
    assert.deepEqual(lu.passes, { sans: "the closer's passes unavailable", detail: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
    assert.deepEqual(lu.verifications, { liste: [] });
    assert.ok("liste" in lu.reglages && lu.reglages.liste.every(({ valeur }) => valeur === null));
  });
});

describe("les réglages du closer, proposés depuis Health", () => {
  test("un réglage changé est proposé par une PR vers main — le reste gardé —, c'est la valeur que le runtime lit une fois mergé, et main n'a pas bougé", async () => {
    const repository = github({ fichiers: { [FICHIER]: json(PROJECT) } });
    assert.deepEqual(await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "maxRemovedLines", saisie: "800", client: repository.client }), {
      propose: PROPOSE,
      pr: `https://github.com/${REPOSITORY}/pull/61`,
      numero: 61,
      cle: "maxRemovedLines",
      valeur: 800,
    });
    assert.deepEqual(repository.demandes, [`GET /repos/${REPOSITORY}/contents/${FICHIER}?ref=main`, `GET /repos/${REPOSITORY}/git/ref/heads/main`, `POST /repos/${REPOSITORY}/git/refs`, `PUT /repos/${REPOSITORY}/contents/${FICHIER}`, `POST /repos/${REPOSITORY}/pulls`]);
    const first = repository.texte(FICHIER, "pr") ?? assert.fail("pas de fichier proposé");
    assert.deepEqual(reglagesDuTexte(first).closer, { maxTokens: 300000, maxRemovedLines: 800 });
    assert.deepEqual(await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "calibration", saisie: { model: "opus", effort: "high" }, client: repository.client }), {
      propose: PROPOSE,
      pr: `https://github.com/${REPOSITORY}/pull/62`,
      numero: 62,
      cle: "calibration",
      valeur: { model: "opus", effort: "high" },
    });
    await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "cooksBelow", saisie: " 2 ", client: repository.client });
    // Chaque changement a sa branche, partie de main, et sa PR vers main.
    const neuves = repository.ouvertes.map(({ head }) => String(head));
    assert.equal(new Set(neuves).size, 3);
    assert.deepEqual(
      repository.ecrits.map(({ message, branch, sha }) => [message, neuves.indexOf(String(branch)), sha]),
      [
        ["brigade: set closer.maxRemovedLines to 800 (from the app, Kitchen > Health)", 0, "sha1"],
        ["brigade: set closer.calibration to opus / high (from the app, Kitchen > Health)", 1, "sha1"],
        ["brigade: set closer.cooksBelow to 2 (from the app, Kitchen > Health)", 2, "sha1"],
      ],
    );
    assert.deepEqual(repository.ouvertes.map(({ base }) => base), ["main", "main", "main"]);
    const texte = repository.texte(FICHIER, "pr") ?? assert.fail("pas de fichier proposé");
    assert.deepEqual(JSON.parse(texte).defaultCalibrations, PROJECT.defaultCalibrations);
    assert.deepEqual(reglagesDuTexte(texte).closer, { cooksBelow: 2, maxTokens: 300000 });
    // Relu sur main : la valeur en vigueur, celle d'avant — la PR vaut une fois mergée.
    assert.equal(repository.texte(FICHIER), json(PROJECT));
    const lu = await lireLeCloser({ depot: REPOSITORY, branche: "main", client: repository.client });
    assert.ok("liste" in lu.reglages);
    assert.equal(lu.reglages.liste.find(({ cle }) => cle === "maxRemovedLines")?.valeur, null);
  });

  test("vide, le retrait du réglage est proposé ; la valeur déjà là n'ouvre rien ; sans fichier, il est créé ; sans branche, celle par défaut", async () => {
    const repository = github({ fichiers: { [FICHIER]: json(PROJECT) } });
    assert.deepEqual(await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "maxTokens", saisie: "300000", client: repository.client }), { fait: "unchanged: the repository already says so", cle: "maxTokens", valeur: 300000 });
    assert.equal(repository.ecrits.length, 0);
    assert.equal(repository.ouvertes.length, 0);
    await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "maxTokens", saisie: "", client: repository.client });
    assert.equal(JSON.parse(repository.texte(FICHIER, "pr") ?? "{}").closer, undefined, "plus aucun réglage : le closer sort du fichier");

    const neuf = github();
    await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "calibration", saisie: { model: "sonnet", effort: "medium" }, client: neuf.client });
    assert.deepEqual(reglagesDuTexte(neuf.texte(FICHIER, "pr") ?? assert.fail("pas de fichier")), { integrationBranch: "main", closer: { calibration: { model: "sonnet", effort: "medium" } } });

    const sansBranch = github({ fichiers: { [FICHIER]: json(PROJECT) } });
    assert.ok("propose" in (await changerLeSetting({ depot: REPOSITORY, branche: null, cle: "maxRemovedLines", saisie: "800", client: sansBranch.client })));
    assert.ok(sansBranch.demandes.includes(`GET /repos/${REPOSITORY}`), "la branche par défaut est lue");
    assert.equal(sansBranch.ouvertes[0]?.base, "main");
  });

  test("chaque étape que GitHub refuse : rien n'est proposé, rien ne se dit fait, main n'a pas bougé, le détail est gardé", async () => {
    const non: AnswerGitHub = { status: 422, data: { message: "Refused here" } };
    for (const [step, quoi] of [
      [`/repos/${REPOSITORY}/git/ref/heads/main`, "the reading of main"],
      [`POST /repos/${REPOSITORY}/git/refs`, "the branch brigade/setting-"],
      [`PUT /repos/${REPOSITORY}/contents/${FICHIER}`, `the change of ${FICHIER}`],
      [`POST /repos/${REPOSITORY}/pulls`, "the pull request of brigade/setting-"],
    ] as const) {
      const repository = github({ fichiers: { [FICHIER]: json(PROJECT) }, refus: { [step]: non } });
      const rendu = await changerLeSetting({ depot: REPOSITORY, branche: "main", cle: "maxRemovedLines", saisie: "800", client: repository.client });
      assert.ok("refus" in rendu, step);
      assert.equal(rendu.refus, `nothing was proposed: GitHub did not open the pull request of ${FICHIER}`);
      assert.ok(rendu.detail?.startsWith(`GitHub refused ${quoi}`) && rendu.detail.includes("(HTTP 422): Refused here"), `${step}: ${rendu.detail}`);
      assert.equal(repository.texte(FICHIER), json(PROJECT), step);
      assert.equal(repository.ouvertes.length, 0, step);
    }
  });

  test("une valeur que le runtime refuserait n'écrit rien, et se dit", async () => {
    for (const [cle, saisie] of [
      ["maxRemovedLines", "0"],
      ["maxTokens", "12.5"],
      ["cooksBelow", "deux"],
      ["calibration", { model: "opus", effort: "" }],
      ["calibration", { model: "gpt", effort: "high" }],
      ["drift", "3"],
    ] as const) {
      const repository = github({ fichiers: { [FICHIER]: json(PROJECT) } });
      const rendu = await changerLeSetting({ depot: REPOSITORY, branche: "main", cle, saisie, client: repository.client });
      assert.ok("refus" in rendu && rendu.refus.startsWith("nothing was changed"), `${cle} = ${JSON.stringify(saisie)}`);
      assert.equal(repository.ecrits.length, 0);
      assert.equal(repository.ouvertes.length, 0);
    }
  });
});

describe("les vérifications en plus, proposées depuis Health", () => {
  test("une vérification ajoutée est proposée par une PR vers main ; la liste en vigueur reste celle de main ; déjà là, rien ; retirée, son retrait est proposé", async () => {
    const repository = github();
    const ajoutee = await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "  Unused   CSS classes ", client: repository.client });
    assert.deepEqual(ajoutee, { propose: PROPOSE, pr: `https://github.com/${REPOSITORY}/pull/61`, numero: 61, geste: "ajouter", verification: "Unused CSS classes", liste: [] });
    assert.deepEqual(repository.demandes, [`GET /repos/${REPOSITORY}/contents/${VERIFICATIONS}?ref=main`, `GET /repos/${REPOSITORY}/git/ref/heads/main`, `POST /repos/${REPOSITORY}/git/refs`, `PUT /repos/${REPOSITORY}/contents/${VERIFICATIONS}`, `POST /repos/${REPOSITORY}/pulls`]);
    const [pr] = repository.ouvertes;
    assert.deepEqual([pr?.base, pr?.title], ["main", "brigade: add a check of the closer"]);
    assert.deepEqual(repository.ecrits.map(({ fichier, branch, sha }) => [fichier, branch, sha]), [[VERIFICATIONS, pr?.head, undefined]], "créé sur la branche neuve, jamais sur main");
    const texte = repository.texte(VERIFICATIONS, "pr") ?? assert.fail("pas de fichier proposé");
    assert.match(texte, /^# The closer's extra checks\n/);
    assert.deepEqual(verificationsDu(texte), ["Unused CSS classes"]);
    // main n'a pas bougé : la liste relue est celle en vigueur.
    assert.equal(repository.texte(VERIFICATIONS), undefined);
    assert.deepEqual((await lireLeCloser({ depot: REPOSITORY, branche: "main", client: repository.client })).verifications, { liste: [] });

    // Sur un fichier déjà là : le reste gardé, le `sha` lu sur main.
    const tenu = github({ fichiers: { [VERIFICATIONS]: texteDesVerifications(["Unused CSS classes"]) } });
    await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Doc sentences naming removed code", client: tenu.client });
    assert.equal(tenu.ecrits[0]?.sha, "sha1");
    assert.deepEqual(verificationsDu(tenu.texte(VERIFICATIONS, "pr") ?? ""), ["Unused CSS classes", "Doc sentences naming removed code"]);
    assert.deepEqual(await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Unused CSS classes", client: tenu.client }), { fait: "unchanged: the closer already has this check", liste: ["Unused CSS classes"] });
    assert.equal(tenu.ouvertes.length, 1);
    const retiree = await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "retirer", saisie: "Unused CSS classes", client: tenu.client });
    assert.ok("propose" in retiree && retiree.geste === "retirer");
    assert.equal(tenu.ouvertes.at(-1)?.title, "brigade: remove a check of the closer");
    assert.deepEqual(verificationsDu(tenu.texte(VERIFICATIONS, "pr") ?? "x"), []);
    assert.deepEqual(verificationsDu(tenu.texte(VERIFICATIONS) ?? ""), ["Unused CSS classes"], "main n'a pas bougé");

    // Sans branche connue : celle par défaut du dépôt.
    const sansBranch = github();
    assert.ok("propose" in (await changerLesVerifications({ depot: REPOSITORY, branche: null, geste: "ajouter", saisie: "Unused CSS", client: sansBranch.client })));
    assert.ok(sansBranch.demandes.includes(`GET /repos/${REPOSITORY}`));
    assert.equal(sansBranch.ouvertes[0]?.base, "main");
  });

  test("une vérification vide ou trop longue n'écrit rien ; GitHub qui refuse la lecture se dit, son détail à part", async () => {
    const repository = github();
    for (const saisie of ["", "   ", "x".repeat(201)]) assert.ok("refus" in (await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie, client: repository.client })));
    assert.equal(repository.ecrits.length, 0);
    assert.equal(repository.ouvertes.length, 0);
    const refuse = github({ refus: { [`/repos/${REPOSITORY}/contents/${VERIFICATIONS}`]: { status: 403, data: { message: "Resource not accessible" } } } });
    assert.deepEqual(await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Unused CSS", client: refuse.client }), {
      refus: `nothing was changed: ${VERIFICATIONS} was not read on GitHub`,
      detail: `GitHub refused the reading of ${VERIFICATIONS} (HTTP 403): Resource not accessible`,
    });
  });

  test("chaque étape que GitHub refuse : rien n'est proposé, rien ne se dit fait, main n'a pas bougé, le détail est gardé", async () => {
    const non: AnswerGitHub = { status: 422, data: { message: "Refused here" } };
    for (const [step, quoi] of [
      [`/repos/${REPOSITORY}/git/ref/heads/main`, "the reading of main"],
      [`POST /repos/${REPOSITORY}/git/refs`, "the branch brigade/setting-"],
      [`PUT /repos/${REPOSITORY}/contents/${VERIFICATIONS}`, `the change of ${VERIFICATIONS}`],
      [`POST /repos/${REPOSITORY}/pulls`, "the pull request of brigade/setting-"],
    ] as const) {
      const repository = github({ fichiers: { [VERIFICATIONS]: texteDesVerifications(["Unused CSS classes"]) }, refus: { [step]: non } });
      const rendu = await changerLesVerifications({ depot: REPOSITORY, branche: "main", geste: "ajouter", saisie: "Doc sentences", client: repository.client });
      assert.ok("refus" in rendu, step);
      assert.equal(rendu.refus, `nothing was proposed: GitHub did not open the pull request of ${VERIFICATIONS}`);
      assert.ok(rendu.detail?.startsWith(`GitHub refused ${quoi}`) && rendu.detail.includes("(HTTP 422): Refused here"), `${step}: ${rendu.detail}`);
      assert.deepEqual(verificationsDu(repository.texte(VERIFICATIONS) ?? ""), ["Unused CSS classes"], step);
      assert.equal(repository.ouvertes.length, 0, step);
    }
  });
});
