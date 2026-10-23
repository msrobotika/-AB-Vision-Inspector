/* SPDX-License-Identifier: MIT · MS ROBOTIKA
 * Strip-width HMI is intentionally read-only, local-first and fail closed.
 * Does not import secrets, call PLC writes or persist camera images.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const core=window.ABVisionCore, strips=window.ABStripCore,acq=window.ABVisionAcquisition;
const belt=window.ABBeltEdgeCalibration;
if(!core||!strips||!acq||!belt)throw Error('Motor de medición de tiras no disponible');
const src=$('source'),view=$('overlay');
let calibration=null,baseline=null,active=false,timer=null,busy=false;
let seq=0,history=[],demoFault=false,demoOscillating=false;
let liveRecipe=null;
let guidePoints=[],guidePicking=false;
const guideLayer=$('strip-guides-layer'),guideContext=guideLayer.getContext('2d');
function isBelt(){return $('strip-method').value==='belt-edges'}
function guideOverlay(){
  if(!src.width||!src.height)return;
  if(guideLayer.width!==src.width)guideLayer.width=src.width;
  if(guideLayer.height!==src.height)guideLayer.height=src.height;
  guideContext.clearRect(0,0,guideLayer.width,guideLayer.height);
  let points=guidePoints;
  if(calibration?.kind==='BELT_EDGES')points=[
    {x:calibration.xLeft,y:Math.floor(src.height/2)},
    {x:calibration.xRight,y:Math.floor(src.height/2)}
  ];
  guideContext.save();guideContext.lineWidth=Math.max(2,src.width/600);
  guideContext.setLineDash([10,7]);
  points.forEach((p,i)=>{
    guideContext.strokeStyle=i===0?'#46d4fb':'#ff8add';
    guideContext.fillStyle=i===0?'#46d4fb':'#ff8add';
    guideContext.beginPath();guideContext.moveTo(p.x,0);
    guideContext.lineTo(p.x,src.height);guideContext.stroke();
    guideContext.setLineDash([]);
    guideContext.fillRect(p.x+5,Math.max(4,p.y-27),95,25);
    guideContext.fillStyle='#101e2a';guideContext.font='bold 17px sans-serif';
    guideContext.fillText(i===0?'IZQUIERDA':'DERECHA',p.x+9,Math.max(21,p.y-8));
    guideContext.setLineDash([10,7]);
  });
  guideContext.restore();
}
function pickGuide(e){
  if(!guidePicking)return;
  const rect=guideLayer.getBoundingClientRect();
  const x=Math.round((e.clientX-rect.left)*src.width/rect.width);
  const y=Math.round((e.clientY-rect.top)*src.height/rect.height);
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  guidePoints.push({x,y});guideOverlay();
  if(guidePoints.length===2){
    guidePicking=false;guideLayer.classList.remove('marking');
    if(guidePoints[0].x>guidePoints[1].x){
      guidePoints=[];guideOverlay();
      note('Selecciona primero el borde IZQUIERDO y luego el DERECHO',true);return;
    }
    note('Dos guías marcadas sobre la imagen. Introduce anchura real y pulsa «Detectar referencia y calibrar muestra».');
  }else note('Borde izquierdo marcado. Ahora pulsa sobre el BORDE DERECHO a la misma altura.');
}
guideLayer.addEventListener('pointerdown',pickGuide);
function startPicking(){
  if(!acq.getFrame()){note('Primero abre webcam/IP, una imagen o Cinta demo',true);return;}
  stop();calibration=null;baseline=null;liveRecipe=null;
  guidePoints=[];guidePicking=true;guideLayer.classList.add('marking');
  $('strip-method').value='belt-edges';methodChanged();
  note('Sobre el visor superior, pulsa el BORDE IZQUIERDO REAL de la cinta (no el de una tira).');
  $('strip-guides').textContent='⌖ Marcas virtuales: seleccionando';
  guideOverlay();
}
function methodChanged(){
  const active=isBelt();
  $('strip-reference-label').textContent=active?'Anchura física de cinta, medida (mm)':'Separación real entre marcas (mm)';
  $('strip-guides').hidden=!active;
  $('strip-guide-help').textContent=active?
    '1. Activa la cámara o demo. 2. Marca en el visor los bordes IZQUIERDO y DERECHO de la cinta, a igual altura. 3. Escribe la anchura real comprobada. 4. Calibra. No dibujes líneas en la propia goma.':
    'Con las referencias físicas CIAN/MAGENTA visibles, pulsa Detectar referencia; se auditarán en cada fotograma.';
}
const memoryKey='abvision-strip-recipes-v1';
const $txt=(id,value)=>$(id).textContent=String(value);
const note=(message,error=false)=>{$txt('strip-message',message);$('strip-message').classList.toggle('error',error)};
const state=(status,message)=>{
  $txt('strip-status',message||status);
  $('strip-status').className='strip-status '+(status==='OK'?'ok':status==='NOK'?'nok':'');
  $txt('strip-verdict',status==='INVALID'?'SIN MEDICIÓN':status);
  $('strip-verdict').dataset.state=status;
};
function defaultRoi(){
  const roi=acq.getRoi();
  if(roi)return roi;
  const w=src.width,h=src.height;
  return {x:Math.round(w*.10),y:Math.round(h*.20),
    width:Math.floor(w*.80),height:Math.floor(h*.60)};
}
function fields(){
  return strips.validateRecipe({
    id:$('strip-id').value,count:Number($('strip-count').value),
    nominalMm:Number($('strip-nominal').value),toleranceMm:Number($('strip-tolerance').value),
    referenceMm:Number($('strip-reference').value),distanceMm:Number($('strip-distance').value),
    calibrationMethod:$('strip-method').value,
    polarity:$('strip-polarity').value,threshold:Number($('strip-threshold').value),
    minRunPx:8,roi:defaultRoi()
  });
}
function loadRecipe(recipe){
  const valid=strips.validateRecipe(recipe);
  for(const [id,value] of [
    ['strip-id',valid.id],['strip-count',valid.count],
    ['strip-nominal',valid.nominalMm],['strip-tolerance',valid.toleranceMm],
    ['strip-reference',valid.referenceMm],['strip-distance',valid.distanceMm],
    ['strip-method',valid.calibrationMethod],
    ['strip-polarity',valid.polarity],['strip-threshold',valid.threshold]
  ])$(id).value=value;
  calibration=null;baseline=null;liveRecipe=null;
  guidePoints=[];guidePicking=false;guideLayer.classList.remove('marking');
  guideOverlay();methodChanged();stop();
  try{acq.setRoi(valid.roi)}
  catch{note('ROI guardada no coincide con resolución de cámara: selecciona de nuevo la región.',true)}
  state('INVALID','RECETA CARGADA · RECALIBRAR');
  $txt('strip-scale','SIN CALIBRAR');
  $txt('strip-audit','La receta no conserva una escala válida; vuelve a verificar el patrón físico o los bordes naturales');
  note('Receta cargada: selecciona ROI si cambió el encuadre, vuelve a marcar los dos bordes o verifica fiduciales, y calibra.');
}
function loadSaved(){
  try{
    const data=JSON.parse(localStorage.getItem(memoryKey)||'{}');
    if(!data||typeof data!=='object'||Array.isArray(data))return {};
    const out={};
    for(const [key,val] of Object.entries(data).slice(0,20)){
      try{out[key]=strips.validateRecipe(val)}catch{}
    }return out;
  }catch{return {}}
}
function refreshSelect(){
  const chosen=$('strip-saved').value;
  $('strip-saved').replaceChildren(new Option('Selecciona una receta…',''));
  for(const id of Object.keys(loadSaved()).sort()){
    $('strip-saved').add(new Option(id,id));
  }
  if(chosen&&loadSaved()[chosen])$('strip-saved').value=chosen;
}
function saveRecipe(){
  try{
    const r=fields(), saved=loadSaved();
    if(!saved[r.id]&&Object.keys(saved).length>=20)throw Error('Máximo 20 recetas locales. Exporta JSON antes de limpiar.');
    saved[r.id]=r;
    localStorage.setItem(memoryKey,JSON.stringify(saved));
    refreshSelect();$('strip-saved').value=r.id;
    note('Receta '+r.id+' guardada sin imágenes ni calibración activa. Al recuperarla será obligatorio revalidar.');
  }catch(e){note('No se pudo guardar: '+e.message,true)}
}
function download(name,contents,mime){
  const url=URL.createObjectURL(new Blob([contents],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportRecipe(){
  try{
    const r=fields();
    download('AB-Vision-tiras-receta-'+r.id+'.json',JSON.stringify({
      schema:'msrobotika.strip.recipe.v1',recipe:r,
      calibration:'MUST_REVALIDATE_ON_EVERY_SESSION',
      note:'No contiene escala auditada, imágenes, claves ni identidades de cámara.'
    },null,2),'application/json');
  }catch(e){note(e.message,true)}
}
async function importRecipe(e){
  const file=e.target.files?.[0];
  if(!file)return;
  try{
    if(file.size>24*1024)throw Error('Máximo 24 KB');
    const json=JSON.parse(await file.text());
    if(json.schema!=='msrobotika.strip.recipe.v1')throw Error('Esquema de receta no soportado');
    loadRecipe(json.recipe);
  }catch(error){note('Archivo rechazado: '+error.message,true)}
  finally{e.target.value=''}
}
function csv(value){
  let v=String(value??'');
  if(/^\s*[=+@\-\t\r]/.test(v)&&!/^\s*-?\d+(\.\d+)?\s*$/.test(v))v="'"+v;
  return '"'+v.replaceAll('"','""')+'"';
}
function exportCsv(){
  const columns=['timestampUTC','recipe','frame','source','status','audit','reason',
    'strip1Mm','strip2Mm','strip3Mm','strip4Mm','strip1Status','strip2Status',
    'strip3Status','strip4Status','lateralShiftT1Px','lateralShiftT2Px',
    'lateralShiftT3Px','lateralShiftT4Px','scaleMmPerPixel','uncertaintyMm','calibrationMethod'];
  const rows=[columns.map(csv).join(',')];
  for(const entry of history){
    const vals=[entry.at,entry.recipe,entry.frame,entry.source,entry.status,entry.audit,entry.reason,
      ...[0,1,2,3].map(i=>entry.lanes[i]?.meanMm??''),
      ...[0,1,2,3].map(i=>entry.lanes[i]?.status??''),
      ...[0,1,2,3].map(i=>entry.lanes[i]?.lateralShiftPx??''),
      entry.mmPerPixel??'',entry.uncertaintyMm??'',entry.method??''];
    rows.push(vals.map(csv).join(','));
  }
  download('AB-Vision-tiras-traza-'+new Date().toISOString().slice(0,10)+'.csv',
    rows.join('\r\n')+'\r\n','text/csv;charset=utf-8');
}
function renderHistory(){
  const el=$('strip-history');el.replaceChildren();
  if(!history.length){const row=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=7;td.textContent='Sin mediciones';row.append(td);el.append(row);return;}
  for(const entry of history.slice(-14).reverse()){
    const row=document.createElement('tr');
    const values=[entry.at,entry.recipe,entry.frame,
      entry.lanes.map(l=>l.meanMm.toFixed(2)).join(' / ')||'—',
      entry.lanes.map(l=>('T'+l.index+' '+(l.deltaMm>=0?'+':'')+l.deltaMm.toFixed(2)+' mm')).join(' · ')||entry.reason||'—',
      entry.status,entry.audit];
    values.forEach(value=>{const td=document.createElement('td');td.textContent=String(value);row.append(td)});
    el.append(row);
  }
}
function trace(result,recipe,origin){
  seq++;
  const record={at:new Date().toISOString(),recipe:recipe.id,frame:seq,
    source:origin,status:result.status,audit:result.auditStatus||'INVALID',
    reason:result.reason||'',lanes:result.lanes||[],
    mmPerPixel:result.mmPerPixel??null,uncertaintyMm:result.uncertaintyMm??null,
    method:calibration?.kind==='BELT_EDGES'?'BELT_WIDTH_VISUAL':'FIDUCIALS'};
  history.push(record);if(history.length>1000)history.shift();
  $txt('strip-samples',history.length);
  renderHistory();
}
function formatLanes(lanes){
  return lanes?.length ? lanes.map(l=>'T'+l.index+': '+l.meanMm.toFixed(2)+' mm ('+l.status+')').join(' · ') : '—';
}
function measure({store=true}={}){
  const recipe=liveRecipe;
  if(!recipe||!calibration||!baseline){
    state('INVALID','SIN PATRÓN AUDITADO');
    $txt('strip-audit','Falta calibración de esta muestra');return null;
  }
  const frame=acq.getFrame();
  if(!frame){state('INVALID','SIN FOTOGRAMA');return null;}
  const audit=calibration.kind==='BELT_EDGES'?
    belt.audit(frame,calibration,acq.getSourceId()):
    core.auditCameraFrame(frame,calibration,acq.getSourceId());
  let result;
  try{result=strips.evaluate(frame,recipe,calibration,audit,baseline)}
  catch(error){result={status:'INVALID',reason:error.message,lanes:[],auditStatus:'INVALID'}}
  state(result.status,result.status==='INVALID'?'SIN MEDICIÓN · BLOQUEADO':result.status+' · '+recipe.count+' TIRAS');
  $txt('strip-audit',audit.status==='BELT_EDGES_TRACKED'?
    'BORDES FÍSICOS VIGILADOS · estimación SIN acreditación ±'+audit.uncertaintyMm.toFixed(3)+' mm':
    audit.status==='VERIFIED'?'FIDUCIALES DETECTADOS · incertidumbre indicativa ±'+audit.uncertaintyMm.toFixed(3)+' mm':
    'NO VALIDADA · '+audit.reason);
  $txt('strip-scale',['VERIFIED','BELT_EDGES_TRACKED'].includes(audit.status)?audit.mmPerPixel.toFixed(5)+' mm/px':'ESCALA NO VALIDADA');
  guideOverlay();
  $txt('strip-widths',formatLanes(result.lanes));
  acq.setOverlay(result.lanes);
  if(store)trace(result,recipe,acq.isStripDemo()?'DEMO_SINTETICA':acq.isLive()?'CAMARA_LIVE':'IMAGEN_ESTATICA');
  if(result.status==='INVALID')note('Lectura bloqueada: '+result.reason,true);
  else if(result.status==='NOK')note('ALERTA: ancho fuera del margen en al menos una tira (inspección visual, NO control automático).',true);
  else if(result.status==='REVIEW')note('REVISAR: la incertidumbre, el desplazamiento o el borde pueden afectar el veredicto.');
  else note('Las '+recipe.count+' tiras están dentro de tolerancia visual en el fotograma actual.');
  return result;
}
async function calibrate(){
  stop();
  try{
    const frame=acq.getFrame();
    if(!frame)throw Error('Primero activa webcam/IP o carga una muestra');
    const r=fields();
    const usingBelt=r.calibrationMethod==='belt-edges';
    let cal,audit;
    if(usingBelt){
      if(guidePoints.length!==2)throw Error('Marca los bordes reales de cinta con dos guías virtuales');
      cal=belt.create(frame,guidePoints,r.referenceMm,r.distanceMm,acq.getSourceId(),r.roi);
      audit=belt.audit(frame,cal,acq.getSourceId());
      if(audit.status!=='BELT_EDGES_TRACKED')throw Error(audit.reason);
    }else{
      const marks=strips.findReferenceMarkers(frame);
      cal=core.createAuditedCalibration(frame,marks,r.referenceMm,r.distanceMm,acq.getSourceId());
      audit=core.auditCameraFrame(frame,cal,acq.getSourceId());
      if(audit.status!=='VERIFIED')throw Error(audit.reason);
    }
    const result=strips.evaluate(frame,r,cal,audit);
    if(!result.lanes||result.lanes.length!==r.count)
      throw Error(result.reason||'No se identificaron 1–4 tiras completas en todas las filas');
    const base=strips.makeBaseline(result,r);
    calibration=cal;baseline=base;liveRecipe=r;
    $txt('strip-scale',audit.mmPerPixel.toFixed(5)+' mm/px');
    $txt('strip-audit',usingBelt?
      'BORDES FÍSICOS DETECTADOS · estimación sin acreditación metrológica':
      'FIDUCIALES DETECTADOS · marcas fijas en la captura');
    guideOverlay();
    state(result.status,'CALIBRADA · '+r.count+' TIRAS');
    $txt('strip-widths',formatLanes(result.lanes));
    acq.setOverlay(result.lanes);
    note((usingBelt?'Dos bordes naturales de cinta localizados; escala orientativa. ':'Patrón físico encontrado. ')+r.count+' tira(s) detectadas. Anchuras de muestra '+base.widthsAtSampleMm.map(v=>v.toFixed(2)).join(' / ')+' mm. La tolerancia se evalúa frente al ancho NOMINAL, no se fuerza por esta muestra.');
    trace(result,r,acq.isStripDemo()?'DEMO_SINTETICA':acq.isLive()?'CAMARA_LIVE':'IMAGEN_ESTATICA');
  }catch(e){
    calibration=null;baseline=null;liveRecipe=null;
    state('INVALID','CALIBRACIÓN RECHAZADA');
    $txt('strip-audit','NO VALIDADA · '+e.message);
    note('Calibración no aceptada: '+e.message,true);
  }
}
async function cycle(){
  if(!active||busy)return;
  busy=true;
  try{
    if(acq.isStripDemo()){
      acq.demo(Number($('strip-count').value),demoFault?18:0,false,
        demoOscillating?Math.round(55*Math.sin((seq+1)*.55)):0);
    }else if(!acq.isLive() || !await acq.refresh()){
      state('INVALID','FUENTE DESCONECTADA');
      stop();note('Sin nuevos fotogramas. Lectura bloqueada y continuo detenido.',true);return;
    }
    measure();
  }catch(e){
    state('INVALID','ERROR DE ADQUISICIÓN');
    stop();note('Adquisición detenida: '+e.message,true);
  }finally{
    busy=false;
    if(active)timer=setTimeout(cycle,1000);
  }
}
function stop(){
  active=false;clearTimeout(timer);timer=null;
  $('strip-run').textContent='⟳ Continuo: OFF';
}
function start(){
  if(active){stop();note('Inspección continua detenida. Exporta el CSV si necesitas conservar trazabilidad.');return}
  if(!calibration||!baseline||!liveRecipe){note('Primero calibra con bordes de cinta o fiduciales.',true);return}
  if(!acq.isStripDemo()&&!acq.isLive()){note('El continuo requiere cámara USB/IP activa o demo, no una foto fija.',true);return}
  acq.stopDefectAuto();active=true;$('strip-run').textContent='■ Detener continuo';
  note('Seguimiento temporal a ~1 fotograma/s. Sin encoder no mide metros recorridos.');
  timer=setTimeout(cycle,50);
}
function demo(){
  stop();demoFault=false;demoOscillating=false;
  $('strip-sway').textContent='Simular oscilación lateral: OFF';
  acq.demo(Number($('strip-count').value),0,true);
  calibration=null;baseline=null;liveRecipe=null;
  guidePoints=[];guidePicking=false;guideLayer.classList.remove('marking');guideOverlay();
  state('INVALID','MUESTRA DEMO · CALIBRAR');
  $txt('strip-scale','SIN CALIBRAR');
  note('Cinta sintética cargada. Usa fiduciales simulados o elige Bordes de cinta y marca sus bordes reales visibles en el visor.');
}
function changed(){
  if(!calibration&&!baseline)return;
  stop();calibration=null;baseline=null;liveRecipe=null;
  state('INVALID','PARÁMETROS MODIFICADOS');
  guideOverlay();
  $txt('strip-scale','RECALIBRAR');$txt('strip-audit','Receta modificada: calibra de nuevo');
  note('Parámetro cambiado. Calibración y muestra previas invalidadas.',true);
}
$('strip-demo').addEventListener('click',demo);
$('strip-guides').addEventListener('click',startPicking);
$('strip-method').addEventListener('change',()=>{
  guidePicking=false;guideLayer.classList.remove('marking');guidePoints=[];
  $('strip-guides').textContent='⌖ Marcar dos bordes en visor';
  changed();methodChanged();guideOverlay();
});
$('strip-calibrate').addEventListener('click',calibrate);
$('strip-once').addEventListener('click',async()=>{
  if(acq.isLive()&&!await acq.refresh()){note('No hay fotograma actual',true);return}
  if(!liveRecipe||!calibration){await calibrate();return}
  measure();
});
$('strip-run').addEventListener('click',start);
$('strip-fault').addEventListener('click',()=>{
  if(!acq.isStripDemo()){note('La inyección de fallo solo existe en el laboratorio sintético.',true);return}
  demoFault=!demoFault;
  acq.demo(Number($('strip-count').value),demoFault?18:0,false,
    demoOscillating?Math.round(55*Math.sin((seq+1)*.55)):0);
  note('Fallo de anchura sintético '+(demoFault?'ACTIVO':'DESACTIVADO')+'. Vuelve a medir.');
  if(!active)measure();
});
$('strip-sway').addEventListener('click',()=>{
  if(!acq.isStripDemo()){note('La simulación de oscilación solo está disponible en el laboratorio.',true);return;}
  demoOscillating=!demoOscillating;
  $('strip-sway').textContent='Simular oscilación lateral: '+(demoOscillating?'ON':'OFF');
  acq.demo(Number($('strip-count').value),demoFault?18:0,false,
    demoOscillating?55:0);
  note('La oscilación transversal no es defecto. Solo habrá alerta si la anchura sale de tolerancia o se pierde la ROI.');
  if(!active)measure();
});
$('strip-save').addEventListener('click',saveRecipe);
$('strip-saved').addEventListener('change',()=>{
  const r=loadSaved()[$('strip-saved').value];if(r)loadRecipe(r);
});
$('strip-export-recipe').addEventListener('click',exportRecipe);
$('strip-import-recipe').addEventListener('change',importRecipe);
$('strip-export-csv').addEventListener('click',exportCsv);
$('strip-export-png').addEventListener('click',()=>{
  if(!acq.getFrame()){note('No hay imagen para guardar',true);return}
  const canvas=$('overlay');canvas.toBlob(blob=>{
    if(blob)download('AB-Vision-tiras-evidencia-'+seq+'.png',blob,'image/png');
  },'image/png');
});
for(const id of ['strip-id','strip-count','strip-nominal','strip-tolerance',
  'strip-reference','strip-distance','strip-polarity','strip-threshold'])
  $(id).addEventListener('change',changed);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
window.addEventListener('pagehide',stop);
methodChanged();refreshSelect();
})();
