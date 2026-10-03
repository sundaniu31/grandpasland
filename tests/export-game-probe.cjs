// Produce disposable external files with the same validation used by download/share.
// No provider request, user API key, or real game library is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const A = require('../assets.js');
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content-profile.json'), 'utf8'));
A.configureProfile(profile);
const output = process.argv[2];
if (!output || path.basename(path.resolve(output)) !== '.WebsiteRoundTrip') throw new Error('Pass an isolated .WebsiteRoundTrip directory.');
if (fs.existsSync(output)) throw new Error('Probe folder already exists; preserve it until checked.');
fs.mkdirSync(output, {recursive: true});
const itemId = profile.resources.items.includes('weapon_dagger') ? 'weapon_dagger' : profile.resources.items[0];
if (!itemId) throw new Error('The actual game profile needs an item ID for the economy probe.');
const data = {
  CityNames: {Items: ['测试港', '试验城']},
  NPCNames: {Items: ['测试甲', '测试乙']},
  CompanyNames: {Items: ['测试商社甲', '测试商社乙']},
  FamilyNames: {Items: ['测试家族甲', '测试家族乙']},
  Events: {Entries: [
    {Id: '__website_probe_event', Name: '外部网站组合检查', Description: '仅用于可清理的跨端测试。',
      EventType: 'Bad', Score: -3, Tags: 'Health, Economy', Repeatable: true,
      RumorHint: '跨端测试', DescriptionVariants: ['组合字段必须保留'],
      CausalTagModifiers: [{targetTag: 'Health', probabilityMultiplier: 1.2, durationDays: 2, decayOverTime: true}],
      CooldownDays: 1, Target: {ActorId: 950001, PlayerId: 950002, SettlementId: '测试港'}, Options: [],
      TriggerConsequences: [{Type: 'SequenceEffect', Parameters: {}, Children: [
        {Type: 'ModifyHealthEffect', Parameters: {Delta: -7, TargetMode: 'Self'}},
        {Type: 'ModifyPrestigeEffect', Parameters: {Delta: 11, TargetMode: 'Player'}},
        {Type: 'ModifyDemandEffect', Parameters: {Delta: 25, ItemId: itemId, Target: 'TargetLocation'}}
      ]}]},
    {Id: '__website_probe_linked', Name: '关联节日检查', Description: '仅用于关联效果检查。',
      Target: {ActorId: 950001}, Options: [], TriggerConsequences: [{Type: 'ModifyAgeEffect', Parameters: {Delta: 1}}]}
  ]},
  Festivals: {Entries: [{Id: '__website_probe_festival', Name: '临时测试节日', Description: '仅用于日期和关联事件检查。',
    RuleType: 'ByDayInYear', RuleDayInYear: 1, RuleDurationDays: 1, LinkedEventIds: ['__website_probe_linked']}]}
};
for (const [type, source] of Object.entries(data)) {
  const generated = A.validate(source, type);
  const edited = A.validate(A.parseJSON(JSON.stringify(generated)), type);
  const downloaded = A.validate(A.parseJSON(JSON.stringify(edited)), type);
  assert.deepEqual(downloaded, generated, type + ' changed during repeated validation');
  fs.writeFileSync(path.join(output, type + '.json'), JSON.stringify(downloaded, null, 2), 'utf8');
}
assert.equal(A.validate(data.Events, 'Events').Entries[0].TriggerConsequences[0].Children.length, 3);
fs.writeFileSync(path.join(output, 'probe.json'), JSON.stringify({ItemId: itemId}, null, 2), 'utf8');
process.stdout.write('Exported 6 disposable website files; nested effects and metadata survived validation.\n');
