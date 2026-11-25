// #4227, critère 3 : deux plats prêts — la pass les sert l'un après l'autre : le second ne commence qu'une fois le premier avec son résultat.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const corps = (zone: string) => `## Context\n\nwhatever\n\n## Zone\n\n- \`${zone}\`\n\n## Acceptance\n\n- done\n`;
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
// Une étape de la pass dure : si elle en laisse une autre commencer, les deux se chevauchent.
const dure = () => new Promise<void>((fin) => setTimeout(fin, 40));

test("two dishes on disjoint zones are ready: the pass steps of the second begin only after those of the first have ended", async () => {
  const faux = new FauxGitHub();
  faux.feu(11, CALIBRE, corps("runtime/src/rail"));
  faux.feu(12, CALIBRE, corps("app/src"));
  const issueDe = (pr: number) => faux.prs.find((p) => p.number === pr)?.issue ?? 0;
  // Ce que la pass a fait, dans l'ordre : le début et la fin de chaque étape, par plat.
  const journal: string[] = [];
  const etape = async (nom: string, issue: number) => {
    journal.push(`start ${nom} ${issue}`);
    await dure();
    journal.push(`end ${nom} ${issue}`);
  };
  const station = faux.station("box", {
    places: 2,
    juger: async (_ticket, pr) => {
      await etape("review", issueDe(pr.number));
      return { verdict: "approve", motif: "" };
    },
    gates: async (ticket) => ({
      jouer: async () => {
        await etape("gates", ticket.number);
        return { vert: true, resume: "", detail: "" };
      },
      liberer: () => {},
    }),
    ciDesPR: () => false,
    avertir: () => {},
  });
  for (let tour = 0; tour < 10 && (faux.mergee(11) === undefined || faux.mergee(12) === undefined); tour += 1) {
    for (const pr of faux.prs) faux.sansCI.add(pr.number);
    await station.tour();
    await station.calme();
  }
  assert.ok(faux.mergee(11) !== undefined && faux.mergee(12) !== undefined, `both dishes are served: ${journal.join(", ")}`);
  const plats = journal.map((ligne) => Number(ligne.split(" ")[2]));
  const premier = plats[0];
  const dernierDuPremier = plats.lastIndexOf(premier ?? 0);
  const debutDuSecond = plats.findIndex((plat) => plat !== premier);
  assert.ok(debutDuSecond > dernierDuPremier, `the second dish started before the first had its result: ${journal.join(", ")}`);
});
