import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { LECONS_INJECTEES_PAR_DEFAUT } from "../../../src/apprentissage/injection.ts";
import { consigne, environnementCook } from "../../../src/claude.ts";
import { ecrireSecret } from "../../../src/droits.ts";
import { contexteDuCook, pourGitHub, type SourcesDuContexte } from "../../../src/github-seul/contexte-cook/contexte-cook.ts";
import type { DefinitionDeProfil } from "../../../src/profils/definition.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { BASE, DEPOT, repertoireTemporaire } from "../../outils.ts";

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

// Le journal du projet.
function unJournal(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  return journal;
}

// Le fichier de secrets de la machine : il vit hors de l'état, comme sur la box,
// fermé aux autres comptes. Sous Windows, le mode 0o600 garde l'ACL héritée du
// répertoire temporaire, que le runtime refuse : `ecrireSecret` la ferme.
function secretsDeLaMachine(t: TestContext, valeurs: string): string {
  const fichier = join(repertoireTemporaire(t), "secrets.env");
  ecrireSecret(fichier, valeurs);
  return fichier;
}

// Le worktree du cook : le dépôt y déclare ses secrets.
function unWorktree(t: TestContext): string {
  const worktree = repertoireTemporaire(t);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, ".claude/brigade/secrets"), DECLARES);
  return worktree;
}

test("un cook GitHub-seul reçoit les leçons du projet, le carnet du profil de sa zone et les secrets que le dépôt déclare", async (t) => {
  const journal = unJournal(t);
  journal.ajouter({ project: "brigade", ticket: 9, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: [{ kind: "propose", text: LECON }], dropped: [] } });
  const sources: SourcesDuContexte = {
    base: journal.base,
    projet: "brigade",
    plafondDesLecons: LECONS_INJECTEES_PAR_DEFAUT,
    carnetALaBase: () => null,
    profils: () => [VUE],
    fichierDeSecrets: secretsDeLaMachine(t, VALEURS),
    envDuCook: environnementCook({}),
    station: "box/claude",
  };
  const contexte = await contexteDuCook(sources, { ticket: 14, titre: "Ticket 14", depot: DEPOT, base: BASE, zone: ["app/src/vue/rail.ts"], worktree: unWorktree(t), delaiSetupMs: 1000 });
  assert.ok(contexte.pret);

  // La leçon du projet et le carnet du profil, dans la consigne du cook.
  assert.deepEqual(contexte.lecons, [{ id: "L1", texte: LECON }]);
  assert.equal(contexte.carnet?.nom, "app-src-vue");
  assert.equal(contexte.consigne, consigne({ ticket: 14, titre: "Ticket 14", depot: DEPOT, base: BASE, lecons: contexte.lecons, carnet: contexte.carnet }));
  // Les secrets déclarés, et seulement eux.
  assert.equal(contexte.env.CLE_API, CLE);
  assert.equal(contexte.env.DATABASE_URL, BASE_DE_DEV);
  assert.equal(contexte.env.AUTRE_PROJET, undefined);
});

test("les secrets ne vont que dans l'environnement du cook : ni la consigne, ni le texte posé sur l'issue, un commentaire ou la PR ne les portent", async (t) => {
  const journal = unJournal(t);
  const contexte = await contexteDuCook(
    { base: journal.base, projet: "brigade", plafondDesLecons: 20, carnetALaBase: () => null, fichierDeSecrets: secretsDeLaMachine(t, VALEURS), envDuCook: {}, station: "box/claude" },
    { ticket: 14, titre: "t", depot: DEPOT, base: BASE, zone: [], worktree: unWorktree(t), delaiSetupMs: 1000 },
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
  const journal = unJournal(t);
  const contexte = await contexteDuCook(
    { base: journal.base, projet: "brigade", plafondDesLecons: 20, carnetALaBase: () => null, fichierDeSecrets: secretsDeLaMachine(t, `CLE_API=${CLE}\n`), envDuCook: {}, station: "box/claude" },
    { ticket: 14, titre: "t", depot: DEPOT, base: BASE, zone: [], worktree: unWorktree(t), delaiSetupMs: 1000 },
  );
  assert.ok(!contexte.pret && contexte.raison === "secrets");
  assert.match(contexte.problemes.join("\n"), /DATABASE_URL/);
  assert.equal(contexte.problemes.join("\n").includes(CLE), false);
});

test("le setup du worktree est joué avec les secrets ; en échec il arrête le cook, sauf pour le ticket de préparation qui le lit dans sa consigne", async (t) => {
  const journal = unJournal(t);
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
