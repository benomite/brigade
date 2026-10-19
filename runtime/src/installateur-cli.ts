// Le geste d'installation de la box, lancé par `runtime/deploy/brigade-installer`
// — jamais par `npm run`, ni par le geste `brigade` : il tourne en root, par sa
// propre règle sudoers.
//   sudo brigade-installer install <projet> --depot <propriétaire>/<nom> --sauvegardes <chemin>
//        --manager-modele <modèle> --manager-effort <effort> --reviewer-modele <modèle> --reviewer-effort <effort>
//        [--branche <branche d'intégration>]
//   sudo brigade-installer uninstall <projet> --plan [--supprimer-le-journal]
//   sudo brigade-installer uninstall <projet> --confirmer <projet> [--supprimer-le-journal]
// Il rend un objet JSON, sur une ligne de sa sortie standard — pour l'app —, et
// ce qu'il a à dire à un humain sur sa sortie d'erreur — le plan d'une
// désinstallation compris. Chaque appel, accepté ou refusé, s'écrit à son
// journal avant qu'il ne réponde : qui (le compte que `sudo` nomme), quand,
// quel projet, quoi, et ce qu'il en est advenu. Sans journal où l'écrire, il
// ne fait rien.
//
// Rien ne se règle par son environnement ni par ses arguments : la box est
// écrite ici, et `SUDO_USER` est la seule variable qu'il lit.
import { lstatSync, mkdirSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import type { FaitInstallateur } from "./events/installer.ts";
import { desinstaller, direDesinstallation, Inachevee, lireRetrait, type Retrait } from "./desinstallateur.ts";
import { ACTIONS, appelBorne, CODES, Echec, installer, lireAppel, lireDemande, PATH_DE_SYSTEMD, portLibre, projetDesigne, Refus, type Action, type Box, type Demande } from "./installateur.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { prendreVerrou, VerrouTenu, type Verrou } from "./verrou.ts";

export const BOX: Box = {
  racine: 0,
  sol: "/",
  unites: "/etc/systemd/system",
  etats: "/var/lib/brigade",
  config: "/etc/brigade-installer.conf",
  // Hors de /var/lib/brigade : le compte du service, et ses cooks, n'y ont rien.
  journal: "/var/lib/brigade-installer",
  deploiement: join(import.meta.dirname, "../deploy"),
  // À côté du clone de brigade, comme la bascule le compose.
  versions: `${join(import.meta.dirname, "../..")}-versions`,
  systemctl: "systemctl",
  getent: "getent",
  git: "git",
  origine: (depot) => `https://github.com/${depot}.git`,
  environnement: (compte) => ({ PATH: PATH_DE_SYSTEMD, HOME: compte.home, USER: compte.nom, LOGNAME: compte.nom }),
  portLibre,
};

// Le projet d'un appel qui n'en désigne aucun dans le motif.
const HORS_PROJET = "-";
// Ce qui retient une désinstallation nomme chaque fichier jamais poussé : au
// journal, la liste est coupée.
const LONGUEUR_DU_MOTIF = 2000;

// Qui lance : le compte que `sudo` nomme. Sans lui — root, directement —, le
// compte du process.
function appelant(env: Appel["env"]): string {
  const nomme = env.SUDO_USER;
  return nomme !== undefined && /^[A-Za-z0-9_][A-Za-z0-9_.@-]{0,63}\$?$/.test(nomme) ? nomme : userInfo().username;
}

export async function principal({ args, env, dire, redire }: Appel, box: Box = BOX, signal?: AbortSignal): Promise<void> {
  const projet = projetDesigne(args);
  const action = (ACTIONS as readonly string[]).includes(args[0] ?? "") ? (args[0] as Action) : null;
  // Ce que l'app lit d'un appel qui n'a pas abouti : le motif, en un mot.
  function finir(code: number, motif: string, message: string, plus: Record<string, unknown> = {}): never {
    redire(`brigade-installer : ${message}`);
    dire(JSON.stringify({ ok: false, action, projet, motif, message, ...plus }));
    throw new Sortie(code);
  }

  if (process.getuid?.() !== box.racine) finir(CODES.sansDroit, "sans-droit", "ce geste écrit des unités systemd : il se lance par `sudo brigade-installer …`, que sa règle sudoers donne au groupe `brigade-chefs` — rien n'est fait");

  // Le journal d'abord : un appel qui ne peut pas s'y écrire n'a pas lieu.
  let journal: Journal;
  let verrou: Verrou | null = null;
  try {
    mkdirSync(box.journal, { recursive: true, mode: 0o700 });
    const lu = lstatSync(box.journal);
    if (!lu.isDirectory() || lu.uid !== box.racine || (lu.mode & 0o022) !== 0) throw new Error("ce n'est pas un répertoire de root seul");
    journal = ouvrirJournal(box.journal, { projections: [] });
  } catch (erreur) {
    finir(CODES.boxPasPrete, "journal-indisponible", `le journal du geste (${box.journal}) ne s'ouvre pas : ${erreur instanceof Error ? erreur.message : String(erreur)} — rien n'est fait, aucun usage ne passe sans trace`);
  }

  const qui = appelant(env);
  const appel = appelBorne(args);
  const ecrire = (fait: FaitInstallateur) => journal.ajouter({ project: projet ?? HORS_PROJET, ticket: null, author: qui, ...fait });
  const refuser = (code: number, motif: string, message: string): never => {
    ecrire({ type: "installer.refused", payload: { ...appel, result: "refused", reason: motif } });
    return finir(code, motif, message, { ecrit: false });
  };
  const options = {
    avantDEcrire: () => void ecrire({ type: "installer.started", payload: { ...appel, result: "started" } }),
    ...(signal === undefined ? {} : { signal }),
  };
  // Le geste a abouti, et `installer.started` le dit déjà.
  const ecrireLaReussite = (fait: FaitInstallateur, quoi: string) => {
    try {
      ecrire(fait);
    } catch (erreur) {
      redire(`brigade-installer : le projet est ${quoi}, mais sa réussite n'a pas pu s'écrire au journal (installer.used) — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  const installation = (demande: Demande) => async () => {
    const installe = await installer(box, demande, options);
    ecrireLaReussite({ type: "installer.used", payload: { ...appel, result: "installed", ports: installe.ports } }, "installé");
    dire(JSON.stringify({ ok: true, action, ...installe }));
  };
  const desinstallation = (retrait: Retrait) => async () => {
    const rendu = await desinstaller(box, retrait, options);
    const { retire } = rendu.plan;
    // Un plan n'a rien changé : sans trace au journal, il n'est pas rendu.
    if (rendu.fait === "plan") ecrire({ type: "installer.planned", payload: { ...appel, result: "planned" } });
    else ecrireLaReussite({ type: "installer.used", payload: { ...appel, result: "uninstalled", ports: retire.ports, journal: retire.journal === null ? "kept" : "removed" } }, "désinstallé");
    for (const ligne of direDesinstallation(rendu, retrait)) redire(ligne);
    dire(JSON.stringify({ ok: true, action, fait: rendu.fait, ...rendu.plan }));
  };
  try {
    const jouer = lireAppel(args).action === "install" ? installation(lireDemande(args)) : desinstallation(lireRetrait(args));
    // Un geste à la fois : deux installations de front se donneraient le même
    // port, et une désinstallation retirerait sous une installation.
    try {
      verrou = prendreVerrou(box.journal);
    } catch (erreur) {
      if (!(erreur instanceof VerrouTenu)) throw erreur;
      refuser(CODES.occupe, "occupe", "un autre geste d'installation est en cours sur cette box : rien n'est fait — rejouer quand il a fini");
    }
    await jouer();
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    if (erreur instanceof Refus) refuser(erreur.code, erreur.motif, erreur.message);
    if (erreur instanceof Echec) {
      ecrire({ type: "installer.failed", payload: { ...appel, result: "failed", reason: erreur.message, undone: erreur.defait } });
      finir(
        CODES.echec,
        "echec",
        erreur.defait
          ? `${erreur.message} — ce qui avait été posé est retiré, la box est comme avant`
          : `${erreur.message} — et tout n'a pas pu être retiré, il reste : ${erreur.restes.join(" ; ")}`,
        { defait: erreur.defait, restes: erreur.restes },
      );
    }
    if (erreur instanceof Inachevee) {
      const motif = erreur.message.length > LONGUEUR_DU_MOTIF ? `${erreur.message.slice(0, LONGUEUR_DU_MOTIF)}… (${erreur.message.length} caractères)` : erreur.message;
      ecrire({ type: "installer.failed", payload: { ...appel, result: "failed", reason: motif, removed: erreur.retires, left: erreur.restes } });
      finir(
        CODES.echec,
        "echec",
        `${erreur.message} — la désinstallation s'est arrêtée là, et se rejoue. ${erreur.retires.length === 0 ? "Rien n'a été retiré" : `Fait : ${erreur.retires.join(" ; ")}`}. Reste : ${erreur.restes.join(" ; ")}`,
        { retires: erreur.retires, restes: erreur.restes },
      );
    }
    // Ce qui n'était pas prévu arrive avant le premier geste : `installer` et
    // `desinstaller` rendent en échec tout ce qui survient après.
    refuser(CODES.boxPasPrete, "erreur-inattendue", `la box n'a pas pu être lue : ${erreur instanceof Error ? erreur.message : String(erreur)} — rien n'est fait`);
  } finally {
    verrou?.relacher();
    journal.fermer();
  }
}

if (import.meta.main) {
  // Coupé — un Ctrl-C, une session `ssh` qui tombe —, le geste défait ce qu'il
  // a posé avant de sortir.
  const coupe = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => coupe.abort());
  await enProcess((appel) => principal(appel, BOX, coupe.signal));
}
