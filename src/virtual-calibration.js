/* SPDX-License-Identifier: MIT · MS ROBOTIKA
 * Virtual guide lines are a user interface. Pixel-to-mm scale comes ONLY
 * from the measured physical conveyor width between actual visible edges.
 * Edge tracking is not accredited lens/perspective metrology.
 */
(function(root,factory){
  const lib=factory();
  if(typeof module==='object'&&module.exports)module.exports=lib;
  if(root)root.ABBeltEdgeCalibration=lib;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
const error=msg=>{throw new RangeError(msg)};
const bounded=(v,min,max,label)=>{
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)error(label+' inválido');
  return v;
};
function validateFrame(frame){
  if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||
     frame.width<200||frame.height<120||frame.width*frame.height>4_000_000||
     !frame.data||frame.data.length!==frame.width*frame.height*4)
    error('Fotograma o resolución incompatible');
}
const intensity=(frame,x,y)=>{
  const p=(y*frame.width+x)*4,d=frame.data;
  return (77*d[p]+150*d[p+1]+29*d[p+2])/256;
};
function edgeAt(frame,x,y,search=18){
  let best=null,second=null;
  const mid=Math.round(x),W=frame.width;
  for(let xx=Math.max(6,mid-search);xx<=Math.min(W-7,mid+search);xx++){
    let left=0,right=0;
    for(let k=1;k<=3;k++){
      left+=intensity(frame,xx-k,y);
      right+=intensity(frame,xx+k,y);
    }
    const gradient=Math.abs(right-left)/3;
    if(!best||gradient>best.gradient){
      second=best;best={x:xx,gradient};
    }else if(!second||gradient>second.gradient)second={x:xx,gradient};
  }
  if(!best||best.gradient<11)return null;
  return best;
}
function detectEdges(frame,guideX,roi,search=18){
  validateFrame(frame);
  const y0=Math.max(8,roi.y),y1=Math.min(frame.height-9,roi.y+roi.height);
  if(y1-y0<120)error('Zona de cinta demasiado pequeña para verificar bordes');
  const xs=[],strengths=[];
  for(let i=0;i<9;i++){
    const y=Math.round(y0+(i+.5)/9*(y1-y0));
    const detected=edgeAt(frame,guideX,y,search);
    if(detected){xs.push(detected.x);strengths.push(detected.gradient)}
  }
  if(xs.length<7)error('Borde de cinta no distinguible de su entorno (luz/contraste)');
  xs.sort((a,b)=>a-b);
  const median=xs[Math.floor(xs.length/2)];
  const maxSpread=Math.max(...xs)-Math.min(...xs);
  if(maxSpread>9)error('Borde irregular, fuera de foco o con perspectiva/obstáculos');
  return {x:median,jitterPx:maxSpread/2,
    strength:strengths.reduce((a,b)=>a+b,0)/strengths.length,
    supportingRows:xs.length};
}
/**
 * A user clicks LEFT and RIGHT virtual lines over real physical belt edges;
 * knows physical width (not nominal product). Auto-snap edges and check 9 rows.
 */
function create(frame,points,widthMm,distanceMm,sourceId,roi){
  validateFrame(frame);
  const mm=bounded(Number(widthMm),5,5000,'Ancho físico de cinta en milímetros');
  const distance=bounded(Number(distanceMm),1,100000,'Distancia a plano');
  if(!Array.isArray(points)||points.length!==2)error('Marca dos bordes reales en el visor');
  const [left,right]=points;
  if(![left.x,left.y,right.x,right.y].every(Number.isFinite))error('Guías inválidas');
  if(left.x>=right.x || right.x-left.x<100)error('Referencia demasiado pequeña o guías invertidas');
  if(Math.abs(left.y-right.y)>frame.height*.08)
    error('Marca los dos bordes sobre la misma línea horizontal');
  if(!roi||!['x','y','width','height'].every(k=>Number.isFinite(roi[k])))
    error('ROI de inspección requerida');
  const l=detectEdges(frame,left.x,roi),r=detectEdges(frame,right.x,roi);
  const distancePx=r.x-l.x;
  if(distancePx<100)error('Distancia en imagen demasiado corta');
  const scale=mm/distancePx;
  // At least two-pixel boundary ambiguity; indicative, not a verified MSA.
  const pixelUncertainty=Math.max(2,Math.hypot(l.jitterPx,r.jitterPx)+1);
  return Object.freeze({kind:'BELT_EDGES',referenceType:'BELT_WIDTH',
    referenceMm:mm,workingDistanceMm:distance,
    imageWidth:frame.width,imageHeight:frame.height,sourceId:String(sourceId),
    xLeft:l.x,xRight:r.x,referencePx:distancePx,
    mmPerPixel:scale,uncertaintyMm:pixelUncertainty*scale,
    referenceRoi:{x:roi.x,y:roi.y,width:roi.width,height:roi.height},
    createdAt:new Date().toISOString()});
}
function audit(frame,cal,sourceId){
  function invalid(reason){return {status:'INVALID',reason,referenceType:'BELT_WIDTH'};}
  try{
    validateFrame(frame);
    if(!cal||cal.kind!=='BELT_EDGES')return invalid('Falta calibración de bordes');
    if(frame.width!==cal.imageWidth||frame.height!==cal.imageHeight)
      return invalid('Resolución cambiada; recalibrar');
    if(String(sourceId)!==cal.sourceId)
      return invalid('Fuente de cámara modificada; recalibrar');
    const l=detectEdges(frame,cal.xLeft,cal.referenceRoi,16);
    const r=detectEdges(frame,cal.xRight,cal.referenceRoi,16);
    const px=r.x-l.x;
    const driftPercent=100*(px/cal.referencePx-1);
    const movementPx=Math.max(Math.abs(l.x-cal.xLeft),Math.abs(r.x-cal.xRight));
    if(px<100 || Math.abs(driftPercent)>1.5 || movementPx>7)
      return invalid('Referencia se ha desplazado o ha cambiado su escala; bloqueada');
    const scale=cal.referenceMm/px;
    const uncertaintyMm=Math.max(2,Math.hypot(l.jitterPx,r.jitterPx)+1)*scale;
    return {status:'BELT_EDGES_TRACKED',referenceType:'BELT_WIDTH',
      mmPerPixel:scale,uncertaintyMm,scaleDriftPercent:driftPercent,
      xLeft:l.x,xRight:r.x,workingDistanceMm:cal.workingDistanceMm,
      reason:'Solo referencia natural de bordes; pendiente verificación metrológica'};
  }catch(ex){return invalid(ex.message||'No se distinguen bordes físicos de cinta')}
}
return Object.freeze({create,audit,detectEdges});
});
