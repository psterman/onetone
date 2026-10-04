# Deferred Plan B/C sources (not compiled)

These files are kept for the next phase. They are **not** part of the
`onetone` crate build. Plan A acceptance requires homepage / IPC to ship
without lifecycle, checkpoint, or memory injection.

To re-enable later: restore modules under `src/agent_memory/`, register IPC
behind an explicit Cargo feature, and wire homepage projection fields.
