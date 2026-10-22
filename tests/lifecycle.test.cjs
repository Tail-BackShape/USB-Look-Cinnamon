'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadGjsModule}=require('./support/load-gjs-module.cjs');
const {ProbeSession}=loadGjsModule(path.join(__dirname,
 '../usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/probeSession.js'),
 ['ProbeSession']);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function scheduler(){
    const tasks=new Map();let id=0;
    return {tasks,schedule:(fn)=>{tasks.set(++id,fn);return id;},
        cancel:key=>tasks.delete(key)};
}
const first={id:'a',nodes:['/dev/ttyACM0'],categories:['serial']};
const second={id:'b',nodes:['/dev/ttyACM1'],categories:['serial']};
test('open inspects and schedules a delayed retry; close stops it',async()=>{
    const times=scheduler(),result=[];
    const inspector={inspectDevice:async d=>({status:'Busy',pid:d.id})};
    const session=new ProbeSession(inspector,{},times,()=>({cancel(){}}));
    session.open([first],(id,data)=>result.push([id,data.status]));
    await tick();
    assert.deepEqual(result,[['a','Busy']]);
    assert.equal(times.tasks.size,1);
    session.close();
    assert.equal(times.tasks.size,0);
});
test('close during an in-flight inspection rejects stale result',async()=>{
    const times=scheduler(),results=[];
    let finish;
    const inspector={inspectDevice:()=>new Promise(resolve=>{finish=resolve;})};
    const session=new ProbeSession(inspector,{},times,()=>({cancel(){this.cancelled=true;}}));
    session.open([first],(id,data)=>results.push(data));
    session.close();
    finish({status:'Busy'});
    await tick();
    assert.equal(results.length,0);
    assert.equal(times.tasks.size,0);
});
test('device changes invalidate old results and inspect the new device',async()=>{
    const times=scheduler(),results=[],pending={};
    const inspector={inspectDevice:d=>new Promise(resolve=>{pending[d.id]=resolve;})};
    const session=new ProbeSession(inspector,{},times,()=>({cancel(){}}));
    session.open([first],(id,data)=>results.push(id+':'+data.status));
    session.updateDevices([second]);
    pending.a({status:'Busy'});
    pending.b({status:'Not in use'});
    await tick();
    assert.deepEqual(results,['b:Not in use']);
    session.close();
});
test('no inspection ever starts while closed',async()=>{
    const times=scheduler();let calls=0;
    const inspector={inspectDevice:async()=>{calls++;return {status:'Busy'};}};
    const session=new ProbeSession(inspector,{},times,()=>({cancel(){}}));
    session.updateDevices([first]);
    await tick();
    assert.equal(calls,0);
    session.open([first],()=>{});
    await tick();
    session.close();
    assert.equal(calls,1);
});
