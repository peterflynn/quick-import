Quick Import
============
Quick Import is a shortcut for generating RequireJS/CommonJS import statements like this:

```
        Commands = require("command/Commands"),
```

Press Ctrl+I to open a file-search popup, find the file you want, and hit Enter &ndash; an import line for the file is inserted
on the line beneath your cursor. Also supports brackets.getModule(), if you have a src/extensions folder tree.

### Caveats
* Only supports CommonJS-style imports (require() calls) - does not support "pure AMD" syntax (array of module names mapping to
  a list of arguments). Note that RequireJS supports both formats.
* Assumes the root of your require() source tree is a folder named "src"
* You must already have a block of require() calls somewhere in your module (typically near the top)
* Assumes this block is a comma-separated list with one import per line &ndash; that is, assumes there's a `var` line at the start
  and a line ending in `;` at the end, with any lines in the middle ending in `,`


What is Brackets?
=================
Quick Import is an extension for [Brackets](https://github.com/adobe/brackets/), a new open-source code editor for the web.

To use Quick Import:

1. [Download the ZIP](https://github.com/peterflynn/quick-import/archive/master.zip) and unzip it; or clone this repo
2. Open your extensions folder: _Help > Show Extensions Folder_
3. Place the folder so the structure is: `extensions/user/quick-import/main.js`
4. Restart Brackets!


### License
MIT-licensed -- see `main.js` for details.

### Compatibility
Requires Brackets Sprint 22 or newer. Not compatible with Adobe Edge Code yet.