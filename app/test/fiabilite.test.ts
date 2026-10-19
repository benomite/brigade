// La fiabilité des cooks d'un projet (#987) : ce que l'app lit de `station` et de `measures` — la part
// livrée du premier coup face à son seuil, les essais moyens, les tokens perdus, les causes d'échec —,
// la dérive que `status` signale, et la page Reliability telle que la vue la pose. Les sorties de
// `measures` et les lignes `drift` sont écrites par les fonctions mêmes du runtime : l'app lit ce
// que la box écrit, pas une copie de sa forme.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decrireCauses, mesurerCauses, SANS_SIGNAUX, type Signaux } from "../../runtime/src/causes-des-ratages.ts";
import { decrireReleve, direJaugeEn, SANS_SEUIL } from "../../runtime/src/mesures.ts";
import type { CookMesure, Delivery } from "../../runtime/src/projections/measures.ts";
import { decrireRenvois, direDerivePremierCoupEn, mesurerRenvois, type Essai, type Parcours } from "../../runtime/src/renvois.ts";
import { ligneDeProjet, type FaitsLus } from "../src/accueil.ts";
import { ouvrirVeille, type Lecture } from "../src/box.ts";
import type { Faits } from "../src/faits.ts";
import { causesDe, COMMANDES, deriveDe, perdusDe, reglagesDe, renvoisDe, voir, type Vu } from "../src/fiabilite.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { CAUSES, ESSAIS, PERDUS, PREMIER_COUP, poserFiabilite } from "../src/vue/fiabilite.js";
import { Faux, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-19T10:00:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };

// --- Ce que la box écrit ---------------------------------------------------------------

// `station`, sous « chef's decisions » (runtime/src/montrer-station.ts) : une décision posée porte sa valeur.
const station = (posees: Record<string, string> = {}) =>
  [
    "station               box/claude — engine claude, provides: claude",
    "chef's decisions      `station -- <geste> <valeur>` to set one, `station -- help` for the settings",
    ...["stations", "seuil-ticket", "seuil-perdus", "seuil-renvois", "fenetre-renvois", "manager-modele"].map(
      (nom) => `  ${nom.padEnd(20)}${posees[nom] ?? `not set — BRIGADE_${nom.toUpperCase()} is only read from the log`}`,
    ),
    "closer in force       no runtime has noted it yet — not set, no pass writes",
  ].join("\n");

// Un merge et ses lancements, comme le relevé les tient : `perdus` tokens d'un lancement qui n'a rien livré, puis la livraison.
const cook = (tokens: number | null, delivered: boolean): CookMesure => ({ calibration: "opus/high", turns: 5, durationMs: 1000, tokens, delivered });
const merge = (rang: number, perdus: number | null): Delivery => ({
  ticket: 900 + rang,
  at: `2026-10-${String(1 + rang).padStart(2, "0")}T10:00:00.000Z`,
  measures: {},
  state: {},
  gatesS: null,
  cooks: perdus === 0 ? [cook(100_000, true)] : [cook(perdus, false), cook(200_000, true)],
});

// Un parcours : `essais` lancements, le dernier livré, les autres ratés pour la cause que leurs signaux disent.
const relecture: Signaux = { ...SANS_SIGNAUX, jugement: { noDiff: false, conflit: false, gates: { outcome: "green", failures: [] }, review: { outcome: "red", blocking: 1 } } };
const plafond: Signaux = { ...SANS_SIGNAUX, arret: "turns" };
const types: Signaux = { ...SANS_SIGNAUX, jugement: { noDiff: false, conflit: false, gates: { outcome: "red", failures: ["FAIL  contrôle de types de l'app en échec"] }, review: { outcome: "skipped", blocking: 0 } } };
const essai = (outcome: string | null, signaux: Signaux = SANS_SIGNAUX): Essai => ({ run: "r", at: A, outcome, verdict: null, signaux });
const parcours = (ticket: number, rates: Signaux[], merge = true): Parcours => ({
  ticket,
  takenAt: "2026-10-01T00:00:00.000Z",
  end: merge ? { kind: "merged", at: "2026-10-01T02:00:00.000Z" } : null,
  attempts: [...rates.map((signaux) => essai("failed", signaux)), essai(merge ? "ok" : null)],
});

// La sortie de `measures --last <n> --by 1`, telle que `montrer-mesures.ts` l'écrit.
function mesures({ merges, tickets, n = 10, lostTokens = null }: { merges: Delivery[]; tickets: Parcours[]; n?: number; lostTokens?: number | null }): string {
  return [
    ...decrireReleve({ projet: "parade", livraisons: merges, seuils: { ...SANS_SEUIL, lostTokens } }, 1),
    "",
    ...decrireRenvois(mesurerRenvois(tickets, n)),
    "",
    ...decrireCauses(mesurerCauses(tickets.slice(-n))),
  ].join("\n");
}

// Dix tickets servis : un du premier coup, huit mergés après des renvois, un qui cuit encore. Dix essais
// ratés, sous quatre causes : la page n'en montre que trois.
const DIX = [
  parcours(950, []),
  parcours(951, [relecture]),
  parcours(952, [plafond]),
  parcours(953, [relecture, relecture]),
  parcours(954, [types]),
  parcours(955, [relecture]),
  parcours(956, [plafond]),
  parcours(957, [relecture]),
  parcours(958, [SANS_SIGNAUX, SANS_SIGNAUX]),
  parcours(959, [], false),
];
// Treize merges : les trois premiers hors des dix derniers, leurs pertes ne comptent pas.
const TREIZE = Array.from({ length: 13 }, (_, i) => merge(i + 1, i < 3 ? 999_999 : i % 3 === 0 ? 300_000 : 0));

const lue = (sorties: { commande: string; texte: string }[]): Lecture => ({ projet: "parade", demande: 7, a: A, sorties });
const mesuree = (texteStation: string, texteMesures: string) => voir(lue([{ commande: "station", texte: texteStation }, { commande: "measures --last 10 --by 1", texte: texteMesures }]));

describe("les réglages du chef, lus dans `station`", () => {
  test("faute de réglage, ceux du runtime : la fenêtre de 10 tickets, le seuil de 50 %, aucun plafond des perdus", () => {
    assert.deepEqual(reglagesDe(station()), { fenetre: 10, seuil: 50, seuilPose: false, seuilPerdus: null });
    assert.deepEqual(reglagesDe("cooks en cours  0"), { fenetre: 10, seuil: 50, seuilPose: false, seuilPerdus: null });
  });

  test("posés, ils sont lus tels quels", () => {
    assert.deepEqual(reglagesDe(station({ "seuil-renvois": "40", "fenetre-renvois": "8", "seuil-perdus": "400000" })), { fenetre: 8, seuil: 40, seuilPose: true, seuilPerdus: 400_000 });
  });

  test("la lecture lance `station`, puis `measures` sur la fenêtre qu'il dit, en tranches d'un merge", () => {
    const [premiere, suite] = COMMANDES;
    assert.equal(premiere, "station");
    assert.equal(typeof suite, "function");
    const composer = suite as (lues: { commande: string; texte: string }[]) => string;
    assert.equal(composer([{ commande: "station", texte: station({ "fenetre-renvois": "8" }) }]), "measures --last 8 --by 1");
    assert.equal(composer([{ commande: "station", texte: station() }]), "measures --last 10 --by 1");
    // `measures` est un script du runtime, et ses deux options existent.
    const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../../runtime/package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.ok("measures" in scripts && "station" in scripts);
    assert.match(readFileSync(join(import.meta.dirname, "../../runtime/src/montrer-mesures.ts"), "utf8"), /\["--by", "--last"\]/);
  });

  test("la veille compose la commande d'après la sortie lue juste avant, dans la même lecture", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-fiabilite-"));
    const ssh = join(racine, "ssh");
    writeFileSync(ssh, `#!/bin/sh\necho "$*" >>'${racine}/appels'\ncase "$*" in *station) printf '%s\\n' "chef's decisions      x" "  fenetre-renvois     6";; *) echo "sortie de $*";; esac\n`);
    chmodSync(ssh, 0o755);
    const { promise, resolve } = Promise.withResolvers<Lecture>();
    const veille = ouvrirVeille({ ssh, intervalleMs: 3_600_000, delaiMs: 60_000, connexionS: 10, surLecture: resolve });
    t.after(() => {
      veille.fermer();
      rmSync(racine, { recursive: true, force: true });
    });
    veille.regarder([{ nom: "parade", dossier: racine, box: { hote: "box" } }], COMMANDES, 1);
    const lecture = await promise;
    assert.ok("sorties" in lecture);
    assert.deepEqual(lecture.sorties.map(({ commande }) => commande), ["station", "measures --last 6 --by 1"]);
    assert.match(readFileSync(join(racine, "appels"), "utf8"), /brigade parade measures --last 6 --by 1$/m);
  });
});

describe("ce que `measures` écrit, lu par l'app", () => {
  const texte = mesures({ merges: TREIZE, tickets: DIX });

  test("les renvois : servis, gardés, écartés, livrés du premier coup, et les essais moyens", () => {
    assert.deepEqual(renvoisDe(texte), { servis: 10, retenus: 9, ecartes: 1, premiers: 1, essaisMoyens: 2.1 });
    assert.deepEqual(renvoisDe(mesures({ merges: [], tickets: [] })), { servis: 0, retenus: 0 });
    assert.deepEqual(renvoisDe(mesures({ merges: [], tickets: [parcours(1, [], false)] })), { servis: 1, retenus: 0 });
    assert.equal(renvoisDe("report     parade — no merge in the log: nothing to report"), undefined);
  });

  test("les causes : chacune son nombre, sa part, ses derniers tickets — les plus récents d'abord", () => {
    const causes = causesDe(texte);
    assert.equal(causes?.rates, 10);
    assert.deepEqual(
      causes?.causes.filter(({ essais }) => essais > 0),
      [
        { titre: "blocking review", essais: 5, pourcent: 50, tickets: [957, 955, 953] },
        { titre: "red gates: type check", essais: 1, pourcent: 10, tickets: [954] },
        { titre: "cap on turns or duration", essais: 2, pourcent: 20, tickets: [956, 952] },
        { titre: "other", essais: 2, pourcent: 20, tickets: [958] },
      ],
    );
    assert.deepEqual(causesDe(mesures({ merges: [], tickets: [parcours(1, [])] })), { rates: 0, causes: [] });
  });

  test("les tokens perdus : la colonne `lost` des dix derniers merges seulement", () => {
    // Les rangs 4 à 13 ; parmi eux 4, 7, 10 et 13 ont perdu 300 000 chacun — les 999 999 des trois premiers ne comptent pas.
    assert.deepEqual(perdusDe(texte), { tokens: 1_200_000, minimum: false, merges: 10 });
    // C'est le chiffre que le runtime juge face à `seuil-perdus`.
    assert.match(mesures({ merges: TREIZE, tickets: DIX, lostTokens: 500_000 }), /tokens lost over the last 10 merges 1,200,000 for a threshold of 500,000 — CROSSED/);
    assert.deepEqual(perdusDe(mesures({ merges: [merge(1, 0), merge(2, 0)], tickets: DIX })), { tokens: 0, minimum: false, merges: 2 });
    assert.deepEqual(perdusDe(mesures({ merges: [merge(1, null), merge(2, 5)], tickets: DIX })), { tokens: 5, minimum: true, merges: 2 });
    assert.deepEqual(perdusDe(mesures({ merges: [], tickets: [] })), { tokens: 0, minimum: false, merges: 0 });
    // En tranches de dix, les rangs ne se lisent pas : la somme n'est pas faite, rien n'est inventé.
    assert.equal(perdusDe(decrireReleve({ projet: "parade", livraisons: TREIZE, seuils: null }).join("\n")), undefined);
  });
});

describe("la page : ce que l'app en pose", () => {
  test("mesurée : la part du premier coup sous son seuil, les essais, les perdus au-delà du leur, les trois causes les plus fréquentes", () => {
    const vu = mesuree(station({ "seuil-perdus": "400000" }), mesures({ merges: TREIZE, tickets: DIX }));
    assert.ok("mesure" in vu);
    assert.deepEqual(vu.mesure, {
      fenetre: 10,
      servis: 10,
      retenus: 9,
      ecartes: 1,
      premierCoup: { premiers: 1, retenus: 9, pourcent: 11, seuil: 50, seuilPose: false, sous: true },
      essaisMoyens: 2.1,
      perdus: { tokens: 1_200_000, minimum: false, merges: 10, seuil: 400_000, depasse: true },
      causes: {
        rates: 10,
        causes: [
          { titre: "blocking review", essais: 5, pourcent: 50, tickets: [957, 955, 953] },
          { titre: "cap on turns or duration", essais: 2, pourcent: 20, tickets: [956, 952] },
          { titre: "other", essais: 2, pourcent: 20, tickets: [958] },
        ],
      },
    });
  });

  test("au seuil, la part n'est pas sous lui ; sans plafond posé, les perdus ne sont pas jugés", () => {
    const moitie = [...Array.from({ length: 5 }, (_, i) => parcours(i, [])), ...Array.from({ length: 5 }, (_, i) => parcours(10 + i, [relecture]))];
    const vu = mesuree(station(), mesures({ merges: TREIZE, tickets: moitie }));
    assert.ok("mesure" in vu);
    assert.deepEqual(vu.mesure.premierCoup, { premiers: 5, retenus: 10, pourcent: 50, seuil: 50, seuilPose: false, sous: false });
    assert.deepEqual(vu.mesure.perdus, { tokens: 1_200_000, minimum: false, merges: 10, seuil: null, depasse: false });
    // Le seuil posé par le chef est le sien.
    const posee = mesuree(station({ "seuil-renvois": "60" }), mesures({ merges: TREIZE, tickets: moitie }));
    assert.ok("mesure" in posee);
    assert.equal(posee.mesure.premierCoup.sous, true);
    assert.equal(posee.mesure.premierCoup.seuilPose, true);
  });

  test("pas encore assez de tickets servis pour mesurer : la fenêtre n'est pas pleine, ou rien n'y est mergé — jamais des zéros", () => {
    assert.deepEqual(mesuree(station(), mesures({ merges: [], tickets: DIX.slice(0, 6) })), { projet: "parade", demande: 7, a: A, pasAssez: { servis: 6, retenus: 6, fenetre: 10 } });
    assert.deepEqual(mesuree(station(), mesures({ merges: [], tickets: [] })), { projet: "parade", demande: 7, a: A, pasAssez: { servis: 0, retenus: 0, fenetre: 10 } });
    const rienDeMerge = Array.from({ length: 10 }, (_, i) => parcours(i, [], false));
    assert.deepEqual(mesuree(station(), mesures({ merges: [], tickets: rienDeMerge })), { projet: "parade", demande: 7, a: A, pasAssez: { servis: 10, retenus: 0, fenetre: 10 } });
    // La fenêtre est celle du chef : huit tickets suffisent à une fenêtre de huit.
    assert.ok("mesure" in mesuree(station({ "fenetre-renvois": "8" }), mesures({ merges: TREIZE, tickets: DIX.slice(0, 8), n: 8 })));
  });

  test("une lecture ratée, ou une box dont `measures` ne compte pas les renvois, le dit — rien n'est mesuré", () => {
    assert.ok("sans" in voir({ projet: "parade", demande: 7, a: A, erreur: "ssh: refused", atteinte: false, cas: "ssh-en-echec" }));
    assert.ok("sans" in voir(lue([{ commande: "station", texte: station() }])));
    const ancien = mesuree(station(), decrireReleve({ projet: "parade", livraisons: TREIZE, seuils: null }, 1).join("\n"));
    assert.ok("sans" in ancien && /do not count retries/.test(ancien.sans));
  });
});

describe("la dérive, dans `status`, et l'accueil", () => {
  const drift = (ligne: string) => `${"drift".padEnd(11)}${ligne} — \`brigade parade measures\``;
  const PREMIER_COUP_DERIVE = drift(direDerivePremierCoupEn({ premiers: 1, retenus: 7, fenetre: 10, seuil: 50 }));
  const PERDUS_DERIVE = drift([{ measure: "tests", observed: 1200, limit: 1000 }, { measure: "tokens_perdus", observed: 842_809, limit: 400_000 }].map(direJaugeEn).join(" · "));
  const COUT_SEUL = drift(direJaugeEn({ measure: "tokens_ticket", observed: 1_038_705, limit: 400_000 }));

  test("la part du premier coup sous son seuil, et les tokens perdus au-delà du leur, sont la fiabilité ; les autres seuils non", () => {
    assert.deepEqual(deriveDe(["project    parade", COUT_SEUL, PERDUS_DERIVE, PREMIER_COUP_DERIVE].join("\n")), [
      "tokens lost over the last 10 merges 842,809 for a threshold of 400,000",
      "1/7 merged tickets delivered on the first try, among the last 10 served (threshold 50%)",
    ]);
    assert.deepEqual(deriveDe(["project    parade", COUT_SEUL].join("\n")), []);
  });

  const FAITS: Faits = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
  const lus: FaitsLus = { a: A, faits: FAITS };
  const PROJET = { nom: "parade", box: true, desinstalle: false };

  test("la ligne d'un projet dont la fiabilité a dérivé le dit d'un mot, et le détail au survol ; sa pastille ne change pas", () => {
    const ligne = ligneDeProjet(PROJET, lus, { texte: ["project    parade", PREMIER_COUP_DERIVE].join("\n") });
    assert.equal(ligne.dit, "nothing cooking, nothing waits for you · drifting");
    assert.equal(ligne.ton, "vert");
    assert.match(ligne.survol, /reliability drifting: 1\/7 merged tickets delivered on the first try/);
    assert.doesNotMatch(ligne.survol, /`/);
  });

  test("sans dérive, ou sans `status` lu, rien n'est dit", () => {
    assert.equal(ligneDeProjet(PROJET, lus, { texte: ["project    parade", COUT_SEUL].join("\n") }).dit, "nothing cooking, nothing waits for you");
    assert.equal(ligneDeProjet(PROJET, lus, undefined).dit, "nothing cooking, nothing waits for you");
  });
});

describe("la page Reliability, posée par la vue", () => {
  const texteDe = (poses: Faux[]) => poses.map(({ textContent }) => textContent).join("\n");
  const mesure = (vu: Vu) => ("mesure" in vu ? vu : assert.fail("pas mesurée"));

  test("elle est une lecture de Settings, à côté de Rail, Manager et Grants — les deux onglets du haut restent deux", () => {
    assert.deepEqual(RUBRIQUES.map(({ titre }) => titre), ["Cost", "Settings"]);
    assert.ok(RUBRIQUES.find(({ titre }) => titre === "Settings")?.lectures.includes("fiabilite"));
    assert.equal(ONGLETS.find(({ id }) => id === "fiabilite")?.titre, "Reliability");
  });

  test("trois chiffres face à leurs seuils, celui qui les franchit mis en évidence, puis les causes et leurs tickets", () => {
    const vu = mesure(mesuree(station({ "seuil-perdus": "400000" }), mesures({ merges: TREIZE, tickets: DIX })));
    const ouverts: number[] = [];
    const poses = poserFiabilite(doc, vu, (ticket) => ouverts.push(ticket)) as Faux[];
    const [tete, causes] = poses as [Faux, Faux];
    const chiffres = tete.dessous("div").filter(({ className }) => className.startsWith("chiffre "));
    const [premier, essais, perdus] = tete.dessous("div").filter(({ className }) => /^chiffre( |$)/.test(className));
    assert.equal(chiffres.length, 2, "deux chiffres franchissent leur seuil");
    assert.deepEqual([premier?.className, essais?.className, perdus?.className], ["chiffre depasse", "chiffre", "chiffre depasse"]);
    assert.deepEqual(premier?.children.map(({ textContent }) => textContent), [PREMIER_COUP, "1 of 9 · 11%", "under its threshold of 50% (default)"]);
    assert.deepEqual(essais?.children.map(({ textContent }) => textContent), [ESSAIS, "2.1", "on average"]);
    assert.deepEqual(perdus?.children.map(({ textContent }) => textContent), [PERDUS, "1,200,000", "over the last 10 merges · over its ceiling of 400,000"]);
    assert.match(texteDe([tete]), /9 merged of the last 10 tickets served — 1 not merged, left out/);

    assert.equal(causes.dessous("h2")[0]?.textContent, CAUSES);
    const lignes = causes.dessous("li");
    assert.deepEqual(lignes.map((li) => li.children.slice(0, 3).map(({ textContent }) => textContent)), [
      ["blocking review", "5 attempts", "50%"],
      ["cap on turns or duration", "2 attempts", "20%"],
      ["other", "2 attempts", "20%"],
    ]);
    const boutons = causes.dessous("button");
    assert.deepEqual(boutons.map(({ textContent }) => textContent), ["#957", "#955", "#953", "#956", "#952", "#958"]);
    assert.ok(boutons.every(({ className }) => className === "mono"));
    boutons[3]?.click();
    assert.deepEqual(ouverts, [956]);
  });

  test("sous leurs seuils, rien n'est mis en évidence ; sans plafond posé, les perdus le disent", () => {
    const moitie = [...Array.from({ length: 5 }, (_, i) => parcours(i, [])), ...Array.from({ length: 5 }, (_, i) => parcours(10 + i, [relecture]))];
    const [tete] = poserFiabilite(doc, mesure(mesuree(station(), mesures({ merges: TREIZE, tickets: moitie }))), () => {}) as Faux[];
    assert.deepEqual(tete?.dessous("div").filter(({ className }) => /depasse/.test(className)), []);
    assert.match(texteDe(tete === undefined ? [] : [tete]), /threshold of 50% \(default\)/);
    assert.match(texteDe(tete === undefined ? [] : [tete]), /no ceiling set/);
  });

  test("pas assez de tickets servis : une ligne qui le dit, et aucun chiffre", () => {
    const poses = poserFiabilite(doc, mesuree(station(), mesures({ merges: [], tickets: DIX.slice(0, 6) })), () => {}) as Faux[];
    assert.equal(poses.length, 1);
    assert.equal(poses[0]?.dessous("p").find(({ className }) => className === "pas-assez")?.textContent, "not enough tickets served yet to measure: 6 of the 10 it takes");
    assert.deepEqual(poses[0]?.dessous("div").filter(({ className }) => className.startsWith("chiffre")), []);
    assert.doesNotMatch(texteDe(poses), /\b0%|\b0 of\b/);
    const rienDeMerge = Array.from({ length: 10 }, (_, i) => parcours(i, [], false));
    assert.match(texteDe(poserFiabilite(doc, mesuree(station(), mesures({ merges: [], tickets: rienDeMerge })), () => {}) as Faux[]), /none of the last 10 tickets served is merged yet/);
  });

  test("pas encore lue, ou ratée : une ligne, le détail au survol", () => {
    assert.match(texteDe(poserFiabilite(doc, undefined, () => {}) as Faux[]), /reading…/);
    const [rate] = poserFiabilite(doc, { projet: "parade", demande: 1, a: A, sans: "ce que la box a dit" }, () => {}) as Faux[];
    const ligne = rate?.dessous("p").find(({ className }) => className === "indisponible");
    assert.ok(ligne?.textContent.startsWith("the reliability could not be read"));
    assert.ok(rate?.dessous("button").some(({ ariaLabel }) => ariaLabel === "ce que la box a dit"));
  });
});

describe("la page Reliability, dans l'espace du projet", () => {
  async function ouvrir() {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    await ouvrirLecture(vue, "Reliability");
    return vue;
  }

  test("Settings → Reliability lit la fiabilité du projet, la pose, et un ticket d'une cause ouvre sa fiche", async () => {
    const vue = await ouvrir();
    const [projet, id, demande] = vue.dernier("onglet") as [string, string, number];
    assert.deepEqual([projet, id], ["parade", "fiabilite"]);
    const page = vue.element("fiabilite");
    assert.equal(page.hidden, false);
    assert.match(page.textContent, /reading…/);

    const lecture = { projet: "parade", demande, a: A, sorties: [{ commande: "station", texte: station() }, { commande: "measures --last 10 --by 1", texte: mesures({ merges: TREIZE, tickets: DIX }) }] };
    vue.dire("surContenu", lecture, undefined, undefined, { ...voir(lecture), demande });
    await repos();
    assert.match(page.textContent, /delivered on the first try/);
    // Ce que la box a dit reste lisible, replié dessous, mot pour mot.
    assert.ok(vue.element("lecture-onglet").dessous("pre").some(({ textContent }) => textContent.startsWith("report     parade")));
    // Rien de technique à plat : ni commande, ni mode d'emploi.
    assert.doesNotMatch(page.textContent, /ssh|brigade parade|usage|`/);

    assert.equal(vue.element("fiche").hidden, true);
    (page.dessous("button").find(({ textContent }) => textContent === "#956") ?? assert.fail("pas de #956")).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#956"));
  });

  test("quitter la page la vide : la lecture d'après ne montre rien de celle d'avant", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Rail");
    assert.equal(vue.element("fiabilite").hidden, true);
    assert.equal(vue.element("fiabilite").children.length, 0);
  });
});
