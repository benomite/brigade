// « report to brigade », côté process principal (vue/report/opening.ts, ticket 1977) : le contexte de la panne
// (report/context/), masqué par le vrai `redact` (report/redaction/), devient l'adresse d'une nouvelle issue
// sur benomite/brigade (report/report/), ouverte dans le navigateur — et rien d'autre ne part : aucun client HTTP
// n'est appelé, et une page fermée n'a rien envoyé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { arch, release, type } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { LABEL, MARKER, URL_NEW_ISSUE } from "../../../src/report/report/report.ts";
import { COMMAND_OF_LOG, requestRead, openTheReport, systemSays, versionAimed, type Sources } from "../../../src/vue/report/opening.ts";

// Un faux jeton GitHub, et un dossier personnel : ni l'un ni l'autre ne doit sortir.
const TOKEN = "ghp_Zq8Xw3Lk9Pm2Nb7Vc4Rt6Yh1Ju5Ig0Of3Ea2";
const ALICE = "/home/alice/";

// Une ligne du journal, dans le format de brigade (runtime/src/ligne-evenement.ts) : ce que `log` rend.
const line = (seq: number, ticket: number | null, typeOfEvent: string, load: unknown) =>
  [seq, "2026-11-02T09:00:00.000Z", "parade", ticket === null ? "-" : `#${ticket}`, typeOfEvent, "runtime", JSON.stringify(load)].join("  ");
const LOG = [
  line(1, 21, "cook.started", { station: "box/claude" }),
  line(2, 22, "cook.started", { station: "box/claude" }),
  line(3, 22, "cook.exited", { error: `git push refused: token ${TOKEN} rejected, see ${ALICE}parade/.git/config` }),
  line(4, 22, "ticket.86", { reason: "the cook failed three times" }),
  line(5, 21, "cook.exited", { code: 0 }),
].join("\n");

type Calls = { journal: (string | undefined)[]; ouverts: string[] };
function sources(calls: Calls, within: Partial<Sources> = {}): Sources {
  return {
    appVersion: "1.6.0",
    runtimeVersion: () => "2.9.1",
    journal: (project) => (calls.journal.push(project), LOG),
    ouvrir: async (url) => void calls.ouverts.push(url),
    ...within,
  };
}

// Tout client HTTP du process, et le réseau en dessous : un appel ferait échouer le test.
function withoutNetwork(t: TestContext) {
  const spies = [
    t.mock.method(globalThis, "fetch", () => assert.fail("fetch was called")),
    t.mock.method(http, "request", () => assert.fail("http.request was called")),
    t.mock.method(http, "get", () => assert.fail("http.get was called")),
    t.mock.method(https, "request", () => assert.fail("https.request was called")),
    t.mock.method(https, "get", () => assert.fail("https.get was called")),
    t.mock.method(net, "connect", () => assert.fail("net.connect was called")),
    t.mock.method(net, "createConnection", () => assert.fail("net.createConnection was called")),
  ];
  return () => spies.reduce((total, espion) => total + espion.mock.callCount(), 0);
}

const bodyOf = (url: string) => new URL(url).searchParams.get("body") ?? assert.fail("no body in the address");

test("le geste ouvre le navigateur sur une nouvelle issue de benomite/brigade : le corps commence par le marqueur, le label est field-report", async () => {
  const calls: Calls = { journal: [], ouverts: [] };
  const rendered = await openTheReport({ projet: "parade", reference: { ticket: 22 }, panne: "parade, ticket 22: set aside — the cook failed three times" }, sources(calls));
  assert.deepEqual(rendered, { ouvert: true });
  assert.equal(calls.ouverts.length, 1);
  const [url = ""] = calls.ouverts;
  assert.ok(url.startsWith(`${URL_NEW_ISSUE}?`), url);
  assert.ok(url.startsWith("https://github.com/benomite/brigade/issues/new?"));
  const address = new URL(url);
  assert.equal(address.searchParams.get("labels"), LABEL);
  assert.equal(address.searchParams.get("labels"), "field-report");
  assert.ok(bodyOf(url).startsWith(MARKER));
  assert.ok(bodyOf(url).startsWith("Field report from the brigade app"));
  assert.match(address.searchParams.get("title") ?? "", /^Field report: parade, ticket 22: set aside/);
  // Le journal du projet de la panne, lu une fois.
  assert.deepEqual(calls.journal, ["parade"]);
});

test("le corps porte les versions, le système, la panne en quelques mots et les lignes du journal qui en parlent — sans jeton ni nom d'utilisateur", async () => {
  const calls: Calls = { journal: [], ouverts: [] };
  await openTheReport({ projet: "parade", reference: { ticket: 22 }, panne: `parade, ticket 22: set aside — the cook could not push from ${ALICE}parade with ${TOKEN}` }, sources(calls));
  const body = bodyOf(calls.ouverts[0] ?? assert.fail("nothing opened"));
  assert.match(body, /- App: 1\.6\.0/);
  assert.match(body, /- Runtime: 2\.9\.1/);
  assert.ok(body.includes(`${type()} ${release()} (${arch()})`), body);
  assert.match(body, /## Failure\nparade, ticket 22: set aside — the cook could not push from ~\/parade with \[redacted\]/);
  // Les lignes de #22, dans l'ordre du journal ; pas celles de #21.
  assert.match(body, /## Log \(last 3 lines\)/);
  assert.ok(body.includes("cook.exited") && body.includes("ticket.86"));
  // Le journal seul : la section System porte la version du noyau (« #21-Ubuntu SMP… » sur certains runners).
  const startOfLog = body.indexOf("## Log");
  assert.notEqual(startOfLog, -1, "the Log section is missing");
  assert.ok(!body.slice(startOfLog).includes("#21"));
  // Le jeton et le nom de l'utilisateur ne sortent nulle part — ni du corps, ni du titre, ni de l'adresse.
  for (const text of [body, calls.ouverts[0] ?? "", decodeURIComponent(calls.ouverts[0] ?? "")]) {
    assert.ok(!text.includes("ghp_"), "a token-like string is left");
    assert.ok(!text.includes(TOKEN));
    assert.ok(!text.includes("alice"), "the username of the home path is left");
    assert.ok(!text.includes("/home/"));
  }
  assert.ok(body.includes("see ~/parade/.git/config"));
});

test("aucun client HTTP n'est appelé : seul le navigateur reçoit l'adresse, et fermer sa page n'envoie rien", async (t) => {
  const calls: Calls = { journal: [], ouverts: [] };
  const network = withoutNetwork(t);
  // Le navigateur ouvre la page, puis le chef la ferme sans l'envoyer : le geste a déjà rendu, rien ne suit.
  const rendered = await openTheReport({ projet: "parade", reference: { station: "box" }, panne: "station box: update to version 1.5.0 failed" }, sources(calls));
  assert.deepEqual(rendered, { ouvert: true });
  assert.equal(calls.ouverts.length, 1);
  await new Promise((done) => setImmediate(done));
  assert.equal(network(), 0);
  assert.equal(calls.ouverts.length, 1);
  assert.equal(calls.journal.length, 1);
});

test("aucun des modules du geste n'importe de client HTTP ni n'appelle le réseau", () => {
  const src = join(import.meta.dirname, "../../../src");
  for (const file of ["vue/report/opening.ts", "vue/report/action.js", "report/context/context.ts", "report/redaction/redact.ts", "report/report/report.ts"]) {
    const text = readFileSync(join(src, file), "utf8");
    for (const motive of [/\bfetch\s*\(/, /from "node:(?:http|https|net|http2|tls|dgram)"/, /XMLHttpRequest/, /\bWebSocket\b/, /require\(/]) assert.doesNotMatch(text, motive, `${file}: ${motive}`);
  }
});

test("le journal se lit par la commande de l'onglet Log ; illisible, le signalement part sans lignes", async () => {
  assert.equal(COMMAND_OF_LOG, "log --last 200");
  const calls: Calls = { journal: [], ouverts: [] };
  const rendered = await openTheReport(
    { projet: "parade", reference: { ligne: "the station did not answer" }, panne: "parade: the station did not answer" },
    sources(calls, { journal: () => Promise.reject(new Error("no kitchen runs this project on this computer")), runtimeVersion: () => { throw new Error("unreadable"); } }),
  );
  assert.deepEqual(rendered, { ouvert: true });
  const body = bodyOf(calls.ouverts[0] ?? assert.fail("nothing opened"));
  assert.match(body, /- Runtime: unknown/);
  assert.doesNotMatch(body, /## Log/);
  assert.match(body, /## Failure\nparade: the station did not answer/);
});

test("le navigateur qui ne s'ouvre pas : un refus, en une ligne, son détail à part", async () => {
  const rendered = await openTheReport({ reference: { station: "box" }, panne: "station box: offline for 12 min" }, sources({ journal: [], ouverts: [] }, { ouvrir: () => Promise.reject(new Error("no default browser")) }));
  assert.deepEqual(rendered, { refus: "the browser did not open: nothing was sent", detail: "no default browser" });
});

test("une demande qui ne nomme pas sa panne n'ouvre rien", async () => {
  const calls: Calls = { journal: [], ouverts: [] };
  for (const raw of [undefined, null, "x", {}, { reference: { ticket: 22 } }, { reference: {}, panne: "x" }, { reference: { ticket: -1 }, panne: "x" }, { reference: { ticket: 1, station: "box" }, panne: "x" }, { reference: { station: " " }, panne: "x" }, { reference: { ticket: 22 }, panne: "  " }]) {
    assert.deepEqual(await openTheReport(raw, sources(calls)), { refus: "nothing was opened: the app did not say which failure" }, JSON.stringify(raw));
  }
  assert.deepEqual(calls, { journal: [], ouverts: [] });
  assert.deepEqual(requestRead({ projet: " parade ", reference: { pass: "pass-42" }, panne: ` ${"x".repeat(900)} ` }), { projet: "parade", reference: { pass: "pass-42" }, panne: "x".repeat(500) });
});

test("la version du runtime : la station nommée, sinon celle qui sert le projet, à défaut celle d'à côté de l'app", () => {
  const stations = [
    { nom: "box", version: "2.9.1", projets: ["parade"] },
    { nom: "mac", version: "2.8.0", projets: ["cantine"] },
    { nom: "pc", version: "", projets: ["menu"] },
  ];
  assert.equal(versionAimed({ reference: { station: "mac" }, panne: "x" }, stations, "3.0.0"), "2.8.0");
  assert.equal(versionAimed({ projet: "parade", reference: { ticket: 1 }, panne: "x" }, stations, "3.0.0"), "2.9.1");
  assert.equal(versionAimed({ projet: "menu", reference: { ticket: 1 }, panne: "x" }, stations, "3.0.0"), "3.0.0");
  assert.equal(versionAimed({ projet: "ailleurs", reference: { ticket: 1 }, panne: "x" }, stations, "3.0.0"), "3.0.0");
  assert.equal(versionAimed({ reference: { ligne: "x" }, panne: "x" }, stations, "3.0.0"), "3.0.0");
});

test("le système en une ligne : le « #1 » d'un noyau Linux est cité, que GitHub n'y lise pas une issue", () => {
  assert.equal(systemSays({ name: "Linux", release: "6.1.0-54-amd64", arch: "x64", version: "#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1" }), "Linux 6.1.0-54-amd64 (x64) — `#1 SMP PREEMPT_DYNAMIC Debian 6.1.158-1`");
  assert.equal(systemSays({ name: "Darwin", release: "24.1.0", arch: "arm64", version: "unknown" }), "Darwin 24.1.0 (arm64)");
});
