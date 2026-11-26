// L'issue de roadmap que la ligne « Roadmap » du `CLAUDE.md` nomme —
// `- **Roadmap** : issue #1 (writer unique = Manager)`, telle que
// `/brigade:init` l'écrit —, ou null. Sans import ni E/S : le manager la lit
// (reglages.ts, en-vigueur.ts), et l'app la relit sur GitHub pour écarter la
// roadmap du Backlog (app/src/tableau/read.ts, #3589).
export function roadmapDuClaudeMd(claudeMd: string): number | null {
  const [, numero] = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Roadmap(?:\*\*)?[ \t]*:[ \t]*(?:issue[ \t]+)?`?#([1-9][0-9]*)\b/im.exec(claudeMd) ?? [];
  return numero === undefined ? null : Number(numero);
}
