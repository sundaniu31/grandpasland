/* Exercise page event handlers with deterministic provider/GitHub responses. No network. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const site=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(site,name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
class Element{
  constructor(id=''){this.id=id;this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.dataset={};this.style={};this.children=[];this.events={};this.attributes={};this.files=[];this.open=false;this.textContent='';}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  async fire(type){for(const fn of this.events[type]||[])await fn({preventDefault(){},target:this});}
  querySelectorAll(){return [];}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  remove(){this.removed=true;}
  focus(){} select(){} click(){}
  showModal(){this.open=true;} close(){this.open=false;}
}
function page(script,fetcher){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const values={libType:'Events',libName:'瘟疫测试',apiUrl:'https://provider.example/chat/completions',apiModel:'test-model',apiKey:'test-key',contentDesc:'某座城市发生瘟疫，感染三名 NPC，药材需求上涨',entryCount:'1',weight:'20',cooldown:'30',ruleType:'ByDayInYear',ruleSeason:'Spring',ruleDay:'2',rulePeriod:'15',ruleDuration:'1',nameCount:'5',nameDesc:'简短城名',dialogueKind:'Conversations',dialogueScene:'ambient',modName:'TestMod',shareType:'Events',shareName:'瘟疫测试',shareDescription:'测试组合效果',shareTags:'事件,瘟疫',shareFormat:'json'};
  Object.entries(values).forEach(([id,value])=>element(id).value=value);
  const context={URL,URLSearchParams,AbortController,TextEncoder,Uint8Array,ArrayBuffer,DataView,setTimeout,clearTimeout,Blob,createImageBitmap:async()=>({width:1,height:1,close(){}}),fetch:fetcher,document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>new Element(),body:new Element()},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},location:{search:'',href:'https://site.example/'+script.replace('.js','.html')},history:{replaceState(){}},GLI18n:{language:'zh-CN'},addEventListener(){}};
  context.window=context;vm.createContext(context);
  vm.runInContext(read('library-protocols.js'),context,{filename:'library-protocols.js'});
  vm.runInContext(read('assets.js'),context,{filename:'assets.js'});
  vm.runInContext(read('package-export.js'),context,{filename:'package-export.js'});
  vm.runInContext(read('content.js'),context,{filename:'content.js'});
  const downloads=[];context.GLAssets.download=(data,name)=>downloads.push({data:plain(data),name});
  const packageDownloads=[];context.GLPackages.downloadPackage=result=>packageDownloads.push(result);
  vm.runInContext(read(script),context,{filename:script});
  return {context,element,downloads,packageDownloads};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const response=data=>({ok:true,status:200,json:async()=>plain(data),headers:{get:()=>null}});
// The plague/demand reproduction uses explicitly synthetic resource names. Real game
// resource compatibility is covered separately by the exported-profile validator.
const profile=()=>{const data=JSON.parse(read('content-profile.json'));data.resources.diseases=[...new Set([...data.resources.diseases,'瘟疫'])];data.resources.itemTags=[...new Set([...data.resources.itemTags,'药材'])];return data;};
function eventFile(){return {SchemaVersion:1,ProfileId:profile().profileId,Entries:[{Id:'web_plague_01',Name:'{SettlementName}发生了瘟疫',Description:'城中数人感染瘟疫，药材需求增加。',Type:'Disease',EventType:'Bad',Score:-8,Tags:'Health, Economy',Weight:20,CooldownDays:30,Repeatable:true,Target:{RandomSettlement:true},TriggerConsequences:[{Type:'InfectDiseaseEffect',Parameters:{DiseaseName:'瘟疫',TargetMode:'RandomInSettlement',CharacterKind:'Npc',TargetCount:3}},{Type:'ModifyDemandByTagEffect',Parameters:{ItemTag:'药材',Delta:50,DurationDays:15}}],Options:[]}]};}
function saveOutput(name,data){if(process.env.GL_PIPELINE_OUTPUT_DIR){fs.mkdirSync(process.env.GL_PIPELINE_OUTPUT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.GL_PIPELINE_OUTPUT_DIR,name),JSON.stringify(data,null,2),'utf8');}}
test('generation -> edited download -> GitHub draft -> gallery download preserves executable event',async()=>{
  const calls=[];
  const workshop=page('workshop.js',async(url,options)=>{
    calls.push({url,options});
    if(url==='content-profile.json')return response(profile());
    return response({choices:[{message:{content:JSON.stringify(eventFile())}}]});
  });
  await workshop.element('generatorForm').fire('submit');
  assert.equal(workshop.element('status').dataset.kind,'success',workshop.element('status').textContent);
  const provider=calls.find(call=>call.url.startsWith('https://provider'));
  const prompt=JSON.parse(provider.options.body).messages[1].content;
  assert.match(prompt,/InfectDiseaseEffect/);assert.match(prompt,/TriggerConsequences/);assert.match(prompt,/RandomSettlement/);
  assert.match(workshop.element('effectSummary').textContent,/瘟疫/);assert.match(workshop.element('effectSummary').textContent,/药材/);
  const edited=JSON.parse(workshop.element('preview').value);edited.Entries[0].Description='作者修改后的瘟疫事件，保留 ``` 标记';edited.Entries[0].TriggerConsequences[1].Parameters.Delta=65;
  workshop.element('preview').value=JSON.stringify(edited);await workshop.element('preview').fire('input');await workshop.element('dlBtn').fire('click');
  const downloaded=workshop.downloads[0].data;
  assert.equal(downloaded.Entries[0].Type,'Disease');assert.equal(downloaded.Entries[0].TriggerConsequences.length,2);assert.equal(downloaded.Entries[0].TriggerConsequences[1].Parameters.Delta,65);assert.equal(downloaded.Entries[0].Description,'作者修改后的瘟疫事件，保留 ``` 标记');
  const gallery=page('gallery.js',async url=>url==='content-profile.json'?response(profile()):response([]));await settle();
  gallery.element('shareFile').files=[{name:'plague.json',size:1000,text:async()=>JSON.stringify(downloaded)}];
  await gallery.element('shareForm').fire('submit');
  assert.equal(gallery.element('shareStatus').dataset.kind,'success',gallery.element('shareStatus').textContent);
  const draft=gallery.element('shareForm').children.at(-1);
  const body=draft.children.find(el=>el.id==='draftBody')?.value||new URL(draft.children.find(el=>el.href)?.href).searchParams.get('body');
  assert.ok(!body.includes('test-key'));
  const issue={number:1,title:'【分享】瘟疫测试',body,labels:[],user:{login:'tester'},created_at:'2026-10-03T00:00:00Z',comments:0};
  gallery.context.issue=issue;
  const work=vm.runInContext('workOf(issue)',gallery.context);assert.equal(work.error,'');
  gallery.context.selectedWork=work;await vm.runInContext('openDetail(selectedWork)',gallery.context);await gallery.element('detailDownload').onclick();
  assert.deepEqual(gallery.downloads[0].data,downloaded);
  saveOutput('Events.json',downloaded);
});
test('profile failure prevents a paid gameplay request and blocks gallery download',async()=>{
  let providerCalls=0;
  const workshop=page('workshop.js',async url=>{if(url==='content-profile.json')return {ok:false,status:404};providerCalls++;return response({});});
  await workshop.element('generatorForm').fire('submit');assert.equal(providerCalls,0);assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/兼容目录/);
  const gallery=page('gallery.js',async url=>url==='content-profile.json'?{ok:false,status:404}:response([]));await settle();
  gallery.context.issue={number:2,body:'<!-- gl-asset: {"version":1,"type":"Events"} -->\n```json\n'+JSON.stringify(eventFile())+'\n```'};
  const work=vm.runInContext('workOf(issue)',gallery.context);assert.equal(work.data,null);assert.match(work.error,/兼容目录/);
});
test('name generation remains usable when gameplay profile is unavailable',async()=>{
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?{ok:false,status:404}:response({choices:[{message:{content:JSON.stringify({Items:['甲城','乙城','丙城','丁城','戊城']})}}]}));
  workshop.element('libType').value='CityNames';await workshop.element('libType').fire('change');await workshop.element('generatorForm').fire('submit');await workshop.element('dlBtn').fire('click');
  assert.deepEqual(workshop.downloads[0].data.Items,['甲城','乙城','丙城','丁城','戊城']);saveOutput('CityNames.json',workshop.downloads[0].data);
});
test('festival selected day uses the game calendar and rejects invalid day before provider call',async()=>{
  let providerCalls=0;
  const workshop=page('workshop.js',async url=>{if(url==='content-profile.json')return response(profile());providerCalls++;return response({choices:[{message:{content:JSON.stringify({Entries:[{Id:'web_festival_01',Name:'花会',Description:'分享鲜花',LinkedEventIds:['web_plague_01']}]})}}]});});
  workshop.element('libType').value='Festivals';workshop.element('ruleDay').value='42';await workshop.element('generatorForm').fire('submit');assert.equal(providerCalls,0);assert.equal(workshop.element('status').dataset.kind,'error');
  workshop.element('ruleDay').value='2';await workshop.element('generatorForm').fire('submit');await workshop.element('dlBtn').fire('click');
  assert.equal(providerCalls,1);assert.equal(workshop.downloads[0].data.Entries[0].RuleDayInYear,2);assert.deepEqual(workshop.downloads[0].data.Entries[0].LinkedEventIds,['web_plague_01']);saveOutput('Festivals.json',workshop.downloads[0].data);
});
test('new generated events with prose alone are not reported as executable',async()=>{
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):response({choices:[{message:{content:JSON.stringify({Entries:[{Id:'empty_event',Name:'瘟疫',Description:'仅故事描述'}]})}}]}));
  await workshop.element('generatorForm').fire('submit');assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/没有可执行子效果/);
  await workshop.element('dlBtn').fire('click');assert.equal(workshop.downloads.length,0);
});
test('gallery rejects incompatible protocol metadata while still accepting old narrative posts',async()=>{
  const gallery=page('gallery.js',async url=>url==='content-profile.json'?response(profile()):response([]));await settle();
  gallery.context.issue={number:3,body:'<!-- gl-asset: {"version":1,"type":"Events","schemaVersion":2} -->\n```json\n'+JSON.stringify(eventFile())+'\n```'};
  const incompatible=vm.runInContext('workOf(issue)',gallery.context);assert.equal(incompatible.data,null);assert.match(incompatible.error,/其他版本/);
  gallery.context.issue={number:4,body:'类型：Events\n```json\n'+JSON.stringify({Entries:[{Name:'旧分享',Description:'旧格式故事',Type:'LegacyHandler'}]})+'\n```'};
  const legacy=vm.runInContext('workOf(issue)',gallery.context);assert.equal(legacy.error,'');assert.equal(legacy.data.Entries[0].Type,'LegacyHandler');
});
test('published guide examples validate against the real exported game profile',()=>{
  const A=require('../assets.js');A.configureProfile(JSON.parse(read('content-profile.json')));
  const examples=[...read('docs.html').matchAll(/<pre><code>(\{[\s\S]*?)<\/code><\/pre>/g)].map(match=>JSON.parse(match[1]));
  assert.equal(examples.length,6);
  ['CityNames','Quests','Events','Festivals','Dialogues','Items'].forEach((type,index)=>assert.doesNotThrow(()=>A.validate(examples[index],type),type+' guide example'));
});
async function generateFixture(effects,{changeProfile=()=>{},target={RandomSettlement:true},options=[],triggerPhase='Daily',triggerConditions=[]}={}){
  const config=profile();changeProfile(config);
  const data={Entries:[{Id:'generation_guard',Name:'目标校验事件',Description:'检查外部效果组合',TriggerPhase:triggerPhase,TriggerConditions:triggerConditions,Target:target,TriggerConsequences:effects,Options:options}]};
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(config):response({choices:[{message:{content:JSON.stringify(data)}}]}));
  await workshop.element('generatorForm').fire('submit');return workshop;
}
test('empty nested containers do not count as executable effects in new AI events',async()=>{
  const workshop=await generateFixture([{Type:'SequenceEffect',Children:[{Type:'RandomEffect',Children:[]}]}]);
  assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/没有可执行子效果/);
});
test('new AI events reject placeholder leaves even when a real leaf is also present',async()=>{
  const workshop=await generateFixture([{Type:'SetFlagEffect',Parameters:{Flag:'Guard_Test'}},{Type:'SequenceEffect',Children:[{Type:'ShowMessageUIEffect',Parameters:{Text:'测试提示'}}]}],{changeProfile:config=>{config.effects.ShowMessageUIEffect.status='logOnly';}});
  assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/尚未实现的效果/);
});
test('generation rejects mandatory and conditional world bindings but allows safe context defaults',async()=>{
  const required=await generateFixture([{Type:'StartDialogueEffect',Parameters:{Title:'Uninstalled_Conversation'}}],{changeProfile:config=>{config.effects.StartDialogueEffect.requiresBindings=true;config.effects.StartDialogueEffect.bindingRules=[{fields:['Title']}];}});
  assert.equal(required.element('status').dataset.kind,'error');assert.match(required.element('status').textContent,/手动绑定/);
  const changeProfile=config=>{config.effects.ModifyStockEffect.bindingRules=[{fields:['StockId'],nonEmpty:true}];};
  const bound=await generateFixture([{Type:'ModifyStockEffect',Parameters:{StockId:'WorldSpecificStock'}}],{changeProfile});assert.equal(bound.element('status').dataset.kind,'error');
  const safe=await generateFixture([{Type:'ModifyStockEffect',Parameters:{StockId:''}}],{changeProfile});assert.equal(safe.element('status').dataset.kind,'success',safe.element('status').textContent);
});
test('portable generation rejects fixed targets and unbound immediate actors but permits choice actors',async()=>{
  const health={Type:'ModifyHealthEffect',Parameters:{Delta:-7,TargetMode:'RandomInSettlement',CharacterKind:'Npc',TargetCount:3}};
  const fixed=await generateFixture([health],{target:{ActorId:999,RandomSettlement:true}});assert.equal(fixed.element('status').dataset.kind,'error');assert.match(fixed.element('status').textContent,/固定角色/);
  const self={Type:'ModifyHealthEffect',Parameters:{Delta:7,TargetMode:'Self'}};
  const immediate=await generateFixture([self]);assert.equal(immediate.element('status').dataset.kind,'error');assert.match(immediate.element('status').textContent,/上下文/);
  const choice=await generateFixture([],{options:[{OptionText:'治疗自己',AutoExecute:false,Consequences:[{Type:'SequenceEffect',Children:[self]}]}]});assert.equal(choice.element('status').dataset.kind,'success',choice.element('status').textContent);
  const auto=await generateFixture([],{options:[{OptionText:'自动治疗',AutoExecute:true,Consequences:[self]}]});assert.equal(auto.element('status').dataset.kind,'error');
  const relationship={Type:'ModifyRelationshipEffect',Parameters:{Delta:5,TargetMode:'RandomInSettlement',CharacterKind:'Npc',RelationshipTarget:'Player'}};
  const playerRules=config=>{config.effects.ModifyRelationshipEffect.contextRules=[{when:{RelationshipTarget:'Player'},requiresPlayer:true}];};
  const unboundRelation=await generateFixture([relationship],{changeProfile:playerRules});assert.equal(unboundRelation.element('status').dataset.kind,'error');assert.match(unboundRelation.element('status').textContent,/玩家上下文/);
  const boundRelation=await generateFixture([],{changeProfile:playerRules,options:[{OptionText:'结交玩家',Consequences:[{...relationship,Parameters:{...relationship.Parameters,CharacterKind:'Player'}}]}]});assert.equal(boundRelation.element('status').dataset.kind,'success',boundRelation.element('status').textContent);
});
test('AI cannot invent disease resources even when the resource catalog is incomplete',async()=>{
  const missing=await generateFixture([{Type:'InfectDiseaseEffect',Parameters:{DiseaseName:'不存在的疫病',TargetMode:'RandomInSettlement',CharacterKind:'Npc'}}],{changeProfile:config=>{config.resources.diseases=[];config.resourcesComplete.diseases=false;}});
  assert.equal(missing.element('status').dataset.kind,'error');assert.match(missing.element('status').textContent,/尚未提供的游戏资源/);
  const cure=await generateFixture([{Type:'CureDiseaseEffect',Parameters:{DiseaseName:'',TargetMode:'RandomInSettlement',CharacterKind:'Npc'}}],{changeProfile:config=>{config.resources.diseases=[];config.resourcesComplete.diseases=false;}});
  assert.equal(cure.element('status').dataset.kind,'success',cure.element('status').textContent);
});
test('dynamic settlement inventory targets need no actor and unsupported NPC group effects are rejected',async()=>{
  const inventoryTypes=['ModifyGoldEffect','GiveItemEffect','RemoveItemEffect'];
  const effects=inventoryTypes.map(Type=>({Type,Parameters:{Target:'Settlement',...(Type==='ModifyGoldEffect'?{Delta:5}:{ItemId:'weapon_dagger',Qty:1})}}));
  const settlement=await generateFixture(effects,{changeProfile:config=>{for(const Type of inventoryTypes)config.effects[Type].characterRules=[{when:{Target:'Settlement'},requiresCharacter:false}];}});
  assert.equal(settlement.element('status').dataset.kind,'success',settlement.element('status').textContent);
  // Exercise the catalog guard explicitly; prestige now has a real stored-NPC bridge.
  const unsupported=await generateFixture([{Type:'ModifyPrestigeEffect',Parameters:{TargetMode:'RandomInSettlement',CharacterKind:'Npc',Delta:5}}],{changeProfile:config=>{config.effects.ModifyPrestigeEffect.supportsStoredNpc=false;}});assert.equal(unsupported.element('status').dataset.kind,'error');assert.match(unsupported.element('status').textContent,/不支持离场 NPC/);
  const players=await generateFixture([{Type:'ModifyPrestigeEffect',Parameters:{TargetMode:'AllInSettlement',CharacterKind:'Player',Delta:5}}]);assert.equal(players.element('status').dataset.kind,'success',players.element('status').textContent);
});
test('context guidance is shown only when a provider actually reports a context error',async()=>{
  for(const [message,isContext] of [['context_length_exceeded',true],['invalid model name',false]]){
    const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):{ok:false,status:400,json:async()=>({error:{message}})});
    await workshop.element('generatorForm').fire('submit');assert.equal(workshop.element('status').dataset.kind,'error');assert.equal(workshop.element('status').textContent.includes('上下文超限'),isContext);
  }
});

test('startup/branch AI response -> edited download -> GitHub draft -> gallery keeps the full new protocol',async()=>{
  const source=JSON.parse(read('tests/fixtures/startup.event.json')),calls=[];
  const workshop=page('workshop.js',async(url,options)=>{
    calls.push({url,options});
    return url==='content-profile.json'?response(profile()):response({choices:[{message:{content:JSON.stringify(source)}}]});
  });
  workshop.element('entryCount').value='3';workshop.element('triggerPhase').value='WorldStart';
  await workshop.element('generatorForm').fire('submit');
  assert.equal(workshop.element('status').dataset.kind,'success',workshop.element('status').textContent);
  assert.match(JSON.parse(calls.find(call=>call.url.startsWith('https://provider')).options.body).messages[1].content,/本次主要触发阶段：WorldStart/);
  assert.match(workshop.element('effectSummary').textContent,/新玩家创建/);assert.match(workshop.element('effectSummary').textContent,/加权只选一支/);
  const edited=JSON.parse(workshop.element('preview').value);
  edited.Entries[1].TriggerConsequences[1].Children[0].WeightedBranches[1].Weight=4;
  edited.Entries[1].TriggerConsequences[1].ElseChildren[0].Parameters.Value=5;
  workshop.element('preview').value=JSON.stringify(edited);await workshop.element('dlBtn').fire('click');
  assert.equal(workshop.downloads.length,1,workshop.element('resultStatus').textContent);
  const downloaded=workshop.downloads[0].data;
  const gallery=page('gallery.js',async url=>url==='content-profile.json'?response(profile()):response([]));await settle();
  gallery.element('shareFile').files=[{name:'startup.json',size:5000,text:async()=>JSON.stringify(downloaded)}];await gallery.element('shareForm').fire('submit');
  assert.equal(gallery.element('shareStatus').dataset.kind,'success',gallery.element('shareStatus').textContent);
  const draft=gallery.element('shareForm').children.at(-1),body=draft.children.find(el=>el.id==='draftBody')?.value||new URL(draft.children.find(el=>el.href)?.href).searchParams.get('body');
  gallery.context.issue={number:5,title:'【分享】启动分支测试',body,labels:[],user:{login:'tester'},created_at:'2026-10-03T00:00:00Z',comments:0};
  const work=vm.runInContext('workOf(issue)',gallery.context);assert.equal(work.error,'');gallery.context.selectedWork=work;
  await vm.runInContext('openDetail(selectedWork)',gallery.context);await gallery.element('detailDownload').onclick();
  assert.deepEqual(gallery.downloads[0].data,downloaded);
  assert.equal(downloaded.Entries[1].TriggerConsequences[1].Children[0].WeightedBranches[1].Weight,4);
  assert.equal(downloaded.Entries[1].TriggerConsequences[1].ElseChildren[0].Parameters.Value,5);
  saveOutput('StartupEffects.json',downloaded);
});

test('all generated branches enforce portable references and real leaves',async()=>{
  const bad={Type:'StartDialogueEffect',Parameters:{Title:'not_installed'}};
  for(const effect of [{Type:'ConditionEffect',Parameters:{Flag:'known'},Children:[{Type:'SetFlagEffect',Parameters:{Flag:'valid'}}],ElseChildren:[bad]},{Type:'WeightedRandomEffect',WeightedBranches:[{Weight:1,Children:[{Type:'SetFlagEffect',Parameters:{Flag:'valid'}}]},{Weight:0,Children:[bad]}]}]){
    const workshop=await generateFixture([effect]);assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/手动绑定/);
  }
  const empty=await generateFixture([{Type:'WeightedRandomEffect',WeightedBranches:[{Weight:1,Children:[]}]}]);assert.equal(empty.element('status').dataset.kind,'error');assert.match(empty.element('status').textContent,/没有可执行/);
  const missing=await generateFixture([{Type:'ConditionEffect',Parameters:{Conditions:[{Type:'Disease',Param:'missing'}]},Children:[{Type:'SetFlagEffect',Parameters:{Flag:'valid'}}]}],{triggerPhase:'PlayerStart'});
  assert.equal(missing.element('status').dataset.kind,'error');assert.match(missing.element('status').textContent,/目录尚未提供/);
});

test('new player context and nested settlement-selected actors support valid conditions without global character IDs',async()=>{
  const self={Type:'SetGoldEffect',Parameters:{Value:20}};
  const player=await generateFixture([self],{triggerPhase:'PlayerStart',target:{},triggerConditions:[{Type:'Health',Target:'Player',Threshold:0,Op:'Greater'}]});assert.equal(player.element('status').dataset.kind,'success',player.element('status').textContent);
  const world=await generateFixture([self],{triggerPhase:'WorldStart',target:{}});assert.equal(world.element('status').dataset.kind,'error');
  const nested=await generateFixture([{Type:'ConditionEffect',Parameters:{TargetMode:'RandomInSettlement',CharacterKind:'Npc',Conditions:[{Type:'Health',Threshold:0,Op:'Greater'}]},Children:[{Type:'ModifyHealthEffect',Parameters:{Delta:-1}}]}]);assert.equal(nested.element('status').dataset.kind,'success',nested.element('status').textContent);
  const supported=await generateFixture([{Type:'SequenceEffect',Parameters:{TargetMode:'RandomInSettlement',CharacterKind:'Npc'},Children:[{Type:'ModifyRelationshipEffect',Parameters:{RelationshipTarget:'Player'}}]}],{triggerPhase:'PlayerStart'});assert.equal(supported.element('status').dataset.kind,'success',supported.element('status').textContent);
});

test('generation rejects unavailable condition targets and prefab bindings while preserving manual edit support',async()=>{
  const base=[{Type:'SetFlagEffect',Parameters:{Flag:'valid'}}];
  for(const condition of [{Type:'Health'},{Type:'Health',Target:'SpecificId',CharacterId:123},{Type:'QuestState',Param:'uninstalled'}]){
    const workshop=await generateFixture(base,{triggerConditions:[condition]});assert.equal(workshop.element('status').dataset.kind,'error');
  }
  const prefab=await generateFixture([{Type:'SpawnInteractableEffect',Parameters:{ObjectId:'unregistered',TriggerEventId:'missing'}}]);assert.equal(prefab.element('status').dataset.kind,'error');assert.match(prefab.element('status').textContent,/联机预制体/);
  const unknown=await generateFixture([{Type:'TriggerGameEventEffect',Parameters:{EventId:'missing'}}]);assert.equal(unknown.element('status').dataset.kind,'error');assert.match(unknown.element('status').textContent,/手动绑定/);
});

test('portable world birth policies require a supplied settlement or the true random mode',async()=>{
  const contextual={Type:'SetPlayerBirthplaceEffect',Parameters:{Mode:'ContextSettlement'}};
  const missing=await generateFixture([contextual],{triggerPhase:'WorldStart',target:{}});assert.equal(missing.element('status').dataset.kind,'error');assert.match(missing.element('status').textContent,/事件城市/);
  const selected=await generateFixture([contextual],{triggerPhase:'WorldStart'});assert.equal(selected.element('status').dataset.kind,'success',selected.element('status').textContent);
  const random=await generateFixture([{Type:'SetPlayerBirthplaceEffect',Parameters:{Mode:'Random'}}],{triggerPhase:'WorldStart',target:{}});assert.equal(random.element('status').dataset.kind,'success',random.element('status').textContent);
  const fixed=await generateFixture([{Type:'SetPlayerBirthplaceEffect',Parameters:{Mode:'Hex',TargetHex:{x:1,y:1}}}],{triggerPhase:'WorldStart'});assert.equal(fixed.element('status').dataset.kind,'error');assert.match(fixed.element('status').textContent,/手动绑定/);
});

test('new generated item-price effects need no unused item tag and context-private stories need a player',async()=>{
  const price=await generateFixture([{Type:'ModifyPriceMultiplierEffect',Parameters:{ItemId:'weapon_dagger',Multiplier:1.25,DurationDays:2}}]);assert.equal(price.element('status').dataset.kind,'success',price.element('status').textContent);
  const missingTag=await generateFixture([{Type:'ModifyPriceMultiplierEffect',Parameters:{Selection:'Tag',ItemTag:'uninstalled_tag',Multiplier:1.25}}]);assert.equal(missingTag.element('status').dataset.kind,'error');
  const privateStory={Type:'ShowStoryPanelEffect',Parameters:{Recipient:'ContextPlayer',Text:'private story'}};
  const world=await generateFixture([privateStory],{triggerPhase:'WorldStart'});assert.equal(world.element('status').dataset.kind,'error');assert.match(world.element('status').textContent,/玩家上下文/);
  const player=await generateFixture([privateStory],{triggerPhase:'PlayerStart',target:{}});assert.equal(player.element('status').dataset.kind,'success',player.element('status').textContent);
  const settlement=await generateFixture([{Type:'SetGoldEffect',Parameters:{Target:'Settlement',Value:25}}]);assert.equal(settlement.element('status').dataset.kind,'success',settlement.element('status').textContent);
});

test('all 11 library types have offline templates requiring no AI credentials',async()=>{
  let paidCalls=0;
  const workshop=page('workshop.js',async url=>{if(url==='content-profile.json')return response(profile());paidCalls++;throw new Error('No paid request allowed');});
  workshop.element('apiKey').value='';
  for(const type of Object.keys(workshop.context.GLAssets.TYPES)){
    workshop.element('libType').value=type;await workshop.element('libType').fire('change');await workshop.element('templateBtn').fire('click');
    assert.equal(workshop.element('status').dataset.kind,'success',type+': '+workshop.element('status').textContent);
    const json=JSON.parse(workshop.element('preview').value);
    assert.doesNotThrow(()=>workshop.context.GLAssets.validate(json,type),type);
  }
  assert.equal(paidCalls,0);
});

test('large name pools make bounded sequential requests and preserve 250 unique names',async()=>{
  const prompts=[];let index=0;
  const workshop=page('workshop.js',async(url,options)=>{
    if(url==='content-profile.json')return response(profile());
    const body=JSON.parse(options.body),prompt=body.messages[1].content;prompts.push(prompt);
    const count=Number(prompt.match(/生成 (\d+) 个/)[1]);
    return response({choices:[{message:{content:JSON.stringify({Items:Array.from({length:count},()=>('城市'+(++index)))})}}]});
  });
  workshop.element('libType').value='CountryNames';workshop.element('nameCount').value='250';
  await workshop.element('generatorForm').fire('submit');
  assert.equal(workshop.element('status').dataset.kind,'success',workshop.element('status').textContent);
  assert.equal(prompts.length,2);assert.match(prompts[0],/生成 200 个/);assert.match(prompts[1],/生成 50 个/);assert.match(prompts[1],/不得重复/);
  await workshop.element('dlBtn').fire('click');assert.equal(workshop.downloads[0].data.Items.length,250);assert.equal(new Set(workshop.downloads[0].data.Items).size,250);
});

test('duplicate-only name responses stop after a bounded number of paid requests',async()=>{
  let calls=0;
  const workshop=page('workshop.js',async url=>{if(url==='content-profile.json')return response(profile());calls++;return response({choices:[{message:{content:'{"Items":["重复名"]}'}}]});});
  workshop.element('libType').value='CityNames';await workshop.element('generatorForm').fire('submit');
  assert.equal(calls,4);assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/停止追加付费/);
  await workshop.element('dlBtn').fire('click');assert.equal(workshop.downloads.length,0);
});

test('canceling an in-flight batch sends no following paid request',async()=>{
  let calls=0;
  const workshop=page('workshop.js',async(url,options)=>{
    if(url==='content-profile.json')return response(profile());calls++;
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Canceled')),{once:true}));
  });
  workshop.element('libType').value='CityNames';workshop.element('nameCount').value='250';
  const task=workshop.element('generatorForm').fire('submit');await settle();await workshop.element('cancelBtn').fire('click');await task;
  assert.equal(calls,1);assert.match(workshop.element('status').textContent,/已取消/);assert.equal(workshop.element('genBtn').disabled,false);
});

test('NPC dialogue modes keep their actual arrays and player answer node links',async()=>{
  for(const kind of ['Conversations','Lines','Profiles']){
    const workshop=page('workshop.js',async(url,options)=>{
      if(url==='content-profile.json')return response(profile());
      const prompt=JSON.parse(options.body).messages[1].content;assert.ok(prompt.includes('仅生成 1 个 '+kind));
      return response({choices:[{message:{content:workshop.element('preview').value}}]});
    });
    workshop.element('libType').value='Dialogues';workshop.element('dialogueKind').value=kind;
    await workshop.element('templateBtn').fire('click');await workshop.element('generatorForm').fire('submit');
    assert.equal(workshop.element('status').dataset.kind,'success',workshop.element('status').textContent);
    await workshop.element('dlBtn').fire('click');const data=workshop.downloads[0].data;
    assert.equal(data[kind].length,1);assert.equal(data.Entries,undefined);
    if(kind==='Conversations'){assert.equal(data.Conversations[0].Nodes[0].Options[0].NextNodeId,'end');assert.equal(data.Conversations[0].Nodes[1].Id,'end');}
  }
});

const pngFixture=()=>new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=','base64'));
const uploadPng=async workshop=>{
  const bytes=pngFixture(),file=new Blob([bytes],{type:'image/png'});file.name='herb.png';
  workshop.element('iconFiles').files=[file];await workshop.element('iconFiles').fire('change');
  assert.equal(workshop.element('iconList').textContent,'icons/herb.png',workshop.element('status').textContent);
};

test('item templates require actual PNG and export complete ZIP, preserving item weight',async()=>{
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):response({choices:[{message:{content:workshop.element('preview').value}}]}));
  workshop.element('libType').value='Items';await workshop.element('templateBtn').fire('click');await workshop.element('dlBtn').fire('click');
  assert.equal(workshop.packageDownloads.length,0);assert.match(workshop.element('resultStatus').textContent,/缺少图标/);
  await uploadPng(workshop);await workshop.element('templateBtn').fire('click');
  const edited=JSON.parse(workshop.element('preview').value);edited.Entries[0].Weight=4;workshop.element('preview').value=JSON.stringify(edited);
  await workshop.element('generatorForm').fire('submit');assert.equal(workshop.element('status').dataset.kind,'success',workshop.element('status').textContent);
  assert.equal(JSON.parse(workshop.element('preview').value).Entries[0].Weight,4);assert.equal(JSON.parse(workshop.element('preview').value).Entries[0].CooldownDays,undefined);
  await workshop.element('dlBtn').fire('click');assert.equal(workshop.packageDownloads.length,1);
  assert.ok(workshop.packageDownloads[0].entries.some(path=>path.endsWith('/icons/herb.png')));
  assert.match(workshop.element('shareResult').href,/format=zip/);
});

test('Mod authoring supports same-package item references without changing the game catalog',async()=>{
  const source={SchemaVersion:1,ProfileId:'crownfall1-v1',Entries:[{Id:'author.gift',Name:'草药礼物',Target:{RandomSettlement:true},TriggerConsequences:[{Type:'GiveItemEffect',Parameters:{Target:'Settlement',ItemId:'author.example_item',Qty:1}}]}]};
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):response({choices:[{message:{content:JSON.stringify(source)}}]}));
  workshop.element('libType').value='Items';await uploadPng(workshop);await workshop.element('templateBtn').fire('click');await workshop.element('addToModBtn').fire('click');
  assert.equal(workshop.element('modStatus').dataset.kind,'success',workshop.element('resultStatus').textContent);
  workshop.element('libType').value='Events';workshop.element('libName').value='礼物事件';await workshop.element('generatorForm').fire('submit');
  assert.equal(workshop.element('status').dataset.kind,'success',workshop.element('status').textContent);
  assert.equal(workshop.context.GLAssets.getProfile().resources.items.includes('author.example_item'),false);
  await workshop.element('addToModBtn').fire('click');await workshop.element('downloadModBtn').fire('click');
  assert.equal(workshop.packageDownloads.length,1,workshop.element('modStatus').textContent);
  const entries=workshop.packageDownloads[0].entries;assert.ok(entries.some(path=>path.includes('/NameLibraries/Items/')));assert.ok(entries.some(path=>path.includes('/NameLibraries/Events/')));
});

test('existing library import validates the selected type and blocks unknown fields',async()=>{
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):response({}));
  workshop.element('libType').value='CountryNames';workshop.element('apiKey').value='';
  workshop.element('libraryInput').files=[{name:'countries.json',size:50,text:async()=>'{"Items":["甲国","乙国"]}'}];await workshop.element('libraryInput').fire('change');await workshop.element('dlBtn').fire('click');assert.deepEqual(workshop.downloads[0].data.Items,['甲国','乙国']);
  workshop.element('libraryInput').files=[{name:'bad.json',size:80,text:async()=>'{"Items":["甲国"],"Scripts":["bad"]}'}];await workshop.element('libraryInput').fire('change');assert.equal(workshop.element('status').dataset.kind,'error');assert.match(workshop.element('status').textContent,/Scripts/);
});

test('a superseded PNG selection cannot corrupt the latest uploaded files',async()=>{
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):response({}));
  let release;
  const slowFile={name:'old.png',arrayBuffer:()=>new Promise(resolve=>{release=()=>resolve(pngFixture().buffer);})};
  workshop.element('iconFiles').files=[slowFile];const oldUpload=workshop.element('iconFiles').fire('change');
  await uploadPng(workshop);release();await oldUpload;
  assert.equal(workshop.element('iconList').textContent,'icons/herb.png');
  workshop.element('libType').value='Items';await workshop.element('templateBtn').fire('click');assert.equal(JSON.parse(workshop.element('preview').value).Entries[0].Icon.Path,'icons/herb.png');
});

test('Mod operations lock the basket and export a stable snapshot',async()=>{
  const workshop=page('workshop.js',async url=>url==='content-profile.json'?response(profile()):response({}));
  workshop.element('libType').value='CityNames';await workshop.element('templateBtn').fire('click');await workshop.element('addToModBtn').fire('click');
  let release;const realBuild=workshop.context.GLPackages.buildModPackage;
  workshop.context.GLPackages.buildModPackage=(...args)=>new Promise(resolve=>{release=()=>realBuild(...args).then(resolve);});
  const download=workshop.element('downloadModBtn').fire('click');
  assert.equal(workshop.element('modName').disabled,true);assert.equal(workshop.element('addToModBtn').disabled,true);
  await workshop.element('modName').fire('input');assert.equal(workshop.element('downloadModBtn').disabled,true);
  const remove=workshop.element('modLibraries').children[0].children[1];assert.equal(remove.disabled,true);await remove.fire('click');
  assert.equal(workshop.element('modLibraries').children.length,1);release();await download;
  assert.equal(workshop.packageDownloads.length,1);assert.equal(workshop.element('modName').disabled,false);
});
