const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../assets.js');
const profile=require('../content-profile.json');
const fixture=require('./fixtures/startup.event.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const effect=(Type,Parameters={})=>({Type,Parameters});
const flag=()=>effect('SetFlagEffect',{Flag:'branch_check'});
const file=extra=>({Entries:[{Name:'分支回归',Description:'仅测试外部协议',...extra}]});
const weighted=branches=>({Type:'WeightedRandomEffect',WeightedBranches:branches});
A.configureProfile(profile);

test('startup phases, event conditions and every branch survive repeated download validation',()=>{
  const source=clone(fixture), normalized=A.validate(source,'Events');
  let actual=normalized;
  for(let i=0;i<4;i++)actual=A.validate(A.parseJSON(JSON.stringify(actual)),'Events');
  assert.deepEqual(actual,normalized);assert.deepEqual(source,fixture);
  const player=actual.Entries[1];
  assert.equal(player.TriggerPhase,'PlayerStart');
  const conditional=player.TriggerConsequences[1];
  assert.equal(conditional.Parameters.Conditions[0].Target,'Actor');
  assert.equal(conditional.Children[0].WeightedBranches[1].Children[0].Parameters.Value,150);
  assert.equal(conditional.ElseChildren[0].Parameters.Value,0);
  assert.equal(actual.Entries[2].TriggerConditions[0].Type,'Minute');
  const preview=A.describeEffects(player);
  assert.match(preview,/满足：/);assert.match(preview,/不满足：/);assert.match(preview,/加权只选一支/);
  assert.ok(!A.getValidationWarnings(normalized,'Events').some(value=>value.includes('提供实际角色或玩家')));
});

test('event condition DTO validates enums, required parameters, target IDs and resources separately from options',()=>{
  for(const condition of [null,{Type:1},{Type:'unknown'},{Target:'Self'},{Target:'SpecificId',CharacterId:0},{Type:'Flag'},{Type:'Disease'},{Type:'QuestState'},{Type:'Stat',Param:'unknown'},{Threshold:0.2},{Negate:'false'},{Season:'unknown'},{QuestState:'unknown'},{Unexpected:1}])assert.throws(()=>A.validate(file({TriggerConditions:[condition]}),'Events'));
  for(const Type of ['Year','DayOfYear','Hour','Minute','TotalDays','Season','Fate'])assert.doesNotThrow(()=>A.validate(file({TriggerConditions:[{Type,Negate:true}]}),'Events'));
  assert.throws(()=>A.validate(file({Options:[{Conditions:[{Type:'Year',Target:'Actor'}]}]}),'Events'));
  const configured={...profile,resources:{...profile.resources,diseases:['known']},resourcesComplete:{...profile.resourcesComplete,diseases:true}};
  A.configureProfile(configured);
  try{assert.throws(()=>A.validate(file({TriggerConditions:[{Type:'Disease',Param:'missing'}]}),'Events'),/不存在/);}
  finally{A.configureProfile(profile);}
});

test('conditions in Parameters receive semantic validation and missing systems are not advertised as an else success',()=>{
  for(const Conditions of [null,[null],[{Type:'HasTag'}],[{Target:'SpecificId',CharacterId:-1}]])assert.throws(()=>A.validate(file({TriggerConsequences:[{Type:'ConditionEffect',Parameters:{Conditions},Children:[flag()]}]}),'Events'));
  assert.throws(()=>A.validate(file({TriggerConsequences:[effect('ConditionEffect')]}),'Events'),/Conditions|Flag/);
  assert.throws(()=>A.validate(file({TriggerConsequences:[{...flag(),ElseChildren:[flag()]}]}),'Events'),/ElseChildren/);
  assert.throws(()=>A.validate(file({TriggerConsequences:[{...flag(),WeightedBranches:[{Weight:1,Children:[flag()]}]}]}),'Events'),/WeightedBranches/);
  const prompt=A.buildGenerationPrompt({type:'Events'});
  assert.match(prompt,/两支都中止/);assert.match(prompt,/Parameters 外/);
});

test('weighted branches use finite nonnegative weights, positive total and shared count/depth budget',()=>{
  for(const branches of [[],[null],[{Weight:-1}],[{Weight:Infinity}],[{Weight:0}],[{Weight:1e-50}],[{Weight:1,Children:null}],[{Weight:1,Unknown:true}]])assert.throws(()=>A.validate(file({TriggerConsequences:[weighted(branches)]}),'Events'));
  const normalized=A.validate(file({TriggerConsequences:[weighted([{Children:[flag()]},{Weight:0,Children:[]}])]}),'Events');
  assert.equal(normalized.Entries[0].TriggerConsequences[0].WeightedBranches[0].Weight,1);
  assert.throws(()=>A.validate(file({TriggerConsequences:[weighted(Array.from({length:512},()=>({Weight:1,Children:[flag()]})))]}),'Events'),/1024/);
  let nested=flag();for(let i=0;i<34;i++)nested=weighted([{Weight:1,Children:[nested]}]);
  assert.throws(()=>A.validate(file({TriggerConsequences:[nested]}),'Events'),/过深/);
});

test('both startup phases disallow interactive options and PlayerStart binds the created player',()=>{
  for(const TriggerPhase of ['WorldStart','PlayerStart'])assert.throws(()=>A.validate(file({TriggerPhase,Options:[{OptionText:'确认'}]}),'Events'),/启动事件/);
  for(const Target of [{ActorId:1},{PlayerId:1}])assert.throws(()=>A.validate(file({TriggerPhase:'PlayerStart',Target}),'Events'),/服务器绑定/);
  assert.doesNotThrow(()=>A.validate(file({TriggerPhase:'PlayerStart',Options:[{AutoExecute:true,Consequences:[effect('SetGoldEffect',{Value:10})]}]}),'Events'));
  assert.match(A.describeTrigger(A.validate(fixture,'Events').Entries[0]),/新世界/);
});

test('duration catalog rules follow all branches and reject irreversible expiry',()=>{
  const reversible=()=>effect('ModifyStatEffect',{TargetStat:'Attack',IsPermanent:false});
  assert.doesNotThrow(()=>A.validate(file({TriggerConsequences:[{Type:'SequenceEffect',Parameters:{RemainingDays:2},Children:[reversible()]}]}),'Events'));
  assert.doesNotThrow(()=>A.validate(file({TriggerConsequences:[{Type:'ConditionEffect',Parameters:{Flag:'test',RemainingDays:2},Children:[reversible()],ElseChildren:[reversible()]}]}),'Events'));
  assert.throws(()=>A.validate(file({TriggerConsequences:[{Type:'ConditionEffect',Parameters:{Flag:'test',RemainingDays:2},Children:[reversible()],ElseChildren:[flag()]}]}),'Events'),/持续天数/);
  assert.throws(()=>A.validate(file({TriggerConsequences:[{...weighted([{Weight:1,Children:[reversible()]},{Weight:0,Children:[flag()]}]),Parameters:{RemainingDays:2}}]}),'Events'),/持续天数/);
  for(const Parameters of [{RemainingDays:2,IsPermanent:true},{RemainingDays:2,IsPermanent:false,TargetStat:'Health'},{IsPermanent:false,TargetStat:'Health'}])assert.throws(()=>A.validate(file({TriggerConsequences:[effect('ModifyStatEffect',Parameters)]}),'Events'));
});

test('time parameters reject unsupported ranges before download while forward-world checks remain explicit',()=>{
  for(const [Type,Parameters] of [['SetTimeEffect',{Year:-1}],['SetTimeEffect',{DayOfYear:profile.daysPerYear+1}],['SetTimeEffect',{Hour:24}],['SetTimeEffect',{Minute:60}],['AdvanceTimeEffect',{Days:0}],['AdvanceMinutesEffect',{Minutes:1440001}],['SetTimeSpeedEffect',{Multiplier:0}],['SetTimeSpeedEffect',{Multiplier:101}],['ScheduleGameEventEffect',{EventId:'later',DelayDays:0}],['TriggerGameEventEffect',{EventId:''}]])assert.throws(()=>A.validate(file({TriggerConsequences:[effect(Type,Parameters)]}),'Events'));
  const value=file({TriggerConsequences:[effect('SetTimeEffect',{Year:0,DayOfYear:0,Hour:12,Minute:30})]});
  assert.doesNotThrow(()=>A.validate(value,'Events'));assert.ok(A.getValidationWarnings(value,'Events').some(text=>text.includes('向前')));
});

test('manual condition and network-prefab dependencies stay visible without dropping author fields',()=>{
  const manual=file({TriggerPhase:'Manual',TriggerConditions:[{Type:'Health',Target:'SpecificId',CharacterId:99}],TriggerConsequences:[effect('SpawnInteractableEffect',{TargetHex:{x:1,y:2}})]});
  assert.equal(A.validate(manual,'Events').Entries[0].TriggerConditions[0].CharacterId,99);
  const warnings=A.getValidationWarnings(manual,'Events');
  assert.ok(warnings.some(text=>text.includes('固定角色')));assert.ok(warnings.some(text=>text.includes('联机预制体')));assert.ok(warnings.some(text=>text.includes('不会进入每日')));
  assert.ok(!A.buildGenerationPrompt({type:'Events'}).includes('"SpawnInteractableEffect":'));
});

test('price resourceWhen activates only the selected resource, including omitted selection defaults',()=>{
  assert.ok(profile.effects.ModifyPriceMultiplierEffect,'Export the registered price effect in the real profile first.');
  const value=file({Target:{RandomSettlement:true},TriggerConsequences:[effect('ModifyPriceMultiplierEffect',{ItemId:'weapon_dagger',Multiplier:1.2})]});
  const checked=A.validate(value,'Events'),price=checked.Entries[0].TriggerConsequences[0];
  assert.deepEqual(A.getEffectResourceReferences(price).map(ref=>ref.field),['ItemId']);
  assert.ok(!A.getValidationWarnings(value,'Events').some(text=>text.startsWith('itemTags')));
  assert.throws(()=>A.validate(file({TriggerConsequences:[effect('ModifyPriceMultiplierEffect',{Selection:'Tag',ItemId:'weapon_dagger'})]}),'Events'),/ItemTag.*不能为空/);
  for(const Multiplier of [0,-1,Infinity,NaN,1e-50])assert.throws(()=>A.validate(file({TriggerConsequences:[effect('ModifyPriceMultiplierEffect',{ItemId:'weapon_dagger',Multiplier})]}),'Events'));
  for(const Multiplier of [1.401298464324817e-45,0.5,3.4028234663852886e38])assert.doesNotThrow(()=>A.validate(file({TriggerConsequences:[effect('ModifyPriceMultiplierEffect',{ItemId:'weapon_dagger',Multiplier})]}),'Events'));
  // Synthetic tag isolates mode selection; it does not claim that the installed game contains this tag.
  const configured=clone(profile);configured.resources.itemTags=['synthetic_tag'];configured.resourcesComplete.itemTags=true;
  A.configureProfile(configured);
  try{
    const tag=file({TriggerConsequences:[effect('ModifyPriceMultiplierEffect',{Selection:'Tag',ItemTag:'synthetic_tag',ItemId:'inactive_unknown_item'})]});
    const parsed=A.validate(tag,'Events').Entries[0].TriggerConsequences[0];
    assert.deepEqual(A.getEffectResourceReferences(parsed).map(ref=>ref.field),['ItemTag']);
    assert.equal(parsed.Parameters.ItemId,'inactive_unknown_item');
    assert.throws(()=>A.validate(file({TriggerConsequences:[effect('ModifyPriceMultiplierEffect',{Selection:'Item',ItemId:'missing',ItemTag:'synthetic_tag'})]}),'Events'),/不存在/);
  }finally{A.configureProfile(profile);}
});
