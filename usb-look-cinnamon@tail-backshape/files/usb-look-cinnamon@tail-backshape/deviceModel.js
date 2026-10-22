'use strict';

// Pure USB data model. No filesystem access, CJS imports, or device opens.
// Legacy GJS exports top-level var/function symbols automatically.
var CATEGORY_KEYS = Object.freeze([
    'serial', 'debug', 'storage', 'hid', 'camera',
    'audio', 'network', 'hub', 'other'
]);

function safeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getField(record, field) {
    if (!record) return '';
    return safeText((record.attributes || {})[field] ||
                    (record.properties || {})[field]);
}

function normalizeHex(value) {
    const text = safeText(value);
    return /^[0-9a-fA-F]{1,4}$/.test(text) ?
        text.toLowerCase().padStart(4, '0') : null;
}

function classifyInterface(record) {
    const cls = getField(record, 'bInterfaceClass').toLowerCase() ||
                getField(record, 'bDeviceClass').toLowerCase();
    const sub = getField(record, 'bInterfaceSubClass').toLowerCase();
    const driver = safeText(record && record.driver).toLowerCase();
    const subsystem = safeText(record && record.subsystem).toLowerCase();
    const product = (getField(record, 'product') + ' ' +
                    getField(record, 'ID_MODEL')).toLowerCase();
    const matches = new Set();
    const anyDriver = names => names.includes(driver);

    if (subsystem === 'tty' || anyDriver(['cdc_acm', 'cp210x', 'ch341', 'ftdi_sio',
        'pl2303', 'usbserial', 'option', 'qcserial']) || cls === '0a' ||
        (cls === '02' && sub === '02'))
        matches.add('serial');
    if (anyDriver(['stlink', 'jlink', 'cmsis_dap', 'daplink', 'usb-jtag']) ||
        /\b(st-link|j-link|cmsis-dap|daplink)\b/.test(product))
        matches.add('debug');
    if (cls === '08' || subsystem === 'block' ||
        anyDriver(['usb-storage', 'uas']))
        matches.add('storage');
    if (cls === '03' || ['hid', 'hidraw', 'input'].includes(subsystem) ||
        driver === 'usbhid')
        matches.add('hid');
    if (cls === '0e' || subsystem === 'video4linux' || driver === 'uvcvideo')
        matches.add('camera');
    if (cls === '01' || subsystem === 'sound' || driver === 'snd-usb-audio')
        matches.add('audio');
    if (subsystem === 'net' || cls === 'e0' ||
        (cls === '02' && ['06', '0d'].includes(sub)) ||
        anyDriver(['cdc_ether', 'cdc_ncm', 'rndis_host', 'r8152', 'asix', 'ax88179_178a']))
        matches.add('network');
    if (cls === '09' || driver === 'hub')
        matches.add('hub');
    if (matches.size === 0) matches.add('other');
    return CATEGORY_KEYS.filter(key => matches.has(key));
}

function buildDevices(records) {
    const source = Array.isArray(records) ? records : [];
    const devices = new Map();
    for (const record of source) {
        if (!record || record.subsystem !== 'usb' ||
            record.devtype !== 'usb_device' || !safeText(record.sysfsPath))
            continue;
        const sysfsPath = record.sysfsPath;
        const usbPath = sysfsPath.split('/').pop();
        // Root hubs are represented by usbN, unlike plugged hubs (N-M...).
        if (/^usb\d+$/.test(usbPath)) continue;
        const props = record.properties || {};
        const attrs = record.attributes || {};
        const vid = normalizeHex(attrs.idVendor || props.ID_VENDOR_ID);
        const pid = normalizeHex(attrs.idProduct || props.ID_MODEL_ID);
        const name = safeText(attrs.product || props.ID_MODEL_FROM_DATABASE ||
                              props.ID_MODEL) || (vid && pid ? 'USB ' + vid + ':' + pid : 'USB device');
        const manufacturer = safeText(attrs.manufacturer ||
                                          props.ID_VENDOR_FROM_DATABASE ||
                                          props.ID_VENDOR) || null;
        devices.set(sysfsPath, {
            id: sysfsPath, sysfsPath, usbPath, vid, pid, name, manufacturer,
            categories: [], interfaces: [], nodes: []
        });
    }
    for (const record of source) {
        if (!record || !safeText(record.parentUsbPath)) continue;
        const target = devices.get(record.parentUsbPath);
        if (!target || !safeText(record.sysfsPath) ||
            record.sysfsPath === record.parentUsbPath) continue;
        const categories = classifyInterface(record);
        const node = safeText(record.deviceNode);
        // GUdev can enumerate several paths for one node; preserve the
        // interface path while never duplicating a physical device row.
        target.interfaces.push({
            sysfsPath: record.sysfsPath, subsystem: safeText(record.subsystem),
            driver: safeText(record.driver) || null,
            deviceNode: node || null,
            categories
        });
        if (node && !target.nodes.includes(node)) target.nodes.push(node);
        for (const category of categories) {
            if (!target.categories.includes(category))
                target.categories.push(category);
        }
    }
    for (const [path, target] of devices) {
        if (target.categories.length === 0) {
            const physical = source.find(item => item && item.sysfsPath === path &&
                                               item.devtype === 'usb_device');
            target.categories = classifyInterface(physical);
        }
        // An unknown child does not hide a recognized composite function.
        if (target.categories.length > 1 && target.categories.includes('other'))
            target.categories = target.categories.filter(key => key !== 'other');
        target.categories = CATEGORY_KEYS.filter(key => target.categories.includes(key));
        target.interfaces.sort((a, b) => a.sysfsPath.localeCompare(b.sysfsPath));
        target.nodes.sort();
    }
    return Array.from(devices.values()).sort((a, b) => a.usbPath.localeCompare(b.usbPath, undefined, {numeric: true}));
}

function filterDevices(devices, toggles, query) {
    const enabled = toggles || {};
    const needle = safeText(query).toLowerCase();
    return (Array.isArray(devices) ? devices : []).filter(device => {
        if (!device.categories.some(key => enabled[key] !== false)) return false;
        if (!needle) return true;
        const corpus = [
            device.name, device.manufacturer, device.vid, device.pid,
            (device.vid && device.pid) ? device.vid + ':' + device.pid : '',
            device.usbPath, device.sysfsPath,
            ...(device.nodes || [])
        ].filter(Boolean).join(' ').toLowerCase();
        return corpus.includes(needle);
    });
}
