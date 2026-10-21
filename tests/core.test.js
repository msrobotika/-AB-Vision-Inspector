/* SPDX-License-Identifier: MIT */
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../src/vision-core.js');
function img(w,h,v=240){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255;}return {width:w,height:h,data};}
function pixel(im,x,y,v){const p=(y*im.width+x)*4;im.data[p]=im.data[p+1]=im.data[p+2]=v;}
const base={mode:'dark',threshold:90,minArea:2,maxDefects:0};
test('detecta dos componentes de 4 pixeles y clasifica NOK',()=>{let im=img(12,10);for(let x=2;x<4;x++)for(let y=2;y<4;y++)pixel(im,x,y,10);for(let x=8;x<10;x++)for(let y=7;y<9;y++)pixel(im,x,y,15);let r=core.inspect(im,base);assert.equal(r.defectCount,2);assert.equal(r.defectPixels,8);assert.equal(r.verdict,'NOK');assert.equal(r.boxes[0].area,4);});
test('ROI restringe analisis y no afecta fuera',()=>{let im=img(12,10);pixel(im,8,8,0);let r=core.inspect(im,{...base,minArea:1},{roi:{x:0,y:0,width:5,height:5}});assert.equal(r.defectCount,0);assert.equal(r.verdict,'OK');});
test('minArea filtra ruido, umbral alto detecta brillo',()=>{let im=img(4,3,5);pixel(im,0,0,255);let r=core.inspect(im,{mode:'light',threshold:200,minArea:2,maxDefects:0});assert.equal(r.candidatePixels,1);assert.equal(r.defectCount,0);});
test('referencia igual no produce diferencias',()=>{let im=img(8,8),ref=img(8,8);let r=core.inspect(im,{mode:'reference',threshold:15,minArea:1,maxDefects:0},{reference:ref});assert.equal(r.defectCount,0);pixel(im,5,4,1);let s=core.inspect(im,{mode:'reference',threshold:15,minArea:1,maxDefects:0},{reference:ref});assert.equal(s.defectCount,1);});
test('configuracion invalida se rechaza',()=>{let im=img(3,3);assert.throws(()=>core.inspect(im,{...base,threshold:-1}),RangeError);assert.throws(()=>core.inspect(im,{...base,mode:'eval'}),RangeError);assert.throws(()=>core.inspect(im,{...base,mode:'reference'},{reference:img(4,4)}),RangeError);});
test('recorte ROI se limita a los bordes',()=>{assert.deepEqual(core.clampRect({x:-5,y:-4,width:25,height:20},12,10),{x:0,y:0,width:12,height:10});});
test('cuatro vecinos no unen diagonales',()=>{let im=img(4,4);pixel(im,1,1,0);pixel(im,2,2,0);let r=core.inspect(im,{...base,minArea:1});assert.equal(r.defectCount,2);});
test('limite de imagen impide agotamiento',()=>{let im={width:4000,height:4000,data:new Uint8ClampedArray(0)};assert.throws(()=>core.inspect(im,base),RangeError);});

test('segmenta pieza rectangular clara y mide en mm mediante patron independiente',()=>{
  const im=img(80,60,30);
  for(let y=10;y<40;y++)for(let x=15;x<65;x++)pixel(im,x,y,220);
  const piece=core.measurePiece(im,{threshold:130,minPixels:100});
  assert.deepEqual({x:piece.x,y:piece.y,width:piece.width,height:piece.height},
    {x:15,y:10,width:50,height:30});
  const calibration={referenceMm:10,referencePixels:25,workingDistanceMm:500,imageWidth:80,imageHeight:60};
  const nominal={widthMm:20,heightMm:12,toleranceMm:.5,currentDistanceMm:500};
  const result=core.evaluateMeasurement(piece,calibration,nominal,80,60);
  assert.equal(result.status,'OK');assert.equal(result.measuredWidthMm,20);assert.equal(result.measuredHeightMm,12);
  assert.equal(core.evaluateMeasurement(piece,calibration,{...nominal,widthMm:22},80,60).status,'NOK');
});
test('no emite OK con calibracion obsoleta, cambio distancia o pieza truncada',()=>{
  const cal={referenceMm:10,referencePixels:20,workingDistanceMm:500,imageWidth:80,imageHeight:60};
  const nominal={widthMm:10,heightMm:10,toleranceMm:1,currentDistanceMm:511};
  const box={x:1,y:1,width:20,height:20,area:400,touchesBorder:false};
  assert.equal(core.evaluateMeasurement(box,cal,nominal,80,60).status,'INVALID');
  assert.throws(()=>core.evaluateMeasurement(box,cal,{...nominal,currentDistanceMm:500},81,60),/Resolución/);
  assert.equal(core.evaluateMeasurement({...box,touchesBorder:true},cal,{...nominal,currentDistanceMm:500},80,60).status,'INVALID');
  assert.equal(core.evaluateMeasurement(null,cal,{...nominal,currentDistanceMm:500},80,60).status,'NO_PIECE');
});
test('rechaza medidas fisicas falsas y patron de longitud cero',()=>{
  assert.throws(()=>core.validateCalibration({referenceMm:0,referencePixels:10,workingDistanceMm:200,imageWidth:80,imageHeight:60},80,60));
  const cal={referenceMm:10,referencePixels:20,workingDistanceMm:500,imageWidth:80,imageHeight:60};
  const box={x:2,y:2,width:20,height:20,area:400,touchesBorder:false};
  assert.throws(()=>core.evaluateMeasurement(box,cal,{widthMm:0,heightMm:10,toleranceMm:1,currentDistanceMm:500},80,60));
});
function colorCircle(image,cx,cy,r,color){
  const rgb=color==='cyan'?[20,234,218]:[245,35,207];
  for(let y=Math.max(0,cy-r);y<=Math.min(image.height-1,cy+r);y++)for(let x=Math.max(0,cx-r);x<=Math.min(image.width-1,cx+r);x++){
    if((x-cx)**2+(y-cy)**2<=r*r){const k=4*(y*image.width+x);image.data.set(rgb,k);}
  }
}
const metSource='ip:http|192.168.1.50|80|/snapshot.jpg|300x160';
function auditedFrame(cx=30,cy=32,mx=240,my=32){const image=img(300,160,45);
  colorCircle(image,cx,cy,6,'cyan');colorCircle(image,mx,my,6,'magenta');return image;
}
test('calibración depende de marcas físicas cian/magenta y fuente de cámara',()=>{
  const frame=auditedFrame();
  assert.throws(()=>core.createAuditedCalibration(frame,[{x:30,y:32},{x:240,y:32}],0,500,metSource),/Patrón/);
  assert.throws(()=>core.createAuditedCalibration(img(300,160),[{x:30,y:32},{x:240,y:32}],100,500,metSource),/marcas/);
  const cal=core.createAuditedCalibration(frame,[{x:30,y:32},{x:240,y:32}],105,500,metSource);
  assert.equal(cal.auditRequired,true);assert.equal(cal.referencePixels,210);
  const audit=core.auditCameraFrame(frame,cal,metSource);
  assert.equal(audit.status,'VERIFIED');assert.equal(audit.mmPerPixel,.5);
  assert.equal(core.auditCameraFrame(frame,cal,'ip:http|192.168.1.51|80|/snapshot.jpg|300x160').status,'INVALID');
  assert.equal(core.auditCameraFrame(img(310,160),cal,metSource).status,'INVALID');
});
test('cada fotograma falla cerrado si se pierden marcas o deriva la escala',()=>{
  const cal=core.createAuditedCalibration(auditedFrame(),[{x:30,y:32},{x:240,y:32}],105,500,metSource);
  assert.equal(core.auditCameraFrame(auditedFrame(30,32,246,32),cal,metSource).status,'INVALID');
  assert.equal(core.auditCameraFrame(auditedFrame(30,32,240,42),cal,metSource).status,'INVALID');
  assert.equal(core.auditCameraFrame(img(300,160),cal,metSource).status,'INVALID');
  assert.equal(core.auditCameraFrame(auditedFrame(32,32,242,32),cal,metSource).status,'VERIFIED');
});
test('tolerancias próximas al error de pixel se declaran indeterminadas, no OK',()=>{
  const frame=auditedFrame();const cal=core.createAuditedCalibration(frame,[{x:30,y:32},{x:240,y:32}],105,500,metSource);
  const box={x:75,y:55,width:100,height:60,area:6000,touchesBorder:false};
  const nominal={widthMm:50,heightMm:30,toleranceMm:1,currentDistanceMm:500};
  const audit=core.auditCameraFrame(frame,cal,metSource);
  assert.equal(core.evaluateMeasurement(box,cal,nominal,300,160).status,'INVALID');
  assert.equal(core.evaluateMeasurement(box,cal,nominal,300,160,audit).status,'INDETERMINADO');
  assert.equal(core.evaluateMeasurement(box,cal,{...nominal,toleranceMm:2},300,160,audit).status,'OK');
  assert.equal(core.evaluateMeasurement(box,cal,{...nominal,widthMm:55,toleranceMm:2},300,160,audit).status,'NOK');
});
