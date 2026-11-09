// La dernière bonne lecture de GitHub, servie avec son âge quand GitHub refuse
// la suivante (#3005) : la mémoire seule, puis le rail d'un projet lu par le
// `gh` de l'ordinateur (`rail-du-projet.ts`), tel que l'app le lit.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../src/appairage/canal.ts";
import { FICHIER_APPAIRAGE } from "../src/appairage/document.ts";
import { FICHIER_LOCAL, tenirPresence } from "../src/appairage/presence.ts";
import { lireLeRailDuProjet } from "../src/appairage/rail-du-projet.ts";
import type { RailsPublies } from "../src/appairage/rail-publie.ts";
import { tenirDernieresLectures } from "../src/derniere-lecture-github.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";
import { FAUX_GH_GISTS as FAUX_GH } from "./appairage/doublure-des-gists.ts";

const rienNeReste = temporaireDuFichier();

// Une horloge que le test avance lui-même.
function uneHorloge(depart: string) {
  let instant = Date.parse(depart);
  return { maintenant: () => new Date(instant), avancer: (ms: number) => void (instant += ms) };
}

const REFUS = { status: 429, message: "API rate limit exceeded" };

test("une bonne lecture, puis un refus : la bonne lecture est servie, stale, lue à l'heure de la bonne lecture", () => {
  const horloge = uneHorloge("2026-11-09T09:00:00.000Z");
  const dernieres = tenirDernieresLectures<string[], typeof REFUS>({ maintenant: horloge.maintenant });
  assert.deepEqual(dernieres.reussie("brigade", ["#14", "#15"]), { reading: ["#14", "#15"], readAt: "2026-11-09T09:00:00.000Z", stale: false });
  horloge.avancer(5 * 60_000);
  assert.deepEqual(dernieres.refusee("brigade", REFUS), { reading: ["#14", "#15"], readAt: "2026-11-09T09:00:00.000Z", stale: true, refusal: REFUS });
  // Un second refus sert toujours la même, du même âge.
  horloge.avancer(60_000);
  assert.deepEqual(dernieres.refusee("brigade", REFUS), { reading: ["#14", "#15"], readAt: "2026-11-09T09:00:00.000Z", stale: true, refusal: REFUS });
});

test("un refus avant toute bonne lecture rend le refus, sans lecture", () => {
  const dernieres = tenirDernieresLectures<string[], typeof REFUS>();
  const servie = dernieres.refusee("brigade", REFUS);
  assert.deepEqual(servie, { reading: null, refusal: REFUS });
  assert.ok(!("stale" in servie) && !("readAt" in servie));
});

test("une bonne lecture après un refus lève stale et avance readAt", () => {
  const horloge = uneHorloge("2026-11-09T09:00:00.000Z");
  const dernieres = tenirDernieresLectures<string[], typeof REFUS>({ maintenant: horloge.maintenant });
  dernieres.reussie("brigade", ["#14"]);
  horloge.avancer(60_000);
  assert.equal(dernieres.refusee("brigade", REFUS).reading?.length, 1);
  horloge.avancer(60_000);
  assert.deepEqual(dernieres.reussie("brigade", ["#14", "#16"]), { reading: ["#14", "#16"], readAt: "2026-11-09T09:02:00.000Z", stale: false });
  // Le refus suivant sert la nouvelle, à sa nouvelle heure.
  horloge.avancer(60_000);
  assert.deepEqual(dernieres.refusee("brigade", REFUS), { reading: ["#14", "#16"], readAt: "2026-11-09T09:02:00.000Z", stale: true, refusal: REFUS });
});

test("les lectures de deux projets ne s'écrasent jamais", () => {
  const horloge = uneHorloge("2026-11-09T09:00:00.000Z");
  const dernieres = tenirDernieresLectures<string[], typeof REFUS>({ maintenant: horloge.maintenant });
  dernieres.reussie("brigade", ["#14"]);
  horloge.avancer(60_000);
  dernieres.reussie("acme/shop", ["#3"]);
  horloge.avancer(60_000);
  assert.deepEqual(dernieres.refusee("brigade", REFUS), { reading: ["#14"], readAt: "2026-11-09T09:00:00.000Z", stale: true, refusal: REFUS });
  assert.deepEqual(dernieres.refusee("acme/shop", REFUS), { reading: ["#3"], readAt: "2026-11-09T09:01:00.000Z", stale: true, refusal: REFUS });
  // Un projet jamais lu n'emprunte la lecture d'aucun autre.
  assert.deepEqual(dernieres.refusee("espace", REFUS), { reading: null, refusal: REFUS });
});

type Panne = "panne" | "limite";

// GitHub : un répertoire où la doublure de `gh` range les gists du compte, et
// une station appairée qui y publie le rail de ses projets.
async function unGitHubEtSaStation(t: TestContext, rails: RailsPublies) {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const racine = join(repertoireTemporaire(t), "shop-box");
  mkdirSync(racine);
  const presence = tenirPresence({
    racine,
    canal: canalGitHub({ gh: FAUX_GH }),
    identite: { nom: "shop-box", machine: "Linux", version: "1" },
    projets: () => Object.keys(rails),
    depots: () => Object.fromEntries(Object.keys(rails).map((projet) => [projet, `acme/${projet}`])),
    rails: () => rails,
    dire: () => {},
    apres: () => () => {},
  });
  aArreter(t, () => presence.arreter());
  await presence.publier();
  const { gist } = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist: string };
  const fichier = join(repertoire, `${gist}.gist.json`);
  const document = JSON.parse(readFileSync(fichier, "utf8")) as { files: Record<string, { filename: string; content: string }> };
  document.files[FICHIER_APPAIRAGE] = { filename: FICHIER_APPAIRAGE, content: JSON.stringify({ appaireeLe: new Date().toISOString(), empreinte: "e" }) };
  writeFileSync(fichier, JSON.stringify(document));
  return {
    tomber: (comment: Panne) => writeFileSync(join(repertoire, comment), ""),
    relever: (comment: Panne) => rmSync(join(repertoire, comment)),
    lire: (project: string, gh = FAUX_GH) => lireLeRailDuProjet({ gh, env: { PATH: process.env.PATH ?? "", FAUX_GISTS: repertoire }, project }),
    sansGh: join(repertoire, "pas-de-gh"),
  };
}

test("le rail d'un projet, lu par l'app : GitHub qui refuse sert le dernier rail lu, avec son heure ; jamais lu, le refus est dit comme avant", async (t) => {
  const github = await unGitHubEtSaStation(t, {
    brigade: [{ ticket: 14, etat: "pris", titre: "Quatorze", url: "https://github.com/acme/brigade/issues/14" }],
    espace: [{ ticket: 3, etat: "en attente", titre: "Trois", url: "https://github.com/acme/espace/issues/3" }],
  });

  // Sous la limite, avant toute lecture d'`espace` : le refus, sans rail.
  github.tomber("limite");
  const jamaisLu = await github.lire("espace");
  assert.ok(jamaisLu.state === "unavailable");
  assert.equal(jamaisLu.cause, "rate-limit");
  assert.ok(!("tickets" in jamaisLu));
  github.relever("limite");

  const avant = Date.now();
  const bon = await github.lire("brigade");
  assert.ok(bon.state === "listed");
  assert.ok(!("stale" in bon));
  const apres = Date.now();

  for (const panne of ["limite", "panne"] as const) {
    github.tomber(panne);
    const servi = await github.lire("brigade");
    github.relever(panne);
    assert.ok(servi.state === "listed" && "stale" in servi, JSON.stringify(servi));
    assert.deepEqual(servi.tickets, bon.tickets);
    assert.equal(servi.stale, true);
    const lueA = Date.parse(servi.readAt ?? "");
    assert.ok(lueA >= avant && lueA <= apres, String(servi.readAt));
    assert.equal(servi.refusal?.cause, panne === "limite" ? "rate-limit" : "network");
    // Le rail d'`espace`, jamais lu, ne prend pas celui de `brigade`.
    github.tomber(panne);
    const autre = await github.lire("espace");
    github.relever(panne);
    assert.equal(autre.state, "unavailable");
  }

  // Ce qui n'est pas un refus de GitHub — pas de `gh` ici — se dit comme avant.
  const sansGh = await github.lire("brigade", github.sansGh);
  assert.ok(sansGh.state === "unavailable");
  assert.equal(sansGh.cause, "gh-missing");

  // GitHub répond de nouveau : le rail frais, sans stale.
  const relu = await github.lire("brigade");
  assert.ok(relu.state === "listed");
  assert.ok(!("stale" in relu) && !("readAt" in relu) && !("refusal" in relu));
});

test("derniere-lecture-github.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
