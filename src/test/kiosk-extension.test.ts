// Exercise the real MV3 worker without launching Chrome.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, expect, it, vi } from 'vitest';
const root = 'public/kiosk-extension/';
const websiteSender = {id:'extension',frameId:0,url:'https://mathfinance.netlify.app/exam/quiz',tab:{id:7,windowId:3}};
let events:Record<string,Function>;
let chrome:any;
let state:Record<string,any>;
function event(name:string) {return {addListener:(fn:Function)=>{events[name]=fn;}};}
beforeEach(()=>{
  state={};events={};
  chrome={
    runtime:{id:'extension',getURL:(p:string)=>'chrome-extension://extension/'+p,getManifest:()=>({version:'1.0.0'}),onMessage:event('message')},
    storage:{session:{get:async()=>({...state}),set:async(value:object)=>{Object.assign(state,value);},remove:async(key:string)=>{delete state[key];}}},
    action:{onClicked:event('action')},
    tabs:{update:vi.fn().mockResolvedValue({}),query:vi.fn().mockResolvedValue([]),create:vi.fn().mockResolvedValue({}),remove:vi.fn().mockResolvedValue({}),onActivated:event('activate'),onRemoved:event('remove')},
    windows:{update:vi.fn().mockResolvedValue({}),create:vi.fn().mockResolvedValue({}),onFocusChanged:event('focus'),WINDOW_ID_NONE:-1},
    webNavigation:{onCommitted:event('navigate'),onHistoryStateUpdated:event('history')},
  };
  runInNewContext(readFileSync(root+'background.js','utf8'),{chrome,URL,Date,Math,Number,String,Promise});
});
function send(type:string,sender:any=websiteSender,extra:object={}) {
  return new Promise<any>(resolve=>events['message']!({type,...extra},sender,resolve));
}
it('launches its own fullscreen dashboard from the toolbar',async()=>{
  await events['action']!();
  // The Chrome event handler starts an asynchronous launcher.
  await vi.waitFor(()=>expect(chrome.windows.create).toHaveBeenCalledWith({url:'chrome-extension://extension/dashboard.html',type:'popup',state:'fullscreen'}));
});
it('rejects untrusted origins, subframes and non-assessment starts',async()=>{
  expect((await send('START',{...websiteSender,url:'https://other.example/exam/quiz'})).ok).toBe(false);
  expect((await send('START',{...websiteSender,frameId:1})).ok).toBe(false);
  expect((await send('START',{...websiteSender,url:'https://mathfinance.netlify.app/courses'})).ok).toBe(false);
  expect(state['session']).toBeUndefined();
});
it('syncs progress, guards active navigation, and releases on website finish',async()=>{
  expect((await send('START',websiteSender,{title:'Business Finance'})).ok).toBe(true);
  await send('STATUS',websiteSender,{answered:12,total:50});
  expect(state['session']).toMatchObject({active:true,title:'Business Finance',answered:12,total:50});
  await events['navigate']!({tabId:7,frameId:0,url:'https://mathfinance.netlify.app/courses'});
  expect(chrome.tabs.update).toHaveBeenCalledWith(7,{url:websiteSender.url});
  expect((await send('FINISH',{...websiteSender,tab:{id:8,windowId:3}})).ok).toBe(false);
  await send('FINISH');
  expect(state['session'].active).toBe(false);
  chrome.tabs.update.mockClear();
  await events['navigate']!({tabId:7,frameId:0,url:'https://mathfinance.netlify.app/courses'});
  expect(chrome.tabs.update).not.toHaveBeenCalled();
  expect((await send('STATUS')).ok).toBe(false);
  expect(state['session'].active).toBe(false);
});
it('cannot cancel an assessment once progress has started',async()=>{
  await send('START');await send('STATUS');
  expect((await send('CANCEL')).ok).toBe(false);
  expect(state['session'].active).toBe(true);
  await events['remove']!(7);
  expect(state['session']).toBeUndefined();
});
it('ships MV3 and scopes content scripts to the main website',()=>{
  const manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.background).toEqual({service_worker:'background.js',type:'module'});
  expect(manifest.content_scripts[0].matches).toEqual(['https://mathfinance.netlify.app/*','https://main--mathfinance.netlify.app/*']);
  expect(manifest.permissions).not.toContain('cookies');
});
