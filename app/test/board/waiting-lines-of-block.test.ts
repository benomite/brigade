// Les lignes de WAITING du bloc du chef (#3814), par les deux chemins qui les lisent : la file du second, qui liste aussi
// les issues au label `parked` (#4129, d'abord `waiting`), et l'app (`"du-rail"`), qui s'en tient aux listes déjà lues. Une attente écrite par
// l'app se lit comme celle que la station marque ; les lignes vont dans l'ordre des tickets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readTheFile } from "../../src/second/file.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { brandOfWait } from "../../src/vue/wait/wait-github.ts";

const REPOSITORY = "acme/kitchen";
const READ = "2026-11-18T12:00:00.000Z";

const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, ...labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-17T00:00:00Z", labels: labels.map((name) => ({ name })) });
// #52 : la marque de la station d'avant #4129 (`brigade:waiting`), qui se lit encore. #41 : le commentaire que l'app écrit. #63 : en WAITING sans rien qui le dise.
const STATION = `<!-- brigade:waiting ${JSON.stringify({ what: "Too early: not before 2026-11-25", who: "the calendar: not before 2026-11-25", followUp: "2026-11-25T00:00:00.000Z", backOnFollowUp: true })} -->\n**WAITING: awaiting the calendar.**`;
const APP = brandOfWait({ quoi: "the signed contract", qui: "the lawyer" }, new Date("2026-11-30T00:00:00Z"));

// Le faux GitHub : `fire` liste ce que le rail porte, `parked` le reste ; chaque chemin appelé est noté.
function github(lists: { fire: unknown[]; parked: unknown[] }) {
  const paths: string[] = [];
  const call: CallGitHub = async (path) => {
    paths.push(path);
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
    if (label !== undefined) return ok(label === "fire" ? lists.fire : label === "parked" ? lists.parked : []);
    if (path.includes("/pulls?")) return ok([]);
    if (/\/issues\/52\/comments/.test(path)) return ok([{ body: STATION, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/41\/comments/.test(path)) return ok([{ body: APP, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
  return { appeler: call, chemins: paths };
}

test("the second's queue lists the `parked` issues too: each WAITING ticket has its line, in ticket order, whether the station or the app set the wait", async () => {
  const { appeler: call } = github({ fire: [], parked: [issue(63, "parked"), issue(52, "parked"), issue(41, "parked")] });
  const reading = await readTheFile(call, REPOSITORY, () => new Date(READ));
  assert.ok(reading.lue, JSON.stringify(reading));
  const lines = reading.texte.split("\n").filter((line) => /WAITING {2}awaiting/.test(line));
  assert.deepEqual(lines.map((line) => line.trim().slice(0, 3)), ["#41", "#52"], reading.texte);
  assert.match(lines[0] ?? "", /#41 {2}WAITING {2}awaiting the lawyer: “the signed contract” — resumes where it was on its own on 2026-11-30 00:00 UTC — it does not await you/);
  assert.match(lines[1] ?? "", /#52 {2}WAITING {2}awaiting the calendar: not before 2026-11-25: “Too early: not before 2026-11-25” — resumes where it was on its own on 2026-11-25 00:00 UTC/);
  assert.doesNotMatch(reading.texte, /#63 {2}WAITING/, "nothing is invented for a wait no comment says");
});


