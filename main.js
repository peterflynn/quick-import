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
        FileIndexManager    = brackets.getModule("project/FileIndexManager"),
        QuickOpen           = brackets.getModule("search/QuickOpen");
    
    // code generation & insertion
    var ImportInserter      = require("ImportInserter");
    
    
    // --------------------------------------------------------------------------------------------
    // File search UI similar to Quick Open's default mode
    
    var searchPromise;
    var latestQuery;
    
    /**
     * @param {SearchResult} selectedItem
     */
    function itemSelect(selectedItem) {
        ImportInserter.insertImport(selectedItem.fullPath);
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
        
        if (fileListPromise.state() === "resolved") {
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
            resultsFormatter: resultFormatter,
            matcherOptions: { segmentedSearch: true }
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
    
});
