const { contextBridge, ipcRenderer } = require('electron');

//Tab management API:
contextBridge.exposeInMainWorld('startupApi', {
	//Page=>Startup: 页面准备好了
	pageReady: () => ipcRenderer.send('startup-ready'),
	
	//Page=>Startup：获得当前App的版本：
	checkUpdate:async ()=>await ipcRenderer.invoke('check-update'),

	//Page=>Startup：获得当前App的版本：
	getVersion:async ()=>await ipcRenderer.invoke('get-app-version'),

	//Startup=>Page: 更新当前State 文本。
	onStartupState: (callback) => ipcRenderer.on('startup-state', (_, log) => callback(log)),
	//Startup=>Page: Startup日志
	onStartupLog: (callback) => ipcRenderer.on('startup-log', (_, log) => callback(log)),
});
