import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LECONS_INJECTEES_PAR_DEFAUT } from "../../../src/apprentissage/injection.ts";
import { environnementCook } from "../../../src/claude.ts";
import { contexteDuCook, pourGitHub, type SourcesDuContexte } from "../../../src/github-seul/contexte-cook/contexte-cook.ts";
import type { DefinitionDeProfil } from "../../../src/profils/definition.ts";
import { MARQUEUR } from "../../../src/fiche.ts";
import { ouvrirJournal, type Journal } from "../../../src/journal.ts";
import { cuisine, issue } from "../../aides/cuisine.ts";
import { BASE, DEPOT, jusqua, repertoireTemporaire } from "../../outils.ts";

const CLE = "sk_test_4eC39HqLyjWDarjtT1";
const BASE_DE_DEV = "postgres://dev:mot-de-passe@localhost:5432";
const DECLARES = "CLE_API\nDATABASE_URL\n";
const VALEURS = `CLE_API=${CLE}\nDATABASE_URL=${BASE_DE_DEV}\nAUTRE_PROJET=une-valeur-non-declaree\n`;
const LECON = "Un test attend un fait, jamais une durée.";

const VUE: DefinitionDeProfil = {
  name: "app-src-vue",
  zone: "app/src/vue",
  perimeter: ["app/src/vue"],
  skills: [],
  accepted: "2026-10-19",
  tickets: [1, 2, 3, 4, 5],
  notebook: { lessons: [{ id: "L-1", text: "Capturer l'écran avant et après.", state: "promoted", entered: "2026-10-01", retros: ["#3"], origin: { kind: "retro" } }] },
};

const prompt = (args: string[]) => args[args.indexOf("-p") + 1] ?? "";

test("un cook GitHub-seul reçoit les mêmes leçons, profil et secrets que celui de l'ancien chemin, sur le même projet", async (t) => {
  const lieu = cuisine(t, { scenario: "muet", secrets: { declares: DECLARES, valeurs: VALEURS }, profils: () => [VUE], issues: [] });
  const { journal, gh, cooks, lancements, secrets } = lieu;
  const retro = (j: Journal) => j.ajouter({ project: "brigade", ticket: 9, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: [{ kind: "propose", text: LECON }], dropped: [] } });
  retro(journal);
  gh.ficher(14, "2026-10-08T09:00:00Z", [MARQUEUR, "- zone : app/src/vue/rail.ts"].join("\n"));
  gh.poser(issue(14));
  await jusqua(() => cooks().length === 1);
  const ancien = lancements()[0]!;

  // Le journal du cook GitHub-seul : la même rétro, mais le cook du profil de l'ancien chemin n'y tourne pas.
  const sien = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => sien.fermer());
  retro(sien);

  // Le worktree du cook GitHub-seul : le dépôt y déclare les mêmes secrets.
  const worktree = repertoireTemporaire(t);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, ".claude/brigade/secrets"), DECLARES);
  const sources: SourcesDuContexte = {
    base: sien.base,
    projet: "brigade",
    plafondDesLecons: LECONS_INJECTEES_PAR_DEFAUT,
    carnetALaBase: () => null,
    profils: () => [VUE],
    fichierDeSecrets: secrets.fichier,
    envDuCook: environnementCook({}),
    station: "box/claude",
  };
  const contexte = await contexteDuCook(sources, { ticket: 14, titre: issue(14).title, depot: DEPOT, base: BASE, zone: ["app/src/vue/rail.ts"], worktree, delaiSetupMs: 1000 });
  assert.ok(contexte.pret);

  // Mêmes leçons, même profil : la consigne est celle que l'ancien chemin a donnée.
  assert.ok(contexte.lecons.some((l) => l.texte === LECON));
  assert.equal(contexte.carnet?.nom, "app-src-vue");
  assert.equal(contexte.consigne, prompt(ancien.args));
  // Mêmes secrets, et seulement ceux que le dépôt déclare.
  for (const nom of ["CLE_API", "DATABASE_URL", "AUTRE_PROJET"]) assert.equal(contexte.env[nom], ancien.env[nom], nom);
  assert.equal(contexte.env.CLE_API, CLE);
  assert.equal(contexte.env.AUTRE_PROJET, undefined);
});

test("les secrets ne vont que dans l'environnement du cook : ni la consigne, ni le texte posé sur l'issue, un commentaire ou la PR ne les portent", async (t) => {
  const { journal, secrets } = cuisine(t, { scenario: "muet", secrets: { declares: DECLARES, valeurs: VALEURS }, issues: [] });
  const worktree = repertoireTemporaire(t);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, ".claude/brigade/secrets"), DECLARES);
  const contexte = await contexteDuCook(
    { base: journal.base, projet: "brigade", plafondDesLecons: 20, carnetALaBase: () => null, fichierDeSecrets: secrets.fichier, envDuCook: {}, station: "box/claude" },
    { ticket: 14, titre: "t", depot: DEPOT, base: BASE, zone: [], worktree, delaiSetupMs: 1000 },
  );
  assert.ok(contexte.pret);
  assert.equal(contexte.env.CLE_API, CLE);
  assert.equal(contexte.consigne.includes(CLE) || contexte.consigne.includes(BASE_DE_DEV), false);
  // Un compte-rendu qui cite une valeur est masqué avant de partir sur GitHub.
  for (const texte of [`Issue : ${CLE}`, `Commentaire : ${BASE_DE_DEV}`, `PR : CLE_API=${CLE}`]) {
    const publie = pourGitHub(contexte, texte);
    assert.equal(publie.includes(CLE) || publie.includes(BASE_DE_DEV), false, publie);
    assert.ok(publie.includes("[secret:"), publie);
  }
});

test("un secret déclaré qui manque : rien ne part, et le problème nomme la variable sans en dire de valeur", async (t) => {
  const { journal, secrets } = cuisine(t, { scenario: "muet", secrets: { declares: DECLARES, valeurs: `CLE_API=${CLE}\n` }, issues: [] });
  const worktree = repertoireTemporaire(t);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, ".claude/brigade/secrets"), DECLARES);
  const contexte = await contexteDuCook(
    { base: journal.base, projet: "brigade", plafondDesLecons: 20, carnetALaBase: () => null, fichierDeSecrets: secrets.fichier, envDuCook: {}, station: "box/claude" },
    { ticket: 14, titre: "t", depot: DEPOT, base: BASE, zone: [], worktree, delaiSetupMs: 1000 },
  );
  assert.ok(!contexte.pret && contexte.raison === "secrets");
  assert.match(contexte.problemes.join("\n"), /DATABASE_URL/);
  assert.equal(contexte.problemes.join("\n").includes(CLE), false);
});

test("le setup du worktree est joué avec les secrets ; en échec il arrête le cook, sauf pour le ticket de préparation qui le lit dans sa consigne", async (t) => {
  const { journal } = cuisine(t, { scenario: "muet", issues: [] });
  const worktree = repertoireTemporaire(t);
  const sources: SourcesDuContexte = { base: journal.base, projet: "brigade", plafondDesLecons: 20, carnetALaBase: () => null, fichierDeSecrets: null, envDuCook: {}, station: "box/claude" };
  const demande = { ticket: 14, titre: "t", depot: DEPOT, base: BASE, zone: [], worktree, delaiSetupMs: 1000 };
  const echec = async () => ({ pret: false as const, depasse: false, code: 3, sortie: "boom", masques: 0 });

  const refuse = await contexteDuCook({ ...sources, jouer: echec }, demande);
  assert.ok(!refuse.pret && refuse.raison === "setup");

  const prepare = await contexteDuCook({ ...sources, jouer: echec }, { ...demande, preparation: true });
  assert.ok(prepare.pret);
  assert.match(prepare.consigne, /Le setup du worktree .* a échoué/);
  assert.deepEqual(prepare.setup?.sortie, "boom");
});
