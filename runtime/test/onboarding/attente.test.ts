// Le rail d'un projet dont la station cuit sans bac à sable : rien ne part —
// pas même le ticket de préparation — avant la décision du chef. Sur un vrai
// journal, avec le vrai rail.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { RuntimeAvecRail } from "../../src/alimenter.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable, retenirSansDecision } from "../../src/onboarding/attente.ts";
import { attendreLaPreparation } from "../../src/preparation-depot/attendre.ts";
import { FICHIER as PREPARATION_FICHIER } from "../../src/preparation-depot/ouvrir.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ouvrirRail } from "../../src/rail.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();


const BAC = { bin: "bwrap", hidden: [], credentials: "/x" };

function uneCuisine(t: TestContext, options: { sandbox: typeof BAC | null | "inconnu"; station?: string }) {
  const repertoireEtat = repertoireTemporaire(t);
  writeFileSync(join(repertoireEtat, PREPARATION_FICHIER), JSON.stringify({ ticket: 7, ouvertLe: "2026-10-15T12:00:00.000Z" }));
  const journal = ouvrirJournal(repertoireEtat);
  aArreter(t, () => journal.fermer());
  const noter = (ticket: number | null, fait: Fait, author = "runtime") => journal.ajouter({ project: "shop", ticket, author, ...fait });
  if (options.sandbox !== "inconnu") noter(null, { type: "isolation.configured", payload: { sandbox: options.sandbox, proxy: null } });
  const arriver = (ticket: number) =>
    noter(
      ticket,
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-15T00:00:${String(ticket).padStart(2, "0")}Z`, url: `https://exemple.test/${ticket}`, model: "opus", effort: "high", card: null } },
      "github",
    );
  const rail = ouvrirRail(journal, { projet: "shop", dureeBailMs: 3_600_000 });
  const lignes: string[] = [];
  const dire = (ligne: string) => lignes.push(ligne);
  const socle = { projet: "shop", journal, rail } as unknown as RuntimeAvecRail;
  const station = options.station ?? "macbook";
  const runtime = retenirSansDecision(attendreLaPreparation(socle, { repertoireEtat, dire }), { repertoireEtat, station, dire });
  arriver(7);
  arriver(8);
  return { repertoireEtat, runtime, lignes };
}

test("retenu : sans bac à sable et sans décision, aucun cook ne part — pas même le ticket de préparation", (t) => {
  const { runtime, lignes } = uneCuisine(t, { sandbox: null });
  assert.equal(runtime.rail.servables(), 0);
  assert.equal(runtime.rail.prendre("box/claude"), null);
  assert.equal(lignes.filter((ligne) => ligne.includes("cuit sans bac à sable")).length, 1);
});

test("levé par l'acceptation : la préparation part au cycle suivant, sans redémarrage", (t) => {
  const { runtime, repertoireEtat, lignes } = uneCuisine(t, { sandbox: null });
  assert.equal(runtime.rail.prendre("box/claude"), null);
  accepterSansBacASable({ repertoireEtat, station: "macbook" });
  assert.equal(runtime.rail.prendre("box/claude")?.ticket, 7);
  assert.ok(lignes.includes("brigade : le chef a décidé pour macbook — le rail démarre"));
});

test("levé par le changement de station, et la décision n'est pas reprise pour la nouvelle", (t) => {
  const { runtime, repertoireEtat } = uneCuisine(t, { sandbox: null, station: "mini" });
  // La décision prise pour l'ancienne station ne vaut pas pour `mini`.
  accepterSansBacASable({ repertoireEtat, station: "macbook" });
  assert.equal(runtime.rail.prendre("box/claude"), null);
  accepterSansBacASable({ repertoireEtat, station: "mini" });
  assert.equal(runtime.rail.prendre("box/claude")?.ticket, 7);
});

test("jamais retenu : avec un bac à sable configuré, ou tant qu'on ne sait pas", (t) => {
  for (const sandbox of [BAC, "inconnu"] as const) {
    const { runtime, lignes } = uneCuisine(t, { sandbox });
    assert.equal(runtime.rail.prendre("box/claude")?.ticket, 7);
    assert.deepEqual(lignes.filter((ligne) => ligne.includes("sans bac")), []);
  }
});
