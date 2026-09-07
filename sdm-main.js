// ─────────────────────────────────────────────────────────────────────────────
// SDM 统一入口 (sdm-main.js)
// 版本: 3.6.9
// 由 SDM 统一更新管理器管理所有子插件
// ─────────────────────────────────────────────────────────────────────────────
const PLUGIN_VERSION = '3.6.9';
//<script>
//@@SDM_PLUGIN_ID:a1b2c3@@
(async () => {
try {
    let SCAN_INTERVAL = null
    let GAME_MONITOR_INTERVAL = null
    let ACTIVITY_LOG = []
    let DIAG_LOG = []
    let SCAN_INTERVAL_MS = 10000
    let _isScanning = false
    const PLUGIN_VERSION = '3.6.9'

    // ════════════════════════════════════════════════════════════
    // 自有更新推送机制 ★ 改成你自己的 GitHub 仓库 ★
    // ════════════════════════════════════════════════════════════
    const SDM_CDN_ORIGIN = 'cdn.jsdelivr.net';
    const SDM_CDN_MIRRORS = ['fastly.jsdelivr.net', 'testingcf.jsdelivr.net', 'cdn.jsdmirror.com', 'jsd.onmicrosoft.cn'];
    const SDM_GH_BASE = `https://${SDM_CDN_ORIGIN}/gh/xiaoyutxy/my-pIugins@main/`;
    const SDM_RAW_BASE = 'https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/';
    let _sdmBestNode = null;
    let _sdmManifest = null;
    let _sdmUpdating = false;
    const SDM_VERSION_FILE = '/data/sdm/.version';
    const SDM_DATA_DIR = '/data/sdm';
    const SDM_PENDING_JS = '/data/local/tmp/_sdm_pending.js';
    const SDM_SIG = '@@SDM_PLUGIN_ID:a1b2c3@@';

    const _sdmSq = (v) => `'${String(v ?? '').replace(/'/g, `'\''`)}'`;
    const _sdmWait = (ms) => new Promise(r => setTimeout(r, ms));
    const _sdmRun = async (cmd, timeout = 30000) => {
        try { const r = await runShellWithRoot(cmd, timeout); return r || { success: false, content: '' }; }
        catch (e) { return { success: false, content: '', error: e?.message || String(e) }; }
    };

    let _sdmProbeTs = 0;
    const _sdmProbeCdn = async () => {
        // 缓存5分钟，过期后重新探测（网络环境变化能自适应，不会永久锁死在一个节点上）
        if (_sdmBestNode && Date.now() - _sdmProbeTs < 300000) return _sdmBestNode;
        const candidates = [SDM_CDN_ORIGIN, ...SDM_CDN_MIRRORS];
        // 并发测速：所有节点同时发请求，最快返回200的胜出。
        // 串行测6个节点最坏30秒，并发只需最慢一个的超时时间（5秒）。
        const probeOne = async (node) => {
            const testUrl = `https://${node}/gh/xiaoyutxy/my-pIugins@main/_latest.json?_=${Date.now()}`;
            const start = Date.now();
            const r = await _sdmRun(`curl -sL --connect-timeout 3 --max-time 5 -w '%{http_code}' -o /dev/null ${_sdmSq(testUrl)}`, 8000).catch(() => ({ content: '0' }));
            return { node, rtt: Date.now() - start, ok: String(r?.content || '').trim() === '200' };
        };
        const results = await Promise.all(candidates.map(probeOne));
        const ok = results.filter(r => r.ok).sort((a, b) => a.rtt - b.rtt);
        _sdmBestNode = ok.length > 0 ? ok[0].node : SDM_CDN_MIRRORS[0];
        _sdmProbeTs = Date.now();
        return _sdmBestNode;
    };

    // 主动刷新 jsDelivr 官方节点（Cloudflare / Fastly）的 CDN 缓存
    // 解决「刚推送的新版本被边缘节点 12 小时缓存挡住、客户端死活拉不到」的问题。
    // 实测：purge 接口用 GET 方法（POST 会返回 405）；只覆盖 CF/FY 两家，
    // testingcf / jsdmirror / onmicrosoft 属第三方镜像，不受管辖，靠多源取最新兜底。
    const SDM_PURGE_BASE = 'https://purge.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/';
    const SDM_PURGE_FILES = ['_latest.json', 'sdm.js'];
    let _sdmLastPurgeTs = 0;

    const _sdmPurgeCache = async (extraFiles) => {
        try {
            // 节流：60 秒内不重复刷新，避免连点检查更新时触发 jsDelivr 限流
            const now = Date.now();
            if (now - _sdmLastPurgeTs < 60000) { await _sdmWait(600); return false; }
            _sdmLastPurgeTs = now;
            const files = (SDM_PURGE_FILES.concat(extraFiles || [])).filter((v, i, a) => a.indexOf(v) === i);
            // 并发刷新：网络不通时最坏只等一轮超时，不会串行累加
            await Promise.all(files.map(f =>
                _sdmRun(`curl -sL --connect-timeout 4 --max-time 10 ${_sdmSq(SDM_PURGE_BASE + f)} -o /dev/null`, 12000)
            ));
            await _sdmWait(1800);   // 等边缘节点回源完成
            return true;
        } catch (e) { return false; }   // 清缓存失败不阻断更新，后续多源取最新仍会兜底
    };

    // 诊断日志：记录最近一次各源实际返回的 rev。
    // 「点检查更新却说已是最新」时，先看这张表就能判断是「云端文件没更新」还是「CDN 节点缓存旧」。
    //   各源 rev 一致且都低于本地  → 云端文件本身没更新，purge 缓存没用，得去推文件
    //   各源 rev 不一致（有的高）  → 确实是 CDN 缓存问题，多源取最高已自动兜底
    let _sdmProbeLog = [];

    // curl 退出码 → 中文提示，让用户看到"网络连接超时"而不是一脸懵的"__FAIL__:28"
    const _sdmCurlErrMap = { 6:'网络域名解析失败', 7:'无法连接到服务器', 22:'服务器返回错误', 28:'网络连接超时', 35:'网络安全连接失败', 56:'网络连接中断（网络不稳定，可稍后重试）', 92:'HTTP/2帧错误（网络异常）' };
    const _sdmCurlErrText = (c) => _sdmCurlErrMap[parseInt(c)] || ('网络传输异常(码' + c + ')');
    // 可续传的 curl 退出码：这些码意味着下载已部分完成，用 -C - 可以接着下而不必从头来
    const _sdmCurlResumeEcs = new Set(['18','28','56','92']);

    const _sdmFetchManifest = async (jsonFile) => {
        const t = Date.now();
        // 候选源：GitHub raw（源头无缓存）→ 各CDN节点
        // 注意：jsDelivr 忽略 query string 做缓存 key，?t= 这类时间戳对穿透 CDN 缓存无效，
        // 真正的解法是「并发问所有源，取 rev 最高的那份」——任一节点缓存了旧清单，
        // 只要有一个节点已刷新，就能拿到新版本，不必等所有节点缓存到期。
        const srcs = [SDM_RAW_BASE + jsonFile + '?t=' + t];
        const labels = ['raw(源头)'];
        for (const node of [SDM_CDN_ORIGIN, ...SDM_CDN_MIRRORS]) {
            srcs.push(SDM_GH_BASE.replace('https://' + SDM_CDN_ORIGIN, 'https://' + node) + jsonFile + '?_=' + t);
            labels.push(node.replace('cdn.jsdelivr.net', 'cdn-cf').replace('fastly.jsdelivr.net', 'fastly-fy')
                             .replace('testingcf.jsdelivr.net', 'testingcf').replace('cdn.jsdmirror.com', 'jsdmirror')
                             .replace('jsd.onmicrosoft.cn', 'onmicrosoft'));
        }
        const jobs = srcs.map(async (url, i) => {
            const tmp = '/data/local/tmp/_sdm_mf_' + i + '.tmp';
            const r = await _sdmRun(`curl -sL --fail --connect-timeout 5 --max-time 15 ${_sdmSq(url)} -o ${_sdmSq(tmp)}; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`, 20000);
            const rec = { file: jsonFile, src: labels[i] || ('src' + i), rev: null, ok: false };
            if (!String(r?.content || '').includes('__OK__')) { await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000); _sdmProbeLog.push(rec); return null; }
            const rd = await _sdmRun(`cat ${_sdmSq(tmp)}`, 3000);
            const text = String(rd?.content || '').trim();
            await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);
            if (!text || text[0] !== '{') { _sdmProbeLog.push(rec); return null; }
            try {
                const j = JSON.parse(text);
                const good = !!(j.rev && j.js);
                rec.rev = j.rev || null; rec.ok = good;
                _sdmProbeLog.push(rec);
                return good ? j : null;
            } catch { _sdmProbeLog.push(rec); return null; }
        });
        const got = await Promise.all(jobs);
        let best = null;
        for (const j of got) { if (j && (!best || _sdmCmpVer(j.rev, best.rev) > 0)) best = j; }
        return best;
    };

    const _sdmReadVer = async () => {
        const r = await _sdmRun(`timeout 2s awk '{print}' ${_sdmSq(SDM_VERSION_FILE)} 2>/dev/null || echo ''`, 5000);
        return (r && r.content) ? r.content.trim() : '';
    };

    const _sdmApplyJs = async (newVer) => {
        const chk = await _sdmRun(`[ -s ${_sdmSq(SDM_PENDING_JS)} ] && echo EXISTS || echo NONE`, 2000);
        if (!String(chk?.content || '').includes('EXISTS')) return;
        const r = await _sdmRun(`base64 ${_sdmSq(SDM_PENDING_JS)} | tr -d '\\n'`, 15000);
        const b64 = String(r?.content || '').trim();
        if (!b64 || b64.length < 200) { await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`); throw new Error('插件文件异常'); }
        let newJs;
        try { newJs = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
        catch (e) { await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`); throw new Error('解码失败'); }

        // 完整性校验：插件签名在本文件中固定出现2次（第2行标记 + SDM_SIG定义）
        // 内容重复（损坏）的文件签名会出现多次，直接拒绝安装
        const sigCount = newJs.split(SDM_SIG).length - 1;
        if (sigCount !== 2 || newJs.length < 50000) {
            await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`);
            throw new Error('插件文件校验失败（疑似损坏或内容重复），已中止安装');
        }
        if (newVer) newJs = newJs.replace(/const PLUGIN_VERSION = '[^']*'/, `const PLUGIN_VERSION = '${newVer}'`);

        const currentText = await getCustomHead();
        if (!currentText) throw new Error('读取插件列表失败');

        // 用签名标记定位所有本插件的代码块
        const _esc = s => s.replace(/[\[\]]/g, (c) => '\\' + c);
        const sP = '<!-- [KANO_PLUGIN_START]';
        const sE = '<!-- [KANO_PLUGIN_END]';
        const pluginRegex = new RegExp(_esc(sP) + '\\s*(.*?)\\s*-->([\\s\\S]*?)' + _esc(sE) + '\\s*\\1\\s*-->', 'g');
        const blocks = [];
        let _m;
        while ((_m = pluginRegex.exec(currentText)) !== null) {
            if (_m[2].includes(SDM_SIG)) blocks.push({ full: _m[0], name: _m[1].trim() });
        }

        if (blocks.length === 0) throw new Error('未找到当前插件代码块');

        let newText = currentText;
        const name = blocks[0].name;
        const newBlock = `${sP} ${name} -->\n${newJs}\n${sE} ${name} -->`;
        // ★ 必须用函数式替换：直接传字符串时 newJs 里的 $ 符号会被当作特殊替换模式，
        //   把整个旧插件代码嵌进新代码里（历史"新旧版本冲突"bug的根源）
        newText = newText.replace(blocks[0].full, () => newBlock);
        // 删除其余重复的旧块，彻底清除新旧版本共存冲突
        for (let i = 1; i < blocks.length; i++) {
            const idx = newText.indexOf(blocks[i].full);
            if (idx >= 0) newText = newText.slice(0, idx) + newText.slice(idx + blocks[i].full.length);
        }

        for (let i = 0; i <= 2; i++) {
            try { const result = await setCustomHead(newText); if (result?.result === 'success') break; throw new Error('保存失败'); }
            catch (e) { if (i < 2) await _sdmWait(1000 * Math.pow(2, i)); else throw e; }
        }
        await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`);
    };

    const _sdmShowProgress = () => {
        const steps = [{ id: 'purge', label: '刷新CDN缓存' }, { id: 'manifest', label: '获取版本信息' }, { id: 'dl_js', label: '下载插件代码' }, { id: 'deploy', label: '安装' }, { id: 'complete', label: '完成' }];
        const st = {}; steps.forEach(s => st[s.id] = 'pending');
        let finished = false, failInfo = null;
        const ICONS = { pending: '<span style="color:#94a3b8">○</span>', running: '<span style="animation:sdm_spin 1s linear infinite;display:inline-block">⏳</span>', done: '<span style="color:#86efac">✓</span>', failed: '<span style="color:#f87171">✗</span>' };
        const { el, close } = createFixedToast('sdm_update_flow', '<div id="sdm_flow_box" style="pointer-events:all;width:88vw;max-width:360px"></div>');
        const box = el.querySelector('#sdm_flow_box');
        const render = () => {
            const pct = finished ? 100 : Math.round(steps.filter(s => st[s.id] === 'done').length / steps.length * 100);
            const rows = steps.map(s => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:.6rem;${st[s.id]==='running'?'color:#60a5fa;':''}">${ICONS[st[s.id]]} ${s.label}</div>`).join('');
            let failHtml = '';
            if (failInfo) failHtml = `<div style="margin-top:8px;color:#f87171;font-size:.58rem">${failInfo}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button id="sdm_retry" style="font-size:.58rem;padding:4px 12px;border-radius:6px;border:1px solid rgba(34,197,94,.4);background:rgba(34,197,94,.2);color:#86efac">重试</button><button id="sdm_close" style="font-size:.58rem;padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06)">关闭</button></div>`;
            box.innerHTML = `<div class="title" style="margin:0 0 6px">检查更新</div><div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:6px 0;overflow:hidden"><div style="height:100%;width:${pct}%;background:#4ade80;transition:width .3s"></div></div>${rows}${failHtml}`;
            box.querySelector('#sdm_retry')?.addEventListener('click', () => { close(); _sdmCheckUpdate(); });
            box.querySelector('#sdm_close')?.addEventListener('click', () => close());
        };
        render();
        return { setStep: (id, s) => { if (st[id] !== undefined) { st[id] = s; render(); } }, fail: (msg) => { failInfo = msg; render(); }, done: () => { steps.forEach(s => st[s.id] = 'done'); finished = true; render(); setTimeout(close, 800); }, close };
    };

    // 「本地版本领先云端」诊断面板
    // 触发条件：代码里写死的 PLUGIN_VERSION 比云端清单 rev 还高。
    // 这不是 CDN 缓存问题 —— 源头文件本身就是旧的，刷新缓存救不了，必须去推文件。
    // 面板直接列出各源实际返回的 rev，一眼看清到底是哪一环没同步。
    const _sdmShowAheadDiag = (curVer, cloudRev, localRev) => {
        // 建议的下一个版本号：末位 +1（3.8.2 → 3.8.3）
        const _np = String(localRev || '0.0.0').split('.').map(n => parseInt(n) || 0);
        while (_np.length < 3) _np.push(0);
        _np[2] = (_np[2] || 0) + 1;
        const _nextV = _np.join('.');
        const rows = (_sdmProbeLog || []).slice(-12).map(p => {
            const color = !p.ok ? '#64748b' : (String(p.rev) === String(cloudRev) ? '#86efac' : '#fbbf24');
            return `<div style="display:flex;justify-content:space-between;font-size:.52rem;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)">
                <span style="color:#94a3b8">${p.file} · ${p.src}</span>
                <span style="color:${color};font-weight:700">${p.ok ? 'v' + p.rev : '拉取失败'}</span>
            </div>`;
        }).join('') || '<div style="font-size:.52rem;color:#64748b">（无源响应记录）</div>';

        const uniq = Array.from(new Set((_sdmProbeLog || []).filter(p => p.ok).map(p => String(p.rev))));
        const allSame = uniq.length <= 1;
        const verdict = allSame
            ? `所有源返回的都是 <b style="color:#fbbf24">v${cloudRev}</b>，说明仓库里的文件本身就是旧的。<br>刷新 CDN 缓存<b>没用</b> —— 源头就没新东西。`
            : `各源返回不一致（${uniq.map(v => 'v' + v).join(' / ')}），存在 CDN 缓存差异。<br>但即便取最高的 v${cloudRev}，仍低于本地，所以关键还是<b style="color:#fbbf24">仓库文件没更新</b>。`;

        const html = `<div style="pointer-events:all;width:92vw;max-width:400px;max-height:74vh;overflow:auto">
            <div style="font-size:.66rem;font-weight:800;color:#fbbf24;margin-bottom:6px">⚠️ 本地版本领先云端</div>
            <div style="font-size:.56rem;line-height:1.7;color:#cbd5e1;margin-bottom:8px">
                本地插件：<b style="color:#f87171">v${localRev}</b>　云端最新：<b style="color:#86efac">v${cloudRev}</b><br>
                ${verdict}
            </div>
            <div style="font-size:.56rem;font-weight:700;color:#c084fc;margin:8px 0 4px">要修复，需要在仓库里做三件事：</div>
            <div style="font-size:.54rem;line-height:1.75;color:#94a3b8;background:rgba(0,0,0,.25);padding:7px 9px;border-radius:8px">
                1. 把本地 sdm.js 推上去（当前仓库那份是旧的）<br>
                2. <b style="color:#e2e8f0">_latest.json</b> 的 <b style="color:#e2e8f0">rev</b> 改成新版本号<br>
                3. 新版本号必须 <b style="color:#e2e8f0">大于</b> 本地 v${localRev}，例如 <b style="color:#e2e8f0">v${_nextV}</b>
            </div>
            <div style="font-size:.56rem;font-weight:700;color:#c084fc;margin:8px 0 4px">各源实际返回：</div>
            ${rows}
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
                <button id="sdm_diag_copy" style="font-size:.56rem;padding:4px 12px;border-radius:6px;border:1px solid rgba(96,165,250,.4);background:rgba(96,165,250,.18);color:#93c5fd">复制诊断</button>
                <button id="sdm_diag_close" style="font-size:.56rem;padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06)">关闭</button>
            </div>
        </div>`;
        const { el, close } = createFixedToast('sdm_ahead_diag', html);
        el.querySelector('#sdm_diag_close')?.addEventListener('click', () => close());
        el.querySelector('#sdm_diag_copy')?.addEventListener('click', () => {
            const txt = ['【SDM 更新诊断】',
                '本地插件版本: v' + localRev,
                '设备记录版本: v' + curVer,
                '云端最新 rev: v' + cloudRev,
                '结论: ' + (allSame ? '仓库文件未更新（非缓存问题）' : '存在 CDN 缓存差异，但根因仍是仓库文件未更新'),
                '', '各源返回:'].concat(
                (_sdmProbeLog || []).map(p => '  ' + p.file + ' · ' + p.src + ' = ' + (p.ok ? 'v' + p.rev : '拉取失败'))
            ).join('\n');
            try { navigator.clipboard?.writeText(txt); createToast('诊断信息已复制', 'green', 2000); }
            catch (e) { createToast('复制失败，请手动截图', 'yellow', 2000); }
        });
    };

    // 版本号比较：a>b 返回1，a<b 返回-1，相等返回0
    const _sdmCmpVer = (a, b) => {
        const pa = String(a || '0').split('.').map(n => parseInt(n) || 0);
        const pb = String(b || '0').split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
        return 0;
    };

    // 获取版本清单：先试 v{当前版本}.json 入口，拿不到或版本不高于当前时再用 _latest.json 兜底
    // 这样发新版只需更新 _latest.json + sdm.js + 对应版本文件，不必修改所有历史版本文件
    const _sdmGetManifest = async (curVer) => {
        const cur = curVer || PLUGIN_VERSION;
        const verM = await _sdmFetchManifest('v' + cur + '.json');
        if (verM && _sdmCmpVer(verM.rev, cur) > 0) return verM;
        const latestM = await _sdmFetchManifest('_latest.json');
        if (latestM && _sdmCmpVer(latestM.rev, cur) > 0) return latestM;
        // 都没有更新时返回一个当前版本的占位，调用方会提示已是最新
        return latestM || verM || null;
    };

    const _sdmShowChangelog = (ver, manifest) => {
        const cl = manifest?.changelog || [];
        const notes = manifest?.notes || '修复了一些已知问题';
        let bodyHtml = '';
        if (cl && cl.length > 0) {
            bodyHtml = cl.map(item => {
                const title = item.title || '更新内容';
                const items = item.items || [];
                const itemsHtml = items.map(it => `<li>${it}</li>`).join('');
                return `<div class="sdm-changelog-item"><div class="sdm-changelog-item-title"><span class="dot"></span>${title}</div><ul>${itemsHtml}</ul></div>`;
            }).join('');
        } else {
            bodyHtml = `<div class="sdm-changelog-item"><div class="sdm-changelog-item-title"><span class="dot"></span>本次更新</div><ul><li>${notes}</li></ul></div>`;
        }
        const mask = document.createElement('div');
        mask.className = 'sdm-changelog-mask';
        mask.innerHTML = `<div class="sdm-changelog-box">
            <div class="sdm-changelog-header">
                <div class="sdm-changelog-title">🎉 更新成功 <span class="sdm-changelog-ver">v${ver}</span></div>
                <div class="sdm-changelog-sub">新版本已安装完成，点击下方按钮刷新生效</div>
            </div>
            <div class="sdm-changelog-body">${bodyHtml}</div>
            <div class="sdm-changelog-footer">
                <button class="sdm-changelog-btn primary" id="sdm_changelog_refresh">立即刷新</button>
            </div>
        </div>`;
        document.body.appendChild(mask);
        mask.querySelector('#sdm_changelog_refresh').onclick = () => {
            mask.style.animation = 'sdm_fade_in .25s ease reverse';
            setTimeout(() => { mask.remove(); location.reload(); }, 200);
        };
    };

    // 检查更新（主入口，绑定到 UI 按钮）
    const _sdmCheckUpdate = async () => {
        if (_sdmUpdating) return createToast('正在更新中，请稍候', 'yellow');
        if (typeof checkAdvancedFunc === 'function' && !(await checkAdvancedFunc())) return;
        _sdmUpdating = true;
        _sdmProbeLog = [];   // 每次检查前清空源诊断日志，避免混入上次结果
        const btn = document.querySelector('#sdm_check_update_btn');
        if (btn) btn.classList.add('loading');
        const flow = _sdmShowProgress();
        try {
            const prevVer = await _sdmReadVer();
            const curVer = prevVer || PLUGIN_VERSION;
            // 先刷新 CDN 缓存，确保刚推送的版本能立刻被拉到（无需手动去 purge）
            flow.setStep('purge', 'running');
            await _sdmPurgeCache(['v' + curVer + '.json']);
            flow.setStep('purge', 'done');
            flow.setStep('manifest', 'running');
            const raw = await _sdmGetManifest(curVer);
            if (!raw) { flow.fail('无法获取版本信息，可能网络不通或仓库未配置'); _sdmUpdating = false; if (btn) btn.classList.remove('loading'); return; }
            _sdmManifest = raw;
            flow.setStep('manifest', 'done');

            if (_sdmCmpVer(raw.rev, curVer) <= 0) {
                flow.close();
                // 关键区分：云端 rev 低，到底是「确实没发新版」，还是「云端文件根本没推上去」？
                // 后者表现为：本地 PLUGIN_VERSION 反而高于云端 rev —— 这时刷 CDN 缓存毫无意义，
                // 因为源头文件就是旧的，必须去把 sdm.js 和 _latest.json 推上去。
                if (_sdmCmpVer(PLUGIN_VERSION, String(raw.rev).trim()) > 0) {
                    _sdmShowAheadDiag(curVer, String(raw.rev).trim(), PLUGIN_VERSION);
                } else {
                    createToast('当前已是最新版本 v' + curVer, 'green', 3000);
                }
                if (btn) { btn.classList.remove('has-update'); const icon = btn.querySelector('.sdm-btn-icon'); if (icon) icon.textContent = '📦'; const bdg = document.querySelector('#sdm_update_badge'); if (bdg) bdg.remove(); }
                _sdmUpdating = false; if (btn) btn.classList.remove('loading'); return;
            }

            // 保护本地定制版：代码内写死的版本高于云端时，更新等于降级并覆盖本地修改，直接拦下。
            // 走到这里说明 raw.rev > curVer 但 PLUGIN_VERSION > raw.rev，
            // 即「设备记录的版本最旧 < 云端 < 本地代码」——典型是本地改了没推，或仓库 rev 没同步。
            if (_sdmCmpVer(PLUGIN_VERSION, String(raw.rev).trim()) > 0) {
                flow.fail(`版本三者对不上：本地代码 v${PLUGIN_VERSION} ＞ 云端 v${raw.rev} ＞ 设备记录 v${curVer}。安装云端版会覆盖本地修改并降级，已阻止。<br>常见原因：① 本地是未推送的定制版；② 仓库推了新版但 _latest.json 的 rev 忘了同步。<br>确需回退官方版，请手动导入仓库的 sdm.js。`);
                _sdmUpdating = false; if (btn) btn.classList.remove('loading'); return;
            }

            flow.setStep('dl_js', 'running');
            const bestNode = await _sdmProbeCdn();
            const nodes = [bestNode, ...SDM_CDN_MIRRORS.filter(m => m !== bestNode), SDM_CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);
            // ★ 规范化 manifest 的 js 地址：兼容误填 raw.githubusercontent.com 的情况。
            //   历史 bug：清单 js 字段填了 raw 地址，replace(SDM_CDN_ORIGIN) 全部无效，
            //   srcList 变成 6 个相同的 raw 地址（国内不可达），所有设备更新必败。
            const _sdmParseGhUrl = (u) => {
                const s = String(u || '');
                let m = s.match(/cdn\.jsdelivr\.net\/gh\/([^/]+\/[^/@]+)@([^/]+)\/(\S+)/);
                if (m) return { repo: m[1], ref: m[2], path: m[3] };
                m = s.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(\S+)/);
                if (m) return { repo: m[1], ref: m[2], path: m[3] };
                return null;
            };
            const _gh = _sdmParseGhUrl(raw.js);
            // CDN 节点优先（国内可达），raw 兜底（源头无缓存）
            const cdnJsUrl = _gh ? `https://${SDM_CDN_ORIGIN}/gh/${_gh.repo}@${_gh.ref}/${_gh.path}` : String(raw.js);
            const rawJsUrl = _gh ? `https://raw.githubusercontent.com/${_gh.repo}/${_gh.ref}/${_gh.path}` : String(raw.js);
            const srcList = [...nodes.map(n => cdnJsUrl.replace(SDM_CDN_ORIGIN, n)), rawJsUrl].filter((v, i, a) => a.indexOf(v) === i);
            let ok = false;
            let lastFail = '';
            let dlVer = '';
            for (const src of srcList) {
                const host = String(src).replace(/^https?:\/\//, '').split('/')[0];
                // 断点续传 + 指数退避重试：同一源最多重试3次，第一次失败后用 -C - 接着下（不从头来），
                // 退避间隔 800ms→1600ms→3200ms，给网络波动恢复的时间。
                let dlOk = false;
                for (let retry = 0; retry < 3; retry++) {
                    const resumeFlag = retry > 0 ? '-C - ' : '';
                    const dlR = await _sdmRun(`curl -sL --fail ${resumeFlag}--connect-timeout 8 --max-time 90 --speed-limit 1 --speed-time 45 ${_sdmSq(src)} -o ${_sdmSq(SDM_PENDING_JS)}; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo "__FAIL__:$ec"`, 95000);
                    const out = String(dlR?.content || '');
                    if (out.includes('__OK__')) { dlOk = true; break; }
                    // 提取 curl 退出码，映射成中文
                    const m = out.match(/__FAIL__:(\d+)/);
                    const ec = m?.[1] || '?';
                    if (!_sdmCurlResumeEcs.has(ec)) { await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`, 2000); }  // 不可续传的码删掉残文件
                    lastFail = `${host}：${_sdmCurlErrText(ec)}` + (retry < 2 ? `（重试${retry+1}/3中…）` : '');
                    if (retry < 2) await _sdmWait(800 * Math.pow(2, retry));  // 800ms→1600ms→3200ms
                }
                if (!dlOk) { lastFail = lastFail || `下载失败（源 ${host}）`; await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`, 2000); continue; }
                // 下载后即时校验：大小合理 + 签名恰好2行（防CDN缓存旧文件被装成新版本 / 文件损坏 / 内容重复）
                const vrf = await _sdmRun(`_s=$(wc -c < ${_sdmSq(SDM_PENDING_JS)} 2>/dev/null || echo 0); _c=$(grep -c 'SDM_PLUGIN''_ID:a1b2c3' ${_sdmSq(SDM_PENDING_JS)} 2>/dev/null || echo 0); _v=$(grep -o "const PLUGIN_VERSION = '[^']*'" ${_sdmSq(SDM_PENDING_JS)} 2>/dev/null | head -1 | sed "s/.*'\\(.*\\)'.*/\\1/"); echo "$_s|$_c|$_v"`, 10000);
                const [dsz, dcnt, dver] = String(vrf?.content || '0|0|').trim().split('|');
                const sizeOk = (parseInt(dsz) || 0) > 100000;
                const sigOk = (parseInt(dcnt) || 0) === 2;
                if (sizeOk && sigOk) {
                    dlVer = String(dver || '').trim();
                    // ★ 版本号必须严格匹配清单 rev，否则跳过本源继续试下一个。
                    //   只靠「大小>100KB + 签名2次」不够——CDN 缓存的旧版文件同样满足这两个条件，
                    //   会被当成最新装上、覆盖掉本地全部功能（实测：fastly 上缓存的 v3.5.3 / 750KB
                    //   旧文件，下载成功即被 break 装成了当前版）。版本一致才接受；不一致说明该源
                    //   还缓存着旧文件，跳过它，最终会落到 raw 源头（GitHub 无缓存、必是仓库最新）。
                    if (dlVer && dlVer === String(raw.rev).trim()) {
                        ok = true;
                        break;
                    }
                    lastFail = `${host}：下到 v${dlVer || '?'} ≠ 云端 v${raw.rev}（CDN缓存旧版，跳过试下一个源）`;
                    await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`, 2000);
                    continue;
                }
                const why = [];
                if (!sizeOk) why.push(`文件过小 ${dsz || 0}B`);
                if (!sigOk) why.push(`签名出现 ${dcnt || 0} 次(应为2，文件可能损坏或内容重复)`);
                lastFail = `${host}：${why.join('；')}`;
                await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`, 2000);
            }
            if (!ok) {
                flow.fail(`更新中止：${lastFail || '无可用下载源'}。若为刚推送的版本，可能是 CDN 缓存未刷新，请稍后重试`);
                _sdmUpdating = false; return;
            }
            flow.setStep('dl_js', 'done');

            // 以文件真实版本为准，避免把 3.5.5 的文件登记成 3.5.4 导致反复提示更新
            const finalVer = dlVer || String(raw.rev).trim();
            flow.setStep('deploy', 'running');
            await _sdmRun(`mkdir -p ${_sdmSq(SDM_DATA_DIR)}`);
            await _sdmRun(`echo ${_sdmSq(finalVer)} > ${_sdmSq(SDM_VERSION_FILE)}`);
            await _sdmApplyJs(finalVer);
            flow.setStep('deploy', 'done');

            flow.setStep('complete', 'done');
            flow.done();
            setTimeout(() => _sdmShowChangelog(finalVer, raw), 500);
        } catch (e) {
            flow.fail(e?.message || String(e));
        } finally {
            _sdmUpdating = false;
            if (btn) btn.classList.remove('loading');
        }
    };

    // 后台静默检查（面板展开时触发）
    const _sdmBgCheck = () => {
        _sdmReadVer().then((devVer) => {
            if (!devVer) return;
            _sdmGetManifest(devVer).then((raw) => {
                if (!raw || _sdmCmpVer(raw.rev, devVer) <= 0) return;
                _sdmManifest = raw;
                const btn = document.querySelector('#sdm_check_update_btn');
                if (btn) {
                    btn.classList.add('has-update');
                    const icon = btn.querySelector('.sdm-btn-icon');
                    if (icon) icon.textContent = '🎉';
                    if (!document.querySelector('#sdm_update_badge')) {
                        btn.insertAdjacentHTML('beforeend', `<span id="sdm_update_badge" class="sdm-update-badge">NEW</span>`);
                    }
                }
            }).catch(() => {});
        });
    };

    // 版本文件自愈：始终与当前运行代码的版本对齐（手动导入新文件后自动修正，避免检查更新走错入口）
    _sdmRun(`mkdir -p ${_sdmSq(SDM_DATA_DIR)}`).then(async () => {
        const fv = await _sdmReadVer();
        if (fv !== PLUGIN_VERSION) await _sdmRun(`echo ${_sdmSq(PLUGIN_VERSION)} > ${_sdmSq(SDM_VERSION_FILE)}`);
    });

    // 启动自检：清理重复的插件块（保留版本最新的一个，彻底解决新旧版本共存冲突）
    const _sdmCleanup = async () => {
        try {
            const currentText = await getCustomHead();
            if (!currentText || !currentText.includes(SDM_SIG)) return;
            const _esc = s => s.replace(/[\[\]]/g, (c) => '\\' + c);
            const sP = '<!-- [KANO_PLUGIN_START]';
            const sE = '<!-- [KANO_PLUGIN_END]';
            const pluginRegex = new RegExp(_esc(sP) + '\\s*(.*?)\\s*-->([\\s\\S]*?)' + _esc(sE) + '\\s*\\1\\s*-->', 'g');
            const blocks = [];
            let _cm;
            while ((_cm = pluginRegex.exec(currentText)) !== null) {
                if (_cm[2].includes(SDM_SIG)) {
                    const vm = _cm[2].match(/const PLUGIN_VERSION = '([^']*)'/);
                    blocks.push({ full: _cm[0], ver: vm ? vm[1] : '0.0.0' });
                }
            }
            if (blocks.length <= 1) return;
            const best = blocks.slice().sort((x, y) => _sdmCmpVer(y.ver, x.ver))[0];
            let newText = currentText;
            for (const b of blocks) {
                if (b === best) continue;
                const idx = newText.indexOf(b.full);
                if (idx >= 0) newText = newText.slice(0, idx) + newText.slice(idx + b.full.length);
            }
            if (newText !== currentText) {
                await setCustomHead(newText);
                if (typeof createToast === 'function') createToast('已自动清理重复的旧版本代码，刷新后生效', 'green', 4000);
            }
        } catch (e) {}
    };
    setTimeout(() => { _sdmCleanup(); }, 1500);

    // ════════════════════════════════════════════════════════════
    // SDMUpdater — 全局更新管理器（精简版，供子插件注册）
    // 完整版在 updater/sdm-updater.js
    // ════════════════════════════════════════════════════════════
    if (typeof window.SDMUpdater === 'undefined') {
        window.SDMUpdater = {
            version: '1.0.0',
            _registry: [],
            register: function(info) {
                if (!info || !info.id) return;
                var existing = this._registry.findIndex(function(x) { return x.id === info.id; });
                if (existing >= 0) this._registry[existing] = info;
                else this._registry.push(info);
            },
            checkAll: async function(plugins) {
                try {
                    var r = await fetch('https://api.github.com/repos/xiaoyutxy/my-pIugins/releases/latest');
                    var rel = await r.json();
                    var manifest = null;
                    try { manifest = JSON.parse(rel.body.match(/```json\n([\s\S]*?)\n```/)?.[1] || '{}'); } catch(_) {}
                    return (plugins || this._registry).map(function(p) {
                        var cloud = manifest && (manifest.plugins||[]).find(function(x){return x.id===p.id;});
                        return { id: p.id, name: p.name, localVersion: p.version, cloudVersion: cloud?cloud.version:rel.tag_name, hasUpdate: cloud?cloud.version!==p.version:false, file: cloud?cloud.file:p.file };
                    });
                } catch(e) {
                    return (plugins || this._registry).map(function(p) { return { id: p.id, name: p.name, localVersion: p.version, cloudVersion: null, hasUpdate: false }; });
                }
            }
        };
    }

    // ════════════════════════════════════════════════════════════
    // 子插件加载器
    // 从 GitHub/jsDelivr 拉取 7 个子插件并在当前作用域执行
    // 优先读本地缓存（/data/sdm/plugins/），无缓存才联网拉取
    // ════════════════════════════════════════════════════════════
    const SDM_SUB_PLUGINS = [
        { id: 'sdm-core',     file: 'plugins/sdm-core.js',     version: '3.6.9.1' },
        { id: 'sdm-music',    file: 'plugins/sdm-music.js',    version: '3.6.9.1' },
        { id: 'sdm-ai',       file: 'plugins/sdm-ai.js',       version: '3.6.9.1' },
        { id: 'sdm-nettools', file: 'plugins/sdm-nettools.js', version: '3.6.9.1' },
        { id: 'sdm-hotspot',  file: 'plugins/sdm-hotspot.js',  version: '3.6.9.1' },
        { id: 'sdm-battery',  file: 'plugins/sdm-battery.js',  version: '3.6.9.1' },
        { id: 'sdm-pet',      file: 'plugins/sdm-pet.js',      version: '3.6.9.1' }
    ];
    const SDM_PLUGIN_CACHE_DIR = '/data/sdm/plugins';

    // CDN 源列表：国内优先，海外后备
    // 短超时(5s)快速失败，逐源尝试
    const SDM_CDN_SOURCES = [
        // 国内镜像优先（直连快）
        (f) => `https://jsd.onmicrosoft.cn/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://cdn.jsdmirror.com/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://testingcf.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/${f}`,
        // jsDelivr 官方
        (f) => `https://cdn.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://fastly.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/${f}`,
        // GitHub 代理（国内可达）
        (f) => `https://mirror.ghproxy.com/https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/${f}`,
        (f) => `https://gh-proxy.com/https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/${f}`,
        // GitHub raw 直连（最后兜底）
        (f) => `https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/${f}`,
    ];

    // 执行子插件代码：用 script 标签注入而非 new Function
    // 这样代码在全局作用域执行，与原单体文件行为一致
    const _sdmExecPluginCode = (code, pluginId) => {
        const script = document.createElement('script');
        script.textContent = code;
        script.setAttribute('data-sdm-plugin', pluginId);
        document.head.appendChild(script);
    };

    const _sdmLoadSubPlugin = async (plugin) => {
        const cacheFile = `${SDM_PLUGIN_CACHE_DIR}/${plugin.id}.js`;
        const verFile = `${SDM_PLUGIN_CACHE_DIR}/${plugin.id}.ver`;

        // 1. 先读本地缓存版本
        const cachedVer = await _sdmRun(`cat ${_sdmSq(verFile)} 2>/dev/null || echo ''`, 3000);
        const cv = String(cachedVer?.content || '').trim();

        if (cv === plugin.version) {
            // 缓存版本匹配，直接读缓存文件
            const r = await _sdmRun(`cat ${_sdmSq(cacheFile)}`, 10000);
            const code = String(r?.content || '').trim();
            if (code.length > 100) {
                try {
                    _sdmExecPluginCode(code, plugin.id);
                    return { id: plugin.id, ok: true, from: 'cache' };
                } catch (e) {
                    // 缓存代码执行失败，删除缓存走联网
                    await _sdmRun(`rm -f ${_sdmSq(cacheFile)} ${_sdmSq(verFile)}`, 2000);
                }
            }
        }

        // 2. 联网拉取：多 CDN 源逐个尝试，短超时快速失败
        const tmp = `/data/local/tmp/_sdm_sub_${plugin.id}.js`;
        const triedUrls = [];

        for (let i = 0; i < SDM_CDN_SOURCES.length; i++) {
            const src = SDM_CDN_SOURCES[i](plugin.file);
            triedUrls.push(src);
            // 5s 连接超时 + 20s 最大超时，快速失败
            const dl = await _sdmRun(`curl -sL --fail --connect-timeout 5 --max-time 20 ${_sdmSq(src)} -o ${_sdmSq(tmp)} 2>/dev/null; ec=$?; [ "\$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:\$ec`, 25000);
            if (!String(dl?.content || '').includes('__OK__')) {
                await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);
                continue;
            }

            const r = await _sdmRun(`cat ${_sdmSq(tmp)}`, 15000);
            const code = String(r?.content || '').trim();
            if (code.length < 100) {
                await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);
                continue;
            }

            // 校验：确保下载的是 var 版本（非 const），防止 CDN 缓存旧版导致 SyntaxError 静默失败
            if (code.includes('const PLUGIN_ID =') || code.includes('const PLUGIN_VERSION =')) {
                // CDN 缓存了旧的 const 版本，跳过此源试下一个
                await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);
                continue;
            }

            // 执行子插件代码（全局作用域注入）
            try {
                _sdmExecPluginCode(code, plugin.id);
            } catch (e) {
                await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);
                continue;
            }

            // 写入本地缓存
            await _sdmRun(`mkdir -p ${_sdmSq(SDM_PLUGIN_CACHE_DIR)}`, 2000);
            await _sdmRun(`cp ${_sdmSq(tmp)} ${_sdmSq(cacheFile)} && echo ${_sdmSq(plugin.version)} > ${_sdmSq(verFile)}`, 5000);
            await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);

            return { id: plugin.id, ok: true, from: 'network', src: src };
        }

        return { id: plugin.id, ok: false, error: '所有源下载失败', tried: triedUrls };
    };

    // 加载所有子插件（顺序加载，保持与原单体文件相同的初始化顺序）
    const _sdmLoadAllPlugins = async () => {
        const results = [];
        let okCount = 0;
        let failCount = 0;
        for (const plugin of SDM_SUB_PLUGINS) {
            const r = await _sdmLoadSubPlugin(plugin);
            results.push(r);
            if (r.ok) okCount++; else failCount++;
        }
        if (failCount > 0) {
            const failed = results.filter(r => !r.ok).map(r => r.id).join(', ');
            if (typeof createToast === 'function') {
                createToast(`${okCount}/${SDM_SUB_PLUGINS.length} 个插件已加载，${failCount} 个加载失败: ${failed}`, 'yellow', 6000);
            }
            // 写诊断日志到文件，方便排查
            const diag = results.map(r => {
                if (r.ok) return `[${r.id}] OK (${r.from})`;
                const tried = (r.tried || []).map(u => '  - ' + u).join('\n');
                return `[${r.id}] FAIL\n${tried}`;
            }).join('\n');
            await _sdmRun(`echo ${_sdmSq(diag)} > /data/local/tmp/_sdm_load_diag.txt`, 3000);
        } else if (okCount === SDM_SUB_PLUGINS.length) {
            if (typeof createToast === 'function') {
                createToast(`全部 ${okCount} 个插件加载完成`, 'green', 2000);
            }
        }
        // 后台检查更新
        setTimeout(() => _sdmBgCheck(), 3000);
    };

    // 延迟 500ms 启动子插件加载（等更新管理器初始化完成）
    setTimeout(() => { _sdmLoadAllPlugins(); }, 500);

} catch (e) {
    if (typeof createToast === 'function') createToast('SDM 初始化失败: ' + (e?.message || e), 'red', 5000);
    console.error('[SDM] init error:', e);
}
})();
// ── SDM Main 结束 ──