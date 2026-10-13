const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const A=require('../assets.js');
const profile=require('../content-profile.json');
const effect=(Type,Parameters={})=>({Type,Parameters});
const library=entry=>({SchemaVersion:1,ProfileId:'crownfall1-v1',Entries:[{Id:'test.event.protocol',Name:'协议检查',Description:'',...entry}]});
A.configureProfile(profile);

test('country names have their own game limit and all name categories retain metadata',()=>{
  for(const type of A.NAME_TYPES)assert.deepEqual(A.validate({SchemaVersion:1,ProfileId:'crownfall1-v1',Items:['水车镇']},type),{SchemaVersion:1,ProfileId:'crownfall1-v1',Items:['水车镇']});
  assert.equal(A.validate({Items:['国'.repeat(100)]},'CountryNames').Items[0].length,100);
  assert.throws(()=>A.validate({Items:['国'.repeat(101)]},'CountryNames'),/100/);
  assert.equal(A.validate({Items:['名'.repeat(121)]},'CityNames').Items[0].length,121);
  assert.throws(()=>A.validate({Items:['国'],Author:'silently lost'},'CountryNames'),/Author/);
  assert.match(A.buildGenerationPrompt({type:'CountryNames'}),/SchemaVersion/);
  assert.match(A.buildGenerationPrompt({type:'CountryNames'}),/100/);
});

test('actual 10 MiB limit accepts older-valid files over the old website 1 MiB cap',()=>{
  const data=library({Description:'a'.repeat(1024*1024+200)});
  assert.equal(A.MAX_FILE_BYTES,10*1024*1024);
  assert.equal(A.validate(A.parseJSON(JSON.stringify(data)),'Events').Entries[0].Description.length,data.Entries[0].Description.length);
});

test('complete actor selection and history fields survive repeated validation',()=>{
  const data=library({IsPrivate:true,FactKind:'SocialChange',Target:{RandomSettlement:true,Selection:'MarriedInSettlement',MinPrestige:20,MinAge:18,MaxAge:80,CharacterKind:'Npc',BindSpouse:true,BindLover:true,LoverMinRelationship:-20.5},TriggerConditions:[{Type:'Relationship',Target:'Actor',RelationshipTarget:'Spouse',Threshold:20}],TriggerConsequences:[effect('ModifyHealthEffect',{Delta:2,TargetMode:'Self'})]});
  const checked=A.validate(data,'Events');
  assert.equal(checked.Entries[0].IsPrivate,true);
  assert.equal(checked.Entries[0].FactKind,'SocialChange');
  assert.deepEqual(A.validate(A.parseJSON(JSON.stringify(checked)),'Events'),checked);
  assert.ok(!A.getValidationWarnings(data,'Events').some(text=>text.includes('提供实际角色或玩家') || text.includes('BindSpouse')));
  const unbound=library({TriggerConsequences:[effect('ModifyHealthEffect',{Delta:2})]});
  assert.ok(A.getValidationWarnings(unbound,'Events').some(text=>text.includes('提供实际角色或玩家')));
});

test('actor ranges, relationship thresholds and unknown binding fields fail before export',()=>{
  for(const Target of [{Selection:'AdultInSettlement',MinAge:17},{Selection:'AdultInSettlement',MinAge:30,MaxAge:20},{MinPrestige:-1},{LoverMinRelationship:101},{LoverMinRelationship:'20'},{CharacterKind:'NPC'},{SpouseId:2}])assert.throws(()=>A.validate(library({Target}),'Events'));
  for(const condition of [{Type:'Relationship',RelationshipTarget:'SpecificId'},{Type:'Relationship',RelationshipTarget:'SpecificId',RelationshipCharacterId:0},{Type:'Relationship',RelationshipTarget:'Lover',RelationshipCharacterId:1.5},{Type:'Relationship',RelationshipTarget:'missing'}])assert.throws(()=>A.validate(library({TriggerConditions:[condition]}),'Events'));
});

test('relationship conditions check both player and fixed-character requirements',()=>{
  const condition={Type:'Relationship',Target:'Actor',RelationshipTarget:'Player',Threshold:10};
  assert.equal(A.getConditionRequirements(condition).requiresActor,true);
  assert.equal(A.getConditionRequirements(condition).requiresPlayer,true);
  assert.equal(A.getConditionRequirements({...condition,RelationshipTarget:'SpecificId'}).requiresBinding,true);
  const checked=A.validate(library({Target:{RandomSettlement:true,Selection:'AdultInSettlement'},TriggerConditions:[condition]}),'Events');
  assert.equal(checked.Entries[0].TriggerConditions[0].RelationshipTarget,'Player');
  assert.match(A.describeCondition(checked.Entries[0].TriggerConditions[0]),/与 玩家/);
  assert.ok(A.getValidationWarnings(checked,'Events').some(text=>text.includes('提供实际角色或玩家')));
  assert.throws(()=>A.validate(library({Options:[{OptionText:'请选择',Conditions:[condition]}]}),'Events'),/不支持/);
});

test('family requirement metadata follows actual effect context roles and marriage fallback',()=>{
  assert.equal(A.getEffectContextRequirements(effect('ModifyHealthEffect',{TargetMode:'Spouse'})).requiresSpouse,true);
  assert.equal(A.getEffectContextRequirements(effect('ModifyRelationshipEffect',{RelationshipTarget:'Lover'})).requiresLover,true);
  assert.equal(A.getEffectContextRequirements(effect('DivorceEffect')).requiresSpouse,true);
  assert.equal(A.getEffectContextRequirements(effect('StartAffairEffect')).requiresLover,true);
  assert.equal(A.getEffectContextRequirements(effect('MarryEffect')).requiresPartner,true);
  assert.equal(A.getEffectContextRequirements(effect('MarryEffect',{SpouseId:1})).requiresPartner,undefined);
  assert.equal(A.getEffectContextRequirements(effect('DiscoverAffairEffect',{Discoverer:'Player'})).requiresPlayer,true);
  assert.equal(A.getEffectContextRequirements(effect('SetTimeEffect',{TargetMode:'Spouse'})).requiresSpouse,undefined);
  const data=library({Target:{Selection:'AffairInSettlement',RandomSettlement:true},TriggerConditions:[{Type:'Relationship',RelationshipTarget:'Spouse'}],TriggerConsequences:[effect('ModifyRelationshipEffect',{RelationshipTarget:'Lover'})]});
  assert.ok(!A.getValidationWarnings(data,'Events').some(text=>text.includes('BindSpouse/BindLover')));
});

test('AI guard requires declared family bindings without guessing whether a candidate is married',()=>{
  const source=fs.readFileSync(require.resolve('../workshop.js'),'utf8');
  const start=source.indexOf('function checkGeneratedGameplay('),end=source.indexOf('\nfunction setResult(',start);
  assert.ok(start>=0&&end>start);
  const context={A,modLibraries:[],hasResource:(kind,id)=>A.hasKnownResource(kind,id),t:zh=>zh};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  const run=entry=>context.checkGeneratedGameplay(A.validate(library(entry),'Events'),'Events');
  const Target={Selection:'AdultInSettlement',CharacterKind:'Npc',RandomSettlement:true};
  assert.throws(()=>run({Target,TriggerConsequences:[effect('ModifyHealthEffect',{TargetMode:'Spouse',Delta:2})]}),/BindSpouse/);
  assert.throws(()=>run({Target:{...Target,Selection:'MarriedInSettlement'},TriggerConsequences:[effect('DivorceEffect')]}),/BindSpouse/);
  assert.doesNotThrow(()=>run({Target:{...Target,BindSpouse:true},TriggerConsequences:[effect('DivorceEffect')]}));
  assert.doesNotThrow(()=>run({Target:{...Target,BindLover:true},TriggerConsequences:[effect('MarryEffect')]}));
  assert.throws(()=>run({Target,TriggerConditions:[{Type:'Relationship',RelationshipTarget:'Lover'}],TriggerConsequences:[effect('ModifyHealthEffect',{Delta:2})]}),/BindLover/);
  assert.doesNotThrow(()=>run({Target:{...Target,Selection:'AffairInSettlement'},TriggerConditions:[{Type:'Relationship',RelationshipTarget:'Spouse'}],TriggerConsequences:[effect('ModifyRelationshipEffect',{RelationshipTarget:'Lover'})]}));
  assert.throws(()=>run({Target,Options:[{OptionText:'对伴侣说明',AutoExecute:false,Consequences:[effect('ModifyHealthEffect',{TargetMode:'Spouse',Delta:2})]}]}),/BindSpouse/);
  assert.doesNotThrow(()=>run({Target:{...Target,BindSpouse:true},Options:[{OptionText:'对伴侣说明',AutoExecute:false,Consequences:[effect('ModifyHealthEffect',{TargetMode:'Spouse',Delta:2})]}]}));
});

test('registered parameter rules, constructor defaults, comparisons and supported modes are checked',()=>{
  for(const value of [effect('FollowTargetEffect'),effect('FollowTargetEffect',{Mode:'Formation',TargetCharacterId:1}),effect('ModifyRelationshipEffect',{RelationshipTarget:'SpecificId'}),effect('DiscoverAffairEffect',{Discoverer:'SpecificId'}),effect('MoveCharacterEffect',{DestType:'Hex',DestValue:'abc'}),effect('MoveCharacterEffect',{DestType:'FollowChar',DestValue:'2147483648'}),effect('ShowStoryPanelEffect'),effect('RemoveEffectEffect'),effect('SurgeStockEffect',{SurgeMin:0.8,SurgeMax:0.2}),effect('ModifyStatEffect',{IsPermanent:false,TargetStat:'Health'})])assert.throws(()=>A.validateEffects([value]),value.Type);
  assert.doesNotThrow(()=>A.validateEffects([effect('MoveCharacterEffect',{DestType:'Hex',DestValue:'1,2'})]));
  assert.doesNotThrow(()=>A.validateEffects([effect('ShowStoryPanelEffect',{Text:'这是故事。'})]));
  const max=profile.calendar.maximumAbsoluteDay;
  assert.throws(()=>A.validateEffects([effect('SetTimeEffect',{Year:Math.floor(max/profile.daysPerYear)+1,DayOfYear:profile.daysPerYear})]),/绝对天数/);
});

test('incomplete disease catalog permits documented bundled references with a runtime warning',()=>{
  const configured=JSON.parse(JSON.stringify(profile));configured.resources.diseases=[];configured.resourcesComplete.diseases=false;
  A.configureProfile(configured);
  try {
    for(const name of ['感冒','痢疾','风寒','食物中毒','瘟疫'])assert.ok(A.hasKnownResource('diseases',name));
    const data=library({Target:{RandomSettlement:true},TriggerConsequences:[effect('InfectDiseaseEffect',{TargetMode:'RandomInSettlement',CharacterKind:'Npc',DiseaseName:'瘟疫'})]});
    assert.doesNotThrow(()=>A.validate(data,'Events'));
    assert.ok(A.getValidationWarnings(data,'Events').some(text=>text.includes('diseases') && text.includes('不完整')));
    assert.equal(A.getProfile().resourcesComplete.diseases,false);
    assert.equal(A.hasKnownResource('diseases','虚构疾病'),false);
    assert.match(A.buildGenerationPrompt({type:'Events'}),/感冒.*痢疾.*风寒.*食物中毒.*瘟疫/);
  }finally{A.configureProfile(profile);}
});

test('item-package local dependencies expand one graph without weakening other imports',()=>{
  const configured=JSON.parse(JSON.stringify(profile));configured.resources.items=[];configured.resources.itemTags=[];configured.resourcesComplete.items=true;configured.resourcesComplete.itemTags=true;
  A.configureProfile(configured);
  try {
    const graph=[effect('GiveItemEffect',{ItemId:'test.new_herb',Qty:1})];
    assert.throws(()=>A.validateEffects(graph),/不存在/);
    assert.doesNotThrow(()=>A.validateEffects(graph,'UseEffects',{items:['test.new_herb'],itemTags:['草药']}));
    assert.throws(()=>A.validateEffects(graph),/不存在/);
    assert.deepEqual(A.getProfile().resources.items,[]);
    assert.doesNotThrow(()=>A.validateEffects([effect('ModifyPriceMultiplierEffect',{Selection:'Tag',ItemTag:'草药',Multiplier:1.2})],'UseEffects',{itemTags:['草药']}));
  }finally{A.configureProfile(profile);}
});

test('AI prompts keep conditional rules, history fields and actor selection without sending raw catalog',()=>{
  const prompt=A.buildGenerationPrompt({type:'Events'});
  assert.ok(prompt.length<65000,'compact prompt should remain substantially smaller than the exported catalog');
  for(const text of ['RelationshipCharacterId','BindSpouse','ActorSelection','IsPrivate','FactKind','parameterRules','requiredAnyOf','fieldComparisons'])assert.ok(prompt.includes(text),text);
  assert.ok(!prompt.includes('Target 只支持 ActorId'));
  const festivals=A.buildGenerationPrompt({type:'Festivals'});
  assert.ok(festivals.length<2500);
  assert.match(festivals,/LinkedEventIds/);
  assert.ok(!festivals.includes('效果目录：'));
});

test('same-package resource scope survives event condition, option, effect and warning revalidation',()=>{
  const resources={items:['designer.package.herb'],commodities:['designer.package.herb'],itemTags:['designerHerb']};
  const data=library({TriggerPhase:'PlayerStart',TriggerConditions:[{Type:'HasItem',Target:'Player',Param:'designer.package.herb'}],TriggerConsequences:[effect('GiveItemEffect',{ItemId:'designer.package.herb',Qty:1})],Options:[{OptionText:'草药',AutoExecute:true,Conditions:[{Type:'HasItem',Param:'designer.package.herb'}],Consequences:[effect('ModifyPriceMultiplierEffect',{Selection:'Tag',ItemTag:'designerHerb',Multiplier:1.1})]}]});
  assert.throws(()=>A.validate(data,'Events'),/不存在/);
  const clean=A.validate(data,'Events',resources);
  assert.doesNotThrow(()=>A.getValidationWarnings(clean,'Events','zh-CN',resources));
  assert.throws(()=>A.getValidationWarnings(clean,'Events'),/不存在/);
  const prompt=A.buildGenerationPrompt({type:'Events',packageResources:resources});
  assert.match(prompt,/designer.package.herb/);assert.match(prompt,/designerHerb/);
  assert.equal(A.hasKnownResource('items','designer.package.herb'),false);
  assert.equal(A.hasKnownResource('items','designer.package.herb',resources),true);
});

test('weight zero stays accepted with its actual runtime warning and draft quest limits are explicit',()=>{
  const data=library({Weight:0});
  assert.equal(A.validate(data,'Events').Entries[0].Weight,0);
  assert.ok(A.getValidationWarnings(data,'Events').some(text=>text.includes('不会停用')));
  assert.throws(()=>A.validate(library({Name:'名'.repeat(101)}),'Quests'),/100/);
  assert.throws(()=>A.validate(library({Stages:[{StageName:'同名'},{StageName:'同名'}]}),'Quests'),/不能重复/);
  assert.doesNotThrow(()=>A.validate(library({Description:'',Stages:[{StageName:'开始',Description:''}]}),'Quests'));
});
