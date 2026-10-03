import {memo,useEffect,useMemo,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import * as THREE from 'three'
import {ui,selectAgent,CLICK_MOVE_MAX,type Agent,type BvState} from '../sim'
import { initTex } from './labels'

/** Scene tag from API bvState only. Idle stays unlabeled. */
export function bvTagLabel(bv: string): string {
 return bv === 'work' ? 'Travail' : bv === 'talk' ? 'Parle' : bv === 'walk' ? 'Marche' : ''
}
/** HUD rail width + margin — tags hide when projected into this strip. */
const RAIL_PAD=380

/* Coque de buste : profil lathe (taille → poitrine → épaules → cou). Face = +z, même sens que l'ancien blob. */
const torsoGeo=new THREE.LatheGeometry(([[0,0],[.14,0],[.17,.06],[.22,.18],[.25,.3],[.235,.4],[.17,.46],[.08,.5],[0,.5]] as [number,number][]).map(([x,y])=>new THREE.Vector2(x,y)),48)
type GR=React.RefObject<THREE.Group>
/* main à cinq doigts, graphite. s = −1 gauche, +1 droite. */
const Hand=({s,m}:{s:number;m:THREE.Material})=><group>
 <mesh material={m} position={[0,-.045,0]}><boxGeometry args={[.075,.085,.03]}/></mesh>
 {[-.027,-.009,.009,.027].map((x,i)=><mesh key={i} material={m} position={[x,-.11,0]}><capsuleGeometry args={[.011,.05,3,6]}/></mesh>)}
 <mesh material={m} position={[s*.05,-.06,.005]} rotation={[0,0,s*.6]}><capsuleGeometry args={[.012,.04,3,6]}/></mesh>
</group>

const AgentView=memo(function AgentView({a,selected,bvState}:{a:Agent;selected:boolean;bvState:BvState}){
 const g=useRef<THREE.Group>(null!),body=useRef<THREE.Group>(null!),ring=useRef<THREE.Mesh>(null!)
 const lidL=useRef<THREE.Mesh>(null!),lidR=useRef<THREE.Mesh>(null!)
 const legL=useRef<THREE.Group>(null!),legR=useRef<THREE.Group>(null!),armL=useRef<THREE.Group>(null!),armR=useRef<THREE.Group>(null!)
 const shinL=useRef<THREE.Group>(null!),shinR=useRef<THREE.Group>(null!),foreL=useRef<THREE.Group>(null!),foreR=useRef<THREE.Group>(null!)
 const eyeL=useRef<THREE.Mesh>(null!),eyeR=useRef<THREE.Mesh>(null!)
 const tagWrap=useRef<HTMLDivElement>(null!)
 const tagState=useRef<HTMLElement>(null!)
 const bubbleWrap=useRef<HTMLDivElement>(null!)
 const bubbleText=useRef<HTMLDivElement>(null!)
 const lastState=useRef<string>(a.bvState)
 const ph=useMemo(()=>Math.random()*6,[])
 /* Couleur du roster un peu plus saturée, léger éclat, sans cœur ni flash. */
 const glow=useMemo(()=>{
  const c=new THREE.Color(a.color)
  const hsl={h:0,s:0,l:0}
  c.getHSL(hsl)
  c.setHSL(hsl.h, Math.min(1, Math.max(hsl.s,.15)+.18), THREE.MathUtils.clamp(hsl.l,.46,.58))
  return c
 },[a.color])
 const mats=useMemo(()=>({
  shell:new THREE.MeshPhysicalMaterial({color:glow,emissive:glow,emissiveIntensity:.16,roughness:.3,metalness:.05,clearcoat:.5,clearcoatRoughness:.18}),
  black:new THREE.MeshStandardMaterial({color:'#17181b',roughness:.38,metalness:.45}),
  glass:new THREE.MeshPhysicalMaterial({color:'#050608',roughness:.05,metalness:.6,clearcoat:1,clearcoatRoughness:.03}),
  metal:new THREE.MeshStandardMaterial({color:'#9aa0a8',roughness:.3,metalness:.6}),
  acc:new THREE.MeshStandardMaterial({color:glow,emissive:glow,emissiveIntensity:.4,roughness:.28,metalness:.2}),
 }),[glow])
 const letter=(a.name.trim()[0]||'?').toUpperCase()
 const band=useMemo(()=>initTex(letter),[letter])
 const [avMap,setAvMap]=useState<THREE.Texture|null>(null)
 const hot=useRef(false)
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
 useEffect(()=>()=>{
  mats.shell.dispose();mats.black.dispose();mats.glass.dispose();mats.metal.dispose();mats.acc.dispose()
 },[mats])
 useFrame(({clock,camera},dt)=>{
  dt=Math.min(dt,.033);const t=clock.elapsedTime,v=vis.current
  const pk=1-Math.exp(-dt*5.5)
  v.x+=(a.x-v.x)*pk;v.z+=(a.z-v.z)*pk
  g.current.position.set(v.x,0,v.z)
  let d=a.yaw-g.current.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d))
  g.current.rotation.y+=d*(1-Math.exp(-dt*4))
  /* Live: no sleep/zzz pose — bvState roster only. */
  if(a.bvState==='zzz') a.bvState='idle'
  if(a.state==='sleep') a.state=a.path.length?'walk':(a.bvState==='work'?'work':a.bvState==='talk'?'collab':'idle')
  const walking=a.state==='walk',talking=a.state==='collab'&&a.talkUntil>performance.now()
  const breath=Math.sin(t*1.6+ph)
  const ty=.1+breath*.04+(talking?Math.sin(t*8)*.015:0)+(v.walk*Math.abs(Math.sin(t*9+ph))*.055)
  const tz=Math.sin(t*1.15+ph)*v.walk*.035
  const tx=0
  const bk=1-Math.exp(-dt*3.2)
  v.by+=(ty-v.by)*bk;v.bz+=(tz-v.bz)*bk;v.bx+=(tx-v.bx)*bk
  /* Desk pose: lean into workstation when bvState=work and standing at desk. +x pitches the +z face forward. */
  const atDeskWork=a.bvState==='work'&&!a.path.length&&a.room.t==='desk'
  const lean=atDeskWork?0.22:0
  body.current.position.y=v.by-(atDeskWork?0.12:0);body.current.rotation.z=v.bz;body.current.rotation.x=v.bx+lean
  const twalk=walking?1:0;v.walk+=(twalk-v.walk)*(1-Math.exp(-dt*3))
  const rate=1.4+v.walk*2.2
  const pu=.5+.5*Math.sin(t*rate+ph)
  ring.current.scale.setScalar(1+pu*.08)
  ;(ring.current.material as THREE.MeshBasicMaterial).opacity=.5+pu*.3
  /* membres : démarche (genoux, coudes), bras sur le clavier au poste */
  const sw=Math.sin(t*9+ph)*v.walk,ak=1-Math.exp(-dt*8),typ=atDeskWork?Math.sin(t*15+ph)*.04:0
  const tg=(r:GR,x:number)=>{if(r.current)r.current.rotation.x+=(x-r.current.rotation.x)*ak}
  if(legL.current){legL.current.rotation.x=sw*.55;legR.current.rotation.x=-sw*.55}
  tg(shinL,Math.max(0,sw)*.9);tg(shinR,Math.max(0,-sw)*.9)
  tg(armL,atDeskWork?-.35+typ:-sw*.4);tg(armR,atDeskWork?-.35-typ:sw*.4)
  tg(foreL,atDeskWork?-1.2:-.25*v.walk);tg(foreR,atDeskWork?-1.2:-.25*v.walk)
  v.lid+=(0-v.lid)*(1-Math.exp(-dt*3.5));v.dim+=(1-v.dim)*(1-Math.exp(-dt*3))
  if(lidL.current){lidL.current.scale.y=.02+v.lid*.98;lidL.current.visible=v.lid>.05;lidL.current.position.y=.05*v.lid}
  if(lidR.current){lidR.current.scale.y=.02+v.lid*.98;lidR.current.visible=v.lid>.05;lidR.current.position.y=.05*v.lid}
  if(eyeL.current)(eyeL.current.material as THREE.MeshBasicMaterial).color.copy(glow)
  if(eyeR.current)(eyeR.current.material as THREE.MeshBasicMaterial).color.copy(glow)
  /* Label = live a.bvState every frame. Path/anim must not paint Idle over work. */
  const label=bvTagLabel(a.bvState)
  if(lastState.current!==a.bvState) lastState.current=a.bvState
  let tagNode: HTMLElement|null=tagState.current
  if(!tagNode||!tagNode.isConnected) tagNode=document.getElementById('bvtag-'+a.id)
  if(tagNode&&tagNode.textContent!==label) tagNode.textContent=label
  /* Speech bubble: real transcript only. Hidden unless live text — never a status word. */
  if(bubbleWrap.current){
   const now=performance.now()
   const live=!!(a.bubble&&a.bubbleUntil>now)
   if(!live&&a.bubble){a.bubble='';a.bubbleUntil=0}
   const el=bubbleWrap.current
   el.classList.toggle('is-on', live)
   el.classList.remove('is-idle')
   el.classList.toggle('is-work', live&&a.bvState==='work')
   el.classList.toggle('is-hot', hot.current)
   const host=el.closest('.speech-bubble-html') as HTMLElement|null
   if(host){
    host.style.opacity=live?'1':'0'
    host.style.visibility=live?'visible':'hidden'
    host.style.pointerEvents='none'
   }
   if(live&&bubbleText.current){
    const want=a.bubble||''
    if(bubbleText.current.textContent!==want) bubbleText.current.textContent=want
   }else if(!live&&bubbleText.current&&bubbleText.current.textContent){
    bubbleText.current.textContent=''
   }
  }
  if(tagWrap.current){
   proj.set(v.x,2.2,v.z).project(camera)
   /* Prefer always-visible labels; only hide when behind camera frustum */
   const behind=proj.z>1
   tagWrap.current.style.visibility=behind?'hidden':''
   if(tagNode&&tagNode.textContent!==label) tagNode.textContent=label
  }
 })
 return <group ref={g} scale={1.45}
  onPointerOver={e=>{e.stopPropagation();hot.current=true;ui.hoverAgent=a}}
  onPointerOut={()=>{hot.current=false;if(ui.hoverAgent===a)ui.hoverAgent=null}}>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.012,0]}><circleGeometry args={[.5,32]}/><meshBasicMaterial color="#000" transparent opacity={.12} depthWrite={false}/></mesh>
  <group ref={body} onClick={e=>{e.stopPropagation();if(ui.moved<CLICK_MOVE_MAX)selectAgent(a)}}>
   {/* jambes : hanche, cuisse, genou, tibia, cheville, pied. +x = droite. */}
   {([[-1,legL,shinL],[1,legR,shinR]] as [number,GR,GR][]).map(([s,lr,sr],i)=><group key={'lg'+i} ref={lr} position={[s*.1,.84,0]}>
    <mesh material={mats.black} castShadow><sphereGeometry args={[.085,20,14]}/></mesh>
    <mesh material={mats.shell} position={[0,-.19,0]} castShadow><cylinderGeometry args={[.082,.062,.36,22]}/></mesh>
    <group ref={sr} position={[0,-.38,0]}>
     <mesh material={mats.black} castShadow><sphereGeometry args={[.066,18,12]}/></mesh>
     <mesh material={mats.shell} position={[0,-.19,.005]} castShadow><cylinderGeometry args={[.058,.045,.34,20]}/></mesh>
     <mesh material={mats.black} position={[0,-.375,0]}><sphereGeometry args={[.05,16,12]}/></mesh>
     <mesh material={mats.shell} position={[0,-.43,.06]} castShadow><boxGeometry args={[.11,.06,.26]}/></mesh>
     <mesh material={mats.black} position={[0,-.465,.06]}><boxGeometry args={[.115,.015,.27]}/></mesh>
    </group>
   </group>)}
   {/* bassin + colonne d'actionneurs */}
   <mesh material={mats.black} position={[0,.9,0]} castShadow><boxGeometry args={[.3,.14,.2]}/></mesh>
   <mesh material={mats.black} position={[0,1.0,0]}><cylinderGeometry args={[.115,.115,.12,24]}/></mesh>
   {[.965,1.0,1.035].map(y=><mesh key={y} material={mats.metal} position={[0,y,0]} rotation={[Math.PI/2,0,0]} scale={[1,.8,1]}><torusGeometry args={[.118,.007,8,32]}/></mesh>)}
   {/* buste : coque, barre lumineuse, plaque d'initiale, batterie dorsale */}
   <mesh geometry={torsoGeo} material={mats.shell} position={[0,1.04,0]} scale={[1,1,.74]} castShadow/>
   <mesh position={[0,1.33,.19]}><planeGeometry args={[.12,.06]}/><meshStandardMaterial map={band} transparent roughness={.5} depthWrite={false}/></mesh>
   {avMap&&<mesh position={[0,1.33,.192]}><circleGeometry args={[.045,24]}/><meshBasicMaterial map={avMap} toneMapped={false}/></mesh>}
   <mesh material={mats.black} position={[0,1.22,-.17]} castShadow><boxGeometry args={[.2,.26,.08]}/></mesh>
   <mesh position={[0,1.29,-.212]}><boxGeometry args={[.1,.012,.005]}/><meshBasicMaterial color={a.color}/></mesh>
   {/* bras : épaule, liseré d'accent, coude, avant-bras, poignet, main */}
   {([[-1,armL,foreL],[1,armR,foreR]] as [number,GR,GR][]).map(([s,ar,fr],i)=><group key={'ar'+i} ref={ar} position={[s*.3,1.4,0]} rotation={[0,0,s*.06]}>
    <mesh material={mats.black} castShadow><sphereGeometry args={[.085,20,14]}/></mesh>
    <mesh material={mats.shell} position={[s*.012,.035,0]} scale={[1,.8,1]} castShadow><sphereGeometry args={[.1,24,16]}/></mesh>
    <mesh material={mats.acc} position={[0,-.1,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.062,.006,8,32]}/></mesh>
    <mesh material={mats.shell} position={[0,-.17,0]} castShadow><cylinderGeometry args={[.06,.048,.3,20]}/></mesh>
    <group ref={fr} position={[0,-.34,0]}>
     <mesh material={mats.black} castShadow><sphereGeometry args={[.052,16,12]}/></mesh>
     <mesh material={mats.shell} position={[0,-.17,0]} castShadow><cylinderGeometry args={[.047,.038,.3,18]}/></mesh>
     <mesh material={mats.black} position={[0,-.33,0]}><cylinderGeometry args={[.036,.036,.04,16]}/></mesh>
     <group position={[0,-.35,0]}><Hand s={s} m={mats.black}/></group>
    </group>
   </group>)}
   {/* cou + tête : coque blanche, face vitrée noire (+z), ligne d'état, oreilles */}
   <mesh material={mats.black} position={[0,1.55,0]}><cylinderGeometry args={[.05,.065,.1,20]}/></mesh>
   <group position={[0,1.7,0]}>
    <mesh material={mats.shell} scale={[.95,1.08,.95]} castShadow><sphereGeometry args={[.2,48,32]}/></mesh>
    <mesh material={mats.glass} scale={[.95,1.08,.95]}><sphereGeometry args={[.203,48,28,Math.PI/2-1.15,2.3,Math.PI*.2,Math.PI*.58]}/></mesh>
    <mesh ref={eyeL} position={[-.058,0,.19]}><boxGeometry args={[.1,.02,.008]}/><meshBasicMaterial color={glow}/></mesh>
    <mesh ref={eyeR} position={[.058,0,.19]}><boxGeometry args={[.1,.02,.008]}/><meshBasicMaterial color={glow}/></mesh>
    <mesh ref={lidL} position={[-.058,0,.196]}><boxGeometry args={[.105,.02,.008]}/><meshStandardMaterial color="#050608" roughness={.3}/></mesh>
    <mesh ref={lidR} position={[.058,0,.196]}><boxGeometry args={[.105,.02,.008]}/><meshStandardMaterial color="#050608" roughness={.3}/></mesh>
    {[-1,1].map(sx=><group key={'ear'+sx} position={[sx*.19,0,0]} rotation={[0,0,Math.PI/2]}>
     <mesh material={mats.black}><cylinderGeometry args={[.05,.05,.03,24]}/></mesh>
     <mesh material={mats.acc} position={[0,sx*.017,0]}><cylinderGeometry args={[.016,.016,.02,16]}/></mesh>
    </group>)}
   </group>
  </group>
  <mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[.68,selected?.82:.72,64]}/><meshBasicMaterial color={a.color} transparent side={THREE.DoubleSide}/></mesh>
  {/* Transcript chip — same markup for every agent. Shown only while a real bubble is live. */}
  <Html position={[0,2.65,0]} center zIndexRange={[50,40]} className="speech-bubble-html">
   <div ref={bubbleWrap} className="speech-bubble" aria-hidden>
    <div ref={bubbleText} className="speech-bubble-text"></div>
   </div>
  </Html>
  {/* Status chip only while work, talk, or walk. Idle has no label. */}
  {bvTagLabel(bvState)&&<Html position={[0,2.2,0]} center zIndexRange={[30,20]} style={{pointerEvents:'none'}}>
   <div ref={tagWrap} className="tag">
    <small id={'bvtag-'+a.id} ref={tagState as any}>{bvTagLabel(bvState)}</small>
   </div>
  </Html>}
 </group>})

export { AgentView }
