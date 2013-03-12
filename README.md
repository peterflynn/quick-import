Quick Import
============
Quick Import is a shortcut for generating RequireJS/CommonJS import statements like this:

```
        Commands = require("command/Commands"),
```

Press Ctrl+I to open a file-search popup, find the file you want, and hit Enter &ndash; an import line for the file is inserted
on the line beneath your cursor. Also supports brackets.getModule(), if you have a src/extensions folder tree.

### Caveats
* Assumes the root of your require() source tree is a folder named "src"
* Assumes this declaration is part of a comma-separated list of imports &ndash; that is, assumes there's a `var` line above it
  and a line ending in `;` below it, so the line you get ends in `,`


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
**_No released verson of Brackets supports this yet._** You must pull the latest from master because the fix for
[issue #330](https://github.com/adobe/brackets/issues/330) is required.