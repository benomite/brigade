// La section Directions du bandeau Backlog (#3590) : les besoins ouverts rangés sous les trois horizons de la vision par leur
// label `horizon:N` — lus de GitHub (tableau/lecture.ts), passés par amont.ts, posés par backlog-band.js. L'ordre des horizons,
// « No direction yet », la ligne d'un horizon vide, le besoin à plusieurs labels (sous le plus petit, jamais deux fois), le
// besoin fermé jamais là, le clic qui ouvre l'issue. GitHub est une doublure.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { comprendre, grouper, voir, type Vu } from "../../src/amont.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { amontDuTableau } from "../../src/tableau/rail.ts";
import { besoinsDuBacklog, poserBandeauBacklog } from "../../src/vue/backlog-band/backlog-band.js";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const LU_LE = new Date("2026-11-13T12:00:00.000Z");
const doc = { createElement: (balise: string) => new Faux(balise) };
type Donnee = Parameters<typeof grouper>[0][number];
const donnee = (ticket: number, autres: Partial<Donnee> = {}): Donnee => ({ ticket, titre: `Need ${ticket}`, url: `https://github.com/${DEPOT}/issues/${ticket}`, priorite: null, etat: "non-lue", dit: "not read", ...autres });
const vu = (issues: Donnee[]): Vu => ({ projet: "parade", demande: 1, a: "x", vide: "", compte: issues.length, lu: "x", groupes: grouper(issues), survol: "x" });
const besoinsDe = (issues: Donnee[]) => besoinsDuBacklog(vu(issues), [], LU_LE.getTime());
const gestes = (ouvrirIssue: (ticket: number) => void = () => {}) => ({ choisir: () => {}, basculer: () => {}, ouvrirIssue, carteDuChef: () => new Faux("li") });

// Les issues ouvertes que GitHub donne, lues jusqu'à la vue.
async function lues(issues: { number: number; labels: string[]; state?: string }[]): Promise<Donnee[]> {
  const brutes = issues.map(({ number, labels }) => ({ number, title: `Issue ${number}`, labels: labels.map((name) => ({ name })), created_at: "2026-11-01T00:00:00Z", body: "" }));
  const appeler: AppelGitHub = async (chemin) => {
    if (chemin.includes("labels=fire")) return { status: 200, data: [] };
    if (chemin.includes("/issues?state=closed")) return { status: 200, data: [] };
    if (chemin.includes("/issues?")) return { status: 200, data: brutes };
    return { status: 200, data: [] };
  };
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => LU_LE });
  assert.ok(lu.lu);
  const amont = comprendre(amontDuTableau(lu) ?? assert.fail("rien avant le rail"));
  return "informe" in amont ? assert.fail(amont.informe) : amont.issues;
}

describe("lecture des labels horizon:N", () => {
  test("un label horizon:N range l'issue sous N ; sans label, aucun horizon ; idea se lit aussi", async () => {
    const issues = await lues([{ number: 1, labels: ["horizon:2"] }, { number: 2, labels: [] }, { number: 3, labels: ["idea", "horizon:3"] }]);
    assert.deepEqual(issues.map(({ ticket, horizon, idee }) => [ticket, horizon, idee]), [[1, 2, undefined], [2, undefined, undefined], [3, 3, true]]);
  });

  test("plusieurs labels horizon : le plus petit seul ; un label horizon:9 n'est pas un horizon", async () => {
    const issues = await lues([{ number: 1, labels: ["horizon:3", "horizon:1", "horizon:2"] }, { number: 2, labels: ["horizon:9"] }]);
    assert.deepEqual(issues.map(({ ticket, horizon }) => [ticket, horizon]), [[1, 1], [2, undefined]]);
  });

  test("amont.ts refuse un horizon hors de 1 à 3", () => {
    const sortie = (horizon: unknown) => JSON.stringify({ lu: "x", depot: DEPOT, issues: [{ ticket: 1, titre: "t", url: "https://github.com/a/b/issues/1", priorite: null, etat: "non-lue", dit: "d", horizon }] });
    assert.ok("issues" in comprendre(sortie(2)));
    assert.match((comprendre(sortie(4)) as { informe: string }).informe, /horizon/);
  });
});

// Les horizons tels que la section les pose : [horizon, nom, tickets] de chaque bloc.
const directionsDuBacklog = (besoins: ReturnType<typeof besoinsDe>) => {
  const bandeau = poserBandeauBacklog(doc, { vu: vu([]), besoins, selection: undefined, deplie: true, rouges: 0 }, gestes()) as unknown as Faux;
  const section = bandeau.dessous("section").find(({ className }) => className === "backlog-band-directions") ?? assert.fail("pas de section Directions");
  return section.dessous("section").map((bloc) => ({ horizon: bloc.dataset.direction === "aucune" ? null : Number(bloc.dataset.direction), nom: bloc.dessous("span")[0]?.textContent, besoins: bloc.dessous("button").map((b) => ({ ticket: Number(b.dataset.ticket) })) }));
};

describe("directionsDuBacklog", () => {
  test("les trois horizons dans l'ordre de la vision, chacun avec ses besoins ; « No direction yet » après eux", () => {
    const directions = directionsDuBacklog(besoinsDe([donnee(1, { horizon: 3 }), donnee(2), donnee(3, { horizon: 1 }), donnee(4, { horizon: 1 }), donnee(5, { horizon: 2 })]));
    assert.deepEqual(directions.map(({ horizon, nom, besoins }) => [horizon, nom, besoins.map(({ ticket }) => ticket).sort()]), [
      [1, "Autonomy now", [3, 4]],
      [2, "Humans as stations", [5]],
      [3, "Any project run on its own", [1]],
      [null, "No direction yet", [2]],
    ]);
  });

  test("un besoin n'est jamais sous deux horizons ; un besoin fermé n'est sous aucun", () => {
    const fermee = donnee(9, { etat: "servie", horizon: 1, tickets: [10], servis: [10], servieLe: "2026-11-13T10:00:00.000Z" });
    const directions = directionsDuBacklog(besoinsDe([donnee(1, { horizon: 2 }), fermee]));
    assert.equal(directions.flatMap(({ besoins }) => besoins).filter(({ ticket }) => ticket === 1).length, 1);
    assert.equal(directions.flatMap(({ besoins }) => besoins).some(({ ticket }) => ticket === 9), false);
  });

  test("sans besoin sans direction, pas de groupe « No direction yet »", () => {
    assert.deepEqual(directionsDuBacklog(besoinsDe([donnee(1, { horizon: 1 })])).map(({ nom }) => nom), ["Autonomy now", "Humans as stations", "Any project run on its own"]);
  });
});

describe("la section Directions, dans la liste dépliée", () => {
  const poser = (issues: Donnee[], ouvrir?: (ticket: number) => void) => poserBandeauBacklog(doc, { vu: vu(issues), besoins: besoinsDe(issues), selection: undefined, deplie: true, rouges: 0 }, gestes(ouvrir)) as unknown as Faux;
  const section = (bandeau: Faux) => bandeau.dessous("section").find(({ className }) => className === "backlog-band-directions") ?? assert.fail("pas de section Directions");

  test("elle vient après les groupes, nomme les horizons dans l'ordre, et dit en une ligne qu'un horizon vide n'a rien", () => {
    const bandeau = poser([donnee(1, { horizon: 1, priorite: 2, etat: "decoupee", tickets: [5, 6], servis: [5] }), donnee(2, { horizon: 3, idee: true }), donnee(3)]);
    const liste = bandeau.dessous("div").find(({ className }) => className === "backlog-band-liste") ?? assert.fail("pas de liste");
    assert.equal(liste.children.at(-1)?.className, "backlog-band-directions");
    const blocs = section(bandeau).dessous("section");
    assert.deepEqual(blocs.map((bloc) => bloc.dessous("span")[0]?.textContent), ["Autonomy now", "Humans as stations", "Any project run on its own", "No direction yet"]);
    assert.deepEqual(blocs.map((bloc) => bloc.dessous("p").map(({ textContent }) => textContent)), [[], ["nothing is attached to this direction"], [], []]);
    // Titre et avancement, ou la marque « idea ».
    assert.deepEqual(blocs[0]?.dessous("button")[0]?.children.map(({ textContent }) => textContent), ["#1", "Need 1", "1/2 served"]);
    assert.deepEqual(blocs[2]?.dessous("button")[0]?.children.map(({ textContent }) => textContent), ["#2", "Need 2", "idea"]);
  });

  test("un clic sur une ligne ouvre son issue", () => {
    const ouverts: number[] = [];
    const bandeau = poser([donnee(1, { horizon: 2 }), donnee(2)], (ticket) => void ouverts.push(ticket));
    const lignes = section(bandeau).dessous("button");
    lignes.find(({ dataset }) => dataset.ticket === "1")?.click();
    lignes.find(({ dataset }) => dataset.ticket === "2")?.click();
    assert.deepEqual(ouverts, [1, 2]);
  });

  test("bandeau replié : pas de section Directions", () => {
    const issues = [donnee(1, { horizon: 1 })];
    const bandeau = poserBandeauBacklog(doc, { vu: vu(issues), besoins: besoinsDe(issues), selection: undefined, deplie: false, rouges: 0 }, gestes()) as unknown as Faux;
    assert.equal(bandeau.dessous("section").some(({ className }) => className === "backlog-band-directions"), false);
  });
});
