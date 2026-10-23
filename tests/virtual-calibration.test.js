/* Node 22 unit/functional lab tests of natural conveyor-edge calibration.
 * Real physical measurement and accredited metrology NOT established here.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const belt=require('../src/virtual-calibration.js');
const strip=require('../src/strip-core.js');
function frame({count=4,left=90,right=1190,extra=0,blank=false,drift=0}={}){
 const width=1280,height=720,data=new Uint8ClampedArray(width*height*4);
 const centers={1:[640],2:[450,830],3:[320,640,960],4:[250,510,770,1030]}[count];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   let r=80,g=90,b=90;
   if(blank||x>=left+drift&&x<right+drift){r=185;g=205;b=205}
   if(!blank&&y>=125&&y<520){
     for(let i=0;i<centers.length;i++){
       let wide=50+(i===Math.min(1,count-1)?extra:0);
       if(x>=centers[i]-wide/2&&x<centers[i]+wide/2){r=25;g=30;b=35}
     }
   }
   const p=(y*width+x)*4;data[p]=r;data[p+1]=g;data[p+2]=b;data[p+3]=255;
 }
 return {width,height,data};
}
const roi={x:120,y:130,width:1030,height:365};
const recipe=count=>strip.validateRecipe({
 id:'GOMA-LAB',count,nominalMm:10,toleranceMm:1.5,
 referenceMm:220,distanceMm:500,threshold:95,minRunPx:8,polarity:'dark',
 calibrationMethod:'belt-edges',roi});
function calibrated(f=frame()){
 const cal=belt.create(f,[{x:90,y:300},{x:1190,y:300}],220,500,'camera:fixed',roi);
 return {cal,audit:belt.audit(f,cal,'camera:fixed')};
}
test('Las líneas virtuales encajan en DOS BORDES FÍSICOS de una cinta de 220 mm',()=>{
 const f=frame(),{cal,audit}=calibrated(f);
 assert.equal(cal.kind,'BELT_EDGES');
 assert.equal(cal.referencePx,1100);
 assert.equal(audit.status,'BELT_EDGES_TRACKED');
 assert.ok(Math.abs(audit.mmPerPixel-.2)<1e-9);
 assert.equal(audit.uncertaintyMm,.4);
});
for(const count of [1,2,3,4]){
 test(count+' tiras medidas independientemente del nominal con escala de cinta',()=>{
  const f=frame({count}),{cal,audit}=calibrated(f);
  const result=strip.evaluate(f,recipe(count),cal,audit);
  assert.equal(result.status,'OK');
  assert.equal(result.lanes.length,count);
  for(const lane of result.lanes)assert.equal(lane.meanMm,10);
  assert.equal(result.auditStatus,'BELT_EDGES_TRACKED');
 });
}
test('Una tira ensanchada da NOK y NO recalibra para disimular el defecto',()=>{
 const f=frame(),{cal}=calibrated(f);
 const bad=frame({extra:25}),audit=belt.audit(bad,cal,'camera:fixed');
 const result=strip.evaluate(bad,recipe(4),cal,audit);
 assert.equal(audit.mmPerPixel,.2);
 assert.equal(result.status,'NOK');
 assert.equal(result.lanes[1].meanMm,15);
});
test('El ancho nominal no permite derivar escala sin cinta medida externamente',()=>{
 const f=frame();
 assert.throws(()=>belt.create(f,[],10,500,'camera:fixed',roi),/dos bordes/i);
 const {cal,audit}=calibrated(f);
 const modified={...recipe(4),nominalMm:14};
 assert.equal(strip.evaluate(f,modified,cal,audit).status,'NOK');
});
test('Si el borde de la cinta desaparece la medición se BLOQUEA',()=>{
 const f=frame(),{cal}=calibrated(f);
 const check=belt.audit(frame({blank:true}),cal,'camera:fixed');
 assert.equal(check.status,'INVALID');
 assert.equal(strip.evaluate(frame({blank:true}),recipe(4),cal,check).status,'INVALID');
});
test('Si se mueve el encuadre, cambia resolución o fuente, bloquea',()=>{
 const f=frame(),{cal}=calibrated(f);
 assert.equal(belt.audit(frame({drift:20}),cal,'camera:fixed').status,'INVALID');
 assert.equal(belt.audit(f,cal,'camera:other').status,'INVALID');
 const changed={...f,width:640};
 assert.equal(belt.audit(changed,cal,'camera:fixed').status,'INVALID');
});
test('Las guías no aceptan referencias invertidas ni a diferentes alturas',()=>{
 const f=frame();
 assert.throws(()=>belt.create(f,[{x:1190,y:300},{x:90,y:300}],220,500,'camera:fixed',roi),/invertidas/);
 assert.throws(()=>belt.create(f,[{x:90,y:100},{x:1190,y:400}],220,500,'camera:fixed',roi),/misma línea/);
});
test('La receta serializa el método sin almacenar una calibración activa',()=>{
 const r=recipe(4),again=strip.validateRecipe(JSON.parse(JSON.stringify(r)));
 assert.equal(again.calibrationMethod,'belt-edges');
 assert.equal(again.referenceMm,220);
 assert.equal(again.imageWidth,undefined);
 assert.equal(strip.validateRecipe({...r,calibrationMethod:undefined}).calibrationMethod,'physical-markers');
});
