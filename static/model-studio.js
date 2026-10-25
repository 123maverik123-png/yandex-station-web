// MIT: original visual reconstructions; see models/SOURCES.md.
import * as T from 'three';
import { OrbitControls } from './vendor/three/OrbitControls.js';
export function createModel(profile){
const view=document.getElementById('model-view'),mini=profile.id==='mini3pro'||profile.id==='mini3';
view.setAttribute('role','group');view.setAttribute('aria-label','3D-модель: вращайте мышью или пальцем');view.classList.add('studio-view');
// Preserve upstream visualizer canvas and the references held by its animation loop.
view.insertAdjacentHTML('beforeend','<div class="studio-tools"><button type="button" id="studio-home" title="Исходный ракурс" aria-label="Исходный ракурс">↺</button><button type="button" id="studio-spin" title="Автовращение" aria-label="Автовращение" aria-pressed="false">⟳</button><select id="studio-color" aria-label="Цвет корпуса"></select></div><div class="studio-caption">Вращайте · приближайте</div><a class="studio-source" href="' + new URL('./models/SOURCES.md',import.meta.url).href + '" target="_blank" title="Модели воссозданы по фотографиям производителя">О модели</a>');
const palette=profile.id==='mini3'?{black:['Чёрный','#34343a'],grey:['Серый','#a0a2a8'],violet:['Лиловый','#9b8eaa'],teal:['Бирюзовый','#6aa6a7']}:mini?{black:['Графит','#34343a'],grey:['Серый','#888b91'],blue:['Синий','#355d82']}:{black:['Антрацит','#3b3c40'],blue:['Кобальт','#485c85'],copper:['Медный','#a66d5d'],sand:['Песочный','#c5baaa'],red:['Рубин','#8c3447']};
const colorPicker=document.getElementById('studio-color');
for(const[key,[label]]of Object.entries(palette))colorPicker.add(new Option(label,key));
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch(e){view.insertAdjacentHTML('beforeend','<p class="studio-error">Для объёмной модели включите WebGL в браузере.</p>');throw e;}
renderer.domElement.className='studio-canvas';renderer.domElement.setAttribute('aria-label',profile.name+' — вращаемая 3D-модель');
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;view.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1,1,2500),controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.enablePan=false;controls.minDistance=mini?135:240;controls.maxDistance=mini?520:820;controls.maxPolarAngle=Math.PI*.91;controls.autoRotateSpeed=.7;
const group=new T.Group();scene.add(group);
// Broad studio softboxes reflected in the satin plastic and top glass.
const studio=new T.Scene();studio.background=new T.Color('#494a51');
for(const[x,y,z,w,h,power]of[[-180,120,70,120,220,4],[160,100,20,65,220,3],[0,220,-70,180,80,5]]){const panel=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color().setScalar(power),side:T.DoubleSide}));panel.position.set(x,y,z);panel.lookAt(0,40,0);studio.add(panel);}
const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.04);scene.environment=environment.texture;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
scene.add(new T.HemisphereLight(0xf1f4ff,0x45404b,2));
const keyLight=new T.DirectionalLight(0xfff5e9,3.2);keyLight.position.set(-140,220,180);scene.add(keyLight);keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);Object.assign(keyLight.shadow.camera,{left:-160,right:160,top:200,bottom:-160,near:1,far:700});keyLight.shadow.normalBias=.15;keyLight.shadow.bias=-.0002;keyLight.shadow.radius=4;
const fill=new T.DirectionalLight(0xd7e4ff,1.5);fill.position.set(160,80,-100);scene.add(fill);
function canvasTexture(size,draw){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;draw(canvas.getContext('2d'),size);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;}
// Repeating knitted yarns supply real surface normals, without shipping product images.
const weave=canvasTexture(256,(c,n)=>{c.fillStyle='#777';c.fillRect(0,0,n,n);for(let y=-16;y<n+16;y+=16)for(let x=-16;x<n+16;x+=16){c.lineCap='round';for(const[width,color,shift]of[[8,'#343434',2],[5,'#b2b2b2',0],[1.3,'#eeeeee',-1]]){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x+2,y+shift);c.quadraticCurveTo(x+4,y+10+shift,x+8,y+14+shift);c.quadraticCurveTo(x+13,y+8+shift,x+14,y+shift);c.stroke();}}});
weave.colorSpace=T.NoColorSpace;weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(mini?10:14,mini?3:8);weave.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const yarnColor=weave.clone();yarnColor.colorSpace=T.SRGBColorSpace;yarnColor.needsUpdate=true;
const fabric=new T.MeshPhysicalMaterial({color:palette.black[1],map:yarnColor,roughness:.94,metalness:0,bumpMap:weave,bumpScale:.36,sheen:.65,sheenColor:new T.Color('#b2b4c0'),sheenRoughness:.85});
const plastic=new T.MeshPhysicalMaterial({color:'#27282d',roughness:.48,metalness:.08,clearcoat:.2,clearcoatRoughness:.5});
const rubber=new T.MeshStandardMaterial({color:'#101114',roughness:.85}),glass=new T.MeshPhysicalMaterial({color:'#303139',roughness:.32,metalness:.14,clearcoat:1,clearcoatRoughness:.28});
function mesh(geo,mat,x=0,y=0,z=0,parent=group){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function roundedShape(w,d,r){const s=new T.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;}
function roundedBox(w,h,d,r,b=1){const geo=new T.ExtrudeGeometry(roundedShape(w-2*b,d-2*b,Math.max(1,r-b)),{depth:h-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:5,steps:1,curveSegments:16});geo.rotateX(-Math.PI/2);geo.translate(0,-h/2+b,0);geo.computeVertexNormals();return geo;}
const ledMaterials=[];
function ledMaterial(){const m=new T.MeshStandardMaterial({color:'#181820',emissive:'#000000',emissiveIntensity:0,roughness:.28,metalness:.05});ledMaterials.push(m);return m;}
function port(y,z){mesh(roundedBox(10,4,1.5,1.9,.3),rubber,0,y,z);mesh(roundedBox(6,1.5,1.8,.7,.2),new T.MeshStandardMaterial({color:'#727078',metalness:.7,roughness:.5}),0,y,z-.15);}
let topY,baseY,clockSegments=[];
if(mini){
  const points=[[0,-35],[43,-35],[47,-34],[49.4,-31],[50.4,-26],[51,-18],[51,20],[50.8,28],[49.6,31],[0,31]].map(p=>new T.Vector2(...p));
  const shell=new T.LatheGeometry(points,192),shellUV=shell.attributes.uv,shellPosition=shell.attributes.position;
  for(let i=0;i<shellUV.count;i++)shellUV.setY(i,(shellPosition.getY(i)+35)/66);
  mesh(shell,fabric);
  mesh(new T.CylinderGeometry(49.5,47.6,3,160),plastic,0,-33.6);mesh(new T.CylinderGeometry(43,43,1.2,128),rubber,0,-35.6);
  if(profile.id!=='mini3')for(let i=0;i<16;i++)mesh(new T.CylinderGeometry(50.7,50.7,2.3,16,1,true,i*Math.PI/8,Math.PI/8+.005),ledMaterial(),0,30.1);
  mesh(new T.CylinderGeometry(50.6,50.8,2,192),plastic,0,32.1);mesh(new T.CylinderGeometry(50.2,50.2,.6,192),glass,0,33.4);topY=33.8;baseY=-36.2;port(-25,-50.1);
  if(profile.id==='mini3'){group.scale.y=60.5/71;const indicator=mesh(new T.RingGeometry(3.6,5.2,64),ledMaterial(),0,33.85);indicator.rotation.x=-Math.PI/2;}
}else{
  const body=roundedBox(123,190,99,21,3),positions=body.attributes.position,uv=body.attributes.uv;
  // ExtrudeGeometry uses millimetres as UVs; normalize to avoid subpixel aliasing.
  for(let i=0;i<uv.count;i++)uv.setXY(i,Math.atan2(positions.getX(i),positions.getZ(i))/(2*Math.PI)+.5,(positions.getY(i)+95)/190);
  mesh(body,fabric,0,-1.5);mesh(roundedBox(118,6,94,19,1),plastic,0,-96.5);mesh(roundedBox(107,1.4,84,16,.5),rubber,0,-99.3);
  mesh(roundedBox(122,2.6,98,21,.7),ledMaterial(),0,94.5);mesh(roundedBox(121,3,97,21,.9),glass,0,97.1);
  const lightMap=canvasTexture(256,(c,n)=>{const g=c.createLinearGradient(0,0,n,n);g.addColorStop(0,'#68d3ff');g.addColorStop(.45,'#9e7bff');g.addColorStop(1,'#e89ad7');c.fillStyle=g;c.fillRect(0,0,n,n);});
  const topMaterial=new T.MeshPhysicalMaterial({color:'#a5a2b7',map:lightMap,emissive:'#706187',emissiveMap:lightMap,emissiveIntensity:.18,roughness:.6,metalness:.02,transparent:true,opacity:.8});ledMaterials.push(topMaterial);
  const top=mesh(new T.ShapeGeometry(roundedShape(115,91,18),32),topMaterial,0,98.65);top.rotation.x=-Math.PI/2;topY=99;baseY=-100;port(-85,-49.6);
}
const controlsTex=canvasTexture(512,(c,n)=>{c.strokeStyle='#d6d6dc';c.fillStyle='#d6d6dc';c.lineWidth=2;c.lineCap='round';for(const x of[100,412]){c.beginPath();c.moveTo(x-10,256);c.lineTo(x+10,256);if(x>256){c.moveTo(x,246);c.lineTo(x,266);}c.stroke();}c.beginPath();c.ellipse(256,256,25,19,0,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(242,262);c.quadraticCurveTo(256,225,270,262);c.closePath();c.fill();c.fillStyle='#090a0c';for(const[x,y]of[[162,128],[350,128],[162,384],[350,384]]){c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();}});
const topMarks=mesh(new T.PlaneGeometry(mini?98:117,mini?98:93),new T.MeshBasicMaterial({map:controlsTex,transparent:true,depthWrite:false,opacity:.72}),0,topY+.05);topMarks.rotation.x=-Math.PI/2;topMarks.castShadow=false;
if(mini){
  const white=new T.MeshStandardMaterial({color:'#fff9e8',emissive:'#fff2d6',emissiveIntensity:2,roughness:.8,toneMapped:false});
  function horizontal(){const s=new T.Shape();s.moveTo(-3.5,0);s.lineTo(-2.5,1);s.lineTo(2.5,1);s.lineTo(3.5,0);s.lineTo(2.5,-1);s.lineTo(-2.5,-1);s.closePath();return new T.ShapeGeometry(s);}
  const positions=[[0,10,0],[4.2,5,1],[4.2,-5,1],[0,-10,0],[-4.2,-5,1],[-4.2,5,1],[0,0,0]];
  for(let digit=0;digit<4;digit++)for(let j=0;j<8;j++){const[dx,dy,vertical]=positions[j]||[0,3,0],x=[-19,-7,7,19][digit]+dx,theta=x/51;const seg=mesh(j===7?new T.CircleGeometry(.7,12):horizontal(),white,51.3*Math.sin(theta),dy-3,51.3*Math.cos(theta));seg.rotation.y=theta;if(vertical){seg.geometry.scale(1.25,.8,1);seg.rotateZ(Math.PI/2);}seg.castShadow=false;seg.visible=false;clockSegments.push(seg);}
  for(const[x,y]of[[29,10],[0,1],[0,-7],[0,-3]]){const theta=x/51,geometry=clockSegments.length===32?new T.RingGeometry(.9,1.4,20):clockSegments.length===35?new T.PlaneGeometry(3,1):new T.CircleGeometry(.9,16),s=mesh(geometry,white,51.3*Math.sin(theta),y,51.3*Math.cos(theta));s.rotation.y=theta;s.visible=false;s.castShadow=false;clockSegments.push(s);}
}
let dirty=true;
window.modelShow=values=>{clockSegments.forEach((s,i)=>{s.visible=Number(values?.[i])>0;});dirty=true;};
window.modelRing=leds=>{if(!leds?.length)return;ledMaterials.forEach((m,i)=>{const rgb=leds[Math.floor(i*leds.length/ledMaterials.length)]||[0,0,0],color=new T.Color().setRGB(...rgb.map(v=>Math.max(0,Math.min(255,v))/255),T.SRGBColorSpace);m.color.copy(color);m.emissive.copy(color);m.emissiveIntensity=.55;});dirty=true;};
function paint(key){key=palette[key]?key:'black';fabric.color.set(palette[key][1]);plastic.color.copy(fabric.color).multiplyScalar(.65);colorPicker.value=key;dirty=true;}
window.modelColor=key=>{if(!localStorage.getItem('model-color-'+profile.id))paint(key);};paint(localStorage.getItem('model-color-'+profile.id)||window.__deviceColor||'black');
colorPicker.addEventListener('change',()=>{localStorage.setItem('model-color-'+profile.id,colorPicker.value);paint(colorPicker.value);});
const floor=new T.Mesh(new T.PlaneGeometry(650,650),new T.ShadowMaterial({color:'#101018',opacity:.21}));floor.rotation.x=-Math.PI/2;floor.position.y=baseY;floor.receiveShadow=true;scene.add(floor);
const contact=canvasTexture(128,(c,n)=>{const g=c.createRadialGradient(n/2,n/2,3,n/2,n/2,n/2);g.addColorStop(0,'rgba(0,0,0,.4)');g.addColorStop(.6,'rgba(0,0,0,.12)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,n,n);});
const shadow=new T.Mesh(new T.PlaneGeometry(mini?155:185,mini?140:160),new T.MeshBasicMaterial({map:contact,transparent:true,depthWrite:false,opacity:.5}));shadow.rotation.x=-Math.PI/2;shadow.position.y=baseY+.05;scene.add(shadow);
if(profile.id==='mini3'){baseY*=60.5/71;floor.position.y=baseY;shadow.position.y=baseY+.05;}
function home(){camera.position.set(mini?55:240,mini?83:155,mini?258:420);controls.target.set(0,mini?-4:0,0);controls.update();dirty=true;}home();
document.getElementById('studio-home').addEventListener('click',home);
document.getElementById('studio-spin').addEventListener('click',e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));dirty=true;});
controls.addEventListener('change',()=>{dirty=true;});controls.addEventListener('start',()=>{view.classList.add('studio-used');});
let visible=true,last=0;new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;dirty=true;}).observe(view);
new ResizeObserver(()=>{const{width,height}=view.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();dirty=true;}}).observe(view);
function frame(now){requestAnimationFrame(frame);if(document.hidden||!visible||now-last<33)return;last=now;controls.update();if(dirty||controls.autoRotate){renderer.render(scene,camera);dirty=false;view.dataset.renderer='webgl';view.dataset.model=profile.id;}}requestAnimationFrame(frame);

}
