// Les outils des tests qui jugent : un outil qui se trompe fait passer un test
// qui n'a rien vérifié.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fauxGh, lancerSurPortPose, mort, repertoireTemporaire } from "./outils.ts";

test("mort : un process terminé est mort", async () => {
  const enfant = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await once(enfant, "close");

  await mort(enfant.pid ?? Number.NaN);
});

test("mort : un pid qui n'en est pas un est une erreur, pas un process mort", async () => {
  // Ce que rend `Number(/pid=(\d+)/.exec(sortie)?.[1])` quand la sortie ne porte plus de pid.
  for (const pid of [Number.NaN, 0, -1, 1.5]) await assert.rejects(mort(pid), /pid illisible/);
});

test("mort : un process qu'on n'a pas le droit de sonder n'est pas mort", async (t) => {
  // Aucun process n'est interdit de sonde partout : pour root, aucun ; sous
  // cloison, le pid 1 est à soi. C'est donc le refus du système qui est joué.
  const sondes: Array<[number, string | number | undefined]> = [];
  t.mock.method(process, "kill", (pid: number, signal?: string | number) => {
    sondes.push([pid, signal]);
    throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
  });

  await assert.rejects(mort(1), { code: "EPERM" });
  // Sondé une fois, sans signal : le refus n'est ni réessayé, ni attendu comme une mort.
  assert.deepEqual(sondes, [[1, 0]]);
});

test("fauxGh : des appels simultanés gardent chacun leur jeton, à tout instant", async (t) => {
  const gh = fauxGh(t);
  // Un appel n'est jamais lu sans son jeton, ni avec celui d'un autre.
  const apparies = () => {
    const appels = gh.appels();
    const jetons = gh.jetons();
    assert.deepEqual(appels.map((appel, i) => [appel[0], jetons[i]]), appels.map((appel) => [appel[0], `jeton-de-${appel[0]}`]));
    return appels.length;
  };
  const enfants = Array.from({ length: 12 }, (_, i) => spawn(gh.bin, [`appel-${i}`], { stdio: "ignore", env: { ...process.env, GH_TOKEN: `jeton-de-appel-${i}` } }));
  const finis = Promise.all(enfants.map((enfant) => once(enfant, "close")));
  let fini = false;
  void finis.then(() => (fini = true));

  while (!fini) {
    apparies();
    await new Promise((resoudre) => setImmediate(resoudre));
  }

  assert.equal(apparies(), enfants.length);
});

// Les deux process que le chef pose sur un port, et ce que chacun dit une fois ouvert.
const POSES = [
  {
    nom: "l'arbitre",
    fichier: join(import.meta.dirname, "../src/tenir-arbitre.ts"),
    env: (repertoire: string, port: number) => ({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: String(port), BRIGADE_ARBITER_MAX_COOKS: "2" }),
    ouvert: (port: number) => `arbitre ouvert — 127.0.0.1:${port}`,
  },
  {
    nom: "la porte",
    fichier: join(import.meta.dirname, "../src/tenir-porte.ts"),
    env: (repertoire: string, port: number) => ({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "brigade", BRIGADE_PROXY_PORT: String(port) }),
    ouvert: (port: number) => `porte du projet « brigade » ouverte — 127.0.0.1:${port}`,
  },
];

// Un port qu'un voisin tient : ce que devient, sous Linux, un port fermé à l'instant.
async function portTenu(t: TestContext): Promise<number> {
  const voisin = createServer();
  await new Promise<void>((pret) => voisin.listen(0, "127.0.0.1", pret));
  t.after(() => void voisin.close());
  return (voisin.address() as AddressInfo).port;
}

for (const pose of POSES) {
  test(`lancerSurPortPose : un port repris avant que ${pose.nom} n'y écoute est retiré, et le process tient le suivant`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const repris = await portTenu(t);
    const tires: number[] = [];

    const { enfant, port } = await lancerSurPortPose(t, pose.fichier, {
      env: (port) => pose.env(repertoire, port),
      ouvert: pose.ouvert,
      tirer: async (tirer) => {
        tires.push(tires.length === 0 ? repris : await tirer());
        return tires.at(-1) as number;
      },
    });

    assert.equal(tires[0], repris);
    assert.notEqual(port, repris);
    assert.equal(port, tires.at(-1));
    assert.ok(enfant.sortie().includes(pose.ouvert(port)));
  });

  test(`lancerSurPortPose : ${pose.nom} sur un port repris à chaque essai, le compte d'essais s'épuise et le dit`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const repris = await portTenu(t);
    let tirages = 0;

    await assert.rejects(
      lancerSurPortPose(t, pose.fichier, { env: (port) => pose.env(repertoire, port), ouvert: pose.ouvert, essais: 3, tirer: async () => (tirages++, repris) }),
      new RegExp(`aucun port tenu en 3 essais, le dernier sur ${repris} : `),
    );
    assert.equal(tirages, 3);
  });
}

test("lancerSurPortPose : un process qui meurt d'autre chose que d'un port pris n'est pas relancé", async (t) => {
  let tirages = 0;
  const [arbitre] = POSES;

  await assert.rejects(
    lancerSurPortPose(t, arbitre!.fichier, { env: (port) => ({ BRIGADE_ARBITER_PORT: String(port) }), ouvert: arbitre!.ouvert, tirer: async (tirer) => (tirages++, tirer()) }),
    /process terminé sans « arbitre ouvert[^»]*» : brigade : l'arbitre refuse de démarrer — BRIGADE_ARBITER_STATE_DIR n'est pas défini/,
  );
  assert.equal(tirages, 1);
});
