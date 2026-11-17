// Exercise the built application, real IPC and project files with isolated user data.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'oms-studio-test-'));
await mkdir(join(temp, 'user-data'));
await writeFile(join(temp, 'user-data/settings.json'), JSON.stringify({ providers: [], active: null, workspace: join(temp, 'projects'), preferences: { language: 'zh-CN', theme: 'light' } }));
await writeFile(join(temp, 'runner.cjs'), `
const { app, BrowserWindow, webContents } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const temp = ${JSON.stringify(temp)};
app.setPath('userData', path.join(temp, 'user-data'));
app.setAppPath(${JSON.stringify(desktop)});
// Keep the real application's native windows out of the user's way.
app.on('browser-window-created', (_, win) => { win.show = () => {}; win.focus = () => {}; win.webContents.setBackgroundThrottling(false); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) { for (let i=0;i<160;i++) { const value = await fn(); if(value) return value; await sleep(100); } throw Error('Timed out: '+label); }
const js = (wc, source) => wc.executeJavaScript(source, true);
const click = async (wc, selector) => { await js(wc, 'document.querySelector('+JSON.stringify(selector)+')?.click()'); await sleep(120); };
const text = wc => js(wc, 'document.body.innerText');
async function button(wc, label, scope='') {
  const found = await js(wc, '('+((label,scope)=>{ const buttons=[...document.querySelectorAll(scope+'button')]; const el=buttons.find(b=>b.textContent.trim()===label||b.getAttribute('aria-label')===label); if(!el) return false; el.click();return true; }).toString()+')('+JSON.stringify(label)+','+JSON.stringify(scope)+')');
  assert(found, 'Missing button: '+label); await sleep(150);
}
async function input(wc, selector, value) {
  await js(wc, '('+((selector,value)=>{ const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true})); }).toString()+')('+JSON.stringify(selector)+','+JSON.stringify(value)+')'); await sleep(100);
}
async function choice(wc, label, option) { await click(wc,'[role="combobox"][aria-label="'+label+'"]'); await js(wc, '('+(option=>[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent===option)?.click()).toString()+')('+JSON.stringify(option)+')'); await sleep(150); }
async function shot(wc,name) {
  // Hidden Chromium windows can otherwise return the preceding compositor frame.
  const win = BrowserWindow.fromWebContents(wc);
  const [w,h] = win.getSize(); win.setSize(w+1,h); await sleep(150); win.setSize(w,h); await sleep(150);
  await fs.writeFile(path.join(temp,name+'.png'),(await wc.capturePage({},{stayHidden:true})).toPNG());
}
function pass(label) { console.log('PASS '+label); }
require(${JSON.stringify(join(desktop, 'out/main/index.js'))});
(async()=>{
  await app.whenReady();
  const win = await until(()=>BrowserWindow.getAllWindows()[0], 'main window');
  const home = win.webContents;
  await until(async()=>!home.isLoading() && await js(home,'!!document.querySelector(".onboarding, .home-hero, .home-title")'),'home loaded');
  if(process.argv.includes('--verify-relaunch')) {
    assert(!(await text(home)).includes('准备好，开始第一部影片。'),'onboarding repeated after restart');
    assert((await text(home)).includes('继续创作'),'library missing after restart');
    assert.equal(await js(home,'document.documentElement.dataset.theme'),'dark');
    assert((await js(home,'window.studio.providers()')).providers.some(p=>p.model==='qa-local-model'));
    pass('restart preserves completed onboarding, library, preferences and providers'); app.exit(0); return;
  }
  assert((await text(home)).includes('界面偏好')); pass('first-run onboarding');
  await choice(home,'语言','English'); assert((await text(home)).includes('Make room for your first film.'));
  await choice(home,'Language','简体中文');
  await choice(home,'主题','深色'); assert.equal(await js(home,'document.documentElement.dataset.theme'),'dark');
  await choice(home,'主题','浅色'); pass('live language and theme');
  win.setSize(960,600); await sleep(200); await shot(home,'onboarding-small');
  assert(await js(home,'document.documentElement.scrollWidth <= innerWidth'), 'onboarding overflow');
  assert(await js(home,'document.querySelector(".setup-actions").getBoundingClientRect().bottom <= innerHeight'), 'onboarding primary action is below fold');
  await button(home,'继续'); assert((await text(home)).includes('影片保存在哪里'));
  await button(home,'继续'); assert((await text(home)).includes('选择创作方式'));
  await button(home,'模型服务','.setup-options ');
  await click(home,'.presets button:nth-of-type(7)');
  await button(home,'返回原页面'); assert((await text(home)).includes('有尚未保存的修改'),await text(home));
  await button(home,'继续编辑');
  await input(home,'.provider-form input[placeholder="该服务中的模型 ID"]','qa-local-model');
  await button(home,'返回原页面');
  await button(home,'保存并继续');
  await until(async()=>(await text(home)).includes('选择创作方式'),'save and return');
  const saved=JSON.parse(await fs.readFile(path.join(temp,'user-data/settings.json'),'utf8'));
  assert(saved.providers.some(p=>p.model==='qa-local-model')); pass('real provider save and return to onboarding step');
  await button(home,'先体验模板');
  assert(!(await text(home)).includes('准备好，开始第一部影片。'));
  await click(home,'.home-template');
  assert.equal((await fs.readdir(path.join(temp,'projects'))).length,0,'preview created project');
  await button(home,'暂停'); await shot(home,'template-small');
  assert(await js(home,'document.querySelector(".template-description button").getBoundingClientRect().bottom <= innerHeight'), 'template action is below fold');
  pass('template preview does not create project');
  await button(home,'使用此模板');
  const editor=await until(()=>webContents.getAllWebContents().find(w=>w.id!==home.id&&w.getURL()===home.getURL()),'editor');
  await until(()=>js(editor,'!!document.querySelector('+JSON.stringify('[aria-label="设置"]')+')'),'editor loaded');
  const project=await js(editor,'window.studio.currentProject()'); assert(project?.path);
  assert((await fs.readdir(project.path)).includes('film.tsx')); pass('template creates real independent project');
  await button(editor,'设置');
  assert((await text(editor)).includes('偏好设置应用于所有 OpenMotionStudio 窗口'));
  await choice(editor,'主题','深色');
  await until(async()=>await js(home,'document.documentElement.dataset.theme')==='dark','cross-window theme');
  await button(editor,'返回原页面');
  assert.equal((await js(editor,'window.studio.currentProject()')).path,project.path); pass('editor settings preserves project and broadcasts preferences');
  await js(editor,'window.studio.closeProject()'); await sleep(400);
  // The home view is retained: no reload or synthetic focus event should be necessary.
  await button(home,'首页','.home-nav ');
  assert((await text(home)).includes('继续创作'), 'returned home has stale library: '+await text(home));
  const firstOpened=(await js(home,'window.studio.projectLibrary()'))[0].lastOpened;
  await button(home,'我的项目','.home-nav ');
  await button(home,'列表视图');
  await input(home,'input[type="search"]','no-match'); assert((await text(home)).includes('没有找到匹配的项目'));
  await input(home,'input[type="search"]','');
  await click(home,'.project-open'); await sleep(250);
  assert((await js(home,'window.studio.projectLibrary()'))[0].lastOpened>firstOpened, 'reopening must update last opened');
  await js(editor,'window.studio.closeProject()'); await sleep(250);
  pass('home refresh, library search/list and last-opened ordering');
  await button(home,'首页','.home-nav ');
  const brief='Reading app launch teaser: calm, warm, 15 seconds';
  await js(home,'('+((value)=>{ const el=document.querySelector('.home-prompt textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true})); }).toString()+')('+JSON.stringify(brief)+')'); await sleep(100);
  const known=new Set(webContents.getAllWebContents().map(w=>w.id));
  await click(home,'.home-prompt button[type="submit"]');
  const briefed=await until(()=>webContents.getAllWebContents().find(w=>!known.has(w.id)&&w.getURL()===home.getURL()),'briefed editor');
  const briefedProject=await until(()=>js(briefed,'window.studio.currentProject()'),'briefed project');
  assert.equal(briefedProject.name,'Reading app launch teaser calm, warm');
  await until(async()=>(await text(briefed)).includes(brief),'brief in the assistant');
  assert.equal(await js(briefed,'window.studio.takeBrief()'),null,'a brief is taken once');
  await js(briefed,'window.studio.closeProject()'); await sleep(250);
  pass('home prompt creates a named project and hands its brief to the assistant once');
  await button(home,'设置');
  for(const label of ['通用','模型服务','编程 Agent','语音服务','工作空间','诊断']) {
    await button(home,label,'.settings-nav ');
    if(label==='编程 Agent') await until(async()=>(await text(home)).includes('重新检查'),'agent settings loaded');
    assert(await js(home,'document.documentElement.scrollWidth <= innerWidth'),label+' overflow');
    await shot(home,'settings-'+(['通用','模型服务','编程 Agent','语音服务','工作空间','诊断'].indexOf(label)));
  }
  await button(home,'模型服务','.settings-nav ');
  await input(home,'.provider-form input[type="text"]','Unsaved name');
  await button(home,'通用','.settings-nav ');
  assert((await text(home)).includes('有尚未保存的修改。'));
  await button(home,'放弃修改');
  assert((await text(home)).includes('开机自动启动'));
  await button(home,'模型服务','.settings-nav ');
  assert.equal(await js(home,'document.querySelector(".provider-form input[type=text]").value'),'Ollama');
  pass('discard navigation restores saved form');
  await button(home,'返回原页面'); pass('all settings pages at minimum window size');
  win.setSize(1440,900); await button(home,'首页','.home-nav ');
  assert(await js(home,'!!document.querySelector(".home-project.featured") && !document.querySelector(".home-projects.list")'),'library layout leaked into home');
  await shot(home,'home');
  console.log('Artifacts: '+temp); app.exit(0);
})().catch(error=>{console.error(error);console.error('Artifacts: '+temp);app.exit(1);});
`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
async function run(args = []) {
  return new Promise(resolve => {
    const child = spawn(electron, [join(temp, 'runner.cjs'), ...args], { env, stdio: 'inherit', windowsHide: true });
    const timeout = setTimeout(() => child.kill(), 90000);
    child.on('error', error => { clearTimeout(timeout); console.error(error); resolve(1); });
    child.on('exit', code => { clearTimeout(timeout); resolve(code ?? 1); });
  });
}
process.exitCode = await run();
if (!process.exitCode) process.exitCode = await run(['--verify-relaunch']);
