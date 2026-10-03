import {ContactShadows} from '@react-three/drei'
import {agents,rooms,ui,useSim} from './sim'
import { wood } from './scene/textures'
import { Box } from './scene/primitives'
import { RoomView } from './scene/rooms'
import { RoomLabel } from './scene/labels'
import { AgentView } from './scene/AgentView'
import { TalkBeams, Tick } from './scene/TalkBeams'
import { Rig } from './scene/Rig'

export function Scene(){
 /* useSim only for roster mount/unmount + selection prop — not per-frame motion */
 useSim()
 return <>
 <color attach="background" args={['#e7e5e0']}/><fog attach="fog" args={['#e7e5e0',70,160]}/>
 <hemisphereLight args={['#f4efe6','#7a7368',0.5]}/>
 <ambientLight intensity={0.16} color="#e8e4dc"/>
 {/* one warm rake across the parquet — no bloom, no second sun */}
 <directionalLight castShadow intensity={1.55} color="#f0d7b4" position={[10,9,6]} shadow-mapSize={[1024,1024]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-near={1} shadow-camera-far={48} shadow-bias={-.0004} shadow-normalBias={.03}/>
 <directionalLight intensity={0.28} color="#c5d0dc" position={[-14,8,-6]}/>
 <Box p={[0,-.23,0]} a={[38.4,.4,26.4]} c="#cfcac2" ro={.7}/>
 <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[38,26]}/><meshStandardMaterial map={wood} roughness={.5}/></mesh>
 <mesh rotation={[-Math.PI/2,0,0]} position={[0,.015,0]} receiveShadow><planeGeometry args={[38,4]}/><meshStandardMaterial color="#d9d6d0" roughness={.35} metalness={.05}/></mesh>
 {[-2,2].map(z=><Box key={z} p={[0,.022,z]} a={[38,.01,.04]} c="#b4b7bc" m={.15} ro={.3}/>)}
 <ContactShadows position={[0,0.02,0]} opacity={0.28} scale={36} blur={2.6} far={6} color="#2a2620"/>
 {rooms.map(r=><RoomView key={r.id} r={r}/>)}{rooms.map(r=><RoomLabel key={r.id+"-lbl"} r={r}/>)}
 {agents.map(a=><AgentView key={a.id} a={a} selected={ui.sel===a} bvState={a.bvState}/>)}
 <TalkBeams/>
 <Rig/><Tick/></>}

