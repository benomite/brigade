// Les serveurs des worktrees : une livraison qui touche l'interface est servie
// depuis le worktree de son cook, par la commande que le projet déclare
// (`service.ts`), sur le port que le setup a attribué à ce worktree — et aucun
// autre. Ce qui tourne s'écrit au journal, d'où `station` et `status` le
// montrent ; ce qui empêche de servir aussi, sans rien lancer.
//
// La commande est au projet, comme son setup et ses gates : elle part dans la
// même cloison, dans l'environnement que le setup a rendu, et dans son propre
// groupe de process — rien ne lui est donné qu'un cook n'avait déjà. Un serveur
// tient son worktree : il ne se range qu'une fois le serveur arrêté. Aucun ne
// survit à son runtime. Seul module qui lance la commande de service.
//
// Un serveur lancé dit aussi l'écran à regarder de sa livraison (`ecran.ts`) :
// c'est de lui que se calcule la page à ouvrir, jamais la racine du site.
//
// Un projet qui déclare son `lancement` — une app qui ne s'ouvre pas dans un
// navigateur — n'a pas de serveur : rien n'est lancé, aucun port n'est pris,
// aucune page n'est dite. Le worktree de sa livraison est tenu tout de même,
// comme sous un serveur, pour qu'on y lance l'app ; le journal dit comment
// voir son écran.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { envelopper, type Cloison } from "./cloison.ts";
import { commentLeVoir, ecranDeLaLivraison } from "./ecran.ts";
import type { FaitService, FinDeService } from "./evenements/service.ts";
import { masquerIdentifiants } from "./identifiants.ts";
import type { Journal } from "./journal.ts";
import { servicesIndisponibles } from "./projections/service.ts";
import { serviceDuWorktree, toucheInterface } from "./service.ts";

// Ce qu'on laisse à un serveur pour finir après SIGTERM, avant SIGKILL.
const GRACE_MS = 2000;
// La cadence à laquelle le port d'un serveur qui démarre est sondé.
const SONDE_MS = 250;
// Ce qu'on laisse à la sortie d'une commande pour se fermer une fois qu'elle a fini.
const DELAI_DE_FERMETURE_MS = 1000;
// Ce que le journal garde de ce qu'a dit une commande sortie d'elle-même.
const FIN_MAX = 1000;
const SORTIE_MAX = 16 * 1024;

export type Livraison = {
  ticket: number;
  run: string;
  // Le worktree du cook qui l'a faite, et son chemin tel que le journal le
  // porte : relatif au répertoire d'état.
  worktree: string;
  relatif: string;
  branche: string;
  // Les fichiers qu'elle change (`depot.changes`).
  changes: string[];
  // Ce que son cook a livré, là où il déclare l'écran à regarder : le corps de
  // sa PR. Nul : il n'a rien dit.
  corps: string | null;
  // L'environnement que le setup du worktree a rendu : lui seul porte le port.
  env: NodeJS.ProcessEnv;
  // Le masque des secrets du projet que `env` porte.
  masquer?: (texte: string) => string;
};

export type OptionsServeurs = {
  journal: Journal;
  projet: string;
  station: string;
  auteur: string;
  // La cloison dans laquelle part la commande. Absente : elle tourne sous le
  // compte du runtime, sans rien autour.
  cloison?: Cloison | null;
  avertir: (message: string) => void;
  // Appelé une fois un serveur arrêté, sauf quand le runtime s'en va : son
  // worktree n'a plus de raison de rester.
  ranger: (serveur: { ticket: number; relatif: string; branche: string }) => Promise<void>;
  graceMs?: number;
  sondeMs?: number;
};

export type Serveurs = {
  // Sert la livraison si elle touche l'interface et que son worktree est
  // servable. Vrai : un serveur est lancé, ou le worktree d'une app à lancer
  // est tenu — il ne doit pas être rangé tant qu'il l'est. Faux : rien n'est lancé, et ce qui
  // l'empêche, si ce n'est pas la livraison elle-même, est dit.
  servir(livraison: Livraison): boolean;
  // Arrête le serveur du ticket, s'il en a un, ou relâche le worktree qu'il
  // tient. Résolue une fois le serveur mort et son worktree rangé.
  arreter(ticket: number, motif: Exclude<FinDeService, "exited" | "shutdown" | "removed">): Promise<void>;
  // Le worktree est en train d'être rangé par un autre que le serveur : celui
  // qui y tournait s'arrête d'abord, et ne rend rien au rangement — il est déjà
  // en cours. Résolue une fois le serveur mort ; rien à attendre si aucun
  // serveur ne tient ce worktree (`relatif` : tel que le journal le porte).
  liberer(relatif: string): Promise<void>;
  // Les tickets dont un serveur tourne.
  tenus(): number[];
  // Les tickets dont le serveur tourne dans un worktree qui n'existe plus.
  orphelins(): number[];
  // Le runtime s'en va : tout serveur meurt sur-le-champ, et rien n'est rangé.
  fermer(): void;
};

// Ce qui tient un worktree : un serveur, ou — `pid` et `port` nuls — rien qui
// tourne, pour une app qu'on lance soi-même.
type Tenu = {
  ticket: number;
  relatif: string;
  worktree: string;
  port: number | null;
  pid: number | null;
  // Pourquoi il est arrêté. Nul : personne ne l'a demandé.
  motif: FinDeService | null;
  sonde?: NodeJS.Timeout;
  grace?: NodeJS.Timeout;
  // Sans serveur : ce qui relâche le worktree, aussitôt.
  relacher?: (motif: Exclude<FinDeService, "exited">) => void;
  fini: Promise<void>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirServeurs(options: OptionsServeurs): Serveurs {
  const { journal, projet, station, avertir } = options;
  const { base } = journal;
  const graceMs = options.graceMs ?? GRACE_MS;
  const sondeMs = options.sondeMs ?? SONDE_MS;
  const noter = (ticket: number | null, fait: FaitService) => journal.ajouter({ project: projet, ticket, author: options.auteur, ...fait });
  const tenus = new Map<number, Tenu>();
  // Vrai dès que le runtime s'en va : plus rien ne s'écrit, plus rien ne part.
  let ferme = false;

  const signaler = (tenu: Tenu, signal: NodeJS.Signals) => {
    if (tenu.pid === null) return;
    try {
      process.kill(-tenu.pid, signal);
    } catch {
      // Déjà mort.
    }
  };

  // Ce qui empêche de servir se dit une fois : quand le motif change, pas à
  // chaque livraison. Un projet qui ne déclare rien n'a rien de cassé — il se
  // lit dans `station` et `status` ; une déclaration qui ne sert pas, si.
  const indisponible = (ticket: number, declared: boolean, why: string) => {
    const neuf = base.transaction(() => {
      const dit = servicesIndisponibles(base, station)[0];
      if (dit?.declared === declared && dit.why === why) return false;
      noter(null, { type: "service.unavailable", payload: { station, declared, why, delivery: ticket } });
      return true;
    });
    if (neuf && declared) avertir(`brigade : livraison du ticket #${ticket} non servie, aucun serveur n'est lancé — ${why}`);
  };
  const disponible = () => {
    base.transaction(() => {
      if (servicesIndisponibles(base, station).length > 0) noter(null, { type: "service.available", payload: { station } });
    });
  };

  // Le port répond-il ? La sonde revient tant que le serveur démarre, et se
  // tait dès qu'il écoute, ou qu'il n'est plus là.
  const sonder = (tenu: Tenu) => {
    const { port } = tenu;
    if (port === null) return;
    const encore = () => !ferme && tenu.motif === null && tenus.get(tenu.ticket) === tenu;
    tenu.sonde = setTimeout(() => {
      if (!encore()) return;
      const prise = connect({ host: "127.0.0.1", port });
      prise.unref();
      prise.once("connect", () => {
        prise.destroy();
        if (encore()) noter(tenu.ticket, { type: "service.listening", payload: { worktree: tenu.relatif, port } });
      });
      prise.once("error", () => {
        prise.destroy();
        if (encore()) sonder(tenu);
      });
    }, sondeMs);
    tenu.sonde.unref();
  };

  // L'écran à regarder : ce que la déclaration d'écrans du dépôt dit mal
  // ne l'empêche pas d'être servi, mais se dit.
  const ecranLu = (livraison: Livraison) => {
    const { ecran, problemes } = ecranDeLaLivraison({ worktree: livraison.worktree, corps: livraison.corps, changes: livraison.changes });
    if (problemes.length > 0) avertir(`brigade : écran de la livraison du ticket #${livraison.ticket} lu sans les lignes mal écrites — ${problemes.join(" ; ")}`);
    return ecran;
  };

  // L'app ne s'ouvre pas dans un navigateur : rien n'est lancé, le worktree
  // est tenu, et le journal dit comment voir son écran. Relâché, il se range
  // aussitôt — rien à attendre, rien ne tourne.
  const tenir = (livraison: Livraison, lancement: string): boolean => {
    const { ticket, relatif } = livraison;
    disponible();
    const ecran = ecranLu(livraison);
    let rendre = () => {};
    const tenu: Tenu = { ticket, relatif, worktree: livraison.worktree, port: null, pid: null, motif: null, fini: new Promise<void>((resoudre) => void (rendre = resoudre)) };
    tenu.relacher = async (motif) => {
      if (tenus.get(ticket) === tenu) tenus.delete(ticket);
      try {
        // L'arrêt du runtime l'a déjà dit, et le journal se ferme.
        if (ferme) return;
        noter(ticket, { type: "service.released", payload: { worktree: relatif, reason: motif } });
        // `removed` : le rangement qui le relâche est en cours, il n'y revient pas.
        if (motif !== "removed") await options.ranger({ ticket, relatif, branche: livraison.branche });
      } catch (erreur) {
        if (!ferme) avertir(`brigade : la fin du worktree tenu du ticket #${ticket} (${relatif}) n'a pas pu être racontée — ${message(erreur)}`);
      } finally {
        rendre();
      }
    };
    tenus.set(ticket, tenu);
    const how = commentLeVoir({ worktree: livraison.worktree, lancement, ecran });
    const screen = ecran === null ? null : { name: ecran.ecran, sentence: ecran.phrase, source: ecran.source };
    noter(ticket, { type: "service.held", payload: { station, run: livraison.run, worktree: relatif, branch: livraison.branche, launch: lancement, how, screen } });
    return true;
  };

  const arreter = (tenu: Tenu, motif: Exclude<FinDeService, "exited">) => {
    if (tenu.motif === null && tenu.relacher) {
      tenu.motif = motif;
      tenu.relacher(motif);
    } else if (tenu.motif === null) {
      tenu.motif = motif;
      clearTimeout(tenu.sonde);
      signaler(tenu, "SIGTERM");
      tenu.grace = setTimeout(() => signaler(tenu, "SIGKILL"), graceMs);
      tenu.grace.unref();
    }
    return tenu.fini;
  };

  return {
    servir(livraison) {
      if (ferme) return false;
      const { ticket, relatif } = livraison;
      const service = serviceDuWorktree(livraison.worktree, livraison.env);
      if (!service.servable) {
        indisponible(ticket, service.declare, service.pourquoi);
        return false;
      }
      if (toucheInterface(service.interface, livraison.changes).length === 0) {
        disponible();
        return false;
      }
      if (service.regard === "lancement") return tenir(livraison, service.lancement);
      // Un port n'a qu'un serveur : le second mourrait sur le port du premier,
      // et la page montrerait la livraison d'un autre.
      const voisin = [...tenus.values()].find((tenu) => tenu.port === service.port);
      if (voisin) {
        indisponible(ticket, true, `le port ${service.port} est déjà celui du serveur du ticket #${voisin.ticket} (${voisin.relatif}) : le setup du projet doit attribuer un port par worktree`);
        return false;
      }
      disponible();
      const ecran = ecranLu(livraison);

      // Son propre groupe de process : arrêté, le serveur meurt avec tout ce
      // qu'il a lancé.
      const lancement = envelopper(options.cloison, { commande: "bash", args: ["-c", service.commande] }, { cwd: livraison.worktree, depot: "ecriture" });
      const enfant = spawn(lancement.commande, lancement.args, { cwd: livraison.worktree, env: livraison.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
      let sortie = "";
      const lire = (morceau: Buffer) => void (sortie = (sortie + morceau.toString()).slice(-SORTIE_MAX));
      enfant.stdout?.on("data", lire);
      enfant.stderr?.on("data", lire);
      const dite = () => {
        const fin = sortie.trim();
        return masquerIdentifiants(livraison.masquer?.(fin) ?? fin).texte.slice(-FIN_MAX);
      };
      if (enfant.pid === undefined) {
        // Une commande impossible à lancer n'a pas de process : elle le dit.
        enfant.once("error", (erreur) => {
          if (!ferme) avertir(`brigade : serveur du ticket #${ticket} impossible à lancer (${relatif}) — ${erreur.message}`);
        });
        return false;
      }

      let rendre = () => {};
      const tenu: Tenu = { ticket, relatif, worktree: livraison.worktree, port: service.port, pid: enfant.pid, motif: null, fini: new Promise<void>((resoudre) => void (rendre = resoudre)) };
      tenus.set(ticket, tenu);
      const screen = ecran === null ? null : { name: ecran.ecran, sentence: ecran.phrase, source: ecran.source };
      noter(ticket, { type: "service.started", payload: { station, run: livraison.run, worktree: relatif, branch: livraison.branche, port: service.port, pid: enfant.pid, screen } });
      sonder(tenu);

      let conclu = false;
      const conclure = async (code: number | null, signal: string | null) => {
        if (conclu) return;
        conclu = true;
        clearTimeout(tenu.sonde);
        clearTimeout(tenu.grace);
        enfant.stdout?.destroy();
        enfant.stderr?.destroy();
        if (tenus.get(ticket) === tenu) tenus.delete(ticket);
        try {
          // L'arrêt du runtime l'a déjà dit, et le journal se ferme.
          if (ferme) return;
          const reason = tenu.motif ?? "exited";
          const tail = reason === "exited" ? dite() : "";
          noter(ticket, { type: "service.stopped", payload: { worktree: relatif, port: service.port, reason, code, signal, ...(tail === "" ? {} : { tail }) } });
          if (reason === "exited") {
            avertir(
              [`brigade : le serveur du ticket #${ticket} (${relatif}, port ${service.port}) s'est arrêté seul — ${code === null ? `signal ${signal}` : `code de sortie ${code}`}`, tail].filter(Boolean).join("\n"),
            );
          }
          // `removed` : le rangement qui l'a arrêté est en cours, il n'y revient pas.
          if (reason !== "removed") await options.ranger({ ticket, relatif, branche: livraison.branche });
        } catch (erreur) {
          if (!ferme) avertir(`brigade : la fin du serveur du ticket #${ticket} (${relatif}) n'a pas pu être racontée — ${message(erreur)}`);
        } finally {
          rendre();
        }
      };
      enfant.once("error", () => void conclure(null, null));
      // La fin est connue dès que la commande sort — pas à la fermeture de sa
      // sortie, qu'un process laissé derrière elle tiendrait ouverte. Rien ne
      // survit à son serveur : ce qui reste du groupe est tué maintenant, et
      // plus aucun signal ne part ensuite — le numéro du groupe peut être
      // réattribué à un inconnu. Ce qui restait à lire de sa sortie est lu.
      enfant.once("exit", (code, signal) => {
        clearTimeout(tenu.grace);
        signaler(tenu, "SIGKILL");
        const fini = () => void conclure(code, signal);
        enfant.once("close", fini);
        setTimeout(fini, DELAI_DE_FERMETURE_MS).unref();
      });
      return true;
    },
    arreter(ticket, motif) {
      const tenu = tenus.get(ticket);
      return tenu ? arreter(tenu, motif) : Promise.resolve();
    },
    liberer(relatif) {
      const tenu = [...tenus.values()].find((candidat) => candidat.relatif === relatif);
      if (!tenu) return Promise.resolve();
      return arreter(tenu, "removed");
    },
    tenus: () => [...tenus.keys()],
    orphelins: () => [...tenus.values()].filter((tenu) => !existsSync(tenu.worktree)).map((tenu) => tenu.ticket),
    fermer() {
      if (ferme) return;
      const relaches: Tenu[] = [];
      for (const tenu of tenus.values()) {
        clearTimeout(tenu.sonde);
        clearTimeout(tenu.grace);
        signaler(tenu, "SIGKILL");
        try {
          if (tenu.port === null) noter(tenu.ticket, { type: "service.released", payload: { worktree: tenu.relatif, reason: "shutdown" } });
          else noter(tenu.ticket, { type: "service.stopped", payload: { worktree: tenu.relatif, port: tenu.port, reason: "shutdown", code: null, signal: "SIGKILL" } });
        } catch (erreur) {
          avertir(`brigade : arrêt du serveur du ticket #${tenu.ticket} non écrit au journal — ${message(erreur)}`);
        }
        if (tenu.relacher) relaches.push(tenu);
      }
      ferme = true;
      // Rien ne tourne sous un worktree tenu sans serveur : il est relâché
      // sur-le-champ, et rien n'est rangé.
      for (const tenu of relaches) if (tenu.motif === null) tenu.relacher?.("shutdown");
      tenus.clear();
    },
  };
}
