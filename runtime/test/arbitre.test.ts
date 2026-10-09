// L'arbitre entre projets : la règle de partage à nu, puis l'arbitre lui-même —
// ce qu'il garde, ce qu'il oublie en redémarrant, et ce qu'il répond sur son port.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { decider, encore, ouvrirArbitre, ouvrirReglages, servirArbitre, type Mot, type Vue } from "../src/arbitre.ts";
import { ArbitreInjoignable, configArbitrage, joindreArbitre } from "../src/arbitrage.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const vue = (projet: string, cooks: number, autres: Partial<Vue> = {}): Vue => ({ projet, poids: 1, cooks, demande: true, machine: false, entendu: true, ...autres });
const mot = (cooks: number, autres: Partial<Mot> = {}): Mot => ({ cooks, demande: true, machine: false, nonArbitres: 0, consommation: { jour: 0, semaine: 0 }, ...autres });

describe("la règle de partage", () => {
  test("sous sa part, un projet passe ; au plafond du compte, personne", () => {
    assert.deepEqual(decider(10, [vue("a", 4), vue("b", 5)], "a"), { accorde: true, motif: null });
    assert.deepEqual(decider(10, [vue("a", 4), vue("b", 6)], "a"), { accorde: false, motif: "compte" });
  });

  test("au-delà de sa part, un projet emprunte les places que personne ne demande, pas celles qui restent dues", () => {
    // B ne demande rien : ses places se prêtent.
    assert.equal(decider(10, [vue("a", 7), vue("b", 0, { demande: false })], "a").accorde, true);
    // B demande, et il lui en reste cinq dues : A, à cinq, n'en prend pas une de plus.
    assert.deepEqual(decider(10, [vue("a", 5), vue("b", 0)], "a"), { accorde: false, motif: "part" });
    // B a ses cinq : ce qu'il ne peut pas prendre n'est dû à personne… mais le compte est plein.
    assert.deepEqual(decider(10, [vue("a", 5), vue("b", 5)], "a"), { accorde: false, motif: "compte" });
    // B en tient trois et demande : deux lui restent dues, sur les deux libres.
    assert.equal(decider(10, [vue("a", 5), vue("b", 3)], "a").accorde, false);
    assert.equal(decider(10, [vue("a", 5), vue("b", 3)], "b").accorde, true);
  });

  test("les poids font les parts, et personne n'a moins d'une place", () => {
    const vues = [vue("a", 0, { poids: 3 }), vue("b", 0)];
    assert.deepEqual([encore(8, vues, "a"), encore(8, vues, "b")], [6, 2]);
    // Vingt contre un, sur quatre places : le petit garde la sienne.
    const inegales = [vue("a", 3, { poids: 20 }), vue("b", 0)];
    assert.equal(decider(4, inegales, "a").accorde, false);
    assert.equal(decider(4, inegales, "b").accorde, true);
  });

  test("un projet connu qui n'a pas reparlé garde sa part réservée : personne ne l'emprunte", () => {
    const vues = [vue("a", 5), vue("b", 0, { entendu: false, demande: false })];
    assert.deepEqual(decider(10, vues, "a"), { accorde: false, motif: "part" });
    assert.equal(decider(10, [vue("a", 4), vues[1] as Vue], "a").accorde, true);
  });

  test("machine saturée : le plafond devient le nombre de cooks en cours, celui qui l'a prise ne relance pas, celui qui attend passe", () => {
    // A tient les dix cooks de la machine ; B attend, retenu par elle. Un cook de A finit.
    const sature = [vue("a", 9), vue("b", 0, { machine: true })];
    assert.deepEqual(decider(50, sature, "a"), { accorde: false, motif: "machine" });
    // La station de B voit la machine respirer : elle demande, et ne se dit plus retenue.
    assert.equal(decider(50, [vue("a", 9), vue("b", 0)], "b").accorde, true);
    // Tant qu'un autre se dit retenu par la machine, un projet sous sa part effective passe encore.
    assert.equal(decider(50, [vue("a", 9), vue("b", 0, { machine: true }), vue("c", 0)], "c").accorde, true);
    // Sans personne derrière, « machine saturée » ne retient rien : la station se retient seule.
    assert.equal(decider(50, [vue("a", 9, { machine: true, demande: false }), vue("b", 0)], "b").accorde, true);
  });

  test("ce qui est encore autorisé se compte en rejouant la décision", () => {
    assert.equal(encore(10, [vue("a", 2), vue("b", 0, { demande: false })], "a"), 8);
    assert.equal(encore(10, [vue("a", 2), vue("b", 1)], "a"), 3);
    assert.equal(encore(10, [vue("a", 9), vue("b", 0, { machine: true })], "a"), 0);
  });
});

function arbitre(t: TestContext, plafond = 10, repertoire = repertoireTemporaire(t)) {
  const ouvert = ouvrirArbitre({ repertoire, plafond, maintenant: horloge() });
  t.after(() => ouvert.fermer());
  return { ouvert, repertoire };
}

describe("l'arbitre", () => {
  test("il compte ce que chaque projet lui redit, et une place accordée est comptée tout de suite", (t) => {
    const { ouvert } = arbitre(t, 4);
    ouvert.dire("a", mot(1));
    assert.equal(ouvert.demander("b", mot(0)).accorde, true);
    assert.equal(ouvert.demander("b", mot(1)).accorde, true);
    // B en tient deux, sa part : la troisième reste due à A, qui demande.
    assert.deepEqual(ouvert.demander("b", mot(2)), { accorde: false, motif: "part" });
    const etat = ouvert.etat();
    assert.deepEqual([etat.plafond, etat.cooks, etat.saturePar], [4, 3, []]);
    assert.deepEqual(
      etat.projets.map(({ projet, presence, cooks, part, encore }) => [projet, presence, cooks, part, encore]),
      [
        ["a", "entendu", 1, 2, 1],
        ["b", "entendu", 2, 2, 0],
      ],
    );
  });

  test("il redémarre vide : les projets connus tiennent leur part sans avoir reparlé, jusqu'à ce qu'ils reparlent", (t) => {
    const { ouvert, repertoire } = arbitre(t, 10);
    ouvert.dire("a", mot(5));
    ouvert.dire("b", mot(0, { demande: false }));
    ouvert.fermer();

    const revenu = ouvrirArbitre({ repertoire, plafond: 10, maintenant: horloge("2026-10-09T08:00:00.000Z") });
    t.after(() => revenu.fermer());
    assert.deepEqual(
      revenu.etat().projets.map(({ projet, presence, depuis, cooks, part }) => [projet, presence, depuis, cooks, part]),
      [
        ["a", "muet", "2026-10-09T08:00:00.000Z", null, 5],
        ["b", "muet", "2026-10-09T08:00:00.000Z", null, 5],
      ],
    );
    // A reparle : à cinq, sa part ; celle de B, muet, ne s'emprunte pas.
    assert.deepEqual(revenu.demander("a", mot(5)), { accorde: false, motif: "part" });
    // B reparle, et ne demande rien : ses places se prêtent.
    revenu.dire("b", mot(0, { demande: false }));
    assert.equal(revenu.demander("a", mot(5)).accorde, true);
  });

  test("un projet qui s'arrête proprement rend sa part, et le reste après un redémarrage de l'arbitre", (t) => {
    const { ouvert, repertoire } = arbitre(t, 10);
    ouvert.dire("a", mot(5));
    ouvert.dire("b", mot(2));
    ouvert.quitter("b");
    assert.equal(ouvert.demander("a", mot(5)).accorde, true);
    assert.deepEqual(ouvert.etat().projets.map(({ projet, presence }) => [projet, presence]), [["a", "entendu"], ["b", "absent"]]);
    ouvert.fermer();

    const revenu = ouvrirArbitre({ repertoire, plafond: 10, maintenant: horloge() });
    t.after(() => revenu.fermer());
    assert.deepEqual(revenu.etat().projets.map(({ projet, presence }) => [projet, presence]), [["a", "muet"], ["b", "absent"]]);
  });

  test("le chef règle les poids et retire un projet depuis son propre process : l'arbitre le lit à la décision suivante", (t) => {
    const { ouvert, repertoire } = arbitre(t, 8);
    ouvert.dire("a", mot(4));
    ouvert.dire("b", mot(0));
    assert.equal(ouvert.demander("a", mot(4)).accorde, false);

    const reglages = ouvrirReglages(repertoire);
    t.after(() => reglages.fermer());
    reglages.peser("a", 3, "2026-10-09T09:00:00.000Z");
    assert.equal(ouvert.demander("a", mot(4)).accorde, true);
    assert.deepEqual(ouvert.etat().projets.map(({ projet, poids, part }) => [projet, poids, part]), [["a", 3, 6], ["b", 1, 2]]);

    // Un projet retiré ne tient plus rien.
    assert.equal(reglages.retirer("b"), true);
    assert.equal(reglages.retirer("b"), false);
    assert.deepEqual(ouvert.etat().projets.map(({ projet }) => projet), ["a"]);
    assert.equal(ouvert.demander("a", mot(7)).accorde, true);
  });

  test("un poids réglé d'avance ne réserve rien : le projet n'a de part qu'une fois entendu", (t) => {
    const { ouvert, repertoire } = arbitre(t, 10);
    const reglages = ouvrirReglages(repertoire);
    t.after(() => reglages.fermer());
    reglages.peser("thermigo", 3, "2026-10-09T09:00:00.000Z");
    ouvert.dire("a", mot(8));
    assert.equal(ouvert.demander("a", mot(8)).accorde, true);
    ouvert.dire("thermigo", mot(0));
    assert.deepEqual(ouvert.etat().projets.map(({ projet, presence, poids }) => [projet, presence, poids]), [["a", "entendu", 1], ["thermigo", "entendu", 3]]);
  });

  test("il dit qui se retient pour la machine, les cooks partis sans lui, et la consommation des cooks telle qu'on la lui redit", (t) => {
    const { ouvert } = arbitre(t, 50);
    ouvert.dire("a", mot(9, { nonArbitres: 1, consommation: { jour: 1200, semaine: 9000 } }));
    ouvert.dire("b", mot(0, { machine: true }));
    const etat = ouvert.etat();
    assert.deepEqual(etat.saturePar, ["b"]);
    assert.deepEqual(
      etat.projets.map(({ projet, nonArbitres, consommation, part, encore }) => [projet, nonArbitres, consommation, part, encore]),
      [
        ["a", 1, { jour: 1200, semaine: 9000 }, 4, 0],
        ["b", 0, { jour: 0, semaine: 0 }, 4, 4],
      ],
    );
  });

  test("un second arbitre sur le même répertoire est refusé", (t) => {
    const { repertoire } = arbitre(t);
    assert.throws(() => ouvrirArbitre({ repertoire, plafond: 10 }), /un arbitre tient déjà/);
  });
});

describe("l'arbitre sur son port", () => {
  async function servi(t: TestContext, plafond = 10) {
    const { ouvert, repertoire } = arbitre(t, plafond);
    const serveur = await servirArbitre(ouvert, 0);
    t.after(() => serveur.fermer());
    return { ouvert, repertoire, serveur, client: joindreArbitre(serveur.port) };
  }

  test("un runtime redit son état, demande une place, lit l'état, et s'en va", async (t) => {
    const { client } = await servi(t, 2);
    assert.deepEqual(await client.echanger("brigade", { ...mot(1), veut: false }), { accorde: null, motif: null });
    assert.deepEqual(await client.echanger("thermigo", { ...mot(0), veut: true }), { accorde: true, motif: null });
    assert.deepEqual(await client.echanger("thermigo", { ...mot(1), veut: true }), { accorde: false, motif: "compte" });
    assert.deepEqual((await client.etat()).projets.map(({ projet, cooks }) => [projet, cooks]), [["brigade", 1], ["thermigo", 1]]);
    await client.quitter("thermigo");
    assert.deepEqual((await client.etat()).projets.map(({ projet, presence }) => [projet, presence]), [["brigade", "entendu"], ["thermigo", "absent"]]);
  });

  test("ce qu'il ne comprend pas est refusé, sans rien compter", async (t) => {
    const { serveur, client } = await servi(t);
    const poster = (chemin: string, corps: string) => fetch(`http://127.0.0.1:${serveur.port}${chemin}`, { method: "POST", body: corps }).then((reponse) => reponse.status);
    assert.equal(await poster("/projets/Pas%20Un%20Nom", JSON.stringify({ ...mot(1), veut: false })), 400);
    assert.equal(await poster("/projets/brigade", "pas du json"), 400);
    assert.equal(await poster("/projets/brigade", JSON.stringify({ ...mot(-1), veut: false })), 400);
    assert.equal(await poster("/ailleurs", "{}"), 404);
    assert.deepEqual((await client.etat()).projets, []);
  });

  test("un arbitre qui n'est plus là se constate : la connexion est refusée", async (t) => {
    const { serveur, client } = await servi(t);
    await serveur.fermer();
    await assert.rejects(client.echanger("brigade", { ...mot(0), veut: true }), ArbitreInjoignable);
    await assert.rejects(client.etat(), ArbitreInjoignable);
  });
});

test("l'arbitre se désigne par l'environnement : aucun défaut, et une valeur illisible est un refus", () => {
  assert.equal(configArbitrage({}), null);
  assert.equal(configArbitrage({ BRIGADE_ARBITER_PORT: "" }), null);
  assert.equal(configArbitrage({ BRIGADE_ARBITER_PORT: "20900" }), 20900);
  for (const illisible of ["0", "70000", "vingt", "20900.5"]) {
    assert.throws(() => configArbitrage({ BRIGADE_ARBITER_PORT: illisible }), ConfigInvalide);
  }
});
