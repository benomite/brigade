// Ce que l'app dessine : les faits que la box rend dans la forme de
// docs/runtime/. L'exemple de la doc est
// lu ici tel qu'il y est écrit ; une sortie qui n'est pas cette forme n'est
// jamais dessinée — ni tableau vide, ni zéros. Une couleur ne se pose que sur
// un mot des listes fermées. Le rail se range en six colonnes, TODO
// d'après `attend`, que la forme donne, et le bloc `attend` de `status` ; WAITING
// d'après les `tiers` de chaque ticket (attente.test.ts). Chaque
// carte porte ce que la file dit du ticket, et écrit ce qu'elle n'en dit pas :
// ce qui s'y lit est dans bon.test.ts.
import { docRuntime } from "./aides/doc-runtime.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Lecture } from "../src/box.ts";
import { mettreAPart } from "../src/attend.ts";
import { SANS_DECISION } from "../src/decision.ts";
import { heureHM } from "../src/format.ts";
import { ACTIVITE_NON_COMMUNIQUEE, BANNIERE, COMMANDE, comprendre, dessiner, direEnCeMoment, duree, evenement, rail, tableau, tenirFaits, tick, titreDEchec, type Faits } from "../src/faits.ts";
import type { Entete } from "../src/fiche.ts";
import { commandeDuGeste, CONFIRMES } from "../src/gestes.ts";

const RACINE = join(import.meta.dirname, "../..");
const doc = docRuntime(RACINE);
// L'exemple de la doc : la ligne du bloc `json` qui porte la forme des faits (ses champs `dernierTick` et `compteurs`).
const EXEMPLE = [...doc.matchAll(/```json\n([^\n]*)\n```/g)].map(([, ligne = ""]) => ligne).find((ligne) => ligne.includes('"dernierTick"') && ligne.includes('"compteurs"')) ?? "";
// Les lignes d'un tableau de la doc dont une ligne a pour premier mot `mot` : de la première à la dernière ligne de ce tableau.
function tableauDeLaDoc(mot: string): string[] {
  const lignes = doc.split("\n");
  const dedans = lignes.findIndex((ligne) => ligne.startsWith(`| \`${mot}\` |`));
  let debut = dedans;
  while (debut > 0 && lignes[debut - 1]?.startsWith("|")) debut--;
  let fin = dedans;
  while (fin < lignes.length - 1 && lignes[fin + 1]?.startsWith("|")) fin++;
  return dedans < 0 ? [] : lignes.slice(debut, fin + 1);
}

// Ce que le reviewer a dit de deux livraisons de l'exemple : un résumé et ses constats, puis un résumé seul.
const RELU_216 = {
  resume: "Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.",
  constats: [
    { gravite: "remarque", fichier: "runtime/src/mesures.ts", constat: "Le seuil par défaut est répété dans deux fichiers." },
    { gravite: "remarque", fichier: null, constat: "À supprimer : l'ancien compteur, qui ne sert plus." },
  ],
};
const RELU_201 = { resume: "Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.", constats: [] };
const SANS_RELECTURE = "what was delivered: not given — no readable review covers this delivery (merged by hand, served without going through pass, or from before the review)";

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-12T10:04:11.000Z",
  dernierTick: "2026-10-12T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 3 },
  dernierEvenement: { seq: 812, at: "2026-10-12T10:03:58.000Z", type: "merge.done", ticket: 216 },
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: { fait: "lit", cible: "runtime/src/etat.ts", depuis: "2026-10-12T10:01:11.000Z" }, attente: null },
    { ticket: 21, etat: "BLOQUÉ", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null, attente: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 21, titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21" }],
  livres: [
    { ticket: 216, titre: "Le relevé des mesures", url: "https://github.com/benomite/brigade/issues/216", livre: "2026-10-12T10:03:58.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/219", relecture: RELU_216 },
    { ticket: 201, titre: "Les grants sous plafond", url: "https://github.com/benomite/brigade/issues/201", livre: "2026-10-12T07:12:40.000Z", station: "box/claude", pr: "https://github.com/benomite/brigade/pull/207", relecture: RELU_201 },
    { ticket: 188, titre: "Une fiche sans zone", url: "https://github.com/benomite/brigade/issues/188", livre: "2026-10-11T16:30:05.000Z", station: "box/claude", pr: null, relecture: null },
  ],
};
// Ce que rend un runtime d'avant les cooks : la même forme, sans le champ.
const { cooks: _cooks, ...SANS_COOKS } = FAITS;
// Et celui d'avant `attend`.
const { attend: _attend, ...SANS_ATTEND } = FAITS;
// Et celui d'avant les livrés : Livré se range alors d'après le mot d'état du rail.
const { livres: _livres, ...SANS_LIVRES } = FAITS;
const { livres: _aussi, ...SANS_ATTEND_NI_LIVRES } = SANS_ATTEND;
const rendus = (faits: object) => `${JSON.stringify(faits)}\n`;
// Ce qu'une carte dit quand `status` n'a pas été lu : ce que `faits` ne donne pas est écrit, pas tu.
const SANS_STATUS = "not given by `facts`, and the `rail` line of `status` was not read";
// L'en-tête de sa fiche (fiche.ts), quand `status` n'a pas été lu : son titre, son issue — mais ni sa
// priorité, que seule sa ligne de `status` écrit, ni sa PR, que la box ne donne que d'un ticket livré.
const fiche = (titre: string | undefined, autre: Partial<Entete> = {}): { fiche: Entete } => ({
  fiche: {
    titre: titre === undefined ? { sans: "not given — the station returns no title for this ticket" } : { valeur: titre },
    priorite: { sans: "not given — `facts` does not give it, and the `rail` line of `status` was not read" },
    issue: true,
    ...autre,
  },
});

// Une carte qui t'attend porte, en tête de sa fiche, ce qu'on attend de toi (decision.ts) : sans
// décision donnée par `faits` — une box d'avant ce champ, comme ici —, la phrase qui ne devine rien.
const ATTENDU = { attendu: SANS_DECISION } as const;

const lue = (texte: string): Lecture => ({ projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", sorties: [{ commande: "facts", texte }] });

// Le refus, ou l'échec du test si la sortie a été prise pour la forme.
// La raison pour laquelle un élément de liste n'a pas été lu : la forme est comprise, et sa carte seule est illisible.
function illisible(texte: string): string {
  const compris = comprendre(texte);
  assert.ok(!("informe" in compris), `la forme entière est refusée : ${"informe" in compris ? compris.informe : ""}`);
  const rendu = [...compris.rail, ...(compris.attend ?? []), ...(compris.livres ?? [])].find((lu) => lu.illisible !== undefined);
  return rendu?.illisible ?? assert.fail(`aucun élément illisible : ${texte}`);
}
function informe(texte: string): string {
  const compris = comprendre(texte);
  assert.ok("informe" in compris, `pris pour la forme : ${texte}`);
  return compris.informe;
}

describe("les faits que l'app dessine", () => {
  test("la commande lue est un script du runtime, tel qu'il existe", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.equal(COMMANDE, "facts");
    assert.ok(COMMANDE in scripts);
  });

  test("l'exemple de docs/runtime/ est compris tel qu'il est écrit — champ pour champ", () => {
    assert.deepEqual(comprendre(`${EXEMPLE}\n`), FAITS);
  });

  test("un journal vide, un runtime sans tick, un événement hors ticket, un rail vide : ce sont des faits, pas une forme manquée", () => {
    const calme = { ...FAITS, dernierTick: null, dernierEvenement: null, rail: [], compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 } };
    const horsTicket = { ...FAITS, dernierEvenement: { seq: 3, at: "2026-10-12T10:03:58.000Z", type: "kitchen.stopped", ticket: null } };

    assert.deepEqual(comprendre(rendus(calme)), calme);
    assert.deepEqual(comprendre(rendus(horsTicket)), horsTicket);
  });

  test("aucun cook en cours, ou un cook dont le ticket a quitté le rail — son titre est vide : ce sont des faits", () => {
    const calme = { ...FAITS, cooks: [] };
    const parti = { ...FAITS, cooks: [{ ticket: 30, titre: "", station: "box/claude" }] };

    assert.deepEqual(comprendre(rendus(calme)), calme);
    assert.deepEqual(comprendre(rendus(parti)), parti);
  });

  test("un runtime qui ne donne pas encore les cooks rend toujours la forme : le champ manque, il n'est pas mis à vide", () => {
    const compris = comprendre(rendus(SANS_COOKS));

    assert.deepEqual(compris, SANS_COOKS);
    assert.ok(!("cooks" in compris));
  });

  test("un runtime qui ne donne pas encore `attend` rend toujours la forme : le champ manque ; une adresse nulle est un fait, pas une forme manquée", () => {
    const compris = comprendre(rendus(SANS_ATTEND));
    assert.deepEqual(compris, SANS_ATTEND);
    assert.ok(!("attend" in compris));

    const sansDepot = { ...FAITS, attend: [{ ticket: 378, titre: "", url: null }] };
    assert.deepEqual(comprendre(rendus(sansDepot)), sansDepot);
    assert.match(illisible(rendus({ ...FAITS, attend: [{ ticket: 378, titre: "" }] })), /attend\[0\]\.url/);
    assert.match(informe(rendus({ ...FAITS, attend: {} })), /attend/);
  });

  test("un mot d'état que l'app ne connaît pas est gardé tel quel — du projet comme d'un ticket", () => {
    const neuf = { ...FAITS, etat: "muette", rail: [{ ...FAITS.rail[0], etat: "au four" }] };

    assert.deepEqual(comprendre(rendus(neuf)), neuf);
  });

  test("un champ que l'app ne connaît pas ne casse rien, et n'est pas gardé", () => {
    assert.deepEqual(comprendre(rendus({ ...FAITS, quota: 62, rail: FAITS.rail.map((ticket) => ({ ...ticket, tenuPar: "cook-1" })), cooks: FAITS.cooks?.map((cook) => ({ ...cook, tours: 12 })) })), FAITS);
  });

  test("ce qui n'est pas la forme est refusé, en disant quoi : jamais des zéros à la place", () => {
    assert.match(informe("projet     brigade\nruntime    en marche depuis 3 h 12\n"), /this is not JSON/);
    assert.match(informe(""), /returned nothing/);
    assert.match(informe("null\n"), /is not an object/);
    assert.match(informe("[]\n"), /is not an object/);
    assert.match(informe(rendus({ ...FAITS, etat: 3 })), /“etat”/);
    assert.match(informe(rendus({ ...FAITS, lu: "tout à l'heure" })), /“lu”/);
    assert.match(informe(rendus({ ...FAITS, dernierTick: undefined })), /“dernierTick”/);
    assert.match(informe(rendus({ ...FAITS, compteurs: undefined })), /“compteurs”/);
    assert.match(informe(rendus({ ...FAITS, rail: undefined })), /“rail”/);
    assert.match(informe(rendus({ ...FAITS, dernierEvenement: { seq: 1, at: "2026-10-12T10:03:58.000Z", type: "merge.done" } })), /“dernierEvenement\.ticket”/);
    assert.match(informe(rendus({ ...FAITS, rail: [{ ticket: "14", etat: "pris", titre: "", url: "" }] })), /“rail\[0\]\.ticket”/);
    // Des cooks donnés, mais pas dans la forme : ce n'est pas un runtime d'avant ce champ.
    assert.match(informe(rendus({ ...FAITS, cooks: null })), /“cooks”/);
    assert.match(informe(rendus({ ...FAITS, cooks: 2 })), /“cooks”/);
    assert.match(informe(rendus({ ...FAITS, cooks: [{ ticket: null, titre: "", station: "box/claude" }] })), /“cooks\[0\]\.ticket”/);
    assert.match(informe(rendus({ ...FAITS, cooks: [{ ticket: 14, station: "box/claude" }] })), /“cooks\[0\]\.titre”/);
    assert.match(informe(rendus({ ...FAITS, cooks: [FAITS.cooks?.[0], { ticket: 21, titre: "L'export du journal" }] })), /“cooks\[1\]\.station”/);
  });

  test("un compteur qui manque, ou qui n'est pas un nombre entier positif, refuse la forme entière : aucun n'est mis à zéro", () => {
    for (const nom of ["rail", "auTravail", "aLaPass", "attend", "livres24h"] as const) {
      for (const valeur of [undefined, null, "2", -1, 1.5, Number.NaN]) {
        assert.match(informe(rendus({ ...FAITS, compteurs: { ...FAITS.compteurs, [nom]: valeur } })), new RegExp(`“compteurs\\.${nom}”`), `${nom} = ${String(valeur)}`);
      }
    }
  });

  test("ce que la cuisine fait d'un ticket se lit sous `rail[].activite` : un geste, ce qu'il vise ou rien, une heure — nulle, la box ne le sait pas ; absente, un runtime d'avant elle", () => {
    const [pris, bloque] = FAITS.rail;
    assert.deepEqual(pris?.activite, { fait: "lit", cible: "runtime/src/etat.ts", depuis: "2026-10-12T10:01:11.000Z" });
    assert.equal(bloque?.activite, null);
    // Un runtime d'avant ce champ : la forme reste comprise, sans lui.
    const sansActivite = { ...FAITS, rail: FAITS.rail.map(({ activite: _activite, ...ticket }) => ticket) };
    assert.deepEqual(comprendre(rendus(sansActivite)), sansActivite);
    // Une activité qui n'a pas sa forme refuse la forme entière : rien n'en est deviné.
    const avec = (activite: unknown) => rendus({ ...FAITS, rail: [{ ...pris, activite }] });
    assert.match(illisible(avec("lit")), /rail\[0\]\.activite/);
    assert.match(illisible(avec({ fait: "lit", cible: 3, depuis: "2026-10-12T10:01:11.000Z" })), /rail\[0\]\.activite\.cible/);
    assert.match(illisible(avec({ fait: "lit", cible: null, depuis: "tout à l'heure" })), /rail\[0\]\.activite\.depuis/);
  });

  test("la carte d'un ticket pris ou en pass dit ce que la cuisine en fait, depuis combien de temps à l'horloge de la box — et écrit qu'elle ne le sait pas plutôt que de se taire", () => {
    const lu = "2026-10-12T10:04:11.000Z";
    const de = (etat: string, activite?: Faits["rail"][number]["activite"]) => direEnCeMoment({ ticket: 1, etat, titre: "", url: "", ...(activite === undefined ? {} : { activite }) }, lu);

    assert.equal(de("pris", { fait: "tests rouges, corrige", cible: "app/src/bon.ts", depuis: "2026-10-12T10:01:11.000Z" }), "tests rouges, corrige app/src/bon.ts, for 3 min");
    assert.equal(de("en pass", { fait: "relecture en cours", cible: null, depuis: "2026-10-12T10:04:01.000Z" }), "relecture en cours, for 10 s");
    assert.equal(de("pris", null), ACTIVITE_NON_COMMUNIQUEE);
    assert.equal(ACTIVITE_NON_COMMUNIQUEE, "activity not given");
    assert.equal(de("en pass"), "activity not given — this station's runtime does not give it in `facts`");
    // Un ticket qui n'est ni au travail ni en pass n'a pas cette ligne.
    for (const etat of ["en attente", "BLOQUÉ", "servi", "86", "au four"]) assert.equal(de(etat, null), undefined, etat);
  });

  test("une lecture devient ce que la vue pose, sans rien y calculer : la pastille, cinq nombres, les cooks en cours, le dernier événement, le rail", () => {
    assert.deepEqual(dessiner(lue(rendus(FAITS))), {
      projet: "brigade",
      demande: 4,
      a: "2026-10-12T10:04:12.000Z",
      tableau: {
        etat: "ouverte",
        ton: "vert",
        arretee: false,
        // Ni leçon ni profil : `facts` ne porte pas `apprentissage`, la page le dira en une phrase.
        apprentissage: { lecons: [], profils: [] },
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
                  ton: "bleu",
                  titre: "Le journal en ajout seul",
                  ouvrable: true,
                  attendu: false,
                  attend: [],
                  // Ce que la forme dit de lui : ce que son cook fait, sa station. Le reste est écrit comme manquant.
                  ligne: "lit runtime/src/etat.ts · 3 min",
                  dit: [
                    { libelle: "right now", valeur: "lit runtime/src/etat.ts, for 3 min" },
                    { libelle: "taken by", valeur: "box/claude", exact: true },
                  ],
                  sans: "not given by `facts`, and the `rail` line of `status` was not read : since when · its lease · what it burns · what blocks it",
                  ...fiche("Le journal en ajout seul"),
                },
              ],
              vide: "no ticket",
            },
            { nom: "Pass", ton: "jaune", compte: "0", cartes: [], vide: "no ticket" },
            {
              nom: "TODO",
              ton: "rouge",
              compte: "1",
              // `attend`, dans la forme, le nomme : il est ici avant même que `status` ait été lu.
              cartes: [{ ticket: 21, etat: "BLOQUÉ", ton: "rouge", titre: "L'export du journal", ouvrable: true, attendu: true, attend: [], ligne: SANS_DECISION, dit: [], sans: `${SANS_STATUS} : who holds it · since when · its lease · what it burns · what blocks it`, ...fiche("L'export du journal", ATTENDU), gestes: ["attente-poser"] }],
              vide: "no ticket in `attend`, according to `facts`",
            },
            { nom: "WAITING", ton: "gris", compte: "0", cartes: [], vide: "no ticket waits for a third party" },
            {
              nom: "Served",
              ton: "vert",
              // Autant de cartes que `livrés 24 h` : celles de `livres`, le plus récent en haut, partis du rail ou non.
              compte: "3",
              cartes: [
                { ticket: 216, etat: "servi", ton: "vert", titre: "Le relevé des mesures", ouvrable: true, attendu: false, attend: [], ligne: `served at ${heureHM("2026-10-12T10:03:58.000Z")} · ${RELU_216.resume.split(". ")[0]}.`, pr: true, livraison: { resume: RELU_216.resume, remarques: "2 remarks", constats: RELU_216.constats }, dit: [{ libelle: "served", valeur: "13 s before the reading" }, { libelle: "cooked by", valeur: "box/claude", exact: true }], ...fiche("Le relevé des mesures", { pr: true }) },
                { ticket: 201, etat: "servi", ton: "vert", titre: "Les grants sous plafond", ouvrable: true, attendu: false, attend: [], ligne: `served at ${heureHM("2026-10-12T07:12:40.000Z")} · ${RELU_201.resume}`, pr: true, livraison: { resume: RELU_201.resume, remarques: "no remarks", constats: [] }, dit: [{ libelle: "served", valeur: "2 h 51 before the reading" }, { libelle: "cooked by", valeur: "box/claude", exact: true }], ...fiche("Les grants sous plafond", { pr: true }) },
                {
                  ticket: 188,
                  etat: "servi",
                  ton: "vert",
                  titre: "Une fiche sans zone",
                  ouvrable: true,
                  attendu: false,
                  attend: [],
                  ligne: `served at ${heureHM("2026-10-11T16:30:05.000Z")}`,
                  repere: true,
                  livraison: { sans: SANS_RELECTURE },
                  dit: [{ libelle: "served", valeur: "17 h 34 before the reading" }, { libelle: "cooked by", valeur: "box/claude", exact: true }, { libelle: "PR", valeur: "none — served without a merge" }],
                  ...fiche("Une fiche sans zone", { pr: { valeur: "none — served without a merge" } }),
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
    const ancien = "projet     brigade\ncuisine    ouverte\n";

    assert.deepEqual(dessiner(lue(ancien)), { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", titre: "THE STATION DID NOT RETURN THE SHAPE OF `facts`", informe: "this is not JSON", rendu: ancien });
  });

  test("une commande en échec — un runtime d'avant `faits` — reste l'échec que la veille a rendu, sous un titre qui dit que la box a été jointe", () => {
    const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: '$ ssh … brigade brigade facts\nnpm error Missing script: "facts"\n→ code de sortie 1', atteinte: true, cas: null };

    assert.deepEqual(dessiner(echec), { ...echec, titre: "REACHED, BUT `facts` DID NOT ANSWER" });
  });

  test("un refus du geste se dit comme sous `status` — le même cas, les mêmes mots : pas un runtime à mettre à jour", () => {
    const vue = readFileSync(join(RACINE, "app/src/vue/vue.js"), "utf8");
    const TITRES = {
      "projet-inconnu": "REACHED, BUT UNKNOWN TO THE STATION",
      "sans-droit": "REACHED, BUT WITHOUT THE RIGHT TO THE ACTION",
      "commande-manque": "REACHED, BUT A COMMAND IS MISSING ON THE STATION",
      "node-inapte": "REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME",
    } as const;

    for (const [cas, titre] of Object.entries(TITRES) as [keyof typeof TITRES, string][]) {
      const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "…", atteinte: true, cas };
      assert.deepEqual(dessiner(echec), { ...echec, titre });
      // Les mots de l'en-tête que `rendre` pose sous `status`.
      assert.ok(vue.includes(`\`${titre} — tried at `), `« ${titre} » n'est plus l'en-tête de la vue`);
    }
    assert.equal(titreDEchec({ erreur: "…", atteinte: false, cas: "ssh-en-echec" }), "NOT REACHED");
    assert.equal(titreDEchec({ erreur: "…", atteinte: false, cas: null }), "NOT REACHED");
    assert.ok(vue.includes("`NOT REACHED — tried at "));
  });

  test("une box pas jointe est dite pas jointe, avec ce que `ssh` a rendu", () => {
    const echec: Lecture = { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", erreur: "ssh: connect to host box port 22: Operation timed out\n→ code de sortie 255", atteinte: false, cas: "ssh-en-echec" };

    assert.deepEqual(dessiner(echec), { ...echec, titre: "NOT REACHED" });
  });
});

// La couleur que la vue reçoit pour un mot d'état — du projet, ou de son premier ticket.
const tonDeProjet = (etat: string) => tableau({ ...FAITS, etat }).ton;
const cartes = (dessine: ReturnType<typeof rail>) => [...dessine.colonnes.flatMap((colonne) => colonne.cartes), ...dessine.hors];
const tonDeTicket = (etat: string) => cartes(rail({ ...FAITS, rail: [{ ticket: 1, etat, titre: "", url: "" }] })).find(({ ticket }) => ticket === 1)?.ton;

describe("une couleur sur un mot de la liste fermée", () => {
  test("les quatre états d'un projet ont la leur — ceux de docs/runtime/, pas un de plus", () => {
    assert.deepEqual(["ouverte", "retenue", "arrêtée", "éteinte"].map(tonDeProjet), ["vert", "jaune", "rouge", "rouge"]);
    assert.deepEqual(tableauDeLaDoc("éteinte").flatMap((ligne) => /^\| `([^`]+)` \|/.exec(ligne)?.[1] ?? []).sort(), ["arrêtée", "ouverte", "retenue", "éteinte"].sort());
  });

  test("les six états d'un ticket ont la leur — ceux que la doc énumère", () => {
    const MOTS = ["en attente", "BLOQUÉ", "pris", "en pass", "servi", "86"];

    assert.deepEqual(MOTS.map(tonDeTicket), ["gris", "rouge", "bleu", "jaune", "vert", "rouge"]);
    // Les six mots, dans cet ordre, entre backticks, séparés de quelques signes ou d'un mot de liaison : la doc se replie et se traduit où elle veut.
    const liste = new RegExp(MOTS.map((mot) => `\`${mot}\``).join("[^`]{0,24}"));
    assert.match(doc.replace(/\s+/g, " "), liste, "la liste des états d'un ticket a changé dans docs/runtime/");
  });

  test("un mot inconnu s'affiche tel quel, sans couleur, et ne se range dans aucune — ni par sa casse, ni par un nom d'objet", () => {
    for (const mot of ["muette", "Ouverte", "OUVERTE", "ouverte ", "", "constructor", "toString", "__proto__"]) {
      assert.equal(tableau({ ...FAITS, etat: mot }).etat, mot);
      assert.ok(!("ton" in tableau({ ...FAITS, etat: mot })), mot);
    }
    for (const mot of ["au four", "bloqué", "Pris", "ouverte", "constructor", "__proto__"]) assert.equal(tonDeTicket(mot), undefined, mot);
  });
});

describe("la carte de projet", () => {
  test("cinq compteurs, dans l'ordre de la carte, chacun le nombre que la box a donné", () => {
    const comptes = tableau({ ...FAITS, compteurs: { rail: 5, auTravail: 4, aLaPass: 3, attend: 2, livres24h: 1 } }).compteurs;

    assert.deepEqual(comptes.map(({ libelle, nombre }) => [libelle, nombre]), [
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

    assert.deepEqual(tableau({ ...FAITS, cooks }).cooks.enCours, cooks);
  });

  test("aucun cook : la carte le dit", () => {
    assert.deepEqual(tableau({ ...FAITS, cooks: [] }).cooks, { enCours: [], vide: "no cook running" });
  });

  test("une box qui ne donne pas encore les cooks : la carte se dessine sans eux et le dit — ni une erreur, ni « aucun cook »", () => {
    const recue = dessiner(lue(rendus(SANS_COOKS)));

    assert.ok("tableau" in recue);
    const { rail: sansEux, ...reste } = recue.tableau;
    const { rail: avecEux, ...attendu } = tableau(FAITS);
    assert.deepEqual(reste, { ...attendu, cooks: { enCours: [], vide: "cooks running: not read — this station's runtime does not give them in `facts` yet. This is not “no cook”: `ssh <hote> brigade <nom> station` shows them" } });
    // Sa carte du rail non plus ne dit pas qui le tient : c'est écrit, pas mis à « personne ».
    assert.deepEqual(rangs(sansEux), rangs(avecEux));
    assert.deepEqual(cartes(sansEux).find(({ ticket }) => ticket === 14)?.dit.map(({ libelle }) => libelle), ["right now"]);
    assert.match(cartes(sansEux).find(({ ticket }) => ticket === 14)?.sans ?? "", / : who holds it · since when · its lease · what it burns · what blocks it$/);
  });

  test("le dernier événement : son type tel quel, son ticket, et son âge à la lecture — sur l'horloge de la box, pas celle du poste", () => {
    assert.equal(evenement(FAITS), "merge.done · #216 · 13 s before the reading");
    assert.equal(evenement({ ...FAITS, dernierEvenement: { seq: 3, at: "2026-10-12T08:01:11.000Z", type: "kitchen.stopped", ticket: null } }), "kitchen.stopped · 2 h 03 before the reading");
    assert.equal(evenement({ ...FAITS, dernierEvenement: { seq: 3, at: "2026-10-12T10:03:58.000Z", type: "un.type.inconnu", ticket: 7 } }), "un.type.inconnu · #7 · 13 s before the reading");
    assert.equal(evenement({ ...FAITS, dernierEvenement: null }), "none: the log is empty");
  });

  test("l'écart entre le last tick et la lecture est affiché, et rien n'en est conclu", () => {
    assert.equal(tick(FAITS), "last tick 9 s before the reading");
    assert.equal(tick({ ...FAITS, dernierTick: "2026-10-10T10:04:11.000Z" }), "last tick 2 d before the reading");
    assert.equal(tick({ ...FAITS, dernierTick: null }), "no tick: runtime stopped, or no tick yet since it started");
  });

  test("une durée se dit comme `status` la dit", () => {
    assert.deepEqual([0, 999, 59_000, 60_000, 12 * 60_000, 3_599_000, 3_600_000, (3 * 60 + 2) * 60_000, 24 * 3_600_000 - 1, 2 * 24 * 3_600_000].map(duree), ["0 s", "0 s", "59 s", "1 min", "12 min", "59 min", "1 h 00", "3 h 02", "23 h 59", "2 d"]);
    // Deux horloges ne se croisent pas ici — mais une forme écrite à la main ne doit pas rendre un âge négatif.
    assert.equal(duree(-5_000), "0 s");
  });
});

describe("un ticket s'ouvre sur son issue", () => {
  test("l'adresse est celle que la box a donnée pour ce ticket de ce projet — la vue ne nomme qu'un projet et un numéro", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus(FAITS)));
    tenus.recevoir({ ...lue(rendus({ ...FAITS, attend: [], rail: [{ ticket: 14, etat: "pris", titre: "Autre", url: "https://github.com/benomite/parade/issues/14" }] })), projet: "parade" });

    assert.equal(tenus.adresse("brigade", 14), "https://github.com/benomite/brigade/issues/14");
    assert.equal(tenus.adresse("brigade", 21), "https://github.com/benomite/brigade/issues/21");
    assert.equal(tenus.adresse("parade", 14), "https://github.com/benomite/parade/issues/14");
    tenus.recevoir({ ...lue(rendus({ ...FAITS, attend: [{ ticket: 378, titre: "", url: "https://github.com/benomite/brigade/issues/378" }, { ticket: 379, titre: "", url: null }, { ticket: 380, titre: "", url: "javascript:alert(1)" }] })) });
    assert.equal(tenus.adresse("brigade", 378), "https://github.com/benomite/brigade/issues/378");
    for (const ticket of [379, 380]) assert.equal(tenus.adresse("brigade", ticket), undefined);
    tenus.recevoir(lue(rendus(FAITS)));
    for (const [projet, ticket] of [["brigade", 15], ["parade", 21], ["absent", 14], ["brigade", "14"], [undefined, undefined], ["brigade", "https://exemple.fr"]]) assert.equal(tenus.adresse(projet, ticket), undefined);
  });

  test("seule une adresse https s'ouvre : ce que la box rend n'est pas lancé comme un fichier ou un programme", () => {
    const tenus = tenirFaits();
    const urls = ["file:///etc/passwd", "javascript:alert(1)", "http://github.com/benomite/brigade/issues/3", "ssh://box", "", "pas une adresse", "/Applications/Calculator.app"];
    tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: urls.map((url, rang) => ({ ticket: rang, etat: "pris", titre: "", url })) })));

    for (const rang of urls.keys()) assert.equal(tenus.adresse("brigade", rang), undefined, String(urls[rang]));
    assert.deepEqual(cartes(rail({ ...SANS_LIVRES, attend: [], rail: urls.map((url, rang) => ({ ticket: rang, etat: "pris", titre: "", url })) })).map((ticket) => ticket.ouvrable), urls.map(() => false));
  });

  test("une lecture ratée retire les adresses de la lecture d'avant, et `oublier` les retire toutes", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus(FAITS)));
    tenus.recevoir({ ...lue(rendus(FAITS)), projet: "parade" });

    assert.deepEqual(tenus.recevoir(lue("cuisine    ouverte\n")), dessiner(lue("cuisine    ouverte\n")));
    assert.equal(tenus.adresse("brigade", 14), undefined);
    assert.equal(tenus.adresse("parade", 14), "https://github.com/benomite/brigade/issues/14");

    tenus.oublier();
    assert.equal(tenus.adresse("parade", 14), undefined);
  });
});

// Un rail de chaque état, dans l'ordre de service, et le bloc `attend` que
// `status` écrit à côté : #12 et #21 y sont, #30 n'est pas sur le rail.
// Ces faits sont ceux d'une box d'avant `livres` : Livré y prend les tickets `servi`
// du rail, comme chaque colonne ceux de son mot. Ce que `livres` y change est plus bas.
const ticket = (numero: number, etat: string) => ({ ticket: numero, etat, titre: `Ticket ${numero}`, url: `https://github.com/benomite/brigade/issues/${numero}` });
const RAIL = [ticket(9, "servi"), ticket(12, "en pass"), ticket(14, "pris"), ticket(15, "en pass"), ticket(16, "en attente"), ticket(21, "BLOQUÉ"), ticket(22, "en attente"), ticket(40, "86"), ticket(41, "au four")];
const BLOC = {
  bloc:
    "attend     4 décisions attendent le chef — la plus ancienne depuis 2 j\n" +
    "  claude  depuis 2 j  connexion Max absente — à rétablir : `claude /login` sous le compte du service, puis `brigade <projet> garde-fous reprendre`\n" +
    "  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 21\n" +
    "  #30  depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue\n" +
    "  #12  depuis 4 min  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12\n" +
    "  sans grant, 1 livraison verte arrêtée : 0 mergée à la main, 0 fermée sans merge — aucun désaccord —, 1 encore ouverte\n" +
    "fin attend\n",
  a: "2026-10-12T10:04:20.000Z",
};
const rangs = (dessine: ReturnType<typeof rail>) => dessine.colonnes.map(({ nom, compte, cartes }) => [nom, compte, cartes.map(({ ticket }) => ticket)]);

// Ce qu'une carte porte de plus que son rang, quand `status` n'a pas été lu et que rien d'autre ne le dit.
const NUE = { ligne: "ready, waits for a place in the kitchen", dit: [], sans: `${SANS_STATUS} : who holds it · since when · its lease · what it burns · what blocks it` };
// Dans T'attend, sous ce que le bloc dit du ticket : ce qui le bloque est dit, le reste manque.
const ATTENDUE = { ligne: SANS_DECISION, dit: [], sans: `${SANS_STATUS} : who holds it · since when · its lease · what it burns` };

describe("le rail en six colonnes", () => {
  test("quatre colonnes viennent du mot d'état de `faits`, dans l'ordre de service — et T'attend n'est pas lue tant que rien ne dit qui attend", () => {
    const dessine = rail({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL });

    assert.deepEqual(rangs(dessine), [
      ["On the rail", "3", [16, 21, 22]],
      ["Taken", "1", [14]],
      ["Pass", "2", [12, 15]],
      ["TODO", "?", []],
      ["WAITING", "0", []],
      ["Served", "1", [9]],
    ]);
    assert.match(dessine.colonnes[3]?.vide ?? "", /^not read: .* This is not “nothing awaits you”/);
    assert.ok(!("attendLu" in dessine));
    assert.ok(cartes(dessine).every(({ attendu }) => !attendu));
  });

  test("la cinquième vient d'abord de `attend`, que la forme donne : sans que `status` ait été lu, un ticket qui attend une décision est déjà dans T'attend, et nulle part ailleurs", () => {
    const dessine = rail({ ...SANS_LIVRES, rail: RAIL, attend: [{ ticket: 21, titre: "Ticket 21", url: "https://github.com/benomite/brigade/issues/21" }, { ticket: 12, titre: "Ticket 12", url: "https://github.com/benomite/brigade/issues/12" }] });

    assert.deepEqual(rangs(dessine), [
      ["On the rail", "2", [16, 22]],
      ["Taken", "1", [14]],
      ["Pass", "1", [15]],
      ["TODO", "2", [21, 12]],
      ["WAITING", "0", []],
      ["Served", "1", [9]],
    ]);
    // Ce qu'on attend de lui, en mots, n'a pas été lu : la carte l'écrit, et n'offre aucun geste d'après des mots qu'elle n'a pas.
    assert.deepEqual(dessine.colonnes[3]?.cartes[0], { ticket: 21, etat: "BLOQUÉ", ton: "rouge", titre: "Ticket 21", ouvrable: true, attendu: true, attend: [], ...NUE, ligne: SANS_DECISION, ...fiche("Ticket 21", ATTENDU), gestes: ["attente-poser"] });
    // Aucun ticket n'attend : la colonne le dit de `faits`, et jamais « rien ne t'attend » — une connexion, la base n'y ont pas de carte.
    assert.deepEqual(rail({ ...SANS_LIVRES, rail: RAIL, attend: [] }).colonnes[3], { nom: "TODO", ton: "rouge", compte: "0", cartes: [], vide: "no ticket in `attend`, according to `facts`" });
  });

  test("le bloc `attend` y ajoute ce qu'on attend de lui : un ticket qu'il nomme est dans T'attend et nulle part ailleurs, dans l'ordre du bloc, avec ce que sa ligne dit", () => {
    for (const faits of [{ ...SANS_LIVRES, rail: RAIL }, { ...SANS_ATTEND_NI_LIVRES, rail: RAIL }]) {
      const dessine = rail(faits, BLOC);

      assert.deepEqual(rangs(dessine), [
        ["On the rail", "2", [16, 22]],
        ["Taken", "1", [14]],
        ["Pass", "1", [15]],
        ["TODO", "3", [21, 30, 12]],
        ["WAITING", "0", []],
        ["Served", "1", [9]],
      ]);
      assert.equal(dessine.attendLu, BLOC.a);
      assert.deepEqual(dessine.colonnes[3]?.cartes[2], {
        ticket: 12,
        etat: "en pass",
        ton: "jaune",
        titre: "Ticket 12",
        ouvrable: true,
        attendu: true,
        attend: ["depuis 4 min  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31  Ticket 12"],
        ...ATTENDUE,
        // En pass, ce que la pass en fait : un runtime d'avant ce champ ne le dit pas, et la carte l'écrit.
        dit: [{ libelle: "right now", valeur: "activity not given — this station's runtime does not give it in `facts`" }],
        ...fiche("Ticket 12", ATTENDU),
      });
    }
  });

  test("un ticket que `faits` dit attendre et que le bloc ne nomme pas — deux lectures, deux instants — reste dans T'attend, après ceux du bloc", () => {
    const dessine = rail({ ...SANS_LIVRES, rail: RAIL, attend: [{ ticket: 15, titre: "Ticket 15", url: "https://github.com/benomite/brigade/issues/15" }] }, BLOC);

    assert.deepEqual(rangs(dessine)[3], ["TODO", "4", [21, 30, 12, 15]]);
    assert.deepEqual(rangs(dessine)[2], ["Pass", "0", []]);
  });

  test("un ticket que le bloc nomme sans qu'il soit sur le rail a sa carte : son numéro et sa ligne — ni titre, ni état, ni adresse, que `faits` ne donne pas", () => {
    assert.deepEqual(rail({ ...SANS_LIVRES, rail: RAIL }, BLOC).colonnes[3]?.cartes[1], {
      ticket: 30,
      ouvrable: false,
      attendu: true,
      attend: ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"],
      // Une question du manager : la carte la dit (#503).
      question: true,
      ...ATTENDUE,
      ...fiche(undefined, { issue: { sans: "not given — the station returns no address for this issue" }, ...ATTENDU }),
    });
  });

  test("un ticket du bloc qui n'est pas sur le rail s'ouvre par l'adresse que `faits.attend` donne, et porte son titre s'il y en a un — l'app n'en compose aucune", () => {
    const attend = [
      { ticket: 30, titre: "", url: "https://github.com/benomite/brigade/issues/30" },
      { ticket: 12, titre: "Ticket 12", url: "https://github.com/benomite/brigade/issues/12" },
    ];
    const cartesDe = (faits: Faits) => rail(faits, BLOC).colonnes[3]?.cartes;

    assert.deepEqual(cartesDe({ ...SANS_LIVRES, rail: RAIL, attend })?.[1], {
      ticket: 30,
      ouvrable: true,
      attendu: true,
      attend: ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"],
      // Une question du manager : la carte la dit (#503).
      question: true,
      ...ATTENDUE,
      ...fiche(undefined, ATTENDU),
    });
    const titre = rail({ ...SANS_LIVRES, rail: [], attend: [{ ticket: 30, titre: "Un titre", url: "https://github.com/benomite/brigade/issues/30" }] }, BLOC).colonnes[3]?.cartes.find(({ ticket }) => ticket === 30);
    assert.deepEqual([titre?.titre, titre?.ouvrable], ["Un titre", true]);
    // Sans adresse, ou une adresse qui n'est pas en https : rien ne s'ouvre.
    for (const url of [null, "http://exemple.fr/30", "file:///etc/passwd"]) assert.equal(cartesDe({ ...SANS_LIVRES, rail: RAIL, attend: [{ ticket: 30, titre: "", url }] })?.[1]?.ouvrable, false);
  });

  test("une ligne sans numéro — la station, le bilan faute de grant — n'est dans aucune colonne", () => {
    const sansTicket = { ...BLOC, bloc: BLOC.bloc.split("\n").filter((ligne) => !ligne.startsWith("  #")).join("\n") };
    const dessine = rail({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL }, sansTicket);

    assert.deepEqual(dessine.colonnes[3], { nom: "TODO", ton: "rouge", compte: "0", cartes: [], vide: "no ticket at the head of a line of the `attend` block" });
    assert.deepEqual(rangs(dessine), rangs(rail({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL })).map((colonne) => (colonne[0] === "TODO" ? ["TODO", "0", []] : colonne)));
  });

  test("un ticket `86` ou d'un mot inconnu n'est d'aucune colonne : il est rendu à part, avec son mot — et dans T'attend si la file dit qu'il attend", () => {
    assert.deepEqual(rail({ ...SANS_LIVRES, rail: RAIL }, BLOC).hors, [
      { ticket: 40, etat: "86", ton: "rouge", titre: "Ticket 40", ouvrable: true, attendu: false, attend: [], ...NUE, ...fiche("Ticket 40") },
      { ticket: 41, etat: "au four", titre: "Ticket 41", ouvrable: true, attendu: false, attend: [], ...NUE, ...fiche("Ticket 41") },
    ]);
    const remonte = rail({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL }, { ...BLOC, bloc: "attend     1 décision attend le chef depuis 2 j\n  #40  depuis 2 j  remontée par la pass, rouge\nfin attend\n" });

    assert.deepEqual(remonte.colonnes[3]?.cartes.map(({ ticket, etat }) => [ticket, etat]), [[40, "86"]]);
    assert.deepEqual(remonte.hors.map(({ ticket }) => ticket), [41]);
    assert.deepEqual(rail({ ...SANS_LIVRES, rail: RAIL, attend: [{ ticket: 41, titre: "Ticket 41", url: null }] }).hors.map(({ ticket }) => ticket), [40]);
  });

  test("un ticket mis de côté, dont le runtime dit la raison, est rangé dans une colonne — jamais hors — et la porte en une ligne, sans la ligne brute", () => {
    const aside = { ...ticket(40, "86"), activite: null, attente: { raison: "attend : setup du projet impossible", colonne: "86", retour: "2026-10-12T10:09:00.000Z" } };
    const sonde = { ...SANS_LIVRES, rail: [aside, ticket(41, "au four")] };
    const dessine = rail(sonde, BLOC, { texte: "rail  2\n  #40  86  prio:1  depuis 9 min (setup-failed), retour dans 31 s  Ticket 40\n", a: "2026-10-12T10:04:12.000Z" });

    assert.deepEqual(dessine.hors.map(({ ticket }) => ticket), [41]);
    const colonne = dessine.colonnes.find(({ cartes }) => cartes.some(({ ticket }) => ticket === 40));
    assert.equal(colonne?.nom, "On the rail");
    const carte = colonne?.cartes.find(({ ticket }) => ticket === 40);
    assert.deepEqual(carte?.dit, [{ libelle: "set aside", valeur: "attend : setup du projet impossible" }]);
    assert.equal(carte?.relais, undefined);
    assert.doesNotMatch(JSON.stringify(carte), /setup-failed|retour dans/);
  });

  test("une mise de côté dont la colonne est inconnue de l'app va dans la colonne par défaut, sans rien casser", () => {
    const aside = { ...ticket(40, "86"), attente: { raison: "attend : mis de côté (cause-neuve)", colonne: "au four", retour: null } };
    const dessine = rail({ ...SANS_LIVRES, rail: [aside] });

    assert.deepEqual(dessine.hors, []);
    assert.deepEqual(dessine.colonnes[0]?.cartes.map(({ ticket }) => ticket), [40]);
  });

  test("un ticket nommé deux fois par le bloc n'a qu'une carte, qui porte ses deux lignes", () => {
    const double = rail({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL }, { ...BLOC, bloc: "attend\n  #14  une ligne\n  #14  une autre\nfin attend\n" });

    assert.deepEqual(double.colonnes[3]?.cartes.map(({ ticket, etat, attendu, attend }) => ({ ticket, etat, attendu, attend })), [{ ticket: 14, etat: "pris", attendu: true, attend: ["une ligne", "une autre"] }]);
    assert.equal(double.colonnes[3]?.compte, "1");
  });

  test("ce que le bloc dit d'un ticket est porté mot pour mot, ni tronqué ni remis en forme : une entrée longue, et les lignes qui la précisent dessous", () => {
    const longue = `depuis 2 j  ${"une phrase très longue, avec    des blancs, `du code` et un <b>faux balisage</b> — ".repeat(40)}jusqu'au bout  `;
    const suite = ["      │ une première ligne de suite,   blancs compris  ", "      │ \tune tabulation, puis « des accents » → ✓", `      │ ${"x".repeat(900)}`];
    const bloc = ["attend     2 décisions attendent le chef — la plus ancienne depuis 2 j", `  #12  ${longue}`, ...suite, "  #21  depuis 3 h 02  courte", "fin attend", ""].join("\n");
    const [premiere, seconde] = rail({ ...SANS_LIVRES, rail: RAIL }, { bloc, a: BLOC.a }).colonnes[3]?.cartes ?? [];

    assert.deepEqual(premiere?.attend, [[longue, ...suite].join("\n")]);
    assert.deepEqual(seconde?.attend, ["depuis 3 h 02  courte"]);
    // Rien n'est perdu du bloc : chaque ligne d'une entrée de ticket se retrouve sur sa carte, entière.
    for (const ligne of [`  #12  ${longue}`, ...suite]) assert.ok(`  #12  ${premiere?.attend[0]}`.split("\n").includes(ligne));
  });

  test("chaque ticket que `faits` rend est dessiné une fois, quel que soit le bloc", () => {
    for (const bloc of [undefined, BLOC, { ...BLOC, bloc: "attend     rien n'attend le chef\nfin attend\n" }]) assert.deepEqual(cartes(rail({ ...SANS_LIVRES, rail: RAIL }, bloc)).map(({ ticket }) => ticket).filter((numero) => numero !== 30).sort((a, b) => a - b), RAIL.map(({ ticket }) => ticket).sort((a, b) => a - b));
  });
});

// Livré, d'une box qui donne `livres` : les tickets servis dans les 24 h, que leur
// issue soit fermée ou non — le rail ne les porte plus quelques secondes après le merge.
describe("Livré, d'après `livres`", () => {
  const livre = (ticket: number, livreLe: string, autre: object = {}) => ({
    ticket,
    titre: `Ticket ${ticket}`,
    url: `https://github.com/benomite/brigade/issues/${ticket}`,
    livre: livreLe,
    station: "box/claude",
    pr: `https://github.com/benomite/brigade/pull/${ticket + 100}`,
    relecture: { resume: `Ce qui a été livré pour #${ticket}.`, constats: [] },
    ...autre,
  });
  const LIVRES = [livre(30, "2026-10-12T10:00:00.000Z"), livre(9, "2026-10-12T09:00:00.000Z"), livre(14, "2026-10-11T12:00:00.000Z")];
  const livreCol = (dessine: ReturnType<typeof rail>) => dessine.colonnes.find(({ nom }) => nom === "Served");

  test("un runtime qui ne donne pas encore `livres` rend toujours la forme : le champ manque ; une station, une PR ou une issue nulles sont des faits", () => {
    const compris = comprendre(rendus(SANS_LIVRES));
    assert.deepEqual(compris, SANS_LIVRES);
    assert.ok(!("livres" in compris));

    const nuls = { ...FAITS, livres: [livre(378, "2026-10-12T10:00:00.000Z", { titre: "", url: null, station: null, pr: null })] };
    assert.deepEqual(comprendre(rendus(nuls)), nuls);
    assert.match(informe(rendus({ ...FAITS, livres: {} })), /livres/);
    assert.match(illisible(rendus({ ...FAITS, livres: [{ ...livre(30, "hier") }] })), /livres\[0\]\.livre/);
    const { pr: _pr, ...sansPr } = livre(30, "2026-10-12T10:00:00.000Z");
    assert.match(illisible(rendus({ ...FAITS, livres: [sansPr] })), /livres\[0\]\.pr/);
  });

  test("ses cartes sont celles de `livres`, dans son ordre — le plus récent en haut —, autant que `livrés 24 h` : partis du rail, ils y restent", () => {
    // #30 et #14 ont quitté le rail ; #9 y est encore, `servi`.
    const dessine = rail({ ...SANS_ATTEND, rail: RAIL.filter(({ ticket }) => ![12, 30].includes(ticket)), compteurs: { ...FAITS.compteurs, livres24h: 3 }, livres: LIVRES });

    assert.deepEqual(rangs(dessine).at(-1), ["Served", "3", [30, 9, 14]]);
    assert.equal(livreCol(dessine)?.defile, true);
    // #9 n'a qu'une carte : celle de Livré. #14, repris depuis son service, est aussi au travail.
    assert.deepEqual(cartes(dessine).filter(({ ticket }) => ticket === 9).length, 1);
    assert.deepEqual(rangs(dessine)[1], ["Taken", "1", [14]]);
    assert.deepEqual(livreCol(dessine)?.cartes[0], {
      ticket: 30,
      etat: "servi",
      ton: "vert",
      titre: "Ticket 30",
      ouvrable: true,
      attendu: false,
      attend: [],
      ligne: `served at ${heureHM("2026-10-12T10:00:00.000Z")} · Ce qui a été livré pour #30.`,
      pr: true,
      livraison: { resume: "Ce qui a été livré pour #30.", remarques: "no remarks", constats: [] },
      dit: [
        { libelle: "served", valeur: "4 min before the reading" },
        { libelle: "cooked by", valeur: "box/claude", exact: true },
      ],
      ...fiche("Ticket 30", { pr: true }),
    });
  });

  test("rien de servi en 24 h : la colonne le dit, elle n'est pas simplement vide — d'une box d'avant `livres`, c'est « aucun ticket »", () => {
    assert.deepEqual(livreCol(rail({ ...FAITS, rail: [], livres: [] })), { nom: "Served", ton: "vert", compte: "0", cartes: [], vide: "nothing served in the last 24 h", defile: true });
    assert.deepEqual(livreCol(rail({ ...SANS_LIVRES, rail: [] })), { nom: "Served", ton: "vert", compte: "0", cartes: [], vide: "no ticket" });
  });

  test("un ticket `servi` du rail que `livres` ne donne pas — servi il y a plus de 24 h — est rendu à part, pas compté dans Livré", () => {
    const dessine = rail({ ...SANS_ATTEND, rail: RAIL, livres: [] });

    assert.deepEqual(rangs(dessine).at(-1), ["Served", "0", []]);
    assert.ok(dessine.hors.some(({ ticket, etat }) => ticket === 9 && etat === "servi"));
    // Rien n'est perdu : chaque ticket du rail a sa carte, une fois.
    assert.deepEqual(cartes(dessine).map(({ ticket }) => ticket).sort((a, b) => a - b), RAIL.map(({ ticket }) => ticket).sort((a, b) => a - b));
  });

  test("ce que `livres` ne dit pas est écrit sur la carte : ni cuisinier ni PR, ni titre ni issue pour une livraison hors du rail", () => {
    const [carte] = livreCol(rail({ ...FAITS, rail: [], livres: [livre(378, "2026-10-12T10:00:00.000Z", { titre: "", url: null, station: null, pr: null, relecture: null })] }))?.cartes ?? [];

    assert.deepEqual(carte, {
      ticket: 378,
      etat: "servi",
      ton: "vert",
      ouvrable: false,
      attendu: false,
      attend: [],
      ligne: `served at ${heureHM("2026-10-12T10:00:00.000Z")}`,
      repere: true,
      livraison: { sans: SANS_RELECTURE },
      dit: [
        { libelle: "served", valeur: "4 min before the reading" },
        { libelle: "PR", valeur: "none — served without a merge" },
      ],
      sans: "not given by the queue: who cooked it — no station sent it to pass",
      // Sa fiche le dit aussi : ni titre, ni issue — et pas de PR, qu'aucun lien ne prétend ouvrir.
      ...fiche(undefined, { issue: { sans: "not given — the station returns no address for this issue" }, pr: { valeur: "none — served without a merge" } }),
    });
    // Un titre vide se complète de celui du rail, une issue nulle de son adresse.
    const [duRail] = livreCol(rail({ ...FAITS, rail: [ticket(9, "servi")], livres: [livre(9, "2026-10-12T10:00:00.000Z", { titre: "", url: null })] }))?.cartes ?? [];
    assert.deepEqual([duRail?.titre, duRail?.ouvrable], ["Ticket 9", true]);
  });

  test("ce qui a été livré est le résumé de la relecture, mot pour mot, avec le nombre de ses constats en clair — sans relecture, la carte dit pourquoi, et ne met pas le titre à sa place", () => {
    const LONG = `${"Un résumé long, que rien ne coupe au milieu d'un mot. ".repeat(12)}Fin.`;
    const constat = (gravite: string, texte: string) => ({ gravite, fichier: "app/src/faits.ts", constat: texte });
    const quatre = [constat("remarque", "Un."), constat("remarque", "Deux."), constat("remarque", "Trois."), constat("remarque", "Quatre.")];
    const cartesDe = (...livres: object[]) => livreCol(rail({ ...FAITS, rail: [], livres } as Faits))?.cartes.map(({ livraison }) => livraison);

    assert.deepEqual(
      cartesDe(
        livre(1, "2026-10-12T10:00:00.000Z", { relecture: { resume: LONG, constats: quatre } }),
        livre(2, "2026-10-12T10:00:00.000Z", { relecture: { resume: "Seul.", constats: [constat("remarque", "Un.")] } }),
        livre(3, "2026-10-12T10:00:00.000Z", { relecture: { resume: "Rouge, mergé à la main.", constats: [constat("bloquant", "Un."), constat("remarque", "Deux.")] } }),
        livre(4, "2026-10-12T10:00:00.000Z", { relecture: null }),
      ),
      [
        { resume: LONG, remarques: "4 remarks", constats: quatre },
        { resume: "Seul.", remarques: "1 remark", constats: [constat("remarque", "Un.")] },
        { resume: "Rouge, mergé à la main.", remarques: "2 remarks, 1 blocking", constats: [constat("bloquant", "Un."), constat("remarque", "Deux.")] },
        { sans: SANS_RELECTURE },
      ],
    );
    // D'un runtime qui donne `livres` sans `relecture`, ou qui ne donne pas `livres` : la carte le dit.
    const { relecture: _relecture, ...sansRelecture } = livre(5, "2026-10-12T10:00:00.000Z");
    const PAS_DONNEE = { sans: "what was delivered: not given — this station's runtime does not yet give the review in `facts`" };
    assert.deepEqual(cartesDe(sansRelecture), [PAS_DONNEE]);
    assert.deepEqual(
      livreCol(rail({ ...SANS_LIVRES, rail: [ticket(9, "servi")] }))?.cartes.map(({ livraison }) => livraison),
      [PAS_DONNEE],
    );
    // Les autres colonnes n'en portent pas : rien n'y a été livré.
    assert.ok(cartes(rail({ ...SANS_LIVRES, rail: RAIL })).every(({ etat, livraison }) => (etat === "servi") === (livraison !== undefined)));
  });

  test("une relecture qui n'a pas la forme refuse la forme entière : un résumé, des constats en liste, chacun avec sa gravité, son fichier ou rien, son texte", () => {
    const avec = (relecture: unknown) => rendus({ ...FAITS, livres: [livre(30, "2026-10-12T10:00:00.000Z", { relecture })] });
    assert.deepEqual(comprendre(avec({ resume: "R.", constats: [{ gravite: "inconnue", fichier: null, constat: "C." }] })), { ...FAITS, livres: [livre(30, "2026-10-12T10:00:00.000Z", { relecture: { resume: "R.", constats: [{ gravite: "inconnue", fichier: null, constat: "C." }] } })] });
    assert.match(illisible(avec("un texte")), /livres\[0\]\.relecture/);
    assert.match(illisible(avec({ constats: [] })), /livres\[0\]\.relecture\.resume/);
    assert.match(illisible(avec({ resume: "R." })), /livres\[0\]\.relecture\.constats/);
    assert.match(illisible(avec({ resume: "R.", constats: [{ gravite: "remarque", constat: "C." }] })), /livres\[0\]\.relecture\.constats\[0\]\.fichier/);
    assert.match(illisible(avec({ resume: "R.", constats: [{ gravite: "remarque", fichier: null }] })), /livres\[0\]\.relecture\.constats\[0\]\.constat/);
  });

  test("une PR dont l'adresse n'est pas en https ne s'ouvre pas : la carte le sait, le process principal ne la donne pas", () => {
    const [carte] = livreCol(rail({ ...FAITS, rail: [], livres: [livre(30, "2026-10-12T10:00:00.000Z", { pr: "javascript:alert(1)" })] }))?.cartes ?? [];
    assert.equal(carte?.pr, false);
  });

  test("le process principal ouvre la PR mergée et l'issue d'un ticket livré, d'après la dernière lecture de son projet — rien d'autre", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus({ ...FAITS, rail: [], attend: [], livres: [...LIVRES, livre(40, "2026-10-12T08:00:00.000Z", { pr: "file:///etc/passwd", url: "http://exemple.fr/40" }), livre(41, "2026-10-12T08:00:00.000Z", { pr: null })] })));

    assert.equal(tenus.pr("brigade", 30), "https://github.com/benomite/brigade/pull/130");
    assert.equal(tenus.adresse("brigade", 30), "https://github.com/benomite/brigade/issues/30");
    for (const [projet, numero] of [["brigade", 40], ["brigade", 41], ["brigade", 99], ["parade", 30], ["brigade", "30"]] as const) assert.equal(tenus.pr(projet, numero), undefined);
    assert.equal(tenus.adresse("brigade", 40), undefined);
    tenus.oublier();
    assert.equal(tenus.pr("brigade", 30), undefined);
  });
});

describe("le bloc `attend` tenu à côté des faits", () => {
  const status = (texte: string, a = BLOC.a): Lecture => ({ projet: "brigade", demande: 9, a, sorties: [{ commande: "status", texte }] });
  const colonne = (recue: ReturnType<ReturnType<typeof tenirFaits>["attendre"]>) => (recue !== undefined && "tableau" in recue ? recue.tableau.rail.colonnes[3] : undefined);

  test("ce que le bloc dit d'un ticket se rend au process principal, ligne pour ligne — et rien pour un ticket qu'il ne nomme pas", () => {
    const tenus = tenirFaits();
    assert.equal(tenus.attendu("brigade", 30), undefined);
    tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL })));
    tenus.attendre(mettreAPart(status(`cuisine    ouverte\n${BLOC.bloc}`)));

    const dit = tenus.attendu("brigade", 30);
    assert.deepEqual(dit?.lignes, ["depuis 2 h  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue"]);
    assert.equal(tenus.attendu("brigade", 99), undefined);
    assert.equal(tenus.attendu("parade", 30), undefined);
    assert.equal(tenus.attendu("brigade", "30"), undefined);
    tenus.attendre(mettreAPart(status("cuisine    ouverte\n")));
    assert.equal(tenus.attendu("brigade", 30), undefined);
  });

  test("un `status` lu après les faits les fait redessiner : T'attend se remplit, sous la demande et l'heure de la lecture de `faits`", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL })));
    const recue = tenus.attendre(mettreAPart(status(`cuisine    ouverte\n${BLOC.bloc}`)));

    assert.deepEqual(recue, { projet: "brigade", demande: 4, a: "2026-10-12T10:04:12.000Z", tableau: tableau({ ...SANS_LIVRES, rail: RAIL }, BLOC) });
    assert.deepEqual(colonne(recue)?.cartes.map(({ ticket }) => ticket), [21, 30, 12]);
  });

  test("le même `status` donne aux cartes la ligne de chaque ticket sous `rail` : ce qu'elles portent en vient, sous l'heure de sa lecture", () => {
    const tenus = tenirFaits();
    const texte = `cuisine    ouverte\n${BLOC.bloc}rail       1 pris\n  #14  pris  -  par box/claude depuis 12 min, bail encore 18 min  Ticket 14\n\ncooks      1 en cours\n`;
    tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL })));
    const recue = tenus.attendre(mettreAPart(status(texte)));

    assert.ok(recue !== undefined && "tableau" in recue);
    assert.equal(recue.tableau.rail.railLu, BLOC.a);
    assert.deepEqual(recue.tableau.rail.colonnes[1]?.cartes[0]?.dit.map(({ libelle, valeur }) => [libelle, valeur]).slice(1, 4), [["taken by", "box/claude"], ["since", "12 min"], ["lease", "bail encore 18 min"]]);
    // Des faits relus ensuite se dessinent avec lui ; raté, il n'en reste rien.
    assert.deepEqual(tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))), recue);
    const apres = tenus.attendre(mettreAPart({ projet: "brigade", demande: 9, a: BLOC.a, erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: null }));
    assert.deepEqual(apres, dessiner(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))));
    // Et un projet dont `status` n'est plus lu le lâche, comme son bloc.
    tenus.attendre(mettreAPart(status(texte)));
    assert.deepEqual(tenus.veiller([]), [dessiner(lue(rendus({ ...SANS_LIVRES, rail: RAIL })))]);
  });

  test("des faits lus après un `status` sont dessinés avec son bloc — celui de leur projet, pas d'un autre", () => {
    const tenus = tenirFaits();
    assert.equal(tenus.attendre(mettreAPart(status(BLOC.bloc))), undefined);

    assert.deepEqual(tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))), { ...dessiner(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))), tableau: tableau({ ...SANS_LIVRES, rail: RAIL }, BLOC) });
    assert.deepEqual(tenus.recevoir({ ...lue(rendus({ ...SANS_LIVRES, rail: RAIL })), projet: "parade" }), { ...dessiner(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))), projet: "parade" });
  });

  test("un `status` raté, ou sans bord, retire le bloc d'avant : sur une box qui ne donne pas `attend` dans `faits`, T'attend n'est plus lue, et les tickets retournent dans leurs colonnes", () => {
    for (const sans of [status("cuisine    ouverte\n"), { projet: "brigade", demande: 9, a: BLOC.a, erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: null }] satisfies Lecture[]) {
      const tenus = tenirFaits();
      tenus.recevoir(lue(rendus({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL })));
      tenus.attendre(mettreAPart(status(BLOC.bloc)));

      assert.equal(colonne(tenus.attendre(mettreAPart(sans)))?.compte, "?");
      assert.deepEqual(tenus.recevoir(lue(rendus({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL }))), dessiner(lue(rendus({ ...SANS_ATTEND_NI_LIVRES, rail: RAIL }))));
      // Rien n'a changé : rien n'est redessiné.
      assert.equal(tenus.attendre(mettreAPart(sans)), undefined);
    }
  });

  test("un projet dont `status` n'est plus lu perd son bloc : ses faits, relus plus tard, ne sont pas rangés d'après un bloc que plus rien ne rafraîchit", () => {
    const tenus = tenirFaits();
    const parade = { ...lue(rendus({ ...SANS_LIVRES, rail: RAIL })), projet: "parade" };
    tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL })));
    tenus.recevoir(parade);
    tenus.attendre(mettreAPart(status(BLOC.bloc)));
    tenus.attendre(mettreAPart({ ...status(BLOC.bloc), projet: "parade" }));

    // La veille de `status` passe à parade seul : brigade est redessiné sans son bloc, parade garde le sien.
    assert.deepEqual(tenus.veiller(["parade"]), [dessiner(lue(rendus({ ...SANS_LIVRES, rail: RAIL })))]);
    // Une heure après, #12 a été servi : il est dans Livré, pas dans T'attend d'après le bloc d'avant.
    const servi = tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL.map((connu) => (connu.ticket === 12 ? { ...connu, etat: "servi" } : connu)) })));
    assert.ok("tableau" in servi);
    assert.deepEqual(rangs(servi.tableau.rail).slice(3), [["TODO", "1", [21]], ["WAITING", "0", []], ["Served", "2", [9, 12]]]);
    assert.deepEqual(tenus.recevoir(parade), { ...dessiner(parade), tableau: tableau({ ...SANS_LIVRES, rail: RAIL }, BLOC) });

    // Rien à lâcher : rien n'est redessiné. Et plus aucun projet lu lâche le dernier.
    assert.deepEqual(tenus.veiller(["parade", "brigade"]), []);
    assert.deepEqual(tenus.veiller([]).map(({ projet }) => projet), ["parade"]);
  });

  test("sans faits pour ce projet, rien n'est redessiné ; et `oublier` retire les blocs avec les faits", () => {
    const tenus = tenirFaits();
    tenus.recevoir(lue("cuisine    ouverte\n"));
    assert.equal(tenus.attendre(mettreAPart(status(BLOC.bloc))), undefined);

    tenus.oublier();
    assert.deepEqual(tenus.recevoir(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))), dessiner(lue(rendus({ ...SANS_LIVRES, rail: RAIL }))));
  });
});

describe("la bannière d'arrêt", () => {
  test("elle se pose sur le « stop » du chef, un mot de la liste fermée — pas sur un runtime éteint, ni sur un mot inconnu", () => {
    assert.deepEqual(["arrêtée", "éteinte", "retenue", "ouverte", "ARRÊTÉE", "muette"].map((etat) => tableau({ ...FAITS, etat }).arretee), [true, false, false, false, false, false]);
  });

  test("son geste est celui du socle qui la relance — la commande de la doc, confirmée avant de partir", () => {
    const ecrit = commandeDuGeste(BANNIERE.bouton, { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } });

    assert.ok(CONFIRMES.includes(BANNIERE.bouton));
    assert.deepEqual(ecrit, { commande: "ssh box brigade parade guardrails resume" });
  });

  test("ce qu'elle dit de l'arrêt est ce que docs/runtime/ en dit", () => {
    assert.ok(doc.includes("`brigade <projet> guardrails stop`"), "docs/runtime/ ne cite plus `guardrails stop`");
    assert.ok(doc.includes("`brigade <projet> guardrails [stop \\| resume]`"), "docs/runtime/ ne cite plus `guardrails resume`");
    assert.deepEqual(BANNIERE.texte, [
      "KITCHEN STOPPED — your “stop” holds",
      "All running cooks have been stopped, and none is launched any more — runtime restarts included, until “resume”.",
    ]);
  });
});
