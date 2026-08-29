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
    const PLUGIN_VERSION = '3.5.6'

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

    const _sdmProbeCdn = async () => {
        if (_sdmBestNode) return _sdmBestNode;
        const candidates = [SDM_CDN_ORIGIN, ...SDM_CDN_MIRRORS];
        const results = [];
        for (const node of candidates) {
            const testUrl = `https://${node}/gh/xiaoyutxy/my-pIugins@main/_latest.json?_=${Date.now()}`;
            const start = Date.now();
            const r = await _sdmRun(`curl -sL --connect-timeout 3 --max-time 5 -w '%{http_code}' -o /dev/null ${_sdmSq(testUrl)}`, 8000).catch(() => ({ content: '0' }));
            if (String(r?.content || '').trim() === '200') results.push({ node, rtt: Date.now() - start });
        }
        _sdmBestNode = results.length > 0 ? results.sort((a, b) => a.rtt - b.rtt)[0].node : SDM_CDN_MIRRORS[0];
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

    const _sdmFetchManifest = async (jsonFile) => {
        const t = Date.now();
        // 候选源：GitHub raw（源头无缓存）→ 各CDN节点
        // 注意：jsDelivr 忽略 query string 做缓存 key，?t= 这类时间戳对穿透 CDN 缓存无效，
        // 真正的解法是「并发问所有源，取 rev 最高的那份」——任一节点缓存了旧清单，
        // 只要有一个节点已刷新，就能拿到新版本，不必等所有节点缓存到期。
        const srcs = [SDM_RAW_BASE + jsonFile + '?t=' + t];
        for (const node of [SDM_CDN_ORIGIN, ...SDM_CDN_MIRRORS]) {
            srcs.push(SDM_GH_BASE.replace('https://' + SDM_CDN_ORIGIN, 'https://' + node) + jsonFile + '?_=' + t);
        }
        const jobs = srcs.map(async (url, i) => {
            const tmp = '/data/local/tmp/_sdm_mf_' + i + '.tmp';
            const r = await _sdmRun(`curl -sL --fail --connect-timeout 5 --max-time 15 ${_sdmSq(url)} -o ${_sdmSq(tmp)}; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`, 20000);
            if (!String(r?.content || '').includes('__OK__')) { await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000); return null; }
            const rd = await _sdmRun(`cat ${_sdmSq(tmp)}`, 3000);
            const text = String(rd?.content || '').trim();
            await _sdmRun(`rm -f ${_sdmSq(tmp)}`, 1000);
            if (!text || text[0] !== '{') return null;
            try { const j = JSON.parse(text); return (j.rev && j.js) ? j : null; } catch { return null; }
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
                createToast('当前已是最新版本 v' + curVer, 'green', 3000);
                if (btn) { btn.classList.remove('has-update'); const icon = btn.querySelector('.sdm-btn-icon'); if (icon) icon.textContent = '📦'; const bdg = document.querySelector('#sdm_update_badge'); if (bdg) bdg.remove(); }
                _sdmUpdating = false; if (btn) btn.classList.remove('loading'); return;
            }

            // 保护本地定制版：代码内写死的版本高于云端时，更新等于降级并覆盖本地修改，直接拦下
            if (_sdmCmpVer(PLUGIN_VERSION, String(raw.rev).trim()) > 0) {
                flow.fail(`当前运行 v${PLUGIN_VERSION} 高于云端 v${raw.rev}，本地为定制版，已阻止覆盖安装。确需回退官方版，请手动导入仓库的 sdm.js。`);
                _sdmUpdating = false; if (btn) btn.classList.remove('loading'); return;
            }

            flow.setStep('dl_js', 'running');
            const bestNode = await _sdmProbeCdn();
            const nodes = [bestNode, ...SDM_CDN_MIRRORS.filter(m => m !== bestNode), SDM_CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);
            // GitHub raw 排最前（源头无缓存，杜绝CDN缓存旧文件装错版本），CDN 兜底
            const rawJsUrl = raw.js.replace('https://' + SDM_CDN_ORIGIN + '/gh/', 'https://raw.githubusercontent.com/').replace('@main/', '/');
            // raw.githubusercontent.com 在国内多数网络不可达，排最前会白等一次 connect-timeout(8s)。
            // 改为 CDN 节点优先、raw 兜底：探测到的最快节点通常一次就成，根本轮不到 raw。
            const srcList = [...nodes.map(n => raw.js.replace(SDM_CDN_ORIGIN, n)), rawJsUrl];
            let ok = false;
            let lastFail = '';
            let dlVer = '';
            let verMismatch = '';
            for (const src of srcList) {
                const host = String(src).replace(/^https?:\/\//, '').split('/')[0];
                const r = await _sdmRun(`curl -sL --fail --connect-timeout 8 --max-time 90 ${_sdmSq(src)} -o ${_sdmSq(SDM_PENDING_JS)} && echo __OK__ || echo __FAIL__`, 95000);
                if (!String(r?.content || '').includes('__OK__')) { lastFail = `下载失败（源 ${host}）`; await _sdmRun(`rm -f ${_sdmSq(SDM_PENDING_JS)}`, 2000); continue; }
                // 下载后即时校验：大小合理 + 签名恰好2行（防CDN缓存旧文件被装成新版本 / 文件损坏 / 内容重复）
                const vrf = await _sdmRun(`_s=$(wc -c < ${_sdmSq(SDM_PENDING_JS)} 2>/dev/null || echo 0); _c=$(grep -c 'SDM_PLUGIN''_ID:a1b2c3' ${_sdmSq(SDM_PENDING_JS)} 2>/dev/null || echo 0); _v=$(grep -o "const PLUGIN_VERSION = '[^']*'" ${_sdmSq(SDM_PENDING_JS)} 2>/dev/null | head -1 | sed "s/.*'\\(.*\\)'.*/\\1/"); echo "$_s|$_c|$_v"`, 10000);
                const [dsz, dcnt, dver] = String(vrf?.content || '0|0|').trim().split('|');
                const sizeOk = (parseInt(dsz) || 0) > 100000;
                const sigOk = (parseInt(dcnt) || 0) === 2;
                if (sizeOk && sigOk) {
                    ok = true;
                    dlVer = String(dver || '').trim();
                    // ★ 版本号不再作为硬性拦截条件。文件大小 + 签名次数已足以证明文件完整未损坏，
                    //   而「清单 rev 与仓库 sdm.js 内 PLUGIN_VERSION 对不上」是作者仓库常见的漏同步
                    //   （实测：_latest.json 停在 3.5.4，sdm.js 已到 3.5.5），硬卡这一条会导致
                    //   所有源全部校验失败、用户永远更新不了，明明文件早就下下来了。
                    if (dlVer && dlVer !== String(raw.rev).trim()) {
                        verMismatch = `云端清单 rev(${raw.rev}) 与 sdm.js 实际版本(${dlVer}) 不一致，已按文件真实版本安装`;
                    }
                    break;
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
            if (verMismatch) setTimeout(() => createToast(verMismatch, 'yellow', 6000), 900);
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
    // 以下是原插件代码
    // ════════════════════════════════════════════════════════════
    // ===== 热点流量监控数据文件（从第二个插件读取，不修改第二个插件） =====
    const HOTSPOT_DATA_FILE = '/data/hotspot_traffic/data.json'
    const HOTSPOT_DATA_FALLBACK = '/sdcard/hotspot_traffic_data.json'
    const HOTSPOT_POLICY_FILE = '/data/hotspot_traffic/device_policy.json'
    const HOTSPOT_PID_FILE = '/data/hotspot_traffic/.pid'
    const HOTSPOT_TRAFFIC_PROC = '/data/local/tmp/hotspot_traffic'
    const HOTSPOT_BIN_FILE = '/sdcard/hotspot_traffic'
    const HOTSPOT_BOOT_SH = '/sdcard/ufi_tools_boot.sh'
    const HOTSPOT_BOOT_LINE = 'cp /sdcard/hotspot_traffic ' + HOTSPOT_TRAFFIC_PROC + ' && chmod 755 ' + HOTSPOT_TRAFFIC_PROC + ' && nohup ' + HOTSPOT_TRAFFIC_PROC + ' >/dev/null 2>&1 &'

    // ============ 热点流量监控数据读取（完全按照第二个插件的方式，不修改第二个插件） ============
    const HOTSPOT_CUSTOM_NAMES_FILE = '/data/hotspot_traffic/custom_names.txt'
    const HOTSPOT_LS_PN_PREFIX = 'hotspot_traffic_pn_'
    let _hotspotNameMap = {}
    let _hotspotNameMapCacheTime = 0
    const HOTSPOT_NAME_CACHE_TTL = 30000 // 【网络优化】30秒缓存，避免每次扫描都读取文件

    // 读取自定义设备名称文件（和热点监控插件一致）
    const loadHotspotNameMap = async () => {
        try {
            // 【网络优化】缓存有效期内直接复用，减少shell调用
            if (Date.now() - _hotspotNameMapCacheTime < HOTSPOT_NAME_CACHE_TTL) return
            var r = await runShellWithRoot("timeout 2s awk '{print}' " + HOTSPOT_CUSTOM_NAMES_FILE + " 2>/dev/null || echo ''")
            var map = {}
            var lines = (r && r.content) ? r.content.split('\n') : []
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i]
                var idx = line.indexOf('|')
                if (idx > 0) map[line.slice(0, idx).toUpperCase()] = line.slice(idx + 1).trim()
            }
            _hotspotNameMap = map
            _hotspotNameMapCacheTime = Date.now()
        } catch(e) {
            _hotspotNameMap = {}
        }
    }

    // 完全按照热点监控插件的 resolveDisplayName 逻辑
    const resolveDisplayName = (device) => {
        var uMac = (device.mac || '').toUpperCase()
        // 检查 localStorage 待提交名称（和热点监控插件同一个 key）
        var pendingKey = HOTSPOT_LS_PN_PREFIX + uMac
        var pending = null
        try { pending = localStorage.getItem(pendingKey) } catch(e) {}
        if (pending !== null) {
            return pending || ((device.hostname || '').trim() || '未知设备')
        }
        // 先用自定义名称文件
        var customName = (device.customName || '').trim()
        if (!customName && _hotspotNameMap[uMac]) {
            customName = _hotspotNameMap[uMac]
        }
        return customName || ((device.hostname || '').trim() || '未知设备')
    }

    // 读取热点流量数据（完全按照热点监控插件的 readStatus 方式，用 awk 而非 cat）
    const readHotspotTrafficData = async () => {
        try {
            // 按照热点监控插件方式：awk '{print}' 比 cat 更可靠
            var res = await runShellWithRoot("echo __DATA__ && timeout 3s awk '{print}' " + HOTSPOT_DATA_FILE + " 2>/dev/null || timeout 2s awk '{print}' " + HOTSPOT_DATA_FALLBACK + " 2>/dev/null || echo ''")
            var text = (res && res.content) ? res.content.trim() : ''
            // 提取 __DATA__ 后的内容
            if (text.indexOf('__DATA__') >= 0) {
                text = text.split('__DATA__')[1] || ''
                text = text.trim()
            }
            if (text && text[0] === '{') {
                var parsed = JSON.parse(text)
                if (parsed && parsed.devices && typeof parsed.devices === 'object') {
                    // 同时加载自定义名称文件
                    await loadHotspotNameMap()
                    return parsed
                }
            }
        } catch(e) {
            addDiagLog('读取热点流量数据失败: ' + String(e), 'error')
        }
        return null
    }

    // 同时也检查热点监控版本号
    const readHotspotVersion = async () => {
        try {
            var res = await runShellWithRoot("timeout 2s awk '{print}' /data/hotspot_traffic/.version 2>/dev/null || echo ''")
            return (res && res.content) ? res.content.trim().replace(/^pending:/, '') : ''
        } catch(e) { return '' }
    }

    const readHotspotPolicy = async () => {
        try {
            var res = await runShellWithRoot("timeout 2s awk '{print}' " + HOTSPOT_POLICY_FILE + " 2>/dev/null || echo ''")
            var text = (res && res.content) ? res.content.trim() : ''
            if (text && (text[0] === '{' || text[0] === '[')) {
                return JSON.parse(text)
            }
        } catch(e) {}
        return {}
    }

    // ============ 热点流量监控二进制守护进程管理（完全按照热点监控插件方式） ============
    let _hotspotDaemonChecked = false
    let _hotspotLastRecoverTs = 0
    const checkHotspotDaemon = async () => {
        try {
            // 按照热点监控插件方式：用 awk '{print}' 读取 PID，然后 kill -0 检查
            var checkRes = await runShellWithRoot(
                "_p=$(timeout 1s awk '{print}' " + HOTSPOT_PID_FILE + " 2>/dev/null); " +
                "[ -n \"$_p\" ] && kill -0 \"$_p\" 2>/dev/null && echo running=1 || echo running=0"
            )
            var checkText = (checkRes.content || '').trim()
            if (checkText === 'running=1') return true

            // 冷却 30 秒，避免频繁重启尝试
            if (Date.now() - _hotspotLastRecoverTs < 30000) return false
            _hotspotLastRecoverTs = Date.now()

            // 检查二进制文件是否存在
            var binRes = await runShellWithRoot('[ -f ' + HOTSPOT_BIN_FILE + ' ] && echo exists || echo none')
            if ((binRes.content || '').trim() === 'none') {
                addDiagLog('热点流量监控二进制文件不存在(/sdcard/hotspot_traffic)，请先安装热点流量监控插件', 'error')
                return false
            }

            // 尝试启动（和热点监控插件 recoverDaemonOnce 一致）
            addDiagLog('热点流量监控守护进程未运行，尝试启动...', 'net')
            await runShellWithRoot(
                'cp ' + HOTSPOT_BIN_FILE + ' ' + HOTSPOT_TRAFFIC_PROC + ' && ' +
                'chmod 755 ' + HOTSPOT_TRAFFIC_PROC + ' && ' +
                'nohup ' + HOTSPOT_TRAFFIC_PROC + ' >/dev/null 2>&1 &'
            )
            // 等待守护进程写入 PID
            await new Promise(function(r) { setTimeout(r, 1500) })

            // 重新检查
            var recheckRes = await runShellWithRoot(
                "_p=$(timeout 1s awk '{print}' " + HOTSPOT_PID_FILE + " 2>/dev/null); " +
                "[ -n \"$_p\" ] && kill -0 \"$_p\" 2>/dev/null && echo running=1 || echo running=0"
            )
            if ((recheckRes.content || '').trim() === 'running=1') {
                addDiagLog('热点流量监控守护进程已自动恢复启动', 'success')
                return true
            }
            addDiagLog('热点流量监控守护进程启动失败', 'error')
        } catch(e) {
            addDiagLog('热点守护进程检查失败: ' + String(e), 'error')
        }
        return false
    }

    const collectDeviceInfo = async () => {
        try {
            // 【网络优化】合并5个串行shell调用为1个批量命令，减少网络往返
            var batchCmd = 'echo __PROPS__\n' +
                'getprop ro.product.brand 2>/dev/null; echo "---"; getprop ro.product.model 2>/dev/null; echo "---"; getprop ro.product.device 2>/dev/null; echo "---"; getprop ro.build.version.release 2>/dev/null; echo "---"; getprop ro.board.platform 2>/dev/null; echo "---"; getprop ro.product.manufacturer 2>/dev/null\n' +
                'echo __MAC__\n' +
                'cat /sys/class/net/wlan0/address 2>/dev/null || ip link show wlan0 2>/dev/null | grep ether | awk \'{print $2}\' || echo ""\n' +
                'echo __IP__\n' +
                'ip addr show wlan0 2>/dev/null | grep "inet " | awk \'{print $2}\' | cut -d/ -f1 || echo ""\n' +
                'echo __CARRIER__\n' +
                'getprop gsm.operator.alpha 2>/dev/null || echo ""\n' +
                'echo __ARP__\n' +
                'cat /proc/net/arp 2>/dev/null | grep -v "00:00:00:00:00:00" | grep -v IP | wc -l\n' +
                'echo __END__'
            var batchRes = await runShellWithRoot(batchCmd)
            var batchText = (batchRes.content || '')

            // 解析批量返回的各部分
            var propsText = '', macText = '', ipText = '', carrierText = '', arpText = ''
            if (batchText.indexOf('__PROPS__') >= 0) {
                propsText = batchText.split('__PROPS__')[1] || ''
                propsText = propsText.split('__MAC__')[0] || ''
            }
            if (batchText.indexOf('__MAC__') >= 0) {
                macText = batchText.split('__MAC__')[1] || ''
      
