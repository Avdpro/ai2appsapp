async function makeStartupUI(){
	const version=await window.startupApi.getVersion();
	const ui = document.createElement('div')
	ui.style.position='relative';
	ui.style.display = 'flex'
	ui.style.flexDirection = 'column'
	ui.style.alignItems = 'center'
	ui.style.width = '100%'
	ui.style.height = '100%'
	ui.style.padding = '10px'
	ui.style.boxSizing = 'border-box' // 确保 padding 不影响总宽度
	ui.style.background = 'white' // 可选：背景方便观察
	//ui.style.border= '2px solid #000';
	
	const img = document.createElement('img');
	img.src = "aalogo.svg";
	img.style.position = 'relative';
	img.style.width = '300px';
	img.style.height = '300px';
	img.draggable=false;
	ui.appendChild(img);
	ui.eImage=img;
	
	const label=document.createElement("div");
	label.style.position = 'relative';
	label.style.display="flex";
	label.style['pointer-events']='none';
	label.style.flexDirection = 'colum';
	label.style.alignItems = 'center';
	label.style.width='90%';
	label.style.height='30px';
	label.style.marginTop='10px';
	label.style.overflow = 'hidden';
	label.style.fontSize = '14px';
	label.style['white-space']='wrap';
	label.style['min-width']='0';
	label.innerHTML=`<span>Starting AI2Apps</span>`
	ui.appendChild(label);
	ui.eLabel=label;
	
	let tag = document.createElement('div');
	tag.textContent = "www.ai2apps.com";
	tag.style.position = 'absolute';
	tag.style.color = 'gray';
	tag.style.fontSize = '14px';
	tag.style.bottom = '5px';
	tag.style.right = '10px';
	tag.style.textAlign = 'right';
	ui.appendChild(tag);
	ui.eTag=tag;
	
	let veersionTag = document.createElement('div');
	veersionTag.textContent = `Version: ${version}`;
	veersionTag.style.position = 'absolute';
	veersionTag.style.color = 'gray';
	veersionTag.style.fontSize = '12px';
	veersionTag.style.bottom = '5px';
	veersionTag.style.left = '10px';
	veersionTag.style.textAlign = 'right';
	ui.appendChild(veersionTag);
	ui.eTag=tag;

	ui.setText=function(text){
		label.innerHTML=`<span>${text}</span>`
	}
	return ui;
}

makeStartupUI().then((ui)=>{
	document.body.appendChild(ui);
	
	window.startupApi.onStartupState((text)=>{
		ui.setText(text);
	});
	
	window.startupApi.onStartupLog((text)=>{
		console.log("Remote log: "+text);
	});
	
	setTimeout(()=>{
		window.startupApi.pageReady();
	},1000);
});
