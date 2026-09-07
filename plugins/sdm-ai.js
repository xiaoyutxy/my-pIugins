// ─────────────────────────────────────────────────────────────────────────────
// 插件: AI设备巡检+网络监控
// ID: sdm-ai
// 版本: 3.6.9.0
// 此文件为独立插件，由 SDM 统一更新管理器管理
// ─────────────────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'sdm-ai';
const PLUGIN_VERSION = '3.6.9.0';

// 注册到统一更新管理器
if (typeof SDMUpdater !== 'undefined' && SDMUpdater && SDMUpdater.register) {
    SDMUpdater.register({ id: PLUGIN_ID, name: 'AI设备巡检+网络监控', version: PLUGIN_VERSION, file: 'plugins/sdm-ai.js' });
}
    // 【性能优化】延迟600ms加载，优先渲染主界面
    setTimeout(function() {
    ;(function() {
        // ---- 状态 ----
        var _aiRunning = false
        var _aiCheckTimer = null        // 设备巡检定时器
        var _netCheckTimer = null       // 网络监控定时器
        var _panelVisible = false
        var _pendingCommands = []       // {id, command, description, reason, category, status: 'pending'|'approved'|'rejected'|'done'|'failed', result}
        var _aiLogs = []               // {time, text, level}
        var _netHistory = []           // {time, ping, loss, dns, status}
        var _lastNetNotify = 0         // 上次网络通知时间
        var _netNotifyCooldown = 120000 // 2分钟冷却
        var _cmdIdCounter = 1
        var _scanCount = 0
        var _issuesFound = 0
        var _netStatus = { ping: -1, loss: -1, dns: -1, status: '未知', suggestion: '' }

        // 从 localStorage 恢复设置
        try { _aiRunning = localStorage.getItem('smart_ai_running') === '1' } catch(e) {}
        var _autoApproveSafe = false
        try { _autoApproveSafe = localStorage.getItem('smart_ai_auto_safe') === '1' } catch(e) {}

        var showToast = function(msg, color, dur) {
            try { if (typeof createToast === 'function') createToast(msg, color || 'pink', dur || 3000) } catch(e) {}
        }

        // getShell 兼容层（基于全局 runShellWithRoot）
        // 修复：getShell is not defined
        var getShell = function() {
            if (typeof runShellWithRoot !== 'function') return null
            // 返回一个兼容对象，调用方式: _rs(cmd, timeout)
            return function(cmd, timeoutMs) {
                return new Promise(function(resolve) {
                    try {
                        runShellWithRoot(cmd, timeoutMs || 5000).then(function(r) {
                            // 统一返回格式: {content, success}
                            if (typeof r === 'string') {
                                resolve({ content: r, success: true })
                            } else if (r && typeof r === 'object') {
                                resolve({ content: r.content || r.stdout || '', success: !!r.success })
                            } else {
                                resolve({ content: '', success: false })
                            }
                        }).catch(function() {
                            resolve({ content: '', success: false })
                        })
                    } catch(e) {
                        resolve({ content: '', success: false })
                    }
                })
            }
        }

        var aiLog = function(msg, level) {
            var now = new Date()
            var t = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0')
            var icon = level === 'warn' ? '⚠️' : level === 'error' ? '🔴' : level === 'success' ? '✅' : level === 'net' ? '📡' : 'ℹ️'
            _aiLogs.unshift({ time: t, text: msg, level: level || 'info', icon: icon })
            if (_aiLogs.length > 100) _aiLogs.length = 100
            renderAILogs()
        }

        var getShell = function() {
            return typeof runShellWithRoot !== 'undefined' ? runShellWithRoot : null
        }

        // ---- CSS ----
        var style = document.createElement('style')
        style.textContent = `
        #smart_ai_panel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 420px; max-width: 94vw; max-height: 88vh; overflow-y: auto;
            z-index: 100002; border-radius: 18px; padding: 0;
            background: linear-gradient(135deg, rgba(20,18,35,.97), rgba(35,28,55,.97), rgba(45,25,50,.97));
            border: 1px solid rgba(216,180,254,.45);
            box-shadow: 0 8px 50px rgba(0,0,0,.7), 0 0 0 1px rgba(216,180,254,.2), 0 0 40px rgba(167,139,250,.25), 0 0 66px rgba(255,158,205,.16);
            display: none; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #smart_ai_panel._show { display: block; animation: smart_ai_fadein .25s ease; }
        @keyframes smart_ai_fadein { from { opacity:0; transform:translate(-50%,-48%) } to { opacity:1; transform:translate(-50%,-50%) } }
        #smart_ai_overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,.45); z-index: 100001; display: none; }
        #smart_ai_overlay._show { display: block; }
        #smart_ai_fab {
            position: fixed; bottom: 70px; right: 16px; z-index: 100003;
            width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
            background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; font-size: 22px;
            box-shadow: 0 4px 20px rgba(99,102,241,.5), 0 0 0 2px rgba(167,139,250,.2);
            display: none; align-items: center; justify-content: center; transition: transform .2s;
        }
        #smart_ai_fab._show { display: flex; }
        #smart_ai_fab._running { background: linear-gradient(135deg, #22c55e, #16a34a); box-shadow: 0 4px 20px rgba(34,197,94,.5); }
        #smart_ai_fab._running::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid rgba(34,197,94,.4); animation: smart_ai_pulse 1.5s ease-in-out infinite; }
        #smart_ai_fab._haspending { background: linear-gradient(135deg, #f59e0b, #ef4444); box-shadow: 0 4px 20px rgba(245,158,11,.5); }
        @keyframes smart_ai_pulse { 0%,100% { transform: scale(1); opacity: .6 } 50% { transform: scale(1.3); opacity: 0 } }
        #smart_ai_fab .fab-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 9px; background: #ef4444; color: #fff; font-size: 10px; font-weight: bold; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
        .ai-section { padding: 12px 16px; }
        .ai-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid rgba(167,139,250,.15); background: linear-gradient(135deg, rgba(99,102,241,.1), rgba(139,92,246,.08)); border-radius: 18px 18px 0 0; }
        .ai-title { font-size: 15px; font-weight: bold; background: linear-gradient(90deg, #818cf8, #c4b5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .ai-close { background: rgba(255,255,255,.1); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .2s; }
        .ai-close:hover { background: rgba(255,100,100,.3); }
        .ai-btn { border: none; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: bold; color: #fff; cursor: pointer; transition: all .2s; }
        .ai-btn:active { transform: scale(.95); }
        .ai-btn-start { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .ai-btn-stop { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .ai-btn-scan { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .ai-btn-approve { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .ai-btn-reject { background: linear-gradient(135deg, #6b7280, #4b5563); }
        .ai-btn-execall { background: linear-gradient(135deg, #f59e0b, #d97706); }
        .ai-status-card { padding: 12px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(167,139,250,.1); margin-bottom: 8px; }
        .ai-status-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 4px; }
        .ai-status-row:last-child { margin-bottom: 0; }
        .ai-status-val { font-weight: bold; }
        .ai-status-val._good { color: #4ade80; }
        .ai-status-val._warn { color: #fbbf24; }
        .ai-status-val._bad { color: #f87171; }
        .ai-status-val._info { color: #60a5fa; }
        .ai-cmd-item { padding: 10px 12px; border-radius: 12px; margin-bottom: 8px; background: rgba(255,255,255,.04); border: 1px solid rgba(167,139,250,.15); transition: all .2s; }
        .ai-cmd-item._pending { border-color: rgba(245,158,11,.4); background: rgba(245,158,11,.06); }
        .ai-cmd-item._approved { border-color: rgba(34,197,94,.3); }
        .ai-cmd-item._rejected { opacity: .4; }
        .ai-cmd-item._done { border-color: rgba(34,197,94,.2); }
        .ai-cmd-item._failed { border-color: rgba(239,68,68,.3); background: rgba(239,68,68,.06); }
        .ai-cmd-reason { font-size: 11px; color: rgba(255,255,255,.6); margin-bottom: 4px; line-height: 1.4; }
        .ai-cmd-text { font-size: 11px; font-family: monospace; background: rgba(0,0,0,.3); padding: 6px 8px; border-radius: 6px; color: #c4b5fd; word-break: break-all; margin-bottom: 6px; max-height: 80px; overflow-y: auto; }
        .ai-cmd-actions { display: flex; gap: 6px; }
        .ai-cmd-actions .ai-btn { padding: 5px 12px; font-size: 11px; }
        .ai-cmd-cat { display: inline-block; font-size: 10px; padding: 1px 8px; border-radius: 8px; margin-right: 6px; }
        .ai-cmd-cat._storage { background: rgba(96,165,250,.2); color: #60a5fa; }
        .ai-cmd-cat._memory { background: rgba(167,139,250,.2); color: #a78bfa; }
        .ai-cmd-cat._network { background: rgba(52,211,153,.2); color: #34d399; }
        .ai-cmd-cat._system { background: rgba(251,191,36,.2); color: #fbbf24; }
        .ai-cmd-cat._battery { background: rgba(255,158,205,.2); color: #ff9ecd; }
        .ai-cmd-result { font-size: 10px; color: rgba(34,197,94,.7); margin-top: 4px; font-family: monospace; }
        .ai-cmd-result._err { color: rgba(239,68,68,.7); }
        .ai-log-area { width: 100%; box-sizing: border-box; height: 140px; overflow-y: auto; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.25); border: 1px solid rgba(167,139,250,.1); font-size: 11px; line-height: 1.6; }
        .ai-log-line { padding: 1px 0; }
        .ai-log-time { color: rgba(255,255,255,.3); margin-right: 4px; }
        .ai-empty { text-align: center; padding: 16px; color: rgba(255,255,255,.25); font-size: 12px; }
        .ai-net-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,.1); margin-top: 4px; overflow: hidden; }
        .ai-net-bar-fill { height: 100%; border-radius: 2px; transition: width .5s ease; }
        .ai-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .ai-switch { position: relative; width: 40px; height: 22px; border-radius: 11px; background: rgba(255,255,255,.15); cursor: pointer; transition: background .25s; flex-shrink: 0; }
        .ai-switch._on { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .ai-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .25s; }
        .ai-switch._on::after { transform: translateX(18px); }
        .ai-switch-label { font-size: 12px; color: rgba(255,255,255,.6); }
        .ai-hint { font-size: 10px; color: rgba(255,255,255,.25); margin-top: 6px; line-height: 1.5; }
        .ai-section-title { font-size: 12px; font-weight: bold; color: rgba(196,181,253,.8); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
        .ai-badge { font-size: 10px; padding: 1px 8px; border-radius: 8px; background: rgba(245,158,11,.2); color: #fbbf24; }
        .ai-badge._0 { display: none; }

        /* ===== PicoClaw 聊天窗口样式 ===== */
        .ai-tabs { display: flex; gap: 2px; padding: 0 16px; background: linear-gradient(135deg, rgba(99,102,241,.1), rgba(139,92,246,.08)); border-bottom: 1px solid rgba(167,139,250,.15); }
        .ai-tab {
            padding: 10px 16px; font-size: 13px; color: rgba(255,255,255,.5);
            cursor: pointer; border-bottom: 2px solid transparent; transition: all .2s;
            font-weight: 500;
        }
        .ai-tab._active { color: #c4b5fd; border-bottom-color: #8b5cf6; }
        .ai-tab:hover { color: rgba(255,255,255,.8); }
        .ai-tab-content { display: none; }
        .ai-tab-content._active { display: block; }

        /* 聊天区域 */
        .chat-container { display: flex; flex-direction: column; height: 420px; }
        .chat-messages {
            flex: 1; overflow-y: auto; padding: 12px 16px;
            display: flex; flex-direction: column; gap: 10px;
        }
        .chat-msg { max-width: 85%; display: flex; gap: 8px; align-items: flex-start; }
        .chat-msg._user { align-self: flex-end; flex-direction: row-reverse; }
        .chat-avatar {
            width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center; font-size: 14px;
        }
        .chat-msg._user .chat-avatar { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .chat-msg._ai .chat-avatar { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .chat-bubble {
            padding: 8px 12px; border-radius: 12px; font-size: 12px;
            line-height: 1.5; word-break: break-word; white-space: pre-wrap;
        }
        .chat-msg._user .chat-bubble {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; border-bottom-right-radius: 4px;
        }
        .chat-msg._ai .chat-bubble {
            background: rgba(255,255,255,.08); color: #e2e8f0;
            border-bottom-left-radius: 4px; border: 1px solid rgba(255,255,255,.06);
        }
        .chat-bubble code { background: rgba(0,0,0,.3); padding: 1px 5px; border-radius: 4px; font-size: 11px; font-family: monospace; }
        .chat-bubble pre { background: rgba(0,0,0,.3); padding: 8px; border-radius: 6px; overflow-x: auto; margin: 6px 0; }
        .chat-bubble pre code { background: transparent; padding: 0; }

        .chat-input-area {
            display: flex; gap: 8px; padding: 10px 16px;
            border-top: 1px solid rgba(167,139,250,.1);
            background: rgba(0,0,0,.15);
        }
        .chat-input {
            flex: 1; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
            border-radius: 10px; padding: 8px 12px; color: #fff; font-size: 12px;
            outline: none; resize: none; font-family: inherit;
        }
        .chat-input:focus { border-color: rgba(139,92,246,.5); background: rgba(255,255,255,.08); }
        .chat-send-btn {
            background: linear-gradient(135deg, #22c55e, #16a34a); border: none;
            color: #fff; padding: 0 16px; border-radius: 10px; font-size: 12px;
            font-weight: bold; cursor: pointer; transition: all .2s;
        }
        .chat-send-btn:active { transform: scale(.95); }
        .chat-send-btn:disabled { opacity: .5; cursor: not-allowed; }

        .chat-status-bar {
            padding: 6px 16px; font-size: 10px; color: rgba(255,255,255,.4);
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(167,139,250,.08);
        }
        .chat-status-dot {
            display: inline-block; width: 6px; height: 6px; border-radius: 50%;
            margin-right: 4px;
        }
        .chat-status-dot._ok { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
        .chat-status-dot._bad { background: #ef4444; }
        .chat-status-dot._warn { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
        .chat-typing { font-size: 11px; color: rgba(255,255,255,.4); font-style: italic; }

        .chat-empty { text-align: center; padding: 40px 20px; color: rgba(255,255,255,.3); }
        .chat-empty-icon { font-size: 36px; margin-bottom: 10px; }
        .chat-empty-title { font-size: 14px; font-weight: bold; margin-bottom: 6px; color: rgba(255,255,255,.5); }
        .chat-empty-desc { font-size: 11px; line-height: 1.6; }

        .chat-quick-actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 16px 0; }
        .chat-quick-btn {
            font-size: 10px; padding: 4px 10px; border-radius: 12px;
            background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.3);
            color: #a5b4fc; cursor: pointer; transition: all .2s;
        }
        .chat-quick-btn:hover { background: rgba(99,102,241,.3); }

        /* 本地工具箱按钮 */
        .chat-local-btn {
            font-size: 11px; padding: 8px 6px; border-radius: 8px;
            background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
            color: rgba(255,255,255,.8); cursor: pointer; transition: all .2s;
            text-align: center;
        }
        .chat-local-btn:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.2); }
        .chat-local-btn:active { transform: scale(0.96); }
        .chat-local-btn._primary {
            background: linear-gradient(135deg,#8b5cf6,#6366f1); border: none;
            color: #fff; font-weight: bold;
        }
        .chat-local-btn._warn {
            background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.3);
            color: #fca5a5;
        }
        .chat-cmd-output {
            margin: 10px; padding: 10px;
            background: rgba(0,0,0,.3); border-radius: 8px;
            font-family: monospace; font-size: 11px;
            color: #94a3b8; max-height: 200px;
            overflow-y: auto; white-space: pre-wrap; word-break: break-all;
        }

        /* 安装/配置向导视图 */
        .chat-setup-view {
            flex: 1; display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 24px 20px; text-align: center;
        }
        .chat-setup-icon { font-size: 48px; margin-bottom: 16px; }
        .chat-setup-title { font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 8px; }
        .chat-setup-desc { font-size: 12px; color: rgba(255,255,255,.45); line-height: 1.6; margin-bottom: 20px; }
        .chat-setup-steps { width: 100%; max-width: 280px; margin-bottom: 20px; text-align: left; }
        .chat-step { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
        .chat-step:last-child { border-bottom: none; }
        .chat-step-num {
            width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
            background: linear-gradient(135deg, #8b5cf6, #6366f1);
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: bold; color: #fff;
        }
        .chat-step-text { flex: 1; }
        .chat-step-title { font-size: 12px; font-weight: bold; color: rgba(255,255,255,.8); margin-bottom: 2px; }
        .chat-step-desc { font-size: 11px; color: rgba(255,255,255,.35); line-height: 1.4; }
        .chat-setup-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 240px; }
        .chat-setup-btn {
            padding: 10px 16px; border-radius: 10px; font-size: 13px;
            font-weight: bold; cursor: pointer; border: none; transition: all .2s;
        }
        .chat-setup-btn:active { transform: scale(.97); }
        .chat-setup-btn._primary {
            background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff;
        }
        .chat-setup-btn._secondary {
            background: rgba(99,102,241,.15); color: #a5b4fc;
            border: 1px solid rgba(99,102,241,.3);
        }
        .chat-setup-btn._secondary:hover { background: rgba(99,102,241,.25); }

        /* API Key 输入框 */
        .chat-api-input {
            width: 100%; box-sizing: border-box;
            background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px; padding: 8px 10px; color: #fff; font-size: 12px;
            outline: none; font-family: inherit;
        }
        .chat-api-input:focus { border-color: rgba(139,92,246,.5); background: rgba(255,255,255,.08); }
        .chat-api-select {
            width: 100%; box-sizing: border-box;
            background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px; padding: 8px 10px; color: #fff; font-size: 12px;
            outline: none;
        }
        .chat-api-select:focus { border-color: rgba(139,92,246,.5); }
        .chat-api-select option { background: #1e1e2e; color: #fff; }

        /* 进度条 */
        .chat-progress-bar {
            width: 100%; height: 6px; background: rgba(255,255,255,.08);
            border-radius: 3px; overflow: hidden;
        }
        .chat-progress-fill {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #22c55e, #16a34a);
            border-radius: 3px; transition: width .3s ease;
        }
        `
        document.head.appendChild(style)

        // ---- 创建面板 ----
        var overlay = document.createElement('div')
        overlay.id = 'smart_ai_overlay'
        document.body.appendChild(overlay)

        var panel = document.createElement('div')
        panel.id = 'smart_ai_panel'
        panel.innerHTML = `
            <div class="ai-header">
                <span class="ai-title">🤖 AI 智能助手</span>
                <button class="ai-close" id="ai_close_btn">×</button>
            </div>

            <!-- Tab 切换 -->
            <div class="ai-tabs">
                <div class="ai-tab _active" data-tab="assistant">🛠️ 智能助手</div>
                <div class="ai-tab" data-tab="chat">💬 PicoClaw 聊天</div>
            </div>

            <!-- Tab 1：智能助手（原有功能） -->
            <div class="ai-tab-content _active" id="ai_tab_assistant">

            <div class="ai-section">
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button class="ai-btn ai-btn-start" id="ai_start_btn" style="flex:1">▶ 启动巡检</button>
                    <button class="ai-btn ai-btn-scan" id="ai_scan_now_btn" style="flex:1">🔍 立即检查</button>
                </div>
                <button class="ai-btn ai-btn-deep" id="ai_deep_diag_btn" style="width:100%;margin-bottom:10px;background:linear-gradient(135deg,#8b5cf6,#6366f1);">
                    🦞 AI 深度诊断（PicoClaw）
                </button>
                <div class="ai-switch-row" style="margin-bottom:8px">
                    <span class="ai-switch-label">显示AI悬浮按钮</span>
                    <div class="ai-switch _on" id="ai_fab_switch"></div>
                </div>
                <div class="ai-switch-row" style="margin-bottom:8px">
                    <span class="ai-switch-label">自动批准低风险安全命令（清缓存等）</span>
                    <div class="ai-switch" id="ai_auto_approve_switch"></div>
                </div>
                <div class="ai-hint">AI 发现问题后会将要执行的命令放入下方待审批队列，你同意后才会执行。网络方面只通知建议，不做任何限速操作。</div>
            </div>

            <div class="ai-section" style="border-top:1px solid rgba(167,139,250,.1)">
                <div class="ai-section-title">📡 网络状态监控 <span class="ai-badge _0" id="ai_net_badge"></span></div>
                <div class="ai-status-card">
                    <div class="ai-status-row">
                        <span>延迟</span>
                        <span class="ai-status-val _info" id="ai_net_ping">-</span>
                    </div>
                    <div class="ai-status-row">
                        <span>丢包率</span>
                        <span class="ai-status-val _info" id="ai_net_loss">-</span>
                    </div>
                    <div class="ai-status-row">
                        <span>DNS解析</span>
                        <span class="ai-status-val _info" id="ai_net_dns">-</span>
                    </div>
                    <div class="ai-status-row">
                        <span>状态评估</span>
                        <span class="ai-status-val _info" id="ai_net_status">未检测</span>
                    </div>
                    <div class="ai-status-row">
                        <span>AI建议</span>
                        <span style="font-size:11px;color:rgba(255,255,255,.5);text-align:right;max-width:200px" id="ai_net_suggestion">-</span>
                    </div>
                </div>
            </div>

            <div class="ai-section" style="border-top:1px solid rgba(167,139,250,.1)">
                <div class="ai-section-title">
                    💻 AI 代码任务
                    <span style="font-size:10px;color:rgba(255,255,255,.3);font-weight:normal">描述任务，AI生成命令，批准后执行</span>
                </div>
                <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <input type="text" class="ai-input" id="ai_task_input" placeholder="例：清理日志文件 / 查看CPU占用 / 重启网络..." style="flex:1" />
                    <button class="ai-btn ai-btn-execall" id="ai_gen_btn" style="background:linear-gradient(135deg,#10b981,#059669);flex-shrink:0">生成命令</button>
                </div>
                <div id="ai_task_result" style="display:none;margin-bottom:8px">
                    <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:4px">AI生成的命令（请仔细审查）：</div>
                    <div class="ai-cmd-box" id="ai_task_cmd_display" style="font-family:monospace;font-size:12px;background:rgba(0,0,0,.3);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.08);word-break:break-all;white-space:pre-wrap;margin-bottom:6px"></div>
                    <div style="display:flex;gap:6px;">
                        <button class="ai-btn ai-btn-approve" id="ai_task_exec_btn" style="flex:1">✅ 批准执行</button>
                        <button class="ai-btn ai-btn-reject" id="ai_task_cancel_btn">取消</button>
                    </div>
                </div>
                <div id="ai_task_loading" style="display:none;text-align:center;padding:12px;color:rgba(255,255,255,.4);font-size:12px">🤖 AI正在生成命令...</div>
            </div>

            <div class="ai-section" style="border-top:1px solid rgba(167,139,250,.1)">
                <div class="ai-section-title">
                    🔧 待审批命令
                    <span class="ai-badge _0" id="ai_pending_badge">0</span>
                </div>
                <div id="ai_pending_container" style="max-height:300px;overflow-y:auto;margin-bottom:8px">
                    <div class="ai-empty">暂无待执行命令，AI巡检发现问题后会在此建议</div>
                </div>
                <button class="ai-btn ai-btn-execall" id="ai_approve_all_btn" style="width:100%;display:none">✅ 全部批准执行</button>
            </div>

            <div class="ai-section" style="border-top:1px solid rgba(167,139,250,.1)">
                <div class="ai-section-title">📋 AI 日志</div>
                <div class="ai-log-area" id="ai_log_area">
                    <div class="ai-empty">AI未启动</div>
                </div>
            </div>

            <div class="ai-section" style="border-top:1px solid rgba(167,139,250,.1)">
                <div class="ai-section-title">📊 巡检统计</div>
                <div class="ai-status-card">
                    <div class="ai-status-row"><span>巡检次数</span><span class="ai-status-val _info" id="ai_scan_count">0</span></div>
                    <div class="ai-status-row"><span>发现问题</span><span class="ai-status-val _warn" id="ai_issues_count">0</span></div>
                    <div class="ai-status-row"><span>已执行命令</span><span class="ai-status-val _good" id="ai_exec_count">0</span></div>
                    <div class="ai-status-row"><span>运行状态</span><span class="ai-status-val _bad" id="ai_run_status">未启动</span></div>
                </div>
            </div>

            </div><!-- /ai_tab_assistant -->

            <!-- Tab 2：PicoClaw 聊天 -->
            <div class="ai-tab-content" id="ai_tab_chat">
                <div class="chat-status-bar">
                    <div>
                        <span class="chat-status-dot" id="picoclaw_status_dot"></span>
                        <span id="picoclaw_status_text">检测中...</span>
                    </div>
                    <div id="picoclaw_status_actions" style="display:flex;gap:6px;">
                        <button id="picoclaw_open_panel" style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;cursor:pointer">打开面板</button>
                    </div>
                </div>
                <div class="chat-container">
                    <!-- 安装向导（未安装时显示） -->
                    <div class="chat-setup-view" id="chat_setup_install">
                        <div class="chat-setup-icon">📦</div>
                        <div class="chat-setup-title">一键安装 PicoClaw</div>
                        <div class="chat-setup-desc">
                            AI 助手功能需要 PicoClaw 驱动<br/>
                            点击下方按钮自动完成安装
                        </div>

                        <!-- API Key 输入 -->
                        <div style="width:100%;max-width:280px;margin-bottom:16px;text-align:left">
                            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px">API Key（可选，安装后配置）</div>
                            <input type="text" class="chat-api-input" id="pc_api_key_input" placeholder="输入你的 LLM API Key（如 DeepSeek）" />
                            <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:4px">
                                支持 DeepSeek、OpenAI、硅基流动等 30+ 服务商
                            </div>
                        </div>

                        <!-- API 服务商选择 -->
                        <div style="width:100%;max-width:280px;margin-bottom:12px;text-align:left">
                            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px">AI 服务商</div>
                            <select class="chat-api-select" id="pc_provider_select">
                                <option value="deepseek">DeepSeek（推荐）</option>
                                <option value="siliconflow">硅基流动（有免费额度）</option>
                                <option value="openai">OpenAI</option>
                                <option value="dashscope">阿里云百炼</option>
                                <option value="custom">自定义（其他）</option>
                            </select>
                        </div>

                        <!-- 免费方案提示 -->
                        <div style="width:100%;max-width:280px;margin-bottom:16px;padding:10px 12px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;text-align:left">
                            <div style="font-size:11px;color:#60a5fa;font-weight:bold;margin-bottom:4px">💡 免费方案推荐</div>
                            <div style="font-size:10px;color:rgba(255,255,255,.6);line-height:1.5">
                                硅基流动(SiliconFlow)每日提供免费额度，注册即可使用：<br/>
                                <span style="color:#93c5fd">https://cloud.siliconflow.cn</span>
                            </div>
                        </div>

                        <div class="chat-setup-actions" style="width:100%;max-width:280px">
                            <button class="chat-setup-btn _primary" id="pc_oneclick_install_btn">🚀 一键安装 PicoClaw</button>
                            <button class="chat-setup-btn _secondary" id="pc_open_plugin_btn">🦞 从小龙虾APP提取</button>
                        </div>

                        <!-- 安装进度 -->
                        <div class="chat-install-progress" id="chat_install_progress" style="display:none;width:100%;max-width:280px;margin-top:16px;text-align:left">
                            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:6px" id="pc_install_status">准备中...</div>
                            <div class="chat-progress-bar">
                                <div class="chat-progress-fill" id="pc_progress_fill"></div>
                            </div>
                            <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:6px" id="pc_install_log">点击开始安装</div>
                        </div>
                    </div>

                    <!-- 配置向导（已安装但未配置/未运行时显示） -->
                    <div class="chat-setup-view" id="chat_setup_config" style="display:none">
                        <div class="chat-setup-icon">⚙️</div>
                        <div class="chat-setup-title">配置 AI 服务商</div>
                        <div class="chat-setup-desc">
                            PicoClaw 已安装，输入 API Key<br/>
                            一键配置，立即使用
                        </div>

                        <!-- API Key 输入 -->
                        <div style="width:100%;max-width:280px;margin-bottom:12px;text-align:left">
                            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px">API Key</div>
                            <input type="text" class="chat-api-input" id="pc_config_api_input" placeholder="输入你的 API Key" />
                        </div>

                        <!-- API 服务商选择 -->
                        <div style="width:100%;max-width:280px;margin-bottom:12px;text-align:left">
                            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px">AI 服务商</div>
                            <select class="chat-api-select" id="pc_config_provider_select">
                                <option value="deepseek">DeepSeek（推荐）</option>
                                <option value="siliconflow">硅基流动（有免费额度）</option>
                                <option value="openai">OpenAI</option>
                                <option value="dashscope">阿里云百炼</option>
                                <option value="custom">自定义（其他）</option>
                            </select>
                        </div>

                        <!-- 免费方案提示 -->
                        <div style="width:100%;max-width:280px;margin-bottom:16px;padding:10px 12px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;text-align:left">
                            <div style="font-size:11px;color:#60a5fa;font-weight:bold;margin-bottom:4px">💡 免费方案推荐</div>
                            <div style="font-size:10px;color:rgba(255,255,255,.6);line-height:1.5">
                                硅基流动(SiliconFlow)每日提供免费额度，注册即可使用：<br/>
                                <span style="color:#93c5fd">https://cloud.siliconflow.cn</span>
                            </div>
                        </div>

                        <div class="chat-setup-actions" style="width:100%;max-width:280px">
                            <button class="chat-setup-btn _primary" id="pc_quick_config_btn">🔑 一键配置 API</button>
                            <button class="chat-setup-btn _secondary" id="pc_open_config_btn">📋 打开配置面板</button>
                            <div style="display:flex;gap:8px">
                                <button class="chat-setup-btn _secondary" id="pc_retry_check_btn" style="flex:1">🔄 重新检测</button>
                                <button class="chat-setup-btn _secondary" id="pc_diagnose_btn" style="flex:1;background:linear-gradient(135deg,#f59e0b,#d97706);">🔍 诊断</button>
                            </div>
                        </div>
                    </div>

                    <!-- 聊天消息区域（正常使用时显示） -->
                    <div class="chat-messages" id="chat_messages" style="display:none">
                        <div class="chat-empty" id="chat_empty">
                            <div class="chat-empty-icon">🦞</div>
                            <div class="chat-empty-title">PicoClaw AI 助手</div>
                            <div class="chat-empty-desc">
                                可以执行命令、查询信息、调试问题<br/>
                                试试下面的快捷操作吧 👇
                            </div>
                        </div>
                    </div>
                    
                    <!-- 本地工具箱模式（无API时显示） -->
                    <div class="chat-local-tools" id="chat_local_tools" style="display:none;padding:12px;overflow-y:auto;max-height:60vh">
                        <div style="text-align:center;margin-bottom:16px">
                            <div style="font-size:36px;margin-bottom:8px">🔧</div>
                            <div style="font-size:16px;font-weight:bold;color:#fff">本地工具箱</div>
                            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px">无需 AI · 点击直接执行</div>
                        </div>
                        
                        <!-- 系统信息 -->
                        <div style="margin-bottom:14px">
                            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px;padding-left:4px">📊 系统信息</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                                <button class="chat-local-btn" data-cmd="uname -a && echo '---' && cat /proc/version 2>/dev/null | cut -c1-80">系统版本</button>
                                <button class="chat-local-btn" data-cmd="cat /proc/cpuinfo 2>/dev/null | grep 'model name' | head -1 && echo '---' && cat /proc/cpuinfo 2>/dev/null | grep 'BogoMIPS' | head -1">CPU 信息</button>
                                <button class="chat-local-btn" data-cmd="cat /proc/meminfo 2>/dev/null | head -6">内存信息</button>
                                <button class="chat-local-btn" data-cmd="df -h / /data 2>/dev/null">存储空间</button>
                                <button class="chat-local-btn" data-cmd="cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null && echo '°C (原始值)' && cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null && echo '°C (zone1)'">温度信息</button>
                                <button class="chat-local-btn" data-cmd="uptime && echo '---' && cat /proc/uptime 2>/dev/null">运行时长</button>
                            </div>
                        </div>
                        
                        <!-- 网络工具 -->
                        <div style="margin-bottom:14px">
                            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px;padding-left:4px">📡 网络工具</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                                <button class="chat-local-btn" data-cmd="ip addr show 2>/dev/null | grep 'inet ' | head -10">IP 地址</button>
                                <button class="chat-local-btn" data-cmd="ip route show 2>/dev/null && echo '---DNS---' && getprop net.dns1 2>/dev/null && getprop net.dns2 2>/dev/null">路由/DNS</button>
                                <button class="chat-local-btn" data-cmd="ping -c 3 -W 2 223.5.5.5 2>&1">网络连通性</button>
                                <button class="chat-local-btn" data-cmd="ping -c 2 -W 3 baidu.com 2>&1">DNS 解析</button>
                                <button class="chat-local-btn" data-cmd="netstat -tlnp 2>/dev/null | head -15 || ss -tlnp 2>/dev/null | head -15">端口监听</button>
                                <button class="chat-local-btn" data-cmd="cat /proc/net/dev 2>/dev/null | head -10">网卡流量</button>
                            </div>
                        </div>
                        
                        <!-- 清理优化 -->
                        <div style="margin-bottom:14px">
                            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px;padding-left:4px">🧹 清理优化</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                                <button class="chat-local-btn" data-cmd="sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null && echo '缓存已清理'">清理缓存</button>
                                <button class="chat-local-btn" data-cmd="du -sh /data/local/tmp/* 2>/dev/null | sort -rh | head -10">大文件排查</button>
                                <button class="chat-local-btn" data-cmd="ps -ef 2>/dev/null | head -15 || ps 2>/dev/null | head -15">进程列表</button>
                                <button class="chat-local-btn" data-cmd="top -bn1 2>/dev/null | head -15">资源占用 TOP</button>
                            </div>
                        </div>
                        
                        <!-- 设备控制 -->
                        <div style="margin-bottom:14px">
                            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px;padding-left:4px">⚙️ 设备控制</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                                <button class="chat-local-btn _warn" data-cmd="reboot">重启设备</button>
                                <button class="chat-local-btn _warn" data-cmd="svc wifi disable && svc wifi enable 2>/dev/null || echo '需要系统权限'">重启网络</button>
                            </div>
                        </div>
                        
                        <!-- 配置 AI 入口 -->
                        <div style="text-align:center;padding-top:8px;border-top:1px solid rgba(255,255,255,.1)">
                            <div style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:8px">想要 AI 智能分析？</div>
                            <button class="chat-local-btn _primary" id="local_goto_config_btn" style="width:100%;max-width:200px">🔑 配置 API Key 启用 AI</button>
                        </div>
                    </div>
                    
                    <!-- 命令输出显示区域 -->
                    <div class="chat-cmd-output" id="chat_cmd_output" style="display:none;margin:10px;padding:10px;background:rgba(0,0,0,.3);border-radius:8px;font-family:monospace;font-size:11px;color:#94a3b8;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all"></div>
                    
                    <div class="chat-quick-actions" id="chat_quick_actions" style="display:none">
                        <button class="chat-quick-btn" data-q="查看系统信息">📊 系统信息</button>
                        <button class="chat-quick-btn" data-q="清理缓存">🧹 清理缓存</button>
                        <button class="chat-quick-btn" data-q="查看网络状态">📡 网络状态</button>
                        <button class="chat-quick-btn" data-q="查看温度">🌡️ 温度信息</button>
                        <button class="chat-quick-btn" data-q="深度诊断设备问题">🔧 深度诊断</button>
                        <button class="chat-quick-btn" data-q="生成流量查询命令">📶 查流量</button>
                        <button class="chat-quick-btn" data-q="检查电池健康状态：读电池电量、电压、温度、循环状态并给出评估">🔋 电池体检</button>
                        <button class="chat-quick-btn" data-q="分析存储空间：各分区占用、大文件在哪、哪些可以安全清理，直接给出结论">💾 存储分析</button>
                        <button class="chat-quick-btn" data-q="网络没网了？帮我修复：自己诊断网络状态、找到问题、尝试修复并验证，修好为止">🛠️ 修复网络</button>
                        <button class="chat-quick-btn" data-q="帮我做一次全面体检并顺手优化：CPU、内存、存储、网络都检查一遍，发现能安全优化的问题就直接处理掉，最后汇报">🩺 全面体检+优化</button>
                    </div>
                    <div class="chat-input-area" id="chat_input_area" style="display:none">
                        <textarea class="chat-input" id="chat_input" placeholder="输入消息，回车发送，Shift+回车换行..." rows="1"></textarea>
                        <button class="chat-send-btn" id="chat_send_btn">发送</button>
                    </div>
                </div>
            </div><!-- /ai_tab_chat -->
        `
        document.body.appendChild(panel)

        // ---- 悬浮按钮 ----
        var fab = document.createElement('button')
        fab.id = 'smart_ai_fab'
        fab.innerHTML = '🤖<span class="fab-badge _0" id="ai_fab_badge"></span>'
        fab.onclick = function() { toggleAIPanel() }
        document.body.appendChild(fab)

        // ---- 待执行命令管理 ----
        var addPendingCommand = function(command, description, reason, category, isSafe) {
            // 检查是否已存在相同命令（避免重复）
            for (var i = 0; i < _pendingCommands.length; i++) {
                if (_pendingCommands[i].command === command && _pendingCommands[i].status === 'pending') {
                    return // 已存在待执行的相同命令
                }
            }
            var cmd = {
                id: _cmdIdCounter++,
                command: command,
                description: description,
                reason: reason,
                category: category || 'system',
                status: 'pending',
                isSafe: !!isSafe,
                result: '',
                timestamp: Date.now()
            }
            _pendingCommands.push(cmd)
            if (_pendingCommands.length > 50) _pendingCommands.shift()
            _issuesFound++
            renderPendingCommands()
            updateStats()

            // 自动批准安全命令
            if (_autoApproveSafe && isSafe) {
                aiLog('安全命令自动批准: ' + description, 'success')
                setTimeout(function() { executeCommand(cmd.id) }, 500)
            } else {
                aiLog('发现待处理问题: ' + reason, 'warn')
                showToast('AI发现问题: ' + description, 'red', 4000)
                updateFAB()
            }
        }

        var executeCommand = async function(id) {
            var cmd = null
            for (var i = 0; i < _pendingCommands.length; i++) {
                if (_pendingCommands[i].id === id) { cmd = _pendingCommands[i]; break }
            }
            if (!cmd || cmd.status !== 'pending') return
            var _rs = getShell()
            if (!_rs) { aiLog('Shell不可用，无法执行', 'error'); return }

            aiLog('正在执行: ' + cmd.description, 'info')
            try {
                var res = await _rs(cmd.command + ' 2>&1; echo __EXIT__$?')
                var output = (res && res.content) || ''
                var exitMatch = output.match(/__EXIT__(-?\d+)/)
                var exitCode = exitMatch ? parseInt(exitMatch[1]) : -1
                var realOutput = output.replace(/__EXIT__-?\d+/, '').trim()

                if (exitCode === 0) {
                    cmd.status = 'done'
                    cmd.result = realOutput.substring(0, 200) || '执行成功'
                    aiLog('执行成功: ' + cmd.description, 'success')
                } else {
                    cmd.status = 'failed'
                    cmd.result = (realOutput || '退出码 ' + exitCode).substring(0, 200)
                    aiLog('执行失败: ' + cmd.description + ' (' + cmd.result + ')', 'error')
                }
            } catch(e) {
                cmd.status = 'failed'
                cmd.result = String(e).substring(0, 200)
                aiLog('执行异常: ' + cmd.description, 'error')
            }
            renderPendingCommands()
            updateStats()
            updateFAB()
        }

        var rejectCommand = function(id) {
            for (var i = 0; i < _pendingCommands.length; i++) {
                if (_pendingCommands[i].id === id) {
                    _pendingCommands[i].status = 'rejected'
                    aiLog('已拒绝: ' + _pendingCommands[i].description, 'info')
                    break
                }
            }
            renderPendingCommands()
            updateFAB()
        }

        var approveAllPending = function() {
            var count = 0
            for (var i = 0; i < _pendingCommands.length; i++) {
                if (_pendingCommands[i].status === 'pending') {
                    (function(id) { setTimeout(function() { executeCommand(id) }, count * 1500) })(_pendingCommands[i].id)
                    count++
                }
            }
            if (count > 0) {
                showToast('正在执行 ' + count + ' 条已批准命令...', 'pink', 3000)
            }
        }

        // ---- AI 代码任务生成 ----
        var _currentTaskCmd = null
        var _aiGenCount = 0

        // 智能命令模板（基于关键词匹配生成）
        var commandTemplates = [
            { pattern: /清理.*日志|日志.*清理|清除.*日志|清日志/, cmd: 'find / -name "*.log" -size +50M 2>/dev/null -exec truncate -s 0 {} \\;', desc: '清理大于50M的日志文件', category: 'system', isSafe: true },
            { pattern: /清.*缓存|缓存.*清理|释放缓存|清缓存/, cmd: 'sync && echo 3 > /proc/sys/vm/drop_caches', desc: '释放系统缓存', category: 'memory', isSafe: true },
            { pattern: /重启.*网络|网络.*重启|重启wifi|重启WiFi|重启WIFI/, cmd: 'svc wifi disable && sleep 2 && svc wifi enable', desc: '重启WiFi网络', category: 'network', isSafe: false },
            { pattern: /查看.*CPU|CPU.*占用|cpu使用率|进程.*占用/, cmd: 'top -bn1 | head -20', desc: '查看CPU占用前20进程', category: 'system', isSafe: true },
            { pattern: /查看.*内存|内存.*使用|内存情况|free -m/, cmd: 'cat /proc/meminfo | head -10 && echo "---" && free -m 2>/dev/null', desc: '查看内存使用情况', category: 'memory', isSafe: true },
            { pattern: /查看.*存储|存储.*情况|磁盘.*空间|df -h/, cmd: 'df -h 2>/dev/null', desc: '查看存储使用情况', category: 'storage', isSafe: true },
            { pattern: /查看.*温度|温度.*情况|CPU温度|电池温度/, cmd: 'cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null; echo "---电池---"; dumpsys battery 2>/dev/null | head -10', desc: '查看CPU和电池温度', category: 'system', isSafe: true },
            { pattern: /重启.*设备|重启手机|重启系统|reboot/, cmd: 'reboot', desc: '重启设备', category: 'system', isSafe: false },
            { pattern: /关机|poweroff|shutdown/, cmd: 'reboot -p', desc: '关机', category: 'system', isSafe: false },
            { pattern: /网络.*测试|测网速|网速测试|ping测试|网络延迟/, cmd: 'ping -c 5 -W 2 223.5.5.5 2>&1', desc: '测试网络延迟（ping阿里DNS）', category: 'network', isSafe: true },
            { pattern: /DNS.*设置|修改DNS|更换DNS|改DNS/, cmd: 'setprop net.dns1 223.5.5.5 && setprop net.dns2 8.8.8.8', desc: '设置DNS为阿里+Google', category: 'network', isSafe: true },
            { pattern: /查看.*应用|应用.*列表|已安装.*应用|包名列表/, cmd: 'pm list packages 2>/dev/null | head -50', desc: '列出已安装应用前50个', category: 'system', isSafe: true },
            { pattern: /卸载.*应用|删除.*应用|卸载app/, cmd: '', desc: '请提供具体包名', category: 'system', isSafe: false, needsParam: true, paramHint: '包名' },
            { pattern: /停止.*服务|杀掉.*进程|kill.*进程|结束.*进程/, cmd: '', desc: '请提供进程名或PID', category: 'system', isSafe: false, needsParam: true, paramHint: '进程名/PID' },
            { pattern: /查看.*电量|电池.*信息|电量.*情况/, cmd: 'dumpsys battery 2>/dev/null', desc: '查看电池详细信息', category: 'battery', isSafe: true },
            { pattern: /截图|截屏|screen.*shot/, cmd: 'screencap -p /sdcard/screenshot_$(date +%Y%m%d_%H%M%S).png && echo "已保存到/sdcard/"', desc: '截图并保存到sdcard', category: 'system', isSafe: true },
            { pattern: /查看.*文件|文件.*列表|ls.*目录/, cmd: 'ls -la /sdcard/ 2>/dev/null | head -30', desc: '列出sdcard根目录文件', category: 'storage', isSafe: true },
            { pattern: /备份.*配置|配置.*备份|导出.*设置/, cmd: 'echo "---系统属性---" && getprop | grep -E "ro.build|ro.product" | head -20', desc: '导出系统配置信息', category: 'system', isSafe: true },
            { pattern: /修复.*网络|网络.*修复|重置.*网络/, cmd: 'svc wifi disable && svc data disable && sleep 3 && svc wifi enable && svc data enable', desc: '重置网络连接（WiFi+数据）', category: 'network', isSafe: false },
            { pattern: /查看.*日志|系统日志|logcat|抓取日志/, cmd: 'logcat -d -t 100 2>/dev/null', desc: '抓取最近100行系统日志', category: 'system', isSafe: true }
        ]

        var generateCommand = async function(taskDesc) {
            _aiGenCount++
            var desc = taskDesc.trim()
            if (!desc) return null

            aiLog('🤖 AI分析任务: ' + desc, 'info')

            // 1. 先匹配内置模板
            for (var i = 0; i < commandTemplates.length; i++) {
                if (commandTemplates[i].pattern.test(desc)) {
                    var tpl = commandTemplates[i]
                    if (tpl.needsParam) {
                        return {
                            command: '',
                            description: tpl.desc + '（需要' + tpl.paramHint + '）',
                            reason: '检测到关键词匹配，需要补充参数',
                            category: tpl.category,
                            isSafe: tpl.isSafe,
                            needsParam: true,
                            paramHint: tpl.paramHint
                        }
                    }
                    return {
                        command: tpl.cmd,
                        description: tpl.desc,
                        reason: '根据任务描述智能匹配：' + desc,
                        category: tpl.category,
                        isSafe: tpl.isSafe
                    }
                }
            }

            // 2. 优先尝试 PicoClaw（小龙虾）生成命令（如果已安装）
            var _rs = getShell()
            if (_rs && typeof _picoclawInstalled !== 'undefined' && _picoclawInstalled) {
                try {
                    var pcPrompt = '你是一个Linux/Android Shell命令生成专家。用户需求：' + desc + '\n请只输出一条Shell命令，不要解释，不要markdown代码块，直接输出命令本身。命令必须在Android shell环境下可用。'
                    var escapedPrompt = pcPrompt.replace(/'/g, "'\\''").replace(/"/g, '\\"')
                    var pcCmd = 'cd ' + _picoclawPath + ' && env ' + _picoclawHomeEnv + ' ' + _picoclawSslEnv + ' ./picoclaw agent -m "' + escapedPrompt + '" 2>&1'
                    var pcRes = await _rs(pcCmd, 30000)
                    var pcOutput = (pcRes && pcRes.content || '').trim()
                    if (pcOutput && pcOutput.length > 0 && pcOutput.length < 2000) {
                        // 清理可能的 markdown 代码块和多余文本
                        var cleanCmd = pcOutput.replace(/```[a-z]*\n?/gi, '').trim()
                        // 只取第一行（如果是多行）
                        var firstLine = cleanCmd.split('\n')[0].trim()
                        if (firstLine && firstLine.length > 0 && firstLine.length < 500) {
                            aiLog('🤖 PicoClaw生成命令成功', 'success')
                            return {
                                command: firstLine,
                                description: desc,
                                reason: 'PicoClaw AI 根据任务描述生成的命令',
                                category: 'ai_task',
                                isSafe: false  // AI生成的命令默认需要确认
                            }
                        }
                    }
                } catch(e) {
                    // PicoClaw 调用失败，继续尝试其他方式
                }
            }

            // 3. 尝试通过shell调用免费AI API（如果curl可用）
            if (_rs) {
                try {
                    var apiPrompt = '你是一个Linux/Android Shell命令生成专家。用户需求：' + desc + '\n请只输出一条Shell命令，不要解释，不要markdown，直接输出命令本身。'
                    var cmd = "curl -s --max-time 15 -X POST 'https://api.deepseek.com/chat/completions' " +
                        "-H 'Content-Type: application/json' " +
                        "-H 'Authorization: Bearer sk-placeholder' " +
                        "-d '{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"" + apiPrompt.replace(/'/g, "'\\''").replace(/"/g, '\\"') + "\"}],\"temperature\":0.3,\"max_tokens\":500}' 2>/dev/null"
                    // 上面的API key是占位的，实际大概率失败，所以用try catch
                    var res = await _rs(cmd)
                    var text = (res && res.content || '').trim()
                    if (text && text.indexOf('{') >= 0) {
                        var jsonStart = text.indexOf('{')
                        var jsonStr = text.substring(jsonStart)
                        var data = JSON.parse(jsonStr)
                        if (data.choices && data.choices[0] && data.choices[0].message) {
                            var content = data.choices[0].message.content.trim()
                            // 清理markdown代码块
                            content = content.replace(/```[a-z]*\n?/gi, '').trim()
                            if (content) {
                                aiLog('🤖 AI命令生成成功（API模式）', 'success')
                                return {
                                    command: content,
                                    description: desc,
                                    reason: 'AI根据任务描述生成的命令',
                                    category: 'ai_task',
                                    isSafe: false  // AI生成的命令默认需要确认
                                }
                            }
                        }
                    }
                } catch(e) {
                    // API调用失败，继续用模板
                }
            }

            // 4. 兜底：生成一个查看命令
            var fallbackCmd = 'echo "任务: ' + desc.replace(/"/g, '\\"') + '\n---系统信息---\n$(uname -a)\n---当前目录---\n$(pwd)"'
            return {
                command: fallbackCmd,
                description: 'AI兜底命令：显示系统信息',
                reason: '未匹配到模板，AI返回兜底命令。建议在描述中使用更明确的关键词，如：清理缓存、查看CPU、重启网络等',
                category: 'ai_task',
                isSafe: true
            }
        }

        var showTaskResult = function(result) {
            document.getElementById('ai_task_loading').style.display = 'none'
            var resultBox = document.getElementById('ai_task_result')
            var cmdDisplay = document.getElementById('ai_task_cmd_display')
            if (!result || !result.command) {
                cmdDisplay.textContent = result && result.reason ? result.reason : '无法生成命令'
                document.getElementById('ai_task_exec_btn').style.display = 'none'
            } else {
                cmdDisplay.textContent = result.command
                _currentTaskCmd = result
                document.getElementById('ai_task_exec_btn').style.display = ''
            }
            resultBox.style.display = 'block'
        }

        var executeTaskCmd = async function() {
            if (!_currentTaskCmd || !_currentTaskCmd.command) return
            var result = _currentTaskCmd

            // 加入待审批队列，然后立即执行
            var cmdId = addPendingCommand(result.command, result.description, result.reason, result.category, result.isSafe)

            // 隐藏任务结果框
            document.getElementById('ai_task_result').style.display = 'none'
            document.getElementById('ai_task_input').value = ''
            _currentTaskCmd = null

            // 立即执行（因为用户已经批准了）
            setTimeout(function() { executeCommand(cmdId) }, 100)

            showToast('命令已批准，正在执行...', 'green', 2000)
        }

        // ---- 设备巡检 ----
        var checkStorage = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var res = await _rs('df -k /data /sdcard 2>/dev/null | tail -n +2')
                var lines = (res && res.content || '').trim().split('\n')
                for (var i = 0; i < lines.length; i++) {
                    var parts = lines[i].trim().split(/\s+/)
                    if (parts.length >= 6) {
                        var total = parseInt(parts[1]) || 0
                        var used = parseInt(parts[2]) || 0
                        var avail = parseInt(parts[3]) || 0
                        var mount = parts[5]
                        if (total > 0) {
                            var pct = used / total * 100
                            if (pct > 90) {
                                aiLog('存储空间不足: ' + mount + ' 已用 ' + pct.toFixed(1) + '%，剩余 ' + Math.round(avail/1024) + 'MB', 'warn')
                                addPendingCommand(
                                    'rm -rf /sdcard/Android/data/*/cache/* /sdcard/Android/cache/* /data/local/tmp/* 2>/dev/null; echo CLEANED',
                                    '清理缓存和临时文件释放存储空间',
                                    mount + ' 已用 ' + pct.toFixed(1) + '%，剩余仅 ' + Math.round(avail/1024) + 'MB',
                                    'storage',
                                    true
                                )
                            } else if (pct > 80) {
                                aiLog('存储空间偏紧: ' + mount + ' 已用 ' + pct.toFixed(1) + '%', 'info')
                            }
                        }
                    }
                }
            } catch(e) { aiLog('存储检查异常: ' + e, 'error') }
        }

        var checkMemory = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var res = await _rs('cat /proc/meminfo 2>/dev/null | head -4')
                var lines = (res && res.content || '').trim().split('\n')
                var memTotal = 0, memFree = 0, memAvail = 0, buffers = 0, cached = 0
                for (var i = 0; i < lines.length; i++) {
                    var m = lines[i].match(/(\w+):\s+(\d+)/)
                    if (m) {
                        if (m[1] === 'MemTotal') memTotal = parseInt(m[2])
                        else if (m[1] === 'MemFree') memFree = parseInt(m[2])
                        else if (m[1] === 'MemAvailable') memAvail = parseInt(m[2])
                        else if (m[1] === 'Buffers') buffers = parseInt(m[2])
                        else if (m[1] === 'Cached') cached = parseInt(m[2])
                    }
                }
                if (memTotal > 0) {
                    var usedPct = ((memTotal - memAvail) / memTotal) * 100
                    if (usedPct > 88 && memAvail < 100000) {
                        aiLog('内存紧张: 可用 ' + Math.round(memAvail/1024) + 'MB / ' + Math.round(memTotal/1024) + 'MB (' + usedPct.toFixed(0) + '%已用)', 'warn')
                        addPendingCommand(
                            'sync; echo 3 > /proc/sys/vm/drop_caches; echo MEMCLEARED',
                            '释放系统页缓存和dentries（安全操作）',
                            '可用内存仅 ' + Math.round(memAvail/1024) + 'MB，内存使用率 ' + usedPct.toFixed(0) + '%',
                            'memory',
                            true
                        )
                    } else if (usedPct > 75) {
                        aiLog('内存使用偏高: ' + usedPct.toFixed(0) + '%', 'info')
                    }
                }
            } catch(e) { aiLog('内存检查异常: ' + e, 'error') }
        }

        var checkTemperature = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var res = await _rs('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -rn | head -1; cat /sys/class/power_supply/battery/temp 2>/dev/null')
                var lines = (res && res.content || '').trim().split('\n').filter(function(l) { return l.trim() })
                var maxTemp = 0
                var batTemp = 0
                for (var i = 0; i < lines.length; i++) {
                    var v = parseInt(lines[i].trim())
                    if (!isNaN(v)) {
                        if (i === 0) maxTemp = v / 1000
                        else if (i === 1) batTemp = v / 10
                    }
                }
                if (batTemp > 0 && batTemp > 45) {
                    aiLog('电池温度过高: ' + batTemp.toFixed(1) + '°C', 'warn')
                    showToast('⚠️ 电池温度过高(' + batTemp.toFixed(0) + '°C)，建议暂停使用并散热', 'red', 5000)
                    addPendingCommand(
                        'echo "TEMP_WARNING:' + batTemp.toFixed(1) + '" > /dev/null; echo DONE',
                        '记录温度告警（需手动散热，无自动降温命令）',
                        '电池温度 ' + batTemp.toFixed(1) + '°C 超过安全阈值45°C',
                        'battery',
                        true
                    )
                }
                if (maxTemp > 0 && maxTemp > 70) {
                    aiLog('CPU温度过高: ' + maxTemp.toFixed(1) + '°C', 'warn')
                    showToast('⚠️ CPU温度过高(' + maxTemp.toFixed(0) + '°C)', 'red', 4000)
                }
            } catch(e) {}
        }

        var checkBattery = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var res = await _rs('cat /sys/class/power_supply/battery/capacity 2>/dev/null; cat /sys/class/power_supply/battery/health 2>/dev/null; cat /sys/class/power_supply/battery/status 2>/dev/null')
                var lines = (res && res.content || '').trim().split('\n').filter(function(l) { return l.trim() })
                var capacity = parseInt(lines[0]) || -1
                var health = lines[1] || ''
                var status = lines[2] || ''
                if (capacity >= 0 && capacity < 15 && status !== 'Charging') {
                    aiLog('电量低: ' + capacity + '%，未充电', 'warn')
                    showToast('⚠️ 电量仅 ' + capacity + '%，请及时充电', 'red', 4000)
                }
                if (health && health !== 'Good' && health !== 'Unknown') {
                    aiLog('电池健康状态异常: ' + health, 'warn')
                }
            } catch(e) {}
        }

        var checkProcesses = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var res = await _rs('top -b -n 1 2>/dev/null | head -20 | grep -v "top\\|PID\\|^$"')
                var lines = (res && res.content || '').trim().split('\n')
                for (var i = 0; i < lines.length; i++) {
                    var parts = lines[i].trim().split(/\s+/)
                    if (parts.length >= 9) {
                        var cpu = parseFloat(parts[8]) || 0
                        var pid = parts[0]
                        var name = parts[parts.length - 1]
                        if (cpu > 80 && pid && /^\d+$/.test(pid) && name && name.indexOf('kworker') < 0 && name.indexOf('system_server') < 0) {
                            aiLog('高CPU进程: ' + name + ' (PID:' + pid + ' CPU:' + cpu + '%)', 'warn')
                            addPendingCommand(
                                'kill -9 ' + pid + ' 2>/dev/null; echo KILLED_' + pid,
                                '终止高CPU占用进程: ' + name + ' (PID:' + pid + ')',
                                '进程 ' + name + ' CPU占用 ' + cpu + '%，可能导致设备卡顿',
                                'system',
                                false
                            )
                            break // 每次巡检只报告一个
                        }
                    }
                }
            } catch(e) {}
        }

        var checkLogFiles = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var res = await _rs('find /sdcard -maxdepth 2 -name "*.log" -size +50M -exec ls -l {} \\; 2>/dev/null | head -5')
                var lines = (res && res.content || '').trim().split('\n').filter(function(l) { return l.trim() })
                for (var i = 0; i < lines.length; i++) {
                    var parts = lines[i].trim().split(/\s+/)
                    if (parts.length >= 8) {
                        var size = parseInt(parts[3]) || 0
                        var file = parts[parts.length - 1]
                        if (size > 50 * 1024 * 1024) { // >50MB
                            aiLog('日志文件过大: ' + file + ' (' + Math.round(size/1024/1024) + 'MB)', 'warn')
                            addPendingCommand(
                                'truncate -s 0 ' + file + ' 2>/dev/null; echo TRUNCATED',
                                '截断过大日志文件: ' + file,
                                '日志文件 ' + Math.round(size/1024/1024) + 'MB 过大，占用存储空间',
                                'storage',
                                true
                            )
                        }
                    }
                }
            } catch(e) {}
        }

        // ---- 网络监控（只通知建议，不做限速） ----
        var checkNetwork = async function() {
            try {
                var _rs = getShell(); if (!_rs) return
                var pingMs = -1, lossPct = -1, dnsMs = -1
                var netOK = false

                // ping 测试（3包，超时5秒）
                var pingRes = await _rs('ping -c 3 -W 5 8.8.8.8 2>/dev/null | tail -3')
                var pingText = (pingRes && pingRes.content || '').trim()
                var lossMatch = pingText.match(/(\d+)% packet loss/)
                var rttMatch = pingText.match(/rtt[^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/)
                if (lossMatch) lossPct = parseInt(lossMatch[1])
                if (rttMatch) pingMs = parseFloat(rttMatch[2])

                // DNS 解析测试
                var dnsRes = await _rs('ping -c 1 -W 3 baidu.com 2>/dev/null | tail -2')
                var dnsText = (dnsRes && dnsRes.content || '').trim()
                if (dnsText.indexOf('PING') >= 0 || dnsText.indexOf('bytes from') >= 0) {
                    dnsMs = 1 // DNS正常解析
                } else {
                    dnsMs = 0 // DNS解析失败
                }

                // 判断网络状态
                var status = '正常'
                var suggestion = '网络运行良好'
                var level = 'good'

                if (lossPct >= 0 && lossPct > 30) {
                    status = '严重丢包'
                    suggestion = '丢包率 ' + lossPct + '%，建议检查信号强度或重启设备，非限速问题'
                    level = 'bad'
                } else if (lossPct >= 0 && lossPct > 10) {
                    status = '丢包偏高'
                    suggestion = '丢包率 ' + lossPct + '%，建议靠近路由器或检查天线连接'
                    level = 'warn'
                } else if (pingMs >= 0 && pingMs > 300) {
                    status = '延迟很高'
                    suggestion = '延迟 ' + pingMs + 'ms，建议重启设备或切换网络（非限速问题）'
                    level = 'bad'
                } else if (pingMs >= 0 && pingMs > 150) {
                    status = '延迟偏高'
                    suggestion = '延迟 ' + pingMs + 'ms，游戏体验可能受影响'
                    level = 'warn'
                } else if (dnsMs === 0) {
                    status = 'DNS异常'
                    suggestion = 'DNS解析失败，建议手动设置DNS为 223.5.5.5 或 8.8.8.8'
                    level = 'warn'
                } else if (pingMs >= 0) {
                    status = '正常'
                    suggestion = '网络稳定，延迟 ' + pingMs + 'ms，丢包 ' + (lossPct >= 0 ? lossPct : 0) + '%'
                    level = 'good'
                } else {
                    status = '网络不通'
                    suggestion = '无法连接外网，建议检查数据连接或重启设备'
                    level = 'bad'
                }

                _netStatus = { ping: pingMs, loss: lossPct, dns: dnsMs, status: status, suggestion: suggestion }
                _netHistory.push({ time: Date.now(), ping: pingMs, loss: lossPct, dns: dnsMs, status: status })
                if (_netHistory.length > 30) _netHistory.shift()

                renderNetworkStatus(level)

                // 通知用户（有冷却时间）
                if (level !== 'good' && Date.now() - _lastNetNotify > _netNotifyCooldown) {
                    _lastNetNotify = Date.now()
                    var color = level === 'bad' ? 'red' : 'pink'
                    showToast('📡 ' + status + ': ' + suggestion, color, 6000)
                    aiLog('[网络] ' + status + ' — ' + suggestion, 'net')
                } else if (level === 'good' && Date.now() - _lastNetNotify > _netNotifyCooldown) {
                    _lastNetNotify = Date.now()
                    aiLog('[网络] 网络正常 — 延迟 ' + pingMs + 'ms, 丢包 ' + lossPct + '%', 'net')
                }

                // DNS异常时建议修复命令（设置DNS，非限速）
                if (dnsMs === 0 && level === 'warn') {
                    var hasExisting = false
                    for (var i = 0; i < _pendingCommands.length; i++) {
                        if (_pendingCommands[i].command.indexOf('setprop net.dns') >= 0 && _pendingCommands[i].status === 'pending') {
                            hasExisting = true; break
                        }
                    }
                    if (!hasExisting) {
                        addPendingCommand(
                            'setprop net.dns1 223.5.5.5; setprop net.dns2 8.8.8.8; echo DNS_SET',
                            '设置DNS为阿里DNS(223.5.5.5)和GoogleDNS(8.8.8.8)',
                            '当前DNS解析失败，更换DNS可改善网络连通性（非限速操作）',
                            'network',
                            false
                        )
                    }
                }
            } catch(e) {
                aiLog('网络检查异常: ' + e, 'error')
            }
        }

        // ---- 主巡检循环 ----
        var runDeviceCheck = async function() {
            _scanCount++
            aiLog('===== 第 ' + _scanCount + ' 轮设备巡检开始 =====', 'info')
            await checkStorage()
            await checkMemory()
            await checkTemperature()
            await checkBattery()
            await checkProcesses()
            await checkLogFiles()
            await checkNetwork()
            aiLog('===== 第 ' + _scanCount + ' 轮巡检完成，发现 ' + countPending() + ' 个待处理问题 =====', 'success')
            updateStats()
            updateFAB()
        }

        var countPending = function() {
            var c = 0
            for (var i = 0; i < _pendingCommands.length; i++) {
                if (_pendingCommands[i].status === 'pending') c++
            }
            return c
        }

        // ---- 启动/停止 ----
        var startAI = function() {
            if (_aiRunning) return
            _aiRunning = true
            try { localStorage.setItem('smart_ai_running', '1') } catch(e) {}
            aiLog('AI助手已启动，开始巡检设备...', 'success')
            showToast('🤖 AI助手已启动，正在巡检设备', 'green', 3000)
            // 立即执行一次
            runDeviceCheck()
            // 设备巡检每45秒
            _aiCheckTimer = setInterval(runDeviceCheck, 45000)
            // 网络监控每30秒
            _netCheckTimer = setInterval(checkNetwork, 30000)
            updateRunStatus()
            updateFAB()
        }

        var stopAI = function() {
            if (!_aiRunning) return
            _aiRunning = false
            try { localStorage.setItem('smart_ai_running', '0') } catch(e) {}
            if (_aiCheckTimer) { clearInterval(_aiCheckTimer); _aiCheckTimer = null }
            if (_netCheckTimer) { clearInterval(_netCheckTimer); _netCheckTimer = null }
            aiLog('AI助手已停止', 'info')
            showToast('🤖 AI助手已停止', 'pink', 2000)
            updateRunStatus()
            updateFAB()
        }

        // ---- 渲染函数 ----
        var renderNetworkStatus = function(level) {
            var pingEl = document.getElementById('ai_net_ping')
            var lossEl = document.getElementById('ai_net_loss')
            var dnsEl = document.getElementById('ai_net_dns')
            var statusEl = document.getElementById('ai_net_status')
            var sugEl = document.getElementById('ai_net_suggestion')
            var badgeEl = document.getElementById('ai_net_badge')

            var cls = '_good'
            if (level === 'warn') cls = '_warn'
            else if (level === 'bad') cls = '_bad'

            if (pingEl) {
                pingEl.textContent = _netStatus.ping >= 0 ? _netStatus.ping + 'ms' : '超时'
                pingEl.className = 'ai-status-val ' + cls
            }
            if (lossEl) {
                lossEl.textContent = _netStatus.loss >= 0 ? _netStatus.loss + '%' : '-'
                lossEl.className = 'ai-status-val ' + cls
            }
            if (dnsEl) {
                dnsEl.textContent = _netStatus.dns === 1 ? '正常' : _netStatus.dns === 0 ? '失败' : '-'
                dnsEl.className = 'ai-status-val ' + (_netStatus.dns === 1 ? '_good' : '_bad')
            }
            if (statusEl) {
                statusEl.textContent = _netStatus.status
                statusEl.className = 'ai-status-val ' + cls
            }
            if (sugEl) sugEl.textContent = _netStatus.suggestion
            if (badgeEl) {
                if (level !== 'good') { badgeEl.textContent = '!'; badgeEl.className = 'ai-badge' }
                else { badgeEl.className = 'ai-badge _0' }
            }
        }

        var renderPendingCommands = function() {
            var container = document.getElementById('ai_pending_container')
            if (!container) return

            // 只保留待处理的命令（已完成/已拒绝的自动清理，不再显示）
            var pendingOnly = []
            for (var i = 0; i < _pendingCommands.length; i++) {
                if (_pendingCommands[i].status === 'pending') {
                    pendingOnly.push(_pendingCommands[i])
                }
            }
            _pendingCommands = pendingOnly

            if (!_pendingCommands.length) {
                container.innerHTML = '<div class="ai-empty">暂无待执行命令，AI巡检发现问题后会在此建议</div>'
                var execAllBtn = document.getElementById('ai_approve_all_btn')
                if (execAllBtn) execAllBtn.style.display = 'none'
                var badge = document.getElementById('ai_pending_badge')
                if (badge) { badge.className = 'ai-badge _0'; badge.textContent = '0' }
                return
            }

            var html = ''
            var pendingCount = 0
            // 倒序显示（最新的在最上面）
            for (var i = _pendingCommands.length - 1; i >= 0; i--) {
                var cmd = _pendingCommands[i]
                if (cmd.status === 'pending') pendingCount++
                var cls = 'ai-cmd-item _' + cmd.status
                var catCls = 'ai-cmd-cat _' + cmd.category
                var actionsHtml = ''
                if (cmd.status === 'pending') {
                    actionsHtml = '<div class="ai-cmd-actions">' +
                        '<button class="ai-btn ai-btn-approve" data-action="exec" data-cmd-id="' + cmd.id + '">✅ 批准执行</button>' +
                        '<button class="ai-btn ai-btn-reject" data-action="reject" data-cmd-id="' + cmd.id + '">❌ 拒绝</button>' +
                        '</div>'
                }
                var resultHtml = ''
                if (cmd.result) {
                    resultHtml = '<div class="ai-cmd-result' + (cmd.status === 'failed' ? ' _err' : '') + '">' + (cmd.status === 'done' ? '✅ ' : cmd.status === 'failed' ? '❌ ' : '') + cmd.result + '</div>'
                }
                var safeTag = cmd.isSafe ? '<span style="font-size:9px;color:#4ade80;margin-left:4px">[安全]</span>' : '<span style="font-size:9px;color:#f87171;margin-left:4px">[需确认]</span>'
                html += '<div class="' + cls + '">' +
                    '<div class="ai-cmd-reason"><span class="' + catCls + '">' + cmd.category + '</span>' + cmd.reason + safeTag + '</div>' +
                    '<div class="ai-cmd-text">$ ' + cmd.command + '</div>' +
                    actionsHtml + resultHtml +
                    '</div>'
            }
            container.innerHTML = html

            var execAllBtn = document.getElementById('ai_approve_all_btn')
            if (execAllBtn) execAllBtn.style.display = pendingCount > 0 ? 'block' : 'none'

            var badge = document.getElementById('ai_pending_badge')
            if (badge) {
                badge.textContent = pendingCount
                badge.className = pendingCount > 0 ? 'ai-badge' : 'ai-badge _0'
            }
        }

        var renderAILogs = function() {
            var area = document.getElementById('ai_log_area')
            if (!area) return
            if (!_aiLogs.length) {
                area.innerHTML = '<div class="ai-empty">AI未启动</div>'
                return
            }
            var html = ''
            for (var i = 0; i < _aiLogs.length; i++) {
                var log = _aiLogs[i]
                var color = log.level === 'warn' ? '#fbbf24' : log.level === 'error' ? '#f87171' : log.level === 'success' ? '#4ade80' : log.level === 'net' ? '#34d399' : 'rgba(255,255,255,.6)'
                html += '<div class="ai-log-line"><span class="ai-log-time">' + log.time + '</span>' + log.icon + ' <span style="color:' + color + '">' + log.text + '</span></div>'
            }
            area.innerHTML = html
        }

        var updateStats = function() {
            var sc = document.getElementById('ai_scan_count')
            if (sc) sc.textContent = _scanCount
            var ic = document.getElementById('ai_issues_count')
            if (ic) ic.textContent = _issuesFound
            var ec = document.getElementById('ai_exec_count')
            if (ec) {
                var count = 0
                for (var i = 0; i < _pendingCommands.length; i++) {
                    if (_pendingCommands[i].status === 'done') count++
                }
                ec.textContent = count
            }
        }

        var updateRunStatus = function() {
            var el = document.getElementById('ai_run_status')
            if (!el) return
            if (_aiRunning) {
                el.textContent = '运行中'
                el.className = 'ai-status-val _good'
            } else {
                el.textContent = '未启动'
                el.className = 'ai-status-val _bad'
            }
            var startBtn = document.getElementById('ai_start_btn')
            if (startBtn) {
                if (_aiRunning) {
                    startBtn.textContent = '⏹ 停止巡检'
                    startBtn.className = 'ai-btn ai-btn-stop'
                } else {
                    startBtn.textContent = '▶ 启动巡检'
                    startBtn.className = 'ai-btn ai-btn-start'
                }
            }
        }

        var updateFAB = function() {
            var pending = countPending()
            if (_aiRunning || pending > 0) {
                fab.classList.add('_show')
                if (pending > 0) {
                    fab.classList.add('_haspending')
                    fab.classList.remove('_running')
                } else if (_aiRunning) {
                    fab.classList.add('_running')
                    fab.classList.remove('_haspending')
                }
                var badge = document.getElementById('ai_fab_badge')
                if (badge) {
                    if (pending > 0) { badge.textContent = pending; badge.className = 'fab-badge' }
                    else { badge.className = 'fab-badge _0' }
                }
            } else {
                fab.classList.remove('_show', '_running', '_haspending')
            }
        }

// ── sdm-ai 插件结束 ──
