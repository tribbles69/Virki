# game

The layer between the pure sim and the device: the real clock, storage and files.

- `game.ts`: `Game` owns the live state. `Game.start` loads the save (falling back to the backup, then a new game), catches up to now and reports a summary. `tick()` keeps it current, `act(cmd)` applies a player action and saves immediately, and `importText` / `exportText` / `reset` do what they say. Saves are queued so they land in order.
- `db.ts`: `SaveStore` keeps the save in IndexedDB as `current` + `previous` (backup), written in one transaction.
- `migrate.ts`: `migrateSave` validates untrusted save data and upgrades old versions. Bump `SAVE_VERSION` in `src/sim/state.ts` and add a step to `MIGRATIONS` whenever the save shape changes.
- `saveFile.ts`: the export file format (`{ game: 'virki', format, exportedAt, state }`) and its parser.
- `summary.ts`: "while you were away" summary and duration formatting.
