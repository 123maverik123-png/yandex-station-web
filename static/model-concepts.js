// MIT: approximate gallery-only bodies based on public product photos. Hardware support is not implied.
const pal=(...items)=>Object.fromEntries(items.map(([key,label,color])=>[key,[label,color]]));
const BLACK=pal(['black','Чёрный','#2f3036']);
const STATION=pal(['black','Чёрный','#2f3036'],['grey','Серебристый','#a9abb1'],['purple','Фиолетовый','#5b43b8']);
const SPEAKER=pal(['black','Графит','#34353b'],['beige','Бежевый','#cfc5b4'],['blue','Синий','#3f5d86']);
const MINI=pal(['black','Графит','#34353b'],['grey','Серый','#8d9096'],['blue','Синий','#3f5d86'],['red','Красный','#9a3a3f']);

// Builders receive the studio kit: Three.js, shared materials and mesh helpers. Sizes are in millimetres.
function clock(kit,text='12:35',color='#fff4e4'){
  return kit.canvasTexture(512,(c,n)=>{c.fillStyle=color;c.shadowColor=color;c.shadowBlur=18;c.font='500 170px system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,n/2,n/2);});
}
function face(kit,map,w,h,x,y,z){
  const m=kit.mesh(new kit.T.PlaneGeometry(w,h),new kit.T.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false}),x,y,z);m.renderOrder=2;return m;
}
// Screens: dark glass with a soft Alice-coloured glow, optional clock.
function screenTexture(kit,text){
  return kit.canvasTexture(512,(c,n)=>{const g=c.createLinearGradient(0,0,n,n);g.addColorStop(0,'#0c0e1a');g.addColorStop(.6,'#1b1838');g.addColorStop(1,'#3b2563');c.fillStyle=g;c.fillRect(0,0,n,n);
    if(text){c.fillStyle='#fff';c.font='600 112px system-ui,sans-serif';c.textAlign='center';c.fillText(text,n/2,n/2+36);}});
}
function cyl(kit,r,h,mat,y,open=false){return kit.mesh(new kit.T.CylinderGeometry(r,r,h,128,1,open),mat,0,y);}
function curvedClock(kit,r,y){
  const arc=50/r,m=kit.mesh(new kit.T.CylinderGeometry(r,r,25,48,1,true,-arc/2,arc),new kit.T.MeshBasicMaterial({map:clock(kit),transparent:true,depthWrite:false,toneMapped:false}),0,y);m.renderOrder=2;
}
function square(kit,{w,h,r,top='plate',display}){
  const {mesh,roundedBox,fabric,plastic,rubber,glass,ledMaterial,T}=kit;
  mesh(roundedBox(w,h,w,r,3),fabric);mesh(roundedBox(w-6,6,w-6,r,1),rubber,0,-h/2-3);
  if(top==='knob'){mesh(roundedBox(w,8,w,r,2),plastic,0,h/2+4);cyl(kit,46,3,ledMaterial(),h/2+9.5);cyl(kit,44,14,plastic,h/2+18);}
  else{mesh(roundedBox(w-1,3,w-1,r,1),ledMaterial(),0,h/2+1.5);mesh(roundedBox(w,4,w,r,1),glass,0,h/2+5);
    const ring=mesh(new T.RingGeometry(9,12,48),ledMaterial(),0,h/2+7.1);ring.rotation.x=-Math.PI/2;}
  if(display)face(kit,clock(kit),display,display/2,0,h*.12,w/2+.6);
  return {topY:h/2+(top==='knob'?25:7),baseY:-h/2-6};
}
function puck(kit,{r,h,display}){
  const {rubber,plastic,glass,ledMaterial,fabric}=kit;
  cyl(kit,r,h,fabric,0);cyl(kit,r-4,3,rubber,-h/2-1.5);cyl(kit,r,4,plastic,h/2+2);cyl(kit,r-.6,1,glass,h/2+4.5);
  cyl(kit,r+.3,2,ledMaterial(),h/2-1,true);
  if(display)curvedClock(kit,r+.25,-2);
  return {topY:h/2+5,baseY:-h/2-3};
}
function tv(kit,{w,bezel=1.4,feet='edge',strip=false}){
  const {mesh,roundedBox,plastic,rubber,ledMaterial,fabric,T}=kit,h=w*.5625,y=h/2+22;
  mesh(roundedBox(w,h,7,2,.8),fabric,0,y,-1);
  mesh(new T.PlaneGeometry(w-bezel*2,h-bezel*2),new T.MeshBasicMaterial({map:screenTexture(kit),toneMapped:false}),0,y,2.6);
  if(strip)mesh(roundedBox(w*.38,1.6,5,.8,.3),ledMaterial(),0,y-h/2-1.2,1);
  if(feet==='center'){mesh(roundedBox(18,22,8,3,1),plastic,0,11,-2);mesh(roundedBox(w*.34,3,42,4,1),rubber,0,1.5,-2);}
  else for(const s of[-1,1]){const foot=mesh(roundedBox(4,26,36,2,.8),plastic,s*(w/2-w*.08),11,-2);foot.rotation.z=s*.42;}
  return {topY:y+h/2,baseY:0};
}

export const CONCEPTS={
  max:{name:'Яндекс Станция Макс',colors:STATION,build:kit=>square(kit,{w:141,h:215,r:8,top:'knob',display:76})},
  station3:{name:'Яндекс Станция 3',colors:SPEAKER,build:kit=>square(kit,{w:126,h:198,r:28})},
  midi:{name:'Яндекс Станция Миди',colors:SPEAKER,build:kit=>square(kit,{w:150,h:146,r:24,display:78})},
  // Street usually lies on its side; the studio turns it after building.
  street:{name:'Яндекс Станция Стрит',lying:true,colors:pal(['black','Чёрный','#2c2d31'],['green','Хаки','#555e4b']),build:kit=>{
    const {mesh,rubber,ledMaterial,T}=kit;cyl(kit,38,220,kit.fabric,0);cyl(kit,38.6,10,rubber,-115);cyl(kit,38.6,10,rubber,115);cyl(kit,30,2,ledMaterial(),121);
    for(let i=0;i<5;i++){const b=mesh(new T.CylinderGeometry(5,5,2,32),rubber,0,50-i*16,38.4);b.rotation.x=Math.PI/2;}
    return {topY:122,baseY:-120};}},
  duomax:{name:'Яндекс Станция Дуо Макс',colors:SPEAKER,build:kit=>{
    const {mesh,roundedBox,glass,T}=kit;mesh(roundedBox(170,104,96,20,3),kit.fabric,0,52,-52);
    const screen=new T.Group();screen.position.set(0,88,8);screen.rotation.x=-.22;kit.group.add(screen);mesh(roundedBox(250,168,10,9,2),glass,0,0,0,screen);
    const ui=screenTexture(kit,'12:35');
    mesh(new T.PlaneGeometry(234,152),new T.MeshBasicMaterial({map:ui,toneMapped:false}),0,0,5.2,screen);return {topY:170,baseY:0};}},
  station:{name:'Яндекс Станция',colors:STATION,build:kit=>square(kit,{w:141,h:215,r:8,top:'knob'})},
  mini2:{name:'Яндекс Станция Мини с часами',colors:MINI,build:kit=>puck(kit,{r:48.5,h:48,display:true})},
  mini2nc:{name:'Яндекс Станция Мини без часов',colors:MINI,build:kit=>puck(kit,{r:48.5,h:48})},
  mini1:{name:'Яндекс Станция Мини (версия 1)',colors:pal(['black','Чёрный','#28292e'],['grey','Серый','#8d9096']),build:kit=>puck(kit,{r:45,h:38})},
  tv:{name:'ТВ Станция',colors:BLACK,build:kit=>tv(kit,{w:220,strip:true})},
  tvminiled:{name:'ТВ Станция MiniLED',colors:BLACK,build:kit=>tv(kit,{w:240,bezel:1})},
  tvprominiled:{name:'ТВ Станция Про MiniLED',colors:BLACK,build:kit=>tv(kit,{w:260,bezel:.8,feet:'center'})},
  tv2:{name:'ТВ Станция 2',colors:BLACK,build:kit=>tv(kit,{w:230,bezel:1,strip:true})},
  tvbasic:{name:'ТВ Станция Бейсик',colors:BLACK,build:kit=>tv(kit,{w:190,bezel:3})},
  tvbasicqled:{name:'ТВ Станция Бейсик QLED',colors:BLACK,build:kit=>tv(kit,{w:220,bezel:2})},
  // Drops: TWS charging case with the lid open and both earbuds in front, after the manufacturer's photos.
  drops:{name:'Яндекс Дропс',colors:pal(['white','Белый','#eeedea'],['black','Чёрный','#25262b']),build:kit=>{
    const {mesh,roundedBox,canvasTexture,ledMaterial,fabric,T}=kit,W=60,H=34,Dp=24;fabric.roughness=.3;   // glossy plastic
    const ink=new T.MeshStandardMaterial({color:'#0b0b0d',roughness:.15}),cup=new T.MeshStandardMaterial({color:'#222328',roughness:.12}),metal=new T.MeshStandardMaterial({color:'#b9bbc0',roughness:.35,metalness:.8});
    const decal=(map,w,h,x,y,z,rx,ry)=>{const m=mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map,transparent:true,roughness:.4,polygonOffset:true,polygonOffsetFactor:-1}),x,y,z);m.rotation.set(rx,ry,0);};
    mesh(roundedBox(W,H,Dp,10,3),fabric);mesh(roundedBox(W-6,1,Dp-6,8,.4),ink,0,H/2+.1);
    for(const s of[-1,1]){const c=mesh(new T.SphereGeometry(8,32,16),cup,s*13,H/2,0);c.scale.set(1.25,.3,.75);}
    const lid=new T.Group();lid.position.set(0,H/2,-Dp/2);lid.rotation.x=-1.8;kit.group.add(lid);
    mesh(roundedBox(W,12,Dp,10,3),fabric,0,5,Dp/2-1.5,lid);mesh(roundedBox(W-6,1,Dp-6,8,.4),ink,0,-1.2,Dp/2-1.5,lid);
    for(const s of[-1,1]){const c=mesh(new T.SphereGeometry(8,32,16),cup,s*13,-1.3,Dp/2-1.5,lid);c.scale.set(1.25,.3,.75);}
    mesh(roundedBox(26,6,1,1,.3),metal,0,H/2-4,-Dp/2-.2);                                     // hinge
    decal(canvasTexture(256,(c,n)=>{c.fillStyle='#c4c4c8';c.beginPath();c.arc(n/2,n/2,n/2-4,0,7);c.fill();c.fillStyle='#f4f4f4';c.font='700 150px system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('Я',n/2,n/2+8);}),9,9,0,H/2-15,-Dp/2-.05,0,Math.PI);
    decal(canvasTexture(512,(c,n)=>{c.strokeStyle='#cfcfd2';c.lineWidth=5;c.beginPath();c.arc(150,n/2,44,0,7);c.stroke();c.fillStyle='#d8d8dc';c.beginPath();c.roundRect(240,n/2-26,150,52,26);c.fill();c.fillStyle='#16161a';c.beginPath();c.roundRect(252,n/2-16,126,32,16);c.fill();}),Dp-4,Dp-4,0,-H/2-.05,0,Math.PI/2,0);   // button and USB-C
    const led=mesh(new T.CircleGeometry(1.2,16),ledMaterial(),0,6,Dp/2+.05);led.renderOrder=2;
    for(const[x,z,turn]of[[-22,34,.35],[24,30,Math.PI-.45]]){const bud=new T.Group();bud.position.set(x,-H/2+7,z);bud.rotation.y=turn;kit.group.add(bud);
      const stem=mesh(new T.CapsuleGeometry(3.4,22,8,16),fabric,9,-1,0,bud);stem.rotation.z=Math.PI/2;
      mesh(new T.SphereGeometry(7,32,16),fabric,-6,0,0,bud);const tip=mesh(new T.SphereGeometry(6.6,32,16),ink,-11,0,0,bud);tip.scale.set(.55,1,1);}
    return {topY:H/2+30,baseY:-H/2};}},
};
