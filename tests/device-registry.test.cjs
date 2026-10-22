'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {loadGjsModule} = require('./support/load-gjs-module.cjs');
const dir = path.join(__dirname, '../usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape');
const model = loadGjsModule(path.join(dir,'deviceModel.js'), ['buildDevices']);
const {toRecord, DeviceRegistry} = loadGjsModule(path.join(dir,'deviceRegistry.js'), ['toRecord','DeviceRegistry']);
const physicalPath = '/sys/devices/pci0000:00/usb1/1-2';
function device(subsystem, devtype, sysfsPath, attrs = {}, extra = {}) {
    const p = Object.assign({subsystem,devtype,sysfsPath,attrs},extra);
    return {
        get_subsystem: () => p.subsystem, get_devtype: () => p.devtype,
        get_sysfs_path: () => p.sysfsPath, get_driver: () => p.driver || null,
        get_device_file: () => p.deviceNode || null,
        get_property: name => (p.props || {})[name] || null,
        get_sysfs_attr: name => p.attrs[name] || null,
        get_parent_with_subsystem: (s,t) => s === 'usb' && t === 'usb_device' ?
            (p.parent || null) : null
    };
}
const usb = () => device('usb','usb_device',physicalPath,{idVendor:'303a',idProduct:'1001',product:'ESP32-S3'});
const serial = parent => device('tty', null, physicalPath+'/1-2:1.0/tty/ttyACM0',{},{
    parent,deviceNode:'/dev/ttyACM0'
});
class FakeClient {
    constructor() {this.records={usb:[],tty:[]};this.connected=null;this.disconnected=false;this.fail=false;}
    query_by_subsystem(name) {if(this.fail)throw Error('udev unavailable');return this.records[name]||[];}
    connect(signal,callback) {assert.equal(signal,'uevent');this.connected=callback;return 7;}
    disconnect(id) {assert.equal(id,7);this.disconnected=true;this.connected=null;}
    emit(action) {if(this.connected)this.connected(this,action,usb());}
}
class FakeScheduler {
    constructor(){this.tasks=new Map();this.counter=0;}
    schedule(fn){const id=++this.counter;this.tasks.set(id,fn);return id;}
    cancel(id){this.tasks.delete(id);}
    flush(){const values=Array.from(this.tasks.values());this.tasks.clear();for(const f of values)f();}
}
test('converts USB interface descendants to physical parent without opening nodes', () => {
    const p=usb();
    const record=toRecord(serial(p));
    assert.equal(record.parentUsbPath,physicalPath);
    assert.equal(record.deviceNode,'/dev/ttyACM0');
    assert.equal(record.subsystem,'tty');
    assert.equal(toRecord(p).parentUsbPath,null);
});
test('initial snapshot yields one physical device with a tty child', () => {
    const client=new FakeClient(), scheduler=new FakeScheduler(), messages=[];
    const p=usb();client.records.usb=[p];client.records.tty=[serial(p)];
    const registry=new DeviceRegistry(client,scheduler,model);
    registry.start(change=>messages.push(change));
    assert.equal(messages.length,1);
    assert.equal(messages[0].devices.length,1);
    assert.deepEqual(Array.from(messages[0].added),[physicalPath]);
    assert.deepEqual(Array.from(messages[0].devices[0].nodes),['/dev/ttyACM0']);
    registry.stop();
});
test('coalesces repeated events and reports additions and removals', () => {
    const client=new FakeClient(), scheduler=new FakeScheduler(), changes=[];
    const registry=new DeviceRegistry(client,scheduler,model);
    registry.start(update=>changes.push(update));
    const p=usb();client.records.usb=[p];client.records.tty=[serial(p)];
    client.emit('add');client.emit('change');client.emit('add');
    assert.equal(scheduler.tasks.size,1);
    scheduler.flush();
    assert.equal(changes.length,2);
    assert.deepEqual(Array.from(changes[1].added),[physicalPath]);
    client.records.usb=[];client.records.tty=[];
    client.emit('remove');scheduler.flush();
    assert.equal(changes.length,3);
    assert.deepEqual(Array.from(changes[2].removed),[physicalPath]);
    registry.stop();
});
test('stop disconnects GUdev and cancels outstanding refresh', () => {
    const client=new FakeClient(), scheduler=new FakeScheduler(), changes=[];
    const registry=new DeviceRegistry(client,scheduler,model);
    registry.start(update=>changes.push(update));
    client.records.usb=[usb()];client.emit('add');
    registry.stop();scheduler.flush();client.emit('remove');
    assert.equal(client.disconnected,true);
    assert.equal(changes.length,1);
    assert.equal(scheduler.tasks.size,0);
});
test('enumeration errors are reported without crashing the monitor', () => {
    const client=new FakeClient(), scheduler=new FakeScheduler(), updates=[];
    client.fail=true;
    const registry=new DeviceRegistry(client,scheduler,model);
    registry.start(update=>updates.push(update));
    assert.equal(updates.length,1);
    assert.match(updates[0].error,/udev unavailable/);
    assert.deepEqual(Array.from(registry.snapshot()),[]);
    client.fail=false;client.records.usb=[usb()];
    client.emit('change');scheduler.flush();
    assert.equal(registry.snapshot().length,1);
    assert.equal(updates[1].error,null);
    registry.stop();
});
