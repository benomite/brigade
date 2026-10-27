// La mémoire de la fermeture : ce qu'une passe a laissé faute d'être sûr est
// retenu pour le projet, avec l'empreinte du code autour ; la passe suivante
// ne le repropose pas tant que ce code n'a pas changé — et ce qu'un projet a
// laissé ne retient rien d'un autre.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Base } from "../../src/base.ts";
import { corpsDeLaPR, SANS_MOTIF } from "../../src/closing/brief.ts";
import { candidats } from "../../src/closing/candidates.ts";
import { CONTEXTE, empreinte, memoire, poserLaMemoire, retenir, trier } from "../../src/closing/memory.ts";
import { aArreter, BASE, git, jusqua, repertoireTemporaire } from "../outils.ts";
import { ecrireHistoire } from "./history.ts";
import { cuisineFermee, PROJET, RETIRER_M1 } from "./kitchen.ts";

const textes = (fichiers: Record<string, string>) => ({ textes: Object.entries(fichiers).map(([chemin, texte]) => ({ chemin, texte })) });
// Ce que l'observation repère sur le projet des tests, chaque candidat sous son nom.
const DU_PROJET = new Map(candidats(textes(PROJET)).map((candidat) => [candidat.id, candidat]));
const du = (id: string) => {
  const candidat = DU_PROJET.get(id);
  if (candidat === undefined) throw new Error(`pas de candidat ${id}`);
  return candidat;
};

function baseNeuve(t: Parameters<typeof repertoireTemporaire>[0]): Base {
  const base = new Base(join(repertoireTemporaire(t), "log.db"));
  // Fermée avant que son répertoire disparaisse : Windows ne retire pas un fichier ouvert.
  aArreter(t, () => base.fermer());
  poserLaMemoire(base);
  return base;
}

describe("l'empreinte du code autour d'un candidat", () => {
  // Quarante lignes, toutes différentes : le candidat est à la vingtième.
  const fichier = (lignes: string[]) => new Map([["src/a.ts", lignes.join("\n")]]);
  const quarante = Array.from({ length: 40 }, (_, i) => `const x${i + 1} = ${i + 1};`);
  const avant = empreinte(fichier(quarante), ["src/a.ts:20"]);

  test("des lignes ajoutées plus haut déplacent le candidat, pas ses alentours : l'empreinte, prise à son nouveau lieu, est la même", () => {
    assert.equal(empreinte(fichier(["// en tête", "import { y } from './y.ts';", "", ...quarante]), ["src/a.ts:23"]), avant);
  });

  test("ni une réindentation ni une ligne vide ne changent les alentours", () => {
    const reindente = quarante.map((ligne, i) => (i >= 15 && i < 25 ? `    ${ligne}` : ligne));
    reindente.splice(21, 0, "");
    assert.equal(empreinte(fichier(reindente), ["src/a.ts:20"]), avant);
  });

  test(`une ligne changée à ${CONTEXTE} lignes ou moins du candidat change l'empreinte ; plus loin, non`, () => {
    const aLaLigne = (numero: number) => quarante.map((ligne, i) => (i === numero - 1 ? `${ligne} // changé` : ligne));
    assert.notEqual(empreinte(fichier(aLaLigne(20 + CONTEXTE)), ["src/a.ts:20"]), avant);
    assert.notEqual(empreinte(fichier(aLaLigne(20 - CONTEXTE)), ["src/a.ts:20"]), avant);
    assert.equal(empreinte(fichier(aLaLigne(20 + CONTEXTE + 1)), ["src/a.ts:20"]), avant);
    assert.equal(empreinte(fichier(aLaLigne(20 - CONTEXTE - 1)), ["src/a.ts:20"]), avant);
  });

  test("un doublon a deux lieux : un changement autour de l'un ou de l'autre change son empreinte", () => {
    const deux = new Map([
      ["src/a.ts", quarante.join("\n")],
      ["src/b.ts", quarante.join("\n")],
    ]);
    const lieux = ["src/a.ts:15-22", "src/b.ts:15-22"];
    const reference = empreinte(deux, lieux);
    assert.notEqual(empreinte(new Map([...deux, ["src/b.ts", quarante.map((l, i) => (i === 29 ? "changé();" : l)).join("\n")]]), lieux), reference);
    assert.equal(empreinte(new Map([...deux, ["src/b.ts", quarante.map((l, i) => (i === 39 ? "changé();" : l)).join("\n")]]), lieux), reference);
  });
});

describe("la mémoire, sur une base", () => {
  test("elle est par projet : ce qu'un projet a laissé ne retient rien de ce qui est proposé à un autre", (t) => {
    const base = baseNeuve(t);
    const tous = [...DU_PROJET.values()];
    retenir(base, "alpha", { run: "fermeture-alpha", at: "2026-10-08T10:00:00.000Z", proposes: tous, laisses: tous.map(({ id, quoi }) => ({ id, what: quoi, reason: "pas sûr", before: false })) });

    const beta = trier(base, "beta", tous);
    assert.deepEqual(beta.neufs.map(({ id }) => id), ["D1", "M1", "M2"]);
    assert.deepEqual(beta.deja, []);
    assert.deepEqual(memoire(base, "beta"), []);
    // Et trier pour l'un ne touche pas à la mémoire de l'autre.
    assert.equal(memoire(base, "alpha").length, 3);
    const alpha = trier(base, "alpha", tous);
    assert.deepEqual(alpha.neufs, []);
    assert.deepEqual(alpha.deja.map(({ id }) => id), ["D1", "M1", "M2"]);
  });

  test("ce qui a été écarté avant la passe n'est pas retenu — le closer ne l'a pas jugé —, et ce qu'il a laissé sans motif l'est, dit sans motif", (t) => {
    const base = baseNeuve(t);
    const tous = [...DU_PROJET.values()];
    retenir(base, "alpha", {
      run: "fermeture-alpha",
      at: "2026-10-08T10:00:00.000Z",
      proposes: tous,
      laisses: [
        { id: "M1", what: du("M1").quoi, reason: null, before: false },
        { id: "M2", what: du("M2").quoi, reason: "tenu par le ticket #7", before: true },
      ],
    });
    assert.deepEqual(memoire(base, "alpha"), [{ cle: du("M1").cle, location: ["src/libre/outils.ts:2"], reason: SANS_MOTIF, empreinte: du("M1").empreinte, run: "fermeture-alpha", at: "2026-10-08T10:00:00.000Z" }]);
  });

  test("une entrée dont le code autour a changé, ou que l'observation ne repère plus, est retirée de la mémoire", (t) => {
    const base = baseNeuve(t);
    const tous = [...DU_PROJET.values()];
    retenir(base, "alpha", { run: "fermeture-alpha", at: "2026-10-08T10:00:00.000Z", proposes: tous, laisses: tous.map(({ id, quoi }) => ({ id, what: quoi, reason: "pas sûr", before: false })) });

    // M1 a changé autour, M2 n'est plus repéré, D1 n'a pas bougé.
    const change = { ...du("M1"), empreinte: "autre" };
    const { neufs, deja } = trier(base, "alpha", [du("D1"), change]);
    assert.deepEqual(neufs, [change]);
    assert.deepEqual(deja.map(({ id }) => id), ["D1"]);
    assert.deepEqual(memoire(base, "alpha").map(({ cle }) => cle), [du("D1").cle]);
  });

  test("un passage copié trois fois fait deux doublons sous la même clé : laissés tous deux, ils sont retenus tous deux, chacun à ses lieux", (t) => {
    const base = baseNeuve(t);
    const premier = du("D1");
    const second = { ...premier, id: "D2", lieux: ["src/libre/a.ts:1-8", "src/libre/c.ts:1-8"], empreinte: "celle de c.ts" };
    const deux = [premier, second];
    retenir(base, "alpha", { run: "fermeture-alpha", at: "2026-10-08T10:00:00.000Z", proposes: deux, laisses: deux.map(({ id, quoi }) => ({ id, what: quoi, reason: "pas sûr", before: false })) });
    assert.equal(memoire(base, "alpha").length, 2);
    const { neufs, deja } = trier(base, "alpha", deux);
    assert.deepEqual(neufs, []);
    assert.deepEqual(deja.map(({ id }) => id), ["D1", "D2"]);
  });
});

test("la PR d'une passe dit combien de candidats ne lui ont pas été reproposés, et rien quand il n'y en a pas", () => {
  const passe = { run: "fermeture-0000abcd", base: "v2", calibration: { model: "opus", effort: "high" }, proposes: [du("M1")], laisses: [], ecartes: [], retirees: 1, ajoutees: 0, cap: 120, fichiers: ["src/libre/outils.ts"], compteRendu: null };
  assert.match(corpsDeLaPR({ ...passe, deja: 2 }), /\n\n2 candidats laissés par une passe précédente, sans que le code autour ait changé depuis, n'ont pas été reproposés au closer\./);
  assert.match(corpsDeLaPR({ ...passe, deja: 1 }), /\n\n1 candidat laissé par une passe précédente, sans que le code autour ait changé depuis, n'a pas été reproposé au closer\./);
  assert.doesNotMatch(corpsDeLaPR(passe), /reproposé/);
});

describe("la mémoire, en cuisine", { concurrency: 4 }, () => {
  test("après une passe livrée, la mémoire du projet contient ce que le closer a laissé — son lieu, son motif, l'empreinte de ses alentours —, et rien de ce qu'il a retiré", async (t) => {
    const { demander, fin, closer, runtime } = cuisineFermee(t);
    closer.gestes(RETIRER_M1);
    closer.message("<livrable>\nRetiré : M1.\nLAISSÉ D1 : les deux suites évoluent à part\n</livrable>\n");

    assert.equal((await demander()).code, 0);
    const passe = await fin();
    assert.equal(passe.outcome, "delivered");
    assert.deepEqual(
      memoire(runtime.journal.base, "brigade").map(({ cle, location, reason, empreinte: e, run }) => ({ cle, location, reason, empreinte: e, run })),
      [
        { cle: du("D1").cle, location: ["src/libre/a.ts:1-8", "src/libre/b.ts:1-8"], reason: "les deux suites évoluent à part", empreinte: du("D1").empreinte, run: passe.run },
        { cle: du("M2").cle, location: ["src/tenu/outils.ts:2"], reason: SANS_MOTIF, empreinte: du("M2").empreinte, run: passe.run },
      ],
    );
  });

  test("à la passe suivante, ce qui a été laissé sans que le code autour change n'est pas reproposé ; ce dont le code autour a changé l'est, et son entrée est remplacée", async (t) => {
    const cuisine = cuisineFermee(t);
    const { demander, fin, closer, runtime, types, dernier, clone, avertissements } = cuisine;
    const lue = () => memoire(runtime.journal.base, "brigade");
    closer.message("<livrable>\nLAISSÉ D1 : deux modules qui évoluent à part\nLAISSÉ M1 : appelé par un script hors du dépôt\nLAISSÉ M2 : lu par convention\n</livrable>\n");

    // La première passe laisse tout.
    assert.equal((await demander()).code, 0);
    const premiere = await fin();
    assert.equal(premiere.outcome, "nothing");
    const retenue = lue();
    assert.deepEqual(
      retenue.map(({ cle, reason }) => [cle, reason]),
      [
        [du("D1").cle, "deux modules qui évoluent à part"],
        [du("M1").cle, "appelé par un script hors du dépôt"],
        [du("M2").cle, "lu par convention"],
      ],
    );

    // La deuxième : rien n'a changé, rien ne lui est reproposé — elle ne part pas, et dit pourquoi.
    assert.equal((await demander()).code, 0);
    await jusqua(() => types().includes("closing.refused"));
    assert.deepEqual([dernier("closing.refused")?.reason, dernier("closing.refused")?.detail], ["nothing", "les 3 candidats de l'observation ont tous été laissés par une passe précédente, sans que le code autour d'eux ait changé depuis"]);
    assert.match(avertissements.join("\n"), /passe de fermeture refusée — rien à ranger — les 3 candidats de l'observation ont tous été laissés par une passe précédente/);
    assert.equal(closer.lancements().length, 1);
    assert.deepEqual(lue(), retenue);

    // Le code autour de M1 change sur la base : seul M1 lui est reproposé.
    ecrireHistoire(clone, [{ commit: { "src/libre/outils.ts": "export function vivant() { return 10; }\nexport function inutile() { return 2; }\n" } }]);
    git(clone, "push", "-q", "origin", `refs/remotes/origin/${BASE}:refs/heads/${BASE}`);
    closer.message("<livrable>\nLAISSÉ M1 : toujours appelé par le script de déploiement\n</livrable>\n");
    assert.equal((await demander()).code, 0);
    await jusqua(() => types().filter((type) => type === "closing.ended").length === 2);
    const troisieme = dernier("closing.ended");
    assert.equal(troisieme?.outcome, "nothing");
    assert.equal(dernier("closing.started")?.candidates, 1);
    assert.match(closer.consigne(), /- M1 — export `inutile`/);
    assert.doesNotMatch(closer.consigne(), /- D1 —|- M2 —/);
    assert.deepEqual(troisieme?.kept?.map(({ id }) => id), ["M1"]);
    // Son ancienne entrée est remplacée : la nouvelle porte le nouveau motif,
    // l'empreinte du code tel qu'il est, et la troisième passe.
    const m1 = lue().find(({ cle }) => cle === du("M1").cle);
    const ancienne = retenue.find(({ cle }) => cle === du("M1").cle);
    assert.equal(m1?.reason, "toujours appelé par le script de déploiement");
    assert.equal(m1?.run, troisieme?.run);
    assert.notEqual(m1?.empreinte, ancienne?.empreinte);
    // Les deux autres n'ont pas bougé.
    assert.deepEqual(
      lue().filter(({ cle }) => cle !== du("M1").cle),
      retenue.filter(({ cle }) => cle !== du("M1").cle),
    );
  });

  test("ce qu'un autre projet a laissé, au même code, ne retient rien de ce qui est proposé à celui-ci", async (t) => {
    const { demander, fin, closer, runtime, dernier } = cuisineFermee(t);
    const tous = [...DU_PROJET.values()];
    retenir(runtime.journal.base, "autre", { run: "fermeture-autre", at: "2026-10-08T09:00:00.000Z", proposes: tous, laisses: tous.map(({ id, quoi }) => ({ id, what: quoi, reason: "pas sûr", before: false })) });
    closer.gestes(RETIRER_M1);

    assert.equal((await demander()).code, 0);
    assert.equal((await fin()).outcome, "delivered");
    assert.equal(dernier("closing.started")?.candidates, 3);
    assert.match(closer.consigne(), /- D1 —[\s\S]*- M1 —[\s\S]*- M2 —/);
    assert.equal(memoire(runtime.journal.base, "autre").length, 3);
  });
});
