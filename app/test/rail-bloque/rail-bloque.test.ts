// Le rail bloqué dans l'app (ticket 3358) : la ligne en tête du rail — combien, depuis combien de temps, la cause, et
// le geste quand il y en a un —, le projet « stuck » sur « Tous les projets », et rien de tout cela pour un projet calme.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diagnostiquer, MOTS_DU_GESTE, type RailBloque, type StationDuCompte } from "../../../runtime/src/rail-bloque/rail-bloque.ts";
import { ligneDeProjet } from "../../src/accueil.ts";
import { comprendre, tableau, type Faits } from "../../src/faits.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type TableauLu } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { etatDeLaLigne, ETATS } from "../../src/vue/accueil/projets/projets.js";
import { GESTES, ligneDuRailBloque } from "../../src/vue/rail-bloque/ligne-du-rail-bloque.js";
import { railBloqueLu } from "../../src/vue/rail-bloque/rail-bloque.ts";
import { avecLeRail, type RailSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "chef/secondes";
const LU = "2026-11-12T02:30:00.000Z";
const MAINTENANT = Date.parse(LU);
const POSE = "2026-11-11T12:25:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: "2026-11-12T02:29:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: [DEPOT], ...autres });
const HUIT = [4, 5, 6, 7, 8, 9, 10, 11].map((ticket) => ({ ticket, depuis: POSE }));
const bloque = (lues: StationDuCompte[]) => diagnostiquer({ depot: DEPOT, nonPris: HUIT, stations: { lues }, maintenant: MAINTENANT }) as RailBloque;

// La lecture vide d'un projet sur GitHub seul (tableau/lecture.ts, `vide`), puis son rail.
const VIDE: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: LU,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: LU, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const rail = (nonPris: RailSurGithub["nonPris"]): RailSurGithub => ({ lu: LU, tickets: HUIT.map(({ ticket }) => ({ ticket, titre: `Ticket ${ticket}`, url: "", etat: "en attente", priorite: null, creeLe: POSE, pr: null, prise: null })), ...(nonPris === undefined ? {} : { nonPris }) });
const faitsDe = (lu: TableauLu) => comprendre(JSON.stringify(lu.faits)) as Faits;

describe("la ligne en tête du rail", () => {
  test("le compte, la durée et la cause, marqués FAULT ; le geste est le bouton recommandé, qui ouvre Stations", () => {
    const appels: string[] = [];
    const [ligne] = ligneDuRailBloque(doc, bloque([station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })]), { ouvrirStations: () => appels.push("stations") }) as unknown as Faux[];
    assert.ok(ligne !== undefined);
    assert.equal(ligne.role, "alert");
    assert.deepEqual(ligne.children.map((enfant) => enfant.textContent), ["FAULT", "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped.", "Start the station"]);
    const [bouton] = ligne.dessous("button");
    assert.equal(bouton?.className, "recommande");
    bouton?.click();
    assert.deepEqual(appels, ["stations"]);
    assert.match(ligne.title, /^#4, #5, #6, #7, #8, #9, #10, #11 — no manager has taken them\.$/);
  });

  test("aucune station ne le sert : « Add the project to a station »", () => {
    const [ligne] = ligneDuRailBloque(doc, bloque([]), { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.match(ligne?.textContent ?? "", /no station serves this project\.Add the project to a station$/);
  });

  test("sans geste — le manager tourne mais ne prend rien —, ou en lecture seule : aucun bouton", () => {
    const [muet] = ligneDuRailBloque(doc, bloque([station()]), { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.equal(muet?.textContent, "FAULT8 tickets on the rail, no manager has taken them for 14 h: the manager runs on box/claude but takes nothing.");
    assert.deepEqual(muet?.dessous("button"), []);
    const [seule] = ligneDuRailBloque(doc, bloque([]), null) as unknown as Faux[];
    assert.deepEqual(seule?.dessous("button"), []);
  });

  test("les mots des gestes sont ceux du runtime : le bouton dit ce que la phrase de `status` dit", () => {
    assert.deepEqual(GESTES, MOTS_DU_GESTE);
  });

  test("rien de bloqué, ou des tickets non pris qui ne se lisent pas : aucune ligne sur le rail", () => {
    assert.deepEqual(ligneDuRailBloque(doc, undefined, { ouvrirStations: () => {} }), []);
    assert.deepEqual(ligneDuRailBloque(doc, { illisible: "GitHub answered HTTP 502" }, { ouvrirStations: () => {} }), []);
  });
});

describe("ce que la lecture du rail en pose dans `facts`", () => {
  test("des tickets non pris au-delà du délai : `railBloque` traverse `facts` jusqu'au tableau du rail", () => {
    const lu = avecLeRail(VIDE, rail(HUIT), { lus: [station({ selection: ["chef/autre"] })] });
    const faits = faitsDe(lu);
    assert.equal(faits.railBloque !== undefined && "phrase" in faits.railBloque ? faits.railBloque.phrase : "", "8 tickets on the rail, no manager has taken them for 14 h: no station serves this project. Add the project to a station.");
    assert.deepEqual(tableau(faits).railBloque, faits.railBloque);
  });

  test("aucun ticket non pris, ou le délai pas encore passé : pas de `railBloque`, ni de ligne dans `status`", () => {
    for (const nonPris of [[], [{ ticket: 4, depuis: new Date(MAINTENANT - 60_000).toISOString() }]]) {
      const lu = avecLeRail(VIDE, rail(nonPris), { lus: [] });
      assert.equal(faitsDe(lu).railBloque, undefined);
      assert.doesNotMatch(statusDuTableau(lu), /STUCK RAIL/);
    }
  });

  test("des tickets non pris qui ne se lisent pas : le `status` de l'app le dit sous la tête du bloc `awaiting`", () => {
    const lu = avecLeRail(VIDE, rail({ illisible: "GitHub answered HTTP 502" }), { lus: [] });
    assert.deepEqual(faitsDe(lu).railBloque, { illisible: "GitHub answered HTTP 502" });
    assert.match(statusDuTableau(lu), /^awaiting {3}nothing awaits the chef\n {2}STUCK RAIL {2}not checked: the `fire` tickets of chef\/secondes could not be read on GitHub — GitHub answered HTTP 502\nend awaiting$/m);
  });

  test("un `railBloque` mal formé n'est pas posé", () => {
    for (const brut of [null, "x", [], { illisible: "" }, { tickets: [], depuis: POSE, cause: "arretee", stations: [], geste: null, constat: "a", phrase: "a" }, { ...bloque([]), cause: "autre" }, { ...bloque([]), geste: "autre" }]) {
      assert.deepEqual(railBloqueLu(brut), {}, JSON.stringify(brut));
    }
  });
});

describe("la lecture du rail sur GitHub", () => {
  const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: "", body: "", created_at: POSE, labels: labels.map((name) => ({ name })) });
  const github = (refuse: (chemin: string) => boolean): AppelGitHub => async (chemin) => {
    if (refuse(chemin)) return { status: 502, data: {} };
    if (chemin === FEUX) return { status: 200, data: [issue(4, ["fire"]), issue(5, ["fire", "model:opus", "effort:medium"])] };
    if (chemin.endsWith("/events?per_page=100")) return { status: 200, data: [{ event: "labeled", label: { name: "fire" }, created_at: POSE }] };
    return { status: 200, data: chemin === `/repos/${DEPOT}` ? { permissions: { push: true } } : [] };
  };

  test("le ticket en attente que rien ne calibre : ses commentaires et ses événements se lisent, et il bloque le rail", async () => {
    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github(() => false), maintenant: () => new Date(LU), signes: async () => ({ lus: [] }) });
    assert.ok(lu.lu);
    const railBloque = faitsDe(lu).railBloque;
    assert.deepEqual(railBloque !== undefined && "tickets" in railBloque ? railBloque.tickets : [], [4]);
  });

  test("ses commentaires refusés : le rail reste lu, et ce qui n'a pas été vérifié est dit", async () => {
    const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github((chemin) => chemin.includes("/issues/4/comments")), maintenant: () => new Date(LU), signes: async () => ({ lus: [] }) });
    assert.ok(lu.lu, lu.lu ? "" : lu.raison);
    assert.equal((lu.faits.compteurs as { rail: number }).rail, 2);
    assert.deepEqual(faitsDe(lu).railBloque, { illisible: "GitHub answered HTTP 502" });
  });
});

describe("« Tous les projets »", () => {
  const ligne = (lu: TableauLu, servi = true) => ligneDeProjet({ nom: "secondes", servi }, { a: LU, faits: faitsDe(lu) }, { texte: statusDuTableau(lu) });

  test("un projet au rail bloqué est « stuck », en rouge, sa phrase entière au survol ; un projet calme est au repos", () => {
    const stuck = ligne(avecLeRail(VIDE, rail(HUIT), { lus: [station({ lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })] }));
    assert.equal(stuck.ton, "rouge");
    assert.equal(stuck.dit, "8 tickets no manager takes, for 14 h");
    assert.match(stuck.survol, /8 tickets on the rail, no manager has taken them for 14 h: its station box\/claude is stopped\. Start the station\./);
    assert.equal(etatDeLaLigne(stuck), "stuck");
    assert.equal(ETATS.stuck.ton, "rouge");

    const calme = ligne(avecLeRail(VIDE, rail([]), { lus: [station()] }));
    assert.equal(calme.ton, "vert");
    assert.equal(calme.dit, "nothing cooking, nothing waits for you");
    assert.equal(etatDeLaLigne(calme), "idle");
    // Le délai pas encore passé : calme.
    assert.equal(etatDeLaLigne(ligne(avecLeRail(VIDE, rail([{ ticket: 4, depuis: new Date(MAINTENANT - 60_000).toISOString() }]), { lus: [] }))), "idle");
    // Un autre rouge reste « held ».
    assert.equal(etatDeLaLigne({ ton: "rouge", dit: "kitchen held" }), "held");
  });

  test("aucune station ne le sert : il est « stuck », non plus muet", () => {
    const stuck = ligne(avecLeRail(VIDE, rail(HUIT), { lus: [] }), false);
    assert.equal(etatDeLaLigne(stuck), "stuck");
    assert.match(stuck.survol, /no station serves this project\. Add the project to a station\./);
    assert.equal(ligne(avecLeRail(VIDE, rail([]), { lus: [] }), false).dit, "no station: nothing is read");
  });
});
