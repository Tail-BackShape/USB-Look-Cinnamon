'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const script=path.join(__dirname,'../scripts/install-local.sh');
const uuid='usb-look-cinnamon@tail-backshape';
test('installer installs only into XDG user data directory and rejects replacement',()=>{
    const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'usb-look-install-'));
    try {
        const env={...process.env,XDG_DATA_HOME:scratch};
        execFileSync('sh',[script],{env,stdio:'pipe'});
        const target=path.join(scratch,'cinnamon/applets',uuid);
        assert.ok(fs.existsSync(path.join(target,'applet.js')));
        assert.ok(fs.existsSync(path.join(target,'metadata.json')));
        const marker=path.join(target,'keep.txt');
        fs.writeFileSync(marker,'user file');
        assert.throws(()=>execFileSync('sh',[script],{env,stdio:'pipe'}));
        assert.equal(fs.readFileSync(marker,'utf8'),'user file');
    } finally {
        fs.rmSync(scratch,{recursive:true,force:true});
    }
});
