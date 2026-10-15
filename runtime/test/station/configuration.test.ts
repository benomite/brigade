// La configuration d'une station : une ligne par projet, et rien d'autre à
// écrire pour en ajouter ou en retirer un.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { environnementDuProjet, lireConfiguration, lireFichierDeConfiguration } from "../../src/station/configuration.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("une ligne par projet : son nom, son dépôt, sa branche, puis ses réglages ; les commentaires et les lignes vides ne comptent pas", () => {
  const { projets, problemes } = lireConfiguration(
    [
      "# projet  dépôt              branche  réglages",
      "brigade   benomite/brigade   v2",
      "",
      "   espace\tbenomite/espace    main     BRIGADE_SECRETS_FILE=/srv/secrets/espace.env   BRIGADE_PROXY_PORT=3128  ",
    ].join("\n"),
  );
  assert.deepEqual(problemes, []);
  assert.deepEqual(projets, [
    { nom: "brigade", depot: "benomite/brigade", base: "v2", reglages: {}, ligne: "brigade benomite/brigade v2" },
    {
      nom: "espace",
      depot: "benomite/espace",
      base: "main",
      reglages: { BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env", BRIGADE_PROXY_PORT: "3128" },
      ligne: "espace benomite/espace main BRIGADE_SECRETS_FILE=/srv/secrets/espace.env BRIGADE_PROXY_PORT=3128",
    },
  ]);
});

test("une ligne illisible n'est que la sienne : elle est dite, numéro et motif, et les autres projets restent", () => {
  const { projets, problemes } = lireConfiguration(
    [
      "brigade benomite/brigade v2",
      "seul",
      "Espace benomite/espace main",
      "brigade benomite/autre v2",
      "calculus benomite/calculus main SECRETS=/x",
      "thermigo benomite/thermigo main BRIGADE_STATE_DIR=/ailleurs",
      "thermigo2 benomite/thermigo main BRIGADE_MANAGER_MODEL=opus",
      "thermigo3 benomite/thermigo main BRIGADE_PROXY_PORT=1 BRIGADE_PROXY_PORT=2",
      "sauge benomite/sauge main",
    ].join("\n"),
  );
  assert.deepEqual(projets.map((projet) => projet.nom), ["brigade", "sauge"]);
  assert.equal(problemes.length, 7);
  assert.match(problemes[0] ?? "", /^ligne 2 de la configuration \(« seul »\) : attendu le nom du projet, son dépôt GitHub/);
  assert.match(problemes[1] ?? "", /^ligne 3 .* nom de projet invalide/);
  assert.match(problemes[2] ?? "", /^ligne 4 .* le projet « brigade » a déjà sa ligne/);
  assert.match(problemes[3] ?? "", /^ligne 5 .* « SECRETS=\/x » n'est pas un réglage/);
  assert.match(problemes[4] ?? "", /^ligne 6 .* BRIGADE_STATE_DIR ne se règle pas sur la ligne : la station range l'état de chaque projet/);
  assert.match(problemes[5] ?? "", /^ligne 7 .* BRIGADE_MANAGER_MODEL est une décision du chef : elle vit au journal du projet/);
  assert.match(problemes[6] ?? "", /^ligne 8 .* BRIGADE_PROXY_PORT est réglé deux fois/);
});

test("le dépôt, la branche et le nom ne se règlent que par leurs champs", () => {
  for (const cle of ["BRIGADE_PROJECT", "BRIGADE_GITHUB_REPO", "BRIGADE_BASE_BRANCH", "BRIGADE_STATION_DIR"]) {
    const { projets, problemes } = lireConfiguration(`brigade benomite/brigade v2 ${cle}=autre`);
    assert.deepEqual(projets, []);
    assert.match(problemes[0] ?? "", new RegExp(`${cle} ne se règle pas sur la ligne`));
  }
});

test("l'environnement d'un projet : celui de la station, ses lieux sous la station, puis sa ligne — ses trois champs l'emportent sur tout", () => {
  const racine = "/srv/brigade";
  const [projet] = lireConfiguration("espace benomite/espace main BRIGADE_SECRETS_FILE=/srv/secrets/espace.env").projets;
  assert.ok(projet);
  const station = { PATH: "/usr/bin", BRIGADE_CLAUDE_BIN: "/opt/claude", BRIGADE_SECRETS_FILE: "/srv/secrets/commun.env", BRIGADE_PROJECT: "vieux", BRIGADE_STATE_DIR: "/var/lib/vieux", BRIGADE_REPO_DIR: "/srv/vieux" };
  assert.deepEqual(environnementDuProjet(racine, projet, station), {
    PATH: "/usr/bin",
    BRIGADE_CLAUDE_BIN: "/opt/claude",
    BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env",
    BRIGADE_REPO_DIR: "/srv/brigade/clones/espace",
    BRIGADE_PROJECT: "espace",
    BRIGADE_GITHUB_REPO: "benomite/espace",
    BRIGADE_BASE_BRANCH: "main",
    BRIGADE_STATE_DIR: "/srv/brigade/etat/espace",
  });
  // Un clone rangé ailleurs se nomme sur la ligne.
  const [ailleurs] = lireConfiguration("espace benomite/espace main BRIGADE_REPO_DIR=/srv/depots/espace").projets;
  assert.ok(ailleurs);
  assert.equal(environnementDuProjet(racine, ailleurs, station).BRIGADE_REPO_DIR, "/srv/depots/espace");
});

test("sans fichier de configuration, la station ne sert aucun projet, sans rien en dire ; illisible, elle le dit", (t) => {
  const racine = repertoireTemporaire(t);
  assert.deepEqual(lireFichierDeConfiguration(join(racine, "projets")), { projets: [], problemes: [] });
  mkdirSync(join(racine, "repertoire"));
  const illisible = lireFichierDeConfiguration(join(racine, "repertoire"));
  assert.deepEqual(illisible.projets, []);
  assert.match(illisible.problemes[0] ?? "", /^configuration illisible/);
  writeFileSync(join(racine, "projets"), "brigade benomite/brigade v2\n");
  assert.deepEqual(lireFichierDeConfiguration(join(racine, "projets")).projets.map((projet) => projet.nom), ["brigade"]);
});

test("configuration.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
