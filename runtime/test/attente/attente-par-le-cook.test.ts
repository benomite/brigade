// Ce que la cuisine lit d'une attente dans les mots d'un cook, et la reprise à la date (#3814, #4129) : ce qui n'en est pas
// une va au manager comme avant, un ticket parqué jusqu'à un fait ou pour le chef ne reprend pas seul, des commentaires
// illisibles ne déparquent rien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuParking } from "../../src/attente-github/attente-github.ts";
import { lireAttenteDuCook, mettreEnAttenteParLaCuisine, ramenerALaRelance } from "../../src/attente/attente-par-le-cook.ts";
import type { GitHubDuTour } from "../../src/brigade-github.ts";

const MAINTENANT = new Date("2026-11-18T09:00:00Z");

test("a technical block, a past date, or a third party never named as outside the kitchen is not a wait: it goes to the manager as before", () => {
  assert.equal(lireAttenteDuCook("The HTTP client has not sent the header, the test hangs: which timeout do I use?", MAINTENANT), null);
  assert.equal(lireAttenteDuCook("Too early: this cannot be done before 2026-11-10.", MAINTENANT), null);
  assert.equal(lireAttenteDuCook("The migration ran on 2026-11-25 in the fixture, and the test is red: is it the fixture or the code?", MAINTENANT), null);
  assert.equal(lireAttenteDuCook("Which colour does the chef want for the button?", MAINTENANT), null);
});

test("a date with no one named: the wait says the calendar, and the follow-up is that date", () => {
  const attente = lireAttenteDuCook("Not before 2026-12-01: the feature flag only opens that day.", MAINTENANT);
  assert.deepEqual(attente, { what: "Not before 2026-12-01: the feature flag only opens that day", who: "the calendar: not before 2026-12-01", followUp: "2026-12-01T00:00:00.000Z" });
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

test("on its date a ticket parked until that date resumes, where it was, and a chef's card parked for someone else goes back to TODO; one parked until a fact stays, one waiting for the chef stays, one before its date stays, and unreadable comments leave the ticket parked and say so", async () => {
  const relance = "2026-11-17T00:00:00.000Z";
  const { github, gestes } = faux({
    1: [corpsDuParking({ what: "the client's API", who: "the client", followUp: relance })],
    2: [corpsDuParking({ what: "the lawyer's answer", who: "the lawyer", followUp: relance, fact: "the lawyer answered" })],
    3: [corpsDuParking({ what: "the client's API", who: "the client", followUp: "2026-11-25T00:00:00.000Z" })],
    4: new Error("HTTP 502"),
    5: [corpsDuParking({ what: "which colour for the button", who: "the chef", followUp: relance })],
    6: [corpsDuParking({ what: "the designer's mockup", who: "the designer", followUp: relance })],
  });
  const dits: string[] = [];
  // Parqué en cuisson : `taken` reste, et aucun `fire` n'est posé — il reprend exactement où il était. Pour le chef,
  // `chef-todo` seul (#5) : aucune date ne l'en sort. Une carte du chef parquée pour un autre (#6) porte les deux.
  const labelsDe = (number: number) => (number === 5 ? ["chef-todo"] : number === 6 ? ["chef-todo", "parked"] : ["parked"]);
  const tickets = [1, 2, 3, 4, 5, 6].map((number) => ({ number, labels: [...labelsDe(number), "taken", "model:opus", "effort:medium"] }));
  const rentres = await ramenerALaRelance(github, tickets, { station: "box", maintenant: MAINTENANT, avertir: (ligne) => dits.push(ligne) });
  assert.deepEqual(rentres, [1, 6]);
  assert.equal(gestes[0], "#1 -parked");
  assert.match(gestes[1] ?? "", /^#1 \*\*Unparked — its date is reached\*\*: this ticket was waiting for the client \(“the client's API”\) until 2026-11-17 00:00 UTC\. Station `box` lets it resume exactly where it was\./);
  // La carte revient dans TODO : seul `parked` est retiré, `chef-todo` reste.
  assert.equal(gestes[2], "#6 -parked");
  assert.match(gestes[3] ?? "", /^#6 \*\*Unparked — its date is reached\*\*: this ticket was waiting for the designer \(“the designer's mockup”\) until 2026-11-17 00:00 UTC\./);
  assert.equal(gestes.length, 4, gestes.join("\n"));
  assert.ok(dits.some((ligne) => /#4 .*could not be read .*HTTP 502/.test(ligne)), dits.join("\n"));
});

test("what the cook said is the sentence that says the date, and a third party's wait says what it waits for: no date, a week, and it resumes on its own", () => {
  assert.equal(lireAttenteDuCook("The sale page needs the live prices. They are published on 2026-11-25, not before.", MAINTENANT)?.what, "They are published on 2026-11-25, not before");
  assert.deepEqual(lireAttenteDuCook("The checkout page is ready to build. Waiting for the client's production API key: nothing in the kitchen can produce it.", MAINTENANT), {
    what: "Waiting for the client's production API key: nothing in the kitchen can produce it",
    who: "the client's production API key",
    followUp: "2026-11-25T09:00:00.000Z",
  });
});

test("the parking the kitchen sets says nothing takes the ticket and it resumes where it was on its own on its date; one parked until a fact does not resume on its own", async () => {
  const { github, gestes } = faux({});
  const corps: string[] = [];
  await mettreEnAttenteParLaCuisine({ ...github, commenter: async (_numero, texte) => void corps.push(texte) }, 9, { what: "Too early", who: "the calendar", followUp: "2026-11-25T00:00:00.000Z" }, { station: "box", mots: "Too early." });
  assert.deepEqual(gestes, ["#9 +parked"]);
  assert.match(corps[0] ?? "", /^<!-- brigade:parked \{"what":"Too early","who":"the calendar","followUp":"2026-11-25T00:00:00.000Z"\} -->\n\*\*PARKED: waits for the calendar\.\*\* Too early/);
  assert.match(corps[0] ?? "", /nothing takes it: no station, no repair, no supervisor\. On 2026-11-25 00:00 UTC it resumes exactly where it was, on its own/);
  assert.match(corps[0] ?? "", /Parked by station `box`, from what the cook said:\n\n> Too early\./);
  assert.doesNotMatch(corpsDuParking({ what: "the lawyer's answer", who: "the lawyer", followUp: "2026-11-25T00:00:00.000Z", fact: "the lawyer answered" }), /on its own/);
});
