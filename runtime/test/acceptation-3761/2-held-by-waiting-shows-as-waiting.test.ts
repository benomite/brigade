// #3761, critère 2 : un ticket retenu parce que celui qu'il attend est en WAITING se montre en WAITING dans la file, avec
// les deux numéros ; jamais comme un ticket en file au repos.
// Test d'acceptation gelé (#3725) : `brigade <project> status` lit le rail sur un faux GitHub (la même lecture que l'app).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-17T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const ATTENTE = corpsDeLAttente({ what: "the collaborator's answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" });
const enLigne = { lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] };

test("a ticket whose awaited ticket is WAITING on a collaborator is shown as WAITING, naming both tickets, never as an idle queued ticket", async () => {
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(1912, ["fire", "waiting"], "Wait for the answer."), issue(3734, ["fire", "model:opus", "effort:medium"], "Depends on #1912")];
    if (/\/issues\/1912\/comments/.test(chemin)) return [{ body: ATTENTE, created_at: "2026-11-07T09:00:00Z", author_association: "OWNER", user: { login: "benomite" } }];
    if (/\/comments/.test(chemin)) return [];
    return chemin.includes("/events?") ? [{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-17T09:30:00Z" }] : assert.fail(`not dictated: ${chemin}`);
  };
  const lignes = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => enLigne, maintenant: MAINTENANT });
  const carte = lignes.find((ligne) => ligne.trimStart().startsWith("#3734")) ?? assert.fail(`no line for #3734 in:\n${lignes.join("\n")}`);
  assert.match(carte, /waits for `#1912`, WAITING on a collaborator/);
  assert.match(carte, /#3734/);
  assert.doesNotMatch(lignes.join("\n"), /Normal wait|takes the ticket within minutes/, "never an idle queued ticket");
});
