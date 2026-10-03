import * as THREE from 'three'

/* parquet — lower res (P1 textures) */
const wood=(()=>{const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d')!
 for(let i=0;i<8;i++){let y=0;while(y<512){const len=140+Math.random()*210,l=62+Math.random()*7
  x.fillStyle=`hsl(${32+Math.random()*4},${36+Math.random()*6}%,${l}%)`;x.fillRect(i*64,y,64,len)
  for(let k=0;k<14;k++){x.strokeStyle=`rgba(90,60,30,${.03+Math.random()*.05})`;const gx=i*64+Math.random()*64;x.beginPath();x.moveTo(gx,y);x.lineTo(gx+(Math.random()-.5)*6,y+len);x.stroke()}
  x.fillStyle='rgba(60,40,20,.28)';x.fillRect(i*64,y,64,2);y+=len}
  x.fillStyle='rgba(60,40,20,.3)';x.fillRect(i*64,0,2,512)}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(38/5,26/5);t.anisotropy=4;t.colorSpace=THREE.SRGBColorSpace;return t})()
/* room-scale parquet — same plank language as hall, shared by desks+Skills */
const roomWood=(()=>{const t=wood.clone();t.repeat=new THREE.Vector2(8.4/5,8.4/5);t.needsUpdate=true;return t})()

export { wood, roomWood }
