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


/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, indent: 4 */
/*global define, describe, it, expect, beforeEach, afterEach, brackets */

define(function (require, exports, module) {
    "use strict";

    // Modules from the SpecRunner window
    var SpecRunnerUtils  = brackets.getModule("spec/SpecRunnerUtils"),
        NativeFileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem;
    
    // Our own module
    var ImportInserter   = require("ImportInserter");

    describe("[pf] Quick Import: Require() insertion", function () {

        var testDocument, testEditor;
        
        beforeEach(function () {
            // create dummy Document for the Editor
            var mock = SpecRunnerUtils.createMockEditor("", "javascript");
            testDocument = mock.doc;
            testEditor   = mock.editor;
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/package/DestModule.js");
        });
        
        afterEach(function () {
            SpecRunnerUtils.destroyMockEditor(testDocument);
        });
        
        
        
        var require3Lines =
            "define(function (require, exports, module) {\n" +
            "    \"use strict\";\n" +
            "    \n" +
            "    // Brackets modules\n" +
            "    var CommandManager = require(\"command/CommandManager\"),\n" +
            "        Commands       = require(\"command/Commands\"),\n" +
            "        Menus          = require(\"command/Menus\");\n" +
            "    \n" +
            "    function foo() {\n" +
            "        bar();\n" +
            "    }\n" +
            "    \n" +
            "});";
        
        var require1Line =
            "define(function (require, exports, module) {\n" +
            "    \"use strict\";\n" +
            "    \n" +
            "    // Brackets modules\n" +
            "    var CommandManager = require(\"command/CommandManager\");\n" +
            "    \n" +
            "    function foo() {\n" +
            "        bar();\n" +
            "    }\n" +
            "    \n" +
            "});";
        
        var requireNone =
            "define(function (require, exports, module) {\n" +
            "    \"use strict\";\n" +
            "    \n" +
            "    function foo() {\n" +
            "        bar();\n" +
            "    }\n" +
            "    \n" +
            "});";
        
                
        var requirePureAmd =
            "define(['require', 'jquery', 'backbone'], function (require, jquery, backbone) {\n" +
            "    \"use strict\";\n" +
            "    \n" +
            "    function foo() {\n" +
            "        bar();\n" +
            "    }\n" +
            "    \n" +
            "});";
        
        
        var requirePureAmdExpectedAfterImport =
            "define([\n\t'require',\n\t'jquery',\r\n\t'backbone',\n\t'package/Editor'\n], function (require, jquery, backbone, Editor) {\n" +
            "    \"use strict\";\n" +
            "    \n" +
            "    function foo() {\n" +
            "        bar();\n" +
            "    }\n" +
            "    \n" +
            "});";
        
        var getModule3Lines = require3Lines.replace(/require/g, "brackets.getModule");
        
        
        it("insert short module into existing require() block", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            var lines = startingText.split("\n");
            lines.splice(5, 0, "        Editor         = require(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("insert long module into existing require() block", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/editor/EditorCommandHandlers.js");
            
            var lines = startingText.split("\n");
            lines.splice(5, 0, "        EditorCommandHandlers = require(\"editor/EditorCommandHandlers\"),");
//            lines.splice(4, 3, "    var CommandManager        = require(\"command/CommandManager\"),",        // TODO: later functionality - adjust other lines' indent
//                               "        EditorCommandHandlers = require(\"editor/EditorCommandHandlers\"),",
//                               "        Commands              = require(\"command/Commands\"),",
//                               "        Menus                 = require(\"command/Menus\"),"
//                        );
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        
        // Cursor-driven targeting ----------------------------------------------------------------
        
        it("insert below line cursor is on", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 5, ch: 8 });        // middle require() line
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            var lines = startingText.split("\n");
            lines.splice(6, 0, "        Editor         = require(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("insert below first line", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 4, ch: 8 });        // first require() line
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            var lines = startingText.split("\n");
            lines.splice(5, 0, "        Editor         = require(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("insert above last line", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 6, ch: 8 });        // last require() line
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            var lines = startingText.split("\n");
            lines.splice(6, 0, "        Editor         = require(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        // TODO: cursor in wrong type of block, when both types present
        
        it("don't get fooled by var block", function () {
            var lines = require3Lines.split("\n");
            lines.splice(9, 0, "        var one = 1,\n",
                               "            two = 2,\n",
                               "            three = 3;\n"
                        );
            var startingText = lines.join("\n");
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 10, ch: 12 });        // just before two
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            lines = startingText.split("\n");
            lines.splice(5, 0, "        Editor         = require(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        
        // Degenerate require() blocks ------------------------------------------------------------
        
        it("do something semi-useful when no require() block present", function () {
            var startingText = requireNone;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 4, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            // failure mode: we just insert the import statement on the line the cursor is on
            var lines = startingText.split("\n");
            lines.splice(4, 0, "Editor = require(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("insert properly when require() block is 1 line long", function () {
            var startingText = require1Line;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 7, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            // inserted on the line after the 1-line require, with proper ";" fixup
            var lines = startingText.split("\n");
            lines[4] = lines[4].substr(0, lines[4].length - 1) + ",";
            lines.splice(5, 0, "        Editor         = require(\"package/Editor\");");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        
        // Extensions -----------------------------------------------------------------------------
        
        it("insert peer module in extension", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/dev/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/dev/myext/ExtMod.js");
            
            var lines = startingText.split("\n");
            lines.splice(5, 0, "        ExtMod         = require(\"ExtMod\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("insert core module in extension", function () {
            var startingText = getModule3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/dev/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            var lines = startingText.split("\n");
            lines.splice(5, 0, "        Editor         = brackets.getModule(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("don't get fooled by require() block when inserting brackets.getModule()", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/dev/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            // failure mode: we just insert the import statement on the line the cursor is on
            var lines = startingText.split("\n");
            lines.splice(9, 0, "Editor = brackets.getModule(\"package/Editor\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        it("fail importing file from different extension", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/dev/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/dev/otherext/ExtMod.js");
            
            expect(testDocument.getText()).toBe(startingText);
        });
        it("fail importing extension module from core", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/dev/myext/ExtMod.js");
            
            expect(testDocument.getText()).toBe(startingText);
        });
        
        it("fail inside file directly inside /extensions", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/ExtMod.js");
            
            expect(testDocument.getText()).toBe(startingText);
        });
        it("fail inside file directly inside /extensions/<something>", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/myext/ExtMod.js");
            
            expect(testDocument.getText()).toBe(startingText);
        });
        
        it("fail importing file from outside extension but still in /extensions", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/dev/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/ExtMod.js");
            
            expect(testDocument.getText()).toBe(startingText);
        });
        it("fail importing file from outside extension but still in /extensions/<something>", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testDocument.file = new NativeFileSystem.FileEntry("/foo/bar/src/extensions/dev/myext/DestModule.js");
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/extensions/something/ExtMod.js");
            
            expect(testDocument.getText()).toBe(startingText);
        });
        
        
        // Amd Import
        it("correclty detect amd and add to top depencies", function () {
            
            var startingText = requirePureAmd;
            testDocument.setText(startingText);
            
            ImportInserter.insertImport("/foo/bar/src/package/Editor.js");
            
            var expectedText = requirePureAmdExpectedAfterImport;
            //TODO: Fixme: Handle carriage return correctly
            expect(testDocument.getText().replace(/(\r\n|\n|\r)/gm, '')).toBe(expectedText.replace(/(\r\n|\n|\r)/gm, ''));
        });
        
        // Non-JS files ---------------------------------------------------------------------------
        
        it("do something semi-useful when importing text file via require()", function () {
            var startingText = require3Lines;
            testDocument.setText(startingText);
            
            testEditor.setCursorPos({ line: 9, ch: 8 });        // just before bar()
            ImportInserter.insertImport("/foo/bar/src/package/info.txt");
            
            // failure mode: generate a require() as if it were a JS file (instead of "text!..." with file ext)
            var lines = startingText.split("\n");
            lines.splice(5, 0, "        info           = require(\"package/info\"),");
            var expectedText = lines.join("\n");
            expect(testDocument.getText()).toBe(expectedText);
        });
        
        
        
        
        
    }); // top-level describe()
    
});
