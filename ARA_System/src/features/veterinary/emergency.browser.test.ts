import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { createServer, transformWithOxc } from "vite";
import type { Request, Response } from "express";
import type { MedicalQueueAnimal } from "../../types/veterinary";

// Real React interactions and coordination SQL on an isolated PostgreSQL database.
// Never start the project API or connect to its database in this test.
const browser = process.env.EMERGENCY_TEST_BROWSER ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

test("Medical Queue Attend, assistance notification, handoff and support in Chromium", {
  skip: !existsSync(browser) ? "Set EMERGENCY_TEST_BROWSER to a Chromium executable" : false,
  timeout: 60000,
}, async () => {
  process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
  const [{default: express}, {PGlite}, emergency, {createEmergencyStore}, {createEmergencyRouter}, alerts] = await Promise.all([
    import("express"), import("@electric-sql/pglite"), import("../../../server/src/modules/veterinary/emergency.service.js"),
    import("../../../server/src/modules/veterinary/emergency.repository.js"), import("../../../server/src/modules/veterinary/emergency.routes.js"),
    import("../../../server/src/modules/notifications/veterinaryAlerts.service.js"),
  ]);
  const isolatedDb = new PGlite();
  await isolatedDb.exec(`CREATE TABLE animals(id uuid PRIMARY KEY,name text,public_id text,deleted_at timestamptz,status text DEFAULT 'intake',veterinary_priority text DEFAULT 'critical',medically_cleared boolean DEFAULT false);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_clerk_user_id text NOT NULL,action text NOT NULL,entity_type text NOT NULL,entity_id text NOT NULL,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_clerk_user_id text NOT NULL,type text NOT NULL,title text NOT NULL,body text,entity_type text,entity_id text,read_at timestamptz,created_at timestamptz DEFAULT now());`);
  await isolatedDb.exec(await readFile(resolve("server/src/db/migrations/0020_veterinary_emergency_responses.sql"), "utf8"));
  const transaction: import("../../../server/src/modules/veterinary/emergency.repository.js").EmergencyTransaction =
    (work) => isolatedDb.transaction((tx) => work(createEmergencyStore((text, values) => tx.query(text, values))));
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const animals: MedicalQueueAnimal[] = ids.map((id,index) => ({id,name:index ? "Bella" : "Max",publicId:index ? "SPCA-BELLA" : "SPCA-MAX",type:"dog",breed:null,rescueDate:null,status:"intake",veterinaryStatus:index ? "treatment_required" : "needs_initial_examination",medicallyCleared:false,veterinaryPriority:"critical"}));
  animals.unshift({ ...animals[0], id: "33333333-3333-4333-8333-333333333333", name: "Routine queue case", publicId: "SPCA-HIGH", veterinaryPriority: "high" });
  for (const animal of animals) await isolatedDb.query("INSERT INTO animals(id,name,public_id,veterinary_priority) VALUES ($1,$2,$3,$4)", [animal.id,animal.name,animal.publicId,animal.veterinaryPriority]);
  const api=express(); api.use(express.json());
  let coordinationWrites=0;
  api.get("/__coordination-count",(_request,response)=>response.json({count:coordinationWrites}));
  const user=(authorization?:string) => authorization === "Bearer vet-b" ? "vet-b" : "vet-a";
  api.get("/__fixtures", (_request,response)=>response.json(animals));
  api.get("/api/notifications/mine", async(request,response)=> {
    const items=(await isolatedDb.query<{readAt:Date|null}>(`SELECT id,type,title,body,entity_type AS "entityType",entity_id AS "entityId",read_at AS "readAt",created_at AS "createdAt" FROM notifications WHERE recipient_clerk_user_id=$1 ORDER BY created_at DESC`,[user(request.header("authorization"))])).rows;
    response.json({items,unreadCount:items.filter(item=>!item.readAt).length});
  });
  api.patch("/api/notifications/:id/read",async(request,response)=> {
    await isolatedDb.query("UPDATE notifications SET read_at=now() WHERE id=$1 AND recipient_clerk_user_id=$2",[request.params.id,user(request.header("authorization"))]);response.json({ok:true});
  });
  api.use("/api/veterinary/emergency-responses",createEmergencyRouter({
    authenticate:(request,response,next)=> { if(!["Bearer vet-a","Bearer vet-b"].includes(request.header("authorization")??"")){response.sendStatus(401);return;}request.clerkUserId=user(request.header("authorization"));next(); },
    authorize:(_request,_response,next)=>next(),
    coordinate:async(id,action,actor)=> {
      coordinationWrites++;
      const result=await emergency.coordinateEmergencyWithAssistance(id,action,actor,{transaction,recipients:async()=>["vet-a","vet-b"],name:async(id)=>id==="vet-a"?"Dr Maya":"Dr Ravi"});
      await isolatedDb.transaction(tx=>alerts.synchronizeVeterinaryAlerts((text,values)=>tx.query(text,values),["vet-a","vet-b"]));
      return result;
    },
    list:()=>emergency.getEmergencyResponses({list:()=>transaction(async(store)=>(await Promise.all(ids.map(id=>store.openResponse(id)))).filter((item):item is NonNullable<typeof item>=>Boolean(item))),resolveNames:async()=>new Map([["vet-a","Dr Maya"],["vet-b","Dr Ravi"]])}),
  }));
  api.use("/api",(_request,response)=>response.status(404).json({error:"Unexpected test API route"}));
  const vite = await createServer({
    configFile: false,
    root: resolve("."),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [{
      name: "isolated-emergency-test",
      resolveId(id) { if (id === "/emergency-test.tsx") return "\0emergency-test.tsx"; },
      async load(id) { if (id === "\0emergency-test.tsx") return (await transformWithOxc(harness, "emergency-test.tsx")).code; },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/") {
            response.setHeader("content-type", "text/html");
            response.end('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/emergency-test.tsx"></script>');
          } else if (request.url?.startsWith("/api/") || request.url?.startsWith("/__")) {
            api(request as Request, response as Response, next);
          } else next();
        });
      },
    }],
  });
  const profile = await mkdtemp(join(tmpdir(), "ara-emergency-test-"));
  let chrome: ReturnType<typeof spawn> | undefined;
  let socket: WebSocket | undefined;
  try {
    await vite.listen();
    const address = vite.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/`;
    const pageCheck = await fetch(origin);
    assert.equal(pageCheck.status, 200);
    chrome = spawn(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, origin], { windowsHide: true, stdio: "ignore" });
    let port = "";
    for (let i = 0; i < 100 && !port; i++) {
      try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { await new Promise((done) => setTimeout(done, 100)); }
    }
    assert.ok(port, "Chromium debugging port is available");
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; url: string; webSocketDebuggerUrl: string }[];
    const page = tabs.find((tab) => tab.type === "page" && tab.url.startsWith(origin));
    assert.ok(page, "Isolated test page is open in Chromium");
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { socket!.onopen = () => done(); socket!.onerror = reject; });
    let sequence = 0;
    const pending = new Map<number, (result: { result?: { value?: unknown }; exceptionDetails?: unknown }) => void>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.exceptionThrown") console.error("Browser exception:", JSON.stringify(message.params));
      if (message.method === "Network.loadingFailed") console.error("Browser request failed:", JSON.stringify(message.params));
      if (message.id) { pending.get(message.id)?.(message.result); pending.delete(message.id); }
    };
    const command = (method: string, params: object) => new Promise<{ result?: { value?: unknown }; exceptionDetails?: unknown }>((done) => {
      const id = ++sequence; pending.set(id, done); socket!.send(JSON.stringify({ id, method, params }));
    });
    await command("Runtime.enable", {});
    await command("Network.enable", {});
    let result: unknown;
    for (let i = 0; i < 200; i++) {
      const response = await command("Runtime.evaluate", { expression: "window.__emergencyResult", returnByValue: true });
      result = response.result?.value;
      if (result) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!result) console.error("Browser state:", await command("Runtime.evaluate", { expression: "location.href+' '+document.documentElement.outerHTML", returnByValue: true }));
    assert.deepEqual(result, { ok: true, coordinated: true, notified: true });
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const desktop = await command("Runtime.evaluate", { expression: "getComputedStyle(document.querySelector('.vm-queue-table .vm-table-row')).gridTemplateColumns.split(' ').length", returnByValue: true });
    assert.equal(desktop.result?.value, 4, "Desktop queue has four aligned columns");
    await command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    const mobile = await command("Runtime.evaluate", { expression: "getComputedStyle(document.querySelector('.vm-queue-table .vm-table-row:not(.vm-table-head)')).gridTemplateColumns.split(' ').length", returnByValue: true });
    assert.equal(mobile.result?.value, 2, "Mobile queue stacks animal and actions across the row");
  } finally {
    socket?.close(); chrome?.kill(); await vite.close(); await isolatedDb.close();
    assert.ok(resolve(profile).startsWith(resolve(tmpdir()) + sep + "ara-emergency-test-"));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

const harness = `
import '/src/index.css';
import '/src/features/veterinary/veterinary.css';
import '/src/features/veterinary/veterinary-minimal.css';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {VeterinaryDashboardPage} from '/src/features/veterinary/pages/VeterinaryDashboardPage.tsx';
import {NotificationBell} from '/src/components/NotificationBell.tsx';
import {openVeterinaryEmergencyQueue} from '/src/utils/veterinaryEmergencyFocus.ts';
const originalFetch=window.fetch.bind(window);
window.fetch=(url,options)=>{const parsed=new URL(String(url),location.href);if(parsed.pathname.startsWith('/api/'))return originalFetch(parsed.pathname+parsed.search,options);if(parsed.origin!==location.origin)throw Error('External request blocked');return originalFetch(url,options);};
let currentVet='vet-a';const getToken=async()=>currentVet;
function App(){const[queue,setQueue]=useState([]),[responses,setResponses]=useState([]),[vet,setVet]=useState('vet-a');window.__loadQueue=setQueue;window.__switchVet=id=>{currentVet=id;setVet(id);};const refresh=async()=>{const r=await window.fetch('/api/veterinary/emergency-responses',{headers:{Authorization:'Bearer '+currentVet}});setResponses(await r.json());};window.__refresh=refresh;return <main className="vm-page"><header className="vm-header"><NotificationBell key={vet} isLoaded={true} isSignedIn={true} getToken={getToken} isVeterinarian={true} onOpen={entity=>{if(entity==='veterinary_emergency_alert')openVeterinaryEmergencyQueue(view=>window.__destination=view);}}/></header><VeterinaryDashboardPage queue={queue} emergencyResponses={responses} coordinationUnavailable={false} currentVetId={vet} onCoordinationChanged={refresh} stats={null} appointments={[]} loading={false} error="" onSelectAnimal={id=>window.__selected=id} onSelectAppointment={()=>{}} onBookAppointment={()=>{}} getToken={getToken}/></main>;}
createRoot(document.getElementById('root')).render(<App/>);
const check=(value,message)=>{if(!value)throw Error(message);};
const wait=async(predicate,message)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error(message);};
const rows=()=>[...document.querySelectorAll('.vm-queue-table > .vm-table-row')].slice(1);
const click=(index,text)=>{const b=[...rows()[index].querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);check(b,'Missing action '+text);b.click();};
const inputText=(el,value)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};
async function run(){
 const fixtures=await(await originalFetch('/__fixtures')).json();window.__loadQueue(fixtures);await window.__refresh();
 await wait(()=>rows().length===3,'Critical animals missing');check([...document.querySelectorAll('.vm-queue-table .vm-th')].map(el=>el.textContent).join(',')==='Animal,Priority,Care Stage,Actions','Queue does not have the four requested columns');check(rows().every(row=>row.children.length===4),'Queue row column count differs from header');check(rows()[0].querySelector('.vm-animal-cell .vm-queue-attendance'),'Attendance is not beneath animal name');check(rows()[0].querySelector('.vm-priority-cell').children.length===1,'Priority column contains extra controls');check(rows()[0].querySelector('.vm-td-actions button').textContent==='Run assessment','Medical action is outside Actions');check(![...document.querySelectorAll('.vm-queue-table button')].some(b=>b.textContent.trim()==='Attend'),'Redundant Attend button remains');check(rows().slice(0,2).every(r=>r.textContent.includes('Awaiting veterinarian')),'Unattended state missing');
 check(!document.body.textContent.includes('Rapid Triage')&&!document.body.textContent.includes('Compare Critical Cases'),'Removed workflow still visible');
 check(rows()[0].textContent.includes('Max')&&rows()[1].textContent.includes('Bella')&&rows()[2].textContent.includes('High'),'Critical animals not sorted before High');
 click(0,'Run assessment');await wait(()=>rows()[0].querySelector('form[aria-label="Begin care for Max"]'),'Begin-care confirmation missing');
 check(!window.__selected,'Opened medical page before confirmation');check((await(await originalFetch('/__coordination-count')).json()).count===0,'Opening confirmation assigned ownership');
 click(0,'Cancel');await wait(()=>!rows()[0].querySelector('form'),'Cancel did not close confirmation');
 check((await(await originalFetch('/__coordination-count')).json()).count===0,'Cancelling care assigned ownership');
 click(0,'Run assessment');await wait(()=>rows()[0].querySelector('form'),'Second confirmation missing');click(0,'Confirm begin care');await wait(()=>rows()[0].textContent.includes('Dr Maya')&&rows()[0].querySelector('.vm-response-delivery')?.getAttribute('title')?.includes('Assistance alert sent'),'Attendance or delivery receipt missing');await wait(()=>window.__selected===fixtures[1].id,'Confirmed assignment did not open medical workflow');
 check(rows()[1].textContent.includes('Awaiting veterinarian')&&rows()[1].classList.contains('vm-awaiting-critical'),'Remaining Critical case not highlighted');
 check(rows().length===3&&rows().slice(0,2).every(r=>r.textContent.includes('Critical')),'Claim hid or downgraded other animals');
 window.__switchVet('vet-b');await new Promise(r=>setTimeout(r,40));document.querySelector('.notification-bell').click();
 await wait(()=>document.querySelector('.notification-item.immediate-alert'),'Other vet did not receive emergency notification');
 const alert=document.querySelector('.notification-item.immediate-alert');check(alert.textContent.includes('Bella')&&alert.textContent.includes('SPCA-BELLA'),'Notification omitted remaining animal identity');
 check(alert.textContent.includes('Dr Maya'),'Attending veterinarian missing');alert.click();
 await wait(()=>window.__destination==='veterinary-dashboard'&&document.activeElement.id==='veterinary-medical-queue','Notification did not open Medical Queue');
 window.__selected=null;click(1,'Advance treatment');await wait(()=>rows()[1].querySelector('form[aria-label="Begin care for Bella"]'),'Treatment confirmation missing');check(window.__selected===null,'Treatment opened before confirmation');click(1,'Confirm begin care');await wait(()=>rows()[1].textContent.includes('Dr Ravi'),'Second veterinarian could not attend');
 const inbox=await(await window.fetch('/api/notifications/mine',{headers:{Authorization:'Bearer vet-b'}})).json();check(!inbox.items.some(item=>item.type==='veterinary.emergency.assistance'),'Unattended alert remained after both vets attended');
 click(1,'Care options for Bella');await wait(()=>rows()[1].querySelector('.vm-response-context-menu'),'Support menu did not open');click(1,'Request Support');await wait(()=>rows()[1].querySelector('textarea'),'Support form missing');inputText(rows()[1].querySelector('textarea'),'Additional assistance requested');rows()[1].querySelector('input[type=checkbox]').click();await new Promise(r=>setTimeout(r,30));click(1,'Save support');await wait(()=>rows()[1].querySelector('[title="Support required"]')&&!rows()[1].querySelector('form'),'Support did not persist');
 click(0,'Care options for Max');await wait(()=>rows()[0].querySelector('.vm-response-context-menu'),'Takeover menu did not open');click(0,'Take over');await wait(()=>rows()[0].querySelector('textarea'),'Handoff missing');inputText(rows()[0].querySelector('textarea'),'Agreed handoff from Maya to Ravi');rows()[0].querySelector('input[type=checkbox]').click();await new Promise(r=>setTimeout(r,30));click(0,'Confirm takeover');await wait(()=>rows()[0].textContent.includes('Dr Ravi')&&!rows()[0].querySelector('form'),'Handoff failed');
 click(0,'Care options for Max');await wait(()=>rows()[0].querySelector('.vm-response-context-menu'),'Release menu did not open');click(0,'Release');await wait(()=>rows()[0].textContent.includes('Awaiting veterinarian'),'Release ended episode or failed');
 window.__selected=null;click(0,'Run assessment');await wait(()=>rows()[0].querySelector('form[aria-label="Begin care for Max"]'),'Reclaimed-care confirmation missing');
 const current=(await(await window.fetch('/api/veterinary/emergency-responses',{headers:{Authorization:'Bearer vet-b'}})).json()).find(r=>r.animalId===fixtures[1].id);
 const competing=await window.fetch('/api/veterinary/emergency-responses/'+fixtures[1].id,{method:'POST',headers:{Authorization:'Bearer vet-a','Content-Type':'application/json'},body:JSON.stringify({action:'attend',responseId:current.id,version:current.version})});check(competing.ok,'Concurrent claim fixture failed');
 await window.__refresh();await wait(()=>rows()[0].textContent.includes('Dr Maya'),'Ownership refresh missing');click(0,'Confirm begin care');await wait(()=>rows()[0].querySelector('[role=alert]'),'Stale begin-care claim was not rejected');check(window.__selected===null,'Conflict opened medical workflow');check(rows()[0].textContent.includes('Dr Maya'),'Conflict silently reassigned ownership');click(0,'Cancel');
 const writes=(await(await originalFetch('/__coordination-count')).json()).count;
 click(0,'Run assessment');check(window.__selected===fixtures[1].id,'Assigned-animal workflow action broken');await new Promise(r=>setTimeout(r,40));check((await(await originalFetch('/__coordination-count')).json()).count===writes,'Opening an assigned animal rewrote ownership');
 const before=(await(await window.fetch('/api/notifications/mine',{headers:{Authorization:'Bearer vet-b'}})).json()).items.length;await window.__refresh();await window.__refresh();const after=(await(await window.fetch('/api/notifications/mine',{headers:{Authorization:'Bearer vet-b'}})).json()).items.length;check(before===after,'Polling duplicated alerts');
 return {ok:true,coordinated:true,notified:true};
}
run().then(result=>window.__emergencyResult=result).catch(error=>window.__emergencyResult={error:error.message});
`;
