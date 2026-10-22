'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'../usb-look-cinnamon@tail-backshape');
const src=path.join(root,'files/usb-look-cinnamon@tail-backshape');
let count=0;
for(const name of fs.readdirSync(src)) {
    if(name.endsWith('.js')) {
        new vm.Script(fs.readFileSync(path.join(src,name),'utf8'),{filename:name});
        count++;
    }
    if(name.endsWith('.json')) {
        JSON.parse(fs.readFileSync(path.join(src,name),'utf8'));
        count++;
    }
}
JSON.parse(fs.readFileSync(path.join(root,'info.json'),'utf8'));
console.log('Syntax/JSON OK: '+count+' xlet files + info.json');
