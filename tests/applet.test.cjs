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
const probe = loadGjsModule(path.join(inner,'probeSession.js'),['ProbeSession']);
const usage = loadGjsModule(path.join(inner,'usageInspector.js'),['inspectDevice','createGioRunner']);
class AppletBase {
    set_applet_icon_symbolic_name(name){this.icon=name;}
    set_applet_label(label){this.label=label;}
    set_applet_tooltip(text){this.tooltip=text;}
}
class FakeEntry {constructor(){this.value='';this.listeners=[];this.clutter_text={connect:(name,fn)=>this.listeners.push(fn)};} get_text(){return this.value;}set_text(value){this.value=value;for(const fn of this.listeners)fn();}}
class Menu {
    constructor(){this.isOpen=false;this.items=[];this.handlers={};}
    connect(name,fn){this.handlers[name]=fn;return 1;}
    toggle(){this.isOpen=!this.isOpen;if(this.handlers['open-state-changed'])this.handlers['open-state-changed'](this,this.isOpen);}
    removeAll(){this.items=[];}
    addMenuItem(item){this.items.push(item);}
    destroy(){this.destroyed=true;}
}
class Item {constructor(label){this.label={text:label,set_text:function(x){this.text=x;}};this.menu=new Menu();this.callbacks={};}connect(n,cb){this.callbacks[n]=cb;}activate(){if(this.callbacks.activate)this.callbacks.activate();}addActor(){}}
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
    let settings;const notifications=[];const clipboard={value:null,set_text:(type,value)=>{clipboard.value=value;}};
    const context={imports:{
        searchPath:[],
        deviceModel:model,deviceRegistry:reg,probeSession:probe,usageInspector:usage,
        ui:{
            applet:{TextIconApplet:AppletBase,AppletPopupMenu:Menu},
            popupMenu:{PopupMenuManager:class{addMenu(){}},PopupMenuItem:Item,
                PopupSubMenuMenuItem:Item,PopupBaseMenuItem:Item,PopupMenuSection:Menu},
            main:{notify:(title,body)=>notifications.push([title,body])},
            settings:{AppletSettings:class extends FakeSettings{constructor(host){super(host);settings=this;}}}
        },
        gi:{GUdev:{Client:{new:()=>client}},GLib:{},
            Gio:{Cancellable:class{cancel(){}},SubprocessFlags:{STDOUT_PIPE:1,STDERR_PIPE:2},
                Subprocess:{new:()=>({communicate_utf8_async:(input,c,cb)=>cb({communicate_utf8_finish:()=>[true,'',''],get_exit_status:()=>1},null)})}},
            St:{Entry:FakeEntry,Clipboard:{get_default:()=>clipboard},ClipboardType:{CLIPBOARD:1}}},
        mainloop:{timeout_add:(ms,fn)=>1,source_remove:()=>{}}
    },global:{logError:()=>{}}};
    const script=fs.readFileSync(path.join(inner,'applet.js'),'utf8');
    vm.runInNewContext(script,context,{filename:'applet.js'});
    const applet=context.main({uuid:'usb-look-cinnamon@tail-backshape',path:inner},0,24,1);
    return {applet,settings,notifications,clipboard};
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

test('popup search narrows the visible USB list without changing panel count',()=>{
    const {applet}=createApplet();
    applet.on_applet_clicked();
    assert.ok(applet._searchEntry);
    applet._searchEntry.set_text('unmatched-device');
    assert.equal(applet._visibleDevices().length,1);
    assert.equal(applet._searchedDevices().length,0);
    assert.equal(applet.label,'1');
    applet.on_applet_clicked();
    assert.equal(applet._probeSession._active,false);
    applet.on_applet_removed_from_panel();
});
test('notifications are off by default and only enabled for matching categories',()=>{
    const {applet,settings,notifications}=createApplet();
    const current=applet._devices.slice();
    applet._onRegistryUpdate({devices:[],added:[],removed:[current[0].id],error:null});
    assert.equal(notifications.length,0);
    settings.set('notify-changes',true);
    applet._onRegistryUpdate({devices:current,added:[current[0].id],removed:[],error:null});
    assert.equal(notifications.length,1);
    settings.set('show-serial',false);
    applet._onRegistryUpdate({devices:[],added:[],removed:[current[0].id],error:null});
    assert.equal(notifications.length,1);
    applet.on_applet_removed_from_panel();
});
test('copy action uses Cinnamon clipboard and never opens a device',()=>{
    const {applet,clipboard}=createApplet();
    applet._copyText('/sys/usb1/1-2');
    assert.equal(clipboard.value,'/sys/usb1/1-2');
    applet.on_applet_removed_from_panel();
});
