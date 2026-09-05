const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { localDate, escapeHtml, canonical, validateBackup } = require('./app-safety.js');
const html = fs.readFileSync('index.html','utf8');
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
new vm.Script(fs.readFileSync('service-worker.js','utf8'));
assert.equal(localDate(new Date(2026,8,4,23,30)), '2026-09-04');
assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));
const defaults = {config:{},inventory:[],transactions:[],sales:[],clients:[],employees:[],production:[],accounts:['Caixa']};
assert.equal(validateBackup({...defaults},defaults).accounts[0],'Caixa');
for (const bad of [null, [], {}, {...defaults,inventory:'bad'}, {...defaults,transactions:[{id:1,amount:-1,type:'entrada'}]}, {...defaults,inventory:[{id:1,name:'A',stock:3,recipe:[{productId:2,qty:1}]}]}, JSON.parse('{"config":{},"inventory":[],"transactions":[],"sales":[],"clients":[],"employees":[],"__proto__":{}}')]) assert.throws(()=>validateBackup(bad,defaults));
function functionSection(start,end) {return html.slice(html.indexOf('        function '+start), html.indexOf('        function '+end));}
const syncCode=functionSection('setSaveStatus','calculateBreakEvenData');
function syncContext(remoteState) {
    const storage = new Map();
    const ctx = { canonical, dataStorageKey:'data-test', appState: {value:1}, cloudBaseline: canonical({value:0}), pendingCloudSave:false, syncRunning:false, syncPromise:Promise.resolve(), pendingKey:'pending', firebaseReady:true, cloudSyncEnabled:true, dbDocName:'test', currentUser:{}, window:{addEventListener(){}}, localStorage:{setItem(k,v){storage.set(k,v)}, removeItem(k){storage.delete(k)}}, document:{getElementById(){return {style:{},set textContent(v){ctx.status=v}}}}, remote:remoteState };
    ctx.db={collection(){return {doc(){return {}}}}, async runTransaction(fn){await fn({async get(){return {exists:ctx.remote!==null,data(){return ctx.remote}}},set(ref,value){ctx.remote=value}})}};
    vm.createContext(ctx); vm.runInContext(syncCode,ctx);ctx.storage=storage;return ctx;
}
(async()=>{
    let c=syncContext({value:0});
    assert.equal(await c.saveData(),true);assert.equal(c.remote.value,1);assert.equal(c.pendingCloudSave,false);
    c=syncContext({value:2});
    assert.equal(await c.saveData(),false);assert.equal(c.remote.value,2);assert.equal(c.appState.value,1);assert.equal(c.pendingCloudSave,true);assert.ok(c.storage.has('pending'));
    c=syncContext({value:0});c.localStorage.setItem=()=>{throw Error('quota')};
    assert.equal(await c.saveData(),false);assert.equal(c.remote.value,0);assert.match(c.status,/Não foi possível salvar/);
    c=syncContext({value:0});let release;const gate=new Promise(r=>release=r);let calls=0;
    const original=c.db.runTransaction;c.db.runTransaction=async fn=>{if(calls++===0)await gate;return original(fn)};
    const first=c.saveData();c.appState={value:3};const second=c.saveData();release();await Promise.all([first,second]);assert.equal(c.remote.value,3);assert.equal(c.pendingCloudSave,false);
    const inventory={inventory:[{id:1,recipe:[]},{id:2,recipe:[{productId:1,qty:1}]}]};
    const d={appState:inventory,showToast(){},confirm(){throw Error('Deletion should be blocked')},saveData(){},renderEstoque(){}};
    vm.createContext(d);vm.runInContext(functionSection('deleteProduct','editProduct'),d);d.deleteProduct(1);assert.equal(d.appState.inventory.length,2);
    const l={currentUser:{},isInitializing:true,pendingCloudSave:false,syncRunning:false,auth:{async signOut(){l.signedOut=true}},cloudUnsubscribe(){l.unsubscribed=true},currentCart:[1],pdvClient:{},pdvDiscount:10,pdvPayments:[1],closeModal(){},localStorage:{removeItem(){}},document:{getElementById(){return {classList:{add(){},remove(){}}}}},updateLoginHint(){}};
    vm.createContext(l);vm.runInContext(functionSection('resetSessionUI','openProfileModal'),l);await l.logout();assert.equal(l.signedOut,true);assert.equal(l.isInitializing,false);assert.equal(l.currentUser,null);assert.equal(l.unsubscribed,true);assert.equal(l.currentCart.length,0);
    l.auth.currentUser={uid:'owner'};l.dbDocName='prod';l.db={collection:()=>({doc:()=>({get:async()=>{throw Object.assign(Error('denied'),{code:'permission-denied'})}})})};l.setLoginError=message=>l.error=message;l.initApp=()=>{throw Error('Unauthorized app opened')};
    await l.handleAuthState({uid:'owner'});assert.equal(l.currentUser,null);assert.match(l.error,/não está autorizada/);
    l.db={collection:()=>({doc:()=>({get:async()=>({exists:true})})})};l.initApp=()=>l.initialized=true;
    await l.handleAuthState({uid:'owner',email:'owner@example.test'});assert.equal(l.initialized,true);assert.equal(l.currentUser.uid,'owner');
    console.log('OK: syntax, local dates, HTML escaping, backup validation, saving, conflicts, storage failure, queued edits, recipe protection and logout.');
})().catch(err=>{console.error(err);process.exitCode=1});
