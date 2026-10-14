const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const A=require('../assets.js');
const {createServer}=require('../preview.cjs');
const site=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(site,name),'utf8');
A.configureProfile(JSON.parse(read('content-profile.json')));
test('seven published JSON guide examples use their actual Unity-compatible category roots',()=>{
  const examples=[...read('docs.html').matchAll(/<pre><code>(\{[\s\S]*?)<\/code><\/pre>/g)].map(match=>JSON.parse(match[1]));
  assert.equal(examples.length,7);
  ['CityNames','Quests','Events','Festivals','Dialogues','Items','AIStyles'].forEach((type,index)=>{
    const clean=A.validate(examples[index],type);
    assert.equal(clean.SchemaVersion,1);assert.equal(clean.ProfileId,'crownfall1-v1');
  });
  assert.equal(examples[4].Conversations[0].Nodes[0].Options[1].EventId,'');
  assert.equal(examples[5].Entries[0].Icon.Path,'icons/herb.png');
});
test('world style documentation states the exact standalone import and apply contract',()=>{
  const docs=read('docs.html'),rules=read('external-library-rules.md'),guide=read('README.md');
  for(const text of [docs,rules,guide]){
    for(const term of ['AIStyles','WorldBackground','StyleInstructions','128 KiB','8000','12000','应用'])assert.ok(text.includes(term),term+' missing');
    assert.match(text,/不能加入 Mod|不进入 Mod|不属于.*Mod/);
  }
  assert.match(docs,/仅导入或载入不会立即生效/);
  assert.match(rules,/WorldAIStyleStore\.cs/);
  assert.match(rules,/Enabled.*ApiKey.*Model/);
});
test('documentation distinguishes JSON, complete item packs and extracted data-only Mods',()=>{
  const doc=read('docs.html');
  for (const type of Object.keys(A.TYPES)) assert.ok(doc.includes(type),type+' missing from guide');
  for (const term of ['5000','自动分批','Lines','Conversations','Profiles','zh-Hans','32 MiB','16777216','256 个 JSON','10 MiB','真实 PNG','GitHub Release','ZIP 先解压']) assert.ok(doc.includes(term),term+' missing from guide');
  assert.match(doc,/普通库列表递归发现/);
  assert.match(doc,/JSON 必须直接放在 NameLibraries\/Items 根目录/);
  assert.match(doc,/AppData\\LocalLow\\DefaultCompany\\Crownfall1\\Mods\\/);
  assert.doesNotMatch(doc,/物品标签列表也为空|当前广场不读取附件/);
});
test('known packaged disease names and exported item tags are documented without claiming complete registries',()=>{
  const doc=read('docs.html');
  for (const disease of ['感冒','痢疾','风寒','食物中毒','瘟疫']) assert.ok(doc.includes(disease));
  for (const tag of A.getProfile().resources.itemTags) assert.ok(doc.includes(tag),'Missing actual item tag '+tag);
  assert.match(doc,/resourcesComplete\.diseases:false/);
  assert.match(doc,/不能当作没有疾病/);
});
test('downloadable rule document uses a portable profile link and preserves source references',()=>{
  const rules=read('external-library-rules.md');
  assert.match(rules,/\[content-profile\.json\]\(content-profile\.json\)/);
  assert.doesNotMatch(rules,/\(D:\/桌面\/长任务计划\/content-profile\.json\)/);
  for (const term of ['103 种子效果','ExternalContentContract.cs','DialogueLibraryStore.cs','ExternalItemPackageImporter.cs','crownfall1-v1']) assert.ok(rules.includes(term),term+' source rule missing');
  assert.match(read('docs.html'),/href="external-library-rules\.md" download/);
  assert.match(read('docs.html'),/href="content-profile\.json" download/);
});
test('new authoring controls and guide labels translate without touching library identifiers',()=>{
  const context={URLSearchParams,location:{search:'',href:'https://site.example/docs.html'},localStorage:{getItem:()=> 'en'},document:{readyState:'loading',addEventListener(){}},addEventListener(){}};
  context.window=context;vm.createContext(context);vm.runInContext(read('i18n.js'),context);
  const labels=['国家名库','对话库','物品库','对话生成方式','分支会话 · 玩家选项回答','单句台词 · NPC / 酒馆闲聊','AI 人设 · 自由回复知识','物品 PNG 图标 · 可多选','打包完整 Mod','加入 Mod 包','分享方式','单个 JSON 库','完整 ZIP 包链接','GitHub ZIP 附件或 Release 下载链接','下载完整 ZIP 包 ↓','下载完整外部库接入规则（Markdown） ↓'];
  for (const label of labels) assert.notEqual(context.GLI18n.t(label),label,'Missing English translation: '+label);
  assert.equal(context.GLI18n.t('designer.demo.field_herb'),'designer.demo.field_herb');
  assert.equal(context.GLI18n.t('zh-Hans'),'zh-Hans');
});
test('preview routes portable Markdown downloads and profile JSON without exposing arbitrary source paths',async()=>{
  // Exercise the real request listener and filesystem without opening a network socket.
  const server=createServer();
  const request=url=>new Promise(resolve=>{
    const response={status:0,headers:{},body:'',writeHead(status,headers={}){this.status=status;this.headers=headers;},end(data){this.body=data?.toString('utf8') || '';resolve(this);}};
    server.emit('request',{url,method:'GET'},response);
  });
  const markdown=await request('/external-library-rules.md');
  assert.equal(markdown.status,200);assert.match(markdown.headers['Content-Type'],/text\/markdown/);
  assert.match(markdown.headers['Content-Disposition'],/attachment; filename="external-library-rules.md"/);
  assert.equal(markdown.body,read('external-library-rules.md'));
  const profile=await request('/content-profile.json');assert.equal(profile.status,200);
  assert.equal(JSON.parse(profile.body).profileId,'crownfall1-v1');
  const malformed=await request('/%zz');assert.equal(malformed.status,400);
  const script=await request('/preview.cjs');assert.equal(script.status,404);
});
