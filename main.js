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
    //  - insert in proper alphabetical order (by rel-path, not by bare module name)
    //  - handle existing import block only 1 line long (it's both first & last line)
    //  - handle NO existing import block - create new import block 'near' top of file
    //  - remove folder-name assumptions
    //  - show toast for imports that were inserted outside of viewport area
    //  - bump out other lines' = signs if needed
    //  - if first line, add 'var'
    //  - if last line, move ';' down
    //  - if text selected, replace instead of insert
    //  - if file extension != .js, generate a "text!" require() instead
    //  - detect indent level
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
            extensionName = extensionsRootRelPath.substring(0, extensionsRootRelPath.indexOf("/")); // will be "" if -1
            if (!extensionName) {
                console.error("File is in extensions root but not in any extension: " + fullPath);
                return;
            }
            
            // Change relPath's context from global Require root to this extenion's Require root
            relPath = extensionsRootRelPath.substring(extensionName.length + 1);
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
        var insertionPos = editor.getCursorPos();
        
        var lineText = doc.getLine(insertionPos.line);
        var match = REQUIRE_LINE_REGEXP.exec(lineText);
        
        // Nothing at cursor pos -- let's look elsewhere
        if (!match) {
            var nLines = editor.lineCount();
            var i;
            for (i = 0; i < nLines; i++) {
                var maybeLineText = doc.getLine(i);
                var maybeMatch = REQUIRE_LINE_REGEXP.exec(maybeLineText);
                if (maybeMatch && maybeMatch[3].indexOf(requireCall) !== -1) {
                    lineText = maybeLineText;
                    match = maybeMatch;
                    insertionPos.line = i;
                    break;
                }
            }
        }
        
        insertionPos.ch = 0;
        var result = { pos: insertionPos, lineText: lineText, match: match };
        
        if (!match) {
            console.warn("Quick Insert: Cannot find a block of " + requireCall + "() calls to insert into. Inserting at cursor pos...");
        } else if (isFirstLine(match)) {
            result.isFirstLine = true;
            insertionPos.line++; // insert below first line
        } else if (isLastLine(match)) {
            result.isLastLine = true;
            // insert above last line (don't touch insertionPos.line)
        } else {
            insertionPos.line++; // insert below current line
        }
        
        return result;
    }
    
    /**
     * @param {SearchResult} selectedItem
     */
    function itemSelect(selectedItem) {
        
        // Generate import code
        var editor = EditorManager.getActiveEditor();
        if (selectedItem && editor) {
            
            // If...
            // Import is in extension, file being edited isn't -- error
            // Import is in extension, file being edited is too -- use require() (but if *different* extensions, error)
            // Import not in extension, file being edit isn't either -- use require()
            // Import not in extension, file being edit is -- use brackets.getModule()
            
            var importPath  = selectedItem.fullPath;
            var currentPath = editor.document.file.fullPath;
            var importModuleInfo  = parseModulePath(importPath);
            var currentModuleInfo = parseModulePath(currentPath);
            
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
            fileTypes: [],  // empty array = all file types
            done: function () {},
            search: search,
            match: match,
            itemFocus: function () {},
            itemSelect: itemSelect,
            resultsFormatter: resultFormatter
        }
    );
    
    function beginFileSearch() {
        // Begin Quick Open in our search mode
        QuickOpen.beginSearch("=");
    }
    
    
    // Command to launch our Quick Open mode
    var QUICK_IMPORT_COMMAND_ID = "pflynn.quickRequireImport";
    CommandManager.register("RequireJS Import", QUICK_IMPORT_COMMAND_ID, beginFileSearch);
    
    // Add menu item too
    var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
    menu.addMenuDivider(Menus.LAST);
    menu.addMenuItem(QUICK_IMPORT_COMMAND_ID, "Ctrl-I", Menus.LAST);
    
});
