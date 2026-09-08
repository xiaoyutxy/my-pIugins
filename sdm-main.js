// ─────────────────────────────────────────────────────────────────────────
// SDM 统一入口 (sdm-main.js)
// 版本: 3.6.9.2 · 轻量框架版（无自动加载，插件需手动安装）
// ─────────────────────────────────────────────────────────────────────────
const PLUGIN_VERSION = '3.6.9.2';
//<script>
//@@SDM_PLUGIN_ID:a1b2c3@@
(async () => {
try {
    // ════════════════════════════════════════════════════════════
    // SDM 框架核心（轻量版：无自动加载子插件）
    // ════════════════════════════════════════════════════════════
    const _sdmSq = (v) => `'${String(v ?? '').replace(/'/g, `'\''`)}'`;
    const _sdmRun = async (cmd, timeout = 30000) => {
        try { const r = await runShellWithRoot(cmd, timeout); return r || { success: false, content: '' }; }
        catch (e) { return { success: false, content: '', error: String(e) }; }
    };
    const _sdmWait = (ms) => new Promise(r => setTimeout(r, ms));

    // 8 个 CDN 源（并发探测，最快胜出）
    const _sdmCDN = [
        (f) => `https://jsd.onmicrosoft.cn/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://cdn.jsdmirror.com/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://testingcf.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://cdn.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://fastly.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/${f}`,
        (f) => `https://mirror.ghproxy.com/https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/${f}`,
        (f) => `https://gh-proxy.com/https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/${f}`,
        (f) => `https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/${f}`,
    ];

    const _sdmCDNDownload = async (file, tmpPath) => {
        const srcs = _sdmCDN.map(fn => fn(file));
        const probes = srcs.map(src => _sdmRun(
            `curl -sL --connect-timeout 3 --max-time 10 ${_sdmSq(src)} -o ${_sdmSq(tmpPath)} 2>/dev/null; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo __FAIL__:$ec`,
            13000
        ));
        const results = await Promise.all(probes.map((p, i) => p.then(r => ({ src: srcs[i], ok: String(r?.content||'').includes('__OK__') }))));
        const hit = results.find(r => r.ok);
        return hit ? hit.src : null;
    };

    // 插件定义列表
    const _SDM_DEFS = [
        { id: 'sdm-core',     name: '主面板+游戏加速+工单系统',  file: 'plugins/sdm-core.js',     version: '3.6.9.2', size: 149124 },
        { id: 'sdm-music',    name: 'NMP音乐播放器',              file: 'plugins/sdm-music.js',    version: '3.6.9.2', size: 121762 },
        { id: 'sdm-ai',       name: 'AI设备巡检+网络监控',        file: 'plugins/sdm-ai.js',       version: '3.6.9.2', size: 207962 },
        { id: 'sdm-nettools', name: '去云控限速器+流量监控+SMS', file: 'plugins/sdm-nettools.js', version: '3.6.9.2', size: 140356 },
        { id: 'sdm-hotspot',  name: '热点流量监控',               file: 'plugins/sdm-hotspot.js',  version: '3.6.9.2', size: 91463  },
        { id: 'sdm-battery',  name: '电池监控Pro+充电控制',       file: 'plugins/sdm-battery.js',  version: '3.6.9.2', size: 112357 },
        { id: 'sdm-pet',      name: '桌面悬浮AI宠物',              file: 'plugins/sdm-pet.js',      version: '3.6.9.2', size: 47866  },
    ];
    const _SDM_CACHE = '/data/sdm/plugins';
    const _SDM_FW_VER = '3.6.9.2';

    // ════════════════════════════════════════════════════════════
    // SDM 管理器面板（App Store 风格）
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

    // 获取插件本地安装状态
    const _sdmGetStatus = async () => {
        const st = {};
        for (const p of _SDM_DEFS) {
            const vr = await _sdmRun('cat ' + _sdmSq(_SDM_CACHE + '/' + p.id + '.ver') + ' 2>/dev/null || echo ---', 2000);
            const installed = String(vr?.content || '').trim();
            st[p.id] = {
                installed,
                isInstalled: installed !== '---',
                isUpdate: installed !== '---' && installed !== p.version
            };
        }
        return st;
    };

    // 渲染插件列表
    const _sdmRenderList = async () => {
        const st = await _sdmGetStatus();
        const list = document.getElementById('sdm_list');
        if (!list) return;
        list.innerHTML = '';
        for (const p of _SDM_DEFS) {
            const s = st[p.id];
            const isInstalled = s.isInstalled;
            const isUpdate = s.isUpdate;
            const btnLabel = !isInstalled ? '安装' : isUpdate ? '更新' : '运行中';
            const btnBg   = !isInstalled ? 'rgba(96,165,250,.2)'  : isUpdate ? 'rgba(234,179,8,.2)'  : 'rgba(34,197,94,.2)';
            const btnBd   = !isInstalled ? 'rgba(96,165,250,.5)'  : isUpdate ? 'rgba(234,179,8,.5)'  : 'rgba(34,197,94,.5)';
            const btnCol  = !isInstalled ? '#93c5fd'              : isUpdate ? '#fde047'             : '#86efac';
            const localVer = isInstalled ? s.installed : '—';
            const sizeLabel = (p.size / 1024 / 1024) > 0.5
                ? (p.size / 1024 / 1024).toFixed(1) + 'MB'
                : Math.round(p.size / 1024) + 'KB';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)';

            const icon = document.createElement('div');
            icon.style.cssText = 'width:36px;height:36px;border-radius:10px;background:' + (isInstalled ? 'rgba(34,197,94,.12)' : 'rgba(96,165,250,.1)') + ';display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;color:' + (isInstalled ? '#4ade80' : '#64748b');
            icon.textContent = isInstalled ? '✓' : '○';

            const info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0';
            info.innerHTML =
                '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + p.name + '</div>' +
                '<div style="font-size:10px;color:#64748b;margin-top:2px">' +
                    '本地: <span style="color:' + (isInstalled ? '#86efac' : '#475569') + '">' + localVer + '</span> &nbsp;|&nbsp; ' +
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
        list.querySelectorAll('.sdm_act_btn').forEach(b => {
            b.onclick = () => _sdmAction(b.dataset.id);
        });
    };

    // 安装/更新插件
    const _sdmAction = async (id) => {
        const p = _SDM_DEFS.find(x => x.id === id);
        if (!p) return;
        const tmp = '/data/local/tmp/_sdm_' + id + '.js';
        _sdmLog('正在下载 ' + p.name + '...', 'info');
        const src = await _sdmCDNDownload(p.file, tmp);
        if (!src) { _sdmLog(p.name + ' 下载失败：所有CDN不可达', 'err'); return; }
        const r = await _sdmRun('cat ' + _sdmSq(tmp), 8000);
        const code = String(r?.content || '').trim();
        if (code.length < 100) { _sdmLog(p.name + ' 文件为空', 'err'); return; }
        _sdmLog(p.name + ' 下载成功，正在安装...', 'info');
        const ok = await _sdmRun(
            'mkdir -p ' + _sdmSq(_SDM_CACHE) + ' && ' +
            'cp ' + _sdmSq(tmp) + ' ' + _sdmSq(_SDM_CACHE + '/' + id + '.js') + ' && ' +
            'echo ' + _sdmSq(p.version) + ' > ' + _sdmSq(_SDM_CACHE + '/' + id + '.ver') + ' && ' +
            'rm -f ' + _sdmSq(tmp),
            5000
        );
        if (ok?.success || String(ok?.content || '').includes(p.version)) {
            _sdmLog(p.name + ' 安装成功 ✓', 'ok');
        } else {
            _sdmLog(p.name + ' 安装遇到问题，可重试', 'warn');
        }
        _sdmRenderList();
    };

    // 面板 DOM
    const _sdmShowPanel = () => {
        if (document.getElementById('sdm_panel')) {
            document.getElementById('sdm_panel').remove();
            return;
        }
        const panel = document.createElement('div');
        panel.id = 'sdm_panel';
        panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:92vw;max-width:420px;max-height:82vh;background:#0f172a;color:#e2e8f0;border-radius:16px;padding:0;font-size:13px;z-index:99998;box-shadow:0 24px 64px rgba(0,0,0,.65);overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif';

        const header = document.createElement('div');
        header.style.cssText = 'background:linear-gradient(135deg,#1e3a5f,#0f2942);padding:16px 18px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0';
        header.innerHTML =
            '<div>' +
                '<div style="font-weight:800;font-size:16px">🔧 SDM 插件管理器</div>' +
                '<div style="font-size:10px;color:#60a5fa;margin-top:2px">框架 v' + _SDM_FW_VER + ' · 轻量版</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center">' +
                '<button id="sdm_btn_refresh" style="font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid rgba(96,165,250,.4);background:rgba(96,165,250,.15);color:#93c5fd;cursor:pointer">刷新</button>' +
                '<div id="sdm_btn_close" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;color:#94a3b8;user-select:none">✕</div>' +
            '</div>';

        const tip = document.createElement('div');
        tip.style.cssText = 'padding:10px 18px;background:rgba(96,165,250,.05);border-bottom:1px solid rgba(96,165,250,.1);flex-shrink:0';
        tip.innerHTML =
            '<div style="font-size:11px;color:#60a5fa;font-weight:600">💡 使用说明</div>' +
            '<div style="font-size:10px;color:#64748b;margin-top:3px">插件需从 <strong style="color:#93c5fd">高级后台</strong> 手动安装。点击「安装/更新」按钮即可下载。</div>';

        const listWrap = document.createElement('div');
        listWrap.id = 'sdm_list';
        listWrap.style.cssText = 'flex:1;overflow:auto;padding:6px 18px';

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 18px;border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.2);flex-shrink:0';
        footer.innerHTML = '<div style="font-size:10px;color:#475569;text-align:center">SDM Framework v' + _SDM_FW_VER + ' · 共 ' + _SDM_DEFS.length + ' 个插件可用</div>';

        const logArea = document.createElement('div');
        logArea.id = 'sdm_log';
        logArea.style.cssText = 'height:100px;overflow:auto;background:rgba(0,0,0,.4);padding:8px 18px;font-size:10px;line-height:1.8;font-family:monospace;border-top:1px solid rgba(255,255,255,.05);flex-shrink:0';

        panel.appendChild(header);
        panel.appendChild(tip);
        panel.appendChild(listWrap);
        panel.appendChild(footer);
        panel.appendChild(logArea);
        document.body.appendChild(panel);

        panel.querySelector('#sdm_btn_close').onclick = () => panel.remove();
        panel.querySelector('#sdm_btn_refresh').onclick = () => _sdmRenderList();

        _sdmLog('SDM 框架已就绪（v' + _SDM_FW_VER + '）', 'ok');
        _sdmRenderList();

        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                panel.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    };

    // FAB 悬浮按钮
    const _sdmFab = () => {
        if (document.getElementById('sdm_fab')) return;
        const fab = document.createElement('div');
        fab.id = 'sdm_fab';
        fab.textContent = '🔧';
        fab.title = 'SDM 插件管理器';
        fab.style.cssText = 'position:fixed;right:12px;top:60px;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#1d4ed8);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.4);user-select:none';
        fab.onclick = () => {
            const p = document.getElementById('sdm_panel');
            if (p) { p.remove(); return; }
            _sdmShowPanel();
        };
        document.body.appendChild(fab);
        _sdmLog('SDM Framework v' + _SDM_FW_VER + ' 已加载', 'ok');
    };

    // 延迟启动（等 KANO UI 渲染完毕）
    setTimeout(_sdmFab, 1500);

} catch (e) {
    if (typeof createToast === 'function') createToast('SDM 初始化失败: ' + (e?.message || e), 'red', 5000);
    console.error('[SDM] init error:', e);
}
})();
// ── SDM Main 结束 ──
