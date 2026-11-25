// L'écran du rail, haut du backlog (#4223) : la lecture du rail sur un faux GitHub pose dans les faits les tickets en file,
// calibrés et prêts, par priorité puis âge, et leur écran ; l'écran dit une priorité, échappe un titre, et dit un rail vide.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { hautDuBacklogLu, htmlDuRail } from "../../../src/vue/rail/rail.ts";

const DEPOT = "acme/kitchen";
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], created_at: string) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at, labels: labels.map((name) => ({ name })) });
const PRET = ["fire", "model:opus", "effort:medium"];
const prise = { id: 11, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", created_at: "2026-11-04T02:58:00Z" };

// #1 sans priorité, #2 et #3 en prio:2 — #3 le plus ancien —, #5 pris, #6 pas calibré, #7 mis de côté.
const github: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) {
    return ok([
      issue(1, PRET, "2026-10-01T10:00:00Z"),
      issue(2, [...PRET, "prio:2"], "2026-11-02T10:00:00Z"),
      issue(3, [...PRET, "prio:2"], "2026-10-30T10:00:00Z"),
      issue(5, [...PRET, "taken"], "2026-09-01T10:00:00Z"),
      issue(6, ["fire"], "2026-09-01T10:00:00Z"),
      issue(7, [...PRET, "blocked-on-human"], "2026-09-01T10:00:00Z"),
    ]);
  }
  if (chemin.includes("/issues?")) return ok([]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/5/comments")) return ok([prise]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};

test("the rail read from GitHub carries the top of the backlog: queued, calibrated and ready, by priority then age (#4223)", async () => {
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github, maintenant: () => new Date("2026-11-04T03:02:03.076Z") });
  assert.ok(lu.lu);
  const porte = lu.faits.hautDuBacklog as { issues: { number: number; labels: string[]; createdAt: string }[]; html?: string };
  assert.deepEqual(porte.issues.map(({ number, createdAt }) => [number, createdAt]), [[3, "2026-10-30T10:00:00Z"], [2, "2026-11-02T10:00:00Z"], [1, "2026-10-01T10:00:00Z"]]);
  assert.deepEqual(porte.issues[1]?.labels, [...PRET, "prio:2"]);
  // Pas d'écran dans les faits : leur lecture le compose.
  assert.equal(porte.html, undefined);
  const haut = hautDuBacklogLu(porte, htmlDuRail).hautDuBacklog ?? assert.fail("haut du backlog illisible");
  assert.deepEqual(haut.issues, [3, 2, 1].map((n) => ({ number: n, title: `Ticket ${n}`, url: `https://github.com/${DEPOT}/issues/${n}` })));
  assert.deepEqual([...haut.html.matchAll(/Ticket \d+/g)].map((m) => m[0]), ["Ticket 3", "Ticket 2", "Ticket 1"]);
});

test("the rail screen says an issue's priority, escapes its title, and says when nothing is ready (#4223)", () => {
  const html = htmlDuRail([
    { number: 4, title: "a <b> & \"c\"", labels: [...PRET, "prio:2"], createdAt: "" },
    { number: 9, title: "plain", labels: PRET, createdAt: "" },
  ]);
  assert.match(html, /#4<\/span> <span class="rail-backlog-prio">prio 2<\/span> <span class="rail-backlog-titre">a &lt;b&gt; &amp; &quot;c&quot;<\/span>/);
  assert.match(html, /#9<\/span> <span class="rail-backlog-titre">plain/);
  assert.equal(htmlDuRail([]), `<p class="rail-backlog-vide">Nothing calibrated and ready in the backlog.</p>`);
});

test("the rail screen never draws an issue that is not calibrated and ready, whatever it is given (#4223)", () => {
  const html = htmlDuRail([
    { number: 4, title: "an idea", labels: [...PRET, "idea"], createdAt: "" },
    { number: 5, title: "uncalibrated", labels: ["fire"], createdAt: "" },
    { number: 6, title: "ready", labels: PRET, createdAt: "" },
  ]);
  assert.deepEqual([...html.matchAll(/#\d+/g)].map((m) => m[0]), ["#6"]);
  assert.equal(htmlDuRail([{ number: 5, title: "uncalibrated", labels: ["fire"], createdAt: "" }]), `<p class="rail-backlog-vide">Nothing calibrated and ready in the backlog.</p>`);
});
