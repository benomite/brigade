// Le réveil sans progrès (#4027, `inactivite/inactivite.ts`) : ce que les tests
// d'acceptation ne disent pas — un réveil qui ne part pas, une raison qui ne
// s'écrit pas, un ticket qui sort des états suivis, le texte de la raison.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirInactivite } from "../../src/inactivite/inactivite.ts";

const MARQUE_D_INACTIVITE = "<!-- brigade:no-progress";
type ReveilSansProgres = { ticket: number; state: string; since: string; kind: string | null };

const MIN = 60_000;
const T0 = Date.parse("2026-11-23T10:00:00Z");
const at = (min: number) => new Date(T0 + min * MIN).toISOString();

function monter(options: { reveiller?: (r: ReveilSansProgres) => boolean | void; commenter?: () => Promise<void> } = {}) {
  let now = T0;
  const reveils: ReveilSansProgres[] = [];
  const commentaires: { ticket: number; corps: string }[] = [];
  const dits: string[] = [];
  const inactivite = ouvrirInactivite({
    maintenant: () => new Date(now),
    reveiller: (r) => (reveils.push(r), options.reveiller?.(r)),
    github: { commenter: options.commenter ?? (async (ticket, corps) => void commentaires.push({ ticket, corps })) },
    dire: (ligne) => void dits.push(ligne),
  });
  return { inactivite, reveils, commentaires, dits, avancer: (min: number) => void (now += min * MIN) };
}

test("a wake the supervisor cannot take (a run already holds the project) is not counted: no reason written, and the next tick tries again", async () => {
  let libre = false;
  const { inactivite, reveils, commentaires, avancer } = monter({ reveiller: () => libre });
  const tickets = [{ number: 7, state: "cooking" }];
  inactivite.progres(7, { kind: "commit", by: "agent", at: at(0) });
  avancer(30);
  await inactivite.passer(tickets);
  assert.equal(reveils.length, 1);
  assert.deepEqual(commentaires, []);
  libre = true;
  avancer(1);
  await inactivite.passer(tickets);
  assert.equal(reveils.length, 2);
  assert.deepEqual(commentaires.map(({ ticket }) => ticket), [7]);
});

test("a reason that cannot be written on the ticket is said, and the wake still counts for its silent period", async () => {
  const { inactivite, reveils, dits, avancer } = monter({
    commenter: async () => {
      throw new Error("HTTP 502");
    },
  });
  const tickets = [{ number: 7, state: "parked" }];
  inactivite.progres(7, { kind: "commit", by: "agent", at: at(0) });
  avancer(30);
  await inactivite.passer(tickets);
  avancer(5);
  await inactivite.passer(tickets);
  assert.equal(reveils.length, 1);
  assert.deepEqual(dits, ["#7: the supervisor woke on no progress, but its reason was not written on the ticket — HTTP 502"]);
});

test("a ticket that leaves the five states forgets its count: back in one, it starts again from the tick that sees it", async () => {
  const { inactivite, reveils, avancer } = monter();
  inactivite.progres(7, { kind: "commit", by: "agent", at: at(0) });
  await inactivite.passer([{ number: 7, state: "cooking" }]);
  avancer(10);
  await inactivite.passer([]);
  avancer(30);
  await inactivite.passer([{ number: 7, state: "in pass" }]);
  assert.equal(reveils.length, 0, "40 minutes after the commit, but seen again only now");
  avancer(29);
  await inactivite.passer([{ number: 7, state: "in pass" }]);
  assert.equal(reveils.length, 0);
  avancer(1);
  await inactivite.passer([{ number: 7, state: "in pass" }]);
  assert.deepEqual(reveils, [{ ticket: 7, state: "in pass", since: at(40), kind: null }]);
});

test("the reason names the last progress and its date; with no progress seen, the tick that first saw the ticket", async () => {
  const { inactivite, commentaires, avancer } = monter();
  inactivite.progres(7, { kind: "ci", by: "agent", at: at(0) });
  await inactivite.passer([{ number: 7, state: "set aside" }, { number: 8, state: "WAITING" }]);
  avancer(30);
  await inactivite.passer([{ number: 7, state: "set aside" }, { number: 8, state: "WAITING" }]);
  assert.deepEqual(commentaires, [
    {
      ticket: 7,
      corps: `${MARQUE_D_INACTIVITE} since=${at(0)} -->\n**Supervisor** — woke because #7 (set aside) has made no progress for 30 minutes or more: no new commit, CI result, review verdict or label change by an agent. Last progress: a CI result, ${at(0)}.`,
    },
    {
      ticket: 8,
      corps: `${MARQUE_D_INACTIVITE} since=${at(0)} -->\n**Supervisor** — woke because #8 (WAITING) has made no progress for 30 minutes or more: no new commit, CI result, review verdict or label change by an agent. No progress seen since ${at(0)}, when the station first saw it WAITING.`,
    },
  ]);
});

test("a progress whose date does not read counts from the moment it is seen", async () => {
  const { inactivite, reveils, avancer } = monter();
  avancer(10);
  inactivite.progres(7, { kind: "review", by: "agent", at: "not a date" });
  avancer(29);
  await inactivite.passer([{ number: 7, state: "in pass" }]);
  assert.equal(reveils.length, 0);
  avancer(1);
  await inactivite.passer([{ number: 7, state: "in pass" }]);
  assert.deepEqual(reveils.map(({ since }) => since), [at(10)]);
});
