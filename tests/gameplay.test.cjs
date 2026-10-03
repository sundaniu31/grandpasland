const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../assets.js');
const profile=require('../content-profile.json');
const plague=require('./fixtures/plague.event.json');
const options=require('./fixtures/options.event.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const entry=extra=>({Entries:[{Name:'测试事件',Description:'测试叙述',...extra}]});
const effect=(Type,Parameters={},Children=[])=>({Type,Parameters,Children});
const health=Parameters=>effect('ModifyHealthEffect',Parameters);
function assertContains(actual,expected,path='') {
  if(expected!==null&&typeof expected==='object')for(const key of Object.keys(expected))assertContains(actual[key],expected[key],path+'.'+key);
  else assert.deepEqual(actual,expected,path);
}
A.configureProfile(profile);

test('plague retains both gameplay effects through repeated JSON roundtrips',()=>{
  const source=clone(plague);
  // This historic protocol example is not an installed resource fixture. Add its tag only to an isolated test profile.
  A.configureProfile({...profile,resources:{...profile.resources,itemTags:[...profile.resources.itemTags,'药材']},resourcesComplete:{...profile.resourcesComplete,diseases:false}});
  try {
    let checked=A.validate(source,'Events');
    for(let i=0;i<4;i++)checked=A.validate(A.parseJSON(JSON.stringify(checked)),'Events');
    assert.equal(checked.Entries[0].TriggerConsequences.length,2);
    assert.equal(checked.Entries[0].Target.RandomSettlement,true);
    assert.equal(checked.Entries[0].Type,'Disease');
    assert.equal(checked.Entries[0].Tags,'Health, Economy');
    assert.equal(checked.Entries[0].TriggerConsequences[0].Parameters.DiseaseName,'瘟疫');
    assert.equal(checked.SchemaVersion,1);assert.equal(checked.ProfileId,profile.profileId);
    assert.deepEqual(source,plague);
  } finally {A.configureProfile(profile);}
});
test('all event, option, target and causal fields survive validation',()=>{
  const normalized=A.validate(options,'Events');
  const expected=options.Entries[0],actual=normalized.Entries[0];
  for(const key of ['Type','EventType','Repeatable','Score','Tags','RumorHint','DescriptionVariants','CausalTagModifiers','Target','Options'])assertContains(actual[key],expected[key],key);
  assert.equal(actual.TriggerConsequences[0].Children[1].Children[0].Parameters.Delta,11);
  assert.deepEqual(A.validate(A.parseJSON(JSON.stringify(normalized)),'Events'),normalized);
});
test('profile defaults preserve legacy entries and handler routing',()=>{
  const value=A.validate(entry({Type:'CustomGameplayHandler'}),'Events').Entries[0];
  assert.equal(value.Type,'CustomGameplayHandler');assert.equal(value.EventType,'Notice');assert.equal(value.Repeatable,true);assert.equal(value.Tags,'None');
  assert.deepEqual(value.TriggerConsequences,[]);assert.deepEqual(value.Options,[]);
});
test('unknown fields fail explicitly at every gameplay layer',()=>{
  const bad=[
    {Entries:[{Name:'n',Description:'d',NewReward:20}]},
    entry({Target:{Unknown:1}}),entry({TriggerConsequences:[{Type:'ModifyHealthEffect',Bad:true}]}),
    entry({TriggerConsequences:[health({NewDelta:5})]}),entry({Options:[{Invalid:true}]}),
    entry({Options:[{Conditions:[{Invalid:true}]}]}),entry({CausalTagModifiers:[{Invalid:true}]}),
    entry({Stages:[{StageName:'阶段',Description:'故事',Invalid:true}]}),
    {Entries:[{Name:'n',Description:'d'}],Meta:1}
  ];
  for(const value of bad)assert.throws(()=>A.validate(value,'Events'),/不支持的字段|不支持参数/);
});
test('unregistered CLR types, injected runtime state and integer enum values fail',()=>{
  for(const value of [entry({TriggerConsequences:[effect('System.IO.File')]}),entry({TriggerConsequences:[health({ElapsedDays:2})]}),entry({TriggerConsequences:[health({TargetMode:4})]}),entry({TriggerConsequences:[health({CharacterKind:'Hero'})]}),entry({EventType:1}),entry({Tags:33})])assert.throws(()=>A.validate(value,'Events'));
});
test('game integers reject coercion, fractional values and overflow',()=>{
  for(const Parameters of [{Delta:'7'},{Delta:0.5},{Delta:2147483648},{Delta:null},{Delta:Infinity},{Delta:NaN},{IsPercentage:'true'}])assert.throws(()=>A.validate(entry({TriggerConsequences:[health(Parameters)]}),'Events'));
  assert.throws(()=>A.validate(entry({Score:2147483648}),'Events'));
});
test('target and duration requirements align with game registry',()=>{
  for(const Parameters of [{TargetMode:'SpecificId'},{TargetMode:'SpecificId',SpecificCharId:0},{TargetMode:'RandomInSettlement',TargetCount:0},{TargetMode:'ByTag',TargetTagName:''},{RemainingDays:0},{RemainingDays:-2}])assert.throws(()=>A.validate(entry({TriggerConsequences:[health(Parameters)]}),'Events'));
  assert.equal(A.validate(entry({TriggerConsequences:[health({RemainingDays:-1})]}),'Events').Entries[0].TriggerConsequences[0].Parameters.RemainingDays,-1);
});
test('nested composition accepts only containers and bounded chance',()=>{
  for(const value of [effect('RandomEffect',{Chance:-0.1}),effect('RandomEffect',{Chance:1.1}),effect('ModifyHealthEffect',{},[health()]),effect('SequenceEffect',{},[null])])assert.throws(()=>A.validate(entry({TriggerConsequences:[value]}),'Events'));
  const value=A.validate(entry({TriggerConsequences:[effect('ConditionEffect',{Condition:'FlagSet',Flag:'known'},[health({Delta:1})])]}),'Events');
  assert.equal(value.Entries[0].TriggerConsequences[0].Children.length,1);
});
test('combination depth and total tree size are limited',()=>{
  let nested=health();for(let i=0;i<34;i++)nested=effect('SequenceEffect',{},[nested]);
  assert.throws(()=>A.validate(entry({TriggerConsequences:[nested]}),'Events'),/过深/);
  const many=effect('SequenceEffect',{},Array.from({length:1024},()=>health()));
  assert.throws(()=>A.validate(entry({TriggerConsequences:[many]}),'Events'),/1024/);
});
test('encoded parameter objects normalize without losing effects',()=>{
  const value=A.validate(entry({TriggerConsequences:[effect('ModifyHealthEffect','{"Delta":-7,"TargetMode":"Player"}')]}),'Events').Entries[0].TriggerConsequences[0];
  assert.deepEqual(value.Parameters,{Delta:-7,TargetMode:'Player'});
  for(const Parameters of ['null','[]','not-json',null,[]])assert.throws(()=>A.validate(entry({TriggerConsequences:[effect('ModifyHealthEffect',Parameters)]}),'Events'),/Parameters/);
  assert.throws(()=>A.validate(entry({TriggerConsequences:[effect('ModifyHealthEffect','{"Delta":1,"Delta":2}')]}),'Events'),/字段重复/);
});
test('option conditions and input bounds are validated',()=>{
  for(const value of [{HasInputField:true,InputMin:3,InputMax:1},{HasInputField:true,InputDefault:101},{Conditions:[{Type:'Unsupported'}]},{Conditions:[{Type:'Stat',Param:'UnsupportedStat'}]},{Conditions:[{Type:'HasTag',Param:''}]},{Conditions:[{Op:'!=',Threshold:1}]}])assert.throws(()=>A.validate(entry({Options:[value]}),'Events'));
});
test('flag combinations preserve named values and reject unknown or repeated flags',()=>{
  assert.equal(A.validate(entry({Tags:'Health,Economy'}),'Events').Entries[0].Tags,'Health, Economy');
  for(const Tags of ['Health|Economy','Health, Unknown','Health, Health','None, Health',''])assert.throws(()=>A.validate(entry({Tags}),'Events'));
});
test('schema and game profile metadata cannot silently switch compatibility',()=>{
  assert.throws(()=>A.validate({SchemaVersion:2,Items:['甲']},'CityNames'),/SchemaVersion/);
  assert.throws(()=>A.validate({ProfileId:'another-game',Items:['甲']},'CityNames'),/ProfileId/);
  assert.deepEqual(A.validate({SchemaVersion:1,ProfileId:profile.profileId,Items:['甲']},'CityNames'),{SchemaVersion:1,ProfileId:profile.profileId,Items:['甲']});
});
test('complete resource catalogs reject missing references; incomplete catalogs produce warnings',()=>{
  const configured={...profile,resources:{...profile.resources,diseases:['KnownDisease']},resourcesComplete:{...profile.resourcesComplete,diseases:true}};
  A.configureProfile(configured);
  try {
    assert.throws(()=>A.validate(entry({TriggerConsequences:[effect('InfectDiseaseEffect',{DiseaseName:'MissingDisease'})]}),'Events'),/不存在/);
    assert.throws(()=>A.validate(entry({TriggerConsequences:[effect('InfectDiseaseEffect',{})]}),'Events'),/不能为空/);
    A.configureProfile({...configured,resourcesComplete:{...configured.resourcesComplete,diseases:false}});
    const value=entry({TriggerConsequences:[effect('InfectDiseaseEffect',{DiseaseName:'UnverifiedDisease'})]});
    assert.ok(A.getValidationWarnings(value,'Events').some(text=>text.includes('目录不完整')));
    assert.ok(A.getValidationWarnings(value,'Events','en').some(text=>text.includes('incomplete')));
    assert.deepEqual(A.validate(entry({TriggerConsequences:[effect('CureDiseaseEffect',{DiseaseName:''})]}),'Events').Entries[0].TriggerConsequences[0].Parameters,{DiseaseName:''});
  } finally {A.configureProfile(profile);}
});
test('profile failure leaves names usable and blocks executable effects',()=>{
  A.configureProfile(null);
  try {
    assert.deepEqual(A.validate({Items:['甲','乙']},'CityNames'),{Items:['甲','乙']});
    assert.deepEqual(A.validate({ProfileId:profile.profileId,Items:['甲']},'CityNames'),{ProfileId:profile.profileId,Items:['甲']});
    assert.throws(()=>A.validate({ProfileId:'another-game',Items:['甲']},'CityNames'),/ProfileId/);
    const legacy=A.validate(entry({}),'Events');assert.deepEqual(A.validate(legacy,'Events'),legacy);
    assert.throws(()=>A.validate(entry({TriggerConsequences:[health()]}),'Events'),/content-profile.json/);
    assert.throws(()=>A.validate(entry({RuleType:'ByDayInYear'}),'Festivals'),/content-profile.json/);
    assert.throws(()=>A.buildGenerationPrompt({type:'Events'}),/content-profile.json/);
  } finally {A.configureProfile(profile);}
});
test('generation contract uses the exported catalog and actual calendar',()=>{
  const prompt=A.buildGenerationPrompt({type:'Events',weight:10,cooldown:0});
  assert.ok(prompt.includes('TriggerConsequences'));assert.ok(prompt.includes('Options:[]'));assert.ok(prompt.includes('InfectDiseaseEffect'));assert.ok(prompt.includes('1–'+profile.daysPerYear));assert.ok(prompt.includes('"ProfileId":"'+profile.profileId+'"'));
  assert.ok(A.describeEffects(A.validate(options,'Events').Entries[0]).includes('ModifyHealthEffect'));
  assert.ok(A.getValidationWarnings(options,'Events').some(text=>text.includes('上下文')));
});
test('large JSON and normalized libraries fail before download',()=>{
  assert.throws(()=>A.parseJSON(JSON.stringify({Items:['a'.repeat(A.MAX_FILE_BYTES)]})),/1 MB/);
  assert.throws(()=>A.validate(entry({Description:'a'.repeat(A.MAX_FILE_BYTES)}),'Events'),/1 MB/);
});
test('nested parameter objects reject unknown coordinates and fractional integers',()=>{
  for(const TargetHex of [{x:0,y:1,z:2},{x:0.5,y:1},[]])assert.throws(()=>A.validate(entry({TriggerConsequences:[effect('SpawnInteractableEffect',{TargetHex})]}),'Events'));
  assert.deepEqual(A.validate(entry({TriggerConsequences:[effect('SpawnInteractableEffect',{TargetHex:{x:2,y:3}})]}),'Events').Entries[0].TriggerConsequences[0].Parameters.TargetHex,{x:2,y:3});
});
test('unused festival day metadata and positive causal multipliers follow game rules',()=>{
  assert.equal(A.validate(entry({RuleType:'Periodic',RuleDayInYear:42}),'Festivals').Entries[0].RuleDayInYear,42);
  assert.equal(A.validate(entry({CausalTagModifiers:[{targetTag:'Health',probabilityMultiplier:0.05,durationDays:1}]}),'Events').Entries[0].CausalTagModifiers[0].probabilityMultiplier,0.05);
  assert.throws(()=>A.validate(entry({CausalTagModifiers:[{targetTag:'Health',probabilityMultiplier:0,durationDays:1}]}),'Events'),/大于 0/);
});
test('draft generation remains available without the gameplay profile',()=>{
  A.configureProfile(null);
  try {for(const type of ['Quests','SpecialNPCs'])assert.ok(A.buildGenerationPrompt({type}).includes('草稿'));}
  finally {A.configureProfile(profile);}
});
test('placeholder effects remain readable but are excluded from generation',()=>{
  const marked={...profile,effects:{...profile.effects,ShowMessageUIEffect:{...profile.effects.ShowMessageUIEffect,status:'logOnly'}}};
  A.configureProfile(marked);
  try {
    assert.ok(!A.buildGenerationPrompt({type:'Events'}).includes('"ShowMessageUIEffect":'));
    assert.ok(A.getValidationWarnings(entry({TriggerConsequences:[effect('ShowMessageUIEffect')]}),'Events').some(text=>text.includes('日志')));
  } finally {A.configureProfile(profile);}
});
test('score limits and fallback IDs match runtime content events',()=>{
  for(const Score of [-11,11])assert.throws(()=>A.validate(entry({Score}),'Events'),/Score/);
  for(const Score of [-10,10])assert.equal(A.validate(entry({Score}),'Events').Entries[0].Score,Score);
  assert.throws(()=>A.validate({Entries:[{Name:'同名',Description:'甲'},{Name:'同名',Description:'乙'}]},'Events'),/Id 重复/);
  assert.throws(()=>A.validate({Entries:[{Name:'甲',Description:'甲'},{Id:'content_甲',Name:'乙',Description:'乙'}]},'Events'),/Id 重复/);
});
test('JSON duplicate fields and excessive raw nesting are rejected before normalization',()=>{
  for(const source of ['{"Items":["甲"],"Items":["乙"]}','{"Entries":[{"Name":"甲","Name":"乙","Description":"故事"}]}','{"Entries":[{"Name":"甲","Description":"故事","TriggerConsequences":[{"Type":"ModifyHealthEffect","Parameters":{"Delta":1,"Delta":2}}]}]}'])assert.throws(()=>A.parseJSON(source),/字段重复/);
  assert.throws(()=>A.parseJSON('['.repeat(65)+'0'+']'.repeat(65)),/嵌套/);
  assert.deepEqual(A.parseJSON('{"Items":["带\\\"引号","\\\\路径","中文"]}'),{Items:['带"引号','\\路径','中文']});
});
test('effects requiring unavailable game bindings are excluded from AI and warned on manual import',()=>{
  const marked={...profile,effects:{...profile.effects,StartDialogueEffect:{...profile.effects.StartDialogueEffect,requiresBindings:true,bindingFields:['Title'],notes:'需要实际对话数据库中的标题。'}}};
  A.configureProfile(marked);
  try {
    const prompt=A.buildGenerationPrompt({type:'Events'});
    assert.ok(!prompt.includes('"StartDialogueEffect":'));
    assert.ok(prompt.includes('公共参数：'));assert.ok(prompt.includes('"TargetMode"'));assert.ok(prompt.includes('"RandomInSettlement"'));
    const data=entry({TriggerConsequences:[effect('StartDialogueEffect',{Title:'MissingConversation'})]});
    assert.equal(A.validate(data,'Events').Entries[0].TriggerConsequences[0].Parameters.Title,'MissingConversation');
    assert.ok(A.getValidationWarnings(data,'Events').some(text=>text.includes('StartDialogueEffect')&&text.includes('Title')&&text.includes('无法验证')));
    assert.ok(A.getValidationWarnings(data,'Events','en').some(text=>text.includes('bindings')&&text.includes('Title')));
  } finally {A.configureProfile(profile);}
});
test('conditional binding rules allow context variants and identify unresolved external references',()=>{
  const configured={...profile,effects:{...profile.effects,SurgeStockEffect:{...profile.effects.SurgeStockEffect,bindingRules:[{fields:['StockId'],nonEmpty:true,notes:'股票编号需要实际市场目录。'}]},ModifyHealthEffect:{...profile.effects.ModifyHealthEffect,bindingRules:[{fields:['SpecificCharId'],when:{TargetMode:'SpecificId'},minimum:1}]}}};
  A.configureProfile(configured);
  try {
    assert.deepEqual(A.getEffectBindings(effect('SurgeStockEffect')),[]);
    assert.deepEqual(A.getEffectBindings(effect('SurgeStockEffect',{StockId:''})),[]);
    assert.deepEqual(A.getEffectBindings(effect('SurgeStockEffect',{StockId:'UnverifiedStock'})),[{fields:['StockId'],notes:'股票编号需要实际市场目录。'}]);
    assert.deepEqual(A.getEffectBindings(health({TargetMode:'Player'})),[]);
    assert.deepEqual(A.getEffectBindings(health({TargetMode:'SpecificId',SpecificCharId:7})).map(binding=>binding.fields),[['SpecificCharId']]);
    const prompt=A.buildGenerationPrompt({type:'Events'});
    assert.ok(prompt.includes('"SurgeStockEffect":'));assert.ok(prompt.includes('"bindingRules"'));assert.ok(prompt.includes('nonEmpty/minimum'));
    assert.ok(A.getValidationWarnings(entry({TriggerConsequences:[effect('SurgeStockEffect',{StockId:'UnverifiedStock'})]}),'Events').some(text=>text.includes('StockId')));
  } finally {A.configureProfile(profile);}
});
test('secondary player contexts and interactive choices are distinguished in warnings',()=>{
  const configured={...profile,effects:{...profile.effects,ModifyRelationshipEffect:{...profile.effects.ModifyRelationshipEffect,contextRules:[{when:{RelationshipTarget:'Player'},requiresPlayer:true}]},RecruitFollowerEffect:{...profile.effects.RecruitFollowerEffect,contextRules:[{when:{Recruiter:'Player'},requiresPlayer:true}]}}};
  A.configureProfile(configured);
  try {
    for(const effectValue of [effect('ModifyRelationshipEffect',{RelationshipTarget:'Player',TargetMode:'RandomInSettlement',CharacterKind:'Npc'}),effect('RecruitFollowerEffect',{Recruiter:'Player',TargetMode:'RandomInSettlement',CharacterKind:'Npc'}),health({TargetMode:'Player'}),health({TargetMode:'Self'})]) {
      const immediate=entry({Target:{RandomSettlement:true},TriggerConsequences:[effectValue]});
      assert.ok(A.getValidationWarnings(immediate,'Events').some(text=>text.includes('提供实际角色或玩家')));
      const interactive=entry({Target:{RandomSettlement:true},Options:[{AutoExecute:false,Consequences:[effectValue]}]});
      assert.ok(!A.getValidationWarnings(interactive,'Events').some(text=>text.includes('提供实际角色或玩家')));
      interactive.Entries[0].Options[0].AutoExecute=true;
      assert.ok(A.getValidationWarnings(interactive,'Events').some(text=>text.includes('提供实际角色或玩家')));
    }
  } finally {A.configureProfile(profile);}
});
test('parameter-dependent character requirements and exact mandatory bindings use catalog metadata',()=>{
  const configured={...profile,effects:{...profile.effects,ModifyGoldEffect:{...profile.effects.ModifyGoldEffect,requiresCharacter:true,characterRules:[{when:{Target:'Settlement'},requiresCharacter:false}]},StartDialogueEffect:{...profile.effects.StartDialogueEffect,requiresBindings:true,bindingFields:['Title','OptionalWorldId'],requiredBindingFields:['Title']}}};
  A.configureProfile(configured);
  try {
    assert.equal(A.effectRequiresCharacter(effect('ModifyGoldEffect',{Target:'Settlement'})),false);
    assert.equal(A.effectRequiresCharacter(effect('ModifyGoldEffect',{Target:'Player'})),true);
    assert.deepEqual(A.getEffectContextRequirements(effect('ModifyGoldEffect',{Target:'Settlement'})),{requiresActor:false,requiresPlayer:false});
    assert.deepEqual(A.getEffectContextRequirements(health({TargetMode:'Player'})),{requiresActor:false,requiresPlayer:true});
    assert.deepEqual(A.getEffectBindings(effect('StartDialogueEffect',{Title:'Unverified'}))[0].fields,['Title']);
  } finally {A.configureProfile(profile);}
});
