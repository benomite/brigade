// Ce que l'app dessine : les faits que la box rend dans la forme de
// docs/runtime/. L'exemple de la doc est
// lu ici tel qu'il y est écrit ; une sortie qui n'est pas cette forme n'est
// jamais dessinée — ni tableau vide, ni zéros. Une couleur ne se pose que sur
// un mot des listes fermées. Le rail se range en six colonnes, TODO
// d'après `attend`, que la forme donne, et le bloc `attend` de `status` ; WAITING
// d'après les `tiers` de chaque ticket (wait.test.ts). Chaque
// carte porte ce que la file dit du ticket, et écrit ce qu'elle n'en dit pas :
// ce qui s'y lit est dans bon.test.ts.
import { docRuntime } from "./helpers/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTION, type Reading } from "../src/box.ts";
import { putAside } from "../src/awaiting.ts";
import { withoutQuestion } from "../src/handover-second.ts";
import { hourHM } from "../src/format.ts";
import { ACTIVITY_NOT_COMMUNICATED, BANNER, COMMAND, understand, draw, tellInThisMoment, duration, event, rail, board, holdFacts, tick, titleOfFailure, type Facts } from "../src/facts.ts";
import type { Header } from "../src/card.ts";
import { commandOfAction, CONFIRMED } from "../src/actions.ts";

const ROOT = join(import.meta.dirname, "../..");
const doc = docRuntime(ROOT);
// L'exemple de la doc : la ligne du bloc `json` qui porte la forme des faits (ses champs `dernierTick` et `compteurs`).
const EXAMPLE = [...doc.matchAll(/```json\n([^\n]*)\n```/g)].map(([, line = ""]) => line).find((line) => line.includes('"dernierTick"') && line.includes('"compteurs"')) ?? "";
// Les lignes d'un tableau de la doc dont une ligne a pour premier mot `mot` : de la première à la dernière ligne de ce tableau.
function boardOfTheDoc(word: string): string[] {
  const lines = doc.split("\n");
  const inside = lines.findIndex((line) => line.startsWith(`| \`${word}\` |`));
  let start = inside;
  while (start > 0 && lines[start - 1]?.startsWith("|")) start--;
  let end = inside;
  while (end < lines.length - 1 && lines[end + 1]?.startsWith("|")) end++;
  return inside < 0 ? [] : lines.slice(start, end + 1);
}

// Ce que le reviewer a dit de deux livraisons de l'exemple : un résumé et ses constats, puis un résumé seul.
const REREAD_216 = {
  resume: "Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.",
  constats: [
    { gravite: "remarque", fichier: "runtime/src/mesures.ts", constat: "Le seuil par défaut est répété dans deux fichiers." },
    { gravite: "remarque", fichier: null, constat: "À supprimer : l'ancien compteur, qui ne sert plus." },
  ],
};
const REREAD_201 = { resume: "Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.", constats: [] };
const WITHOUT_REVIEW = "what was delivered: not given — no readable review covers this delivery (merged by hand, served without going through pass, or from before the review)";

const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-12T10:04:11.000Z",
  dernierTick: "2026-10-12T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 3 },
  dernierEvenement: { seq: 812, at: "2026-10-12T10:03:58.000Z", type: "merge.done", ticket: 216 },
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: { fait: "lit", faitEn: "reading", cible: "runtime/src/etat.ts", depuis: "2026-10-12T10:01:11.000Z" }, attente: null },
    { ticket: 21, etat: "BLOQUÉ", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null, attente: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 21, titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21" }],
  livres: [
    { ticket: 216, titre: "Le relevé des mesures", url: "https://github.com/benomite/brigade/issues/216", livre: "2026-10-12T10:03:58.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/219", relecture: REREAD_216 },
    { ticket: 201, titre: "Les grants sous plafond", url: "https://github.com/benomite/brigade/issues/201", livre: "2026-10-12T07:12:40.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/207", relecture: REREAD_201 },
    { ticket: 188, titre: "Une fiche sans zone", url: "https://github.com/benomite/brigade/issues/188", livre: "2026-10-11T16:30:05.000Z", station: "box/claude", pr: null, relecture: null },
  ],
};
// Ce que rend un runtime d'avant les cooks : la même forme, sans le champ.
const { cooks: _cooks, ...WITHOUT_COOKS } = FACTS;
// Et celui d'avant `attend`.
const { attend: _awaiting, ...NO_AWAITING } = FACTS;
// Et celui d'avant les livrés : Livré se range alors d'après le mot d'état du rail.
const { livres: _delivered, ...WITHOUT_DELIVERED } = FACTS;
const { livres: _also, ...NO_AWAITING_NOR_SERVED } = NO_AWAITING;
const renderedOnes = (facts: object) => `${JSON.stringify(facts)}\n`;
// Ce qu'une carte dit quand `status` n'a pas été lu : ce que `faits` ne donne pas est écrit, pas tu.
const WITHOUT_STATUS = "not given by `facts`, and the `rail` line of `status` was not read";
// L'en-tête de sa fiche (card.ts), quand `status` n'a pas été lu : son titre, son issue — mais ni sa
// priorité, que seule sa ligne de `status` écrit, ni sa PR, que la box ne donne que d'un ticket livré.
const card = (title: string | undefined, other: Partial<Header> = {}): { fiche: Header } => ({
  fiche: {
    titre: title === undefined ? { sans: "not given — the station returns no title for this ticket" } : { valeur: title },
    priorite: { sans: "not given — `facts` does not give it, and the `rail` line of `status` was not read" },
    issue: true,
    ...other,
  },
});

// Une carte qui t'attend porte, en tête de sa fiche, ce qu'on attend de toi (decision.ts) : sans
// décision donnée par `faits` — une box d'avant ce champ, comme ici —, « no question found on #N ».
const expected = (ticket: number) => ({ attendu: withoutQuestion(ticket) }) as const;
// Ce qui attend le chef est parked pour lui, pour ce que sa carte attend, sans date (#4261).
const atChef = (ticket: number) => ({ parque: { qui: "the chef", quoi: withoutQuestion(ticket), jusqua: null, chef: true } }) as const;

const readEntry = (text: string): Reading => ({ projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", sorties: [{ commande: "facts", texte: text }] });

// Le refus, ou l'échec du test si la sortie a été prise pour la forme.
// La raison pour laquelle un élément de liste n'a pas été lu : la forme est comprise, et sa carte seule est illisible.
function unreadable(text: string): string {
  const understood = understand(text);
  assert.ok(!("informe" in understood), `la forme entière est refusée : ${"informe" in understood ? understood.informe : ""}`);
  const rendered = [...understood.rail, ...(understood.attend ?? []), ...(understood.livres ?? [])].find((readOne) => readOne.illisible !== undefined);
  return rendered?.illisible ?? assert.fail(`aucun élément illisible : ${text}`);
}
function informs(text: string): string {
  const understood = understand(text);
  assert.ok("informe" in understood, `pris pour la forme : ${text}`);
  return understood.informe;
}

describe("les faits que l'app dessine", () => {
  test("la commande lue est un script du runtime, tel qu'il existe", () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.equal(COMMAND, "facts");
    assert.ok(COMMAND in scripts);
  });

  test("l'exemple de docs/runtime/ est compris tel qu'il est écrit — champ pour champ", () => {
    assert.deepEqual(understand(`${EXAMPLE}\n`), FACTS);
  });

  test("un journal vide, un runtime sans tick, un événement hors ticket, un rail vide : ce sont des faits, pas une forme manquée", () => {
    const calm = { ...FACTS, dernierTick: null, dernierEvenement: null, rail: [], compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 } };
    const outsideTicket = { ...FACTS, dernierEvenement: { seq: 3, at: "2026-10-12T10:03:58.000Z", type: "kitchen.stopped", ticket: null } };

    assert.deepEqual(understand(renderedOnes(calm)), calm);
    assert.deepEqual(understand(renderedOnes(outsideTicket)), outsideTicket);
  });

  test("aucun cook en cours, ou un cook dont le ticket a quitté le rail — son titre est vide : ce sont des faits", () => {
    const calm = { ...FACTS, cooks: [] };
    const gone = { ...FACTS, cooks: [{ ticket: 30, titre: "", station: "box/claude" }] };

    assert.deepEqual(understand(renderedOnes(calm)), calm);
    assert.deepEqual(understand(renderedOnes(gone)), gone);
  });

  test("un runtime qui ne donne pas encore les cooks rend toujours la forme : le champ manque, il n'est pas mis à vide", () => {
    const understood = understand(renderedOnes(WITHOUT_COOKS));

    assert.deepEqual(understood, WITHOUT_COOKS);
    assert.ok(!("cooks" in understood));
  });

  test("un runtime qui ne donne pas encore `attend` rend toujours la forme : le champ manque ; une adresse nulle est un fait, pas une forme manquée", () => {
    const understood = understand(renderedOnes(NO_AWAITING));
    assert.deepEqual(understood, NO_AWAITING);
    assert.ok(!("attend" in understood));

    const withoutRepository = { ...FACTS, attend: [{ ticket: 378, titre: "", url: null }] };
    assert.deepEqual(understand(renderedOnes(withoutRepository)), withoutRepository);
    assert.match(unreadable(renderedOnes({ ...FACTS, attend: [{ ticket: 378, titre: "" }] })), /attend\[0\]\.url/);
    assert.match(informs(renderedOnes({ ...FACTS, attend: {} })), /attend/);
  });

  test("un mot d'état que l'app ne connaît pas est gardé tel quel — du projet comme d'un ticket", () => {
    const fresh = { ...FACTS, etat: "muette", rail: [{ ...FACTS.rail[0], etat: "au four" }] };

    assert.deepEqual(understand(renderedOnes(fresh)), fresh);
  });

  test("un champ que l'app ne connaît pas ne casse rien, et n'est pas gardé", () => {
    assert.deepEqual(understand(renderedOnes({ ...FACTS, quota: 62, rail: FACTS.rail.map((ticket) => ({ ...ticket, tenuPar: "cook-1" })), cooks: FACTS.cooks?.map((cook) => ({ ...cook, tours: 12 })) })), FACTS);
  });

  test("ce qui n'est pas la forme est refusé, en disant quoi : jamais des zéros à la place", () => {
    assert.match(informs("projet     brigade\nruntime    en marche depuis 3 h 12\n"), /this is not JSON/);
    assert.match(informs(""), /returned nothing/);
    assert.match(informs("null\n"), /is not an object/);
    assert.match(informs("[]\n"), /is not an object/);
    assert.match(informs(renderedOnes({ ...FACTS, etat: 3 })), /“etat”/);
    assert.match(informs(renderedOnes({ ...FACTS, lu: "tout à l'heure" })), /“lu”/);
    assert.match(informs(renderedOnes({ ...FACTS, dernierTick: undefined })), /“dernierTick”/);
    assert.match(informs(renderedOnes({ ...FACTS, compteurs: undefined })), /“compteurs”/);
    assert.match(informs(renderedOnes({ ...FACTS, rail: undefined })), /“rail”/);
    assert.match(informs(renderedOnes({ ...FACTS, dernierEvenement: { seq: 1, at: "2026-10-12T10:03:58.000Z", type: "merge.done" } })), /“dernierEvenement\.ticket”/);
    assert.match(informs(renderedOnes({ ...FACTS, rail: [{ ticket: "14", etat: "pris", titre: "", url: "" }] })), /“rail\[0\]\.ticket”/);
    // Des cooks donnés, mais pas dans la forme : ce n'est pas un runtime d'avant ce champ.
    assert.match(informs(renderedOnes({ ...FACTS, cooks: null })), /“cooks”/);
    assert.match(informs(renderedOnes({ ...FACTS, cooks: 2 })), /“cooks”/);
    assert.match(informs(renderedOnes({ ...FACTS, cooks: [{ ticket: null, titre: "", station: "box/claude" }] })), /“cooks\[0\]\.ticket”/);
    assert.match(informs(renderedOnes({ ...FACTS, cooks: [{ ticket: 14, station: "box/claude" }] })), /“cooks\[0\]\.titre”/);
    assert.match(informs(renderedOnes({ ...FACTS, cooks: [FACTS.cooks?.[0], { ticket: 21, titre: "L'export du journal" }] })), /“cooks\[1\]\.station”/);
  });

  test("un compteur qui manque, ou qui n'est pas un nombre entier positif, refuse la forme entière : aucun n'est mis à zéro", () => {
    for (const name of ["rail", "auTravail", "aLaPass", "attend", "livres24h"] as const) {
      for (const value of [undefined, null, "2", -1, 1.5, Number.NaN]) {
        assert.match(informs(renderedOnes({ ...FACTS, compteurs: { ...FACTS.compteurs, [name]: value } })), new RegExp(`“compteurs\\.${name}”`), `${name} = ${String(value)}`);
      }
    }
  });

  test("ce que la cuisine fait d'un ticket se lit sous `rail[].activite` : un geste, ce qu'il vise ou rien, une heure — nulle, la box ne le sait pas ; absente, un runtime d'avant elle", () => {
    const [taken, blocked] = FACTS.rail;
    assert.deepEqual(taken?.activite, { fait: "lit", faitEn: "reading", cible: "runtime/src/etat.ts", depuis: "2026-10-12T10:01:11.000Z" });
    assert.equal(blocked?.activite, null);
    // Un runtime d'avant ce champ : la forme reste comprise, sans lui.
    const withoutActivity = { ...FACTS, rail: FACTS.rail.map(({ activite: _activity, ...ticket }) => ticket) };
    assert.deepEqual(understand(renderedOnes(withoutActivity)), withoutActivity);
    // Une activité qui n'a pas sa forme refuse la forme entière : rien n'en est deviné.
    const withIt = (activity: unknown) => renderedOnes({ ...FACTS, rail: [{ ...taken, activite: activity }] });
    assert.match(unreadable(withIt("lit")), /rail\[0\]\.activite/);
    assert.match(unreadable(withIt({ fait: "lit", cible: 3, depuis: "2026-10-12T10:01:11.000Z" })), /rail\[0\]\.activite\.cible/);
    assert.match(unreadable(withIt({ fait: "lit", cible: null, depuis: "tout à l'heure" })), /rail\[0\]\.activite\.depuis/);
  });

  test("la carte d'un ticket pris ou en pass dit ce que la cuisine en fait, depuis combien de temps à l'horloge de la box — et écrit qu'elle ne le sait pas plutôt que de se taire", () => {
    const readOne = "2026-10-12T10:04:11.000Z";
    const of = (state: string, activity?: Facts["rail"][number]["activite"]) => tellInThisMoment({ ticket: 1, etat: state, titre: "", url: "", ...(activity === undefined ? {} : { activite: activity }) }, readOne);

    assert.equal(of("pris", { fait: "tests rouges, corrige", cible: "app/src/bon.ts", depuis: "2026-10-12T10:01:11.000Z" }), "tests rouges, corrige app/src/bon.ts, for 3 min");
    assert.equal(of("en pass", { fait: "relecture en cours", cible: null, depuis: "2026-10-12T10:04:01.000Z" }), "relecture en cours, for 10 s");
    assert.equal(of("pris", null), ACTIVITY_NOT_COMMUNICATED);
    assert.equal(ACTIVITY_NOT_COMMUNICATED, "activity not given");
    assert.equal(of("en pass"), "activity not given — this station's runtime does not give it in `facts`");
    // Un ticket qui n'est ni au travail ni en pass n'a pas cette ligne.
    for (const state of ["en attente", "BLOQUÉ", "servi", "86", "au four"]) assert.equal(of(state, null), undefined, state);
  });

  test("une lecture devient ce que la vue pose, sans rien y calculer : la pastille, cinq nombres, les cooks en cours, le dernier événement, le rail", () => {
    assert.deepEqual(draw(readEntry(renderedOnes(FACTS))), {
      projet: "brigade",
      demande: 4,
      a: "2026-10-12T10:04:12.000Z",
      tableau: {
        etat: "ouverte",
        mot: "open",
        ton: "vert",
        arretee: false,
        // Ni leçon ni profil : `facts` ne porte pas `apprentissage`, la page le dira en une phrase.
        apprentissage: { lecons: [], profils: [] },
        // Où en est chaque ticket, pour le récit du premier ticket (#3302) : ceux du rail, puis les servis et leur PR mergée.
        etapesDesTickets: [
          { ticket: 14, etat: "pris", pr: null, renvoi: null },
          { ticket: 21, etat: "BLOQUÉ", pr: null, renvoi: null },
          { ticket: 216, etat: "servi", pr: { numero: 219, url: "https://github.com/benomite/brigade/pull/219" }, renvoi: null },
          { ticket: 201, etat: "servi", pr: { numero: 207, url: "https://github.com/benomite/brigade/pull/207" }, renvoi: null },
          { ticket: 188, etat: "servi", pr: null, renvoi: null },
        ],
        tick: "last tick 9 s before the reading",
        compteurs: [
          { libelle: "rail", nombre: 2 },
          { libelle: "taken", nombre: 1 },
          { libelle: "at pass", nombre: 1 },
          { libelle: "awaiting you", nombre: 1 },
          { libelle: "served 24 h", nombre: 3 },
        ],
        cooks: { enCours: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }], vide: "no cook running" },
        evenement: "merge.done · #216 · 13 s before the reading",
        // #14 cuit ; #21, bloqué, attend le chef : seul #14 porte la poêle (#2984).
        auTravail: [14],
        rail: {
          colonnes: [
            { nom: "On the rail", ton: "gris", compte: "0", cartes: [], vide: "no ticket" },
            {
              nom: "Taken",
              ton: "bleu",
              compte: "1",
              cartes: [
                {
                  ticket: 14,
                  etat: "pris",
                  mot: "taken",
                  ton: "bleu",
                  titre: "Le journal en ajout seul",
                  ouvrable: true,
                  attendu: false,
                  attend: [],
                  // Ce que la forme dit de lui : ce que son cook fait, sa station. Le reste est écrit comme manquant.
                  ligne: "reading runtime/src/etat.ts · 3 min ago",
                  dit: [
                    { libelle: "right now", valeur: "reading runtime/src/etat.ts, for 3 min" },
                    { libelle: "taken by", valeur: "box/claude", exact: true },
                  ],
                  sans: "not given by `facts`, and the `rail` line of `status` was not read : since when · its lease · what it burns · what blocks it",
                  ...card("Le journal en ajout seul"),
                },
              ],
              vide: "no ticket",
            },
            { nom: "Pass", ton: "jaune", compte: "0", cartes: [], vide: "no ticket" },
            {
              nom: "Awaiting you",
              ton: "rouge",
              compte: "1",
              // `attend`, dans la forme, le nomme : il est ici avant même que `status` ait été lu.
              cartes: [{ ticket: 21, etat: "BLOQUÉ", mot: "BLOCKED", ton: "rouge", titre: "L'export du journal", ouvrable: true, attendu: true, attend: [], etape: "On the rail", ligne: withoutQuestion(21), dit: [], sans: `${WITHOUT_STATUS} : who holds it · since when · its lease · what it burns · what blocks it`, ...card("L'export du journal", expected(21)), gestes: ["attente-poser"], ...atChef(21) }],
              vide: "no ticket in `attend`, according to `facts`",
            },
            { nom: "Waiting", ton: "orange", compte: "0", cartes: [], vide: "no ticket waits for a third party" },
            {
              nom: "Served",
              ton: "vert",
              // Autant de cartes que `livrés 24 h` : celles de `livres`, le plus récent en haut, partis du rail ou non.
              compte: "3",
              cartes: [
                { ticket: 216, etat: "servi", mot: "served", ton: "vert", titre: "Le relevé des mesures", ouvrable: true, attendu: false, attend: [], essayable: true, ligne: `served at ${hourHM("2026-10-12T10:03:58.000Z")} · ${REREAD_216.resume.split(". ")[0]}.`, pr: true, livraison: { resume: REREAD_216.resume, remarques: "2 remarks", constats: REREAD_216.constats }, dit: [{ libelle: "merged", valeur: "13 s ago" }, { libelle: "cooked by", valeur: "box/claude", exact: true }], ...card("Le relevé des mesures", { pr: true }) },
                { ticket: 201, etat: "servi", mot: "served", ton: "vert", titre: "Les grants sous plafond", ouvrable: true, attendu: false, attend: [], essayable: true, ligne: `served at ${hourHM("2026-10-12T07:12:40.000Z")} · ${REREAD_201.resume}`, pr: true, livraison: { resume: REREAD_201.resume, remarques: "no remarks", constats: [] }, dit: [{ libelle: "merged", valeur: "2 h 51 ago" }, { libelle: "cooked by", valeur: "box/claude", exact: true }], ...card("Les grants sous plafond", { pr: true }) },
                {
                  ticket: 188,
                  etat: "servi",
                  essayable: true,
                  mot: "served",
                  ton: "vert",
                  titre: "Une fiche sans zone",
                  ouvrable: true,
                  attendu: false,
                  attend: [],
                  ligne: `served at ${hourHM("2026-10-11T16:30:05.000Z")}`,
                  repere: true,
                  livraison: { sans: WITHOUT_REVIEW },
                  dit: [{ libelle: "served", valeur: "17 h 34 before the reading" }, { libelle: "cooked by", valeur: "box/claude", exact: true }, { libelle: "PR", valeur: "none — served without a merge" }],
                  ...card("Une fiche sans zone", { pr: { valeur: "none — served without a merge" } }),
                },
              ],
              vide: "nothing served in the last 24 h",
              defile: true,
            },
          ],
          hors: [],
        },
      },
    });
  });

  test("une box qui rend autre chose que la forme : ce qu'elle a rendu est gardé mot pour mot, avec la raison", () => {
    const old = "projet     brigade\ncuisine    ouverte\n";

    assert.deepEqual(draw(readEntry(old)), { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", titre: "THE STATION DID NOT RETURN THE SHAPE OF `facts`", informe: "this is not JSON", rendu: old });
  });

  test("une commande en échec — un runtime d'avant `faits` — reste l'échec que la veille a rendu, sous un titre qui dit que la box a été jointe", () => {
    const failure: Reading = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: '$ node … geste.ts brigade facts\nnpm error Missing script: "facts"\n→ code de sortie 1', atteinte: true, cas: null };

    assert.deepEqual(draw(failure), { ...failure, titre: "REACHED, BUT `facts` DID NOT ANSWER" });
  });

  test("un refus du geste se dit comme sous `status` — le même cas, les mêmes mots : pas un runtime à mettre à jour", () => {
    const vue = readFileSync(join(ROOT, "app/src/vue/vue.js"), "utf8");
    const TITLES = {
      "projet-inconnu": "REACHED, BUT UNKNOWN TO THE STATION",
      "sans-droit": "REACHED, BUT WITHOUT THE RIGHT TO THE ACTION",
      "commande-manque": "REACHED, BUT A COMMAND IS MISSING ON THE STATION",
      "node-inapte": "REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME",
    } as const;

    for (const [theCase, title] of Object.entries(TITLES) as [keyof typeof TITLES, string][]) {
      const failure: Reading = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "…", atteinte: true, cas: theCase };
      assert.deepEqual(draw(failure), { ...failure, titre: title });
      // Les mots de l'en-tête que `rendre` pose sous `status`.
      assert.ok(vue.includes(`\`${title} — tried at `), `« ${title} » n'est plus l'en-tête de la vue`);
    }
    assert.equal(titleOfFailure({ erreur: "…", atteinte: false, cas: null }), "NOT REACHED");
    assert.ok(vue.includes("`NOT REACHED — tried at "));
  });

  test("une station pas jointe est dite pas jointe, avec ce que son lancement a rendu", () => {
    const failure: Reading = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "spawn node ENOENT", atteinte: false, cas: null };

    assert.deepEqual(draw(failure), { ...failure, titre: "NOT REACHED" });
  });
});

// La couleur que la vue reçoit pour un mot d'état — du projet, ou de son premier ticket.
const yourOfProject = (state: string) => board({ ...FACTS, etat: state }).ton;
const cards = (draws: ReturnType<typeof rail>) => [...draws.colonnes.flatMap((column) => column.cartes), ...draws.hors];
const yourOfTicket = (state: string) => cards(rail({ ...FACTS, rail: [{ ticket: 1, etat: state, titre: "", url: "" }] })).find(({ ticket }) => ticket === 1)?.ton;

describe("une couleur sur un mot de la liste fermée", () => {
  test("les quatre états d'un projet ont la leur — ceux de docs/runtime/, pas un de plus", () => {
    assert.deepEqual(["ouverte", "retenue", "arrêtée", "éteinte"].map(yourOfProject), ["vert", "jaune", "rouge", "rouge"]);
    assert.deepEqual(boardOfTheDoc("éteinte").flatMap((line) => /^\| `([^`]+)` \|/.exec(line)?.[1] ?? []).sort(), ["arrêtée", "ouverte", "retenue", "éteinte"].sort());
  });

  test("les six états d'un ticket ont la leur — ceux que la doc énumère", () => {
    const WORDS = ["en attente", "BLOQUÉ", "pris", "en pass", "servi", "86"];

    assert.deepEqual(WORDS.map(yourOfTicket), ["gris", "rouge", "bleu", "jaune", "vert", "rouge"]);
    // Les six mots, dans cet ordre, entre backticks, séparés de quelques signes ou d'un mot de liaison : la doc se replie et se traduit où elle veut.
    const list = new RegExp(WORDS.map((word) => `\`${word}\``).join("[^`]{0,24}"));
    assert.match(doc.replace(/\s+/g, " "), list, "la liste des états d'un ticket a changé dans docs/runtime/");
  });

  test("un mot inconnu s'affiche tel quel, sans couleur, et ne se range dans aucune — ni par sa casse, ni par un nom d'objet", () => {
    for (const word of ["muette", "Ouverte", "OUVERTE", "ouverte ", "", "constructor", "toString", "__proto__"]) {
      assert.equal(board({ ...FACTS, etat: word }).etat, word);
      assert.ok(!("ton" in board({ ...FACTS, etat: word })), word);
    }
    for (const word of ["au four", "bloqué", "Pris", "ouverte", "constructor", "__proto__"]) assert.equal(yourOfTicket(word), undefined, word);
  });
});

describe("la carte de projet", () => {
  test("cinq compteurs, dans l'ordre de la carte, chacun le nombre que la box a donné", () => {
    const accounts = board({ ...FACTS, compteurs: { rail: 5, auTravail: 4, aLaPass: 3, attend: 2, livres24h: 1 } }).compteurs;

    assert.deepEqual(accounts.map(({ libelle: wording, nombre: count }) => [wording, count]), [
      ["rail", 5],
      ["taken", 4],
      ["at pass", 3],
      ["awaiting you", 2],
      ["served 24 h", 1],
    ]);
  });

  test("ses cooks en cours : le ticket, le titre, la station de chacun, dans l'ordre que la box a donné — rien d'autre", () => {
    const cooks = [
      { ticket: 21, titre: "L'export du journal", station: "box/claude" },
      { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" },
      { ticket: 30, titre: "", station: "une/station-inconnue" },
    ];

    assert.deepEqual(board({ ...FACTS, cooks }).cooks.enCours, cooks);
  });

  test("aucun cook : la carte le dit", () => {
    assert.deepEqual(board({ ...FACTS, cooks: [] }).cooks, { enCours: [], vide: "no cook running" });
  });

  test("une box qui ne donne pas encore les cooks : la carte se dessine sans eux et le dit — ni une erreur, ni « aucun cook »", () => {
    const receivedOne = draw(readEntry(renderedOnes(WITHOUT_COOKS)));

    assert.ok("tableau" in receivedOne);
    const { rail: withoutEux, ...remains } = receivedOne.tableau;
    const { rail: withEux, ...expected } = board(FACTS);
    assert.deepEqual(remains, { ...expected, cooks: { enCours: [], vide: "cooks running: not read — this station's runtime does not give them in `facts` yet. This is not “no cook”: the station's “station” step shows them" } });
    // Sa carte du rail non plus ne dit pas qui le tient : c'est écrit, pas mis à « personne ».
    assert.deepEqual(ranks(withoutEux), ranks(withEux));
    assert.deepEqual(cards(withoutEux).find(({ ticket }) => ticket === 14)?.dit.map(({ libelle: wording }) => wording), ["right now"]);
    assert.match(cards(withoutEux).find(({ ticket }) => ticket === 14)?.sans ?? "", / : who holds it · since when · its lease · what it burns · what blocks it$/);
  });

  test("le dernier événement : son type tel quel, son ticket, et son âge à la lecture — sur l'horloge de la box, pas celle du poste", () => {
    assert.equal(event(FACTS), "merge.done · #216 · 13 s before the reading");
    assert.equal(event({ ...FACTS, dernierEvenement: { seq: 3, at: "2026-10-12T08:01:11.000Z", type: "kitchen.stopped", ticket: null } }), "kitchen.stopped · 2 h 03 before the reading");
    assert.equal(event({ ...FACTS, dernierEvenement: { seq: 3, at: "2026-10-12T10:03:58.000Z", type: "un.type.inconnu", ticket: 7 } }), "un.type.inconnu · #7 · 13 s before the reading");
    assert.equal(event({ ...FACTS, dernierEvenement: null }), "none: the log is empty");
  });

  test("l'écart entre le last tick et la lecture est affiché, et rien n'en est conclu", () => {
    assert.equal(tick(FACTS), "last tick 9 s before the reading");
    assert.equal(tick({ ...FACTS, dernierTick: "2026-10-10T10:04:11.000Z" }), "last tick 2 d before the reading");
    assert.equal(tick({ ...FACTS, dernierTick: null }), "no tick: runtime stopped, or no tick yet since it started");
  });

  test("une durée se dit comme `status` la dit", () => {
    assert.deepEqual([0, 999, 59_000, 60_000, 12 * 60_000, 3_599_000, 3_600_000, (3 * 60 + 2) * 60_000, 24 * 3_600_000 - 1, 2 * 24 * 3_600_000].map(duration), ["0 s", "0 s", "59 s", "1 min", "12 min", "59 min", "1 h 00", "3 h 02", "23 h 59", "2 d"]);
    // Deux horloges ne se croisent pas ici — mais une forme écrite à la main ne doit pas rendre un âge négatif.
    assert.equal(duration(-5_000), "0 s");
  });
});

describe("un ticket s'ouvre sur son issue", () => {
  test("une carte qui attend un autre humain du projet s'ouvre et se répond comme les autres : son adresse et sa carte du chef sont lues (#3071)", () => {
    const heldOnes = holdFacts();
    const chef = { sorte: "product-question", texte: "Open the beta?\n\n- [resume] Yes" };
    heldOnes.recevoir(readEntry(renderedOnes({ ...FACTS, attend: [], rail: [], attendAutres: [{ ticket: 77, titre: "Open the beta", url: "https://github.com/benomite/brigade/issues/77", chef, qui: ["carol"] }] })));
    assert.equal(heldOnes.adresse("brigade", 77), "https://github.com/benomite/brigade/issues/77");
    assert.deepEqual(heldOnes.chef("brigade", 77), chef);
  });

  test("l'adresse est celle que la box a donnée pour ce ticket de ce projet — la vue ne nomme qu'un projet et un numéro", () => {
    const heldOnes = holdFacts();
    heldOnes.recevoir(readEntry(renderedOnes(FACTS)));
    heldOnes.recevoir({ ...readEntry(renderedOnes({ ...FACTS, attend: [], rail: [{ ticket: 14, etat: "pris", titre: "Autre", url: "https://github.com/benomite/parade/issues/14" }] })), projet: "parade" });

    assert.equal(heldOnes.adresse("brigade", 14), "https://github.com/benomite/brigade/issues/14");
    assert.equal(heldOnes.adresse("brigade", 21), "https://github.com/benomite/brigade/issues/21");
    assert.equal(heldOnes.adresse("parade", 14), "https://github.com/benomite/parade/issues/14");
    heldOnes.recevoir({ ...readEntry(renderedOnes({ ...FACTS, attend: [{ ticket: 378, titre: "", url: "https://github.com/benomite/brigade/issues/378" }, { ticket: 379, titre: "", url: null }, { ticket: 380, titre: "", url: "javascript:alert(1)" }] })) });
    assert.equal(heldOnes.adresse("brigade", 378), "https://github.com/benomite/brigade/issues/378");
    for (const ticket of [379, 380]) assert.equal(heldOnes.adresse("brigade", ticket), undefined);
    heldOnes.recevoir(readEntry(renderedOnes(FACTS)));
    for (const [project, ticket] of [["brigade", 15], ["parade", 21], ["absent", 14], ["brigade", "14"], [undefined, undefined], ["brigade", "https://exemple.fr"]]) assert.equal(heldOnes.adresse(project, ticket), undefined);
  });

  test("seule une adresse https s'ouvre : ce que la box rend n'est pas lancé comme un fichier ou un programme", () => {
    const heldOnes = holdFacts();
    const urls = ["file:///etc/passwd", "javascript:alert(1)", "http://github.com/benomite/brigade/issues/3", "ftp://box", "", "pas une adresse", "/Applications/Calculator.app"];
    heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: urls.map((url, rank) => ({ ticket: rank, etat: "pris", titre: "", url })) })));

    for (const rank of urls.keys()) assert.equal(heldOnes.adresse("brigade", rank), undefined, String(urls[rank]));
    assert.deepEqual(cards(rail({ ...WITHOUT_DELIVERED, attend: [], rail: urls.map((url, rank) => ({ ticket: rank, etat: "pris", titre: "", url })) })).map((ticket) => ticket.ouvrable), urls.map(() => false));
  });

  test("une lecture ratée retire les adresses de la lecture d'avant, et `oublier` les retire toutes", () => {
    const heldOnes = holdFacts();
    heldOnes.recevoir(readEntry(renderedOnes(FACTS)));
    heldOnes.recevoir({ ...readEntry(renderedOnes(FACTS)), projet: "parade" });

    assert.deepEqual(heldOnes.recevoir(readEntry("cuisine    ouverte\n")), draw(readEntry("cuisine    ouverte\n")));
    assert.equal(heldOnes.adresse("brigade", 14), undefined);
    assert.equal(heldOnes.adresse("parade", 14), "https://github.com/benomite/brigade/issues/14");

    heldOnes.oublier();
    assert.equal(heldOnes.adresse("parade", 14), undefined);
  });
});

// Un rail de chaque état, dans l'ordre de service, et le bloc `attend` que
// `status` écrit à côté : #12 et #21 y sont, #30 n'est pas sur le rail.
// Ces faits sont ceux d'une box d'avant `livres` : Livré y prend les tickets `servi`
// du rail, comme chaque colonne ceux de son mot. Ce que `livres` y change est plus bas.
const ticket = (number: number, state: string) => ({ ticket: number, etat: state, titre: `Ticket ${number}`, url: `https://github.com/benomite/brigade/issues/${number}` });
const RAIL = [ticket(9, "servi"), ticket(12, "en pass"), ticket(14, "pris"), ticket(15, "en pass"), ticket(16, "en attente"), ticket(21, "BLOQUÉ"), ticket(22, "en attente"), ticket(40, "86"), ticket(41, "au four")];
const BLOCK = {
  bloc:
    "attend     4 décisions attendent le chef — la plus ancienne depuis 2 j\n" +
    "  claude  depuis 2 j  connexion Max absente — à rétablir : `claude /login` sous le compte du service, puis `brigade <projet> garde-fous reprendre`\n" +
    "  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 21\n" +
    "  #30  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue\n" +
    "  #12  depuis 4 min  livraison verte, non mergée — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12\n" +
    "fin attend\n",
  a: "2026-10-12T10:04:20.000Z",
};
const ranks = (draws: ReturnType<typeof rail>) => draws.colonnes.map(({ nom: name, compte: account, cartes: cards }) => [name, account, cards.map(({ ticket }) => ticket)]);

// Ce qu'une carte porte de plus que son rang, quand `status` n'a pas été lu et que rien d'autre ne le dit.
const BARE = { ligne: "ready, waits for a place in the kitchen", dit: [], sans: `${WITHOUT_STATUS} : who holds it · since when · its lease · what it burns · what blocks it` };
// Dans T'attend, sous ce que le bloc dit du ticket : ce qui le bloque est dit, le reste manque.
const expectedOne = (ticket: number) => ({ ligne: withoutQuestion(ticket), dit: [], sans: `${WITHOUT_STATUS} : who holds it · since when · its lease · what it burns` });

describe("le rail en six colonnes", () => {
  test("quatre colonnes viennent du mot d'état de `faits`, dans l'ordre de service — et T'attend n'est pas lue tant que rien ne dit qui attend", () => {
    const draws = rail({ ...NO_AWAITING_NOR_SERVED, rail: RAIL });

    assert.deepEqual(ranks(draws), [
      ["On the rail", "3", [16, 21, 22]],
      ["Taken", "1", [14]],
      ["Pass", "2", [12, 15]],
      ["Awaiting you", "?", []],
      ["Waiting", "0", []],
      ["Served", "1", [9]],
    ]);
    assert.match(draws.colonnes[3]?.vide ?? "", /^not read: .* This is not “nothing awaits you”/);
    assert.ok(!("attendLu" in draws));
    assert.ok(cards(draws).every(({ attendu: expected }) => !expected));
  });

  test("la cinquième vient d'abord de `attend`, que la forme donne : sans que `status` ait été lu, un ticket qui attend une décision est déjà dans T'attend, et nulle part ailleurs", () => {
    const draws = rail({ ...WITHOUT_DELIVERED, rail: RAIL, attend: [{ ticket: 21, titre: "Ticket 21", url: "https://github.com/benomite/brigade/issues/21" }, { ticket: 12, titre: "Ticket 12", url: "https://github.com/benomite/brigade/issues/12" }] });

    assert.deepEqual(ranks(draws), [
      ["On the rail", "2", [16, 22]],
      ["Taken", "1", [14]],
      ["Pass", "1", [15]],
      ["Awaiting you", "2", [21, 12]],
      ["Waiting", "0", []],
      ["Served", "1", [9]],
    ]);
    // Ce qu'on attend de lui, en mots, n'a pas été lu : la carte l'écrit, et n'offre aucun geste d'après des mots qu'elle n'a pas.
    assert.deepEqual(draws.colonnes[3]?.cartes[0], { ticket: 21, etat: "BLOQUÉ", mot: "BLOCKED", ton: "rouge", titre: "Ticket 21", ouvrable: true, attendu: true, attend: [], etape: "On the rail", ...BARE, ligne: withoutQuestion(21), ...card("Ticket 21", expected(21)), gestes: ["attente-poser"], ...atChef(21) });
    // Aucun ticket n'attend : la colonne le dit de `faits`, et jamais « rien ne t'attend » — une connexion, la base n'y ont pas de carte.
    assert.deepEqual(rail({ ...WITHOUT_DELIVERED, rail: RAIL, attend: [] }).colonnes[3], { nom: "Awaiting you", ton: "rouge", compte: "0", cartes: [], vide: "no ticket in `attend`, according to `facts`" });
  });

  test("le bloc `attend` y ajoute ce qu'on attend de lui : un ticket qu'il nomme est dans T'attend et nulle part ailleurs, dans l'ordre du bloc, avec ce que sa ligne dit", () => {
    for (const facts of [{ ...WITHOUT_DELIVERED, rail: RAIL }, { ...NO_AWAITING_NOR_SERVED, rail: RAIL }]) {
      const draws = rail(facts, BLOCK);

      assert.deepEqual(ranks(draws), [
        ["On the rail", "2", [16, 22]],
        ["Taken", "1", [14]],
        ["Pass", "1", [15]],
        ["Awaiting you", "3", [21, 30, 12]],
        ["Waiting", "0", []],
        ["Served", "1", [9]],
      ]);
      assert.equal(draws.attendLu, BLOCK.a);
      assert.deepEqual(draws.colonnes[3]?.cartes[2], {
        ticket: 12,
        etat: "en pass",
        mot: "in pass",
        ton: "jaune",
        titre: "Ticket 12",
        ouvrable: true,
        attendu: true,
        etape: "Pass",
        attend: ["depuis 4 min  livraison verte, non mergée — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12"],
        ...expectedOne(12),
        // En pass, ce que la pass en fait : un runtime d'avant ce champ ne le dit pas, et la carte l'écrit.
        dit: [{ libelle: "right now", valeur: "activity not given — this station's runtime does not give it in `facts`" }],
        ...card("Ticket 12", expected(12)),
        ...atChef(12),
      });
    }
  });

  test("un ticket que `faits` dit attendre et que le bloc ne nomme pas — deux lectures, deux instants — reste dans T'attend, après ceux du bloc", () => {
    const draws = rail({ ...WITHOUT_DELIVERED, rail: RAIL, attend: [{ ticket: 15, titre: "Ticket 15", url: "https://github.com/benomite/brigade/issues/15" }] }, BLOCK);

    assert.deepEqual(ranks(draws)[3], ["Awaiting you", "4", [21, 30, 12, 15]]);
    assert.deepEqual(ranks(draws)[2], ["Pass", "0", []]);
  });

  test("un ticket que le bloc nomme sans qu'il soit sur le rail a sa carte : son numéro et sa ligne — ni titre, ni état, ni adresse, que `faits` ne donne pas", () => {
    assert.deepEqual(rail({ ...WITHOUT_DELIVERED, rail: RAIL }, BLOCK).colonnes[3]?.cartes[1], {
      ticket: 30,
      ouvrable: false,
      attendu: true,
      etape: "On the rail",
      attend: ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"],
      // Une question du manager : la carte la dit (#503).
      question: true,
      ...expectedOne(30),
      ...card(undefined, { issue: { sans: "not given — the station returns no address for this issue" }, ...expected(30) }),
      ...atChef(30),
    });
  });

  test("une carte qui demande au chef de juger une livraison — validation du design — est dans Pass, sur la carte du ticket livré : une carte, jamais sur le rail (#3519)", () => {
    const design = { sorte: "design-validation", texte: "Validate its screen", design: { pr: 31, ticket: 15, sha: "abcdef1", url: "https://github.com/benomite/brigade/pull/31", captures: { complet: true, ecrans: [] } } };
    {
      const draws = rail({ ...WITHOUT_DELIVERED, rail: RAIL, attend: [{ ticket: 93, titre: "Validate #15", url: "https://github.com/benomite/brigade/issues/93", chef: design }] });

      // La carte rouge de la validation est la seule de ce ticket : celle du ticket livré (15) n'est plus dans Pass.
      assert.deepEqual(ranks(draws)[2], ["Pass", "1", [12]]);
      assert.deepEqual(ranks(draws)[3], ["Awaiting you", "1", [93]]);
      assert.equal(draws.colonnes[3]?.cartes[0]?.etape, "Pass");
      assert.equal(draws.colonnes[0]?.cartes.some(({ ticket }) => ticket === 93), false);
      // Elle porte le titre du ticket livré, pas celui de la carte.
      assert.equal(draws.colonnes[3]?.cartes[0]?.titre, "Ticket 15");
    }
  });

  test("un ticket du bloc qui n'est pas sur le rail s'ouvre par l'adresse que `faits.attend` donne, et porte son titre s'il y en a un — l'app n'en compose aucune", () => {
    const awaiting = [
      { ticket: 30, titre: "", url: "https://github.com/benomite/brigade/issues/30" },
      { ticket: 12, titre: "Ticket 12", url: "https://github.com/benomite/brigade/issues/12" },
    ];
    const cardsOf = (facts: Facts) => rail(facts, BLOCK).colonnes[3]?.cartes;

    assert.deepEqual(cardsOf({ ...WITHOUT_DELIVERED, rail: RAIL, attend: awaiting })?.[1], {
      ticket: 30,
      ouvrable: true,
      attendu: true,
      etape: "On the rail",
      attend: ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"],
      // Une question du manager : la carte la dit (#503).
      question: true,
      ...expectedOne(30),
      ...card(undefined, expected(30)),
      ...atChef(30),
    });
    const title = rail({ ...WITHOUT_DELIVERED, rail: [], attend: [{ ticket: 30, titre: "Un titre", url: "https://github.com/benomite/brigade/issues/30" }] }, BLOCK).colonnes[3]?.cartes.find(({ ticket }) => ticket === 30);
    assert.deepEqual([title?.titre, title?.ouvrable], ["Un titre", true]);
    // Sans adresse, ou une adresse qui n'est pas en https : rien ne s'ouvre.
    for (const url of [null, "http://exemple.fr/30", "file:///etc/passwd"]) assert.equal(cardsOf({ ...WITHOUT_DELIVERED, rail: RAIL, attend: [{ ticket: 30, titre: "", url }] })?.[1]?.ouvrable, false);
  });

  test("une ligne sans numéro — la station — n'est dans aucune colonne", () => {
    const withoutTicket = { ...BLOCK, bloc: BLOCK.bloc.split("\n").filter((line) => !line.startsWith("  #")).join("\n") };
    const draws = rail({ ...NO_AWAITING_NOR_SERVED, rail: RAIL }, withoutTicket);

    assert.deepEqual(draws.colonnes[3], { nom: "Awaiting you", ton: "rouge", compte: "0", cartes: [], vide: "no ticket at the head of a line of the `attend` block" });
    assert.deepEqual(ranks(draws), ranks(rail({ ...NO_AWAITING_NOR_SERVED, rail: RAIL })).map((column) => (column[0] === "Awaiting you" ? ["Awaiting you", "0", []] : column)));
  });

  test("le bloc dit que rien n'attend le chef : TODO, en tête, le dit en une ligne au lieu de disparaître (#2076)", () => {
    for (const head of ["awaiting   nothing awaits the chef", "attend     rien n'attend le chef"]) {
      const empty = { ...BLOCK, bloc: [head, "  v1.0.75 in service since 08:00", head.startsWith("awaiting") ? "end awaiting" : "fin attend", ""].join("\n") };
      assert.deepEqual(rail({ ...NO_AWAITING_NOR_SERVED, rail: RAIL }, empty).colonnes[3], { nom: "Awaiting you", ton: "rouge", compte: "0", cartes: [], vide: "nothing awaits you" });
    }
  });

  test("un ticket `86` ou d'un mot inconnu n'est d'aucune colonne : il est rendu à part, avec son mot — et dans T'attend si la file dit qu'il attend", () => {
    assert.deepEqual(rail({ ...WITHOUT_DELIVERED, rail: RAIL }, BLOCK).hors, [
      { ticket: 40, etat: "86", mot: "set aside", ton: "rouge", titre: "Ticket 40", ouvrable: true, attendu: false, attend: [], ...BARE, ...card("Ticket 40") },
      { ticket: 41, etat: "au four", titre: "Ticket 41", ouvrable: true, attendu: false, attend: [], ...BARE, ...card("Ticket 41") },
    ]);
    const rises = rail({ ...NO_AWAITING_NOR_SERVED, rail: RAIL }, { ...BLOCK, bloc: "attend     1 décision attend le chef depuis 2 j\n  #40  depuis 2 j  remontée par la pass, rouge\nfin attend\n" });

    assert.deepEqual(rises.colonnes[3]?.cartes.map(({ ticket, etat: state }) => [ticket, state]), [[40, "86"]]);
    assert.deepEqual(rises.hors.map(({ ticket }) => ticket), [41]);
    assert.deepEqual(rail({ ...WITHOUT_DELIVERED, rail: RAIL, attend: [{ ticket: 41, titre: "Ticket 41", url: null }] }).hors.map(({ ticket }) => ticket), [40]);
  });

  test("un ticket mis de côté, dont le runtime dit la raison, est rangé dans une colonne — jamais hors — et la porte en une ligne, sans la ligne brute", () => {
    const aside = { ...ticket(40, "86"), activite: null, attente: { raison: "attend : setup du projet impossible", colonne: "86", retour: "2026-10-12T10:09:00.000Z" } };
    const probe = { ...WITHOUT_DELIVERED, rail: [aside, ticket(41, "au four")] };
    const draws = rail(probe, BLOCK, { texte: "rail  2\n  #40  86  prio:1  depuis 9 min (setup-failed), retour dans 31 s  Ticket 40\n", a: "2026-10-12T10:04:12.000Z" });

    assert.deepEqual(draws.hors.map(({ ticket }) => ticket), [41]);
    const column = draws.colonnes.find(({ cartes: cards }) => cards.some(({ ticket }) => ticket === 40));
    assert.equal(column?.nom, "On the rail");
    const cardItem = column?.cartes.find(({ ticket }) => ticket === 40);
    assert.deepEqual(cardItem?.dit, [{ libelle: "set aside", valeur: "attend : setup du projet impossible" }]);
    assert.equal(cardItem?.relais, undefined);
    assert.doesNotMatch(JSON.stringify(cardItem), /setup-failed|retour dans/);
  });

  test("une mise de côté dont la colonne est inconnue de l'app va dans la colonne par défaut, sans rien casser", () => {
    const aside = { ...ticket(40, "86"), attente: { raison: "attend : mis de côté (cause-neuve)", colonne: "au four", retour: null } };
    const draws = rail({ ...WITHOUT_DELIVERED, rail: [aside] });

    assert.deepEqual(draws.hors, []);
    assert.deepEqual(draws.colonnes[0]?.cartes.map(({ ticket }) => ticket), [40]);
  });

  test("un ticket nommé deux fois par le bloc n'a qu'une carte, qui porte ses deux lignes", () => {
    const double = rail({ ...NO_AWAITING_NOR_SERVED, rail: RAIL }, { ...BLOCK, bloc: "attend\n  #14  une ligne\n  #14  une autre\nfin attend\n" });

    assert.deepEqual(double.colonnes[3]?.cartes.map(({ ticket, etat: state, attendu: expected, attend: awaiting }) => ({ ticket, etat: state, attendu: expected, attend: awaiting })), [{ ticket: 14, etat: "pris", attendu: true, attend: ["une ligne", "une autre"] }]);
    assert.equal(double.colonnes[3]?.compte, "1");
  });

  test("ce que le bloc dit d'un ticket est porté mot pour mot, ni tronqué ni remis en forme : une entrée longue, et les lignes qui la précisent dessous", () => {
    const long = `depuis 2 j  ${"une phrase très longue, avec    des blancs, `du code` et un <b>faux balisage</b> — ".repeat(40)}jusqu'au bout  `;
    const suite = ["      │ une première ligne de suite,   blancs compris  ", "      │ \tune tabulation, puis « des accents » → ✓", `      │ ${"x".repeat(900)}`];
    const block = ["attend     2 décisions attendent le chef — la plus ancienne depuis 2 j", `  #12  ${long}`, ...suite, "  #21  depuis 3 h 02  courte", "fin attend", ""].join("\n");
    const [first, second] = rail({ ...WITHOUT_DELIVERED, rail: RAIL }, { bloc: block, a: BLOCK.a }).colonnes[3]?.cartes ?? [];

    assert.deepEqual(first?.attend, [[long, ...suite].join("\n")]);
    assert.deepEqual(second?.attend, ["depuis 3 h 02  courte"]);
    // Rien n'est perdu du bloc : chaque ligne d'une entrée de ticket se retrouve sur sa carte, entière.
    for (const line of [`  #12  ${long}`, ...suite]) assert.ok(`  #12  ${first?.attend[0]}`.split("\n").includes(line));
  });

  test("chaque ticket que `faits` rend est dessiné une fois, quel que soit le bloc", () => {
    for (const block of [undefined, BLOCK, { ...BLOCK, bloc: "attend     rien n'attend le chef\nfin attend\n" }]) assert.deepEqual(cards(rail({ ...WITHOUT_DELIVERED, rail: RAIL }, block)).map(({ ticket }) => ticket).filter((number) => number !== 30).sort((a, b) => a - b), RAIL.map(({ ticket }) => ticket).sort((a, b) => a - b));
  });
});

// Livré, d'une box qui donne `livres` : les tickets servis dans les 24 h, que leur
// issue soit fermée ou non — le rail ne les porte plus quelques secondes après le merge.
describe("Livré, d'après `livres`", () => {
  const delivers = (ticket: number, deliversThe: string, other: object = {}) => ({
    ticket,
    titre: `Ticket ${ticket}`,
    url: `https://github.com/benomite/brigade/issues/${ticket}`,
    livre: deliversThe,
    station: "box/claude",
    pr: `https://github.com/benomite/brigade/pull/${ticket + 100}`,
    relecture: { resume: `Ce qui a été livré pour #${ticket}.`, constats: [] },
    ...other,
  });
  const DELIVERED = [delivers(30, "2026-10-12T10:00:00.000Z"), delivers(9, "2026-10-12T09:00:00.000Z"), delivers(14, "2026-10-11T12:00:00.000Z")];
  const deliversCol = (draws: ReturnType<typeof rail>) => draws.colonnes.find(({ nom: name }) => name === "Served");

  test("un runtime qui ne donne pas encore `livres` rend toujours la forme : le champ manque ; une station, une PR ou une issue nulles sont des faits", () => {
    const understood = understand(renderedOnes(WITHOUT_DELIVERED));
    assert.deepEqual(understood, WITHOUT_DELIVERED);
    assert.ok(!("livres" in understood));

    const none = { ...FACTS, livres: [delivers(378, "2026-10-12T10:00:00.000Z", { titre: "", url: null, station: null, pr: null })] };
    assert.deepEqual(understand(renderedOnes(none)), none);
    assert.match(informs(renderedOnes({ ...FACTS, livres: {} })), /livres/);
    assert.match(unreadable(renderedOnes({ ...FACTS, livres: [{ ...delivers(30, "hier") }] })), /livres\[0\]\.livre/);
    const { pr: _pr, ...withoutPr } = delivers(30, "2026-10-12T10:00:00.000Z");
    assert.match(unreadable(renderedOnes({ ...FACTS, livres: [withoutPr] })), /livres\[0\]\.pr/);
  });

  test("ses cartes sont celles de `livres`, dans son ordre — le plus récent en haut —, autant que `livrés 24 h` : partis du rail, ils y restent", () => {
    // #30 et #14 ont quitté le rail ; #9 y est encore, `servi`.
    const draws = rail({ ...NO_AWAITING, rail: RAIL.filter(({ ticket }) => ![12, 30].includes(ticket)), compteurs: { ...FACTS.compteurs, livres24h: 3 }, livres: DELIVERED });

    assert.deepEqual(ranks(draws).at(-1), ["Served", "3", [30, 9, 14]]);
    assert.equal(deliversCol(draws)?.defile, true);
    // #9 n'a qu'une carte : celle de Livré. #14, repris depuis son service, est aussi au travail.
    assert.deepEqual(cards(draws).filter(({ ticket }) => ticket === 9).length, 1);
    assert.deepEqual(ranks(draws)[1], ["Taken", "1", [14]]);
    assert.deepEqual(deliversCol(draws)?.cartes[0], {
      ticket: 30,
      etat: "servi",
      essayable: true,
      mot: "served",
      ton: "vert",
      titre: "Ticket 30",
      ouvrable: true,
      attendu: false,
      attend: [],
      ligne: `served at ${hourHM("2026-10-12T10:00:00.000Z")} · Ce qui a été livré pour #30.`,
      pr: true,
      livraison: { resume: "Ce qui a été livré pour #30.", remarques: "no remarks", constats: [] },
      dit: [
        { libelle: "merged", valeur: "4 min ago" },
        { libelle: "cooked by", valeur: "box/claude", exact: true },
      ],
      ...card("Ticket 30", { pr: true }),
    });
  });

  test("rien de servi en 24 h : la colonne le dit, elle n'est pas simplement vide — d'une box d'avant `livres`, c'est « aucun ticket »", () => {
    assert.deepEqual(deliversCol(rail({ ...FACTS, rail: [], livres: [] })), { nom: "Served", ton: "vert", compte: "0", cartes: [], vide: "nothing served in the last 24 h", defile: true });
    assert.deepEqual(deliversCol(rail({ ...WITHOUT_DELIVERED, rail: [] })), { nom: "Served", ton: "vert", compte: "0", cartes: [], vide: "no ticket" });
  });

  test("un ticket `servi` du rail que `livres` ne donne pas — servi il y a plus de 24 h — est rendu à part, pas compté dans Livré", () => {
    const draws = rail({ ...NO_AWAITING, rail: RAIL, livres: [] });

    assert.deepEqual(ranks(draws).at(-1), ["Served", "0", []]);
    assert.ok(draws.hors.some(({ ticket, etat: state }) => ticket === 9 && state === "servi"));
    // Rien n'est perdu : chaque ticket du rail a sa carte, une fois.
    assert.deepEqual(cards(draws).map(({ ticket }) => ticket).sort((a, b) => a - b), RAIL.map(({ ticket }) => ticket).sort((a, b) => a - b));
  });

  test("ce que `livres` ne dit pas est écrit sur la carte : ni cuisinier ni PR, ni titre ni issue pour une livraison hors du rail", () => {
    const [cardItem] = deliversCol(rail({ ...FACTS, rail: [], livres: [delivers(378, "2026-10-12T10:00:00.000Z", { titre: "", url: null, station: null, pr: null, relecture: null })] }))?.cartes ?? [];

    assert.deepEqual(cardItem, {
      ticket: 378,
      etat: "servi",
      essayable: true,
      mot: "served",
      ton: "vert",
      ouvrable: false,
      attendu: false,
      attend: [],
      ligne: `served at ${hourHM("2026-10-12T10:00:00.000Z")}`,
      repere: true,
      livraison: { sans: WITHOUT_REVIEW },
      dit: [
        { libelle: "served", valeur: "4 min before the reading" },
        { libelle: "PR", valeur: "none — served without a merge" },
      ],
      sans: "not given by the queue: who cooked it — no station sent it to pass",
      // Sa fiche le dit aussi : ni titre, ni issue — et pas de PR, qu'aucun lien ne prétend ouvrir.
      ...card(undefined, { issue: { sans: "not given — the station returns no address for this issue" }, pr: { valeur: "none — served without a merge" } }),
    });
    // Un titre vide se complète de celui du rail, une issue nulle de son adresse.
    const [ofRail] = deliversCol(rail({ ...FACTS, rail: [ticket(9, "servi")], livres: [delivers(9, "2026-10-12T10:00:00.000Z", { titre: "", url: null })] }))?.cartes ?? [];
    assert.deepEqual([ofRail?.titre, ofRail?.ouvrable], ["Ticket 9", true]);
  });

  test("ce qui a été livré est le résumé de la relecture, mot pour mot, avec le nombre de ses constats en clair — sans relecture, la carte dit pourquoi, et ne met pas le titre à sa place", () => {
    const LONG = `${"Un résumé long, que rien ne coupe au milieu d'un mot. ".repeat(12)}Fin.`;
    const finding = (gravite: string, text: string) => ({ gravite, fichier: "app/src/facts.ts", constat: text });
    const four = [finding("remarque", "Un."), finding("remarque", "Deux."), finding("remarque", "Trois."), finding("remarque", "Quatre.")];
    const cardsOf = (...delivered: object[]) => deliversCol(rail({ ...FACTS, rail: [], livres: delivered } as Facts))?.cartes.map(({ livraison: delivery }) => delivery);

    assert.deepEqual(
      cardsOf(
        delivers(1, "2026-10-12T10:00:00.000Z", { relecture: { resume: LONG, constats: four } }),
        delivers(2, "2026-10-12T10:00:00.000Z", { relecture: { resume: "Seul.", constats: [finding("remarque", "Un.")] } }),
        delivers(3, "2026-10-12T10:00:00.000Z", { relecture: { resume: "Rouge, mergé à la main.", constats: [finding("bloquant", "Un."), finding("remarque", "Deux.")] } }),
        delivers(4, "2026-10-12T10:00:00.000Z", { relecture: null }),
      ),
      [
        { resume: LONG, remarques: "4 remarks", constats: four },
        { resume: "Seul.", remarques: "1 remark", constats: [finding("remarque", "Un.")] },
        { resume: "Rouge, mergé à la main.", remarques: "2 remarks, 1 blocking", constats: [finding("bloquant", "Un."), finding("remarque", "Deux.")] },
        { sans: WITHOUT_REVIEW },
      ],
    );
    // D'un runtime qui donne `livres` sans `relecture`, ou qui ne donne pas `livres` : la carte le dit.
    const { relecture: _review, ...withoutReview } = delivers(5, "2026-10-12T10:00:00.000Z");
    const NOT_DATA = { sans: "what was delivered: not given — this station's runtime does not yet give the review in `facts`" };
    assert.deepEqual(cardsOf(withoutReview), [NOT_DATA]);
    assert.deepEqual(
      deliversCol(rail({ ...WITHOUT_DELIVERED, rail: [ticket(9, "servi")] }))?.cartes.map(({ livraison: delivery }) => delivery),
      [NOT_DATA],
    );
    // Les autres colonnes n'en portent pas : rien n'y a été livré.
    assert.ok(cards(rail({ ...WITHOUT_DELIVERED, rail: RAIL })).every(({ etat: state, livraison: delivery }) => (state === "servi") === (delivery !== undefined)));
  });

  test("une relecture qui n'a pas la forme refuse la forme entière : un résumé, des constats en liste, chacun avec sa gravité, son fichier ou rien, son texte", () => {
    const withIt = (review: unknown) => renderedOnes({ ...FACTS, livres: [delivers(30, "2026-10-12T10:00:00.000Z", { relecture: review })] });
    assert.deepEqual(understand(withIt({ resume: "R.", constats: [{ gravite: "inconnue", fichier: null, constat: "C." }] })), { ...FACTS, livres: [delivers(30, "2026-10-12T10:00:00.000Z", { relecture: { resume: "R.", constats: [{ gravite: "inconnue", fichier: null, constat: "C." }] } })] });
    assert.match(unreadable(withIt("un texte")), /livres\[0\]\.relecture/);
    assert.match(unreadable(withIt({ constats: [] })), /livres\[0\]\.relecture\.resume/);
    assert.match(unreadable(withIt({ resume: "R." })), /livres\[0\]\.relecture\.constats/);
    assert.match(unreadable(withIt({ resume: "R.", constats: [{ gravite: "remarque", constat: "C." }] })), /livres\[0\]\.relecture\.constats\[0\]\.fichier/);
    assert.match(unreadable(withIt({ resume: "R.", constats: [{ gravite: "remarque", fichier: null }] })), /livres\[0\]\.relecture\.constats\[0\]\.constat/);
  });

  test("une PR dont l'adresse n'est pas en https ne s'ouvre pas : la carte le sait, le process principal ne la donne pas", () => {
    const [cardItem] = deliversCol(rail({ ...FACTS, rail: [], livres: [delivers(30, "2026-10-12T10:00:00.000Z", { pr: "javascript:alert(1)" })] }))?.cartes ?? [];
    assert.equal(cardItem?.pr, false);
  });

  test("le process principal ouvre la PR mergée et l'issue d'un ticket livré, d'après la dernière lecture de son projet — rien d'autre", () => {
    const heldOnes = holdFacts();
    heldOnes.recevoir(readEntry(renderedOnes({ ...FACTS, rail: [], attend: [], livres: [...DELIVERED, delivers(40, "2026-10-12T08:00:00.000Z", { pr: "file:///etc/passwd", url: "http://exemple.fr/40" }), delivers(41, "2026-10-12T08:00:00.000Z", { pr: null })] })));

    assert.equal(heldOnes.pr("brigade", 30), "https://github.com/benomite/brigade/pull/130");
    assert.equal(heldOnes.adresse("brigade", 30), "https://github.com/benomite/brigade/issues/30");
    for (const [project, number] of [["brigade", 40], ["brigade", 41], ["brigade", 99], ["parade", 30], ["brigade", "30"]] as const) assert.equal(heldOnes.pr(project, number), undefined);
    assert.equal(heldOnes.adresse("brigade", 40), undefined);
    heldOnes.oublier();
    assert.equal(heldOnes.pr("brigade", 30), undefined);
  });
});

describe("le bloc `attend` tenu à côté des faits", () => {
  const status = (text: string, a = BLOCK.a): Reading => ({ projet: "brigade", demande: 9, a, sorties: [{ commande: "status", texte: text }] });
  const column = (receivedOne: ReturnType<ReturnType<typeof holdFacts>["attendre"]>) => (receivedOne !== undefined && "tableau" in receivedOne ? receivedOne.tableau.rail.colonnes[3] : undefined);

  test("ce que le bloc dit d'un ticket se rend au process principal, ligne pour ligne — et rien pour un ticket qu'il ne nomme pas", () => {
    const heldOnes = holdFacts();
    assert.equal(heldOnes.attendu("brigade", 30), undefined);
    heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })));
    heldOnes.attendre(putAside(status(`cuisine    ouverte\n${BLOCK.bloc}`)));

    const said = heldOnes.attendu("brigade", 30);
    assert.deepEqual(said?.lignes, ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"]);
    assert.equal(heldOnes.attendu("brigade", 99), undefined);
    assert.equal(heldOnes.attendu("parade", 30), undefined);
    assert.equal(heldOnes.attendu("brigade", "30"), undefined);
    heldOnes.attendre(putAside(status("cuisine    ouverte\n")));
    assert.equal(heldOnes.attendu("brigade", 30), undefined);
  });

  test("un `status` lu après les faits les fait redessiner : T'attend se remplit, sous la demande et l'heure de la lecture de `faits`", () => {
    const heldOnes = holdFacts();
    heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })));
    const receivedOne = heldOnes.attendre(putAside(status(`cuisine    ouverte\n${BLOCK.bloc}`)));

    assert.deepEqual(receivedOne, { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", tableau: board({ ...WITHOUT_DELIVERED, rail: RAIL }, BLOCK) });
    assert.deepEqual(column(receivedOne)?.cartes.map(({ ticket }) => ticket), [21, 30, 12]);
  });

  test("le même `status` donne aux cartes la ligne de chaque ticket sous `rail` : ce qu'elles portent en vient, sous l'heure de sa lecture", () => {
    const heldOnes = holdFacts();
    const text = `cuisine    ouverte\n${BLOCK.bloc}rail       1 pris\n  #14  pris  -  par box/claude depuis 12 min, bail encore 18 min  Ticket 14\n\ncooks      1 en cours\n`;
    heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })));
    const receivedOne = heldOnes.attendre(putAside(status(text)));

    assert.ok(receivedOne !== undefined && "tableau" in receivedOne);
    assert.equal(receivedOne.tableau.rail.railLu, BLOCK.a);
    assert.deepEqual(receivedOne.tableau.rail.colonnes[1]?.cartes[0]?.dit.map(({ libelle: wording, valeur: value }) => [wording, value]).slice(1, 4), [["taken by", "box/claude"], ["since", "12 min"], ["lease", "bail encore 18 min"]]);
    // Des faits relus ensuite se dessinent avec lui ; raté, il n'en reste rien.
    assert.deepEqual(heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))), receivedOne);
    const after = heldOnes.attendre(putAside({ projet: "brigade", demande: 9, a: BLOCK.a, erreur: "spawn node ENOENT", atteinte: false, cas: null }));
    assert.deepEqual(after, draw(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))));
    // Et un projet dont `status` n'est plus lu le lâche, comme son bloc.
    heldOnes.attendre(putAside(status(text)));
    assert.deepEqual(heldOnes.veiller([]), [draw(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })))]);
  });

  test("des faits lus après un `status` sont dessinés avec son bloc — celui de leur projet, pas d'un autre", () => {
    const heldOnes = holdFacts();
    assert.equal(heldOnes.attendre(putAside(status(BLOCK.bloc))), undefined);

    assert.deepEqual(heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))), { ...draw(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))), tableau: board({ ...WITHOUT_DELIVERED, rail: RAIL }, BLOCK) });
    assert.deepEqual(heldOnes.recevoir({ ...readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })), projet: "parade" }), { ...draw(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))), projet: "parade" });
  });

  test("un `status` raté, ou sans bord, retire le bloc d'avant : sur une box qui ne donne pas `attend` dans `faits`, T'attend n'est plus lue, et les tickets retournent dans leurs colonnes", () => {
    for (const without of [status("cuisine    ouverte\n"), { projet: "brigade", demande: 9, a: BLOCK.a, erreur: "spawn node ENOENT", atteinte: false, cas: null }] satisfies Reading[]) {
      const heldOnes = holdFacts();
      heldOnes.recevoir(readEntry(renderedOnes({ ...NO_AWAITING_NOR_SERVED, rail: RAIL })));
      heldOnes.attendre(putAside(status(BLOCK.bloc)));

      assert.equal(column(heldOnes.attendre(putAside(without)))?.compte, "?");
      assert.deepEqual(heldOnes.recevoir(readEntry(renderedOnes({ ...NO_AWAITING_NOR_SERVED, rail: RAIL }))), draw(readEntry(renderedOnes({ ...NO_AWAITING_NOR_SERVED, rail: RAIL }))));
      // Rien n'a changé : rien n'est redessiné.
      assert.equal(heldOnes.attendre(putAside(without)), undefined);
    }
  });

  test("un projet dont `status` n'est plus lu perd son bloc : ses faits, relus plus tard, ne sont pas rangés d'après un bloc que plus rien ne rafraîchit", () => {
    const heldOnes = holdFacts();
    const parade = { ...readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })), projet: "parade" };
    heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })));
    heldOnes.recevoir(parade);
    heldOnes.attendre(putAside(status(BLOCK.bloc)));
    heldOnes.attendre(putAside({ ...status(BLOCK.bloc), projet: "parade" }));

    // La veille de `status` passe à parade seul : brigade est redessiné sans son bloc, parade garde le sien.
    assert.deepEqual(heldOnes.veiller(["parade"]), [draw(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL })))]);
    // Une heure après, #12 a été servi : il est dans Livré, pas dans T'attend d'après le bloc d'avant.
    const served = heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL.map((knownOne) => (knownOne.ticket === 12 ? { ...knownOne, etat: "servi" } : knownOne)) })));
    assert.ok("tableau" in served);
    assert.deepEqual(ranks(served.tableau.rail).slice(3), [["Awaiting you", "1", [21]], ["Waiting", "0", []], ["Served", "2", [9, 12]]]);
    assert.deepEqual(heldOnes.recevoir(parade), { ...draw(parade), tableau: board({ ...WITHOUT_DELIVERED, rail: RAIL }, BLOCK) });

    // Rien à lâcher : rien n'est redessiné. Et plus aucun projet lu lâche le dernier.
    assert.deepEqual(heldOnes.veiller(["parade", "brigade"]), []);
    assert.deepEqual(heldOnes.veiller([]).map(({ projet: project }) => project), ["parade"]);
  });

  test("sans faits pour ce projet, rien n'est redessiné ; et `oublier` retire les blocs avec les faits", () => {
    const heldOnes = holdFacts();
    heldOnes.recevoir(readEntry("cuisine    ouverte\n"));
    assert.equal(heldOnes.attendre(putAside(status(BLOCK.bloc))), undefined);

    heldOnes.oublier();
    assert.deepEqual(heldOnes.recevoir(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))), draw(readEntry(renderedOnes({ ...WITHOUT_DELIVERED, rail: RAIL }))));
  });
});

describe("la bannière d'arrêt", () => {
  test("elle se pose sur le « stop » du chef, un mot de la liste fermée — pas sur un runtime éteint, ni sur un mot inconnu", () => {
    assert.deepEqual(["arrêtée", "éteinte", "retenue", "ouverte", "ARRÊTÉE", "muette"].map((state) => board({ ...FACTS, etat: state }).arretee), [true, false, false, false, false, false]);
  });

  test("son geste est celui du socle qui la relance — la commande de la doc, confirmée avant de partir", () => {
    const kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
    const written = commandOfAction(BANNER.bouton, { nom: "parade", dossier: "/projets/parade" }, kitchen);

    assert.ok(CONFIRMED.includes(BANNER.bouton));
    assert.deepEqual(written, { commande: `(cd '/runtime' && BRIGADE_STATION_DIR='/station' node ${ACTION} parade guardrails resume)` });
  });

  test("ce qu'elle dit de l'arrêt est ce que docs/runtime/ en dit", () => {
    assert.ok(doc.includes("`brigade <projet> guardrails stop`"), "docs/runtime/ ne cite plus `guardrails stop`");
    assert.ok(doc.includes("`brigade <projet> guardrails [stop \\| resume]`"), "docs/runtime/ ne cite plus `guardrails resume`");
    assert.deepEqual(BANNER.texte, [
      "KITCHEN STOPPED — your “stop” holds",
      "All running cooks have been stopped, and none is launched any more — runtime restarts included, until “resume”.",
    ]);
  });
});

// La station et les capacités demandées d'un ticket du rail : lues de la forme brute, par `comprendre`, puis posées par `rail()`.
describe("station et capacités sur les cartes du rail", () => {
  const raw = (rail: unknown[]) => JSON.stringify({ ...FACTS, cooks: undefined, attend: undefined, livres: undefined, rail });
  const ticket = (number: number, more: Record<string, unknown> = {}) => ({ ticket: number, etat: "pris", titre: `T${number}`, url: `https://github.com/benomite/brigade/issues/${number}`, ...more });
  const cards = (text: string) => {
    const readOne = understand(text);
    assert.ok(!("informe" in readOne), "informe" in readOne ? readOne.informe : "");
    const setOne = rail(readOne);
    return { posee: setOne, cartes: [...setOne.colonnes.flatMap((column) => column.cartes), ...setOne.hors] };
  };

  test("`station` et `requires` d'un ticket du rail arrivent sur sa carte, comme `station` et `requiert`", () => {
    const { cartes: allEntries } = cards(raw([ticket(14, { station: "box/claude", requires: ["macos", "gpu"] }), ticket(15)]));
    const cardItem = allEntries.find(({ ticket }) => ticket === 14);
    assert.equal(cardItem?.station, "box/claude");
    assert.deepEqual(cardItem?.requiert, ["macos", "gpu"]);
    const without = allEntries.find(({ ticket }) => ticket === 15);
    assert.equal(without?.station, undefined);
    assert.equal(without?.requiert, undefined);
  });

  test("un `requires` qui n'est pas une liste de textes, ou une `station` qui n'est pas un texte, rend la carte illisible", () => {
    const withIt = (more: Record<string, unknown>) => raw([ticket(14, more)]);
    assert.match(unreadable(withIt({ requires: "macos" })), /rail\[0\]\.requires/);
    assert.match(unreadable(withIt({ requires: ["macos", 3] })), /rail\[0\]\.requires\[1\]/);
    assert.match(unreadable(withIt({ station: 7 })), /rail\[0\]\.station/);
  });

  test("le même ticket relu avec une autre station porte la nouvelle", () => {
    const station = (name: string) => cards(raw([ticket(14, { station: name })])).cartes[0]?.station;
    assert.equal(station("box/claude"), "box/claude");
    assert.equal(station("mac/claude"), "mac/claude");
  });
});

describe("la question d'une carte de TODO, des faits à la carte (#3131)", () => {
  test("une entrée sans carte du chef ne devine rien : « no question found on #N »", () => {
    const without = rail({ ...WITHOUT_DELIVERED, rail: [], attend: [{ ticket: 41, titre: "Export", url: "https://github.com/benomite/brigade/issues/41" }] }, BLOCK).colonnes[3]?.cartes.find(({ ticket }) => ticket === 41);
    assert.equal(without?.ligne, "no question found on #41");
    assert.equal(without?.fiche.attendu, "no question found on #41");
  });
});
