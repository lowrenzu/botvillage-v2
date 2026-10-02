import {useEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import * as THREE from 'three'
import {step,ui,CLICK_MOVE_MAX} from '../sim'

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))

function Rig(){
 /* camera: overview fits all 6 rooms; viewOffset shifts optical center into left of HUD */
 const {gl,camera,size}=useThree()
 const HOME={az:.82,el:.48,dist:46} /* classic ¾ overview */
 const s=useRef({az:HOME.az,el:HOME.el,dist:HOME.dist,distWant:HOME.dist,tgt:new THREE.Vector3(),vaz:0,vel:0,vzoom:0,dragging:false,booted:false})
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
   if(pts.size>=2&&pinch>0){const dist=span();if(dist>0){v.distWant=clamp(v.distWant*(pinch/dist),12,85);v.vzoom=0;pinch=dist;if(ui.frame)ui.frame.dist=v.distWant}return}
   if(!d)return;ui.moved+=Math.abs(e.movementX)+Math.abs(e.movementY)
   const daz=-e.movementX*.0045,del=e.movementY*.0038
   v.az+=daz;v.el=clamp(v.el+del,.28,1.25)
   v.vaz=daz*52;v.vel=del*52
   if(ui.moved>CLICK_MOVE_MAX)ui.frame=null}
  const wh=(e:WheelEvent)=>{e.preventDefault()
   /* zoom polish: softer steps + coast via vzoom */
   const mag=Math.min(Math.abs(e.deltaY),160)
   const step=Math.sign(e.deltaY)*mag*.00055
   v.vzoom+=step||Math.sign(e.deltaY)*.045
   v.vzoom=clamp(v.vzoom,-.22,.22)
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
  if(!v.dragging){v.az+=v.vaz*dt;v.el=clamp(v.el+v.vel*dt,.28,1.15)
   /* longer soft inertia coast after drag (Elon cam polish) */
   const damp=Math.exp(-dt*.72);v.vaz*=damp;v.vel*=damp
   if(Math.abs(v.vaz)<2e-4)v.vaz=0;if(Math.abs(v.vel)<2e-4)v.vel=0}
  /* zoom inertia: integrate vzoom into distWant, then ease dist */
  if(Math.abs(v.vzoom)>1e-5){
   v.distWant=clamp(v.distWant*Math.exp(v.vzoom*dt*60*.016),12,85)
   v.vzoom*=Math.exp(-dt*3.2)
   if(Math.abs(v.vzoom)<1e-4)v.vzoom=0
   if(ui.frame)ui.frame.dist=v.distWant
  }
  const fr=ui.frame
  if(fr){const k=1-Math.exp(-dt*.78) /* slower ease into ¾ frame */
   let daz=fr.az-v.az;daz=Math.atan2(Math.sin(daz),Math.cos(daz))
   v.az+=daz*k;v.el+=(fr.el-v.el)*k
   v.distWant+=(fr.dist-v.distWant)*k
   const bleed=Math.exp(-dt*5.5);v.vaz*=bleed;v.vel*=bleed
   if(ui.follow&&ui.sel){fr.x=ui.sel.x;fr.z=ui.sel.z}
   want.set(fr.x,0,fr.z)
  }else{
   want.set(0,0,0)
   if(ui.follow&&ui.sel){want.set(ui.sel.x,0,ui.sel.z);v.distWant+=(16-v.distWant)*(1-Math.exp(-dt*.85))}
  }
  v.dist+=(v.distWant-v.dist)*(1-Math.exp(-dt*1.85))
  if(!v.booted){v.booted=true;v.tgt.copy(want);v.dist=v.distWant
   camWant.set(v.tgt.x+v.dist*Math.sin(v.az)*Math.cos(v.el),v.dist*Math.sin(v.el),v.tgt.z+v.dist*Math.cos(v.az)*Math.cos(v.el))
   camera.position.copy(camWant);camera.lookAt(v.tgt);return}
  v.tgt.lerp(want,1-Math.exp(-dt*1.15))
  camWant.set(v.tgt.x+v.dist*Math.sin(v.az)*Math.cos(v.el),v.dist*Math.sin(v.el),v.tgt.z+v.dist*Math.cos(v.az)*Math.cos(v.el))
  camera.position.lerp(camWant,1-Math.exp(-dt*1.65));camera.lookAt(v.tgt)})
 return null}

export { Rig }
