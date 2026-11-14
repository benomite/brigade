// La pause de quota GitHub du compte (ticket 3482) : les stations tournent mais ne peuvent plus écrire leur signe de vie.
// Ni FAULT, ni rouge, ni « offline », ni « Start the station » : une ligne calme en tête de l'app, dite une fois pour tout
// le compte, et chaque projet qui dit seulement qu'il est en pause pour la même raison. Les fixtures ont la forme du
// contrat : l'état de chaque station porte `quotaGithub` = { limite, pauseJusqua, utilise, maximum, renouvellement,
// parStationEtProjet }.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ligneDeProjet } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import type { Lecture } from "../../../src/box.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, comprendre, tableau, tenirFaits, type Dessinable, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ouvrirLaLectureGitHub } from "../../../src/lecture-github-telephone.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { avecLeurEtat, type StationsDuCompte } from "../../../src/stations-du-compte.ts";
import { API_GITHUB, type Envoi } from "../../../src/tableau/client.ts";
import type { TableauLu } from "../../../src/tableau/lecture.ts";
import { etatDeLaLigne } from "../../../src/vue/accueil/projets/projets.js";
import { ligneDeLAttente } from "../../../src/vue/attente-du-rail/ligne-de-l-attente.js";
import { signesDe } from "../../../src/vue/cooks/signes-de-vie.ts";
import { ceQueLeRailDit, dansCombien, ligneDuProjetEnPause, MEME_RAISON, pauseDesProjets, PROJET_EN_PAUSE, REPRISE_INCONNUE, tenirLaPause } from "../../../src/vue/pause-quota/ligne-de-la-pause.js";
import { avecLaPresenceLocale, avecLaStationLocale, pauseDuCompte, pauseQuotaLue, quotaGithubLu, signeDeLEnregistrement } from "../../../src/vue/pause-quota/pause-quota.ts";
import { avecLeRail, type RailSurGithub, type SignesDeVie, type TicketSurGithub } from "../../../src/vue/rail/github.ts";
import { ligneDuRailBloque } from "../../../src/vue/rail-bloque/ligne-du-rail-bloque.js";
import { Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const LU = "2026-11-13T18:04:00.000Z";
const A = Date.parse(LU);
const REPRISE = "2026-11-13T18:11:00.000Z";
const minutes = (n: number) => new Date(A + n * 60_000).toISOString();
const doc = { createElement: (balise: string) => new Faux(balise) };
// Ce qui ne se dit jamais d'une pause.
const PANNE = /FAULT|offline|Start the station/;

type Quota = { limite: string; pauseJusqua: string | null; utilise: number; maximum: number; renouvellement: string; parStationEtProjet: Record<string, number> };
const quota = (autres: Partial<Quota> = {}): Quota => ({ limite: "core", pauseJusqua: REPRISE, utilise: 5000, maximum: 5000, renouvellement: REPRISE, parStationEtProjet: { [`box/${DEPOT}`]: 5000 }, ...autres });
// box : vue il y a quinze minutes — elle tourne, mais le quota l'empêche d'écrire son signe de vie.
const box = (autres: Record<string, unknown> = {}) => ({ id: "gistbox", name: "box", lastSeen: minutes(-15), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT], ...autres });
const enPause = (autres: Partial<Quota> = {}) => ({ ...box(), quotaGithub: quotaGithubLu(quota(autres)) ?? assert.fail("quota illisible") });

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
const ticket = (numero: number): TicketSurGithub => ({ ticket: numero, titre: `Ticket ${numero}`, url: `https://github.com/${DEPOT}/issues/${numero}`, etat: "en attente", priorite: null, creeLe: minutes(-60), pr: null, prise: null, entreLe: minutes(-20) });
// Deux tickets en file depuis vingt minutes, qu'aucun manager n'a pris.
const RAIL: RailSurGithub = { lu: LU, tickets: [ticket(4), ticket(5)], nonPris: [{ ticket: 4, depuis: minutes(-20) }, { ticket: 5, depuis: minutes(-20) }] };
const lecture = (signes: SignesDeVie) => avecLeRail(VIDE, RAIL, signes);
const faitsDe = (lu: TableauLu) => comprendre(JSON.stringify(lu.faits)) as Faits;
// Le texte que la tête du rail pose : rail bloqué, attente de la file, ligne de pause — comme vue.js.
function teteDuRail(faits: Faits, maintenant = A): string {
  const dit = ceQueLeRailDit(tableau(faits), maintenant);
  const gestes = { ouvrirStations: () => {} };
  const lignes = [...ligneDuRailBloque(doc, dit.railBloque, gestes), ...ligneDeLAttente(doc, dit.railBloque === undefined ? dit.attenteDuRail : undefined, gestes), ...ligneDuProjetEnPause(doc, dit.enPause)] as unknown as Faux[];
  return lignes.map((ligne) => ligne.textContent).join("\n");
}

describe("le contrat `quotaGithub`", () => {
  test("lu tel que le runtime le publie ; une limite inconnue ou une reprise illisible ne font pas une pause", () => {
    assert.deepEqual(quotaGithubLu(quota()), { limite: "core", pauseJusqua: REPRISE, utilise: 5000, maximum: 5000 });
    assert.deepEqual(quotaGithubLu(quota({ limite: "ecriture", pauseJusqua: null })), { limite: "ecriture", pauseJusqua: null, utilise: 5000, maximum: 5000 });
    for (const brut of [undefined, null, [], "core", quota({ limite: "search" }), quota({ pauseJusqua: "soon" }), { pauseJusqua: REPRISE }]) assert.equal(quotaGithubLu(brut), null, JSON.stringify(brut));
  });

  test("la lecture des stations du compte le passe aux signes de vie, avec le gist de chacune", () => {
    const lu = { state: "listed", unreadable: [], stations: [{ ...box(), platform: "linux", machine: "", version: "1", account: "chef", available: false, quotaGithub: quota() }, { ...box({ id: "gistmac", name: "mac" }), platform: "macos", machine: "", version: "1", account: "chef", available: true, quotaGithub: "illisible" }] } as unknown as Parameters<typeof signesDe>[0];
    const signes = signesDe(lu);
    assert.ok("lus" in signes);
    assert.deepEqual(signes.lus[0]?.quotaGithub, quotaGithubLu(quota()));
    assert.equal(signes.lus[0]?.id, "gistbox");
    assert.equal("quotaGithub" in (signes.lus[1] ?? {}), false);
  });

  test("`pauseQuota` de `facts` : rien de mal formé ne le pose", () => {
    assert.deepEqual(pauseQuotaLue({ limite: "core", jusqua: REPRISE }), { pauseQuota: { limite: "core", jusqua: REPRISE } });
    assert.deepEqual(pauseQuotaLue({ limite: "ecriture", jusqua: null }), { pauseQuota: { limite: "ecriture", jusqua: null } });
    for (const brut of [undefined, null, {}, { limite: "core" }, { limite: "x", jusqua: null }, { limite: "core", jusqua: "demain" }]) assert.deepEqual(pauseQuotaLue(brut), {}, JSON.stringify(brut));
  });
});

describe("la pause du compte, de la lecture du rail", () => {
  test("le quota épuisé : `facts` porte la pause — la limite, la reprise —, et le rail ne dit ni FAULT, ni offline, ni « Start the station »", () => {
    const faits = faitsDe(lecture({ lus: [enPause()] }));
    assert.deepEqual(faits.pauseQuota, { limite: "core", jusqua: REPRISE });
    // La station est retenue par GitHub, pas tue : les raisons du runtime le disent déjà.
    assert.equal(faits.attenteDuRail?.raison, "quota-github");
    assert.ok(faits.railBloque !== undefined && "cause" in faits.railBloque && faits.railBloque.cause === "sans-quota");
    const tete = teteDuRail(faits);
    assert.equal(tete, PROJET_EN_PAUSE);
    assert.doesNotMatch(tete, PANNE);
  });

  test("sans le quota, la même station muette depuis quinze minutes reste dite hors ligne : la règle d'avant", () => {
    const faits = faitsDe(lecture({ lus: [box()] }));
    assert.equal(faits.pauseQuota, undefined);
    assert.match(teteDuRail(faits), /FAULT/);
  });

  test("la reprise inconnue (`pauseJusqua` nul) : la pause tient, et la vue dit qu'elle ne sait pas quand elle revient", () => {
    const faits = faitsDe(lecture({ lus: [enPause({ pauseJusqua: null })] }));
    assert.deepEqual(faits.pauseQuota, { limite: "core", jusqua: null });
    assert.doesNotMatch(teteDuRail(faits), PANNE);
    const element = new Faux("section");
    tenirLaPause(element as unknown as HTMLElement, doc, { maintenant: () => A, auRetour: () => {} }).suivre(faits.pauseQuota);
    assert.ok(element.textContent.includes(REPRISE_INCONNUE), element.textContent);
    assert.doesNotMatch(element.textContent, /Resumes at/);
  });

  test("la reprise passée, ou un quota qui dit des appels restants sans reprise : plus de pause", () => {
    assert.equal(faitsDe(lecture({ lus: [enPause({ pauseJusqua: minutes(-1) })] })).pauseQuota, undefined);
    assert.equal(faitsDe(lecture({ lus: [enPause({ pauseJusqua: null, utilise: 10 })] })).pauseQuota, undefined);
  });

  test("plusieurs stations en pause : la reprise la plus tardive, et une reprise inconnue l'emporte", () => {
    const mac = { ...enPause({ limite: "ecriture", pauseJusqua: minutes(30) }), name: "mac" };
    assert.deepEqual(pauseDuCompte([enPause(), mac], A), { limite: "ecriture", jusqua: minutes(30) });
    assert.deepEqual(pauseDuCompte([enPause(), { ...enPause({ pauseJusqua: null }), name: "mac" }], A), { limite: "core", jusqua: null });
    assert.deepEqual(pauseDesProjets([undefined, { limite: "core", jusqua: REPRISE }, { limite: "core", jusqua: minutes(2) }], A), { limite: "core", jusqua: REPRISE });
  });
});

describe("une station vraiment arrêtée", () => {
  test("arrêtée, même avec un quota en pause : FAULT et « Start the station » restent, la pause ne la couvre pas", () => {
    const arretee = { ...enPause(), stoppedAt: minutes(-14) };
    const faits = faitsDe(lecture({ lus: [arretee] }));
    assert.equal(faits.pauseQuota, undefined);
    const tete = teteDuRail(faits);
    assert.match(tete, /FAULT/);
    assert.match(tete, /Start the station/);
  });

  test("arrêtée pendant que le compte est en pause (une autre station la porte) : sa panne garde sa ligne et son geste", () => {
    const arretee = { ...box(), stoppedAt: minutes(-14) };
    const ailleurs = { ...enPause(), name: "mac", selection: ["chef/autre"] };
    const faits = faitsDe(lecture({ lus: [arretee, ailleurs] }));
    assert.deepEqual(faits.pauseQuota, { limite: "core", jusqua: REPRISE });
    const tete = teteDuRail(faits);
    assert.match(tete, /Start the station/);
    assert.ok(!tete.includes(PROJET_EN_PAUSE), tete);
  });
});

describe("la station que l'app voit tourner sur cet ordinateur", () => {
  test("son signe de vie a quinze minutes, mais elle tourne ici : ni offline, ni « Start the station »", () => {
    const signes = avecLaStationLocale([box()], "gistbox", A);
    assert.equal(signes[0]?.lastSeen, LU);
    // Vivante, elle ne cache pas une autre panne (ici, son manager qui ne prend rien) : elle n'est juste pas dite tue.
    const tete = teteDuRail(faitsDe(lecture({ lus: signes })));
    assert.doesNotMatch(tete, /offline|Start the station/);
    // Sans elle — elle ne tourne pas ici —, rien ne change.
    assert.deepEqual(avecLaStationLocale([box()], null, A), [box()]);
    assert.match(teteDuRail(faitsDe(lecture({ lus: avecLaStationLocale([box()], "autre", A) }))), /FAULT/);
  });

  test("la liste des stations du compte la dit en ligne", () => {
    const lues = { state: "listed", unreadable: [], stations: [{ ...box(), platform: "macos", machine: "", version: "1", account: "chef", available: false }] } as unknown as StationsDuCompte;
    const etat = (presences: ReturnType<typeof avecLaPresenceLocale>) => {
      const lu = avecLeurEtat(lues, presences, A);
      return lu.state === "listed" ? lu.stations[0] : assert.fail("pas listée");
    };
    assert.equal(etat(avecLaPresenceLocale([], [{ id: "gistbox", name: "box" }], "gistbox"))?.available, true);
    assert.equal(etat(avecLaPresenceLocale([], [{ id: "gistbox", name: "box" }], null))?.available, false);
  });
});

describe("la ligne de tête de l'app", () => {
  test("calme, avec l'horloge : la limite nommée, la reprise, un compte à rebours qui décroît, rien à faire", () => {
    let instant = A;
    const element = new Faux("section");
    let retours = 0;
    const pause = tenirLaPause(element as unknown as HTMLElement, doc, { maintenant: () => instant, auRetour: () => retours++ });
    pause.suivre({ limite: "core", jusqua: REPRISE });
    assert.equal(element.hidden, false);
    const [ligne] = element.children as Faux[];
    assert.equal(ligne?.className, "bandeau-pause");
    assert.notEqual(ligne?.role, "alert");
    assert.equal(ligne?.children[0]?.className, "horloge");
    const heure = new Date(REPRISE).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    assert.equal(element.textContent, `Paused: GitHub quota of the account reached (its core quota). Resumes at ${heure} (in 7 min). Nothing to do.`);
    assert.doesNotMatch(element.textContent, PANNE);
    instant += 60_000;
    pause.battre();
    assert.match(element.textContent, /\(in 6 min\)/);
    instant = Date.parse(REPRISE) - 30_000;
    pause.battre();
    assert.match(element.textContent, /\(in 30 s\)/);
    // La reprise : la ligne tombe d'elle-même, sans un clic, et le projet affiché se redessine.
    instant = Date.parse(REPRISE);
    pause.battre();
    assert.equal(element.hidden, true);
    assert.equal(element.children.length, 0);
    assert.equal(retours, 1);
    pause.battre();
    assert.equal(retours, 1);
  });

  test("la limite d'écriture de GitHub se dit en clair", () => {
    const element = new Faux("section");
    tenirLaPause(element as unknown as HTMLElement, doc, { maintenant: () => A, auRetour: () => {} }).suivre({ limite: "ecriture", jusqua: REPRISE });
    assert.match(element.textContent, /^Paused: GitHub's write limit reached for the account\. /);
  });

  test("le compte à rebours, en mots", () => {
    assert.equal(dansCombien(42_000), "in 42 s");
    assert.equal(dansCombien(7 * 60_000), "in 7 min");
    assert.equal(dansCombien(65 * 60_000), "in 1 h 05");
  });
});

describe("l'accueil", () => {
  test("le projet en pause dit seulement la même raison, d'une pastille calme — pas son rail bloqué en rouge", () => {
    const faits = faitsDe(lecture({ lus: [enPause()] }));
    const ligne = ligneDeProjet({ nom: "parade", servi: true }, { a: LU, faits }, undefined);
    assert.equal(ligne.ton, "bleu");
    assert.equal(ligne.dit, MEME_RAISON);
    assert.doesNotMatch(`${ligne.dit} ${ligne.survol}`, PANNE);
    assert.equal(etatDeLaLigne(ligne), "paused");
  });

  test("sans la pause, la même lecture reste un rail bloqué, en rouge", () => {
    const ligne = ligneDeProjet({ nom: "parade", servi: true }, { a: LU, faits: faitsDe(lecture({ lus: [box()] })) }, undefined);
    assert.equal(ligne.ton, "rouge");
    assert.equal(etatDeLaLigne(ligne), "stuck");
  });
});

describe("le téléphone", () => {
  // Le compte du chef sur GitHub : le gist de box, son enregistrement — le quota épuisé — et les projets qu'elle sert.
  const enregistrement = (quotaGithub: unknown) => JSON.stringify({ brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux", version: "1", registeredAt: minutes(-600), lastSeen: minutes(-15), refreshMs: 120_000, stoppedAt: null, ...(quotaGithub === undefined ? {} : { quotaGithub }) });
  const selection = JSON.stringify({ brigade: "station-selection", format: 1, repositories: [DEPOT], updatedAt: minutes(-600) });
  const github = (fichiers: Record<string, string>): Envoi => async (adresse) => {
    const chemin = adresse.slice(API_GITHUB.length);
    if (chemin.startsWith("/gists?")) return { status: 200, data: /[?&]page=1(&|$)/.test(chemin) ? [{ id: "gistbox", files: Object.fromEntries(Object.keys(fichiers).map((nom) => [nom, { filename: nom }])) }] : [] };
    if (chemin === "/gists/gistbox") return { status: 200, data: { id: "gistbox", files: Object.fromEntries(Object.entries(fichiers).map(([nom, content]) => [nom, { filename: nom, content }])) } };
    if (chemin === `/repos/${DEPOT}`) return { status: 200, data: { owner: { login: "chef", type: "User" } } };
    if (chemin.startsWith(`/repos/${DEPOT}/`)) return { status: 200, data: [] };
    return { status: 404, data: { message: "Not Found" } };
  };
  const lirePar = async (fichiers: Record<string, string>) => {
    const recus: unknown[] = [];
    const lecture = ouvrirLaLectureGitHub({
      jeton: async () => "gho_du_coffre",
      envoyer: github(fichiers),
      compte: "chef",
      maintenant: () => new Date(A),
      planifier: () => () => undefined,
      dire: ((canal: string, premier: unknown) => void (canal === "surFaits" && recus.push(premier))) as Parameters<typeof ouvrirLaLectureGitHub>[0]["dire"],
    });
    await lecture.faits(1);
    const dessine = recus.filter((recue): recue is Dessinable => (recue as Dessinable).projet === "parade").at(-1);
    assert.ok(dessine !== undefined && "tableau" in dessine, JSON.stringify(dessine));
    return dessine.tableau;
  };

  test("il lit le quota de chaque station dans son gist, et chaque projet porte la même pause que sur le desktop", async () => {
    const vu = await lirePar({ "brigade-enregistrement.json": enregistrement(quota()), "brigade-selection.json": selection });
    assert.deepEqual(vu.pauseQuota, { limite: "core", jusqua: REPRISE });
    // La vue du téléphone est celle du desktop : la même tête de rail, des mêmes mots.
    assert.deepEqual(ceQueLeRailDit(vu, A).enPause, true);
  });

  test("sans quota, ou un enregistrement qui ne se lit pas : aucune pause n'est dite", async () => {
    assert.equal((await lirePar({ "brigade-enregistrement.json": enregistrement(undefined), "brigade-selection.json": selection })).pauseQuota, undefined);
    assert.equal((await lirePar({ "brigade-enregistrement.json": "pas du json", "brigade-selection.json": selection })).pauseQuota, undefined);
    assert.equal(signeDeLEnregistrement(undefined), null);
  });
});

describe("à l'écran", () => {
  const facts = (pauseJusqua: string | null | undefined) => {
    const maintenant = Date.now();
    const lu: TableauLu = { ...VIDE, luLe: new Date(maintenant).toISOString(), faits: { ...VIDE.faits, lu: new Date(maintenant).toISOString() } };
    const station = { ...box({ lastSeen: new Date(maintenant - 15 * 60_000).toISOString() }), ...(pauseJusqua === undefined ? {} : { quotaGithub: quotaGithubLu(quota({ pauseJusqua })) ?? assert.fail("quota") }) };
    const rail: RailSurGithub = { lu: lu.luLe, tickets: [{ ...ticket(4), entreLe: new Date(maintenant - 20 * 60_000).toISOString() }], nonPris: [{ ticket: 4, depuis: new Date(maintenant - 20 * 60_000).toISOString() }] };
    return JSON.stringify(avecLeRail(lu, rail, { lus: [station] }).faits);
  };

  test("la pause en tête de l'app, une fois ; le rail du projet dit seulement la même raison ; elle tombe d'elle-même au retour du quota", async () => {
    const projets: Projet[] = [{ nom: "parade", dossier: "/tmp/parade" }, { nom: "cantine", dossier: "/tmp/cantine" }];
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    const faits = tenirFaits();
    const lire = (projet: string, texte: string) => {
      const lecture: Lecture = { projet, demande: 1, a: new Date().toISOString(), sorties: [{ commande: "facts", texte }] };
      vue.dire("surFaits", faits.recevoir(lecture));
    };
    const tete = vue.element("pause-quota");
    assert.equal(tete.hidden, true);
    const dansSeptMinutes = new Date(Date.now() + 7 * 60_000).toISOString();
    lire("parade", facts(dansSeptMinutes));
    lire("cantine", facts(dansSeptMinutes));
    await repos();
    assert.equal(tete.hidden, false);
    assert.equal(tete.children.length, 1);
    assert.match(tete.textContent, /^Paused: GitHub quota of the account reached \(its core quota\)\. Resumes at .+ \(in [67] min\)\. Nothing to do\.$/);
    vue.element("projets").children[1]?.click();
    await repos();
    const rail = vue.element("rail");
    assert.ok(rail.textContent.includes(PROJET_EN_PAUSE), rail.textContent);
    assert.doesNotMatch(rail.textContent, PANNE);
    // Le quota revenu : la lecture suivante ne porte plus la pause, et tout tombe sans un clic.
    lire("parade", facts(undefined));
    lire("cantine", facts(undefined));
    await repos();
    assert.equal(tete.hidden, true);
    assert.ok(!rail.textContent.includes(PROJET_EN_PAUSE), rail.textContent);
  });
});
