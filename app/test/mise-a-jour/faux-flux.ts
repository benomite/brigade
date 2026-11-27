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

export const nomDuSetup = (version: string) => `Brigade-${version}-x64-setup.exe`;

export type FauxFlux = {
  adresse: string;
  publications: Map<string, Publication>;
  // Ce que l'API répond à la liste des étiquettes, quand ce n'est pas 200.
  statutDeLAPI?: number;
  // Les chemins demandés, dans l'ordre.
  demandes: string[];
};

// Ce que publie le workflow publier-app (construire.ts, `metadonneesDeMiseAJour`).
export function ymlDe(version: string, dmg: Buffer, nom = `Brigade-${version}-arm64.dmg`): string {
  const sha512 = createHash("sha512").update(dmg).digest("base64");
  return [`version: ${version}`, "files:", `  - url: ${nom}`, `    sha512: ${sha512}`, `    size: ${dmg.length}`, `path: ${nom}`, `sha512: ${sha512}`, "releaseDate: '2026-10-19T12:00:00.000Z'", ""].join("\n");
}

export async function unFauxFlux(t: TestContext, publications: Record<string, Publication> = {}): Promise<FauxFlux> {
  const flux: FauxFlux = { adresse: "", publications: new Map(Object.entries(publications)), demandes: [] };
  const serveur: Server = createServer((requete, reponse) => {
    const chemin = decodeURIComponent(requete.url ?? "");
    flux.demandes.push(chemin);
    if (chemin === "/repos/benomite/brigade/git/matching-refs/tags/app-v") {
      if (flux.statutDeLAPI !== undefined) return reponse.writeHead(flux.statutDeLAPI).end("{}");
      reponse.writeHead(200, { "content-type": "application/json" });
      return reponse.end(JSON.stringify([...flux.publications.keys()].map((version) => ({ ref: `refs/tags/app-v${version}` }))));
    }
    const telechargement = /^\/benomite\/brigade\/releases\/download\/app-v([^/]+)\/([^/]+)$/.exec(chemin);
    const publiee = telechargement === null ? undefined : flux.publications.get(telechargement[1] ?? "");
    if (telechargement !== null && publiee !== undefined) {
      const [, version = "", fichier = ""] = telechargement;
      const { dmg, exe } = publiee;
      if (dmg !== undefined) {
        const yml = publiee.yml === undefined ? ymlDe(version, dmg) : publiee.yml;
        if (fichier === "latest-mac.yml" && yml !== null) return reponse.writeHead(200).end(yml);
        if (fichier === `Brigade-${version}-arm64.dmg` && yml !== null) return reponse.writeHead(200, { "content-length": dmg.length }).end(dmg);
      }
      if (exe !== undefined) {
        const yml = publiee.ymlExe === undefined ? ymlDe(version, exe, nomDuSetup(version)) : publiee.ymlExe;
        if (fichier === "latest.yml" && yml !== null) return reponse.writeHead(200).end(yml);
        if (fichier === nomDuSetup(version) && yml !== null) return reponse.writeHead(200, { "content-length": exe.length }).end(exe);
      }
    }
    reponse.writeHead(404).end("Not Found");
  });
  await new Promise<void>((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  t.after(
    () =>
      new Promise<void>((resoudre) => {
        serveur.close(() => resoudre());
        serveur.closeAllConnections();
      }),
  );
  flux.adresse = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  return flux;
}

// Une adresse où rien ne répond : un port ouvert puis refermé.
export async function uneAdresseMuette(): Promise<string> {
  const serveur = createServer();
  await new Promise<void>((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  const { port } = serveur.address() as AddressInfo;
  await new Promise<void>((resoudre) => serveur.close(() => resoudre()));
  return `http://127.0.0.1:${port}`;
}
