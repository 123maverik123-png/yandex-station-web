const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../static/index.html'),'utf8');
const source=html.slice(html.indexOf('let promptedPanelVersion ='),html.indexOf('loadPanelVersion().catch'));
const elements={},storage={},requests=[];
const node=id=>elements[id]||=( {style:{},classList:{toggle(){}},setAttribute(){},open:false,showModal(){this.open=true;this.opens=(this.opens||0)+1;},close(){this.open=false;}} );
const c={$:node,document:{createElement:()=>node('dialog'),body:{append(){}}},store:{get:k=>storage[k],set:(k,v)=>storage[k]=v},
  UPD_HOW:{},toast:t=>c.toastText=t,act:async(b,fn)=>fn(),PanelContext:{},
  response:{version:'0.1.3',latest:'0.1.4',checked:1700000000,update:true,install:'zip',multi:true},
  api:async route=>{requests.push(route);return c.response;}};
vm.createContext(c);
vm.runInContext('let panelVer=null;'+source,c);
(async()=>{
  await vm.runInContext('loadPanelVersion()',c);
  assert(node('dialog').open);assert(node('#panel-update-message').textContent.includes('0.1.4'));
  assert(!requests.some(p=>p.includes('/update')),'must wait for explicit confirmation');
  node('dialog').close();await vm.runInContext('loadPanelVersion()',c);
  assert.equal(node('dialog').opens,1,'do not nag for dismissed release');
  await vm.runInContext('loadPanelVersion(true)',c);assert.equal(node('dialog').opens,2);
  c.response={...c.response,error:'GitHub 503'};
  await vm.runInContext('loadPanelVersion(true)',c);assert(node('#upd-state').textContent.includes('GitHub 503'));
  assert.equal(node('dialog').opens,2,'do not offer stale release on failed check');
  c.response={...c.response,latest:'0.1.3',update:false,error:null};
  await node('#upd-check').onclick({currentTarget:node('#upd-check')});
  assert.equal(node('#upd-check').textContent,'Проверить');assert(c.toastText.includes('последняя'));
  assert(node('#upd-state').textContent.includes('проверено'));
  console.log('Update popup, explicit consent, refresh feedback, stale-error and dismissal cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
