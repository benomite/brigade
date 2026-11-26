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

test("an open PR at the pass, or updated within the stale delay, still holds its zone: the ticket is skipped", async () => {
  // Mise à jour il y a 11 h : vivante.
  const recente = new FauxGitHub();
  const pr = recente.prOuverte([ZONE], "second/readme-lien-releases");
  pr.number = 4077;
  montrer(recente, pr, { age: 11 });
  const premier = await essayer(recente);
  assert.ok(tenue(premier.sauts), "a PR updated 11 h ago holds the zone");
  assert.ok(!premier.cuit);
  assert.ok(premier.sauts.some((ligne) => ligne.startsWith("#61 ") && ligne.includes("4077")), `the skip names the PR: ${premier.sauts.join("\\n")}`);

  // Au pass, même sans activité depuis des jours : vivante.
  const enPass = new FauxGitHub();
  enPass.feu(70, [...CALIBRE.filter((l) => l !== "fire"), LABEL_IN_PASS], "the ticket's body");
  const livraison = enPass.prOuverte([ZONE], "cook/70-abcdef01");
  livraison.issue = 70;
  montrer(enPass, livraison, { age: 72 });
  const second = await essayer(enPass);
  assert.ok(tenue(second.sauts), "a PR at the pass holds the zone however old");
  assert.ok(!second.cuit);
  assert.ok(second.sauts.some((ligne) => ligne.startsWith("#61 ") && ligne.includes(String(livraison.number))), `the skip names the PR: ${second.sauts.join("\\n")}`);
});
