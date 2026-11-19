// Run with NODE_PATH pointing at a Playwright installation. No router RPC is used.
const fs=require('fs'), path=require('path'), assert=require('assert/strict');
const {chromium}=require('playwright');
const app=path.resolve(__dirname,'..'), luci=path.resolve(app,'../..');
const resource=app+'/htdocs/luci-static/resources';
const names=['overview_v11','bands_v4','accel_v2','network_v6','sms_v6','terminal_v6'];
const themes={argon:'argon/css/cascade.css','argon-dark':'argon/css/cascade.css',bootstrap:'bootstrap/cascade.css',material:'material/cascade.css'};
const out=process.env.AIR6_TEST_OUTPUT || '/tmp/air6-ui-results';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const results=[];
 for(const [theme,cssPath] of Object.entries(themes)) for(const width of [360,390,768,1280,1440]) for(const name of names){
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:theme==='argon-dark'?'dark':'light'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html><head><meta charset="utf-8"></head><body><main id="view" style="padding:12px"></main></body></html>');
  await page.addStyleTag({content:fs.readFileSync(`${luci}/themes/luci-theme-${theme.replace('-dark','')}/htdocs/luci-static/${cssPath}`,'utf8')});
  await page.evaluate(async ({source,helper})=>{
   window._=x=>x;String.prototype.format=function(...args){let i=0;return this.replace(/%[sd]/g,()=>args[i++]);};
   window.L={url:(...a)=>'/cgi-bin/luci/'+a.join('/')};
   window.E=(tag,attrs={},children=[])=>{const e=['svg','circle','defs','linearGradient','stop'].includes(tag)?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);for(const [k,v] of Object.entries(attrs))if(v!=null){if(typeof v==='function')e.addEventListener(k,v);else e.setAttribute(k,v);}const append=c=>Array.isArray(c)?c.forEach(append):c!=null&&e.append(c instanceof Node?c:String(c));append(children);return e;};
   window.calls=[];window.pollers=[];
   const status={operator:'46001',registration:'registered (home)',rat:'NR5G',band:'n78',signal:{RSRP:-92,RSRQ:-11,SINR:18},network:{up:true,l3_device:'ccmni2',uptime:1234,route:[]}};
   const fixtures={get_status:status,get_cells:{serving:{output:'OK'},engineering:{output:'OK'}},getNetworkDevices:{},get_network:{status:'{"up":true}',config:'fixture only'},get_accel_stats:{hnat:{available:true,ppe0_bind:0,ppe1_bind:0},interfaces:[{name:'ccmni2',rx_bytes:100,tx_bytes:50}]},list_sms:{output:'+CMGL: 1,"REC READ","TEST","","2026-11-17"\n4F60597D'},get_smsc:{output:'+CSCA: "TEST"'}};
   const rpc={declare:spec=>(...args)=>{calls.push([spec.method,args]);return Promise.resolve(fixtures[spec.method]||{code:0,output:'TARGET=FACTORY LICENSE=INVALID\nOK'});}};
   const ui={addNotification:()=>{},createHandlerFn:(self,fn,...args)=>async ev=>{ev.currentTarget.disabled=true;try{return await(typeof fn==='function'?fn.apply(self,[...args,ev]):self[fn](...args,ev));}finally{ev.currentTarget.disabled=false;}}};
   const extend={extend:x=>x};const common=new Function('baseclass','ui','i18n',helper)(extend,ui,{install:()=>{}});
   window.appView=new Function('view','rpc','poll','ui','common',source)(extend,rpc,{add:fn=>pollers.push(fn)},ui,common);
   const data=appView.load?await appView.load():undefined;document.querySelector('#view').append(appView.render(data));
   await new Promise(requestAnimationFrame);await new Promise(r=>setTimeout(r,20));for(const fn of pollers)await fn();
  },{source:fs.readFileSync(`${resource}/view/air6modem/${name}.js`,'utf8'),helper:fs.readFileSync(`${resource}/air6modem/common_v3.js`,'utf8')});
  const links=await page.locator('.cbi-tabmenu a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  assert.deepEqual(links,['overview','bands','accel','network','sms','terminal'].map(k=>'/cgi-bin/luci/admin/air6modem/'+k));
  assert.equal(await page.locator('[aria-current="page"]').count(),1);
  assert.deepEqual(errors,[],`${theme} ${width} ${name}`);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  assert.equal(overflow,false,`page overflow ${theme} ${width} ${name}`);
  if(name.startsWith('terminal')){
   await page.evaluate(async()=>{calls.length=0;await Promise.all([appView.run('AT'),appView.run('AT')]);});
   assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='run_at').length),1,'AT repeated submission');
  }
  await page.screenshot({path:`${out}/${theme}-${width}-${name}.png`,fullPage:true});
  results.push({theme,width,page:name,navigation:true,render:true,noOverflow:true});await page.close();
 }
 await browser.close();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(`PASS ${results.length} page/theme/viewport renders, navigation, polling and AT concurrency`);
})().catch(e=>{console.error(e);process.exit(1)});
