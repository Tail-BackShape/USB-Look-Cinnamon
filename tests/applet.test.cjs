'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {loadGjsModule} = require('./support/load-gjs-module.cjs');
const inner = path.join(__dirname,'../usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape');
const model = loadGjsModule(path.join(inner,'deviceModel.js'),['CATEGORY_KEYS','classifyInterface','buildDevices','filterDevices']);
const reg = loadGjsModule(path.join(inner,'deviceRegistry.js'),['DeviceRegistry']);
class AppletBase {
    set_applet_icon_symbolic_name(name){this.icon=name;}
    set_applet_label(label){this.label=label;}
    set_applet_tooltip(text){this.tooltip=text;}
}
class Menu {
    constructor(){this.isOpen=false;this.items=[];this.handlers={};}
    connect(name,fn){this.handlers[name]=fn;return 1;}
    toggle(){this.isOpen=!this.isOpen;if(this.handlers['open-state-changed'])this.handlers['open-state-changed'](this,this.isOpen);}
    removeAll(){this.items=[];}
    addMenuItem(item){this.items.push(item);}
    destroy(){this.destroyed=true;}
}
class FakeSettings {
    constructor(host){this.host=host;this.handlers={};}
    bind(key,property,callback){this.host[property]=true;if(key==='notify-changes')this.host[property]=false;this.handlers[key]=()=>{this.host[property]=this.overrides[key];callback();};}
    set(key,value){this.overrides=this.overrides||{};this.overrides[key]=value;this.handlers[key]();}
    finalize(){this.finalized=true;}
}
function fixture() {
    const physicalPath='/sys/usb1/1-2';
    const parent={
        get_subsystem:()=> 'usb',get_devtype:()=> 'usb_device',
        get_sysfs_path:()=>physicalPath,get_property:()=>null,get_driver:()=>null,
        get_device_file:()=>null,get_sysfs_attr:key=>({idVendor:'303a',idProduct:'1001',product:'ESP32-S3'})[key]||null
    };
    const tty={
        get_subsystem:()=> 'tty',get_devtype:()=>null,
        get_sysfs_path:()=>physicalPath+'/tty/ttyACM0',get_property:()=>null,
        get_driver:()=>null,get_device_file:()=>'/dev/ttyACM0',
        get_sysfs_attr:()=>null,get_parent_with_subsystem:()=>parent
    };
    return {connect:()=>1,disconnect:()=>{},query_by_subsystem:name=>name==='usb'?[parent]:name==='tty'?[tty]:[]};
}
function createApplet(client=fixture()) {
    let settings;
    const context={imports:{
        searchPath:[],
        deviceModel:model,deviceRegistry:reg,
        ui:{
            applet:{TextIconApplet:AppletBase,AppletPopupMenu:Menu},
            popupMenu:{PopupMenuManager:class{addMenu(){}},
                PopupMenuItem:class {constructor(label){this.label=label;}}},
            settings:{AppletSettings:class extends FakeSettings{constructor(host){super(host);settings=this;}}}
        },
        gi:{GUdev:{Client:{new:()=>client}},GLib:{},St:{}},
        mainloop:{timeout_add:(ms,fn)=>1,source_remove:()=>{}}
    },global:{logError:()=>{}}};
    const script=fs.readFileSync(path.join(inner,'applet.js'),'utf8');
    vm.runInNewContext(script,context,{filename:'applet.js'});
    const applet=context.main({uuid:'usb-look-cinnamon@tail-backshape',path:inner},0,24,1);
    return {applet,settings};
}
test('Cinnamon shell creates icon, enumerates devices and respects category toggles',()=>{
    const {applet,settings}=createApplet();
    assert.ok(applet.icon);
    assert.equal(applet.label,'1');
    settings.set('show-serial',false);
    assert.equal(applet.label,'0');
    applet.on_applet_clicked();
    assert.ok(applet.menu.isOpen);
    applet.on_applet_removed_from_panel();
    assert.ok(settings.finalized);
    assert.ok(applet.menu.destroyed);
});
test('missing GUdev gracefully produces a panel warning',()=>{
    const {applet}=createApplet(null);
    assert.match(applet.tooltip,/GUdev|USB|error/i);
    applet.on_applet_removed_from_panel();
});
