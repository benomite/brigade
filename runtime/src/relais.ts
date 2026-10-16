// Le relais d'un cook : le process qui le porte, à la place du runtime, pour
// qu'il survive au runtime. Le runtime le lance détaché — chef de son propre
// groupe, hors du sien —, lui remet sur son entrée ce qu'il faut lancer, puis
// ne fait plus que le lire : le flux brut, que le relais écrit masqué, et la
// fin, qu'il écrit quand le cook est mort. Un runtime qui s'en va laisse donc
// son cook tourner ; celui qui démarre après lui le retrouve dans ces fichiers
// et le suit comme le sien (`superviseur.ts`, `suivreLeRelais`).
//
// Le relais ne juge rien et n'écrit aucun journal. Il sait trois choses :
// écrire ce que le cook dit, masqué ligne à ligne comme le faisait le
// superviseur ; arrêter le cook quand on le lui demande (SIGTERM au relais :
// SIGTERM au groupe du cook, puis SIGKILL passé la grâce) ; et, le cook mort,
// tuer ce qui reste de son groupe avant d'écrire sa fin. C'est le seul à
// signaler le groupe du cook : il sait, lui, quand ce groupe a cessé d'être le
// sien.
//
// `node relais.ts <run>` : le nom du run est sur la ligne de commande, pour
// qu'un runtime qui le retrouve sache que ce pid est bien ce relais-là.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, renameSync, writeFileSync, type WriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { masquerIdentifiants, retenirJeton } from "./identifiants.ts";
import { lignesMasquees } from "./lignes-masquees.ts";
import { masqueDesSecrets } from "./secrets.ts";

// Ce que le runtime remet au relais, sur son entrée, en une ligne JSON. Les
// secrets n'y passent que par là : ni sur la ligne de commande, ni sur disque.
export type ConsigneDuRelais = {
  commande: string;
  args: string[];
  cwd?: string;
  env: NodeJS.ProcessEnv;
  // Le flux brut ; la sortie d'erreur va dans `<flux>.stderr`.
  flux: string;
  // Où le relais écrit le pid du cook, puis sa fin.
  pid: string;
  fin: string;
  // Les valeurs à masquer dans ce que dit le cook, par nom.
  secrets: Record<string, string>;
  graceMs: number;
  attenteMax?: number;
};

// Ce que le relais écrit quand le cook est mort.
export type FinDuRelais = { code: number | null; signal: string | null; erreur: string | null; masques: number };

// Écrit d'un seul geste : un lecteur ne voit jamais un fichier à moitié écrit.
export function ecrireAtomique(fichier: string, contenu: string): void {
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, contenu);
  renameSync(provisoire, fichier);
}

function relayer(consigne: ConsigneDuRelais): void {
  // Le jeton que le runtime a remis à ce `claude` : masqué par sa valeur,
  // comme le runtime le masque chez lui.
  retenirJeton(consigne.env.CLAUDE_CODE_OAUTH_TOKEN);
  const masqueSecrets = Object.keys(consigne.secrets).length === 0 ? null : masqueDesSecrets(consigne.secrets);
  let masques = 0;
  const masquer = (texte: string) => {
    const lu = masquerIdentifiants(masqueSecrets?.(texte) ?? texte);
    masques += lu.masques;
    return lu.texte;
  };

  let enfant: ChildProcess | null = null;
  let mort = false;
  let grace: NodeJS.Timeout | undefined;
  // Le groupe du cook, et lui seul : jamais après sa mort.
  const signaler = (signal: NodeJS.Signals) => {
    if (mort || enfant?.pid === undefined) return;
    try {
      process.kill(-enfant.pid, signal);
    } catch {
      // Le groupe n'existe plus.
    }
  };
  let arretDemande = false;
  const arreter = () => {
    if (arretDemande) return;
    arretDemande = true;
    signaler("SIGTERM");
    grace = setTimeout(() => signaler("SIGKILL"), consigne.graceMs);
  };
  // Le relais n'entend que la demande d'arrêt, qu'il transmet. Le reste — la
  // fin d'un terminal, un Ctrl-C — ne le concerne pas : il n'en a pas.
  process.on("SIGTERM", arreter);
  process.on("SIGINT", () => {});
  process.on("SIGHUP", () => {});

  const finir = (fin: Omit<FinDuRelais, "masques">) => {
    try {
      ecrireAtomique(consigne.fin, JSON.stringify({ ...fin, masques }));
    } catch {
      // Le répertoire d'état a disparu : personne ne lira plus cette fin.
    }
    process.exit(0);
  };

  try {
    enfant = spawn(consigne.commande, consigne.args, {
      cwd: consigne.cwd,
      env: consigne.env,
      // Son propre groupe : un signal envoyé au groupe atteint aussi ce qu'il
      // a lancé, et jamais le relais.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erreur) {
    finir({ code: null, signal: null, erreur: erreur instanceof Error ? erreur.message : String(erreur) });
    return;
  }
  const lance = enfant;
  if (lance.pid !== undefined) {
    try {
      ecrireAtomique(consigne.pid, String(lance.pid));
    } catch {
      // Sans ce fichier, seul ce relais peut arrêter le cook : c'est le cas
      // ordinaire.
    }
  }

  const fichiers = [createWriteStream(consigne.flux, { flags: "a" }), createWriteStream(`${consigne.flux}.stderr`, { flags: "a" })] as const;
  const garder = (tube: Readable, fichier: WriteStream) => {
    fichier.on("error", () => {});
    const lignes = lignesMasquees(
      masquer,
      (texte) => {
        if (fichier.writable) fichier.write(texte);
      },
      consigne.attenteMax,
    );
    let fini = false;
    const clore = () => {
      if (fini) return;
      fini = true;
      lignes.vider();
      fichier.end();
    };
    tube.on("data", (morceau: Buffer) => lignes.recevoir(morceau));
    tube.on("end", clore);
    return clore;
  };
  const clore = [garder(lance.stdout as Readable, fichiers[0]), garder(lance.stderr as Readable, fichiers[1])];

  const conclure = (code: number | null, signal: string | null, erreur: string | null) => {
    if (mort) return;
    // Rien ne survit à son cook : ce qui reste du groupe est tué maintenant,
    // et plus aucun signal ne part ensuite.
    signaler("SIGKILL");
    mort = true;
    clearTimeout(grace);
    let attendus = fichiers.length;
    let filet: NodeJS.Timeout | undefined;
    const unDeMoins = () => {
      attendus -= 1;
      if (attendus > 0) return;
      clearTimeout(filet);
      finir({ code, signal, erreur });
    };
    // Un process échappé du groupe peut garder les tubes ouverts : il n'est
    // pas attendu au-delà de la grâce.
    filet = setTimeout(() => {
      lance.stdout?.destroy();
      lance.stderr?.destroy();
      for (const fichier of clore) fichier();
    }, consigne.graceMs);
    for (const fichier of fichiers) {
      if (fichier.closed) unDeMoins();
      else fichier.once("close", unDeMoins);
    }
  };
  lance.once("error", (erreur) => conclure(null, null, erreur.message));
  lance.once("exit", (code, signal) => conclure(code, signal, null));
}

// Lancé comme un programme : la consigne arrive sur l'entrée, d'une traite.
if (import.meta.main) {
  const morceaux: Buffer[] = [];
  process.stdin.on("data", (morceau: Buffer) => morceaux.push(morceau));
  process.stdin.on("end", () => relayer(JSON.parse(Buffer.concat(morceaux).toString("utf8")) as ConsigneDuRelais));
}
