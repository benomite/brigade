// Un faux flux de versions publiées : un serveur local, sur le port 0, qui répond comme GitHub —
// les étiquettes `app-v*` par son API, puis, pour chaque release, `latest-mac.yml` et le .dmg du
// Mac, `latest.yml` et le setup .exe de Windows. Ni réseau, ni GitHub.
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { TestContext } from "node:test";

// Une version publiée : son .dmg et son `latest-mac.yml` — `null` : étiquetée, pas encore publiée —,
// et, quand elle en porte un, le setup .exe de Windows et son `latest.yml`. Sans `dmg`, la release ne
// porte rien pour le Mac.
export type Publication = { dmg?: Buffer; yml?: string | null; exe?: Buffer; ymlExe?: string | null };

export const nameOfSetup = (version: string) => `Brigade-${version}-x64-setup.exe`;

export type FakeFlux = {
  adresse: string;
  publications: Map<string, Publication>;
  // Ce que l'API répond à la liste des étiquettes, quand ce n'est pas 200.
  statutDeLAPI?: number;
  // Les chemins demandés, dans l'ordre.
  demandes: string[];
};

// Ce que publie le workflow publier-app (construire.ts, `metadonneesDeMiseAJour`).
export function ymlOf(version: string, dmg: Buffer, name = `Brigade-${version}-arm64.dmg`): string {
  const sha512 = createHash("sha512").update(dmg).digest("base64");
  return [`version: ${version}`, "files:", `  - url: ${name}`, `    sha512: ${sha512}`, `    size: ${dmg.length}`, `path: ${name}`, `sha512: ${sha512}`, "releaseDate: '2026-10-19T12:00:00.000Z'", ""].join("\n");
}

export async function oneFakeFlux(t: TestContext, publications: Record<string, Publication> = {}): Promise<FakeFlux> {
  const flux: FakeFlux = { adresse: "", publications: new Map(Object.entries(publications)), demandes: [] };
  const server: Server = createServer((request, answer) => {
    const path = decodeURIComponent(request.url ?? "");
    flux.demandes.push(path);
    if (path === "/repos/benomite/brigade/git/matching-refs/tags/app-v") {
      if (flux.statutDeLAPI !== undefined) return answer.writeHead(flux.statutDeLAPI).end("{}");
      answer.writeHead(200, { "content-type": "application/json" });
      return answer.end(JSON.stringify([...flux.publications.keys()].map((version) => ({ ref: `refs/tags/app-v${version}` }))));
    }
    const download = /^\/benomite\/brigade\/releases\/download\/app-v([^/]+)\/([^/]+)$/.exec(path);
    const published = download === null ? undefined : flux.publications.get(download[1] ?? "");
    if (download !== null && published !== undefined) {
      const [, version = "", file = ""] = download;
      const { dmg, exe } = published;
      if (dmg !== undefined) {
        const yml = published.yml === undefined ? ymlOf(version, dmg) : published.yml;
        if (file === "latest-mac.yml" && yml !== null) return answer.writeHead(200).end(yml);
        if (file === `Brigade-${version}-arm64.dmg` && yml !== null) return answer.writeHead(200, { "content-length": dmg.length }).end(dmg);
      }
      if (exe !== undefined) {
        const yml = published.ymlExe === undefined ? ymlOf(version, exe, nameOfSetup(version)) : published.ymlExe;
        if (file === "latest.yml" && yml !== null) return answer.writeHead(200).end(yml);
        if (file === nameOfSetup(version) && yml !== null) return answer.writeHead(200, { "content-length": exe.length }).end(exe);
      }
    }
    answer.writeHead(404).end("Not Found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  flux.adresse = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return flux;
}

// Une adresse où rien ne répond : un port ouvert puis refermé.
export async function oneAddressSilent(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
