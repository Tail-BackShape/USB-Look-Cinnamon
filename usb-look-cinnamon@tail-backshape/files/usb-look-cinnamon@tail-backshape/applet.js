'use strict';

// USB-Look-Cinnamon: Cinnamon panel integration.
// This process never opens USB nodes and never changes device permissions.
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;

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
        this._probeSession = null;
        this._usageCache = new Map();
        this._statusRows = new Map();
        this._searchText = '';
        this._searchEntry = null;
        this._resultsSection = null;
        this._initialSnapshotSeen = false;

        this.set_applet_icon_symbolic_name('drive-removable-media-usb');
        this.set_applet_tooltip('USB-Look-Cinnamon');
        this.set_applet_label('0');

        this.menu = new Applet.AppletPopupMenu(this, orientation);
        // Reuse the manager owning Cinnamon's right-click context menu.
        this._menuManager.addMenu(this.menu);
        this.menu.connect('open-state-changed', (menu, open) => {
            if (open && !this._removed) {
                this._renderMenu();
                this._startProbes();
            } else {
                this._stopProbes();
            }
        });

        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        for (const [category, property] of CATEGORY_BINDINGS) {
            this.settings.bind('show-' + category, property,
                () => this._onConfigurationChange());
        }
        this.settings.bind('show-count', 'showCount', () => this._onConfigurationChange());
        this.settings.bind('notify-changes', 'notifyChanges',
            () => this._onConfigurationChange());

        try {
            // Cinnamon 6.6 injects a per-xlet require(path) into applet.js.
            // Global imports.searchPath would pollute the entire shell.
            this._model = require('./deviceModel');
            const Registry = require('./deviceRegistry');
            const GUdev = imports.gi.GUdev;
            if (!GUdev || !GUdev.Client) throw new Error('GUdev is unavailable');
            const client = GUdev.Client.new(SUBSYSTEMS);
            if (!client) throw new Error('GUdev client could not be created');
            const scheduler = {
                schedule: (callback, delayMs) =>
                    Mainloop.timeout_add(delayMs, () => {callback();return false;}),
                cancel: token => Mainloop.source_remove(token)
            };
            const Inspector = require('./usageInspector');
            const Probe = require('./probeSession');
            this._probeSession = new Probe.ProbeSession(
                Inspector, Inspector.createGioRunner(Gio, GLib), scheduler,
                () => new Gio.Cancellable(), 5000);
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

    _searchedDevices() {
        if (!this._model) return [];
        return this._model.filterDevices(
            this._devices, this._enabledCategories(), this._searchText);
    }

    _onConfigurationChange() {
        this._refreshViews();
        if (this.menu.isOpen) this._startProbes();
    }

    _onRegistryUpdate(change) {
        if (this._removed) return;
        const oldDevices = new Map(this._devices.map(d => [d.id,d]));
        const nextDevices = new Map((change.devices || []).map(d => [d.id,d]));
        if (this._initialSnapshotSeen && this.notifyChanges && !change.error) {
            for (const id of change.added || []) {
                const device = nextDevices.get(id);
                if (device && device.categories.some(c => this._enabledCategories()[c]))
                    Main.notify('USB接続', device.name);
            }
            for (const id of change.removed || []) {
                const device = oldDevices.get(id);
                if (device && device.categories.some(c => this._enabledCategories()[c]))
                    Main.notify('USB切断', device.name);
            }
        }
        this._initialSnapshotSeen = true;
        this._devices = change.devices || [];
        this._errorText = change.error || null;
        this._usageCache.clear();
        this._refreshViews();
        if (this.menu.isOpen) this._startProbes();
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
        if (this.menu.isOpen && this._resultsSection) this._renderResults();
    }

    _renderMenu() {
        this.menu.removeAll();
        this._resultsSection = null;
        this._statusRows.clear();
        if (this._errorText) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                'USB監視エラー: ' + this._errorText, {reactive:false}));
            return;
        }
        const searchItem = new PopupMenu.PopupBaseMenuItem({reactive:false});
        this._searchEntry = new St.Entry({
            hint_text:'製品名・VID/PID・ポートを検索', can_focus:true
        });
        this._searchEntry.set_text(this._searchText);
        searchItem.addActor(this._searchEntry,{expand:true});
        this.menu.addMenuItem(searchItem);
        this._searchEntry.clutter_text.connect('text-changed',() => {
            if (!this.menu.isOpen || this._removed) return;
            this._searchText = this._searchEntry.get_text();
            this._renderResults();
            this._startProbes();
        });
        this._resultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._resultsSection);
        this._renderResults();
    }

    _renderResults() {
        if (!this._resultsSection) return;
        const resultSection = this._resultsSection;
        resultSection.removeAll();
        this._statusRows.clear();
        const devices = this._searchedDevices();
        resultSection.addMenuItem(new PopupMenu.PopupMenuItem(
            '表示中のUSB機器: ' + devices.length, {reactive:false}));
        if (!devices.length) {
            resultSection.addMenuItem(new PopupMenu.PopupMenuItem(
                '表示対象の機器はない', {reactive:false}));
            return;
        }
        const enabled = this._enabledCategories();
        for (const key of Object.keys(CATEGORY_LABELS)) {
            const grouped = devices.filter(device =>
                device.categories.find(c => enabled[c]) === key);
            if (!grouped.length) continue;
            const categoryItem = new PopupMenu.PopupSubMenuMenuItem(
                CATEGORY_LABELS[key] + ' (' + grouped.length + ')');
            resultSection.addMenuItem(categoryItem);
            for (const device of grouped) {
                const identity = device.vid && device.pid ?
                    device.vid + ':' + device.pid : 'VID/PID 不明';
                const row = new PopupMenu.PopupSubMenuMenuItem(
                    device.name + ' · ' + (device.nodes[0] || device.usbPath));
                categoryItem.menu.addMenuItem(row);
                this._addInfoItem(row.menu, 'VID:PID  ' + identity);
                this._addInfoItem(row.menu, '製造元  ' +
                    (device.manufacturer || '不明'));
                this._addInfoItem(row.menu, 'USBパス  ' + device.usbPath);
                this._addInfoItem(row.menu, 'カテゴリ  ' + device.categories.join(', '));
                for (const entry of device.interfaces) {
                    this._addInfoItem(row.menu, (entry.subsystem || 'interface') +
                        ' · ' + (entry.deviceNode || entry.sysfsPath) +
                        (entry.driver ? ' [' + entry.driver + ']' : ''));
                }
                const usageRow = new PopupMenu.PopupMenuItem(
                    this._formatUsage(this._usageCache.get(device.id)),
                    {reactive:false});
                row.menu.addMenuItem(usageRow);
                this._statusRows.set(device.id,usageRow);
                this._addCopyItem(row.menu,'sysfsパスをコピー',device.sysfsPath);
                if (device.vid && device.pid)
                    this._addCopyItem(row.menu,'VID:PIDをコピー',identity);
                for (const node of device.nodes)
                    this._addCopyItem(row.menu,node + ' をコピー',node);
            }
        }
    }

    _addInfoItem(menu,text) {
        menu.addMenuItem(new PopupMenu.PopupMenuItem(text,{reactive:false}));
    }

    _addCopyItem(menu,label,value) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate',()=>this._copyText(value));
        menu.addMenuItem(item);
    }

    _copyText(value) {
        St.Clipboard.get_default().set_text(
            St.ClipboardType.CLIPBOARD,String(value));
    }

    _formatUsage(result) {
        if (!result) return '利用状態: 未検査';
        let label = '利用状態: ' + result.status;
        if (result.status === 'Busy')
            label += ' · ' + (result.processes || []).map(p =>
                p.command + ' (PID ' + p.pid + ')').join(', ');
        if (result.status === 'Mounted')
            label += ' · ' + (result.mounts || []).join(', ');
        return label + (result.reason ? ' · ' + result.reason : '');
    }

    _startProbes() {
        this._usageCache.clear();
        if (!this.menu.isOpen || !this._probeSession ||
            this._removed || this._errorText) return;
        this._probeSession.open(this._searchedDevices(),(id,result) => {
            if (this._removed || !this.menu.isOpen) return;
            this._usageCache.set(id,result);
            const item = this._statusRows.get(id);
            if (item && item.label && typeof item.label.set_text === 'function')
                item.label.set_text(this._formatUsage(result));
        });
    }

    _stopProbes() {
        if (this._probeSession) this._probeSession.close();
        this._usageCache.clear();
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        this._removed = true;
        this._stopProbes();
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
