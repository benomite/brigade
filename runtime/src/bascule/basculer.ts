// La bascule d'une machine : ses projets, servis chacun par son unité, passent
// à la station. Joué une fois par le paquet, sous root, avant que la station ne
// démarre (`debian/postinst`) ; rejoué, il ne trouve plus rien à faire.
//
// Dans l'ordre : les anciennes unités s'arrêtent — leurs cooks en vol, que
// chacun un relais porte, continuent (`KillMode=process`) —, puis leurs
// portes, dont le port est remis à celles de la station ; puis chaque
// projet reçoit sa ligne dans la configuration de la station, son état laissé
// où il est : journal, décisions, verrou, runs et worktrees ne bougent pas
// d'un octet, la station y accède par `etat/<projet>`. Enfin, ce que
// l'ancienne installation avait posé dans le système part : unités, drop-ins,
// gestes, règles sudoers. La station qui démarre ensuite reprend chaque projet
// et ses cooks en vol, comme après une mise à jour.
import { spawnSync } from "../sans-invite.ts";
import { chownSync, existsSync, lchownSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lireEnService } from "../mise-a-jour/en-service.ts";
import { CONFIGURATION, ETATS } from "../station/configuration.ts";
import { ecrirePortes, FICHIER_PORTES, lirePortes } from "../station/portes.ts";
import type { Lieux, Plan } from "./ancienne.ts";

export type Systemctl = (args: string[]) => { code: number; sortie: string };

export const systemctl: Systemctl = (args) => {
  const rendu = spawnSync("systemctl", args, { encoding: "utf8" });
  return { code: rendu.status ?? 1, sortie: `${rendu.stdout ?? ""}${rendu.stderr ?? ""}`.trim() };
};

// Ce que la bascule note de son passage : quand la cuisine s'est arrêtée, ce
// qu'elle a repris, et — une fois la station en service — quand elle a repris.
export type Note = { arretee: string; projets: string[]; reprise: string | null };

export function lireNote(fichier: string): Note | null {
  try {
    const lu = JSON.parse(readFileSync(fichier, "utf8")) as Partial<Note>;
    if (typeof lu.arretee !== "string" || !Array.isArray(lu.projets)) return null;
    return { arretee: lu.arretee, projets: lu.projets.filter((p): p is string => typeof p === "string"), reprise: typeof lu.reprise === "string" ? lu.reprise : null };
  } catch {
    return null;
  }
}

function ecrireAtomique(fichier: string, texte: string, proprietaire?: { uid: number; gid: number }): void {
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.bascule.${process.pid}`;
  writeFileSync(provisoire, texte, { mode: 0o644 });
  if (proprietaire) chownSync(provisoire, proprietaire.uid, proprietaire.gid);
  renameSync(provisoire, fichier);
}

export class BasculeEnEchec extends Error {}

// Applique le plan. Lève `BasculeEnEchec` si une ancienne unité ne s'arrête
// pas : rien n'est alors écrit pour la station, et rien n'est retiré.
export function basculer(plan: Plan, ici: Lieux, options: { systemctl?: Systemctl; dire?: (ligne: string) => void; maintenant?: () => Date } = {}): Note {
  const lancer = options.systemctl ?? systemctl;
  const dire = options.dire ?? ((ligne: string) => console.log(ligne));
  const maintenant = options.maintenant ?? (() => new Date());
  const exiger = (args: string[]) => {
    const rendu = lancer(args);
    if (rendu.code !== 0) throw new BasculeEnEchec(`\`systemctl ${args.join(" ")}\` a rendu ${rendu.code}${rendu.sortie ? ` — ${rendu.sortie}` : ""}`);
  };

  // 1. Les anciennes unités s'arrêtent, et ne repartiront pas avec la machine.
  const arretee = maintenant().toISOString();
  if (plan.instances.length > 0) {
    dire(`bascule : arrêt des anciennes unités — ${plan.instances.join(", ")} ; leurs cooks en vol continuent, la station les reprendra`);
    exiger(["disable", "--now", ...plan.instances]);
  }
  for (const unite of plan.instances) {
    if (lancer(["is-active", "--quiet", unite]).code === 0) throw new BasculeEnEchec(`${unite} tourne encore après son arrêt : la station ne peut pas le reprendre`);
  }
  // Puis leurs portes : celles de la station prendront leurs ports. Leurs
  // cooks en vol restent sans réseau jusque-là.
  if (plan.portes.length > 0) {
    dire(`bascule : arrêt des anciennes portes — ${plan.portes.join(", ")} ; celles de la station reprennent leurs ports`);
    exiger(["disable", "--now", ...plan.portes]);
  }
  for (const unite of plan.portes) {
    if (lancer(["is-active", "--quiet", unite]).code === 0) throw new BasculeEnEchec(`${unite} tourne encore après son arrêt : la porte de la station ne peut pas reprendre son port`);
  }
  if (plan.renouvellement.length > 0) {
    const timer = plan.renouvellement.filter((u) => u.endsWith(".timer"));
    if (timer.length > 0) exiger(["disable", "--now", ...timer]);
    exiger(["stop", ...plan.renouvellement]);
  }

  // 2. Chaque projet entre dans la configuration de la station, son état en place.
  const proprietaire = existsSync(ici.station) ? statSync(ici.station) : null;
  const sien = proprietaire && { uid: proprietaire.uid, gid: proprietaire.gid };
  const etats = join(ici.station, ETATS);
  if (!existsSync(etats)) {
    mkdirSync(etats, { recursive: true, mode: 0o750 });
    if (sien) chownSync(etats, sien.uid, sien.gid);
  }
  for (const projet of plan.projets) {
    if (projet.dejaLie) continue;
    const lien = join(etats, projet.nom);
    symlinkSync(projet.etat, lien);
    if (sien) lchownSync(lien, sien.uid, sien.gid);
  }
  // Le port de chaque porte reprise, là où les portes de la station le
  // chercheront : chacune reprend le sien. Ce qu'elles tiennent déjà n'est
  // pas touché.
  const portes = join(ici.station, FICHIER_PORTES);
  const tenues = lirePortes(portes);
  const reprises = plan.projets.filter((projet) => projet.porte !== null && tenues.projets[projet.nom] === undefined);
  if (reprises.length > 0) {
    const projets = { ...tenues.projets };
    for (const projet of reprises) projets[projet.nom] = projet.porte ?? 0;
    ecrirePortes(portes, { station: tenues.station, projets }, sien ?? undefined);
  }
  const fichier = join(ici.station, CONFIGURATION);
  const avant = existsSync(fichier) ? readFileSync(fichier, "utf8") : "";
  const nouvelles = plan.projets.filter((projet) => !projet.dejaConfigure).map((projet) => projet.ligne);
  if (nouvelles.length > 0) {
    const entete = avant === "" ? "# Les projets de cette station, une ligne chacun : nom, dépôt, branche, réglages.\n" : avant.endsWith("\n") ? "" : "\n";
    ecrireAtomique(fichier, `${avant}${entete}${nouvelles.join("\n")}\n`, sien ?? undefined);
  }
  // Dès lors, ce qui reste à faire ne touche plus aux projets : la note de
  // l'arrêt est écrite, pour que la reprise se mesure même si la suite échoue.
  const note: Note = { arretee, projets: plan.projets.map((projet) => projet.nom), reprise: null };
  ecrireAtomique(ici.note, `${JSON.stringify(note)}\n`);
  for (const projet of plan.projets) {
    dire(`bascule : ${projet.nom} — repris par la station (${projet.depot}, branche ${projet.base}), son état laissé dans ${projet.etat}`);
    dire(
      projet.porte === null
        ? `bascule : ${projet.nom} — il n'avait pas de porte : la station lui en ouvre une, qui ne laisse passer que sa liste blanche`
        : `bascule : ${projet.nom} — sa porte reprise par la station : même port (127.0.0.1:${projet.porte}), même liste blanche, lue à son journal`,
    );
    if (projet.decisionsEcartees.length > 0) dire(`bascule : ${projet.nom} — ${projet.decisionsEcartees.join(", ")} dans son unité, non repris : une décision vit au journal du projet, que l'ancienne unité lisait déjà`);
    if (projet.reglagesDeLUnite.length > 0) dire(`bascule : ${projet.nom} — réglages de son unité non repris (${projet.reglagesDeLUnite.join(", ")}) : ceux de la station s'appliquent`);
  }
  for (const nom of plan.sansJournal) dire(`bascule : brigade@${nom}.service — aucun journal, rien à reprendre : son unité est retirée`);

  // 3. Ce que l'ancienne installation avait posé dans le système part.
  for (const chemin of [...plan.regles, ...plan.liens, ...plan.unites]) {
    rmSync(chemin, { recursive: true, force: true });
    dire(`bascule : retiré — ${chemin}`);
  }
  if (plan.geste) {
    unlinkSync(plan.geste.lien);
    symlinkSync(plan.geste.vers, plan.geste.lien);
    dire(`bascule : ${plan.geste.lien} pointe sur le geste du paquet (${plan.geste.vers}) : l'app lit ses projets comme avant`);
  }
  exiger(["daemon-reload"]);
  return note;
}

const duree = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};
const heure = (instant: Date) => instant.toTimeString().slice(0, 8);

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
};

// Attend que la station, démarrée, serve les projets que la bascule lui a
// remis, et dit combien de temps leur cuisine s'est arrêtée. Rend vrai quand
// elle les sert ; faux, en disant lesquels manquent et pourquoi, passé `delaiMs`.
export async function attendreLaReprise(ici: Lieux, options: { delaiMs?: number; dire?: (ligne: string) => void; maintenant?: () => Date } = {}): Promise<boolean> {
  const dire = options.dire ?? ((ligne: string) => console.log(ligne));
  const maintenant = options.maintenant ?? (() => new Date());
  const note = lireNote(ici.note);
  if (note === null || note.reprise !== null || note.projets.length === 0) return true;
  const limite = Date.now() + (options.delaiMs ?? 180_000);
  for (;;) {
    const enService = lireEnService(ici.station);
    const servis = enService !== null && vivant(enService.pid) ? enService.servis : [];
    const manquent = note.projets.filter((projet) => !servis.includes(projet));
    if (manquent.length === 0) {
      const reprise = maintenant();
      ecrireAtomique(ici.note, `${JSON.stringify({ ...note, reprise: reprise.toISOString() } satisfies Note)}\n`);
      const arretee = new Date(note.arretee);
      dire(
        `bascule : cuisine reprise par la station — ${note.projets.join(", ")} ; arrêtée ${duree(reprise.getTime() - arretee.getTime())}, de ${heure(arretee)} à ${heure(reprise)}`,
      );
      return true;
    }
    if (Date.now() >= limite) {
      const refuses = enService?.refuses ?? {};
      dire(`bascule : la station ne sert pas encore ${manquent.map((projet) => (refuses[projet] ? `${projet} (${refuses[projet]})` : projet)).join(", ")} — son journal de service dit pourquoi (journalctl -u brigade-station)`);
      return false;
    }
    await new Promise((resoudre) => setTimeout(resoudre, 500));
  }
}
