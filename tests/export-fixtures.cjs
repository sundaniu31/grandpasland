// Export website-normalized test data for the game's integration checks. This never calls an AI provider.
const fs=require('node:fs');
const path=require('node:path');
const A=require('../assets.js');
const profile=require('../content-profile.json');
A.configureProfile(profile);
const destination=path.resolve(process.argv[2]||path.join(__dirname,'.generated'));
fs.mkdirSync(destination,{recursive:true});
const metadata={SchemaVersion:1,ProfileId:profile.profileId};
const fixtures={
  'names.json':{type:'NPCNames',data:{...metadata,Items:['网站甲','网站乙']}},
  'options.event.json':{type:'Events',data:require('./fixtures/options.event.json')},
  'festival.json':{type:'Festivals',data:{...metadata,Entries:[{Id:'Website_FestivalProbe',Name:'网站互助节',Description:'用于校验网站与游戏节日规则一致。',RuleType:'ByDayInYear',RuleDayInYear:profile.daysPerYear,RuleDurationDays:1,LinkedEventIds:['Website_ContextProbe']}]}}
};
for(const [name,{type,data}] of Object.entries(fixtures))fs.writeFileSync(path.join(destination,name),JSON.stringify(A.validate(data,type),null,2),'utf8');
console.log(JSON.stringify({destination,files:Object.keys(fixtures),schemaVersion:profile.schemaVersion,profileId:profile.profileId}));
