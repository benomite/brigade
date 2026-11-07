// Le budget d'appels à GitHub par projet et par heure d'horloge (#2196) : le
// registre que le pacer tient, son alerte, et ce que `status` en dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET_PAR_HEURE, categorieDe, ticketDe, type AlerteDeBudget, type Categorie } from "../../src/github/budget-appels.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { etiquetteDe, limiteDeLaStation, ouvrirLimite, type Etiquette, type Limite } from "../../src/limite-github.ts";
import { photoDuProjet } from "../../src/status.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const HEURE = Date.parse("2026-11-03T10:00:00Z");

test("la catégorie et le ticket d'un appel se lisent dans son chemin", () => {
  assert.equal(categorieDe(["repos/o/r/issues?labels=fire&state=open&per_page=100"]), "issues");
  assert.equal(categorieDe(["repos/o/r/issues/12/comments?per_page=100"]), "issues");
  assert.equal(categorieDe(["-X", "POST", "repos/o/r/issues/12/labels", "-f", "labels[]=fire"]), "issues");
  assert.equal(categorieDe(["repos/o/r/pulls?head=o:cook/1"]), "PRs");
  assert.equal(categorieDe(["-X", "PUT", "repos/o/r/pulls/3/merge"]), "PRs");
  assert.equal(categorieDe(["repos/o/r/commits/abc/pulls"]), "PRs");
  assert.equal(categorieDe(["repos/o/r/commits/abc/check-runs?per_page=100"]), "checks");
  assert.equal(categorieDe(["repos/o/r/commits/abc/status?per_page=100"]), "checks");
  assert.equal(categorieDe(["repos/o/r/actions/jobs/9/logs"]), "checks");
  assert.equal(categorieDe(["-X", "PATCH", "/gists/abc", "--input", "-"]), "gists");
  assert.equal(ticketDe(["repos/o/r/issues/12/comments?per_page=100"]), 12);
  assert.equal(ticketDe(["repos/o/r/issues/12"]), 12);
  assert.equal(ticketDe(["repos/o/r/issues?state=open"]), null);
  assert.equal(ticketDe(["repos/o/r/pulls/3"]), null);
  assert.deepEqual(etiquetteDe(["-X", "POST", "repos/o/r/issues/7/comments", "-f", "body=x"], { projet: "alpha" }), {
    projet: "alpha",
    lecture: "issue-comments",
    ecriture: true,
    categorie: "issues",
    ticket: 7,
  });
});

const appeler = (limite: Limite, etiquette: Etiquette, n: number, usage: "cuisine" | "geste" = "cuisine", avancer = () => {}) => {
  for (let i = 0; i < n; i++) {
    avancer();
    limite.prendre(usage, undefined, etiquette);
  }
};

// Une horloge qui avance d'un pas avant chaque appel : la cuisine ne prend que
// 450 points par minute (#2443), et un budget de 600 lectures à l'heure ne se
// passe pas au même instant. 200 ms le pas, 300 lectures la minute.
const PAS_MS = 200;
const horloge = (depart: number) => {
  const h = { instant: depart, maintenant: () => h.instant, avancer: () => void (h.instant += PAS_MS) };
  return h;
};

test("des appels de deux projets dans plusieurs catégories : le registre donne les totaux exacts par projet, par type et par catégorie, dans la forme du contrat", () => {
  const limite = ouvrirLimite({ maintenant: () => HEURE + 5 * 60_000 });
  appeler(limite, etiquetteDe(["repos/o/alpha/issues?state=open"], { projet: "alpha" }), 3);
  appeler(limite, etiquetteDe(["repos/o/alpha/issues/12/comments"], { projet: "alpha" }), 2);
  appeler(limite, etiquetteDe(["-X", "POST", "repos/o/alpha/issues/12/comments", "-f", "body=x"], { projet: "alpha" }), 1);
  appeler(limite, etiquetteDe(["repos/o/alpha/commits/abc/check-runs"], { projet: "alpha" }), 4);
  appeler(limite, { projet: "alpha", lecture: "issues" }, 1);
  appeler(limite, { projet: "alpha", lecture: "issues", ecriture: true }, 1);
  appeler(limite, etiquetteDe(["repos/o/beta/pulls/3"], { projet: "beta" }), 2);
  appeler(limite, etiquetteDe(["-X", "PUT", "repos/o/beta/pulls/3/merge"], { projet: "beta", usage: "geste" }), 1, "geste");
  appeler(limite, etiquetteDe(["repos/o/beta/issues/40"], { projet: "beta" }), 1);
  appeler(limite, { projet: "station", lecture: "gist", ecriture: true }, 1);

  const vide = { issues: 0, gists: 0, PRs: 0, checks: 0 };
  const budget = { reads: BUDGET_PAR_HEURE, writes: BUDGET_PAR_HEURE };
  assert.deepEqual(limite.budget(), {
    windowStart: "2026-11-03T10:00:00.000Z",
    projects: {
      alpha: {
        reads: { total: 10, byCategory: { ...vide, issues: 6, checks: 4 } },
        writes: { total: 2, byCategory: { ...vide, issues: 2 } },
        budget,
        overBudget: false,
      },
      beta: {
        reads: { total: 3, byCategory: { ...vide, issues: 1, PRs: 2 } },
        writes: { total: 1, byCategory: { ...vide, PRs: 1 } },
        budget,
        overBudget: false,
      },
      station: {
        reads: { total: 0, byCategory: vide },
        writes: { total: 1, byCategory: { ...vide, gists: 1 } },
        budget,
        overBudget: false,
      },
    },
    perTicket: { "12": 3, "40": 1 },
  });
  limite.fermer();
});

test("un projet qui passe son budget de lectures donne une seule alerte dans l'heure, qui le nomme et liste ses catégories de la plus utilisée à la moins utilisée ; un autre process ne la redit pas", (t) => {
  const station = repertoireTemporaire(t);
  const alertes: AlerteDeBudget[] = [];
  const { maintenant, avancer } = horloge(HEURE + 10 * 60_000);
  const limite = limiteDeLaStation(station, { maintenant, alerter: (a) => alertes.push(a) });
  const autre = limiteDeLaStation(station, { maintenant, alerter: (a) => alertes.push(a) });
  aArreter(t, () => {
    limite.fermer();
    autre.fermer();
  });
  appeler(limite, etiquetteDe(["repos/o/beta/issues"], { projet: "beta" }), 10, "cuisine", avancer);
  appeler(limite, etiquetteDe(["repos/o/alpha/commits/abc/check-runs"], { projet: "alpha" }), 100, "cuisine", avancer);
  appeler(limite, etiquetteDe(["repos/o/alpha/issues?state=open"], { projet: "alpha" }), 300, "cuisine", avancer);
  appeler(limite, { projet: "alpha", lecture: "issues" }, 20, "cuisine", avancer);
  appeler(limite, etiquetteDe(["repos/o/alpha/pulls/3"], { projet: "alpha" }), 180, "cuisine", avancer);
  assert.equal(limite.budget().projects.alpha?.reads.total, BUDGET_PAR_HEURE);
  assert.deepEqual(alertes, [], "à 600 lectures, le budget est tenu, pas passé");

  appeler(limite, etiquetteDe(["repos/o/alpha/pulls/3"], { projet: "alpha" }), 1, "cuisine", avancer);
  assert.deepEqual(alertes, [
    {
      projet: "alpha",
      windowStart: "2026-11-03T10:00:00.000Z",
      depasses: ["reads"],
      categories: [
        { categorie: "issues", appels: 320 },
        { categorie: "PRs", appels: 181 },
        { categorie: "checks", appels: 100 },
      ],
    },
  ]);
  assert.equal(limite.budget().projects.alpha?.overBudget, true);
  assert.equal(limite.budget().projects.beta?.overBudget, false);

  // Un second dépassement dans la même heure, d'ici ou d'un autre process : rien de plus.
  appeler(limite, etiquetteDe(["repos/o/alpha/issues"], { projet: "alpha" }), 5, "cuisine", avancer);
  appeler(autre, etiquetteDe(["repos/o/alpha/issues"], { projet: "alpha" }), 5, "cuisine", avancer);
  appeler(autre, etiquetteDe(["-X", "PUT", "repos/o/alpha/pulls/3/merge"], { projet: "alpha", usage: "geste" }), BUDGET_PAR_HEURE + 1, "geste");
  assert.equal(alertes.length, 1);
});

test("le budget des écritures se tient à part de celui des lectures : le passer donne son alerte, qui dit les écritures", () => {
  const alertes: AlerteDeBudget[] = [];
  const limite = ouvrirLimite({ maintenant: () => HEURE, alerter: (a) => alertes.push(a) });
  appeler(limite, etiquetteDe(["repos/o/alpha/issues"], { projet: "alpha" }), 400);
  // Les écritures d'un geste ne sont pas espacées : seules elles passent 600 dans l'heure.
  appeler(limite, etiquetteDe(["-X", "POST", "repos/o/alpha/issues/5/comments", "-f", "body=x"], { projet: "alpha", usage: "geste" }), BUDGET_PAR_HEURE + 1, "geste");
  const alpha = limite.budget().projects.alpha;
  assert.equal(alpha?.reads.total, 400);
  assert.equal(alpha?.writes.total, BUDGET_PAR_HEURE + 1);
  assert.deepEqual(
    alertes.map((a) => [a.projet, a.depasses, a.categories.map((c) => c.categorie)]),
    [["alpha", ["writes"], ["issues"] as Categorie[]]],
  );
  limite.fermer();
});

test("à l'heure pleine, les compteurs repartent de zéro, et un nouveau dépassement donne une nouvelle alerte", () => {
  const h = horloge(HEURE + 55 * 60_000);
  const alertes: AlerteDeBudget[] = [];
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: (a) => alertes.push(a) });
  appeler(limite, etiquetteDe(["repos/o/alpha/issues/9"], { projet: "alpha" }), BUDGET_PAR_HEURE + 1, "cuisine", h.avancer);
  assert.ok(h.instant < HEURE + 60 * 60_000, "ses 601 lectures tiennent dans l'heure");
  assert.equal(alertes.length, 1);
  assert.equal(limite.budget().perTicket["9"], BUDGET_PAR_HEURE + 1);

  h.instant = HEURE + 60 * 60_000;
  assert.deepEqual(limite.budget(), { windowStart: "2026-11-03T11:00:00.000Z", projects: {}, perTicket: {} });
  appeler(limite, etiquetteDe(["repos/o/alpha/issues/9"], { projet: "alpha" }), 2, "cuisine", h.avancer);
  assert.equal(limite.budget().projects.alpha?.reads.total, 2);
  assert.equal(alertes.length, 1);

  appeler(limite, etiquetteDe(["repos/o/alpha/issues/9"], { projet: "alpha" }), BUDGET_PAR_HEURE, "cuisine", h.avancer);
  assert.deepEqual(
    alertes.map((a) => a.windowStart),
    ["2026-11-03T10:00:00.000Z", "2026-11-03T11:00:00.000Z"],
  );
  limite.fermer();
});

test("`status` dit, pour chaque projet, ses lectures et ses écritures de l'heure contre leur budget, sur deux lignes", (t) => {
  const repertoire = repertoireTemporaire(t);
  const station = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const h = horloge(HEURE + 20 * 60_000);
  const limite = limiteDeLaStation(station, { maintenant: h.maintenant, alerter: () => {} });
  aArreter(t, () => limite.fermer());
  appeler(limite, etiquetteDe(["repos/o/alpha/issues"], { projet: "alpha" }), 12);
  appeler(limite, etiquetteDe(["-X", "POST", "repos/o/alpha/issues/3/comments", "-f", "body=x"], { projet: "alpha" }), 3);
  appeler(limite, etiquetteDe(["repos/o/beta/pulls/1"], { projet: "beta" }), BUDGET_PAR_HEURE + 1, "cuisine", h.avancer);
  const instant = h.instant;

  const lignes = photoDuProjet({ BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station }, { maintenant: new Date(instant) });
  const debut = lignes.findIndex((l) => l.startsWith("gh budget"));
  assert.deepEqual(lignes.slice(debut, debut + 4), [
    "gh budget  alpha reads 12/600 this hour",
    "           alpha writes 3/600 this hour",
    "           beta reads 601/600 this hour — over budget",
    "           beta writes 0/600 this hour",
  ]);

  // Sans compteur de station, pas de ligne de budget.
  assert.equal(
    photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant: new Date(instant) }).some((l) => l.startsWith("gh budget")),
    false,
  );
});
