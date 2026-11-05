// Les plafonds de durée d'un projet, réglés depuis Kitchen > Health (#2490) : l'app lit et écrit `drift.*` de
// `.claude/brigade/projet.json` sur la branche d'intégration de son dépôt, sur GitHub. Un plafond changé est écrit, se
// relit tel quel, et le fichier écrit est de ceux que le runtime lit — c'est sa valeur qu'il applique ensuite.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { reglagesDuTexte, SEUILS_DU_PROJET, seuilsDuProjet } from "../../runtime/src/reglages-projet/reglages.ts";
import { changerLePlafond, FICHIER, lireLesPlafonds, PLAFONDS, valeurProposee } from "../src/plafonds-duree.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";

const DEPOT = "chef/parade";
const CONTENU = `/repos/${DEPOT}/contents/${FICHIER}`;
const PROJET = { version: 1, integrationBranch: "main", defaultCalibrations: { manager: { model: "sonnet", effort: "medium" } }, drift: { tests: 900 } };

// Un GitHub en mémoire : le fichier sur `main` (ou rien), son `sha` qui change à chaque écriture, chaque demande notée —
// et, pour une méthode nommée, la réponse qu'il rend à la place.
function github(fichier: unknown | null, refus: Partial<Record<"GET" | "PUT", ReponseGitHub>> = {}) {
  let texte = fichier === null ? null : `${JSON.stringify(fichier, null, 2)}\n`;
  let sha = 1;
  const demandes: string[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      if (refus.GET !== undefined) return refus.GET;
      if (chemin !== `${CONTENU}?ref=main` && chemin !== CONTENU) return { status: 404, data: { message: "Not Found" } };
      return texte === null ? { status: 404, data: { message: "Not Found" } } : { status: 200, data: { content: Buffer.from(texte).toString("base64"), sha: `sha${sha}` } };
    },
    ecrire: async (methode, chemin, corps) => {
      demandes.push(`${methode} ${chemin}`);
      if (refus.PUT !== undefined) return refus.PUT;
      const recu = corps as Record<string, unknown>;
      ecrits.push(recu);
      if (texte !== null && recu.sha !== `sha${sha}`) return { status: 409, data: { message: "sha does not match" } };
      texte = Buffer.from(recu.content as string, "base64").toString("utf8");
      sha++;
      return { status: texte === null ? 201 : 200, data: { content: { sha: `sha${sha}` } } };
    },
  };
  return { client, demandes, ecrits, texte: () => texte };
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
    const refusee = await lireLesPlafonds({ depot: DEPOT, branche: "main", client: github(PROJET, { GET: { status: 401, data: { message: "Bad credentials" } } }).client });
    assert.deepEqual(refusee, { sans: "duration caps unavailable", detail: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
  });

  test("un plafond changé est écrit sur la branche, se relit tel quel, et c'est la valeur que le runtime lit ensuite", async () => {
    const depot = github(PROJET);
    const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle: "gatesSeconds", saisie: "150", client: depot.client });

    assert.deepEqual(rendu, { fait: "saved in the repository — the station applies it at its next fetch", cle: "gatesSeconds", valeur: 150 });
    assert.deepEqual(depot.demandes, [`GET ${CONTENU}?ref=main`, `PUT ${CONTENU}`]);
    const [ecrit] = depot.ecrits;
    assert.equal(ecrit?.branch, "main");
    assert.equal(ecrit?.sha, "sha1", "le fichier lu juste avant est celui qui est remplacé");
    assert.equal(ecrit?.message, "brigade: set drift.gatesSeconds to 150 (from the app, Kitchen > Health)");
    // Relu : la valeur écrite.
    assert.equal(valeur(await lireLesPlafonds({ depot: DEPOT, branche: "main", client: depot.client }), "gatesSeconds"), 150);
    // Le reste du fichier est gardé, et le runtime le lit : son seuil en vigueur est celui écrit.
    const texte = depot.texte() ?? assert.fail("pas de fichier");
    assert.deepEqual(JSON.parse(texte).defaultCalibrations, PROJET.defaultCalibrations);
    assert.deepEqual(seuilsDuProjet(reglagesDuTexte(texte)).drift, { tests: 900, gatesSeconds: 150 });
  });

  test("vide, le plafond se retire du dépôt ; la valeur déjà écrite n'écrit rien", async () => {
    const depot = github(PROJET);
    assert.deepEqual(await changerLePlafond({ depot: DEPOT, branche: "main", cle: "tests", saisie: "900", client: depot.client }), { fait: "unchanged: the repository already says so", cle: "tests", valeur: 900 });
    assert.equal(depot.ecrits.length, 0);
    await changerLePlafond({ depot: DEPOT, branche: "main", cle: "tests", saisie: "", client: depot.client });
    const texte = depot.texte() ?? assert.fail("pas de fichier");
    assert.equal(JSON.parse(texte).drift, undefined, "plus aucun seuil : la famille sort du fichier");
    assert.deepEqual(seuilsDuProjet(reglagesDuTexte(texte)), {});
  });

  test("sans fichier, il est créé avec ce que le runtime exige — seulement quand la branche est connue", async () => {
    const depot = github(null);
    await changerLePlafond({ depot: DEPOT, branche: "main", cle: "testsSeconds", saisie: "45.5", client: depot.client });
    assert.equal(depot.ecrits[0]?.sha, undefined);
    assert.deepEqual(reglagesDuTexte(depot.texte() ?? assert.fail("pas de fichier")), { integrationBranch: "main", drift: { testsSeconds: 45.5 } });

    const sansBranche = github(null);
    const rendu = await changerLePlafond({ depot: DEPOT, branche: null, cle: "testsSeconds", saisie: "45", client: sansBranche.client });
    assert.ok("refus" in rendu);
    assert.equal(sansBranche.ecrits.length, 0);
  });

  test("une valeur que le runtime refuserait n'écrit rien, et se dit", async () => {
    for (const [cle, saisie] of [
      ["tests", "12.5"],
      ["gatesSeconds", "0"],
      ["gatesSeconds", "-3"],
      ["gatesSeconds", "vite"],
      ["tempsMaxTicketMin", "20"],
    ] as const) {
      const depot = github(PROJET);
      const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle, saisie, client: depot.client });
      assert.ok("refus" in rendu && rendu.refus.startsWith("nothing was changed"), `${cle} = ${saisie}`);
      assert.equal(depot.ecrits.length, 0, `${cle} = ${saisie}`);
    }
    assert.deepEqual(valeurProposee("tests", "12.5"), { refus: "number of tests must be a whole number greater than zero" });
  });

  test("GitHub qui refuse l'écriture : rien n'a changé, et le détail est gardé pour le survol", async () => {
    const depot = github(PROJET, { PUT: { status: 409, data: { message: "Changes must be made through a pull request." } } });
    const rendu = await changerLePlafond({ depot: DEPOT, branche: "main", cle: "gatesSeconds", saisie: "150", client: depot.client });
    assert.deepEqual(rendu, { refus: `nothing was changed: GitHub did not write ${FICHIER}`, detail: `GitHub refused the change of ${FICHIER} (HTTP 409): Changes must be made through a pull request` });
  });
});
