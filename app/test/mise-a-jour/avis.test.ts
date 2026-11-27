// The "newer version" notice (mise-a-jour/avis.ts): newest app-v release above the running version,
// the running version beside it, the direct package link of this device and the first-open hint. Nothing
// dismisses it (#2431).
import assert from "node:assert/strict";
import { test } from "node:test";
import { chercherUneMiseAJour, indiceDe, posteDe, type Poste } from "../../src/mise-a-jour/avis.ts";

const BASE = "https://github.com/benomite/brigade/releases/download";
const ASSETS = ["Brigade-%V.dmg", "Brigade-Setup-%V.exe", "brigade-%V.apk", "latest-mac.yml"];
const release = (version: string, noms: string[] = ASSETS) => ({
  html_url: `https://github.com/benomite/brigade/releases/tag/app-v${version}`,
  assets: noms.map((n) => ({ name: n.replace("%V", version), browser_download_url: `${BASE}/app-v${version}/${n.replace("%V", version)}` })),
});
// A fake GitHub: the tags it lists, and the release body of each.
const github = (publiees: Record<string, unknown>, statut = 200): typeof fetch =>
  (async (url: string | URL | Request) => {
    const adresse = String(url);
    if (statut !== 200) return new Response("no", { status: statut });
    if (adresse.endsWith("/git/matching-refs/tags/app-v")) return Response.json(Object.keys(publiees).map((v) => ({ ref: `refs/tags/app-v${v}` })));
    const version = decodeURIComponent(adresse.split("/releases/tags/app-v")[1] ?? "");
    return version in publiees ? Response.json(publiees[version]) : new Response("none", { status: 404 });
  }) as typeof fetch;
const chercher = (version: string, poste: Poste, fetcher: typeof fetch) => chercherUneMiseAJour({ version, poste, fetch: fetcher });

for (const [poste, extension, indice] of [
  ["mac", ".dmg", "mac-right-click-open"],
  ["windows", ".exe", "windows-more-info-run-anyway"],
  ["android", ".apk", undefined],
] as const) {
  test(`a newer release gives its version and the direct ${extension} link on ${poste}`, async () => {
    const avis = await chercher("1.0.0", poste, github({ "1.0.0": release("1.0.0"), "1.2.0": release("1.2.0") }));
    assert.equal(avis?.version, "1.2.0");
    assert.equal(avis?.courante, "1.0.0");
    assert.match(avis?.url ?? "", new RegExp(`^${BASE}/app-v1\\.2\\.0/.+\\${extension}$`));
    assert.doesNotMatch(avis?.url ?? "", /\/releases\/tag\//);
    assert.equal(avis?.indice, indice);
    assert.equal("indice" in (avis ?? {}), indice !== undefined);
  });
}

test("versions compare by their numbers, not as text", async () => {
  assert.equal((await chercher("1.9.0", "mac", github({ "1.10.0": release("1.10.0") })))?.version, "1.10.0");
});

test("an app on the latest version, or ahead of it, gets no update", async () => {
  const gh = github({ "1.2.0": release("1.2.0") });
  assert.equal(await chercher("1.2.0", "mac", gh), undefined);
  assert.equal(await chercher("1.3.0", "mac", gh), undefined);
});

test("a release lacking the package of this device gives no update and does not throw", async () => {
  const gh = github({ "1.2.0": release("1.2.0", ["Brigade-%V.dmg"]) });
  assert.equal(await chercher("1.0.0", "windows", gh), undefined);
  assert.equal(await chercher("1.0.0", "android", gh), undefined);
  assert.equal((await chercher("1.0.0", "mac", gh))?.version, "1.2.0");
});

test("a newest release without the package gives way to the next one down", async () => {
  const gh = github({ "1.1.0": release("1.1.0"), "1.2.0": release("1.2.0", ["latest-mac.yml"]) });
  assert.equal((await chercher("1.0.0", "mac", gh))?.version, "1.1.0");
});

test("the first-open hint exists for Mac and Windows and not for Android", () => {
  assert.equal(indiceDe("mac"), "mac-right-click-open");
  assert.equal(indiceDe("windows"), "windows-more-info-run-anyway");
  assert.equal(indiceDe("android"), undefined);
  assert.deepEqual([posteDe("darwin"), posteDe("win32"), posteDe("linux")], ["mac", "windows", undefined]);
});

test("a network failure, a bad status or malformed data gives no update without throwing", async () => {
  const echec = (async () => { throw new Error("offline"); }) as typeof fetch;
  assert.equal(await chercher("1.0.0", "mac", echec), undefined);
  assert.equal(await chercher("1.0.0", "mac", github({}, 500)), undefined);
  const mal = (corps: unknown): typeof fetch => (async () => Response.json(corps)) as typeof fetch;
  assert.equal(await chercher("1.0.0", "mac", mal({ not: "a list" })), undefined);
  assert.equal(await chercher("1.0.0", "mac", mal([{ ref: 3 }, null, { ref: "refs/tags/app-v1.2.0" }])), undefined);
  assert.equal(await chercher("1.0.0", "mac", github({ "1.2.0": { assets: "nope" } })), undefined);
  assert.equal(await chercher("1.0.0", "mac", github({ "1.2.0": { assets: [null, { name: 4 }, { name: "x.dmg" }] } })), undefined);
  assert.equal(await chercher("not a version", "mac", github({ "1.2.0": release("1.2.0") })), undefined);
  assert.equal(await chercher("1.0.0", "mac", (async () => new Response("{ broken")) as typeof fetch), undefined);
});
