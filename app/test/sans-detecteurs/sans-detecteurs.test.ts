// #3914 : les détecteurs de la cuisine sont partis — l'urgence, le rail bloqué, les alertes du rail, la réparation de main
// automatique —, et le superviseur du runtime les remplace. Ce que l'app en lisait part avec eux : chaque endroit où elle
// les lisait lit désormais seulement ce que le runtime écrit encore.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertes, signalDe, type Alerte } from "../../src/alertes.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import type { Lecture } from "../../src/box.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, comprendre, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { ceQueLeRailDit } from "../../src/vue/pause-quota/ligne-de-la-pause.js";
import { avecLeRail, lireLeRailSurGithub, type RailSurGithub } from "../../src/vue/rail/github.ts";
import { jouerLaVue, repos } from "../aides/fausse-vue.ts";

const LU = "2026-11-13T10:00:00.000Z";
const URGENCE = { decision: "#9", ticket: 9, cause: "question", geste: "answer on the issue", url: null, depuis: "2026-11-13T09:59:00.000Z", retenus: [10], autres: [] };

describe("la bande d'alertes", () => {
  test("l'urgence ne s'y lit plus ; le rouge vient avant le jaune, à vérification égale", () => {
    const faits = comprendre(JSON.stringify({ etat: "ouverte", lu: LU, dernierTick: null, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], urgence: URGENCE })) as Faits;
    // La limite de GitHub (jaune) se lit avant le manager éteint (rouge) : le tri les remet dans l'ordre de gravité.
    const bande = alertes({ projet: "parade", faits, status: "kitchen    open\n", limite: { reprise: "2026-11-13T11:00:00.000Z" }, manager: { allume: false } as never });
    assert.deepEqual(
      bande.map(({ sujet, ton, verifie }) => [sujet, ton, verifie]),
      [
        ["manager", "rouge", true],
        ["github", "jaune", true],
      ],
    );
  });
});

describe("la lecture du rail sur GitHub", () => {
  const DEPOT = "chef/cantine";
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });

  test("ni les tickets qu'aucun manager ne prend, ni la marque de la réparation de main : le ticket dit ce qu'il attend, rien de plus", async () => {
    const lus: string[] = [];
    const appeler: AppelGitHub = async (chemin) => {
      lus.push(chemin);
      if (chemin.includes("/issues?")) return ok([issue(4, ["fire", "repair-main"]), issue(5, ["fire"], "Depends on #4.")]);
      if (chemin.includes("/pulls?")) return ok([]);
      if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
      return { status: 404, data: {} };
    };
    const lu = await lireLeRailSurGithub({ depot: DEPOT, appeler, maintenant: () => new Date("2026-11-17T10:00:00Z") });
    assert.ok(lu.lu);
    assert.equal("nonPris" in lu, false);
    const [quatre, cinq] = lu.tickets;
    assert.deepEqual(Object.keys(quatre ?? {}).sort(), ["attentes", "commentairesLus", "creeLe", "entreLe", "etat", "pr", "prise", "priorite", "ticket", "titre", "url"].sort());
    assert.deepEqual(cinq?.depend, [4]);
  });
});

describe("ce que le rail dit, pause ou non", () => {
  const ARRETEE = { raison: "arretee" };
  const ORDINAIRE = { raison: "normale" };
  const PAUSE = { limite: "core", jusqua: "2026-11-13T10:30:00.000Z" };
  const A = Date.parse(LU);
  // Un tableau d'avant, qui porterait encore le rail bloqué : il n'est plus lu.
  const avecRailBloque = (autres: Record<string, unknown>) => ({ railBloque: { cause: "sans-manager" }, ...autres }) as Parameters<typeof ceQueLeRailDit>[0];

  test("sans pause, l'attente de la file seule — le rail bloqué n'est plus rendu ; arrêtée, elle reste dite hors d'un redémarrage", () => {
    assert.deepEqual(ceQueLeRailDit(avecRailBloque({ attenteDuRail: ARRETEE }), A), { attenteDuRail: ARRETEE, enPause: false });
    assert.deepEqual(ceQueLeRailDit(avecRailBloque({ attenteDuRail: ARRETEE }), A, true), { attenteDuRail: undefined, enPause: false });
  });

  test("en pause, une attente ordinaire se tait derrière la pause ; une panne que la pause n'explique pas la garde", () => {
    assert.deepEqual(ceQueLeRailDit(avecRailBloque({ pauseQuota: PAUSE, attenteDuRail: ORDINAIRE }), A), { attenteDuRail: undefined, enPause: true });
    assert.deepEqual(ceQueLeRailDit(avecRailBloque({ pauseQuota: PAUSE, attenteDuRail: ARRETEE }), A), { attenteDuRail: ARRETEE, enPause: false });
  });
});

describe("à l'écran", () => {
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }, { nom: "baloo", dossier: "/tmp/baloo" }] }, () => true),
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

  test("la marque d'un projet sur la barre : « ! » une alerte, « × » une box muette, « ? » le reste — plus de « !! » d'urgence", async () => {
    const vue = await ouvrir();
    const alerte: Alerte = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped", geste: "resume the kitchen", prix: "—" };
    const marque = () => vue.element("projets").children[2]?.children.find((pose) => pose.className === "signal")?.textContent;
    vue.dire("surAlertes", { projet: "baloo", alertes: [alerte], signal: signalDe([alerte]) });
    assert.equal(marque(), "!");
    vue.dire("surAlertes", { projet: "baloo", alertes: [alerte], signal: { etat: "injoignable", dit: "no answer" } });
    assert.equal(marque(), "×");
    vue.dire("surAlertes", { projet: "baloo", alertes: [alerte], signal: { etat: "urgence", dit: "the whole kitchen waits" } as unknown as ReturnType<typeof signalDe> });
    assert.equal(marque(), "?");
  });

  test("une attente de la file qui porte un geste se dit en tête du rail, avec son geste", async () => {
    const vue = await ouvrir();
    const faits = tenirFaits();
    const maintenant = Date.now();
    const lu: TableauLu = { lu: true, depot: "chef/parade", luLe: new Date(maintenant).toISOString(), cuisine: { rubriques: [] }, faits: { etat: "ouverte", lu: new Date(maintenant).toISOString(), dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] }, file: [], bilans: [], lignesDuRail: [], activites: [] };
    // La seule station du projet, arrêtée : la file ne part pas, et le geste est de la redémarrer.
    const station = { id: "gistbox", name: "box", lastSeen: new Date(maintenant - 60 * 60_000).toISOString(), stoppedAt: new Date(maintenant - 60 * 60_000).toISOString(), refreshMs: 120_000, selection: ["chef/parade"] };
    const rail: RailSurGithub = { lu: lu.luLe, tickets: [{ ticket: 4, titre: "Ticket 4", url: "https://github.com/chef/parade/issues/4", etat: "en attente", priorite: null, creeLe: new Date(maintenant - 60 * 60_000).toISOString(), pr: null, prise: null, entreLe: new Date(maintenant - 20 * 60_000).toISOString() }] };
    const tenu = avecLeRail(lu, rail, { lus: [station] });
    const attente = tenu.faits.attenteDuRail as { phrase: string; geste: unknown } | undefined;
    assert.notEqual(attente?.geste ?? null, null, "the waiting reason carries a gesture");
    const lecture: Lecture = { projet: "parade", demande: 1, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: JSON.stringify(tenu.faits) }] };
    vue.dire("surFaits", faits.recevoir(lecture));
    await repos();
    vue.element("projets").children[1]?.click();
    await repos();
    const tete = vue.element("rail").textContent;
    assert.ok(tete.includes(attente?.phrase ?? "?"), tete);
    assert.match(tete, /Start/);
  });
});
