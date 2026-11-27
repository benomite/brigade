// WAITING sur un projet GitHub (#3075), devenu le parking (#4129) : la marque d'attente que la station et le second écrivent
// sur l'issue (runtime/src/attente-github/marque.ts, `corpsDuParking`), l'app la lit — ce qu'elle attend, de qui, et sa
// relance ; le commentaire `**WAITING: awaiting …**` d'avant #4129 se lit encore —, et la marque que l'app écrit est la même.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corpsDuParking } from "../../../../runtime/src/attente-github/marque.ts";
import { AT_THE_ARRIVAL, brandOfWait, thirdOfTheBrand, thirdOfComments } from "../../../src/vue/wait/wait-github.ts";

// Le commentaire d'entrée en WAITING d'avant #4129, tel que la commande `waiting set` du runtime l'écrivait
// (`direMarque`, retiré) : un ticket mis en attente avant garde ce qu'il attend.
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");
const instantOfBefore = (iso: string) => {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTH[date.getUTCMonth()]} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
};
const AT_THE_ARRIVAL_OF_BEFORE = "it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn";
function brandOfBefore(ticket: number, { what, who, since, followUp }: { what: string; who: string; since: string; followUp: string }, update: boolean): string {
  return [
    `**WAITING${update ? " — updated" : ""}: awaiting ${who}.** ${what}`,
    "",
    `- **from whom**: ${who}`,
    `- **since**: ${instantOfBefore(since)}`,
    `- **follow-up**: ${instantOfBefore(followUp)}`,
    `- **on arrival**: ${AT_THE_ARRIVAL_OF_BEFORE}`,
    "",
    `As long as it has the \`waiting\` label, the kitchen does not take it, and its follow-up does not take it out. Removing this label sends it back to the kitchen; \`brigade waiting resume ${ticket}\` gives it back the state it had before waiting.`,
  ].join("\n");
}
const OLD_40 = brandOfBefore(40, { what: "the signed quote", who: "the client", since: "2026-11-02T09:30:00.000Z", followUp: "2026-11-16T00:00:00.000Z" }, false);

describe("la marque d'attente : ce que le runtime écrit sur l'issue, l'app le lit", () => {
  test("le commentaire de `waiting set` d'avant #4129 (direMarque) se lit encore : quoi, de qui, depuis, la relance, ce que fera l'arrivée", () => {
    assert.deepEqual(thirdOfTheBrand(OLD_40, "2026-11-02T09:31:00Z"), { quoi: "the signed quote", qui: "the client", depuis: "2026-11-02T09:30:00.000Z", relance: "2026-11-16T00:00:00.000Z", aLArrivee: AT_THE_ARRIVAL_OF_BEFORE });
    assert.deepEqual(thirdOfComments([{ body: OLD_40, created_at: "2026-11-02T09:31:00Z" }])?.relance, "2026-11-16T00:00:00.000Z");
    // Mise à jour, et à cheval sur deux années : la relance sans année est celle qui suit la mise en attente.
    const maj = brandOfBefore(40, { what: "the PO", who: "Acme", since: "2026-12-30T08:00:00.000Z", followUp: "2027-01-06T00:00:00.000Z" }, true);
    assert.deepEqual(thirdOfTheBrand(maj, "2026-12-30T08:01:00Z"), { quoi: "the PO", qui: "Acme", depuis: "2026-12-30T08:00:00.000Z", relance: "2027-01-06T00:00:00.000Z", aLArrivee: AT_THE_ARRIVAL_OF_BEFORE });
  });

  test("la marque que l'app écrit est celle de `parked set`, mot pour mot — une relance lointaine se relit telle quelle", () => {
    const relaunch = new Date("2028-03-01T00:00:00.000Z");
    const body = brandOfWait({ quoi: "the signed quote", qui: "the client" }, relaunch);
    assert.equal(body, corpsDuParking({ what: "the signed quote", who: "the client", followUp: relaunch.toISOString() }));
    // Ce que l'arrivée fera, l'app le dit dans les mots du commentaire.
    assert.ok(body.includes(AT_THE_ARRIVAL), body);
    assert.deepEqual(thirdOfComments([{ body: body, created_at: "2026-11-09T10:00:05Z", author_association: "OWNER" }]), { quoi: "the signed quote", qui: "the client", depuis: "2026-11-09T10:00:05.000Z", relance: relaunch.toISOString(), aLArrivee: `until 2028-03-01 00:00 UTC, then ${AT_THE_ARRIVAL}` });
  });

  test("un autre commentaire, ou une marque dont un morceau manque, ne se lit pas : rien n'est inventé ; la dernière marque l'emporte", () => {
    assert.equal(thirdOfTheBrand("**WAITING lifted** — no longer awaiting the client", "2026-11-02T09:31:00Z"), null);
    assert.equal(thirdOfTheBrand(OLD_40.replace(/- \*\*follow-up\*\*.*\n/, ""), "2026-11-02T09:31:00Z"), null);
    assert.equal(thirdOfTheBrand(OLD_40.replace("16 Nov", "16 Foo"), "2026-11-02T09:31:00Z"), null);
    const other = corpsDuParking({ what: "the PO", who: "Acme", followUp: "2026-11-20T00:00:00.000Z" });
    assert.equal(thirdOfComments([{ body: OLD_40, created_at: "2026-11-02T09:31:00Z" }, { body: other, created_at: "2026-11-05T08:01:00Z", author_association: "OWNER" }, { body: "thanks", created_at: "2026-11-06T08:00:00Z" }])?.qui, "Acme");
    // Une marque de parking d'un auteur hors du dépôt ne se lit pas.
    assert.equal(thirdOfComments([{ body: other, created_at: "2026-11-05T08:01:00Z", author_association: "NONE" }]), null);
    assert.equal(thirdOfComments([{ body: "thanks", created_at: "2026-11-06T08:00:00Z" }]), null);
  });
});
