// #4242 : la porte de prise — une PR ouverte ne tient une zone que tant qu'elle est vivante.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { FauxGitHub } from "../faux-github.ts";

const CALIBRE = ["fire", "model:sonnet", "effort:medium"];
const ZONE = "README.md";
const HEURE = 3_600_000;
const MAINTENANT = new Date("2026-11-25T12:00:00Z");
const corps = `Epic: #4204\n\n## Context\n\nwhatever\n\n## Zone\n\n- \`${ZONE}\`\n\n## Acceptance\n\n- done\n`;
const il_y_a = (heures: number): string => new Date(MAINTENANT.getTime() - heures * HEURE).toISOString();

// La PR ouverte, avec ce que la porte doit lire d'elle : sa dernière activité, ses labels, et si la base la contient déjà.
function montrer(faux: FauxGitHub, pr: { number: number }, extra: { age?: number; labels?: string[]; surLaBase?: boolean }): void {
  const origine = faux.pour.bind(faux);
  faux.pour = (station: string) => {
    const github = origine(station);
    return {
      ...github,
      prsOuvertes: async () =>
        (await github.prsOuvertes()).map((ouverte) =>
          ouverte.number !== pr.number
            ? ouverte
            : {
                ...ouverte,
                ...(extra.age === undefined ? {} : { updatedAt: il_y_a(extra.age), misAJourLe: il_y_a(extra.age), lastActivityAt: il_y_a(extra.age) }),
                ...(extra.labels === undefined ? {} : { labels: extra.labels, etiquettes: extra.labels }),
                ...(extra.surLaBase === undefined ? {} : { surLaBase: extra.surLaBase, dejaSurLaBase: extra.surLaBase, onBase: extra.surLaBase, mergedIntoBase: extra.surLaBase }),
              },
        ),
    } as ReturnType<FauxGitHub["pour"]>;
  };
}

async function essayer(faux: FauxGitHub): Promise<{ sauts: string[]; enregistrements: unknown[]; cuit: boolean }> {
  faux.feu(61, CALIBRE, corps);
  const sauts: string[] = [];
  const enregistrements: unknown[] = [];
  const a = faux.station("A", {
    places: 2,
    maintenant: () => MAINTENANT,
    sauter: (...args: unknown[]) => {
      sauts.push(String(args[1]));
      enregistrements.push(args);
    },
    cuisiner: async () => ({ echec: "not the point" }),
    avertir: () => {},
  });
  await a.tour();
  await a.calme();
  return { sauts, enregistrements, cuit: faux.cuissons.some((c) => c.issue === 61) };
}

const tenue = (sauts: string[]): boolean => sauts.some((ligne) => ligne.startsWith("#61 "));

test("a ticket skipped for a held zone shows one line with the PR number and the reason, and the skip record carries `zone-held` and the PR number", async () => {
  const faux = new FauxGitHub();
  const pr = faux.prOuverte([ZONE], "second/readme-lien-releases");
  pr.number = 4077;
  montrer(faux, pr, { age: 1 });
  const { sauts, enregistrements } = await essayer(faux);
  const lignes = sauts.filter((ligne) => ligne.startsWith("#61 "));
  assert.equal(lignes.length, 1, sauts.join("\n"));
  assert.ok(!lignes[0]!.trim().includes("\n"));
  assert.match(lignes[0]!, /4077/, "the line names the PR");
  assert.match(lignes[0]!, /zone/i, "the line gives the reason");
  const enregistrement = JSON.stringify(enregistrements);
  assert.ok(enregistrement.includes("zone-held"), enregistrement);
  assert.ok(enregistrement.includes("4077"), enregistrement);
});
