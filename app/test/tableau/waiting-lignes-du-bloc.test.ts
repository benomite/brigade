// Les lignes de WAITING du bloc du chef (#3814), par les deux chemins qui les lisent : la file du second, qui liste aussi
// les issues au label `waiting`, et l'app (`"du-rail"`), qui s'en tient aux listes déjà lues. Une attente écrite par
// l'app se lit comme celle que la station marque ; les lignes vont dans l'ordre des tickets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLaFile } from "../../src/second/file.ts";
import { blocDuChef, lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { marqueDAttente } from "../../src/vue/attente/attente-github.ts";

const DEPOT = "acme/kitchen";
const LU = "2026-11-18T12:00:00.000Z";

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, ...labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-17T00:00:00Z", labels: labels.map((name) => ({ name })) });
// #52 : la marque de la station. #41 : le commentaire que l'app écrit. #63 : en WAITING sans rien qui le dise.
const STATION = `<!-- brigade:waiting ${JSON.stringify({ what: "Too early: not before 2026-11-25", who: "the calendar: not before 2026-11-25", followUp: "2026-11-25T00:00:00.000Z", backOnFollowUp: true })} -->\n**WAITING: awaiting the calendar.**`;
const APP = marqueDAttente({ quoi: "the signed contract", qui: "the lawyer" }, new Date("2026-11-17T01:00:00Z"), new Date("2026-11-30T00:00:00Z"));

// Le faux GitHub : `fire` liste ce que le rail porte, `waiting` le reste ; chaque chemin appelé est noté.
function github(listes: { fire: unknown[]; waiting: unknown[] }) {
  const chemins: string[] = [];
  const appeler: AppelGitHub = async (chemin) => {
    chemins.push(chemin);
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined) return ok(label === "fire" ? listes.fire : label === "waiting" ? listes.waiting : []);
    if (chemin.includes("/pulls?")) return ok([]);
    if (/\/issues\/52\/comments/.test(chemin)) return ok([{ body: STATION, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/41\/comments/.test(chemin)) return ok([{ body: APP, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
  return { appeler, chemins };
}

test("the second's queue lists the `waiting` issues too: each WAITING ticket has its line, in ticket order, whether the station or the app set the wait", async () => {
  const { appeler } = github({ fire: [], waiting: [issue(63, "waiting"), issue(52, "waiting"), issue(41, "waiting")] });
  const lecture = await lireLaFile(appeler, DEPOT, () => new Date(LU));
  assert.ok(lecture.lue, JSON.stringify(lecture));
  const lignes = lecture.texte.split("\n").filter((ligne) => /WAITING {2}awaiting/.test(ligne));
  assert.deepEqual(lignes.map((ligne) => ligne.trim().slice(0, 3)), ["#41", "#52"], lecture.texte);
  assert.match(lignes[0] ?? "", /#41 {2}WAITING {2}awaiting the lawyer: “the signed contract” — follow-up on 2026-11-30 00:00 UTC — it does not await you/);
  assert.match(lignes[1] ?? "", /#52 {2}WAITING {2}awaiting the calendar: not before 2026-11-25: “Too early: not before 2026-11-25” — back on the rail on its own on 2026-11-25 00:00 UTC/);
  assert.doesNotMatch(lecture.texte, /#63 {2}WAITING/, "nothing is invented for a wait no comment says");
});

test("an issue the app put in WAITING keeps on its card what it waits for", async () => {
  const { appeler } = github({ fire: [], waiting: [issue(41, "waiting")] });
  const lecture = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler, maintenant: () => new Date(LU), enWaiting: true });
  assert.ok(lecture.lue, JSON.stringify(lecture));
  assert.deepEqual(
    lecture.enWaiting.map(({ ticket, tiers }) => [ticket, tiers?.quoi, tiers?.qui]),
    [[41, "the signed contract", "the lawyer"]],
  );
});

test("the app's reading (`du-rail`) lists no `waiting` issues: a WAITING ticket of the rail has its line, one only in `waiting` none", async () => {
  const { appeler, chemins } = github({ fire: [issue(52, "fire", "waiting")], waiting: [issue(41, "waiting")] });
  const lecture = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler, maintenant: () => new Date(LU), enWaiting: "du-rail" });
  assert.ok(lecture.lue, JSON.stringify(lecture));
  const bloc = blocDuChef({ lu: LU, attentes: lecture.attentes, illisibles: lecture.illisibles }).join("\n");
  assert.match(bloc, /#52 {2}WAITING {2}awaiting the calendar/);
  assert.doesNotMatch(bloc, /#41/);
  assert.equal(chemins.some((chemin) => /labels=waiting/.test(chemin)), false, chemins.join("\n"));
});
