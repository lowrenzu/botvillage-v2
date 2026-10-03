import {useEffect,useMemo} from 'react'
import {RoundedBox} from '@react-three/drei'
import * as THREE from 'three'
import {skillBooks,byVotes,ui,go,setSkillsOpen,setCompetencesOpen,CLICK_MOVE_MAX,type Room,type SkillJSON} from '../sim'
import { Box, AL, GR, WN, Plant, Workstation, Laptop, Credenza, Chair, Pane, Doorway, scr, KIND, labScr, Metal, cvs, keysTex } from './primitives'
import { roomWood } from './textures'

type V3=[number,number,number]

function shortSkillLabel(s:SkillJSON){
  const n=(s.name||s.id||'').trim().replace(/[-_]/g,' ')
  if(n.length<=16)return n
  return n.slice(0,14)+'…'
}
function wideSkillLabel(s: SkillJSON) {
  const n = (s.name || s.id || '').trim().replace(/[-_]/g, ' ')
  if (n.length <= 34) return n
  return n.slice(0, 32) + '…'
}
function skillListTex(title: string, skills: SkillJSON[], wide = false, accent = '#58b3ab') {
  const W = wide ? 1536 : 512
  const H = wide ? 440 : 640
  return cvs(W, H, x => {
    x.fillStyle = '#3a424c'
    x.fillRect(0, 0, W, H)
    x.fillStyle = wide ? accent : '#c46a32'
    x.fillRect(0, 0, W, wide ? 10 : 6)
    x.fillStyle = '#f3efe6'
    x.font = wide ? '500 42px sans-serif' : '500 28px sans-serif'
    x.fillText(title, wide ? 40 : 28, wide ? 62 : 48)
    x.fillStyle = '#9a9186'
    x.font = wide ? '22px sans-serif' : '18px sans-serif'
    x.fillText(skills.length ? skills.length + ' au dossier' : 'dossier vide', wide ? 40 : 28, wide ? 98 : 78)
    if (!skills.length) {
      x.fillStyle = '#9a9186'
      x.fillText('Aucun skill', wide ? 40 : 32, wide ? 170 : 130)
      return
    }
    if (!wide) {
      skills.slice(0, 18).forEach((s, i) => {
        x.fillStyle = i % 2 ? '#4a5560' : '#424a54'
        x.fillRect(20, 100 + i * 28, 472, 26)
        x.fillStyle = '#f3efe6'
        x.font = '20px sans-serif'
        x.fillText(shortSkillLabel(s), 32, 118 + i * 28)
      })
      return
    }
    const per = 8
    const colW = (W - 72) / 2
    for (let c = 0; c < 2; c++) {
      skills.slice(c * per, (c + 1) * per).forEach((s, i) => {
        const x0 = 36 + c * colW
        x.fillStyle = i % 2 ? '#4a5560' : '#424a54'
        x.fillRect(x0, 122 + i * 36, colW - 20, 30)
        x.fillStyle = '#f3efe6'
        x.font = '22px sans-serif'
        x.fillText(wideSkillLabel(s), x0 + 14, 144 + i * 36)
      })
    }
  })
}
function SkillBoard({title, skills, p, r = 0, catalog, wide = false, accent = '#58b3ab'}:{title:string; skills:SkillJSON[]; p:V3; r?:number; catalog?:'skills'|'competences'; wide?:boolean; accent?:string}) {
  const key = skills.map(s => s.id + ':' + s.name).join('|')
  const map = useMemo(() => skillListTex(title, skills, wide, accent), [key, title, wide, accent]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => map.dispose(), [map])
  const W = wide ? 7.4 : 2.4
  const H = wide ? 2.28 : 3.0
  const y = wide ? 1.22 : 1.7
  const open = () => {
    if (ui.moved >= CLICK_MOVE_MAX) return
    if (catalog === 'skills') setSkillsOpen(true)
    if (catalog === 'competences') setCompetencesOpen(true)
  }
  return <group position={p} rotation={[0, r, 0]}
    onPointerOver={catalog ? e => { e.stopPropagation(); document.body.style.cursor = 'pointer' } : undefined}
    onPointerOut={catalog ? () => { document.body.style.cursor = '' } : undefined}
    onClick={catalog ? e => { e.stopPropagation(); open() } : undefined}>
    <RoundedBox args={[W, H, .07]} radius={.02} position={[0, y, 0]} castShadow>
      <meshStandardMaterial color="#4a5560" roughness={.6}/>
    </RoundedBox>
    <mesh position={[0, y, .05]}><planeGeometry args={[W - .22, H - .22]}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>
    <mesh position={[0, y, -.05]} rotation={[0, Math.PI, 0]}><planeGeometry args={[W - .22, H - .22]}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>
  </group>
}
function DeskExtras() {
  return <group>
    <Box p={[-1.15, .55, .35]} a={[.42, .28, .04]} c="#6e6256" ro={.5}/>
    <Box p={[-1.15, .22, .35]} a={[.42, .28, .04]} c="#6e6256" ro={.5}/>
    <mesh position={[1.15, .92, .35]} castShadow><cylinderGeometry args={[.06, .07, .1, 12]}/><meshStandardMaterial color="#d8cfc3" roughness={.4}/></mesh>
    <mesh position={[-.15, .91, .42]} rotation={[-Math.PI/2, 0, .2]}><planeGeometry args={[.34, .24]}/><meshStandardMaterial color="#f4efe6" roughness={.8}/></mesh>
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
  const books=byVotes('skills', skillBooks)
  /* Door is local −z. Keep the table on that side so the floor word (z ±1.2) stays open. */
  const tz=b*-2.7
  return <>
    {/* Face +z: the overview camera sits on that side, so the list is readable from the hall view. */}
    <SkillBoard title="Skills" catalog="skills" wide skills={books} p={[0,0,b*3.9]} r={b>0?0:Math.PI}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.048,tz]} receiveShadow>
      <planeGeometry args={[2.6,1.5]}/>
      <meshStandardMaterial color="#7a6554" roughness={.92} metalness={0}/>
    </mesh>
    <RoundedBox args={[2.2,.08,1.05]} radius={.03} position={[0,.86,tz]} castShadow>
      <meshStandardMaterial color={WN} roughness={.3} metalness={.05}/>
    </RoundedBox>
    <Box p={[-0.95,.43,tz-.4]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[0.95,.43,tz-.4]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[-0.95,.43,tz+.4]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <Box p={[0.95,.43,tz+.4]} a={[.08,.86,.08]} c={GR} m={.75} ro={.3}/>
    <ReadingLamp p={[0.7,.9,tz]}/>
    <Chair p={[-1.2,0,tz+0.85]} r={b>0?Math.PI:0}/>
    <Chair p={[1.2,0,tz-0.85]} r={b>0?0:Math.PI}/>
    <Plant p={[-3.9,0,b*-3.3]}/>
    <Plant p={[3.9,0,b*-3.3]}/>
    <pointLight color="#fff6ea" intensity={1.5} distance={9} position={[0,3.2,b*1.4]} castShadow={false}/>
  </>
}

function ServerUnit({y,w=1.9}:{y:number;w?:number}){
  /* Une colonne or, fixe, lisible depuis la vue d'ensemble. */
  return <group position={[0,y,0]}>
    <RoundedBox args={[w,.34,.72]} radius={.01} castShadow>
      <meshStandardMaterial color="#46515c" emissive="#46515c" emissiveIntensity={0.28} metalness={.45} roughness={.38}/>
    </RoundedBox>
    <Box p={[0,0,.355]} a={[w-.08,.28,.025]} c="#46515c" e="#46515c" ei={0.22} m={.3} ro={.42}/>
    {[-.09,-.03,.03,.09].map((dy,i)=>(
      <mesh key={i} position={[0,dy,.37]}>
        <boxGeometry args={[w*.62,.014,.01]}/>
        <meshStandardMaterial color="#4a5560" emissive="#4a5560" emissiveIntensity={0.2} metalness={.28} roughness={.48}/>
      </mesh>
    ))}
    {[-.08,0,.08].map((dy,i)=>(
      <mesh key={i} position={[w*.4,dy,.4]}>
        <sphereGeometry args={[.038,10,8]}/>
        <meshStandardMaterial color="#c9a84a" emissive="#c9a84a" emissiveIntensity={.7} roughness={.35}/>
      </mesh>
    ))}
  </group>
}

function ServerRack({p,r=0,units=9}:{p:V3;r?:number;units?:number}){
  const H=3.4, W=2.2, D=.95
  return <group position={p} rotation={[0,r,0]}>
    <RoundedBox args={[W,H,D]} radius={.025} position={[0,H/2,0]} castShadow receiveShadow>
      <meshStandardMaterial color="#3e4650" emissive="#3e4650" emissiveIntensity={0.26} metalness={.42} roughness={.38}/>
    </RoundedBox>
    <Box p={[-W/2+.05,H/2,D/2-.02]} a={[.08,H-.1,.05]} c={AL} m={.75} ro={.22}/>
    <Box p={[W/2-.05,H/2,D/2-.02]} a={[.08,H-.1,.05]} c={AL} m={.75} ro={.22}/>
    <Box p={[0,H-.05,0]} a={[W+.06,.1,D+.06]} c="#46515c" e="#46515c" ei={0.22} m={.4} ro={.32}/>
    <Box p={[0,.06,0]} a={[W+.04,.12,D+.04]} c="#3a424c" e="#3a424c" ei={0.2} m={.35} ro={.4}/>
    <mesh position={[0,H/2,D/2+.02]}>
      <boxGeometry args={[W-.14,H-.22,.03]}/>
      <meshStandardMaterial color="#b8cce0" transparent opacity={.22} roughness={.04} metalness={.35} depthWrite={false}/>
    </mesh>
    {Array.from({length:units},(_,i)=>(
      <ServerUnit key={i} y={.38+i*.34} w={W-.22}/>
    ))}
    <mesh position={[0,H-.2,D/2+.035]}>
      <boxGeometry args={[.55,.06,.025]}/>
      <meshStandardMaterial color="#c9a84a" emissive="#c9a84a" emissiveIntensity={.45} roughness={.4}/>
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
        <meshStandardMaterial color={i%2?'#4a5560':'#3a424c'} roughness={.7}/>
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
    <Box p={[0,.06,0]} a={[2.7,.08,1.05]} c="#3e4650" e="#3e4650" ei={0.2} m={.32} ro={.42}/>
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
    x.fillStyle='#3a424c';x.fillRect(0,0,256,160)
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
  /* Same plan as Skills: wide screen on the camera wall, floor word clear, desk toward the door. */
  const tz=b*-2.7
  return <>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.028,0]} receiveShadow>
      <planeGeometry args={[8.4,8.4]}/>
      <meshStandardMaterial map={roomWood} color="#3c434c" roughness={.72} metalness={.04}/>
    </mesh>
    <Box p={[0,.04,4.15]} a={[8.4,.035,.1]} c={AL} m={.2} ro={.3}/>
    <Box p={[0,.04,-4.15]} a={[8.4,.035,.1]} c={AL} m={.2} ro={.3}/>
    <Box p={[-4.15,.04,0]} a={[.1,.035,8.4]} c={AL} m={.2} ro={.3}/>
    <Box p={[4.15,.04,0]} a={[.1,.035,8.4]} c={AL} m={.2} ro={.3}/>
    <SkillBoard title="Compétences" catalog="competences" wide accent="#c9a84a" skills={byVotes('skills', skillBooks)} p={[0,0,b*3.9]} r={b>0?0:Math.PI}/>
    <ServerRack p={[-4.15,0,b*2.6]} r={Math.PI/2} units={6}/>
    <ServerRack p={[4.15,0,b*2.6]} r={-Math.PI/2} units={6}/>
    <ConsoleDesk p={[0,0,tz]} r={b>0?0:Math.PI}/>
    <Chair p={[0,0,tz+1.15]} r={b>0?Math.PI:0}/>
    <Plant p={[-3.9,0,b*-4.15]}/>
    <Plant p={[3.9,0,b*-4.15]}/>
    <pointLight color="#d5dee8" intensity={1.4} distance={9} position={[0,3.2,b*1.4]} castShadow={false}/>
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
  {/* one floor only — every room uses the shared roomWood parquet */}
  {!isLab&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.022,0]} receiveShadow>
    <planeGeometry args={[8.4,8.4]}/>
    <meshStandardMaterial map={roomWood} color="#d8cfc3" roughness={.58} metalness={0}/>
  </mesh>}
  {!isLab&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.036,0]}>
    <planeGeometry args={[7.5,7.5]}/>
    <meshBasicMaterial color={r.c} transparent opacity={.28} depthWrite={false}/>
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
   <group rotation={[0,s>0?0:Math.PI,0]}><Workstation kind={KIND[r.id]}/><DeskExtras/></group></group>}))}
  {r.t==='meet'&&<><Box p={[0,.4,0]} a={[.5,.8,.5]} c={GR} m={.8} ro={.3}/><mesh position={[0,.84,0]} castShadow receiveShadow><cylinderGeometry args={[1.9,1.9,.07,48]}/><meshStandardMaterial color={WN} roughness={.3} metalness={.05}/></mesh>
   {r.slots.map((q,i)=>{const dx=q.x-r.x,dz=q.z-r.z;return <group key={i}><Chair p={[dx*1.22,0,dz*1.22]} r={q.f+Math.PI}/><Laptop p={[dx*.43,0,dz*.43]} r={Math.atan2(dx,dz)}/></group>})}</>}
  {r.t==='library'&&<LibraryRoom r={r}/>}
  {r.t==='lab'&&<LabRoom r={r}/>}
 </group>}

export { RoomView, LibraryRoom, LabRoom, shortSkillLabel, SkillBoard, DeskExtras, ReadingLamp, ServerUnit, ServerRack, CableTray, ConsoleDesk, StatusPanel }
