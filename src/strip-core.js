/* SPDX-License-Identifier: MIT · MS ROBOTIKA
 * Longitudinal rubber strip measurement (1–4 independent lanes).
 * A known independent reference *must* be present in the image plane.
 * Browser/Node UMD, no dependencies and no output to physical PLC.
 */
(function(root,factory){
  const lib=factory();
  if(typeof module==='object'&&module.exports)module.exports=lib;
  if(root)root.ABStripCore=lib;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const err=(msg)=>{throw new RangeError(msg)};
 const finite=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)err(label+' fuera de rango');return v};
 function validateRecipe(value){
   if(!value||typeof value!=='object'||Array.isArray(value))err('Receta ausente');
   const count=finite(Number(value.count),1,4,'Número de tiras');
   if(!Number.isInteger(count))err('Número de tiras entero 1–4');
   const nominalMm=finite(Number(value.nominalMm),0.1,2000,'Ancho nominal');
   const toleranceMm=finite(Number(value.toleranceMm),0,100,'Tolerancia');
   const referenceMm=finite(Number(value.referenceMm),1,2000,'Referencia física en mm');
   const distanceMm=finite(Number(value.distanceMm),1,100000,'Distancia nominal');
   const threshold=finite(Number(value.threshold),1,254,'Umbral');
   const minRunPx=finite(Number(value.minRunPx??8),3,500,'Mínimo de píxeles');
   if(!Number.isInteger(threshold)||!Number.isInteger(minRunPx))err('Umbral/píxeles deben ser enteros');
   const polarity=value.polarity;
   if(!['light','dark'].includes(polarity))err('Contraste: claro u oscuro');
   const roi=value.roi;
   if(!roi||!['x','y','width','height'].every(k=>Number.isInteger(roi[k])))err('ROI no válida');
   if(roi.x<0||roi.y<0||roi.width<40||roi.height<40)err('La ROI debe ser mayor de 40 px');
   const id=String(value.id||'SIN-ID').slice(0,64);
   if(!/^[\p{L}\p{N}_. -]{1,64}$/u.test(id))err('Identificador de receta no válido');
   return Object.freeze({schema:1,id,count,nominalMm,toleranceMm,referenceMm,distanceMm,
     threshold,minRunPx,polarity,roi:{...roi}});
 }
 function validateImage(image){
   if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||
      image.width<64||image.height<64||image.width*image.height>4_000_000 ||
      !image.data||image.data.length!==image.width*image.height*4)
      err('Fotograma vacío, resolución o búfer inválido');
   return image;
 }
 const isMarker=(data,p,c)=>{
   const r=data[p],g=data[p+1],b=data[p+2];
   return c==='cyan' ? r<95&&g>160&&b>120&&g>r*1.8&&b>r*1.5 :
     r>160&&b>130&&g<115&&r>g*1.8&&b>g*1.7;
 };
 /** Rough global fiducial centers: next, existing audited engine validates shape and size. */
 function findReferenceMarkers(image){
   validateImage(image);
   const out=[];
   for(const color of ['cyan','magenta']){
     let n=0,sx=0,sy=0,minX=image.width,minY=image.height,maxX=-1,maxY=-1;
     for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
       const p=(y*image.width+x)*4;
       if(!isMarker(image.data,p,color))continue;
       n++;sx+=x;sy+=y;
       if(x<minX)minX=x;if(y<minY)minY=y;
       if(x>maxX)maxX=x;if(y>maxY)maxY=y;
     }
     if(n<15 || maxX-minX<3 || maxY-minY<3)err('Faltan marcas de referencia '+color+' visibles');
     const rectW=maxX-minX+1,rectH=maxY-minY+1;
     if(rectW/rectH<.5||rectW/rectH>2||rectW>75||rectH>75)
       err('Referencia '+color+' deformada u objetos de color ambiguos');
     out.push({x:sx/n,y:sy/n,color,pixels:n});
   }
   if(Math.hypot(out[0].x-out[1].x,out[0].y-out[1].y)<100)err('Marcas físicas demasiado próximas');
   return out;
 }
 function scanRow(image,roi,y,recipe){
   const {x,width}=roi,d=image.data,W=image.width,segments=[];
   let start=-1;
   const classify=(xx)=>{
     const p=(y*W+xx)*4,lum=(77*d[p]+150*d[p+1]+29*d[p+2])>>8;
     return recipe.polarity==='light'?lum>=recipe.threshold:lum<recipe.threshold;
   };
   for(let px=x;px<=x+width;px++){
     const active=px<x+width && classify(px);
     if(active&&start<0)start=px;
     if(!active&&start>=0){
       if(px-start>=recipe.minRunPx)segments.push({left:start,right:px-1,widthPx:px-start,
         touchesBorder:start<=x+1||px>=x+width-1});
       start=-1;
     }
   }
   return segments;
 }
 function extractStrips(image,input){
   validateImage(image);
   const recipe=validateRecipe(input);
   const roi=recipe.roi;
   if(roi.x+roi.width>image.width||roi.y+roi.height>image.height)err('ROI fuera del fotograma: recalibrar');
   // Five cross-sections along travelling direction to detect narrowing/bulges.
   const fractions=[.18,.34,.50,.66,.82],lines=[],rejections=[];
   for(const f of fractions){
     const y=roi.y+Math.min(roi.height-1,Math.floor(f*roi.height));
     const segments=scanRow(image,roi,y,recipe);
     if(segments.length!==recipe.count||segments.some(s=>s.touchesBorder)){
       rejections.push({y,detected:segments.length,border:segments.some(s=>s.touchesBorder)});
     }
     lines.push({y,segments});
   }
   if(rejections.length) return {status:'INVALID',reason:'Número de tiras ambiguo, o tira cortada por la ROI',
     detectedPerRow:lines.map(l=>l.segments.length),lines,lanes:[]};
   const lanes=[];
   for(let i=0;i<recipe.count;i++){
     const parts=lines.map(l=>l.segments[i]);
     const widths=parts.map(p=>p.widthPx);
     const centers=parts.map(p=>(p.left+p.right)/2);
     const center=Math.round(centers.reduce((a,b)=>a+b,0)/centers.length);
     if(centers.some(c=>Math.abs(c-center)>Math.max(12,Math.min(...widths)*.35)))
       return {status:'INVALID',reason:'Tiras cruzadas o desplazamiento transversal inesperado',
         detectedPerRow:lines.map(l=>l.segments.length),lines,lanes:[]};
     lanes.push({index:i+1,centerPx:center,meanPx:widths.reduce((a,b)=>a+b,0)/widths.length,
       minPx:Math.min(...widths),maxPx:Math.max(...widths),rowWidthsPx:widths});
   }
   return {status:'DETECTED',reason:null,lanes,lines,
     detectedPerRow:lines.map(l=>l.segments.length)};
 }
 function evaluate(image,recipeInput,calibration,audit,baseline=null){
   const recipe=validateRecipe(recipeInput);
   const extracted=extractStrips(image,recipe);
   if(!calibration||!audit||audit.status!=='VERIFIED')
     return {...extracted,status:'INVALID',reason:audit?.reason||'Falta referencia física auditada',
       lanes:[],auditStatus:'INVALID'};
   if(calibration.imageWidth!==image.width||calibration.imageHeight!==image.height)
     return {...extracted,status:'INVALID',reason:'Resolución modificada: recalibra',lanes:[],auditStatus:'INVALID'};
   if(Math.abs(calibration.referenceMm-recipe.referenceMm)>1e-8 ||
      Math.abs(calibration.workingDistanceMm-recipe.distanceMm)>1e-8)
     return {...extracted,status:'INVALID',reason:'Parámetros físicos modificados: recalibra',lanes:[],auditStatus:'INVALID'};
   if(extracted.status!=='DETECTED')
     return {...extracted,auditStatus:'VERIFIED'};
   const scale=finite(audit.mmPerPixel,.000001,100,'Escala auditada');
   const uncertainty=finite(audit.uncertaintyMm,0,500,'Incertidumbre indicativa');
   // Even a perfectly nominal width is NOT OK when the visual uncertainty overlaps limits.
   const lanes=extracted.lanes.map(l=>{
     const minMm=l.minPx*scale,maxMm=l.maxPx*scale,meanMm=l.meanPx*scale;
     const devMin=Math.abs(minMm-recipe.nominalMm),devMax=Math.abs(maxMm-recipe.nominalMm);
     let status='REVIEW';
     if(Math.max(devMin,devMax)+uncertainty<=recipe.toleranceMm)status='OK';
     else if(devMin-uncertainty>recipe.toleranceMm || devMax-uncertainty>recipe.toleranceMm)
       status='NOK';
     if(baseline?.centers && baseline.centers.length===recipe.count &&
        Math.abs(l.centerPx-baseline.centers[l.index-1])>Math.max(15,l.meanPx*.4))
       status='REVIEW';
     return {...l,minMm,maxMm,meanMm,deltaMm:meanMm-recipe.nominalMm,
       uncertaintyMm:uncertainty,status};
   });
   return {status:lanes.some(l=>l.status==='NOK')?'NOK':
      lanes.every(l=>l.status==='OK')?'OK':'REVIEW',
      auditStatus:'VERIFIED',reason:null,lanes,lines:extracted.lines,
      detectedPerRow:extracted.detectedPerRow,mmPerPixel:scale,uncertaintyMm:uncertainty};
 }
 function makeBaseline(result,recipeInput){
   const recipe=validateRecipe(recipeInput);
   if(!result||!['OK','REVIEW','NOK'].includes(result.status)||result.lanes.length!==recipe.count)
     err('No se detectaron todas las tiras con referencia verificada');
   return Object.freeze({schema:1,referenceMm:recipe.referenceMm,count:recipe.count,
     centers:result.lanes.map(l=>l.centerPx),
     widthsAtSampleMm:result.lanes.map(l=>l.meanMm)});
 }
 return Object.freeze({validateRecipe,findReferenceMarkers,extractStrips,evaluate,makeBaseline});
});
