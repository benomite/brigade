// #4044 : les lignes de la lecture de l'ordre que les autres tests laissaient passer — pagination, recouvrement, auto-dépendance, entrée en pass.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brancheDuTicket, clientDuTour } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { lireLOrdreDuRail } from "../../src/ordre-de-merge/lecture.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

describe("lireLOrdreDuRail : ce qu'elle lit", () => {
  const T = (n: number) => `2026-11-23T09:${String(n).padStart(2, "0")}:00Z`;
  const tourne = async (nombrePrs: number) => {
    const appels: string[] = [];
    const lire = async (chemin: string): Promise<unknown> => {
      appels.push(chemin);
      if (/\/pulls\?/.test(chemin)) {
        const page = Number(/&page=(\d+)/.exec(chemin)?.[1]);
        return Array.from({ length: Math.max(0, Math.min(100, nombrePrs - (page - 1) * 100)) }, (_, i) => ({ number: 100 + (page - 1) * 100 + i, head: { ref: `cook/${(page - 1) * 100 + i + 1}-github` } }));
      }
      if (/\/pulls\/\d+\/files/.test(chemin)) return [{ filename: Number(/pulls\/(\d+)/.exec(chemin)?.[1]) <= 101 ? "a.ts" : "z.ts" }];
      if (/\/issues\/(\d+)\/events/.test(chemin)) return [{ event: "labeled", label: { name: "in-pass" }, created_at: T(Number(/issues\/(\d+)/.exec(chemin)?.[1]) % 60) }];
      return [];
    };
    const ordre = await lireLOrdreDuRail({ depot: "o/r", lire, declarees: new Map(), enPass: [1, 2, 3] });
    return { appels, ordre };
  };

  test("a short page is the last one: no page is asked for after it", async () => {
    const { appels } = await tourne(3);
    assert.equal(appels.filter((a) => /\/pulls\?/.test(a)).length, 1);
  });

  test("a full page is followed by the next one", async () => {
    const { appels } = await tourne(100);
    assert.equal(appels.filter((a) => /\/pulls\?/.test(a)).length, 2);
  });

  test("the pass entry is read only for the tickets that share a file with another", async () => {
    const { appels, ordre } = await tourne(3);
    const evenements = appels.filter((a) => /\/events/.test(a)).map((a) => Number(/issues\/(\d+)/.exec(a)?.[1])).sort();
    assert.deepEqual(evenements, [1, 2]);
    assert.deepEqual([...ordre], [[2, [1]]]);
  });
});

test("the pass entry of a ticket is the time its in-pass label was set, read through the client of the round", async () => {
  const evenements = async () => [null, "x", { event: "labeled", label: { name: LABEL_IN_PASS }, created_at: "2026-11-23T09:05:00Z" }];
  const client = clientDuTour({ ...fauxClient(new FauxGitHub()), evenements } as unknown as Parameters<typeof clientDuTour>[0], "main");
  assert.equal(await client.entreeEnPass?.(7), "2026-11-23T09:05:00Z");
});

describe("a declared dependency in pass", () => {
  const tours = async (faux: FauxGitHub, n: number, apres?: () => void) => {
    const a = faux.station("A", { places: 3, avertir: () => {} });
    for (let i = 0; i < n; i += 1) {
      await a.tour();
      await a.calme();
      apres?.();
    }
  };
  const livre = (faux: FauxGitHub, ticket: number, corps: string) => {
    faux.feu(ticket, [...CALIBRE, LABEL_IN_PASS], corps);
    const sha = faux.sha();
    const pr = { number: 1000 + ticket, issue: ticket, branche: brancheDuTicket(ticket), sha, state: "open" as const, merged: false, enRetard: false, mergeePar: null, fichiers: [`f${ticket}.ts`] };
    faux.prs.push(pr);
    faux.poster(pr.number, "A", `<!-- brigade:verdict station=A verdict=approve sha=${sha} -->\nApproved by station \`A\`.`);
  };

  test("is held while the ticket it depends on is open", async () => {
    const faux = new FauxGitHub();
    faux.feu(1, [...CALIBRE, "taken"]);
    livre(faux, 2, "Depends on #1");
    await tours(faux, 4, () => assert.equal(faux.mergee(2), undefined));
  });

  test("a ticket that names itself as its own dependency is not held by it", async () => {
    const faux = new FauxGitHub();
    livre(faux, 2, "Depends on #2");
    await tours(faux, 4);
    assert.equal(faux.mergee(2)?.mergeePar, "A");
  });
});
