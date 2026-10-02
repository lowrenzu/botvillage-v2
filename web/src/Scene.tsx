import {useEffect,useMemo,useRef,useState} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {ContactShadows,Html,RoundedBox} from '@react-three/drei'
import * as THREE from 'three'
import {agents,rooms,step,ui,useSim,selectAgent,go,CLICK_MOVE_MAX,skillBooks,talkPairs,type Agent,type Room,type SkillJSON} from './sim'

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))
type V3=[number,number,number]
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

function Rig(){
 /* camera: overview fits all 6 rooms; viewOffset shifts optical center into left of HUD */
 const {gl,camera,size}=useThree()
 const HOME={az:.62,el:.72,dist:60}
 const s=useRef({az:HOME.az,el:HOME.el,dist:HOME.dist,distWant:HOME.dist,tgt:new THREE.Vector3(),vaz:0,vel:0,dragging:false,booted:false})
 const want=useMemo(()=>new THREE.Vector3(),[]),camWant=useMemo(()=>new THREE.Vector3(),[])
 useEffect(()=>{const el=gl.domElement,v=s.current;let d=false
  const pts=new Map<number,{x:number,y:number}>()
  let pinch=0
  const span=()=>{const a=[...pts.values()];if(a.length<2)return 0;return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
  const dn=(e:PointerEvent)=>{pts.set(e.pointerId,{x:e.clientX,y:e.clientY});el.setPointerCapture(e.pointerId)
   if(pts.size>=2){d=false;v.dragging=false;pinch=span();return}
   d=true;v.dragging=true;v.vaz=0;v.vel=0;ui.moved=0}
  const up=(e:PointerEvent)=>{pts.delete(e.pointerId);pinch=pts.size>=2?span():0;if(pts.size===0){d=false;v.dragging=false}}
  const mv=(e:PointerEvent)=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY})
   if(pts.size>=2&&pinch>0){const dist=span();if(dist>0){v.distWant=clamp(v.distWant*(pinch/dist),14,80);pinch=dist;if(ui.frame)ui.frame.dist=v.distWant}return}
   if(!d)return;ui.moved+=Math.abs(e.movementX)+Math.abs(e.movementY)
   const daz=-e.movementX*.0045,del=e.movementY*.0038
   v.az+=daz;v.el=clamp(v.el+del,.28,1.25)
   v.vaz=daz*78;v.vel=del*78
   if(ui.moved>CLICK_MOVE_MAX)ui.frame=null}
  const wh=(e:WheelEvent)=>{e.preventDefault()
   const step=Math.sign(e.deltaY)*Math.min(Math.abs(e.deltaY),120)*.0009
   v.distWant=clamp(v.distWant*Math.exp(step||Math.sign(e.deltaY)*.07),14,80)
   if(ui.frame)ui.frame.dist=v.distWant}
  el.addEventListener('pointerdown',dn);el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('wheel',wh,{passive:false})
  return()=>{el.removeEventListener('pointerdown',dn);el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('wheel',wh)
   if((camera as THREE.PerspectiveCamera).clearViewOffset)(camera as THREE.PerspectiveCamera).clearViewOffset()}},[gl,camera])
 useFrame((_,dt)=>{dt=Math.min(dt,.033);step(dt);const v=s.current
  /* keep world (0,0) optically centered in the free left pane (HUD overlays right) */
  const rail=document.querySelector('.hud-rail') as HTMLElement|null
  let railW=48
  if(rail){const r=rail.getBoundingClientRect();railW=Math.max(48,r.width+(window.innerWidth-r.right)+14)}
  const cam=camera as THREE.PerspectiveCamera
  /* positive offsetX pans scene left into free pane (negative pushed it under the HUD) */
  if(size.width>720)cam.setViewOffset(size.width,size.height,railW*.55,0,size.width,size.height)
  else cam.clearViewOffset()
  if(!v.dragging){v.az+=v.vaz*dt;v.el=clamp(v.el+v.vel*dt,.28,1.25)
   const damp=Math.exp(-dt*1.75);v.vaz*=damp;v.vel*=damp
   if(Math.abs(v.vaz)<1e-4)v.vaz=0;if(Math.abs(v.vel)<1e-4)v.vel=0}
  const fr=ui.frame
  if(fr){const k=1-Math.exp(-dt*1.05)
   let daz=fr.az-v.az;daz=Math.atan2(Math.sin(daz),Math.cos(daz))
   v.az+=daz*k;v.el+=(fr.el-v.el)*k
   v.distWant+=(fr.dist-v.distWant)*k
   const bleed=Math.exp(-dt*7);v.vaz*=bleed;v.vel*=bleed
   if(ui.follow&&ui.sel){fr.x=ui.sel.x;fr.z=ui.sel.z}
   want.set(fr.x,0,fr.z)
  }else{
   want.set(0,0,0)
   if(ui.follow&&ui.sel){want.set(ui.sel.x,0,ui.sel.z);v.distWant+=(14-v.distWant)*(1-Math.exp(-dt*1.15))}
  }
  v.dist+=(v.distWant-v.dist)*(1-Math.exp(-dt*3.4))
  if(!v.booted){v.booted=true;v.tgt.copy(want);v.dist=v.distWant
   camWant.set(v.tgt.x+v.dist*Math.sin(v.az)*Math.cos(v.el),v.dist*Math.sin(v.el),v.tgt.z+v.dist*Math.cos(v.az)*Math.cos(v.el))
   camera.position.copy(camWant);camera.lookAt(v.tgt);return}
  v.tgt.lerp(want,1-Math.exp(-dt*1.55))
  camWant.set(v.tgt.x+v.dist*Math.sin(v.az)*Math.cos(v.el),v.dist*Math.sin(v.el),v.tgt.z+v.dist*Math.cos(v.az)*Math.cos(v.el))
  camera.position.lerp(camWant,1-Math.exp(-dt*2.15));camera.lookAt(v.tgt)})
 return null}

const Box=({p,a,c,e,r=0,ei=1,m=.1,ro=.55,shadow=false}:{p:V3;a:V3;c:string;e?:string;r?:number;ei?:number;m?:number;ro?:number;shadow?:boolean})=>
 <mesh position={p} rotation={[0,r,0]} castShadow={shadow} receiveShadow={shadow}><boxGeometry args={a}/><meshStandardMaterial color={c} emissive={e||'#000'} emissiveIntensity={ei} roughness={ro} metalness={m}/></mesh>
const AL='#d3d6da',GR='#8f9299',WH='#f2f0ec',WN='#6b5646'

const Plant=({p}:{p:V3})=><group position={p}>
 <mesh position={[0,.35,0]} castShadow><cylinderGeometry args={[.32,.26,.7,16]}/><meshStandardMaterial color="#efede8" roughness={.7}/></mesh>
 {[[0,1.1,0,.5],[.2,.8,.1,.32],[-.17,.85,-.1,.34]].map(([x,y,z,r],i)=><mesh key={i} position={[x,y,z]}><sphereGeometry args={[r,12,10]}/><meshStandardMaterial color="#4f8a62" roughness={.8}/></mesh>)}</group>
const cvs=(w:number,h:number,f:(x:CanvasRenderingContext2D)=>void)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d')!);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
const scr={
 code:cvs(256,160,x=>{x.fillStyle='#0f1420';x.fillRect(0,0,256,160);for(let i=0;i<18;i++){let px=12+(Math.random()*3|0)*12;for(let k=0,n=1+Math.random()*6|0;k<n;k++){const w=8+Math.random()*28;x.fillStyle=['#7aa2f7','#9ece6a','#e0af68','#bb9af7','#c0caf5'][Math.random()*5|0];x.globalAlpha=.85;x.fillRect(px,5+i*8.4,w,3.5);px+=w+4}}x.globalAlpha=1}),
 chart:cvs(256,160,x=>{x.fillStyle='#eceff3';x.fillRect(0,0,256,160);x.fillStyle='#fff';[[8,8,116,70],[136,8,112,70],[8,88,240,64]].forEach(([a,b,c,d])=>{x.beginPath();x.roundRect(a,b,c,d,6);x.fill()})
  for(let i=0;i<10;i++){const h=10+Math.random()*45;x.fillStyle=i%4?'#b9d2ee':'#5e9bd6';x.fillRect(16+i*10,72-h,7,h)}
  x.strokeStyle='#5cb98f';x.lineWidth=2;x.beginPath();for(let i=0;i<14;i++){const px=148+i*7,py=58-Math.sin(i/2.4)*14-i;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()
  x.strokeStyle='#e0a062';x.beginPath();for(let i=0;i<24;i++){const px=16+i*9,py=130-Math.sin(i/4)*14-Math.random()*4;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}),
 wall:cvs(256,160,x=>{const g=x.createLinearGradient(0,0,256,160);g.addColorStop(0,'#3d5a96');g.addColorStop(.6,'#9a7fc0');g.addColorStop(1,'#e8a9b5');x.fillStyle=g;x.fillRect(0,0,256,160)
  x.fillStyle='rgba(255,255,255,.22)';x.beginPath();x.roundRect(75,140,106,14,8);x.fill();x.fillStyle='rgba(255,255,255,.88)';x.beginPath();x.roundRect(30,28,130,78,6);x.fill();x.fillStyle='#e5e7eb';x.fillRect(30,28,130,12)})}
scr.code.wrapT=THREE.RepeatWrapping
const keysTex=cvs(128,40,x=>{x.fillStyle='#eceef0';x.fillRect(0,0,128,40);x.fillStyle='#c4c7cc';for(let r=0;r<4;r++)for(let c=0;c<10;c++)x.fillRect(4+c*12,4+r*9,10,7)})
const KIND:Record<string,keyof typeof scr>={grok:'chart',build:'code',bot:'chart',meeting:'wall',competences:'code',skills:'wall'}
const labScr=cvs(256,160,x=>{x.fillStyle='#0c1016';x.fillRect(0,0,256,160)
 x.strokeStyle='rgba(180,190,205,.25)';x.strokeRect(6,6,244,148)
 x.fillStyle='rgba(140,160,190,.08)';x.fillRect(6,6,244,20)
 x.fillStyle='#a8b4c4';x.font='600 12px monospace';x.fillText('COMPÉTENCES · NODES',14,20)
 for(let i=0;i<10;i++){const h=18+((i*17)%40);x.fillStyle=i%3?'#3a5a78':'#5a7a98';x.fillRect(14+i*22,130-h,16,h)}
 x.strokeStyle='#6a8aaa';x.lineWidth=1.2;x.beginPath();for(let i=0;i<20;i++){const px=14+i*11,py=42-Math.sin(i/2.6)*10;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()
 x.fillStyle='rgba(90,180,120,.55)';for(let i=0;i<8;i++)x.fillRect(148+i*12,28,6,4+(i%2)*3)})
/* single-plane raised tech floor — etched tiles, no coplanar grid meshes */
const techFloor=cvs(512,512,x=>{
 /* cool slate — sits next to warm wood / corridor gray without black clash */
 x.fillStyle='#2a3138';x.fillRect(0,0,512,512)
 for(let i=0;i<8;i++)for(let j=0;j<8;j++){
  const px=i*64,py=j*64
  x.fillStyle=(i+j)%2?'#262d34':'#2e363e';x.fillRect(px+1,py+1,62,62)
  x.strokeStyle='rgba(140,155,170,.38)';x.lineWidth=1.5;x.strokeRect(px+2,py+2,60,60)
  x.fillStyle='rgba(160,175,190,.14)';x.fillRect(px+28,py+28,8,8)
 }
 x.strokeStyle='rgba(190,200,212,.22)';x.lineWidth=2;x.strokeRect(4,4,504,504)
})
techFloor.wrapS=techFloor.wrapT=THREE.RepeatWrapping;techFloor.repeat.set(1,1)
const Metal=({c='#d3d6da',r=.25}:{c?:string;r?:number})=><meshStandardMaterial color={c} metalness={.9} roughness={r}/>
const Workstation=({kind}:{kind:keyof typeof scr})=><group>
 <RoundedBox args={[1.5,.012,.62]} radius={.006} position={[0,.9,.42]} receiveShadow><meshStandardMaterial color="#3a3d42" roughness={.85}/></RoundedBox>
 <RoundedBox args={[.7,.025,.42]} radius={.012} position={[0,.92,-.15]}><Metal/></RoundedBox>
 <RoundedBox args={[.16,.56,.05]} radius={.02} position={[0,1.2,-.23]} rotation={[-.1,0,0]}><Metal/></RoundedBox>
 <group position={[0,1.66,-.24]} rotation={[-.07,0,0]}>
  <RoundedBox args={[1.56,.92,.05]} radius={.035} smoothness={4} castShadow><Metal c="#c9ccd1" r={.3}/></RoundedBox>
  <RoundedBox args={[1.52,.88,.01]} radius={.03} position={[0,0,.027]}><meshStandardMaterial color="#050506" roughness={.1}/></RoundedBox>
  <mesh position={[0,0,.034]}><planeGeometry args={[1.44,.8]}/><meshBasicMaterial map={scr[kind]} toneMapped={false} color="#d8dce2"/></mesh>
  <mesh position={[0,0,.037]}><planeGeometry args={[1.52,.88]}/><meshStandardMaterial color="#fff" transparent opacity={.07} metalness={1} roughness={.04} depthWrite={false}/></mesh>
 </group>
 <RoundedBox args={[.86,.022,.28]} radius={.011} position={[-.15,.925,.5]}><Metal c="#e4e6e9" r={.35}/></RoundedBox>
 <mesh position={[-.15,.937,.5]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.82,.24]}/><meshStandardMaterial map={keysTex} roughness={.5}/></mesh>
 <RoundedBox args={[.11,.026,.2]} radius={.013} position={[.6,.925,.5]}><Metal c="#e4e6e9" r={.3}/></RoundedBox>
 <mesh position={[-1.2,.98,.25]}><cylinderGeometry args={[.06,.055,.12,12]}/><meshStandardMaterial color="#f5f4f1" roughness={.25}/></mesh>
</group>
const Laptop=({p,r}:{p:V3;r:number})=><group position={p} rotation={[0,r,0]}>
 <RoundedBox args={[.9,.035,.62]} radius={.02} position={[0,.895,0]}><Metal c="#d9dce0" r={.3}/></RoundedBox>
 <group position={[0,.91,-.3]} rotation={[-.3,0,0]}>
  <RoundedBox args={[.9,.6,.022]} radius={.012} position={[0,.3,0]}><Metal c="#d9dce0" r={.3}/></RoundedBox>
  <mesh position={[0,.3,.013]}><planeGeometry args={[.84,.54]}/><meshBasicMaterial map={scr.wall} toneMapped={false} color="#d8dce2"/></mesh></group></group>
const Credenza=({p}:{p:V3})=><group position={p}>
 <RoundedBox args={[5,.75,.7]} radius={.03} position={[0,.4,0]} castShadow receiveShadow><meshStandardMaterial color={WH} roughness={.45}/></RoundedBox>
 <Box p={[0,.8,0]} a={[5.1,.05,.76]} c={WN} ro={.3}/>
 <mesh position={[-1.6,1.1,0]}><sphereGeometry args={[.22,16,12]}/><Metal c="#e6e8eb" r={.08}/></mesh>
 <Box p={[1.2,.88,0]} a={[.6,.1,.4]} c="#cfd2d6" ro={.6}/><Box p={[1.2,.97,0]} a={[.55,.08,.36]} c="#9aa7b8" ro={.6}/>
 <mesh position={[.2,1.05,0]}><cylinderGeometry args={[.11,.16,.5,12]}/><meshStandardMaterial color="#f5f4f1" roughness={.2}/></mesh></group>
const Chair=({p,r}:{p:V3;r:number})=><group position={p} rotation={[0,r,0]}>
 <RoundedBox args={[.82,.12,.82]} radius={.05} position={[0,.56,0]} castShadow><meshStandardMaterial color="#d3d6da" roughness={.7}/></RoundedBox>
 <RoundedBox args={[.8,.8,.1]} radius={.05} position={[0,1.08,-.4]} rotation={[-.08,0,0]}><meshStandardMaterial color="#d3d6da" roughness={.7}/></RoundedBox>
 <mesh position={[0,.28,0]}><cylinderGeometry args={[.05,.05,.5,8]}/><Metal c="#9aa0a8"/></mesh><mesh position={[0,.04,0]}><cylinderGeometry args={[.42,.42,.04,16]}/><Metal c="#9aa0a8"/></mesh></group>

const Pane=({p,len,ax}:{p:V3;len:number;ax:'x'|'z'})=>{const H=2.6,a:V3=ax==='x'?[len,H,.04]:[.04,H,len],rl:V3=ax==='x'?[len,.07,.07]:[.07,.07,len]
 return <group position={p}>
  <mesh position={[0,H/2,0]}><boxGeometry args={a}/><meshStandardMaterial color="#dbe6ef" transparent opacity={.14} roughness={.05} depthWrite={false}/></mesh>
  <Box p={[0,H,0]} a={rl} c={AL} m={.15} ro={.3}/><Box p={[0,.03,0]} a={rl} c={AL} m={.15} ro={.3}/></group>}

/** Framed corridor doorway — aluminum posts + lintel + threshold; glass leaves ajar. */
const Doorway=({b}:{b:number})=>{
  /* posts at ±2.05 align with Pane gap (−2…2); path go() uses room centerline */
  const z=-b*5, half=2.05, H=2.6
  const swing=b>0?.55:-.55
  return <group>
    <Box p={[-half,H/2,z]} a={[.11,H,.14]} c={AL} m={.22} ro={.28}/>
    <Box p={[half,H/2,z]} a={[.11,H,.14]} c={AL} m={.22} ro={.28}/>
    <Box p={[0,H-.02,z]} a={[half*2+.12,.1,.16]} c={AL} m={.22} ro={.28}/>
    <Box p={[0,.035,z]} a={[half*2+.2,.07,.32]} c="#b8b3aa" m={.12} ro={.5}/>
    <Box p={[0,.07,z]} a={[half*2+.05,.02,.22]} c={WN} ro={.4} m={.05}/>
    {/* left leaf */}
    <group position={[-half+.04,0,z]} rotation={[0,swing,0]}>
      <mesh position={[.52,H/2,0]}><boxGeometry args={[1.04,H-.18,.028]}/><meshStandardMaterial color="#dbe6ef" transparent opacity={.16} roughness={.05} metalness={.1} depthWrite={false}/></mesh>
      <Box p={[.52,H-.12,0]} a={[1.06,.06,.04]} c={AL} m={.2} ro={.3}/>
      <Box p={[.52,.1,0]} a={[1.06,.06,.04]} c={AL} m={.2} ro={.3}/>
      <Box p={[1.02,H/2,0]} a={[.05,H-.18,.04]} c={AL} m={.2} ro={.3}/>
      <Box p={[.52,H/2,0]} a={[.04,H-.18,.04]} c={AL} m={.2} ro={.3}/>
    </group>
    {/* right leaf */}
    <group position={[half-.04,0,z]} rotation={[0,-swing,0]}>
      <mesh position={[-.52,H/2,0]}><boxGeometry args={[1.04,H-.18,.028]}/><meshStandardMaterial color="#dbe6ef" transparent opacity={.16} roughness={.05} metalness={.1} depthWrite={false}/></mesh>
      <Box p={[-.52,H-.12,0]} a={[1.06,.06,.04]} c={AL} m={.2} ro={.3}/>
      <Box p={[-.52,.1,0]} a={[1.06,.06,.04]} c={AL} m={.2} ro={.3}/>
      <Box p={[-1.02,H/2,0]} a={[.05,H-.18,.04]} c={AL} m={.2} ro={.3}/>
      <Box p={[-.52,H/2,0]} a={[.04,H-.18,.04]} c={AL} m={.2} ro={.3}/>
    </group>
  </group>
}

/* floor etch — lower res */
const etchLabel=(name:string,accent:string)=>{const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d')!
 x.clearRect(0,0,512,128)
 x.fillStyle='rgba(48,46,44,.20)';x.beginPath();x.roundRect(20,20,472,88,12);x.fill()
 x.strokeStyle='rgba(20,18,16,.30)';x.lineWidth=1.5;x.beginPath();x.roundRect(22,22,468,84,11);x.stroke()
 x.strokeStyle='rgba(255,255,255,.12)';x.lineWidth=1;x.beginPath();x.roundRect(24,24,464,80,10);x.stroke()
 x.fillStyle=accent;x.globalAlpha=.8;x.beginPath();x.arc(55,64,5,0,Math.PI*2);x.fill();x.globalAlpha=1
 x.font='600 36px "Plus Jakarta Sans", system-ui, sans-serif'
 x.textAlign='center';x.textBaseline='middle'
 const label=name.toUpperCase()
 x.fillStyle='rgba(18,16,14,.55)';x.fillText(label,257,66)
 x.fillStyle='rgba(230,226,218,.28)';x.fillText(label,255,62)
 x.fillStyle='rgba(42,40,38,.78)';x.fillText(label,256,64)
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.premultiplyAlpha=true;return t}
const RoomLabel=({r}:{r:Room})=>{
 const map=useMemo(()=>etchLabel(r.n,r.c),[r.n,r.c])
 return <mesh rotation={[-Math.PI/2,0,0]} position={[r.x,.095,r.z]} receiveShadow
  onClick={e=>{e.stopPropagation();if(ui.moved<CLICK_MOVE_MAX&&ui.sel)go(ui.sel,r)}}>
  <planeGeometry args={[5.2,1.3]}/>
  <meshStandardMaterial map={map} transparent depthWrite={false} roughness={.92} metalness={.06} polygonOffset polygonOffsetFactor={-1}/>
 </mesh>}

const initTex=(letter:string)=>{
 const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d')!
 x.clearRect(0,0,128,64)
 x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,14,128,36)
 x.fillStyle='rgba(255,255,255,.18)';x.fillRect(0,14,128,1)
 x.fillStyle='rgba(255,255,255,.10)';x.fillRect(0,49,128,1)
 x.font='700 32px "Plus Jakarta Sans", system-ui, sans-serif'
 x.textAlign='center';x.textBaseline='middle'
 x.fillStyle='rgba(0,0,0,.35)';x.fillText(letter,65,33)
 x.fillStyle='rgba(255,255,255,.78)';x.fillText(letter,64,31)
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}


const BOOK_COLORS=['#e8dcc8','#d4c4a8','#c9b896','#b8a88a','#a89878','#d8c8b0','#c4b49a','#e0d4bc','#b0a080','#cfc0a4','#dccfb8','#a89070']
function shortSkillLabel(s:SkillJSON){
  const n=(s.name||s.id||'').trim().replace(/[-_]/g,' ')
  if(n.length<=16)return n
  return n.slice(0,14)+'…'
}
function bookSpineTex(label:string,color:string){
  return cvs(96,320,x=>{
    const g=x.createLinearGradient(0,0,96,0)
    g.addColorStop(0,'rgba(80,60,40,.18)');g.addColorStop(.1,color);g.addColorStop(.9,color);g.addColorStop(1,'rgba(255,255,255,.22)')
    x.fillStyle=g;x.fillRect(0,0,96,320)
    x.fillStyle='rgba(255,255,255,.28)';x.fillRect(8,0,2,320)
    x.fillStyle='rgba(90,70,50,.22)';x.fillRect(0,10,96,3);x.fillRect(0,306,96,3)
    x.fillStyle='rgba(255,255,255,.35)';x.fillRect(0,16,96,1.5)
    x.save();x.translate(50,160);x.rotate(-Math.PI/2)
    x.font='600 20px "Plus Jakarta Sans", system-ui, sans-serif'
    x.textAlign='center';x.textBaseline='middle'
    x.fillStyle='rgba(255,255,255,.45)';x.fillText(label,1,1)
    x.fillStyle='rgba(42,34,28,.82)';x.fillText(label,0,0)
    x.restore()
  })
}

/** Tall bookshelf unit with labelled spines (library). */
function Bookshelf({p,r=0,books,thin=false}:{p:V3;r?:number;books:SkillJSON[];thin?:boolean}){
  const W=thin?2.5:3.4, H=3.35, D=.58
  const shelves=5
  const bookKey=books.map(b=>b.id+':'+b.name).join('|')
  const maps=useMemo(()=>books.map((b,i)=>bookSpineTex(shortSkillLabel(b),BOOK_COLORS[i%BOOK_COLORS.length])),[bookKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>()=>{maps.forEach(m=>m.dispose())},[maps])
  return <group position={p} rotation={[0,r,0]}>
    <RoundedBox args={[W,H,D]} radius={.025} position={[0,H/2,0]} castShadow receiveShadow>
      <meshStandardMaterial color={WN} roughness={.52}/>
    </RoundedBox>
    <Box p={[0,H/2,-D/2+.02]} a={[W-.08,H-.1,.04]} c="#4a3a2e" ro={.9} m={0}/>
    <Box p={[0,H-.04,0]} a={[W+.08,.08,D+.06]} c="#7a6554" ro={.4}/>
    <Box p={[0,.06,0]} a={[W+.06,.12,D+.04]} c="#5a4638" ro={.5}/>
    {/* aluminum stile + glass cabinet panes — Atelier/Pane language */}
    <Box p={[-W/2+.04,H/2,D/2-.02]} a={[.05,H-.08,.06]} c={AL} m={.2} ro={.28}/>
    <Box p={[W/2-.04,H/2,D/2-.02]} a={[.05,H-.08,.06]} c={AL} m={.2} ro={.28}/>
    <Box p={[0,H/2,D/2-.02]} a={[.04,H-.12,.05]} c={AL} m={.2} ro={.28}/>
    <mesh position={[-W/4,H/2,D/2+.01]}>
      <boxGeometry args={[W/2-.14,H-.28,.018]}/>
      <meshStandardMaterial color="#dbe6ef" transparent opacity={.15} roughness={.05} metalness={.12} depthWrite={false}/>
    </mesh>
    <mesh position={[W/4,H/2,D/2+.01]}>
      <boxGeometry args={[W/2-.14,H-.28,.018]}/>
      <meshStandardMaterial color="#dbe6ef" transparent opacity={.15} roughness={.05} metalness={.12} depthWrite={false}/>
    </mesh>
    <Box p={[-W/4,H-.22,D/2+.02]} a={[W/2-.12,.04,.03]} c={AL} m={.2} ro={.3}/>
    <Box p={[W/4,H-.22,D/2+.02]} a={[W/2-.12,.04,.03]} c={AL} m={.2} ro={.3}/>
    <Box p={[-W/4,.22,D/2+.02]} a={[W/2-.12,.04,.03]} c={AL} m={.2} ro={.3}/>
    <Box p={[W/4,.22,D/2+.02]} a={[W/2-.12,.04,.03]} c={AL} m={.2} ro={.3}/>
    {Array.from({length:shelves},(_,row)=>{
      const y=.32+row*((H-.5)/(shelves))
      const per=Math.max(1,Math.ceil(books.length/shelves))
      const rowBooks=books.slice(row*per,(row+1)*per)
      let x=-W/2+.2
      return <group key={row}>
        <Box p={[0,y-0.05,0]} a={[W-.1,.055,D-.05]} c="#7a6554" ro={.4}/>
        <Box p={[0,y+.01,D/2-.06]} a={[W-.12,.03,.04]} c="#8a7060" ro={.45}/>
        {rowBooks.map((b,i)=>{
          const gi=row*per+i
          const isPlay=b.id.startsWith('site-playbooks')||b.source==='plugin'
          const bw=isPlay?.08:.135
          const bh=.48+((i*17+row*9)%5)*.045
          const bm=maps[gi]||maps[i%Math.max(maps.length,1)]
          const xpos=x+bw/2
          x+=bw+.03
          if(xpos>W/2-.14)return null
          return <mesh key={b.id+'-'+gi} position={[xpos,y+bh/2,.04]} castShadow>
            <boxGeometry args={[bw,bh,D-.2]}/>
            <meshStandardMaterial map={bm} roughness={.65}/>
          </mesh>
        })}
      </group>
    })}
  </group>
}

function ReadingLamp({p}:{p:V3}){
  return <group position={p}>
    <mesh position={[0,.02,0]}><cylinderGeometry args={[.12,.14,.04,12]}/><Metal c="#9aa3ad"/></mesh>
    <mesh position={[0,.55,0]}><cylinderGeometry args={[.025,.025,1.1,8]}/><Metal c="#b0b8c0"/></mesh>
    <mesh position={[.18,1.12,0]} rotation={[0,0,.6]}><cylinderGeometry args={[.02,.02,.4,8]}/><Metal c="#b0b8c0"/></mesh>
    <mesh position={[.38,1.22,0]}><sphereGeometry args={[.09,12,10]}/><meshStandardMaterial color="#f5e6c8" emissive="#f0d78c" emissiveIntensity={.35} roughness={.4}/></mesh>
    <pointLight color="#ffe8b8" intensity={1.1} distance={3.2} position={[.38,1.15,0]}/>
  </group>
}

function LibraryRoom({r}:{r:Room}){
  const b=r.s
  const books=skillBooks
  const empty=books.length===0
  const per=Math.max(1,Math.ceil((empty?1:books.length)/5))
  const chunks:SkillJSON[][]=empty
    ? [[{id:'_',name:'Aucun skill',source:'user'}],[],[],[],[]]
    : [0,1,2,3,4].map(i=>books.slice(i*per,(i+1)*per))
  return <>
    {/* floor owned by RoomView (single wood plane) — furniture only here */}
    {/* side walls — full bays clear of door centerline */}
    <Bookshelf p={[-3.45,0,b*1.6]} r={Math.PI/2} books={chunks[0]||[]}/>
    <Bookshelf p={[3.45,0,b*1.6]} r={-Math.PI/2} books={chunks[1]||[]}/>
    {/* door-wall flanks (leave ±2 clear for Doorway path) */}
    <Bookshelf p={[-2.7,0,-b*3.45]} r={0} books={chunks[2]||[]} thin/>
    <Bookshelf p={[2.7,0,-b*3.45]} r={0} books={chunks[3]||[]} thin/>
    {/* back-wall bay + low credenza (door centerline stays clear for go()) */}
    <Bookshelf p={[-2.55,0,b*3.55]} r={Math.PI} books={chunks[4]||[]} thin/>
    <group position={[2.2,0,b*4.2]}>
      <RoundedBox args={[2.2,1.0,.48]} radius={.025} position={[0,.5,0]} castShadow receiveShadow>
        <meshStandardMaterial color={WN} roughness={.48}/>
      </RoundedBox>
      <Box p={[0,1.02,0]} a={[2.28,.05,.52]} c="#7a6554" ro={.4}/>
      <Box p={[-1.05,.5,.22]} a={[.05,.9,.07]} c={AL} m={.2} ro={.3}/>
      <Box p={[1.05,.5,.22]} a={[.05,.9,.07]} c={AL} m={.2} ro={.3}/>
      <Box p={[0,.5,-.18]} a={[2.0,.85,.04]} c="#4a3a2e" ro={.9} m={0}/>
      <Box p={[0,.46,0]} a={[2.0,.04,.4]} c="#7a6554" ro={.4}/>
      {(chunks[4]||[]).slice(0,8).map((bk,i)=>{
        const bw=.11, xpos=-.85+i*(bw+.035)
        return <mesh key={'cred-'+bk.id+i} position={[xpos,.7,.05]} castShadow>
          <boxGeometry args={[bw,.36+(i%3)*.05,.24]}/>
          <meshStandardMaterial color={BOOK_COLORS[(i+3)%BOOK_COLORS.length]} roughness={.65}/>
        </mesh>
      })}
    </group>
    {/* reading rug above single floor plane (no z-fight with roomWood) */}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.048,b*.2]} receiveShadow>
      <planeGeometry args={[3.5,2.5]}/>
      <meshStandardMaterial color="#7a6554" roughness={.92} metalness={0}/>
    </mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.051,b*.2]}>
      <planeGeometry args={[3.1,2.1]}/>
      <meshStandardMaterial color="#8a7360" roughness={.9} metalness={0}/>
    </mesh>
    {/* reading table — Atelier desk recipe: WN top, GR legs */}
    <RoundedBox args={[2.85,.08,1.3]} radius={.03} position={[0,.86,b*.2]} castShadow>
      <meshStandardMaterial color={WN} roughness={.3} metalness={.05}/>
    </RoundedBox>
    <Box p={[-1.2,.43,b*.2-.48]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[1.2,.43,b*.2-.48]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[-1.2,.43,b*.2+.48]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[1.2,.43,b*.2+.48]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[0,.82,b*.2]} a={[2.7,.03,1.15]} c="#5a4638" ro={.55} m={0}/>
    <mesh position={[-.45,.91,b*.2+.1]} rotation={[-.05,.28,0]}>
      <boxGeometry args={[.58,.03,.42]}/>
      <meshStandardMaterial color="#c9b896" roughness={.55}/>
    </mesh>
    <mesh position={[.35,.91,b*.2-.1]} rotation={[-.08,-.2,0]}>
      <boxGeometry args={[.5,.025,.38]}/>
      <meshStandardMaterial color="#d4c4a8" roughness={.5}/>
    </mesh>
    <Box p={[.85,.905,b*.2+.3]} a={[.3,.02,.24]} c={WH} ro={.7} m={0}/>
    <Box p={[.88,.92,b*.2+.27]} a={[.28,.015,.22]} c="#ebe6dc" ro={.7} m={0}/>
    <mesh position={[-.9,.93,b*.2-.25]}>
      <cylinderGeometry args={[.07,.06,.1,12]}/>
      <meshStandardMaterial color="#f5f4f1" roughness={.25}/>
    </mesh>
    <ReadingLamp p={[-1.05,.9,b*.2+.45]}/>
    <ReadingLamp p={[1.05,.9,b*.2-.45]}/>
    {/* lectern — side bay, not in path */}
    <group position={[-3.25,0,-b*.9]}>
      <RoundedBox args={[.95,1.15,.5]} radius={.02} position={[0,.575,0]} castShadow>
        <meshStandardMaterial color={WN} roughness={.48}/>
      </RoundedBox>
      <Box p={[-.42,.55,.22]} a={[.05,1.05,.06]} c={AL} m={.2} ro={.3}/>
      <Box p={[.42,.55,.22]} a={[.05,1.05,.06]} c={AL} m={.2} ro={.3}/>
      <mesh position={[0,1.22,.05]} rotation={[-.4,0,0]}>
        <boxGeometry args={[.82,.04,.45]}/>
        <meshStandardMaterial color="#7a6554" roughness={.4}/>
      </mesh>
      <mesh position={[0,1.28,.08]} rotation={[-.4,0,0]}>
        <planeGeometry args={[.68,.34]}/>
        <meshStandardMaterial color="#e8e0d4" roughness={.7}/>
      </mesh>
    </group>
    {/* rolling ladder against side bay */}
    <group position={[3.2,0,-b*2.0]}>
      <Box p={[0,1.6,0]} a={[.06,3.1,.06]} c={AL} m={.35} ro={.25}/>
      <Box p={[.42,1.6,0]} a={[.06,3.1,.06]} c={AL} m={.35} ro={.25}/>
      {[0,1,2,3,4,5].map(i=>(
        <Box key={i} p={[.21,.35+i*.5,0]} a={[.42,.04,.05]} c={WN} ro={.45} m={0}/>
      ))}
    </group>
    <Chair p={[-1.0,0,b*.2+1.15]} r={Math.PI}/>
    <Chair p={[1.0,0,b*.2-1.15]} r={0}/>
    <Plant p={[-4.2,0,b*4.15]}/>
    <Plant p={[4.2,0,-b*3.9]}/>
    <Plant p={[-4.15,0,-b*1.5]}/>
    <pointLight color="#fff1dc" intensity={2.45} distance={9.5} position={[0,3.7,0]} castShadow={false}/>
    <pointLight color="#ffe8c8" intensity={.85} distance={5} position={[0,2.2,b*.2]} castShadow={false}/>
  </>
}

function ServerUnit({y,w=1.9}:{y:number;w?:number}){
  /* sober status LEDs — cool white + soft green only (no rainbow) */
  const leds=[[-w*.42,'#6ee7a0'],[-w*.32,'#6ee7a0'],[-w*.22,'#94a3b8'],[-w*.08,'#64748b'],[w*.28,'#c8d4e0'],[w*.4,'#c8d4e0']] as [number,string][]
  return <group position={[0,y,0]}>
    <RoundedBox args={[w,.34,.72]} radius={.01} castShadow>
      <meshStandardMaterial color="#14181e" metalness={.62} roughness={.32}/>
    </RoundedBox>
    <Box p={[0,0,.355]} a={[w-.08,.28,.025]} c="#0a0c10" m={.35} ro={.4}/>
    {[-.09,-.03,.03,.09].map((dy,i)=>(
      <mesh key={i} position={[0,dy,.37]}>
        <boxGeometry args={[w*.62,.014,.01]}/>
        <meshStandardMaterial color="#2a323c" metalness={.35} roughness={.45}/>
      </mesh>
    ))}
    {leds.map(([x,c],i)=>(
      <mesh key={i} position={[x,.04,.375]}>
        <boxGeometry args={[.05,.05,.03]}/>
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.1} roughness={.25}/>
      </mesh>
    ))}
  </group>
}

function ServerRack({p,r=0,units=9}:{p:V3;r?:number;units?:number}){
  const H=3.4, W=2.2, D=.95
  return <group position={p} rotation={[0,r,0]}>
    <RoundedBox args={[W,H,D]} radius={.025} position={[0,H/2,0]} castShadow receiveShadow>
      <meshStandardMaterial color="#0c1016" metalness={.55} roughness={.32}/>
    </RoundedBox>
    <Box p={[-W/2+.05,H/2,D/2-.02]} a={[.08,H-.1,.05]} c={AL} m={.75} ro={.22}/>
    <Box p={[W/2-.05,H/2,D/2-.02]} a={[.08,H-.1,.05]} c={AL} m={.75} ro={.22}/>
    <Box p={[0,H-.05,0]} a={[W+.06,.1,D+.06]} c="#2a323c" m={.55} ro={.28}/>
    <Box p={[0,.06,0]} a={[W+.04,.12,D+.04]} c="#14181e" m={.45} ro={.35}/>
    <mesh position={[0,H/2,D/2+.02]}>
      <boxGeometry args={[W-.14,H-.22,.03]}/>
      <meshStandardMaterial color="#b8cce0" transparent opacity={.22} roughness={.04} metalness={.35} depthWrite={false}/>
    </mesh>
    {Array.from({length:units},(_,i)=>(
      <ServerUnit key={i} y={.38+i*.34} w={W-.22}/>
    ))}
    <mesh position={[0,H-.2,D/2+.035]}>
      <boxGeometry args={[.55,.06,.025]}/>
      <meshStandardMaterial color="#6ee7a0" emissive="#6ee7a0" emissiveIntensity={.55} roughness={.4}/>
    </mesh>
    <mesh position={[-.45,H-.2,D/2+.035]}>
      <boxGeometry args={[.08,.06,.025]}/>
      <meshStandardMaterial color="#c8d4e0" emissive="#c8d4e0" emissiveIntensity={.4} roughness={.4}/>
    </mesh>
  </group>
}

function CableTray({p,len,ax}:{p:V3;len:number;ax:'x'|'z'}){
  const a:V3=ax==='x'?[len,.06,.28]:[.28,.06,len]
  return <group position={p}>
    <mesh position={[0,2.55,0]}>
      <boxGeometry args={a}/>
      <meshStandardMaterial color="#6b7280" metalness={.55} roughness={.35}/>
    </mesh>
    {/* hanging cable bundles */}
    {[-len*.3,0,len*.3].map((o,i)=>{
      const cpos:V3=ax==='x'?[o,2.2,0]:[0,2.2,o]
      return <mesh key={i} position={cpos}>
        <cylinderGeometry args={[.04,.045,.7,8]}/>
        <meshStandardMaterial color={i%2?'#374151':'#1f2937'} roughness={.7}/>
      </mesh>
    })}
  </group>
}

function ConsoleDesk({p,r=0}:{p:V3;r?:number}){
  return <group position={p} rotation={[0,r,0]}>
    {/* WN top + GR legs — same language as Atelier desks */}
    <RoundedBox args={[2.8,.08,1.15]} radius={.025} position={[0,.86,0]} castShadow receiveShadow>
      <meshStandardMaterial color={WN} roughness={.32} metalness={.05}/>
    </RoundedBox>
    <Box p={[-1.25,.43,0]} a={[.08,.86,1.05]} c={GR} m={.75} ro={.3}/>
    <Box p={[1.25,.43,0]} a={[.08,.86,1.05]} c={GR} m={.75} ro={.3}/>
    <Box p={[0,.06,0]} a={[2.7,.08,1.05]} c="#2a3038" m={.4} ro={.4}/>
    {/* dual monitors — soft screen glow */}
    <group position={[-.55,1.55,-.28]} rotation={[-.08,0,0]}>
      <RoundedBox args={[1.1,.7,.04]} radius={.015}><Metal c="#c9ccd1" r={.3}/></RoundedBox>
      <mesh position={[0,0,.025]}><planeGeometry args={[1.0,.6]}/><meshBasicMaterial map={labScr} toneMapped={false} color="#c8d0d8"/></mesh>
    </group>
    <group position={[.65,1.5,-.28]} rotation={[-.08,-.12,0]}>
      <RoundedBox args={[.95,.62,.04]} radius={.015}><Metal c="#c9ccd1" r={.3}/></RoundedBox>
      <mesh position={[0,0,.025]}><planeGeometry args={[.86,.52]}/><meshBasicMaterial map={scr.code} toneMapped={false} color="#c8d0d8"/></mesh>
    </group>
    <RoundedBox args={[.7,.02,.28]} radius={.01} position={[-.2,.91,.35]}><Metal c="#e4e6e9" r={.35}/></RoundedBox>
    <mesh position={[-.2,.922,.35]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.66,.24]}/><meshStandardMaterial map={keysTex} roughness={.5}/></mesh>
    <pointLight color="#a8c0d8" intensity={.55} distance={3.5} position={[0,1.55,.15]}/>
  </group>
}

function StatusPanel({p,r=0}:{p:V3;r?:number}){
  const map=useMemo(()=>cvs(256,160,x=>{
    x.fillStyle='#12161c';x.fillRect(0,0,256,160)
    x.strokeStyle='rgba(180,190,205,.28)';x.lineWidth=2;x.strokeRect(6,6,244,148)
    x.fillStyle='#a8b4c4';x.font='600 13px monospace';x.fillText('CLUSTER · STATUS',16,28)
    const rows=[['ingest','ok'],['embed','ok'],['gate','idle'],['sync','ok']]
    rows.forEach(([n,st],i)=>{
      x.fillStyle='#7a848e';x.fillText(n,18,52+i*24)
      x.fillStyle=st==='ok'?'#6ee7a0':'#94a3b8';x.fillText(st,170,52+i*24)
      x.fillStyle=st==='ok'?'#6ee7a0':'#64748b'
      x.beginPath();x.arc(230,48+i*24,4,0,Math.PI*2);x.fill()
    })
  }),[])
  return <group position={p} rotation={[0,r,0]}>
    <RoundedBox args={[2.35,1.45,.07]} radius={.02} position={[0,1.7,0]} castShadow>
      <meshStandardMaterial color={AL} roughness={.35} metalness={.2}/>
    </RoundedBox>
    <mesh position={[0,1.7,.04]}><planeGeometry args={[2.15,1.25]}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>
  </group>
}

function LabRoom({r}:{r:Room}){
  const b=r.s
  return <>
    {/* single raised cool-slate tech floor — no grid overlays / z-fight */}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.028,0]} receiveShadow>
      <planeGeometry args={[8.4,8.4]}/>
      <meshStandardMaterial map={techFloor} color="#c8d0d8" roughness={.72} metalness={.12}/>
    </mesh>
    {/* aluminum perimeter strip — ties to Pane posts */}
    <Box p={[0,.04,4.15]} a={[8.4,.035,.1]} c={AL} m={.2} ro={.3}/>
    <Box p={[0,.04,-4.15]} a={[8.4,.035,.1]} c={AL} m={.2} ro={.3}/>
    <Box p={[-4.15,.04,0]} a={[.1,.035,8.4]} c={AL} m={.2} ro={.3}/>
    <Box p={[4.15,.04,0]} a={[.1,.035,8.4]} c={AL} m={.2} ro={.3}/>
    {/* door-wall flanks only — leave ±1.5 clear for go() centerline (matches library) */}
    <ServerRack p={[-2.85,0,-b*3.4]} r={b>0?0:Math.PI} units={9}/>
    <ServerRack p={[2.85,0,-b*3.4]} r={b>0?0:Math.PI} units={9}/>
    <ServerRack p={[-3.55,0,b*.2]} r={Math.PI/2} units={7}/>
    <ServerRack p={[3.55,0,b*.2]} r={-Math.PI/2} units={7}/>
    {/* former center door rack — back bay, clear of door aisle + console */}
    <ServerRack p={[2.4,0,b*3.55]} r={b>0?Math.PI:0} units={8}/>
    <CableTray p={[0,0,-b*3.4]} len={7.4} ax="x"/>
    <CableTray p={[-3.55,0,0]} len={5.6} ax="z"/>
    <CableTray p={[3.55,0,0]} len={5.6} ax="z"/>
    <ConsoleDesk p={[0,0,b*2.15]} r={b>0?Math.PI:0}/>
    <Chair p={[0,0,b*3.05]} r={b>0?0:Math.PI}/>
    <StatusPanel p={[0,0,b*4.5]} r={b>0?Math.PI:0}/>
    <group position={[-3.45,0,b*3.5]}>
      <RoundedBox args={[1.2,1.5,.65]} radius={.015} position={[0,.75,0]} castShadow>
        <meshStandardMaterial color="#0c1016" metalness={.55} roughness={.3}/>
      </RoundedBox>
      {[0,1,2,3].map(i=>(
        <mesh key={i} position={[0,.38+i*.28,.34]}>
          <boxGeometry args={[1.0,.09,.02]}/>
          <meshStandardMaterial color="#1a1e24" metalness={.45} roughness={.35}/>
        </mesh>
      ))}
      <mesh position={[.28,1.35,.34]}>
        <boxGeometry args={[.05,.05,.025]}/>
        <meshStandardMaterial color="#6ee7a0" emissive="#6ee7a0" emissiveIntensity={.7}/>
      </mesh>
    </group>
    <Plant p={[3.85,0,b*3.95]}/>
    {/* cool rack glow + warm door spill (corridor continuity) */}
    <pointLight color="#d8e4f0" intensity={2.5} distance={10} position={[0,4.0,0]} castShadow={false}/>
    <pointLight color="#9eb6c8" intensity={1.1} distance={6.5} position={[-2,2.3,-2]} castShadow={false}/>
    <pointLight color="#fff1dc" intensity={1.0} distance={5.5} position={[0,2.4,-b*4.2]} castShadow={false}/>
  </>
}

function RoomView({r}:{r:Room}){
 const b=r.s
 const isLib=r.t==='library', isLab=r.t==='lab'
 return <group position={[r.x,0,r.z]}>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,(isLib||isLab)?0.12:0.04,0]}
   onClick={e=>{e.stopPropagation();if(ui.moved<CLICK_MOVE_MAX&&ui.sel)go(ui.sel,r)}}>
   <planeGeometry args={[8.2,8.2]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/>
  </mesh>
  {/* one floor only — desks+Skills: shared roomWood; Compétences: LabRoom cool tech */}
  {!isLab&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.022,0]} receiveShadow>
    <planeGeometry args={[8.4,8.4]}/>
    <meshStandardMaterial map={roomWood} color="#d8cfc3" roughness={.58} metalness={0}/>
  </mesh>}
  <Pane p={[0,0,b*5]} len={10} ax="x"/><Pane p={[-5,0,0]} len={10} ax="z"/><Pane p={[5,0,0]} len={10} ax="z"/>
  <Pane p={[-3.5,0,-b*5]} len={3} ax="x"/><Pane p={[3.5,0,-b*5]} len={3} ax="x"/>
  <Doorway b={b}/>
  {[[-5,-5],[5,-5],[-5,5],[5,5]].map(([x,z],i)=><Box key={i} p={[x,1.3,z]} a={[.1,2.6,.1]} c={AL} m={.15} ro={.3}/>)}
  <Plant p={[4.3,0,b*4.3]}/>{(r.t==='meet')&&<Plant p={[-4.3,0,b*4.3]}/>}
  {r.t!=='library'&&r.t!=='lab'&&<Credenza p={[0,0,b*4.45]}/>}
  {r.t==='desk'&&<group position={[2.2,0,3.2]}>
    <mesh position={[0,0.55,0]} castShadow><cylinderGeometry args={[0.04,0.05,1.1,8]}/><meshStandardMaterial color="#8a8176" roughness={0.6} metalness={0.2}/></mesh>
    <mesh position={[0,1.12,0]}><sphereGeometry args={[0.09,12,10]}/><meshStandardMaterial color="#f3e2c4" emissive="#e7b56a" emissiveIntensity={0.45} roughness={0.4}/></mesh>
    <pointLight color="#f0d7b4" intensity={0.7} distance={4.5} position={[0,1.05,0]}/>
  </group>}
  {r.t==='desk'&&[-2.5,2.5].flatMap(dx=>[-2.5,2.5].map(dz=>{const s=dz<0?1:-1;return <group key={dx+'_'+dz} position={[dx,0,dz]}>
   <Box p={[0,.86,0]} a={[3,.07,1.4]} c={WN} ro={.3} m={.05}/><Box p={[-1.35,.41,0]} a={[.08,.82,1.2]} c={GR} m={.8} ro={.3}/><Box p={[1.35,.41,0]} a={[.08,.82,1.2]} c={GR} m={.8} ro={.3}/>
   <group rotation={[0,s>0?0:Math.PI,0]}><Workstation kind={KIND[r.id]}/></group></group>}))}
  {r.t==='meet'&&<><Box p={[0,.4,0]} a={[.5,.8,.5]} c={GR} m={.8} ro={.3}/><mesh position={[0,.84,0]} castShadow receiveShadow><cylinderGeometry args={[1.9,1.9,.07,48]}/><meshStandardMaterial color={WN} roughness={.3} metalness={.05}/></mesh>
   {r.slots.map((q,i)=>{const dx=q.x-r.x,dz=q.z-r.z;return <group key={i}><Chair p={[dx*1.22,0,dz*1.22]} r={q.f+Math.PI}/><Laptop p={[dx*.43,0,dz*.43]} r={Math.atan2(dx,dz)}/></group>})}</>}
  {r.t==='library'&&<LibraryRoom r={r}/>}
  {r.t==='lab'&&<LabRoom r={r}/>}
 </group>}

const ST_FR:Record<string,string>={work:'Travaille',collab:'Collabore',walk:'Marche',sleep:'Zzz'}
/** HUD rail width + margin — tags hide when projected into this strip. */
const RAIL_PAD=380

function AgentView({a,selected}:{a:Agent;selected:boolean}){
 const g=useRef<THREE.Group>(null!),body=useRef<THREE.Group>(null!),ring=useRef<THREE.Mesh>(null!)
 const lidL=useRef<THREE.Mesh>(null!),lidR=useRef<THREE.Mesh>(null!)
 const eyeL=useRef<THREE.Mesh>(null!),eyeR=useRef<THREE.Mesh>(null!)
 const tagWrap=useRef<HTMLDivElement>(null!)
 const tagState=useRef<HTMLElement>(null!)
 const bubbleWrap=useRef<HTMLDivElement>(null!)
 const bubbleText=useRef<HTMLDivElement>(null!)
 const lastState=useRef(a.state)
 const ph=useMemo(()=>Math.random()*6,[])
 const letter=(a.name.trim()[0]||'?').toUpperCase()
 const band=useMemo(()=>initTex(letter),[letter])
 const [avMap,setAvMap]=useState<THREE.Texture|null>(null)
 const [hovered,setHovered]=useState(false)
 const vis=useRef({x:a.x,z:a.z,by:.1,bz:0,bx:0,walk:0,lid:0,dim:1})
 const proj=useMemo(()=>new THREE.Vector3(),[])
 /* no useSim — motion + tag state via useFrame/refs (P1) */
 useEffect(()=>{
  if(!a.hasAvatar){setAvMap(null);return}
  let dead=false
  const loader=new THREE.TextureLoader()
  /* Go serves /avatars/{id} for png|jpg|webp — no client extension assumption */
  loader.load(`/avatars/${a.id}`,t=>{
   if(dead){t.dispose();return}
   t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;setAvMap(t)
  },undefined,()=>{if(!dead)setAvMap(null)})
  return()=>{dead=true}
 },[a.hasAvatar,a.id])
 useFrame(({clock,camera,size},dt)=>{
  dt=Math.min(dt,.033);const t=clock.elapsedTime,v=vis.current
  const pk=1-Math.exp(-dt*5.5)
  v.x+=(a.x-v.x)*pk;v.z+=(a.z-v.z)*pk
  g.current.position.set(v.x,0,v.z)
  let d=a.yaw-g.current.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d))
  g.current.rotation.y+=d*(1-Math.exp(-dt*4))
  const sleep=a.state==='sleep',walking=a.state==='walk',talking=a.state==='collab'&&a.talkUntil>performance.now()
  const breath=Math.sin(t*(sleep?.85:1.6)+ph)
  const ty=sleep
    ? .06+breath*.03
    : .1+breath*.04+(talking?Math.sin(t*8)*.015:0)+(v.walk*Math.abs(Math.sin(t*9+ph))*.055)
  const tz=sleep ? .14+Math.sin(t*.65+ph)*.02 : Math.sin(t*1.15+ph)*v.walk*.035
  const tx=sleep ? .05 : 0
  const bk=1-Math.exp(-dt*3.2)
  v.by+=(ty-v.by)*bk;v.bz+=(tz-v.bz)*bk;v.bx+=(tx-v.bx)*bk
  body.current.position.y=v.by;body.current.rotation.z=v.bz;body.current.rotation.x=v.bx
  const twalk=walking?1:0;v.walk+=(twalk-v.walk)*(1-Math.exp(-dt*3))
  const rate=sleep?.55:1.4+v.walk*2.2
  const pu=.5+.5*Math.sin(t*rate+ph)
  ring.current.scale.setScalar(1+pu*(sleep?.025:.08))
  ;(ring.current.material as THREE.MeshBasicMaterial).opacity=sleep?.12+pu*.08:.5+pu*.3
  const tlid=sleep?1:0,tdim=sleep?.35:1
  v.lid+=(tlid-v.lid)*(1-Math.exp(-dt*3.5));v.dim+=(tdim-v.dim)*(1-Math.exp(-dt*3))
  if(lidL.current){lidL.current.scale.y=.02+v.lid*.98;lidL.current.visible=v.lid>.05;lidL.current.position.y=1.05+(.05*v.lid)}
  if(lidR.current){lidR.current.scale.y=.02+v.lid*.98;lidR.current.visible=v.lid>.05;lidR.current.position.y=1.05+(.05*v.lid)}
  if(eyeL.current){(eyeL.current.material as THREE.MeshBasicMaterial).color.setStyle(a.color).multiplyScalar(.55+v.dim*.45)}
  if(eyeR.current){(eyeR.current.material as THREE.MeshBasicMaterial).color.setStyle(a.color).multiplyScalar(.55+v.dim*.45)}
  /* state label via DOM ref — no React reconcile */
  if(tagState.current&&a.state!==lastState.current){
   lastState.current=a.state
   tagState.current.textContent=ST_FR[a.state]||a.state
  }
  /* hide tag when behind right HUD rail (~360px) */
    if(bubbleWrap.current){
   const on=!!(a.bubble&&a.bubbleUntil>performance.now())
   bubbleWrap.current.style.visibility=on?'':'hidden'
   if(on&&bubbleText.current&&bubbleText.current.textContent!==a.bubble)bubbleText.current.textContent=a.bubble
  }
  if(tagWrap.current){
   proj.set(v.x,2.05,v.z).project(camera)
   const sx=(proj.x*.5+.5)*size.width
   const behind=proj.z>1||sx>size.width-RAIL_PAD
   tagWrap.current.style.visibility=behind?'hidden':''
  }
 })
 const showTag=selected||hovered
 return <group ref={g} scale={1.4}
  onPointerOver={e=>{e.stopPropagation();setHovered(true);ui.hoverAgent=a}}
  onPointerOut={()=>{setHovered(false);if(ui.hoverAgent===a)ui.hoverAgent=null}}>
  <group ref={body}>
   <mesh position={[0,.85,0]} scale={[1,1.25,1]} castShadow onClick={e=>{e.stopPropagation();if(ui.moved<CLICK_MOVE_MAX)selectAgent(a)}}>
    <sphereGeometry args={[.38,24,16]}/><meshStandardMaterial color={a.color} roughness={.35} metalness={.04}/>
   </mesh>
   <mesh position={[0,.42,0]} castShadow>
    <capsuleGeometry args={[.28,.42,6,12]}/><meshStandardMaterial color={a.color} roughness={.45} metalness={.03}/>
   </mesh>
   <mesh position={[0,.62,.16]}>
    <boxGeometry args={[.34,.08,.06]}/><meshStandardMaterial color="#1c1a17" roughness={.5}/>
   </mesh>
   <mesh position={[0,.5,.3]}>
    <boxGeometry args={[.12,.08,.02]}/><meshStandardMaterial color="#1c1a17" roughness={.4} metalness={.2}/>
   </mesh>
   {([[-.34,.58,0],[.34,.58,0]] as [number,number,number][]).map((pos,i)=><mesh key={'sh'+i} position={pos} castShadow>
    <sphereGeometry args={[.1,12,10]}/><meshStandardMaterial color={a.color} roughness={.4}/>
   </mesh>)}
   {[[-.4,.34,0,.4],[.4,.34,0,-.4]].map((v,i)=><mesh key={'arm'+i} position={[v[0],v[1],v[2]]} rotation={[0,0,v[3]]} castShadow>
    <capsuleGeometry args={[.07,.28,4,8]}/><meshStandardMaterial color={a.color} roughness={.5}/>
   </mesh>)}
   {([[-.12,.08,.04],[.12,.08,.04]] as [number,number,number][]).map((pos,i)=><mesh key={'ft'+i} position={pos} castShadow>
    <capsuleGeometry args={[.07,.1,4,8]}/><meshStandardMaterial color="#1c1a17" roughness={.6}/>
   </mesh>)}
   <mesh position={[0,.78,0]} scale={[1.015,1.25,1.015]}>
    <sphereGeometry args={[.55,24,12,0,Math.PI*2,Math.PI/2-0.22,0.44]}/>
    <meshStandardMaterial map={band} transparent roughness={.45} metalness={.08} depthWrite={false}/>
   </mesh>
   <mesh position={[0,1.16,.34]}><boxGeometry args={[.5,.05,.08]}/><meshStandardMaterial color="#14161a" roughness={.4}/></mesh>
   <mesh position={[0,1.05,.4]}><boxGeometry args={[.72,.32,.24]}/><meshStandardMaterial color="#14161a" roughness={.15} metalness={.35}/></mesh>
   <mesh ref={eyeL} position={[-.16,1.05,.53]}><boxGeometry args={[.18,.16,.03]}/><meshBasicMaterial color={a.color}/></mesh>
   <mesh ref={eyeR} position={[.16,1.05,.53]}><boxGeometry args={[.18,.16,.03]}/><meshBasicMaterial color={a.color}/></mesh>
   <mesh ref={lidL} position={[-.16,1.05,.545]}><boxGeometry args={[.19,.16,.02]}/><meshStandardMaterial color="#14161a" roughness={.3}/></mesh>
   <mesh ref={lidR} position={[.16,1.05,.545]}><boxGeometry args={[.19,.16,.02]}/><meshStandardMaterial color="#14161a" roughness={.3}/></mesh>
   {avMap&&<mesh position={[0,.52,.5]}><circleGeometry args={[.2,20]}/><meshBasicMaterial map={avMap} toneMapped={false}/></mesh>}
  </group>
  <mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[.72,selected?.88:.8,32]}/><meshBasicMaterial color={a.color} transparent side={THREE.DoubleSide}/></mesh>
  <Html position={[0,2.35,0]} center zIndexRange={[30,15]} style={{pointerEvents:'none'}}>
   <div ref={bubbleWrap} className="speech-bubble" style={{visibility:'hidden'}}>
    <div ref={bubbleText}>{a.bubble||'…'}</div>
   </div>
  </Html>
  {showTag&&<Html position={[0,2.05,0]} center zIndexRange={[20,10]} style={{pointerEvents:'none'}}>
   <div ref={tagWrap} className={'tag'+(selected?' on':'')}>
    <span className="tag-row">
     {a.hasAvatar?<img className="tag-av" src={`/avatars/${a.id}`} alt=""/>:<i className="dot" style={{background:a.color}}/>}
     {a.name}
    </span>
    <small ref={tagState as any}>{ST_FR[a.state]||a.state}</small>
   </div>
  </Html>}
 </group>}

function TalkBeam({a,b}:{a:Agent;b:Agent}){
 const mesh=useRef<THREE.Mesh>(null!)
 const up=useMemo(()=>new THREE.Vector3(0,1,0),[])
 const dir=useMemo(()=>new THREE.Vector3(),[])
 useFrame(()=>{
  const m=mesh.current;if(!m)return
  const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz)
  if(d<.35){m.visible=false;return}
  m.visible=true
  m.position.set((a.x+b.x)/2,1.45,(a.z+b.z)/2)
  dir.set(dx,0,dz).normalize()
  m.quaternion.setFromUnitVectors(up,dir)
  m.scale.set(.045,d,.045)
 })
 return <mesh ref={mesh}>
  <cylinderGeometry args={[1,1,1,6]}/>
  <meshBasicMaterial color="#7eb6e8" transparent opacity={.42} depthWrite={false}/>
 </mesh>
}
function TalkBeams(){
 useSim()
 const pairs=talkPairs()
 return <>{pairs.map(([a,b])=><TalkBeam key={a.id+'-'+b.id} a={a} b={b}/>)}</>
}
function Tick(){useFrame(({clock})=>{scr.code.offset.y=(clock.elapsedTime*.03)%1});return null}
export function Scene(){
 /* useSim only for roster mount/unmount + selection prop — not per-frame motion */
 useSim()
 return <>
 <color attach="background" args={['#e7e5e0']}/><fog attach="fog" args={['#e7e5e0',70,160]}/>
 <hemisphereLight args={['#f4efe6','#6e675c',0.42]}/>
 <ambientLight intensity={0.08} color="#e6e2da"/>
 {/* one warm rake across the parquet — no bloom, no second sun */}
 <directionalLight castShadow intensity={1.55} color="#f0d7b4" position={[10,9,6]} shadow-mapSize={[1024,1024]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-near={1} shadow-camera-far={48} shadow-bias={-.0004} shadow-normalBias={.03}/>
 <directionalLight intensity={0.28} color="#c5d0dc" position={[-14,8,-6]}/>
 <Box p={[0,-.23,0]} a={[38.4,.4,26.4]} c="#cfcac2" ro={.7}/>
 <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[38,26]}/><meshStandardMaterial map={wood} roughness={.5}/></mesh>
 <mesh rotation={[-Math.PI/2,0,0]} position={[0,.015,0]} receiveShadow><planeGeometry args={[38,4]}/><meshStandardMaterial color="#d9d6d0" roughness={.35} metalness={.05}/></mesh>
 {[-2,2].map(z=><Box key={z} p={[0,.022,z]} a={[38,.01,.04]} c="#b4b7bc" m={.15} ro={.3}/>)}
 <ContactShadows position={[0,0.02,0]} opacity={0.38} scale={36} blur={2.2} far={6} color="#1a1612"/>
 {rooms.map(r=><RoomView key={r.id} r={r}/>)}{rooms.map(r=><RoomLabel key={r.id+"-lbl"} r={r}/>)}
 {agents.map(a=><AgentView key={a.id} a={a} selected={ui.sel===a}/>)}
 <TalkBeams/>
 <Rig/><Tick/></>}
