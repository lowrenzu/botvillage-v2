import {RoundedBox} from '@react-three/drei'
import * as THREE from 'three'

type V3=[number,number,number]

const Box=({p,a,c,e,r=0,ei=1,m=.1,ro=.55,shadow=false}:{p:V3;a:V3;c:string;e?:string;r?:number;ei?:number;m?:number;ro?:number;shadow?:boolean})=>
 <mesh position={p} rotation={[0,r,0]} castShadow={shadow} receiveShadow={shadow}><boxGeometry args={a}/><meshStandardMaterial color={c} emissive={e||'#1a1816'} emissiveIntensity={ei} roughness={ro} metalness={m}/></mesh>
const AL='#d3d6da',GR='#8f9299',WH='#f2f0ec',WN='#6b5646'

const Plant=({p}:{p:V3})=><group position={p}>
 <mesh position={[0,.35,0]} castShadow><cylinderGeometry args={[.32,.26,.7,16]}/><meshStandardMaterial color="#efede8" roughness={.7}/></mesh>
 {[[0,1.1,0,.5],[.2,.8,.1,.32],[-.17,.85,-.1,.34]].map(([x,y,z,r],i)=><mesh key={i} position={[x,y,z]}><sphereGeometry args={[r,12,10]}/><meshStandardMaterial color="#4f8a62" roughness={.8}/></mesh>)}</group>
const cvs=(w:number,h:number,f:(x:CanvasRenderingContext2D)=>void)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d')!);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
const scr={
 code:cvs(256,160,x=>{x.fillStyle='#1e2430';x.fillRect(0,0,256,160);for(let i=0;i<18;i++){let px=12+(Math.random()*3|0)*12;for(let k=0,n=1+Math.random()*6|0;k<n;k++){const w=8+Math.random()*28;x.fillStyle=['#7aa2f7','#9ece6a','#e0af68','#bb9af7','#c0caf5'][Math.random()*5|0];x.globalAlpha=.85;x.fillRect(px,5+i*8.4,w,3.5);px+=w+4}}x.globalAlpha=1}),
 chart:cvs(256,160,x=>{x.fillStyle='#eceff3';x.fillRect(0,0,256,160);x.fillStyle='#fff';[[8,8,116,70],[136,8,112,70],[8,88,240,64]].forEach(([a,b,c,d])=>{x.beginPath();x.roundRect(a,b,c,d,6);x.fill()})
  for(let i=0;i<10;i++){const h=10+Math.random()*45;x.fillStyle=i%4?'#b9d2ee':'#5e9bd6';x.fillRect(16+i*10,72-h,7,h)}
  x.strokeStyle='#5cb98f';x.lineWidth=2;x.beginPath();for(let i=0;i<14;i++){const px=148+i*7,py=58-Math.sin(i/2.4)*14-i;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()
  x.strokeStyle='#e0a062';x.beginPath();for(let i=0;i<24;i++){const px=16+i*9,py=130-Math.sin(i/4)*14-Math.random()*4;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()}),
 wall:cvs(256,160,x=>{const g=x.createLinearGradient(0,0,256,160);g.addColorStop(0,'#3d5a96');g.addColorStop(.6,'#9a7fc0');g.addColorStop(1,'#e8a9b5');x.fillStyle=g;x.fillRect(0,0,256,160)
  x.fillStyle='rgba(255,255,255,.22)';x.beginPath();x.roundRect(75,140,106,14,8);x.fill();x.fillStyle='rgba(255,255,255,.88)';x.beginPath();x.roundRect(30,28,130,78,6);x.fill();x.fillStyle='#e5e7eb';x.fillRect(30,28,130,12)})}
scr.code.wrapT=THREE.RepeatWrapping
const keysTex=cvs(128,40,x=>{x.fillStyle='#eceef0';x.fillRect(0,0,128,40);x.fillStyle='#c4c7cc';for(let r=0;r<4;r++)for(let c=0;c<10;c++)x.fillRect(4+c*12,4+r*9,10,7)})
const KIND:Record<string,keyof typeof scr>={grok:'chart',build:'code',bot:'chart',meeting:'wall',competences:'code',skills:'wall'}
const labScr=cvs(256,160,x=>{x.fillStyle='#1e2430';x.fillRect(0,0,256,160)
 x.strokeStyle='rgba(180,190,205,.25)';x.strokeRect(6,6,244,148)
 x.fillStyle='rgba(140,160,190,.08)';x.fillRect(6,6,244,20)
 x.fillStyle='#a8b4c4';x.font='600 12px monospace';x.fillText('COMPÉTENCES · NODES',14,20)
 for(let i=0;i<10;i++){const h=18+((i*17)%40);x.fillStyle=i%3?'#3a5a78':'#5a7a98';x.fillRect(14+i*22,130-h,16,h)}
 x.strokeStyle='#6a8aaa';x.lineWidth=1.2;x.beginPath();for(let i=0;i<20;i++){const px=14+i*11,py=42-Math.sin(i/2.6)*10;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke()
 x.fillStyle='rgba(90,180,120,.55)';for(let i=0;i<8;i++)x.fillRect(148+i*12,28,6,4+(i%2)*3)})
/* Compétences uses the shared room-scale parquet; racks stay hi-tech. */
const Metal=({c='#d3d6da',r=.25}:{c?:string;r?:number})=><meshStandardMaterial color={c} metalness={.9} roughness={r}/>
const Workstation=({kind}:{kind:keyof typeof scr})=><group>
 <RoundedBox args={[1.5,.012,.62]} radius={.006} position={[0,.9,.42]} receiveShadow><meshStandardMaterial color="#3a3d42" roughness={.85}/></RoundedBox>
 <RoundedBox args={[.7,.025,.42]} radius={.012} position={[0,.92,-.15]}><Metal/></RoundedBox>
 <RoundedBox args={[.16,.56,.05]} radius={.02} position={[0,1.2,-.23]} rotation={[-.1,0,0]}><Metal/></RoundedBox>
 <group position={[0,1.66,-.24]} rotation={[-.07,0,0]}>
  <RoundedBox args={[1.56,.92,.05]} radius={.035} smoothness={4} castShadow><Metal c="#c9ccd1" r={.3}/></RoundedBox>
  <RoundedBox args={[1.52,.88,.01]} radius={.03} position={[0,0,.027]}><meshStandardMaterial color="#2c3036" roughness={.1}/></RoundedBox>
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

export { Box, AL, GR, WH, WN, Plant, cvs, scr, keysTex, KIND, labScr, Metal, Workstation, Laptop, Credenza, Chair, Pane, Doorway }
