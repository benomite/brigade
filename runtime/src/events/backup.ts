// The fact the backup logs: it succeeded. Written by the `backup` command,
// from its own process, after the snapshot — which therefore does not contain it.
export type BackupFact = {
  type: "backup.completed";
  // `name`: the backup's name in its destination. `lastSeq`, `events`: how far
  // the log it carries goes. `streams`: the raw streams kept.
  payload: { name: string; lastSeq: number; events: number; streams: number };
};
