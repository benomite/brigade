# A project's sandbox declaration

On the chef's Mac, every `claude` of a local kitchen runs in the sandbox of Claude Code ([`bac-a-sable.md`](bac-a-sable.md)).
A project can ask for a little more for its cooks in `.claude/brigade/bac-a-sable.json`, in its repository.
The station reads it from the integration branch at each launch (cook, reviewer, manager judgement), as it reads `.claude/brigade/reseau`.
Nothing is cached across launches: a change merged on the integration branch applies to the next launch.

Code: `runtime/src/bac-a-sable/declaration.ts` (format), `runtime/src/bac-a-sable/configuration.ts` (paths), `runtime/src/bac-a-sable/local.ts` (read at each launch).

## Format

```json
{"ports": [5037, 8080], "ecriture": ["~/.gradle", "build-cache"]}
```

| Key | Meaning |
|---|---|
| `ports` | TCP ports the cook may bind, on the loopback address only. An entry is a number (`5037`) or a loopback address with its port: `"127.0.0.1:5037"`, `"[::1]:5037"`, `"localhost:5037"`. |
| `ecriture` | Extra folders the cook may write, in addition to its worktree. Relative entries are relative to the worktree; absolute entries and entries starting with `~/` are taken as they are. |

Both keys are optional. Hosts are not declared here: they keep coming from `.claude/brigade/reseau`.

No file means the sandbox of today, unchanged.

## Hard limits

They are enforced in code. A declaration that breaks one is refused.

- **Keys**: only `ports` and `ecriture`; any other key is refused. Each one is a list.
- **Ports**: an integer from 1 to 65535, bound on loopback only (`127.0.0.1`, `::1`, `localhost`). `0.0.0.0` or any other address is refused: a port is never reachable from the network.
- **Writable folders**:
  - a relative entry stays under the worktree: an entry that leaves it with `..` is refused;
  - never the filesystem root (`/`), never the whole home (`~`), never a folder above the home;
  - never one of the chef's secrets, or a folder that contains one: the folders a cook may not even read (`~/.ssh`, `~/.gnupg`, `~/Library/Keychains`, `~/.config/gh`, `~/.git-credentials`, `~/.netrc`, `~/.aws`, `~/.azure`, `~/.config/gcloud`, `~/.kube`, `~/.docker`, `~/.terraform.d`, `~/.config/op`, `~/.config/brigade`, `~/.claude/.credentials.json`);
  - never Brigade's own state, or a folder that contains it: `~/.claude` as a whole, and the runtime's data directory (`BRIGADE_STATE_DIR` of the kitchen, the root of the station's states for the station of a machine);
  - never a path whose name contains `credential`, `token` or `secret`;
  - an entry is a plain path: no pattern (`*`, `?`, `[`, `]`, `{`, `}`), no parenthesis, no backslash.

### Ports and the sandbox of Claude Code

Claude Code's sandbox has no setting that binds one port: `sandbox.network.allowLocalBinding` is a single on/off switch, for loopback (checked in the settings schema of `claude` 2.1.300).
The declared ports are checked against the limits above, but the configuration does not change for them: `allowLocalBinding` stays `true` for every cook, as #3541 set it ([`bac-a-sable.md`](bac-a-sable.md)).

## Refusal

One entry outside the limits refuses the whole declaration: none of its ports or folders is applied, and the launch starts with today's sandbox.
The station says it once per launch, naming the entry and the limit it broke, for example:

```
brigade : the project's sandbox declaration is not applied, this launch starts without it — `.claude/brigade/bac-a-sable.json`, ecriture « ~/.ssh » : un dossier déclaré n'est ni ne contient les secrets du chef ou l'état de Brigade (/Users/chef/.ssh) — la déclaration est refusée en entier
```

A file that is not JSON, or that the station cannot read from the integration branch, is treated the same way: not applied, and said.

## Example

`.claude/brigade/bac-a-sable.json` of a project whose build binds port 5037 on loopback and keeps its caches in `~/.gradle`:

```json
{
  "ports": [5037],
  "ecriture": ["~/.gradle", "build-cache"]
}
```

With it, a cook writes in its worktree (which already holds `build-cache`), in the project's caches and in `/Users/<chef>/.gradle`.
