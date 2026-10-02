import {memo,useEffect,useMemo,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import * as THREE from 'three'
import {ui,selectAgent,CLICK_MOVE_MAX,type Agent} from '../sim'
import { initTex } from './labels'

const ST_FR:Record<string,string>={work:'Travaille',collab:'Discussion · déduit',walk:'Marche',idle:'Idle'}
/** HUD rail width + margin — tags hide when projected into this strip. */
const RAIL_PAD=380

const AgentView=memo(function AgentView({a,selected}:{a:Agent;selected:boolean}){
 const g=useRef<THREE.Group>(null!),body=useRef<THREE.Group>(null!),ring=useRef<THREE.Mesh>(null!)
 const lidL=useRef<THREE.Mesh>(null!),lidR=useRef<THREE.Mesh>(null!)
 const eyeL=useRef<THREE.Mesh>(null!),eyeR=useRef<THREE.Mesh>(null!)
 const tagWrap=useRef<HTMLDivElement>(null!)
 const tagState=useRef<HTMLElement>(null!)
 const bubbleWrap=useRef<HTMLDivElement>(null!)
 const bubbleText=useRef<HTMLDivElement>(null!)
 const lastState=useRef<string>(a.state)
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
  /* Desk pose: lean into workstation when bvState=work and standing at desk */
  const atDeskWork=a.bvState==='work'&&!a.path.length&&a.room.t==='desk'
  const lean=atDeskWork?0.22:0
  body.current.position.y=v.by-(atDeskWork?0.12:0);body.current.rotation.z=v.bz;body.current.rotation.x=v.bx+lean
  const twalk=walking?1:0;v.walk+=(twalk-v.walk)*(1-Math.exp(-dt*3))
  const rate=1.4+v.walk*2.2
  const pu=.5+.5*Math.sin(t*rate+ph)
  ring.current.scale.setScalar(1+pu*.08)
  ;(ring.current.material as THREE.MeshBasicMaterial).opacity=.5+pu*.3
  v.lid+=(0-v.lid)*(1-Math.exp(-dt*3.5));v.dim+=(1-v.dim)*(1-Math.exp(-dt*3))
  if(lidL.current){lidL.current.scale.y=.02+v.lid*.98;lidL.current.visible=v.lid>.05;lidL.current.position.y=1.05+(.05*v.lid)}
  if(lidR.current){lidR.current.scale.y=.02+v.lid*.98;lidR.current.visible=v.lid>.05;lidR.current.position.y=1.05+(.05*v.lid)}
  if(eyeL.current){(eyeL.current.material as THREE.MeshBasicMaterial).color.setStyle(a.color).multiplyScalar(.55+v.dim*.45)}
  if(eyeR.current){(eyeR.current.material as THREE.MeshBasicMaterial).color.setStyle(a.color).multiplyScalar(.55+v.dim*.45)}
  /* HUD from bvState only — never AgentAnim sleep/Zzz */
  /* Label = API bvState only — never invent walk from path for HUD */
  const tagKey=a.bvState==='work'?'work':a.bvState==='talk'?'collab':a.path.length||a.bvState==='walk'?'walk':'idle'
  if(tagState.current&&tagKey!==lastState.current){
   lastState.current=tagKey
   tagState.current.textContent=ST_FR[tagKey]||tagKey
  }
  /* Speech bubble: class toggle only — keep last text while CSS fade/slide exits (don't wipe textContent on off). */
  if(bubbleWrap.current){
   const on=!!(a.bubble&&a.bubbleUntil>performance.now())
   if(!on&&a.bubble){a.bubble='';a.bubbleUntil=0}
   bubbleWrap.current.classList.toggle('is-on', on)
   if(on&&bubbleText.current){
    const want=a.bubble||''
    if(bubbleText.current.textContent!==want) bubbleText.current.textContent=want
   }
  }
  if(tagWrap.current){
   proj.set(v.x,2.05,v.z).project(camera)
   /* Prefer always-visible labels; only hide when behind camera frustum */
   const behind=proj.z>1
   tagWrap.current.style.visibility=behind?'hidden':''
   if(tagState.current){
    const want=ST_FR[tagKey]||tagKey
    if(tagState.current.textContent!==want) tagState.current.textContent=want
   }
  }
 })
 /* ALWAYS show name+state from /api/bots — never gate on select/hover */
 const showTag=true
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
    <boxGeometry args={[.34,.08,.06]}/><meshStandardMaterial color="#3a3632" roughness={.5}/>
   </mesh>
   <mesh position={[0,.5,.3]}>
    <boxGeometry args={[.12,.08,.02]}/><meshStandardMaterial color="#3a3632" roughness={.4} metalness={.2}/>
   </mesh>
   {([[-.34,.58,0],[.34,.58,0]] as [number,number,number][]).map((pos,i)=><mesh key={'sh'+i} position={pos} castShadow>
    <sphereGeometry args={[.1,12,10]}/><meshStandardMaterial color={a.color} roughness={.4}/>
   </mesh>)}
   {[[-.4,.34,0,.4],[.4,.34,0,-.4]].map((v,i)=><mesh key={'arm'+i} position={[v[0],v[1],v[2]]} rotation={[0,0,v[3]]} castShadow>
    <capsuleGeometry args={[.07,.28,4,8]}/><meshStandardMaterial color={a.color} roughness={.5}/>
   </mesh>)}
   {([[-.12,.08,.04],[.12,.08,.04]] as [number,number,number][]).map((pos,i)=><mesh key={'ft'+i} position={pos} castShadow>
    <capsuleGeometry args={[.07,.1,4,8]}/><meshStandardMaterial color="#3a3632" roughness={.6}/>
   </mesh>)}
   <mesh position={[0,.78,0]} scale={[1.015,1.25,1.015]}>
    <sphereGeometry args={[.55,24,12,0,Math.PI*2,Math.PI/2-0.22,0.44]}/>
    <meshStandardMaterial map={band} transparent roughness={.45} metalness={.08} depthWrite={false}/>
   </mesh>
   <mesh position={[0,1.16,.34]}><boxGeometry args={[.5,.05,.08]}/><meshStandardMaterial color="#2e3238" roughness={.4}/></mesh>
   <mesh position={[0,1.05,.4]}><boxGeometry args={[.72,.32,.24]}/><meshStandardMaterial color="#2e3238" roughness={.15} metalness={.35}/></mesh>
   <mesh ref={eyeL} position={[-.16,1.05,.53]}><boxGeometry args={[.18,.16,.03]}/><meshBasicMaterial color={a.color}/></mesh>
   <mesh ref={eyeR} position={[.16,1.05,.53]}><boxGeometry args={[.18,.16,.03]}/><meshBasicMaterial color={a.color}/></mesh>
   <mesh ref={lidL} position={[-.16,1.05,.545]}><boxGeometry args={[.19,.16,.02]}/><meshStandardMaterial color="#2e3238" roughness={.3}/></mesh>
   <mesh ref={lidR} position={[.16,1.05,.545]}><boxGeometry args={[.19,.16,.02]}/><meshStandardMaterial color="#2e3238" roughness={.3}/></mesh>
   {avMap&&<mesh position={[0,.52,.5]}><circleGeometry args={[.2,20]}/><meshBasicMaterial map={avMap} toneMapped={false}/></mesh>}
  </group>
  <mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[.72,selected?.88:.8,32]}/><meshBasicMaterial color={a.color} transparent side={THREE.DoubleSide}/></mesh>
  {/* Speech bubble (transcript) — same markup/CSS for every agent; show via .is-on from useFrame */}
  <Html position={[0,2.55,0]} center zIndexRange={[50,40]} className="speech-bubble-html">
   <div ref={bubbleWrap} className="speech-bubble" aria-hidden>
    <div ref={bubbleText} className="speech-bubble-text"></div>
   </div>
  </Html>
  {/* Nameplate tag — not a speech bubble; always-on status from API bvState */}
  {showTag&&<Html position={[0,2.05,0]} center zIndexRange={[30,20]} style={{pointerEvents:'none'}}>
   <div ref={tagWrap} className={'tag always big'+(selected?' on':'')+(a.bvState==='work'?' work':'')}>
    <span className="tag-row">
     {a.hasAvatar?<img className="tag-av" src={`/avatars/${a.id}`} alt=""/>:<i className="dot" style={{background:a.color}}/>}
     {a.name}
    </span>
    <small ref={tagState as any}>{ST_FR[a.bvState==='work'?'work':a.bvState==='talk'?'collab':a.bvState==='walk'?'walk':'idle']||'Idle'}</small>
   </div>
  </Html>}
 </group>})

export { AgentView }
