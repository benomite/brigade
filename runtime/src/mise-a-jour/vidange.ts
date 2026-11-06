// La station de la box se vide avant que sa mise à jour ne la relance (#2547).
// Chaque installation relance la station, et l'arrêt du runtime tue les cooks
// de l'état GitHub seul : relancée toutes les 35 à 45 min tant que les merges
// viennent, elle coupait les cooks en vol, qui repartaient de zéro — 20
// sessions de cook en une journée, et le premier cook de #2547 lui-même. Le
// ticket est rendu sans attente depuis #2543 ; le travail coupé, lui, était
// perdu.
//
// Une version prête, la mise à jour (root) pose sa demande dans son
// répertoire (`vidange`) ; la station la lit, ne prend plus de ticket
// (`retenirLaPrise`, comme celle de l'ordinateur, #2189) et dit dans le sien
// (`en-vol`) ses cooks en vol et la demande qu'elle a vue. L'installation
// attend qu'ils aient fini, au plus `VIDANGE_MAX_MS` : un cook plus long est
// coupé comme avant. Une station qui ne dit rien de ses cooks — d'avant ce
// fichier — est installée sans attendre. La demande porte son terme : une mise
// à jour tuée pendant la vidange ne retient pas la station au-delà.
//
// Depuis #2586, la station ne se vide plus : elle prend ses tickets pendant que
// la mise à jour attend, et se dit prête (`prete` dans `en-vol`) au premier
// moment sans cook en vol, ou à l'échéance de la demande, une fois le travail
// de ses cooks sauvé sur leur branche (`attente/attente.ts`).
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { attendreLaRelance } from "./attente/attente.ts";
import { versionDuRuntime } from "./en-service.ts";

export const VIDANGE = "vidange";
export const EN_VOL = "en-vol";
// Le plus long qu'une installation attend les cooks en vol.
export const VIDANGE_MAX_MS = 15 * 60_000;
// Le temps laissé à la station pour dire qu'elle a vu la demande — et, passé
// l'échéance, pour sauver ses cooks en vol.
export const ACCUSE_MS = 30_000;
// Ce que la demande dure au-delà de la vidange : le temps d'installer.
const MARGE_MS = 5 * 60_000;

// `version` : celle qui sera installée. `echeance` (ISO) : l'heure où la
// station se relance au plus tard, ses cooks en vol sauvés (#2586) ; absente
// d'une demande d'avant, c'est son terme moins la marge. `jusqua` (ISO) : son terme.
export type DemandeDeVidange = { version: string; jusqua: string; echeance?: string };
// `vidange` : la version de la demande que la station a vue, nulle sans demande.
// `prete` : la station est prête pour sa relance vers cette version (#2586).
export type EnVol = { pid: number; vidange: string | null; cooks: number[]; prete?: boolean };

const pause = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms));

function ecrire(fichier: string, valeur: unknown): void {
  writeFileSync(`${fichier}.${process.pid}`, `${JSON.stringify(valeur)}\n`);
  renameSync(`${fichier}.${process.pid}`, fichier);
}

export function lireDemandeDeVidange(dossier: string): DemandeDeVidange | null {
  try {
    const lu = JSON.parse(readFileSync(join(dossier, VIDANGE), "utf8")) as Partial<DemandeDeVidange>;
    if (typeof lu.version !== "string" || typeof lu.jusqua !== "string") return null;
    return { version: lu.version, jusqua: lu.jusqua, ...(typeof lu.echeance === "string" ? { echeance: lu.echeance } : {}) };
  } catch {
    return null;
  }
}

export function lireEnVol(racine: string): EnVol | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, EN_VOL), "utf8")) as Partial<EnVol>;
    if (typeof lu.pid !== "number" || !Array.isArray(lu.cooks)) return null;
    return { pid: lu.pid, vidange: typeof lu.vidange === "string" ? lu.vidange : null, cooks: lu.cooks.filter((n): n is number => typeof n === "number"), ...(lu.prete === true ? { prete: true } : {}) };
  } catch {
    return null;
  }
}

export function retirerLaDemande(dossier: string): void {
  rmSync(join(dossier, VIDANGE), { force: true });
}

// Côté station : tant qu'une demande vers une autre version que la sienne
// court, elle prend ses tickets et attend le moment de sa relance (#2586) — elle
// ne se retient que de sa sauvegarde à sa relance. Elle dit ses cooks en vol
// toutes les `intervalleMs`. N'empêche jamais le process de sortir.
export function tenirLaVidange(options: {
  racine: string;
  dossier: string;
  enVol: () => number[];
  // Sauve le travail de ses cooks en vol sur leur branche ; rend leurs tickets.
  sauver?: () => Promise<number[]>;
  version?: string;
  pid?: number;
  maintenant?: () => Date;
  intervalleMs?: number;
  dire?: (ligne: string) => void;
}): { retenue(): boolean; arreter(): void } {
  const version = options.version ?? versionDuRuntime();
  const pid = options.pid ?? process.pid;
  const maintenant = options.maintenant ?? (() => new Date());
  const fichier = join(options.racine, EN_VOL);
  const courante = (): (DemandeDeVidange & { echeance: string }) | null => {
    const demande = lireDemandeDeVidange(options.dossier);
    if (demande === null || demande.version === version || Date.parse(demande.jusqua) <= maintenant().getTime()) return null;
    return { ...demande, echeance: demande.echeance ?? new Date(Date.parse(demande.jusqua) - MARGE_MS).toISOString() };
  };
  const visee = (): string | null => courante()?.version ?? null;
  let ecrit = "";
  let ditEchec = false;
  let ditVidange: string | null = null;
  const attente = attendreLaRelance({
    enVol: options.enVol,
    sauver: options.sauver ?? (async () => []),
    prete: () => annoncer(),
    maintenant: () => maintenant().getTime(),
    ...(options.dire === undefined ? {} : { dire: options.dire }),
  });
  function annoncer(): void {
    const demande = courante();
    const vidange = demande?.version ?? null;
    if (demande !== null && vidange !== ditVidange) options.dire?.(`brigade : station — sa mise à jour vers ${demande.version} attend : elle prend encore ses tickets, et se relance dès qu'aucun cook n'est en vol, au plus tard à ${demande.echeance}, leur travail sauvé sur leur branche`);
    ditVidange = vidange;
    const prete = attente.veiller(demande === null ? null : Date.parse(demande.echeance));
    const texte = `${JSON.stringify({ pid, vidange, cooks: [...options.enVol()].sort((a, b) => a - b), ...(prete ? { prete: true } : {}) } satisfies EnVol)}\n`;
    if (texte === ecrit) return;
    try {
      writeFileSync(`${fichier}.${pid}`, texte);
      renameSync(`${fichier}.${pid}`, fichier);
      ecrit = texte;
      ditEchec = false;
    } catch (erreur) {
      if (!ditEchec) options.dire?.(`brigade : station — ses cooks en vol ne s'écrivent pas (${fichier}) : ${(erreur as Error).message} ; sa mise à jour les coupera`);
      ditEchec = true;
    }
  }
  annoncer();
  const veille = setInterval(annoncer, options.intervalleMs ?? 2000);
  veille.unref();
  return { retenue: () => visee() !== null && attente.retenue(), arreter: () => clearInterval(veille) };
}

// Côté mise à jour : pose la demande vers `visee`, puis attend que la station
// en service (`pid`) dise l'avoir vue sans cook en vol, ou prête — au plus
// jusqu'à `echeance` (celle du lot, donnée ; à défaut, dans `maxMs`), plus le
// temps de sauver ses cooks. Rend toujours : ce qu'elle a constaté se dit, puis
// l'installation se fait.
export async function viderLaStation(options: {
  racine: string;
  dossier: string;
  visee: string;
  pid: () => number;
  dire: (ligne: string) => void;
  maxMs?: number;
  echeance?: Date;
  accuseMs?: number;
  pasMs?: number;
  maintenant?: () => Date;
}): Promise<void> {
  const { racine, dossier, visee, dire } = options;
  const maxMs = options.maxMs ?? VIDANGE_MAX_MS;
  const accuseMs = options.accuseMs ?? ACCUSE_MS;
  const pasMs = options.pasMs ?? 1000;
  const maintenant = options.maintenant ?? (() => new Date());
  const debut = Date.now();
  const echeance = (options.echeance ?? new Date(maintenant().getTime() + maxMs)).getTime();
  ecrire(join(dossier, VIDANGE), { version: visee, echeance: new Date(echeance).toISOString(), jusqua: new Date(echeance + MARGE_MS).toISOString() } satisfies DemandeDeVidange);
  let attendus = "";
  for (;;) {
    const enVol = lireEnVol(racine);
    const ecoule = Date.now() - debut;
    // Aucun mot de ses cooks sous son pid : une station d'avant la vidange.
    if (enVol === null || enVol.pid !== options.pid()) return;
    if (enVol.vidange === visee) {
      if (enVol.cooks.length === 0) {
        if (attendus !== "") dire(`brigade : mise à jour — la station n'a plus de cook en vol : ${visee} s'installe`);
        return;
      }
      const liste = enVol.cooks.map((n) => `#${n}`).join(", ");
      if (enVol.prete === true) {
        dire(`brigade : mise à jour — échéance passée, la station est prête, ses cooks en vol sauvés sur leur branche (${liste}) : ${visee} s'installe, ils seront repris`);
        return;
      }
      // Une station d'avant #2586, ou une sauvegarde qui ne finit pas.
      if (maintenant().getTime() >= echeance + accuseMs) {
        dire(`brigade : mise à jour — ${enVol.cooks.length} cook(s) encore en vol à l'échéance (${liste}) : ${visee} s'installe, ils sont coupés`);
        return;
      }
      if (liste !== attendus) dire(`brigade : mise à jour — ${visee} attend un moment sans cook en vol de la station (${liste}), au plus tard ${new Date(echeance).toISOString()} ; elle prend encore ses tickets`);
      attendus = liste;
    } else if (ecoule >= accuseMs) {
      dire(`brigade : mise à jour — la station n'a pas vu la demande de vidange en ${Math.round(accuseMs / 1000)} s : ${visee} s'installe sans attendre ses cooks`);
      return;
    }
    await pause(pasMs);
  }
}
