// The fact a move logs: the project's kitchen leaves this station for another
// (`demenagement/`). Written by the station it leaves, once its kitchen is
// closed and its cooks stopped, just before the snapshot that travels — the
// station that takes it over therefore finds it at the end of the log it
// receives, and reads there that it has already received it.
export type FaitDemenagement = {
  type: "kitchen.moved";
  // `from`, `to`: the stations, by their name. `askedAt`: when the move was
  // asked — what both stations recognise it by. `cooks`: the runs that were
  // still cooking, ended by the move (`cook.exited`, `cause: move`) — their
  // tickets went back to the rail, to be taken again on `to`.
  payload: { from: string; to: string; askedAt: string; cooks: string[] };
};
