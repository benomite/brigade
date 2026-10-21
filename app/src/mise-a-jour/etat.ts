// L'app installée se tient à jour d'elle-même, sur les versions que publie le workflow publier-app
// (flux.ts) : le chef ne télécharge rien.
//
// Au lancement, puis toutes les six heures — et quand la vue le demande —, elle regarde si une
// version plus haute que la sienne est publiée. S'il y en a une, elle l'annonce (`disponible`, avec
// son numéro) et la télécharge aussitôt, vérifiée contre la taille et le sha512 publiés
// (`telechargement`, puis `prete`). Ensuite, deux chemins : le chef dit « installer maintenant » —
// elle se ferme, l'installeur la remplace et la rouvre (installation.ts) —, ou il ne dit rien, et la
// version téléchargée s'installe à son lancement suivant, avant que rien n'y démarre. Tout cela est
// le même sur un Mac et sous Windows : seuls l'installeur téléchargé (le .dmg, ou le setup .exe) et
// ce qui le joue (installation.ts, windows.ts) sont du poste.
//
// Lancée depuis le dépôt (`npm --prefix app start`), elle ne regarde rien : elle se met à jour par
// son clone (rattrapage.ts). Un flux qui ne répond pas ne retient jamais l'app : rien ici n'est
// attendu pour s'ouvrir, et l'échec se dit (`erreur`) jusqu'à la vérification suivante.
//
// Ce qui est téléchargé vit dans `dossier` : l'installeur, puis `prete.json` quand il est vérifié. Ce
// que l'installeur n'a pas pu faire, il l'écrit dans `echec.txt`, que l'app rouverte dit.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { comparerVersions, estUneVersion, type Flux, type Publiee } from "./flux.ts";

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
export type EtatDeMiseAJour =
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
export type Prete = { version: string; installeur: string };

export const PRETE = "prete.json";
export const ECHEC = "echec.txt";

// Pose l'installeur d'une version dans `fichier` : appelle `progres` à chaque morceau reçu, et rejette si
// rien ne se télécharge. La vérification de taille et d'empreinte se fait après, sur le fichier.
export type Telecharger = (publiee: Publiee, fichier: string, progres: (recus: number) => void, signal: AbortSignal) => Promise<void>;

export type OptionsMiseAJour = {
  // La version de l'app qui tourne.
  version: string;
  // Pourquoi l'app ne se met pas à jour par là — rien quand elle le fait (l'app installée).
  inactive?: string;
  flux: Flux;
  dossier: string;
  // Pourquoi l'app ne pourrait pas se remplacer (installation.ts) — rien quand elle le peut.
  installable(): string | undefined;
  // Lance l'installeur de cette version, qui attend que l'app soit fermée ; lève s'il ne part pas.
  installer(prete: Prete): void;
  // Ferme l'app, après « installer maintenant ».
  quitter(): void;
  surEtat(etat: EtatDeMiseAJour): void;
  telecharger?: Telecharger;
  cadenceMs?: number;
  maintenant?: () => Date;
  // Combien de temps le flux a pour répondre, et un téléchargement pour reprendre après un silence.
  delaiFluxMs?: number;
  silenceMs?: number;
};

export type MiseAJour = {
  vu(): EtatDeMiseAJour;
  // Au lancement, avant que rien ne démarre : une version téléchargée et vérifiée lors d'une session
  // précédente est installée — l'installeur est lancé, et l'app doit se fermer sans s'ouvrir (vrai).
  // Faux : l'app s'ouvre ; ce que l'installeur précédent n'a pas pu faire est dans l'état.
  auLancement(): boolean;
  // La première vérification, puis une toutes les `cadenceMs`.
  demarrer(): void;
  verifier(): Promise<EtatDeMiseAJour>;
  // « Installer maintenant » : télécharge si ce n'est pas fait, lance l'installeur et ferme l'app —
  // rien n'est rendu — ou dit pourquoi elle reste sur sa version.
  installerMaintenant(): Promise<{ refus: string } | undefined>;
  fermer(): void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le téléchargement par `fetch`, en flux : rien n'est gardé en mémoire. Un silence de `silenceMs`
// l'arrête.
export function telechargerParFetch(silenceMs: number): Telecharger {
  return async (publiee, fichier, progres, signal) => {
    const silence = new AbortController();
    let garde = setTimeout(() => silence.abort(new Error(`nothing received for ${Math.round(silenceMs / 1000)} s`)), silenceMs);
    const relancer = () => {
      clearTimeout(garde);
      garde = setTimeout(() => silence.abort(new Error(`nothing received for ${Math.round(silenceMs / 1000)} s`)), silenceMs);
    };
    try {
      const reponse = await fetch(publiee.url, { headers: { "user-agent": "brigade-app" }, signal: AbortSignal.any([signal, silence.signal]) });
      if (!reponse.ok || reponse.body === null) throw new Error(`the server answered ${reponse.status}`);
      const sortie = createWriteStream(fichier);
      const fini = new Promise<void>((resoudre, rejeter) => {
        sortie.once("finish", resoudre);
        sortie.once("error", rejeter);
      });
      let recus = 0;
      try {
        for await (const morceau of reponse.body as AsyncIterable<Uint8Array>) {
          relancer();
          if (!sortie.write(morceau)) await new Promise((resoudre) => sortie.once("drain", resoudre));
          recus += morceau.byteLength;
          progres(recus);
        }
      } finally {
        sortie.end();
      }
      await fini;
    } catch (erreur) {
      throw silence.signal.aborted ? silence.signal.reason : erreur;
    } finally {
      clearTimeout(garde);
    }
  };
}

// Le sha512 d'un fichier, en base64, lu par morceaux.
async function empreinte(fichier: string): Promise<string> {
  const hache = createHash("sha512");
  for await (const morceau of createReadStream(fichier)) hache.update(morceau as Buffer);
  return hache.digest("base64");
}

export function tenirMiseAJour(options: OptionsMiseAJour): MiseAJour {
  const { version, dossier } = options;
  const cadenceMs = options.cadenceMs ?? 6 * 3_600_000;
  const maintenant = options.maintenant ?? (() => new Date());
  const telecharger = options.telecharger ?? telechargerParFetch(options.silenceMs ?? 60_000);
  const delaiFluxMs = options.delaiFluxMs ?? 60_000;
  const prete = join(dossier, PRETE);
  const echec = join(dossier, ECHEC);

  let etat: EtatDeMiseAJour = options.inactive !== undefined ? { etat: "inactive", version, raison: options.inactive } : { etat: "verification", version };
  let verification: Promise<EtatDeMiseAJour> | undefined;
  let telechargement: Promise<void> | undefined;
  let installation: Promise<{ refus: string } | undefined> | undefined;
  let minuteur: NodeJS.Timeout | undefined;
  // L'installeur précédent a échoué : la première vérification attend la cadence, pour que l'échec
  // reste dit — la vue peut la demander plus tôt.
  let echoueAuLancement = false;
  const arret = new AbortController();

  const poser = (nouvel: EtatDeMiseAJour) => {
    etat = nouvel;
    options.surEtat(nouvel);
  };

  // Ce qu'a laissé une session précédente : la version prête, si elle tient encore.
  const lirePrete = (): Prete | undefined => {
    try {
      const lue = JSON.parse(readFileSync(prete, "utf8")) as Partial<Prete>;
      if (typeof lue.version !== "string" || !estUneVersion(lue.version) || typeof lue.installeur !== "string" || basename(lue.installeur) !== lue.installeur) return undefined;
      const installeur = join(dossier, lue.installeur);
      return existsSync(installeur) ? { version: lue.version, installeur } : undefined;
    } catch {
      return undefined;
    }
  };
  // Tout ce que le dossier porte, sauf ce qu'on garde.
  const vider = (sauf: string[] = []) => {
    if (!existsSync(dossier)) return;
    for (const nom of readdirSync(dossier)) if (!sauf.includes(nom)) rmSync(join(dossier, nom), { recursive: true, force: true });
  };

  const lancerInstallation = (lue: Prete): string | undefined => {
    poser({ etat: "installation", version, nouvelle: lue.version });
    // L'installeur part une fois : relancée, l'app ne le relance pas, quoi qu'il arrive.
    rmSync(prete, { force: true });
    try {
      options.installer(lue);
      return undefined;
    } catch (erreur) {
      const raison = `the update ${lue.version} could not be installed: ${message(erreur)}`;
      rmSync(lue.installeur, { force: true });
      poser({ etat: "erreur", version, nouvelle: lue.version, raison });
      return raison;
    }
  };

  // Une seule chose de chaque sorte à la fois : un second appel pendant la première est la même.
  // Elle se libère après coup (`finally`), même quand elle finit sans rien attendre.
  const telechargerLa = (publiee: Publiee) =>
    (telechargement ??= (async () => {
      const fichier = join(dossier, publiee.nom);
      const partiel = `${fichier}.partiel`;
      let annonce = -1;
      poser({ etat: "telechargement", version, nouvelle: publiee.version, recus: 0, taille: publiee.taille });
      try {
        mkdirSync(dossier, { recursive: true });
        vider();
        await telecharger(
          publiee,
          partiel,
          (recus) => {
            // Un état par pour-cent gagné : la vue n'a pas à recevoir chaque morceau.
            const pourcent = Math.floor((recus * 100) / publiee.taille);
            if (pourcent === annonce) return;
            annonce = pourcent;
            poser({ etat: "telechargement", version, nouvelle: publiee.version, recus, taille: publiee.taille });
          },
          arret.signal,
        );
        const taille = statSync(partiel).size;
        if (taille !== publiee.taille) throw new Error(`${taille} bytes received, ${publiee.taille} published`);
        if ((await empreinte(partiel)) !== publiee.sha512) throw new Error("its sha512 is not the published one");
        renameSync(partiel, fichier);
        writeFileSync(prete, `${JSON.stringify({ version: publiee.version, installeur: publiee.nom })}\n`);
        poser({ etat: "prete", version, nouvelle: publiee.version });
      } catch (erreur) {
        rmSync(partiel, { force: true });
        if (arret.signal.aborted) return;
        poser({ etat: "erreur", version, nouvelle: publiee.version, raison: `the update ${publiee.version} could not be downloaded: ${message(erreur)}` });
      }
    })().finally(() => {
      telechargement = undefined;
    }));

  const verifier = (): Promise<EtatDeMiseAJour> => {
    // Depuis le dépôt, rien ne se lit ; téléchargée, ou en route, la version ne se relit pas.
    if (etat.etat === "inactive" || etat.etat === "telechargement" || etat.etat === "prete" || etat.etat === "installation") return Promise.resolve(etat);
    return (verification ??= (async () => {
      poser({ etat: "verification", version });
      try {
        const publiee = await options.flux.nouvelle(version, AbortSignal.any([arret.signal, AbortSignal.timeout(delaiFluxMs)]));
        if (arret.signal.aborted) return etat;
        if (publiee === undefined) {
          poser({ etat: "a-jour", version, verifieeLe: maintenant().toISOString() });
          return etat;
        }
        poser({ etat: "disponible", version, nouvelle: publiee.version });
        const empeche = options.installable();
        if (empeche !== undefined) {
          poser({ etat: "erreur", version, nouvelle: publiee.version, raison: `the update ${publiee.version} cannot be installed: ${empeche}` });
          return etat;
        }
        void telechargerLa(publiee);
        return etat;
      } catch (erreur) {
        if (!arret.signal.aborted) poser({ etat: "erreur", version, raison: `the update feed (${options.flux.nom}) could not be read: ${message(erreur)}` });
        return etat;
      }
    })().finally(() => {
      verification = undefined;
    }));
  };

  return {
    vu: () => etat,
    auLancement() {
      if (etat.etat === "inactive") return false;
      // L'installeur précédent a échoué : l'app rouverte le dit, et repart propre.
      let echoue: string | undefined;
      try {
        echoue = readFileSync(echec, "utf8").trim().split("\n")[0];
      } catch {
        echoue = undefined;
      }
      if (echoue !== undefined) {
        vider();
        echoueAuLancement = true;
        poser({ etat: "erreur", version, raison: `the last update could not be installed: ${echoue || "the installer gave no reason"}` });
        return false;
      }
      const lue = lirePrete();
      if (lue === undefined || comparerVersions(lue.version, version) <= 0) {
        // Rien de prêt, ou une version déjà là : ce qui traîne ne sert plus.
        vider();
        return false;
      }
      return lancerInstallation(lue) === undefined;
    },
    demarrer() {
      if (etat.etat === "inactive" || minuteur !== undefined) return;
      if (!echoueAuLancement) void verifier();
      minuteur = setInterval(() => void verifier(), cadenceMs);
      minuteur.unref?.();
    },
    verifier,
    installerMaintenant() {
      if (etat.etat === "inactive") return Promise.resolve({ refus: `this app does not update itself here: ${etat.raison}` });
      return (installation ??= (async (): Promise<{ refus: string } | undefined> => {
        if (etat.etat !== "prete" && telechargement === undefined) await verifier();
        if (telechargement !== undefined) await telechargement;
        const lue = lirePrete();
        if (etat.etat !== "prete" || lue === undefined) {
          const vu = etat;
          if (vu.etat === "a-jour") return { refus: `this app is up to date (${version}): nothing to install` };
          if (vu.etat === "erreur") return { refus: vu.raison };
          return { refus: "the update is not ready to install" };
        }
        const raison = lancerInstallation(lue);
        if (raison !== undefined) return { refus: raison };
        options.quitter();
        return undefined;
      })().finally(() => {
        installation = undefined;
      }));
    },
    fermer() {
      clearInterval(minuteur);
      arret.abort();
    },
  };
}
