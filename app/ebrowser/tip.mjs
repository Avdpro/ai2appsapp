import { BrowserWindow, ipcMain } from 'electron'

let currentTip = null;

function showTip(win, x, y, tip, tipW,timeout=5000) {
	// 清除现有 tip
	if (currentTip && !currentTip.isDestroyed()) {
		currentTip.close();
		currentTip=null;
	}
	
	if(!tip){
		return null;
	}
	
	// 获取主窗口位置
	const winWh = win.getBounds();
	const winXy = win.getContentBounds();
	const winW=parseInt(tipW||(tip.length * 8 + 20));
	
	const contentX=winXy.x;
	const contentY=winXy.y;
	// 计算 tip 的绝对坐标
	const tipX = parseInt(contentX + x-winW*0.5);
	const tipY = parseInt(contentY + y);
	
	// 创建新的提示窗口
	let thisTip=currentTip = new BrowserWindow({
		width: winW,
		height: 30,
		x: tipX,
		y: tipY,
		parent: null,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		movable: false,
		skipTaskbar: true,
		focusable: false,
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	
	// 加载 HTML 内容
	currentTip.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <style>
      body {
        margin: 0;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.75);
        color: white;
        font-size: 12px;
        border-radius: 5px;
        font-family: sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }
    </style>
    <body>${tip}</body>
  `)}`);
	
	currentTip.once('ready-to-show', () => {
		if(currentTip && currentTip===thisTip) {
			currentTip.showInactive(); // 不抢焦点
		}
	});
	
	currentTip.on('closed', () => {
		if (currentTip === this) {
			currentTip = null;
		}
	});

	if(timeout>0) {
		setTimeout(() => {
			if (currentTip === thisTip) {
				currentTip = null;
				if(!thisTip.isDestroyed()) {
					thisTip.close();
				}
			}
		},timeout)
	}
	return currentTip;
}

ipcMain.on('show-tip',async (event,x,y,tip,tipW=0,timeout=5000)=> {
	const win = BrowserWindow.fromWebContents(event.sender);
	showTip(win,x,y,tip,tipW,timeout);
});
