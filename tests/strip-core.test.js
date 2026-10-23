/* SPDX-License-Identifier: MIT */
const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/strip-core.js');
const vision=require('../src/vision-core.js');
function frame(count=4,offset=0,markers=true){
 const w=1280,h=720,data=new Uint8ClampedArray(w*h*4);
 for(let p=0;p<data.length;p+=4){data[p]=data[p+1]=data[p+2]=185;data[p+3]=255}
 const centers={1:[640],2:[470,810],3:[340,640,940],4:[250,510,770,1030]}[count];
 for(const [i,cx] of centers.entries())for(let y=100;y<550;y++)for(let x=cx-Math.floor((50+(i===Math.floor(count/2)?offset:0))/2);x<cx+Math.ceil((50+(i===Math.floor(count/2)?offset:0))/2);x++){
   const p=(y*w+x)*4;data[p]=36;data[p+1]=39;data[p+2]=43;
 }
 if(markers){
  for(const [cx,cy,color] of [[100,649,[19,237,223]],[1100,649,[247,37,202]]]){
   for(let y=cy-10;y<=cy+10;y++)for(let x=cx-10;x<=cx+10;x++)if((x-cx)**2+(y-cy)**2<=100){
    const p=(y*w+x)*4;data[p]=color[0];data[p+1]=color[1];data[p+2]=color[2];
   }
  }
 }
 return {width:w,height:h,data};
}
function recipe(count=4){return engine.validateRecipe({id:'GOMA-LINEA-01',count,
  nominalMm:10,toleranceMm:1.5,referenceMm:200,distanceMm:500,
  polarity:'dark',threshold:95,minRunPx:8,
  roi:{x:110,y:125,width:1060,height:390}})}
function cal(image){
 const marks=engine.findReferenceMarkers(image);
 const calibration=vision.createAuditedCalibration(image,marks,200,500,'camera:demo');
 const audit=vision.auditCameraFrame(image,calibration,'camera:demo');
 assert.equal(audit.status,'VERIFIED');
 return {calibration,audit};
}
test('1–4 tiras verticales: medidas dentro del ancho nominal y referencia física',()=>{
 for(let n=1;n<=4;n++){
  const image=frame(n),physical=cal(image),r=recipe(n);
  const result=engine.evaluate(image,r,physical.calibration,physical.audit);
  assert.equal(result.status,'OK',JSON.stringify({n,result:result.reason}));
  assert.equal(result.lanes.length,n);
  for(const lane of result.lanes)assert.ok(Math.abs(lane.meanMm-10)<.02);
  const baseline=engine.makeBaseline(result,r);
  assert.equal(baseline.centers.length,n);
 }
});
test('una de cuatro tiras se ensancha: NOK trazable por carril',()=>{
 const original=frame(),phys=cal(original),r=recipe();
 const baseline=engine.makeBaseline(engine.evaluate(original,r,phys.calibration,phys.audit),r);
 const altered=frame(4,18);
 const audit=vision.auditCameraFrame(altered,phys.calibration,'camera:demo');
 const out=engine.evaluate(altered,r,phys.calibration,audit,baseline);
 assert.equal(out.status,'NOK');
 assert.equal(out.lanes.filter(l=>l.status==='NOK').length,1);
 assert.ok(out.lanes.some(l=>l.maxMm>13.5));
});
test('pérdida de fiducial bloquea antes de emitir un OK dimensional',()=>{
 const original=frame(),phys=cal(original);
 const bad=frame(4,0,false);
 const audit=vision.auditCameraFrame(bad,phys.calibration,'camera:demo');
 const result=engine.evaluate(bad,recipe(),phys.calibration,audit);
 assert.equal(audit.status,'INVALID');
 assert.equal(result.status,'INVALID');assert.equal(result.lanes.length,0);
 assert.match(result.reason,/marca/i);
});
test('sin calibración independiente no se puede validar la anchura nominal',()=>{
 const f=frame(),r=recipe();
 assert.equal(engine.evaluate(f,r,null,null).status,'INVALID');
 assert.throws(()=>engine.findReferenceMarkers(frame(4,0,false)),/marcas/i);
});
test('número de tiras incorrecto, borde cortado y ausencia de material dan INVALID',()=>{
 const im=frame(2),phys=cal(im);
 assert.equal(engine.evaluate(im,recipe(4),phys.calibration,phys.audit).status,'INVALID');
 const cut=recipe(2);
 cut.roi.x=470;cut.roi.width=370;
 assert.equal(engine.extractStrips(im,cut).status,'INVALID');
});
test('resolución o identidad de cámara invalidada',()=>{
 const im=frame(),phys=cal(im),r=recipe();
 assert.equal(vision.auditCameraFrame(im,phys.calibration,'other-camera').status,'INVALID');
 assert.equal(engine.evaluate(im,r,phys.calibration,
    vision.auditCameraFrame(im,phys.calibration,'other-camera')).status,'INVALID');
 const wrong={...phys.calibration,imageWidth:1234};
 assert.equal(engine.evaluate(im,r,wrong,phys.audit).status,'INVALID');
});
test('umbral, ROI, ancho/tolerancia y recuento inválidos son rechazados',()=>{
 for(const changes of [{count:5},{count:0},{nominalMm:-1},{toleranceMm:-.1},
   {threshold:0},{polarity:'unknown'},{roi:{x:-1,y:0,width:45,height:70}},
   {roi:{x:0,y:0,width:10,height:10}},{id:'=HYPERLINK("x")'}]){
  assert.throws(()=>engine.validateRecipe({...recipe(),...changes}),RangeError);
 }
});
test('incertidumbre junto al límite resulta REVIEW y no falso OK',()=>{
 const im=frame(),phys=cal(im),r=recipe();
 const cautious={...r,toleranceMm:.5};
 assert.equal(engine.evaluate(im,cautious,phys.calibration,phys.audit).status,'REVIEW');
});
test('referencia cambiada tras calibrar: bloqueo',()=>{
 const im=frame(),phys=cal(im);
 assert.equal(engine.evaluate(im,{...recipe(),referenceMm:210},phys.calibration,phys.audit).status,'INVALID');
});

function movingFrame(count=4, shift=0, tilt=0.0, normalWidth=50, wave=0){
 const im=frame(count,0,true);
 const centers={1:[640],2:[470,810],3:[340,640,940],4:[250,510,770,1030]}[count];
 // Erase the straight synthetic strips from frame(); preserve fixed fiducials.
 for(let y=100;y<550;y++)for(let x=110;x<1170;x++){
   const p=(y*im.width+x)*4;im.data[p]=im.data[p+1]=im.data[p+2]=185;
 }
 for(const cx of centers)for(let y=100;y<550;y++){
   const phase=(y-100)/95+cx/140;
   const bend=wave*Math.sin(phase);
   const slope=tilt+(wave/95)*Math.cos(phase);
   const middle=cx+shift+tilt*(y-320)+bend;
   const horizontalWidth=normalWidth*Math.hypot(1,slope);
   const left=Math.ceil(middle-horizontalWidth/2),right=Math.floor(middle+horizontalWidth/2);
   for(let x=left;x<=right;x++){
     if(x<0||x>=im.width)continue;
     const p=(y*im.width+x)*4;im.data[p]=36;im.data[p+1]=39;im.data[p+2]=43;
   }
 }
 return im;
}
test('oscilación lateral izquierda/derecha NO altera veredicto cuando ancho es constante',()=>{
 const initial=frame(4),physical=cal(initial),r=recipe(4);
 const base=engine.makeBaseline(engine.evaluate(initial,r,physical.calibration,physical.audit),r);
 for(const shift of [-70,-38,0,27,65]){
  const now=movingFrame(4,shift,0,50,0);
  const audit=vision.auditCameraFrame(now,physical.calibration,'camera:demo');
  const result=engine.evaluate(now,r,physical.calibration,audit,base);
  assert.equal(result.status,'OK','shift='+shift+' '+result.reason);
  assert.equal(result.lanes.length,4);
  assert.ok(result.lanes.some(l=>Math.abs(l.lateralShiftPx)>25)||shift===0);
  assert.ok(result.lanes.every(l=>Math.abs(l.meanMm-10)<.21));
 }
});
test('tira ondulante/oblicua: seguir el centro variable y medir ancho NORMAL, no horizontal',()=>{
 const physical=cal(frame()),r=recipe(4);
 const baseline=engine.makeBaseline(engine.evaluate(frame(),r,physical.calibration,physical.audit),r);
 const moving=movingFrame(4,18,.27,50,22);
 const audit=vision.auditCameraFrame(moving,physical.calibration,'camera:demo');
 const result=engine.evaluate(moving,r,physical.calibration,audit,baseline);
 assert.equal(result.status,'OK',result.reason);
 assert.equal(result.lanes.length,4);
 assert.ok(result.lanes.every(l=>l.lateralRangePx>30));
 assert.ok(result.lanes.some(l=>l.rowWidthsPx.some((v,j)=>v < l.rawHorizontalWidthsPx[j]-0.3)));
 assert.ok(result.lanes.every(l=>Math.abs(l.meanMm-10)<.35));
});
test('desplazamiento permitido pero estrechamiento real dispara NOK en la tira afectada',()=>{
 const original=frame(),physical=cal(original),r=recipe();
 const baseline=engine.makeBaseline(engine.evaluate(original,r,physical.calibration,physical.audit),r);
 // One narrow synthetic strip with 32 px width and lateral oscillation.
 const bad=movingFrame(4,-24,.20,32,15);
 const audit=vision.auditCameraFrame(bad,physical.calibration,'camera:demo');
 const out=engine.evaluate(bad,r,physical.calibration,audit,baseline);
 assert.equal(out.status,'NOK');
 assert.ok(out.lanes.every(l=>l.status==='NOK'));
});
test('si la tira oscilante abandona ROI la medida se bloquea, nunca queda OK',()=>{
 const original=frame(),physical=cal(original);
 const out=engine.evaluate(movingFrame(4,140,0,50),recipe(),physical.calibration,
   vision.auditCameraFrame(original,physical.calibration,'camera:demo'));
 assert.equal(out.status,'INVALID');
});

test('montaje ilustrado 3×50 mm, ±2, referencias 100 mm: FOV corto BLOQUEA la falsa calibración',()=>{
  const r=engine.validateRecipe({
    id:'GOMA-3X50-L01',count:3,nominalMm:50,toleranceMm:2,
    referenceMm:100,distanceMm:800,threshold:95,minRunPx:8,
    polarity:'dark',roi:{x:110,y:125,width:1060,height:390}
  });
  // El esquema pone las referencias muy separadas dentro de 1280 px.
  // Con 1000 px /100 mm, cada tira de 50 mm ocuparía 500 px: no caben tres.
  const impossible=engine.assessFieldOfView(r,1000,1280);
  assert.equal(impossible.status,'INVALID');
  assert.match(impossible.reason,/CAMPO VISUAL INSUFICIENTE/);
  assert.ok(impossible.minimumWidthPx>r.roi.width);
  // Al corregir el campo de visión/escala sí es geométricamente posible.
  const possible=engine.assessFieldOfView(r,350,1280);
  assert.equal(possible.status,'POSSIBLE',possible.reason);
  assert.ok(possible.projectedStripPx<180);
  // Precisión también debe verse: tolerancia por debajo de 3px no es aceptable.
  const coarse=engine.assessFieldOfView({...r,referenceMm:1000,nominalMm:2,toleranceMm:.01},50,1280);
  assert.equal(coarse.status,'REVIEW');
});
test('no aceptar ROI fuera de foto ni patrones/escala inventados',()=>{
 const r=recipe(3);
 assert.equal(engine.assessFieldOfView({...r,roi:{x:1100,y:125,width:300,height:390}},1000,1280).status,'INVALID');
 assert.throws(()=>engine.assessFieldOfView(r,0,1280),/Distancia en píxeles/);
});
