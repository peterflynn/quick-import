/*
 * Copyright (c) 2013 Peter Flynn.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true */
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        Menus               = brackets.getModule("command/Menus"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        FileIndexManager    = brackets.getModule("project/FileIndexManager"),
        QuickOpen           = brackets.getModule("search/QuickOpen");
    
    // TODO
    //  - handle existing import block only 1 line long (it's both first & last line)
    //  - remove folder-name assumptions
    //      TODO: write up 'how to use prefs' docs while doing this
    //  - insert in proper alphabetical order (by rel-path, not by bare module name) (adjusting "var" and ";" location as needed)
    //  - handle NO existing import block - create new import block 'near' top of file
    //  - filter out or heavily down-rank non-.js files?
    //  - work in Brackets unit test code (files outside /src & with special /spec context)
    //  - show toast for imports that were inserted outside of viewport area
    //  - bump out other lines' = signs if needed
    //  - support pre-canned import options for NodeJS standard APIs
    //  - recognize locally installed NodeJS packages (npm) & list those as options too
    //  - support pure-AMD syntax (array of module names + list of arguments)
    //  - if file extension != .js, generate a "text!" require() instead
    //  - detect duplicates
    
    
    // --------------------------------------------------------------------------------------------
    // Code generation & insertion
    
    var REQUIRE_ROOT = "/src/";
    var EXTENSIONS_ROOT = "extensions/";  // atop REQUIRE_ROOT

    function stripPrefix(str, prefix, allowMoreToLeft) {
        var index = str.indexOf(prefix);
        if (index === -1 || (!allowMoreToLeft && index !== 0)) {
            return null;
        }
        return str.substring(index + prefix.length);
    }
    function afterLast(str, prefix) {
        var index = str.lastIndexOf(prefix);
        if (index === -1) {
            return str;
        }
        return str.substring(index + 1);
    }
    function beforeLast(str, prefix) {
        var index = str.lastIndexOf(prefix);
        if (index === -1) {
            return str;
        }
        return str.substring(0, index);
    }
    
    var REQUIRE_LINE_REGEXP = /^(\s*)(\w.*)=(.+)(,|;)/;
    
    function isFirstLine(match) {
        return match[2].indexOf("var ") !== -1;
    }
    function isLastLine(match) {
        return match[4] === ";";
    }
    
    function nChars(char, n) {
        var str = "";
        while (n--) {
            str += char;
        }
        return str;
    }
    
    /**
     * Given a path relative to REQUIRE_ROOT. Returns:
     *    requirePath: string passed to require() - root-relative path sans file extension
     *    moduleName: file name sans extension alone
     *    extensionName: name of extension folder requirePath is relative to, if any
     */
    function parseModulePath(fullPath) {
        var relPath = stripPrefix(fullPath, REQUIRE_ROOT, true);
        if (!relPath) {
            console.error("File lies outside Require root: " + fullPath);
            return;
        }
        
        // Is this module in an extension?
        var extensionName;
        var extensionsRootRelPath = stripPrefix(relPath, EXTENSIONS_ROOT);
        if (extensionsRootRelPath) {
            var firstFolder = extensionsRootRelPath.indexOf("/");
            if (firstFolder === -1) {
                console.error("File is in extensions folder but not in any extensions root: " + fullPath);
                return;
            }
            var extensionType = extensionsRootRelPath.substring(0, firstFolder);
            if (extensionType !== "dev" && extensionType !== "default") {
                console.warn("Unknown extensions root folder '" + extensionType + "' for module: " + fullPath);
            }
            
            var secondFolder = extensionsRootRelPath.indexOf("/", firstFolder + 1);
            if (secondFolder === -1) {
                console.error("File is in extensions root but not in any extension: " + fullPath);
                return;
            }
            extensionName = extensionsRootRelPath.substring(firstFolder + 1, secondFolder); // will be "" if -1
            
            // Change relPath's context from global Require root to this extension's Require root
            relPath = extensionsRootRelPath.substring(secondFolder + 1);
        }
        
        var fileName = afterLast(relPath, "/");
        return {
            requirePath: beforeLast(relPath, "."),
            moduleName: beforeLast(fileName, "."),
            extensionName: extensionName
        };
    }
    
    
    /**
     * @param {!Editor} editor
     * @param {!string} requireCall  Name of import call; we prefer to insert in a block of like-named calls
     * @return {!{pos:{line,ch}, lineText:string, match:Array.<string>, isFirstLine:?boolean, isLastLine:?boolean}}
     */
    function determineInsertionPos(editor, requireCall) {
        var doc = editor.document;
        
        function checkInsertionPos(line) {
            var lineText = doc.getLine(line);
            var match = REQUIRE_LINE_REGEXP.exec(lineText);
            if (match && match[3].indexOf(requireCall) !== -1) {
                return { lineText: lineText, match: match };
            }
            return null;
        }
        
        var insertionPos = editor.getCursorPos();
        var result = checkInsertionPos(insertionPos.line);
        
        // Nothing at cursor pos -- let's look elsewhere
        if (!result) {
            var nLines = Math.min(editor.lineCount(), 200);
            var i;
            for (i = 0; i < nLines && !result; i++) {
                insertionPos.line = i;
                result = checkInsertionPos(i);
            }
        }
        
        // Couldn't find anything near top of file
        if (!result) {
            // TODO: create a new require() block at top of module
            console.warn("Quick Insert: Cannot find a block of " + requireCall + "() calls to insert into. Inserting at cursor pos...");
            insertionPos = { line: editor.getCursorPos().line, ch: 0 };
            return { lineText: doc.getLine(insertionPos.line), match: null, pos: insertionPos };
        }
        
        insertionPos.ch = 0;
        
        result.isFirstLine = isFirstLine(result.match);
        result.isLastLine  = isLastLine(result.match);
        
        if (!result.isLastLine || result.isFirstLine) {
            // Insert below unless insertion pt is on last line, in which case we leave insertionPos.line unchanged (to insert above)
            // (if there's only one line though, treat as first line not last, and still insert below)
            insertionPos.line++;
        }
        
        result.pos = insertionPos;
        return result;
    }
    
    /**
     * Inserts a require() statement into the current editor
     * @param {string} importPath  Full path of file to add a require() import for
     */
    function insertImport(importPath) {
        
        // Generate import code
        var editor = EditorManager.getActiveEditor();
        if (editor) {
            
            // If...
            // Import is in extension, file being edited isn't -- error
            // Import is in extension, file being edited is too -- use require() (but if *different* extensions, error)
            // Import not in extension, file being edited isn't either -- use require()
            // Import not in extension, file being edited is -- use brackets.getModule()
            
            var currentPath = editor.document.file.fullPath;
            var importModuleInfo  = parseModulePath(importPath);
            var currentModuleInfo = parseModulePath(currentPath);
            
            if (!importModuleInfo || !currentModuleInfo) {
                return;
            }
            
            var requireCall;
            if (importModuleInfo.extensionName) {
                if (!currentModuleInfo.extensionName) {
                    console.error("Can't import extension file " + importPath + " from outside module " + currentPath);
                } else if (currentModuleInfo.extensionName !== importModuleInfo.extensionName) {
                    console.error("Can't import extension file " + importPath + " from different extension's module " + currentPath);
                } else {
                    requireCall = "require";
                }
            } else {
                if (currentModuleInfo.extensionName) {
                    requireCall = "brackets.getModule";
                } else {
                    requireCall = "require";
                }
            }
            if (!requireCall) {
                return;
            }
            
            // Find a location to insert
            var insertionContext = determineInsertionPos(editor, requireCall);
            var insertionPos = insertionContext.pos;
            
            // Determine indentation (leading whitespace)
            var leadingWs;
            if (!insertionContext.match) {
                leadingWs = "";
            } else if (insertionContext.isFirstLine) {
                leadingWs = insertionContext.match[1] + "    ";
            } else {
                leadingWs = insertionContext.match[1];
            }
            
            // Determine whitespace between module name and '='
            var trailingWs;
            var eqColumn = insertionContext.lineText.indexOf("=");
            var naturalEqColumn = leadingWs.length + importModuleInfo.moduleName.length + 1; // we always force one space before "=" beyond trailingWs, hence +1
            if (naturalEqColumn >= eqColumn) {
                trailingWs = "";
            } else {
                trailingWs = nChars(" ", eqColumn - naturalEqColumn);
            }
            
            // Make the edit
            var code = leadingWs + importModuleInfo.moduleName + trailingWs + " = " + requireCall + "(\"" + importModuleInfo.requirePath + "\"),\n";
            
            editor.document.replaceRange(code, insertionPos);
        }
    }
    
    
    // --------------------------------------------------------------------------------------------
    // File search UI similar to Quick Open's default mode
    
    var searchPromise;
    var latestQuery;
    
    /**
     * @param {SearchResult} selectedItem
     */
    function itemSelect(selectedItem) {
        insertImport(selectedItem.fullPath);
    }
    
    /**
     * @param {!string} query
     * @param {!Array.<FileInfo>} fileList
     * @param {!StringMatcher} matcher
     */
    function doSearch(query, fileList, matcher) {
        query = query.substr(1);  // lose the "=" prefix
        
        // TODO: this part copied from QuickOpen.searchFileList()
        // First pass: filter based on search string; convert to SearchResults containing extra info
        // for sorting & display
        var filteredList = $.map(fileList, function (fileInfo) {
            // Is it a match at all?
            // match query against the full path (with gaps between query characters allowed)
            var searchResult = matcher.match(ProjectManager.makeProjectRelativeIfPossible(fileInfo.fullPath), query);
            if (searchResult) {
                searchResult.label = fileInfo.name;
                searchResult.fullPath = fileInfo.fullPath;
            }
            return searchResult;
        });
        
        // Sort by "match goodness" tier first; break ties alphabetically by short filename
        QuickOpen.basicMatchSort(filteredList);
        
        return filteredList;
    }
    
    /**
     * @param {string} query User query/filter string
     * @return {Array.<SearchResult>|$.Promise} Sorted and filtered results that match the query, or a promise
     *      resolved with such an array later.
     */
    function search(query, matcher) {
        // We're useless if there's no file open to insert text into
        if (!EditorManager.getActiveEditor()) {
            return [];
        }
        
        // We're already async waiting on files list, nothing more we can do yet
        if (searchPromise) {
            latestQuery = query;
            return searchPromise;
        }
        
        var fileList;
        var fileListPromise = FileIndexManager.getFileInfoList("all")
            .done(function (result) {
                fileList = result;
            });
        
        if (fileListPromise.isResolved()) {
            return doSearch(query, fileList, matcher);
        } else {
            // Index isn't built yet - start waiting
            latestQuery = query;
            searchPromise = new $.Deferred();
            fileListPromise.done(function () {
                searchPromise.resolve(doSearch(latestQuery, fileList, matcher));
                searchPromise = null;
                latestQuery = null;
            });
            return searchPromise.promise();
        }
    }
    
    /**
     * @param {SearchResult} fileEntry
     * @param {string} query
     * @return {string}
     */
    function resultFormatter(item, query) {
        // TODO: copied from QuickOpen._filenameResultsFormatter()
        
        // For main label, we just want filename: drop most of the string
        function fileNameFilter(includesLastSegment, rangeText) {
            if (includesLastSegment) {
                var rightmostSlash = rangeText.lastIndexOf('/');
                return rangeText.substring(rightmostSlash + 1);  // safe even if rightmostSlash is -1
            } else {
                return "";
            }
        }
        var displayName = QuickOpen.highlightMatch(item, null, fileNameFilter);
        var displayPath = QuickOpen.highlightMatch(item, "quicksearch-pathmatch");
        
        return "<li>" + displayName + "<br /><span class='quick-open-path'>" + displayPath + "</span></li>";
    }
    
    /**
     * @param {string} query
     * @return {boolean} true if this plugin wants to provide results for this query
     */
    function match(query) {
        if (query.indexOf("=") === 0) {
            return true;
        }
    }
    
    
    // Register as a new Quick Open mode
    QuickOpen.addQuickOpenPlugin(
        {
            name: "Quick RequireJS Import",
            label: "RequireJS Import",  // ignored before Sprint 22
            languageIds: [],  // empty array = all file types  (Sprint 23+)
            fileTypes:   [],  // (< Sprint 23)
            done: function () {},
            search: search,
            match: match,
            itemFocus: function () {},
            itemSelect: itemSelect,
            resultsFormatter: resultFormatter
        }
    );
    
    function beginFileSearch() {
        var currentEditor = EditorManager.getActiveEditor();
        var prepopulateText = (currentEditor && currentEditor.getSelectedText()) || "";

        // Begin Quick Open in our search mode
        QuickOpen.beginSearch("=", prepopulateText);
    }
    
    
    // Command to launch our Quick Open mode
    var QUICK_IMPORT_COMMAND_ID = "pflynn.quickRequireImport";
    CommandManager.register("RequireJS Import", QUICK_IMPORT_COMMAND_ID, beginFileSearch);
    
    // Add menu item too
    var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
    menu.addMenuDivider(Menus.LAST);
    menu.addMenuItem(QUICK_IMPORT_COMMAND_ID, "Ctrl-I", Menus.LAST);
    
    
    // For unit tests
    exports.insertImport = insertImport;
});
