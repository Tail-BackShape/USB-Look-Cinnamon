'use strict';

// USB-Look-Cinnamon: Cinnamon panel integration.
// This process never opens USB nodes and never changes device permissions.
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;

const CATEGORY_LABELS = Object.freeze({
    serial:'USBシリアル', debug:'デバッグ機器', storage:'ストレージ',
    hid:'HID', camera:'カメラ', audio:'オーディオ',
    network:'USBネットワーク', hub:'USBハブ', other:'その他'
});
const CATEGORY_BINDINGS = Object.freeze([
    ['serial','showSerial'],['debug','showDebug'],['storage','showStorage'],
    ['hid','showHid'],['camera','showCamera'],['audio','showAudio'],
    ['network','showNetwork'],['hub','showHub'],['other','showOther']
]);
const SUBSYSTEMS = ['usb','tty','block','hidraw','hid','input','video4linux','sound','net'];

class UsbLookApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this._devices = [];
        this._errorText = null;
        this._removed = false;
        this._registry = null;
        this._model = null;

        this.set_applet_icon_symbolic_name('drive-removable-media-usb');
        this.set_applet_tooltip('USB-Look-Cinnamon');
        this.set_applet_label('0');

        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuManager.addMenu(this.menu);
        this.menu.connect('open-state-changed', (menu, open) => {
            if (open && !this._removed) this._renderMenu();
        });

        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        for (const [category, property] of CATEGORY_BINDINGS) {
            this.settings.bind('show-' + category, property,
                () => this._refreshViews());
        }
        this.settings.bind('show-count', 'showCount', () => this._refreshViews());
        // Notification delivery is implemented in the dedicated UI milestone.
        this.settings.bind('notify-changes', 'notifyChanges',
            () => this._refreshViews());

        try {
            if (metadata.path && !imports.searchPath.includes(metadata.path))
                imports.searchPath.unshift(metadata.path);
            this._model = imports.deviceModel;
            const Registry = imports.deviceRegistry;
            const GUdev = imports.gi.GUdev;
            if (!GUdev || !GUdev.Client) throw new Error('GUdev is unavailable');
            const client = GUdev.Client.new(SUBSYSTEMS);
            if (!client) throw new Error('GUdev client could not be created');
            const scheduler = {
                schedule: (callback, delayMs) =>
                    Mainloop.timeout_add(delayMs, () => {callback();return false;}),
                cancel: token => Mainloop.source_remove(token)
            };
            this._registry = new Registry.DeviceRegistry(client, scheduler, this._model);
            this._registry.start(change => this._onRegistryUpdate(change));
        } catch (error) {
            this._errorText = error && error.message ? error.message : 'USB monitor error';
            if (global && typeof global.logError === 'function') global.logError(error);
        }
        this._refreshViews();
    }

    _enabledCategories() {
        const enabled = {};
        for (const [category, property] of CATEGORY_BINDINGS)
            enabled[category] = this[property] !== false;
        return enabled;
    }

    _visibleDevices() {
        if (!this._model) return [];
        return this._model.filterDevices(this._devices, this._enabledCategories(), '');
    }

    _onRegistryUpdate(change) {
        if (this._removed) return;
        this._devices = change.devices || [];
        this._errorText = change.error || null;
        this._refreshViews();
    }

    _refreshViews() {
        if (this._removed) return;
        const count = this._visibleDevices().length;
        if (this._errorText) {
            this.set_applet_icon_symbolic_name('dialog-warning');
            this.set_applet_label('!');
            this.set_applet_tooltip('USB-Look-Cinnamon: ' + this._errorText);
        } else {
            this.set_applet_icon_symbolic_name('drive-removable-media-usb');
            this.set_applet_label(this.showCount === false ? '' : String(count));
            this.set_applet_tooltip('USB-Look-Cinnamon · ' + count + ' devices');
        }
        if (this.menu.isOpen) this._renderMenu();
    }

    _renderMenu() {
        this.menu.removeAll();
        if (this._errorText) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                'USB監視エラー: ' + this._errorText, {reactive:false}));
            return;
        }
        const visible = this._visibleDevices();
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
            '接続中のUSB機器: ' + visible.length, {reactive:false}));
        if (visible.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                '表示対象の機器はない', {reactive:false}));
            return;
        }
        const enabled = this._enabledCategories();
        for (const key of Object.keys(CATEGORY_LABELS)) {
            // Assign a composite device to its first enabled category,
            // keeping exactly one row in the whole popup.
            const group = visible.filter(device =>
                device.categories.find(c => enabled[c]) === key);
            if (group.length === 0) continue;
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                CATEGORY_LABELS[key] + ' (' + group.length + ')',
                {reactive:false}));
            for (const device of group) {
                const identity = device.vid && device.pid ?
                    device.vid + ':' + device.pid : 'VID/PID 不明';
                const nodes = device.nodes.length ?
                    ' · ' + device.nodes.join(', ') : '';
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                    device.name + ' (' + identity + ')' + nodes,
                    {reactive:false}));
            }
        }
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        this._removed = true;
        if (this._registry) {
            this._registry.stop();
            this._registry = null;
        }
        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
        if (this.menu) this.menu.destroy();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new UsbLookApplet(metadata, orientation, panelHeight, instanceId);
}
