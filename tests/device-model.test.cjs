'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {loadGjsModule} = require('./support/load-gjs-module.cjs');
const model = loadGjsModule(path.join(__dirname, '../usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/deviceModel.js'), [
    'CATEGORY_KEYS', 'classifyInterface', 'buildDevices', 'filterDevices'
]);
const plain = value => JSON.parse(JSON.stringify(value));
const base = '/sys/devices/pci0000:00/usb1/1-2';
const physical = (pathName = base, attributes = {}) => ({
    devtype: 'usb_device', subsystem: 'usb', sysfsPath: pathName,
    properties: {}, attributes: Object.assign({
        idVendor: '303a', idProduct: '1001', product: 'ESP32-S3',
        manufacturer: 'Espressif', bDeviceClass: '00'
    }, attributes)
});
const iface = (suffix, properties = {}, attributes = {}, driver = '', subsystem = 'usb') => ({
    devtype: 'usb_interface', subsystem,
    sysfsPath: base + '/' + suffix, parentUsbPath: base,
    properties, attributes, driver
});
test('classifies nine families by class, subsystem and specific drivers', () => {
    const cases = [
        [iface('s', {}, {bInterfaceClass: '02', bInterfaceSubClass: '02'}, 'cdc_acm'), 'serial'],
        [iface('d', {}, {bInterfaceClass: 'ff'}, 'stlink'), 'debug'],
        [iface('m', {}, {bInterfaceClass: '08'}, 'usb-storage'), 'storage'],
        [iface('h', {}, {bInterfaceClass: '03'}, 'usbhid'), 'hid'],
        [iface('v', {}, {bInterfaceClass: '0e'}, 'uvcvideo'), 'camera'],
        [iface('a', {}, {bInterfaceClass: '01'}, 'snd-usb-audio'), 'audio'],
        [iface('n', {}, {bInterfaceClass: '02', bInterfaceSubClass: '06'}, 'cdc_ether'), 'network'],
        [iface('hub', {}, {bInterfaceClass: '09'}, 'hub'), 'hub'],
        [iface('unknown', {}, {bInterfaceClass: 'ff'}, 'custom'), 'other']
    ];
    for (const [record, expected] of cases)
        assert.ok(Array.from(model.classifyInterface(record)).includes(expected), expected);
    assert.deepEqual(Array.from(model.CATEGORY_KEYS), [
        'serial','debug','storage','hid','camera','audio','network','hub','other'
    ]);
});
test('aggregates composite physical device once and retains nodes', () => {
    const records = [
        physical(),
        iface('1-2:1.0', {}, {bInterfaceClass: '02'}, 'cdc_acm'),
        iface('1-2:1.1', {}, {bInterfaceClass: '03'}, 'usbhid'),
        {subsystem: 'tty', devtype: '', sysfsPath: base + '/1-2:1.0/tty/ttyACM0',
            parentUsbPath: base, deviceNode: '/dev/ttyACM0', properties: {}, attributes: {}},
        {subsystem: 'hidraw', devtype: '', sysfsPath: base + '/1-2:1.1/hidraw0',
            parentUsbPath: base, deviceNode: '/dev/hidraw0', properties: {}, attributes: {}}
    ];
    const devices = plain(model.buildDevices(records));
    assert.equal(devices.length, 1);
    assert.deepEqual(devices[0].categories, ['serial', 'hid']);
    assert.deepEqual(devices[0].nodes, ['/dev/hidraw0', '/dev/ttyACM0']);
    assert.equal(devices[0].interfaces.length, 4);
    assert.equal(devices[0].vid, '303a');
    assert.equal(devices[0].pid, '1001');
});
test('omits root hubs but keeps external USB hubs', () => {
    const devices = plain(model.buildDevices([
        physical('/sys/devices/pci0000:00/usb1', {bDeviceClass:'09'}),
        physical('/sys/devices/pci0000:00/usb1/1-4', {bDeviceClass:'09'}),
    ]));
    assert.equal(devices.length, 1);
    assert.equal(devices[0].usbPath, '1-4');
    assert.deepEqual(devices[0].categories, ['hub']);
});
test('survives missing properties and malformed VID/PID without inventing IDs', () => {
    const devices = plain(model.buildDevices([physical(base, {
        idVendor: 'zzzz', idProduct: '', product: '', manufacturer: ''
    })]));
    assert.equal(devices.length, 1);
    assert.equal(devices[0].vid, null);
    assert.equal(devices[0].pid, null);
    assert.ok(devices[0].name.length > 0);
    assert.deepEqual(devices[0].categories, ['other']);
});
test('filters by category OR and searches name, VID:PID and node', () => {
    const d = plain(model.buildDevices([
        physical(), iface('1-2:1.0', {}, {bInterfaceClass: '02'}, 'cdc_acm'),
        iface('1-2:1.1', {}, {bInterfaceClass: '03'}, 'usbhid'),
        {subsystem: 'tty',sysfsPath: base + '/tty/ttyACM1',parentUsbPath:base,
            deviceNode:'/dev/ttyACM1'}
    ]));
    const off = Object.fromEntries(Array.from(model.CATEGORY_KEYS, key => [key, false]));
    assert.equal(model.filterDevices(d, off, '').length, 0);
    off.hid = true;
    assert.equal(model.filterDevices(d, off, '303A:1001').length, 1);
    assert.equal(model.filterDevices(d, off, 'ttyACM1').length, 1);
    assert.equal(model.filterDevices(d, off, 'unmatched').length, 0);
    off.hid = false;
    off.serial = true;
    assert.equal(model.filterDevices(d, off, 'esp32').length, 1);
});

test('physical ST-LINK product remains debug when child HID interface exists',()=>{
    const found=plain(model.buildDevices([
        physical(base,{product:'ST-LINK/V3',idVendor:'0483',idProduct:'374e'}),
        iface('1-2:1.0',{}, {bInterfaceClass:'03'},'usbhid')
    ]));
    assert.deepEqual(found[0].categories,['debug','hid']);
});
