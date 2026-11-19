// Les 11 tickets récents de BOBL-tech/mirrorlab dont la mesure a alerté (#3891) :
// l'attente d'une prise de #729 et #745 n'est plus de plus de 1000 min, et le
// temps perdu de chaque ticket ne change pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mesurer, type DepotDuTicket, type Marque } from "../../src/temps-ticket/mesure.ts";

type Fait = DepotDuTicket["faits"] extends readonly (infer F)[] | undefined ? F : never;
const prise = (at: string): Fait => ({ quoi: "prise", at });
const rendu = (at: string): Fait => ({ quoi: "rendu", at });
const renvoi = (at: string): Fait => ({ quoi: "renvoi", at });

type Ticket = {
  n: number;
  filed: string;
  fire: string;
  faits: Fait[];
  // Le début du cook qui a livré, quand c'est plus tard que la première prise.
  livre?: string;
  merged: string;
  perduMin: number; // le temps perdu que la station a mesuré, en minutes
  attenteMin: number; // l'attente d'une prise attendue, en minutes
};

const TICKETS: Ticket[] = [
  { n: 737, filed: "2026-11-12T16:16:26Z", fire: "2026-11-12T16:17:32Z", faits: [prise("2026-11-12T16:17:51Z")], merged: "2026-11-12T16:23:28Z", perduMin: 1.4, attenteMin: 0.3 },
  { n: 735, filed: "2026-11-12T16:16:22Z", fire: "2026-11-12T16:17:02Z", faits: [prise("2026-11-12T16:17:14Z")], merged: "2026-11-12T16:32:29Z", perduMin: 0.9, attenteMin: 0.2 },
  {
    n: 745,
    filed: "2026-11-12T16:34:52Z",
    fire: "2026-11-12T16:34:54Z",
    faits: [
      prise("2026-11-12T16:36:03Z"),
      renvoi("2026-11-12T16:44:00Z"),
      prise("2026-11-12T16:47:00Z"),
      renvoi("2026-11-12T17:00:00Z"),
      prise("2026-11-12T17:04:00Z"),
      rendu("2026-11-12T17:45:00Z"),
      prise("2026-11-13T11:09:58Z"),
    ],
    livre: "2026-11-13T11:09:58Z",
    merged: "2026-11-13T11:17:30Z",
    perduMin: 1115.1,
    attenteMin: 1.2,
  },
  { n: 754, filed: "2026-11-13T11:21:33Z", fire: "2026-11-13T11:22:36Z", faits: [prise("2026-11-13T11:23:14Z")], merged: "2026-11-13T11:29:34Z", perduMin: 1.7, attenteMin: 0.6 },
  {
    n: 729,
    filed: "2026-11-12T15:28:01Z",
    fire: "2026-11-12T15:28:37Z",
    faits: [
      prise("2026-11-12T15:29:18Z"),
      rendu("2026-11-12T15:40:00Z"),
      prise("2026-11-12T16:30:00Z"),
      rendu("2026-11-12T16:50:00Z"),
      prise("2026-11-12T17:10:00Z"),
      rendu("2026-11-12T17:20:00Z"),
      prise("2026-11-12T18:00:00Z"),
      rendu("2026-11-12T18:15:00Z"),
      prise("2026-11-12T19:00:00Z"),
      rendu("2026-11-12T19:09:00Z"),
      prise("2026-11-13T11:25:01Z"),
    ],
    livre: "2026-11-13T11:25:01Z",
    merged: "2026-11-13T11:31:20Z",
    perduMin: 1197,
    attenteMin: 0.7,
  },
  { n: 756, filed: "2026-11-13T11:22:47Z", fire: "2026-11-13T11:22:49Z", faits: [prise("2026-11-13T11:25:27Z")], merged: "2026-11-13T11:46:24Z", perduMin: 2.7, attenteMin: 2.6 },
  { n: 762, filed: "2026-11-13T11:37:25Z", fire: "2026-11-13T11:37:28Z", faits: [prise("2026-11-13T11:40:49Z")], merged: "2026-11-13T11:46:27Z", perduMin: 3.4, attenteMin: 3.4 },
  {
    n: 753,
    filed: "2026-11-13T11:17:12Z",
    fire: "2026-11-13T11:18:27Z",
    faits: [
      prise("2026-11-13T11:19:07Z"),
      renvoi("2026-11-13T11:30:00Z"),
      prise("2026-11-13T11:31:00Z"),
      rendu("2026-11-13T11:36:00Z"),
      prise("2026-11-13T11:38:00Z"),
      rendu("2026-11-13T11:41:00Z"),
      prise("2026-11-13T11:44:18Z"),
    ],
    livre: "2026-11-13T11:44:18Z",
    merged: "2026-11-13T11:49:48Z",
    perduMin: 27.1,
    attenteMin: 3.3,
  },
  { n: 767, filed: "2026-11-13T13:10:47Z", fire: "2026-11-13T13:10:50Z", faits: [prise("2026-11-13T13:11:53Z")], merged: "2026-11-13T13:20:25Z", perduMin: 1.1, attenteMin: 1.1 },
  {
    n: 766,
    filed: "2026-11-13T13:07:05Z",
    fire: "2026-11-13T13:07:08Z",
    faits: [prise("2026-11-13T13:09:52Z"), renvoi("2026-11-13T13:15:00Z"), prise("2026-11-13T13:23:29Z")],
    livre: "2026-11-13T13:23:29Z",
    merged: "2026-11-13T13:31:36Z",
    perduMin: 16.4,
    attenteMin: 2.7,
  },
  { n: 771, filed: "2026-11-13T15:48:39Z", fire: "2026-11-13T15:48:42Z", faits: [prise("2026-11-13T15:49:46Z")], merged: "2026-11-13T16:12:03Z", perduMin: 1.1, attenteMin: 1.1 },
];

const mesure = (t: Ticket) => {
  const debut = t.livre ?? (t.faits[0]?.at as string);
  const plus = (s: number) => new Date(Date.parse(debut) + s * 1000).toISOString();
  const marques: Marque[] = [
    { etape: "cuisson", at: plus(3) },
    { etape: "attentePasse", at: plus(120) },
  ];
  return mesurer({ ticket: t.n, marques, testsMs: 0 }, t.merged, { deposeAt: t.filed, fireAt: t.fire, priseAt: t.faits[0]?.at, faits: t.faits });
};

describe("the 11 tickets of the lost-time alert (#3891)", () => {
  test("the claim wait of #729 and #745 is no longer in the 1000+ min range", () => {
    for (const n of [729, 745]) {
      const t = mesure(TICKETS.find((x) => x.n === n) as Ticket);
      assert.ok((t.attentePrise ?? 0) < 1000 * 60, `#${n}: claim wait ${((t.attentePrise ?? 0) / 60).toFixed(1)} min`);
    }
  });

  for (const ticket of TICKETS) {
    test(`#${ticket.n}: the lost time is unchanged by the re-attribution`, () => {
      const perdu = mesure(ticket).perdu;
      assert.ok(perdu !== undefined);
      const total = (perdu.attente + perdu.ratees + perdu.renvois) / 60;
      assert.ok(Math.abs(total - ticket.perduMin) <= 0.15, `#${ticket.n}: lost ${total.toFixed(2)} min, measured ${ticket.perduMin}`);
    });
  }

  test("the typical claim waits (1 to 3 min) stay claim waits", () => {
    for (const ticket of TICKETS.filter((x) => [756, 762, 766, 771, 767].includes(x.n))) {
      const attente = (mesure(ticket).attentePrise ?? 0) / 60;
      assert.ok(Math.abs(attente - ticket.attenteMin) <= 0.1, `#${ticket.n}: claim wait ${attente.toFixed(2)} min, expected ${ticket.attenteMin}`);
    }
  });
});
