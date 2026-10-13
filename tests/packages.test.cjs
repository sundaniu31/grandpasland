const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const P=require('../package-export.js');
const options={validated:true,allowHeaderOnly:true};
const metadata={SchemaVersion:1,ProfileId:'crownfall1-v1'};
function referenceCRC(bytes) {
  let value=0xffffffff;
  for(const byte of bytes) {value^=byte;for(let i=0;i<8;i++) value=(value & 1) ? (value >>> 1)^0xedb88320 : value >>> 1;}
  return (value^0xffffffff) >>> 0;
}
function pngChunk(type,content) {
  const chunk=Buffer.alloc(12+content.length);
  chunk.writeUInt32BE(content.length,0);chunk.write(type,4);content.copy(chunk,8);
  chunk.writeUInt32BE(referenceCRC(chunk.subarray(4,8+content.length)),8+content.length);
  return chunk;
}
function png(width=1,height=1,color=0) {
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  const pixels=Buffer.alloc((width*4+1)*height,color);
  for(let y=0;y<height;y++) pixels[y*(width*4+1)]=0;
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',zlib.deflateSync(pixels)),pngChunk('IEND',Buffer.alloc(0))]));
}
function item(id='sample.herb',path='icons/herb.png',extra={}) {
  return {Id:id,Name:'草药',Description:'普通药材。',Category:'Material',Rarity:'Common',BaseValue:10,MaximumStack:100,Weight:1,Perishable:false,ShelfLifeDays:0,Tags:['药材'],UseEffects:[],Sources:[],Icon:{Path:path,PixelsPerUnit:100,...extra}};
}
function itemData(entries=[item()]) {return {...metadata,Entries:entries};}
function names(items) {return {...metadata,Items:items};}
// Independent ZIP reader checks the central directory and local files instead of
// trusting the writer's reported filenames or CRC implementation.
function unzipStored(bytes) {
  const b=Buffer.from(bytes),end=b.length-22;
  assert.equal(b.readUInt32LE(end),0x06054b50);
  assert.equal(b.readUInt16LE(end+4),0);assert.equal(b.readUInt16LE(end+6),0);
  assert.equal(b.readUInt16LE(end+20),0);
  const count=b.readUInt16LE(end+10);assert.equal(b.readUInt16LE(end+8),count);
  const centralSize=b.readUInt32LE(end+12),centralStart=b.readUInt32LE(end+16);
  assert.equal(centralStart+centralSize,end);
  let cursor=centralStart;const result=new Map();
  for(let i=0;i<count;i++) {
    assert.equal(b.readUInt32LE(cursor),0x02014b50);
    assert.equal(b.readUInt16LE(cursor+8),0x0800);assert.equal(b.readUInt16LE(cursor+10),0);
    const crc=b.readUInt32LE(cursor+16),size=b.readUInt32LE(cursor+20),uncompressed=b.readUInt32LE(cursor+24);
    assert.equal(size,uncompressed);
    const nameLength=b.readUInt16LE(cursor+28),extra=b.readUInt16LE(cursor+30),comment=b.readUInt16LE(cursor+32);
    const name=b.toString('utf8',cursor+46,cursor+46+nameLength),offset=b.readUInt32LE(cursor+42);
    assert.equal(b.readUInt32LE(offset),0x04034b50);assert.equal(b.readUInt16LE(offset+6),0x0800);assert.equal(b.readUInt16LE(offset+8),0);
    assert.equal(b.readUInt32LE(offset+14),crc);assert.equal(b.readUInt32LE(offset+18),size);assert.equal(b.readUInt32LE(offset+22),size);
    const localNameLength=b.readUInt16LE(offset+26),localExtra=b.readUInt16LE(offset+28);
    assert.equal(b.toString('utf8',offset+30,offset+30+localNameLength),name);
    const start=offset+30+localNameLength+localExtra,content=b.subarray(start,start+size);
    assert.equal(referenceCRC(content),crc);
    result.set(name,new Uint8Array(content));cursor+=46+nameLength+extra+comment;
  }
  assert.equal(cursor,end);return result;
}
test('CRC32 has the standard reference value and stored ZIP preserves UTF-8 paths and bytes',()=>{
  assert.equal(P.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const entries=[{path:'中文包/城市.json',bytes:new TextEncoder().encode('{"Items":["青石镇"]}')},{path:'中文包/icons/草药.png',bytes:png()}];
  const extracted=unzipStored(P.buildZipEntries(entries));
  for(const entry of entries) assert.deepEqual(extracted.get(entry.path),entry.bytes);
});
test('item export creates a real JSON + PNG ZIP while preserving the current data',async()=>{
  const image=png(),data=itemData(),before=JSON.stringify(data);
  const result=await P.buildItemPackage(data,'草药包',new Map([['icons/herb.png',image]]),options);
  assert.equal(result.fileName,'草药包.zip');assert.equal(result.blob.type,'application/zip');
  const extracted=unzipStored(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual(JSON.parse(Buffer.from(extracted.get('草药包/草药包.json')).toString('utf8')),data);
  assert.deepEqual(extracted.get('草药包/icons/herb.png'),image);
  assert.equal(JSON.stringify(data),before);assert.match(result.warnings[0],/没有执行浏览器图像解码/);
});
test('correct PNG hashes are retained and incorrect hashes are rejected',async()=>{
  const image=png(),hash=crypto.createHash('sha256').update(image).digest('hex'),data=itemData([item('sample.herb','icons/herb.png',{Hash:hash})]);
  const result=await P.buildItemPackage(data,'hash',{'icons/herb.png':image},options);
  const extracted=unzipStored(new Uint8Array(await result.blob.arrayBuffer()));
  assert.equal(JSON.parse(Buffer.from(extracted.get('hash/hash.json')).toString()).Entries[0].Icon.Hash,hash);
  for(const Hash of ['0'.repeat(64),'ABC','A'.repeat(64),null]) await assert.rejects(()=>P.buildItemPackage(itemData([item('sample.herb','icons/herb.png',{Hash})]),'hash',{'icons/herb.png':image},options),/Hash/);
});
test('safe names and paths reject path traversal, absolute paths, devices and Windows illegal names',()=>{
  assert.equal(P.safeBaseName('CON.json'),'_CON');assert.equal(P.safeBaseName('青石镇.zip'),'青石镇');assert.equal(P.safeBaseName('a/b:c'),'a_b_c');
  for(const path of ['../bad.png','a/../bad.png','/bad.png','C:/bad.png','a\\bad.png','a//bad.png','a/./bad.png','bad\u0000.png','CON.png','a/b".png','x.png/',' a.png','a.png ']) assert.throws(()=>P.normalizeRelativePath(path,true),/路径/);
  assert.throws(()=>P.normalizeRelativePath('icons/icon.jpg',true),/PNG/);
});
test('PNG bytes, CRC, truncation, dimensions and icon regions are checked',async()=>{
  const valid=png();
  assert.deepEqual(P.inspectPng(valid),{width:1,height:1,pixels:1});
  const broken=new Uint8Array(valid);broken[20]^=1;assert.throws(()=>P.inspectPng(broken));
  for(const bytes of [new Uint8Array(33),valid.subarray(0,valid.length-1),new Uint8Array(P.LIMITS.pngBytes+1),png(2049,1)]) assert.throws(()=>P.inspectPng(bytes));
  for(const extra of [{X:1},{Width:2,Height:1},{Width:1},{PixelsPerUnit:0}]) await assert.rejects(()=>P.buildItemPackage(itemData([item('sample.herb','icons/herb.png',extra)]),'rect',{'icons/herb.png':valid},options),/切片|PixelsPerUnit/);
});
test('export refuses missing and unreferenced uploads and duplicate item IDs',async()=>{
  await assert.rejects(()=>P.buildItemPackage(itemData(),'missing',{},options),/缺少 PNG/);
  await assert.rejects(()=>P.buildItemPackage(itemData(),'extra',{'icons/herb.png':png(),'icons/unused.png':png()},options),/未被物品引用/);
  await assert.rejects(()=>P.buildItemPackage(itemData([item(),item()]),'dup',{'icons/herb.png':png()},options),/ID/);
});
test('API validates selected files before adding them and refuses duplicate names',async()=>{
  const files=new Map(),image=png();
  const info=await P.addPng(files,'icons/herb.png',new Blob([image]),options);
  assert.equal(info.decoded,false);assert.equal(info.hash,crypto.createHash('sha256').update(image).digest('hex'));
  await assert.rejects(()=>P.addPng(files,'icons/HERB.png',image,options),/路径重复/);
  await assert.rejects(()=>P.addPng(files,'icons/bad.png',new Uint8Array([1,2,3]),options),/PNG/);
  assert.equal(files.size,1);
});
test('browser-style export performs actual image decoding and propagates corrupt image failures',async()=>{
  const original=global.createImageBitmap;
  let closes=0;
  try {
    global.createImageBitmap=async()=>({width:1,height:1,close(){closes++;}});
    const result=await P.buildItemPackage(itemData(),'decoded',{'icons/herb.png':png()},{validated:true});
    assert.deepEqual(result.warnings,[]);assert.equal(closes,1);
    global.createImageBitmap=async()=>{throw new Error('decoder rejected image');};
    await assert.rejects(()=>P.buildItemPackage(itemData(),'bad',{'icons/herb.png':png()},{validated:true}),/实际解码失败/);
  } finally {if(original)global.createImageBitmap=original;else delete global.createImageBitmap;}
});
test('Mod ZIP uses classified folders and gives each Items library its own PNG directory',async()=>{
  const libraries=[
    {type:'CityNames',name:'城镇',data:names(['青石镇'])},
    {type:'Items',name:'草药',data:itemData(),files:{'icons/herb.png':png()}},
    {type:'Items',name:'鲜花',data:itemData([item('sample.flower')]),files:{'icons/herb.png':png(1,1,1)}}
  ];
  const result=await P.buildModPackage(libraries,'分享包',undefined,options);
  const extracted=unzipStored(new Uint8Array(await result.blob.arrayBuffer()));
  assert.deepEqual([...extracted.keys()],[
    '分享包/NameLibraries/CityNames/城镇.json',
    '分享包/NameLibraries/Items/草药/草药.json',
    '分享包/NameLibraries/Items/草药/icons/herb.png',
    '分享包/NameLibraries/Items/鲜花/鲜花.json',
    '分享包/NameLibraries/Items/鲜花/icons/herb.png'
  ]);
  assert.deepEqual(extracted.get('分享包/NameLibraries/Items/鲜花/icons/herb.png'),png(1,1,1));
});
test('Mod global files are mapped to the correct manifest without including arbitrary files',async()=>{
  const libraries=[{type:'Items',name:'herbs',data:itemData()}];
  const result=await P.buildModPackage(libraries,'mod',new Map([['Items/herbs.json/icons/herb.png',png()]]),options);
  assert.ok(result.entries.includes('mod/NameLibraries/Items/herbs/icons/herb.png'));
  await assert.rejects(()=>P.buildModPackage(libraries,'mod',{'icons/herb.png':png()},options),/缺失/);
  await assert.rejects(()=>P.buildModPackage(libraries,'mod',{'Items/herbs.json/icons/herb.png':png(),'unrelated.png':png()},options),/未被任何库引用/);
});
test('Mod folder names follow the actual case-sensitive Unity Enum.TryParse classification',async()=>{
  const libraries=[{type:'CityNames',name:'cities',data:names(['青石镇'])}];
  for(const name of [...P.TYPES,'0','10','+5','005','Events,Quests']) await assert.rejects(()=>P.buildModPackage(libraries,name,undefined,options),/误识别为库分类/);
  for(const name of ['events','items','11','-1','2026','Events,Items']) {
    const result=await P.buildModPackage(libraries,name,undefined,options);
    assert.ok(result.entries[0].startsWith(name+'/NameLibraries/'));
  }
});
test('Mod icon directory nesting counts the library-name folder and standalone Items keeps its wider relative-path support',async()=>{
  const path='icons/a/b/c/herb.png',data=itemData([item('sample.deep',path)]),files={[path]:png()};
  await P.buildItemPackage(data,'standalone',files,options);
  await assert.rejects(()=>P.buildModPackage([{type:'Items',name:'deep',data,files}],'mod',undefined,options),/最多嵌套 4 层/);
  const allowed='icons/a/b/herb.png';
  await P.buildModPackage([{type:'Items',name:'depth4',data:itemData([item('sample.allowed',allowed)]),files:{[allowed]:png()}}],'mod',undefined,options);
});
test('Mod counts all actual directories including per-library icons against the Unity 256-directory ceiling',async()=>{
  const image=png();
  const libraries=Array.from({length:128},(_,i)=>({type:'Items',name:'lib'+i,data:itemData([item('sample.item'+i)]),files:{'icons/herb.png':image}}));
  await assert.rejects(()=>P.buildModPackage(libraries,'mod',undefined,options),/256 个目录/);
  await P.buildModPackage(libraries.slice(0,127),'mod',undefined,options);
});
test('Mod rejects duplicate Items IDs and filenames, but warns about overwriting same event ID',async()=>{
  const entry={Id:'sample.event',Name:'节庆',Description:'描述'};
  const events=[{type:'Events',name:'one',data:{...metadata,Entries:[entry]}},{type:'Events',name:'two',data:{...metadata,Entries:[entry]}}];
  const result=await P.buildModPackage(events,'mod',undefined,options);
  assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/整条覆盖/);
  const shared={type:'Items',data:itemData(),files:{'icons/herb.png':png()}};
  await assert.rejects(()=>P.buildModPackage([{...shared,name:'one'},{...shared,name:'two'}],'mod',undefined,options),/重复 ID/);
  await assert.rejects(()=>P.buildModPackage([{type:'CityNames',name:'same',data:names(['甲'])},{type:'CityNames',name:'SAME',data:names(['乙'])}],'mod',undefined,options),/路径重复/);
});
test('name pools enforce the merged unique limit and allow shared names without counting twice',async()=>{
  const values=Array.from({length:3000},(_,i)=>'name'+i);
  await P.buildModPackage([{type:'NPCNames',name:'a',data:names(values)},{type:'NPCNames',name:'b',data:names(values)}],'names',undefined,options);
  await assert.rejects(()=>P.buildModPackage([{type:'NPCNames',name:'a',data:names(values)},{type:'NPCNames',name:'b',data:names(values.map(value=>'other'+value))}],'names',undefined,options),/5000/);
});
test('merged event and dialogue libraries enforce runtime aggregate limits after ID replacement',async()=>{
  const makeEntries=(prefix)=>Array.from({length:3000},(_,i)=>({Id:prefix+i,Name:'条目',Description:''}));
  await assert.rejects(()=>P.buildModPackage([{type:'Events',name:'a',data:{...metadata,Entries:makeEntries('a')}},{type:'Events',name:'b',data:{...metadata,Entries:makeEntries('b')}}],'events',undefined,options),/5000/);
  const makeLines=(prefix)=>Array.from({length:3000},(_,i)=>({Id:prefix+i,Scene:'ambient',Text:{Text:'你好'}}));
  await assert.rejects(()=>P.buildModPackage([{type:'Dialogues',name:'a',data:{...metadata,Lines:makeLines('a')}},{type:'Dialogues',name:'b',data:{...metadata,Lines:makeLines('b')}}],'dialogues',undefined,options),/合计超过 5000/);
  const makeLargeLines=(prefix)=>Array.from({length:1500},(_,i)=>({Id:prefix+i,Scene:'ambient',Text:{Text:'x'.repeat(4000)}}));
  await assert.rejects(()=>P.buildModPackage([{type:'Dialogues',name:'a',data:{...metadata,Lines:makeLargeLines('a')}},{type:'Dialogues',name:'b',data:{...metadata,Lines:makeLargeLines('b')}}],'dialogues',undefined,options),/合并后的对话库超过 10 MiB/);
});
test('JSON limits, 256 manifests, 32 MiB package and unique PNG pixel limit apply',async()=>{
  await assert.rejects(()=>P.buildItemPackage(itemData([{...item(),Description:'x'.repeat(P.LIMITS.jsonBytes)}]),'large',{'icons/herb.png':png()},options),/10 MiB/);
  await assert.rejects(()=>P.buildModPackage(Array.from({length:257},(_,i)=>({type:'CityNames',name:'n'+i,data:names(['n'])})),'many',undefined,options),/256/);
  assert.throws(()=>P.buildZipEntries([{path:'a',bytes:new Uint8Array(17*1024*1024)},{path:'b',bytes:new Uint8Array(16*1024*1024)}]),/32 MiB/);
  const images=new Map(),entries=[];
  for(let i=0;i<5;i++) {images.set('icons/'+i+'.png',png(2048,2048,i));entries.push(item('sample.herb'+i,'icons/'+i+'.png'));}
  await assert.rejects(()=>P.buildItemPackage(itemData(entries),'pixels',images,options),/16,777,216/);
});
test('unknown categories, misplaced root fields, credentials and absent validators are refused',async()=>{
  await assert.rejects(()=>P.buildModPackage([{type:'Diseases',name:'bad',data:{...metadata,Entries:[]}}],'bad',undefined,options),/不支持/);
  await assert.rejects(()=>P.buildModPackage([{type:'CityNames',name:'bad',data:{...names(['甲']),Entries:[]}}],'bad',undefined,options),/误分类/);
  await assert.rejects(()=>P.buildModPackage([{type:'CityNames',name:'bad',data:{...names(['甲']),ApiKey:'key'}}],'bad',undefined,options),/凭据/);
  await assert.rejects(()=>P.buildModPackage([{type:'CityNames',name:'bad',data:names(['甲'])}],'bad'),/校验器/);
  await assert.rejects(()=>P.buildModPackage([{type:'CityNames',name:'old',data:{Items:['甲']}}],'old',undefined,options),/SchemaVersion/);
});
test('available GLAssets validator is always rerun even when Node options mark prior validation',async()=>{
  const original=global.GLAssets;let checks=0;
  try {
    global.GLAssets={validate(data,type){checks++;assert.equal(type,'CityNames');throw new Error('validator rejected library');}};
    await assert.rejects(()=>P.buildModPackage([{type:'CityNames',name:'test',data:names(['甲'])}],'mod',undefined,options),/validator rejected/);
    assert.equal(checks,1);
  } finally {if(original)global.GLAssets=original;else delete global.GLAssets;}
});
test('HTTP browser without Web Crypto hashes PNG files with a verified local SHA-256 fallback',async()=>{
  const context=vm.createContext({TextEncoder,Uint8Array,Uint32Array,ArrayBuffer,DataView,Blob,Map,createImageBitmap:async()=>({width:1,height:1,close(){}})});
  vm.runInContext(fs.readFileSync(require.resolve('../package-export.js'),'utf8'),context);
  for(const image of [png(),png(1,1,10),png(1,1,255)]) {
    const info=await context.GLPackages.addPng(new Map(),'icons/test.png',image);
    assert.equal(info.hash,crypto.createHash('sha256').update(image).digest('hex'));
    assert.equal(info.decoded,true);
  }
});
test('same-package Events and Festivals use actual scoped Items IDs, tags and quality tags without mutating the profile',async()=>{
  const original=global.GLAssets;
  try {
    const A=require('../assets.js');
    A.configureProfile(require('../content-profile.json'));global.GLAssets=A;
    const snapshot=JSON.stringify(A.getProfile());
    const external=item('designer.pack.herb');external.Tags=['同包草药'];external.Rarity='Rare';
    const items={type:'Items',name:'herbs',data:itemData([external]),files:{'icons/herb.png':png()}};
    const event={...metadata,Entries:[{Id:'designer.pack.event',Name:'药材赠礼',Description:'同包奖励',TriggerPhase:'Manual',TriggerConditions:[{Type:'HasItem',Target:'Actor',Param:external.Id,Threshold:1,Op:'GreaterEqual'}],TriggerConsequences:[{Type:'GiveItemEffect',Parameters:{ItemId:external.Id,Qty:1,Target:'Char',TargetMode:'Self'}},{Type:'ModifyPriceMultiplierEffect',Parameters:{Selection:'Item',ItemId:external.Id,Multiplier:1.2}},{Type:'ModifyPriceMultiplierEffect',Parameters:{Selection:'Tag',ItemTag:'同包草药',Multiplier:1.2}},{Type:'ModifyPriceMultiplierEffect',Parameters:{Selection:'Tag',ItemTag:'精英',Multiplier:1.2}}],Options:[{OptionText:'交付药材',Conditions:[{Type:'HasItem',Param:external.Id,Threshold:1,Op:'GreaterEqual'}],Consequences:[{Type:'RemoveItemEffect',Parameters:{ItemId:external.Id,Qty:1}}]}]}]};
    assert.throws(()=>A.validate(event,'Events'),/不存在/);
    const resources=P.packageResources([items]);
    assert.deepEqual(resources,{items:[external.Id],commodities:[external.Id],itemTags:['同包草药','精英']});
    const clean=P.validateLibraryInPackage(event,'Events',[items]);
    assert.equal(clean.Entries[0].TriggerConsequences[0].Parameters.ItemId,external.Id);
    const libraries=[{type:'Events',name:'gift',data:event},items,{type:'Festivals',name:'festival',data:{...metadata,Entries:[{...event.Entries[0],Id:'designer.pack.festival',Name:'草药节',Options:[]}]}}];
    const result=P.validateLibraries(libraries);
    assert.equal(result.libraries.length,3);assert.equal(result.resources.items[0],external.Id);
    const output=await P.buildModPackage(libraries,'scoped',undefined,options);
    const zip=unzipStored(new Uint8Array(await output.blob.arrayBuffer()));
    assert.equal(JSON.parse(Buffer.from(zip.get('scoped/NameLibraries/Events/gift.json')).toString()).Entries[0].TriggerConsequences[0].Parameters.ItemId,external.Id);
    assert.equal(JSON.stringify(A.getProfile()),snapshot);
    assert.throws(()=>A.validate(event,'Events'),/不存在/);
    const invalid=structuredClone(event);invalid.Entries[0].TriggerConditions[0].Param='designer.pack.missing';
    await assert.rejects(()=>P.buildModPackage([{type:'Events',name:'bad',data:invalid},items],'bad',undefined,options),/不存在/);
    const invalidEffect=structuredClone(event);invalidEffect.Entries[0].TriggerConsequences[0].Parameters.ItemId='designer.pack.missing';
    assert.throws(()=>P.validateLibraryInPackage(invalidEffect,'Events',[items]),/不存在/);
    assert.equal(JSON.stringify(A.getProfile()),snapshot);
  } finally {if(original)global.GLAssets=original;else delete global.GLAssets;}
});
test('separate same-package Items libraries can reference one another in consumable effects',async()=>{
  const original=global.GLAssets;
  try {
    const A=require('../assets.js');A.configureProfile(require('../content-profile.json'));global.GLAssets=A;
    const herb={type:'Items',name:'herb',data:itemData(),files:{'icons/herb.png':png()}};
    const potion=item('designer.pack.potion');potion.Category='Consumable';potion.UseEffects=[{Type:'GiveItemEffect',Parameters:{ItemId:'sample.herb',Qty:1}}];
    const library={type:'Items',name:'potion',data:itemData([potion]),files:{'icons/herb.png':png()}};
    assert.throws(()=>A.validate(library.data,'Items'),/不存在/);
    assert.equal(P.validateLibraryInPackage(library.data,'Items',[herb]).Entries[0].UseEffects[0].Parameters.ItemId,'sample.herb');
    await P.buildModPackage([library,herb],'related',undefined,options);
    const missing=structuredClone(library.data);missing.Entries[0].UseEffects[0].Parameters.ItemId='sample.missing';
    await assert.rejects(()=>P.buildModPackage([{...library,data:missing},herb],'related',undefined,options),/不存在/);
  } finally {if(original)global.GLAssets=original;else delete global.GLAssets;}
});

