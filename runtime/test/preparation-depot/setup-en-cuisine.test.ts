// Le ticket qui prépare le dépôt, sur une station dont le setup du projet
// échoue : c'est lui qui doit le réparer, son cook part quand même — avec ce
// qui a échoué, sur l'issue, au journal et dans sa consigne. Les autres
// tickets, et lui une fois servi, gardent la règle de tous : setup en échec,
// aucun cook.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { FICHIER } from "../../src/preparation-depot/ouvrir.ts";
import { corpsAvecLeSetup, DEBUT, passageDuSetup } from "../../src/preparation-depot/setup-en-echec.ts";
import { corps } from "../../src/preparation-depot/ticket.ts";
import { etatStation } from "../../src/projections/stations.ts";
import { cuisine, fauxGitHub, issue, montre, STATION, type Lieux, type Options } from "../aides/cuisine.ts";
import { jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const PREPARATION = 20;
const DU_CHEF = 15;
const PHRASE = "le setup a besoin de `apps/api/.env`, `docker` et `psql`, que la station `box/claude` n'a pas";
const SENTENCE = "the setup needs `apps/api/.env`, `docker` and `psql`, which the station `box/claude` does not have";
// Un setup qui passe rend ses exports au runtime par le descripteur 3
// (`CANAL`, `src/gates.ts`), que le bash de Windows lancé par Node ne reçoit
// pas : « brigade: line 5: 3: Bad file descriptor ». Un setup en échec n'y
// écrit rien, et se joue partout.
const EXPORTE = { skip: posixOnly("a passing setup hands its exports through file descriptor 3, which bash on Windows does not receive") };
const CORPS = corps({ projet: "brigade", depot: "acme/brigade", base: "v2", presents: {} });

// Une cuisine dont la station a ouvert le ticket de préparation #20, noté
// avant qu'elle ne démarre. `avant` : ce que le journal porte déjà.
// `corps` : celui de l'issue de préparation sur GitHub.
function unProjet(t: TestContext, { avant = [], corps: corpsDeLIssue = CORPS, ...options }: Options & { avant?: Array<{ ticket: number | null; fait: Fait }>; corps?: string } = {}) {
  const lieux: Lieux = { repertoire: repertoireTemporaire(t), origine: "", clone: "", gh: fauxGitHub(...(options.issues ?? [issue(PREPARATION)])), heure: montre() };
  writeFileSync(join(lieux.repertoire, FICHIER), `${JSON.stringify({ ticket: PREPARATION, ouvertLe: "2026-10-08T09:00:00.000Z" })}\n`);
  lieux.gh.decrire(PREPARATION, { body: corpsDeLIssue });
  const journal = ouvrirJournal(lieux.repertoire);
  for (const { ticket, fait } of avant) journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  journal.fermer();
  return cuisine(t, { scenario: "muet", ...options, lieux });
}

// Le ticket de préparation déjà servi : la cuisine n'attend plus que lui.
const PREPARATION_SERVIE: Array<{ ticket: number; fait: Fait }> = [
  {
    ticket: PREPARATION,
    fait: { type: "ticket.arrived", payload: { title: "Préparer le dépôt", priority: null, createdAt: "2026-10-01T00:00:00Z", url: "https://github.com/acme/brigade/issues/20", model: "opus", effort: "high", card: null } },
  },
  { ticket: PREPARATION, fait: { type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-10-08T09:30:00.000Z" } } },
  { ticket: PREPARATION, fait: { type: "ticket.passing", payload: { station: STATION } } },
  { ticket: PREPARATION, fait: { type: "ticket.served", payload: {} } },
] as never;

describe("le setup en échec du ticket qui prépare le dépôt", { concurrency: 4 }, () => {
  test("son cook part quand même, sans ce que le setup aurait exporté, avec la phrase et la sortie du setup dans sa consigne", async (t) => {
    const { setup, cooks, types, dernier, etat, avertissements } = unProjet(t, { setup: "manque" });
    await jusqua(() => cooks().length === 1);

    const [cook] = cooks();
    assert.equal(setup.appels().length, 1);
    assert.equal(etat(PREPARATION), "taken");
    assert.equal(cook?.env.BASE_DE_TEST, undefined);
    const consigne = cook?.args.join("\n") ?? "";
    assert.match(consigne, /Le setup du worktree \(`\.claude\/brigade\/worktree-setup\.sh`\) a échoué sur cette station/);
    assert.ok(consigne.includes(PHRASE), consigne);
    assert.match(consigne, /cp: cannot stat 'apps\/api\/\.env': No such file or directory[\s\S]*psql: command not found/);
    // Ni 86, ni échec de setup qui bloquerait le projet : le ticket est en cuisine.
    assert.equal(types().includes("ticket.86"), false);
    assert.equal(types().includes("setup.failed"), false);
    const run = dernier("cook.launched", PREPARATION)?.run;
    assert.deepEqual(dernier("preparation.setup-failed", PREPARATION), { station: STATION, run, why: "code de sortie 1", sentence: SENTENCE });
    assert.match(avertissements.join("\n"), /setup du worktree en échec pour le ticket #20, qui prépare le dépôt .*code de sortie 1.*son cook part quand même/);
  });

  test("le corps du ticket dit, en une phrase, ce qui a échoué — une fois, avant ce qu'il demande de livrer", async (t) => {
    const { cooks, gh } = unProjet(t, { setup: "manque" });
    await jusqua(() => cooks().length === 1);

    const lu = gh.corpsDe(PREPARATION);
    assert.equal(gh.ecritures.length, 1);
    assert.ok(lu.includes(`**${PHRASE.charAt(0).toUpperCase()}${PHRASE.slice(1)}.**`), lu);
    assert.ok(lu.indexOf(DEBUT) < lu.indexOf("## À livrer"));
    // Le reste du corps est intact.
    assert.ok(lu.startsWith(CORPS.slice(0, CORPS.indexOf("## À livrer"))));
    assert.ok(lu.endsWith(CORPS.slice(CORPS.indexOf("## À livrer"))));
  });

  test("le corps qui le dit déjà n'est pas réécrit", async (t) => {
    const deja = corpsAvecLeSetup(CORPS, passageDuSetup(PHRASE));
    const { cooks, gh } = unProjet(t, { setup: "manque", corps: deja });
    await jusqua(() => cooks().length === 1);
    assert.deepEqual(gh.ecritures, []);
    assert.equal(gh.corpsDe(PREPARATION), deja);
  });

  test("un setup qui passe de nouveau : le corps ne dit plus qu'il échoue, et le cook reçoit ce qu'il exporte", EXPORTE, async (t) => {
    const { cooks, gh } = unProjet(t, { setup: "exporte", corps: corpsAvecLeSetup(CORPS, passageDuSetup(PHRASE)) });
    await jusqua(() => cooks().length === 1);
    assert.equal(gh.corpsDe(PREPARATION), CORPS);
    assert.equal(cooks()[0]?.env.BASE_DE_TEST, `base du ticket ${PREPARATION}`);
    assert.doesNotMatch(cooks()[0]?.args.join("\n") ?? "", /a échoué sur cette station/);
  });

  test("un setup bloqué ne retient pas la station tant que la préparation attend : c'est elle qui le répare", async (t) => {
    const bloque: Array<{ ticket: number | null; fait: Fait }> = [{ ticket: DU_CHEF, fait: { type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts: [], base: "base-0" } } }];
    const { journal, cooks } = unProjet(t, { setup: "echec", avant: bloque });
    await jusqua(() => cooks().length === 1);
    assert.notEqual(etatStation(journal.base, STATION)?.heldReason, "setup");
  });

  test("une fois la préparation servie, un setup en échec ne lance plus aucun cook : le ticket suivant est 86, comme tout ticket", async (t) => {
    const { setup, cooks, etat, dernier, types } = unProjet(t, { setup: "manque", issues: [issue(DU_CHEF)], avant: PREPARATION_SERVIE });
    await jusqua(() => etat(DU_CHEF) === "86");

    assert.equal(setup.appels().length, 1);
    assert.equal(setup.appels()[0]?.split(" ")[0], String(DU_CHEF));
    assert.deepEqual(cooks(), []);
    assert.deepEqual(dernier("ticket.86", DU_CHEF), { reason: "setup-failed", until: "2026-10-08T10:10:00.000Z" });
    assert.equal(types().includes("preparation.setup-failed"), false);
  });

  test("une fois la préparation servie, le setup qu'elle a livré passe avant chaque cook, et le cook reçoit ce qu'il exporte", EXPORTE, async (t) => {
    const { setup, cooks } = unProjet(t, { setup: "exporte", issues: [issue(DU_CHEF)], avant: PREPARATION_SERVIE });
    await jusqua(() => cooks().length === 1);

    assert.equal(setup.appels()[0]?.split(" ")[0], String(DU_CHEF));
    assert.equal(cooks()[0]?.env.BASE_DE_TEST, `base du ticket ${DU_CHEF}`);
    assert.doesNotMatch(cooks()[0]?.args.join("\n") ?? "", /a échoué sur cette station/);
  });
});

test("setup-en-cuisine.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
