//<script>
//@@SDM_PLUGIN_ID:a1b2c3@@
(async () => {
try {
    const PLUGIN_VERSION = '4.0.0';

    // ════════════════════════════════════════════════════════════
    //  GitHub 仓库配置
    // ════════════════════════════════════════════════════════════
    const MY_GITHUB_USER = 'xiaoyutxy';
    const MY_GITHUB_REPO = 'my-pIugins';
    const MY_GITHUB_BRANCH = 'main';
    const CDN_ORIGIN = 'cdn.jsdelivr.net';
    const CDN_MIRRORS = ['fastly.jsdelivr.net', 'testingcf.jsdelivr.net', 'cdn.jsdmirror.com', 'jsd.onmicrosoft.cn'];
    const SDM_SIG = '@@SDM_PLUGIN_ID:a1b2c3@@';

    const DATA_DIR = '/data/sdm-modular';
    const VERSION_FILE = DATA_DIR + '/.versions.json';
    const MODULES_DIR = DATA_DIR + '/modules';
    const PENDING_JS = '/data/local/tmp/_sdm_core_pending.js';

    // 5个模块定义
    const MODULE_DEFS = [
        { id: 'device-manager', name: '设备管理器', icon: '📱', desc: '设备扫描、活动日志、网络诊断', color: '#7dd3fc' },
        { id: 'ai-assistant', name: 'AI智能助手', icon: '🤖', desc: 'PicoClaw聊天、设备巡检、网络监控、音乐播放', color: '#c084fc' },
        { id: 'signal-monitor', name: '5G信号监控', icon: '📶', desc: '信号强度监控、质量图表分析', color: '#86efac' },
        { id: 'hotspot-monitor', name: '热点流量监控', icon: '🔥', desc: '热点设备管理、流量统计', color: '#fbbf24' },
        { id: 'game-booster', name: '游戏加速与限速', icon: '🎮', desc: '游戏自动加速、去云控限速', color: '#f472b6' }
    ];

    // 全局状态
    let _installedModules = {};
    let _moduleVersions = {};
    let _moduleLoaded = {};
    let _bestCdnNode = null;
    let _probeTs = 0;
    let _updating = false;
    let ACTIVITY_LOG = [];
    let DIAG_LOG = [];
    let _cachedEls = {};

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
    const getCachedEl = (selector) => {
        if (_cachedEls[selector]) return _cachedEls[selector];
        const el = document.querySelector(selector);
        if (el) _cachedEls[selector] = el;
        return el;
    };

    // ─── 活动日志 / 诊断日志 ───
    const addLog = (msg) => {
        const ts = new Date().toLocaleTimeString();
        ACTIVITY_LOG.unshift('[' + ts + '] ' + msg);
        if (ACTIVITY_LOG.length > 200) ACTIVITY_LOG.pop();
        const el = getCachedEl('#smart_log_area');
        if (el) el.value = ACTIVITY_LOG.join('\n');
    };
    const addDiagLog = (msg, type) => {
        const ts = new Date().toLocaleTimeString();
        const prefix = type === 'error' ? '❌ ' : type === 'success' ? '✅ ' : type === 'net' ? '📡 ' : type === 'warn' ? '⚠️ ' : 'ℹ️ ';
        DIAG_LOG.unshift('[' + ts + '] ' + prefix + msg);
        if (DIAG_LOG.length > 200) DIAG_LOG.pop();
        const el = getCachedEl('#smart_diag_log');
        if (el) el.value = DIAG_LOG.join('\n');
    };

    // ════════════════════════════════════════════════════════════
    //  CDN 节点探测
    // ════════════════════════════════════════════════════════════
    const _probeCdn = async () => {
        if (_bestCdnNode && Date.now() - _probeTs < 300000) return _bestCdnNode;
        const candidates = [CDN_ORIGIN, ...CDN_MIRRORS];
        const probeOne = async (node) => {
            const testUrl = `https://${node}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/modules/device-manager/module.js?_=${Date.now()}`;
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

    // ════════════════════════════════════════════════════════════
    //  版本读取 / 保存
    // ════════════════════════════════════════════════════════════
    const _readVersions = async () => {
        const r = await _run(`mkdir -p ${_sq(DATA_DIR)} ${_sq(MODULES_DIR)} 2>/dev/null; cat ${_sq(VERSION_FILE)} 2>/dev/null || echo '{}'`, 3000);
        try { return JSON.parse(r?.content || '{}') || {}; } catch { return {}; }
    };
    const _saveVersions = async (versions) => {
        const json = JSON.stringify(versions, null, 2);
        await _run(`echo ${_sq(json)} > ${_sq(VERSION_FILE)}`, 2000);
    };

    // ─── 从代码解析版本号 ───
    const _parseVersion = (code) => {
        let m = code.match(/\/\/\s*Version:\s*(\d+\.\d+\.\d+)/i);
        if (m) return m[1];
        m = code.match(/PLUGIN_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
        return m ? m[1] : null;
    };

    // ─── 从 JSON 解析版本号 ───
    const _parseJsonVersion = (text) => {
        try {
            const obj = JSON.parse(text);
            return obj.version || obj.rev || null;
        } catch { return null; }
    };

    // ─── 通用：构建多源 URL 列表 ───
    const _buildUrls = (path) => {
        const t = Date.now();
        const urls = [`https://raw.githubusercontent.com/${MY_GITHUB_USER}/${MY_GITHUB_REPO}/${MY_GITHUB_BRANCH}/${path}?t=${t}`];
        for (const node of [CDN_ORIGIN, ...CDN_MIRRORS]) {
            urls.push(`https://${node}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/${path}?_=${t}`);
        }
        return urls;
    };

    // ─── 通用：curl 下载文件内容 ───
    const _curlGet = async (url, maxBytes) => {
        const tmp = `/data/local/tmp/_sdmcurl_${Math.random().toString(36).slice(2,9)}.tmp`;
        const range = maxBytes ? `-r 0-${maxBytes}` : '';
        const r = await _run(`curl -sL --fail --connect-timeout 5 --max-time 15 ${range} ${_sq(url)} -o ${_sq(tmp)} 2>/dev/null; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`, 20000);
        if (!String(r?.content || '').includes('__OK__')) { await _run(`rm -f ${_sq(tmp)}`, 1000); return null; }
        const rd = await _run(`cat ${_sq(tmp)}`, 3000);
        await _run(`rm -f ${_sq(tmp)}`, 1000);
        return String(rd?.content || '');
    };

    // ════════════════════════════════════════════════════════════
    //  获取模块最新版本（优先读 _latest.json，回退到解析 JS 头部）
    // ════════════════════════════════════════════════════════════
    const _fetchModuleVersion = async (moduleId) => {
        // 先尝试读 _latest.json（更快更稳）
        const jsonUrls = _buildUrls(`modules/${moduleId}/_latest.json`);
        const jsonJobs = jsonUrls.map(url => _curlGet(url).then(text => _parseJsonVersion(text)));
        const jsonResults = await Promise.all(jsonJobs);
        for (const v of jsonResults) { if (v) return v; }

        // JSON 失败，回退到解析 JS 文件头部
        const jsUrls = _buildUrls(`modules/${moduleId}/module.js`);
        const jsJobs = jsUrls.map(url => _curlGet(url, 999).then(text => _parseVersion(text)));
        const jsResults = await Promise.all(jsJobs);
        let bestVer = null;
        for (const v of jsResults) { if (v && (!bestVer || _cmpVer(v, bestVer) > 0)) bestVer = v; }
        return bestVer;
    };

    // ════════════════════════════════════════════════════════════
    //  获取核心最新版本
    // ════════════════════════════════════════════════════════════
    const _fetchCoreVersion = async () => {
        // 先尝试读 _latest.json
        const jsonUrls = _buildUrls(`core/_latest.json`);
        const jsonJobs = jsonUrls.map(url => _curlGet(url).then(text => _parseJsonVersion(text)));
        const jsonResults = await Promise.all(jsonJobs);
        for (const v of jsonResults) { if (v) return v; }

        // 回退到解析 JS 头部
        const jsUrls = _buildUrls(`core/sdm.js`);
        const jsJobs = jsUrls.map(url => _curlGet(url, 999).then(text => _parseVersion(text)));
        const jsResults = await Promise.all(jsJobs);
        let bestVer = null;
        for (const v of jsResults) { if (v && (!bestVer || _cmpVer(v, bestVer) > 0)) bestVer = v; }
        return bestVer;
    };

    // ════════════════════════════════════════════════════════════
    //  下载模块文件
    // ════════════════════════════════════════════════════════════
    const _downloadModule = async (moduleId) => {
        const bestNode = await _probeCdn();
        const nodes = [bestNode, ...CDN_MIRRORS.filter(m => m !== bestNode), CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);
        const jsPath = `modules/${moduleId}/module.js`;
        const cdnUrl = `https://${CDN_ORIGIN}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/${jsPath}`;
        const rawUrl = `https://raw.githubusercontent.com/${MY_GITHUB_USER}/${MY_GITHUB_REPO}/${MY_GITHUB_BRANCH}/${jsPath}`;
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

    // ════════════════════════════════════════════════════════════
    //  安装/更新单个模块
    // ════════════════════════════════════════════════════════════
    const _installModule = async (moduleId) => {
        const jsFile = await _downloadModule(moduleId);
        if (!jsFile) throw new Error('模块下载失败');
        const r = await _run(`base64 ${_sq(jsFile)} | tr -d '\\n'`, 15000);
        const b64 = String(r?.content || '').trim();
        if (!b64 || b64.length < 200) throw new Error('模块文件异常');
        let moduleCode;
        try { moduleCode = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
        catch (e) { throw new Error('模块解码失败'); }
        const moduleSig = `@@SDM_MODULE_${moduleId}@@`;
        if (!moduleCode.includes(moduleSig)) throw new Error('模块签名校验失败');
        const version = _parseVersion(moduleCode) || '1.0.0';
        _installedModules[moduleId] = version;
        await _saveVersions(_installedModules);
        return { version, code: moduleCode };
    };

    // ════════════════════════════════════════════════════════════
    //  加载已安装的模块
    // ════════════════════════════════════════════════════════════
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
            addDiagLog('模块已加载: ' + (MODULE_DEFS.find(m => m.id === moduleId)?.name || moduleId), 'success');
            return true;
        } catch (e) {
            addDiagLog('模块加载失败: ' + moduleId + ' - ' + e.message, 'error');
            return false;
        }
    };

    // ─── 卸载模块 ───
    const _unloadModule = async (moduleId) => {
        window.SDM?.emit('module:unload', moduleId);
        _moduleLoaded[moduleId] = false;
        const panel = document.getElementById(`sdm-panel-${moduleId}`);
        if (panel) panel.remove();
        await _run(`rm -f ${_sq(MODULES_DIR + '/' + moduleId + '.js')}`, 2000);
        delete _installedModules[moduleId];
        await _saveVersions(_installedModules);
    };

    // ════════════════════════════════════════════════════════════
    //  核心自更新机制
    // ════════════════════════════════════════════════════════════
    const _checkCoreUpdate = async () => {
        const cloudVer = await _fetchCoreVersion();
        if (cloudVer && _cmpVer(cloudVer, PLUGIN_VERSION) > 0) {
            return cloudVer;
        }
        return null;
    };

    const _applyCoreUpdate = async (newVer) => {
        const bestNode = await _probeCdn();
        const nodes = [bestNode, ...CDN_MIRRORS.filter(m => m !== bestNode), CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);
        const jsPath = `core/sdm.js`;
        const cdnUrl = `https://${CDN_ORIGIN}/gh/${MY_GITHUB_USER}/${MY_GITHUB_REPO}@${MY_GITHUB_BRANCH}/${jsPath}`;
        const rawUrl = `https://raw.githubusercontent.com/${MY_GITHUB_USER}/${MY_GITHUB_REPO}/${MY_GITHUB_BRANCH}/${jsPath}`;
        const srcList = [...nodes.map(n => cdnUrl.replace(CDN_ORIGIN, n)), rawUrl].filter((v, i, a) => a.indexOf(v) === i);

        let dlOk = false;
        for (const src of srcList) {
            const dlR = await _run(`curl -sL --fail --connect-timeout 8 --max-time 120 ${_sq(src)} -o ${_sq(PENDING_JS)}; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`, 130000);
            if (String(dlR?.content || '').includes('__OK__')) {
                const chk = await _run(`wc -c < ${_sq(PENDING_JS)}`, 2000);
                if (parseInt(chk?.content || '0') > 1000) { dlOk = true; break; }
            }
        }
        if (!dlOk) throw new Error('核心代码下载失败');

        const r = await _run(`base64 ${_sq(PENDING_JS)} | tr -d '\\n'`, 30000);
        const b64 = String(r?.content || '').trim();
        if (!b64) throw new Error('读取文件失败');
        let newJs;
        try { newJs = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
        catch (e) { throw new Error('解码失败'); }

        const sigCount = newJs.split(SDM_SIG).length - 1;
        if (sigCount !== 2 || newJs.length < 5000) throw new Error('核心文件校验失败');
        if (newVer) newJs = newJs.replace(/const PLUGIN_VERSION = '[^']*'/, `const PLUGIN_VERSION = '${newVer}'`);

        const currentText = await getCustomHead();
        if (!currentText) throw new Error('读取插件列表失败');
        const sP = '<!-- [KANO_PLUGIN_START]';
        const sE = '<!-- [KANO_PLUGIN_END]';
        const pluginRegex = new RegExp(sP.replace(/[\[\]]/g, c => '\\' + c) + '\\s*(.*?)\\s*-->([\\s\\S]*?)' + sE.replace(/[\[\]]/g, c => '\\' + c) + '\\s*\\1\\s*-->', 'g');
        const blocks = [];
        let _m;
        while ((_m = pluginRegex.exec(currentText)) !== null) {
            if (_m[2].includes(SDM_SIG)) blocks.push({ full: _m[0], name: _m[1].trim() });
        }
        if (blocks.length === 0) throw new Error('未找到当前插件代码块');
        let newText = currentText;
        const name = blocks[0].name;
        const newBlock = `${sP} ${name} -->\n${newJs}\n${sE} ${name} -->`;
        newText = newText.replace(blocks[0].full, () => newBlock);
        for (let i = 1; i < blocks.length; i++) {
            const idx = newText.indexOf(blocks[i].full);
            if (idx >= 0) newText = newText.slice(0, idx) + newText.slice(idx + blocks[i].full.length);
        }
        for (let i = 0; i <= 2; i++) {
            try { const result = await setCustomHead(newText); if (result?.result === 'success') break; throw new Error('保存失败'); }
            catch (e) { if (i < 2) await _wait(1000 * Math.pow(2, i)); else throw e; }
        }
        await _run(`rm -f ${_sq(PENDING_JS)}`);
    };

    // ════════════════════════════════════════════════════════════
    //  事件总线
    // ════════════════════════════════════════════════════════════
    const _eventBus = {
        _listeners: {},
        on(event, callback) { if (!this._listeners[event]) this._listeners[event] = []; this._listeners[event].push(callback); },
        off(event, callback) { if (!this._listeners[event]) return; this._listeners[event] = this._listeners[event].filter(cb => cb !== callback); },
        emit(event, ...args) { if (!this._listeners[event]) return; this._listeners[event].forEach(cb => { try { cb(...args); } catch (e) {} }); }
    };

    // ════════════════════════════════════════════════════════════
    //  SDM 全局 API（供模块使用）
    // ════════════════════════════════════════════════════════════
    window.SDM = {
        version: PLUGIN_VERSION,
        modules: MODULE_DEFS,
        installed: _installedModules,
        loaded: _moduleLoaded,
        on: _eventBus.on.bind(_eventBus),
        off: _eventBus.off.bind(_eventBus),
        emit: _eventBus.emit.bind(_eventBus),
        runShell: _run,
        wait: _wait,
        toast: (msg, color, dur) => { try { if (typeof createToast === 'function') createToast(msg, color || 'green', dur || 2000); } catch(e) {} },
        addLog: addLog,
        addDiagLog: addDiagLog,
        getCachedEl: getCachedEl,
        checkAdvance: async () => { try { return await checkAdvanceFunc(); } catch { return false; } },
        getContainer: () => document.getElementById('sdm-modules-container'),
        registerPanel: (moduleId, panelHtml) => {
            const container = document.getElementById('sdm-modules-container');
            if (!container) return;
            const old = document.getElementById(`sdm-panel-${moduleId}`);
            if (old) old.remove();
            const wrapper = document.createElement('div');
            wrapper.id = `sdm-panel-${moduleId}`;
            wrapper.className = 'sdm-module-panel';
            wrapper.innerHTML = panelHtml;
            container.appendChild(wrapper);
        },
        collapseGen: (id, title, options) => {
            try { if (typeof collapseGen === 'function') return collapseGen(id, title, options); } catch(e) {}
        },
        createModal: (id, title, content) => { try { if (typeof createModal === 'function') return createModal(id, title, content); } catch(e) {} },
        showModal: (id) => { try { if (typeof showModal === 'function') return showModal(id); } catch(e) {} },
        createFixedToast: (id, html) => { try { if (typeof createFixedToast === 'function') return createFixedToast(id, html); } catch(e) { return { el: document.createElement('div'), close: () => {} }; } },
        getUFIData: () => { try { return getUFIData(); } catch { return null; } },
        GH: { user: MY_GITHUB_USER, repo: MY_GITHUB_REPO, branch: MY_GITHUB_BRANCH }
    };

    // ════════════════════════════════════════════════════════════
    //  CSS · Sakura Dream 主题
    // ════════════════════════════════════════════════════════════
    const _bs = 'border:none;border-radius:12px;font-weight:bold;color:white;cursor:pointer;';
    const css = `
@keyframes smart_btn_glow{0%,100%{box-shadow:0 2px 8px rgba(255,255,255,.15),0 0 0 1px rgba(255,255,255,.08)}50%{box-shadow:0 4px 16px rgba(255,255,255,.25),0 0 0 1px rgba(255,255,255,.15)}}
@keyframes smart_btn_shine{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes smart_action_ripple{0%{transform:scale(0);opacity:.6}100%{transform:scale(2.5);opacity:0}}
@keyframes sdm_btn_breath{0%,100%{box-shadow:0 2px 8px rgba(255,255,255,.1),inset 0 1px 0 rgba(255,255,255,.2)}50%{box-shadow:0 3px 14px rgba(255,255,255,.15),inset 0 1px 0 rgba(255,255,255,.3)}}
@keyframes sdm_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes sdm_star_sparkle{0%,100%{opacity:.25;transform:scale(.82) rotate(0deg)}50%{opacity:1;transform:scale(1.18) rotate(180deg)}}
@keyframes sdm_ring_pulse{0%{box-shadow:0 0 0 0 rgba(251,191,36,.6)}70%{box-shadow:0 0 0 8px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}
@keyframes sdm_bounce_in{0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes sdm_shake{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-1px) rotate(-2deg)}75%{transform:translateX(1px) rotate(2deg)}}
@keyframes sdm_fade_in{from{opacity:0}to{opacity:1}}
@keyframes sdm_tip_float{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-3px)}}
@keyframes sdm2_rainbow_flow{0%{background-position:0% 50%}100%{background-position:300% 50%}}
@keyframes sdm2_heart_float{0%{opacity:0;transform:translateY(0) scale(.6)}15%{opacity:1}85%{opacity:.8}100%{opacity:0;transform:translateY(-48px) scale(1.2)}}
@keyframes sdm2_glow_breath{0%,100%{box-shadow:0 0 12px rgba(255,158,205,.28),0 0 26px rgba(167,139,250,.16)}50%{box-shadow:0 0 22px rgba(255,158,205,.5),0 0 44px rgba(167,139,250,.34)}}
@keyframes sdm2_wiggle{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes sdm2_float_soft{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes sdm2_pet_dance{0%,100%{transform:scale(1) rotate(0deg)}25%{transform:scale(1.12) rotate(-7deg)}75%{transform:scale(1.12) rotate(7deg)}}
@keyframes sdm2_ribbon_wave{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes sdm2_bg_aurora{0%,100%{background-position:0% 0%,100% 100%}50%{background-position:100% 0%,0% 100%}}
@keyframes sdm_changelog_pop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes sdm_changelog_shine{0%{background-position:-100% 0}100%{background-position:200% 0}}
.smart-grad-text{color:#ff9ecd;font-weight:bold;background:linear-gradient(90deg,#ff9ecd,#a78bfa,#4ade80,#ff9ecd);background-size:200% auto;animation:smart_btn_shine 4s linear infinite}
@supports(-webkit-background-clip:text) or (background-clip:text){.smart-grad-text{-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}}
.smart_action_btn{position:relative;overflow:hidden;border:none;border-radius:14px;font-weight:bold;cursor:pointer;transition:all .25s ease;animation:smart_btn_glow 3s ease-in-out infinite}
.smart_action_btn:active{transform:scale(.93)}
.smart_action_btn::after{content:'';position:absolute;top:50%;left:50%;width:0;height:0;border-radius:50%;background:rgba(255,255,255,.3);transform:translate(-50%,-50%);pointer-events:none}
.smart_action_btn:active::after{width:120px;height:120px;transition:width .4s ease,height .4s ease,opacity .4s ease;animation:smart_action_ripple .5s ease-out}
.smart-author-switch{position:relative;width:32px;height:18px;border-radius:9px;background:rgba(255,255,255,.15);cursor:pointer;transition:background .25s;flex-shrink:0;display:inline-block;vertical-align:middle}
.smart-author-switch._on{background:linear-gradient(135deg,#a78bfa,#ec4899)}
.smart-author-switch::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .25s}
.smart-author-switch._on::after{transform:translateX(14px)}
@keyframes smart_xiaoyu_pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.3)}70%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-80%) scale(1.6)}}
.smart-xiaoyu-text{position:fixed;font-size:1.3rem;font-weight:bold;background:linear-gradient(135deg,#ff9ecd,#a78bfa,#60a5fa);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;pointer-events:none;z-index:99999;text-shadow:0 0 12px rgba(167,139,250,.4);animation:smart_xiaoyu_pop .5s ease-out forwards;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
.sdm-check-btn{font-size:.45rem;font-weight:600;margin-left:6px;cursor:pointer;background:rgba(255,255,255,.06);color:#e2e8f0;padding:3px;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.12);transition:all .25s cubic-bezier(.34,1.56,.64,1);display:inline-flex;align-items:center;justify-content:center;user-select:none;position:relative;overflow:visible;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);width:28px;height:28px;flex-shrink:0;vertical-align:middle;animation:sdm_btn_breath 3s ease-in-out infinite}
.sdm-check-btn .sdm-btn-icon-wrap{width:22px;height:22px;border-radius:50%;background:rgba(99,102,241,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;border:1px solid rgba(99,102,241,.25)}
.sdm-check-btn .sdm-btn-icon{font-size:.55rem;display:inline-flex;align-items:center;justify-content:center;animation:sdm2_wiggle 2.6s ease-in-out infinite}
.sdm-check-btn::before{content:'';position:absolute;inset:0;border-radius:50%;padding:1px;background:linear-gradient(135deg,rgba(99,102,241,.4),rgba(147,197,253,.2),rgba(99,102,241,.4));-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.6;pointer-events:none}
.sdm-check-btn:hover{transform:translateY(-1px) scale(1.1);background:rgba(255,255,255,.1);box-shadow:0 4px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.15)}
.sdm-check-btn:active{transform:translateY(0) scale(.92)}
.sdm-check-btn .sdm-deco-1,.sdm-check-btn .sdm-deco-2{position:absolute;font-size:.28rem;pointer-events:none;animation:sdm_star_sparkle 2s ease-in-out infinite}
.sdm-check-btn .sdm-deco-1{top:-3px;right:-1px;animation-delay:.4s}
.sdm-check-btn .sdm-deco-2{bottom:-2px;left:0px;animation-delay:1.4s}
.sdm-update-tip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%) translateY(4px);background:rgba(251,191,36,.95);color:#1a1a2e;font-size:.32rem;font-weight:700;padding:3px 8px;border-radius:8px;white-space:nowrap;opacity:0;pointer-events:none;transition:all .3s cubic-bezier(.34,1.56,.64,1);box-shadow:0 3px 10px rgba(251,191,36,.4);z-index:10}
.sdm-update-tip::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:4px solid transparent;border-top-color:rgba(251,191,36,.95)}
.sdm-check-btn.has-update{background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3);animation:sdm_ring_pulse 2s ease-out infinite}
.sdm-check-btn.has-update .sdm-btn-icon-wrap{background:rgba(251,191,36,.2);border-color:rgba(251,191,36,.4);animation:sdm_shake 1.5s ease-in-out infinite}
.sdm-check-btn.has-update .sdm-update-tip{opacity:1;transform:translateX(-50%) translateY(0);animation:sdm_tip_float 2s ease-in-out infinite}
.sdm-check-btn.loading .sdm-btn-icon{animation:sdm_spin 1s linear infinite}
.sdm-update-badge{position:absolute;top:-4px;right:-4px;font-size:.28rem;color:#fff;font-weight:800;background:rgba(239,68,68,.9);padding:0 5px;border-radius:10px;border:1px solid rgba(255,255,255,.5);line-height:1.5;z-index:5;animation:sdm_bounce_in .5s cubic-bezier(.34,1.56,.64,1)}
.sdm-changelog-mask{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center;animation:sdm_fade_in .3s ease}
.sdm-changelog-box{width:86vw;max-width:380px;background:linear-gradient(160deg,rgba(30,41,59,.98),rgba(15,23,42,.98));border:1px solid rgba(99,102,241,.3);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 40px rgba(99,102,241,.2);overflow:hidden;animation:sdm_changelog_pop .4s cubic-bezier(.34,1.56,.64,1)}
.sdm-changelog-header{padding:18px 18px 14px;background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(236,72,153,.1));border-bottom:1px solid rgba(255,255,255,.06);position:relative;overflow:hidden}
.sdm-changelog-header::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#6366f1,#ec4899,#f59e0b,#10b981,#6366f1);background-size:300% 100%;animation:sdm_changelog_shine 3s linear infinite}
.sdm-changelog-title{font-size:.8rem;font-weight:bold;color:white;display:flex;align-items:center;gap:8px}
.sdm-changelog-ver{font-size:.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:2px 10px;border-radius:10px;font-weight:600}
.sdm-changelog-sub{font-size:.5rem;color:#94a3b8;margin-top:6px}
.sdm-changelog-body{padding:16px 18px;max-height:50vh;overflow-y:auto}
.sdm-changelog-item{margin-bottom:12px}
.sdm-changelog-item-title{font-size:.58rem;font-weight:bold;color:#a5b4fc;margin-bottom:6px;display:flex;align-items:center;gap:6px}
.sdm-changelog-item-title .dot{width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#ec4899)}
.sdm-changelog-item ul{margin:0;padding-left:18px;font-size:.56rem;color:#cbd5e1;line-height:1.7}
.sdm-changelog-footer{padding:12px 18px 16px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,.06)}
.sdm-changelog-btn{padding:8px 20px;border-radius:12px;font-size:.6rem;font-weight:600;cursor:pointer;transition:all .2s ease;border:none}
.sdm-changelog-btn.primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;box-shadow:0 4px 12px rgba(99,102,241,.4)}
.sdm-changelog-btn.primary:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(99,102,241,.55)}
#IFRAME_SMART{position:relative;border-radius:16px;background:linear-gradient(160deg,rgba(255,158,205,.05),rgba(167,139,250,.04) 45%,rgba(125,211,252,.05));background-size:200% 200%;animation:sdm2_bg_aurora 14s ease-in-out infinite;padding-bottom:6px}
#IFRAME_SMART .title strong.smart-grad-text{font-size:1rem;letter-spacing:1px}
.sdm2-card{position:relative;overflow:hidden}
.sdm2-card::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:linear-gradient(90deg,#ff9ecd,#c084fc,#7dd3fc,#86efac,#fde68a,#ff9ecd);background-size:300% 100%;animation:sdm2_rainbow_flow 5s linear infinite;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:2;opacity:.85}
.sdm2-title-glow{position:relative;display:inline-block;text-shadow:0 0 14px rgba(255,158,205,.6),0 0 28px rgba(167,139,250,.4) !important}
.sdm2-deco{position:absolute;pointer-events:none;z-index:3;opacity:1;filter:drop-shadow(0 0 5px rgba(255,158,205,.7))}
.sdm2-deco.d1{top:-4px;right:10px}
.sdm2-deco.d2{top:-5px;right:36px;font-size:.6rem}
.sdm2-deco.d3{bottom:-2px;right:16px;font-size:.55rem}
.sdm2-paw{position:absolute;bottom:4px;left:8px;font-size:.55rem;opacity:.5;pointer-events:none;z-index:3;filter:drop-shadow(0 0 4px rgba(125,211,252,.6))}
.sdm2-banner{position:relative;overflow:hidden;margin:2px 0 10px;padding:10px 14px;border-radius:16px;border:1px solid rgba(255,158,205,.35);background:linear-gradient(105deg,rgba(255,158,205,.15),rgba(196,164,252,.12),rgba(125,211,252,.13),rgba(134,239,172,.1),rgba(253,230,138,.12),rgba(255,158,205,.15));background-size:200% 100%;animation:sdm2_ribbon_wave 8s linear infinite;box-shadow:0 4px 18px rgba(255,158,205,.18)}
.sdm2-banner::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#ff9ecd,#a78bfa,#7dd3fc,#86efac,#fde68a,#ff9ecd);background-size:300% 100%;animation:sdm2_rainbow_flow 4s linear infinite}
.sdm2-banner-text{position:relative;z-index:2;text-align:center;font-size:.62rem;font-weight:bold;letter-spacing:2px;color:#ffd6e8;background:linear-gradient(90deg,#ff9ecd,#c084fc,#7dd3fc,#86efac,#fde68a,#ff9ecd);background-size:300% 100%;animation:sdm2_rainbow_flow 6s linear infinite;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 8px rgba(255,158,205,.45))}
@supports not (background-clip:text){.sdm2-banner-text{color:#ff9ecd;-webkit-text-fill-color:#ff9ecd}}
.sdm2-banner-sub{position:relative;z-index:2;text-align:center;font-size:.42rem;opacity:.65;margin-top:3px;color:#e9d5ff;letter-spacing:1px}
.sdm2-chip-star{display:inline-block}
.sdm2-hearts{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}
.sdm2-hearts span{position:absolute;bottom:0;font-size:.55rem;animation:sdm2_heart_float 4.5s ease-in-out infinite;opacity:0;filter:drop-shadow(0 0 4px rgba(255,110,180,.7))}
.sdm2-kawaii-note{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.42rem;background:linear-gradient(135deg,rgba(255,158,205,.16),rgba(192,132,252,.14));border:1px dashed rgba(255,158,205,.45);color:#ffd6e8;letter-spacing:1px;animation:sdm2_float_soft 3s ease-in-out infinite}
.smart_action_btn{box-shadow:0 3px 14px rgba(255,158,205,.25),inset 0 1px 0 rgba(255,255,255,.25) !important;text-shadow:0 1px 3px rgba(255,255,255,.25)}
.smart_action_btn:hover{transform:scale(1.05)}
#IFRAME_SMART ::-webkit-scrollbar{width:6px;height:6px}
#IFRAME_SMART ::-webkit-scrollbar-track{background:rgba(255,158,205,.06);border-radius:3px}
#IFRAME_SMART ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#ff9ecd,#a78bfa);border-radius:3px;box-shadow:0 0 6px rgba(255,158,205,.5)}
#IFRAME_SMART ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#c084fc,#ff6fae)}
#IFRAME_SMART ::selection{background:rgba(255,158,205,.45);color:#fff;text-shadow:0 0 8px rgba(255,255,255,.6)}
#smart_log_area,#smart_diag_log{background:linear-gradient(135deg,rgba(20,12,28,.5),rgba(30,18,44,.4)) !important;border:1px solid rgba(192,132,252,.25) !important;color:rgba(255,214,232,.75) !important;caret-color:#ff9ecd}
#smart_log_area:focus,#smart_diag_log:focus{border-color:rgba(255,158,205,.45) !important;box-shadow:0 0 14px rgba(255,158,205,.2)}
#IFRAME_SMART .collapse_box{border-radius:16px}
#IFRAME_SMART .collapse{transition:height .35s cubic-bezier(.34,1.56,.64,1)}
#IFRAME_SMART .title>span[style*="linear-gradient(135deg,#3b82f6"]{background:linear-gradient(135deg,#a78bfa,#ff6fae) !important;box-shadow:0 2px 12px rgba(255,111,174,.4) !important;border:1px solid rgba(255,214,232,.4) !important;animation:sdm2_glow_breath 3s ease-in-out infinite}
html.sdm-no-fx #IFRAME_SMART,html.sdm-no-fx #IFRAME_SMART *:not(.sdm-check-btn):not(.sdm-btn-icon-wrap):not(.sdm-btn-icon):not(.sdm-deco-1):not(.sdm-deco-2):not(.sdm-update-tip):not(.sdm-update-badge),html.sdm-no-fx #IFRAME_SMART *:not(.sdm-check-btn):not(.sdm-btn-icon-wrap):not(.sdm-btn-icon):not(.sdm-deco-1):not(.sdm-deco-2):not(.sdm-update-tip):not(.sdm-update-badge)::before,html.sdm-no-fx #IFRAME_SMART *:not(.sdm-check-btn):not(.sdm-btn-icon-wrap):not(.sdm-btn-icon):not(.sdm-deco-1):not(.sdm-deco-2):not(.sdm-update-tip):not(.sdm-update-badge)::after{animation-duration:1ms !important;animation-delay:0s !important;animation-iteration-count:1 !important;transition-duration:1ms !important;transition-delay:0s !important}
html.sdm-no-fx #smart_fx_toggle{background:linear-gradient(135deg,#64748b,#475569,#334155) !important;box-shadow:none !important}
html.sdm-no-fx .sdm-check-btn.loading .sdm-btn-icon{animation:sdm_spin 1s linear infinite !important}
.sdm-mod-grid{display:grid;grid-template-columns:1fr;gap:10px}
@media(min-width:500px){.sdm-mod-grid{grid-template-columns:1fr 1fr}}
.sdm-mod-card{background:linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;transition:all .25s;position:relative;overflow:hidden}
.sdm-mod-card:hover{border-color:rgba(255,255,255,.2);transform:translateY(-2px)}
.sdm-mod-card .micon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;margin-bottom:8px}
.sdm-mod-card .mname{font-size:.65rem;font-weight:700;color:#fff;margin-bottom:4px}
.sdm-mod-card .mdesc{font-size:.5rem;color:#94a3b8;line-height:1.5;margin-bottom:10px;min-height:32px}
.sdm-mod-card .mstat{display:flex;align-items:center;justify-content:space-between}
.sdm-mod-card .mver{font-size:.45rem;color:#64748b}
.sdm-mod-card .mver.installed{color:#86efac}
.sdm-mod-card .mbtn{font-size:.5rem;padding:4px 12px;border-radius:8px;border:none;cursor:pointer;font-weight:600;transition:all .2s}
.sdm-mod-card .mbtn.install{background:linear-gradient(135deg,#4ade80,#22c55e);color:#052e16}
.sdm-mod-card .mbtn.update{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#422006;animation:sdm_ring_pulse 2s ease-in-out infinite}
.sdm-mod-card .mbtn.uninstall{background:rgba(248,113,113,.2);color:#fca5a5;border:1px solid rgba(248,113,113,.3)}
.sdm-mod-card .mbtn:hover{transform:scale(1.05)}
.sdm-mod-card .mbadge{position:absolute;top:8px;right:8px;font-size:.4rem;padding:2px 8px;border-radius:8px;font-weight:600}
.sdm-mod-card .mbadge.installed{background:rgba(74,222,128,.2);color:#86efac}
.sdm-mod-card .mbadge.update{background:rgba(251,191,36,.2);color:#fbbf24;animation:sdm_ring_pulse 2s ease-in-out infinite}
.sdm-progress-mask{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:999999;display:flex;align-items:center;justify-content:center}
.sdm-progress-box{width:88vw;max-width:340px;background:linear-gradient(135deg,rgba(20,18,35,.97),rgba(35,28,55,.97));border:1px solid rgba(196,132,252,.4);border-radius:16px;padding:16px;color:#fff}
.sdm-progress-box .ptitle{font-size:.7rem;font-weight:700;margin-bottom:10px}
.sdm-progress-step{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.55rem}
.sdm-progress-bar{height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:8px 0;overflow:hidden}
.sdm-progress-bar-inner{height:100%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width .3s}
.sdm-fade-in{animation:sdm_fade_in .25s ease}
.sdm-module-panel{margin-bottom:10px}
`;

    // ════════════════════════════════════════════════════════════
    //  主 UI 渲染
    // ════════════════════════════════════════════════════════════
    const mmContainer = document.querySelector('.functions-container') || document.body;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
    <div id="IFRAME_SMART" style="width:100%;margin-top:10px;">
        <div class="sdm2-banner"><div class="sdm2-banner-text">✧･ﾟ: *✧･ﾟ♡ 智能设备管理器 · Sakura Dream Ver ♡ﾟ･* :･ﾟ✧</div><div class="sdm2-banner-sub">🌸 星空下的梦幻设备魔法阵 · 萌力全开中 🌸</div></div>
        <div class="title" style="margin:6px 0;">
            <span id="sdm_check_update_btn" class="sdm-check-btn" title="检查更新"><span class="sdm-btn-icon-wrap"><span class="sdm-btn-icon">📦</span></span><span class="sdm-deco-1">✨</span><span class="sdm-deco-2">💫</span><span class="sdm-update-tip">有新版！</span></span>
            <span id="sdm_version_badge" title="当前插件版本" style="display:inline-block;vertical-align:middle;font-size:.45rem;font-weight:bold;color:#fff;margin-left:6px;background:linear-gradient(135deg,#a78bfa,#f472b6);padding:2px 9px;border-radius:10px;box-shadow:0 1px 6px rgba(244,114,182,.35);border:1px solid rgba(255,214,232,.35);letter-spacing:.5px;opacity:.92;">v${PLUGIN_VERSION}</span>
            <span style="font-size:.4rem;opacity:.35;margin-left:4px">QQ 1085465022</span>
            <span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;vertical-align:middle;">
                <span style="font-size:.4rem;opacity:.5;">作者</span>
                <span class="smart-author-switch" id="smart_author_switch"></span>
            </span>
            <span id="smart_author_display" style="display:none;font-size:.4rem;margin-left:4px;background:linear-gradient(135deg,#a78bfa,#ec4899);color:white;padding:2px 8px;border-radius:8px;font-weight:bold;">✨ 小宇同学</span>
            <span id="smart_fx_toggle" title="一键关闭本插件所有动画特效（卡顿时用）" style="display:inline-block;font-size:.5rem;font-weight:bold;color:white;cursor:pointer;margin-left:6px;background:linear-gradient(135deg,#a78bfa,#818cf8,#60a5fa);padding:4px 14px;border-radius:14px;border:1px solid rgba(196,181,253,.55);box-shadow:0 2px 12px rgba(129,140,248,.4),0 0 16px rgba(167,139,250,.3);transition:all .25s;">✨ 特效开</span>
            <div style="display:inline-block;" id="collapse_SMART_btn"></div>
        </div>
        <div class="collapse" id="collapse_SMART" data-name="close" style="height:0px;overflow:hidden;">
        <div class="collapse_box">
            <div class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(167,139,250,.1),rgba(244,114,182,.06),rgba(125,211,252,.06));border:1px solid rgba(167,139,250,.2);">
                <span class="sdm2-deco d1">📦</span><span class="sdm2-deco d2">✨</span><span class="sdm2-paw">🐾</span>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#c084fc,#f472b6);display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 2px 14px rgba(167,139,250,.5);animation:sdm2_pet_dance 3s ease-in-out infinite;">🧩</div>
                        <div>
                            <div style="font-size:.7rem;" class="smart-grad-text sdm2-title-glow">智能设备管理器模块安装中心</div>
                            <div style="font-size:.5rem;opacity:.5;">已安装 <span id="sdm_installed_count">0</span>/5 个模块 <span class="sdm2-chip-star">🌟</span></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button class="smart_action_btn" id="sdm_install_all" style="${_bs}background:linear-gradient(135deg,#4ade80,#22c55e,#16a34a);font-size:.5rem;padding:6px 14px;box-shadow:0 2px 12px rgba(74,222,128,.35);">⚡ 一键安装模块</button>
                        <button class="smart_action_btn" id="sdm_check_all_updates" style="${_bs}background:linear-gradient(135deg,#fbbf24,#f59e0b);font-size:.5rem;padding:6px 14px;box-shadow:0 2px 12px rgba(251,191,36,.35);">🔄 检查更新</button>
                        <button class="smart_action_btn" id="sdm_show_modules" style="${_bs}background:linear-gradient(135deg,#a78bfa,#8b5cf6);font-size:.5rem;padding:6px 14px;box-shadow:0 2px 12px rgba(167,139,250,.35);">📦 模块管理</button>
                    </div>
                </div>
                <div class="collapse" id="collapse_sdm_modules" data-name="close" style="height:0px;overflow:hidden;">
                    <div class="collapse_box">
                        <div class="sdm-mod-grid" id="sdm_modules_grid"></div>
                    </div>
                </div>
            </div>
            <div id="sdm-modules-container"></div>
            <div class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(192,132,252,.05),rgba(255,158,205,.04));border:1px solid rgba(192,132,252,.14);">
                <span class="sdm2-deco d1">⭐</span><span class="sdm2-deco d3">✨</span>
                <div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
                    <span class="smart-grad-text sdm2-title-glow">📜 活动日志</span>
                    <button style="${_bs}background:linear-gradient(135deg,#fb7185,#f43f5e);font-size:.45rem;padding:3px 10px;box-shadow:0 2px 10px rgba(244,63,94,.35);" id="smart_clear_log">清空</button>
                </div>
                <textarea id="smart_log_area" disabled style="font-size:.5rem !important;border:none;padding:8px;margin:0;width:100%;height:120px;border-radius:12px;overflow-x:hidden;background:linear-gradient(135deg,rgba(20,12,28,.55),rgba(30,18,44,.45));color:rgba(255,214,232,.7);border:1px solid rgba(192,132,252,.2);" placeholder="暂无日志 ✨"></textarea>
            </div>
            <div class="sdm2-card" style="padding:14px;border-radius:18px;margin-bottom:10px;border:1px solid rgba(255,158,205,.2);background:linear-gradient(135deg,rgba(255,158,205,.07),rgba(196,79,196,.05),rgba(192,132,252,.05));">
                <span class="sdm2-deco d1">💫</span><span class="sdm2-deco d2">📊</span><span class="sdm2-paw">🐱</span>
                <div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
                    <span class="smart-grad-text sdm2-title-glow">📊 网络诊断日志</span>
                    <button id="smart_clear_diaglog" style="font-size:.45rem;padding:3px 10px;${_bs}background:linear-gradient(135deg,#fb7185,#f43f5e);box-shadow:0 2px 10px rgba(244,63,94,.35);">清空</button>
                </div>
                <textarea id="smart_diag_log" disabled style="font-size:.5rem !important;border:none;padding:8px;margin:0;width:100%;height:100px;border-radius:12px;overflow-x:hidden;background:linear-gradient(135deg,rgba(20,12,28,.55),rgba(30,18,44,.45));color:rgba(255,214,232,.7);border:1px solid rgba(255,158,205,.18);" placeholder="暂无诊断日志 ✨"></textarea>
            </div>
            <div class="sdm2-card" style="padding:14px;border-radius:18px;margin-bottom:10px;border:1px solid rgba(125,211,252,.2);background:linear-gradient(135deg,rgba(125,211,252,.07),rgba(192,132,252,.05),rgba(255,158,205,.04));">
                <span class="sdm2-deco d1">📝</span><span class="sdm2-deco d2">🌟</span><span class="sdm2-deco d3">🎀</span>
                <div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
                    <span class="smart-grad-text sdm2-title-glow">📝 插件讲解</span>
                </div>
                <div style="padding:16px 12px;font-size:.6rem;line-height:1.8;color:rgba(255,255,255,.78);text-align:center;">
                    <div style="font-size:.65rem;font-weight:bold;margin-bottom:10px;background:linear-gradient(135deg,#7dd3fc,#c084fc,#ff9ecd);background-size:200% 100%;animation:sdm2_rainbow_flow 5s linear infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">📖 插件简介</div>
                    <div style="margin-bottom:12px;">本插件制作于小宇同学 <span class="sdm2-chip-star">✨</span></div>
                    <div style="padding:10px 14px;border-radius:12px;background:rgba(192,132,252,.09);border:1px solid rgba(192,132,252,.18);margin-bottom:10px;">
                        <div style="font-size:.55rem;opacity:.6;margin-bottom:4px;">联系方式</div>
                        <div style="font-size:.6rem;font-weight:bold;color:#c084fc;">QQ：1085465022</div>
                        <div style="font-size:.5rem;opacity:.5;margin-top:4px;">有问题QQ联系</div>
                    </div>
                    <div style="font-size:.5rem;opacity:.5;">(っ｡´ω｡)っ 感谢使用本插件 ✨</div>
                </div>
            </div>
            <div id="SMART_action_box" style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap"></div>
            <div style="margin-top:8px;text-align:right;font-size:.45rem;opacity:.75;">Smart Device Manager <span style="opacity:.6;">QQ 1085465022</span> <span class="sdm2-chip-star">🌸</span></div>
        </div>
        </div>
    </div>`;

    mmContainer.insertAdjacentElement("afterend", wrapper);

    // ─── collapse 组件初始化 ───
    try { if (typeof collapseGen === 'function') { collapseGen('SMART', '🌸 智能设备管理器'); } } catch(e) {}

    // ─── 漂浮爱心装饰 ───
    ;(function sdm2Ambience() {
        const HEART_SET = ['💗', '💕', '🩷', '✿', '🌸', '💖'];
        const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const randRange = (min, max) => min + Math.random() * (max - min);
        const banner = document.querySelector('.sdm2-banner');
        if (banner && !banner.querySelector('.sdm2-hearts')) {
            const hearts = document.createElement('div');
            hearts.className = 'sdm2-hearts';
            for (let i = 0; i < 7; i++) {
                const s = document.createElement('span');
                s.textContent = rand(HEART_SET);
                s.style.left = randRange(4, 92) + '%';
                s.style.fontSize = randRange(.4, .7) + 'rem';
                s.style.animationDelay = randRange(0, 4.5) + 's';
                s.style.animationDuration = randRange(3.8, 6.5) + 's';
                hearts.appendChild(s);
            }
            banner.appendChild(hearts);
        }
        const titleEl = document.querySelector('#IFRAME_SMART .title strong.smart-grad-text, #IFRAME_SMART .sdm2-banner-text');
        if (titleEl) {
            titleEl.style.cursor = 'pointer';
            let _lastPop = 0;
            titleEl.addEventListener('click', function(e) {
                const now = Date.now();
                if (now - _lastPop < 800) return;
                _lastPop = now;
                for (let i = 0; i < 8; i++) {
                    const h = document.createElement('span');
                    h.textContent = rand(HEART_SET);
                    h.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;font-size:' + randRange(.6, 1.1) + 'rem;filter:drop-shadow(0 0 6px rgba(255,110,180,.8));animation:sdm2_heart_float ' + randRange(1.6, 2.6) + 's ease-out forwards;left:' + (e.clientX + randRange(-40, 40)) + 'px;top:' + (e.clientY - 10) + 'px;';
                    document.body.appendChild(h);
                    setTimeout(function() { h.remove() }, 2800);
                }
            });
        }
    })();

    // ─── 特效开关 ───
    var _fxOn = true;
    try { var _fxSaved = localStorage.getItem('smart_fx_enabled'); if (_fxSaved !== null) _fxOn = _fxSaved === '1'; } catch(e) {}
    const _fxApply = () => {
        try { document.documentElement.classList.toggle('sdm-no-fx', !_fxOn) } catch(e) {}
        var btn = document.querySelector('#smart_fx_toggle');
        if (btn) { btn.textContent = _fxOn ? '✨ 特效开' : '🚫 特效关'; }
    };
    _fxApply();
    var fxBtn = document.querySelector('#smart_fx_toggle');
    if (fxBtn) fxBtn.onclick = function() {
        _fxOn = !_fxOn;
        try { localStorage.setItem('smart_fx_enabled', _fxOn ? '1' : '0'); } catch(e) {}
        _fxApply();
        if (typeof createToast === 'function') createToast(_fxOn ? '已开启全部动效 ✨' : '已关闭全部动效 🚫', _fxOn ? 'pink' : 'yellow', 2000);
    };

    // ─── 作者开关 ───
    var authorSwitch = document.querySelector('#smart_author_switch');
    var authorDisplay = document.querySelector('#smart_author_display');
    if (authorSwitch) {
        try { if (localStorage.getItem('smart_author') === '1') { authorSwitch.classList.add('_on'); if (authorDisplay) authorDisplay.style.display = 'inline-block'; } } catch(e) {}
        authorSwitch.onclick = function() {
            var on = authorSwitch.classList.toggle('_on');
            try { localStorage.setItem('smart_author', on ? '1' : '0'); } catch(e) {}
            if (authorDisplay) authorDisplay.style.display = on ? 'inline-block' : 'none';
            if (on) {
                var xiaoyuText = document.createElement('div');
                xiaoyuText.className = 'smart-xiaoyu-text';
                xiaoyuText.textContent = '✨ 小宇同学';
                xiaoyuText.style.left = '50%'; xiaoyuText.style.top = '40%';
                document.body.appendChild(xiaoyuText);
                setTimeout(function() { xiaoyuText.remove() }, 800);
            }
        };
    }

    // ─── 清空日志按钮 ───
    var clearLogBtn = document.querySelector('#smart_clear_log');
    if (clearLogBtn) clearLogBtn.onclick = function() { ACTIVITY_LOG = []; var el = document.querySelector('#smart_log_area'); if (el) el.value = ''; };
    var clearDiagBtn = document.querySelector('#smart_clear_diaglog');
    if (clearDiagBtn) clearDiagBtn.onclick = function() { DIAG_LOG = []; var el = document.querySelector('#smart_diag_log'); if (el) el.value = ''; };

    // ════════════════════════════════════════════════════════════
    //  模块管理 UI
    // ════════════════════════════════════════════════════════════
    const _renderModuleCards = () => {
        const grid = document.getElementById('sdm_modules_grid');
        if (!grid) return;
        grid.innerHTML = MODULE_DEFS.map(m => {
            const installed = _installedModules[m.id];
            const latest = _moduleVersions[m.id];
            const hasUpdate = installed && latest && _cmpVer(latest, installed) > 0;
            const isInstalled = !!installed;
            let badgeHtml = '', btnHtml = '', verHtml = '';
            if (isInstalled) {
                verHtml = `<span class="mver installed">v${installed}</span>`;
                if (hasUpdate) { badgeHtml = `<span class="mbadge update">可更新 v${latest}</span>`; btnHtml = `<button class="mbtn update" data-module="${m.id}" data-action="update">更新</button>`; }
                else { badgeHtml = `<span class="mbadge installed">已安装</span>`; btnHtml = `<button class="mbtn uninstall" data-module="${m.id}" data-action="uninstall">卸载</button>`; }
            } else {
                verHtml = `<span class="mver">${latest ? '最新 v'+latest : '未安装'}</span>`;
                btnHtml = `<button class="mbtn install" data-module="${m.id}" data-action="install">安装</button>`;
            }
            return `<div class="sdm-mod-card sdm-fade-in">${badgeHtml}<div class="micon" style="background:${m.color}22;">${m.icon}</div><div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div><div class="mstat">${verHtml}${btnHtml}</div></div>`;
        }).join('');
        grid.querySelectorAll('.mbtn').forEach(btn => {
            btn.onclick = () => _handleModuleAction(btn.dataset.module, btn.dataset.action);
        });
    };

    const _updateInstalledCount = () => {
        const el = document.getElementById('sdm_installed_count');
        if (el) el.textContent = Object.keys(_installedModules).length;
    };

    // ─── 进度弹窗 ───
    const _showProgress = (title, steps) => {
        const mask = document.createElement('div');
        mask.className = 'sdm-progress-mask';
        const st = {};
        steps.forEach(s => st[s.id] = 'pending');
        const ICONS = { pending: '○', running: '⏳', done: '✓', failed: '✗' };
        const COLORS = { pending: '#64748b', running: '#60a5fa', done: '#86efac', failed: '#f87171' };
        const render = () => {
            const pct = Math.round(steps.filter(s => st[s.id] === 'done').length / steps.length * 100);
            const rows = steps.map(s => `<div class="sdm-progress-step" style="color:${COLORS[st[s.id]]}"><span>${ICONS[st[s.id]]}</span><span>${s.label}</span></div>`).join('');
            mask.innerHTML = `<div class="sdm-progress-box sdm-fade-in"><div class="ptitle">${title}</div><div class="sdm-progress-bar"><div class="sdm-progress-bar-inner" style="width:${pct}%"></div></div>${rows}</div>`;
        };
        document.body.appendChild(mask);
        render();
        return {
            setStep: (id, s) => { if (st[id] !== undefined) { st[id] = s; render(); } },
            close: () => mask.remove(),
            fail: (msg) => { steps.forEach(s => { if (st[s.id] === 'pending') st[s.id] = 'failed'; }); render(); setTimeout(() => mask.remove(), 2000); }
        };
    };

    // ─── 模块操作处理 ───
    const _handleModuleAction = async (moduleId, action) => {
        if (_updating) return;
        _updating = true;
        const moduleDef = MODULE_DEFS.find(m => m.id === moduleId);
        if (!moduleDef) { _updating = false; return; }
        if (action === 'install' || action === 'update') {
            const steps = [{id:'download',label:'下载模块代码'},{id:'install',label:action==='update'?'更新模块':'安装模块'},{id:'load',label:'加载模块'},{id:'done',label:'完成'}];
            const flow = _showProgress(`${action==='update'?'更新':'安装'} ${moduleDef.name}`, steps);
            try {
                flow.setStep('download', 'running'); flow.setStep('download', 'done');
                flow.setStep('install', 'running');
                const result = await _installModule(moduleId);
                flow.setStep('install', 'done');
                flow.setStep('load', 'running');
                await _loadModule(moduleId);
                flow.setStep('load', 'done');
                flow.setStep('done', 'done');
                _updateInstalledCount();
                _renderModuleCards();
                SDM.toast(`${moduleDef.name} ${action==='update'?'更新':'安装'}成功 v${result.version}`, 'green', 2500);
                setTimeout(() => flow.close(), 800);
            } catch (e) {
                flow.fail(e.message || '安装失败');
                SDM.toast(`${moduleDef.name} ${action==='update'?'更新':'安装'}失败: ${e.message}`, 'red', 3000);
            }
        } else if (action === 'uninstall') {
            if (!confirm(`确定要卸载「${moduleDef.name}」吗？`)) { _updating = false; return; }
            try { await _unloadModule(moduleId); _updateInstalledCount(); _renderModuleCards(); SDM.toast(`${moduleDef.name} 已卸载`, 'yellow', 2000); }
            catch (e) { SDM.toast(`卸载失败: ${e.message}`, 'red', 2000); }
        }
        _updating = false;
    };

    // ─── 一键安装所有模块 ───
    const _installAllModules = async () => {
        if (_updating) return;
        _updating = true;
        SDM.toast('开始一键安装所有模块...', 'yellow', 2000);
        let successCount = 0;
        let failCount = 0;
        for (const m of MODULE_DEFS) {
            if (_installedModules[m.id] && !_moduleVersions[m.id]) { successCount++; continue; }
            if (_installedModules[m.id] && _moduleVersions[m.id] && _cmpVer(_moduleVersions[m.id], _installedModules[m.id]) <= 0) { successCount++; continue; }
            SDM.toast(`正在安装 ${m.name}...`, 'yellow', 1500);
            try {
                const result = await _installModule(m.id);
                await _loadModule(m.id);
                successCount++;
                SDM.toast(`${m.name} 安装成功 v${result.version}`, 'green', 1500);
            } catch (e) {
                failCount++;
                SDM.toast(`${m.name} 安装失败: ${e.message}`, 'red', 2000);
            }
            await _wait(300);
        }
        _updateInstalledCount();
        _renderModuleCards();
        _updating = false;
        if (failCount === 0) SDM.toast(`全部安装成功！(${successCount}/5)`, 'green', 3000);
        else SDM.toast(`安装完成: 成功${successCount}个, 失败${failCount}个`, 'yellow', 3000);
    };

    // ─── 检查所有更新 ───
    const _checkAllUpdates = async () => {
        if (_updating) return;
        _updating = true;
        SDM.toast('正在检查更新...', 'yellow', 1500);

        // 检查核心更新
        let coreUpdate = null;
        try { coreUpdate = await _checkCoreUpdate(); } catch {}

        // 检查模块更新
        const results = await Promise.all(MODULE_DEFS.map(async (m) => {
            try { const ver = await _fetchModuleVersion(m.id); if (ver) _moduleVersions[m.id] = ver; return { id: m.id, ver }; }
            catch { return { id: m.id, ver: null }; }
        }));

        let updateCount = 0;
        results.forEach(r => {
            const installed = _installedModules[r.id];
            if (installed && r.ver && _cmpVer(r.ver, installed) > 0) updateCount++;
        });

        _renderModuleCards();

        // 更新检查按钮状态
        const checkBtn = document.getElementById('sdm_check_update_btn');
        if (checkBtn) {
            if (coreUpdate || updateCount > 0) checkBtn.classList.add('has-update');
            else checkBtn.classList.remove('has-update');
        }

        _updating = false;
        if (coreUpdate) {
            SDM.toast(`发现核心新版本 v${coreUpdate}！点击更新按钮升级`, 'green', 3000);
        } else if (updateCount > 0) {
            SDM.toast(`发现 ${updateCount} 个模块可更新`, 'green', 2500);
        } else {
            SDM.toast('所有模块已是最新', 'green', 2000);
        }
    };

    // ─── 检查更新按钮 ───
    const checkUpdateBtn = document.getElementById('sdm_check_update_btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', async () => {
            if (_updating) return;
            checkUpdateBtn.classList.add('loading');
            await _checkAllUpdates();
            checkUpdateBtn.classList.remove('loading');
            // 如果有核心更新，执行自更新
            try {
                const coreVer = await _checkCoreUpdate();
                if (coreVer && confirm(`发现核心新版本 v${coreVer}，是否立即更新？\n更新后需要重新加载页面。`)) {
                    SDM.toast('正在下载核心更新...', 'yellow', 2000);
                    await _applyCoreUpdate(coreVer);
                    SDM.toast('核心更新成功！请重新加载页面。', 'green', 3000);
                    setTimeout(() => location.reload(), 2000);
                }
            } catch (e) {
                SDM.toast('核心更新失败: ' + e.message, 'red', 3000);
            }
        });
    }

    // ─── 按钮绑定 ───
    const installAllBtn = document.getElementById('sdm_install_all');
    if (installAllBtn) installAllBtn.onclick = _installAllModules;
    const checkAllBtn = document.getElementById('sdm_check_all_updates');
    if (checkAllBtn) checkAllBtn.onclick = _checkAllUpdates;
    const showModulesBtn = document.getElementById('sdm_show_modules');
    if (showModulesBtn) showModulesBtn.onclick = () => {
        const el = document.getElementById('collapse_sdm_modules');
        if (!el) return;
        if (el.style.height === '0px' || !el.style.height) { el.style.height = el.scrollHeight + 'px'; el.dataset.name = 'open'; }
        else { el.style.height = '0px'; el.dataset.name = 'close'; }
    };

    // ════════════════════════════════════════════════════════════
    //  初始化
    // ════════════════════════════════════════════════════════════
    const _init = async () => {
        _installedModules = await _readVersions();
        _renderModuleCards();
        _updateInstalledCount();

        // 加载已安装的模块
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
                try { const ver = await _fetchModuleVersion(m.id); if (ver) _moduleVersions[m.id] = ver; } catch {}
            }
            try { const coreVer = await _checkCoreUpdate(); if (coreVer) { const btn = document.getElementById('sdm_check_update_btn'); if (btn) btn.classList.add('has-update'); } } catch {}
            _renderModuleCards();
        }, 3000);

        addDiagLog('SDM模块化核心 v' + PLUGIN_VERSION + ' 已启动，已加载 ' + loadedCount + '/' + MODULE_DEFS.length + ' 个模块', 'success');
        console.log('[SDM Core] v' + PLUGIN_VERSION + ' 初始化完成，已加载 ' + loadedCount + '/' + MODULE_DEFS.length + ' 个模块');
    };

    _init().catch(e => { console.error('[SDM Core] 初始化失败:', e); });

} catch (e) {
    console.error('[SDM Core] 致命错误:', e);
    try {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#e53935;color:#fff;padding:14px 20px;border-radius:8px;z-index:99999;font-size:13px;max-width:80%;';
        d.textContent = 'SDM核心加载失败: ' + (e?.message || e);
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 5000);
    } catch(e2) {}
}
})();
//@@SDM_PLUGIN_END@@
