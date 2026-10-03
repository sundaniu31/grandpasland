const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../assets.js');
// This test reads the shipped game-exported catalog directly. No synthetic metadata is added.
const profile=require('../content-profile.json');

test('canonical game catalog preserves registered effects and generation restrictions',()=>{
  A.configureProfile(profile);
  assert.equal(Object.keys(profile.effects).length,68,'The catalog must include all registered effect types, including restricted ones.');
  for(const type of ['ShowMessageUIEffect','SpawnInteractableEffect'])assert.equal(profile.effects[type].status,'logOnly',type);
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
    if(spec.status==='logOnly'||spec.requiresBindings===true)assert.equal(Object.hasOwn(catalog,type),false,type+' must not be advertised for AI generation');
    else {
      assert.equal(Object.hasOwn(catalog,type),true,type+' safe variants remain advertised');
      for(const metadata of ['bindingRules','contextRules','characterRules'])if(spec[metadata]?.length)assert.deepEqual(catalog[type][metadata],spec[metadata],type+' '+metadata);
    }
  }
  assert.ok(Object.hasOwn(catalog,'ModifyHealthEffect'),'A runnable portable effect remains available.');
});
