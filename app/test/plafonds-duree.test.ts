// Les plafonds de durée d'un projet, réglés depuis Kitchen > Health (#2490) : l'app lit `drift.*` de
// `.claude/brigade/projet.json` sur la branche d'intégration de son dépôt, sur GitHub, et en propose un changement par une
// pull request (#2920). Le fichier proposé est de ceux que le runtime lit — c'est sa valeur qu'il applique, une fois mergé.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { reglagesDuTexte, SEUILS_DU_PROJET, seuilsDuProjet } from "../../runtime/src/reglages-projet/reglages.ts";
import { changerLePlafond, FICHIER, lireLesPlafonds, PLAFONDS, valeurProposee } from "../src/plafonds-duree.ts";
import { PROPOSE } from "../src/reglages-du-projet.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";

const DEPOT = "chef/parade";
const CONTENU = `/repos/${DEPOT}/contents/${FICHIER}`;
const PROJET = { version: 1, integrationBranch: "main", defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, drift: { tests: 900 } };

// Un GitHub en mémoire, ses branches : `main` porte le fichier (ou rien), une branche créée part de la tête d'une autre et
// en copie les fichiers, le `sha` d'un fichier change à chaque écriture ; les PR ouvertes sont gardées. Chaque demande est
// notée — et, pour une étape nommée, la réponse qu'il rend à la place.
type Etape = "lecture" | "depot" | "tete" | "branche" | "fichier" | "pr";
function github(fichier: unknown | null, refus: Partial<Record<Etape, ReponseGitHub>> = {}) {
  const branches = new Map<string, { texte: string | null; sha: number }>([["main", { texte: fichier === null ? null : `${JSON.stringify(fichier, null, 2)}\n`, sha: 1 }]]);
  const demandes: string[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const crees: Record<string, unknown>[] = [];
  const prs: Record<string, unknown>[] = [];
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      if (chemin.startsWith(CONTENU)) {
        if (refus.lecture !== undefined) return refus.lecture;
        const ref = new URL(chemin, "https://api.github.com").searchParams.get("ref") ?? "main";
        const sur = branches.get(ref);
        if (sur === undefined || sur.texte === null) return { status: 404, data: { message: "Not Found" } };
        return { status: 200, data: { content: Buffer.from(sur.texte).toString("base64"), sha: `sha${sur.sha}` } };
      }
      if (chemin === `/repos/${DEPOT}`) return refus.depot ?? { status: 200, data: { default_branch: "main" } };
      const tete = /\/git\/ref\/heads\/(.+)$/.exec(chemin)?.[1];
      if (tete !== undefined) return refus.tete ?? (branches.has(tete) ? { status: 200, data: { object: { sha: `tete-${tete}` } } } : { status: 404, data: { message: "Not Found" } });
      return { status: 404, data: { message: "Not Found" } };
    },
    ecrire: async (methode, chemin, corps) => {
      demandes.push(`${methode} ${chemin}`);
      const recu = corps as Record<string, unknown>;
      if (chemin === `/repos/${DEPOT}/git/refs`) {
        if (refus.branche !== undefined) return refus.branche;
        crees.push(recu);
        const depart = [...branches.entries()].find(([nom]) => recu.sha === `tete-${nom}`)?.[1] ?? assert.fail(`une branche créée d'aucune tête : ${String(recu.sha)}`);
        branches.set(String(recu.ref).replace("refs/heads/", ""), { ...depart });
        return { status: 201, data: {} };
      }
      if (chemin === CONTENU) {
        if (refus.fichier !== undefined) return refus.fichier;
        ecrits.push(recu);
        const sur = branches.get(String(recu.branch ?? "main")) ?? assert.fail("une écriture sur une branche inconnue");
        if (sur.texte !== null && recu.sha !== `sha${sur.sha}`) return { status: 409, data: { message: "sha does not match" } };
        const cree = sur.texte === null;
        sur.texte = Buffer.from(recu.content as string, "base64").toString("utf8");
        sur.sha++;
        return { status: cree ? 201 : 200, data: { content: { sha: `sha${sur.sha}` } } };
      }
      if (chemin === `/repos/${DEPOT}/pulls`) {
        if (refus.pr !== undefined) return refus.pr;
        prs.push(recu);
        return { status: 201, data: { number: 40 + prs.length, html_url: `https://github.com/${DEPOT}/pull/${40 + prs.length}` } };
      }
      return { status: 404, data: { message: "Not Found" } };
    },
  };
  // `texte(branche)` : le fichier sur une branche — `main` par défaut, la branche de la dernière PR avec `"pr"`.
  const texte = (branche = "main") => branches.get(branche === "pr" ? String(prs.at(-1)?.head) : branche)?.texte ?? null;
  return { client, demandes, ecrits, crees, prs, texte };
}

const valeur = (lecture: Awaited<ReturnType<typeof lireLesPlafonds>>, cle: string) => ("plafonds" in lecture ? lecture.plafonds.find((plafond) => plafond.cle === cle)?.valeur : assert.fail(`non lus : ${JSON.stringify(lecture)}`));

describe("les plafonds de durée, dans le dépôt du projet", () => {
  test("l'app connaît exactement les seuils `drift.*` du runtime, entiers là où il n'en lit que d'entiers", () => {
    const runtime = SEUILS_DU_PROJET.drift as Record<string, { entier: boolean }>;
    assert.deepEqual(PLAFONDS.map(({ cle }) => cle).sort(), Object.keys(runtime).sort());
    for (const { cle, entier } of PLAFONDS) assert.equal(entier, runtime[cle]?.entier, cle);
  });

  test("lus sur la branche d'intégration : ce que le dépôt déclare, null pour le reste ; les durées en tête", async () => {
    const { client, demandes } = github(PROJET);
    const lue = await lireLesPlafonds({ depot: DEPOT, branche: "main", client });
    assert.deepEqual(demandes, [`GET ${CONTENU}?ref=main`]);
    assert.equal(valeur(lue, "tests"), 900);
    assert.equal(valeur(lue, "gatesSeconds"), null);
    assert.deepEqual(
      ("plafonds" in lue ? lue.plafonds : []).filter(({ duree }) => duree).map(({ cle, defaut }) => [cle, defaut]),
      [
        ["testsSeconds", null],
        ["gatesSeconds", 100],
      ],
    );
  });

  test("un dépôt sans le fichier n'en déclare aucun ; un GitHub qui refuse se dit en une ligne, le détail à part", async () => {
    assert.equal(valeur(await lireLesPlafonds({ depot: DEPOT, branche: "main", client: github(null).client }), "gatesSeconds"), null);
    const refusee = await lireLesPlafonds({ depot: DEPOT, branche: "main", client: github(PROJET, { lecture: { status: 401, data: { message: "Bad credentials" } } }).client });
    assert.deepEqual(refusee, { sans: "duration caps unavailable", detail: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
  });

  test("un plafond changé est proposé par une PR : une branche neuve partie de la tête de main, le fichier écrit sur elle, la PR vers main ; main n'a pas bougé", async () => {
    const depot = github(PROJET);
    const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle: "gatesSeconds", saisie: "150", client: depot.client });

    assert.deepEqual(rendu, { propose: PROPOSE, pr: `https://github.com/${DEPOT}/pull/41`, numero: 41, cle: "gatesSeconds", valeur: 150 });
    assert.deepEqual(depot.demandes, [`GET ${CONTENU}?ref=main`, `GET /repos/${DEPOT}/git/ref/heads/main`, `POST /repos/${DEPOT}/git/refs`, `PUT ${CONTENU}`, `POST /repos/${DEPOT}/pulls`]);
    const [creee] = depot.crees;
    assert.equal(creee?.sha, "tete-main", "la branche part de la tête de la branche d'intégration");
    const neuve = String(creee?.ref).replace("refs/heads/", "");
    assert.match(neuve, /^brigade\/setting-set-drift-gatesseconds-to-150-/);
    const [ecrit] = depot.ecrits;
    assert.equal(ecrit?.branch, neuve, "le fichier s'écrit sur la branche neuve, jamais sur main");
    assert.equal(ecrit?.sha, "sha1", "le fichier lu juste avant est celui qui est remplacé");
    assert.equal(ecrit?.message, "brigade: set drift.gatesSeconds to 150 (from the app, Kitchen > Health)");
    const [pr] = depot.prs;
    assert.deepEqual([pr?.head, pr?.base, pr?.title], [neuve, "main", "brigade: set drift.gatesSeconds to 150"]);
    // main n'a pas bougé : la valeur en vigueur reste celle d'avant, jusqu'au merge.
    assert.equal(valeur(await lireLesPlafonds({ depot: DEPOT, branche: "main", client: depot.client }), "gatesSeconds"), null);
    assert.equal(depot.texte(), `${JSON.stringify(PROJET, null, 2)}\n`);
    // Le fichier proposé garde le reste, et le runtime le lit : son seuil, une fois mergé, est celui proposé.
    const texte = depot.texte("pr") ?? assert.fail("pas de fichier proposé");
    assert.deepEqual(JSON.parse(texte).defaultCalibrations, PROJET.defaultCalibrations);
    assert.deepEqual(seuilsDuProjet(reglagesDuTexte(texte)).drift, { tests: 900, gatesSeconds: 150 });
  });

  test("vide, le retrait du plafond est proposé ; la valeur déjà là n'ouvre rien", async () => {
    const depot = github(PROJET);
    assert.deepEqual(await changerLePlafond({ depot: DEPOT, branche: "main", cle: "tests", saisie: "900", client: depot.client }), { fait: "unchanged: the repository already says so", cle: "tests", valeur: 900 });
    assert.equal(depot.ecrits.length, 0);
    assert.equal(depot.prs.length, 0);
    const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle: "tests", saisie: "", client: depot.client });
    assert.ok("propose" in rendu && rendu.valeur === null);
    const texte = depot.texte("pr") ?? assert.fail("pas de fichier proposé");
    assert.equal(JSON.parse(texte).drift, undefined, "plus aucun seuil : la famille sort du fichier");
    assert.deepEqual(seuilsDuProjet(reglagesDuTexte(texte)), {});
    assert.equal(depot.prs[0]?.title, "brigade: remove drift.tests");
  });

  test("sans fichier, il est créé avec ce que le runtime exige — seulement quand la branche est connue", async () => {
    const depot = github(null);
    await changerLePlafond({ depot: DEPOT, branche: "main", cle: "testsSeconds", saisie: "45.5", client: depot.client });
    assert.equal(depot.ecrits[0]?.sha, undefined);
    assert.deepEqual(reglagesDuTexte(depot.texte("pr") ?? assert.fail("pas de fichier")), { integrationBranch: "main", drift: { testsSeconds: 45.5 } });

    const sansBranche = github(null);
    const rendu = await changerLePlafond({ depot: DEPOT, branche: null, cle: "testsSeconds", saisie: "45", client: sansBranche.client });
    assert.ok("refus" in rendu);
    assert.equal(sansBranche.ecrits.length, 0);
    assert.equal(sansBranche.prs.length, 0);
  });

  test("la branche d'intégration inconnue : la PR part de la branche par défaut du dépôt, et va vers elle", async () => {
    const depot = github(PROJET);
    const rendu = await changerLePlafond({ depot: DEPOT, branche: null, cle: "gatesSeconds", saisie: "150", client: depot.client });
    assert.ok("propose" in rendu, JSON.stringify(rendu));
    assert.deepEqual(depot.demandes.slice(0, 3), [`GET ${CONTENU}`, `GET /repos/${DEPOT}`, `GET /repos/${DEPOT}/git/ref/heads/main`]);
    assert.equal(depot.crees[0]?.sha, "tete-main");
    assert.equal(depot.prs[0]?.base, "main");
  });

  test("une valeur que le runtime refuserait n'écrit rien, et se dit", async () => {
    for (const [cle, saisie] of [
      ["tests", "12.5"],
      ["gatesSeconds", "0"],
      ["gatesSeconds", "-3"],
      ["gatesSeconds", "vite"],
      ["lostTimeMaxMin", "3"],
    ] as const) {
      const depot = github(PROJET);
      const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle, saisie, client: depot.client });
      assert.ok("refus" in rendu && rendu.refus.startsWith("nothing was changed"), `${cle} = ${saisie}`);
      assert.equal(depot.ecrits.length, 0, `${cle} = ${saisie}`);
    }
    assert.deepEqual(valeurProposee("tests", "12.5"), { refus: "number of tests must be a whole number greater than zero" });
  });

  test("chaque étape que GitHub refuse : rien n'est proposé, rien ne se dit fait, et le détail est gardé pour le survol", async () => {
    const non = (message: string): ReponseGitHub => ({ status: 422, data: { message } });
    const cas: [Etape, string | null, string][] = [
      ["tete", "main", "the reading of main"],
      ["depot", null, `the reading of ${DEPOT}`],
      ["branche", "main", "the branch brigade/setting-"],
      ["fichier", "main", `the change of ${FICHIER}`],
      ["pr", "main", "the pull request of brigade/setting-"],
    ];
    for (const [etape, branche, quoi] of cas) {
      const depot = github(PROJET, { [etape]: non("Refused here") });
      const rendu = await changerLePlafond({ depot: DEPOT, branche, cle: "gatesSeconds", saisie: "150", client: depot.client });
      assert.ok("refus" in rendu, etape);
      assert.equal(rendu.refus, `nothing was proposed: GitHub did not open the pull request of ${FICHIER}`, etape);
      assert.ok(rendu.detail?.startsWith(`GitHub refused ${quoi}`) && rendu.detail.includes("(HTTP 422): Refused here"), `${etape}: ${rendu.detail}`);
      assert.equal(depot.texte(), `${JSON.stringify(PROJET, null, 2)}\n`, `${etape} : main n'a pas bougé`);
      if (etape !== "pr") assert.equal(depot.prs.length, 0, etape);
    }
    // La lecture du fichier refusée : rien n'a changé, avant même la branche.
    const illisible = github(PROJET, { lecture: { status: 403, data: { message: "Resource not accessible" } } });
    const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle: "gatesSeconds", saisie: "150", client: illisible.client });
    assert.deepEqual(rendu, { refus: `nothing was changed: ${FICHIER} was not read on GitHub`, detail: `GitHub refused the reading of ${FICHIER} (HTTP 403): Resource not accessible` });
    assert.equal(illisible.crees.length, 0);
  });
});
