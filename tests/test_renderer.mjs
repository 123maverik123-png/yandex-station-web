import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../static/renderer-profile.js',import.meta.url),'utf8');
const {rendererProfile}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const original={id:'lite2',name:'Lite 2',clock:true,boot:true};
const cases=[
  [{hostname:'Yandex-Mini3-6CAK'},'mini3'],
  [{hostname:'Yandex-Mini-gen3-6CAK'},'mini3'],
  [{hostname:'Yandex-Mini3-Pro-H6QK'},'mini3pro'],
  [{hostname:'Yandex-Mini-gen3-Pro-H6QK'},'mini3pro'],
  [{hostname:'Yandex-Lite-gen2-NJ0C'},'lite2'],
  [{hostname:'Yandex-Station-gen2'},'station2'],
  [{hardware_model:'Yandex Bergamot EVT1',hostname:'renamed'},'mini3'],
  [{hardware_model:'Yandex Pickle EVT1',hostname:'Yandex-Mini3-6CAK'},'mini3pro'],
  [{hostname:'Yandex-Mini2-1234'},'lite2'],
];
for(const [identity,expected]of cases){
  const result=rendererProfile(original,identity);
  assert.equal(result.id,expected,JSON.stringify(identity));
  assert.equal(result.clock,true);assert.equal(result.boot,true); // Detection never enables hardware writes.
}
assert.equal(rendererProfile({id:'station2',name:'Station 2'},{hostname:'renamed'}).id,'station2');
assert.deepEqual(original,{id:'lite2',name:'Lite 2',clock:true,boot:true});
console.log('10 renderer identity cases passed; hardware profile unchanged');
