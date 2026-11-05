// Les stations d'un projet sur GitHub seul, d'après ses prises et le signe de vie de chacune (#2358) : une station qui
// tient un ticket cuit, une station fraîche sans ticket attend, une station tue ne se dit pas atteinte — la box comme
// un ordinateur, par la même règle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RAFRAICHI_MS } from "../../src/enregistrement-station/contrat.ts";
import { machineDe as machineDuProjet } from "../../src/projets/preparer.ts";
import { machineDe, stationDe, stationsSurGithub, type SigneDeVie } from "../../src/stations-github/stations.ts";

const MAINTENANT = Date.parse("2026-11-05T10:00:00.000Z");
const DEPOT = "chef/parade";
const signe = (name: string, lastSeen: string, autres: Partial<SigneDeVie> = {}): SigneDeVie => ({ name, lastSeen, stoppedAt: null, refreshMs: RAFRAICHI_MS, selection: [DEPOT], ...autres });

describe("les stations d'un projet sur GitHub seul", () => {
  test("une qui cuit, une qui attend, une tue : trois états, par la même règle pour la box et les ordinateurs", () => {
    const stations = stationsSurGithub({
      depot: DEPOT,
      prises: [
        { ticket: 30, titre: "La pass verte", station: "box/claude", le: "2026-11-05T09:12:00.000Z" },
        { ticket: 14, titre: "Le journal", station: "box/claude", le: "2026-11-05T09:52:00.000Z" },
      ],
      signes: [signe("box", "2026-11-05T09:59:00.000Z"), signe("MacBook Pro", "2026-11-05T09:58:30.000Z"), signe("PC du salon", "2026-11-03T18:40:00.000Z")],
      maintenant: MAINTENANT,
    });
    assert.deepEqual(stations, [
      { station: "box/claude", nom: "box", etat: "cooking", atteinte: true, cooks: [{ ticket: 30, titre: "La pass verte" }, { ticket: 14, titre: "Le journal" }], signeDeVie: "2026-11-05T09:59:00.000Z" },
      { station: "macbook-pro/claude", nom: "MacBook Pro", etat: "idle", atteinte: true, cooks: [], signeDeVie: "2026-11-05T09:58:30.000Z" },
      { station: "pc-du-salon/claude", nom: "PC du salon", etat: "silent", atteinte: false, cooks: [], signeDeVie: "2026-11-03T18:40:00.000Z" },
    ]);
  });

  test("le Mac qui tient un ticket se dit en cuisine, avec ce ticket", () => {
    const [mac] = stationsSurGithub({ depot: DEPOT, prises: [{ ticket: 16, titre: "Le menu", station: "macbook-pro/claude", le: "2026-11-05T09:31:00.000Z" }], signes: [signe("MacBook Pro", "2026-11-05T09:59:00.000Z")], maintenant: MAINTENANT });
    assert.equal(mac?.etat, "cooking");
    assert.deepEqual(mac?.cooks, [{ ticket: 16, titre: "Le menu" }]);
  });

  test("une station arrêtée proprement n'est pas atteinte, même fraîche ; une qui tient encore un ticket cuit, sans être atteinte", () => {
    const stations = stationsSurGithub({
      depot: DEPOT,
      prises: [{ ticket: 16, titre: "Le menu", station: "atelier/claude", le: "2026-11-05T08:00:00.000Z" }],
      signes: [signe("box", "2026-11-05T09:59:00.000Z", { stoppedAt: "2026-11-05T09:59:00.000Z" }), signe("atelier", "2026-11-05T08:10:00.000Z")],
      maintenant: MAINTENANT,
    });
    assert.deepEqual(
      stations.map(({ station, etat, atteinte }) => ({ station, etat, atteinte })),
      [
        { station: "atelier/claude", etat: "cooking", atteinte: false },
        { station: "box/claude", etat: "silent", atteinte: false },
      ],
    );
  });

  test("une station que l'app n'a pas choisie pour ce dépôt n'en est pas, tant qu'elle n'en tient aucun ticket", () => {
    const stations = stationsSurGithub({ depot: "Chef/Parade", prises: [], signes: [signe("box", "2026-11-05T09:59:00.000Z"), signe("mac", "2026-11-05T09:59:00.000Z", { selection: ["chef/cantine"] }), signe("pc", "2026-11-05T09:59:00.000Z", { selection: null })], maintenant: MAINTENANT });
    assert.deepEqual(stations.map(({ station }) => station), ["box/claude"]);
  });

  test("sans signe de vie lu : les stations qui tiennent un ticket, sans rien dire de leur présence", () => {
    assert.deepEqual(stationsSurGithub({ depot: DEPOT, prises: [{ ticket: 3, titre: "Trois", station: "box/claude", le: "2026-11-05T09:00:00.000Z" }], signes: null, maintenant: MAINTENANT }), [
      { station: "box/claude", nom: null, etat: "cooking", atteinte: null, cooks: [{ ticket: 3, titre: "Trois" }], signeDeVie: null },
    ]);
  });

  test("deux enregistrements de la même machine : le plus frais l'emporte", () => {
    const [box] = stationsSurGithub({ depot: DEPOT, prises: [], signes: [signe("box", "2026-11-01T09:00:00.000Z"), signe("Box", "2026-11-05T09:59:00.000Z")], maintenant: MAINTENANT });
    assert.deepEqual({ etat: box?.etat, signeDeVie: box?.signeDeVie }, { etat: "idle", signeDeVie: "2026-11-05T09:59:00.000Z" });
  });

  test("le nom d'une station est celui sous lequel le projet la déclare", () => {
    for (const nom of ["box", "MacBook Pro de Benoît", "PC — salon", "---"]) assert.equal(machineDe(nom), machineDuProjet(nom));
    assert.equal(stationDe("MacBook Pro"), "macbook-pro/claude");
  });
});
