import {useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import * as THREE from 'three'
import {useSim,collabPairs,type Agent} from '../sim'
import { scr } from './primitives'

function TalkBeam({a,b}:{a:Agent;b:Agent}){
 /* Blue beam = local talk pairing (déduit), not a transcript edge. */
 const mesh=useRef<THREE.Mesh>(null!)
 const mid=useRef<THREE.Group>(null!)
 const up=useMemo(()=>new THREE.Vector3(0,1,0),[])
 const dir=useMemo(()=>new THREE.Vector3(),[])
 useFrame(()=>{
  const m=mesh.current,g=mid.current;if(!m||!g)return
  const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz)
  if(d<.35){m.visible=false;g.visible=false;return}
  m.visible=true;g.visible=true
  m.position.set((a.x+b.x)/2,1.45,(a.z+b.z)/2)
  g.position.set((a.x+b.x)/2,1.78,(a.z+b.z)/2)
  dir.set(dx,0,dz).normalize()
  m.quaternion.setFromUnitVectors(up,dir)
  m.scale.set(.032,d,.032)
 })
 return <>
  <mesh ref={mesh}>
   <cylinderGeometry args={[1,1,1,6]}/>
   <meshBasicMaterial color="#7eb6e8" transparent opacity={.18} depthWrite={false}/>
  </mesh>
  <group ref={mid}>
   <Html center zIndexRange={[25,15]} style={{pointerEvents:'none'}}>
    <span className="beam-deduit" title="Appariement local (talk/WS) — pas une arête transcript">déduit</span>
   </Html>
  </group>
 </>
}
function TalkBeams(){
 useSim()
 const pairs=collabPairs()
 return <>{pairs.map(([a,b])=><TalkBeam key={a.id+'-'+b.id} a={a} b={b}/>)}</>
}
function Tick(){useFrame(({clock})=>{scr.code.offset.y=(clock.elapsedTime*.03)%1});return null}

export { TalkBeams, TalkBeam, Tick }
