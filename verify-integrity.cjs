const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const c={appState:{inventory:[{id:1,stock:5},{id:2,stock:4}],production:[{id:3,productId:1,qty:2,materials:[{productId:2,qty:6}]}],transactions:[{id:4,saleId:9},{id:5}]},confirm:()=>true,showToast(){},saveData(){},renderProducao(){},renderCaixa(){}};
vm.createContext(c);
for(const [name,end] of [['deleteProduction','// --- DASHBOARD'],['deleteTransaction','// --- EMPLOYEES'],['deleteSaleTransactions','function openTransactionDetails']]) {const a=html.indexOf('        function '+name);vm.runInContext(html.slice(a,html.indexOf(end,a)),c);}
c.deleteProduction(3);assert.equal(c.appState.inventory[0].stock,3);assert.equal(c.appState.inventory[1].stock,10);assert.equal(c.appState.productionReversals.length,1);c.deleteProduction(3);assert.equal(c.appState.inventory[0].stock,3);
c.appState.production=[{id:6,productId:1,qty:10,materials:[{productId:2,qty:6}]}];c.deleteProduction(6);assert.equal(c.appState.production.length,1);assert.equal(c.appState.inventory[0].stock,3);
c.deleteTransaction(4);c.deleteSaleTransactions(9);assert.equal(c.appState.transactions.length,2);c.deleteTransaction(5);assert.equal(c.appState.transactions.length,1);
console.log('OK: production reversal, insufficient stock, repeat operation and protected sale transactions.');
