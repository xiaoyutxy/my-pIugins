// SDM Module: signal-monitor
//@@SDM_MODULE_signal-monitor@@
// Version: 1.0.0
// Description: 5G信号监控 - 信号强度监控、质量图表分析
(async function(SDM) {
    if (!SDM) return;
    const MODULE_ID = 'signal-monitor';
    const MODULE_NAME = '5G信号监控';
    const MODULE_VERSION = '1.0.0';

    // ─── 状态 ───
    let _isMonitoring = true;
    let _monitorInterval = null;
    let _history = { power: [], sinr: [], rsrq: [] };
    let _chartData = { power: [], sinr: [], rsrq: [], timestamps: [] };
    let _bestValues = { power: -999, sinr: -999, rsrq: -999 };
    let _sampleCount = 0;
    let _intervalMs = 1000;

    const CHART_MAX_POINTS = 30;
    const COLORS = { EXCELLENT:'#52ef58', GOOD:'#8BC34A', FAIR:'#FFC107', POOR:'#FF9800', BAD:'#f44336', PENDING:'#666' };

    // ─── 工具 ───
    const _run = SDM.runShell;

    // ─── 信号质量评估 ───
    const getPowerQuality = (power) => {
        if (power === -999 || power === 0) return { label: '检测中', color: COLORS.PENDING };
        if (power >= -85) return { label: '优秀', color: COLORS.EXCELLENT };
        if (power >= -95) return { label: '良好', color: COLORS.GOOD };
        if (power >= -105) return { label: '一般', color: COLORS.FAIR };
        if (power >= -115) return { label: '较差', color: COLORS.POOR };
        return { label: '很差', color: COLORS.BAD };
    };

    const getSinrQuality = (sinr) => {
        if (sinr === -999) return { label: '-', color: COLORS.PENDING };
        if (sinr >= 20) return { label: '极好', color: COLORS.EXCELLENT };
        if (sinr >= 13) return { label: '良好', color: COLORS.GOOD };
        if (sinr >= 7) return { label: '中等', color: COLORS.FAIR };
        if (sinr >= 0) return { label: '较差', color: COLORS.POOR };
        return { label: '很差', color: COLORS.BAD };
    };

    const calculateAverage = (arr, current) => {
        const recent = arr.slice(-10);
        if (recent.length === 0) return current;
        const sum = recent.reduce((a, b) => a + b, 0);
        return sum / recent.length;
    };

    // ─── 从页面解析信号数据 ───
    const parseSignalFromPage = () => {
        // 尝试从页面元素获取信号数据
        const els = document.querySelectorAll('[class*="signal"], [id*="signal"], [class*="rsrp"], [id*="rsrp"]');
        let power = -999, sinr = -999, rsrq = -999;

        // 简化：模拟从系统获取
        // 实际使用时需要根据具体设备的信号读取方式调整
        return { power, sinr, rsrq, source: 'page' };
    };

    // ─── 从系统获取信号数据 ───
    const fetchSignalData = async () => {
        try {
            // 尝试多种方式获取信号数据
            const r = await _run('dumpsys telephony.registry 2>/dev/null | grep -i "signal" | head -10', 5000);
            const text = String(r?.content || '');

            let power = -999, sinr = -999, rsrq = -999;

            // 解析 RSRP
            const rsrpMatch = text.match(/rsrp[=:\s]+(-?\d+)/i);
            if (rsrpMatch) power = parseInt(rsrpMatch[1]);

            // 解析 SINR
            const sinrMatch = text.match(/sinr[=:\s]+(-?\d+)/i);
            if (sinrMatch) sinr = parseInt(sinrMatch[1]);

            // 解析 RSRQ
            const rsrqMatch = text.match(/rsrq[=:\s]+(-?\d+)/i);
            if (rsrqMatch) rsrq = parseInt(rsrqMatch[1]);

            return { power, sinr, rsrq, source: 'system' };
        } catch (e) {
            return { power: -999, sinr: -999, rsrq: -999, source: 'error' };
        }
    };

    // ─── 更新显示 ───
    const updateSignalDisplay = (data) => {
        const powerEl = document.getElementById('signal_power');
        const qualityEl = document.getElementById('signal_quality');
        const avgPowerEl = document.getElementById('avg_power');
        const bestPowerEl = document.getElementById('best_power');
        const sampleCountEl = document.getElementById('sample_count');
        const lastUpdateEl = document.getElementById('last_update_time');

        if (powerEl) powerEl.textContent = data.power > -999 ? data.power + ' dBm' : '- dBm';

        const pq = getPowerQuality(data.power);
        if (qualityEl) {
            qualityEl.textContent = pq.label;
            qualityEl.style.color = pq.color;
        }

        if (data.power > -999) {
            _history.power.push(data.power);
            if (_history.power.length > 50) _history.power.shift();
            if (data.power > _bestValues.power) _bestValues.power = data.power;
            _sampleCount++;
        }

        const avg = calculateAverage(_history.power, data.power);
        if (avgPowerEl) avgPowerEl.textContent = avg > -999 ? avg.toFixed(1) + ' dBm' : '- dBm';
        if (bestPowerEl) bestPowerEl.textContent = _bestValues.power > -999 ? _bestValues.power + ' dBm' : '- dBm';
        if (sampleCountEl) sampleCountEl.textContent = _sampleCount;

        const now = new Date();
        const t = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
        if (lastUpdateEl) lastUpdateEl.textContent = t;

        // 更新状态点
        updateStatusDots('status_dots_power', _history.power, 'power');
    };

    const updateStatusDots = (containerId, history, type) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const dots = container.querySelectorAll('.status-dot');
        const recent = history.slice(-12);
        recent.forEach((val, i) => {
            if (dots[i]) {
                const q = getPowerQuality(val);
                dots[i].style.backgroundColor = q.color;
                dots[i].style.boxShadow = `0 0 3px ${q.color}`;
            }
        });
    };

    // ─── 初始化状态点 ───
    const initStatusDots = () => {
        const container = document.getElementById('status_dots_power');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 12; i++) {
            const dot = document.createElement('div');
            dot.className = 'status-dot';
            dot.style.cssText = 'width:5px;height:5px;border-radius:50%;background-color:#666;flex-shrink:0;transition:all .3s ease;';
            container.appendChild(dot);
        }
    };

    // ─── 面板 HTML ───
    const panelHtml = `
    <div style="width:100%;padding:0;margin-top:8px;">
        <div style="margin:4px 0;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:14px;">📶 5G信号监控</strong>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-right:4px;">
                <select id="signal_interval_select" style="padding:3px 5px;font-size:.75rem;background:#333;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;">
                    <option value="500">0.5秒</option>
                    <option value="1000" selected>1秒</option>
                    <option value="3000">3秒</option>
                    <option value="5000">5秒</option>
                </select>
                <button id="signal_refresh_btn" style="padding:3px 10px;font-size:.75rem;border-radius:6px;border:1px solid rgba(134,239,172,.4);background:rgba(134,239,172,.15);color:#86efac;cursor:pointer;">刷新</button>
                <button id="signal_monitor_btn" style="padding:3px 10px;font-size:.75rem;border-radius:6px;border:1px solid rgba(76,175,80,.4);background:rgba(76,175,80,.2);color:#86efac;cursor:pointer;">监控中</button>
            </div>
        </div>

        <div style="margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.05);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:#cbd5e1;">
                <span>数据源: <span id="data_source_indicator" style="color:#52ef58;">系统读取</span></span>
                <span>更新: <span id="last_update_time">-</span></span>
                <span>样本: <span id="sample_count">0</span></span>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:8px;">
            <div style="padding:.75rem;background:linear-gradient(135deg,rgba(76,175,80,0.15),rgba(76,175,80,0.05));border-radius:12px;border:1px solid rgba(76,175,80,0.3);position:relative;">
                <div style="position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%;background:#52ef58;box-shadow:0 0 8px #52ef58;animation:sdm-pulse 2s ease-in-out infinite;"></div>
                <div style="text-align:center;margin-bottom:10px;">
                    <div style="font-size:.65rem;color:#86efac;margin-bottom:4px;font-weight:600;">信号强度 (RSRP)</div>
                    <div id="signal_power" style="font-size:24px;font-weight:bold;color:#52ef58;margin-bottom:4px;">- dBm</div>
                </div>
                <div id="status_dots_power" style="display:flex;gap:4px;align-items:center;justify-content:center;height:12px;margin-bottom:8px;"></div>
                <div style="display:flex;justify-content:space-between;font-size:.7rem;background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;">
                    <div id="signal_quality" style="font-weight:bold;color:#86efac;">检测中</div>
                    <div style="color:#94a3b8;">平均: <span id="avg_power" style="color:#86efac;font-weight:bold;">- dBm</span></div>
                    <div style="color:#94a3b8;">最佳: <span id="best_power" style="color:#86efac;font-weight:bold;">- dBm</span></div>
                </div>
            </div>
        </div>

        <div style="padding:8px;background:rgba(0,0,0,0.15);border-radius:8px;font-size:.55rem;color:#94a3b8;line-height:1.6;">
            <div style="font-weight:600;margin-bottom:4px;color:#cbd5e1;">📖 信号参考标准</div>
            <div>RSRP ≥ -85dBm: 优秀 | ≥ -95dBm: 良好 | ≥ -105dBm: 一般 | ≥ -115dBm: 较差</div>
        </div>
    </div>
    `;

    // ─── 注册面板 ───
    SDM.registerPanel(MODULE_ID, panelHtml);

    // ─── 绑定事件 ───
    setTimeout(() => {
        initStatusDots();

        const monitorBtn = document.getElementById('signal_monitor_btn');
        const refreshBtn = document.getElementById('signal_refresh_btn');
        const intervalSelect = document.getElementById('signal_interval_select');

        const toggleMonitor = () => {
            _isMonitoring = !_isMonitoring;
            if (_isMonitoring) {
                monitorBtn.textContent = '监控中';
                monitorBtn.style.background = 'rgba(76,175,80,.2)';
                monitorBtn.style.color = '#86efac';
                startMonitoring();
            } else {
                monitorBtn.textContent = '已暂停';
                monitorBtn.style.background = 'rgba(239,68,68,.2)';
                monitorBtn.style.color = '#fca5a5';
                stopMonitoring();
            }
        };

        const startMonitoring = () => {
            if (_monitorInterval) clearInterval(_monitorInterval);
            _monitorInterval = setInterval(async () => {
                const data = await fetchSignalData();
                updateSignalDisplay(data);
            }, _intervalMs);
        };

        const stopMonitoring = () => {
            if (_monitorInterval) {
                clearInterval(_monitorInterval);
                _monitorInterval = null;
            }
        };

        if (monitorBtn) monitorBtn.onclick = toggleMonitor;
        if (refreshBtn) refreshBtn.onclick = async () => {
            const data = await fetchSignalData();
            updateSignalDisplay(data);
        };
        if (intervalSelect) {
            intervalSelect.onchange = (e) => {
                _intervalMs = parseInt(e.target.value) || 1000;
                if (_isMonitoring) startMonitoring();
            };
        }

        // 启动监控
        startMonitoring();

        console.log(`[SDM Module] ${MODULE_NAME} v${MODULE_VERSION} 已加载`);
        SDM.emit('module:ready', MODULE_ID);
    }, 200);

    // ─── 监听卸载事件 ───
    SDM.on('module:unload', (id) => {
        if (id === MODULE_ID) {
            if (_monitorInterval) clearInterval(_monitorInterval);
            const panel = document.getElementById(`sdm-panel-${MODULE_ID}`);
            if (panel) panel.remove();
        }
    });

})(window.SDM);
