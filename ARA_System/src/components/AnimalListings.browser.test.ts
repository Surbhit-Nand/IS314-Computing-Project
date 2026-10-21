import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { createServer, transformWithOxc } from "vite";

// Real listing/client/React interactions, isolated from authentication, Gemini
// and the database. Uses the existing project's Chromium + Vite test approach.
const browser = process.env.ANIMAL_TEST_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
test("AnimalListings spelling suggestion, acceptance, reset, ordering and stale responses in Chromium", {
  skip: !existsSync(browser) ? "Set ANIMAL_TEST_BROWSER to a Chromium executable" : false,
  timeout: 60000,
}, async () => {
  const profile = await mkdtemp(join(tmpdir(), "ara-animal-search-test-"));
  const vite = await createServer({
    configFile: false, root: resolve("."), cacheDir: join(profile, "vite-cache"),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [{
      name: "isolated-animal-search-test",
      enforce: "pre",
      resolveId(id) {
        if (id === "/animal-search-test.tsx") return "\0animal-search-test.tsx";
        if (id === "./SiteHeader" || id.replaceAll("\\", "/").endsWith("/SiteHeader.tsx")) return "\0test-header";
      },
      async load(id) {
        if (id === "\0test-header") return "export const SiteHeader = () => null;";
        if (id === "\0animal-search-test.tsx") return (await transformWithOxc(harness, "animal-search-test.tsx")).code;
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("content-type", "text/html");
          response.end('<div id="root"></div><script type="module" src="/animal-search-test.tsx"></script>');
        });
      },
    }],
  });
  let chrome: ReturnType<typeof spawn> | undefined;
  let socket: WebSocket | undefined;
  try {
    await vite.listen();
    const address = vite.httpServer!.address();
    assert(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/`;
    chrome = spawn(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, origin], { windowsHide: true, stdio: "ignore" });
    let port = "";
    for (let i = 0; i < 100 && !port; i++) {
      try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
      catch { await new Promise((done) => setTimeout(done, 100)); }
    }
    assert(port, "Chromium debugging port available");
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; url: string; webSocketDebuggerUrl: string }[];
    const page = tabs.find((tab) => tab.type === "page" && tab.url.startsWith(origin));
    assert(page);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { socket!.onopen = () => done(); socket!.onerror = reject; });
    let sequence = 0;
    const pending = new Map<number, (value: { result?: { value?: unknown } }) => void>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) { pending.get(message.id)?.(message.result); pending.delete(message.id); }
    };
    const evaluate = (expression: string) => new Promise<{ result?: { value?: unknown } }>((done) => {
      const id = ++sequence; pending.set(id, done);
      socket!.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    });
    let result: unknown;
    for (let i = 0; i < 250; i++) {
      result = (await evaluate("window.__animalSearchResult")).result?.value;
      if (result) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!result) console.error(await evaluate("document.documentElement.outerHTML"));
    assert.deepEqual(result, { ok: true });
  } finally {
    socket?.close(); chrome?.kill(); await vite.close();
    assert(resolve(profile).startsWith(resolve(tmpdir()) + sep + "ara-animal-search-test-"));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

const harness = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AnimalListings} from '/src/components/AnimalListings.tsx';
const typo='small energetic vuddly bog', corrected='small energetic cuddly dog';
const animals=['Charlie','Buddy','Milo'].map(name=>({id:name,name,type:'dog',breed:'Terrier',size:'small',gender:'Male',colour:'Brown',estimatedAge:'2 Years',behaviour:name==='Milo'?'Energetic and cuddly':name==='Buddy'?'Energetic':'',description:'A companion',photoUrls:[],vaccinationStatus:'vaccinated',status:'medically_cleared',medicallyCleared:true}));
let mode='normal', release, searches=[];
const originalFetch=window.fetch.bind(window);
window.fetch=async(url,options)=>{
 const path=new URL(String(url),location.href).pathname;
 if(path==='/api/animals')return Response.json(animals);
 if(path==='/api/animals/ai-search'){
  const query=JSON.parse(options.body).query;searches.push(query);
  if(mode==='delayed')await new Promise(resolve=>{release=resolve;});
  if(mode==='error')return Response.json({error:'AI search unavailable'},{status:503});
  return Response.json({results:query==='nothing'?[]:['Milo','Buddy','Charlie'],...(query===typo?{didYouMean:corrected}:{})});
 }
 if(new URL(String(url),location.href).origin!==location.origin)throw Error('External request blocked');
 return originalFetch(url,options);
};
createRoot(document.getElementById('root')).render(<AnimalListings isLoaded={true} isSignedIn={false} currentPage="animal-listings" onNavigate={()=>{}} onViewAnimal={()=>{}}/>);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const wait=async(predicate,message)=>{for(let i=0;i<150;i++){if(predicate())return;await tick();}throw Error(message);};
const input=()=>document.getElementById('catalog-search');
const suggestion=()=>document.querySelector('.catalog-spelling-link');
const cards=()=>[...document.querySelectorAll('.pet-card h3')].map(el=>el.textContent).join(',');
const setText=async(text)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input(),text);input().dispatchEvent(new Event('input',{bubbles:true}));await tick();};
const submit=()=>document.querySelector('form.catalog-search').requestSubmit();
const done=()=>!document.querySelector('form.catalog-search button[type=submit]').disabled;
const search=async(text)=>{await setText(text);submit();await wait(done,'Search never completed');await tick();};
async function run(){
 await wait(()=>cards()==='Charlie,Buddy,Milo','Initial animals missing');check(!suggestion(),'Suggestion shown initially');
 await search(typo);await wait(suggestion,'Suggestion missing');
 check(suggestion().textContent===corrected,'Incorrect suggestion');check(input().value===typo,'Original query overwritten');
 check(document.querySelector('.catalog-spelling-suggestion').textContent.includes('Did you mean:'),'Suggestion label missing');
 check(cards()==='Milo,Buddy,Charlie','Backend ranking lost');
 suggestion().click();await wait(()=>searches.length===2&&done(),'Accept did not search');await tick();
 check(input().value===corrected&&searches[1]===corrected,'Accept did not update input or query');check(!suggestion(),'Accepted suggestion persisted');
 await search(typo);await wait(suggestion,'Second suggestion missing');
 await setText('unrelated');check(!suggestion(),'Editing did not remove suggestion');
 await search(typo);await wait(suggestion,'Third suggestion missing');
 [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Clear all').click();await tick();
 check(!suggestion()&&input().value===''&&cards()==='Charlie,Buddy,Milo','Clear all failed');
 await search(typo);await wait(suggestion,'Suggestion missing before empty reset');await setText('');check(!suggestion(),'Empty query did not reset suggestion');
 await search(corrected);check(!suggestion(),'Correct query shows suggestion');
 await search('nothing');check(cards()===''&&document.body.textContent.includes('No animals available match'),'No-match behavior broken');
 mode='delayed';await setText(typo);submit();await wait(()=>release,'Pending search not started');
 await setText('a later query');release();await tick();await tick();check(!suggestion(),'Stale response restored suggestion');
 mode='normal';await search(typo);await wait(suggestion,'Suggestion missing before sidebar filter');
 const calm=[...document.querySelectorAll('label.filter-option')].find(el=>el.textContent.trim()==='Calm');calm.querySelector('input').click();await tick();check(cards()==='','Sidebar did not narrow ranked results');
 [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Clear all').click();await tick();
 mode='error';await search(typo);check(!suggestion()&&cards()==='Charlie,Buddy,Milo','Provider failure did not restore listing');
 return {ok:true};
}
run().then(result=>window.__animalSearchResult=result).catch(error=>window.__animalSearchResult={error:error.message});
`;
