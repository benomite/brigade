// L'écran à regarder d'une livraison : déclaré par le cook dans sa PR, sinon
// déduit des fichiers changés par la déclaration d'écrans du dépôt, sinon
// aucun. Des corps de PR tels que la station les écrit, rien n'est lancé.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { DECLARATION_ECRANS, deduireEcran, ecranARegarder, ecranDeLaLivraison, ecransDuWorktree, lireDeclaration, lireEcrans, pageDeLEcran, routeDeLEcran, type EcranARegarder } from "../src/ecran.ts";
import { repertoireTemporaire } from "./outils.ts";

// Le corps d'une PR de livraison : l'en-tête de la station, puis le livrable du cook.
const corps = (...livrable: string[]) => ["Ticket #591, cuisiné par `box/claude` (`opus` / `high`).", "", ...livrable].join("\n");

const DECLAREE = corps("Le rail sépare les tickets en attente.", "", "Écran : /rail", "À regarder : #591 : le rail a maintenant deux colonnes, TODO et WAITING");

const ECRANS = lireEcrans(["# Les écrans de l'app", "app/src/vue/rail.ts : /rail", "app/src/vue/carte.ts : /carte", "app/src/vue : /accueil", ""].join("\n")).correspondances;

describe("l'écran à regarder d'une livraison", () => {
  test("un corps de PR qui déclare l'écran et la phrase donne un écran déclaré, la phrase telle quelle", () => {
    assert.deepEqual(ecranARegarder({ corps: DECLAREE, changes: [], correspondances: [] }), {
      ecran: "/rail",
      phrase: "#591 : le rail a maintenant deux colonnes, TODO et WAITING",
      source: "declare",
    });
  });

  test("sans déclaration, un diff qui touche un fichier d'écran donne un écran déduit", () => {
    assert.deepEqual(ecranARegarder({ corps: corps("Le rail sépare les tickets en attente."), changes: ["runtime/src/rail.ts", "app/src/vue/rail.ts"], correspondances: ECRANS }), {
      ecran: "/rail",
      phrase: null,
      source: "deduit",
    });
  });

  test("sans déclaration, un diff qui ne touche aucun écran ne donne aucun écran", () => {
    assert.equal(ecranARegarder({ corps: corps("Le journal se compacte."), changes: ["runtime/src/journal.ts", "docs/runtime.md"], correspondances: ECRANS }), null);
    // Ni déclaration d'écrans dans le dépôt, ni dans la PR : rien non plus.
    assert.equal(ecranARegarder({ corps: corps("Le rail change."), changes: ["app/src/vue/rail.ts"], correspondances: [] }), null);
    assert.equal(ecranARegarder({ corps: null, changes: [], correspondances: ECRANS }), null);
  });

  test("la déclaration l'emporte sur la déduction quand les deux donnent un écran", () => {
    const corpsCarte = corps("Écran : /carte", "À regarder : la carte dit « déduit » sous l'écran");
    assert.deepEqual(ecranARegarder({ corps: corpsCarte, changes: ["app/src/vue/rail.ts", "app/src/vue/rail.css"], correspondances: ECRANS }), {
      ecran: "/carte",
      phrase: "la carte dit « déduit » sous l'écran",
      source: "declare",
    });
  });

  test("« Écran : aucun » déclare qu'aucun écran n'est touché : rien n'est déduit derrière", () => {
    assert.equal(ecranARegarder({ corps: corps("Écran : aucun"), changes: ["app/src/vue/rail.ts"], correspondances: ECRANS }), null);
    assert.equal(ecranARegarder({ corps: corps("- **Écran :** `Aucun`"), changes: ["app/src/vue/rail.ts"], correspondances: ECRANS }), null);
  });

  test("une phrase sans écran ne déclare rien : l'écran est déduit, et la phrase du cook lui reste", () => {
    assert.deepEqual(ecranARegarder({ corps: corps("À regarder : la colonne WAITING"), changes: ["app/src/vue/rail.ts"], correspondances: ECRANS }), {
      ecran: "/rail",
      phrase: "la colonne WAITING",
      source: "deduit",
    });
    // Et sans écran déduit, elle ne fait pas un écran.
    assert.equal(ecranARegarder({ corps: corps("À regarder : la colonne WAITING"), changes: ["docs/app.md"], correspondances: ECRANS }), null);
  });
});

describe("la déclaration du cook dans le corps de sa PR", () => {
  test("la clé se lit sans égard à la casse, aux accents, au gras ni à la puce ; des backticks qui entourent la valeur tombent", () => {
    for (const [ecran, phrase] of [
      ["Écran : /rail", "À regarder : deux colonnes"],
      ["ecran: /rail", "a regarder: deux colonnes"],
      ["ÉCRAN : /rail", "À REGARDER : deux colonnes"],
      ["- **Écran** : `/rail`", "- **À regarder** : deux colonnes"],
      ["* **Écran :** /rail", "* __À regarder :__ deux colonnes"],
      ["  Écran   :   /rail  ", "À regarder :deux colonnes"],
    ] as const) {
      assert.deepEqual(lireDeclaration(corps(ecran, phrase)), { ecran: "/rail", aucun: false, phrase: "deux colonnes" }, ecran);
    }
  });

  test("la phrase peut manquer : l'écran est déclaré sans elle", () => {
    assert.deepEqual(ecranARegarder({ corps: corps("Écran : le rail"), changes: [], correspondances: [] }), { ecran: "le rail", phrase: null, source: "declare" });
  });

  test("une ligne citée — dans un bloc de code ou entre backticks — ne déclare rien", () => {
    const cite = corps("La consigne dit d'écrire :", "```", "Écran : <l'écran ou la route changé>", "À regarder : <une phrase>", "```", "`Écran : /rail`", "~~~", "Écran : /carte", "~~~");
    assert.deepEqual(lireDeclaration(cite), { ecran: null, aucun: false, phrase: null });
  });

  test("une clé vide, ou une autre clé, ne déclare rien", () => {
    assert.deepEqual(lireDeclaration(corps("Écran :", "À regarder :   ", "Écrans : /rail", "Note : à regarder demain")), { ecran: null, aucun: false, phrase: null });
  });

  test("écrite deux fois, la dernière ligne l'emporte", () => {
    assert.deepEqual(lireDeclaration(corps("Écran : /rail", "À regarder : une colonne", "Finalement :", "Écran : /carte", "À regarder : la carte")), { ecran: "/carte", aucun: false, phrase: "la carte" });
  });
});

describe("la déduction depuis les fichiers changés", () => {
  test("chaque fichier est à l'écran du chemin le plus précis qui le possède, par segments entiers", () => {
    assert.equal(deduireEcran(["app/src/vue/carte.ts"], ECRANS), "/carte");
    assert.equal(deduireEcran(["app/src/vue/autre.ts"], ECRANS), "/accueil");
    assert.equal(deduireEcran(["app/src/vue/rail.ts.orig"], ECRANS), "/accueil");
    assert.equal(deduireEcran(["app/src/vue2/rail.ts", "app/src"], ECRANS), null);
  });

  test("l'écran retenu est celui qui compte le plus de fichiers changés ; à égalité, le premier déclaré", () => {
    assert.equal(deduireEcran(["app/src/vue/carte.ts", "app/src/vue/rail.ts", "app/src/vue/carte.ts/style.css"], ECRANS), "/carte");
    assert.equal(deduireEcran(["app/src/vue/carte.ts", "app/src/vue/rail.ts"], ECRANS), "/rail");
    // Deux chemins pour un même écran comptent ensemble.
    const partages = lireEcrans("site/a : /a\nsite/b1 : /b\nsite/b2 : /b").correspondances;
    assert.equal(deduireEcran(["site/a/x", "site/b1/y", "site/b2/z"], partages), "/b");
  });
});

describe("la déclaration des écrans du dépôt", () => {
  test("une ligne « <chemin> : <écran ou route> » par écran ; commentaires et lignes vides passent", () => {
    assert.deepEqual(ECRANS, [
      { chemin: "app/src/vue/rail.ts", ecran: "/rail" },
      { chemin: "app/src/vue/carte.ts", ecran: "/carte" },
      { chemin: "app/src/vue", ecran: "/accueil" },
    ]);
    // La route est ce qui suit les premiers deux-points, telle quelle.
    assert.deepEqual(lireEcrans("site/admin/ : http://localhost:3000/admin").correspondances, [{ chemin: "site/admin", ecran: "http://localhost:3000/admin" }]);
  });

  test("une ligne mal écrite est dite et écartée, les autres restent lues — jamais un écran deviné", () => {
    const { correspondances, problemes } = lireEcrans(["app/src/vue/rail.ts", ": /rien", "/etc : /etc", "app/*.ts : /tout", "app/src/vue/carte.ts :", "app/src/vue : /accueil", "app/src/vue/ : /autre", ". : /tout", "./ : /tout"].join("\n"));
    assert.deepEqual(correspondances, [{ chemin: "app/src/vue", ecran: "/accueil" }]);
    assert.equal(problemes.length, 8);
    assert.match(problemes[0] ?? "", /^ligne 1 de `\.claude\/brigade\/ecrans` .*« <chemin> : <écran ou route> »/);
    assert.match(problemes[1] ?? "", /il manque le chemin/);
    assert.match(problemes[2] ?? "", /n'est pas un chemin du dépôt/);
    assert.match(problemes[3] ?? "", /est un motif/);
    assert.match(problemes[4] ?? "", /il manque l'écran/);
    assert.match(problemes[5] ?? "", /^ligne 7 .*déjà l'écran « \/accueil »/);
    assert.match(problemes[6] ?? "", /ne nomme aucun chemin/);
    assert.match(problemes[7] ?? "", /ne nomme aucun chemin/);
  });

  test("lue dans le worktree d'une livraison : absente, rien ne se déduit ; illisible, c'est dit", (t) => {
    const worktree = repertoireTemporaire(t);
    assert.deepEqual(ecransDuWorktree(worktree), { correspondances: [], problemes: [] });
    assert.deepEqual(ecranDeLaLivraison({ worktree, corps: corps("Le rail change."), changes: ["app/src/vue/rail.ts"] }), { ecran: null, problemes: [] });

    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    writeFileSync(join(worktree, DECLARATION_ECRANS), "app/src/vue/rail.ts : /rail\napp/src/vue/carte.ts\n");
    const deduit = ecranDeLaLivraison({ worktree, corps: corps("Le rail change."), changes: ["app/src/vue/rail.ts"] });
    assert.deepEqual(deduit.ecran, { ecran: "/rail", phrase: null, source: "deduit" });
    // La ligne mal écrite est dite, pas perdue.
    assert.equal(deduit.problemes.length, 1);
    assert.match(deduit.problemes[0] ?? "", /^ligne 2 de `\.claude\/brigade\/ecrans`/);
    assert.deepEqual(ecranDeLaLivraison({ worktree, corps: DECLAREE, changes: ["docs/app.md"] }).ecran, {
      ecran: "/rail",
      phrase: "#591 : le rail a maintenant deux colonnes, TODO et WAITING",
      source: "declare",
    });

    if (process.getuid?.() === 0) return t.diagnostic("sous root, un fichier sans droits reste lisible : l'illisible n'est pas éprouvé");
    chmodSync(join(worktree, DECLARATION_ECRANS), 0o000);
    const illisible = ecransDuWorktree(worktree);
    assert.deepEqual(illisible.correspondances, []);
    assert.match(illisible.problemes[0] ?? "", /`\.claude\/brigade\/ecrans` est illisible — EACCES/);
  });
});

describe("la page de l'écran, pour un projet web", () => {
  const declare = (ecran: string): EcranARegarder => ({ ecran, phrase: null, source: "declare" });

  test("un écran de route /exemple s'ouvre sur le port du worktree suivi de /exemple", () => {
    assert.equal(pageDeLEcran(20630, declare("/exemple")), "http://127.0.0.1:20630/exemple");
    assert.equal(pageDeLEcran(20630, { ecran: "/rail", phrase: null, source: "deduit" }), "http://127.0.0.1:20630/rail");
    // Ce que la route porte au-delà de son chemin lui reste.
    assert.equal(pageDeLEcran(20630, declare("/projets/12?onglet=notes")), "http://127.0.0.1:20630/projets/12?onglet=notes");
    assert.equal(pageDeLEcran(20630, declare("/#/rail")), "http://127.0.0.1:20630/#/rail");
  });

  test("une route d'écran connue n'ouvre jamais la racine « / »", () => {
    for (const route of ["/exemple", " /exemple ", "/exemple/", "/a/b"]) {
      const page = pageDeLEcran(20630, declare(route));
      assert.notEqual(page, null, route);
      assert.notEqual(new URL(page as string).pathname, "/", route);
    }
    // Une route qui revient à la racine n'est pas un écran : pas de page plutôt que la racine.
    for (const racine of ["/", " / ", "/?", "/#", "/exemple/..", "/./"]) assert.equal(pageDeLEcran(20630, declare(racine)), null, racine);
  });

  test("une livraison sans écran ne produit aucune page", () => {
    assert.equal(pageDeLEcran(20630, null), null);
    assert.equal(pageDeLEcran(20630, ecranARegarder({ corps: corps("Le journal se compacte."), changes: ["runtime/src/journal.ts"], correspondances: ECRANS })), null);
  });

  test("un écran qui n'est pas une route n'a pas de page : rien n'est deviné, et rien ne change d'hôte", () => {
    for (const ecran of ["la carte", "rail", "", "http://127.0.0.1:20630/exemple", "https://ailleurs.example/exemple", "//ailleurs.example/exemple", "/\\ailleurs.example", "/deux mots", "/ligne\u0007"]) {
      assert.equal(routeDeLEcran(ecran), null, JSON.stringify(ecran));
      assert.equal(pageDeLEcran(20630, declare(ecran)), null, JSON.stringify(ecran));
    }
  });

  test("la route déclarée dans un corps de PR devient la page à ouvrir, telle que la PR la nomme", () => {
    assert.equal(pageDeLEcran(20591, ecranARegarder({ corps: DECLAREE, changes: [], correspondances: [] })), "http://127.0.0.1:20591/rail");
    assert.equal(pageDeLEcran(20591, ecranARegarder({ corps: corps("Écran : `/rail`"), changes: [], correspondances: [] })), "http://127.0.0.1:20591/rail");
  });
});
