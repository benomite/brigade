// The partition facts: what separates a project's launches from the rest of
// the machine, and what the project's network lets through.

// `sandbox`: null, no launch is partitioned. `proxy`: null, the network is
// open. `enforced`: a direct send, attempted at startup, was refused by the
// kernel (true), went through (false) — null if nothing could be tested.
export type PartitionState = {
  sandbox: { bin: string; hidden: string[]; credentials: string } | null;
  proxy: { port: number; enforced: boolean | null } | null;
};

export type PartitionFact =
  // The partition's state, written by the runtime at startup when it changes.
  | { type: "isolation.configured"; payload: PartitionState }
  // The hosts the repository declares on its integration branch, written when
  // they change: the door reads its list here. `problems`: the lines of the
  // declaration that open nothing.
  | { type: "network.declared"; payload: { base: string; hosts: string[]; problems: string[] } }
  // The door refused an outbound connection. At most one event per host per
  // ten minutes, and a hundred hosts per ten minutes; `count`: the attempts
  // since the previous one. `host` "*": the excess hosts, counted together.
  | { type: "network.refused"; payload: { host: string; port: number; count: number } };
