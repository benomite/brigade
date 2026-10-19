// La désinstallation d'un projet, par le geste d'installation de la box — même
// exécutable, même règle sudoers, même journal, mêmes limites (`installateur.ts`) :
//   sudo brigade-installer uninstall <projet> --plan [--supprimer-le-journal]
//   sudo brigade-installer uninstall <projet> --confirmer <projet> [--supprimer-le-journal]
//
// Deux temps. Le plan dit exactement ce qui serait retiré et ne modifie rien.
// L'exécution retire ce que le plan dit, et rien sans une confirmation qui
// nomme le projet. Elle défait la partie « par projet » de docs/installer.md :
// les instances du projet arrêtées et désactivées, leurs drop-ins, le clone
// réservé et les worktrees, les versions que la bascule lui a posées. Le port
// de sa porte revient à la box avec ses drop-ins.
//
// L'état du projet — son journal — reste, sauf `--supprimer-le-journal` ; ses
// sauvegardes restent toujours. Aucun chemin ne se donne : ce que le geste
// retire, il le compose lui-même, du nom du projet.
//
// Le clone et les worktrees sont au compte du service : c'est sous lui, par la
// désinstallation du runtime (`installation.ts`), qu'ils sont inventoriés puis
// retirés — avec tout ce qu'elle refuse : un runtime qui tourne, un clone qui
// contient l'état, ce que l'origine n'a pas.
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync, rmdirSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import type { Rendu } from "./uninstall-as-the-account.ts";
import { affectations, CODES, derniereLigne, DERNIER_PORT, DOC, douteux, instances, lancer, lireAppel, lireCompte, pasPrete, PATH_DE_SYSTEMD, Refus, sous, usage, USAGES, type Box, type Compte } from "./installateur.ts";

// La liste fermée des options. `--confirmer` seule attend une valeur : le nom
// du projet.
const OPTIONS = ["--plan", "--confirmer", "--supprimer-le-journal"] as const;
type Option = (typeof OPTIONS)[number];

export type Retrait = {
  projet: string;
  // Vrai : dire ce qui serait retiré, et rien d'autre.
  plan: boolean;
  // Le nom que la confirmation porte, ou null sans confirmation.
  confirmation: string | null;
  // Vrai : l'état du projet, journal compris, part avec lui.
  journal: boolean;
};

// Lit ce que l'appelant a tapé pour `uninstall`, sans rien lire de la box.
export function lireRetrait(args: string[]): Retrait {
  const { action, projet, reste } = lireAppel(args);
  if (action !== "uninstall") throw usage("sous-commande-inconnue", `ce n'est pas une désinstallation : « ${action} »\n${USAGES.uninstall}`);
  const lues = new Map<Option, string | null>();
  for (let i = 0; i < reste.length; i++) {
    const option = reste[i] as string;
    if (!option.startsWith("-")) throw usage("argument-en-trop", `argument en trop : « ${option} »\n${USAGES.uninstall}`);
    if (!(OPTIONS as readonly string[]).includes(option)) throw usage("option-inconnue", `option inconnue : « ${option} » — celles de la désinstallation : ${OPTIONS.join(", ")}`);
    if (lues.has(option as Option)) throw usage("option-en-double", `${option} est donnée deux fois`);
    let valeur: string | null = null;
    if (option === "--confirmer") {
      valeur = reste[++i] ?? null;
      if (valeur === null || valeur.startsWith("-")) throw usage("valeur-manquante", `--confirmer attend le nom du projet : \`--confirmer ${projet}\``);
    }
    lues.set(option as Option, valeur);
  }
  if (lues.has("--plan") && lues.has("--confirmer")) throw usage("plan-et-confirmation", `--plan ne retire rien, il ne se confirme pas : l'un ou l'autre\n${USAGES.uninstall}`);
  return { projet, plan: lues.has("--plan"), confirmation: lues.get("--confirmer") ?? null, journal: lues.has("--supprimer-le-journal") };
}

export type Plan = {
  projet: string;
  // Ce que la désinstallation retire de la box, et rien d'autre.
  retire: {
    // Les instances du projet que systemd tient activées ou en marche : elles
    // sont arrêtées et désactivées.
    unites: Array<{ unite: string; enMarche: boolean }>;
    // Les répertoires de drop-ins de ses instances.
    dropIns: string[];
    // Le clone réservé, ou null s'il n'y est pas.
    clone: string | null;
    // Les worktrees de cooks sous son état — null tant que son runtime
    // tourne : ils ne se comptent qu'une fois arrêté.
    worktrees: number | null;
    // Les versions du runtime que la bascule lui a posées, ou null.
    versions: string | null;
    // Les ports que ses unités déclarent : la box peut les réattribuer.
    ports: number[];
    // Son état, journal compris — null sans `--supprimer-le-journal`.
    journal: string | null;
  };
  // Ce qui est au projet et que la désinstallation laisse.
  garde: {
    // Son état, journal compris — null s'il n'en a pas, ou s'il est retiré.
    journal: string | null;
    // La destination de ses sauvegardes : ce geste n'y touche jamais.
    sauvegardes: string | null;
  };
  // Ce que le clone et ses worktrees portent et que l'origine n'a pas : tant
  // qu'il en reste, la désinstallation refuse.
  perdus: string[];
  aSavoir: string[];
};

export type Desinstalle = { fait: "plan" | "desinstalle"; plan: Plan };

// Une désinstallation commencée qui s'est arrêtée en chemin. Rien n'est remis :
// `retires` dit ce qui est fait, `restes` ce qui reste du projet sur la box.
export class Inachevee extends Error {
  readonly retires: string[];
  readonly restes: string[];

  constructor(message: string, retires: string[], restes: string[]) {
    super(message);
    this.name = "Inachevee";
    this.retires = retires;
    this.restes = restes;
  }
}

const SOUS_LE_COMPTE = join(import.meta.dirname, "uninstall-as-the-account.ts");
// Ce que systemd dit d'une unité qui ne tourne pas.
const A_L_ARRET = ["inactive", "failed"];
// Vider l'état d'un projet prend le temps du disque. Une garde, large.
const DELAI_DU_RETRAIT_MS = 600_000;
// L'inventaire, lui, ne fait que lire.
const DELAI_DE_L_INVENTAIRE_MS = 120_000;
// Ce que le pas joué sous le compte peut rendre, au plus.
const SORTIE_MAX = 16 * 1024 * 1024;
const PERDUS_GARDES = 200;
const LONGUEUR_D_UNE_LIGNE = 300;

const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien > 1 ? "s" : ""}`;
const present = (chemin: string) => lstatSync(chemin, { throwIfNoEntry: false });

// Vrai si `chemin` est `parent` ou vit dessous, liens résolus : la règle par
// laquelle la désinstallation du runtime refuse un clone qui contient l'état.
function dedans(chemin: string, parent: string): boolean {
  const reel = (lu: string) => (existsSync(lu) ? realpathSync(lu) : lu);
  return sous(reel(chemin), reel(parent));
}

const sousLeCompte = (compte: Compte) => (process.getuid?.() === compte.uid ? {} : { uid: compte.uid, gid: compte.gid });

type Inventaire = { clone: boolean; worktrees: number; perdus: string[] };

// Ce que le pas joué sous le compte rend vient d'un compte qui n'est pas
// root : une ligne en est gardée sans caractère de contrôle, et bornée.
const ligneBornee = (texte: unknown) => {
  const propre = String(texte).replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");
  return propre.length > LONGUEUR_D_UNE_LIGNE ? `${propre.slice(0, LONGUEUR_D_UNE_LIGNE)}…` : propre;
};
const lignesBornees = (lignes: unknown[]) => [...lignes.slice(0, PERDUS_GARDES).map(ligneBornee), ...(lignes.length > PERDUS_GARDES ? [`… et ${lignes.length - PERDUS_GARDES} de plus`] : [])];

// La désinstallation du runtime, lancée sous le compte du service : à blanc,
// elle inventorie ; confirmée, elle retire le clone réservé et les worktrees.
// Son refus est celui du geste. Root n'en prend aucun chemin : que le clone y
// est, combien de worktrees, et ce qui serait perdu, à lire.
async function duRuntime(box: Box, compte: Compte, chemins: { etat: string; clone: string }, confirme: boolean): Promise<Inventaire> {
  const rendu = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resoudre) => {
    let [stdout, stderr] = ["", ""];
    try {
      const enfant = spawn(process.execPath, [SOUS_LE_COMPTE, ...(confirme ? ["--confirmer"] : [])], {
        // `GIT_OPTIONAL_LOCKS=0` : à blanc, `git status` ne récrit pas même l'index du clone.
        env: { ...box.environnement(compte), BRIGADE_STATE_DIR: chemins.etat, BRIGADE_REPO_DIR: chemins.clone, GIT_OPTIONAL_LOCKS: "0" },
        cwd: sep,
        stdio: ["ignore", "pipe", "pipe"],
        ...sousLeCompte(compte),
        // Confirmée, elle retire : dans sa propre session et sans délai, pour
        // que ni un Ctrl-C ni une session `ssh` qui tombe ne la coupe au milieu
        // d'un clone — git ne reconnaîtrait plus ce qui en reste, et la
        // désinstallation ne se rejouerait pas. Le geste, coupé, l'attend.
        ...(confirme ? { detached: true } : { timeout: DELAI_DE_L_INVENTAIRE_MS }),
      });
      enfant.stdout.on("data", (morceau: Buffer) => void (stdout.length < SORTIE_MAX && (stdout += morceau.toString())));
      enfant.stderr.on("data", (morceau: Buffer) => void (stderr.length < SORTIE_MAX && (stderr += morceau.toString())));
      enfant.on("error", (erreur) => resoudre({ code: null, stdout, stderr: erreur.message }));
      enfant.on("close", (code) => resoudre({ code, stdout, stderr }));
    } catch (erreur) {
      // Prendre l'uid du compte a été refusé : rien n'a été lancé.
      resoudre({ code: null, stdout, stderr: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  });
  // Ce qu'elle rend est lu champ par champ : rien n'y est tenu pour acquis.
  const lu = ((): Partial<Record<keyof Extract<Rendu, { ok: true }> | "refus", unknown>> => {
    try {
      const rendue: unknown = rendu.code === 0 ? JSON.parse(derniereLigne(rendu.stdout)) : null;
      return typeof rendue === "object" && rendue !== null ? rendue : {};
    } catch {
      return {};
    }
  })();
  if (lu.ok === false && typeof lu.refus === "string") {
    throw new Refus("retenu-par-le-runtime", CODES.retenu, `la désinstallation du runtime refuse — ${lignesBornees(lu.refus.split("\n")).join("\n")}`);
  }
  if (lu.ok !== true || !Number.isInteger(lu.worktrees) || (lu.worktrees as number) < 0 || !Array.isArray(lu.perdus)) {
    throw new Error(`la désinstallation du runtime, lancée sous le compte « ${compte.nom} », n'a pas répondu (elle rend ${rendu.code}) : ${ligneBornee(derniereLigne(rendu.stderr))}`);
  }
  return { clone: typeof lu.clone === "string", worktrees: lu.worktrees as number, perdus: lignesBornees(lu.perdus) };
}

// Ce qu'un projet a sur la box, là où ce geste le pose.
type Reconnu = { etat: string; clone: string; versions: string; dropIns: string[]; aUnEtat: boolean; aDesVersions: boolean };
type Lecture = Reconnu & { plan: Plan; compte: Compte | null };

const dropIn = (box: Box, unite: string) => join(box.unites, `${unite}.d`);

// Reconnaît le projet sur la box, ou le refuse : inconnu, il n'a rien ici.
function reconnaitre(box: Box, projet: string): Reconnu {
  const etat = join(box.etats, projet);
  const versions = join(box.versions, projet);
  const dropIns = Object.values(instances(projet))
    .map((unite) => dropIn(box, unite))
    .filter((chemin) => present(chemin) !== undefined);
  const aUnEtat = present(etat) !== undefined;
  const aDesVersions = present(versions) !== undefined;

  if (dropIns.length === 0 && !aUnEtat && !aDesVersions) {
    let connus: string[] = [];
    try {
      connus = readdirSync(box.unites).flatMap((nom) => /^brigade@(.+)\.service\.d$/.exec(nom)?.[1] ?? []).sort();
    } catch {}
    throw new Refus(
      "projet-inconnu",
      CODES.inconnu,
      `le projet « ${projet} » n'est pas connu de cette box : ni drop-in sous ${box.unites}, ni état sous ${box.etats} — rien n'est fait, rien n'a changé. ${connus.length === 0 ? "Elle ne porte aucun projet" : `Elle porte : ${connus.join(", ")}`}`,
    );
  }
  return { etat, clone: join(etat, "depot"), versions, dropIns, aUnEtat, aDesVersions };
}

// Lit sur la box ce que la désinstallation du projet retirerait. Ne modifie rien.
async function lire(box: Box, { projet, journal: log }: Retrait, reconnu: Reconnu): Promise<Lecture> {
  const { etat, clone, versions, dropIns, aUnEtat, aDesVersions } = reconnu;
  const unites = instances(projet);
  const env = { PATH: PATH_DE_SYSTEMD };

  // Ce que root retirerait lui-même : des répertoires que root tient seul,
  // par un chemin sans lien — sinon un autre compte lui ferait retirer
  // ailleurs — et aucun qui contienne l'état du projet.
  const aRoot = [...dropIns, ...(aDesVersions ? [versions] : [])];
  for (const repertoire of aRoot) {
    const doute = douteux(box, repertoire);
    if (doute !== null) throw pasPrete("repertoire-douteux", `${repertoire} ne se retire pas : ${doute} — ce geste ne retire, en root, que ce que root tient seul ; rien n'est fait`);
    if (dedans(etat, repertoire)) throw new Refus("etat-dedans", CODES.retenu, `${repertoire} contient l'état du projet (${etat}) : le retirer emporterait le journal — rien n'est retiré`);
  }
  if (aUnEtat && !present(etat)?.isDirectory()) throw pasPrete("etat-douteux", `le répertoire d'état du projet (${etat}) n'est pas un répertoire : rien n'est fait`);
  // Un projet posé à la main ailleurs que là où ce geste pose : il n'y suit
  // aucun chemin écrit dans une unité.
  const ailleurs = ([["BRIGADE_STATE_DIR", etat], ["BRIGADE_REPO_DIR", clone]] as const).flatMap(([variable, attendu]) =>
    affectations(dropIn(box, unites.runtime), variable)
      .filter((valeur) => valeur.replaceAll("%i", projet) !== attendu)
      .map((valeur) => `${variable}=${valeur}`),
  );
  if (ailleurs.length > 0) {
    throw pasPrete("projet-pose-ailleurs", `les unités de « ${projet} » le posent ailleurs que ce geste (${ailleurs.join(", ")} — attendu ${etat} et ${clone}) : il ne retire que ce qu'il compose lui-même — rien n'est fait, le désinstaller à la main (${DOC}, « Désinstaller »)`);
  }

  // Le runtime d'abord : c'est lui qui tient le clone.
  const aArreter: Plan["retire"]["unites"] = [];
  for (const unite of [unites.runtime, unites.minuteur, unites.porte]) {
    const montre = await lancer(box.systemctl, ["show", "-p", "ActiveState", "-p", "UnitFileState", unite], { env });
    if (montre.code !== 0) throw pasPrete("systemd-muet", `systemd n'a pas répondu pour ${unite} (\`systemctl show -p ActiveState\` rend ${montre.code}) : ${derniereLigne(montre.stderr)}`);
    const propriete = (nom: string) => new RegExp(`^${nom}=(.*)$`, "m").exec(montre.stdout)?.[1]?.trim() ?? "";
    const enMarche = !A_L_ARRET.includes(propriete("ActiveState"));
    if (enMarche || propriete("UnitFileState").startsWith("enabled")) aArreter.push({ unite, enMarche });
  }
  const tourne = aArreter.some(({ unite, enMarche }) => unite === unites.runtime && enMarche);

  // Ce qui est au compte du service s'inventorie sous lui — et pas tant que le
  // runtime tourne : sa désinstallation le refuse.
  let compte: Compte | null = null;
  let inventaire: Omit<Inventaire, "worktrees"> & { worktrees: number | null } = { clone: false, worktrees: 0, perdus: [] };
  if (aUnEtat) {
    compte = await lireCompte(box, unites.runtime, env);
    inventaire = tourne ? { clone: present(clone) !== undefined, worktrees: null, perdus: [] } : await duRuntime(box, compte, { etat, clone }, false);
  }

  const ports = [unites.runtime, unites.porte]
    .flatMap((unite) => affectations(dropIn(box, unite), "BRIGADE_PROXY_PORT"))
    .map(Number)
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= DERNIER_PORT);
  const plan: Plan = {
    projet,
    retire: {
      unites: aArreter,
      dropIns,
      clone: inventaire.clone ? clone : null,
      worktrees: inventaire.worktrees,
      versions: aDesVersions ? versions : null,
      ports: [...new Set(ports)].sort((a, b) => a - b),
      journal: log && aUnEtat ? etat : null,
    },
    garde: {
      journal: !log && aUnEtat ? etat : null,
      sauvegardes: affectations(dropIn(box, unites.sauvegarde), "BRIGADE_BACKUP_DIR").at(-1) ?? null,
    },
    perdus: inventaire.perdus,
    aSavoir: [
      ...(tourne
        ? [`le runtime du projet tourne : il est arrêté d'abord, et ses cooks avec lui. Ses worktrees, et ce que son clone porte que l'origine n'a pas, ne s'inventorient qu'une fois arrêté : s'il en porte, la désinstallation s'arrête là — runtime arrêté, rien d'autre de retiré`]
        : []),
      ...(inventaire.perdus.length > 0 ? [`le clone porte ce que l'origine n'a pas (${inventaire.perdus.length}) : la désinstallation refuse tant qu'il en reste — le pousser, ou le défaire, puis rejouer`] : []),
    ],
  };
  return { ...reconnu, plan, compte };
}

const rienARetirer = ({ retire }: Plan) => retire.unites.length === 0 && retire.dropIns.length === 0 && retire.clone === null && retire.worktrees === 0 && retire.versions === null && retire.journal === null;

// La ligne qui confirme la désinstallation de ce projet.
const confirmer = ({ projet, journal: log }: Pick<Retrait, "projet" | "journal">) => `sudo brigade-installer uninstall ${projet} --confirmer ${projet}${log ? " --supprimer-le-journal" : ""}`;

// Désinstalle un projet de la box — ou, à blanc, dit ce qui le serait. Tout ce
// qui peut être refusé l'est avant le premier geste : `avantDEcrire` est
// appelée entre les deux. Ensuite, un pas qui échoue arrête la désinstallation
// là : rien n'est remis, et elle se rejoue.
export async function uninstall(box: Box, retrait: Retrait, options: { avantDEcrire?: () => void; signal?: AbortSignal } = {}): Promise<Desinstalle> {
  const { projet } = retrait;
  const reconnu = reconnaitre(box, projet);
  // La confirmation avant l'inventaire : ce qui retiendrait la désinstallation
  // ne cache pas à qui ne l'a pas confirmée comment le faire.
  if (!retrait.plan && retrait.confirmation === null) {
    throw new Refus("sans-confirmation", CODES.sansConfirmation, `rien n'est retiré : désinstaller « ${projet} » se confirme en le nommant — \`${confirmer(retrait)}\` ; \`--plan\` dit d'abord ce qui serait retiré`);
  }
  if (!retrait.plan && retrait.confirmation !== projet) {
    throw new Refus("confirmation-d-un-autre", CODES.sansConfirmation, `rien n'est retiré : la confirmation nomme « ${retrait.confirmation} », pas « ${projet} » — \`${confirmer(retrait)}\``);
  }
  const { plan, etat, clone, versions, compte } = await lire(box, retrait, reconnu);
  if (retrait.plan) return { fait: "plan", plan };
  if (plan.perdus.length > 0) {
    throw new Refus("travail-jamais-pousse", CODES.retenu, [`le clone de « ${projet} » porte ce que l'origine n'a pas — le pousser, ou le défaire, puis rejouer ; rien n'est retiré :`, ...plan.perdus.map((perdu) => `  ${perdu}`)].join("\n"));
  }

  // --- Ce qui se retire, dans l'ordre de docs/installer.md, « Désinstaller ».
  const env = { PATH: PATH_DE_SYSTEMD };
  const systemctl = async (...args: string[]) => {
    const rendu = await lancer(box.systemctl, args, { env });
    if (rendu.code !== 0) throw new Error(`\`systemctl ${args.join(" ")}\` rend ${rendu.code} : ${derniereLigne(rendu.stderr)}`);
  };
  const arreter = (unite: string) => ({ quoi: `${unite} (arrêtée, désactivée)`, geste: () => systemctl("disable", "--now", unite) });
  // Un répertoire de root : relu au moment de le retirer.
  const retirer = (repertoire: string) => ({
    quoi: repertoire,
    geste: () => {
      const doute = douteux(box, repertoire);
      if (doute !== null) throw new Error(`${repertoire} n'est plus à root seul (${doute}) : laissé là`);
      rmSync(repertoire, { recursive: true, force: true });
    },
  });
  const { retire } = plan;
  const runtime = instances(projet).runtime;
  const pas: Array<{ quoi: string; geste: () => void | Promise<void> }> = [];

  // Le runtime arrêté d'abord, puis son clone tant que ses drop-ins le
  // désignent encore : ce qui retient la désinstallation la retient ici.
  pas.push(...retire.unites.filter(({ unite }) => unite === runtime).map(({ unite }) => arreter(unite)));
  if (compte !== null && (retire.clone !== null || retire.worktrees !== 0)) {
    pas.push({
      quoi: `${retire.clone ?? join(etat, "worktrees")} (le clone réservé et les worktrees)`,
      geste: async () => {
        const bilan = await duRuntime(box, compte, { etat, clone }, true);
        [retire.clone, retire.worktrees] = [bilan.clone ? clone : null, bilan.worktrees];
      },
    });
  }
  pas.push(...retire.unites.filter(({ unite }) => unite !== runtime).map(({ unite }) => arreter(unite)));
  pas.push(...retire.dropIns.map(retirer));
  if (retire.versions !== null) pas.push(retirer(versions));
  // systemd relit ses unités une fois les drop-ins retirés.
  if (retire.unites.length > 0 || retire.dropIns.length > 0) pas.push({ quoi: "systemctl daemon-reload", geste: () => systemctl("daemon-reload") });
  if (retire.journal !== null && compte !== null) {
    pas.push({
      quoi: `${etat} (l'état du projet, journal compris)`,
      geste: async () => {
        // Sous le compte : ce répertoire est à lui, root n'y suit rien. Le
        // répertoire lui-même vit sous celui de root : vidé, c'est root qui le
        // retire — `rmdir` ne suit aucun lien et refuse ce qui n'est pas vide.
        const vide = await lancer("rm", ["-rf", "--", etat], { env: box.environnement(compte), cwd: sep, ...sousLeCompte(compte), delaiMs: DELAI_DU_RETRAIT_MS });
        if (present(etat) === undefined) return;
        try {
          rmdirSync(etat);
        } catch (erreur) {
          throw new Error(`l'état du projet n'a pas pu être retiré en entier sous le compte « ${compte.nom} » : ${derniereLigne(vide.stderr) || (erreur instanceof Error ? erreur.message : String(erreur))}`);
        }
      },
    });
  }

  options.avantDEcrire?.();
  const retires: string[] = [];
  for (const [rang, { quoi, geste }] of pas.entries()) {
    try {
      if (options.signal?.aborted) throw new Error("le geste a été interrompu");
      await geste();
      retires.push(quoi);
    } catch (erreur) {
      throw new Inachevee(erreur instanceof Error ? erreur.message : String(erreur), retires, pas.slice(rang).map((reste) => reste.quoi));
    }
  }
  return { fait: "desinstalle", plan };
}

// Ce que le geste dit à un humain d'un plan, ou d'une désinstallation faite :
// la liste de ce qui est retiré, puis de ce qui est gardé.
export function direDesinstallation({ fait, plan }: Desinstalle, retrait: Retrait): string[] {
  const { projet, retire, garde } = plan;
  const aBlanc = fait === "plan";
  const ligne = (titre: string, texte: string) => `  ${titre.padEnd(15)}${texte}`;
  const retires = [
    ...retire.unites.map(({ unite, enMarche }) => ligne("unité", `${unite} — arrêtée et désactivée${aBlanc ? (enMarche ? " : elle tourne" : " : elle ne tourne pas") : ""}`)),
    ...retire.dropIns.map((chemin) => ligne("drop-ins", chemin)),
    ...(retire.clone === null ? [] : [ligne("clone réservé", retire.clone)]),
    ...(retire.worktrees === null ? [ligne("worktrees", "ceux de ses cooks — comptés une fois le runtime arrêté")] : retire.worktrees === 0 ? [] : [ligne("worktrees", `${pluriel(retire.worktrees, "worktree")} de cook`)]),
    ...(retire.versions === null ? [] : [ligne("versions", `${retire.versions} — celles que la bascule lui a posées`)]),
    ...retire.ports.map((port) => ligne("port", `${port} — libéré : la box peut le réattribuer`)),
    ...(retire.journal === null ? [] : [ligne("journal", `${retire.journal} — l'état du projet, son journal compris : supprimé, sans retour (\`--supprimer-le-journal\`)`)]),
  ];
  const gardes = [
    ...(garde.journal === null ? [] : [ligne("journal", `${garde.journal} — l'état du projet, son journal compris : l'histoire de la cuisine. Seul \`--supprimer-le-journal\` le retire`)]),
    ...(garde.sauvegardes === null ? [] : [ligne("sauvegardes", `${garde.sauvegardes} — ce geste n'y touche jamais`)]),
  ];
  return [
    rienARetirer(plan)
      ? `brigade-installer : il ne reste rien de « ${projet} » à retirer de cette box`
      : aBlanc
        ? `brigade-installer : désinstaller « ${projet} » retirerait de cette box :`
        : `brigade-installer : « ${projet} » est désinstallé de cette box — retiré :`,
    ...retires,
    ...(gardes.length === 0 ? [] : ["Gardé :", ...gardes]),
    ...(plan.perdus.length === 0 ? [] : ["Ce que le clone porte et que l'origine n'a pas :", ...plan.perdus.map((perdu) => `  ${perdu}`)]),
    ...(aBlanc ? plan.aSavoir.map((note) => `À savoir : ${note}`) : []),
    ...(aBlanc ? [`Rien n'a changé sur la box.${rienARetirer(plan) ? "" : ` Pour le faire : \`${confirmer(retrait)}\``}`] : []),
  ];
}
