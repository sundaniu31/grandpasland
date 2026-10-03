const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../assets.js');
// This test reads the shipped game-exported catalog directly. No synthetic metadata is added.
const profile=require('../content-profile.json');

test('canonical game catalog preserves registered effects and generation restrictions',()=>{
  A.configureProfile(profile);
  for(const type of ['SetHealthEffect','SetGoldEffect','SetFateEffect','RemoveEffectEffect','WeightedRandomEffect','SetTimeEffect','AdvanceMinutesEffect','SetTimePausedEffect','SetTimeSpeedEffect','TriggerGameEventEffect','ScheduleGameEventEffect','SetWeatherEffect','AssignResidenceEffect','ResolveWarEffect','ShowStoryPanelEffect','SetPlayerBirthplaceEffect'])assert.ok(Object.hasOwn(profile.effects,type),type+' registered');
  assert.notEqual(profile.effects.ShowMessageUIEffect.status,'logOnly');
  assert.equal(profile.effects.SpawnInteractableEffect.requiresNetworkPrefabBinding,true);
  assert.equal(profile.effects.ConditionEffect.allowsElseChildren,true);assert.equal(profile.effects.WeightedRandomEffect.allowsWeightedBranches,true);
  assert.deepEqual(profile.effects.ModifyPriceMultiplierEffect.parameters.ItemId.resourceWhen,{Selection:'Item'});
  assert.deepEqual(profile.effects.ModifyPriceMultiplierEffect.parameters.ItemTag.resourceWhen,{Selection:'Tag'});
  assert.equal(A.effectRequiresCharacter({Type:'SetGoldEffect',Parameters:{Target:'Settlement'}}),false);
  assert.ok(!profile.effects.SetWeatherEffect.parameters.Weather.enum.includes('Night'),'Night is controlled by ChangeNight/IsNight, not Weather.');
  for(const type of ['ShowStoryPanelEffect','ShowMessageUIEffect'])assert.equal(A.getEffectContextRequirements({Type:type,Parameters:{Recipient:'ContextPlayer'}}).requiresPlayer,true,type+' contextual recipient');
  for(const [type,field] of [['StartDialogueEffect','Title'],['GiveQuestEffect','QuestId']]){
    const spec=profile.effects[type];
    assert.equal(spec.requiresBindings,true,type);
    assert.ok(spec.bindingFields.includes(field),type+' bindingFields');
    assert.ok(spec.requiredBindingFields.includes(field),type+' requiredBindingFields');
    assert.ok(A.getEffectBindings({Type:type,Parameters:{}}).some(binding=>binding.fields.includes(field)),type+' mandatory binding check');
  }
  for(const [type,field] of [['RecruitFollowerEffect','Recruiter'],['ModifyRelationshipEffect','RelationshipTarget']]){
    const spec=profile.effects[type];
    assert.ok(spec.contextRules.some(rule=>rule.when[field]==='Player'&&rule.requiresPlayer===true),type+' player context rule');
    assert.equal(A.getEffectContextRequirements({Type:type,Parameters:{[field]:'Player',TargetMode:'RandomInSettlement'}}).requiresPlayer,true,type+' resolved player context');
  }
  for(const type of ['ModifyGoldEffect','GiveItemEffect','RemoveItemEffect']){
    const spec=profile.effects[type];
    assert.equal(spec.requiresCharacterMayVary,true,type);
    assert.ok(spec.characterRules.some(rule=>rule.when.Target==='Settlement'&&rule.requiresCharacter===false),type+' settlement character rule');
    assert.equal(A.effectRequiresCharacter({Type:type,Parameters:{Target:'Settlement'}}),false,type+' settlement variant');
    assert.equal(A.effectRequiresCharacter({Type:type,Parameters:{}}),true,type+' default character variant');
  }
  const prompt=A.buildGenerationPrompt({type:'Events'});
  const catalog=JSON.parse(prompt.match(/效果目录：([^\n]+)/)[1]);
  for(const [type,spec] of Object.entries(profile.effects)){
    const internalEventLink=['TriggerGameEventEffect','ScheduleGameEventEffect'].includes(type);
    if(spec.status==='logOnly'||spec.requiresNetworkPrefabBinding||spec.requiresBindings===true&&!internalEventLink)assert.equal(Object.hasOwn(catalog,type),false,type+' must not be advertised for AI generation');
    else {
      assert.equal(Object.hasOwn(catalog,type),true,type+' safe variants remain advertised');
      for(const metadata of ['bindingRules','contextRules','characterRules','durationRules'])if(spec[metadata]?.length)assert.deepEqual(catalog[type][metadata],spec[metadata],type+' '+metadata);
    }
  }
  assert.ok(Object.hasOwn(catalog,'ModifyHealthEffect'),'A runnable portable effect remains available.');
});
