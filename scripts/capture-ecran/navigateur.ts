// Le navigateur sans tête de la capture : un Chromium, piloté par le protocole DevTools sur un
// tube (`--remote-debugging-pipe`) — ni port ouvert, ni réseau. Il vient du registre npm, et de
// lui seul : `@sparticuz/chromium` livre un Chromium pour Linux x64 et les bibliothèques qu'il
// demande (nss, nspr…), qu'une box nue n'a pas. Ses fichiers sont compressés : ils sont décompressés
// une fois, dans node_modules/.cache, et resservent ensuite. `BRIGADE_CAPTURE_CHROME` désigne un
// autre Chrome — celui d'un Mac : la capture marche, mais ses pixels ne sont pas ceux de la box.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

export type Lance = { executable: string; env: Record<string, string>; arguments: string[] };

const PAQUET = "@sparticuz/chromium";

// Où le Chromium du paquet est décompressé, et ce qu'il lui faut pour démarrer. Rien n'est
// redécompressé tant que la version du paquet ne change pas.
function chromiumDuPaquet(): Lance {
  let entree: string;
  try {
    entree = fileURLToPath(import.meta.resolve(PAQUET));
  } catch {
    throw new Error(`${PAQUET} n'est pas installé : npm ci --prefix scripts/capture-ecran (ou BRIGADE_CAPTURE_CHROME=<un Chrome>)`);
  }
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error(`${PAQUET} ne livre qu'un Chromium pour Linux x64 — ici ${process.platform}/${process.arch} : BRIGADE_CAPTURE_CHROME=<le chemin de ton Chrome>`);
  const racine = join(dirname(entree), "..");
  const { version } = JSON.parse(readFileSync(join(racine, "package.json"), "utf8")) as { version: string };
  const cache = join(racine, "..", "..", ".cache", "capture-ecran", `chromium-${version}`);
  if (!existsSync(join(cache, "chromium"))) decompresser(join(racine, "bin"), cache);
  return {
    executable: join(cache, "chromium"),
    env: { LD_LIBRARY_PATH: join(cache, "lib") },
    // Le Chromium du paquet est un « headless shell » : sans bac à sable (il n'a pas son aide
    // setuid), sans zygote, et il peint par SwiftShader, posé à côté de lui.
    arguments: ["--headless=shell", "--no-sandbox", "--no-zygote", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  };
}

// Décompressé à côté, puis renommé d'un coup : deux captures lancées de front n'en voient jamais
// un à moitié posé.
function decompresser(bin: string, cache: string): void {
  mkdirSync(dirname(cache), { recursive: true });
  const enCours = mkdtempSync(`${cache}.`);
  try {
    writeFileSync(join(enCours, "chromium"), brotliDecompressSync(readFileSync(join(bin, "chromium.br"))), { mode: 0o755 });
    // Les bibliothèques (lib/), les polices de repli (fonts/), et SwiftShader, à la racine.
    for (const archive of ["al2023", "fonts", "swiftshader"]) {
      execFileSync("tar", ["-x", "-f", "-", "-C", enCours], { input: brotliDecompressSync(readFileSync(join(bin, `${archive}.tar.br`))) });
    }
    renameSync(enCours, cache);
  } catch (erreur) {
    rmSync(enCours, { recursive: true, force: true });
    if (existsSync(join(cache, "chromium"))) return;
    throw erreur;
  }
}

export function navigateur(env: NodeJS.ProcessEnv = process.env): Lance {
  const autre = env.BRIGADE_CAPTURE_CHROME;
  if (autre !== undefined && autre !== "") return { executable: autre, env: {}, arguments: ["--headless"] };
  return chromiumDuPaquet();
}

// Les polices de repli : celles du paquet quand il y en a, aucune de la machine — un caractère
// que les polices de l'app n'ont pas se dessine pareil partout. Leur cache vit avec le profil.
function polices(lance: Lance, profil: string): Record<string, string> {
  const dossier = join(dirname(lance.executable), "fonts");
  if (!existsSync(dossier)) return {};
  const fichier = join(profil, "polices.conf");
  writeFileSync(fichier, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${dossier}</dir>\n  <cachedir>${join(profil, "polices-cache")}</cachedir>\n</fontconfig>\n`);
  return { FONTCONFIG_FILE: fichier };
}

type Message = { id?: number; method?: string; params?: Record<string, unknown>; sessionId?: string; result?: Record<string, unknown>; error?: { message: string } };
export type Evenement = { methode: string; params: Record<string, unknown>; session: string | undefined };

export type Pilote = {
  envoyer(methode: string, params?: Record<string, unknown>, session?: string): Promise<Record<string, unknown>>;
  surEvenement(ecouter: (evenement: Evenement) => void): void;
  // Rejetée quand le navigateur s'arrête, avec ce qu'il a dit en dernier.
  arrete: Promise<never>;
  fermer(): Promise<void>;
};

// Le navigateur lancé, et le tube qui le pilote : chaque message est un JSON fini par un octet nul.
export function lancer(lance: Lance, { largeur, hauteur }: { largeur: number; hauteur: number }): Pilote {
  const profil = mkdtempSync(join(tmpdir(), "capture-ecran-"));
  const enfant: ChildProcess = spawn(
    lance.executable,
    [
      ...lance.arguments,
      "--remote-debugging-pipe",
      `--user-data-dir=${profil}`,
      `--window-size=${largeur},${hauteur}`,
      // Rien ne sort : aucun proxy, aucun nom ne se résout, aucun service de fond.
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-pings",
      "--mute-audio",
      // Les mêmes pixels d'une fois à l'autre.
      "--hide-scrollbars",
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
      "--force-device-scale-factor=1",
      "--lang=en-US",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], env: { ...process.env, ...lance.env, ...polices(lance, profil), TZ: "UTC" } },
  );
  const versLui = enfant.stdio[3] as Writable;
  const deLui = enfant.stdio[4] as Readable;
  let erreurs = "";
  enfant.stderr?.on("data", (morceau: Buffer) => void (erreurs = (erreurs + morceau.toString()).slice(-4000)));
  const attendus = new Map<number, { tenir: (resultat: Record<string, unknown>) => void; lacher: (erreur: Error) => void; methode: string }>();
  const ecoutes: ((evenement: Evenement) => void)[] = [];
  let numero = 0;
  let mort: Error | undefined;
  let tampon = Buffer.alloc(0);
  deLui.on("data", (morceau: Buffer) => {
    tampon = Buffer.concat([tampon, morceau]);
    for (let fin = tampon.indexOf(0); fin !== -1; fin = tampon.indexOf(0)) {
      const message = JSON.parse(tampon.subarray(0, fin).toString("utf8")) as Message;
      tampon = tampon.subarray(fin + 1);
      if (message.id !== undefined) {
        const attendu = attendus.get(message.id);
        attendus.delete(message.id);
        if (message.error !== undefined) attendu?.lacher(new Error(`${attendu.methode} : ${message.error.message}`));
        else attendu?.tenir(message.result ?? {});
      } else if (message.method !== undefined) {
        for (const ecouter of ecoutes) ecouter({ methode: message.method, params: message.params ?? {}, session: message.sessionId });
      }
    }
  });
  const fini = new Promise<void>((resoudre) =>
    enfant.on("exit", (code, signal) => {
      mort = new Error(`le navigateur s'est arrêté (${signal ?? `code ${code}`}) :\n${erreurs.trim()}`);
      for (const { lacher } of attendus.values()) lacher(mort);
      attendus.clear();
      rmSync(profil, { recursive: true, force: true });
      resoudre();
    }),
  );
  const arrete = fini.then((): never => {
    throw mort;
  });
  arrete.catch(() => undefined);
  enfant.on("error", (erreur) => {
    mort = new Error(`le navigateur ne s'est pas lancé (${lance.executable}) : ${erreur.message}`);
    for (const { lacher } of attendus.values()) lacher(mort);
    attendus.clear();
  });
  return {
    envoyer(methode, params = {}, session) {
      if (mort !== undefined) return Promise.reject(mort);
      const id = ++numero;
      return new Promise((tenir, lacher) => {
        attendus.set(id, { tenir, lacher, methode });
        versLui.write(`${JSON.stringify({ id, method: methode, params, ...(session === undefined ? {} : { sessionId: session }) })}\0`);
      });
    },
    surEvenement(ecouter) {
      ecoutes.push(ecouter);
    },
    arrete,
    async fermer() {
      if (mort === undefined) {
        // Poliment d'abord, puis pour de bon s'il traîne.
        const garde = setTimeout(() => enfant.kill("SIGKILL"), 5_000);
        await this.envoyer("Browser.close").catch(() => undefined);
        await fini;
        clearTimeout(garde);
      }
      await fini;
    },
  };
}
