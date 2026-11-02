// « report to brigade », côté process principal (vue/signalement/ouverture.ts, ticket 1977) : le contexte de la panne
// (signalement/contexte/), masqué par le vrai `redact` (signalement/redaction/), devient l'adresse d'une nouvelle issue
// sur benomite/brigade (signalement/rapport/), ouverte dans le navigateur — et rien d'autre ne part : aucun client HTTP
// n'est appelé, et une page fermée n'a rien envoyé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { arch, release, type } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ETIQUETTE, MARQUEUR, URL_NOUVELLE_ISSUE } from "../../../src/signalement/rapport/rapport.ts";
import { COMMANDE_DU_JOURNAL, demandeLue, ouvrirLeSignalement, systemeDit, versionVisee, type Sources } from "../../../src/vue/signalement/ouverture.ts";

// Un faux jeton GitHub, et un dossier personnel : ni l'un ni l'autre ne doit sortir.
const JETON = "ghp_Zq8Xw3Lk9Pm2Nb7Vc4Rt6Yh1Ju5Ig0Of3Ea2";
const ALICE = "/home/alice/";

// Une ligne du journal, dans le format de brigade (runtime/src/ligne-evenement.ts) : ce que `log` rend.
const ligne = (seq: number, ticket: number | null, typeDEvenement: string, charge: unknown) =>
  [seq, "2026-11-02T09:00:00.000Z", "parade", ticket === null ? "-" : `#${ticket}`, typeDEvenement, "runtime", JSON.stringify(charge)].join("  ");
const JOURNAL = [
  ligne(1, 21, "cook.started", { station: "box/claude" }),
  ligne(2, 22, "cook.started", { station: "box/claude" }),
  ligne(3, 22, "cook.exited", { error: `git push refused: token ${JETON} rejected, see ${ALICE}parade/.git/config` }),
  ligne(4, 22, "ticket.86", { reason: "the cook failed three times" }),
  ligne(5, 21, "cook.exited", { code: 0 }),
].join("\n");

type Appels = { journal: (string | undefined)[]; ouverts: string[] };
function sources(appels: Appels, en: Partial<Sources> = {}): Sources {
  return {
    appVersion: "1.6.0",
    runtimeVersion: () => "2.9.1",
    journal: (projet) => (appels.journal.push(projet), JOURNAL),
    ouvrir: async (url) => void appels.ouverts.push(url),
    ...en,
  };
}

// Tout client HTTP du process, et le réseau en dessous : un appel ferait échouer le test.
function sansReseau(t: TestContext) {
  const espions = [
    t.mock.method(globalThis, "fetch", () => assert.fail("fetch was called")),
    t.mock.method(http, "request", () => assert.fail("http.request was called")),
    t.mock.method(http, "get", () => assert.fail("http.get was called")),
    t.mock.method(https, "request", () => assert.fail("https.request was called")),
    t.mock.method(https, "get", () => assert.fail("https.get was called")),
    t.mock.method(net, "connect", () => assert.fail("net.connect was called")),
    t.mock.method(net, "createConnection", () => assert.fail("net.createConnection was called")),
  ];
  return () => espions.reduce((total, espion) => total + espion.mock.callCount(), 0);
}

const corpsDe = (url: string) => new URL(url).searchParams.get("body") ?? assert.fail("no body in the address");

test("le geste ouvre le navigateur sur une nouvelle issue de benomite/brigade : le corps commence par le marqueur, le label est field-report", async () => {
  const appels: Appels = { journal: [], ouverts: [] };
  const rendu = await ouvrirLeSignalement({ projet: "parade", reference: { ticket: 22 }, panne: "parade, ticket 22: set aside — the cook failed three times" }, sources(appels));
  assert.deepEqual(rendu, { ouvert: true });
  assert.equal(appels.ouverts.length, 1);
  const [url = ""] = appels.ouverts;
  assert.ok(url.startsWith(`${URL_NOUVELLE_ISSUE}?`), url);
  assert.ok(url.startsWith("https://github.com/benomite/brigade/issues/new?"));
  const adresse = new URL(url);
  assert.equal(adresse.searchParams.get("labels"), ETIQUETTE);
  assert.equal(adresse.searchParams.get("labels"), "field-report");
  assert.ok(corpsDe(url).startsWith(MARQUEUR));
  assert.ok(corpsDe(url).startsWith("Field report from the brigade app"));
  assert.match(adresse.searchParams.get("title") ?? "", /^Field report: parade, ticket 22: set aside/);
  // Le journal du projet de la panne, lu une fois.
  assert.deepEqual(appels.journal, ["parade"]);
});

test("le corps porte les versions, le système, la panne en quelques mots et les lignes du journal qui en parlent — sans jeton ni nom d'utilisateur", async () => {
  const appels: Appels = { journal: [], ouverts: [] };
  await ouvrirLeSignalement({ projet: "parade", reference: { ticket: 22 }, panne: `parade, ticket 22: set aside — the cook could not push from ${ALICE}parade with ${JETON}` }, sources(appels));
  const corps = corpsDe(appels.ouverts[0] ?? assert.fail("nothing opened"));
  assert.match(corps, /- App: 1\.6\.0/);
  assert.match(corps, /- Runtime: 2\.9\.1/);
  assert.ok(corps.includes(`${type()} ${release()} (${arch()})`), corps);
  assert.match(corps, /## Failure\nparade, ticket 22: set aside — the cook could not push from ~\/parade with \[redacted\]/);
  // Les lignes de #22, dans l'ordre du journal ; pas celles de #21.
  assert.match(corps, /## Log \(last 3 lines\)/);
  assert.ok(corps.includes("cook.exited") && corps.includes("ticket.86"));
  assert.ok(!corps.includes("#21"));
  // Le jeton et le nom de l'utilisateur ne sortent nulle part — ni du corps, ni du titre, ni de l'adresse.
  for (const texte of [corps, appels.ouverts[0] ?? "", decodeURIComponent(appels.ouverts[0] ?? "")]) {
    assert.ok(!texte.includes("ghp_"), "a token-like string is left");
    assert.ok(!texte.includes(JETON));
    assert.ok(!texte.includes("alice"), "the username of the home path is left");
    assert.ok(!texte.includes("/home/"));
  }
  assert.ok(corps.includes("see ~/parade/.git/config"));
});

test("aucun client HTTP n'est appelé : seul le navigateur reçoit l'adresse, et fermer sa page n'envoie rien", async (t) => {
  const appels: Appels = { journal: [], ouverts: [] };
  const reseau = sansReseau(t);
  // Le navigateur ouvre la page, puis le chef la ferme sans l'envoyer : le geste a déjà rendu, rien ne suit.
  const rendu = await ouvrirLeSignalement({ projet: "parade", reference: { station: "box" }, panne: "station box: update to version 1.5.0 failed" }, sources(appels));
  assert.deepEqual(rendu, { ouvert: true });
  assert.equal(appels.ouverts.length, 1);
  await new Promise((fait) => setImmediate(fait));
  assert.equal(reseau(), 0);
  assert.equal(appels.ouverts.length, 1);
  assert.equal(appels.journal.length, 1);
});

test("aucun des modules du geste n'importe de client HTTP ni n'appelle le réseau", () => {
  const src = join(import.meta.dirname, "../../../src");
  for (const fichier of ["vue/signalement/ouverture.ts", "vue/signalement/geste.js", "signalement/contexte/contexte.ts", "signalement/redaction/redact.ts", "signalement/rapport/rapport.ts"]) {
    const texte = readFileSync(join(src, fichier), "utf8");
    for (const motif of [/\bfetch\s*\(/, /from "node:(?:http|https|net|http2|tls|dgram)"/, /XMLHttpRequest/, /\bWebSocket\b/, /require\(/]) assert.doesNotMatch(texte, motif, `${fichier}: ${motif}`);
  }
});

test("le journal se lit par la commande de l'onglet Log ; illisible, le signalement part sans lignes", async () => {
  assert.equal(COMMANDE_DU_JOURNAL, "log --last 200");
  const appels: Appels = { journal: [], ouverts: [] };
  const rendu = await ouvrirLeSignalement(
    { projet: "parade", reference: { ligne: "the station did not answer" }, panne: "parade: the station did not answer" },
    sources(appels, { journal: () => Promise.reject(new Error("no kitchen runs this project on this computer")), runtimeVersion: () => { throw new Error("unreadable"); } }),
  );
  assert.deepEqual(rendu, { ouvert: true });
  const corps = corpsDe(appels.ouverts[0] ?? assert.fail("nothing opened"));
  assert.match(corps, /- Runtime: unknown/);
  assert.doesNotMatch(corps, /## Log/);
  assert.match(corps, /## Failure\nparade: the station did not answer/);
});

test("le navigateur qui ne s'ouvre pas : un refus, en une ligne, son détail à part", async () => {
  const rendu = await ouvrirLeSignalement({ reference: { station: "box" }, panne: "station box: offline for 12 min" }, sources({ journal: [], ouverts: [] }, { ouvrir: () => Promise.reject(new Error("no default browser")) }));
  assert.deepEqual(rendu, { refus: "the browser did not open: nothing was sent", detail: "no default browser" });
});

test("une demande qui ne nomme pas sa panne n'ouvre rien", async () => {
  const appels: Appels = { journal: [], ouverts: [] };
  for (const brute of [undefined, null, "x", {}, { reference: { ticket: 22 } }, { reference: {}, panne: "x" }, { reference: { ticket: -1 }, panne: "x" }, { reference: { ticket: 1, station: "box" }, panne: "x" }, { reference: { station: " " }, panne: "x" }, { reference: { ticket: 22 }, panne: "  " }]) {
    assert.deepEqual(await ouvrirLeSignalement(brute, sources(appels)), { refus: "nothing was opened: the app did not say which failure" }, JSON.stringify(brute));
  }
  assert.deepEqual(appels, { journal: [], ouverts: [] });
  assert.deepEqual(demandeLue({ projet: " parade ", reference: { pass: "pass-42" }, panne: ` ${"x".repeat(900)} ` }), { projet: "parade", reference: { pass: "pass-42" }, panne: "x".repeat(500) });
});

test("la version du runtime : la station nommée, sinon celle qui sert le projet, à défaut celle d'à côté de l'app", () => {
  const stations = [
    { nom: "box", version: "2.9.1", projets: ["parade"] },
    { nom: "mac", version: "2.8.0", projets: ["cantine"] },
    { nom: "pc", version: "", projets: ["menu"] },
  ];
  assert.equal(versionVisee({ reference: { station: "mac" }, panne: "x" }, stations, "3.0.0"), "2.8.0");
  assert.equal(versionVisee({ projet: "parade", reference: { ticket: 1 }, panne: "x" }, stations, "3.0.0"), "2.9.1");
  assert.equal(versionVisee({ projet: "menu", reference: { ticket: 1 }, panne: "x" }, stations, "3.0.0"), "3.0.0");
  assert.equal(versionVisee({ projet: "ailleurs", reference: { ticket: 1 }, panne: "x" }, stations, "3.0.0"), "3.0.0");
  assert.equal(versionVisee({ reference: { ligne: "x" }, panne: "x" }, stations, "3.0.0"), "3.0.0");
});

test("le système en une ligne : le « #1 » d'un noyau Linux est cité, que GitHub n'y lise pas une issue", () => {
  assert.equal(systemeDit({ name: "Linux", release: "6.1.0-54-amd64", arch: "x64", version: "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1" }), "Linux 6.1.0-54-amd64 (x64) — `#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1`");
  assert.equal(systemeDit({ name: "Darwin", release: "24.1.0", arch: "arm64", version: "unknown" }), "Darwin 24.1.0 (arm64)");
});
