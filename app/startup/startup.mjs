import{ app, BrowserWindow,BrowserView,ipcMain,screen,Menu,dialog } from "electron";
import pathLib from 'path'
import os from "os";
import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from'path';
import { fileURLToPath } from 'url'
import decompress from 'decompress';
import yauzl from 'yauzl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathLib.dirname(__filename);

let serverPort=3015;
let isInPackage=false;
let baseDir="";
let fsp=fs.promises;


const NVM_DIR = path.join(process.env.HOME, '.nvm');

//---------------------------------------------------------------------------
async function sleep(time){
	return new Promise(resolve => setTimeout(resolve, time));
}

//---------------------------------------------------------------------------
function ensureDirSync(dirPath) {
	if (fs.existsSync(dirPath)) return;
	fs.mkdirSync(dirPath, { recursive: true });
}

//---------------------------------------------------------------------------
function unzip(zipPath, targetDir) {
	return new Promise((resolve, reject) => {
		yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);
			
			zipfile.readEntry();
			
			zipfile.on('entry', entry => {
				const entryPath = path.join(targetDir, entry.fileName);
				
				if (/\/$/.test(entry.fileName)) {
					ensureDirSync(entryPath);
					zipfile.readEntry();
				} else {
					ensureDirSync(path.dirname(entryPath));
					zipfile.openReadStream(entry, (err, readStream) => {
						if (err) return reject(err);
						const writeStream = fs.createWriteStream(entryPath);
						readStream.pipe(writeStream);
						writeStream.on('close', () => zipfile.readEntry());
					});
				}
			});
			
			zipfile.on('end', resolve);
			zipfile.on('error', reject);
		});
	});
}

//---------------------------------------------------------------------------
async function copyFileToDir(srcFile, targetDir,targetName) {
	const fileName = path.basename(srcFile);
	const destPath = path.join(targetDir, targetName||fileName);
	await fsp.mkdir(targetDir, { recursive: true }); // 确保目录存在
	await fsp.copyFile(srcFile, destPath);
}

//---------------------------------------------------------------------------
async function copyDirWithReplace(srcDir, destDir) {
	await fsp.mkdir(destDir, { recursive: true });
	const entries = await fsp.readdir(srcDir, { withFileTypes: true });
	
	for (const entry of entries) {
		const srcPath = path.join(srcDir, entry.name);
		const destPath = path.join(destDir, entry.name);
		
		if (entry.isDirectory()) {
			// 如果目标目录中已存在该子目录，先删除
			try {
				await fsp.rm(destPath, { recursive: true, force: true });
			} catch (e) {} // 忽略不存在等错误
			
			await copyDirWithReplace(srcPath, destPath);
		} else if (entry.isFile()) {
			await fsp.copyFile(srcPath, destPath);
		}
	}
}

//---------------------------------------------------------------------------
async function linkDir(srcDir, dstDir) {
	try {
		await fsp.mkdir(path.dirname(dstDir), { recursive: true });
		await fsp.symlink(srcDir, dstDir, 'dir');
		console.log(`链接创建成功: ${dstDir} -> ${srcDir}`);
	} catch (err) {
		console.error(`创建符号链接失败: ${err.message}`);
	}
}
//---------------------------------------------------------------------------
async function removeDirOrFile(targetPath) {
	await fsp.rm(targetPath, { recursive: true, force: true });
}

//---------------------------------------------------------------------------
function run(cmd, options = {}) {
	return new Promise((resolve, reject) => {
		exec(cmd, options, (err, stdout, stderr) => {
			if (err) return reject(stderr || err);
			resolve(stdout);
		});
	});
}

//---------------------------------------------------------------------------
function runBashScript(script,cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', ['-i'], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: process.env,
			cwd:cwd||undefined
		});
		
		let stdout = '';
		let stderr = '';
		let allout='';
		
		child.stdout.on('data', (data) => {
			let pos;
			stdout += data.toString();
			allout += data.toString();
			do {
				pos = allout.indexOf("\n");
				if (pos>=0){
					console.log(`[runBashScript] ${allout.substring(0,pos)}`);
					allout=allout.substring(pos+1);
				}
			}while(pos>=0)
		});
		
		child.stderr.on('data', (data) => {
			let pos;
			stderr += data.toString();
			allout += data.toString();
			do {
				pos = allout.indexOf("\n");
				if (pos>=0){
					console.log(`[runBashScript] ${allout.substring(0,pos+1)}`);
					allout=allout.substring(pos+1);
				}
			}while(pos>=0)
		});
		
		child.on('close', (code) => {
			if (code === 0) {
				let out=stdout.trim();
				console.log(`[runBashScript] ${allout}`);
				resolve(out);
			} else {
				let out=stderr;
				console.log(`[runBashScript] ${allout}`);
				reject(new Error(`Exited with code ${code}\n${stderr}`));
			}
		});
		
		child.stdin.write(script + '\n');
		child.stdin.end();
	});
}

//---------------------------------------------------------------------------
async function checkNvm(){
	return fs.existsSync(path.join(NVM_DIR, 'nvm.sh'));
}

//---------------------------------------------------------------------------
async function installNvm(){
	await run(`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`);
}

//---------------------------------------------------------------------------
async function getNodePath(userDataDir,v){
	let nodePath;
	const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);
	if (!fs.existsSync(nodePathCache)) {
		return null;
	}
	nodePath = fs.readFileSync(nodePathCache, 'utf8').trim();
	if (!fs.existsSync(nodePath)){
		return null;
	}
	return nodePath;
}

//---------------------------------------------------------------------------
async function installNode(userDataDir,v,install=true){
	let nodePath;
	const nodePathCache = path.join(userDataDir, `.nvm_node_path_${v}`);
	let shellScript;
	if(install) {
		shellScript = `
      unset npm_config_prefix
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm install ${v}
      nvm use ${v}
      which node
    `;
	}else{
		shellScript = `
      unset npm_config_prefix
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm use ${v}
      which node
    `;
	}
	try {
		let result=await runBashScript(shellScript);
		
		nodePath = result.trimEnd().split('\n').at(-1);
		fs.writeFileSync(nodePathCache, nodePath);
	}catch(err){
		console.error("Get node path error:");
		console.error(err);
		return null;
	}
	console.log(`[NVM] 缓存 node 路径: ${nodePath}`);
	return nodePath;
}

//---------------------------------------------------------------------------
async function installNodePackages(userDataDir,nodeVersion){
	const shellScript = `
      unset npm_config_prefix
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm use ${nodeVersion}
	  npm install
	`;
	try {
		await runBashScript(shellScript,userDataDir);
		return true;
	}catch(err){
		return false;
	}
}

//---------------------------------------------------------------------------
function readJson(filePath){
	try {
		if (!fs.existsSync(filePath)) {
			console.error(`File not found: ${filePath}`)
			return null
		}
		const fileContent = fs.readFileSync(filePath, 'utf8')
		try {
			const jsonData = JSON.parse(fileContent)
			return jsonData
		} catch (parseError) {
			console.error(`Error parsing JSON from ${filePath}:`, parseError)
			return null
		}
	} catch (readError) {
		console.error(`Error reading file ${filePath}:`, readError)
		return null
	}
}

//---------------------------------------------------------------------------
async function updateEnvFile(envfile, config) {
	let content = '';
	try {
		content = await fsp.readFile(envfile, 'utf-8');
	} catch (err) {
		if (err.code === 'ENOENT') {
			// 文件不存在则初始化为空
			content = '';
		} else {
			throw err;
		}
	}
	
	const lines = content.split('\n');
	const keys = new Set(Object.keys(config));
	const updated = [];
	
	for (let line of lines) {
		const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
		if (match) {
			const key = match[1];
			if (keys.has(key)) {
				updated.push(`${key}=${config[key]}`);
				keys.delete(key);
			} else {
				updated.push(line);
			}
		} else {
			updated.push(line); // 保留注释或空行
		}
	}
	
	// 添加新增的键值
	for (const key of keys) {
		updated.push(`${key}=${config[key]}`);
	}
	
	await fsp.writeFile(envfile, updated.join('\n'), 'utf-8');
}

//---------------------------------------------------------------------------
let StartupWindow,startupWindow;
StartupWindow=function(callback){
	let win;
	
	this.startupCallback=callback;
	isInPackage=app.isPackaged||true;
	if(app.isPackaged){
		baseDir=process.resourcesPath;
	}else{
		baseDir=path.join(__dirname,"../..");
	}
	this.userDataDir=path.join(app.getPath('userData'),"local");
	this.serverJsonPath=path.join(this.userDataDir,"bundle.json");
	this.serverDir=isInPackage?path.join(this.userDataDir,"server"):path.join(baseDir,"local");
	this.serverJson=null;
	
	this.bundleDir=path.join(baseDir,"bundle");
	this.bundleJsonPath=path.join(this.bundleDir,"bundle.json");
	this.bundleZipPath=path.join(this.bundleDir,"bundle.zip");
	this.bundleJson=null;
	
	this.configJson=readJson(path.join(this.userDataDir,"config.json"));
	
	this.userDataJSON=null;
	
	win=new BrowserWindow({
		width: 600,
		height: 400,
		frame: false, // 移除原生标题栏
		alwaysOnTop: true,
		webPreferences: {
			preload: pathLib.join(__dirname, 'startup_preload.js'),
		}
	});
	if(!app.isPackaged) {
		win.webContents.openDevTools({ mode: 'detach' });
	}
	win.loadFile('startup/startup.html');
	win.eStartup=this;
	this.window=win;
	
	// IPC：前端要求切换 tab
	ipcMain.on('startup-ready', (event) => {
		this.startApp();
	});
	
	ipcMain.on('dashboard-ready', (event) => {
		console.log("Dashboard ready!");
		this.close();
	});
};
startupWindow=StartupWindow.prototype={};

//---------------------------------------------------------------------------
startupWindow.startApp=async function(){
	let pms,callback,callerror,win;
	let nodePath,nodeVersion;
	
	win=this.window;
	
	pms=new Promise((resolve,reject)=>{
		callback=resolve;
		callerror=reject;
	});
	if(isInPackage){
		this.bundleJson=readJson(this.bundleJsonPath);
		this.setStartupState("Checking node environment...");
		
		//Ensure system dirs:
		{
			await fsp.mkdir(this.userDataDir, { recursive: true });
			await fsp.mkdir(path.join(this.userDataDir,"rpa_data_dir"), { recursive: true });
			await fsp.mkdir(path.join(this.userDataDir,"filehub"), { recursive: true });
			await fsp.mkdir(path.join(this.userDataDir,"server"), { recursive: true });
		}
		
		//Ensure nvm:
		if(!await checkNvm()){
			const result = dialog.showMessageBoxSync(win, {
				type: 'question',
				buttons: ['Cancel', 'OK'],
				defaultId: 1,
				cancelId: 0,
				title:"Setup Node Environment",
				message:"Ai2Apps require 'nvm' tool to managed node environment. Can't detect 'nvm' on your system. Would you like to install 'nvm' now?"
			});
			if(result !== 1){
				throw "Nvm not detected, start Ai2apps aborted.";
			}
			this.setStartupState("Installing nvm tool...");
			await installNvm();
		}

		this.setStartupState("Check node version...");
		nodeVersion=this.bundleJson.node;
		nodePath=await getNodePath(this.userDataDir,nodeVersion);
		this.setStartupState(`Installing node version: ${nodeVersion}`);
		if(!nodePath) {
			nodePath = await installNode(this.userDataDir, nodeVersion, !!nodePath);
		}
		if(nodePath) {
			process.env.PATH = `${path.dirname(nodePath)}:${process.env.PATH}`;
		}else{
			dialog.showMessageBoxSync({
				type: 'info',
				title: 'Startup AI2Apps Error',
				message: "Can't locate node path.",
				buttons: ['Exit']
			});
			throw `Can't find node path!`;
		}
		
		this.serverJson=readJson(this.serverJsonPath);
		if(!this.serverJson){
			//Unzip server dir:
			this.setStartupState("Unzip bundle files...");
			await unzip(this.bundleZipPath,this.serverDir);
			
			//Copy package.json:
			this.setStartupState("Copy package.json file...");
			await copyFileToDir(path.join(this.bundleDir,"package.json"),path.join(this.userDataDir));
			
			//Copy agents folder:
			this.setStartupState("Copy system agents...");
			await copyDirWithReplace(path.join(this.serverDir,"agents"),path.join(this.userDataDir,"agents"));
			
			//Make frpc executable:
			{
				let platform=os.platform();
				let frpcPath=path.join(this.serverDir,"frpc",platform==="win32"?"frpc.exe":"frpc");
				if (platform !== 'win32') {
					fs.chmodSync(frpcPath, 0o755); // macOS/Linux 设置可执行权限
				}
			}
			
			//Link agents, rpa_data_dir, filehub
			/*
			this.setStartupState("Link system folders...");
			await removeDirOrFile(path.join(this.serverDir,"agents"));
			await linkDir(path.join(this.userDataDir,"agents"),path.join(this.serverDir,"agents"));
			await linkDir(path.join(this.userDataDir,"rpa_data_dir"),path.join(this.serverDir,"rpa_data_dir"));
			await linkDir(path.join(this.userDataDir,"filehub"),path.join(this.serverDir,"filehub"));
			 */

			//Run npm install on userDataDir
			this.setStartupState("Install node packages...");
			await installNodePackages(this.userDataDir,nodeVersion);
			
			//Ensure user-data dirs:
			ensureDirSync(path.join(this.serverDir,"filehub"));
			ensureDirSync(path.join(this.serverDir,"rpa_data_dir"));
			
			//Seal install result:
			this.setStartupState("Finishing up...");
			await copyFileToDir(path.join(this.bundleDir,"bundle.json"),this.userDataDir);
		}else{
			if(this.serverJson.build<this.bundleJson.build){//Upgrade package files
				//Backup agents:
				this.setStartupState("Backup your agents...");
				await removeDirOrFile(path.join(this.userDataDir,"agents"));
				fs.rename(path.join(this.serverDir,"agents"),path.join(this.userDataDir,"agents"), (err) => {
					if (err) return console.error('Failed to move:', err);
					console.log('Directory moved successfully');
				});
				//await fsp.mkdir(path.join(this.userDataDir,"agents"), { recursive: true });
				//await copyDirWithReplace(path.join(this.serverDir,"agents"),path.join(this.userDataDir,"agents"));
				
				//Backup file-hub:
				this.setStartupState("Backup your files...");
				await removeDirOrFile(path.join(this.userDataDir,"filehub"));
				fs.rename(path.join(this.serverDir,"filehub"),path.join(this.userDataDir,"filehub"), (err) => {
					if (err) return console.error('Failed to move:', err);
					console.log('Directory moved successfully');
				});
				
				//Backup rpa-data:
				this.setStartupState("Backup your rpa data...");
				await removeDirOrFile(path.join(this.userDataDir,"rpa_data_dir"));
				fs.rename(path.join(this.serverDir,"rpa_data_dir"),path.join(this.userDataDir,"rpa_data_dir"), (err) => {
					if (err) return console.error('Failed to move:', err);
					console.log('Directory moved successfully');
				});
				
				//Remove server dir
				this.setStartupState("Upgrading local server...");
				await removeDirOrFile(this.serverDir);

				//Unzip server dir:
				this.setStartupState("Unzip new bundle files...");
				await unzip(this.bundleZipPath,this.serverDir);
				
				//Copy agents folder:
				this.setStartupState("Restore your agents...");
				await copyDirWithReplace(path.join(this.serverDir,"agents"),path.join(this.userDataDir,"agents"));
				await removeDirOrFile(path.join(this.serverDir,"agents"));
				fs.rename(path.join(this.userDataDir,"agents"),path.join(this.serverDir,"agents"), (err) => {
					if (err) return console.error('Failed to move:', err);
					console.log('Directory moved successfully');
				});
				//await fsp.mkdir(path.join(this.serverDir,"agents"), { recursive: true });
				//await copyDirWithReplace(path.join(this.userDataDir,"agents"),path.join(this.serverDir,"agents"));
				
				this.setStartupState("Restore your files...");
				await removeDirOrFile(path.join(this.serverDir,"filehub"));
				fs.rename(path.join(this.serverDir,"filehub"), path.join(this.userDataDir,"filehub"), (err) => {
					if (err) return console.error('Failed to move:', err);
					console.log('Directory moved successfully');
				});

				this.setStartupState("Restore your rpa data files...");
				await removeDirOrFile(path.join(this.serverDir,"rpa_data_dir"));
				fs.rename(path.join(this.serverDir,"rpa_data_dir"), path.join(this.userDataDir,"rpa_data_dir"), (err) => {
					if (err) return console.error('Failed to move:', err);
					console.log('Directory moved successfully');
				});
				
				//Make frpc executable:
				{
					let platform=os.platform();
					let frpcPath=path.join(this.serverDir,"frpc",platform==="win32"?"frpc.exe":"frpc");
					if (platform !== 'win32') {
						fs.chmodSync(frpcPath, 0o755); // macOS/Linux 设置可执行权限
					}
				}

				//Copy package.json:
				this.setStartupState("Copy package.json file...");
				await copyFileToDir(path.join(this.bundleDir,"package.json"),path.join(this.userDataDir));
				
				//Run npm install on userDataDir
				this.setStartupState("Install node packages...");
				await installNodePackages(this.userDataDir);
				
				this.setStartupState("Finishing up...");
				await copyFileToDir(path.join(this.bundleDir,"bundle.json"),this.userDataDir);
			}
		}
	}else{
		//Do nothing?
	}
	await sleep(500);
	
	//Update .env file in server folder by config.json:
	this.setStartupState("Reading local config...");
	let configJson=this.configJson||{env:{}};
	serverPort=configJson.env["PORT"]||serverPort;
	//Set web-drive app path:
	configJson.env["WEBDRIVE_APP"]=path.join(this.bundleDir,"Acefox.app");
	await updateEnvFile(path.join(this.serverDir,".env"),configJson.env);

	this.setStartupState("Checking local server...");
	//Check if server is already running, mostly for debug
	try {
		const res = await fetch(`http://localhost:${serverPort}`, {
			redirect: 'manual'
		});
		if (res.status){
			this.setStartupState(`Find running server: ${res.status}`);
			this.startupCallback(null,serverPort);
			return;
		}
	}catch (err){
		//Server not start,
	}
	
	this.setStartupState("Starting local server...");
	//Start the local AI2Apps server:
	const cmd = `
unset npm_config_prefix
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22
node ${path.join(this.serverDir,"start.js")}
`;
	//const child = spawn("bash", ['-c',cmd],{cwd:this.serverDir});
	const child = spawn("node", [path.join(this.serverDir,"start.js")],{cwd:this.serverDir,env:process.env});
	/*const child = spawn("zsh", ['-l','-c',`nvm use ${nodeVersion} && node ${path.join(this.serverDir,"start.js")}`],{
		cwd:this.serverDir,
		env:process.env
	});*/
	/*const child = spawn("bash", ['-l','-c',`node ${path.join(this.serverDir,"start.js")}`],{
		cwd:this.serverDir,
		env:process.env
	});*/
	//const child = spawn(nodePath, [path.join(this.serverDir,"start.js")],{cwd:this.serverDir});
	child.stdout.on('data', async (data) => {
		const text = data.toString();
		console.log('[server]', text);
		if (text.includes('READY:')) {
			this.setStartupState("Local server ready, starting AI2Apps dashboard...");
			await sleep(500);
			callback();
		}
	});
	
	child.stderr.on('data', (data) => {
		console.error('[server error]', data.toString());
	});
	
	child.on('exit', (code) => {
		console.log('Server exited with code', code);
	});
	await pms;
	this.startupCallback(child,serverPort);
};

//---------------------------------------------------------------------------
startupWindow.setStartupState=function (text){
	this.window.webContents.send('startup-state', text);
}

//---------------------------------------------------------------------------
startupWindow.close=function(){
	if(this.window) {
		this.window.close();
		this.window = null;
	}
};

//---------------------------------------------------------------------------
ipcMain.handle('get-app-version', () => {
	return app.getVersion();
});

export default StartupWindow;
export {StartupWindow,startupWindow};