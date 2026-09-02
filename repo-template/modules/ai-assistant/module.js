// SDM Module: ai-assistant
//@@SDM_MODULE_ai-assistant@@
// Version: 1.0.0
// Description: AI智能助手 - PicoClaw聊天、设备巡检、网络监控
(async function(SDM) {
    if (!SDM) return;
    const MODULE_ID = 'ai-assistant';
    const MODULE_NAME = 'AI智能助手';
    const MODULE_VERSION = '1.0.0';

    // ─── 状态 ───
    let _aiRunning = false;
    let _aiCheckTimer = null;
    let _netCheckTimer = null;
    let _panelVisible = false;
    let _pendingCommands = [];
    let _aiLogs = [];
    let _netHistory = [];
    let _cmdIdCounter = 1;
    let _scanCount = 0;
    let _netStatus = { ping: -1, loss: -1, dns: -1, status: '未知' };

    // ─── 工具 ───
    const _run = SDM.runShell;

    const aiLog = (msg, level) => {
        const now = new Date();
        const t = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
        const icon = level === 'warn' ? '⚠️' : level === 'error' ? '🔴' : level === 'success' ? '✅' : level === 'net' ? '📡' : 'ℹ️';
        _aiLogs.unshift({ time: t, text: msg, level: level || 'info', icon: icon });
        if (_aiLogs.length > 100) _aiLogs.length = 100;
        renderAILogs();
    };

    const renderAILogs = () => {
        const container = document.getElementById('ai_log_list');
        if (!container) return;
        container.innerHTML = _aiLogs.map(l => `
            <div style="padding:4px 8px;font-size:.52rem;line-height:1.6;border-bottom:1px solid rgba(255,255,255,.03);">
                <span style="opacity:.5;">[${l.time}]</span> ${l.icon} ${l.text}
            </div>
        `).join('');
    };

    // ─── 设备巡检 ───
    const runDeviceCheck = async () => {
        _scanCount++;
        aiLog(`第 ${_scanCount} 轮设备巡检开始`, 'info');

        const issues = [];

        // 检查1: 网络延迟
        try {
            const r = await _run('ping -c 2 -W 2 8.8.8.8 2>&1 | tail -1', 6000);
            const match = String(r.content || '').match(/(\d+\.?\d*)\/(\d+\.?\d*)\/(\d+\.?\d*)\/(\d+\.?\d*)/);
            if (match) {
                const avg = parseFloat(match[3]);
                _netStatus.ping = avg;
                if (avg > 200) issues.push({ type: 'high_latency', desc: `网络延迟较高 (${avg.toFixed(0)}ms)`, severity: 'warn' });
                else if (avg > 500) issues.push({ type: 'very_high_latency', desc: `网络延迟严重 (${avg.toFixed(0)}ms)`, severity: 'error' });
            }
        } catch (e) {
            issues.push({ type: 'ping_fail', desc: '无法 ping 通外网', severity: 'error' });
        }

        // 检查2: ARP表
        try {
            const r = await _run('cat /proc/net/arp 2>/dev/null | wc -l', 3000);
            const count = parseInt(r.content || '0') - 1;
            if (count < 0) count = 0;
            aiLog(`当前连接设备: ${count} 台`, 'info');
        } catch {}

        if (issues.length === 0) {
            aiLog(`第 ${_scanCount} 轮巡检完成，一切正常`, 'success');
        } else {
            aiLog(`第 ${_scanCount} 轮巡检完成，发现 ${issues.length} 个问题`, 'warn');
            issues.forEach(issue => {
                _pendingCommands.push({
                    id: _cmdIdCounter++,
                    description: issue.desc,
                    category: issue.type,
                    status: 'pending'
                });
            });
        }

        updatePendingCount();
    };

    const updatePendingCount = () => {
        const count = _pendingCommands.filter(c => c.status === 'pending').length;
        const badge = document.getElementById('ai_pending_badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    };

    // ─── 面板 HTML ───
    const panelHtml = `
    <div id="smart_ai_fab" style="position:fixed;bottom:80px;right:16px;z-index:100003;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:22px;box-shadow:0 4px 20px rgba(99,102,241,.5);display:flex;align-items:center;justify-content:center;transition:transform .2s;">🤖</div>

    <div id="smart_ai_overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:100001;display:none;"></div>

    <div id="smart_ai_panel" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:420px;max-width:94vw;max-height:85vh;overflow-y:auto;z-index:100002;border-radius:18px;padding:14px;background:linear-gradient(135deg,rgba(20,18,35,.97),rgba(35,28,55,.97));border:1px solid rgba(216,180,254,.45);box-shadow:0 8px 50px rgba(0,0,0,.7),0 0 40px rgba(167,139,250,.25);display:none;color:#fff;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:.75rem;font-weight:700;background:linear-gradient(135deg,#c084fc,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">🤖 AI 智能助手</div>
            <button id="ai_close_btn" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:.8rem;">✕</button>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:10px;">
            <button class="ai-tab-btn active" data-tab="status" style="flex:1;font-size:.52rem;padding:6px;border-radius:8px;border:1px solid rgba(167,139,250,.3);background:rgba(167,139,250,.15);color:#c4b5fd;cursor:pointer;">运行状态</button>
            <button class="ai-tab-btn" data-tab="logs" style="flex:1;font-size:.52rem;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#94a3b8;cursor:pointer;">巡检日志</button>
            <button class="ai-tab-btn" data-tab="pending" style="flex:1;font-size:.52rem;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#94a3b8;cursor:pointer;position:relative;">
                待处理
                <span id="ai_pending_badge" style="position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#ef4444;color:#fff;font-size:.4rem;display:none;align-items:center;justify-content:center;">0</span>
            </button>
        </div>

        <div id="ai_tab_status">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="padding:10px;border-radius:10px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);text-align:center;">
                    <div style="font-size:.45rem;opacity:.6;margin-bottom:4px;">巡检状态</div>
                    <div id="ai_status_text" style="font-size:.65rem;font-weight:600;color:#86efac;">已停止</div>
                </div>
                <div style="padding:10px;border-radius:10px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);text-align:center;">
                    <div style="font-size:.45rem;opacity:.6;margin-bottom:4px;">巡检次数</div>
                    <div id="ai_scan_count" style="font-size:.65rem;font-weight:600;color:#93c5fd;">0</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;">
                <button id="ai_toggle_btn" style="flex:1;font-size:.55rem;padding:8px;border-radius:10px;border:none;background:linear-gradient(135deg,#4ade80,#22c55e);color:#052e16;font-weight:600;cursor:pointer;">▶ 启动巡检</button>
                <button id="ai_check_now" style="flex:1;font-size:.55rem;padding:8px;border-radius:10px;border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.1);color:#c4b5fd;cursor:pointer;">立即巡检</button>
            </div>
        </div>

        <div id="ai_tab_logs" style="display:none;">
            <div id="ai_log_list" style="max-height:300px;overflow-y:auto;border-radius:10px;background:rgba(0,0,0,.25);padding:6px;">
                <div style="text-align:center;padding:20px;font-size:.55rem;opacity:.5;">暂无巡检记录</div>
            </div>
        </div>

        <div id="ai_tab_pending" style="display:none;">
            <div id="ai_pending_list" style="max-height:300px;overflow-y:auto;">
                <div style="text-align:center;padding:20px;font-size:.55rem;opacity:.5;">暂无待处理问题</div>
            </div>
        </div>
    </div>
    `;

    // ─── 注册面板 ───
    SDM.registerPanel(MODULE_ID, panelHtml);

    // ─── 绑定事件 ───
    setTimeout(() => {
        const fab = document.getElementById('smart_ai_fab');
        const panel = document.getElementById('smart_ai_panel');
        const overlay = document.getElementById('smart_ai_overlay');
        const closeBtn = document.getElementById('ai_close_btn');

        const togglePanel = () => {
            _panelVisible = !_panelVisible;
            if (_panelVisible) {
                panel.style.display = 'block';
                overlay.style.display = 'block';
            } else {
                panel.style.display = 'none';
                overlay.style.display = 'none';
            }
        };

        if (fab) fab.onclick = togglePanel;
        if (closeBtn) closeBtn.onclick = togglePanel;
        if (overlay) overlay.onclick = togglePanel;

        // Tab 切换
        document.querySelectorAll('.ai-tab-btn').forEach(btn => {
            btn.onclick = () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.ai-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'rgba(255,255,255,.04)';
                    b.style.color = '#94a3b8';
                    b.style.borderColor = 'rgba(255,255,255,.1)';
                });
                btn.classList.add('active');
                btn.style.background = 'rgba(167,139,250,.15)';
                btn.style.color = '#c4b5fd';
                btn.style.borderColor = 'rgba(167,139,250,.3)';

                ['status', 'logs', 'pending'].forEach(t => {
                    const el = document.getElementById('ai_tab_' + t);
                    if (el) el.style.display = t === tab ? 'block' : 'none';
                });
            };
        });

        // 启动/停止巡检
        const toggleBtn = document.getElementById('ai_toggle_btn');
        const statusText = document.getElementById('ai_status_text');
        const scanCountEl = document.getElementById('ai_scan_count');

        if (toggleBtn) {
            toggleBtn.onclick = () => {
                _aiRunning = !_aiRunning;
                if (_aiRunning) {
                    toggleBtn.textContent = '⏸ 停止巡检';
                    toggleBtn.style.background = 'linear-gradient(135deg,#f87171,#ef4444)';
                    toggleBtn.style.color = '#450a0a';
                    statusText.textContent = '运行中';
                    statusText.style.color = '#86efac';
                    _aiCheckTimer = setInterval(runDeviceCheck, 60000);
                    aiLog('AI巡检已启动', 'success');
                    runDeviceCheck();
                } else {
                    toggleBtn.textContent = '▶ 启动巡检';
                    toggleBtn.style.background = 'linear-gradient(135deg,#4ade80,#22c55e)';
                    toggleBtn.style.color = '#052e16';
                    statusText.textContent = '已停止';
                    statusText.style.color = '#f87171';
                    if (_aiCheckTimer) clearInterval(_aiCheckTimer);
                    aiLog('AI巡检已停止', 'warn');
                }
            };
        }

        // 立即巡检
        const checkNowBtn = document.getElementById('ai_check_now');
        if (checkNowBtn) {
            checkNowBtn.onclick = () => {
                runDeviceCheck();
                scanCountEl.textContent = _scanCount;
            };
        }

        aiLog('AI智能助手模块已加载', 'success');
        SDM.emit('module:ready', MODULE_ID);
    }, 200);

    // ─── 监听卸载事件 ───
    SDM.on('module:unload', (id) => {
        if (id === MODULE_ID) {
            if (_aiCheckTimer) clearInterval(_aiCheckTimer);
            if (_netCheckTimer) clearInterval(_netCheckTimer);
            const panel = document.getElementById(`sdm-panel-${MODULE_ID}`);
            if (panel) panel.remove();
            const fab = document.getElementById('smart_ai_fab');
            if (fab) fab.remove();
        }
    });

    console.log(`[SDM Module] ${MODULE_NAME} v${MODULE_VERSION} 已加载`);
})(window.SDM);
