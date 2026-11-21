// #3761, critère 3 : quand l'unique ticket du rail ne peut pas partir depuis plus d'une heure, la vue du projet dit une
// ligne, avec la raison et le ticket qu'il attend ; sous l'heure, cette ligne ne se montre pas.
// Test d'acceptation gelé (#3725) : les lignes d'attente du rail que la vue lit (`status`), sur une horloge dictée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-17T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-17T08:00:00Z", labels: labels.map((name) => ({ name })) });
const ATTENTE = corpsDeLAttente({ what: "the collaborator's answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" });
const enLigne = { lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] };

// Les lignes du rail qui ne sont pas la carte d'un ticket (`  #N  …`), pour #3734 en file depuis `minutes`.
const lignesDuRail = async (minutes: number) => {
  const lire = async (chemin: string) => {
    if (chemin === FEUX) return [issue(1912, ["fire", "waiting"]), issue(3734, ["fire", "model:opus", "effort:medium"], "Depends on #1912")];
    if (/\/issues\/1912\/comments/.test(chemin)) return [{ body: ATTENTE, created_at: "2026-11-07T09:00:00Z", author_association: "OWNER", user: { login: "benomite" } }];
    if (/\/comments/.test(chemin)) return [];
    return chemin.includes("/events?") ? [{ event: "labeled", label: { name: "fire" }, created_at: new Date(MAINTENANT - minutes * 60_000).toISOString() }] : assert.fail(`not dictated: ${chemin}`);
  };
  const lignes = await lignesDeLAttente({ depot: DEPOT, lire, stations: async () => enLigne, maintenant: MAINTENANT });
  return lignes.filter((ligne) => !/^\s+#\d+\s/.test(ligne));
};

test("the only ticket of the rail unable to leave for more than an hour: one line says why and names the ticket it waits for", async () => {
  const lignes = await lignesDuRail(61);
  assert.equal(lignes.filter((ligne) => ligne.includes("#1912")).length, 1, `one line naming #1912 in:\n${lignes.join("\n")}`);
  assert.match(lignes.find((ligne) => ligne.includes("#1912")) ?? "", /WAITING/);
});

// brigade:guard
test("under an hour the line is not shown", async () => {
  const lignes = await lignesDuRail(59);
  assert.equal(lignes.filter((ligne) => ligne.includes("#1912")).length, 0, `no line naming #1912 in:\n${lignes.join("\n")}`);
});
