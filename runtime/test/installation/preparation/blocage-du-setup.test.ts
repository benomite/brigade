// Le setup du projet échoue : le ticket de préparation part quand même, un
// ticket ordinaire non, et le blocage dit l'échec en une phrase.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { blocagesDuJournal, estUneSortieBrute } from "../../../src/installation/blocages/blocages.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { FICHIER } from "../../../src/preparation-depot/ouvrir.ts";
import { corps } from "../../../src/preparation-depot/ticket.ts";
import { cuisine, fauxGitHub, issue, montre, type Lieux, type Options } from "../../aides/cuisine.ts";
import { jusqua, repertoireTemporaire, temporaireDuFichier } from "../../outils.ts";

const rienNeReste = temporaireDuFichier();

const PREPARATION = 20;
const DU_CHEF = 15;

function unProjet(t: TestContext, options: Options = {}) {
  const lieux: Lieux = { repertoire: repertoireTemporaire(t), origine: "", clone: "", gh: fauxGitHub(...(options.issues ?? [issue(PREPARATION)])), heure: montre() };
  writeFileSync(join(lieux.repertoire, FICHIER), `${JSON.stringify({ ticket: PREPARATION, ouvertLe: "2026-10-08T09:00:00.000Z" })}\n`);
  lieux.gh.decrire(PREPARATION, { body: corps({ projet: "brigade", depot: "benomite/brigade", base: "v2", presents: {} }) });
  ouvrirJournal(lieux.repertoire).fermer();
  return cuisine(t, { scenario: "muet", ...options, lieux });
}

describe("le blocage du setup en échec", { concurrency: 2 }, () => {
  test("la préparation atteint son cook et le blocage dit l'échec en une phrase, sans sortie brute", async (t) => {
    const { journal, cooks, etat } = unProjet(t, { setup: "manque" });
    await jusqua(() => cooks().length === 1);
    assert.equal(etat(PREPARATION), "taken");
    // Il manque aussi `psql` et `docker` à la station : leurs choix sont
    // posés, mais n'expliquent pas le `.env` — le blocage du setup reste.
    const blocages = blocagesDuJournal(journal.base);
    assert.deepEqual(blocages.map(({ id }) => id).sort(), ["need:docker", "need:postgres", "setup"]);
    const bloc = blocages.find(({ id }) => id === "setup");
    assert.equal(estUneSortieBrute(bloc?.message ?? ""), false);
    assert.equal(estUneSortieBrute(bloc?.cause ?? ""), false);
    assert.match(bloc?.cause ?? "", /apps\/api\/\.env/);
    assert.match(bloc?.detail ?? "", /command not found/);
  });

  test("un ticket ordinaire du projet ne part pas tant que le setup échoue, et le blocage est posé", async (t) => {
    const { journal, cooks, etat } = unProjet(t, { setup: "manque", issues: [issue(DU_CHEF)] });
    await jusqua(() => etat(DU_CHEF) === "86");
    assert.deepEqual(cooks(), []);
    assert.equal(blocagesDuJournal(journal.base).filter(({ id }) => id === "setup").length, 1);
  });
});

test("blocage-du-setup.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
