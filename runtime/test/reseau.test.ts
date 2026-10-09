// Le réseau d'un projet : sa liste blanche, ce que son dépôt y déclare, et ce
// qui fait passer un process par la porte. Aucune connexion ne sort d'ici.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { connect } from "node:net";
import { describe, test } from "node:test";
import { autorise, brancherReseau, configReseau, lireDeclaration, REGLES_DE_BASE, reglesDuProjet, sonderLeFiltre, variablesDeRelais } from "../src/reseau.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { horloge, jusqua, repertoireTemporaire } from "./outils.ts";

// Une connexion qui finit comme le test le dit.
const prise = (fin: { erreur?: string; connecte?: boolean }) =>
  (() => {
    const fausse = Object.assign(new EventEmitter(), { destroy() {}, setTimeout() {} });
    queueMicrotask(() => (fin.connecte ? fausse.emit("connect") : fausse.emit("error", Object.assign(new Error(fin.erreur), { code: fin.erreur }))));
    return fausse;
  }) as unknown as typeof connect;

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
    assert.match(problemes[0] ?? "", /^ligne 1 de `\.claude\/brigade\/reseau` \(« \* »\) : ce n'est pas un hôte/);
    assert.match(problemes[4] ?? "", /ce port n'existe pas/);
  });

  test("le port de la porte n'a pas de défaut, et ne s'écrit pas à moitié", () => {
    assert.equal(configReseau({}), null);
    assert.equal(configReseau({ BRIGADE_PROXY_PORT: "18443" }), 18443);
    for (const brut of ["0", "70000", "porte", "1.5"]) assert.throws(() => configReseau({ BRIGADE_PROXY_PORT: brut }), ConfigInvalide, brut);
  });

  test("tout ce qui est lancé passe par la porte, sauf la boucle locale", () => {
    const variables = variablesDeRelais(18443);
    for (const nom of ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"]) assert.equal(variables[nom], "http://127.0.0.1:18443");
    assert.equal(variables.NO_PROXY, "localhost,127.0.0.1,::1");
    assert.equal(variables.NODE_USE_ENV_PROXY, "1");
  });

  test("le filtre de l'unité tient si le noyau refuse la connexion directe — pas si elle part, ni si rien ne se prouve", async () => {
    assert.equal(await sonderLeFiltre(prise({ erreur: "EPERM" })), true);
    assert.equal(await sonderLeFiltre(prise({ connecte: true })), false);
    assert.equal(await sonderLeFiltre(prise({ erreur: "ECONNREFUSED" })), false);
    assert.equal(await sonderLeFiltre(prise({ erreur: "ENETUNREACH" })), null);
  });

  test("ce que la base déclare entre au journal au démarrage, puis quand un merge le change", async (t) => {
    const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleTickMs: 10, maintenant: horloge() });
    t.after(() => runtime.arreter("test"));
    let declaration: string | null = null;
    const declares = () => runtime.journal.duType("network.declared", 10).map((evenement) => evenement.payload);

    brancherReseau(runtime, { base: "v2", declaration: () => declaration });
    // Rien de déclaré, rien d'écrit : la porte s'en tient au socle.
    assert.deepEqual(declares(), []);

    declaration = "registry.npmjs.org\n*\n";
    await jusqua(() => declares().length === 1);
    assert.deepEqual(declares()[0]?.hosts, ["registry.npmjs.org"]);
    assert.equal(declares()[0]?.base, "v2");
    assert.equal(declares()[0]?.problems.length, 1);

    declaration = null;
    await jusqua(() => declares().length === 2);
    assert.deepEqual(declares()[1]?.hosts, []);
  });
});
