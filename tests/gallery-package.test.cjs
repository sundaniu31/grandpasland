/* GitHub ZIP links are metadata only. These tests never upload or publish an issue. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const A=require('../assets.js');
const C=require('../content.js');
const profile=require('../content-profile.json');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const packageUrl='https://github.com/user-attachments/files/12345/MyPack.zip';
const itemData={SchemaVersion:1,ProfileId:'crownfall1-v1',Entries:[{Id:'designer.pack.herb',Name:'田野草药',Category:'Material',Icon:{Path:'icons/herb.png'}}]};
A.configureProfile(profile);

class Element {
  constructor(id=''){this.id=id;this.value='';this.hidden=false;this.disabled=false;this.files=[];this.children=[];this.events={};this.dataset={};this.style={};this.attributes={};this.open=false;this.textContent='';}
  addEventListener(type,handler){(this.events[type]??=[]).push(handler);}
  async fire(type){for(const handler of this.events[type]||[])await handler({preventDefault(){},target:this});}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];delete this[key];}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  querySelectorAll(){return [];}
  remove(){this.removed=true;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  focus(){} select(){}
}
function page(){
  const elements=new Map(),calls=[],downloads=[];
  const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const ok=data=>({ok:true,status:200,json:async()=>plain(data),headers:{get:()=>null}});
  const context={URL,URLSearchParams,AbortController,TextEncoder,setTimeout,clearTimeout,Blob,GLI18n:{language:'zh-CN'},document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>new Element(),body:new Element()},fetch:async url=>{calls.push(url);return ok(url==='content-profile.json'?profile:[]);},location:{search:'',href:'https://site.example/gallery.html'},history:{replaceState(){}},addEventListener(){}};
  context.window=context;vm.createContext(context);
  for(const script of ['library-protocols.js','assets.js','package-export.js','content.js'])vm.runInContext(read(script),context,{filename:script});
  context.GLAssets.download=(data,name)=>downloads.push({data:plain(data),name});
  element('shareMode').value='json';element('shareType').value='CityNames';element('shareName').value='测试内容包';element('shareDescription').value='用于游戏的外部内容。';element('shareTags').value='社区,世界';
  vm.runInContext(read('gallery.js'),context,{filename:'gallery.js'});
  return {context,element,calls,downloads};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function issue(body,number=1){return {number,title:'【分享】测试内容包',body,labels:[],user:{login:'author'},created_at:'2026-10-13T00:00:00Z',comments:0};}
function extractDraft(form){const draft=form.children.at(-1),area=draft.children.find(child=>child.id==='draftBody');return area?.value||new URL(draft.children.find(child=>child.href)?.href).searchParams.get('body');}

test('Items needs the game profile while dialogue and name sharing remain available without it',()=>{
  assert.equal(C.requiresProfile('Items'),true);assert.equal(C.requiresProfile('Events'),true);
  assert.equal(C.requiresProfile('Dialogues'),false);assert.equal(C.requiresProfile('CountryNames'),false);
  const dialogues=A.validate({SchemaVersion:1,ProfileId:'crownfall1-v1',Lines:[{Id:'line',Text:{Text:'今天晴朗。'}}]},'Dialogues');
  assert.match(C.summary(dialogues,'Dialogues'),/1 条台词/);
  assert.match(C.summary(A.validate(itemData,'Items'),'Items'),/PNG/);
});

test('stable GitHub attachment and Release ZIP links retain canonical safe URLs',()=>{
  for(const value of [packageUrl,'https://github.com/sundaniu31/grandpasland/files/12/MyPack.zip','https://github.com/sundaniu31/grandpasland/releases/download/v1.2/MyPack.zip','https://github.com/sundaniu31/grandpasland/releases/latest/download/MyPack.zip','https://github.com/user-attachments/files/12345/%E6%88%91%E7%9A%84%20Mod.zip'])assert.equal(C.validatePackageUrl(value),new URL(value).href);
});

test('ZIP links reject unsafe schemes, credentials, temporary query strings and non-attachment paths',()=>{
  for(const value of ['http://github.com/user-attachments/files/12/a.zip','javascript:alert(1)','https://github.com.evil.example/user-attachments/files/12/a.zip','https://evil.example/a.zip','https://u:p@github.com/user-attachments/files/12/a.zip','https://github.com:444/user-attachments/files/12/a.zip',packageUrl+'?token=secret',packageUrl+'#x','https://github.com/user-attachments/files/12/image.png','https://github.com/user-attachments/files/0/a.zip','https://github.com/user-attachments/files/12/../a.zip','https://github.com/user-attachments/files/12/%2e%2e/a.zip','https://github.com/user-attachments/files/12/a%2fb.zip','https://github.com/user-attachments/files/12/a%5cb.zip','https://github.com/user-attachments/files/12/a%0ab.zip','https://github.com/sundaniu31/grandpasland/blob/main/a.zip','https://objects.githubusercontent.com/assets/a.zip'])assert.throws(()=>C.validatePackageUrl(value),value);
});

test('ZIP Issue drafts include actual format and an honest remote-validation disclaimer',()=>{
  for(const type of ['Items','ModPack']){
    const body=C.packageIssueBody({type,tags:['社区'],description:'完整包',packageUrl});
    const meta=JSON.parse(body.match(/gl-asset: (\{[^\n]+\})/)[1]);
    assert.equal(meta.version,2);assert.equal(meta.format,'zip');assert.equal(meta.packageUrl,packageUrl);assert.equal(meta.type,type);
    assert.match(body,/未经网站实物检查/);assert.ok(!body.includes('```json'));
  }
  assert.throws(()=>C.packageIssueBody({type:'Events',packageUrl}),/ZIP/);
  assert.throws(()=>C.issueBody({type:'Items',tags:[],description:'单独JSON'},itemData),/完整 ZIP/);
});

test('gallery page advertises all actual library types and loads protocols before assets',()=>{
  const html=read('gallery.html');
  for(const type of ['CountryNames','Dialogues','Items','ModPack'])assert.equal((html.match(new RegExp('value="'+type+'"','g'))||[]).length,2,type+' filter and share option');
  assert.ok(html.indexOf('src="library-protocols.js"')<html.indexOf('src="assets.js"'));
  assert.ok(html.indexOf('src="assets.js"')<html.indexOf('src="package-export.js"'));
  for(const id of ['shareMode','sharePackageUrl','shareJsonFields','shareZipFields','detailPackageDownload'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(!html.includes('当前广场不能读取附件'));
});

test('ZIP sharing form produces only a GitHub draft link without a file upload or issue POST',async()=>{
  const p=page();await settle();p.element('shareMode').value='zip';p.element('shareType').value='ModPack';p.element('sharePackageUrl').value=packageUrl;
  await p.element('shareMode').fire('change');await p.element('shareForm').fire('submit');
  assert.equal(p.element('shareStatus').dataset.kind,'success',p.element('shareStatus').textContent);
  assert.equal(p.element('shareFile').required,false);assert.equal(p.element('sharePackageUrl').required,true);
  const body=extractDraft(p.element('shareForm'));assert.match(body,/"format":"zip"/);
  assert.ok(p.calls.every(url=>url==='content-profile.json'||url.startsWith('https://api.github.com/repos/sundaniu31/grandpasland/issues?')));
});

test('ZIP posts show a safe direct download and never report remote package bytes validated',async()=>{
  const p=page();await settle();p.context.currentIssue=issue(C.packageIssueBody({type:'ModPack',tags:[],description:'完整包',packageUrl}));
  const work=vm.runInContext('workOf(currentIssue)',p.context);assert.equal(work.error,'');assert.equal(work.packageUrl,packageUrl);assert.equal(work.data,null);assert.equal(work.downloadable,true);
  p.context.currentWork=work;await vm.runInContext('openDetail(currentWork)',p.context);
  assert.equal(p.element('detailPackageDownload').href,packageUrl);assert.equal(p.element('detailPackageDownload').hidden,false);
  assert.equal(p.element('detailDownload').hidden,true);assert.match(p.element('detailWarnings').textContent,/未经网站实物校验/);
  assert.equal(p.downloads.length,0);assert.ok(!p.calls.includes(packageUrl));
});

test('invalid or incompatible ZIP metadata cannot become a download link',async()=>{
  const p=page();await settle();
  const valid=JSON.parse(C.packageIssueBody({type:'Items',packageUrl}).match(/gl-asset: (\{[^\n]+\})/)[1]);
  for(const extra of [{version:1},{type:'Events'},{schemaVersion:2},{profileId:'other-game'},{packageUrl:'https://evil.example/a.zip'},{packageUrl:'https://github.com/user-attachments/files/12/a.png'}]){
    p.context.currentIssue=issue('<!-- gl-asset: '+JSON.stringify({...valid,...extra})+' -->');
    const work=vm.runInContext('workOf(currentIssue)',p.context);assert.ok(work.error);assert.equal(work.packageUrl,'');assert.equal(work.downloadable,false);
  }
});

test('legacy item JSON can be inspected but cannot be downloaded as a complete import package',async()=>{
  const p=page();await settle();p.context.currentIssue=issue('<!-- gl-asset: {"version":1,"type":"Items"} -->\n```json\n'+JSON.stringify(itemData)+'\n```');
  const work=vm.runInContext('workOf(currentIssue)',p.context);assert.ok(work.data);assert.match(work.error,/没有实际 PNG/);assert.equal(work.downloadable,false);
  p.context.currentWork=work;await vm.runInContext('openDetail(currentWork)',p.context);await p.element('detailDownload').onclick();
  assert.equal(p.downloads.length,0);assert.equal(p.element('detailDownload').disabled,true);
});

test('CountryNames and complete dialogue JSON survive draft, gallery and local download',async()=>{
  for(const [type,data] of [['CountryNames',{SchemaVersion:1,ProfileId:'crownfall1-v1',Items:['金穗诸邦']}],['Dialogues',{SchemaVersion:1,ProfileId:'crownfall1-v1',Conversations:[{Id:'designer.pack.hello',StartNodeId:'end',Nodes:[{Id:'end',Text:{Text:'再见。'}}]}]}]]){
    const p=page();await settle();p.element('shareType').value=type;p.element('shareFile').files=[{name:'data.json',size:1000,text:async()=>JSON.stringify(data)}];
    await p.element('shareForm').fire('submit');assert.equal(p.element('shareStatus').dataset.kind,'success',p.element('shareStatus').textContent);
    p.context.currentIssue=issue(extractDraft(p.element('shareForm')));const work=vm.runInContext('workOf(currentIssue)',p.context);assert.equal(work.error,'');assert.equal(work.type,type);
    p.context.currentWork=work;await vm.runInContext('openDetail(currentWork)',p.context);await p.element('detailDownload').onclick();assert.deepEqual(p.downloads[0].data,A.validate(data,type));
  }
});
