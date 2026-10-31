#target bridge

(function () {
    if (BridgeTalk.appName !== "bridge") return;

    var MENU_ID = "cloneRating";
    var TITLE = "Clone Rating";

    var CONFIG = {
        // Off: an unrated source file never clears an existing target rating
        WRITE_ZERO: false,
        SYNC_REJECT: false,
        BACKUP_XMP: true,
        FAST_READ: true,
        FAST_READ_CHECK: 100,
        PROGRESS_FILE: true
    };

    // Load log in the temp folder: Bridge shows nothing when a startup script fails while loading
    var loadLog = new File(Folder.temp.fsName + "/Clone-Rating.load.log");
    function logLoad(line) {
        try {
            loadLog.encoding = "UTF-8";
            if (loadLog.open("a")) {
                loadLog.writeln(formatTime(new Date()) + "  " + line);
                loadLog.close();
            }
        } catch (e) {
            // Logging must never stop the script from loading
        }
    }

    logLoad("script evaluated, Bridge " + app.version);

    // Reuse the existing item so re-running the script rebinds the handler instead of adding a duplicate
    var cmd;
    try {
        cmd = MenuElement.find(MENU_ID);
        if (!cmd) cmd = MenuElement.create("command", TITLE, "at the end of Tools", MENU_ID);
        logLoad("menu item ready: Tools > " + TITLE);
    } catch (e) {
        logLoad("MENU ERROR: " + e.message + (e.line ? " (line " + e.line + ")" : ""));
        throw e;
    }

    cmd.onSelect = function () {
        try {
            run();
        } catch (e) {
            alert("Aborted: " + e.message + (e.line ? " (line " + e.line + ")" : ""), TITLE, true);
        }
    };

    function run() {
        var srcDir = Folder.selectDialog("1/2  Select the SOURCE folder (ratings are read from here)");
        if (!srcDir) return;
        var srcExts = extensionsIn(srcDir, null);
        if (srcExts.length === 0) {
            alert("No files in the source folder.\n\n" + srcDir.fsName, TITLE, true);
            return;
        }
        var srcExt = pickExtension("Source: which files carry the ratings?", srcDir, srcExts, false);
        if (!srcExt) return;

        var dstDir = Folder.selectDialog("2/2  Select the TARGET folder (ratings are written here)");
        if (!dstDir) return;
        var sameFolder = srcDir.fsName.toLowerCase() === dstDir.fsName.toLowerCase();
        // In one folder the source extension cannot also be the target
        var dstExts = extensionsIn(dstDir, sameFolder ? srcExt : null);
        if (dstExts.length === 0) {
            alert("No target files in the target folder" + (sameFolder ? " other than " + srcExt : "") +
                ".\n\n" + dstDir.fsName, TITLE, true);
            return;
        }
        var dstExt = pickExtension("Target: which files receive the ratings?", dstDir, dstExts, true);
        if (!dstExt) return;

        var srcFiles = listFiles(srcDir, function (ext) { return ext === srcExt; });
        var dstFiles = listFiles(dstDir, function (ext) {
            return ext !== ".xmp" && ext !== (sameFolder ? srcExt : null) && (dstExt === "*" || ext === dstExt);
        });

        var ctx = { srcDir: srcDir, dstDir: dstDir, srcExt: srcExt, dstExt: dstExt, sameFolder: sameFolder,
            srcFiles: srcFiles, dstFiles: dstFiles };
        var ui = makeUi(ctx);
        ui.log("Source: " + srcDir.fsName + "   " + srcExt + "  (" + srcFiles.length + " files)");
        ui.log("Target: " + dstDir.fsName + "   " + (dstExt === "*" ? "all files" : dstExt) + "  (" + dstFiles.length + " files)");
        if (sameFolder) ui.log("Source and target are the same folder: source ratings are read through Bridge.");
        ui.log("");
        ui.log("Files are paired by name without extension. Press Start to read ratings.");
        ui.log("Bridge may stop responding while reading; this window updates as it goes.");
        if (ui.progressFile) ui.log("Progress is also written to " + ui.progressFile.fsName);
        ui.flush();
        ui.show();
    }

    // Distinct lowercase extensions in a folder with file counts, most frequent first
    function extensionsIn(folder, excludeExt) {
        var counts = {};
        var items = folder.getFiles();
        for (var i = 0; i < items.length; i++) {
            if (!(items[i] instanceof File)) continue;
            var n = decodedName(items[i]);
            if (n.charAt(0) === "." || n.indexOf("_rating_sync") === 0) continue;
            var ext = extOf(n);
            if (ext === "" || ext === ".xmp" || ext === excludeExt) continue;
            counts[ext] = (counts[ext] || 0) + 1;
        }
        var list = [];
        for (var k in counts) if (counts.hasOwnProperty(k)) list.push({ ext: k, count: counts[k] });
        list.sort(function (a, b) { return b.count - a.count; });
        return list;
    }

    // Returns the chosen extension (".jpg"), "*" for all, or null on cancel. One choice is taken without asking.
    function pickExtension(question, folder, exts, allowAll) {
        if (exts.length === 1 && !allowAll) return exts[0].ext;

        var w = new Window("dialog", TITLE);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.add("statictext", undefined, question);
        w.add("statictext", undefined, folder.fsName);
        var dd = w.add("dropdownlist", undefined, []);
        dd.preferredSize = [420, 24];
        var values = [];
        var total = 0, i;
        for (i = 0; i < exts.length; i++) total += exts[i].count;
        if (allowAll && exts.length > 1) {
            dd.add("item", "All files  (" + total + ")");
            values.push("*");
        }
        for (i = 0; i < exts.length; i++) {
            dd.add("item", exts[i].ext + "  (" + exts[i].count + ")");
            values.push(exts[i].ext);
        }
        dd.selection = 0;

        var group = w.add("group");
        group.alignment = "right";
        var choice = null;
        group.add("button", undefined, "Cancel").onClick = function () { w.close(); };
        group.add("button", undefined, "OK").onClick = function () {
            choice = values[dd.selection.index];
            w.close();
        };
        w.show();
        return choice;
    }

    // One window for the whole run: log, status line, progress bar, one action button whose label changes per stage
    function makeUi(ctx) {
        var ui = {};
        var w = new Window("dialog", TITLE);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];

        var status = w.add("statictext", undefined, "Ready.");
        var bar = w.add("progressbar", undefined, 0, 1);
        bar.preferredSize = [720, 12];
        var box = w.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
        box.preferredSize = [720, 360];

        var group = w.add("group");
        group.alignment = "right";
        var cancel = group.add("button", undefined, "Cancel");
        var action = group.add("button", undefined, "Start reading");

        var lines = [];
        var dirty = false;
        var lastFlush = 0;
        var stage = "read";
        var plan = null;

        ui.progressFile = CONFIG.PROGRESS_FILE ? new File(ctx.dstDir.fsName + "/_rating_sync_progress.txt") : null;
        var fileProgress = ui.progressFile ? makeProgress(ui.progressFile, ctx) : function () {};

        ui.log = function (line) {
            lines.push(line);
            dirty = true;
        };
        ui.flush = function () {
            if (!dirty) return;
            box.text = lines.join("\n");
            dirty = false;
            lastFlush = new Date().getTime();
            w.update();
        };
        ui.progress = function (phase, done, total, current) {
            fileProgress(phase, done, total, current);
            status.text = phase + (total ? "  " + done + " / " + total : "") + (current ? "   " + current : "");
            bar.maxvalue = total || 1;
            bar.value = total ? done : 0;
            var now = new Date().getTime();
            if (dirty && (now - lastFlush > 1000 || done === total)) ui.flush();
            else w.update();
        };
        ui.show = function () { w.show(); };

        function finish(label) {
            stage = "done";
            action.text = "Close";
            cancel.visible = false;
            ui.progress(label, 0, 0, "");
            ui.flush();
        }

        action.onClick = function () {
            if (stage === "done") { w.close(); return; }
            action.enabled = false;
            cancel.enabled = false;
            var oldMode = app.synchronousMode;
            app.synchronousMode = true;
            try {
                if (stage === "read") {
                    plan = readPhase(ctx, ui);
                    if (plan.list.length === 0) {
                        finish("Finished: nothing to write. No files were changed.");
                    } else {
                        stage = "write";
                        action.text = "Write " + plan.list.length + " file" + (plan.list.length === 1 ? "" : "s");
                        action.enabled = true;
                        cancel.enabled = true;
                        ui.progress("Waiting: press Write to apply, or Cancel.", 0, 0, "");
                        ui.flush();
                    }
                } else if (stage === "write") {
                    var result = writePhase(ctx, ui, plan);
                    finish(result);
                }
            } catch (e) {
                ui.log("");
                ui.log("ABORTED: " + e.message + (e.line ? " (line " + e.line + ")" : ""));
                finish("Aborted: " + e.message);
            } finally {
                app.synchronousMode = oldMode;
            }
        };
        cancel.onClick = function () {
            ui.progress("Cancelled. No ratings were written.", 0, 0, "");
            w.close();
        };
        return ui;
    }

    // Pairs files, reads ratings, decides what to write. Returns {list, rows, stats}
    function readPhase(ctx, ui) {
        var s = {
            srcReadError: 0, dupSrc: 0, dupDst: 0, srcOnly: 0, dstOnly: 0, srcOnlyRated: 0,
            same: 0, overwrite: 0, ignoredUnrated: 0, ignoredReject: 0, dstReadError: 0,
            srcReadMethod: "", fastFallback: 0, dstSidecar: 0, dstBridge: 0
        };
        var rows = [];
        var issues = [];
        var notes = [];
        var i, key;

        ui.log("");
        ui.log("=== Pairing by file name ===");
        ui.progress("Pairing files by name", 0, 0, "");

        var src = indexByStem(ctx.srcFiles, issues, "Duplicate source name");
        var dst = indexByStem(ctx.dstFiles, issues, "Duplicate target name");

        var pairs = [];
        for (key in dst) {
            if (!dst.hasOwnProperty(key)) continue;
            var d = dst[key];
            if (d.dup) {
                s.dupDst++;
                rows.push([d.name, "", "", "", "skip: several target files share this name"]);
            } else if (!src.hasOwnProperty(key)) {
                s.dstOnly++;
                rows.push([d.name, "", "", "", "skip: no source file"]);
            } else if (src[key].dup) {
                s.dupSrc++;
                rows.push([d.name, src[key].name, "", "", "skip: several source files share this name"]);
            } else {
                pairs.push({ file: d.file, name: d.name, srcFile: src[key].file, srcName: src[key].name, rating: null });
            }
        }
        var srcOnly = [];
        for (key in src) {
            if (src.hasOwnProperty(key) && !dst.hasOwnProperty(key)) {
                s.srcOnly++;
                srcOnly.push(src[key]);
            }
        }
        ui.log("Pairs: " + pairs.length + "   source without target: " + s.srcOnly +
            "   target without source: " + s.dstOnly + "   duplicate names: " + (s.dupSrc + s.dupDst));

        // In one folder a sidecar may belong to either file, so only Bridge can say whose rating it is
        var useFast = CONFIG.FAST_READ && !ctx.sameFolder && loadXmpLib();
        if (CONFIG.FAST_READ && !ctx.sameFolder && !useFast) notes.push("AdobeXMPScript library not available; all files read through Bridge");
        readSrcRatings(pairs, useFast, issues, notes, ui, s);

        // A rated source file with no target counterpart cannot be synced; it is reported, never written
        for (i = 0; i < srcOnly.length; i++) {
            var lone = srcOnly[i];
            ui.progress("Checking source files without target for ratings", i + 1, srcOnly.length, lone.name);
            var loneRating = "";
            try {
                loneRating = useFast ? readRatingDirect(lone.file) : readRating(lone.file);
            } catch (e) {
                try { loneRating = readRating(lone.file); } catch (e2) { loneRating = "?"; }
            }
            if (loneRating === "?") {
                issues.push("Source without target, rating unreadable: " + lone.name);
            } else if (loneRating > 0) {
                s.srcOnlyRated++;
                issues.push("Rated source (" + loneRating + ") has no target file: " + lone.name);
            }
            rows.push(["", lone.name, "", loneRating, "skip: no target file"]);
        }

        var list = [];
        for (i = 0; i < pairs.length; i++) {
            var pr = pairs[i];
            var target = pr.rating;
            ui.progress("Reading target ratings for rated sources", i + 1, pairs.length, pr.name);

            if (target === null) {
                rows.push([pr.name, pr.srcName, "", "", "skip: source rating unreadable"]);
                continue;
            }
            if (target === 0 && !CONFIG.WRITE_ZERO) {
                s.ignoredUnrated++;
                continue;
            }
            if (target === -1 && !CONFIG.SYNC_REJECT) {
                s.ignoredReject++;
                rows.push([pr.name, pr.srcName, "", target, "skip: source rejected"]);
                continue;
            }

            var before;
            try {
                before = readDstRating(pr.file, s, notes);
            } catch (e) {
                s.dstReadError++;
                issues.push("Target read error: " + pr.name + ": " + e.message);
                rows.push([pr.name, pr.srcName, "", target, "skip: target rating unreadable"]);
                continue;
            }

            if (target === before) {
                s.same++;
            } else {
                if (before !== 0) s.overwrite++;
                list.push({ file: pr.file, name: pr.name, srcName: pr.srcName, before: before, target: target });
            }
        }

        if (notes.length > 0) {
            ui.log("");
            ui.log("=== " + notes.length + " note(s): read through Bridge instead of XMP (info, not skipped) ===");
            for (i = 0; i < notes.length; i++) ui.log(notes[i]);
        }
        if (issues.length > 0) {
            ui.log("");
            ui.log("=== " + issues.length + " warning(s); these files are not written ===");
            for (i = 0; i < issues.length; i++) ui.log(issues[i]);
        }

        ui.log("");
        ui.log("=== Summary ===");
        ui.log("Source read: " + s.srcReadMethod + (s.fastFallback ? " (" + s.fastFallback + " via Bridge fallback)" : ""));
        ui.log("Target read: sidecar XMP " + s.dstSidecar + ", Bridge " + s.dstBridge);
        ui.log("To write: " + list.length + "  (target already rated, different value: " + s.overwrite + ")");
        ui.log("Already equal: " + s.same);
        ui.log("Ignored (source unrated): " + s.ignoredUnrated);
        ui.log("Ignored (source rejected): " + s.ignoredReject);
        ui.log("Source without target: " + s.srcOnly + "  (rated: " + s.srcOnlyRated + ")");
        ui.log("Target without source: " + s.dstOnly);
        ui.log("Read errors (source / target): " + s.srcReadError + " / " + s.dstReadError);
        if (list.length > 0) {
            ui.log("");
            ui.log("=== Planned changes (target: before -> source rating) ===");
            for (i = 0; i < list.length; i++) ui.log(list[i].name + ": " + list[i].before + " -> " + list[i].target);
        }
        ui.log("");
        ui.log("Nothing has been written yet.");

        return { list: list, rows: rows, stats: s };
    }

    function indexByStem(files, issues, dupLabel) {
        var idx = {};
        for (var i = 0; i < files.length; i++) {
            var key = keyOf(files[i]);
            var name = decodedName(files[i]);
            if (idx.hasOwnProperty(key)) {
                idx[key].dup = true;
                issues.push(dupLabel + ": " + idx[key].name + " / " + name);
                continue;
            }
            idx[key] = { file: files[i], name: name, dup: false };
        }
        return idx;
    }

    // Returns the final status line
    function writePhase(ctx, ui, plan) {
        var rows = plan.rows;
        var stamp = timestamp();
        var backupDir = null;
        if (CONFIG.BACKUP_XMP) {
            backupDir = new Folder(ctx.dstDir.fsName + "/_rating_sync_backup_" + stamp);
            if (!backupDir.create()) throw new Error("Cannot create backup folder " + backupDir.fsName);
        }

        var written = 0, writeError = 0, noSidecar = 0;
        var aborted = false;

        ui.log("");
        ui.log("=== Writing ===");
        for (var i = 0; i < plan.list.length; i++) {
            var p = plan.list[i];
            var r;
            ui.progress("Writing target ratings", i + 1, plan.list.length, p.name);
            try {
                r = writeOne(p, backupDir);
            } catch (e) {
                r = { kind: "error", status: "error: " + e.message };
            }
            rows.push([p.name, p.srcName, p.before, p.target, r.status]);
            ui.log(p.name + ": " + p.before + " -> " + p.target + "   " + r.status);

            if (r.kind === "ok" || r.kind === "warn") written++;
            if (r.kind === "warn") noSidecar++;
            if (r.kind === "error") writeError++;
            if (r.kind === "fatal") {
                aborted = true;
                break;
            }
        }

        if (backupDir && backupDir.getFiles().length === 0) backupDir.remove();

        var logFile = new File(ctx.dstDir.fsName + "/_rating_sync_log_" + stamp + ".csv");
        var logOk = writeCsv(logFile, ["target", "source", "target_before", "source_rating", "result"], rows);

        ui.log("");
        ui.log("=== Result ===");
        if (aborted) ui.log("STOPPED: a target file itself changed on write. Remaining files were not processed.");
        ui.log("Written: " + written + " / " + plan.list.length);
        ui.log("Write errors: " + writeError);
        ui.log("Written, metadata embedded or no XMP sidecar: " + noSidecar);
        ui.log("Log: " + (logOk ? logFile.fsName : "could not be written"));
        if (backupDir && backupDir.exists) ui.log("XMP backup: " + backupDir.fsName);

        return (aborted ? "Stopped" : "Finished") + ": written " + written + " / " + plan.list.length +
            ", errors " + writeError;
    }

    // Targets that embed XMP (JPG, DNG, TIFF) legitimately change on write; RAW files with sidecars must not
    function writeOne(p, backupDir) {
        var xmp = sidecarOf(p.file);
        var hadXmp = xmp.exists;

        if (hadXmp && backupDir && !xmp.copy(backupDir.fsName + "/" + decodedName(xmp))) {
            return { kind: "error", status: "skip: XMP backup failed, rating not written" };
        }

        var sizeBefore = p.file.length;
        var timeBefore = p.file.modified.getTime();

        new Thumbnail(p.file).rating = p.target;

        var fileNow = new File(p.file.fsName);
        var fileChanged = fileNow.length !== sizeBefore || fileNow.modified.getTime() !== timeBefore;
        if (fileChanged && hadXmp) {
            return { kind: "fatal", status: "ABORT: target file itself changed although it had an XMP sidecar" };
        }
        if (fileChanged) {
            return { kind: "warn", status: "written: metadata embedded in the file" };
        }
        if (!sidecarOf(p.file).exists) {
            return { kind: "warn", status: "written: no XMP sidecar found" };
        }
        return { kind: "ok", status: hadXmp ? "written: XMP updated" : "written: XMP created" };
    }

    // Excludes macOS "._" AppleDouble files, which exFAT/FAT cards accumulate with the same extensions
    function listFiles(folder, extOk) {
        return folder.getFiles(function (f) {
            var n = decodedName(f);
            return (f instanceof File) && n.charAt(0) !== "." && n.indexOf("_rating_sync") !== 0 && extOk(extOf(n));
        });
    }

    function decodedName(f) {
        return File.decode(f.name);
    }

    // ".jpg" from "IMG_0001.JPG"; "" when there is no extension
    function extOf(name) {
        var m = name.match(/\.[^.]+$/);
        return m ? m[0].toLowerCase() : "";
    }

    function baseName(f) {
        return decodedName(f).replace(/\.[^.]+$/, "");
    }

    // "_" prefix keeps names such as "constructor" from colliding with Object members
    function keyOf(f) {
        return "_" + baseName(f).toLowerCase();
    }

    function sidecarOf(f) {
        return new File(f.parent.fsName + "/" + baseName(f) + ".xmp");
    }

    function readRating(file) {
        return normalizeRating(new Thumbnail(file).rating, file);
    }

    function normalizeRating(r, file) {
        if (r === "" || r === null || r === undefined) return 0;
        r = Number(r);
        if (isNaN(r) || r < -1 || r > 5 || Math.floor(r) !== r) {
            throw new Error("Invalid rating " + r + " in " + decodedName(file));
        }
        return r;
    }

    // Target ratings in a .xmp sidecar are read from it directly; Bridge is asked when there is no
    // sidecar, the sidecar has no xmp:Rating, or the sidecar cannot be parsed
    function readDstRating(file, s, notes) {
        var side = sidecarOf(file);
        if (side.exists && loadXmpLib()) {
            try {
                var r = ratingFromXmp(new XMPMeta(readText(side)), file);
                if (r !== null) {
                    s.dstSidecar++;
                    return r;
                }
                notes.push(decodedName(file) + ": sidecar has no xmp:Rating");
            } catch (e) {
                notes.push(decodedName(file) + ": sidecar unreadable (" + e.message + ")");
            }
        }
        s.dstBridge++;
        return readRating(file);
    }

    // Reading XMP directly skips Bridge's thumbnail and cache work, so a sample is checked against Bridge before trusting it
    function readSrcRatings(pairs, useFast, issues, notes, ui, s) {
        var errors = readAllSrc(pairs, useFast, notes, ui, s);

        if (useFast) {
            var check = checkFastRead(pairs, ui);
            if (check.mismatch) {
                issues.push("Direct XMP read disagreed with Bridge on " + check.mismatch +
                    ". All source files were re-read through Bridge.");
                s.fastFallback = 0;
                errors = readAllSrc(pairs, false, notes, ui, s);
                s.srcReadMethod = "Bridge (direct read rejected)";
            } else {
                s.srcReadMethod = "direct XMP (" + check.checked + " checked against Bridge)";
            }
        } else {
            s.srcReadMethod = "Bridge";
        }

        s.srcReadError = errors.length;
        for (var i = 0; i < errors.length; i++) issues.push(errors[i]);
    }

    function readAllSrc(pairs, useFast, notes, ui, s) {
        var errors = [];
        var phase = "Reading source ratings (" + (useFast ? "direct XMP" : "Bridge") + ")";
        for (var i = 0; i < pairs.length; i++) {
            var pr = pairs[i];
            ui.progress(phase, i + 1, pairs.length, pr.srcName);
            pr.rating = null;
            if (useFast) {
                try {
                    pr.rating = readRatingDirect(pr.srcFile);
                    continue;
                } catch (e) {
                    s.fastFallback++;
                    notes.push(pr.srcName + ": direct XMP read failed (" + e.message + ")");
                }
            }
            try {
                pr.rating = readRating(pr.srcFile);
            } catch (e) {
                errors.push("Source read error: " + pr.srcName + ": " + e.message);
            }
        }
        return errors;
    }

    function checkFastRead(pairs, ui) {
        var n = Math.min(CONFIG.FAST_READ_CHECK, pairs.length);
        var checked = 0;
        for (var k = 0; k < n; k++) {
            var pr = pairs[Math.floor(k * pairs.length / n)];
            ui.progress("Checking direct read against Bridge", k + 1, n, pr.srcName);
            if (pr.rating === null) continue;
            var viaBridge;
            try {
                viaBridge = readRating(pr.srcFile);
            } catch (e) {
                continue;
            }
            checked++;
            if (viaBridge !== pr.rating) {
                return { mismatch: pr.srcName + " (direct " + pr.rating + ", Bridge " + viaBridge + ")", checked: checked };
            }
        }
        return { mismatch: null, checked: checked };
    }

    function loadXmpLib() {
        try {
            if (ExternalObject.AdobeXMPScript == undefined) {
                ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
            }
            return typeof XMPFile !== "undefined" && typeof XMPMeta !== "undefined";
        } catch (e) {
            return false;
        }
    }

    // Sidecar first: RAW files and JPGs carrying Content Credentials keep Bridge metadata in a .xmp sidecar.
    // Then the XMP packet embedded in the file. Throws when neither can be read, so the caller falls back to Bridge.
    function readRatingDirect(file) {
        var side = sidecarOf(file);
        if (side.exists) {
            var fromSidecar = ratingFromXmp(new XMPMeta(readText(side)), file);
            if (fromSidecar !== null) return fromSidecar;
        }
        var xf = new XMPFile(file.fsName, XMPConst.UNKNOWN, XMPConst.OPEN_FOR_READ | XMPConst.OPEN_ONLY_XMP);
        try {
            var embedded = ratingFromXmp(xf.getXMP(), file);
            return embedded === null ? 0 : embedded;
        } finally {
            xf.closeFile();
        }
    }

    function ratingFromXmp(xmp, file) {
        if (!xmp || !xmp.doesPropertyExist(XMPConst.NS_XMP, "Rating")) return null;
        return normalizeRating(xmp.getProperty(XMPConst.NS_XMP, "Rating").value, file);
    }

    function readText(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Cannot open " + decodedName(file));
        try {
            return file.read();
        } finally {
            file.close();
        }
    }

    // Throttled to one write per second within a phase, but phase changes and the last item are always written
    function makeProgress(file, ctx) {
        var started = formatTime(new Date());
        var lastWrite = 0;
        var lastPhase = "";
        return function (phase, done, total, current) {
            var now = new Date().getTime();
            if (phase === lastPhase && done !== total && now - lastWrite < 1000) return;
            lastWrite = now;
            lastPhase = phase;

            var lines = ["Phase: " + phase];
            if (total) lines.push("Progress: " + done + " / " + total + " (" + Math.floor(done * 100 / total) + "%)");
            if (current) lines.push("Current: " + current);
            lines.push("Source: " + ctx.srcDir.fsName + "  " + ctx.srcExt,
                "Target: " + ctx.dstDir.fsName + "  " + ctx.dstExt,
                "Started: " + started, "Updated: " + formatTime(new Date()));
            try {
                file.encoding = "UTF-8";
                if (file.open("w")) {
                    // BOM so Notepad and Windows PowerShell decode non-ASCII paths correctly
                    file.write("FEFF" + lines.join("\n") + "\n");
                    file.close();
                }
            } catch (e) {
                // Progress reporting must never interrupt the sync itself
            }
        };
    }

    function formatTime(d) {
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
            p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }

    function timestamp() {
        var d = new Date();
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" +
            p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }

    function csvCell(v) {
        var t = (v === null || v === undefined) ? "" : String(v);
        return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }

    function writeCsv(file, header, rows) {
        file.encoding = "UTF-8";
        if (!file.open("w")) return false;
        try {
            // BOM so Excel reads non-ASCII file names correctly
            file.write("FEFF");
            var all = [header].concat(rows);
            for (var i = 0; i < all.length; i++) {
                var cells = [];
                for (var j = 0; j < all[i].length; j++) cells.push(csvCell(all[i][j]));
                file.writeln(cells.join(","));
            }
        } finally {
            file.close();
        }
        return true;
    }
})();
