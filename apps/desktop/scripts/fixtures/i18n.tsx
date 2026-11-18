import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/renderer/src/app';
import { PreferencesProvider } from '../../src/renderer/src/preferences';
import '../../src/renderer/src/styles.css';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let language = 'zh-CN';
let editor = false;
let complete = true;
let library: any[] = [];
let created = 0;
const listeners = new Set<() => void>();
const providers = { active: 'test', weakKeyStorage: false, providers: [{id: 'test', name: 'English provider name', model: 'model-English', protocol: 'openai', baseUrl: 'https://example.com', images: true, hasKey: true, ready: true}] };
const agents = {current: 'built-in', settings: {claude: {model: '', effort: '', fallbackModel: '', budgetUsd: null}, codex: {model: '', effort: ''}}, harnesses: [{kind: 'codex', name: 'Codex', state: 'signed-out', version: '1.0', hint: 'Sign in with your ChatGPT account'}]};
const api = {
  preferences: async () => ({ theme: 'light', language, onboardingComplete: complete }),
  onPreferencesChanged: (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback); },
  savePreferences: async (input: any) => { if (input.onboardingComplete !== undefined) complete = input.onboardingComplete; if (input.language) language = input.language; listeners.forEach(callback => callback()); return {theme:'light',language,onboardingComplete:complete}; },
  projectLibrary: async () => library, validateWorkspace: async () => {},
  openExample: async () => { created++; return null; },
  libraryAction: async (path: string, action: string) => { if (action === 'remove') library = library.filter(project => project.path !== path); },
  currentProject: async () => editor ? {name: 'English project name', path: '/test', film: true, display: '/test'} : null,
  providers: async () => providers, workspace: async () => ({path: '/English/workspace'}),
  agents: async () => agents, voices: async () => [], systemStartup: async () => ({supported: false, enabled: false}),
  tasks: async () => [],
  examples: async () => [{id:'data', name:'A story in numbers', title:'SMALL STEPS. BIG CHANGE.', line:'Turn a change into a clear visual.', seconds:7}],
  lastBuild: async () => null, projectUsage: async () => null,
  conversation: async () => [], projectAssets: async () => [], projectMotions: async () => [], history: async () => [],
};
window.studio = new Proxy(api, {get(target, key: string) {
  if (key in target) return (target as any)[key];
  if (key.startsWith('on')) return () => () => {};
  return () => Promise.reject(new Error('Unmocked API: ' + key));
}}) as any;
const root = createRoot(document.getElementById('root')!);
const action = async (work: () => void) => { await act(async () => { work(); await new Promise(resolve => setTimeout(resolve, 20)); }); };
const assert = (value: unknown, description: string) => { if (!value) throw new Error(description); };
const text = () => document.body.innerText;
const button = (name: string) => {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label') === name || button.textContent?.trim() === name);
  if (!found) throw new Error('Missing button: ' + name);
  return found;
};
const switchLanguage = async (next: string) => { await action(() => {language = next; listeners.forEach(callback => callback());}); };
const nav = async (label: string) => action(() => { const found = Array.from(document.querySelectorAll<HTMLButtonElement>('.settings-nav button')).find(node => node.textContent === label); if (!found) throw Error('Missing settings category ' + label); found.click(); });
(window as any).runTests = async () => {
  await action(() => root.render(<PreferencesProvider><App /></PreferencesProvider>));
  assert(document.documentElement.lang === 'zh-CN', 'Document language not applied');
  assert(text().includes('打开项目') && text().includes('用数字讲故事'), 'Home not localized');
  await action(() => button('OpenMotionStudio 设置').click());
  assert(text().includes('开机自动启动') && text().includes('简体中文'), 'General settings not localized');
  await nav('模型服务');
  assert(text().includes('测试连接') && text().includes('English provider name') && text().includes('模型支持图像'), 'Provider labels or user name changed');
  await nav('语音服务');
  assert(text().includes('在 Azure 门户创建语音资源') && text().includes('获取音色列表'), 'Voice help not localized');
  await nav('编程 Agent');
  assert(text().includes('未登录') && text().includes('浏览器中完成登录'), 'Agent help not localized');
  await nav('工作空间');
  assert(text().includes('已有项目仍保留在原位置'), 'Workspace help not localized');
  await switchLanguage('en');
  assert(text().includes('Default workspace') && !text().includes('已有项目仍保留在原位置'), 'Settings did not switch back live');
  await action(() => root.render(<></>));
  editor = true; language = 'zh-CN';
  await action(() => root.render(<PreferencesProvider><App /></PreferencesProvider>));
  assert(text().includes('English project name'), 'Project name was rewritten');
  assert(text().includes('想让这个视频表达什么') && text().includes('解释一个概念'), 'Assistant labels not localized');
  assert(document.querySelector('[aria-label="导入图片或字体"]') || document.querySelector('[data-tip="导入图片或字体"]'), 'Composer hint not localized');
  await action(() => button('键盘快捷键').click());
  assert(text().includes('显示或隐藏助手') && text().includes('播放或暂停'), 'Shortcut help not localized');
  await action(() => button('关闭').click());
  await action(() => button('素材').click());
  assert(text().includes('图片、字体与声音') && text().includes('原始文件保持不变'), 'Assets help not localized');
  await action(() => button('动效库').click());
  assert(text().includes('动效来自 motionhub'), 'Motions intro not localized');
  await switchLanguage('en');
  assert(text().includes('What should this film do?') && text().includes('English project name'), 'Editor did not switch back live');
  await action(() => root.render(<></>));
  editor = false; language = 'zh-CN'; complete = false;
  await action(() => root.render(<PreferencesProvider><App /></PreferencesProvider>));
  assert(text().includes('准备好，开始第一个视频'), 'First-run guide missing');
  await action(() => button('继续').click());
  assert(text().includes('视频保存在哪里'), 'Workspace step missing');
  await action(() => button('继续').click());
  assert(text().includes('选择创作方式'), 'Assistant step missing');
  await action(() => button('模型服务').click());
  await action(() => button('返回原页面').click());
  assert(text().includes('选择创作方式'), 'Settings return lost onboarding step');
  await action(() => button('先体验模板').click());
  assert(complete && text().includes('全部模板') === false, 'Onboarding completion not persisted');
  await action(() => document.querySelector<HTMLButtonElement>('.home-template')!.click());
  assert(text().includes('使用此模板') && created === 0, 'Template browsing created a project');
  await action(() => button('使用此模板').click());
  assert(created === 1, 'Template use did not create a project');
  await action(() => root.render(<></>));
  complete = false;
  library = [{name:'English project name',path:'/test',display:'/test',film:true,lastOpened:1000,modified:1000,missing:true}];
  await action(() => root.render(<PreferencesProvider><App /></PreferencesProvider>));
  assert(!text().includes('准备好，开始第一个视频') && text().includes('继续创作'), 'Existing user was forced through onboarding');
  assert(text().includes('找不到项目文件夹') && text().includes('重新定位项目文件夹'), 'Missing project not recoverable');
  await action(() => button('项目操作').click());
  await action(() => button('从列表移除').click());
  assert(library.length === 0, 'Library removal failed');
  await act(async () => root.unmount());
  return 'Chinese UI smoke test passed: home, all settings categories, editor, help, tooltips and live switching; user content preserved.';
};

(window as any).previewHome = async () => {
  editor = false; complete = true; language = 'zh-CN';
  library = ['品牌发布影片', '阅读应用介绍', '季度数据回顾'].map((name, index) => ({name,path:'/demo/'+index,display:'/demo/'+index,film:true,lastOpened:Date.now()-index*86400000,modified:Date.now(),missing:false}));
  const previewRoot = createRoot(document.getElementById('root')!);
  await action(() => previewRoot.render(<PreferencesProvider><App /></PreferencesProvider>));
};
