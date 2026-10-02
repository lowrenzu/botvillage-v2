import {useEffect,useMemo} from 'react'
import {RoundedBox} from '@react-three/drei'
import * as THREE from 'three'
import {skillBooks,byVotes,ui,go,CLICK_MOVE_MAX,type Room,type SkillJSON} from '../sim'
import { Box, AL, GR, WH, WN, Plant, Workstation, Laptop, Credenza, Chair, Pane, Doorway, scr, KIND, labScr, Metal, cvs, keysTex } from './primitives'
import { roomWood } from './textures'

type V3=[number,number,number]

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


function skillListTex(title: string, skills: SkillJSON[]) {
  return cvs(512, 640, x => {
    x.fillStyle = '#171512'
    x.fillRect(0, 0, 512, 640)
    x.fillStyle = '#c46a32'
    x.fillRect(0, 0, 512, 6)
    x.fillStyle = '#f3efe6'
    x.font = '500 28px sans-serif'
    x.fillText(title, 28, 48)
    x.fillStyle = '#9a9186'
    x.font = '18px sans-serif'
    x.fillText(skills.length ? skills.length + ' au dossier' : 'dossier vide', 28, 78)
    const list = skills.slice(0, 18)
    list.forEach((s, i) => {
      x.fillStyle = i % 2 ? '#2a2622' : '#221f1c'
      x.fillRect(20, 100 + i * 28, 472, 26)
      x.fillStyle = '#f3efe6'
      x.font = '20px sans-serif'
      x.fillText(shortSkillLabel(s), 32, 118 + i * 28)
    })
    if (!list.length) {
      x.fillStyle = '#9a9186'
      x.fillText('Aucun skill', 32, 130)
    }
  })
}
function SkillBoard({title, skills, p, r = 0}:{title:string; skills:SkillJSON[]; p:V3; r?:number}) {
  const key = skills.map(s => s.id + ':' + s.name).join('|')
  const map = useMemo(() => skillListTex(title, skills), [key, title]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => map.dispose(), [map])
  return <group position={p} rotation={[0, r, 0]}>
    <RoundedBox args={[2.4, 3.0, .06]} radius={.02} position={[0, 1.7, 0]} castShadow>
      <meshStandardMaterial color="#2a2622" roughness={.6}/>
    </RoundedBox>
    <mesh position={[0, 1.7, .04]}><planeGeometry args={[2.2, 2.75]}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>
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
  const books=byVotes('skills', skillBooks)
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
    <SkillBoard title="Skills" skills={books} p={[0,0,b*3.15]} r={b>0?Math.PI:0}/>
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
      <meshStandardMaterial color="#2e343c" metalness={.62} roughness={.32}/>
    </RoundedBox>
    <Box p={[0,0,.355]} a={[w-.08,.28,.025]} c="#2e343c" m={.35} ro={.4}/>
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
      <meshStandardMaterial color="#2a3038" metalness={.55} roughness={.32}/>
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
    {/* shared room parquet; keep the lab racks and console hi-tech */}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.028,0]} receiveShadow>
      <planeGeometry args={[8.4,8.4]}/>
      <meshStandardMaterial map={roomWood} color="#d8cfc3" roughness={.58} metalness={0}/>
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
    <SkillBoard title="Compétences" skills={byVotes('skills', skillBooks)} p={[0,0,b*4.35]} r={b>0?Math.PI:0}/>
    <group position={[-3.45,0,b*3.5]}>
      <RoundedBox args={[1.2,1.5,.65]} radius={.015} position={[0,.75,0]} castShadow>
        <meshStandardMaterial color="#2a3038" metalness={.55} roughness={.3}/>
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
  {/* one floor only — every room uses the shared roomWood parquet */}
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
   <group rotation={[0,s>0?0:Math.PI,0]}><Workstation kind={KIND[r.id]}/><DeskExtras/></group></group>}))}
  {r.t==='meet'&&<><Box p={[0,.4,0]} a={[.5,.8,.5]} c={GR} m={.8} ro={.3}/><mesh position={[0,.84,0]} castShadow receiveShadow><cylinderGeometry args={[1.9,1.9,.07,48]}/><meshStandardMaterial color={WN} roughness={.3} metalness={.05}/></mesh>
   {r.slots.map((q,i)=>{const dx=q.x-r.x,dz=q.z-r.z;return <group key={i}><Chair p={[dx*1.22,0,dz*1.22]} r={q.f+Math.PI}/><Laptop p={[dx*.43,0,dz*.43]} r={Math.atan2(dx,dz)}/></group>})}</>}
  {r.t==='library'&&<LibraryRoom r={r}/>}
  {r.t==='lab'&&<LabRoom r={r}/>}
 </group>}

export { RoomView, LibraryRoom, LabRoom, shortSkillLabel, bookSpineTex, SkillBoard, DeskExtras, Bookshelf, ReadingLamp, ServerUnit, ServerRack, CableTray, ConsoleDesk, StatusPanel }
