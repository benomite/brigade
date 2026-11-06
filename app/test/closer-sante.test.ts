// Le closer d'un projet, sur Kitchen > Health (#2491) : l'app lit ses passes sur GitHub — les issues de fermeture que le
// runtime ouvre, et la PR de chacune —, ses vérifications en plus (`.claude/brigade/closer-checks.md`) et ses réglages
// (`closer.*` de `.claude/brigade/projet.json`), et les écrit sur la branche d'intégration. Un réglage écrit est de ceux
// que le runtime lit, et c'est sa valeur qu'il applique ensuite ; une vérification ajoutée se relit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brancheDuTicket } from "../../runtime/src/brigade-github.ts";
import { corpsDeLaFermeture, estUneFermeture, marqueDeFermeture, titreDeLaFermeture } from "../../runtime/src/closer-github-passe/closer-github-passe.ts";
import { COOKS_PAR_DEFAUT, RETRAITS_PAR_DEFAUT, TOKENS_PAR_DEFAUT } from "../../runtime/src/closing/settings.ts";
import { CLES_DU_CLOSER, reglagesDuTexte } from "../../runtime/src/reglages-projet/reglages.ts";
import { changerLeReglage, changerLesVerifications, lireLeCloser, lirePasse, REGLAGES, texteDesVerifications, VERIFICATIONS, verificationsDu } from "../src/closer-sante.ts";
import { FICHIER } from "../src/plafonds-duree.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";

const DEPOT = "chef/parade";
const PROJET = { version: 1, integrationBranch: "main", defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, closer: { maxTokens: 300000 }, drift: { tests: 900 } };
const SHA = "9f3c2a17b4e0d6c5a8b1f2e3d4c5b6a7f8e9d0c1";

// Le corps d'une issue de fermeture, tel que le runtime l'écrit.
const corps = (temps?: string[]) =>
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
    ...(temps === undefined ? {} : { temps }),
  });

// Un GitHub en mémoire : les fichiers de `main` (contenu et `sha` qui change à chaque écriture), les issues que la
// recherche rend, les PR de chaque branche ; chaque demande notée — et, pour une méthode ou un chemin nommé, la réponse
// qu'il rend à la place.
function github({ fichiers = {}, issues = [], prs = {}, refus = {} }: { fichiers?: Record<string, string>; issues?: unknown[]; prs?: Record<string, Record<string, unknown>[]>; refus?: Record<string, ReponseGitHub> } = {}) {
  const textes = new Map(Object.entries(fichiers));
  const shas = new Map([...textes.keys()].map((chemin) => [chemin, 1]));
  const demandes: string[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const contenu = (chemin: string) => /^\/repos\/chef\/parade\/contents\/([^?]+)/.exec(chemin)?.[1];
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      const refuse = Object.entries(refus).find(([debut]) => chemin.startsWith(debut));
      if (refuse !== undefined) return refuse[1];
      const fichier = contenu(chemin);
      if (fichier !== undefined) {
        const texte = textes.get(fichier);
        return texte === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: { content: Buffer.from(texte).toString("base64"), sha: `sha${shas.get(fichier)}` } };
      }
      if (chemin.startsWith("/search/issues?")) return { status: 200, data: { items: issues } };
      const tete = /\/pulls\?state=all&head=([^&]+)/.exec(chemin)?.[1];
      if (tete !== undefined) return { status: 200, data: prs[decodeURIComponent(tete)] ?? [] };
      const pr = /\/pulls\/(\d+)$/.exec(chemin)?.[1];
      const trouvee = Object.values(prs).flat().find(({ number }) => String(number) === pr);
      return trouvee === undefined ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: trouvee };
    },
    ecrire: async (methode, chemin, corpsEcrit) => {
      demandes.push(`${methode} ${chemin}`);
      const fichier = contenu(chemin) ?? "";
      const recu = corpsEcrit as Record<string, unknown>;
      ecrits.push({ ...recu, fichier });
      if (textes.has(fichier) && recu.sha !== `sha${shas.get(fichier)}`) return { status: 409, data: { message: "sha does not match" } };
      textes.set(fichier, Buffer.from(recu.content as string, "base64").toString("utf8"));
      shas.set(fichier, (shas.get(fichier) ?? 0) + 1);
      return { status: 200, data: {} };
    },
  };
  return { client, demandes, ecrits, texte: (fichier: string) => textes.get(fichier) };
}
const json = (objet: unknown) => `${JSON.stringify(objet, null, 2)}\n`;
const issue = (number: number, body: string, autres: Record<string, unknown> = {}) => ({ number, title: titreDeLaFermeture("main"), html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-10-10T08:00:00Z", state: "closed", author_association: "OWNER", body, ...autres });

describe("le closer, dans le dépôt du projet", () => {
  test("l'app connaît exactement les réglages du closer du runtime, et ses défauts", () => {
    assert.deepEqual(REGLAGES.map(({ cle }) => cle), [...CLES_DU_CLOSER]);
    const defauts = Object.fromEntries(REGLAGES.map(({ cle, defaut }) => [cle, defaut]));
    assert.deepEqual(defauts, { calibration: null, cooksBelow: COOKS_PAR_DEFAUT, maxTokens: TOKENS_PAR_DEFAUT, maxRemovedLines: RETRAITS_PAR_DEFAUT });
  });

  test("une passe se lit dans le corps que le runtime écrit : sa base, ses candidats, la dérive, les temps", () => {
    const body = corps(["Times stable: 4 tickets measured since the last pass, and no drift. No correction ticket is opened or changed."]);
    assert.ok(estUneFermeture(body) && body.startsWith(marqueDeFermeture(SHA)));
    const lue = lirePasse({ number: 2531, created_at: "2026-10-10T08:00:00Z", state: "open", body }) ?? assert.fail("pas lue");
    assert.equal(lue.sha, SHA);
    assert.equal(lue.ouverte, true);
    assert.deepEqual(lue.candidats.map(({ id }) => id), ["D1", "M1"]);
    assert.equal(lue.restants, 3);
    assert.deepEqual(lue.derive, ["last 20 merges: +3,120 / −840 (3.7:1)", "last 21 merges: +3,300 / −900 (3.7:1)"]);
    assert.match(lue.temps[0] ?? "", /^Times stable/);
    assert.equal(lirePasse({ number: 1, created_at: "2026-10-10T08:00:00Z", state: "open", body: "## Context\n\nan ordinary ticket" }), null);
  });

  test("tout se lit sur la branche d'intégration : réglages, vérifications en plus, passes et ce que chacune a retiré", async () => {
    const depot = github({
      fichiers: { [FICHIER]: json(PROJET), [VERIFICATIONS]: texteDesVerifications(["Unused CSS classes"]) },
      issues: [
        issue(2477, corps()),
        issue(2531, corps(), { state: "open" }),
        issue(2400, corps(), { author_association: "NONE" }),
        issue(2390, "a title that looks like one, without the mark"),
      ],
      prs: {
        [`chef:${brancheDuTicket(2477)}`]: [{ number: 2480, html_url: `https://github.com/${DEPOT}/pull/2480`, merged_at: "2026-10-09T08:00:00Z", merged: true, deletions: 1234, additions: 56 }],
      },
    });
    const lu = await lireLeCloser({ depot: DEPOT, branche: "main", client: depot.client });

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
      [2477, false, { numero: 2480, url: `https://github.com/${DEPOT}/pull/2480`, mergee: true, retirees: 1234, ajoutees: 56 }],
    ]);
    assert.ok(depot.demandes.includes(`GET /repos/${DEPOT}/contents/${FICHIER}?ref=main`));
    assert.ok(depot.demandes.includes(`GET /repos/${DEPOT}/pulls?state=all&head=${encodeURIComponent(`chef:${brancheDuTicket(2531)}`)}&per_page=10`), "la PR d'une passe est celle de la branche de son cook");
  });

  test("une lecture qui échoue ne retire pas les autres ; un dépôt sans fichiers n'a ni réglage posé ni vérification", async () => {
    const depot = github({ refus: { "/search/issues": { status: 401, data: { message: "Bad credentials" } } } });
    const lu = await lireLeCloser({ depot: DEPOT, branche: "main", client: depot.client });
    assert.deepEqual(lu.passes, { sans: "the closer's passes unavailable", detail: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
    assert.deepEqual(lu.verifications, { liste: [] });
    assert.ok("liste" in lu.reglages && lu.reglages.liste.every(({ valeur }) => valeur === null));
  });
});

describe("les réglages du closer, écrits depuis Health", () => {
  test("un réglage changé est écrit sur la branche, le reste gardé, et c'est la valeur que le runtime lit ensuite", async () => {
    const depot = github({ fichiers: { [FICHIER]: json(PROJET) } });
    assert.deepEqual(await changerLeReglage({ depot: DEPOT, branche: "main", cle: "maxRemovedLines", saisie: "800", client: depot.client }), {
      fait: "saved in the repository — the station applies it at its next fetch",
      cle: "maxRemovedLines",
      valeur: 800,
    });
    assert.deepEqual(await changerLeReglage({ depot: DEPOT, branche: "main", cle: "calibration", saisie: { model: "opus", effort: "high" }, client: depot.client }), {
      fait: "saved in the repository — the station applies it at its next fetch",
      cle: "calibration",
      valeur: { model: "opus", effort: "high" },
    });
    await changerLeReglage({ depot: DEPOT, branche: "main", cle: "cooksBelow", saisie: " 2 ", client: depot.client });
    assert.deepEqual(
      depot.ecrits.map(({ message, branch }) => [message, branch]),
      [
        ["brigade: set closer.maxRemovedLines to 800 (from the app, Kitchen > Health)", "main"],
        ["brigade: set closer.calibration to opus / high (from the app, Kitchen > Health)", "main"],
        ["brigade: set closer.cooksBelow to 2 (from the app, Kitchen > Health)", "main"],
      ],
    );
    const texte = depot.texte(FICHIER) ?? assert.fail("pas de fichier");
    assert.deepEqual(JSON.parse(texte).defaultCalibrations, PROJET.defaultCalibrations);
    assert.deepEqual(reglagesDuTexte(texte).closer, { calibration: { model: "opus", effort: "high" }, cooksBelow: 2, maxTokens: 300000, maxRemovedLines: 800 });
    // Relu : la valeur écrite.
    const lu = await lireLeCloser({ depot: DEPOT, branche: "main", client: depot.client });
    assert.ok("liste" in lu.reglages);
    assert.deepEqual(lu.reglages.liste.find(({ cle }) => cle === "maxRemovedLines")?.valeur, 800);
  });

  test("vide, le réglage se retire du dépôt ; la valeur déjà écrite n'écrit rien ; sans fichier, il est créé", async () => {
    const depot = github({ fichiers: { [FICHIER]: json(PROJET) } });
    assert.deepEqual(await changerLeReglage({ depot: DEPOT, branche: "main", cle: "maxTokens", saisie: "300000", client: depot.client }), { fait: "unchanged: the repository already says so", cle: "maxTokens", valeur: 300000 });
    assert.equal(depot.ecrits.length, 0);
    await changerLeReglage({ depot: DEPOT, branche: "main", cle: "maxTokens", saisie: "", client: depot.client });
    assert.equal(JSON.parse(depot.texte(FICHIER) ?? "{}").closer, undefined, "plus aucun réglage : le closer sort du fichier");

    const neuf = github();
    await changerLeReglage({ depot: DEPOT, branche: "main", cle: "calibration", saisie: { model: "sonnet", effort: "medium" }, client: neuf.client });
    assert.deepEqual(reglagesDuTexte(neuf.texte(FICHIER) ?? assert.fail("pas de fichier")), { integrationBranch: "main", closer: { calibration: { model: "sonnet", effort: "medium" } } });
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
      const depot = github({ fichiers: { [FICHIER]: json(PROJET) } });
      const rendu = await changerLeReglage({ depot: DEPOT, branche: "main", cle, saisie, client: depot.client });
      assert.ok("refus" in rendu && rendu.refus.startsWith("nothing was changed"), `${cle} = ${JSON.stringify(saisie)}`);
      assert.equal(depot.ecrits.length, 0);
    }
  });
});

describe("les vérifications en plus, ajoutées depuis Health", () => {
  test("une vérification ajoutée est écrite dans le dépôt et se relit ; deux fois, elle n'est pas doublée ; retirée, elle part", async () => {
    const depot = github();
    assert.deepEqual(await changerLesVerifications({ depot: DEPOT, branche: "main", geste: "ajouter", saisie: "  Unused   CSS classes ", client: depot.client }), { fait: "added in the repository", liste: ["Unused CSS classes"] });
    await changerLesVerifications({ depot: DEPOT, branche: "main", geste: "ajouter", saisie: "Doc sentences naming removed code", client: depot.client });
    assert.deepEqual(depot.ecrits.map(({ fichier, branch, sha }) => [fichier, branch, sha]), [
      [VERIFICATIONS, "main", undefined],
      [VERIFICATIONS, "main", "sha1"],
    ]);
    const texte = depot.texte(VERIFICATIONS) ?? assert.fail("pas de fichier");
    assert.match(texte, /^# The closer's extra checks\n/);
    assert.deepEqual(verificationsDu(texte), ["Unused CSS classes", "Doc sentences naming removed code"]);
    assert.deepEqual((await lireLeCloser({ depot: DEPOT, branche: "main", client: depot.client })).verifications, { liste: ["Unused CSS classes", "Doc sentences naming removed code"] });

    assert.deepEqual(await changerLesVerifications({ depot: DEPOT, branche: "main", geste: "ajouter", saisie: "Unused CSS classes", client: depot.client }), { fait: "unchanged: the closer already has this check", liste: ["Unused CSS classes", "Doc sentences naming removed code"] });
    assert.equal(depot.ecrits.length, 2);
    await changerLesVerifications({ depot: DEPOT, branche: "main", geste: "retirer", saisie: "Unused CSS classes", client: depot.client });
    assert.deepEqual(verificationsDu(depot.texte(VERIFICATIONS) ?? ""), ["Doc sentences naming removed code"]);
  });

  test("une vérification vide ou trop longue n'écrit rien ; GitHub qui refuse se dit, son détail à part", async () => {
    const depot = github();
    for (const saisie of ["", "   ", "x".repeat(201)]) assert.ok("refus" in (await changerLesVerifications({ depot: DEPOT, branche: "main", geste: "ajouter", saisie, client: depot.client })));
    assert.equal(depot.ecrits.length, 0);
    const refuse = github({ refus: { [`/repos/${DEPOT}/contents/${VERIFICATIONS}`]: { status: 403, data: { message: "Resource not accessible" } } } });
    assert.deepEqual(await changerLesVerifications({ depot: DEPOT, branche: "main", geste: "ajouter", saisie: "Unused CSS", client: refuse.client }), {
      refus: `nothing was changed: ${VERIFICATIONS} was not read on GitHub`,
      detail: `GitHub refused the reading of ${VERIFICATIONS} (HTTP 403): Resource not accessible`,
    });
  });
});
