'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

function loadGjsModule(file, symbols) {
    const source = fs.readFileSync(file, 'utf8');
    const context = vm.createContext({exports: {}});
    // Cinnamon fileUtils.createExports auto-exports these declarations, not async function.
    const declarations = /^(?:'use strict';){0,}(const|var|let|function|class)\s+([a-zA-Z0-9_$]+)/gm;
    const exports = Array.from(source.matchAll(declarations), match =>
        'exports.' + match[2] + ' = ' + match[2] + ';').join('\n');
    const bindings = symbols.map(name => JSON.stringify(name) + ': exports.' + name).join(', ');
    return vm.runInContext(source + '\n;' + exports + '\n;({' + bindings + '})', context, {filename: file});
}
module.exports = {loadGjsModule};
