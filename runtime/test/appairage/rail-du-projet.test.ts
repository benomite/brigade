// Le rail d'un projet, lu sur un ordinateur neuf (#1432) : rien d'installé que
// l'app, aucun état local, aucun `ssh` vers la box — le `gh` de la machine, ici
// une doublure qui tient les gists du compte dans un répertoire. La box publie
// son état par sa vraie présence (`presence.ts`), sur le vrai canal, et le rail
// de son projet lu dans son journal ; le Mac, lui, lit ce journal par `facts`,
// comme il le fait sur la box.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../../src/appairage/canal.ts";
import { FICHIER_APPAIRAGE } from "../../src/appairage/document.ts";
import { FICHIER_LOCAL, tenirPresence, type Identite } from "../../src/appairage/presence.ts";
import { railDuJournal } from "../../src/appairage/rail-du-journal.ts";
import { lireLeRailDuProjet, principal, type RailDuProjet } from "../../src/appairage/rail-du-projet.ts";
import { FICHIER_RAIL, railDuDocument, type RailsPublies } from "../../src/appairage/rail-publie.ts";
import type { Fait } from "../../src/evenements.ts";
import { principal as facts } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../../src/rail.ts";
import { aArreter, appeler, horloge, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_GH = join(import.meta.dirname, "faux-gh-gists.ts");
const COMMANDE = join(import.meta.dirname, "../../src/appairage/rail-du-projet.ts");

type Gist = { id: string; files: Record<string, { filename: string; content: string }> };
type Panne = "panne" | "deconnecte" | "jeton-refuse" | "limite";

// GitHub : un répertoire, où la doublure range les gists du compte.
function unGitHub(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  const ajouter = (id: string, fichiers: Record<string, string>) => {
    const gist = JSON.parse(readFileSync(fichier(id), "utf8")) as Gist;
    for (const [nom, content] of Object.entries(fichiers)) gist.files[nom] = { filename: nom, content };
    writeFileSync(fichier(id), JSON.stringify(gist));
  };
  return {
    repertoire,
    ajouter,
    // Ce que l'app écrit quand le chef a tapé le bon code.
    appairer: (id: string) => ajouter(id, { [FICHIER_APPAIRAGE]: JSON.stringify({ appaireeLe: new Date().toISOString(), empreinte: "e" }) }),
    tomber: (comment: Panne) => writeFileSync(join(repertoire, comment), ""),
    relever: (comment: Panne) => rmSync(join(repertoire, comment)),
    env: () => ({ PATH: process.env.PATH ?? "", FAUX_GISTS: repertoire }),
  };
}

// Une station appairée qui publie son état — et, avec `rails`, le rail de ses
// projets — sur ce GitHub, par sa vraie présence. `republier` : son écriture
// suivante, l'écart minimal entre deux écritures passé.
async function uneStation(t: TestContext, github: ReturnType<typeof unGitHub>, identite: Identite, projets: Record<string, string>, rails?: () => RailsPublies) {
  const racine = join(repertoireTemporaire(t), identite.nom);
  mkdirSync(racine);
  let instant = Date.now();
  const presence = tenirPresence({
    racine,
    canal: canalGitHub({ gh: FAUX_GH }),
    identite,
    projets: () => Object.keys(projets),
    depots: () => projets,
    ...(rails === undefined ? {} : { rails }),
    dire: () => {},
    // Aucun minuteur : le test publie lui-même.
    apres: () => () => {},
    maintenant: () => instant,
  });
  aArreter(t, () => presence.arreter());
  await presence.publier();
  const { gist } = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist: string };
  github.appairer(gist);
  return {
    gist,
    republier: async () => {
      instant += 60_000;
      await presence.publier();
    },
  };
}

// Le journal du projet sur la box : un ticket pris, un en pass, un en attente,
// un 86 qui reviendra demain, un bloqué, un servi.
function laBox(t: TestContext) {
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat, { maintenant: horloge(new Date().toISOString()) });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, priority: number | null, card?: { waitsFor: number[]; zone: string[]; problems: string[] }) =>
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card } }, ticket, "github");
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 3_600_000 });
  noter({ type: "runtime.started", payload: { pid: 1, host: "shop-box", node: "v26" } });
  for (const [ticket, priority] of [[14, 1], [15, 1], [16, 2], [17, 2], [19, 3]] as const) arriver(ticket, priority);
  arriver(18, null, { waitsFor: [12], zone: [], problems: [] });
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 12, "github");
  rail.prendre("shop-box/claude-opus"); // 14
  rail.prendre("shop-box/claude-sonnet"); // 15
  rail.envoyerEnPass(15, "shop-box/claude-sonnet");
  rail.quatreVingtSix(17, { motif: "quota", retour: new Date(Date.now() + 86_400_000) });
  noter({ type: "ticket.taken", payload: { station: "shop-box/claude-opus", leaseUntil: new Date(Date.now() + 3_600_000).toISOString() } }, 19, "station:shop-box/claude-opus");
  noter({ type: "ticket.passing", payload: { station: "shop-box/claude-opus" } }, 19, "station:shop-box/claude-opus");
  rail.servir(19);
  return { etat, journal, rail, arriver };
}

// Ce que le Mac lit du rail sur la box : le `rail` de `facts`.
async function surLeMac(etat: string) {
  const commande = appeler(facts, [], { BRIGADE_STATE_DIR: etat });
  assert.equal(await commande.fin, 0, commande.sortie());
  const { rail } = JSON.parse(commande.sortie()) as { rail: Array<{ ticket: number; etat: string; titre: string; url: string }> };
  return rail.map(({ ticket, etat: mot, titre, url }) => ({ ticket, state: mot, title: titre, url }));
}

const lire = (github: ReturnType<typeof unGitHub>, project: string, gh = FAUX_GH) => lireLeRailDuProjet({ gh, env: github.env(), project });

test("sur un PC neuf, sans rien d'avant, le rail du projet a les mêmes tickets — mêmes numéros, mêmes états — que celui que le Mac lit sur la box", async (t) => {
  const github = unGitHub(t);
  const box = laBox(t);
  const station = await uneStation(t, github, { nom: "shop-box", machine: "Linux 6.1.0", version: "1.5.0" }, { brigade: "acme/brigade" }, () => ({ brigade: railDuJournal(box.journal) }));
  // Le Mac est aussi une station appairée, qui sert un autre projet : son rail ne se mêle pas à celui de la box.
  await uneStation(t, github, { nom: "mac", machine: "macOS 25.0.0", version: "1.5.0" }, { espace: "acme/espace" }, () => ({ espace: [{ ticket: 3, etat: "pris", titre: "Ailleurs", url: "https://github.com/acme/espace/issues/3" }] }));

  const mac = await surLeMac(box.etat);
  assert.deepEqual(
    mac.map(({ ticket, state }) => [ticket, state]),
    [[14, "pris"], [15, "en pass"], [16, "en attente"], [17, "86"], [19, "servi"], [18, "BLOQUÉ"]],
  );

  // La commande, dans un process neuf : ni HOME, ni état, ni variable de brigade — rien que son `gh`.
  const commande = lancer(t, COMMANDE, ["brigade"], { ...github.env(), HOME: repertoireTemporaire(t), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await commande.fin, 0, commande.sortie());
  const lu = JSON.parse(commande.sortie()) as RailDuProjet;
  assert.ok(lu.state === "listed", commande.sortie());
  assert.deepEqual(lu.tickets, mac);
  assert.equal(lu.reason, undefined);
  assert.deepEqual({ project: lu.project, repository: lu.repository, station: lu.station }, { project: "brigade", repository: "acme/brigade", station: { id: station.gist, name: "shop-box", online: true } });

  // Le rail bouge sur la box : un ticket arrive, celui en pass est servi. À son écriture suivante, le PC lit ce que le Mac lit.
  box.arriver(20, 1);
  box.rail.servir(15);
  await station.republier();
  const apres = await surLeMac(box.etat);
  assert.deepEqual(apres.find(({ ticket }) => ticket === 15)?.state, "servi");
  assert.ok(apres.some(({ ticket }) => ticket === 20));
  // Lu par son dépôt, comme le dit la liste des stations.
  const relu = await lire(github, "acme/brigade");
  assert.ok(relu.state === "listed");
  assert.deepEqual(relu.tickets, apres);
});

test("le rail que publie une station en ligne passe avant celui d'une station arrêtée qui servait le projet avant elle", async (t) => {
  const github = unGitHub(t);
  const ancienne = await uneStation(t, github, { nom: "vieille-box", machine: "Linux", version: "1" }, { brigade: "acme/brigade" }, () => ({ brigade: [{ ticket: 1, etat: "pris", titre: "Vieux", url: "u" }] }));
  const neuve = await uneStation(t, github, { nom: "shop-box", machine: "Linux", version: "1" }, { brigade: "acme/brigade" }, () => ({ brigade: [{ ticket: 2, etat: "en attente", titre: "Neuf", url: "u" }] }));
  // L'ancienne a cessé de publier depuis longtemps : son signe de vie a vieilli.
  const vieux = JSON.parse(readFileSync(join(github.repertoire, `${ancienne.gist}.gist.json`), "utf8")) as Gist;
  const document = JSON.parse(vieux.files["brigade-station.json"]?.content ?? "{}") as Record<string, unknown>;
  github.ajouter(ancienne.gist, { "brigade-station.json": JSON.stringify({ ...document, signeDeVie: new Date(Date.now() - 86_400_000).toISOString() }) });

  const lu = await lire(github, "brigade");
  assert.ok(lu.state === "listed");
  assert.equal(lu.station.id, neuve.gist);
  assert.deepEqual(lu.tickets.map(({ ticket }) => ticket), [2]);
});

// Une phrase : une seule fin de phrase, la dernière — et jamais de liste de tickets.
function phrase(etat: RailDuProjet) {
  assert.notEqual(etat.state, "listed", JSON.stringify(etat));
  assert.ok(etat.state !== "listed");
  assert.ok(!("tickets" in etat));
  assert.match(etat.reason, /^[A-Z][^\n]*\.$/);
  assert.equal(etat.reason.split(/[.!?](\s|$)/).filter((morceau) => morceau.trim() !== "").length, 1, etat.reason);
  return etat;
}

test("non connecté à GitHub : la réponse dit pourquoi en une phrase, avec le geste qui connecte — jamais un rail vide", async (t) => {
  const github = unGitHub(t);
  await uneStation(t, github, { nom: "shop-box", machine: "Linux", version: "1" }, { brigade: "acme/brigade" }, () => ({ brigade: [] }));
  github.tomber("deconnecte");
  const commande = appeler(principal, ["brigade"], { ...github.env(), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await commande.fin, 1);
  const lu = phrase(JSON.parse(commande.sortie()) as RailDuProjet);
  assert.deepEqual(lu, {
    state: "sign-in-required",
    project: "brigade",
    reason: "This computer is not signed in to GitHub, so brigade cannot read the rail of brigade, which its station publishes there.",
    action: { id: "github-sign-in", label: "Sign in to GitHub", command: [FAUX_GH, "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"] },
  });
  github.relever("deconnecte");

  github.tomber("jeton-refuse");
  assert.equal(phrase(await lire(github, "brigade")).state, "sign-in-required");
});

test("sans accès au projet — aucune station de ce compte ne le sert — la réponse le dit en une phrase, avec le geste qui connecte sous un autre compte", async (t) => {
  const github = unGitHub(t);
  await uneStation(t, github, { nom: "shop-box", machine: "Linux", version: "1" }, { shop: "acme/shop" }, () => ({ shop: [] }));
  const lu = phrase(await lire(github, "brigade"));
  assert.ok(lu.state === "unavailable");
  assert.equal(lu.cause, "not-served");
  assert.equal(lu.reason, "No station paired with this GitHub account serves brigade, so its rail cannot be read: sign in to GitHub with the account your stations publish to.");
  assert.equal(lu.action?.id, "github-sign-in");

  // Et sans aucune station appairée.
  const vide = unGitHub(t);
  assert.equal((phrase(await lire(vide, "brigade")) as { cause?: string }).cause, "not-served");
});

test("sans réseau, sans `gh`, ou sous la limite de GitHub : la réponse dit pourquoi en une phrase", async (t) => {
  const github = unGitHub(t);
  await uneStation(t, github, { nom: "shop-box", machine: "Linux", version: "1" }, { brigade: "acme/brigade" }, () => ({ brigade: [] }));

  const sansGh = phrase(await lire(github, "brigade", join(github.repertoire, "pas-de-gh")));
  assert.ok(sansGh.state === "unavailable");
  assert.equal(sansGh.cause, "gh-missing");
  assert.equal(sansGh.link, "https://cli.github.com");

  github.tomber("limite");
  const limite = phrase(await lire(github, "brigade"));
  assert.ok(limite.state === "unavailable");
  assert.equal(limite.cause, "rate-limit");
  github.relever("limite");

  github.tomber("panne");
  const sansReseau = phrase(await lire(github, "brigade"));
  assert.ok(sansReseau.state === "unavailable");
  assert.equal(sansReseau.cause, "network");
  assert.equal(sansReseau.reason, "GitHub cannot be reached from this computer, so the rail of brigade could not be read: check its network connection.");
  assert.match(sansReseau.detail ?? "", /error connecting to api\.github\.com/);

  const commande = lancer(t, COMMANDE, ["brigade"], { ...github.env(), HOME: repertoireTemporaire(t), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await commande.fin, 1);
  assert.equal((JSON.parse(commande.sortie()) as RailDuProjet).state, "unavailable");
});

test("une station qui sert le projet sans publier de rail — d'avant #1432 —, ou un rail illisible : la réponse le dit en une phrase", async (t) => {
  const github = unGitHub(t);
  const ancienne = await uneStation(t, github, { nom: "shop-box", machine: "Linux", version: "1" }, { brigade: "acme/brigade" });
  const sansRail = phrase(await lire(github, "brigade"));
  assert.ok(sansRail.state === "unavailable");
  assert.equal(sansRail.cause, "not-published");
  assert.match(sansRail.reason, /^The station shop-box serves brigade but publishes no rail on GitHub: update brigade on it/);

  // Elle publie des rails, mais pas encore celui-là.
  github.ajouter(ancienne.gist, { [FICHIER_RAIL]: JSON.stringify({ brigade: "rail", format: 1, projets: {} }) });
  const pasEncore = phrase(await lire(github, "brigade"));
  assert.ok(pasEncore.state === "unavailable");
  assert.equal(pasEncore.cause, "not-published");
  assert.match(pasEncore.reason, /has not published its rail yet/);

  github.ajouter(ancienne.gist, { [FICHIER_RAIL]: JSON.stringify({ brigade: "rail", format: 99, projets: { brigade: [] } }) });
  const illisible = phrase(await lire(github, "brigade"));
  assert.ok(illisible.state === "unavailable");
  assert.equal(illisible.cause, "unreadable");
});

test("un rail vide se lit vide, et le dit en une phrase", async (t) => {
  const github = unGitHub(t);
  await uneStation(t, github, { nom: "shop-box", machine: "Linux", version: "1" }, { brigade: "acme/brigade" }, () => ({ brigade: [] }));
  const lu = await lire(github, "brigade");
  assert.ok(lu.state === "listed");
  assert.deepEqual(lu.tickets, []);
  assert.equal(lu.reason, "The rail of brigade, as shop-box publishes it, holds no ticket.");
});

test("le rail publié se relit tel quel ; un format inconnu, un ticket mal formé ou du texte ne se lisent pas", () => {
  const ticket = { ticket: 14, etat: "pris", titre: "T", url: "u" };
  assert.deepEqual(railDuDocument(JSON.stringify({ brigade: "rail", format: 1, projets: { brigade: [ticket] } }), "brigade"), { tickets: [ticket] });
  assert.equal(railDuDocument(JSON.stringify({ brigade: "rail", format: 1, projets: { brigade: [ticket] } }), "espace"), "absent");
  assert.equal(railDuDocument(undefined, "brigade"), "absent");
  assert.equal(railDuDocument("pas du json", "brigade"), "illisible");
  assert.equal(railDuDocument(JSON.stringify({ brigade: "rail", format: 2, projets: {} }), "brigade"), "illisible");
  assert.equal(railDuDocument(JSON.stringify({ brigade: "rail", format: 1, projets: { brigade: [{ ...ticket, ticket: "14" }] } }), "brigade"), "illisible");
  assert.equal(railDuDocument(JSON.stringify({ brigade: "rail", format: 1, projets: { toString: [] } }), "constructor"), "absent");
});

test("rail-du-projet.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
