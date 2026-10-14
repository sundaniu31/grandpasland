const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const A=require('../assets.js');
const fields=['SchemaVersion','ProfileId','Name','WorldBackground','StyleInstructions'];
const style=patch=>({SchemaVersion:1,ProfileId:'crownfall1-v1',Name:'田园诸邦',WorldBackground:'河谷市镇、农田和商旅共同构成世界文化。事实以游戏为准。',StyleInstructions:'自然简洁的中文口语，遵循角色身份和实际记忆。',...patch});
test('world AI style has one flat category, independent of effect registries',()=>{
  A.configureProfile(null);
  assert.equal(A.TYPES.AIStyles,'世界 AI 风格');
  assert.deepEqual(A.validate(style(),'AIStyles'),style());
  assert.equal(A.count(style(),'AIStyles'),1);assert.equal(A.count(style()),1);
  assert.equal(A.detectType(style()),'AIStyles');assert.equal(A.detectType({Items:['名字']}),null);
  assert.match(A.importPath('AIStyles','风格'),/NameLibraries\\AIStyles\\风格\.json$/);
});
test('style metadata is explicit, case sensitive and never configures credentials',()=>{
  for(const key of fields){const value=style();delete value[key];assert.throws(()=>A.validate(value,'AIStyles'),/缺少/);}
  for(const patch of [{SchemaVersion:2},{SchemaVersion:'1'},{ProfileId:'Crownfall1-v1'},{schemaVersion:1},{Enabled:true},{APIKey:'never-share'},{Model:'model'},{BaseUrl:'https://example.test'},{NpcIds:[]},{Profiles:[]},{Items:[]},{Entries:[]},{$type:'unsafe'}])assert.throws(()=>A.validate(style(patch),'AIStyles'));
  for(const key of ['Name','WorldBackground','StyleInstructions'])for(const value of [null,1,{},[],true])assert.throws(()=>A.validate(style({[key]:value}),'AIStyles'),/文本/);
});
test('name and text limits count original UTF-16 units before normalization',()=>{
  assert.equal(A.validate(style({Name:' 名字 ',WorldBackground:' 保留背景 \n',StyleInstructions:' 风格 '}),'AIStyles').Name,'名字');
  assert.equal(A.validate(style({WorldBackground:' 保留背景 \n'}),'AIStyles').WorldBackground,' 保留背景 \n');
  assert.throws(()=>A.validate(style({Name:' '.repeat(80)+'名'}),'AIStyles'),/80/);
  assert.throws(()=>A.validate(style({Name:'\u0085'}),'AIStyles'),/不能为空/);
  assert.equal(A.validate(style({Name:'\uFEFF'}),'AIStyles').Name,'\uFEFF');
  assert.equal(A.validate(style({Name:'😀'.repeat(40)}),'AIStyles').Name.length,80);
  assert.throws(()=>A.validate(style({Name:'😀'.repeat(41)}),'AIStyles'),/80/);
  assert.equal(A.validate(style({WorldBackground:'x'.repeat(8000),StyleInstructions:'y'.repeat(4000)}),'AIStyles').WorldBackground.length,8000);
  for(const patch of [{WorldBackground:'x'.repeat(8001)},{StyleInstructions:'x'.repeat(8001)},{WorldBackground:'x'.repeat(8000),StyleInstructions:'y'.repeat(4001)}])assert.throws(()=>A.validate(style(patch),'AIStyles'),/8000|12000/);
});
test('unpaired Unicode fails as literal input, JSON escapes and direct authoring',()=>{
  for(const bad of ['\ud800','\udfff','a\ud800b','\ud800\ud800'])for(const key of ['Name','WorldBackground','StyleInstructions'])assert.throws(()=>A.validate(style({[key]:bad}),'AIStyles'),/Unicode/);
  for(const raw of ['\\ud800','\\udfff','\\ud800a'])assert.throws(()=>A.parseWorldAIStyle(JSON.stringify(style()).replace('田园诸邦',raw)),/Unicode/);
  const emoji=style({WorldBackground:'😀'});assert.equal(A.parseWorldAIStyle(JSON.stringify(emoji)).WorldBackground,'😀');
  assert.equal(A.parseWorldAIStyle(JSON.stringify(emoji).replace('😀','\\ud83d\\ude00')).WorldBackground,'😀');
  assert.throws(()=>A.parseWorldAIStyle(JSON.stringify(emoji).replace('😀','\ud83d\\ude00')),/Unicode/);
});
test('style parsing rejects duplicate fields, extra roots, comments and nonstandard syntax',()=>{
  const json=JSON.stringify(style());
  for(const raw of [json.replace('"Name":','"Name":"重复","Name":'),json.replace('"Name":','"\\u004eame":"重复","Name":'),json+'{}',json.replace('{','{/*comment*/'),json.replace('}',' ,}'),json.replace('"Name"',"'Name'"),json.replace('"Name"','Name')])assert.throws(()=>A.parseWorldAIStyle(raw));
  for(const raw of ['\u00a0'+json,json+'\u00a0',' \uFEFF'+json])assert.throws(()=>A.parseWorldAIStyle(raw));
  assert.deepEqual(A.parseWorldAIStyle('\uFEFF'+json),style());
  assert.deepEqual(A.parseJSON(' \n'+json+'\r\t','AIStyles'),style());
});
test('raw schema version keeps integer token semantics despite JavaScript number coercion',()=>{
  for(const lexeme of ['1.0','1e0','1E+0','"1"'])assert.throws(()=>A.parseWorldAIStyle(JSON.stringify(style()).replace('"SchemaVersion":1','"SchemaVersion":'+lexeme)),/整数/);
  assert.equal(A.parseJSON(JSON.stringify(style())).SchemaVersion,1);
  assert.throws(()=>A.parseJSON(JSON.stringify(style()).replace('"SchemaVersion":1','"SchemaVersion":1.0')),/整数/);
});
test('raw 128 KiB includes whitespace and BOM while canonical output preserves escapes',()=>{
  const json=JSON.stringify(style()),size=Buffer.byteLength(json,'utf8'),limit=A.AI_STYLE_LIMITS.maxBytes;
  assert.equal(A.parseWorldAIStyle(json+' '.repeat(limit-size)).Name,'田园诸邦');
  assert.throws(()=>A.parseWorldAIStyle(json+' '.repeat(limit-size+1)),/128 KiB/);
  assert.throws(()=>A.parseJSON(json+' '.repeat(limit-size+1)),/128 KiB/);
  assert.throws(()=>A.parseWorldAIStyle('\uFEFF'+json+' '.repeat(limit-size-2)),/128 KiB/);
  const source=style({WorldBackground:'\u0000'.repeat(8000),StyleInstructions:'\u0001'.repeat(4000)});
  const output=A.serializeWorldAIStyle(source);assert.match(output,/\\u0000/);assert.ok(Buffer.byteLength(output)<limit);assert.deepEqual(A.parseWorldAIStyle(output),source);
});
test('style template and AI generation prompt carry exactly the supported five-field seed',()=>{
  const seed=style();
  assert.deepEqual(A.worldAIStyleTemplate({worldStyle:seed,name:'作者名称',worldBackground:'自填背景',styleInstructions:'自填风格'}),style({Name:'作者名称',WorldBackground:'自填背景',StyleInstructions:'自填风格'}));
  assert.deepEqual(A.worldAIStyleTemplate({name:'空模板'}),{SchemaVersion:1,ProfileId:'crownfall1-v1',Name:'空模板',WorldBackground:'',StyleInstructions:''});
  for(const language of ['zh-CN','en']){
    const prompt=A.buildGenerationPrompt({type:'AIStyles',count:25,name:'作者名称',worldStyle:seed,language});
    assert.match(prompt,/12000/);assert.match(prompt,/131072/);assert.match(prompt,/8000/);
    const example=JSON.parse(prompt.slice(prompt.lastIndexOf(language==='en'?'Requested world style: ':'作者风格草稿：')+(language==='en'?'Requested world style: ':'作者风格草稿：').length));
    assert.deepEqual(Object.keys(example),fields);assert.equal(example.Name,'作者名称');assert.equal(example.WorldBackground,seed.WorldBackground);
    assert.deepEqual(A.validate(example,'AIStyles'),example);
  }
});
test('AI fenced style responses validate before display; empty styles have explicit usage warning',()=>{
  assert.deepEqual(A.parseAI('```json\n'+JSON.stringify(style())+'\n```','AIStyles'),style());
  assert.throws(()=>A.parseAI('Here is your JSON: '+JSON.stringify(style()),'AIStyles'));
  const warnings=A.getValidationWarnings(style({WorldBackground:'',StyleInstructions:''}),'AIStyles').join('\n');
  assert.match(warnings,/应用风格/);assert.match(warnings,/模型/);assert.match(warnings,/均为空/);
  assert.match(A.describeTrigger(style(),'en','AIStyles'),/Apply/);assert.match(A.describeEffects(style(),'zh-CN','AIStyles'),/事实/);
});
test('actual browser download produces only valid UTF-8 five-field JSON, without enabling data',async()=>{
  let downloaded,filename;
  const context={TextEncoder,Blob,URL:{createObjectURL:blob=>{downloaded=blob;return 'blob:test';},revokeObjectURL:()=>{}},setTimeout:()=>{},document:{createElement:()=>({href:'',set download(value){filename=value;},click(){},remove(){}}),body:{append(){}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../assets.js'),'utf8'),context);
  context.GLAssets.download(style(),'风格文件');
  assert.equal(filename,'风格文件.json');assert.equal(downloaded.type,'application/json;charset=utf-8');
  const bytes=new Uint8Array(await downloaded.arrayBuffer()),json=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert.equal(json,A.serializeWorldAIStyle(style()));assert.deepEqual(Object.keys(A.parseWorldAIStyle(json)),fields);assert.ok(bytes.length<=A.AI_STYLE_LIMITS.maxBytes);
});
test('safe filenames never leave split surrogate pairs at the length boundary',()=>{
  assert.equal(A.fileName('x'.repeat(79)+'😀'),'x'.repeat(79)+'.json');
  assert.equal(A.importPath('AIStyles','...风格...').endsWith('\\风格.json'),true);
});
test('Unity-authored example round trips through the website exporter when source is available',t=>{
  const file='A:/Unity/Crownfall1/Assets/AGame/Docs/AI/WorldAIStyle.example.json';
  if(!fs.existsSync(file)){t.skip('Local Unity source not present');return;}
  const source=A.parseWorldAIStyle(fs.readFileSync(file,'utf8'));assert.deepEqual(A.parseWorldAIStyle(A.serializeWorldAIStyle(source)),source);
});
