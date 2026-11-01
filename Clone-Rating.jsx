#target bridge

(function () {
    if (BridgeTalk.appName !== "bridge") return;

    var MENU_ID = "cloneRating";
    var TITLE = "Clone Rating";

    var CONFIG = {
        // On: an unrated source file clears the target rating, so removing a star in the source carries over
        WRITE_ZERO: true,
        SYNC_REJECT: false,
        BACKUP_XMP: true,
        // Copies a target whose XMP is embedded (JPG, TIFF, DNG) before Bridge rewrites it; kept only if the file changed
        BACKUP_EMBEDDED: true,
        // A rated source file with no target counterpart is copied into a subfolder of the target folder,
        // such as "JPG_only_rated"; existing files there are never replaced
        COPY_SRC_ONLY: true,
        FAST_READ: true,
        FAST_READ_CHECK: 100,
        PROGRESS_FILE: true
    };

    // Proprietary RAW formats keep Bridge metadata in a .xmp sidecar, so the file itself must never change.
    // DNG is not listed: Bridge writes its XMP inside the file.
    var RAW_EXTS = {
        ".3fr": 1, ".arw": 1, ".cr2": 1, ".cr3": 1, ".crw": 1, ".dcr": 1, ".erf": 1, ".fff": 1, ".iiq": 1,
        ".kdc": 1, ".mef": 1, ".mos": 1, ".mrw": 1, ".nef": 1, ".nrw": 1, ".orf": 1, ".pef": 1, ".raf": 1,
        ".raw": 1, ".rw2": 1, ".rwl": 1, ".sr2": 1, ".srf": 1, ".srw": 1, ".x3f": 1
    };

    var COLORS = { accent: [0.25, 0.55, 1], ok: [0.2, 0.65, 0.3], warn: [0.95, 0.55, 0.1], bad: [0.9, 0.25, 0.2], dim: [0.55, 0.55, 0.55] };

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
        var folders = pickFolders();
        if (!folders) return;
        var srcDir = folders.src;
        var dstDir = folders.dst;
        var srcExts = extensionsIn(srcDir, null);
        if (srcExts.length === 0) {
            alert("No files in the source folder.\n\n" + srcDir.fsName, TITLE, true);
            return;
        }
        var srcExt = pickExtension("Source: which files carry the ratings?", srcDir, srcExts, false);
        if (!srcExt) return;

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
        ui.log("Nothing is written until you review the plan and press Write.");
        ui.log("Bridge may stop responding while reading; this window updates as it goes.");
        if (ui.progressFile) ui.log("Progress is also written to " + ui.progressFile.fsName);
        ui.flush();
        ui.show();
    }

    // Source and target folders as typed or pasted paths, with Browse as an alternative. Returns {src, dst} or null.
    // Browse closes the dialog and reopens it afterwards: Bridge 2026 did not show confirm() from inside a dialog,
    // so no native dialog is opened from one.
    function pickFolders() {
        var src = "", dst = "", error = "";
        for (;;) {
            var r = folderDialog(src, dst, error);
            src = r.src;
            dst = r.dst;
            error = "";
            if (r.action === "cancel") return null;
            if (r.action === "browseSrc") {
                src = browse(src, "Select the SOURCE folder (ratings are read from here)");
            } else if (r.action === "browseDst") {
                dst = browse(dst, "Select the TARGET folder (ratings are written here)");
            } else {
                var s = folderFrom(src), d = folderFrom(dst);
                if (s && d) return { src: s, dst: d };
                error = !s ? "Source folder not found: " + (src || "(empty)") : "Target folder not found: " + (dst || "(empty)");
            }
        }
    }

    // Returns {action: "ok" | "cancel" | "browseSrc" | "browseDst", src, dst} with the field texts
    function folderDialog(src, dst, error) {
        var w = new Window("dialog", TITLE);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        var result = { action: "cancel", src: src, dst: dst };
        var fields = {};
        function done(action) {
            result = { action: action, src: fields.src.text, dst: fields.dst.text };
            w.close();
        }
        function row(key, label, text) {
            w.add("statictext", undefined, label);
            var g = w.add("group");
            fields[key] = g.add("edittext", undefined, text);
            fields[key].characters = 70;
            g.add("button", undefined, "Browse...").onClick = function () {
                done(key === "src" ? "browseSrc" : "browseDst");
            };
        }
        row("src", "Source folder (ratings are read from here)", src);
        row("dst", "Target folder (ratings are written here)", dst);
        w.add("statictext", undefined, "Paste a path from the Explorer address bar or \"Copy as path\", or press Browse.");
        if (error) w.add("statictext", undefined, error);

        var group = w.add("group");
        group.alignment = "right";
        group.add("button", undefined, "Cancel", { name: "cancel" }).onClick = function () { w.close(); };
        // Named "ok" so Enter in a path field confirms
        group.add("button", undefined, "OK", { name: "ok" }).onClick = function () { done("ok"); };
        (src && !dst ? fields.dst : fields.src).active = true;
        w.show();
        return result;
    }

    function browse(text, prompt) {
        var start = folderFrom(text);
        var f = start ? start.selectDlg(prompt) : Folder.selectDialog(prompt);
        return f ? f.fsName : text;
    }

    // Existing folder for a typed or pasted path, else null. Drops surrounding spaces and the quotes that Explorer's
    // "Copy as path" adds, and trailing separators except after a drive ("C:\"), so the same-folder check sees
    // "...\jpg\" and "...\jpg" as one folder.
    function folderFrom(text) {
        var p = text.replace(/^\s+|\s+$/g, "").replace(/^"(.*)"$/, "$1").replace(/([^:\\\/])[\\\/]+$/, "$1");
        if (p === "") return null;
        // Called without new, Folder returns a File when the path is an existing file
        var f = Folder(p);
        return f instanceof Folder && f.exists ? f : null;
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

    // One window for the whole run: step bar, status, progress bar, summary numbers, log, and one action button
    // whose label changes per stage
    function makeUi(ctx) {
        var ui = {};
        var w = new Window("dialog", TITLE);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];

        var setStep = makeSteps(w);
        var status = w.add("statictext", undefined, "Ready.");
        style(status, true, null);
        // A space, not "", so ScriptUI lays the line out with a text height
        var detail = w.add("statictext", undefined, " ");
        var bar = w.add("progressbar", undefined, 0, 1);
        bar.preferredSize = [720, 12];
        var cells = makeSummary(w);
        var box = w.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
        box.preferredSize = [720, 300];

        var group = w.add("group");
        var after = group.add("group");
        after.alignment = ["fill", "center"];
        var openLog = after.add("button", undefined, "Open log");
        var openBackup = after.add("button", undefined, "Open backup");
        var showTarget = after.add("button", undefined, "Show target in Bridge");
        after.visible = false;
        var cancel = group.add("button", undefined, "Cancel");
        var action = group.add("button", undefined, "Start reading");

        var lines = [];
        var dirty = false;
        var lastFlush = 0;
        var stage = "read";
        var plan = null;
        var result = null;
        var phaseName = "";
        var phaseStart = 0;

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
            var now = new Date().getTime();
            if (phase !== phaseName) {
                phaseName = phase;
                phaseStart = now;
            }
            var speed = speedText(done, total, now - phaseStart);
            fileProgress(phase, done, total, current, speed);
            status.text = phase + (total ? "    " + done + " / " + total + "  (" + Math.floor(done * 100 / total) + "%)" : "");
            detail.text = speed + (speed && current ? "    " : "") + (current || "");
            bar.maxvalue = total || 1;
            bar.value = total ? done : 0;
            if (dirty && (now - lastFlush > 1000 || done === total)) ui.flush();
            else w.update();
        };
        // Counts only grow during a run, so a highlighted value never needs its color reset
        ui.cell = function (key, value, level, label) {
            cells[key].value.text = String(value);
            if (label) cells[key].label.text = label;
            if (level) style(cells[key].value, null, COLORS[level]);
        };
        ui.show = function () { w.show(); };

        // r: {text, level: "ok" | "warn" | "bad", logFile?, backupDir?}
        function finish(r) {
            result = r;
            stage = "done";
            setStep(4);
            action.text = "Close";
            cancel.visible = false;
            ui.progress(r.text, 0, 0, "");
            style(status, null, COLORS[r.level]);
            openLog.visible = !!r.logFile;
            openBackup.visible = !!r.backupDir;
            after.visible = true;
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
                    if (plan.list.length === 0 && plan.copies.length === 0) {
                        finish({ text: "Finished: nothing to write. No files were changed.", level: plan.warnings ? "warn" : "ok" });
                    } else {
                        stage = "write";
                        setStep(2);
                        action.text = writeLabel(plan);
                        action.enabled = true;
                        cancel.enabled = true;
                        ui.progress("Review: check the summary and planned changes, then press Write or Cancel.", 0, 0, "");
                        ui.flush();
                    }
                } else if (stage === "write" && plan.stats.overwrite > 0) {
                    // confirm() did not show from inside this dialog in Bridge 2026, so replacing ratings takes
                    // a second click on the relabelled button instead
                    stage = "confirm";
                    var notice = replaceNotice(ctx, plan);
                    ui.log("");
                    for (var i = 0; i < notice.length; i++) ui.log(notice[i]);
                    action.text = "Confirm: write " + plan.list.length + ", replace " + plan.stats.overwrite +
                        (plan.copies.length ? ", copy " + plan.copies.length : "");
                    action.enabled = true;
                    cancel.enabled = true;
                    ui.progress("Confirm: existing ratings will be replaced. Check the list below, then confirm or Cancel.", 0, 0, "");
                    ui.flush();
                } else {
                    setStep(3);
                    finish(writePhase(ctx, ui, plan));
                }
            } catch (e) {
                ui.log("");
                ui.log("ABORTED: " + e.message + (e.line ? " (line " + e.line + ")" : ""));
                finish({ text: "Aborted: " + e.message, level: "bad" });
            } finally {
                app.synchronousMode = oldMode;
            }
        };
        cancel.onClick = function () {
            ui.progress("Cancelled. No ratings were written.", 0, 0, "");
            w.close();
        };
        openLog.onClick = function () { result.logFile.execute(); };
        openBackup.onClick = function () { result.backupDir.execute(); };
        showTarget.onClick = function () {
            w.close();
            app.document.thumbnail = new Thumbnail(ctx.dstDir);
        };

        setStep(1);
        return ui;
    }

    // "Write 3 files", "Copy 2 files", "Write 3, copy 2 files"
    function writeLabel(plan) {
        var n = plan.list.length, m = plan.copies.length;
        return (n ? "Write " + n + (m ? ", copy " + m : "") : "Copy " + m) + (n + m === 1 ? " file" : " files");
    }

    // "Setup > [ Read ] > Review > Write > Done": the current step bracketed; colors where ScriptUI applies them
    function makeSteps(w) {
        var names = ["Setup", "Read", "Review", "Write", "Done"];
        var row = w.add("group");
        var labels = [];
        for (var i = 0; i < names.length; i++) {
            if (i > 0) style(row.add("statictext", undefined, ">"), null, COLORS.dim);
            var st = row.add("statictext", undefined, "");
            // Fixed width: Bridge clipped "[ REVIEW ]" when the label was sized from its own bold text
            st.characters = 12;
            st.justify = "center";
            style(st, true, null);
            labels.push(st);
        }
        return function (current) {
            var last = current === names.length - 1;
            for (var k = 0; k < labels.length; k++) {
                labels[k].text = k === current ? "[ " + names[k] + " ]" : names[k];
                style(labels[k], null, k < current || last ? COLORS.ok : k === current ? COLORS.accent : COLORS.dim);
            }
        };
    }

    // Key counts as large numbers, so they do not have to be found in the log
    function makeSummary(w) {
        var panel = w.add("panel", undefined, "Summary");
        panel.orientation = "row";
        panel.alignChildren = ["fill", "top"];
        var defs = [["toWrite", "To write"], ["toCopy", "To copy"], ["replace", "Replace a rating"], ["same", "Already equal"],
            ["skipped", "Skipped"], ["warnings", "Warnings"], ["errors", "Errors"]];
        var cells = {};
        for (var i = 0; i < defs.length; i++) {
            var g = panel.add("group");
            g.orientation = "column";
            g.alignChildren = ["center", "top"];
            var value = g.add("statictext", undefined, "-");
            value.characters = 9;
            value.justify = "center";
            style(value, true, null, 6);
            var label = g.add("statictext", undefined, defs[i][1]);
            label.characters = 14;
            label.justify = "center";
            cells[defs[i][0]] = { value: value, label: label };
        }
        return cells;
    }

    // Fonts and colors are cosmetic; a ScriptUI quirk here must never stop a run
    function style(st, bold, rgb, sizeUp) {
        try {
            var g = st.graphics;
            if (bold !== null) g.font = ScriptUI.newFont(g.font.name, bold ? "BOLD" : "REGULAR", g.font.size + (sizeUp || 0));
            if (rgb) g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, rgb, 1);
        } catch (e) {
            // Keep the default look
        }
    }

    // Replacing a rating the target already has is the change most likely to be a mistake, such as swapped folders
    function replaceNotice(ctx, plan) {
        var n = plan.stats.overwrite;
        var examples = [];
        for (var i = 0; i < plan.list.length && examples.length < 20; i++) {
            var p = plan.list[i];
            if (p.before !== 0) examples.push(p.name + ":  " + p.before + " -> " + p.target);
        }
        if (n > examples.length) examples.push("... and " + (n - examples.length) + " more");
        return ["=== Confirm: " + n + (n === 1 ? " existing target rating" : " existing target ratings") + " will be replaced ==="]
            .concat(examples, [
                "Source: " + ctx.srcDir.fsName + "  (" + ctx.srcExt + ")",
                "Target: " + ctx.dstDir.fsName + "  (" + (ctx.dstExt === "*" ? "all files" : ctx.dstExt) + ")",
                "If source and target are swapped, press Cancel. Nothing has been written yet."
            ]);
    }

    // Pairs files, reads ratings, decides what to write and copy. Returns {list, copies, copyDirName, rows, stats, warnings}
    function readPhase(ctx, ui) {
        var s = {
            srcReadError: 0, dupSrc: 0, dupDst: 0, srcOnly: 0, dstOnly: 0, srcOnlyRated: 0,
            same: 0, overwrite: 0, ignoredUnrated: 0, ignoredReject: 0, dstReadError: 0,
            srcReadMethod: "", fastFallback: 0, dstSidecar: 0, dstEmbedded: 0, dstBridge: 0
        };
        var rows = [];
        var issues = [];
        var notes = [];
        var i, key;

        ui.log("");
        ui.log("=== Pairing by file name ===");
        ui.progress("Read 1/5: pairing files by name", 0, 0, "");

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

        // A rated source file with no target counterpart cannot be synced. With COPY_SRC_ONLY it is planned as a copy
        // into a subfolder of the target folder, otherwise it is only reported.
        var copies = [];
        var copyDirName = ctx.srcExt.substring(1).toUpperCase() + "_only_rated";
        for (i = 0; i < srcOnly.length; i++) {
            var lone = srcOnly[i];
            ui.progress("Read 4/5: checking source files without target for ratings", i + 1, srcOnly.length, lone.name);
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
                if (CONFIG.COPY_SRC_ONLY) {
                    copies.push({ file: lone.file, name: copyDirName + "\\" + lone.name, srcName: lone.name,
                        before: "", target: loneRating });
                    continue;
                }
                issues.push("Rated source (" + loneRating + ") has no target file: " + lone.name);
            }
            rows.push(["", lone.name, "", loneRating, "skip: no target file"]);
        }

        var list = [];
        for (i = 0; i < pairs.length; i++) {
            var pr = pairs[i];
            var target = pr.rating;
            ui.progress("Read 5/5: reading target ratings", i + 1, pairs.length, pr.name);

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
        ui.log("Target read: sidecar XMP " + s.dstSidecar + ", embedded RAW XMP " + s.dstEmbedded + ", Bridge " + s.dstBridge);
        ui.log("To write: " + list.length + "  (target already rated, different value: " + s.overwrite + ")");
        if (CONFIG.COPY_SRC_ONLY) ui.log("To copy into " + copyDirName + ": " + copies.length + "  (rated source without target)");
        ui.log("Already equal: " + s.same);
        ui.log("Ignored (source unrated): " + s.ignoredUnrated);
        ui.log("Ignored (source rejected): " + s.ignoredReject);
        ui.log("Source without target: " + s.srcOnly + "  (rated: " + s.srcOnlyRated + ")");
        ui.log("Target without source: " + s.dstOnly);
        ui.log("Read errors (source / target): " + s.srcReadError + " / " + s.dstReadError);
        if (list.length > 0) {
            ui.log("");
            ui.log("=== Planned changes (target: before -> source rating) ===");
            for (i = 0; i < list.length; i++) {
                ui.log(list[i].name + ": " + list[i].before + " -> " + list[i].target +
                    (list[i].before !== 0 ? "   (replaces existing rating)" : ""));
            }
        }
        if (copies.length > 0) {
            ui.log("");
            ui.log("=== Planned copies (rated source without target -> " + ctx.dstDir.fsName + "\\" + copyDirName + ") ===");
            for (i = 0; i < copies.length; i++) ui.log(copies[i].srcName + ": rating " + copies[i].target);
        }
        ui.log("");
        ui.log("Nothing has been written yet.");

        var readErrors = s.srcReadError + s.dstReadError;
        ui.cell("toWrite", list.length);
        ui.cell("toCopy", copies.length);
        ui.cell("replace", s.overwrite, s.overwrite ? "warn" : null);
        ui.cell("same", s.same);
        // Unrated sources get no CSV row, so they are added to the skipped rows here
        ui.cell("skipped", rows.length + s.ignoredUnrated);
        ui.cell("warnings", issues.length, issues.length ? "warn" : null);
        ui.cell("errors", readErrors, readErrors ? "bad" : null);

        return { list: list, copies: copies, copyDirName: copyDirName, rows: rows, stats: s, warnings: issues.length };
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

    // Returns {text, level, logFile, backupDir} for the final screen
    function writePhase(ctx, ui, plan) {
        var n = plan.list.length;
        var m = plan.copies.length;
        var stamp = timestamp();
        var backupDir = null;
        if (CONFIG.BACKUP_XMP || CONFIG.BACKUP_EMBEDDED) {
            backupDir = new Folder(ctx.dstDir.fsName + "/_rating_sync_backup_" + stamp);
            if (!backupDir.create()) throw new Error("Cannot create backup folder " + backupDir.fsName);
        }
        var copyDir = m ? new Folder(ctx.dstDir.fsName + "/" + plan.copyDirName) : null;
        if (copyDir && !copyDir.exists && !copyDir.create()) {
            if (backupDir) backupDir.remove();
            throw new Error("Cannot create folder " + copyDir.fsName + ". Nothing was written.");
        }

        // Every planned change and its before value is on disk before the first write, so a crash mid-write
        // still leaves enough to restore ratings. Results are appended as they happen; the file is rewritten at the end.
        var header = ["target", "source", "target_before", "source_rating", "result"];
        var logFile = new File(ctx.dstDir.fsName + "/_rating_sync_log_" + stamp + ".csv");
        var results = [];
        var copyResults = [];
        function logRows(fallback) {
            return plan.rows.concat(planRows(plan.list, results, fallback), planRows(plan.copies, copyResults, fallback));
        }
        if (!writeCsv(logFile, header, logRows("pending: not written yet"))) {
            // Folder.remove() deletes only empty folders, so a copy folder left by an earlier run stays
            if (backupDir) backupDir.remove();
            if (copyDir) copyDir.remove();
            throw new Error("Cannot write log " + logFile.fsName + ". Nothing was written.");
        }

        var written = 0, writeError = 0, noSidecar = 0, backedUp = 0;
        var aborted = false;

        ui.log("");
        ui.log("=== Writing ===");
        ui.cell("toWrite", "0 / " + n, null, "Written");
        for (var i = 0; i < n; i++) {
            var p = plan.list[i];
            var r;
            ui.progress("Write: writing target ratings", i + 1, n, p.name);
            try {
                r = writeOne(p, backupDir);
            } catch (e) {
                r = { kind: "error", status: "error: " + e.message };
            }
            results.push(r.status);
            appendCsv(logFile, [p.name, p.srcName, p.before, p.target, r.status]);
            ui.log(p.name + ": " + p.before + " -> " + p.target + "   " + r.status);

            if (r.kind === "ok" || r.kind === "warn") written++;
            if (r.kind === "warn") noSidecar++;
            if (r.backedUp) backedUp++;
            if (r.kind === "error" || r.kind === "fatal") writeError++;
            ui.cell("toWrite", written + " / " + n);
            if (writeError) ui.cell("errors", plan.stats.srcReadError + plan.stats.dstReadError + writeError, "bad");
            if (r.kind === "fatal") {
                aborted = true;
                break;
            }
        }

        var copied = 0, copyError = 0;
        if (m && !aborted) {
            ui.log("");
            ui.log("=== Copying rated source files without target ===");
            ui.cell("toCopy", "0 / " + m, null, "Copied");
            for (var j = 0; j < m; j++) {
                var c = plan.copies[j];
                ui.progress("Write: copying rated source files into " + plan.copyDirName, j + 1, m, c.srcName);
                try {
                    r = copyOne(c, copyDir);
                } catch (e) {
                    r = { kind: "error", status: "error: " + e.message };
                }
                copyResults.push(r.status);
                appendCsv(logFile, [c.name, c.srcName, c.before, c.target, r.status]);
                ui.log(c.srcName + " (" + c.target + ") -> " + c.name + "   " + r.status);
                if (r.kind === "ok") copied++;
                if (r.kind === "error") copyError++;
                ui.cell("toCopy", copied + " / " + m);
                if (copyError) ui.cell("errors", plan.stats.srcReadError + plan.stats.dstReadError + writeError + copyError, "bad");
            }
        }

        if (backupDir && backupDir.getFiles().length === 0) backupDir.remove();
        if (copyDir && copyDir.getFiles().length === 0) copyDir.remove();
        var logOk = writeCsv(logFile, header, logRows("not processed: run stopped"));

        ui.log("");
        ui.log("=== Result ===");
        if (aborted) ui.log("STOPPED: a target file itself changed on write. Remaining files were not processed.");
        ui.log("Written and read back: " + written + " / " + n);
        ui.log("Errors (write, backup, read-back mismatch): " + writeError);
        ui.log("Written, metadata embedded or no XMP sidecar: " + noSidecar + "  (original backed up: " + backedUp + ")");
        if (m) {
            ui.log("Copied into " + copyDir.fsName + ": " + copied + " / " + m + "  (already there: " +
                (copyResults.length - copied - copyError) + ", errors: " + copyError + ")");
        }
        ui.log("Log: " + logFile.fsName + (logOk ? "" : "  (final rewrite failed; results are appended at the end)"));
        if (backupDir && backupDir.exists) ui.log("Backup: " + backupDir.fsName);

        var counts = [];
        if (n) counts.push("written " + written + " / " + n);
        if (m) counts.push("copied " + copied + " / " + m);
        return {
            text: (aborted ? "Stopped" : "Finished") + ": " + counts.join(", ") + ", errors " + (writeError + copyError),
            level: aborted ? "bad" : writeError + copyError ? "warn" : "ok",
            logFile: logFile,
            backupDir: backupDir && backupDir.exists ? backupDir : null
        };
    }

    // One CSV row per planned change; results[i] once processed, otherwise the fallback status
    function planRows(list, results, fallback) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            out.push([p.name, p.srcName, p.before, p.target, i < results.length ? results[i] : fallback]);
        }
        return out;
    }

    // Targets that embed XMP (JPG, DNG, TIFF) legitimately change on write; RAW files and files with sidecars must not
    function writeOne(p, backupDir) {
        var xmp = sidecarOf(p.file);
        var hadXmp = xmp.exists;
        var isRaw = RAW_EXTS.hasOwnProperty(extOf(p.name));

        if (hadXmp && backupDir && CONFIG.BACKUP_XMP && !xmp.copy(backupDir.fsName + "/" + decodedName(xmp))) {
            return { kind: "error", status: "skip: XMP backup failed, rating not written" };
        }
        // Without a sidecar Bridge rewrites the XMP inside a non-RAW file, so the whole file is copied first
        var fileCopy = null;
        if (!hadXmp && !isRaw && backupDir && CONFIG.BACKUP_EMBEDDED) {
            fileCopy = new File(backupDir.fsName + "/" + p.name);
            if (!p.file.copy(fileCopy.fsName)) {
                return { kind: "error", status: "skip: file backup failed, rating not written" };
            }
        }

        var sizeBefore = p.file.length;
        var timeBefore = p.file.modified.getTime();

        new Thumbnail(p.file).rating = p.target;

        var fileNow = new File(p.file.fsName);
        var fileChanged = fileNow.length !== sizeBefore || fileNow.modified.getTime() !== timeBefore;
        if (fileChanged && hadXmp) {
            return { kind: "fatal", status: "ABORT: target file itself changed although it had an XMP sidecar" };
        }
        if (fileChanged && isRaw) {
            return { kind: "fatal", status: "ABORT: RAW target file itself changed" };
        }
        if (fileCopy && !fileChanged) fileCopy.remove();

        var stored = readBack(p.file);
        if (stored !== p.target) {
            return { kind: "error", status: "error: read back " + stored + " instead of " + p.target };
        }
        if (fileChanged) {
            return { kind: "warn", backedUp: !!fileCopy,
                status: "written: metadata embedded in the file" + (fileCopy ? ", original backed up" : "") };
        }
        if (!sidecarOf(p.file).exists) {
            return { kind: "warn", status: "written: no XMP sidecar found" };
        }
        return { kind: "ok", status: hadXmp ? "written: XMP updated" : "written: XMP created" };
    }

    // Copies a rated source file that has no target into copyDir. A file already there is never replaced, and the
    // source's .xmp sidecar goes along so the copy keeps its rating.
    function copyOne(c, copyDir) {
        var where = decodedName(copyDir);
        var dest = new File(copyDir.fsName + "/" + c.srcName);
        if (dest.exists) return { kind: "skip", status: "skip: already in " + where };
        if (!c.file.copy(dest.fsName)) return { kind: "error", status: "error: copy failed" };
        if (new File(dest.fsName).length !== c.file.length) {
            dest.remove();
            return { kind: "error", status: "error: copy incomplete, removed" };
        }
        var side = sidecarOf(c.file);
        if (!side.exists) return { kind: "ok", status: "copied to " + where };
        var destSide = sidecarOf(dest);
        // Without its sidecar the copy may lack the rating, so it is removed and the next run tries again
        if (destSide.exists || !side.copy(destSide.fsName)) {
            dest.remove();
            return { kind: "error", status: "error: XMP sidecar not copied" +
                (destSide.exists ? " (" + decodedName(destSide) + " already in " + where + ")" : "") + ", copy removed" };
        }
        return { kind: "ok", status: "copied to " + where + " with XMP sidecar" };
    }

    // Reads the written value from disk rather than through Bridge, which may answer from its own cache.
    // Bridge clears a rating by removing xmp:Rating, so a sidecar without one reads as 0 instead of
    // falling through to the rating the camera embedded in the file.
    function readBack(file) {
        try {
            if (!loadXmpLib()) return readRating(file);
            var side = sidecarOf(file);
            if (!side.exists) return embeddedRating(file);
            var r = ratingFromXmp(new XMPMeta(readText(side)), file);
            return r === null ? 0 : r;
        } catch (e) {
            return "unreadable (" + e.message + ")";
        }
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

    // Target ratings in a .xmp sidecar are read from it directly. A RAW file without a sidecar has never been rated
    // in Bridge, so the XMP the camera embedded is what Bridge shows and is read directly too. Bridge is asked for
    // other files without a sidecar, a sidecar with no xmp:Rating, or when a direct read fails.
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
        } else if (!side.exists && RAW_EXTS.hasOwnProperty(extOf(decodedName(file))) && loadXmpLib()) {
            try {
                var embedded = embeddedRating(file);
                s.dstEmbedded++;
                return embedded;
            } catch (e) {
                notes.push(decodedName(file) + ": embedded XMP unreadable (" + e.message + ")");
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
        var phase = "Read 2/5: reading source ratings (" + (useFast ? "direct XMP" : "Bridge") + ")";
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
            ui.progress("Read 3/5: checking direct read against Bridge", k + 1, n, pr.srcName);
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
        return embeddedRating(file);
    }

    // Rating in the XMP packet inside the file; 0 when the packet has none
    function embeddedRating(file) {
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
        return function (phase, done, total, current, speed) {
            var now = new Date().getTime();
            if (phase === lastPhase && done !== total && now - lastWrite < 1000) return;
            lastWrite = now;
            lastPhase = phase;

            var lines = ["Phase: " + phase];
            if (total) lines.push("Progress: " + done + " / " + total + " (" + Math.floor(done * 100 / total) + "%)");
            if (speed) lines.push("Speed: " + speed);
            if (current) lines.push("Current: " + current);
            lines.push("Source: " + ctx.srcDir.fsName + "  " + ctx.srcExt,
                "Target: " + ctx.dstDir.fsName + "  " + ctx.dstExt,
                "Started: " + started, "Updated: " + formatTime(new Date()));
            try {
                file.encoding = "UTF-8";
                if (file.open("w")) {
                    // BOM so Notepad and Windows PowerShell decode non-ASCII paths correctly
                    file.write("\uFEFF" + lines.join("\n") + "\n");
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

    // "25 files/s, about 1 min 10 s left, 48 s elapsed"; empty until two seconds of a phase give a usable rate
    function speedText(done, total, ms) {
        if (!total || done === 0 || ms < 2000) return "";
        var rate = done * 1000 / ms;
        var text = (rate >= 10 ? Math.round(rate) : rate.toFixed(1)) + " files/s";
        if (done < total) text += ", about " + duration((total - done) / rate) + " left";
        return text + ", " + duration(ms / 1000) + " elapsed";
    }

    function duration(sec) {
        sec = Math.round(sec);
        return sec < 60 ? sec + " s" : Math.floor(sec / 60) + " min " + (sec % 60) + " s";
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

    function csvLine(row) {
        var cells = [];
        for (var j = 0; j < row.length; j++) cells.push(csvCell(row[j]));
        return cells.join(",");
    }

    function writeCsv(file, header, rows) {
        file.encoding = "UTF-8";
        if (!file.open("w")) return false;
        try {
            // BOM so Excel reads non-ASCII file names correctly
            file.write("\uFEFF");
            var all = [header].concat(rows);
            for (var i = 0; i < all.length; i++) file.writeln(csvLine(all[i]));
        } finally {
            file.close();
        }
        return true;
    }

    // A failed append is tolerated: the log written before the run already holds the before value
    function appendCsv(file, row) {
        try {
            file.encoding = "UTF-8";
            if (file.open("a")) {
                file.writeln(csvLine(row));
                file.close();
            }
        } catch (e) {
            // Keep writing ratings; the final rewrite records this result again
        }
    }
})();
