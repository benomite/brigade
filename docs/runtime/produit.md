## The second, woken by the kitchen

When the backlog is drained, nothing fed the rail unless the chef had the Second tab open. The
runtime now wakes the second on its own (#1955), the way it launches the manager: no screen needs
to be open. The code is in `runtime/src/produit/cadence/`.

### When it runs

At each tick of the runtime (every minute), the second runs once when all of these hold:

- its switch is on (on by default), and so is the project — the project switch on, no `stop`, the
  breaker closed, the account neither out of quota nor disconnected;
- the rail is empty for a cook — tickets in WAITING do not count, as in `status` —, or an issue
  opened by someone other than the chef has waited more than a day with no label and no answer from
  a member or one of the kitchen's roles (polled once an hour while the rail is busy);
- its last run is older than `BRIGADE_PRODUCT_INTERVAL_HOURS` (4 by default);
- the day's cap is not reached.

A run is a judgement of the quota, under the guardrails, with the manager's identity and
calibration. The second answers with the issues it proposes; the code files them — never more than
the cap leaves —, each with `filed-by:product`, its `prio:`, and a last line that says it was filed
while the chef was away, and why.

### The daily cap

`BRIGADE_PRODUCT_DAILY_CAP` (3 by default) bounds the issues filed in a UTC day. It is counted on
GitHub, from the issues carrying `filed-by:product` created that day — one filed by hand counts too.
Once the cap is reached, nothing more runs that day, and the log says so once (`product.cap-reached`,
and a line in the runtime's output); the next day, the count starts again from zero. Both settings
belong to the project's unit: each project has its own.

### The off switch

One gesture turns it off, the same one turns it back on — written to the log, read at the next tick,
with no restart:

    BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/interrupteur.ts off
    BRIGADE_STATE_DIR=<state directory> node runtime/src/produit/cadence/interrupteur.ts on

A run in flight finishes and files what it proposed. With no argument, the command shows the line.

### In `status`

One line says where the second stands:

    product    ON — 1/3 filed today (2026-11-01, UTC), last run 2026-11-01T10:00:00.000Z

`OFF since … (by …)` when it is off, and `last run never` before its first run. The log keeps each run
(`product.ran`: why it was woken, what it filed, how it ended).
