// L'app installée se tient à jour d'elle-même, sur les versions que publie le workflow publier-app
// (flux.ts) : le chef ne télécharge rien.
//
// Au lancement, puis tous les quarts d'heure (#2431) — et quand la vue le demande —, elle regarde si une
// version plus haute que la sienne est publiée. S'il y en a une, elle l'annonce (`disponible`, avec
// son numéro) et la télécharge aussitôt, vérifiée contre la taille et le sha512 publiés
// (`telechargement`, puis `prete`). Ensuite, deux chemins : le chef dit « installer maintenant » —
// elle se ferme, l'installeur la remplace et la rouvre (installation.ts) —, ou il ne dit rien, et la
// version téléchargée s'installe à son lancement suivant, avant que rien n'y démarre. Tout cela est
// le même sur un Mac et sous Windows : seuls l'installeur téléchargé (le .dmg, ou le setup .exe) et
// ce qui le joue (installation.ts, windows.ts) sont du poste.
//
// Lancée depuis le dépôt (`npm --prefix app start`), elle ne regarde rien : elle se met à jour par
// son clone (catch-up.ts). Un flux qui ne répond pas ne retient jamais l'app : rien ici n'est
// attendu pour s'ouvrir, et l'échec se dit (`erreur`) jusqu'à la vérification suivante.
//
// Ce qui est téléchargé vit dans `dossier` : l'installeur, puis `prete.json` quand il est vérifié. Ce
// que l'installeur n'a pas pu faire, il l'écrit dans `echec.txt`, que l'app rouverte dit.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { compareVersions, isOneVersion, type Flux, type Published } from "./flux.ts";

// Ce que la vue reçoit de la mise à jour de l'app. `version` : celle qui tourne ; `nouvelle` : celle
// qui est publiée au-dessus.
// - `inactive` : l'app ne se met pas à jour par là (lancée depuis le dépôt), `raison` dit pourquoi ;
// - `verification` : elle lit le flux ;
// - `a-jour` : rien de plus haut n'est publié, à l'heure de `verifieeLe` (ISO 8601) ;
// - `disponible` : une version plus haute est publiée — son téléchargement va partir ;
// - `telechargement` : elle se télécharge, `recus` octets sur `taille` ;
// - `prete` : téléchargée et vérifiée, elle attend « installer maintenant », ou le lancement suivant ;
// - `installation` : l'installeur est lancé, l'app se ferme ;
// - `erreur` : le flux, le téléchargement ou l'installation a échoué — `raison` en une ligne, et
//   `nouvelle` quand une version plus haute était connue. La vérification suivante réessaie.
export type StateOfUpdate =
  | { etat: "inactive"; version: string; raison: string }
  | { etat: "verification"; version: string }
  | { etat: "a-jour"; version: string; verifieeLe: string }
  | { etat: "disponible"; version: string; nouvelle: string }
  | { etat: "telechargement"; version: string; nouvelle: string; recus: number; taille: number }
  | { etat: "prete"; version: string; nouvelle: string }
  | { etat: "installation"; version: string; nouvelle: string }
  | { etat: "erreur"; version: string; raison: string; nouvelle?: string };

// Une version téléchargée et vérifiée, telle que `prete.json` la garde : son numéro, et le chemin de
// son installeur — le .dmg sur un Mac, le setup .exe sous Windows.
export type Ready = { version: string; installeur: string };

export const READY = "prete.json";
export const FAILURE = "echec.txt";

// Pose l'installeur d'une version dans `fichier` : appelle `progres` à chaque morceau reçu, et rejette si
// rien ne se télécharge. La vérification de taille et d'empreinte se fait après, sur le fichier.
export type Download = (published: Published, file: string, progress: (receivedOnes: number) => void, signal: AbortSignal) => Promise<void>;

export type OptionsUpdate = {
  // La version de l'app qui tourne.
  version: string;
  // Pourquoi l'app ne se met pas à jour par là — rien quand elle le fait (l'app installée).
  inactive?: string;
  flux: Flux;
  dossier: string;
  // Pourquoi l'app ne pourrait pas se remplacer (installation.ts) — rien quand elle le peut.
  installable(): string | undefined;
  // Lance l'installeur de cette version, qui attend que l'app soit fermée ; lève s'il ne part pas.
  installer(ready: Ready): void;
  // Ferme l'app, après « installer maintenant ».
  quitter(): void;
  surEtat(state: StateOfUpdate): void;
  telecharger?: Download;
  cadenceMs?: number;
  maintenant?: () => Date;
  // Combien de temps le flux a pour répondre, et un téléchargement pour reprendre après un silence.
  delaiFluxMs?: number;
  silenceMs?: number;
};

export type Update = {
  vu(): StateOfUpdate;
  // Au lancement, avant que rien ne démarre : une version téléchargée et vérifiée lors d'une session
  // précédente est installée — l'installeur est lancé, et l'app doit se fermer sans s'ouvrir (vrai).
  // Faux : l'app s'ouvre ; ce que l'installeur précédent n'a pas pu faire est dans l'état.
  auLancement(): boolean;
  // La première vérification, puis une toutes les `cadenceMs`.
  demarrer(): void;
  verifier(): Promise<StateOfUpdate>;
  // « Installer maintenant » : télécharge si ce n'est pas fait, lance l'installeur et ferme l'app —
  // rien n'est rendu — ou dit pourquoi elle reste sur sa version.
  installerMaintenant(): Promise<{ refus: string } | undefined>;
  fermer(): void;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Le téléchargement par `fetch`, en flux : rien n'est gardé en mémoire. Un silence de `silenceMs`
// l'arrête.
export function downloadByFetch(silenceMs: number): Download {
  return async (published, file, progress, signal) => {
    const silence = new AbortController();
    let guard = setTimeout(() => silence.abort(new Error(`nothing received for ${Math.round(silenceMs / 1000)} s`)), silenceMs);
    const relaunch = () => {
      clearTimeout(guard);
      guard = setTimeout(() => silence.abort(new Error(`nothing received for ${Math.round(silenceMs / 1000)} s`)), silenceMs);
    };
    try {
      const answer = await fetch(published.url, { headers: { "user-agent": "brigade-app" }, signal: AbortSignal.any([signal, silence.signal]) });
      if (!answer.ok || answer.body === null) throw new Error(`the server answered ${answer.status}`);
      const output = createWriteStream(file);
      const finished = new Promise<void>((resolve, rejeter) => {
        output.once("finish", resolve);
        output.once("error", rejeter);
      });
      let receivedOnes = 0;
      try {
        for await (const piece of answer.body as AsyncIterable<Uint8Array>) {
          relaunch();
          if (!output.write(piece)) await new Promise((resolve) => output.once("drain", resolve));
          receivedOnes += piece.byteLength;
          progress(receivedOnes);
        }
      } finally {
        output.end();
      }
      await finished;
    } catch (error) {
      throw silence.signal.aborted ? silence.signal.reason : error;
    } finally {
      clearTimeout(guard);
    }
  };
}

// Le sha512 d'un fichier, en base64, lu par morceaux.
async function fingerprint(file: string): Promise<string> {
  const hash = createHash("sha512");
  for await (const piece of createReadStream(file)) hash.update(piece as Buffer);
  return hash.digest("base64");
}

export function holdUpdate(options: OptionsUpdate): Update {
  const { version, dossier: folder } = options;
  const cadenceMs = options.cadenceMs ?? 15 * 60_000;
  const now = options.maintenant ?? (() => new Date());
  const fetchDownload = options.telecharger ?? downloadByFetch(options.silenceMs ?? 60_000);
  const delayFluxMs = options.delaiFluxMs ?? 60_000;
  const ready = join(folder, READY);
  const failure = join(folder, FAILURE);

  let state: StateOfUpdate = options.inactive !== undefined ? { etat: "inactive", version, raison: options.inactive } : { etat: "verification", version };
  let verification: Promise<StateOfUpdate> | undefined;
  let download: Promise<void> | undefined;
  let installation: Promise<{ refus: string } | undefined> | undefined;
  let timer: NodeJS.Timeout | undefined;
  // L'installeur précédent a échoué : la première vérification attend la cadence, pour que l'échec
  // reste dit — la vue peut la demander plus tôt.
  let failsAtLaunch = false;
  const stop = new AbortController();

  const set = (nouvel: StateOfUpdate) => {
    state = nouvel;
    options.surEtat(nouvel);
  };

  // Ce qu'a laissé une session précédente : la version prête, si elle tient encore.
  const readReady = (): Ready | undefined => {
    try {
      const readEntry = JSON.parse(readFileSync(ready, "utf8")) as Partial<Ready>;
      if (typeof readEntry.version !== "string" || !isOneVersion(readEntry.version) || typeof readEntry.installeur !== "string" || basename(readEntry.installeur) !== readEntry.installeur) return undefined;
      const installer = join(folder, readEntry.installeur);
      return existsSync(installer) ? { version: readEntry.version, installeur: installer } : undefined;
    } catch {
      return undefined;
    }
  };
  // Tout ce que le dossier porte, sauf ce qu'on garde.
  const empty = (except: string[] = []) => {
    if (!existsSync(folder)) return;
    for (const name of readdirSync(folder)) if (!except.includes(name)) rmSync(join(folder, name), { recursive: true, force: true });
  };

  const launchInstallation = (readEntry: Ready): string | undefined => {
    set({ etat: "installation", version, nouvelle: readEntry.version });
    // L'installeur part une fois : relancée, l'app ne le relance pas, quoi qu'il arrive.
    rmSync(ready, { force: true });
    try {
      options.installer(readEntry);
      return undefined;
    } catch (error) {
      const reason = `the update ${readEntry.version} could not be installed: ${message(error)}`;
      rmSync(readEntry.installeur, { force: true });
      set({ etat: "erreur", version, nouvelle: readEntry.version, raison: reason });
      return reason;
    }
  };

  // Une seule chose de chaque sorte à la fois : un second appel pendant la première est la même.
  // Elle se libère après coup (`finally`), même quand elle finit sans rien attendre.
  const downloadThe = (published: Published) =>
    (download ??= (async () => {
      const file = join(folder, published.nom);
      const partial = `${file}.partiel`;
      let announcement = -1;
      set({ etat: "telechargement", version, nouvelle: published.version, recus: 0, taille: published.taille });
      try {
        mkdirSync(folder, { recursive: true });
        empty();
        await fetchDownload(
          published,
          partial,
          (receivedOnes) => {
            // Un état par pour-cent gagné : la vue n'a pas à recevoir chaque morceau.
            const percent = Math.floor((receivedOnes * 100) / published.taille);
            if (percent === announcement) return;
            announcement = percent;
            set({ etat: "telechargement", version, nouvelle: published.version, recus: receivedOnes, taille: published.taille });
          },
          stop.signal,
        );
        const size = statSync(partial).size;
        if (size !== published.taille) throw new Error(`${size} bytes received, ${published.taille} published`);
        if ((await fingerprint(partial)) !== published.sha512) throw new Error("its sha512 is not the published one");
        renameSync(partial, file);
        writeFileSync(ready, `${JSON.stringify({ version: published.version, installeur: published.nom })}\n`);
        set({ etat: "prete", version, nouvelle: published.version });
      } catch (error) {
        rmSync(partial, { force: true });
        if (stop.signal.aborted) return;
        set({ etat: "erreur", version, nouvelle: published.version, raison: `the update ${published.version} could not be downloaded: ${message(error)}` });
      }
    })().finally(() => {
      download = undefined;
    }));

  const check = (): Promise<StateOfUpdate> => {
    // Depuis le dépôt, rien ne se lit ; téléchargée, ou en route, la version ne se relit pas.
    if (state.etat === "inactive" || state.etat === "telechargement" || state.etat === "prete" || state.etat === "installation") return Promise.resolve(state);
    return (verification ??= (async () => {
      set({ etat: "verification", version });
      try {
        const published = await options.flux.nouvelle(version, AbortSignal.any([stop.signal, AbortSignal.timeout(delayFluxMs)]));
        if (stop.signal.aborted) return state;
        if (published === undefined) {
          set({ etat: "a-jour", version, verifieeLe: now().toISOString() });
          return state;
        }
        set({ etat: "disponible", version, nouvelle: published.version });
        const prevents = options.installable();
        if (prevents !== undefined) {
          set({ etat: "erreur", version, nouvelle: published.version, raison: `the update ${published.version} cannot be installed: ${prevents}` });
          return state;
        }
        void downloadThe(published);
        return state;
      } catch (error) {
        if (!stop.signal.aborted) set({ etat: "erreur", version, raison: `the update feed (${options.flux.nom}) could not be read: ${message(error)}` });
        return state;
      }
    })().finally(() => {
      verification = undefined;
    }));
  };

  return {
    vu: () => state,
    auLancement() {
      if (state.etat === "inactive") return false;
      // L'installeur précédent a échoué : l'app rouverte le dit, et repart propre.
      let fails: string | undefined;
      try {
        fails = readFileSync(failure, "utf8").trim().split("\n")[0];
      } catch {
        fails = undefined;
      }
      if (fails !== undefined) {
        empty();
        failsAtLaunch = true;
        set({ etat: "erreur", version, raison: `the last update could not be installed: ${fails || "the installer gave no reason"}` });
        return false;
      }
      const readEntry = readReady();
      if (readEntry === undefined || compareVersions(readEntry.version, version) <= 0) {
        // Rien de prêt, ou une version déjà là : ce qui traîne ne sert plus.
        empty();
        return false;
      }
      return launchInstallation(readEntry) === undefined;
    },
    demarrer() {
      if (state.etat === "inactive" || timer !== undefined) return;
      if (!failsAtLaunch) void check();
      timer = setInterval(() => void check(), cadenceMs);
      timer.unref?.();
    },
    verifier: check,
    installerMaintenant() {
      if (state.etat === "inactive") return Promise.resolve({ refus: `this app does not update itself here: ${state.raison}` });
      return (installation ??= (async (): Promise<{ refus: string } | undefined> => {
        if (state.etat !== "prete" && download === undefined) await check();
        if (download !== undefined) await download;
        const readEntry = readReady();
        if (state.etat !== "prete" || readEntry === undefined) {
          const seenOne = state;
          if (seenOne.etat === "a-jour") return { refus: `this app is up to date (${version}): nothing to install` };
          if (seenOne.etat === "erreur") return { refus: seenOne.raison };
          return { refus: "the update is not ready to install" };
        }
        const reason = launchInstallation(readEntry);
        if (reason !== undefined) return { refus: reason };
        options.quitter();
        return undefined;
      })().finally(() => {
        installation = undefined;
      }));
    },
    fermer() {
      clearInterval(timer);
      stop.abort();
    },
  };
}
