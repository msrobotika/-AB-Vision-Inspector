/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MS ROBOTIKA
 * Original, dependency-free image segmentation and connected component analyzer.
 */
(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.ABVisionCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODES = ['dark', 'light', 'reference'];
  const MAX_PIXELS = 2_000_000;
  function integer(value, lo, hi, label) {
    if (!Number.isInteger(value) || value < lo || value > hi)
      throw new RangeError(label + ' debe estar entre ' + lo + ' y ' + hi);
    return value;
  }
  function validateImage(image, label) {
    if (!image || typeof image !== 'object') throw new TypeError(label + ' no es una imagen');
    const width = integer(image.width, 1, 4096, 'Ancho'), height = integer(image.height, 1, 4096, 'Alto');
    if (width * height > MAX_PIXELS) throw new RangeError('Imagen demasiado grande (máximo 2 millones de píxeles)');
    if (!(image.data instanceof Uint8ClampedArray) || image.data.length !== width * height * 4)
      throw new TypeError(label + ': datos RGBA inválidos');
    return { width, height };
  }
  function clampRect(rect, width, height) {
    if (!rect) return {x: 0, y: 0, width, height};
    for (const key of ['x','y','width','height'])
      if (!Number.isFinite(rect[key])) throw new TypeError('ROI inválida: '+key);
    const x = Math.max(0, Math.min(width - 1, Math.floor(rect.x)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(rect.y)));
    const endX = Math.max(x + 1, Math.min(width, Math.ceil(rect.x + rect.width)));
    const endY = Math.max(y + 1, Math.min(height, Math.ceil(rect.y + rect.height)));
    return {x, y, width: endX-x, height: endY-y};
  }
  function validateRecipe(recipe) {
    if (!recipe || typeof recipe !== 'object') throw new TypeError('Configuración de inspección inválida');
    const mode = recipe.mode;
    if (!MODES.includes(mode)) throw new RangeError('Modo de inspección desconocido');
    return {
      mode,
      threshold: integer(Number(recipe.threshold), 0, 255, 'Umbral'),
      minArea: integer(Number(recipe.minArea), 1, 500000, 'Área mínima'),
      maxDefects: integer(Number(recipe.maxDefects), 0, 10000, 'Máximo de defectos'),
    };
  }
  function inspect(image, recipe, options = {}) {
    const {width, height} = validateImage(image, 'Imagen de entrada');
    const rule = validateRecipe(recipe), rect = clampRect(options.roi, width, height);
    const ref = options.reference;
    if (rule.mode === 'reference') {
      const referenceDimensions = validateImage(ref, 'Imagen de referencia');
      if (referenceDimensions.width !== width || referenceDimensions.height !== height)
        throw new RangeError('La referencia debe tener las mismas dimensiones de imagen');
    }
    const total = width * height, mask = new Uint8Array(total), acceptedMask = new Uint8Array(total);
    const data = image.data, refData = ref?.data, xLimit = rect.x + rect.width, yLimit = rect.y + rect.height;
    let matchPixels = 0, luminanceSum = 0;
    for (let y = rect.y; y < yLimit; y++) for (let x = rect.x; x < xLimit; x++) {
      const i = y * width + x, p = i * 4;
      const lum = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8;
      luminanceSum += lum;
      const isCandidate = rule.mode === 'dark' ? lum < rule.threshold
        : rule.mode === 'light' ? lum > rule.threshold
        : Math.max(Math.abs(data[p] - refData[p]), Math.abs(data[p+1] - refData[p+1]), Math.abs(data[p+2] - refData[p+2])) > rule.threshold;
      if (isCandidate) {mask[i] = 1; matchPixels++;}
    }
    // Four-connected deterministic flood fill; never uses external computer-vision packages.
    const queue = new Uint32Array(rect.width * rect.height), components = [];
    let defectPixels = 0, discarded = 0;
    for (let y=rect.y; y<yLimit; y++) for (let x=rect.x; x<xLimit; x++) {
      const first = y*width+x;
      if (mask[first] !== 1) continue;
      let front=0, back=1, minX=x, maxX=x, minY=y, maxY=y;
      queue[0]=first;mask[first]=2;
      while(front<back) {
        const index=queue[front++], px=index%width, py=(index-px)/width;
        if(px<minX)minX=px;if(px>maxX)maxX=px;
        if(py<minY)minY=py;if(py>maxY)maxY=py;
        const next=[px>rect.x?index-1:-1,px+1<xLimit?index+1:-1,py>rect.y?index-width:-1,py+1<yLimit?index+width:-1];
        for(let j=0;j<4;j++) {const v=next[j];if(v>=0&&mask[v]===1){mask[v]=2;queue[back++]=v;}}
      }
      if(back<rule.minArea){discarded++;continue;}
      defectPixels+=back;
      for(let k=0;k<back;k++) acceptedMask[queue[k]]=1;
      components.push({x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,area:back,
        centerX:Math.round((maxX+minX)/2),centerY:Math.round((maxY+minY)/2)});
    }
    components.sort((a,b)=>b.area-a.area||a.y-b.y||a.x-b.x);
    return {
      verdict: components.length<=rule.maxDefects?'OK':'NOK',
      width,height,roi:rect,mode:rule.mode,threshold:rule.threshold,minArea:rule.minArea,
      maxDefects:rule.maxDefects,defectCount:components.length,defectPixels,
      candidatePixels:matchPixels,discardedComponents:discarded,
      coveragePercent:Number((100*defectPixels/(rect.width*rect.height)).toFixed(3)),
      meanLuminance:Number((luminanceSum/(rect.width*rect.height)).toFixed(2)),
      boxes:components,mask:acceptedMask,
    };
  }

  // Per-frame audit of two physical color fiducials on the piece's measurement plane.
  // This checks scale/translation/rotation, not lens distortion or Z pose. It is fail-closed.
  const FIDUCIAL_COLORS = ['cyan', 'magenta'];
  function isFiducialPixel(data, offset, color) {
    const r=data[offset],g=data[offset+1],b=data[offset+2];
    return color==='cyan' ? r<95 && g>160 && b>120 && g>r*1.8 && b>r*1.5
      : r>160 && b>130 && g<115 && r>g*1.8 && b>g*1.7;
  }
  function locateFiducial(image, point, color, radius=20) {
    const {width,height}=validateImage(image,'Fotograma');
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
    if(!FIDUCIAL_COLORS.includes(color))return null;
    const rr=Math.round(Math.min(40,Math.max(8,radius)));
    let total=0,sx=0,sy=0,minX=width,maxX=-1,minY=height,maxY=-1;
    for(let y=Math.max(0,Math.floor(point.y)-rr);y<=Math.min(height-1,Math.ceil(point.y)+rr);y++) {
      for(let x=Math.max(0,Math.floor(point.x)-rr);x<=Math.min(width-1,Math.ceil(point.x)+rr);x++) {
        if((x-point.x)**2+(y-point.y)**2>rr*rr)continue;
        if(isFiducialPixel(image.data,(y*width+x)*4,color)) {
          total++;sx+=x;sy+=y;
          if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        }
      }
    }
    // Reject colored isolated noise and elongated streaks.
    if(total<15||maxX-minX<3||maxY-minY<3)return null;
    const ratio=(maxX-minX+1)/(maxY-minY+1);
    if(ratio<.5||ratio>2)return null;
    return {x:sx/total,y:sy/total,pixels:total,width:maxX-minX+1,height:maxY-minY+1};
  }
  function createAuditedCalibration(image, selections, referenceMm, distanceMm, sourceId) {
    const {width,height}=validateImage(image,'Fotograma de calibración');
    if(!Array.isArray(selections)||selections.length!==2)throw new RangeError('Marca dos referencias físicas');
    if(typeof sourceId!=='string'||!sourceId||sourceId.length>512)
      throw new RangeError('Identificación de cámara ausente');
    if(!Number.isFinite(referenceMm)||referenceMm<=0||!Number.isFinite(distanceMm)||distanceMm<=0)
      throw new RangeError('Patrón y distancia deben ser positivos');
    const markers=selections.map((selection,i)=>locateFiducial(image,selection,FIDUCIAL_COLORS[i],20));
    if(markers.some(x=>!x))throw new RangeError('No se detectan ambas marcas: primero cian, después magenta, 2 colores distintos y visibles');
    const referencePixels=Math.hypot(markers[0].x-markers[1].x,markers[0].y-markers[1].y);
    if(referencePixels<100)throw new RangeError('Separa las referencias al menos 100 píxeles para limitar la incertidumbre');
    const calibration={schema:3,auditRequired:true,referenceMm,referencePixels,
      workingDistanceMm:distanceMm,imageWidth:width,imageHeight:height,sourceId,
      markers:markers.map(({x,y,pixels},i)=>({x,y,pixels,color:FIDUCIAL_COLORS[i]})),
      mmPerPixel:referenceMm/referencePixels};
    return Object.freeze(calibration);
  }
  function auditCameraFrame(image, calibration, sourceId, options={}) {
    const {width,height}=validateImage(image,'Fotograma de auditoría');
    const invalid=reason=>({status:'INVALID',reason,uncertaintyMm:null,mmPerPixel:null});
    if(!calibration||!calibration.auditRequired||!Array.isArray(calibration.markers)||calibration.markers.length!==2)
      return invalid('Falta calibración auditable con dos fiduciales');
    if(calibration.sourceId!==sourceId)return invalid('La identidad/configuración de cámara cambió');
    if(calibration.imageWidth!==width||calibration.imageHeight!==height)
      return invalid('Resolución de captura cambiada');
    let baseline;
    try {baseline=validateCalibration(calibration,width,height);}catch(error){return invalid(error.message);}
    const maxShift=options.maxShiftPx??12, maxScaleDrift=options.maxScaleDrift??.005,
      maxRotationDegrees=options.maxRotationDegrees??2;
    if(!Number.isFinite(maxShift)||maxShift<=0||maxShift>40||
       !Number.isFinite(maxScaleDrift)||maxScaleDrift<=0||maxScaleDrift>.05)
      return invalid('Parámetros de auditoría inválidos');
    const markers=calibration.markers.map(m=>locateFiducial(image,m,m.color,Math.max(18,maxShift+8)));
    if(markers.some(m=>!m))return invalid('No se ven las dos marcas físicas de control en este fotograma');
    for(let i=0;i<2;i++) {
      const pos=Math.hypot(markers[i].x-calibration.markers[i].x,markers[i].y-calibration.markers[i].y);
      if(pos>maxShift)return invalid('Marcadores desplazados: cámara/patrón/pieza posiblemente movidos');
      const baselineCount=calibration.markers[i].pixels;
      if(markers[i].pixels<baselineCount*.5||markers[i].pixels>baselineCount*1.7)
        return invalid('Tamaño/apariencia del marcador alterados: revisa enfoque, distancia e iluminación');
    }
    const dx=markers[1].x-markers[0].x,dy=markers[1].y-markers[0].y;
    const observed=Math.hypot(dx,dy);
    const drift=Math.abs(observed-calibration.referencePixels)/calibration.referencePixels;
    if(drift>maxScaleDrift)return invalid('Escala física fuera de tolerancia: deriva '+(drift*100).toFixed(3)+' %');
    const previousAngle=Math.atan2(calibration.markers[1].y-calibration.markers[0].y,
                                  calibration.markers[1].x-calibration.markers[0].x);
    const rotation=Math.atan2(Math.sin(Math.atan2(dy,dx)-previousAngle),
                              Math.cos(Math.atan2(dy,dx)-previousAngle))*180/Math.PI;
    if(Math.abs(rotation)>maxRotationDegrees)return invalid('Rotación relativa del patrón fuera de límite');
    const mmPerPixel=calibration.referenceMm/observed;
    // Conservative two-edge quantization + marker centroid detection uncertainty.
    const uncertaintyMm=3*mmPerPixel;
    return {status:'VERIFIED',reason:'Marcas presentes, escala y configuración de fuente verificadas',
      referencePixels:observed,scaleDriftPercent:drift*100,rotationDegrees:rotation,
      mmPerPixel,uncertaintyMm,markers};
  }

  // Calibrated metrology uses an independent reference of known physical length.
  // Distance alone is insufficient: focal length, resolution and lens distortion matter.
  function validateCalibration(calibration, width, height) {
    if (!calibration || typeof calibration !== 'object') throw new TypeError('Calibración inexistente');
    const {referenceMm, referencePixels, workingDistanceMm, imageWidth, imageHeight} = calibration;
    if (![referenceMm, referencePixels, workingDistanceMm].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0))
      throw new RangeError('Referencia, píxeles y distancia deben ser positivos');
    if (referenceMm > 100000 || referencePixels > 10000 || workingDistanceMm > 100000)
      throw new RangeError('Valor fuera de rango');
    if (imageWidth !== width || imageHeight !== height)
      throw new RangeError('Resolución cambiada: recalibra la cámara');
    return {mmPerPixel:referenceMm/referencePixels, workingDistanceMm};
  }
  function measurePiece(image, settings = {}) {
    const {width,height} = validateImage(image,'Imagen de medición');
    const threshold=integer(Number(settings.threshold ?? 130),0,255,'Umbral de pieza');
    const minPixels=integer(Number(settings.minPixels ?? 100),1,2_000_000,'Área mínima de pieza');
    const labels=new Uint8Array(width*height),queue=new Uint32Array(width*height);
    const pixels=image.data;
    for(let i=0;i<width*height;i++){
      const p=i*4;
      const l=(77*pixels[p]+150*pixels[p+1]+29*pixels[p+2])>>8;
      labels[i]=l>=threshold?1:0;
    }
    let best=null;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const first=y*width+x;
      if(labels[first]!==1)continue;
      let front=0,back=1,minX=x,minY=y,maxX=x,maxY=y;
      queue[0]=first;labels[first]=2;
      while(front<back){
        const n=queue[front++],px=n%width,py=(n-px)/width;
        if(px<minX)minX=px;if(px>maxX)maxX=px;
        if(py<minY)minY=py;if(py>maxY)maxY=py;
        const left=px>0?n-1:-1,right=px<width-1?n+1:-1,up=py>0?n-width:-1,down=py<height-1?n+width:-1;
        for(const candidate of [left,right,up,down]) if(candidate>=0&&labels[candidate]===1){labels[candidate]=2;queue[back++]=candidate;}
      }
      if(back>=minPixels&&(!best||back>best.area))
        best={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,area:back,
              touchesBorder:minX===0||minY===0||maxX===width-1||maxY===height-1};
    }
    return best;
  }
  function evaluateMeasurement(box, calibration, nominal, width, height, audit=null) {
    const scale=validateCalibration(calibration,width,height);
    if(calibration.auditRequired && (!audit||audit.status!=='VERIFIED'))
      return {status:'INVALID', reason:audit?.reason||'Auditoría de cámara ausente'};
    if(!box) return {status:'NO_PIECE', reason:'No se ha encontrado una pieza segmentable'};
    if(box.touchesBorder) return {status:'INVALID',reason:'La pieza toca el borde de la imagen; encuadra completamente'};
    const keys=['widthMm','heightMm','toleranceMm','currentDistanceMm'];
    if(!nominal||keys.some(k=>typeof nominal[k]!=='number'||!Number.isFinite(nominal[k])||nominal[k]<0))
      throw new RangeError('Dimensiones y tolerancias no válidas');
    if(nominal.widthMm<=0||nominal.heightMm<=0||nominal.currentDistanceMm<=0||nominal.toleranceMm>10000)
      throw new RangeError('Las dimensiones y distancia deben ser positivas');
    if(Math.abs(nominal.currentDistanceMm-scale.workingDistanceMm)>Math.max(1,scale.workingDistanceMm*.01))
      return {status:'INVALID',reason:'La distancia respecto a la calibración varió más del 1 % o de 1 mm'};
    const mmPerPixel=audit?.status==='VERIFIED'?audit.mmPerPixel:scale.mmPerPixel;
    const measuredWidthMm=box.width*mmPerPixel;
    const measuredHeightMm=box.height*mmPerPixel;
    const deviationWidthMm=measuredWidthMm-nominal.widthMm;
    const deviationHeightMm=measuredHeightMm-nominal.heightMm;
    const deviation=Math.max(Math.abs(deviationWidthMm),Math.abs(deviationHeightMm));
    const uncertaintyMm=audit?.status==='VERIFIED'?audit.uncertaintyMm:0;
    const status=deviation+uncertaintyMm<=nominal.toleranceMm?'OK':
      deviation-uncertaintyMm>nominal.toleranceMm?'NOK':'INDETERMINADO';
    return {status,measuredWidthMm,measuredHeightMm,deviationWidthMm,deviationHeightMm,
      mmPerPixel,uncertaintyMm,areaMm2:box.area*mmPerPixel**2,
      reason:status==='INDETERMINADO'?'Incertidumbre próxima a la tolerancia; revisión manual requerida':null};
  }
  return Object.freeze({inspect,validateRecipe,clampRect,MAX_PIXELS,
    validateCalibration,measurePiece,evaluateMeasurement,locateFiducial,
    createAuditedCalibration,auditCameraFrame});
});
