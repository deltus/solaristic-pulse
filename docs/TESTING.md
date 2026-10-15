# Testing notes

## Test copies used during development
| Where | What it is | PIN |
|---|---|---|
| `http://localhost:4173` (preview, your main browser tab) | Your own copy with your data | None set (it was removed after testing) |
| `http://localhost:5174` (dev server, "pulse-dev") | Isolated test copy used by Claude for UI checks, with fictional demo data only | `2468` (test value) |

Each address keeps its own separate local database, so testing on 5174 never touches the data on 4173.
Forgot a PIN on a test copy? Use "Forgot PIN?" on the lock screen and type ERASE (deletes that copy's data).

## Automated tests
```bash
npm test
```
Covers selection/draw weight, follow-ups, trends, ICP, de-identification, importers, reminders, the database layer and the XLSX/CSV exports.
