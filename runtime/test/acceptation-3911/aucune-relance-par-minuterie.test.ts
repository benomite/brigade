// #3911, criterion 6: no timer, scheduler or periodic job puts a set-aside ticket back on the rail. The station
// turn used to heal a set-aside ticket whose reason a cook can fix (here a PR in conflict with the base) by
// relaunching it. A set-aside ticket now stays off the rail, turn after turn, after the former relaunch delay
// (a day here) has elapsed: only the supervisor acts on it. Since #4129 the station parks it instead (`parked`, its
// marker saying it waits for the supervisor for its failures): it stays parked the same way, until its date.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { corpsDuParking } from "../../src/attente-github/marque.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";
import { estParque, LABEL_PARKED } from "../../src/github-etat/etats.ts";

const JOUR_MS = 24 * 60 * 60_000;
const TICKET = 10;

function station() {
  const faux = new FauxGitHub();
  let instant = Date.parse("2026-11-20T10:00:00Z");
  const nom = "box/claude";
  const bas = faux.pour(nom);
  const github: GitHubDuTour = { ...bas, issue: fauxClient(faux, nom).issue };
  const tour = stationGitHub({
    nom,
    places: 1,
    base: "trunk",
    github,
    prise: faux.prise(github, nom),
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: nom, issue: ticket.number });
      return { branche: brancheDuTicket(ticket.number) };
    },
    juger: async () => ({ verdict: "approve", motif: "" }),
    jugerEnSecond: async () => ({ verdict: "approve", motif: "" }),
    avertir: () => {},
    maintenant: () => new Date(instant),
  });
  const passer = async () => {
    await tour.tour();
    await tour.calme();
    await tour.relu();
  };
  return { faux, passer, avancer: (ms: number) => (instant += ms) };
}

// Since #4260 nothing sets `set-aside:failures` any more; a ticket that still carries it from before is parked (a
// waiting label of before parked): it stays off the rail the same way.
test("a ticket set aside for its failures, whose PR conflicts with the base, stays off the rail after the relaunch delay has elapsed", async () => {
  const { faux, passer, avancer } = station();
  faux.feu(TICKET, [...CALIBRE, "set-aside:failures"]);
  faux.prs.push({ number: 100 + TICKET, issue: TICKET, branche: brancheDuTicket(TICKET), sha: faux.sha(), state: "open", merged: false, enRetard: false, enConflit: true, conflitDeContenu: true, mergeePar: null, fichiers: [] });
  await passer();
  avancer(JOUR_MS);
  await passer();
  avancer(JOUR_MS);
  await passer();
  assert.deepEqual(faux.cuissons, []);
  assert.ok(estParque([...faux.ticket(TICKET).labels]), "still parked by its label of before");
  assert.ok(faux.ticket(TICKET).labels.has("set-aside:failures"), "still set aside");
  const relances = (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.includes("brigade:relance"));
  assert.deepEqual(relances, []);
});

test("a ticket parked for its failures, whose PR conflicts with the base, stays parked after the former relaunch delay has elapsed", async () => {
  const { faux, passer, avancer } = station();
  faux.feu(TICKET, [...CALIBRE, LABEL_PARKED]);
  // La marque que la station pose en le parquant par ses échecs (`parquerSesEchecs`) : sept jours plus loin.
  faux.poster(TICKET, "box/claude", corpsDuParking({ what: "its cooks failed too many times, the station stopped relaunching it. The reason: conflict", who: "the supervisor", followUp: "2026-11-27T10:00:00.000Z", failures: true }));
  faux.prs.push({ number: 100 + TICKET, issue: TICKET, branche: brancheDuTicket(TICKET), sha: faux.sha(), state: "open", merged: false, enRetard: false, enConflit: true, conflitDeContenu: true, mergeePar: null, fichiers: [] });
  await passer();
  avancer(JOUR_MS);
  await passer();
  avancer(JOUR_MS);
  await passer();
  assert.deepEqual(faux.cuissons, []);
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_PARKED), "still parked");
  const relances = (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.includes("brigade:relance") || c.body.includes("Unparked"));
  assert.deepEqual(relances, []);
});

test("the station's healing turn has no relaunch path left: it no longer imports the relaunch of a set-aside ticket", () => {
  const guerison = readFileSync(join(import.meta.dirname, "../../src/guerison/index.ts"), "utf8");
  assert.doesNotMatch(guerison, /from "\.\/relance\.ts"/);
});
