# The app's buttons write into the terminal, they do not send — spec (#345)

**Date**: 2026-10-12
**Status**: three decisions validated by the Manager on `question-spec` (recorded on the issue);
the rest decided by the dev, as the issue asked, **to be contested in review**.
**Issue**: #345 (follow-up of #339, epic #294).

The behavior, as the chef experiences it, is in `docs/app.md` ("Les boutons écrivent, ils
n'envoient pas"): this document does not copy it.

## What was validated

1. **Six buttons, each one where what it changes is read**: `guardrails stop` and `resume` in the
   status panel; `grant enable|extend|revoke merge` in the Grants tab; `station cooks` in the Cooks
   tab. Rail, Log and the kitchen have none. Left out, for lack of a place where their fact is
   read: `manager`, `base replay`, `installation`, `partition probe`. The restart button of the
   stop banner comes with the banner (#346).
2. **The written form is that of "Piloter", from the workstation**, prefixed with `!` with no
   space: `!ssh <host> brigade <name> <command>`. Not the one the app and the second launch to
   read (`-o BatchMode=yes -o ConnectTimeout=10 --`): a command that is read before Enter must be
   short. A test compares it with the line of `docs/runtime.md`.
3. **Second stopped: launched, shown, nothing written**, and the note says to click again. Never a
   blind write: the app does not know when `claude` is ready, and a startup screen (folder trust)
   would receive the command as keystrokes.

## What the dev decided

4. **Always in the second, never in a shell.** The button brings you back to the Second tab.
5. **Typing in progress: the app writes after it, and says so.** It does not read the terminal;
   erasing the line (`Ctrl+U`) would have meant writing over the chef. The second's note says what
   was written, that nothing was sent, and where it went if he was typing.
6. **What the app says about a click lives in the second's note**, under the tabs — not one more
   banner. It replaces "thread resumed" until the second's next change of state.
7. **A command that carries a control character is not written** (`terminaux.inscrire`):
   `nom` and `hote` come from a JSON file, where a `\n` can be written — and a newline, even
   quoted, sends. It is the registry that holds "nothing sends", not the list of buttons.
8. **`nom` and `hote` are quoted for the Mac's shell** when it would split them; the name is
   also quoted for the box's (`cite`, from `box.ts`). A name the action accepts goes out as it is.
9. **The view names a button, not a command** (`boutons.ts`), as for the tabs.
10. **A project without `hote` has no button**; a project whose folder is missing shows its reason.

## What the review added (round 1)

11. **The limit is written down, not fixed**: `inscrire` writes whatever the screen of `claude`
    is. Facing a dialog with numbered choices or in vim mode outside insert, the characters are
    keystrokes. The app does not read the terminal: `docs/app.md` says so, and the second's note
    no longer promises more than "nothing was sent" — only that it did not write an Enter.
12. **An `hote` that starts with `-` gets no written command**: the doc's form has no `--`, so it
    would be an option of `ssh`. The button says why, without touching the second.
13. **A button that wrote nothing says so under the tabs**, where the chef is — refusal or error.

## Checked on the real thing

On `claude` 2.1.286, in a pty: `!ssh box brigade essai guardrails stop`, written in one block
without `\r`, switches the prompt to shell mode, the command inside, cursor after — nothing is
sent. After a keystroke (`je tape`), it is written after it. With `! ` (a space), the prompt keeps
the leading space: hence the form without a space. No test replays this: the gates have no real
`claude`.
