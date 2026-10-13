// Ajouter un projet, c'est l'installer sur sa box : l'app lance à la place du chef
// le geste d'installation de la box (`sudo brigade-installer install …`,
// runtime/deploy/brigade-installer), par `ssh`, et lit l'objet qu'il rend. Elle ne
// lui donne aucun port : la box les attribue, l'app les affiche.
//
// Rien ici n'a de défaut. Ce qui n'est pas saisi est signalé, champ par champ, et
// rien ne part vers la box ; ce que la box refuserait à coup sûr — un nom hors de
// sa règle — est refusé avant de l'appeler. Le projet n'est déclaré dans l'app
// qu'une fois installé : une box pas jointe, un geste qui n'y est pas, un refus —
// rien n'est écrit, et l'écran dit quoi faire et où.
//
// L'app ne prépare pas une box : si le geste n'y répond pas, elle nomme la section
// de docs/installer.md qui le pose, et ne le pose pas.
import { execFile } from "node:child_process";
import type { Declare } from "./config.ts";
import { refusDeForme } from "./nom.ts";

// Le calibrage que la box accepte : ses deux listes fermées (runtime/src/calibrage.ts).
// Le test les compare — une valeur que la box ne connaît pas ne se propose pas.
export const MODELES = ["opus", "sonnet", "haiku"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Calibre = { modele: string; effort: string };
// Ce que l'écran d'ajout a recueilli. `sauvegardes` : un chemin sur la box.
export type Saisie = { dossier: string; nom: string; depot: string; hote: string; manager: Calibre; reviewer: Calibre; sauvegardes: string };
// Un champ de l'écran, par le nom que la vue lui donne.
export type Champ = "dossier" | "nom" | "depot" | "hote" | "manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort" | "sauvegardes";
export type Signales = Partial<Record<Champ, string>>;

// Le geste, par le chemin que sa règle sudoers nomme : `sudo` n'a pas à le chercher.
export const GESTE = "/usr/local/bin/brigade-installer";
const DOC = "docs/installer.md";
// Un dépôt GitHub, comme le geste de la box le lit (runtime/src/installateur.ts).
const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");

// Ce que la vue envoie, ramené à des textes : rien n'y est cru sur parole.
export function lireSaisie(recu: unknown): Saisie {
  const { dossier, nom, depot, hote, manager, reviewer, sauvegardes } = (recu ?? {}) as Record<string, unknown>;
  const calibre = (lu: unknown): Calibre => ({ modele: texte((lu as Calibre | undefined)?.modele), effort: texte((lu as Calibre | undefined)?.effort) });
  return { dossier: texte(dossier), nom: texte(nom), depot: texte(depot), hote: texte(hote), manager: calibre(manager), reviewer: calibre(reviewer), sauvegardes: texte(sauvegardes) };
}

const depotRefuse = (depot: string) => !DEPOT.test(depot) || [".", ".."].includes(depot.split("/")[1] ?? "") || depot.endsWith(".git");

// Les champs qui empêchent de valider, chacun avec sa raison. Aucun : la saisie peut partir.
export function refusDeSaisie(saisie: Saisie, boxes: readonly string[]): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  signaler("dossier", saisie.dossier === "" ? "Choisis le dossier du projet sur ce poste." : undefined);
  signaler("nom", saisie.nom === "" ? "Il manque le nom du projet : celui de son instance sur la box." : refusDeForme(saisie.nom));
  signaler(
    "depot",
    saisie.depot === ""
      ? "Il manque le dépôt GitHub du projet — `<propriétaire>/<nom>` : c'est lui que la box clone."
      : depotRefuse(saisie.depot)
        ? `« ${saisie.depot} » n'est pas un dépôt GitHub que la box accepte — attendu \`<propriétaire>/<nom>\`, sans adresse ni \`.git\`.`
        : undefined,
  );
  signaler(
    "hote",
    saisie.hote === ""
      ? boxes.length === 0
        ? "Aucune box n'est déclarée : déclares-en une, juste dessous."
        : "Choisis la box qui servira ce projet."
      : boxes.includes(saisie.hote)
        ? undefined
        : `« ${saisie.hote} » n'est pas une box déclarée.`,
  );
  for (const [role, calibre] of [["manager", saisie.manager], ["reviewer", saisie.reviewer]] as const) {
    for (const [dimension, valeur, admis] of [["modele", calibre.modele, MODELES], ["effort", calibre.effort, EFFORTS]] as const) {
      const quoi = `${dimension === "modele" ? "Le modèle" : "L'effort"} du ${role}`;
      signaler(
        `${role}-${dimension}`,
        valeur === "" ? `${quoi} n'a pas de défaut : c'est ton quota, choisis-le.` : (admis as readonly string[]).includes(valeur) ? undefined : `${quoi} : « ${valeur} » n'est pas dans la liste — ${admis.join(", ")}.`,
      );
    }
  }
  signaler(
    "sauvegardes",
    saisie.sauvegardes === ""
      ? "La destination des sauvegardes n'a pas de défaut : un répertoire de la box, propre à ce projet, hors de son état."
      : saisie.sauvegardes.startsWith("/")
        ? undefined
        : `« ${saisie.sauvegardes} » est un chemin relatif — attendu un chemin absolu, sur la box.`,
  );
  return signales;
}

// Le dépôt qu'une origine désigne chez GitHub — rien, si ce n'est pas une adresse que l'app sait lire.
export function depotDe(origine: string): string | undefined {
  const [, depot] = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?(?:[^@/]+@)?github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(origine.trim()) ?? [];
  return depot === undefined || depotRefuse(depot) ? undefined : depot;
}

// Le dépôt du dossier choisi, lu dans son origine : il se propose, il ne se devine
// pas — sans origine lisible, c'est au chef de l'écrire, et la raison le dit.
export function lireDepot(git: string, dossier: string): Promise<{ depot: string } | { raison: string }> {
  return new Promise((resoudre) => {
    execFile(git, ["-C", dossier, "remote", "get-url", "origin"], { timeout: 10_000 }, (erreur, sortie) => {
      if (erreur !== null) return resoudre({ raison: "L'origine de ce dossier ne se lit pas (`git remote get-url origin`) : écris son dépôt GitHub." });
      const depot = depotDe(sortie);
      resoudre(depot === undefined ? { raison: "L'origine de ce dossier n'est pas une adresse github.com que l'app sait lire : écris son dépôt GitHub." } : { depot });
    });
  });
}

// Ce que le geste reçoit, argument par argument. Aucun port : il n'en accepte pas.
export function argumentsDuGeste(saisie: Saisie): string[] {
  return [
    "install",
    saisie.nom,
    "--depot",
    saisie.depot,
    "--sauvegardes",
    saisie.sauvegardes,
    "--manager-modele",
    saisie.manager.modele,
    "--manager-effort",
    saisie.manager.effort,
    "--reviewer-modele",
    saisie.reviewer.modele,
    "--reviewer-effort",
    saisie.reviewer.effort,
  ];
}

// Un argument tel que le shell de la box le rendra au geste : entier, sans rien en exécuter.
const cite = (mot: string) => (/^[A-Za-z0-9@._:/=-]+$/.test(mot) ? mot : `'${mot.replaceAll("'", `'\\''`)}'`);

// La ligne que `ssh` porte à la box. `sudo -n` : sans terminal, il échoue plutôt
// que d'attendre un mot de passe.
export const gesteDeBox = (saisie: Saisie) => `sudo -n ${GESTE} ${argumentsDuGeste(saisie).map(cite).join(" ")}`;

// Ce que la box a rendu d'un projet installé. Un champ qu'elle n'a pas dit est null.
export type Installe = { branche: string | null; sauvegardes: string | null; ports: { porte: number | null; arbitre: number | null }; aSavoir: string[] };
// `installe` : le geste a rendu `ok`. `refuse` : il a répondu, et dit non — son motif,
// son message, mot pour mot. `injoignable` : `ssh` n'a pas ouvert de session.
// `geste-absent` : la box a été jointe, et le geste n'y a pas rendu son objet.
// `sans-reponse` : `ssh` a été arrêté au délai — rien ne dit où la box en était.
// `obtenu` : ce que l'app a reçu, tel quel.
export type Rendu =
  | { etat: "installe"; installe: Installe }
  | { etat: "refuse"; motif: string; message: string; code: number | null; obtenu: string }
  | { etat: "injoignable" | "geste-absent" | "sans-reponse"; obtenu: string };

// L'objet du geste : la dernière ligne de sa sortie standard qui en est un.
export function objetDuGeste(sortie: string): Record<string, unknown> | undefined {
  for (const ligne of sortie.split("\n").reverse()) {
    try {
      const lu: unknown = JSON.parse(ligne);
      if (lu !== null && typeof lu === "object" && typeof (lu as { ok?: unknown }).ok === "boolean") return lu as Record<string, unknown>;
    } catch {
      // Pas un objet : ce que la box a écrit d'autre reste dans `obtenu`.
    }
  }
  return undefined;
}

const port = (lu: unknown) => (typeof lu === "number" && Number.isInteger(lu) ? lu : null);

// Lance le geste d'installation sur la box, et dit ce qu'il en est advenu. Jamais
// d'exception : tout ce qui arrive est un rendu.
export function installer(options: { ssh: string; delaiMs: number; connexionS: number }, saisie: Saisie): Promise<Rendu> {
  // Comme la veille : sans terminal, `ssh` ne peut rien demander.
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${options.connexionS}`, "--", saisie.hote, gesteDeBox(saisie)];
  return new Promise((resoudre) => {
    execFile(options.ssh, args, { timeout: options.delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
      const code = erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null;
      const arrete = erreur?.killed === true;
      const suite = arrete ? `aucune réponse en ${(options.delaiMs / 1000).toLocaleString("fr-FR")} s : ssh arrêté` : code !== null ? `code de sortie ${code}` : (erreur?.message ?? "");
      const lance = `$ ${options.ssh} ${args.join(" ")}`;
      const obtenu = `${lance}\n${erreurs}${sortie}\n→ ${suite}`;
      const objet = objetDuGeste(sortie);
      if (objet?.ok === true) {
        const { branche, sauvegardes, ports, aSavoir } = objet as { branche?: unknown; sauvegardes?: unknown; ports?: { porte?: unknown; arbitre?: unknown } | null; aSavoir?: unknown };
        return resoudre({
          etat: "installe",
          installe: {
            branche: typeof branche === "string" ? branche : null,
            sauvegardes: typeof sauvegardes === "string" ? sauvegardes : null,
            ports: { porte: port(ports?.porte), arbitre: port(ports?.arbitre) },
            aSavoir: Array.isArray(aSavoir) ? aSavoir.filter((ligne) => typeof ligne === "string") : [],
          },
        });
      }
      if (objet !== undefined) {
        // Ce que le geste dit à un humain est sur sa sortie d'erreur ; son objet le redit, pour l'app.
        const message = texte(objet.message);
        return resoudre({ etat: "refuse", motif: texte(objet.motif) || "sans motif", message, code, obtenu: `${lance}\n${erreurs.trim() || `brigade-installer : ${message}`}\n\n→ ${suite}` });
      }
      if (arrete) return resoudre({ etat: "sans-reponse", obtenu });
      // 255 est le code de `ssh` ; sans code, il n'a pas pu être lancé — sauf une sortie
      // trop longue pour être gardée, qui vient bien de la box.
      const jointe = code === null ? erreur?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" : code !== 255;
      resoudre({ etat: jointe ? "geste-absent" : "injoignable", obtenu });
    });
  });
}

// Ce que l'écran montre d'un ajout. `champs` : rien n'est parti, et voici pourquoi.
// `ajoute` : sous ce `nom`, le projet est dans l'app — sa mise en service commence (service.ts).
// `declarable` : le projet est sur la box sans être dans l'app — il peut y être
// déclaré tel qu'il est, et c'est le chef qui le demande.
export type Issue =
  | { etat: "champs"; champs: Signales }
  | { etat: "ajoute"; nom: string; titre: string; lignes: string[]; ports: Installe["ports"] }
  | { etat: "pas-ajoute"; titre: string; lignes: string[]; obtenu?: string; declarable?: true };

const REJOUER = "Ce que tu as saisi est resté : rejoue l'ajout ensuite.";

// Ce que l'app dit d'un geste qui a refusé, selon son code (runtime/deploy/brigade-installer).
// Le message de la box est au-dessus, mot pour mot : il n'est pas redit.
function suiteDuRefus(code: number | null): string[] {
  if (code === 64) return ["La box n'a rien écrit. Corrige ce qu'elle nomme, et rejoue l'ajout."];
  if (code === 75) return ["La box n'a rien écrit. Rejoue l'ajout quand l'autre installation a fini."];
  if (code === 76 || code === 77) return [`La box n'est pas prête pour ce geste, et l'app ne la prépare pas : ce qui lui manque se pose sur elle, par quelqu'un qui y a \`sudo\` — ${DOC}, « Préparer la box ».`, REJOUER];
  if (code === 79) return ["L'installation avait commencé : la box dit ci-dessus si elle a tout retiré, ou ce qu'il en reste."];
  return [];
}

function pasAjoute(saisie: Saisie, rendu: Exclude<Rendu, { etat: "installe" }>): Issue {
  const { nom, hote } = saisie;
  const { obtenu } = rendu;
  if (rendu.etat === "refuse") {
    if (rendu.code === 78 || rendu.motif === "deja-installe") {
      return {
        etat: "pas-ajoute",
        titre: `« ${nom} » est déjà installé sur la box « ${hote} » : elle n'a rien changé, et rien n'est déclaré dans l'app.`,
        obtenu,
        lignes: [
          "Ni le calibrage ni la destination des sauvegardes que tu viens de saisir n'y sont posés : ceux de la box restent les siens.",
          "S'il manque seulement à l'app, il peut y être déclaré tel qu'il est sur la box — rien n'y sera écrit.",
        ],
        declarable: true,
      };
    }
    return { etat: "pas-ajoute", titre: `La box « ${hote} » a refusé d'installer « ${nom} » (${rendu.motif}) : rien n'est déclaré dans l'app.`, obtenu, lignes: suiteDuRefus(rendu.code) };
  }
  if (rendu.etat === "injoignable") {
    return {
      etat: "pas-ajoute",
      titre: `La box « ${hote} » n'a pas été jointe : rien n'est installé, rien n'est déclaré dans l'app.`,
      obtenu,
      lignes: [
        "`ssh` n'a pas ouvert de session, et il a dit pourquoi : son message est ci-dessus, l'app ne le lit pas.",
        `Ce que chacune de ses phrases veut dire, et le geste qui y répond : ${DOC}, « Joindre la box ».`,
        `S'il dit ta clé refusée (\`Permission denied\`), la box répond et c'est l'accès qui te manque : ${DOC}, « Ajouter un humain ».`,
        REJOUER,
      ],
    };
  }
  if (rendu.etat === "geste-absent") {
    return {
      etat: "pas-ajoute",
      titre: `La box « ${hote} » a été jointe, et le geste d'installation n'y a pas répondu : rien n'est déclaré dans l'app.`,
      obtenu,
      lignes: [
        "Ce que la box a rendu est ci-dessus, tel quel. Le cas attendu : `brigade-installer` n'y est pas posé — une box préparée avant lui —, ou sa règle sudoers ne le donne pas à ton compte.",
        `L'app ne prépare pas une box. Ce geste se pose sur elle, une fois, par quelqu'un qui y a \`sudo\` : ${DOC}, « Préparer la box » — « Le geste d'installation ».`,
        REJOUER,
      ],
    };
  }
  return {
    etat: "pas-ajoute",
    titre: `La box « ${hote} » n'a pas fini de répondre : l'app ne sait pas si « ${nom} » y est installé, et ne l'a pas déclaré.`,
    obtenu,
    lignes: ["Rejoue l'ajout : si la box avait fini, elle dira le projet déjà installé, sans rien y changer — et l'app proposera de le déclarer tel qu'il est."],
  };
}

const declare = ({ nom, dossier, hote }: Saisie): Declare => ({ nom, dossier, hote });
// Un projet installé garde le calibrage posé : c'est ce que l'écran propose pour le suivant.
const declareInstalle = (saisie: Saisie): Declare => ({ ...declare(saisie), calibrage: { manager: saisie.manager, reviewer: saisie.reviewer } });

// Ce par quoi un ajout passe : les box proposées, le fichier des projets, la box.
export type Par = {
  boxes: readonly string[];
  refusDAjout(projet: Declare): string | undefined;
  ajouter(projet: Declare): string | undefined;
  installer(saisie: Saisie): Promise<Rendu>;
};

// L'ajout, de bout en bout : les champs, puis ce que le fichier des projets en
// dirait, puis la box — et le projet n'est écrit dans l'app qu'une fois installé.
export async function ajouterSurBox(recu: unknown, par: Par): Promise<Issue> {
  const saisie = lireSaisie(recu);
  const champs = refusDeSaisie(saisie, par.boxes);
  if (Object.keys(champs).length > 0) return { etat: "champs", champs };
  // Avant la box : un projet que l'app ne pourrait pas déclarer n'y est pas installé.
  const refus = par.refusDAjout(declare(saisie));
  if (refus !== undefined) return { etat: "pas-ajoute", titre: `Pas ajouté — ${refus}`, lignes: ["Rien n'est parti vers la box."] };

  const rendu = await par.installer(saisie);
  if (rendu.etat !== "installe") return pasAjoute(saisie, rendu);
  const { ports, branche, sauvegardes, aSavoir } = rendu.installe;
  const lignes = [
    `Ports attribués par la box — porte : ${ports.porte ?? "la box ne l'a pas dit"} · arbitre : ${ports.arbitre ?? "aucun — cette box n'en déclare pas"}.`,
    ...(branche === null ? [] : [`Branche d'intégration : \`${branche}\`, lue par la box sur l'origine du dépôt.`]),
    ...(sauvegardes === null ? [] : [`Sauvegardes : ${sauvegardes}, sur la box.`]),
    ...aSavoir.map((ligne) => `La box dit : ${ligne}`),
  ];
  const ecrit = par.ajouter(declareInstalle(saisie));
  if (ecrit !== undefined) {
    return {
      etat: "pas-ajoute",
      titre: `« ${saisie.nom} » est installé sur la box « ${saisie.hote} », mais n'a pas pu être déclaré dans l'app — ${ecrit}`,
      lignes: [...lignes, "Rien n'est à refaire sur la box : il reste à le déclarer dans l'app, tel qu'il y est."],
      declarable: true,
    };
  }
  return { etat: "ajoute", nom: saisie.nom, titre: `« ${saisie.nom} » est installé sur la box « ${saisie.hote} », et déclaré dans l'app.`, lignes, ports };
}

// Déclarer dans l'app un projet que la box sert déjà, tel qu'il y est : rien ne
// part vers elle. Rend la raison, s'il ne l'a pas été.
export function declarerTelQuel(recu: unknown, par: Pick<Par, "boxes" | "ajouter">): string | undefined {
  const saisie = lireSaisie(recu);
  const { dossier, nom, hote } = refusDeSaisie(saisie, par.boxes);
  return dossier ?? nom ?? hote ?? par.ajouter(declare(saisie));
}
