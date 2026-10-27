// Les faits d'une station distante : ce qu'elle demande à la box, et ce que le
// runtime lui répond. La station ne tourne pas sur la machine du runtime, et
// la box n'a aucun chemin vers elle : c'est elle qui vient, par GitHub
// (`tirer-par-github/`), faire écrire sa demande ici ; le runtime qui tourne la lit à son
// réveil et y répond de même. Rien ne part de la box vers la station.
import type { Plafonds } from "./guardrails.ts";

// Ce qu'une station distante peut demander : s'annoncer, réclamer un ticket,
// renouveler le bail de celui qu'elle cuisine, le rendre — livré, ou non.
export type Geste = "announce" | "claim" | "renew" | "deliver";

// Ce que la station dit du bac à sable de son poste, quand elle s'annonce ou
// réclame (`bac-a-sable/ordinaires.ts`) : c'est d'après lui que la box lui
// prête, ou non, un ticket ordinaire. Disponible : la version de son `claude`,
// le répertoire du compte, celui où elle pose les worktrees des cooks de ce
// projet — le worktree d'un cook est `<worktrees>/<run>` — et les caches du
// projet où un cook écrit aussi. Tous absolus, comme le poste les voit.
export type BacASableDeLaStation =
  | { available: true; version: string; home: string; worktrees: string; caches: string[] }
  | { available: false; reason: string };

export type Demande =
  | { verb: "announce"; sandbox?: BacASableDeLaStation }
  | { verb: "claim"; sandbox?: BacASableDeLaStation }
  // `proof` : l'empreinte du worktree du cook, telle que la station la lit à
  // cet instant — c'est d'elle que dépend le bail. `turns`, `tokens` : ce que
  // le cook a consommé jusqu'ici — c'est d'eux que dépendent les plafonds.
  | { verb: "renew"; run: string; proof: string | null; turns: number; tokens: number }
  // `ending` : `delivered`, le cook a conclu et sa branche est poussée sur
  // l'origine ; `failed`, il n'a rien livré. `message` : son dernier message.
  | { verb: "deliver"; run: string; ending: "delivered" | "failed"; reason: string | null; message: string | null; turns: number; tokens: number };

// Ce que la box remet à la station avec un ticket : de quoi lancer le même
// cook qu'elle, sous les mêmes bornes. Aucun secret, aucun jeton, aucun grant.
export type Mission = {
  ticket: number;
  title: string;
  run: string;
  // La branche du cook : neuve, à partir de `base`, ou celle de la livraison
  // que la pass a renvoyée (`resumes`), ou celle du travail conservé d'un cook
  // perdu en route (`resumes`, sans renvoi : `returns` à 0). Dans les deux
  // derniers cas, la station la reprend telle que l'origine la porte.
  branch: string;
  base: string;
  repository: string;
  model: string;
  effort: string;
  // La consigne du cook, et les arguments de `claude` — ceux d'un cook de la
  // box. Pour un ticket ordinaire, ils portent la configuration du bac à
  // sable (`--settings`) et `sandbox` est vrai : la station lance `claude`
  // avec ces arguments tels quels, rien de plus.
  prompt: string;
  args: string[];
  sandbox?: true;
  limits: Plafonds;
  leaseMs: number;
  leaseUntil: string;
  resumes: { returns: number; pr: string | null } | null;
};

// Pourquoi une demande n'est pas servie. `stopped` : le cook de ce run est
// arrêté côté box — `stop` dit par quoi —, la station arrête le sien.
export type Refus =
  | "unknown-station"
  | "not-remote"
  | "late"
  | "unknown-run"
  | "stopped"
  | "no-progress"
  | "invalid";

export type Reponse =
  | { ok: true; verb: "announce"; provides: string[]; maxCooks: number; presenceMs: number; leaseMs: number; limits: Plafonds }
  // `mission` nulle : rien à prendre pour l'instant. `held` : ce qui retient
  // la station, si quelque chose la retient.
  | { ok: true; verb: "claim"; mission: Mission | null; held: string | null }
  | { ok: true; verb: "renew"; leaseUntil: string }
  // `ending` : ce que la box a retenu de la livraison.
  | { ok: true; verb: "deliver"; ending: string; reason: string | null }
  // `leaseUntil` : l'échéance du bail, quand le cook tourne encore.
  | { ok: false; verb: Geste; refusal: Refus; said: string; stop?: string | null; leaseUntil?: string | null };

export type FaitDistante =
  // La demande d'une station, écrite pour elle. `id` : ce par quoi la
  // réponse la retrouve. `via` : `github`, la demande que la station a posée
  // dans son gist et que la principale a relayée ici (`tirer-par-github/`) —
  // sa réponse se publie au Kitchen board ; absent, une demande écrite directement au journal.
  | { type: "remote.asked"; payload: { id: string; station: string; via?: "github" } & Demande }
  // La réponse du runtime.
  | { type: "remote.answered"; payload: { id: string; station: string } & Reponse };
