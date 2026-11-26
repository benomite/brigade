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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const source = (dossier: string): string[] => readdirSync(dossier).flatMap((nom) => (statSync(join(dossier, nom)).isDirectory() ? source(join(dossier, nom)) : nom.endsWith(".ts") ? [join(dossier, nom)] : []));

test("the stale delay is one named constant of 12 hours, and a PR 11 h 59 idle holds while one 12 h 01 idle does not", async () => {
  const racine = new URL("../../src", import.meta.url).pathname;
  const declarations = source(racine).flatMap((fichier) =>
    readFileSync(fichier, "utf8")
      .split("\n")
      .filter((ligne) => /\bconst\s+[A-Za-z_]*(STALE|PERIM|PÉRIM|VIVANT|ALIVE|OBSOLE|DORM|INACTI)[A-Za-z_]*\s*(:[^=]+)?=\s*(12\s*\*\s*(60\s*\*\s*60|3_?600)(_?000|\s*\*\s*1_?000)?|12\s*\*\s*HEURE|43_?200_?000)/i.test(ligne))
      .map((ligne) => `${fichier}: ${ligne.trim()}`),
  );
  assert.equal(declarations.length, 1, `exactly one named 12-hour constant: ${declarations.join(" | ")}`);

  const avant = new FauxGitHub();
  const a = avant.prOuverte([ZONE], "second/readme-lien-releases");
  a.number = 4077;
  montrer(avant, a, { age: 11.98 });
  const dedans = await essayer(avant);
  assert.ok(tenue(dedans.sauts) && !dedans.cuit, "11 h 59 idle: alive");

  const apres = new FauxGitHub();
  const b = apres.prOuverte([ZONE], "second/readme-lien-releases");
  b.number = 4077;
  montrer(apres, b, { age: 12.02 });
  const dehors = await essayer(apres);
  assert.ok(dehors.cuit && !tenue(dehors.sauts), "12 h 01 idle: stale");
});
