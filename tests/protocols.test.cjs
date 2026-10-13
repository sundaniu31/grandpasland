const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const A=require('../assets.js');
const P=require('../library-protocols.js');
const profile=require('../content-profile.json');
A.configureProfile(profile);
const copy=value=>JSON.parse(JSON.stringify(value));
const dialogue=()=>({SchemaVersion:1,ProfileId:'crownfall1-v1',Conversations:[{Id:'designer.test.greeting',StartNodeId:'hello',Nodes:[
  {Id:'hello',Text:{Text:'你好，{player}。'},Options:[{Id:'bye',Text:{Text:'再见。'},NextNodeId:'end'}]},
  {Id:'end',Text:{Translations:{'zh-Hans':'一路顺风。',en:'Safe travels.'}}}
]}]});
const item=()=>({SchemaVersion:1,ProfileId:'crownfall1-v1',Entries:[{Id:'designer.test.herb',Name:'草药',Tags:['药材'],Icon:{Path:'icons/herb.png'}}]});
function checkedDialogues(value=dialogue(),assets=A) {return P.validate(value,'Dialogues',assets);}
function checkedItems(value=item(),assets=A) {return P.validate(value,'Items',assets);}
test('dialogue root and text defaults match actual DTO',()=>{
  const clean=checkedDialogues();
  assert.equal(P.count(clean,'Dialogues'),1);
  assert.equal(clean.Conversations[0].Default,true);
  assert.equal(clean.Conversations[0].Priority,10);
  assert.deepEqual(clean.Lines,[]);assert.deepEqual(clean.Profiles,[]);
  assert.equal(clean.Conversations[0].Nodes[0].Speaker,'npc');
  assert.equal(clean.Conversations[0].Nodes[0].Text.Table,'AGame_NPC');
  assert.deepEqual(clean.Conversations[0].Match,{NpcIds:[],PlayerIds:[],NpcTags:[],PlayerTags:[],Tone:'',Conditions:[]});
});
test('plain dialogues work without a game effect profile',()=>{
  assert.equal(checkedDialogues(dialogue(),{getProfile:()=>null}).Conversations.length,1);
});
test('dialogue metadata is explicitly required and case sensitive',()=>{
  for (const change of [value=>delete value.SchemaVersion,value=>delete value.ProfileId,value=>value.SchemaVersion=2,value=>value.ProfileId='crownfall1-items-v1',value=>value.schemaVersion=1]) {
    const value=dialogue();change(value);assert.throws(()=>checkedDialogues(value));
  }
});
test('dialogue roots and nested fields reject execution fields and nulls',()=>{
  const cases=[value=>value.Entries=[],value=>value.Conversations[0].UseEffects=[],value=>value.Conversations[0].Nodes[0].Options[0].Consequences=[],value=>value.Conversations=null,value=>value.Conversations[0].Nodes.push(null),value=>value.Conversations[0].Match={ActorId:1},value=>value.Conversations[0].Nodes[0].Text='plain text'];
  for (const change of cases) {const value=dialogue();change(value);assert.throws(()=>checkedDialogues(value));}
});
test('dialogue jumps and mutually exclusive automatic/choice transitions are validated',()=>{
  for (const change of [value=>value.Conversations[0].StartNodeId='missing',value=>value.Conversations[0].Nodes[0].Options[0].NextNodeId='missing',value=>value.Conversations[0].Nodes[0].NextNodeId='end',value=>value.Conversations[0].Nodes[1].Speaker='NPC']) {
    const value=dialogue();change(value);assert.throws(()=>checkedDialogues(value));
  }
});
test('dialogue IDs have correct uniqueness scopes and retain original spelling',()=>{
  const value=dialogue();value.Lines=[{Id:'designer.test.greeting',Text:{Text:'台词'}}];
  assert.equal(checkedDialogues(value).Lines.length,1);
  value.Conversations[0].Nodes[1].Id='hello';assert.throws(()=>checkedDialogues(value),/重复/);
  const options=dialogue();options.Conversations[0].Nodes[0].Options.push({Id:'bye',Text:{Text:'再见'}});assert.throws(()=>checkedDialogues(options),/重复/);
  const spaces=dialogue();spaces.Conversations[0].Nodes[0].Id=' hello ';spaces.Conversations[0].StartNodeId=' hello ';
  assert.equal(checkedDialogues(spaces).Conversations[0].StartNodeId,' hello ');
});
test('dialogue text accepts translations and localization keys with valid table',()=>{
  const value=dialogue();value.Conversations[0].Nodes[0].Text={TextKey:'Known_key'};
  assert.equal(checkedDialogues(value).Conversations[0].Nodes[0].Text.TextKey,'Known_key');
  value.Conversations[0].Nodes[0].Text.Table=' ';assert.throws(()=>checkedDialogues(value),/Table/);
});
test('text, translations, language codes and ID UTF-16 limits agree with game',()=>{
  for (const textValue of [{Text:'x'.repeat(4001)},{Translations:{en:'x'.repeat(4001)}},{Translations:{['x'.repeat(33)]:'valid'}},{Translations:{en:null}},{}]) {
    const value=dialogue();value.Conversations[0].Nodes[0].Text=textValue;assert.throws(()=>checkedDialogues(value));
  }
  const value=dialogue();value.Conversations[0].Id='x'.repeat(129);assert.throws(()=>checkedDialogues(value));
});
test('dynamic translation keys do not change JavaScript prototypes',()=>{
  const value=dialogue();value.Conversations[0].Nodes[0].Text=JSON.parse('{"Translations":{"__proto__":"文字"}}');
  const translations=checkedDialogues(value).Conversations[0].Nodes[0].Text.Translations;
  assert.equal(Object.getPrototypeOf(translations),Object.prototype);
  assert.equal(Object.hasOwn(translations,'__proto__'),true);
});
test('dialogue conditions use nine OptionCondition types, not full event conditions',()=>{
  const value=dialogue();value.Conversations[0].Match={Conditions:[{Type:'Stat',Param:'Charm',Threshold:5,Op:'Greater'}]};
  assert.equal(checkedDialogues(value).Conversations[0].Match.Conditions[0].Param,'Charm');
  for (const condition of [{Type:'Year'},{Type:'Stat',Param:'Attack',Target:'Actor'},{Type:'Stat',Param:'Wisdom'},{Type:'HasItem',Param:''},{Type:0},{Threshold:0.5},{Op:'EqualTo'}]) {
    value.Conversations[0].Match={Conditions:[condition]};assert.throws(()=>checkedDialogues(value));
  }
});
test('dialogue integer and matching fields use exact game constraints',()=>{
  for (const Match of [{NpcIds:[0]},{PlayerIds:[-1]},{NpcIds:['1']},{NpcTags:['']},{Tone:'happy'},{Tone:'Warm'}]) {
    const value=dialogue();value.Conversations[0].Match=Match;assert.throws(()=>checkedDialogues(value));
  }
  const value=dialogue();value.Conversations[0].Priority=-2147483648;assert.equal(checkedDialogues(value).Conversations[0].Priority,-2147483648);
  value.Conversations[0].Priority=2147483648;assert.throws(()=>checkedDialogues(value));
});
test('node count, option count, profile knowledge and combined root budgets are enforced',()=>{
  const empty=dialogue();empty.Conversations[0].Nodes=[];assert.throws(()=>checkedDialogues(empty));
  const many=dialogue();many.Conversations[0].Nodes[0].Options=Array.from({length:17},(_,i)=>({Id:'answer'+i,Text:{Text:'回答'}}));assert.throws(()=>checkedDialogues(many));
  const persona={SchemaVersion:1,ProfileId:'crownfall1-v1',Profiles:[{Id:'persona',Persona:'x'.repeat(8001)}]};assert.throws(()=>checkedDialogues(persona));
  persona.Profiles[0]={Id:'persona',Knowledge:Array(129).fill('知识')};assert.throws(()=>checkedDialogues(persona));
  const sum={SchemaVersion:1,ProfileId:'crownfall1-v1',Lines:Array.from({length:5000},(_,i)=>({Id:'line'+i,Text:{Text:'台词'}})),Profiles:[{Id:'profile'}]};assert.throws(()=>checkedDialogues(sum),/合计/);
});
test('empty dialogue arrays retain engine compatibility and produce an explicit warning',()=>{
  const value={SchemaVersion:1,ProfileId:'crownfall1-v1',Lines:[]};
  assert.equal(P.count(checkedDialogues(value),'Dialogues'),0);
  assert.ok(P.getValidationWarnings(value,'Dialogues',A).some(warning=>warning.includes('没有内容')));
});
test('dialogue dependency and AI warnings do not invent execution or require profiles',()=>{
  const value=dialogue();value.Conversations[0].Nodes[0].Options[0].EventId='external.event';
  value.Conversations[0].Match={Conditions:[{Type:'HasItem',Param:'missing_item'}]};
  value.Profiles=[{Id:'resident',Persona:'描述'}];
  const warnings=P.getValidationWarnings(value,'Dialogues',A,'en').join('\n');
  assert.match(warnings,/EventId/);assert.match(warnings,/API key/);assert.match(warnings,/missing_item/);
});
test('public chatter warns about missing player matches and unconsumed scenes',()=>{
  const value={SchemaVersion:1,ProfileId:'crownfall1-v1',Lines:[{Id:'line',Scene:'tavern',Match:{PlayerTags:['tag']},Text:{Text:'你好{player}'}},{Id:'unknown',Scene:'invented_scene',Text:{Text:'台词'}}]};
  const warnings=P.getValidationWarnings(value,'Dialogues',A).join('\n');
  assert.match(warnings,/公共闲聊/);assert.match(warnings,/invented_scene/);
});
test('items need actual game profile and positive nonempty Entries',()=>{
  assert.throws(()=>checkedItems(item(),{getProfile:()=>null}),/content-profile/);
  assert.throws(()=>checkedItems({Entries:[]}),/Entries/);
});
test('item author defaults match importer and add explicit metadata',()=>{
  const clean=checkedItems({Entries:item().Entries}).Entries[0];
  assert.equal(clean.Category,'Material');assert.equal(clean.BaseValue,100);assert.equal(clean.Weight,1);
  assert.equal(clean.MaximumStack,100);assert.equal(clean.Icon.PixelsPerUnit,100);
  assert.deepEqual(clean.UseEffects,[]);assert.deepEqual(clean.Sources,[]);
  assert.equal(checkedItems({Entries:item().Entries}).ProfileId,'crownfall1-v1');
});
test('external Equipment and snapshot payloads are rejected',()=>{
  const value=item();value.Entries[0].Category='Equipment';assert.throws(()=>checkedItems(value),/Category/);
  assert.throws(()=>checkedItems({SchemaVersion:1,ProfileId:'crownfall1-items-v1',Entries:item().Entries,Icons:[]}));
});
test('item ID namespace syntax and duplicates are enforced',()=>{
  for (const Id of ['.hidden','two..dots','带中文','has space','x'.repeat(81)]) {
    const value=item();value.Entries[0].Id=Id;assert.throws(()=>checkedItems(value),/Id/);
  }
  const value=item();value.Entries.push(copy(value.Entries[0]));assert.throws(()=>checkedItems(value),/重复/);
});
test('item numeric ranges and perishability match game',()=>{
  for (const patch of [{Weight:0.5},{BaseValue:-1},{MaximumStack:0},{Weight:1000001},{BaseValue:100000001},{ShelfLifeDays:-1},{Perishable:true,ShelfLifeDays:0},{Name:'x'.repeat(121)},{Tags:Array(65).fill('tag')}]) {
    const value=item();Object.assign(value.Entries[0],patch);assert.throws(()=>checkedItems(value));
  }
  const value=item();Object.assign(value.Entries[0],{Perishable:true,ShelfLifeDays:1});assert.equal(checkedItems(value).Entries[0].ShelfLifeDays,1);
});
test('item icon paths reject absolute paths, traversal, wrong formats and empty segments',()=>{
  for (const Path of ['D:/a.png','/a.png','../a.png','icons/../a.png','icons\\a.png','icons//a.png','icons/./a.png','a.jpg','',':a.png']) {
    const value=item();value.Entries[0].Icon.Path=Path;assert.throws(()=>checkedItems(value),/Path/);
  }
  const value=item();value.Entries[0].Icon.Path='icons/herb.PNG';assert.equal(checkedItems(value).Entries[0].Icon.Path,'icons/herb.PNG');
});
test('item icon cannot be hash-only and hashes/rectangles are constrained',()=>{
  for (const Icon of [{Hash:'a'.repeat(64)},{Path:'a.png',Hash:'A'.repeat(64)},{Path:'a.png',PixelsPerUnit:Infinity},{Path:'a.png',X:1},{Path:'a.png',Width:16},{Path:'a.png',Width:2049,Height:1},{Path:'a.png',X:2040,Width:16,Height:16}]) {
    const value=item();value.Entries[0].Icon=Icon;assert.throws(()=>checkedItems(value));
  }
});
test('item acquisition validates enum, stock and production while retaining descriptive types',()=>{
  for (const source of [{Type:'Production',DailyRate:0,MaxStock:10},{Type:'Production',DailyRate:1,MaxStock:0},{Type:'Trade',MaxStock:5,InitialStock:6},{Type:'drop'},{SettlementId:'x'.repeat(121)}]) {
    const value=item();value.Entries[0].Sources=[source];assert.throws(()=>checkedItems(value));
  }
  const value=item();value.Entries[0].Sources=[{Type:'EventReward',EventId:'actual.event'}];
  assert.match(P.getValidationWarnings(value,'Items',A).join('\n'),/仅记录来源说明/);
});
test('item effects are shared with the game-registered graph validator',()=>{
  const value=item();value.Entries[0].Category='Consumable';value.Entries[0].UseEffects=[{Type:'ModifyHealthEffect',Parameters:{Delta:3,TargetMode:'Self'}}];
  assert.equal(checkedItems(value).Entries[0].UseEffects[0].Type,'ModifyHealthEffect');
  value.Entries[0].UseEffects[0].Parameters.Invented=true;assert.throws(()=>checkedItems(value),/Invented/);
  value.Entries[0].UseEffects=[{Type:'invented'}];assert.throws(()=>checkedItems(value),/未注册/);
});
test('non-consumable items cannot configure active use effects',()=>{
  const value=item();value.Entries[0].UseEffects=[{Type:'ModifyHealthEffect',Parameters:{Delta:3}}];assert.throws(()=>checkedItems(value),/Consumable/);
});
test('same-package item IDs and tags can be referenced without polluting global catalog',()=>{
  const value=item();value.Entries.push({...copy(value.Entries[0]),Id:'designer.test.potion',Category:'Consumable',UseEffects:[{Type:'GiveItemEffect',Parameters:{ItemId:'designer.test.herb',Qty:1}}]});
  const before=JSON.stringify(A.getProfile());
  assert.equal(checkedItems(value).Entries[1].UseEffects[0].Parameters.ItemId,'designer.test.herb');
  assert.equal(JSON.stringify(A.getProfile()),before);
});
test('JSON-only item warning clearly requires real PNG assets',()=>{
  const warnings=P.getValidationWarnings(item(),'Items',A).join('\n');
  assert.match(warnings,/真实 PNG/);assert.match(warnings,/32 MiB/);
});
test('cross-library Mod item references survive validation and warning revalidation with explicit scope',()=>{
  const value=item();value.Entries[0].Category='Consumable';value.Entries[0].UseEffects=[{Type:'GiveItemEffect',Parameters:{ItemId:'designer.other.herb',Qty:1}}];
  const resources={items:['designer.other.herb'],commodities:['designer.other.herb'],itemTags:['跨库药材']};
  assert.throws(()=>checkedItems(value),/不存在/);
  assert.equal(P.validate(value,'Items',A,resources).Entries[0].UseEffects[0].Parameters.ItemId,'designer.other.herb');
  const scopedAssets={...A,getProfile:()=>({...A.getProfile(),resourcesComplete:{...A.getProfile().resourcesComplete,items:false}})};
  assert.ok(!P.getValidationWarnings(value,'Items',scopedAssets,'en',resources).some(warning=>warning.includes('items catalog is incomplete')));
});
test('item generation prompt uses compact descriptors and known same-Mod resources',()=>{
  const prompt=P.buildGenerationPrompt({type:'Items',packageResources:{items:['designer.other.herb'],commodities:['designer.other.herb'],itemTags:['跨库药材']}},A);
  assert.match(prompt,/公共参数/);assert.match(prompt,/designer.other.herb/);assert.match(prompt,/瘟疫/);
  assert.ok(prompt.length<60000,'Inherited parameter descriptor duplication should stay bounded');
});
test('package adds commodity IDs and rarity quality tags like Unity AddReferences',()=>{
  const value=item();value.Entries[0].Category='Consumable';value.Entries[0].Rarity='Legendary';
  value.Entries[0].UseEffects=[{Type:'ModifyDemandEffect',Parameters:{ItemId:'designer.test.herb',Delta:1}},{Type:'ModifyPriceMultiplierEffect',Parameters:{Selection:'Tag',ItemTag:'传说',Multiplier:1.2}}];
  assert.equal(checkedItems(value).Entries[0].UseEffects.length,2);
});
test('dialogue AI prompt matches selected kind, count and actual accepted template',()=>{
  for (const dialogueKind of ['Lines','Conversations','Profiles']) {
    const prompt=P.buildGenerationPrompt({type:'Dialogues',count:3,dialogueKind,dialogueScene:'tavern'},A);
    assert.match(prompt,new RegExp('3 个 '+dialogueKind));assert.match(prompt,/zh-Hans/);assert.doesNotMatch(prompt,/\{"Entries":/);
    const example=JSON.parse(prompt.slice(prompt.indexOf('单条结构示例（数量按本次要求）：')+'单条结构示例（数量按本次要求）：'.length));
    checkedDialogues(example);
    assert.equal(example[dialogueKind].length,1);
    assert.equal(example[['Lines','Conversations','Profiles'].find(kind=>kind!==dialogueKind)].length,0);
  }
});
test('item prompt uses uploaded PNG paths and refuses to promise unsupported equipment',()=>{
  const prompt=P.buildGenerationPrompt({type:'Items',count:2,iconPaths:['icons/actual.png']},A);
  assert.match(prompt,/2 个 Entries/);assert.match(prompt,/只能使用这些实际上传/);assert.match(prompt,/Equipment/);
  const exampleText=prompt.split('单条结构示例（数量按本次要求）：')[1].split('\n')[0],example=JSON.parse(exampleText);
  assert.equal(checkedItems(example).Entries[0].Icon.Path,'icons/actual.png');
  assert.match(P.buildGenerationPrompt({type:'Items'},A),/待补路径/);
});
test('protocol summaries and counts handle all three dialogue collections and item entries',()=>{
  assert.equal(P.count({Lines:[{},{}],Conversations:[{}],Profiles:[{}]},'Dialogues'),4);
  assert.equal(P.count(item(),'Items'),1);
  assert.match(P.summary(dialogue(),'Dialogues'),/1 个会话/);
  assert.match(P.describeEffects(dialogue(),'Dialogues','en'),/EventId/);
  assert.match(P.describeTrigger(item(),'Items','en'),/trade/);
});
test('Unity-authored three current world preset dialogues match the website contract when present',t=>{
  const base='A:/Unity/Crownfall1/Assets/AGame/Resources/WorldPresets';
  if (!fs.existsSync(base)) {t.skip('Local Unity source not present');return;}
  const files=[];
  function scan(folder) {for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const full=path.join(folder,entry.name);if (entry.isDirectory()) scan(full);
    else if (/dialogues\.json$/i.test(entry.name)) files.push(full);
  }}
  scan(base);assert.ok(files.length>=3);
  for (const file of files) {const source=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));const clean=checkedDialogues(source);assert.equal(P.count(clean,'Dialogues'),P.count(source,'Dialogues'));}
});
