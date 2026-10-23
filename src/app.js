/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MS ROBOTIKA
 * Browser-only acquisition, reporting, visualization and configuration.
 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const core = window.ABVisionCore;
const source = $('source'), view = $('overlay');
const sctx = source.getContext('2d', {willReadFrequently:true}), vctx = view.getContext('2d');
const viewer = document.querySelector('.viewer');
let imageReady = false, reference = null, camera = null, stream = null, autoTimer = null;
let lastAnalysis = null, lastSource = '', selection = null, roi = null;
let entries = [], autoBusy = false, cameraDevices = [];
let ipActive=false, ipFetchBusy=false, ipAbort=null, calibration=null, marking=false, markPoints=[];
let nativeIpSize='', lastAudit=null;
let sessionToken=new URLSearchParams(location.hash.slice(1)).get('token') || '';
try{if(!sessionToken)sessionToken=sessionStorage.getItem('ab-vision-session')||'';
  if(sessionToken)sessionStorage.setItem('ab-vision-session',sessionToken);}catch{}
if(location.hash.includes('token='))history.replaceState(null,'',location.pathname);
const MAX_HISTORY=500;

function info(message, error=false) {
  $('message').textContent = String(message);
  $('message').classList.toggle('error', error);
}
function setFeed(message, active=false) {
  $('feed-status').textContent = message;
  $('feed-status').classList.toggle('ready', active);
}
function formatNumber(n) {return Number(n).toLocaleString('es-ES');}
function updateSizes(width,height) {
  if(calibration&&(calibration.imageWidth!==width||calibration.imageHeight!==height))invalidateCalibration('Resolución modificada; recalibra');
  source.width=view.width=width;
  source.height=view.height=height;
  viewer.style.aspectRatio=`${width} / ${height}`;
  $('image-size').textContent=`${width} × ${height}`;
  roi=null;
  $('roi-label').textContent='Imagen completa';
  if(reference&&(reference.width!==width||reference.height!==height)) {
    reference=null; $('reference-label').textContent='Referencias de distinto tamaño descartadas';
  }
}
function getFrame() {return sctx.getImageData(0,0,source.width,source.height);}
function renderPicture(result=null) {
  vctx.clearRect(0,0,view.width,view.height);
  vctx.drawImage(source,0,0);
  if(result){
    // Mask overlay is tied to the accepted connected components, not threshold-only pixels.
    const mask=result.mask,overlay=vctx.createImageData(view.width,view.height);
    for(let i=0;i<mask.length;i++) if(mask[i]){
      const p=i*4;overlay.data[p]=255;overlay.data[p+1]=66;overlay.data[p+2]=85;overlay.data[p+3]=115;
    }
    const temp=document.createElement('canvas');temp.width=view.width;temp.height=view.height;
    temp.getContext('2d').putImageData(overlay,0,0);vctx.drawImage(temp,0,0);
    vctx.strokeStyle='#ff6f87';vctx.lineWidth=Math.max(2,view.width/500);
    vctx.font=`bold ${Math.max(15,Math.round(view.width/80))}px system-ui`;
    result.boxes.slice(0,250).forEach((box,index)=>{
      vctx.strokeRect(box.x-.5,box.y-.5,box.width+1,box.height+1);
      const name=`D${index+1} · ${box.area}px`;
      const labelWidth=Math.ceil(vctx.measureText(name).width)+12;
      const lx=box.x,ly=Math.max(0,box.y-22);
      vctx.fillStyle='#ff687e';vctx.fillRect(lx,ly,labelWidth,22);
      vctx.fillStyle='#101921';vctx.fillText(name,lx+6,ly+16);
      vctx.fillStyle='#ff687e';
    });
  }
  if(lastAnalysis?.pieceBox){
    const b=lastAnalysis.pieceBox;
    vctx.save();vctx.strokeStyle='#22f0bc';vctx.lineWidth=Math.max(2,view.width/500);
    vctx.strokeRect(b.x,b.y,b.width,b.height);vctx.restore();
  }
  if(markPoints.length){vctx.save();vctx.strokeStyle='#25fbd5';vctx.fillStyle='#25fbd5';vctx.lineWidth=3;
    for(const pt of markPoints){vctx.beginPath();vctx.arc(pt.x,pt.y,Math.max(5,view.width/170),0,2*Math.PI);vctx.fill();}
    if(markPoints.length===2){vctx.beginPath();vctx.moveTo(markPoints[0].x,markPoints[0].y);vctx.lineTo(markPoints[1].x,markPoints[1].y);vctx.stroke();}
    vctx.restore();}
  const selected=selection||roi;
  if(selected){
    vctx.save();vctx.strokeStyle='#40ffd1';vctx.lineWidth=Math.max(2,view.width/600);
    vctx.setLineDash([10,8]);vctx.strokeRect(selected.x,selected.y,selected.width,selected.height);
    vctx.restore();
  }
}
function createDemo() {
  stopAuto();stopCamera();stopIp();invalidateCalibration('Cambio de fuente: recalibra');
  const width=1280,height=720;updateSizes(width,height);
  const bg=sctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#3a5561');bg.addColorStop(1,'#132d3c');
  sctx.fillStyle=bg;sctx.fillRect(0,0,width,height);
  sctx.fillStyle='#253d4b';for(let x=50;x<1280;x+=100){sctx.fillRect(x,0,1,height)}
  sctx.save();sctx.shadowColor='#070d16';sctx.shadowBlur=35;sctx.shadowOffsetY=20;
  sctx.fillStyle='#d7e0da';sctx.fillRect(105,98,1070,515);sctx.restore();
  const metal=sctx.createLinearGradient(110,100,1140,620);metal.addColorStop(0,'#f0f2e9');metal.addColorStop(.5,'#c6d4d3');metal.addColorStop(1,'#e4ebe3');
  sctx.fillStyle=metal;sctx.fillRect(125,115,1030,480);
  sctx.strokeStyle='#a1b6b6';sctx.lineWidth=3;sctx.strokeRect(145,135,990,440);
  sctx.globalAlpha=.18;sctx.strokeStyle='#effffa';sctx.lineWidth=2;
  for(let i=0;i<14;i++){sctx.beginPath();sctx.moveTo(140,162+i*29);sctx.lineTo(1140,151+i*29);sctx.stroke()}sctx.globalAlpha=1;
  // Four deterministic high-contrast surface defects to validate segmentation.
  const marks=[{x:365,y:265,rx:42,ry:18,r:.35},{x:700,y:365,rx:27,ry:43,r:.7},{x:935,y:248,rx:18,ry:26,r:-.18},{x:535,y:490,rx:50,ry:13,r:.2}];
  for(const m of marks){sctx.save();sctx.translate(m.x,m.y);sctx.rotate(m.r);
    sctx.fillStyle='#303b3b';sctx.beginPath();sctx.ellipse(0,0,m.rx,m.ry,0,0,2*Math.PI);sctx.fill();
    sctx.fillStyle='#45504e';sctx.beginPath();sctx.ellipse(-m.rx*.15,-m.ry*.2,m.rx*.6,m.ry*.55,0,0,2*Math.PI);sctx.fill();sctx.restore();}
  // Test-only physical reference illustration: first cyan, second magenta.
  // For real cameras, PRINT or place equivalent fiducials on the same plane.
  for(const [x,y,color] of [[160,667,'#13eddf'],[1120,667,'#f725ca']]){
    sctx.fillStyle=color;sctx.beginPath();sctx.arc(x,y,9,0,2*Math.PI);sctx.fill();
  }
  roi={x:155,y:145,width:960,height:420};
  $('roi-label').textContent='ROI demo · 960 × 420';
  imageReady=true;lastSource='demo';lastAnalysis=null;
  $('source-label').textContent='Muestra técnica sintética · chapa con defectos';
  setFeed('● IMAGEN CARGADA',true);renderPicture();
  info('Imagen demo lista. Pulsa «Analizar imagen» o activa la inspección continua.');
}
async function openImage(file) {
  if(!file)return;
  if(file.size>20*1024*1024){info('Archivo demasiado grande (límite 20 MB).',true);return;}
  if(!['image/png','image/jpeg','image/webp','image/bmp'].includes(file.type)){info('Formato no admitido.',true);return;}
  stopAuto();stopCamera();stopIp();invalidateCalibration('Nueva imagen: recalibra');
  const url=URL.createObjectURL(file);
  try{
    const pic=await createImageBitmap(file);
    const scale=Math.min(1,Math.sqrt(1_900_000/(pic.width*pic.height)),1600/pic.width,1200/pic.height);
    const width=Math.max(1,Math.round(pic.width*scale)),height=Math.max(1,Math.round(pic.height*scale));
    updateSizes(width,height);sctx.clearRect(0,0,width,height);sctx.drawImage(pic,0,0,width,height);pic.close();
    imageReady=true;lastSource=file.name.slice(0,120);lastAnalysis=null;
    $('source-label').textContent='ARCHIVO · '+lastSource;
    setFeed('● IMAGEN CARGADA',true);renderPicture();
    info('Imagen cargada localmente. Haz una selección ROI si necesitas limitar el área.');
  }catch(err){info('No se pudo decodificar la imagen: '+err.message,true)}
  finally{URL.revokeObjectURL(url);$('image-file').value='';}
}
function captureFrame() {
  if(!stream||!camera||camera.readyState<2){invalidateCalibration('Cámara USB sin fotograma actual');info('La cámara no ha entregado un fotograma válido.',true);stopAuto();return false;}
  const width=camera.videoWidth,height=camera.videoHeight;
  if(!width||!height)return false;
  const scale=Math.min(1,Math.sqrt(1_900_000/(width*height)),1600/width,1200/height);
  const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  if(source.width!==w||source.height!==h)updateSizes(w,h);
  sctx.drawImage(camera,0,0,w,h);
  imageReady=true;lastAnalysis=null;lastSource='webcam';$('source-label').textContent='CÁMARA · CAPTURA LOCAL';
  setFeed('● CÁMARA ACTIVA',true);renderPicture();return true;
}
async function startCamera() {
  if(!navigator.mediaDevices?.getUserMedia){info('La cámara requiere HTTPS o localhost y un navegador compatible.',true);return;}
  stopAuto();stopCamera();stopIp();invalidateCalibration('Cambio de cámara: recalibra');
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'environment'},audio:false});
    camera=$('camera-video');camera.srcObject=stream;await camera.play();
    $('camera-start').disabled=true;$('camera-stop').disabled=false;$('capture').disabled=false;
    captureFrame();info('Cámara activa. Captura imagen para analizar o utiliza inspección continua.');
  }catch(err){stopCamera();info('No se pudo abrir la cámara: '+err.message,true);}
}
function stopCamera() {
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  if(camera){camera.pause();camera.srcObject=null;camera=null;}
  $('camera-start').disabled=false;$('camera-stop').disabled=true;$('capture').disabled=true;
  if(imageReady)setFeed('● IMAGEN CARGADA',true);else setFeed('● SIN FUENTE');
}
function recipe() {
  return core.validateRecipe({mode:$('mode').value,threshold:Number($('threshold').value),
    minArea:Number($('min-area').value),maxDefects:Number($('max-defects').value)});
}
function buildHistoryRow(entry) {
  const row=document.createElement('tr');
  const vals=[new Date(entry.time).toLocaleString('es-ES'),entry.lot,entry.mode,entry.defects,
    entry.coverage+'%',entry.verdict,entry.measuredWidthMm==null?'—':entry.measuredWidthMm.toFixed(2)+' × '+entry.measuredHeightMm.toFixed(2),entry.duration+' ms'];
  vals.forEach((v,i)=>{const cell=document.createElement('td');cell.textContent=String(v);
    if(i===5)cell.className=entry.verdict==='OK'?'good':'bad';row.append(cell);});return row;
}
function renderHistory() {
  $('history-rows').replaceChildren();
  if(!entries.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=8;cell.className='empty';cell.textContent='Los análisis realizados durante esta sesión aparecerán aquí.';row.append(cell);$('history-rows').append(row);return;}
  const frag=document.createDocumentFragment();entries.slice().reverse().forEach(item=>frag.append(buildHistoryRow(item)));
  $('history-rows').append(frag);
}
function inspectOnce() {
  if(!imageReady){info('Primero carga una imagen o captura de cámara.',true);return null;}
  try {
    const start=performance.now();
    const result=core.inspect(getFrame(),recipe(),{roi,reference});
    const ms=(performance.now()-start).toFixed(1);
    let dimensional=null,finalVerdict=result.verdict,box=null;
    const live=Boolean(stream||ipActive);
    let audit=null;
    if(calibration){
      audit=core.auditCameraFrame(getFrame(),calibration,sourceIdentity());
      lastAudit=audit;
      if(audit.status==='VERIFIED'){
        showAudit('VERIFICADA','Escala '+audit.scaleDriftPercent.toFixed(3)+' % · giro '+audit.rotationDegrees.toFixed(2)+'° · margen mínimo de discretización ±'+audit.uncertaintyMm.toFixed(3)+' mm');
        box=core.measurePiece(getFrame(),{threshold:Number($('piece-threshold').value),minPixels:100});
        dimensional=core.evaluateMeasurement(box,calibration,{
          widthMm:Number($('nominal-width').value),heightMm:Number($('nominal-height').value),
          toleranceMm:Number($('dimension-tolerance').value),currentDistanceMm:Number($('distance-mm').value)},
          result.width,result.height,audit);
      }else{
        dimensional={status:'INVALID',reason:audit.reason};
        showAudit('NO VALIDADA',audit.reason);
      }
      if(dimensional.status==='NOK')finalVerdict='NOK';
      else if(dimensional.status==='INDETERMINADO')finalVerdict='REVISAR';
      else if(dimensional.status!=='OK')finalVerdict='SIN MEDICIÓN';
    }else if(live){
      finalVerdict='SIN MEDICIÓN';
      showAudit('NO VALIDADA','Cámara sin patrón auditable; clasificación dimensional bloqueada');
    }else showAudit('NO VALIDADA','Solo inspección visual experimental sin verificación dimensional');
    result.pieceBox=box;
    lastAnalysis=result;
    const dims=dimensional?.measuredWidthMm!=null;
    $('measured-size').textContent=dims?
      dimensional.measuredWidthMm.toFixed(2)+' × '+dimensional.measuredHeightMm.toFixed(2):
      dimensional?.status==='INVALID'?'INVÁLIDA':'SIN CALIBRAR';
    $('dimension-status').textContent=dimensional?.reason|| (dims?'Ancho '+dimensional.deviationWidthMm.toFixed(2)+' mm · Alto '+dimensional.deviationHeightMm.toFixed(2)+' mm · '+dimensional.status:'Dimensiones aún sin verificar');
    $('verdict').textContent=finalVerdict;
    $('verdict').className=finalVerdict==='OK'?'ok':finalVerdict==='NOK'?'nok':'pending';
    $('defects').textContent=formatNumber(result.defectCount);
    $('coverage').textContent=result.coveragePercent.toLocaleString('es-ES')+'%';
    $('duration').textContent=ms+' ms · '+result.width+' × '+result.height;
    renderPicture(result);
    const row={time:new Date().toISOString(),lot:$('lot').value.trim()||'SIN-LOTE',source:lastSource,
      mode:result.mode,roi:result.roi,threshold:result.threshold,minArea:result.minArea,
      maxDefects:result.maxDefects,defects:result.defectCount,coverage:result.coveragePercent,
      verdict:finalVerdict,visualVerdict:result.verdict,dimensionStatus:dimensional?.status||'UNCALIBRATED',
      auditStatus:audit?.status||'NO_CALIBRATION',auditReason:audit?.reason||'No calibrada',
      auditScaleDriftPercent:audit?.scaleDriftPercent??null,auditRotationDegrees:audit?.rotationDegrees??null,
      auditUncertaintyMm:audit?.uncertaintyMm??null,sourceIdentity:sourceIdentity(),
      measuredWidthMm:dims?dimensional.measuredWidthMm:null,measuredHeightMm:dims?dimensional.measuredHeightMm:null,
      nominalWidthMm:Number($('nominal-width').value),nominalHeightMm:Number($('nominal-height').value),
      toleranceMm:Number($('dimension-tolerance').value),workingDistanceMm:Number($('distance-mm').value),
      mmPerPixel:audit?.mmPerPixel??null,duration:Number(ms),boxes:result.boxes.map(({x,y,width,height,area})=>({x,y,width,height,area}))};
    entries.push(row);if(entries.length>MAX_HISTORY)entries.shift();
    $('count').textContent=formatNumber(entries.length);renderHistory();
    info(result.defectCount+' defecto(s). Resultado '+finalVerdict+(dimensional?' · metrología '+dimensional.status:' · medidas sin calibrar')+'.');
    return result;
  }catch(err){info('No se pudo inspeccionar: '+err.message,true);return null;}
}
function stopAuto(){clearTimeout(autoTimer);autoTimer=null;$('auto').textContent='⟳ Inspección continua: OFF';}
async function autoCycle() {
  if(!autoTimer||autoBusy)return;
  autoBusy=true;
  try{if(ipActive){if(await fetchIpFrame())inspectOnce();}else if(stream){if(captureFrame())inspectOnce();}else{stopAuto();info('Inspección continua requiere cámara activa; no se repite una foto estática.',true);}}
  finally{autoBusy=false;}
  if(autoTimer)autoTimer=setTimeout(autoCycle,1500);
}
function toggleAuto(){if(autoTimer){stopAuto();info('Inspección continua detenida.');return;}
  if(!imageReady||(!stream&&!ipActive)){info('Inspección continua requiere cámara USB o IP activa, no imagen estática.',true);return;}
  autoTimer=setTimeout(autoCycle,50);$('auto').textContent='■ Inspección continua: ON';
  info('Inspección continua activa: aproximadamente una imagen cada 1,5 s; se detiene al ocultar la pestaña.');
}
function pointInCanvas(e){const r=view.getBoundingClientRect();return {
  x:Math.max(0,Math.min(view.width-1,Math.round((e.clientX-r.left)*view.width/r.width))),
  y:Math.max(0,Math.min(view.height-1,Math.round((e.clientY-r.top)*view.height/r.height)))};}
function applyRecipe(settings) {
  const valid=core.validateRecipe(settings);
  $('mode').value=valid.mode;$('threshold').value=valid.threshold;$('min-area').value=valid.minArea;
  $('max-defects').value=valid.maxDefects;updateSliders();
}
function updateSliders() {
  $('threshold-value').value=$('threshold').value;
  $('min-area-value').value=$('min-area').value;
  $('threshold-hint').textContent=$('mode').value==='dark'?'Detecta luminosidad inferior al umbral.':
    $('mode').value==='light'?'Detecta luminosidad superior al umbral.':'Detecta diferencia RGB máxima respecto a la referencia.';
}
function storeRecipe() {
  try{localStorage.setItem('ab-vision-recipe-v2',JSON.stringify({schema:2,recipe:recipe(),metrology:metrologySettings()}));info('Receta guardada en este navegador. Las imágenes NO se almacenan.');}
  catch(err){info('No se pudo guardar la receta: '+err.message,true);}
}
function download(filename,content,type) {
  const blob=content instanceof Blob?content:new Blob([content],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function csvValue(value){let s=String(value??'');if(/^[\s]*[=+@\-]/.test(s)&&!/^\s*-?\d+(\.\d+)?\s*$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCsv() {
  if(!entries.length){info('Todavía no hay inspecciones que exportar.',true);return;}
  const columns=['time','lot','source','sourceIdentity','mode','defects','coverage','verdict','visualVerdict','dimensionStatus','auditStatus','auditReason','auditScaleDriftPercent','auditRotationDegrees','auditUncertaintyMm',
    'measuredWidthMm','measuredHeightMm','nominalWidthMm','nominalHeightMm','toleranceMm','workingDistanceMm',
    'mmPerPixel','duration','threshold','minArea','maxDefects'];
  const lines=[columns.map(csvValue).join(',')];
  entries.forEach(e=>lines.push(columns.map(k=>csvValue(e[k])).join(',')));
  download('AB-Vision-historial.csv','\uFEFF'+lines.join('\r\n')+'\r\n','text/csv;charset=utf-8');
  info('Histórico exportado a CSV.');
}
function exportAnnotated() {
  if(!imageReady){info('No hay imagen que exportar.',true);return;}
  view.toBlob(blob=>{if(blob)download('AB-Vision-Inspeccion.png',blob,'image/png');else info('No se pudo guardar el PNG.',true);},'image/png');
}
function takeReference() {
  if(!imageReady){info('Carga primero una imagen de referencia.',true);return;}
  reference=getFrame();
  $('reference-label').textContent=`Patrón ${reference.width}×${reference.height} · sesión actual`;
  info('Referencia fijada en memoria. Usa «Diferencia frente a referencia» sobre una imagen posterior alineada.');
}

function metrologySettings(){return {
  referenceMm:Number($('reference-mm').value),distanceMm:Number($('distance-mm').value),
  nominalWidthMm:Number($('nominal-width').value),nominalHeightMm:Number($('nominal-height').value),
  toleranceMm:Number($('dimension-tolerance').value),threshold:Number($('piece-threshold').value)};}
function applyMetrology(cfg){
  for(const [key,id] of [['referenceMm','reference-mm'],['distanceMm','distance-mm'],
    ['nominalWidthMm','nominal-width'],['nominalHeightMm','nominal-height'],
    ['toleranceMm','dimension-tolerance'],['threshold','piece-threshold']]){
    if(Number.isFinite(cfg[key])&&cfg[key]>=0)$(id).value=cfg[key];
  }
}
function invalidateCalibration(message='Sin calibrar'){
  calibration=null;lastAudit=null;marking=false;markPoints=[];
  $('calibration-status').textContent='SIN CALIBRAR · '+message;
  $('measured-size').textContent='SIN CALIBRAR';$('dimension-status').textContent='Medidas dimensionales no verificadas';
  if(['OK','NOK','REVISAR'].includes($('verdict').textContent)){$('verdict').textContent='SIN MEDICIÓN';$('verdict').className='pending';}
  showAudit('NO VALIDADA',message);
  if(imageReady)renderPicture(lastAnalysis);
}
function sourceIdentity(){
  if(ipActive) return 'ip:'+[$('ip-protocol').value,$('ip-address').value.trim(),$('ip-port').value,
    $('ip-path').value.trim(),nativeIpSize].join('|');
  if(stream){const t=stream.getVideoTracks()[0],m=t?.getSettings?.()||{};
    return 'webcam:'+JSON.stringify({deviceId:m.deviceId||'',width:m.width||0,height:m.height||0,
      zoom:m.zoom??null,focusDistance:m.focusDistance??null,resizeMode:m.resizeMode??null});}
  return 'static:'+lastSource;
}
function showAudit(status,message){
  const e=$('audit-status');e.textContent=status+' · '+message;
  e.className='audit-indicator '+(status==='VERIFICADA'?'audit-good':'audit-bad');
}
function calibrationClick(point){
  markPoints.push(point);
  if(markPoints.length!==2){info('Primera marca registrada (cian). Marca ahora el centro MAGENTA.',false);renderPicture(lastAnalysis);return;}
  marking=false;
  const referenceMm=Number($('reference-mm').value),workingDistanceMm=Number($('distance-mm').value);
  try{
    calibration=core.createAuditedCalibration(getFrame(),markPoints,referenceMm,workingDistanceMm,sourceIdentity());
    const audit=core.auditCameraFrame(getFrame(),calibration,sourceIdentity());
    if(audit.status!=='VERIFIED')throw Error(audit.reason);
    lastAudit=audit;
    $('calibration-status').textContent='CALIBRADA Y AUDITADA · '+calibration.mmPerPixel.toFixed(5)+
      ' mm/px · distancia nominal '+workingDistanceMm+' mm · '+source.width+'×'+source.height;
    showAudit('VERIFICADA','Referencia cian/magenta visible. Deriva de escala 0,000 %');
    info('Patrón detectado. Se volverán a verificar ambos marcadores EN CADA FOTOGRAMA.');
  }catch(error){calibration=null;lastAudit=null;markPoints=[];showAudit('NO VALIDADA',error.message);info('Calibración rechazada: '+error.message,true);}
  renderPicture(lastAnalysis);
}
function ipConfig(){return {ip:$('ip-address').value.trim(),protocol:$('ip-protocol').value,
  port:Number($('ip-port').value),path:$('ip-path').value.trim(),username:$('ip-user').value,
  password:$('ip-password').value,approved:$('ip-approved').checked};}
async function fetchIpFrame(){
  if(ipFetchBusy)return false;
  if(!sessionToken){info('Cámara IP requiere servidor Python: ejecuta serve.py y abre su URL completa.',true);stopAuto();return false;}
  ipFetchBusy=true;ipAbort=new AbortController();
  try{
    const response=await fetch('/api/ip-camera/frame',{method:'POST',cache:'no-store',signal:ipAbort.signal,
      headers:{'Content-Type':'application/json','X-AB-Vision-Session':sessionToken},body:JSON.stringify(ipConfig())});
    if(!response.ok)throw Error((await response.text()).slice(0,220));
    if(!response.headers.get('Content-Type')?.includes('image/jpeg'))throw Error('Fotograma no es JPEG');
    const blob=await response.blob();if(blob.size>4*1024*1024)throw Error('Fotograma demasiado grande');
    const bitmap=await createImageBitmap(blob);nativeIpSize=bitmap.width+'x'+bitmap.height;
    const scale=Math.min(1,Math.sqrt(1_900_000/(bitmap.width*bitmap.height)),1600/bitmap.width,1200/bitmap.height);
    const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
    if(source.width!==w||source.height!==h)updateSizes(w,h);
    sctx.drawImage(bitmap,0,0,w,h);bitmap.close();
    imageReady=true;lastSource='IP '+$('ip-address').value.trim();lastAnalysis=null;
    $('source-label').textContent='IP · '+$('ip-address').value.trim();
    setFeed('● CÁMARA IP ACTIVA',true);$('ip-state').textContent='Fotograma recibido';renderPicture();
    return true;
  }catch(error){if(error.name!=='AbortError'){invalidateCalibration('Error de adquisición IP; medida retenida');info('IP: '+error.message,true);$('ip-state').textContent='Error de adquisición';stopAuto();ipActive=false;}$('ip-connect').disabled=false;return false;}
  finally{ipFetchBusy=false;ipAbort=null;}
}
function stopIp(){ipActive=false;if(ipAbort)ipAbort.abort();$('ip-disconnect').disabled=true;$('ip-connect').disabled=false;
  if($('ip-state'))$('ip-state').textContent='Cámara IP desconectada';}
async function connectIp(){
  stopAuto();stopCamera();stopIp();invalidateCalibration('Nueva fuente IP: calibra patrón en esta cámara');
  if(!$('ip-approved').checked)return info('Debes autorizar expresamente el acceso a la cámara de tu red.',true);
  const data=ipConfig();if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(data.ip))return info('Introduce IPv4 numérica de cámara.',true);
  if(!data.path.startsWith('/')||data.path.startsWith('//'))return info('La ruta debe empezar por /',true);
  $('ip-connect').disabled=true;
  const ok=await fetchIpFrame();ipActive=ok;
  $('ip-disconnect').disabled=!ok;$('ip-connect').disabled=ok;
  if(ok)info('Cámara IP conectada y primer JPEG captado. Calibra y activa inspección continua.');
}

/** Dedicated rubber-strip lab: shares the camera/IP acquisition and source canvas.
 * No token, credentials, web write command or PLC access is exposed.
 */
function stripDemo(count=4,offsetPx=0,reset=false){
  if(reset){
    stopAuto();stopCamera();stopIp();invalidateCalibration('Nueva muestra de tiras demo');
  }
  const width=1280,height=720;
  if(source.width!==width||source.height!==height)updateSizes(width,height);
  const centers={1:[640],2:[470,810],3:[340,640,940],4:[250,510,770,1030]}[count];
  if(!centers)throw Error('Solo de 1 a 4 tiras');
  sctx.fillStyle='#abb5b4';sctx.fillRect(0,0,width,height);
  sctx.fillStyle='#bfc5c1';sctx.fillRect(85,87,1110,490);
  sctx.strokeStyle='#dbe8dc';sctx.lineWidth=2;
  for(let y=100;y<570;y+=58){sctx.beginPath();sctx.moveTo(90,y);sctx.lineTo(1190,y);sctx.stroke();}
  centers.forEach((cx,i)=>{
    const w=50+(i===Math.floor(count/2)?offsetPx:0);
    sctx.fillStyle='#242a2e';sctx.fillRect(cx-w/2,100,w,450);
    sctx.fillStyle='#44484b';sctx.fillRect(cx-w/2+4,100,2,450);
  });
  // Synthetic fiducials. Real installations require physical, fixed marks in the same plane.
  for(const [x,y,color] of [[100,649,'#13eddf'],[1100,649,'#f725ca']]){
    sctx.fillStyle=color;sctx.beginPath();sctx.arc(x,y,10,0,Math.PI*2);sctx.fill();
  }
  roi={x:110,y:125,width:1060,height:390};
  $('roi-label').textContent='ROI de tiras · 1060 × 390';
  imageReady=true;lastSource='strip-demo';lastAnalysis=null;
  $('source-label').textContent='DEMOSTRACIÓN SINTÉTICA · '+count+' tira(s) de goma';
  setFeed('● CINTA SIMULADA',true);renderPicture();
}
window.ABVisionAcquisition=Object.freeze({
  getFrame:()=>imageReady?getFrame():null,
  getSourceId:()=>sourceIdentity(),
  getRoi:()=>roi?{x:roi.x,y:roi.y,width:roi.width,height:roi.height}:null,
  setRoi:next=>{
    const rect=core.clampRect(next,source.width,source.height);
    if(rect.x!==next.x||rect.y!==next.y||rect.width!==next.width||rect.height!==next.height)
      throw new RangeError('ROI guardada no coincide con resolución actual');
    roi=rect;$('roi-label').textContent='ROI de receta · '+rect.width+' × '+rect.height;
    renderPicture(lastAnalysis);
  },
  isLive:()=>Boolean(stream||ipActive),
  isStripDemo:()=>lastSource==='strip-demo',
  stopDefectAuto:stopAuto,
  refresh:async()=>ipActive?fetchIpFrame():stream?captureFrame():imageReady,
  demo:stripDemo,
  setOverlay:markers=>{
    renderPicture();
    if(!Array.isArray(markers))return;
    vctx.save();vctx.lineWidth=Math.max(2,view.width/450);vctx.font='bold 15px sans-serif';
    for(const marker of markers){
      vctx.strokeStyle=marker.status==='OK'?'#30e9ac':marker.status==='NOK'?'#ff647b':'#ffd36d';
      const x=marker.centerPx;
      vctx.beginPath();vctx.moveTo(x,115);vctx.lineTo(x,550);vctx.stroke();
      vctx.fillStyle=vctx.strokeStyle;
      vctx.fillText('T'+marker.index+' '+marker.meanMm.toFixed(2)+' mm',Math.max(12,x-30),110);
    }
    vctx.restore();
  }
});
function init() {
  try{const saved=JSON.parse(localStorage.getItem('ab-vision-recipe-v2')||localStorage.getItem('ab-vision-recipe-v1')||'null');if(saved?.recipe)applyRecipe(saved.recipe);if(saved?.metrology)applyMetrology(saved.metrology);}catch{}
  $('demo').addEventListener('click',createDemo);
  $('image-file').addEventListener('change',e=>openImage(e.target.files?.[0]));
  $('camera-start').addEventListener('click',startCamera);
  $('camera-stop').addEventListener('click',()=>{stopAuto();stopCamera();invalidateCalibration('Cámara física desconectada');info('Cámara desconectada. La calibración se ha invalidado.');});
  $('ip-connect').addEventListener('click',connectIp);$('ip-disconnect').addEventListener('click',()=>{stopAuto();stopIp();invalidateCalibration('Cámara IP desconectada');info('Cámara IP desconectada.');});
  for(const id of ['ip-address','ip-port','ip-protocol','ip-path','ip-user','ip-password','ip-approved'])$(id).addEventListener('change',()=>{if(ipActive){stopAuto();stopIp();invalidateCalibration('Parámetros IP modificados; vuelve a calibrar');}});
  $('capture').addEventListener('click',captureFrame);
  $('analyze').addEventListener('click',inspectOnce);$('auto').addEventListener('click',toggleAuto);
  for(const id of ['threshold','min-area','mode'])$(id).addEventListener('input',updateSliders);
  $('roi-reset').addEventListener('click',()=>{roi=null;selection=null;$('roi-label').textContent='Imagen completa';renderPicture(lastAnalysis);});
  view.addEventListener('pointerdown',e=>{if(marking&&imageReady){calibrationClick(pointInCanvas(e));return;}if(!$('roi-mode').checked||!imageReady)return;
    const p=pointInCanvas(e);selection={startX:p.x,startY:p.y,x:p.x,y:p.y,width:1,height:1};view.setPointerCapture(e.pointerId);});
  view.addEventListener('pointermove',e=>{if(!selection)return;const p=pointInCanvas(e);
    selection.x=Math.min(selection.startX,p.x);selection.y=Math.min(selection.startY,p.y);
    selection.width=Math.max(1,Math.abs(p.x-selection.startX));selection.height=Math.max(1,Math.abs(p.y-selection.startY));renderPicture(lastAnalysis);});
  view.addEventListener('pointerup',e=>{if(!selection)return;const p=pointInCanvas(e),r=selection;
    const next={x:Math.min(r.startX,p.x),y:Math.min(r.startY,p.y),width:Math.max(1,Math.abs(p.x-r.startX)),height:Math.max(1,Math.abs(p.y-r.startY))};
    selection=null;roi=core.clampRect(next,view.width,view.height);
    $('roi-label').textContent=`ROI: ${roi.x},${roi.y} · ${roi.width}×${roi.height}`;renderPicture(lastAnalysis);});
  $('save-recipe').addEventListener('click',storeRecipe);
  $('export-recipe').addEventListener('click',()=>download('AB-Vision-receta.json',JSON.stringify({schema:2,application:'AB-Vision Inspector',recipe:recipe(),metrology:metrologySettings(),calibration},null,2),'application/json'));
  $('recipe-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;
    try{if(file.size>65536)throw Error('Archivo mayor de 64 KiB');const json=JSON.parse(await file.text());
      if(![1,2].includes(json.schema)||!json.recipe)throw Error('Formato de receta incompatible');applyRecipe(json.recipe);if(json.metrology)applyMetrology(json.metrology);invalidateCalibration('Receta importada: verifica de nuevo la calibración sobre patrón');info('Receta importada; comprueba la calibración física antes de medir.');}
    catch(err){info('No se pudo importar: '+err.message,true)}finally{e.target.value='';}});
  $('set-reference').addEventListener('click',takeReference);
  $('mark-scale').addEventListener('click',()=>{if(!imageReady)return info('Necesitas imagen para calibrar',true);markPoints=[];marking=true;$('roi-mode').checked=false;info('Coloca dos marcadores físicos de color en el mismo plano: pulsa primero CIAN y luego MAGENTA; su distancia debe ser la longitud real indicada.');});
  $('clear-scale').addEventListener('click',()=>invalidateCalibration('Calibración borrada'));
  for(const id of ['reference-mm','nominal-width','nominal-height','dimension-tolerance','distance-mm','piece-threshold'])$(id).addEventListener('change',()=>{if(['reference-mm','distance-mm','piece-threshold'].includes(id)&&calibration)invalidateCalibration('Parámetro crítico cambiado; recalibra');});
  $('export-csv').addEventListener('click',exportCsv);
  $('export-json').addEventListener('click',()=>download('AB-Vision-historial.json',JSON.stringify({schema:1,records:entries},null,2),'application/json'));
  $('save-png').addEventListener('click',exportAnnotated);
  $('clear-history').addEventListener('click',()=>{entries=[];$('count').textContent='0';renderHistory();info('Historial de esta sesión vaciado.');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto();});
  window.addEventListener('pagehide',()=>{stopAuto();stopCamera();stopIp();});
  updateSliders();createDemo();
}
init();
})();
