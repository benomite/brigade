// Ce que la comparaison des captures demande au vrai client GitHub (#3617) :
// lire une image octet pour octet, et publier les images de la carte dans un
// commit à part — contre un faux transport, qui lit ce que `gh` lirait.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ouvrirGitHub, type Transport } from "../../src/github.ts";

const DEPOT = "faux/depot";
const reponse = (statut: number, corps: unknown) => ({ erreur: null, stdout: `HTTP/2.0 ${statut}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}`, stderr: "" });

function client(repondre: (args: string[]) => { statut: number; corps: unknown }) {
  const appels: string[][] = [];
  const transport: Transport = async (args) => {
    appels.push(args);
    const { statut, corps } = repondre(args);
    return reponse(statut, corps);
  };
  return { appels, github: ouvrirGitHub({ depot: DEPOT, transport }) };
}

const OCTETS = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10, 0x80]);

test("an image is read byte for byte at a commit; over a megabyte, through its blob; absent, null; a body GitHub does not give, an error", async () => {
  const contenu = `repos/${DEPOT}/contents/docs/captures/40/rail%20avant.png?ref=abc`;
  const { github, appels } = client((args) => {
    const chemin = args.at(-1);
    if (chemin === contenu) return { statut: 200, corps: { content: OCTETS.toString("base64"), encoding: "base64", sha: "b1" } };
    if (chemin === `repos/${DEPOT}/contents/grand.png?ref=abc`) return { statut: 200, corps: { content: "", encoding: "none", sha: "b2" } };
    if (chemin === `repos/${DEPOT}/git/blobs/b2`) return { statut: 200, corps: { content: OCTETS.toString("base64"), encoding: "base64" } };
    if (chemin === `repos/${DEPOT}/contents/vide.png?ref=abc`) return { statut: 200, corps: { encoding: "none" } };
    return { statut: 404, corps: { message: "Not Found" } };
  });
  assert.deepEqual(await github.fichierBinaire("docs/captures/40/rail avant.png", "abc"), OCTETS);
  assert.deepEqual(await github.fichierBinaire("grand.png", "abc"), OCTETS);
  assert.equal(await github.fichierBinaire("absent.png", "abc"), null);
  await assert.rejects(github.fichierBinaire("vide.png", "abc"), /fichier illisible/);
  assert.ok(appels.every((args) => !args.includes("-X")), "reads only");
});

test("the images are published as one commit of their own — blobs, a tree, a commit with no parent — kept under refs/brigade/captures/<sha>, each body sent through a file", async () => {
  const corps: Array<{ chemin: string; corps: unknown }> = [];
  const fichiers: string[] = [];
  let blobs = 0;
  const { github, appels } = client((args) => {
    const chemin = args.at(-1) ?? "";
    const input = args[args.indexOf("--input") + 1];
    if (args.includes("--input") && input !== undefined) {
      fichiers.push(input);
      corps.push({ chemin, corps: JSON.parse(readFileSync(input, "utf8")) });
    }
    if (chemin.endsWith("/git/blobs")) return { statut: 201, corps: { sha: `blob${++blobs}` } };
    if (chemin.endsWith("/git/trees")) return { statut: 201, corps: { sha: "arbre" } };
    if (chemin.endsWith("/git/commits")) return { statut: 201, corps: { sha: "commit1" } };
    if (chemin.endsWith("/git/refs")) return { statut: 201, corps: { ref: "refs/brigade/captures/commit1" } };
    return { statut: 404, corps: {} };
  });
  const sha = await github.publierFichiers([{ chemin: "comparison/40/rail/changed-areas.png", contenu: OCTETS }, { chemin: "comparison/40/rail/area-1.png", contenu: Buffer.from("x") }], "Captures compared");
  assert.equal(sha, "commit1");
  assert.deepEqual(corps, [
    { chemin: `repos/${DEPOT}/git/blobs`, corps: { content: OCTETS.toString("base64"), encoding: "base64" } },
    { chemin: `repos/${DEPOT}/git/blobs`, corps: { content: Buffer.from("x").toString("base64"), encoding: "base64" } },
    { chemin: `repos/${DEPOT}/git/trees`, corps: { tree: [{ path: "comparison/40/rail/changed-areas.png", mode: "100644", type: "blob", sha: "blob1" }, { path: "comparison/40/rail/area-1.png", mode: "100644", type: "blob", sha: "blob2" }] } },
    { chemin: `repos/${DEPOT}/git/commits`, corps: { message: "Captures compared", tree: "arbre", parents: [] } },
  ]);
  assert.deepEqual(appels.at(-1), ["-X", "POST", "-f", "ref=refs/brigade/captures/commit1", "-f", "sha=commit1", `repos/${DEPOT}/git/refs`]);
  // Les fichiers des corps ne restent pas.
  assert.ok(fichiers.every((fichier) => !existsSync(fichier)));
});

test("a publication GitHub refuses fails: no commit is said published", async () => {
  const { github } = client((args) => (args.at(-1)?.endsWith("/git/blobs") ? { statut: 201, corps: { sha: "b" } } : { statut: 422, corps: { message: "Unprocessable" } }));
  await assert.rejects(github.publierFichiers([{ chemin: "a.png", contenu: OCTETS }], "m"), /git\/trees : HTTP 422/);
});
