// Le service d'un projet : comment on le fait tourner pour regarder une
// livraison. Lui seul le sait, et son dépôt le déclare à côté de son setup de
// worktree — la commande qui le sert, et les chemins dont la modification fait
// d'une livraison une livraison d'interface. Le port n'est pas à lui : c'est
// celui que le setup attribue au worktree. Ce module lit la déclaration et
// répond à deux questions — ce worktree est-il servable, cette livraison
// touche-t-elle l'interface ? Il ne lance rien, et n'ouvre aucun port.
//
// Un projet dont l'interface ne s'ouvre pas dans un navigateur — une app
// Electron, comme `brigade` — ne déclare pas de commande qui le sert : il
// déclare son `lancement`, la commande qui lance l'app depuis la racine d'un
// worktree. C'est cette déclaration, et elle seule, qui dit qu'un projet n'est
// pas servable en navigateur : rien n'est deviné de ses dépendances. Un tel
// projet n'a ni serveur ni page ; sa livraison dit comment la voir (`ecran.ts`).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIPT_SETUP } from "./gates.ts";
import { possede, refus } from "./zones.ts";

// Ce que le dépôt du projet déclare : des lignes « clé : valeur ».
export const DECLARATION_SERVICE = ".claude/brigade/service";

// Le port du worktree, tel que son setup l'exporte. Le runtime n'en choisit
// jamais un autre.
export const VARIABLE_DU_PORT = "BRIGADE_PORT";

export type Declaration = {
  // Ce qui sert le projet, tel que le dépôt l'écrit. Nulle : il ne le dit pas.
  commande: string | null;
  // Ce qui lance l'app du projet, quand elle ne se sert pas dans un
  // navigateur. Nul : il ne le dit pas. Jamais avec une commande.
  lancement: string | null;
  // Les chemins du dépôt dont la modification touche l'interface.
  interface: string[];
  // Ce qui n'a pas été compris, ou manque. Vide : la déclaration est lisible.
  problemes: string[];
};

// `declare` : le dépôt porte une déclaration — c'est elle, ou le port, qui
// fait défaut. `pourquoi` se dit tel quel au chef. `regard` : comment une
// livraison se regarde — `navigateur`, sur le serveur du worktree ;
// `lancement`, en lançant l'app sur le worktree, sans serveur ni port.
export type Service =
  | { servable: true; regard: "navigateur"; commande: string; port: number; interface: string[] }
  | { servable: true; regard: "lancement"; lancement: string; interface: string[] }
  | { servable: false; declare: boolean; pourquoi: string };

const ATTENDU = "attendu « commande : … », « lancement : … » ou « interface : … »";
// « clé : valeur ». Ce qui suit les premiers deux-points est la valeur, telle
// quelle : une commande en porte d'autres.
const CHAMP = /^([\p{L}][\p{L}\p{N}_-]*)\s*:(.*)$/u;

const NON_DECLARE = `ce projet ne déclare pas comment il est servi : son dépôt ne porte pas de \`${DECLARATION_SERVICE}\` — une ligne « commande : … » (ou « lancement : … » pour une app qui ne s'ouvre pas dans un navigateur), et une ligne « interface : <chemin> » par chemin dont la modification touche l'interface`;

// Pourquoi une valeur n'est pas un chemin d'interface, ou null.
function refusDeChemin(chemin: string): string | null {
  if (chemin === "") return "il manque le chemin";
  const defaut = refus(chemin);
  if (defaut !== null) return `« ${chemin} » ${defaut}`;
  // `.` posséderait tout : une livraison de documentation serait servie.
  return chemin.split("/").some((segment) => segment !== "" && segment !== ".") ? null : `« ${chemin} » ne nomme aucun chemin — tout le dépôt n'est pas une interface`;
}

// Lit la déclaration du dépôt, sans E/S. Tout ce qu'elle ne dit pas, ou dit
// mal, devient un problème dit : jamais une commande devinée.
export function lireDeclaration(texte: string): Declaration {
  const declaration: Declaration = { commande: null, lancement: null, interface: [], problemes: [] };
  // La ligne qui porte la commande, ou le lancement, et s'il y en a eu une, même vide.
  const lignes = { commande: 0, lancement: 0 };
  let commandeEcrite = false;
  texte.split(/\r?\n/).forEach((brute, rang) => {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) return;
    const probleme = (pourquoi: string) => void declaration.problemes.push(`ligne ${rang + 1} de \`${DECLARATION_SERVICE}\` (« ${ligne.slice(0, 80)} ») : ${pourquoi}`);
    const [, cle, suite] = CHAMP.exec(ligne) ?? [];
    const valeur = (suite ?? "").trim();
    if (cle === undefined) probleme(`ce n'est pas une ligne « clé : valeur » — ${ATTENDU}`);
    else if (cle === "commande" || cle === "lancement") {
      commandeEcrite = true;
      const autre = cle === "commande" ? "lancement" : "commande";
      if (valeur === "") probleme(cle === "commande" ? "il manque la commande" : "il manque le lancement");
      else if (declaration[cle] !== null) probleme(cle === "commande" ? `la commande est déjà déclarée ligne ${lignes.commande} — une seule sert le projet` : `le lancement est déjà déclaré ligne ${lignes.lancement} — un seul lance l'app`);
      // Un projet se regarde d'une seule façon : servi dans un navigateur, ou lancé.
      else if (declaration[autre] !== null)
        probleme(`${cle === "commande" ? "une commande" : "un lancement"} alors que ${autre === "commande" ? "la commande est déclarée" : "le lancement est déclaré"} ligne ${lignes[autre]} — un projet se sert dans un navigateur (« commande ») ou se lance (« lancement »), pas les deux`);
      else {
        declaration[cle] = valeur;
        lignes[cle] = rang + 1;
      }
    } else if (cle === "interface") {
      const defaut = refusDeChemin(valeur);
      const chemin = valeur.replace(/\/+$/, "");
      if (defaut !== null) probleme(defaut);
      else if (!declaration.interface.includes(chemin)) declaration.interface.push(chemin);
    } else probleme(`\`${cle}\` n'est pas une clé — ${ATTENDU}`);
  });
  if (!commandeEcrite) {
    declaration.problemes.push(`aucune commande dans \`${DECLARATION_SERVICE}\` : rien ne dit comment servir ce projet — une ligne « commande : … », ou « lancement : … » pour une app qui ne s'ouvre pas dans un navigateur`);
  }
  if (declaration.interface.length === 0) {
    declaration.problemes.push(`aucun chemin d'interface dans \`${DECLARATION_SERVICE}\` : aucune livraison ne serait reconnue comme touchant l'interface — une ligne « interface : <chemin> » par chemin`);
  }
  return declaration;
}

// Le port que le setup a attribué au worktree, ou pourquoi il n'y en a pas.
function portAttribue(env: NodeJS.ProcessEnv): number | string {
  const brut = env[VARIABLE_DU_PORT];
  if (brut === undefined) return `aucun port n'est attribué à ce worktree : son setup (\`${SCRIPT_SETUP}\`) n'exporte pas \`${VARIABLE_DU_PORT}\`, et aucun port n'est choisi à sa place`;
  const port = /^[1-9][0-9]{0,4}$/.test(brut) ? Number(brut) : 0;
  return port >= 1 && port <= 65535 ? port : `\`${VARIABLE_DU_PORT}\` vaut « ${brut.slice(0, 80)} » : ce n'est pas un port — le setup du worktree (\`${SCRIPT_SETUP}\`) l'attribue, de 1 à 65535`;
}

// Ce worktree est-il servable ? Il l'est si son dépôt déclare comment le
// servir, sans problème, et si son setup lui a attribué un port — ou s'il
// déclare son lancement, sans problème : une app lancée n'a pas de port. `env` :
// l'environnement que le setup du worktree a rendu. Ne lève pas, n'attend
// rien : ce qui manque est dit.
export function serviceDuWorktree(worktree: string, env: NodeJS.ProcessEnv): Service {
  let texte: string;
  try {
    texte = readFileSync(join(worktree, DECLARATION_SERVICE), "utf8");
  } catch (erreur) {
    const { code, message } = erreur as NodeJS.ErrnoException;
    // Illisible n'est pas absent : seul un fichier qui n'est pas là ne déclare rien.
    if (code === "ENOENT" || code === "ENOTDIR") return { servable: false, declare: false, pourquoi: NON_DECLARE };
    return { servable: false, declare: true, pourquoi: `\`${DECLARATION_SERVICE}\` est illisible — ${code ?? message}` };
  }
  const { commande, lancement, interface: chemins, problemes } = lireDeclaration(texte);
  if (problemes.length > 0) return { servable: false, declare: true, pourquoi: `ce projet déclare mal comment il est servi — ${problemes.join(" ; ")}` };
  if (lancement !== null) return { servable: true, regard: "lancement", lancement, interface: chemins };
  if (commande === null) return { servable: false, declare: true, pourquoi: "ce projet déclare mal comment il est servi — il manque la commande" };
  const port = portAttribue(env);
  if (typeof port === "string") return { servable: false, declare: true, pourquoi: port };
  return { servable: true, regard: "navigateur", commande, port, interface: chemins };
}

// Ceux des fichiers qu'une livraison change (`depot.changes`) qui sont sous un
// chemin d'interface déclaré. Vide : elle ne touche pas l'interface.
export function toucheInterface(chemins: string[], changes: string[]): string[] {
  return changes.filter((fichier) => chemins.some((chemin) => possede(chemin, fichier)));
}
