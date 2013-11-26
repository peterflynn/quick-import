Quick Require Import for Brackets
=================================
Quick shortcut for generating RequireJS/CommonJS import statements like this:

```
        Commands = require("command/Commands"),
```

Press Ctrl+I to open a file-search popup, find the file you want, and hit Enter &ndash; an import line for the file is inserted
on the line beneath your cursor. Also supports brackets.getModule(), if you have a src/extensions folder tree.

### Caveats
* Only supports CommonJS-style imports (require() calls) - does not support "pure AMD" syntax (array of module names mapping to
  a list of arguments). Note that RequireJS supports both formats.
* Assumes the root of your require() paths is a folder named "src" or "www"
* You must already have a block of require() calls somewhere in your module (typically near the top)
* Assumes this block is a comma-separated list with one import per line &ndash; that is, assumes there's a `var` line at the start
  and a line ending in `;` at the end, with any lines in the middle ending in `,`


How to Install
==============
Quick Require Import is an extension for [Brackets](https://github.com/adobe/brackets/), a new open-source code editor for the web.

To install extensions:

1. Choose _File > Extension Manager_ and select the _Available_ tab
2. Search for this extension
3. Click _Install_!


### License
MIT-licensed -- see `main.js` for details.

### Compatibility
Requires Brackets Sprint 22 or newer (or Adobe Edge Code Preview 4 or newer).