import {useMemo} from 'react'
import * as THREE from 'three'
import {ui,go,CLICK_MOVE_MAX,type Room} from '../sim'

/* Floor etch — Elon DoD: readable no-squint from default ¾ cam.
   Bigger plane + near-white ink on dark plate (prove larger than 6.6×1.7 / 96px). */
const etchLabel=(name:string,accent:string)=>{const c=document.createElement('canvas');c.width=1536;c.height=384;const x=c.getContext('2d')!
 x.clearRect(0,0,1536,384)
 /* deep recessed plate — high contrast vs parquet */
 x.fillStyle='rgba(6,5,4,.92)';x.beginPath();x.roundRect(24,36,1488,312,28);x.fill()
 x.strokeStyle='rgba(0,0,0,.75)';x.lineWidth=6;x.beginPath();x.roundRect(28,40,1480,304,26);x.stroke()
 /* bright rim for etch catch-light */
 x.strokeStyle='rgba(255,250,240,.55)';x.lineWidth=3.5;x.beginPath();x.roundRect(40,52,1456,280,20);x.stroke()
 x.strokeStyle='rgba(255,248,235,.22)';x.lineWidth=1.5;x.beginPath();x.roundRect(52,64,1432,256,16);x.stroke()
 /* accent pip */
 x.fillStyle=accent;x.globalAlpha=.98;x.beginPath();x.arc(128,192,18,0,Math.PI*2);x.fill();x.globalAlpha=1
 x.fillStyle='rgba(255,255,255,.55)';x.beginPath();x.arc(122,184,6,0,Math.PI*2);x.fill()
 x.font='900 148px "Plus Jakarta Sans", system-ui, sans-serif'
 x.textAlign='center';x.textBaseline='middle'
 x.letterSpacing='0.12em' as any
 const label=name.toUpperCase()
 /* deep carved shadow + near-white ink */
 x.fillStyle='rgba(0,0,0,.55)';x.fillText(label,772,210)
 x.fillStyle='rgba(255,252,245,.35)';x.fillText(label,764,168)
 x.fillStyle='rgba(255,253,248,.98)';x.fillText(label,768,188)
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.premultiplyAlpha=true;return t}
const RoomLabel=({r}:{r:Room})=>{
 const map=useMemo(()=>etchLabel(r.n,r.c),[r.n,r.c])
 /* was 6.6×1.7 @ y=.14 — now ~40% larger + slightly raised */
 return <group position={[r.x,.16,r.z]} rotation={[0,Math.PI,0]}>
  <mesh rotation={[-Math.PI/2,0,0]} receiveShadow
   onClick={e=>{e.stopPropagation();if(ui.moved<CLICK_MOVE_MAX&&ui.sel)go(ui.sel,r)}}>
   <planeGeometry args={[9.2,2.4]}/>
   <meshStandardMaterial map={map} transparent depthWrite={false} roughness={.82} metalness={.04} polygonOffset polygonOffsetFactor={-2}/>
  </mesh>
 </group>}

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

export { etchLabel, RoomLabel, initTex }
