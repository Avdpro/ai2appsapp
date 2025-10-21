// check-net-fast.mjs
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';

const cap = (n, max=32*1024) => (n>max ? max : n);
const get = (u, tmo=1500) => new Promise(res=>{
	const lib = u.startsWith('http://') ? http : https;
	const t0 = Date.now();
	const req = lib.get(u, {timeout:tmo, headers:{'user-agent':'NetCheckFast/1.0'}}, r=>{
		let n=0;
		r.on('data', c=>{ n = cap(n + c.length); if(n>=32*1024) req.destroy(); });
		r.on('end', ()=>res({ok:r.statusCode>=200&&r.statusCode<400, code:r.statusCode, ms:Date.now()-t0}));
	});
	req.on('timeout', ()=>{req.destroy(); res({ok:false, err:'timeout', ms:Date.now()-t0});});
	req.on('error', e=>res({ok:false, err:e.code||e.message, ms:Date.now()-t0}));
});

const qdns = async (host, tmo=1500) => {
	const t0 = Date.now();
	try {
		const p = dns.resolve(host);
		const r = await Promise.race([
			p.then(a=>({ok:true, addrs:a})),
			new Promise(r=>setTimeout(()=>r({ok:false, err:'timeout'}), tmo))
		]);
		return {...r, ms:Date.now()-t0};
	} catch(e){ return {ok:false, err:e.code||e.message, ms:Date.now()-t0}; }
};

const decideFast = (baseOk, gh, raw,gg) => {
	// baseline 可达但 GitHub 或 Raw 失败 → 可能需要 VPN
	const ghBad = !gh.ok;
	const rawBad = !raw.ok;
	const ggBad = !gg.ok;
	return {
		baseline_ok: baseOk,
		github_ok: gh.ok,
		raw_ok: raw.ok,
		gg_ok: gg.ok,
		likely_need_vpn: baseOk && (ghBad || rawBad || ggBad),
		reason: baseOk
			? (ghBad && rawBad ? 'github+raw failed' : ghBad ? 'github failed' : rawBad ? 'raw failed' : ggBad ? "google failed":'all ok')
			: 'baseline not ok'
	};
};

/**
 * 快速检测：
 * - 1st 阶段（并行，≤ tmo）：example.com + github.com + raw.githubusercontent.com
 * - 2nd 阶段（可选后台）：npm、ghcr、git smart、DNS
 * @param {Object} opts
 * @param {number} opts.tmo        单项超时，默认 1500ms
 * @param {(partial:object)=>void} opts.onUpdate  背景阶段有结果就回调（可选）
 */
export async function checkNetFast({tmo=1500, onUpdate} = {}) {
	const [base, gh, raw,gg] = await Promise.all([
		get('https://www.ai2apps.com', tmo),
		get('https://github.com/robots.txt', tmo),
		get('https://raw.githubusercontent.com/Homebrew/brew/master/README.md', tmo),
		get('https://www.google.com', tmo)
	]);
	
	const fast = decideFast(base.ok, gh, raw,gg);
	const out = {
		ts: new Date().toISOString(),
		fast,
		probes: { base, github: gh, raw },
	};
	
	// —— 可选后台扩展探针（不影响快速结论）——
	const bg = async () => {
		const more = await Promise.all([
			get('https://registry.npmjs.org/-/ping', tmo),
			get('https://ghcr.io/token?service=ghcr.io', tmo),
			get('https://github.com/Homebrew/brew.git/info/refs?service=git-upload-pack', tmo),
			qdns('github.com', tmo),
			qdns('raw.githubusercontent.com', tmo)
		]);
		const detail = {
			npm: more[0], ghcr: more[1], git_smart: more[2],
			dns_github: more[3], dns_raw: more[4]
		};
		out.probes = {...out.probes, ...detail};
		// 补充一个更稳健的结论（baseline ok 且 2+ 关键失败 → 需要 VPN）
		const fails = ['github','raw','npm','ghcr','git_smart']
			.map(k=>out.probes[k]).filter(r=>!r?.ok).length;
		out.slow_summary = {
			dev_fail_count: fails,
			reinforced_need_vpn: fast.baseline_ok && fails >= 2
		};
		onUpdate && onUpdate({probes: detail, slow_summary: out.slow_summary});
	};
	// 背景跑，不阻塞返回
	onUpdate && bg();
	
	return out;
}
