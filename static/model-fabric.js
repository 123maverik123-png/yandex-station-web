// Procedural knitted yarns. No product photograph or remote texture is required.
export function makeWeave(THREE,repeatU=9,repeatV=2.5){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d');c.fillStyle='#777';c.fillRect(0,0,256,256);
  for(let y=-16;y<272;y+=16)for(let x=-16;x<272;x+=16){
    c.lineCap='round';
    for(const[width,color,shift]of[[8,'#343434',2],[5,'#b2b2b2',0],[1.3,'#eeeeee',-1]]){
      c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x+2,y+shift);
      c.quadraticCurveTo(x+4,y+10+shift,x+8,y+14+shift);c.quadraticCurveTo(x+13,y+8+shift,x+14,y+shift);c.stroke();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(repeatU,repeatV);return texture;
}
