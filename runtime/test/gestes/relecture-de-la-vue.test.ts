// La relecture de la vue de l'app ne mange pas le budget de la cuisine (#3682) :
// N relectures dans la fenêtre coûtent les appels d'une seule, et un geste qui
// vient d'écrire voit, à la relecture qui suit, ce qu'il a écrit.
import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { FENETRE_DES_LECTURES_MS, ouvrirLecturesDesGestes, REPERTOIRE_DES_LECTURES } from "../../src/gestes/lectures-des-gestes.ts";
import { ouvrirGitHubDuGeste } from "../../src/gestes/github-du-geste.ts";
import type { Gardee } from "../../src/github.ts";
import { appelsDeLaStation, direLesAppels, limiteDeLaStation } from "../../src/limite-github.ts";
import { principal as manager } from "../../src/manager-cli.ts";
import { principal as montrerRail } from "../../src/montrer-rail.ts";
import { demarrer } from "../../src/runtime.ts";
import { aArreter, appeler, DEPOT, fauxGh, horloge, issueGitHub, repertoireTemporaire } from "../outils.ts";

const OUVERTES = `repos/${DEPOT}/issues?state=open&per_page=100`;
const RELECTURES = 6;

// Un projet dont le runtime a tourné, et la doublure de `gh` qu'il lit.
function projet(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const gh = fauxGh(t);
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  // `brigade <projet> manager upstream` : ce que la vue de l'app relit.
  const relire = async () => {
    const cli = appeler(manager, ["upstream"], env);
    assert.equal(await cli.fin, 0, cli.sortie());
    return (JSON.parse(cli.sortie()) as { issues: Array<{ ticket: number; titre: string }> }).issues;
  };
  return { repertoire, runtime, gh, env, relire };
}

test(`${RELECTURES} relectures de la vue dans la fenêtre ne coûtent que l'appel de la première`, async (t) => {
  const { gh, relire } = projet(t);
  gh.repondre(OUVERTES, { etag: '"v1"', corps: [issueGitHub(19, { labels: [] }), issueGitHub(20, { labels: [] })] });

  for (let i = 0; i < RELECTURES; i++) assert.deepEqual((await relire()).map(({ ticket }) => ticket), [19, 20]);

  assert.deepEqual(gh.appels(), [["api", "-i", OUVERTES]]);
});

test("après l'écriture d'un geste — un bouton de la fiche —, la relecture de la vue lit GitHub et voit ce qu'il a écrit", async (t) => {
  const { gh, relire, runtime, env } = projet(t);
  runtime.journal.ajouter({ project: "brigade", ticket: 18, author: "github", type: "ticket.arrived", payload: { title: "Ticket 18", priority: null, createdAt: "2026-10-01T00:00:18Z", url: "https://exemple.test/18" } });
  gh.repondre(OUVERTES, { etag: '"v1"', corps: [issueGitHub(18), issueGitHub(19, { labels: [] })] });
  gh.repondre(`repos/${DEPOT}/issues/18/labels/fire`, { corps: [] });
  assert.equal((await relire()).some(({ ticket }) => ticket === 18), false);

  // Le bouton « remove from the rail » : `brigade <projet> rail remove 18`.
  const retrait = appeler(montrerRail, ["remove", "18"], env);
  assert.equal(await retrait.fin, 0, retrait.sortie());
  gh.repondre(OUVERTES, { etag: '"v2"', corps: [issueGitHub(18, { labels: [], title: "Ticket 18, off the rail" }), issueGitHub(19, { labels: [] })] });

  const relue = await relire();

  assert.equal(relue.find(({ ticket }) => ticket === 18)?.titre, "Ticket 18, off the rail");
  assert.deepEqual(gh.appels().map((args) => args.at(-1)), [OUVERTES, `repos/${DEPOT}/issues/18/labels/fire`, OUVERTES]);
});

test("compté par la station : les relectures d'un geste restent sous la sorte `gesture`, une seule dans la fenêtre — la suivante, passée la fenêtre, part sous condition et GitHub ne la compte pas", async (t) => {
  const station = repertoireTemporaire(t);
  const etat = repertoireTemporaire(t);
  let instant = Date.parse("2026-11-15T10:00:00Z");
  const maintenant = () => instant;
  const limite = limiteDeLaStation(station, { maintenant });
  aArreter(t, () => limite.fermer());
  const gh = fauxGh(t);
  gh.repondre(OUVERTES, { etag: '"v1"', corps: [issueGitHub(19, { labels: [] })] });
  // Chaque relecture dans son GitHub, comme chaque commande dans son process.
  const relire = async () => {
    const github = ouvrirGitHubDuGeste({ depot: DEPOT, bin: gh.bin, limite, projet: "brigade", maintenant, env: { BRIGADE_STATE_DIR: etat }, servir: true });
    try {
      const sondage = await github.ouvertes();
      assert.equal(sondage.inchange, false);
      return sondage.inchange ? [] : sondage.issues.map(({ number }) => number);
    } finally {
      github.fermer();
    }
  };

  for (let i = 0; i < RELECTURES; i++) {
    assert.deepEqual(await relire(), [19]);
    instant += 1_000;
  }

  assert.equal(gh.appels().length, 1);
  assert.deepEqual(direLesAppels(appelsDeLaStation(station, instant) ?? assert.fail("no count")), ["1 calls in the last hour", "most calls: project brigade (1), kind gesture (1)"]);

  instant += FENETRE_DES_LECTURES_MS;
  assert.deepEqual(await relire(), [19]);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "-H", 'If-None-Match: "v1"', OUVERTES]);
  assert.equal(appelsDeLaStation(station, instant)?.total, 1);
});

test("une lecture gardée illisible se lit comme absente : la relecture part vers GitHub, et rend ce qu'il dit", async (t) => {
  const { gh, relire, repertoire } = projet(t);
  gh.repondre(OUVERTES, { etag: '"v1"', corps: [issueGitHub(19, { labels: [] })] });
  await relire();
  const dossier = join(repertoire, REPERTOIRE_DES_LECTURES);
  for (const fichier of readdirSync(dossier).filter((nom) => nom.endsWith(".json"))) writeFileSync(join(dossier, fichier), "{ pas du JSON");
  gh.repondre(OUVERTES, { etag: '"v2"', corps: [issueGitHub(21, { labels: [] })] });

  assert.deepEqual((await relire()).map(({ ticket }) => ticket), [21]);
  assert.equal(gh.appels().length, 2);
});

test("une péremption qui ne s'écrit pas se dit, et le geste qui a écrit ne se sert plus de ce qu'il a lu avant", (t) => {
  const repertoireEtat = repertoireTemporaire(t);
  const dits: string[] = [];
  const instant = 1_000_000;
  const ouvrir = (ecrire?: (fichier: string, contenu: string) => void) =>
    ouvrirLecturesDesGestes({ repertoireEtat, servir: true, maintenant: () => instant, dire: (ligne) => dits.push(ligne), ...(ecrire ? { ecrire } : {}) }) ?? assert.fail("no reads");
  const gardee: Gardee = { etag: '"v1"', pleine: false, reponse: { statut: 200, corps: "[]", entetes: new Map([["etag", '"v1"']]) } };
  ouvrir().garder("liste", gardee, instant - 1);
  const geste = ouvrir((fichier, contenu) => {
    if (fichier.includes("oubli")) throw new Error("disque plein");
    writeFileSync(fichier, contenu);
  });
  assert.equal(geste.lire("liste")?.fraiche, true);

  geste.oublier();

  assert.equal(geste.lire("liste")?.fraiche, false);
  assert.equal(geste.lire("liste")?.gardee.etag, '"v1"');
  assert.equal(dits.length, 1);
  assert.match(dits[0] ?? "", /were not marked stale after a write: disque plein — another gesture may show them for up to 15 s more/);
});

test("sans répertoire d'état, rien ne se garde : chaque relecture lit GitHub", async (t) => {
  assert.equal(ouvrirLecturesDesGestes({ repertoireEtat: undefined, servir: true }), undefined);
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues/7`, { corps: issueGitHub(7) });
  for (let i = 0; i < 2; i++) {
    const github = ouvrirGitHubDuGeste({ depot: DEPOT, bin: gh.bin, env: {}, servir: true });
    assert.equal((await github.issue(7))?.number, 7);
    github.fermer();
  }
  assert.equal(gh.appels().length, 2);
});
