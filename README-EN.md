# Adobe Bridge – Clone Rating

[한국어](README.md) | **English**

A startup script for Adobe Bridge. It copies the star ratings of files in one folder to the files with the same name (ignoring the extension) in another folder.

Typical use: a camera saves each shot as both JPG and RAW (CR3, RAF, DNG, and so on). You rate only the JPGs, then copy those ratings to the RAW files.

Contents: [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Settings](#settings) · [How it works](#how-it-works) · [Limitations](#limitations) · [Troubleshooting](#troubleshooting) · [Requirements](#requirements) · [Development notes](#development-notes)

## Features

- Enter the source and target folders by pasting their paths or with `Browse...`. Any folder layout works. The source and target can be the same folder.
- If the source folder holds several extensions, choose from a list which extension carries the ratings. For the target, choose all files or one extension.
- Any file format works. Files are paired by name without the extension, ignoring case.
- One window shows progress, warnings, the summary, and the write results. A step bar at the top (`Setup > Read > Review > Write > Done`) shows the current step. The status line shows the read sub-step, speed, and time left. A summary panel shows the main counts as numbers.
- After reading, the script lists the planned changes and writes nothing until you press Write. If any file would have an existing rating replaced, it asks once more.
- Before writing, existing `.xmp` sidecars are backed up. Formats that store metadata inside the file (JPG, TIFF, DNG, and so on) have the whole original file backed up.
- After writing, each rating is read back from disk and checked. The CSV log is created before the first write, and each result is added to it as soon as it happens.
- A rated source file with no target counterpart (for example a JPG whose RAW file is missing) is copied into a subfolder of the target folder, such as `JPG_only_rated`. Files already in that folder are never replaced.

## Installation

1. Copy `Clone-Rating.jsx` into the Bridge startup scripts folder.
   - Windows: `%APPDATA%\Adobe\Bridge 2026\Startup Scripts\`
   - macOS: `~/Library/Application Support/Adobe/Bridge 2026/Startup Scripts/`
   - For other versions, replace `2026` in the folder name with that version.
2. In Bridge, open Edit > Preferences > Startup Scripts and tick `Clone-Rating`.
3. Quit Bridge completely and start it again.
4. The script is installed when the menu item `Tools > Clone Rating` appears.

To check that the script loads, look at `Clone-Rating.load.log` in the temp folder. On Windows this is `%TEMP%\Clone-Rating.load.log`.

### Updating

Copy the new `Clone-Rating.jsx` over the old one in the same startup scripts folder and restart Bridge. Bridge reads startup scripts only when it starts, so the previous version keeps running until the restart.

## Usage

1. Run `Tools > Clone Rating`.
2. Enter the path of the source folder (ratings are read from here) and the target folder (ratings are written here), then press `OK`. Pressing Enter in a path field does the same.
   - Paste a path copied from the Explorer address bar, or a quoted path from `Shift`+right-click > `Copy as path`. Leading and trailing spaces, quotes, and a trailing `\` are ignored.
   - `Browse...` opens a folder picker. If the field already holds a path, the picker starts in that folder. After you choose a folder, the path dialog opens again with your entries kept.
   - If a folder does not exist, the dialog opens again and shows `Source folder not found` or `Target folder not found`.
3. If the source folder holds more than one extension, choose which one to read.
4. Choose the target extension. The default is `All files`.
5. Press `Start reading` in the window. Bridge may stop responding for a while during the read. The status line shows the read sub-step and the progress count; the line below shows speed, time left, and the current file. The same information is written to `_rating_sync_progress.txt` in the target folder.
   - Sub-steps: `Read 1/5` pair files by name, `2/5` read source ratings, `3/5` check direct reads against Bridge, `4/5` check source files without a target, `5/5` read target ratings. Steps that do not apply are skipped.
   - Speed and time left are calculated separately for each sub-step and appear after the sub-step has run for 2 seconds.
6. Check the summary panel and the planned changes, then press `Write N files`. If there are files to copy, the button reads `Write N, copy K files`, or `Copy K files` when there is nothing else to write. The files to copy are listed under `Planned copies` in the log. `Cancel` writes nothing. If any existing rating would be replaced (`Replace a rating`), nothing is written yet: the log shows the ratings to be replaced (up to 20) and the source and target folders, and the button changes to `Confirm: write N, replace M` (with `, copy K` at the end when there are copies). Press that button to write. If you swapped the source and target, press `Cancel`.
7. When the run ends, the status line shows `Finished`, `Stopped`, or `Aborted`. The `Open log`, `Open backup`, and `Show target in Bridge` buttons open the log, the backup folder, and the target folder.

### Summary panel

| Field | Meaning |
|---|---|
| `To write` | Files to write. During the write it changes to `Written 120 / 500`. |
| `To copy` | Source files to copy into the target subfolder (sources rated 1–5 that have no target). During the copy it changes to `Copied 3 / 10`. |
| `Replace a rating` | Files to write whose target already has a different rating. If not 0, the confirmation step applies. |
| `Already equal` | Files not written because source and target ratings already match. |
| `Skipped` | Files skipped because they have no pair (source only or target only), share a name, have a rejected (-1) source, or could not be read. Sources to be copied are not counted here. With `WRITE_ZERO: false`, unrated sources are counted here too. |
| `Warnings` | Warnings in the log, such as duplicate names and read errors. With `COPY_SRC_ONLY: false`, rated sources without a target are warnings too. |
| `Errors` | Read errors, write errors (failed backups, read-back mismatches, stops), and copy errors. |

### Rating rules

| Source rating | Target rating | Action |
|---|---|---|
| 1–5 | different | Writes the source value. If the target already had a rating, the confirmation step applies |
| 1–5 | same | Skipped (Already equal) |
| 0 (none) | 1–5 or rejected | Clears the target rating (`WRITE_ZERO: true`). This replaces an existing rating, so the confirmation step applies |
| 0 (none) | 0 (none) | Skipped (Already equal) |
| -1 (rejected) | any | Skipped (`SYNC_REJECT: false`) |

- A source file with no target: if it is rated 1–5, it is copied into a subfolder of the target folder (`COPY_SRC_ONLY: true`). The subfolder is named after the source extension; for JPG sources it is `JPG_only_rated`. Unrated and rejected (-1) sources are not copied and are recorded in the CSV as `skip: no target file`. With `COPY_SRC_ONLY: false`, a rated source is only shown as a warning.
- A target file with no source: only counted in the summary.
- If two files in one folder share a name (for example `a.cr3` and `a.dng`), that name is skipped, because both files share the single sidecar `a.xmp`.

### Files created in the target folder

- `_rating_sync_progress.txt`: the current step. Overwritten during the run.
- `_rating_sync_log_YYYYMMDD_HHMMSS.csv`: the result for every file, with the columns `target, source, target_before, source_rating, result`. Before the first write, every planned change is recorded as `pending: not written yet`; each result is then appended as it happens, and the whole file is rewritten at the end. If Bridge stops during the write, the previous ratings (`target_before`) are still on disk. If the log cannot be created, nothing is written. If the run stops, the remaining files are recorded as `not processed: run stopped`.
- `_rating_sync_backup_YYYYMMDD_HHMMSS/`: copies of the `.xmp` sidecars that existed before the write, and the original copies of targets whose file itself changed (JPG, TIFF, DNG, and so on). The folder is removed if nothing was backed up.
- `JPG_only_rated/` (named after the source extension): copies of rated source files that have no target, with their `.xmp` sidecars. Every run uses the same folder and skips files already in it. A folder created by the run is removed if nothing was copied into it. In the CSV, the `target` column of these rows is `JPG_only_rated\<file name>`.

These files are excluded from pairing on later runs. Subfolders are not read for pairing.

## Settings

Change these in `CONFIG` at the top of the script.

| Key | Default | Meaning |
|---|---|---|
| `WRITE_ZERO` | `true` | An unrated (0) source clears the target rating, so removing a star in the source carries over to the target. With `false`, unrated sources are skipped and the target rating is kept. |
| `SYNC_REJECT` | `false` | With `true`, the rejected (-1) mark is also copied to the target. |
| `BACKUP_XMP` | `true` | Backs up existing `.xmp` sidecars before writing. |
| `BACKUP_EMBEDDED` | `true` | Backs up the whole file of a target that has no sidecar and is not RAW, before writing. The copy is removed if the file did not change. Formats such as DNG change on every write, so they use disk space equal to the size of the changed files. |
| `COPY_SRC_ONLY` | `true` | Copies source files rated 1–5 that have no target into a subfolder of the target folder (`JPG_only_rated` and so on). With `false`, they are only shown as warnings. |
| `FAST_READ` | `true` | Reads ratings from XMP directly. With `false`, every file is read through Bridge. |
| `FAST_READ_CHECK` | `100` | How many direct reads are checked against Bridge. If any differs, everything is read again through Bridge. |
| `PROGRESS_FILE` | `true` | Writes the progress file `_rating_sync_progress.txt`. |

The extensions treated as RAW are listed in `RAW_EXTS`, below `CONFIG`. If one of these files itself changes during the write, the run stops at once. These files must not change, so they are not included in the original-file backup.

## How it works

### Folder paths

A pasted path has its leading and trailing spaces, surrounding quotes, and trailing `\` or `/` removed, and is then checked for an existing folder. The `\` of a drive root (`C:\`) is kept. A path that points to a file is rejected.

The trailing `\` is removed because the script decides whether source and target are the same folder by comparing the path text. If `...\jpg\` and `...\jpg` counted as different folders, the read method for one folder (see "Reading ratings" below) would not be used.

### Pairing

The key is the file name without its last extension, in lowercase. `IMG_0001.JPG` and `IMG_0001.CR3` both have the key `img_0001` and form a pair.

### Reading ratings

A Bridge rating is the XMP property `xmp:Rating`. Its values are -1 (rejected), 0 (none), and 1–5.

Source files are read in three steps:

1. If a `.xmp` sidecar with the same name exists, its `xmp:Rating`. This applies to RAW files and to JPGs that carry Content Credentials.
2. If there is no sidecar, or the sidecar has no rating, the XMP packet embedded in the file (`XMPFile`).
3. If both fail, Bridge's `Thumbnail.rating`. This is slow but returns exactly what Bridge shows.

Direct reads are fast because they skip Bridge's thumbnail and cache work. To guard against differences, up to `FAST_READ_CHECK` files are checked against Bridge; if any differs, everything is read again through Bridge.

When source and target are the same folder, a `.xmp` sidecar cannot be matched to a file by name alone, so source ratings are always read through Bridge.

Target files are read from their sidecar first. A RAW file without a sidecar has never been rated in Bridge, so the XMP that the camera embedded in the file is read directly; that is also the value Bridge shows. In other cases (JPG or DNG targets without a sidecar, a sidecar without `xmp:Rating`, or a failed direct read), Bridge is asked.

### Writing ratings

Ratings are written with `new Thumbnail(file).rating = value`. Bridge stores the value in the `.xmp` sidecar or in the XMP inside the file, depending on the format.

Before the write:

- Existing `.xmp` sidecars are copied to the backup folder (`BACKUP_XMP`).
- A file without a sidecar whose extension is not RAW is copied whole to the backup folder (`BACKUP_EMBEDDED`). If the copy fails, that file is not written.

Right after the write, the size and modification time of the target file are compared with the values before:

- If a file that had a sidecar changed itself, the run stops at once.
- If a file with a RAW extension (CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW, and so on) changed, the run stops at once, even if it had no sidecar, because a RAW original must not change. DNG is not in this list because Bridge writes inside DNG files.
- If any other file (JPG, DNG, TIFF, and so on) changed, Bridge wrote its embedded XMP. This is treated as normal and the backup copy is kept. If the file did not change, the copy is removed.

Finally, the rating is read back from disk and compared with the value written. A difference is recorded as an error. If there is a sidecar, only the sidecar is read: Bridge clears a rating by removing the `xmp:Rating` property, so a missing property reads as 0. If there is no sidecar, the XMP inside the file is read.

### Copying sources without a target

Copies are made after all ratings are written. If the write stops, no copies are made and their CSV rows say `not processed: run stopped`. The subfolder is created before the log is written; if it cannot be created, nothing is written.

Each file is handled in this order:

1. If a file with the same name is already in the subfolder, it is skipped (`skip: already in JPG_only_rated`). Nothing there is replaced, whether it is a copy from an earlier run or a file you put there.
2. The source file is copied and the size of the copy is compared with the original. If they differ, the copy is removed and an error is recorded.
3. If the source has an `.xmp` sidecar, the sidecar is copied too. A JPG whose rating is in a sidecar (for example one with Content Credentials) needs it for the copy to keep the rating. If the sidecar cannot be copied, or a sidecar with the same name is already in the subfolder, the copy just made is removed and an error is recorded. The next run tries again.

Source files are only read, never changed.

### Code structure

The script is the single file `Clone-Rating.jsx`. The main functions are:

| Function | Role |
|---|---|
| `run` | Overall flow: folder input, extension choice, progress window |
| `pickFolders`, `folderDialog`, `folderFrom` | Path dialog, path cleanup and check |
| `pickExtension` | Extension dialog |
| `makeUi` | Progress window (step bar, status line, summary panel, log, buttons) and step changes |
| `readPhase` | Pairing, reading source and target ratings, building the plan |
| `writePhase`, `writeOne` | Writing the log first, backup, write, file-change check, read-back check |
| `copyOne` | Copying a rated source without a target into the subfolder |
| `readRatingDirect`, `embeddedRating`, `readDstRating`, `readBack` | Direct XMP reads |

## Limitations

- A read or write cannot be stopped once it runs, because ExtendScript does not process button clicks while it works. Before the write, you can stop with `Cancel` at the review step.
- Bridge 2026 (Windows) does not apply text colors in the window. The current step is marked with brackets (`[ Review ]`), and the result is given by the status line text.
- `Browse...` closes the path dialog and opens it again after you choose a folder. In Bridge 2026 a dialog opened from inside another dialog (`confirm()`) did not appear, so the script never opens one dialog over another.
- Tested on Windows 11 with Adobe Bridge 2026 (16.0.8). Not tested on macOS.

## Troubleshooting

- No item in the `Tools` menu: check that the script is still ticked under Preferences > Startup Scripts. Bridge turns off a script that failed to load at the next start. If `%TEMP%\Clone-Rating.load.log` has no entry, the script failed while it was evaluated. Check that the file is UTF-8 without BOM or ASCII, and has no non-ASCII characters in the middle.
- `Error line 1: Cannot convert`: the script file contains characters that Bridge cannot convert to UTF-16. Check it as above.
- `Source folder not found` or `Target folder not found`: check the path for typos and, for a network drive, that it is connected. The path must be a folder, not a file.
- `Write N files` writes nothing and the button changes to `Confirm: write N, replace M`: this is expected. Some existing ratings would be replaced, so the confirmation step applies. Check the list at the end of the log and press the button again.
- The read takes long: watch the time left on the line below the status line. It is slow when many files are read through Bridge (JPG or DNG targets without a sidecar, and sources when source and target are the same folder). The `Target read:` line in the log summary shows how many were read through Bridge.
- The window seems frozen during the read: `_rating_sync_progress.txt` in the target folder shows the progress.
- `error: XMP sidecar not copied ..., copy removed` in the log: the source's `.xmp` sidecar could not be copied into the subfolder, so the copy was removed. If the message says `already in`, a sidecar with the same name is already in the subfolder; check that file, move or delete it, and run again.
- `error: read back X instead of Y` in the log: the rating read back from disk after the write (X) differs from the target value (Y). Check the rating of that file in Bridge and run again if needed.
- `ABORT: RAW target file itself changed` or `ABORT: target file itself changed although it had an XMP sidecar` in the log: a file that must not change did change, so the run stopped. The remaining files are recorded in the CSV as `not processed: run stopped`. RAW files themselves are not backed up, so restore from your own backup if needed. Do not run again until you know the cause.

## Requirements

- Adobe Bridge 2026 (ExtendScript). Other versions differ only in the startup scripts folder name.
- The `AdobeXMPScript` library, which ships with Bridge. Without it, every file is read through Bridge.

## Development notes

- The script is ExtendScript (ES3). Do not use `let`, `const`, arrow functions, or template strings.
- Use only ASCII characters in the script file. Write non-ASCII characters as `\uXXXX` escapes. In a GNU `sed` replacement, `\u` means "uppercase the next character", so inserting an escape with `sed` breaks it.
- `.gitattributes` checks out `*.jsx` with CRLF line endings.
- After a change, check the syntax with Node.js. Leave out the first line, `#target bridge`, which is not JavaScript syntax.

  ```bash
  tail -n +2 Clone-Rating.jsx > check.js && node --check check.js && rm check.js
  ```

- Check for non-ASCII characters. The result must be `0`.

  ```bash
  LC_ALL=C grep -cP '[^\x00-\x7F]' Clone-Rating.jsx
  ```

## License

MIT
