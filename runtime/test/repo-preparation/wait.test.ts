// Le rail d'un projet dont la station a ouvert le ticket qui prépare son
// dépôt : lui seul part tant qu'il n'est pas servi ; servi, le rail est rendu
// entier, sans geste. Sur un vrai journal, avec le vrai rail.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { RuntimeAvecRail } from "../../src/alimenter.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { FICHIER } from "../../src/repo-preparation/open.ts";
import { attendreLaPreparation } from "../../src/repo-preparation/wait.ts";
import { ouvrirRail } from "../../src/rail.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const PREPARATION = 7;

function uneCuisine(t: TestContext, options: { preparation?: number } = {}) {
  const repertoireEtat = repertoireTemporaire(t);
  if (options.preparation !== undefined) writeFileSync(join(repertoireEtat, FICHIER), JSON.stringify({ ticket: options.preparation, ouvertLe: "2026-10-15T12:00:00.000Z" }));
  const journal = ouvrirJournal(repertoireEtat);
  t.after(() => journal.fermer());
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: "parade", ticket, author, ...fait });
  // Chacun arrive dans l'ordre de son numéro : sans priorité, le plus ancien passe devant.
  const arriver = (ticket: number) =>
    noter(
      ticket,
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-15T00:00:${String(ticket).padStart(2, "0")}Z`, url: `https://exemple.test/${ticket}`, model: "opus", effort: "high", card: null } },
      "github",
    );
  const rail = ouvrirRail(journal, { projet: "parade", dureeBailMs: 3_600_000 });
  const lignes: string[] = [];
  const socle = { projet: "parade", journal, rail } as unknown as RuntimeAvecRail;
  const runtime = attendreLaPreparation(socle, { repertoireEtat, dire: (ligne) => lignes.push(ligne) });
  return { repertoireEtat, runtime, socle, rail, noter, arriver, lignes };
}

test("tant que le ticket de préparation n'est pas servi, lui seul part — absent du rail, aucun ne part ; servi, les autres partent, sans geste", (t) => {
  const { runtime, rail, arriver, lignes } = uneCuisine(t, { preparation: PREPARATION });
  // Les tickets du chef sont là avant lui : le sondage de GitHub ne l'a pas encore vu.
  arriver(3);
  arriver(5);
  assert.equal(runtime.rail.servables(), 0);
  assert.equal(runtime.rail.prendre("box/claude"), null);
  assert.deepEqual(lignes, ["brigade : le rail attend #7 (préparer le dépôt) — aucun autre ticket ne part avant son merge"]);

  // Il arrive, plus récent que les autres : c'est lui qui part, et lui seul.
  arriver(PREPARATION);
  assert.equal(runtime.rail.servables(), 1);
  assert.equal(runtime.rail.prendre("box/claude")?.ticket, PREPARATION);
  assert.equal(runtime.rail.prendre("box/claude"), null);
  assert.equal(runtime.rail.servables(), 0);

  // Livré, en pass : toujours rien d'autre.
  rail.envoyerEnPass(PREPARATION, "box/claude");
  assert.equal(runtime.rail.prendre("box/claude"), null);
  assert.equal(lignes.length, 1);

  // Mergé : le rail démarre de lui-même.
  rail.servir(PREPARATION);
  assert.equal(runtime.rail.servables(), 2);
  assert.equal(runtime.rail.prendre("box/claude")?.ticket, 3);
  assert.equal(runtime.rail.prendre("box/claude")?.ticket, 5);
  assert.deepEqual(lignes.slice(1), ["brigade : #7 (préparer le dépôt) est servi — le rail démarre"]);
});

test("la restriction d'une base rouge passe devant : sa réparation part", (t) => {
  const { runtime, arriver } = uneCuisine(t, { preparation: PREPARATION });
  arriver(3);
  arriver(PREPARATION);
  assert.equal(runtime.rail.servables(undefined, undefined, 3), 1);
  assert.equal(runtime.rail.prendre("box/claude", undefined, 3)?.ticket, 3);
});

test("fermé par le chef ou disparu, le ticket de préparation libère le rail ; son label `fire` retiré, il le retient encore", (t) => {
  for (const [reason, libre] of [["closed", true], ["gone", true], ["unfired", false], ["hors-cuisine", false]] as const) {
    const { runtime, arriver, noter, lignes } = uneCuisine(t, { preparation: PREPARATION });
    arriver(3);
    arriver(PREPARATION);
    assert.equal(runtime.rail.servables(), 1, reason);
    noter(PREPARATION, { type: "ticket.left", payload: { reason } }, "github");
    assert.equal(runtime.rail.prendre("box/claude")?.ticket ?? null, libre ? 3 : null, reason);
    if (libre) assert.equal(lignes.at(-1), `brigade : #7 (préparer le dépôt) a quitté le rail sans être servi (${reason}) — le rail n'attend plus`);
    else assert.equal(lignes.length, 1, reason);
  }
});

test("un ticket de préparation déjà servi à l'ouverture de la cuisine ne retient rien, et ne se redit pas", (t) => {
  const { repertoireEtat, socle, rail, arriver } = uneCuisine(t, { preparation: PREPARATION });
  arriver(PREPARATION);
  assert.equal(rail.prendre("box/claude")?.ticket, PREPARATION);
  rail.envoyerEnPass(PREPARATION, "box/claude");
  rail.servir(PREPARATION);
  // La station redémarre : la cuisine se rouvre sur le même état.
  const lignes: string[] = [];
  const rouverte = attendreLaPreparation(socle, { repertoireEtat, dire: (ligne) => lignes.push(ligne) });
  arriver(3);
  assert.equal(rouverte.rail.servables(), 1);
  assert.equal(rouverte.rail.prendre("box/claude")?.ticket, 3);
  assert.deepEqual(lignes, []);
});

test("sans ticket de préparation — un projet écrit à la main, ou d'avant —, le rail est celui de toujours", (t) => {
  const { runtime, socle, arriver, lignes } = uneCuisine(t);
  assert.equal(runtime, socle);
  arriver(3);
  assert.equal(runtime.rail.prendre("box/claude")?.ticket, 3);
  assert.deepEqual(lignes, []);
});

test("attendre.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
