// Ce que la cuisine lit d'une attente dans les mots d'un cook, et le retour à la relance (#3814) : ce qui n'en est pas une
// va au manager comme avant, une attente posée par le chef ne sort pas seule, des commentaires illisibles ne lèvent rien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import { lireAttenteDuCook, mettreEnAttenteParLaCuisine, ramenerALaRelance } from "../../src/attente/attente-par-le-cook.ts";
import type { GitHubDuTour, TicketLu } from "../../src/brigade-github.ts";
import { suivreLeTour } from "../../src/retenue/tour.ts";

const MAINTENANT = new Date("2026-11-18T09:00:00Z");

test("a technical block, a past date, or a third party never named as outside the kitchen is not a wait: it goes to the manager as before", () => {
  assert.equal(lireAttenteDuCook("The HTTP client has not sent the header, the test hangs: which timeout do I use?", MAINTENANT), null);
  assert.equal(lireAttenteDuCook("Too early: this cannot be done before 2026-11-10.", MAINTENANT), null);
  assert.equal(lireAttenteDuCook("The migration ran on 2026-11-25 in the fixture, and the test is red: is it the fixture or the code?", MAINTENANT), null);
  assert.equal(lireAttenteDuCook("Which colour does the chef want for the button?", MAINTENANT), null);
});

test("a date with no one named: the wait says the calendar, and the follow-up is that date", () => {
  const attente = lireAttenteDuCook("Not before 2026-12-01: the feature flag only opens that day.", MAINTENANT);
  assert.deepEqual(attente, { what: "Not before 2026-12-01: the feature flag only opens that day", who: "the calendar: not before 2026-12-01", followUp: "2026-12-01T00:00:00.000Z", backOnFollowUp: true });
});

// Un faux GitHub qui tient les commentaires et les gestes de chaque issue.
function faux(commentaires: Record<number, string[] | Error>) {
  const gestes: string[] = [];
  return {
    gestes,
    github: {
      commentaires: async (numero: number) => {
        const lus = commentaires[numero] ?? [];
        if (lus instanceof Error) throw lus;
        return lus.map((body) => ({ body, association: "OWNER" }));
      },
      labelliser: async (numero: number, labels: string[]) => void gestes.push(`#${numero} +${labels.join(",")}`),
      delabelliser: async (numero: number, label: string) => void gestes.push(`#${numero} -${label}`),
      commenter: async (numero: number, corps: string) => void gestes.push(`#${numero} ${corps.split("\n")[0]}`),
    },
  };
}

test("on its follow-up date only a wait the kitchen set comes back; the chef's stays, one before its date stays, and unreadable comments leave the ticket in WAITING and say so", async () => {
  const relance = "2026-11-17T00:00:00.000Z";
  const { github, gestes } = faux({
    1: [corpsDeLAttente({ what: "the client's API", who: "the client", followUp: relance, backOnFollowUp: true })],
    2: [corpsDeLAttente({ what: "the lawyer's answer", who: "the lawyer", followUp: relance })],
    3: [corpsDeLAttente({ what: "the client's API", who: "the client", followUp: "2026-11-25T00:00:00.000Z", backOnFollowUp: true })],
    4: new Error("HTTP 502"),
  });
  const dits: string[] = [];
  const tickets = [1, 2, 3, 4].map((number) => ({ number, labels: ["waiting", "model:opus", "effort:medium"] }));
  const rentres = await ramenerALaRelance(github, tickets, { station: "box", maintenant: MAINTENANT, avertir: (ligne) => dits.push(ligne) });
  assert.deepEqual(rentres, [1]);
  assert.deepEqual(gestes.slice(0, 2), ["#1 +fire", "#1 -waiting"]);
  assert.match(gestes[2] ?? "", /^#1 \*\*WAITING lifted — follow-up date reached\*\*/);
  assert.equal(gestes.length, 3);
  assert.ok(dits.some((ligne) => /#4 .*could not be read .*HTTP 502/.test(ligne)), dits.join("\n"));
});

test("the hold line of a WAITING ticket whose comments cannot be read says so, and invents nothing", async () => {
  const suivi = suivreLeTour(() => MAINTENANT);
  const ticket = (number: number, ...labels: string[]): TicketLu => ({ number, title: `Ticket ${number}`, labels: ["fire", "model:opus", "effort:medium", ...labels], state: "open" });
  const github = suivi.envelopper({
    fires: async () => [ticket(30), ticket(31, "waiting")],
    commentaires: async () => {
      throw new Error("HTTP 502");
    },
  } as unknown as GitHubDuTour);
  await github.fires();
  const explications = suivi.vue().explications ?? [];
  assert.deepEqual(explications, ["#31 is in WAITING, carries `waiting`, but its comments could not be read to say what it waits for (HTTP 502)"]);
});

test("what the cook said is the sentence that says the date, and a third party's wait says what it waits for: no date, a week, and back on the rail on its own", () => {
  assert.equal(lireAttenteDuCook("The sale page needs the live prices. They are published on 2026-11-25, not before.", MAINTENANT)?.what, "They are published on 2026-11-25, not before");
  assert.deepEqual(lireAttenteDuCook("The checkout page is ready to build. Waiting for the client's production API key: nothing in the kitchen can produce it.", MAINTENANT), {
    what: "Waiting for the client's production API key: nothing in the kitchen can produce it",
    who: "the client's production API key",
    followUp: "2026-11-25T09:00:00.000Z",
    backOnFollowUp: true,
  });
});

test("the WAITING the kitchen sets says the ticket goes back on the rail on its own and holds no zone; the chef's says neither", async () => {
  const { github, gestes } = faux({});
  const corps: string[] = [];
  await mettreEnAttenteParLaCuisine({ ...github, commenter: async (_numero, texte) => void corps.push(texte) }, 9, { what: "Too early", who: "the calendar", followUp: "2026-11-25T00:00:00.000Z", backOnFollowUp: true }, { station: "box", mots: "Too early." });
  assert.deepEqual(gestes, ["#9 +waiting"]);
  assert.match(corps[0] ?? "", /it holds no file zone .*On its follow-up date it goes back on the rail on its own/);
  assert.match(corps[0] ?? "", /Set by station `box`, from what the cook said:\n\n> Too early\./);
  assert.doesNotMatch(corpsDeLAttente({ what: "the lawyer's answer", who: "the lawyer", followUp: "2026-11-25T00:00:00.000Z" }), /on its own|file zone/);
});

test("one turn reads the comments of a WAITING ticket once: the hold line and the follow-up return share that read", async () => {
  const suivi = suivreLeTour(() => MAINTENANT);
  const lectures: number[] = [];
  const corps = corpsDeLAttente({ what: "the client's API", who: "the client", followUp: "2026-11-17T00:00:00.000Z", backOnFollowUp: true });
  const { github: gestes } = faux({});
  const github = suivi.envelopper({
    ...gestes,
    fires: async () => [{ number: 31, title: "Ticket 31", labels: ["fire", "waiting", "model:opus", "effort:medium"], state: "open" }],
    commentaires: async (numero: number) => (lectures.push(numero), [{ body: corps, author: "brigade", association: "OWNER", createdAt: "2026-11-10T00:00:00Z" }]),
  } as unknown as GitHubDuTour);
  const fires = await github.fires();
  const rentres = await ramenerALaRelance(github, fires, { station: "box", maintenant: MAINTENANT, avertir: () => {} });
  assert.deepEqual(rentres, [31]);
  assert.deepEqual(lectures, [31]);
  await github.commentaires(31);
  assert.deepEqual(lectures, [31, 31], "after this turn's shared read, a reading goes to GitHub again");
});
