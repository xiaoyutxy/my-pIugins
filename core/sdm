//<script>
//@@SDM_CORE_PLUGIN_ID:sdm-core-modular@@
(async () => {
try {
    // ════════════════════════════════════════════════════════════
    //  SDM 模块化核心框架 v1.1.0
    //  - 管理5个独立模块的安装/更新/加载
    //  - 每个模块独立版本号，独立从 GitHub 更新
    //  - 安装时自动组合所有已安装模块
    // ════════════════════════════════════════════════════════════
    const CORE_VERSION = '1.1.0';
    const CORE_SIG = '@@SDM_CORE_PLUGIN_ID:sdm-core-modular@@';

    // ─── GitHub 仓库配置 ───
    const MY_GITHUB_USER = 'xiaoyutxy';
    const MY_GITHUB_REPO = 'my-pIugins';
    const MY_GITHUB_BRANCH = 'main';
    // ──────────────────────

    const CDN_ORIGIN = 'cdn.jsdelivr.net';
    const CDN_MIRRORS = ['fastly.jsdelivr.net', 'testingcf.jsdelivr.net', 'cdn.jsdmirror.com', 'jsd.onmicrosoft.cn'];
    const GH_BASE = `https://${CDN_ORIGIN}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/`;
    const RAW_BASE = `https://raw.githubusercontent.com/${MY_GITHUB_USER}/${MY_GITHUB_REPO}/${MY_GITHUB_BRANCH}/`;

    const DATA_DIR = '/data/sdm-modular';
    const VERSION_FILE = DATA_DIR + '/.versions.json';
    const MODULES_DIR = DATA_DIR + '/modules';

    // 5个模块定义
    const MODULE_DEFS = [
        { id: 'device-manager', name: '设备管理器', icon: '📱', desc: '设备扫描、活动日志、网络诊断', color: '#7dd3fc' },
        { id: 'ai-assistant',   name: 'AI智能助手', icon: '🤖', desc: 'PicoClaw聊天、设备巡检、网络监控', color: '#c084fc' },
        { id: 'signal-monitor', name: '5G信号监控', icon: '📶', desc: '信号强度监控、质量图表分析', color: '#86efac' },
        { id: 'hotspot-monitor',name: '热点流量监控', icon: '🔥', desc: '热点设备管理、流量统计', color: '#fbbf24' },
        { id: 'game-booster',   name: '游戏加速与限速', icon: '🎮', desc: '游戏加速器、去云控限速', color: '#f472b6' }
    ];

    // 全局状态
    let _installedModules = {};
    let _moduleVersions = {};       // { moduleId: latestVersion }
    let _moduleLoaded = {};
    let _bestCdnNode = null;
    let _probeTs = 0;
    let _updating = false;

    // ─── 工具函数 ───
    const _sq = (v) => `'${String(v ?? '').replace(/'/g, `'\''`)}'`;
    const _wait = (ms) => new Promise(r => setTimeout(r, ms));
    const _run = async (cmd, timeout = 30000) => {
        try { const r = await runShellWithRoot(cmd, timeout); return r || { success: false, content: '' }; }
        catch (e) { return { success: false, content: '', error: e?.message || String(e) }; }
    };

    const _cmpVer = (a, b) => {
        const pa = String(a || '0').split('.').map(n => parseInt(n) || 0);
        const pb = String(b || '0').split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
        return 0;
    };

    // ─── CDN 节点探测 ───
    const _probeCdn = async () => {
        if (_bestCdnNode && Date.now() - _probeTs < 300000) return _bestCdnNode;
        const candidates = [CDN_ORIGIN, ...CDN_MIRRORS];
        const probeOne = async (node) => {
            const testUrl = `https://${node}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/modules/device-manager.js?_=${Date.now()}`;
            const start = Date.now();
            const r = await _run(`curl -sL --connect-timeout 3 --max-time 5 -w '%{http_code}' -o /dev/null ${_sq(testUrl)}`, 8000).catch(() => ({ content: '0' }));
            return { node, rtt: Date.now() - start, ok: String(r?.content || '').trim() === '200' };
        };
        const results = await Promise.all(candidates.map(probeOne));
        const ok = results.filter(r => r.ok).sort((a, b) => a.rtt - b.rtt);
        _bestCdnNode = ok.length > 0 ? ok[0].node : CDN_MIRRORS[0];
        _probeTs = Date.now();
        return _bestCdnNode;
    };

    // ─── 读取/保存版本信息 ───
    const _readVersions = async () => {
        const r = await _run(`mkdir -p ${_sq(DATA_DIR)} ${_sq(MODULES_DIR)} 2>/dev/null; cat ${_sq(VERSION_FILE)} 2>/dev/null || echo '{}'`, 3000);
        try { return JSON.parse(r?.content || '{}') || {}; } catch { return {}; }
    };

    const _saveVersions = async (versions) => {
        const json = JSON.stringify(versions, null, 2);
        await _run(`echo ${_sq(json)} > ${_sq(VERSION_FILE)}`, 2000);
    };

    // ─── 从 JS 文件头部解析版本号 ───
    const _parseVersionFromCode = (code) => {
        const match = code.match(/\/\/\s*Version:\s*(\d+\.\d+\.\d+)/i);
        return match ? match[1] : null;
    };

    // ─── 获取模块最新版本（下载文件头部解析）───
    const _fetchModuleVersion = async (moduleId) => {
        const t = Date.now();
        const jsFile = `modules/${moduleId}.js`;
        const srcs = [RAW_BASE + jsFile + '?t=' + t];
        for (const node of [CDN_ORIGIN, ...CDN_MIRRORS]) {
            srcs.push(`https://${node}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/${jsFile}?_=${t}`);
        }

        const jobs = srcs.map(async (url) => {
            const tmp = `/data/local/tmp/_sdmmv_${moduleId}_${Math.random().toString(36).slice(2,7)}.tmp`;
            // 只下载前 500 字节来检查版本
            const r = await _run(`curl -sL --fail --connect-timeout 5 --max-time 15 -r 0-499 ${_sq(url)} -o ${_sq(tmp)} 2>/dev/null; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`, 20000);
            if (!String(r?.content || '').includes('__OK__')) { await _run(`rm -f ${_sq(tmp)}`, 1000); return null; }
            const rd = await _run(`cat ${_sq(tmp)}`, 3000);
            await _run(`rm -f ${_sq(tmp)}`, 1000);
            const text = String(rd?.content || '');
            const ver = _parseVersionFromCode(text);
            return ver;
        });

        const got = await Promise.all(jobs);
        let bestVer = null;
        for (const v of got) { if (v && (!bestVer || _cmpVer(v, bestVer) > 0)) bestVer = v; }
        return bestVer;
    };

    // ─── 下载模块 JS 文件 ───
    const _downloadModule = async (moduleId) => {
        const bestNode = await _probeCdn();
        const nodes = [bestNode, ...CDN_MIRRORS.filter(m => m !== bestNode), CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);

        const jsPath = `modules/${moduleId}.js`;
        const cdnUrl = `https://${CDN_ORIGIN}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/${jsPath}`;
        const rawUrl = `${RAW_BASE}${jsPath}`;
        const srcList = [...nodes.map(n => cdnUrl.replace(CDN_ORIGIN, n)), rawUrl].filter((v, i, a) => a.indexOf(v) === i);

        const destFile = `${MODULES_DIR}/${moduleId}.js`;
        for (const src of srcList) {
            const dlR = await _run(`curl -sL --fail --connect-timeout 8 --max-time 90 ${_sq(src)} -o ${_sq(destFile)}; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`, 95000);
            if (String(dlR?.content || '').includes('__OK__')) {
                const chk = await _run(`wc -c < ${_sq(destFile)}`, 2000);
                const size = parseInt(chk?.content || '0');
                if (size > 500) return destFile;
            }
        }
        return null;
    };

    // ─── 安装/更新单个模块 ───
    const _installModule = async (moduleId) => {
        const jsFile = await _downloadModule(moduleId);
        if (!jsFile) throw new Error('模块下载失败');

        // 读取并校验模块代码
        const r = await _run(`base64 ${_sq(jsFile)} | tr -d '\\n'`, 15000);
        const b64 = String(r?.content || '').trim();
        if (!b64 || b64.length < 200) throw new Error('模块文件异常');

        let moduleCode;
        try { moduleCode = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
        catch (e) { throw new Error('模块解码失败'); }

        // 校验模块签名
        const moduleSig = `@@SDM_MODULE_${moduleId}@@`;
        if (!moduleCode.includes(moduleSig)) {
            throw new Error('模块签名校验失败，文件可能被篡改');
        }

        // 从代码中解析版本号
        const version = _parseVersionFromCode(moduleCode) || '1.0.0';

        // 保存版本
        _installedModules[moduleId] = version;
        await _saveVersions(_installedModules);

        return { version, code: moduleCode };
    };

    // ─── 加载已安装的模块 ───
    const _loadModule = async (moduleId) => {
        if (_moduleLoaded[moduleId]) return true;
        const jsFile = `${MODULES_DIR}/${moduleId}.js`;
        const chk = await _run(`[ -s ${_sq(jsFile)} ] && echo EXISTS || echo NONE`, 2000);
        if (!String(chk?.content || '').includes('EXISTS')) return false;

        const r = await _run(`base64 ${_sq(jsFile)} | tr -d '\\n'`, 15000);
        const b64 = String(r?.content || '').trim();
        if (!b64) return false;

        try {
            const code = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
            const fn = new Function('SDM', code);
            fn(window.SDM);
            _moduleLoaded[moduleId] = true;
            return true;
        } catch (e) {
            console.error('[SDM] 模块加载失败:', moduleId, e);
            return false;
        }
    };

    // ─── 卸载模块 ───
    const _unloadModule = async (moduleId) => {
        window.SDM?.emit('module:unload', moduleId);
        _moduleLoaded[moduleId] = false;
        await _run(`rm -f ${_sq(MODULES_DIR + '/' + moduleId + '.js')}`, 2000);
        delete _installedModules[moduleId];
        await _saveVersions(_installedModules);
    };

    // ════════════════════════════════════════════════════════════
    //  事件总线
    // ════════════════════════════════════════════════════════════
    const _eventBus = {
        _listeners: {},
        on(event, callback) {
            if (!this._listeners[event]) this._listeners[event] = [];
            this._listeners[event].push(callback);
        },
        off(event, callback) {
            if (!this._listeners[event]) return;
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        },
        emit(event, ...args) {
            if (!this._listeners[event]) return;
            this._listeners[event].forEach(cb => {
                try { cb(...args); } catch (e) { console.error('[SDM Event]', event, e); }
            });
        }
    };

    // ════════════════════════════════════════════════════════════
    //  SDM 全局 API
    // ════════════════════════════════════════════════════════════
    window.SDM = {
        version: CORE_VERSION,
        modules: MODULE_DEFS,
        installed: _installedModules,
        loaded: _moduleLoaded,
        on: _eventBus.on.bind(_eventBus),
        off: _eventBus.off.bind(_eventBus),
        emit: _eventBus.emit.bind(_eventBus),
        runShell: _run,
        wait: _wait,
        toast: (msg, color, dur) => {
            try { if (typeof createToast === 'function') createToast(msg, color || 'green', dur || 2000); } catch(e) {}
        },
        getContainer: () => document.getElementById('sdm-modules-container'),
        registerPanel: (moduleId, panelHtml) => {
            const container = document.getElementById('sdm-modules-container');
            if (!container) return;
            const wrapper = document.createElement('div');
            wrapper.id = `sdm-panel-${moduleId}`;
            wrapper.className = 'sdm-module-panel';
            wrapper.innerHTML = panelHtml;
            container.appendChild(wrapper);
        }
    };

    // ════════════════════════════════════════════════════════════
    //  主 UI 渲染
    // ════════════════════════════════════════════════════════════
    const _renderUI = () => {
        const css = `
        #SDM_CORE_WRAPPER { width:100%; margin-top:10px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
        .sdm-core-banner { background:linear-gradient(135deg,rgba(167,139,250,.15),rgba(244,114,182,.12)); border:1px solid rgba(196,132,252,.3); border-radius:16px; padding:14px; margin-bottom:12px; text-align:center; }
        .sdm-core-banner .title { font-size:.75rem; font-weight:800; background:linear-gradient(135deg,#a78bfa,#f472b6); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .sdm-core-banner .sub { font-size:.5rem; opacity:.6; margin-top:4px; }
        .sdm-core-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
        .sdm-core-btn { font-size:.55rem; padding:6px 14px; border-radius:10px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06); color:#fff; cursor:pointer; transition:all .2s; }
        .sdm-core-btn:hover { transform:translateY(-1px); background:rgba(255,255,255,.1); }
        .sdm-core-btn.primary { background:linear-gradient(135deg,#a78bfa,#8b5cf6); border-color:rgba(167,139,250,.5); }
        .sdm-version-badge { display:inline-block; font-size:.45rem; font-weight:bold; color:#fff; background:linear-gradient(135deg,#a78bfa,#f472b6); padding:2px 9px; border-radius:10px; box-shadow:0 1px 6px rgba(244,114,182,.35); border:1px solid rgba(255,214,232,.35); }
        .sdm-modules-grid { display:grid; grid-template-columns:1fr; gap:10px; }
        @media (min-width:500px) { .sdm-modules-grid { grid-template-columns:1fr 1fr; } }
        .sdm-module-card { background:linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.02)); border:1px solid rgba(255,255,255,.1); border-radius:14px; padding:12px; transition:all .25s; position:relative; overflow:hidden; }
        .sdm-module-card:hover { border-color:rgba(255,255,255,.2); transform:translateY(-2px); }
        .sdm-module-card .icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; margin-bottom:8px; }
        .sdm-module-card .name { font-size:.65rem; font-weight:700; color:#fff; margin-bottom:4px; }
        .sdm-module-card .desc { font-size:.5rem; color:#94a3b8; line-height:1.5; margin-bottom:10px; min-height:32px; }
        .sdm-module-card .status-row { display:flex; align-items:center; justify-content:space-between; }
        .sdm-module-card .ver { font-size:.45rem; color:#64748b; }
        .sdm-module-card .ver.installed { color:#86efac; }
        .sdm-module-card .install-btn { font-size:.5rem; padding:4px 12px; border-radius:8px; border:none; cursor:pointer; font-weight:600; transition:all .2s; }
        .sdm-module-card .install-btn.install { background:linear-gradient(135deg,#4ade80,#22c55e); color:#052e16; }
        .sdm-module-card .install-btn.update { background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#422006; animation:sdm-pulse 2s ease-in-out infinite; }
        .sdm-module-card .install-btn.uninstall { background:rgba(248,113,113,.2); color:#fca5a5; border:1px solid rgba(248,113,113,.3); }
        .sdm-module-card .install-btn:hover { transform:scale(1.05); }
        .sdm-module-card .badge { position:absolute; top:8px; right:8px; font-size:.4rem; padding:2px 8px; border-radius:8px; font-weight:600; }
        .sdm-module-card .badge.installed { background:rgba(74,222,128,.2); color:#86efac; }
        .sdm-module-card .badge.update { background:rgba(251,191,36,.2); color:#fbbf24; animation:sdm-pulse 2s ease-in-out infinite; }
        @keyframes sdm-pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
        .sdm-progress-mask { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,.6); z-index:999999; display:flex; align-items:center; justify-content:center; }
        .sdm-progress-box { width:88vw; max-width:340px; background:linear-gradient(135deg,rgba(20,18,35,.97),rgba(35,28,55,.97)); border:1px solid rgba(196,132,252,.4); border-radius:16px; padding:16px; color:#fff; }
        .sdm-progress-box .title { font-size:.7rem; font-weight:700; margin-bottom:10px; }
        .sdm-progress-step { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:.55rem; }
        .sdm-progress-bar { height:4px; background:rgba(255,255,255,.1); border-radius:2px; margin:8px 0; overflow:hidden; }
        .sdm-progress-bar-inner { height:100%; background:linear-gradient(90deg,#4ade80,#22c55e); transition:width .3s; }
        .sdm-fade-in { animation:sdm-fade-in .25s ease; }
        @keyframes sdm-fade-in { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
        #sdm-modules-container { margin-top:10px; }
        .sdm-module-panel { margin-bottom:10px; }
        `;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.id = 'SDM_CORE_WRAPPER';
        wrapper.innerHTML = `
            <div class="sdm-core-banner">
                <div class="title">🌸 SDM 模块化插件中心 🌸</div>
                <div class="sub">5大模块 · 独立更新 · 按需安装 · 自由组合</div>
            </div>
            <div class="sdm-core-toolbar">
                <span class="sdm-version-badge">核心 v${CORE_VERSION}</span>
                <button class="sdm-core-btn primary" id="sdm_check_all_updates">🔄 检查所有更新</button>
                <button class="sdm-core-btn" id="sdm_show_modules">📦 模块管理</button>
                <span style="font-size:.4rem;opacity:.5;margin-left:auto">已安装 <span id="sdm_installed_count">0</span>/5</span>
            </div>
            <div class="collapse" id="collapse_sdm_modules" data-name="close" style="height:0px;overflow:hidden;">
                <div class="collapse_box">
                    <div class="sdm-modules-grid" id="sdm_modules_grid"></div>
                </div>
            </div>
            <div id="sdm-modules-container"></div>
        `;

        const target = document.querySelector('.functions-container') || document.body;
        if (target.tagName === 'BODY') {
            document.body.appendChild(wrapper);
        } else {
            target.insertAdjacentElement('afterend', wrapper);
        }

        document.getElementById('sdm_show_modules').onclick = () => {
            const collapseEl = document.getElementById('collapse_sdm_modules');
            if (collapseEl.style.height === '0px' || !collapseEl.style.height) {
                collapseEl.style.height = collapseEl.scrollHeight + 'px';
                collapseEl.dataset.name = 'open';
            } else {
                collapseEl.style.height = '0px';
                collapseEl.dataset.name = 'close';
            }
        };

        document.getElementById('sdm_check_all_updates').onclick = _checkAllUpdates;

        _renderModuleCards();
        _updateInstalledCount();
    };

    const _renderModuleCards = () => {
        const grid = document.getElementById('sdm_modules_grid');
        if (!grid) return;

        grid.innerHTML = MODULE_DEFS.map(m => {
            const installed = _installedModules[m.id];
            const latest = _moduleVersions[m.id];
            const hasUpdate = installed && latest && _cmpVer(latest, installed) > 0;
            const isInstalled = !!installed;

            let badgeHtml = '';
            let btnHtml = '';
            let verHtml = '';

            if (isInstalled) {
                verHtml = `<span class="ver installed">v${installed}</span>`;
                if (hasUpdate) {
                    badgeHtml = `<span class="badge update">可更新 v${latest}</span>`;
                    btnHtml = `<button class="install-btn update" data-module="${m.id}" data-action="update">更新</button>`;
                } else {
                    badgeHtml = `<span class="badge installed">已安装</span>`;
                    btnHtml = `<button class="install-btn uninstall" data-module="${m.id}" data-action="uninstall">卸载</button>`;
                }
            } else {
                verHtml = `<span class="ver">未安装</span>`;
                btnHtml = `<button class="install-btn install" data-module="${m.id}" data-action="install">安装</button>`;
                if (latest) {
                    verHtml = `<span class="ver">最新 v${latest}</span>`;
                }
            }

            return `
            <div class="sdm-module-card sdm-fade-in">
                ${badgeHtml}
                <div class="icon" style="background:${m.color}22;">${m.icon}</div>
                <div class="name">${m.name}</div>
                <div class="desc">${m.desc}</div>
                <div class="status-row">
                    ${verHtml}
                    ${btnHtml}
                </div>
            </div>
            `;
        }).join('');

        grid.querySelectorAll('.install-btn').forEach(btn => {
            btn.onclick = () => {
                const moduleId = btn.dataset.module;
                const action = btn.dataset.action;
                _handleModuleAction(moduleId, action);
            };
        });
    };

    const _updateInstalledCount = () => {
        const el = document.getElementById('sdm_installed_count');
        if (el) el.textContent = Object.keys(_installedModules).length;
    };

    // ─── 安装进度弹窗 ───
    const _showProgress = (title, steps) => {
        const mask = document.createElement('div');
        mask.className = 'sdm-progress-mask';
        const st = {};
        steps.forEach(s => st[s.id] = 'pending');

        const render = () => {
            const pct = Math.round(steps.filter(s => st[s.id] === 'done').length / steps.length * 100);
            const ICONS = { pending: '○', running: '⏳', done: '✓', failed: '✗' };
            const COLORS = { pending: '#64748b', running: '#60a5fa', done: '#86efac', failed: '#f87171' };
            const rows = steps.map(s => `
                <div class="sdm-progress-step" style="color:${COLORS[st[s.id]]}">
                    <span>${ICONS[st[s.id]]}</span>
                    <span>${s.label}</span>
                </div>
            `).join('');
            mask.innerHTML = `
                <div class="sdm-progress-box sdm-fade-in">
                    <div class="title">${title}</div>
                    <div class="sdm-progress-bar"><div class="sdm-progress-bar-inner" style="width:${pct}%"></div></div>
                    ${rows}
                </div>
            `;
        };

        document.body.appendChild(mask);
        render();

        return {
            setStep: (id, s) => { if (st[id] !== undefined) { st[id] = s; render(); } },
            close: () => mask.remove(),
            fail: (msg) => {
                steps.forEach(s => { if (st[s.id] === 'pending') st[s.id] = 'failed'; });
                render();
                setTimeout(() => mask.remove(), 2000);
            }
        };
    };

    // ─── 处理模块操作 ───
    const _handleModuleAction = async (moduleId, action) => {
        if (_updating) return;
        _updating = true;

        const moduleDef = MODULE_DEFS.find(m => m.id === moduleId);
        if (!moduleDef) { _updating = false; return; }

        if (action === 'install' || action === 'update') {
            const steps = [
                { id: 'download', label: '下载模块代码' },
                { id: 'install', label: action === 'update' ? '更新模块' : '安装模块' },
                { id: 'load', label: '加载模块' },
                { id: 'done', label: '完成' }
            ];
            const flow = _showProgress(`${action === 'update' ? '更新' : '安装'} ${moduleDef.name}`, steps);

            try {
                flow.setStep('download', 'running');
                flow.setStep('download', 'done');

                flow.setStep('install', 'running');
                const result = await _installModule(moduleId);
                flow.setStep('install', 'done');

                flow.setStep('load', 'running');
                await _loadModule(moduleId);
                flow.setStep('load', 'done');

                flow.setStep('done', 'done');
                _updateInstalledCount();
                _renderModuleCards();

                SDM.toast(`${moduleDef.name} ${action === 'update' ? '更新' : '安装'}成功 v${result.version}`, 'green', 2500);
                setTimeout(() => flow.close(), 800);
            } catch (e) {
                flow.fail(e.message || '安装失败');
                SDM.toast(`${moduleDef.name} ${action === 'update' ? '更新' : '安装'}失败: ${e.message}`, 'red', 3000);
            }
        } else if (action === 'uninstall') {
            if (!confirm(`确定要卸载「${moduleDef.name}」吗？`)) { _updating = false; return; }
            try {
                await _unloadModule(moduleId);
                _updateInstalledCount();
                _renderModuleCards();
                SDM.toast(`${moduleDef.name} 已卸载`, 'yellow', 2000);
            } catch (e) {
                SDM.toast(`卸载失败: ${e.message}`, 'red', 2000);
            }
        }

        _updating = false;
    };

    // ─── 检查所有模块更新 ───
    const _checkAllUpdates = async () => {
        if (_updating) return;
        _updating = true;
        SDM.toast('正在检查更新...', 'yellow', 1500);

        const results = await Promise.all(MODULE_DEFS.map(async (m) => {
            try {
                const ver = await _fetchModuleVersion(m.id);
                if (ver) _moduleVersions[m.id] = ver;
                return { id: m.id, ver };
            } catch { return { id: m.id, ver: null }; }
        }));

        let updateCount = 0;
        results.forEach(r => {
            const installed = _installedModules[r.id];
            if (installed && r.ver && _cmpVer(r.ver, installed) > 0) {
                updateCount++;
            }
        });

        _renderModuleCards();
        _updating = false;

        if (updateCount > 0) {
            SDM.toast(`发现 ${updateCount} 个模块可更新`, 'green', 2500);
        } else {
            SDM.toast('所有模块已是最新', 'green', 2000);
        }
    };

    // ════════════════════════════════════════════════════════════
    //  初始化
    // ════════════════════════════════════════════════════════════
    const _init = async () => {
        _installedModules = await _readVersions();
        _renderUI();

        let loadedCount = 0;
        for (const m of MODULE_DEFS) {
            if (_installedModules[m.id]) {
                const ok = await _loadModule(m.id);
                if (ok) loadedCount++;
            }
        }

        _updateInstalledCount();

        // 延迟检查更新
        setTimeout(async () => {
            for (const m of MODULE_DEFS) {
                try {
                    const ver = await _fetchModuleVersion(m.id);
                    if (ver) _moduleVersions[m.id] = ver;
                } catch {}
            }
            _renderModuleCards();
        }, 2000);

        console.log(`[SDM Core] 初始化完成，已加载 ${loadedCount}/${MODULE_DEFS.length} 个模块`);
    };

    _init().catch(e => {
        console.error('[SDM Core] 初始化失败:', e);
    });

} catch (e) {
    console.error('[SDM Core] 致命错误:', e);
}
})();
//@@SDM_CORE_END@@
