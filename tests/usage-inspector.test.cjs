'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadGjsModule}=require('./support/load-gjs-module.cjs');
const moduleApi=loadGjsModule(path.join(__dirname,
    '../usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/usageInspector.js'),
    ['parseLsof','parseMounts','inspectDevice']);
const serial={id:'a',categories:['serial'],nodes:['/dev/ttyACM0']};
test('lsof PID and command lines yield Busy with precise evidence',()=>{
    const result=moduleApi.parseLsof('p123\ncminicom\np456\ncpython3\n','',0);
    assert.equal(result.status,'Busy');
    assert.deepEqual(JSON.parse(JSON.stringify(result.processes)),[
        {pid:123,command:'minicom'}, {pid:456,command:'python3'}
    ]);
});
test('lsof exit 1 without visible processes is tentative Not in use',()=>{
    const result=moduleApi.parseLsof('','',1);
    assert.equal(result.status,'Not in use');
    assert.match(result.reason,/visible|可視/);
});
test('permission error and malformed process output remain Unknown',()=>{
    assert.equal(moduleApi.parseLsof('','Permission denied',1).status,'Unknown');
    assert.equal(moduleApi.parseLsof('pgarbage\ncwat\n','',0).status,'Unknown');
});
test('storage reports mount target, not an exclusive Busy state',async()=>{
    const runner={run:async argv=>{
        assert.equal(argv[0],'findmnt');
        assert.ok(argv.includes('/dev/sdb1'));
        return {exitCode:0,stdout:'/media/user/USB\n',stderr:''};
    }};
    const result=await moduleApi.inspectDevice({
        categories:['storage'],nodes:['/dev/sdb1']
    },runner);
    assert.equal(result.status,'Mounted');
    assert.deepEqual(Array.from(result.mounts),['/media/user/USB']);
});
test('serial probe invokes argv only, never shell command string',async()=>{
    const runner={run:async argv=>{
        assert.ok(Array.isArray(argv));
        assert.deepEqual(Array.from(argv.slice(-2)),['--','/dev/ttyACM0']);
        return {exitCode:0,stdout:'p212\ncminicom\n',stderr:''};
    }};
    const result=await moduleApi.inspectDevice(serial,runner);
    assert.equal(result.status,'Busy');
    assert.equal(result.processes[0].pid,212);
});
test('unsupported families, missing nodes and absent lsof are Unknown',async()=>{
    assert.equal((await moduleApi.inspectDevice({
        categories:['network'],nodes:['/dev/something']
    },{run:async()=>{throw Error('should not run');}})).status,'Unknown');
    assert.equal((await moduleApi.inspectDevice({categories:['serial'],nodes:[]},
        {run:async()=>{throw Error('should not run');}})).status,'Unknown');
    const missing=await moduleApi.inspectDevice(serial,{run:async()=>{throw Error('spawn ENOENT');}});
    assert.equal(missing.status,'Unknown');
    assert.match(missing.reason,/ENOENT/);
});
test('mount parser never invents a mount when command cannot observe',()=>{
    assert.equal(moduleApi.parseMounts('','',1).status,'Unmounted');
    assert.equal(moduleApi.parseMounts('','Permission denied',1).status,'Unknown');
});
