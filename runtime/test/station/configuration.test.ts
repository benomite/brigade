// La configuration d'une station : une ligne par projet, et rien d'autre à
// écrire pour en ajouter ou en retirer un.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { LECTURES_INTERDITES } from "../../src/bac-a-sable/configuration.ts";
import { atelierDeLaStation, environnementDuProjet, lieuxDuProjet, lireConfiguration, lireFichierDeConfiguration, worktreesDeLaStation } from "../../src/station/configuration.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("une ligne par projet : son nom, son dépôt, sa branche, puis ses réglages ; les commentaires et les lignes vides ne comptent pas", () => {
  const { projets, problemes } = lireConfiguration(
    [
      "# projet  dépôt              branche  réglages",
      "brigade   acme/brigade   v2",
      "",
      "   espace\tacme/espace    main     BRIGADE_SECRETS_FILE=/srv/secrets/espace.env   BRIGADE_PROXY_PORT=3128  ",
    ].join("\n"),
  );
  assert.deepEqual(problemes, []);
  assert.deepEqual(projets, [
    { nom: "brigade", depot: "acme/brigade", base: "v2", reglages: {}, ligne: "brigade acme/brigade v2" },
    {
      nom: "espace",
      depot: "acme/espace",
      base: "main",
      reglages: { BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env", BRIGADE_PROXY_PORT: "3128" },
      ligne: "espace acme/espace main BRIGADE_SECRETS_FILE=/srv/secrets/espace.env BRIGADE_PROXY_PORT=3128",
    },
  ]);
});

test("une ligne illisible n'est que la sienne : elle est dite, numéro et motif, et les autres projets restent", () => {
  const { projets, problemes } = lireConfiguration(
    [
      "brigade acme/brigade v2",
      "seul",
      "Espace acme/espace main",
      "brigade acme/autre v2",
      "calculus acme/calculus main SECRETS=/x",
      "thermigo acme/thermigo main BRIGADE_STATE_DIR=/ailleurs",
      "thermigo2 acme/thermigo main BRIGADE_MANAGER_MODEL=opus",
      "thermigo3 acme/thermigo main BRIGADE_PROXY_PORT=1 BRIGADE_PROXY_PORT=2",
      "sauge acme/sauge main",
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

test("une ligne qui porte encore le plafond de calibrage, devenu une décision du chef, n'est pas refusée : le projet est servi, et son runtime le dit ignoré", () => {
  const { projets, problemes } = lireConfiguration("brigade acme/brigade v2 BRIGADE_CEILING_MODEL=sonnet BRIGADE_CEILING_EFFORT=medium");
  assert.deepEqual(problemes, []);
  assert.deepEqual(projets.map((projet) => projet.nom), ["brigade"]);
});

test("une ligne qui ne nomme pas de branche : le dépôt du projet la déclare, et l'environnement n'en hérite aucune de la station", () => {
  const { projets, problemes } = lireConfiguration(["shop acme/shop", "espace acme/espace BRIGADE_SECRETS_FILE=/srv/secrets/espace.env"].join("\n"));
  assert.deepEqual(problemes, []);
  assert.deepEqual(projets, [
    { nom: "shop", depot: "acme/shop", base: null, reglages: {}, ligne: "shop acme/shop" },
    { nom: "espace", depot: "acme/espace", base: null, reglages: { BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env" }, ligne: "espace acme/espace BRIGADE_SECRETS_FILE=/srv/secrets/espace.env" },
  ]);
  const [shop] = projets;
  assert.ok(shop);
  const env = environnementDuProjet("/srv/brigade", shop, { BRIGADE_BASE_BRANCH: "vieille" });
  assert.equal(env.BRIGADE_BASE_BRANCH, undefined);
});

test("le dépôt, la branche et le nom ne se règlent que par leurs champs", () => {
  for (const cle of ["BRIGADE_PROJECT", "BRIGADE_GITHUB_REPO", "BRIGADE_BASE_BRANCH", "BRIGADE_STATION_DIR", "BRIGADE_WORKTREES_DIR"]) {
    const { projets, problemes } = lireConfiguration(`brigade acme/brigade v2 ${cle}=autre`);
    assert.deepEqual(projets, []);
    assert.match(problemes[0] ?? "", new RegExp(`${cle} ne se règle pas sur la ligne`));
  }
});

test("l'environnement d'un projet : celui de la station, ses lieux sous la station, puis sa ligne — ses trois champs l'emportent sur tout", () => {
  const racine = "/srv/brigade";
  const [projet] = lireConfiguration("espace acme/espace main BRIGADE_SECRETS_FILE=/srv/secrets/espace.env").projets;
  assert.ok(projet);
  const station = { PATH: "/usr/bin", BRIGADE_CLAUDE_BIN: "/opt/claude", BRIGADE_SECRETS_FILE: "/srv/secrets/commun.env", BRIGADE_PROJECT: "vieux", BRIGADE_STATE_DIR: "/var/lib/vieux", BRIGADE_REPO_DIR: "/srv/vieux" };
  assert.deepEqual(environnementDuProjet(racine, projet, station), {
    PATH: "/usr/bin",
    BRIGADE_CLAUDE_BIN: "/opt/claude",
    BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env",
    BRIGADE_REPO_DIR: "/srv/brigade/clones/espace",
    BRIGADE_PROJECT: "espace",
    BRIGADE_GITHUB_REPO: "acme/espace",
    BRIGADE_BASE_BRANCH: "main",
    BRIGADE_STATE_DIR: "/srv/brigade/etat/espace",
    BRIGADE_WORKTREES_DIR: "/srv/brigade/etat/espace/worktrees",
  });
  // Un clone rangé ailleurs se nomme sur la ligne.
  const [ailleurs] = lireConfiguration("espace acme/espace main BRIGADE_REPO_DIR=/srv/depots/espace").projets;
  assert.ok(ailleurs);
  assert.equal(environnementDuProjet(racine, ailleurs, station).BRIGADE_REPO_DIR, "/srv/depots/espace");
});

test("sur le Mac du chef, la station vit sous `~/.config/brigade`, qu'aucun cook ne lit : le clone et les worktrees d'un projet vivent dans l'atelier, hors de tout ce que le bac à sable interdit", () => {
  const home = "/Users/chef";
  const racine = "/Users/chef/.config/brigade/station";
  const [projet] = lireConfiguration("gadgets acme/gadgets main").projets;
  assert.ok(projet);
  assert.equal(atelierDeLaStation(racine, home), "/Users/chef/.local/share/brigade/station");
  const env = environnementDuProjet(racine, projet, { HOME: home });
  assert.deepEqual([env.BRIGADE_REPO_DIR, env.BRIGADE_WORKTREES_DIR], ["/Users/chef/.local/share/brigade/station/clones/gadgets", "/Users/chef/.local/share/brigade/station/worktrees/gadgets"]);
  // L'état du projet — journal, décisions, verrou — reste sous la station.
  assert.equal(env.BRIGADE_STATE_DIR, "/Users/chef/.config/brigade/station/etat/gadgets");
  for (const lieu of [env.BRIGADE_REPO_DIR, env.BRIGADE_WORKTREES_DIR, atelierDeLaStation(racine, home)]) {
    for (const interdit of LECTURES_INTERDITES.map((relatif) => join(home, relatif))) assert.ok(!(lieu ?? "").startsWith(`${interdit}/`) && lieu !== interdit, `${lieu} est sous ${interdit}`);
  }
  assert.equal(worktreesDeLaStation(racine, home), "/Users/chef/.local/share/brigade/station/worktrees");
  // Le clone que la ligne nomme reste le sien ; les worktrees vont à l'atelier.
  const [ailleurs] = lireConfiguration("gadgets acme/gadgets main BRIGADE_REPO_DIR=/Users/chef/code/gadgets").projets;
  assert.ok(ailleurs);
  const sien = environnementDuProjet(racine, ailleurs, { HOME: home });
  assert.deepEqual([sien.BRIGADE_REPO_DIR, sien.BRIGADE_WORKTREES_DIR], ["/Users/chef/code/gadgets", "/Users/chef/.local/share/brigade/station/worktrees/gadgets"]);
});

test("une station posée ailleurs que sous ce qu'un cook ne lit pas garde tout sous son répertoire, comme sur un serveur", () => {
  for (const [racine, home] of [
    ["/srv/brigade", "/var/lib/brigade"],
    ["/Users/chef/brigade-station", "/Users/chef"],
    ["/Users/chef/.config/brigade/station", undefined],
  ] as const) {
    assert.equal(atelierDeLaStation(racine, home), racine);
    assert.deepEqual(lieuxDuProjet(racine, "espace", home), { clone: join(racine, "clones/espace"), worktrees: join(racine, "etat/espace/worktrees") });
    assert.equal(worktreesDeLaStation(racine, home), join(racine, "etat"));
  }
});

test("sans fichier de configuration, la station ne sert aucun projet, sans rien en dire ; illisible, elle le dit", (t) => {
  const racine = repertoireTemporaire(t);
  assert.deepEqual(lireFichierDeConfiguration(join(racine, "projets")), { projets: [], problemes: [] });
  mkdirSync(join(racine, "repertoire"));
  const illisible = lireFichierDeConfiguration(join(racine, "repertoire"));
  assert.deepEqual(illisible.projets, []);
  assert.match(illisible.problemes[0] ?? "", /^configuration illisible/);
  writeFileSync(join(racine, "projets"), "brigade acme/brigade v2\n");
  assert.deepEqual(lireFichierDeConfiguration(join(racine, "projets")).projets.map((projet) => projet.nom), ["brigade"]);
});

test("configuration.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
