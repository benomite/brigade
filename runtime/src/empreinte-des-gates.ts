// Les mêmes gates ne se jouent pas deux fois sur le même code (épique #1313).
// Chaque passage écrit au journal porte son empreinte : l'arbre exact qu'il a
// jugé — ce qui n'était pas commité compris, quand il y en avait — et celle de
// la configuration des gates : leur script, le setup qui passe avant elles, et
// la déclaration des secrets qu'elles reçoivent. Le cook laisse les siennes par
// son reçu (`gates-du-cook.ts`), la pass écrit celles qu'elle joue.
//
// Avant de jouer les gates d'une livraison, la pass cherche le dernier passage
// du projet qui porte la même empreinte. Vert, elle le reprend : rien n'est
// lancé, son verdict nomme le passage repris (`Gates.reused`), et aucun
// `gates.ran` n'est écrit — une reprise ne coûte ni horloge ni processeur.
// Rouge, coupé, ou aucun : les gates se jouent en entier, comme avant.
//
// L'empreinte de la configuration se compare, elle ne se lit pas : c'est un
// condensé.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Base } from "./base.ts";
import type { CoureurDesGates, FaitGates } from "./events/gates.ts";
import type { Gates } from "./events/pass.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "./gates.ts";
import { DECLARATION } from "./secrets.ts";

const TYPE: FaitGates["type"] = "gates.ran";

export type EmpreinteDesGates = { tree: string; config: string };

// Le passage repris : son rang au journal, qui l'avait joué, pour quel ticket
// (nul : la base), et quand il a été écrit.
export type PassageRepris = { seq: number; runner: CoureurDesGates; ticket: number | null; at: string };

const condenser = (contenu: string | Buffer) => createHash("sha256").update(contenu).digest("hex");

// Un fichier du worktree, condensé ; null s'il n'y est pas. Un lien est suivi :
// c'est ce qu'il désigne qui sera joué.
const condenserLeFichier = (chemin: string): string | null => {
  try {
    return condenser(readFileSync(chemin));
  } catch {
    return null;
  }
};

// La configuration des gates d'un worktree, condensée : leur script, le setup,
// la déclaration des secrets. Le cook et la pass la lisent de même, chacun
// dans le worktree où les gates se jouent — celui du cook, la fusion de la
// pass. Ni l'environnement de l'un ou de l'autre, ni le plafond que le runtime
// pose aux siennes, ni la valeur des secrets n'y entrent : ce sont ceux du
// lancement, pas des gates, et ils ne sont jamais les mêmes des deux côtés.
export function empreinteDeConfig(worktree: string): string {
  const decrite = {
    gates: condenserLeFichier(join(worktree, SCRIPT_GATES)),
    setup: condenserLeFichier(join(worktree, SCRIPT_SETUP)),
    secrets: condenserLeFichier(join(worktree, DECLARATION)),
  };
  return condenser(JSON.stringify(decrite));
}

type Ligne = { seq: number; ticket: number | null; payload: string; at: string };

// Le dernier passage du projet sur cette empreinte, s'il était vert. Un
// passage plus récent rouge ou coupé sur la même empreinte l'emporte : ce
// qu'il a dit est ce que ce code fait aujourd'hui, et les gates se rejouent.
export function passageVert(base: Base, projet: string, empreinte: EmpreinteDesGates): PassageRepris | null {
  const lignes = base.lire<Ligne>("SELECT seq, ticket, payload, at FROM events WHERE type = ? AND project = ? ORDER BY seq DESC", TYPE, projet);
  for (const { seq, ticket, payload, at } of lignes) {
    const lu = JSON.parse(payload) as FaitGates["payload"];
    if (lu.tree !== empreinte.tree || lu.config !== empreinte.config) continue;
    return lu.outcome === "green" ? { seq: Number(seq), runner: lu.runner, ticket, at } : null;
  }
  return null;
}

const QUI: Record<CoureurDesGates, string> = { cook: "le cook", pass: "la pass" };

// Le verdict des gates reprises : vert, sans rien d'autre de ce qu'elles
// avaient dit — leur sortie n'est pas au journal —, et le passage qu'il reprend.
export function gatesReprises(repris: PassageRepris): Gates {
  const de = repris.ticket === null ? "la base" : `#${repris.ticket}`;
  return {
    outcome: "green",
    code: 0,
    failures: [],
    tail: `gates non rejouées : ${QUI[repris.runner]} les a déjà passées vertes sur le même arbre, avec la même configuration — passage ${repris.seq} du journal (${de}, ${repris.at})`,
    reused: repris,
  };
}
