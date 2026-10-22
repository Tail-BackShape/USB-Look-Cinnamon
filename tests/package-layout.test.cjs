'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'../usb-look-cinnamon@tail-backshape');
const inner = path.join(root,'files/usb-look-cinnamon@tail-backshape');
const json = name => JSON.parse(fs.readFileSync(path.join(inner,name),'utf8'));
test('Spices structure declares the exact applet UUID and multiple instances', () => {
    const meta=json('metadata.json');
    assert.equal(meta.uuid,'usb-look-cinnamon@tail-backshape');
    assert.equal(meta.name,'USB-Look-Cinnamon');
    assert.equal(String(meta['max-instances']),'-1');
    const info=JSON.parse(fs.readFileSync(path.join(root,'info.json'),'utf8'));
    assert.equal(info.author,'Tail-BackShape');
});
test('exactly nine category switches are enabled by default', () => {
    const settings=json('settings-schema.json');
    const categories=['serial','debug','storage','hid','camera','audio','network','hub','other'];
    assert.equal(categories.length,9);
    for (const category of categories) {
        const item=settings['show-'+category];
        assert.equal(item.type,'switch',category);
        assert.equal(item.default,true,category);
    }
    assert.equal(settings['show-count'].default,true);
    assert.equal(settings['notify-changes'].default,false);
    assert.ok(!('font' in settings));
});
test('applet entrypoint has valid JS syntax and Cinnamon main()', () => {
    const code=fs.readFileSync(path.join(inner,'applet.js'),'utf8');
    assert.doesNotThrow(()=>new vm.Script(code));
    assert.match(code,/function main\s*\(/);
    assert.match(code,/on_applet_removed_from_panel/);
});
