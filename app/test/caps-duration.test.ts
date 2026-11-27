// Les plafonds de durée d'un projet, réglés depuis Kitchen > Health (#2490) : l'app lit `drift.*` de
// `.claude/brigade/projet.json` sur la branche d'intégration de son dépôt, sur GitHub, et en propose un changement par une
// pull request (#2920). Le fichier proposé est de ceux que le runtime lit — c'est sa valeur qu'il applique, une fois mergé.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { reglagesDuTexte, SEUILS_DU_PROJET, seuilsDuProjet } from "../../runtime/src/reglages-projet/reglages.ts";
import { changeTheCap, FILE, readTheCaps, CAPS, valueProposed } from "../src/caps-duration.ts";
import { PROPOSES } from "../src/settings-of-project.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/board/client.ts";

const REPOSITORY = "chef/parade";
const CONTENT = `/repos/${REPOSITORY}/contents/${FILE}`;
const PROJECT = { version: 1, integrationBranch: "main", defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, drift: { ticketTokens: 900 } };

// Un GitHub en mémoire, ses branches : `main` porte le fichier (ou rien), une branche créée part de la tête d'une autre et
// en copie les fichiers, le `sha` d'un fichier change à chaque écriture ; les PR ouvertes sont gardées. Chaque demande est
// notée — et, pour une étape nommée, la réponse qu'il rend à la place.
type Step = "lecture" | "depot" | "tete" | "branche" | "fichier" | "pr" | "retrait";
function github(file: unknown | null, refusal: Partial<Record<Step, AnswerGitHub>> = {}) {
  const branches = new Map<string, { texte: string | null; sha: number }>([["main", { texte: file === null ? null : `${JSON.stringify(file, null, 2)}\n`, sha: 1 }]]);
  const requests: string[] = [];
  const writtenOnes: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  const prs: Record<string, unknown>[] = [];
  const removed: string[] = [];
  const client: ClientOfThePriority = {
    lire: async (path) => {
      requests.push(`GET ${path}`);
      if (path.startsWith(CONTENT)) {
        if (refusal.lecture !== undefined) return refusal.lecture;
        const ref = new URL(path, "https://api.github.com").searchParams.get("ref") ?? "main";
        const on = branches.get(ref);
        if (on === undefined || on.texte === null) return { status: 404, data: { message: "Not Found" } };
        return { status: 200, data: { content: Buffer.from(on.texte).toString("base64"), sha: `sha${on.sha}` } };
      }
      if (path === `/repos/${REPOSITORY}`) return refusal.depot ?? { status: 200, data: { default_branch: "main" } };
      const head = /\/git\/ref\/heads\/(.+)$/.exec(path)?.[1];
      if (head !== undefined) return refusal.tete ?? (branches.has(head) ? { status: 200, data: { object: { sha: `tete-${head}` } } } : { status: 404, data: { message: "Not Found" } });
      return { status: 404, data: { message: "Not Found" } };
    },
    ecrire: async (method, path, body) => {
      requests.push(`${method} ${path}`);
      const received = body as Record<string, unknown>;
      const removedOne = method === "DELETE" ? /\/git\/refs\/heads\/(.+)$/.exec(path)?.[1] : undefined;
      if (removedOne !== undefined) {
        if (refusal.retrait !== undefined) return refusal.retrait;
        if (!branches.delete(removedOne)) return { status: 422, data: { message: "Reference does not exist" } };
        removed.push(removedOne);
        return { status: 204, data: null };
      }
      if (path === `/repos/${REPOSITORY}/git/refs`) {
        if (refusal.branche !== undefined) return refusal.branche;
        created.push(received);
        const departure = [...branches.entries()].find(([name]) => received.sha === `tete-${name}`)?.[1] ?? assert.fail(`une branche créée d'aucune tête : ${String(received.sha)}`);
        branches.set(String(received.ref).replace("refs/heads/", ""), { ...departure });
        return { status: 201, data: {} };
      }
      if (path === CONTENT) {
        if (refusal.fichier !== undefined) return refusal.fichier;
        writtenOnes.push(received);
        const on = branches.get(String(received.branch ?? "main")) ?? assert.fail("une écriture sur une branche inconnue");
        if (on.texte !== null && received.sha !== `sha${on.sha}`) return { status: 409, data: { message: "sha does not match" } };
        const createdOne = on.texte === null;
        on.texte = Buffer.from(received.content as string, "base64").toString("utf8");
        on.sha++;
        return { status: createdOne ? 201 : 200, data: { content: { sha: `sha${on.sha}` } } };
      }
      if (path === `/repos/${REPOSITORY}/pulls`) {
        if (refusal.pr !== undefined) return refusal.pr;
        prs.push(received);
        return { status: 201, data: { number: 40 + prs.length, html_url: `https://github.com/${REPOSITORY}/pull/${40 + prs.length}` } };
      }
      return { status: 404, data: { message: "Not Found" } };
    },
  };
  // `texte(branche)` : le fichier sur une branche — `main` par défaut, la branche de la dernière PR avec `"pr"`.
  const text = (branch = "main") => branches.get(branch === "pr" ? String(prs.at(-1)?.head) : branch)?.texte ?? null;
  return { client, demandes: requests, ecrits: writtenOnes, crees: created, prs, retirees: removed, branches, texte: text };
}

const value = (reading: Awaited<ReturnType<typeof readTheCaps>>, key: string) => ("plafonds" in reading ? reading.plafonds.find((cap) => cap.cle === key)?.valeur : assert.fail(`non lus : ${JSON.stringify(reading)}`));

describe("les plafonds de durée, dans le dépôt du projet", () => {
  test("l'app connaît exactement les seuils `drift.*` du runtime, entiers là où il n'en lit que d'entiers", () => {
    const runtime = SEUILS_DU_PROJET.drift as Record<string, { entier: boolean }>;
    assert.deepEqual(CAPS.map(({ cle: key }) => key).sort(), Object.keys(runtime).sort());
    for (const { cle: key, entier: whole } of CAPS) assert.equal(whole, runtime[key]?.entier, key);
  });

  test("lus sur la branche d'intégration : ce que le dépôt déclare, null pour le reste ; les durées en tête", async () => {
    const { client, demandes: requests } = github(PROJECT);
    const readEntry = await readTheCaps({ depot: REPOSITORY, branche: "main", client });
    assert.deepEqual(requests, [`GET ${CONTENT}?ref=main`]);
    assert.equal(value(readEntry, "ticketTokens"), 900);
    assert.equal(value(readEntry, "gatesSeconds"), null);
    assert.deepEqual(
      ("plafonds" in readEntry ? readEntry.plafonds : []).filter(({ duree: duration }) => duration).map(({ cle: key, defaut: fallback }) => [key, fallback]),
      [
        ["gatesSeconds", 100],
      ],
    );
  });

  test("un dépôt sans le fichier n'en déclare aucun ; un GitHub qui refuse se dit en une ligne, le détail à part", async () => {
    assert.equal(value(await readTheCaps({ depot: REPOSITORY, branche: "main", client: github(null).client }), "gatesSeconds"), null);
    const refused = await readTheCaps({ depot: REPOSITORY, branche: "main", client: github(PROJECT, { lecture: { status: 401, data: { message: "Bad credentials" } } }).client });
    assert.deepEqual(refused, { sans: "duration caps unavailable", detail: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
  });

  test("un plafond changé est proposé par une PR : une branche neuve partie de la tête de main, le fichier écrit sur elle, la PR vers main ; main n'a pas bougé", async () => {
    const repository = github(PROJECT);
    const rendered = await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "gatesSeconds", saisie: "150", client: repository.client });

    assert.deepEqual(rendered, { propose: PROPOSES, pr: `https://github.com/${REPOSITORY}/pull/41`, numero: 41, cle: "gatesSeconds", valeur: 150 });
    assert.deepEqual(repository.demandes, [`GET ${CONTENT}?ref=main`, `GET /repos/${REPOSITORY}/git/ref/heads/main`, `POST /repos/${REPOSITORY}/git/refs`, `PUT ${CONTENT}`, `POST /repos/${REPOSITORY}/pulls`]);
    const [created] = repository.crees;
    assert.equal(created?.sha, "tete-main", "la branche part de la tête de la branche d'intégration");
    const freshOne = String(created?.ref).replace("refs/heads/", "");
    assert.match(freshOne, /^brigade\/setting-set-drift-gatesseconds-to-150-/);
    const [written] = repository.ecrits;
    assert.equal(written?.branch, freshOne, "le fichier s'écrit sur la branche neuve, jamais sur main");
    assert.equal(written?.sha, "sha1", "le fichier lu juste avant est celui qui est remplacé");
    assert.equal(written?.message, "brigade: set drift.gatesSeconds to 150 (from the app, Kitchen > Health)");
    const [pr] = repository.prs;
    assert.deepEqual([pr?.head, pr?.base, pr?.title], [freshOne, "main", "brigade: set drift.gatesSeconds to 150"]);
    // main n'a pas bougé : la valeur en vigueur reste celle d'avant, jusqu'au merge.
    assert.equal(value(await readTheCaps({ depot: REPOSITORY, branche: "main", client: repository.client }), "gatesSeconds"), null);
    assert.equal(repository.texte(), `${JSON.stringify(PROJECT, null, 2)}\n`);
    // Le fichier proposé garde le reste, et le runtime le lit : son seuil, une fois mergé, est celui proposé.
    const text = repository.texte("pr") ?? assert.fail("pas de fichier proposé");
    assert.deepEqual(JSON.parse(text).defaultCalibrations, PROJECT.defaultCalibrations);
    assert.deepEqual(seuilsDuProjet(reglagesDuTexte(text)).drift, { ticketTokens: 900, gatesSeconds: 150 });
  });

  test("vide, le retrait du plafond est proposé ; la valeur déjà là n'ouvre rien", async () => {
    const repository = github(PROJECT);
    assert.deepEqual(await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "ticketTokens", saisie: "900", client: repository.client }), { fait: "unchanged: the repository already says so", cle: "ticketTokens", valeur: 900 });
    assert.equal(repository.ecrits.length, 0);
    assert.equal(repository.prs.length, 0);
    const rendered = await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "ticketTokens", saisie: "", client: repository.client });
    assert.ok("propose" in rendered && rendered.valeur === null);
    const text = repository.texte("pr") ?? assert.fail("pas de fichier proposé");
    assert.equal(JSON.parse(text).drift, undefined, "plus aucun seuil : la famille sort du fichier");
    assert.deepEqual(seuilsDuProjet(reglagesDuTexte(text)), {});
    assert.equal(repository.prs[0]?.title, "brigade: remove drift.ticketTokens");
  });

  test("sans fichier, il est créé avec ce que le runtime exige — seulement quand la branche est connue", async () => {
    const repository = github(null);
    await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "gatesSeconds", saisie: "45.5", client: repository.client });
    assert.equal(repository.ecrits[0]?.sha, undefined);
    assert.deepEqual(reglagesDuTexte(repository.texte("pr") ?? assert.fail("pas de fichier")), { integrationBranch: "main", drift: { gatesSeconds: 45.5 } });

    const withoutBranch = github(null);
    const rendered = await changeTheCap({ depot: REPOSITORY, branche: null, cle: "gatesSeconds", saisie: "45", client: withoutBranch.client });
    assert.ok("refus" in rendered);
    assert.equal(withoutBranch.ecrits.length, 0);
    assert.equal(withoutBranch.prs.length, 0);
  });

  test("la branche d'intégration inconnue : la PR part de la branche par défaut du dépôt, et va vers elle", async () => {
    const repository = github(PROJECT);
    const rendered = await changeTheCap({ depot: REPOSITORY, branche: null, cle: "gatesSeconds", saisie: "150", client: repository.client });
    assert.ok("propose" in rendered, JSON.stringify(rendered));
    assert.deepEqual(repository.demandes.slice(0, 3), [`GET ${CONTENT}`, `GET /repos/${REPOSITORY}`, `GET /repos/${REPOSITORY}/git/ref/heads/main`]);
    assert.equal(repository.crees[0]?.sha, "tete-main");
    assert.equal(repository.prs[0]?.base, "main");
  });

  test("une valeur que le runtime refuserait n'écrit rien, et se dit", async () => {
    for (const [key, input] of [
      ["ticketTokens", "12.5"],
      ["gatesSeconds", "0"],
      ["gatesSeconds", "-3"],
      ["gatesSeconds", "vite"],
      ["lostTimeMaxMin", "3"],
    ] as const) {
      const repository = github(PROJECT);
      const rendered = await changeTheCap({ depot: REPOSITORY, branche: "main", cle: key, saisie: input, client: repository.client });
      assert.ok("refus" in rendered && rendered.refus.startsWith("nothing was changed"), `${key} = ${input}`);
      assert.equal(repository.ecrits.length, 0, `${key} = ${input}`);
    }
    assert.deepEqual(valueProposed("ticketTokens", "12.5"), { refus: "costliest ticket must be a whole number greater than zero" });
  });

  test("chaque étape que GitHub refuse : rien n'est proposé, rien ne se dit fait, et le détail est gardé pour le survol", async () => {
    const not = (message: string): AnswerGitHub => ({ status: 422, data: { message } });
    const theCase: [Step, string | null, string][] = [
      ["tete", "main", "the reading of main"],
      ["depot", null, `the reading of ${REPOSITORY}`],
      ["branche", "main", "the branch brigade/setting-"],
      ["fichier", "main", `the change of ${FILE}`],
      ["pr", "main", "the pull request of brigade/setting-"],
    ];
    for (const [step, branch, what] of theCase) {
      const repository = github(PROJECT, { [step]: not("Refused here") });
      const rendered = await changeTheCap({ depot: REPOSITORY, branche: branch, cle: "gatesSeconds", saisie: "150", client: repository.client });
      assert.ok("refus" in rendered, step);
      assert.equal(rendered.refus, `nothing was proposed: GitHub did not open the pull request of ${FILE}`, step);
      assert.ok(rendered.detail?.startsWith(`GitHub refused ${what}`) && rendered.detail.includes("(HTTP 422): Refused here"), `${step}: ${rendered.detail}`);
      assert.equal(repository.texte(), `${JSON.stringify(PROJECT, null, 2)}\n`, `${step} : main n'a pas bougé`);
      if (step !== "pr") assert.equal(repository.prs.length, 0, step);
      // La branche créée avant l'échec est retirée : le dépôt n'a plus que main.
      assert.deepEqual([...repository.branches.keys()], ["main"], `${step} : aucune branche orpheline`);
      assert.equal(repository.retirees.length, step === "fichier" || step === "pr" ? 1 : 0, step);
    }
    // La lecture du fichier refusée : rien n'a changé, avant même la branche.
    const unreadable = github(PROJECT, { lecture: { status: 403, data: { message: "Resource not accessible" } } });
    const rendered = await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "gatesSeconds", saisie: "150", client: unreadable.client });
    assert.deepEqual(rendered, { refus: `nothing was changed: ${FILE} was not read on GitHub`, detail: `GitHub refused the reading of ${FILE} (HTTP 403): Resource not accessible` });
    assert.equal(unreadable.crees.length, 0);
  });

  test("une PR refusée dont la branche ne se retire pas : l'échec reste dit, et la branche restée s'y ajoute", async () => {
    const repository = github(PROJECT, { pr: { status: 422, data: { message: "Refused here" } }, retrait: { status: 403, data: { message: "Forbidden" } } });
    const rendered = await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "gatesSeconds", saisie: "150", client: repository.client });
    assert.ok("refus" in rendered);
    assert.equal(rendered.refus, `nothing was proposed: GitHub did not open the pull request of ${FILE}`);
    const freshOne = String(repository.crees[0]?.ref).replace("refs/heads/", "");
    assert.equal(rendered.detail, `GitHub refused the pull request of ${freshOne} (HTTP 422): Refused here; GitHub refused the removal of ${freshOne} (HTTP 403): Forbidden, it stays on ${REPOSITORY}`);
    assert.equal(repository.demandes.at(-1), `DELETE /repos/${REPOSITORY}/git/refs/heads/${freshOne}`);
  });

  test("une PR ouverte garde sa branche", async () => {
    const repository = github(PROJECT);
    await changeTheCap({ depot: REPOSITORY, branche: "main", cle: "gatesSeconds", saisie: "150", client: repository.client });
    assert.deepEqual(repository.retirees, []);
    assert.equal(repository.branches.size, 2);
  });
});
