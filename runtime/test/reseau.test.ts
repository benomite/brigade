// Le réseau d'un projet : sa liste blanche, ce que son dépôt y déclare, et ce
// qui fait passer un process par la porte. Aucune connexion ne sort d'ici.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lireALaBase } from "../src/depot.ts";
import { autorise, configReseau, lireDeclaration, REGLES_DE_BASE, reglesDuProjet, sonderLeFiltre, variablesDeRelais, type Envoyer } from "../src/reseau.ts";
import { InvalidConfig } from "../src/invalid-config.ts";
import { BASE, depotGit, repertoireTemporaire } from "./outils.ts";

// Un envoi qui finit comme le test le dit — ou ne finit pas.
const envoi = (fin: { erreur?: string } | "muet"): Envoyer => (_adresse, _port, rendu) => {
  if (fin !== "muet") queueMicrotask(() => rendu(fin.erreur === undefined ? null : Object.assign(new Error(fin.erreur), { code: fin.erreur })));
};

describe("le réseau du projet", { concurrency: 8 }, () => {
  test("le socle laisse passer Anthropic et GitHub, sous-domaines compris, sur 443 et 80 — et rien d'autre", () => {
    for (const hote of ["api.anthropic.com", "claude.ai", "github.com", "api.github.com", "objects.githubusercontent.com", "API.GitHub.com."]) {
      assert.equal(autorise(REGLES_DE_BASE, hote, 443), true, hote);
    }
    assert.equal(autorise(REGLES_DE_BASE, "github.com", 80), true);
    for (const [hote, port] of [["registry.npmjs.org", 443], ["github.com", 22], ["github.com.pirate.test", 443], ["pasgithub.com", 443], ["1.1.1.1", 443]] as const) {
      assert.equal(autorise(REGLES_DE_BASE, hote, port), false, `${hote}:${port}`);
    }
  });

  test("le dépôt déclare ses registres : un hôte par ligne, ses sous-domaines par `*.`, un autre port par `:port`", () => {
    const { hotes, problemes } = lireDeclaration("# les registres du projet\nregistry.npmjs.org\n\n*.Pythonhosted.org\nbase.exemple.test:5432\nregistry.npmjs.org\n");
    assert.deepEqual(hotes, ["registry.npmjs.org", "*.pythonhosted.org", "base.exemple.test:5432"]);
    assert.deepEqual(problemes, []);

    const regles = reglesDuProjet(hotes);
    assert.equal(autorise(regles, "registry.npmjs.org", 443), true);
    assert.equal(autorise(regles, "autre.npmjs.org", 443), false);
    assert.equal(autorise(regles, "files.pythonhosted.org", 443), true);
    assert.equal(autorise(regles, "pythonhosted.org", 443), true);
    assert.equal(autorise(regles, "base.exemple.test", 5432), true);
    assert.equal(autorise(regles, "base.exemple.test", 443), false);
    assert.equal(autorise(regles, "api.anthropic.com", 443), true);
  });

  test("une ligne qui ouvrirait autre chose qu'un hôte n'ouvre rien, et se dit", () => {
    const { hotes, problemes } = lireDeclaration("*\n*.com\n10.0.0.1\nhttps://exemple.test/chemin\nexemple.test:99999\nlocalhost\nbon.exemple.test\n");
    assert.deepEqual(hotes, ["bon.exemple.test"]);
    assert.equal(problemes.length, 6);
    assert.match(problemes[0] ?? "", /^line 1 of `\.claude\/brigade\/reseau` \(“\*”\): not a host/);
    assert.match(problemes[4] ?? "", /that port does not exist/);
  });

  test("le port de la porte n'a pas de défaut, et ne s'écrit pas à moitié", () => {
    assert.equal(configReseau({}), null);
    assert.equal(configReseau({ BRIGADE_PROXY_PORT: "18443" }), 18443);
    for (const brut of ["0", "70000", "porte", "1.5"]) assert.throws(() => configReseau({ BRIGADE_PROXY_PORT: brut }), InvalidConfig, brut);
  });

  test("tout ce qui est lancé passe par la porte, sauf la boucle locale", () => {
    const variables = variablesDeRelais(18443);
    for (const nom of ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"]) assert.equal(variables[nom], "http://127.0.0.1:18443");
    assert.equal(variables.NO_PROXY, "localhost,127.0.0.1,::1");
    assert.equal(variables.NODE_USE_ENV_PROXY, "1");
  });

  test("sur la base, un fichier absent se distingue d'un clone qu'on ne sait pas lire", (t) => {
    const { clone } = depotGit(t);
    assert.equal(lireALaBase({ clone, base: BASE }, ".claude/brigade/reseau"), null);
    assert.equal(lireALaBase({ clone, base: BASE }, "LISEZMOI"), "le projet\n");
    assert.throws(() => lireALaBase({ clone, base: "jamais-rapatriee" }, ".claude/brigade/reseau"), /git ls-tree/);
    assert.throws(() => lireALaBase({ clone: repertoireTemporaire(t), base: BASE }, ".claude/brigade/reseau"), /git ls-tree/);
  });

});

// Hors du `describe` qui joue ses tests de front : l'horloge simulée est celle
// de tout le process, et le tick des runtimes des autres tests s'y arrêterait.
test("le filtre de l'unité tient si le noyau refuse l'envoi — pas s'il part ; et ce qui ne prouve rien ne conclut rien", async (t) => {
  assert.equal(await sonderLeFiltre(envoi({ erreur: "EPERM" })), true);
  assert.equal(await sonderLeFiltre(envoi({})), false);
  // Aucune route, ou un envoi qui ne rend jamais : ni oui, ni non. Le délai de
  // la sonde (deux secondes) passe sur l'horloge du test, rendue avant la fin.
  assert.equal(await sonderLeFiltre(envoi({ erreur: "ENETUNREACH" })), null);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const muette = sonderLeFiltre(envoi("muet"));
  t.mock.timers.tick(2000);
  t.mock.timers.reset();
  assert.equal(await muette, null);
});
