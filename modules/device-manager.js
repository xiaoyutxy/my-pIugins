// SDM Module: device-manager
//@@SDM_MODULE_device-manager@@
// Version: 1.0.0
// Description: 设备管理器 - 设备扫描、活动日志、网络诊断
(async function(SDM) {
    if (!SDM) return;
    const MODULE_ID = 'device-manager';
    const MODULE_NAME = '设备管理器';
    const MODULE_VERSION = '1.0.0';

    // ─── 状态 ───
    let SCAN_INTERVAL = null;
    let ACTIVITY_LOG = [];
    let DIAG_LOG = [];
    let SCAN_INTERVAL_MS = 10000;
    let _isScanning = false;
    let _devices = [];

    // ─── 工具函数 ───
    const _run = SDM.runShell;
    const _wait = SDM.wait;

    const addLog = (msg, type) => {
        const now = new Date();
        const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
        ACTIVITY_LOG.unshift({ time: t, text: msg, type: type || 'info' });
        if (ACTIVITY_LOG.length > 100) ACTIVITY_LOG.length = 100;
        const logEl = document.getElementById('smart_log_area');
        if (logEl) logEl.value = ACTIVITY_LOG.map(l => `[${l.time}] ${l.text}`).join('\n');
    };

    const addDiagLog = (msg, type) => {
        const now = new Date();
        const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
        DIAG_LOG.unshift({ time: t, text: msg, type: type || 'info' });
        if (DIAG_LOG.length > 100) DIAG_LOG.length = 100;
        const logEl = document.getElementById('smart_diag_log');
        if (logEl) logEl.value = DIAG_LOG.map(l => `[${l.time}] ${l.text}`).join('\n');
    };

    // ─── 设备扫描 ───
    const scanDevices = async () => {
        if (_isScanning) return;
        _isScanning = true;
        addLog('开始扫描设备...', 'info');

        try {
            // 获取 ARP 表
            const arpR = await _run("cat /proc/net/arp 2>/dev/null | awk 'NR>1 {print $1, $4}'", 5000);
            const arpLines = String(arpR?.content || '').trim().split('\n').filter(l => l);
            const arpDevices = arpLines.map(line => {
                const parts = line.split(/\s+/);
                return { ip: parts[0], mac: parts[1]?.toUpperCase() || '', type: 'arp' };
            }).filter(d => d.mac && d.mac !== '00:00:00:00:00:00');

            // 从 ip neigh 补充
            const neighR = await _run("ip neigh show 2>/dev/null | grep -v FAILED | grep -v INCOMPLETE", 5000);
            const neighLines = String(neighR?.content || '').trim().split('\n').filter(l => l);
            neighLines.forEach(line => {
                const match = line.match(/(\d+\.\d+\.\d+\.\d+).*?([0-9a-fA-F:]{17})/);
                if (match && !arpDevices.find(d => d.ip === match[1])) {
                    arpDevices.push({ ip: match[1], mac: match[2].toUpperCase(), type: 'neigh' });
                }
            });

            _devices = arpDevices;
            updateDeviceList();
            addLog(`扫描完成，发现 ${_devices.length} 台设备`, 'success');
        } catch (e) {
            addLog('扫描失败: ' + e.message, 'error');
        }

        _isScanning = false;
    };

    // ─── 设备列表渲染 ───
    const updateDeviceList = () => {
        const listEl = document.getElementById('smart_scan_list');
        const countEl = document.getElementById('smart_device_count');
        if (!listEl) return;

        if (countEl) countEl.textContent = _devices.length;

        if (_devices.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;opacity:.55;font-size:.6rem">🌸 暂无设备，点击刷新按钮扫描 🌸</div>';
            return;
        }

        listEl.innerHTML = _devices.map((d, i) => `
            <div style="padding:10px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.05);">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7dd3fc,#38bdf8);display:flex;align-items:center;justify-content:center;font-size:.8rem;">📱</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:.6rem;font-weight:600;color:#e2e8f0;">设备 ${i + 1}</div>
                    <div style="font-size:.5rem;color:#94a3b8;font-family:monospace;">${d.ip}</div>
                    <div style="font-size:.45rem;color:#64748b;font-family:monospace;">${d.mac}</div>
                </div>
                <div style="font-size:.45rem;color:#86efac;padding:2px 8px;border-radius:8px;background:rgba(134,239,172,.15);">在线</div>
            </div>
        `).join('');
    };

    // ─── 网络诊断 ───
    const runDiagnostic = async () => {
        addDiagLog('开始网络诊断...', 'info');

        const tests = [
            { name: '网关连通性', cmd: 'ip route | grep default | awk \'{print $3}\' | head -1 | xargs -I{} ping -c 2 -W 2 {} 2>&1 | tail -1' },
            { name: 'DNS 解析', cmd: 'nslookup baidu.com 2>&1 | head -5 || echo "nslookup不可用"' },
            { name: '外网连通性', cmd: 'ping -c 2 -W 2 8.8.8.8 2>&1 | tail -1' },
        ];

        for (const test of tests) {
            addDiagLog(`检测: ${test.name}`, 'info');
            const r = await _run(test.cmd, 8000);
            const result = String(r?.content || '').trim().slice(0, 200);
            addDiagLog(`结果: ${result || '(无输出)'}`, r.success ? 'success' : 'warn');
        }

        addDiagLog('诊断完成', 'success');
    };

    // ─── 面板 HTML ───
    const panelHtml = `
    <div class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(125,211,252,.05),rgba(56,189,248,.04));border:1px solid rgba(125,211,252,.14);">
        <div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            <span style="background:linear-gradient(135deg,#7dd3fc,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;">📱 已连接设备</span>
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:.55rem;opacity:.6;">共 <span id="smart_device_count">0</span> 台</span>
                <select id="smart_scan_interval" style="font-size:.45rem;padding:2px 6px;border-radius:8px;border:1px solid rgba(125,211,252,.25);background:rgba(125,211,252,.1);color:rgba(255,255,255,.85);outline:none;">
                    <option value="3000">3秒</option>
                    <option value="5000">5秒</option>
                    <option value="10000" selected>10秒</option>
                    <option value="15000">15秒</option>
                    <option value="30000">30秒</option>
                </select>
                <button id="smart_refresh_now" style="font-size:.45rem;padding:3px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#7dd3fc,#38bdf8);color:#0c4a6e;font-weight:600;cursor:pointer;">🔄 刷新</button>
            </div>
        </div>
        <div id="smart_scan_list" style="max-height:300px;overflow-y:auto;border-radius:12px;background:rgba(0,0,0,.2);">
            <div style="text-align:center;padding:20px;opacity:.55;font-size:.6rem">🌸 点击刷新按钮扫描设备 🌸</div>
        </div>
    </div>

    <div class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(167,139,252,.05),rgba(196,132,252,.04));border:1px solid rgba(167,139,252,.14);">
        <div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            <span style="background:linear-gradient(135deg,#c084fc,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;">📜 活动日志</span>
            <button id="smart_clear_log" style="font-size:.45rem;padding:3px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#fb7185,#f43f5e);color:#fff;font-weight:600;cursor:pointer;">清空</button>
        </div>
        <textarea id="smart_log_area" disabled style="font-size:.5rem !important;border:none;padding:8px;margin:0;width:100%;height:120px;border-radius:12px;overflow-x:hidden;background:linear-gradient(135deg,rgba(20,12,28,.55),rgba(30,18,44,.45));color:rgba(255,214,232,.7);border:1px solid rgba(192,132,252,.2);" placeholder="暂无日志 ✨"></textarea>
    </div>

    <div class="sdm2-card" style="padding:14px;border-radius:18px;margin-bottom:10px;border:1px solid rgba(251,191,36,.2);background:linear-gradient(135deg,rgba(251,191,36,.07),rgba(245,158,11,.05));">
        <div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
            <span style="background:linear-gradient(135deg,#fbbf24,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;">📊 网络诊断</span>
            <button id="smart_run_diag" style="font-size:.45rem;padding:3px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#422006;font-weight:600;cursor:pointer;">开始诊断</button>
        </div>
        <textarea id="smart_diag_log" disabled style="font-size:.5rem !important;border:none;padding:8px;margin:0;width:100%;height:100px;border-radius:12px;overflow-x:hidden;background:linear-gradient(135deg,rgba(20,12,28,.55),rgba(30,18,44,.45));color:rgba(251,191,36,.7);border:1px solid rgba(251,191,36,.18);" placeholder="暂无诊断日志 ✨"></textarea>
    </div>
    `;

    // ─── 注册面板 ───
    SDM.registerPanel(MODULE_ID, panelHtml);

    // ─── 绑定事件 ───
    setTimeout(() => {
        const refreshBtn = document.getElementById('smart_refresh_now');
        if (refreshBtn) refreshBtn.onclick = scanDevices;

        const clearLogBtn = document.getElementById('smart_clear_log');
        if (clearLogBtn) clearLogBtn.onclick = () => {
            ACTIVITY_LOG = [];
            const logEl = document.getElementById('smart_log_area');
            if (logEl) logEl.value = '';
            SDM.toast('日志已清空', 'green', 1500);
        };

        const diagBtn = document.getElementById('smart_run_diag');
        if (diagBtn) diagBtn.onclick = runDiagnostic;

        const intervalSelect = document.getElementById('smart_scan_interval');
        if (intervalSelect) {
            intervalSelect.onchange = (e) => {
                SCAN_INTERVAL_MS = parseInt(e.target.value) || 10000;
                if (SCAN_INTERVAL) {
                    clearInterval(SCAN_INTERVAL);
                    SCAN_INTERVAL = setInterval(scanDevices, SCAN_INTERVAL_MS);
                }
            };
        }

        // 启动自动扫描
        SCAN_INTERVAL = setInterval(scanDevices, SCAN_INTERVAL_MS);
        scanDevices();

        addDiagLog('设备管理器模块已加载', 'success');
        SDM.emit('module:ready', MODULE_ID);
    }, 100);

    // ─── 监听卸载事件 ───
    SDM.on('module:unload', (id) => {
        if (id === MODULE_ID) {
            if (SCAN_INTERVAL) clearInterval(SCAN_INTERVAL);
            const panel = document.getElementById(`sdm-panel-${MODULE_ID}`);
            if (panel) panel.remove();
        }
    });

    console.log(`[SDM Module] ${MODULE_NAME} v${MODULE_VERSION} 已加载`);
})(window.SDM);
