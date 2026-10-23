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
