// L'avancement d'un besoin découpé dans le bandeau Backlog (#3480, épique #3473) : la liste de cases à cocher de son issue
// (`- [ ] #<ticket>`, cochée quand le ticket est servi) lue dans son corps par la lecture de GitHub, passée par la sortie
// de ce qui est avant le rail (amont.ts), puis posée sur son étiquette par le bandeau — servis : les lignes cochées ;
// total : toutes. Joué de bout en bout : le corps lu de GitHub (tableau/lecture.ts), la vue du faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { COMMANDE, comprendre, voir } from "../../../src/amont.ts";
import type { AppelGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../../src/tableau/lecture.ts";
import { lectureDuTableau } from "../../../src/tableau/rail.ts";
import { avancementDeLaListe } from "../../../src/vue/backlog/avancement-github.ts";
import { besoinsDuBacklog, poserBandeauBacklog } from "../../../src/vue/backlog-band/backlog-band.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MAINTENANT = Date.parse("2026-11-13T12:00:00.000Z");

const LISTE_2_SUR_5 = ["## Context", "", "Group bookings in one gesture.", "", "- [x] #20", "- [ ] #21", "- [X] #22", "- [ ] #23", "- [ ] #24"].join("\n");
const LISTE_5_SUR_5 = ["- [x] #30", "- [x] #31", "- [x] #32", "- [x] #33", "- [x] #34"].join("\n");

describe("la liste de cases à cocher d'un besoin", () => {
  test("servis : les lignes cochées ; total : toutes", () => {
    assert.deepEqual(avancementDeLaListe(LISTE_2_SUR_5), { servis: 2, total: 5 });
    assert.deepEqual(avancementDeLaListe(LISTE_5_SUR_5), { servis: 5, total: 5 });
  });

  test("un corps sans liste, vide, ou dont les cases ne nomment aucun ticket n'a pas d'avancement — jamais 0/0", () => {
    assert.equal(avancementDeLaListe(""), undefined);
    assert.equal(avancementDeLaListe("Group bookings.\n\n- #20\n- #21\n| #22 | a ticket | taken |"), undefined);
    assert.equal(avancementDeLaListe("- [ ] write the doc\n- [x] ask the chef"), undefined);
  });

  test("une liste citée dans un bloc de code n'en est pas une ; un ticket nommé deux fois compte une fois", () => {
    assert.equal(avancementDeLaListe("```\n- [x] #20\n- [ ] #21\n```"), undefined);
    assert.deepEqual(avancementDeLaListe("- [ ] #20\n- [x] #21\n- [x] #20"), { servis: 2, total: 2 });
  });
});

// Le dépôt `chef/parade` tel que GitHub le rend : trois besoins ouverts sans `fire` — #7 et sa liste de cinq tickets dont
// deux cochés, #8 et ses cinq tous cochés, #9 sans liste —, aucune issue au feu, aucune fermée. Rien ne passe par le
// réseau : GitHub est une doublure, qui répond selon le chemin demandé.
const besoinBrut = (number: number, labels: string[], body: string) => ({ number, title: `Need ${number}`, labels: labels.map((name) => ({ name })), created_at: "2026-11-01T00:00:00Z", html_url: `https://github.com/chef/parade/issues/${number}`, body });
const OUVERTES = [besoinBrut(7, ["epic"], LISTE_2_SUR_5), besoinBrut(8, ["epic"], LISTE_5_SUR_5), besoinBrut(9, [], "## Context\n\nThe dining room is bright.")];
const appeler: AppelGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { status: 200, data: [] };
  if (chemin.includes("/issues?state=closed")) return { status: 200, data: [] };
  if (chemin.includes("/issues?")) return { status: 200, data: OUVERTES };
  if (chemin.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};

describe("l'étiquette d'un besoin, dans le bandeau", () => {
  test("lue de GitHub : 2/5 à côté du besoin à deux lignes cochées sur cinq, 5/5 served pour le tout coché, rien de plus sans liste", async () => {
    const lu = await lireLeTableauDuDepot({ depot: "chef/parade", appeler, maintenant: () => new Date(MAINTENANT) });
    assert.ok(lu.lu, lu.lu ? "" : lu.raison);
    const vu = voir(lectureDuTableau(lu, "parade", 3, [COMMANDE]));
    assert.ok("groupes" in vu, JSON.stringify(vu));
    const bandeau = (poserBandeauBacklog(doc, { vu, besoins: besoinsDuBacklog(vu, [], MAINTENANT), selection: undefined, deplie: false, rouges: 0 }, gestes()) as unknown as Faux | null) ?? assert.fail("pas de bandeau");
    const etiquettes = new Map(bandeau.dessous("button").filter(({ className }) => className === "backlog-tag").map((tag) => [tag.dataset.ticket, tag]));
    const etat = (ticket: number) => etiquettes.get(String(ticket))?.children.at(-1);
    assert.equal(etat(7)?.textContent, "2/5");
    assert.equal(etat(7)?.title, "2 of its 5 tickets served");
    assert.equal(etiquettes.get("7")?.dataset.servi, undefined);
    assert.equal(etat(8)?.textContent, "5/5 served");
    assert.equal(etat(8)?.title, "all 5 of its tickets served");
    assert.equal(etiquettes.get("8")?.dataset.servi, "");
    // Sans liste : son état en mots simples, aucun compte.
    assert.equal(etat(9)?.textContent, "not read yet");
    assert.equal(etat(9)?.title, "");
  });
});

describe("la sortie de ce qui est avant le rail", () => {
  const sortie = (avancement: unknown) => comprendre(JSON.stringify({ lu: "x", depot: "chef/parade", issues: [{ ticket: 7, titre: "t", url: "https://github.com/chef/parade/issues/7", priorite: null, etat: "epique", dit: "d", avancement }] }));

  test("un avancement mal formé refuse la forme entière, jamais un compte inventé", () => {
    for (const faux of [{ servis: 6, total: 5 }, { servis: 0, total: 0 }, { servis: "2", total: 5 }, [2, 5], null]) assert.ok("informe" in sortie(faux), JSON.stringify(faux));
    assert.deepEqual(sortie({ servis: 2, total: 5 }), { lu: "x", depot: "chef/parade", issues: [{ ticket: 7, titre: "t", url: "https://github.com/chef/parade/issues/7", priorite: null, etat: "epique", dit: "d", avancement: { servis: 2, total: 5 } }] });
  });
});

function gestes() {
  return { choisir: () => {}, basculer: () => {}, ouvrirIssue: () => {}, carteDuChef: () => new Faux("div") };
}
