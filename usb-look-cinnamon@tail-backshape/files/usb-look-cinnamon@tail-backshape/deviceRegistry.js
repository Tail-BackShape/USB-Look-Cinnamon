'use strict';

// GUdev-facing adapter with injectable client, clock and pure model.
// Polling is limited to short, event-triggered snapshots; no /proc scans.
var MONITORED_SUBSYSTEMS = Object.freeze([
    'usb','tty','block','hidraw','hid','input',
    'video4linux','sound','net'
]);
var PROPERTY_NAMES = Object.freeze([
    'ID_VENDOR_ID','ID_MODEL_ID','ID_VENDOR','ID_MODEL',
    'ID_VENDOR_FROM_DATABASE','ID_MODEL_FROM_DATABASE'
]);
var ATTRIBUTE_NAMES = Object.freeze([
    'idVendor','idProduct','product','manufacturer','bDeviceClass',
    'bInterfaceClass','bInterfaceSubClass'
]);

function readSafe(device, method, argument) {
    try {
        if (!device || typeof device[method] !== 'function') return null;
        const result = argument === undefined ?
            device[method]() : device[method](argument);
        return result == null ? null : String(result);
    } catch (error) {
        return null;
    }
}

function toRecord(device) {
    if (!device) return null;
    const sysfsPath = readSafe(device, 'get_sysfs_path');
    if (!sysfsPath) return null;
    const properties = {};
    for (const key of PROPERTY_NAMES) {
        const value = readSafe(device, 'get_property', key);
        if (value !== null) properties[key] = value;
    }
    const attributes = {};
    for (const key of ATTRIBUTE_NAMES) {
        const value = readSafe(device, 'get_sysfs_attr', key);
        if (value !== null) attributes[key] = value;
    }
    const subsystem = readSafe(device, 'get_subsystem');
    const devtype = readSafe(device, 'get_devtype');
    let parentUsbPath = null;
    if (!(subsystem === 'usb' && devtype === 'usb_device')) {
        try {
            if (typeof device.get_parent_with_subsystem === 'function') {
                const parent = device.get_parent_with_subsystem('usb', 'usb_device');
                if (parent) parentUsbPath = readSafe(parent, 'get_sysfs_path');
            }
        } catch (error) {
            parentUsbPath = null;
        }
    }
    return {
        sysfsPath, subsystem, devtype,
        parentUsbPath, properties, attributes,
        deviceNode: readSafe(device, 'get_device_file'),
        driver: readSafe(device, 'get_driver')
    };
}

var DeviceRegistry = class DeviceRegistry {
    constructor(client, scheduler, model) {
        this._client = client;
        this._scheduler = scheduler;
        this._model = model;
        this._active = false;
        this._handlerId = null;
        this._pendingId = null;
        this._devices = [];
        this._fingerprint = null;
        this._onChange = null;
    }

    start(onChange) {
        if (this._active) return;
        this._active = true;
        this._onChange = onChange;
        try {
            this._handlerId = this._client.connect('uevent', () => this._queueRefresh());
            this._refresh();
        } catch (error) {
            this._reportFailure(error);
        }
    }

    snapshot() {
        return this._devices.slice();
    }

    _queueRefresh() {
        if (!this._active || this._pendingId !== null) return;
        // 100 ms merges bursts; the scheduler uses GLib timeout in Cinnamon.
        this._pendingId = this._scheduler.schedule(() => {
            this._pendingId = null;
            if (this._active) this._refresh();
        }, 100);
    }

    _refresh() {
        try {
            const all = [];
            const seen = new Set();
            for (const subsystem of MONITORED_SUBSYSTEMS) {
                const entries = this._client.query_by_subsystem(subsystem) || [];
                for (const item of entries) {
                    const record = toRecord(item);
                    if (!record || seen.has(record.sysfsPath)) continue;
                    seen.add(record.sysfsPath);
                    all.push(record);
                }
            }
            this._publish(this._model.buildDevices(all), null);
        } catch (error) {
            this._reportFailure(error);
        }
    }

    _reportFailure(error) {
        this._publish([], error && error.message ? error.message : 'USB enumeration failed');
    }

    _publish(devices, error) {
        if (!this._active) return;
        const fingerprint = JSON.stringify([devices, error]);
        if (fingerprint === this._fingerprint) return;
        const previous = new Set(this._devices.map(d => d.id));
        const next = new Set(devices.map(d => d.id));
        const added = devices.filter(d => !previous.has(d.id)).map(d => d.id);
        const removed = this._devices.filter(d => !next.has(d.id)).map(d => d.id);
        this._fingerprint = fingerprint;
        this._devices = devices;
        if (typeof this._onChange === 'function')
            this._onChange({devices: this.snapshot(), added, removed, error});
    }

    stop() {
        if (!this._active) return;
        this._active = false;
        if (this._pendingId !== null) {
            this._scheduler.cancel(this._pendingId);
            this._pendingId = null;
        }
        if (this._handlerId !== null) {
            try { this._client.disconnect(this._handlerId); } catch (error) {
                // Stopping must not crash Cinnamon during teardown.
            }
            this._handlerId = null;
        }
        this._onChange = null;
    }
};
