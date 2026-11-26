// L'étape `tests written` du rail, lue de GitHub (ticket 3725, épique 3724) : un ticket dont les tests d'acceptation sont
// écrits et gelés porte le label `tests-written`. Entre `queued` et `taken`, la vue du rail le dit « tests written », dans
// On the rail — aucun cook ne l'a encore pris —, sa ligne de `status` et la ligne `rail` le comptent à part. Pris, il est
// `taken`, quel que soit ce label. Joué sur un faux GitHub, puis rendu par le rail de l'app.
import assert from "node:assert/strict";
import { test } from "node:test";
import { porter } from "../../../src/bon.ts";
import { comprendre, tableau as tableauDe, type Faits, type Tableau } from "../../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
const prise = { id: 11, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", created_at: "2026-11-04T02:58:00Z" };

// Le projet : #1 en file, #7 en file avec ses tests écrits, #8 pris après ses tests.
const github: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok([issue(1, ["fire"]), issue(7, ["fire", "tests-written", "prio:2"]), issue(8, ["fire", "tests-written", "taken"])]);
  if (chemin.includes("/issues?")) return ok([]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/8/comments")) return ok([prise]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};

const lire = () => lireLeTableauDuDepot({ depot: DEPOT, appeler: github, maintenant: () => new Date("2026-11-04T03:02:03.076Z") });
function dessine(lu: LectureDuTableauDuDepot): Tableau {
  assert.ok(lu.lu, "the rail is read");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), `facts are in shape: ${"informe" in faits ? faits.informe : ""}`);
  return tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}

test("a ticket whose acceptance tests are written shows 'tests written' on the rail, between 'queued' and 'taken'", async () => {
  const lu = await lire();
  assert.ok(lu.lu);
  const vu = dessine(lu);
  const cartes = Object.fromEntries(vu.rail.colonnes.map(({ nom, cartes }) => [nom, cartes.map(({ ticket, mot, etat, ton }) => `#${ticket} ${mot ?? etat} ${ton ?? "-"}`)]));
  // Pas encore pris : dans On the rail, sous son mot, au ton du rail ; pris, il est `taken`.
  assert.deepEqual(cartes["On the rail"], ["#7 tests written gris", "#1 queued gris"]);
  assert.deepEqual(cartes["Taken"], ["#8 taken bleu"]);
  // La ligne `rail` de `status` le compte à part, entre `taken` et `queued`.
  assert.match(statusDuTableau(lu), /^rail {7}1 taken · 1 tests written · 1 queued$/m);
});

test("its card reads its 'tests written' line: since when it is on the rail, and its priority", async () => {
  const lu = await lire();
  assert.ok(lu.lu);
  const ligne = lu.lignesDuRail.find(({ ticket }) => ticket === 7)?.ligne.replace(/^ {2}#\d+ {2}/, "");
  assert.equal(ligne, "tests written  prio:2  since 2026-11-03 21:00 UTC  Ticket 7");
  assert.deepEqual(porter({ etat: "tests écrits", titre: "Ticket 7" }, { lignes: [ligne ?? ""], bloque: false }).dit.slice(0, 1), [{ libelle: "since", valeur: "2026-11-03 21:00 UTC" }]);
  assert.equal(dessine(lu).rail.colonnes.find(({ nom }) => nom === "On the rail")?.cartes.find(({ ticket }) => ticket === 7)?.prio, "prio:2");
});
