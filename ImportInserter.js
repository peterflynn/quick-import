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


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, regexp: true */
/*global define, brackets, $ */

/**
 * Handles code generation & insertion
 */
define(function (require, exports, module) {
    
    "use strict";
    
    // Brackets modules
    var EditorManager           = brackets.getModule("editor/EditorManager"),
        ProjectManager          = brackets.getModule("project/ProjectManager");
    
    // TODO
    //  - deal with /test/spec
    //  - deal with special cases like Editor & NFS
    //  - insert in proper alphabetical order (**by rel-path**, not by bare module name) (adjusting "var" and ";" location as needed)
    //  - handle NO existing import block - create new import block 'near' top of file 
    //  - handle NO exisiting import amd depency list ( [] )
    //  - remove folder-name assumptions ( There should be a way to get the loaded root repository from brackets )
    //      TODO: write up 'how to use prefs' docs while doing this
    //  ( projectManager.getProjectRoot() give the loaded project root, but root path depends on the naming conventions it could be src, WebContent )
    //  - filter out or heavily down-rank non-.js files?
    //  - work in Brackets unit test code (files outside /src & with special /spec context)
    //  - bump out other lines' = signs if needed
    //  - detect duplicates
    //  - show toast for imports that were inserted outside of viewport area
    //  - support pre-canned import options for NodeJS standard APIs
    //  - recognize locally installed NodeJS packages (npm) & list those as options too
    //  - if file extension != .js, generate a "text!" require() instead
    
    
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
    var DEFINE_LINE_REGEXP = /define\([\[]?([\s\S]*?)\],[\s\S]*?function[\s\S]?\(([\s\S]*?)\)/;
    
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
        
        // TODO: Use makeProjectRelativeIfPossible ?
        // TODO: Instead of folder assumption maybe we can search for the first index.html/.js lying in the project root ( ProjectManager.getProjectRoot() )
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
    *   Remove forbidden characters in variable name
    *   TODO: camelCase
    *   TODO: First letter lower case if singleton other otherwiser uppercase
    *   @return String, variable name to use as import name
    */
    function moduleNameAsVariableName(moduleName) {
        return moduleName.replace(/[^\w\s]/gi, '');
    }
    
    /*
    *   @param import path
    *   If a Mapping is configured for the given import, it will return the alias of the module
    *
    */
    function getMappedImport(importString) {
        // TODO: Load require-config
        // TODO: Search for a match
        return importString;
    }

    
    
    /**
     * @param {!Editor} editor
     * @param {!string} requireCall  Name of import call; we prefer to insert in a block of like-named calls
     * 
     * @return {!{pos:{line,ch}, lineText:string, match:Array.<string>, isFirstLine:?boolean, isLastLine:?boolean}}
     *    pos: position to insert at; ch always 0 (so pos.line is line we're inserting before)
     *    isFirstLine: true if pos.line - 1 is first line of require() block (with "var"); insertion pt will be 2nd line
     *    isLastLine:  true if pos.line is last line of require() block (with ";"); insertion pt will be next-to-last line
     *      OR true if pos.line - 1 is ONLY line in require() block; insertion pt will be 2nd line in block, making it multi-line
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
    function doInsert(editor, importPath) {
        
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
        
        // Semicolon fixup
        var trailingDelim = ",";
        if (insertionContext.isFirstLine && insertionContext.isLastLine) {
            trailingDelim = ";";  // move semicolon to our new line...
            
            var lineNum = insertionContext.pos.line - 1;
            var lineText = editor.document.getLine(lineNum);
            var semicolon = lineText.lastIndexOf(";");
            if (semicolon !== -1) {
                editor.document.replaceRange(",", {line: lineNum, ch: semicolon}, {line: lineNum, ch: semicolon + 1});  // ...from the old line
            }
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
        var code = leadingWs + importModuleInfo.moduleName + trailingWs + " = " + requireCall + "(\"" + importModuleInfo.requirePath + "\")" + trailingDelim + "\n";
        
        editor.document.replaceRange(code, insertionPos);
    }
    
    
    
    function doInsertAmd(editor, newImport) {
        
        var doc = editor.document,
            currentDependencies,
            imports,
            moduleNames,
            moduleInfos,
            importsAsString,
            finalDocContent;
        
        
        /** 
        *   Extract the list of import from the current document 
        *   @return { 
        *        startIndex : pos of the first import caracters
        *        moduleNamesAsString : String representing the list of module names
        *        importsAsString : String representing the list of imports
        *       }
        **/
        function getCurrentDependencies() {
            var documentText = doc.getText();
            var match = DEFINE_LINE_REGEXP.exec(documentText);
            if (match && match[1]) {
			

                // FIXME : Will not work if match[2] is a match with the content of match[1]
                var indexStartCaptureImport = match[0].lastIndexOf(match[1]);
                var indexStartCaptureModule = match[0].lastIndexOf(match[2]);
                return {    importsAsString : match[1],
                            moduleNamesAsString : match[2],
                            startIndex : match.index + indexStartCaptureImport,
                            startIndexForModules : match.index + indexStartCaptureModule };
            }
            return null;
        }
        
        
        /**
        *
        *   Build imports as an array, cleanup special chars
        *   Remove line breaks, tabs and white spaces, will be added when import array is rebuilt
        *
        **/
        function stringAsArray(inputString) {
                
			var cleanupstring = inputString;
            cleanupstring = cleanupstring.replace(/(\r\n|\n|\r)/gm, '');
            cleanupstring = cleanupstring.replace(/\s+/g, '');
            cleanupstring = cleanupstring.replace(/\t+/g, '');
            
            
            return (cleanupstring === "") ?  [] : cleanupstring.split(",");
        }
    
        
        currentDependencies = getCurrentDependencies();
        if (currentDependencies) {
            imports = currentDependencies.importsAsString ? stringAsArray(currentDependencies.importsAsString) : [];
            moduleNames = currentDependencies.moduleNamesAsString ? stringAsArray(currentDependencies.moduleNamesAsString) : [];
        } else {
            // TODO: We must  search again with a modified regexp, than we shall start building the depencies array
            return;
        }
        
        // TODO: Depending on the extension we should search for the appropriate plugin, 
        // maybe throw an error if that plugin does not exist within the project
        moduleInfos = parseModulePath(newImport);
       
        imports.push("'" + getMappedImport(moduleInfos.requirePath) + "'");
        moduleNames.push(moduleNameAsVariableName(moduleInfos.moduleName));
        

        importsAsString = currentDependencies.importsAsString;
        finalDocContent = doc.getText().substr(0, currentDependencies.startIndex)
            + "\n\t"
            + imports.join(",\n\t")
            + "\n"
            + doc.getText().substr(currentDependencies.startIndex + importsAsString.length, (currentDependencies.startIndexForModules - (currentDependencies.startIndex + importsAsString.length)))
            + moduleNames.join(", ")
            + doc.getText().substr(currentDependencies.startIndexForModules + currentDependencies.moduleNamesAsString.length, (doc.getText().length - (currentDependencies.startIndexForModules + currentDependencies.moduleNamesAsString.length)));
        
        doc.setText(finalDocContent);
        
    }
    
    /*
    *   Detect if the current file is using amd syntax.
    *   return Boolean
    **/
    function isFileUsingAmdSyntax(doc) {
        return doc.getText().match(/define\(\[/);
    }
    
    
    /**
    *   Insert the correct import
    *
    **/
    function insertImport(importPath) {
        var editor = EditorManager.getActiveEditor();

        if (editor) {
            editor.document.batchOperation(function () {
                
                if (isFileUsingAmdSyntax(editor.document)) {
                    doInsertAmd(editor, importPath);
                } else {
                    doInsert(editor, importPath);
                }
                
            });
        }
        
    }
    
    
    
    // Public API
    exports.insertImport = insertImport;
});
