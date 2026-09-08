// ─────────────────────────────────────────────────────────────────────────
// SDM 统一入口 (sdm-main.js)
// 版本: 3.6.9.3 · 云端仓库框架版
// 特性: 不自动加载插件；从 GitHub 仓库 manifest 动态拉取插件列表；
//       每个插件独立 安装/更新 按钮；列表缓存离线可用
// ─────────────────────────────────────────────────────────────────────────
const PLUGIN_VERSION = '3.6.9.3';
//<script>
//@@SDM_PLUGIN_ID:a1b2c3@@
(async () => {
try {
    // ════════════════════════════════════════════════════════════
    // 基础工具
    // ════════════════════════════════════════════════════════════
    const _sdmSq = (v) => `'${String(v ?? '').replace(/'/g, `'\''`)}'`;
    const _sdmRun = async (cmd, timeout = 30000) => {
        try { const r = await runShellWithRoot(cmd, timeout); return r || { success: false, content: '' }; }
        catch (e) { return { success: false, content: '', error: String(e) }; }
    };
    const _sdmWait = (ms) => new Promise(r => setTimeout(r, ms));

    // ════════════════════════════════════════════════════════════
    // CDN 源（8 个 base，末尾带 /）
    // ════════════════════════════════════════════════════════════
    const _sdmCDN_BASES = [
        'https://jsd.onmicrosoft.cn/gh/xiaoyutxy/my-pIugins@main/',
        'https://cdn.jsdmirror.com/gh/xiaoyutxy/my-pIugins@main/',
        'https://testingcf.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/',
        'https://cdn.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/',
        'https://fastly.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/',
        'https://mirror.ghproxy.com/https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/',
        'https://gh-proxy.com/https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/',
        'https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/',
    ];
    const _SDM_MANIFEST_REL = 'plugins/manifest.json';
    const _SDM_REPO_CACHE = '/data/sdm/repo.json';
    const _SDM_PLUGIN_DIR = '/data/sdm/plugins';

    // ════════════════════════════════════════════════════════════
    // 状态
    // ════════════════════════════════════════════════════════════
    let _sdmBase = null;          // 当前胜出 CDN base
    let _sdmManifest = null;      // { version, plugins: [...] }
    let _sdmRepoFrom = '';        // network | cache | ''
    let _sdmFetching = false;
    let _sdmFetchError = '';

    // ════════════════════════════════════════════════════════════
    // 拉取插件仓库清单（并发探测 8 源 → 缓存 → 兜底读缓存）
    // ════════════════════════════════════════════════════════════
    const _sdmFetchRepo = async (force) => {
        if (!force && _sdmManifest && _sdmBase) return { base: _sdmBase, manifest: _sdmManifest, from: _sdmRepoFrom };
        if (_sdmFetching) { while (_sdmFetching) await _sdmWait(300); return { base: _sdmBase, manifest: _sdmManifest, from: _sdmRepoFrom }; }
        _sdmFetching = true;
        _sdmFetchError = '';
        try {
            const probeOne = async (base, idx) => {
                const tmp = `/data/local/tmp/_sdm_repo_${idx}.json`;
                const dl = await _sdmRun(
                    `curl -sL --connect-timeout 3 --max-time 10 ${_sdmSq(base + _SDM_MANIFEST_REL)} -o ${_sdmSq(tmp)} 2>/dev/null; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`,
                    13000
                );
                if (!String(dl?.content || '').includes('__OK__')) { await _sdmRun('rm -f ' + _sdmSq(tmp), 1000); return null; }
                const cat = await _sdmRun('cat ' + _sdmSq(tmp), 5000);
                await _sdmRun('rm -f ' + _sdmSq(tmp), 1000);
                const text = String(cat?.content || '').trim();
                try {
                    const j = JSON.parse(text);
                    if (j && Array.isArray(j.plugins) && j.plugins.length > 0) return { base, manifest: j };
                } catch (_) {}
                return null;
            };

            const results = await Promise.all(_sdmCDN_BASES.map((b, i) => probeOne(b, i)));
            const hit = results.find(Boolean);
            if (hit) {
                _sdmBase = hit.base;
                _sdmManifest = hit.manifest;
                _sdmRepoFrom = 'network';
                // 写缓存（含 base + manifest），离线可读
                await _sdmRun('mkdir -p /data/sdm', 2000);
                const cacheJson = JSON.stringify({ ts: Date.now(), base: _sdmBase, manifest: _sdmManifest });
                await _sdmRun('echo ' + _sdmSq(cacheJson) + ' > ' + _sdmSq(_SDM_REPO_CACHE), 3000);
                return { base: _sdmBase, manifest: _sdmManifest, from: 'network' };
            }

            // 全部失败 → 读本地缓存
            const cr = await _sdmRun('cat ' + _sdmSq(_SDM_REPO_CACHE) + ' 2>/dev/null || echo ---', 3000);
            const ctext = String(cr?.content || '').trim();
            if (ctext && ctext !== '---') {
                try {
                    const c = JSON.parse(ctext);
                    if (c && c.base && c.manifest && Array.isArray(c.manifest.plugins)) {
                        _sdmBase = c.base;
                        _sdmManifest = c.manifest;
                        _sdmRepoFrom = 'cache';
                        return { base: _sdmBase, manifest: _sdmManifest, from: 'cache' };
                    }
                } catch (_) {}
            }
            _sdmFetchError = '所有 CDN 源不可达，且无本地缓存';
            return null;
        } finally {
            _sdmFetching = false;
        }
    };

    // 用当前胜出源下载插件文件
    const _sdmDownload = async (relPath, tmpPath) => {
        if (!_sdmBase) return false;
        const url = _sdmBase + relPath;
        const dl = await _sdmRun(
            `curl -sL --connect-timeout 4 --max-time 25 ${_sdmSq(url)} -o ${_sdmSq(tmpPath)} 2>/dev/null; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`,
            30000
        );
        return String(dl?.content || '').includes('__OK__');
    };

    // ════════════════════════════════════════════════════════════
    // 日志
    // ════════════════════════════════════════════════════════════
    const _sdmLogEntries = [];
    const _sdmLog = (msg, type) => {
        type = type || 'info';
        const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        _sdmLogEntries.push({ ts, msg, type });
        const el = document.getElementById('sdm_log');
        if (el) {
            const color = type === 'err' ? '#f87171' : type === 'ok' ? '#86efac' : type === 'warn' ? '#fbbf24' : '#94a3b8';
            el.insertAdjacentHTML('beforeend', '<div style="color:' + color + '">[' + ts + '] ' + msg.replace(/</g, '&lt;') + '</div>');
            el.scrollTop = el.scrollHeight;
        }
        console.log('[SDM] ' + msg);
    };

    // ════════════════════════════════════════════════════════════
    // 获取插件本地安装状态
    // ════════════════════════════════════════════════════════════
    const _sdmGetLocalVer = async (id) => {
        const vr = await _sdmRun('cat ' + _sdmSq(_SDM_PLUGIN_DIR + '/' + id + '.ver') + ' 2>/dev/null || echo ---', 2000);
        const v = String(vr?.content || '').trim();
        return v === '---' ? '' : v;
    };

    // ════════════════════════════════════════════════════════════
    // 渲染插件列表（数据源: _sdmManifest.plugins）
    // ════════════════════════════════════════════════════════════
    const _sdmRenderList = async () => {
        const list = document.getElementById('sdm_list');
        const stBar = document.getElementById('sdm_src_status');
        const fBar = document.getElementById('sdm_footer');
        if (!list) return;

        if (!_sdmManifest) {
            list.innerHTML = '<div style="padding:24px 0;text-align:center;color:#64748b;font-size:12px">' +
                (_sdmFetching ? '⏳ 正在获取插件列表…' : '❌ ' + _sdmFetchError) +
                (_sdmFetchError ? '<div style="margin-top:10px"><button id="sdm_retry_btn" style="font-size:12px;padding:6px 18px;border-radius:8px;border:1px solid rgba(96,165,250,.5);background:rgba(96,165,250,.15);color:#93c5fd;cursor:pointer">重试</button></div>' : '') +
                '</div>';
            const rb = document.getElementById('sdm_retry_btn');
            if (rb) rb.onclick = async () => { await _sdmFetchRepo(true); _sdmRenderList(); };
            if (stBar) stBar.innerHTML = '<span style="color:#f87171">✗ 源不可用</span>';
            if (fBar) fBar.textContent = 'SDM Framework v3.6.9.3 · 未连接插件源';
            return;
        }

        // 源状态条
        const host = (() => { try { return new URL(_sdmBase).hostname; } catch (_) { return _sdmBase; } })();
        const srcColor = _sdmRepoFrom === 'network' ? '#4ade80' : _sdmRepoFrom === 'cache' ? '#fbbf24' : '#f87171';
        const srcTxt = _sdmRepoFrom === 'network' ? '✓ 在线 · ' + host
                     : _sdmRepoFrom === 'cache'  ? '⚠ 离线缓存 · ' + host
                     : '✗ 不可用';
        if (stBar) stBar.innerHTML = '插件源: <span style="color:' + srcColor + '">' + srcTxt + '</span> · 仓库 v' + (_sdmManifest.version || '?');
        if (fBar) fBar.textContent = 'SDM Framework v3.6.9.3 · 共 ' + _sdmManifest.plugins.length + ' 个插件 · 源: ' + host;

        list.innerHTML = '';
        for (const p of _sdmManifest.plugins) {
            const localVer = await _sdmGetLocalVer(p.id);
            const isInstalled = !!localVer;
            const isUpdate = isInstalled && localVer !== p.version;
            const btnLabel = !isInstalled ? '安装' : isUpdate ? '更新' : '已装';
            const btnBg  = !isInstalled ? 'rgba(96,165,250,.2)'  : isUpdate ? 'rgba(234,179,8,.2)'  : 'rgba(34,197,94,.15)';
            const btnBd  = !isInstalled ? 'rgba(96,165,250,.5)'  : isUpdate ? 'rgba(234,179,8,.5)'  : 'rgba(34,197,94,.4)';
            const btnCol = !isInstalled ? '#93c5fd'              : isUpdate ? '#fde047'             : '#86efac';
            const sizeLabel = (p.size / 1024 / 1024) > 0.5
                ? (p.size / 1024 / 1024).toFixed(1) + 'MB'
                : Math.round(p.size / 1024) + 'KB';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)';

            const icon = document.createElement('div');
            icon.style.cssText = 'width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;background:' + (isInstalled ? 'rgba(34,197,94,.12)' : 'rgba(96,165,250,.1)') + ';color:' + (isInstalled ? '#4ade80' : '#64748b');
            icon.textContent = isInstalled ? '✓' : '○';

            const info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0';
            info.innerHTML =
                '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (p.name || p.id) + '</div>' +
                '<div style="font-size:10px;color:#64748b;margin-top:2px">' +
                    '本地: <span style="color:' + (isInstalled ? '#86efac' : '#475569') + '">' + (localVer || '未安装') + '</span> &nbsp;|&nbsp; ' +
                    '云端: <span style="color:#60a5fa">' + p.version + '</span> &nbsp;|&nbsp; ' + sizeLabel +
                '</div>';

            const btn = document.createElement('button');
            btn.className = 'sdm_act_btn';
            btn.dataset.id = p.id;
            btn.textContent = btnLabel;
            btn.style.cssText = 'font-size:11px;padding:5px 14px;border-radius:8px;border:1px solid ' + btnBd + ';background:' + btnBg + ';color:' + btnCol + ';cursor:pointer;white-space:nowrap;flex-shrink:0';

            row.appendChild(icon);
            row.appendChild(info);
            row.appendChild(btn);
            list.appendChild(row);
        }
        list.querySelectorAll('.sdm_act_btn').forEach(b => { b.onclick = () => _sdmAction(b.dataset.id); });
    };

    // ════════════════════════════════════════════════════════════
    // 安装 / 更新单个插件
    // ════════════════════════════════════════════════════════════
    const _sdmAction = async (id) => {
        const p = (_sdmManifest?.plugins || []).find(x => x.id === id);
        if (!p) { _sdmLog('未知插件: ' + id, 'err'); return; }
        const tmp = '/data/local/tmp/_sdm_dl_' + id + '.js';
        _sdmLog('正在下载 ' + (p.name || id) + ' ...', 'info');
        const ok = await _sdmDownload(p.file || 'plugins/' + id + '.js', tmp);
        if (!ok) { _sdmLog((p.name || id) + ' 下载失败（源: ' + _sdmBase + '）', 'err'); return; }
        const cat = await _sdmRun('cat ' + _sdmSq(tmp), 8000);
        const code = String(cat?.content || '').trim();
        if (code.length < 100) { _sdmLog((p.name || id) + ' 文件内容异常', 'err'); await _sdmRun('rm -f ' + _sdmSq(tmp), 1000); return; }
        _sdmLog((p.name || id) + ' 下载完成 (' + (code.length / 1024).toFixed(0) + 'KB)，写入本地…', 'info');
        const inst = await _sdmRun(
            'mkdir -p ' + _sdmSq(_SDM_PLUGIN_DIR) + ' && ' +
            'cp ' + _sdmSq(tmp) + ' ' + _sdmSq(_SDM_PLUGIN_DIR + '/' + id + '.js') + ' && ' +
            'echo ' + _sdmSq(p.version) + ' > ' + _sdmSq(_SDM_PLUGIN_DIR + '/' + id + '.ver') + ' && ' +
            'rm -f ' + _sdmSq(tmp),
            5000
        );
        if (inst?.success || String(inst?.content || '').includes(p.version)) {
            _sdmLog((p.name || id) + ' v' + p.version + ' 安装成功 ✓', 'ok');
        } else {
            _sdmLog((p.name || id) + ' 安装未确认，可重试', 'warn');
        }
        _sdmRenderList();
    };

    // ════════════════════════════════════════════════════════════
    // 面板 DOM
    // ════════════════════════════════════════════════════════════
    const _sdmShowPanel = () => {
        if (document.getElementById('sdm_panel')) {
            document.getElementById('sdm_panel').remove();
            return;
        }
        const panel = document.createElement('div');
        panel.id = 'sdm_panel';
        panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:92vw;max-width:420px;max-height:84vh;background:#0f172a;color:#e2e8f0;border-radius:16px;padding:0;font-size:13px;z-index:99998;box-shadow:0 24px 64px rgba(0,0,0,.65);overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif';

        const header = document.createElement('div');
        header.style.cssText = 'background:linear-gradient(135deg,#1e3a5f,#0f2942);padding:14px 18px;flex-shrink:0';
        header.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<div>' +
                    '<div style="font-weight:800;font-size:16px">🔧 SDM 插件管理器</div>' +
                    '<div style="font-size:10px;color:#60a5fa;margin-top:2px">框架 v3.6.9.3 · 云端仓库模式</div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center">' +
                    '<button id="sdm_btn_refresh" style="font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid rgba(96,165,250,.4);background:rgba(96,165,250,.15);color:#93c5fd;cursor:pointer">刷新源</button>' +
                    '<div id="sdm_btn_close" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;color:#94a3b8;user-select:none">✕</div>' +
                '</div>' +
            '</div>' +
            '<div id="sdm_src_status" style="margin-top:8px;font-size:10px;color:#64748b"></div>';

        const listWrap = document.createElement('div');
        listWrap.id = 'sdm_list';
        listWrap.style.cssText = 'flex:1;overflow:auto;padding:6px 18px;min-height:120px';

        const footer = document.createElement('div');
        footer.id = 'sdm_footer';
        footer.style.cssText = 'padding:8px 18px;border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.2);flex-shrink:0;font-size:10px;color:#475569;text-align:center';

        const logArea = document.createElement('div');
        logArea.id = 'sdm_log';
        logArea.style.cssText = 'height:96px;overflow:auto;background:rgba(0,0,0,.4);padding:8px 18px;font-size:10px;line-height:1.8;font-family:monospace;border-top:1px solid rgba(255,255,255,.05);flex-shrink:0';

        panel.appendChild(header);
        panel.appendChild(listWrap);
        panel.appendChild(footer);
        panel.appendChild(logArea);
        document.body.appendChild(panel);

        panel.querySelector('#sdm_btn_close').onclick = () => panel.remove();
        panel.querySelector('#sdm_btn_refresh').onclick = async () => {
            _sdmLog('正在刷新插件源…', 'info');
            await _sdmFetchRepo(true);
            _sdmRenderList();
            _sdmLog('刷新完成（' + (_sdmRepoFrom === 'network' ? '在线' : '缓存') + '）', 'ok');
        };

        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);

        _sdmLog('SDM 框架已就绪（v3.6.9.3）', 'ok');
        _sdmRenderList();
    };

    // ════════════════════════════════════════════════════════════
    // 启动：预拉取仓库（后台），FAB 出现
    // ════════════════════════════════════════════════════════════
    const _sdmBoot = async () => {
        // FAB
        if (!document.getElementById('sdm_fab')) {
            const fab = document.createElement('div');
            fab.id = 'sdm_fab';
            fab.textContent = '🔧';
            fab.title = 'SDM 插件管理器';
            fab.style.cssText = 'position:fixed;right:12px;top:60px;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#1d4ed8);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.4);user-select:none';
            fab.onclick = () => _sdmShowPanel();
            document.body.appendChild(fab);
        }
        // 后台预取仓库清单（不阻塞 UI；失败则打开面板时重试）
        _sdmFetchRepo(false).then(r => {
            if (r) _sdmLog('插件源就绪: ' + (_sdmRepoFrom === 'network' ? '在线' : '缓存') + ' · ' + r.manifest.plugins.length + ' 个插件', 'ok');
            else _sdmLog('插件源拉取失败: ' + _sdmFetchError, 'err');
        });
    };

    setTimeout(_sdmBoot, 1200);

} catch (e) {
    if (typeof createToast === 'function') createToast('SDM 初始化失败: ' + (e?.message || e), 'red', 5000);
    console.error('[SDM] init error:', e);
}
})();
// ── SDM Main 结束 ──
