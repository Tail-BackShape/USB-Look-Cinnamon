'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

function loadGjsModule(file, symbols) {
    const source = fs.readFileSync(file, 'utf8');
    const context = vm.createContext({});
    const bindings = symbols.map(name => JSON.stringify(name) + ': ' + name).join(', ');
    return vm.runInContext(source + '\n;({' + bindings + '})', context, {filename: file});
}
module.exports = {loadGjsModule};
