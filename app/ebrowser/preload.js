const { contextBridge, ipcRenderer } = require('electron');

//Tab management API:
contextBridge.exposeInMainWorld('tabApi', {
	//Page=>Browser: Browser page ready:
	dashboardReady: () => ipcRenderer.send('dashboard-ready'),

	//Page=>Browser: Browser page ready:
	browserReady: () => ipcRenderer.send('browser-ready'),
	
	//Page=>Browser：获得当前App的版本：
	checkUpdate:async ()=>await ipcRenderer.invoke('check-update'),
	
	//Page=>Browser：获得当前App的版本：
	getVersion:async ()=>await ipcRenderer.invoke('get-app-version'),
	
	//Page=>Browser：更新App：
	updateApp:async ()=>await ipcRenderer.invoke('update-app'),
	
	//Page=>Browser: Browser page ready:
	showTip: (x,y,tip,tipW,timeout) => ipcRenderer.send('show-tip',x,y,tip,tipW,timeout),

	//Browser->Page: 打开新tab
	onNewTab: (callback) => ipcRenderer.on('new-tab', (_, url,fixed) => callback(url,fixed)),
	
	//Page=>Browser: 新tab已创建
	newTab: (url,index,fixed) => ipcRenderer.send('new-tab', url, index,fixed),
	
	//Page=>Browser: 当前tab已改变
	focusTab: (index) => ipcRenderer.send('focus-tab', index),
	
	//Page=>Browser: 关闭指定tab
	closeTab: (index) => ipcRenderer.send('close-tab', index),
	
	//Page=>Browser: 调整Tab顺序
	moveTab: (fromIndex,toIndex) => ipcRenderer.send('move-tab', fromIndex, toIndex),
	
	//Page=>Browser: 调整Tab顺序
	titleChanged: () => ipcRenderer.send('title-changed'),

	//Page=>Browser: 刷新网页
	reloadPage:()=>ipcRenderer.send('reload-page'),
	
	//Page=>Browser: 当前页面前往指定网址
	gotoUrl:(url)=>ipcRenderer.send('goto-url',url),
	
	//Browser=>Page: 页面信息
	onPageInfo: (callback) => ipcRenderer.on('page-info', (_, vo) => callback(vo.index,vo.url,vo.title,vo.icon)),

	//Browser=>Page: 设置当前页面
	onFocusTab: (callback) => ipcRenderer.on('focus-tab', (_, index) => callback(index)),
	
	//Browser=>Page: 关闭指定页面
	onCloseTab:(callback)=>ipcRenderer.on('close-tab', (_, index) => callback(index)),

	//Browser=>Page: 关闭当前页面
	onCloseFocusTab:(callback)=>ipcRenderer.on('close-focused-tab', (_) => callback()),
	
	//Page=>Browser: 打开当前网页的DebugUI
	debugPage:(index)=>ipcRenderer.send('debug-page',index),
	
	//Browser=>Page: 开始下载更新
	onDownloadUpdate:(callback)=>ipcRenderer.on('download-update', (_) => callback()),

	//Browser=>Page: 更新下载完毕，可以更新:
	onUpdateReady:(callback)=>ipcRenderer.on('update-ready', (_) => callback()),
	
	//Page=>Browser: 得到当前的系统设置
	getConfig:async ()=>await ipcRenderer.invoke('get-config'),
	
	//Page=>Browser: 更改系统设置
	setConfig:(config)=> {
		console.log("Will send set-config!");
		ipcRenderer.send('set-config', config);
	},
	
	//Page=>Browser: 启动/停止shadowDomain机制
	shadowDomain:(vo)=>{
		console.log("Will config shadowDomain!");
		ipcRenderer.send('shadow-domain', vo);
	},
	
	//Page=>Browser: 用默认浏览器打开URL/打开指定的App。
	shellExec:(url)=>{
		ipcRenderer.send('shell-exec', url);
	},
});

//Trace page title changes:
contextBridge.exposeInMainWorld('titleWatcher', {
	traceTitleChange: () => {
		const titleElement = document.querySelector('title');
		if (!titleElement) return;
		
		const observer = new MutationObserver(() => {
			ipcRenderer.send('title-changed', document.title); // 可选：发消息到主进程
		});
		
		observer.observe(titleElement, {
			subtree: true,
			childList: true,
			characterData: true
		});
	}
});
