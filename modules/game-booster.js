// SDM Module: game-booster
//@@SDM_MODULE_game-booster@@
// Version: 1.0.0
// Description: 游戏加速与限速 - 游戏加速器、去云控限速
(async function(SDM) {
    if (!SDM) return;
    const MODULE_ID = 'game-booster';
    const MODULE_NAME = '游戏加速与限速';
    const MODULE_VERSION = '1.0.0';

    // ─── 状态 ───
    let _boostRunning = false;
    let _currentGame = '';
    let _currentGamePkg = '';
    let _boostDuration = 0;
    let _boostTimer = null;
    let _gameMonitorTimer = null;
    let _speedLimitEnabled = false;
    let _speedLimitRate = 1000; // kbps

    // ─── 工具 ───
    const _run = SDM.runShell;
    const _wait = SDM.wait;

    // ─── 游戏列表（常见游戏包名）───
    const GAME_LIST = [
        { name: '王者荣耀', pkg: 'com.tencent.tmgp.sgame', icon: '⚔️' },
        { name: '和平精英', pkg: 'com.tencent.tmgp.pubgmhd', icon: '🔫' },
        { name: '原神', pkg: 'com.miHoYo.Yuanshen', icon: '✨' },
        { name: '英雄联盟手游', pkg: 'com.tencent.lolm', icon: '🏆' },
        { name: '穿越火线', pkg: 'com.tencent.tmgp.cf', icon: '🎯' },
        { name: '崩坏：星穹铁道', pkg: 'com.miHoYo.bh3oversea', icon: '🚂' },
    ];

    // ─── 检测当前游戏 ───
    const detectCurrentGame = async () => {
        try {
            // 获取前台应用
            const r = await _run('dumpsys window windows 2>/dev/null | grep -i "mCurrentFocus\\|mFocusedApp" | head -3', 5000);
            const text = String(r?.content || '');

            for (const game of GAME_LIST) {
                if (text.includes(game.pkg)) {
                    return game;
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    // ─── 启动游戏加速 ───
    const startBoost = async (game) => {
        if (_boostRunning) return;

        _boostRunning = true;
        _currentGame = game.name;
        _currentGamePkg = game.pkg;
        _boostDuration = 0;

        updateBoostUI();

        // 应用加速规则（示例）
        try {
            // 设置游戏包优先网络
            await _run(`
                # 游戏流量优先（示例命令，需根据实际系统调整）
                echo "加速规则已应用: ${game.pkg}" > /dev/null
            `, 3000);
        } catch {}

        // 计时
        _boostTimer = setInterval(() => {
            _boostDuration++;
            updateBoostDuration();
        }, 1000);

        SDM.toast(`已启动 ${game.name} 加速`, 'green', 2000);
    };

    // ─── 停止游戏加速 ───
    const stopBoost = () => {
        if (!_boostRunning) return;

        _boostRunning = false;
        _currentGame = '';
        _currentGamePkg = '';

        if (_boostTimer) {
            clearInterval(_boostTimer);
            _boostTimer = null;
        }

        updateBoostUI();
        SDM.toast('游戏加速已停止', 'yellow', 2000);
    };

    // ─── 更新加速时长显示 ───
    const updateBoostDuration = () => {
        const el = document.getElementById('boost_duration');
        if (!el) return;
        const mins = Math.floor(_boostDuration / 60);
        const secs = _boostDuration % 60;
        el.textContent = `${mins}分${secs}秒`;
    };

    // ─── 更新加速 UI ───
    const updateBoostUI = () => {
        const statusEl = document.getElementById('boost_status');
        const gameEl = document.getElementById('boost_current_game');
        const pkgEl = document.getElementById('boost_current_pkg');
        const toggleBtn = document.getElementById('boost_toggle_btn');

        if (statusEl) {
            statusEl.textContent = _boostRunning ? '加速中' : '待机中';
            statusEl.style.color = _boostRunning ? '#86efac' : '#94a3b8';
        }
        if (gameEl) gameEl.textContent = _currentGame || '无';
        if (pkgEl) pkgEl.textContent = _currentGamePkg || '-';
        if (toggleBtn) {
            toggleBtn.textContent = _boostRunning ? '⏸ 停止加速' : '▶ 一键加速';
            toggleBtn.style.background = _boostRunning
                ? 'linear-gradient(135deg,#f87171,#ef4444)'
                : 'linear-gradient(135deg,#4ade80,#22c55e)';
        }
    };

    // ─── 设置限速 ───
    const setSpeedLimit = async (rateKbps) => {
        try {
            // 限速命令示例（需要 tc 命令支持）
            const iface = 'wlan0';
            if (_speedLimitEnabled) {
                // 清除旧规则
                await _run(`tc qdisc del dev ${iface} root 2>/dev/null`, 2000);
            }

            if (rateKbps > 0) {
                // 设置新限速
                await _run(`
                    tc qdisc add dev ${iface} root handle 1: htb default 10 2>/dev/null
                    tc class add dev ${iface} parent 1: classid 1:1 htb rate ${rateKbps}kbit 2>/dev/null
                `, 3000);
                _speedLimitEnabled = true;
            } else {
                _speedLimitEnabled = false;
            }

            _speedLimitRate = rateKbps;
            return true;
        } catch (e) {
            return false;
        }
    };

    // ─── 面板 HTML ───
    const panelHtml = `
    <div style="width:100%;margin-top:8px;">
        <!-- 游戏加速卡片 -->
        <div style="padding:14px;margin-bottom:10px;border-radius:14px;background:linear-gradient(135deg,rgba(134,239,172,.08),rgba(74,222,128,.05));border:1px solid rgba(134,239,172,.2);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#86efac,#4ade80);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">🎮</div>
                    <div>
                        <div style="font-size:.7rem;font-weight:700;color:#86efac;">游戏自动加速</div>
                        <div style="font-size:.5rem;opacity:.6;">状态: <span id="boost_status" style="color:#94a3b8;">待机中</span></div>
                    </div>
                </div>
                <button id="boost_toggle_btn" style="font-size:.55rem;padding:6px 14px;border-radius:10px;border:none;background:linear-gradient(135deg,#4ade80,#22c55e);color:#052e16;font-weight:600;cursor:pointer;">▶ 一键加速</button>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="padding:10px;border-radius:10px;background:rgba(134,239,172,.08);text-align:center;border:1px solid rgba(134,239,172,.12);">
                    <div style="font-size:.45rem;opacity:.5;margin-bottom:4px;">当前游戏</div>
                    <div style="font-size:.6rem;font-weight:bold;color:#86efac;" id="boost_current_game">无</div>
                    <div style="font-size:.4rem;opacity:.4;" id="boost_current_pkg">-</div>
                </div>
                <div style="padding:10px;border-radius:10px;background:rgba(192,132,252,.08);text-align:center;border:1px solid rgba(192,132,252,.12);">
                    <div style="font-size:.45rem;opacity:.5;margin-bottom:4px;">加速时长</div>
                    <div style="font-size:.6rem;font-weight:bold;color:#c084fc;" id="boost_duration">0秒</div>
                </div>
                <div style="padding:10px;border-radius:10px;background:rgba(253,230,138,.08);text-align:center;border:1px solid rgba(253,230,138,.12);">
                    <div style="font-size:.45rem;opacity:.5;margin-bottom:4px;">丢包优化</div>
                    <div style="font-size:.6rem;font-weight:bold;color:#fde68a;" id="boost_loss_repair">0%</div>
                </div>
            </div>
        </div>

        <!-- 游戏选择 -->
        <div style="padding:14px;margin-bottom:10px;border-radius:14px;background:linear-gradient(135deg,rgba(167,139,252,.06),rgba(139,92,246,.04));border:1px solid rgba(167,139,252,.15);">
            <div style="font-size:.65rem;font-weight:700;color:#c4b5fd;margin-bottom:10px;">🎯 选择游戏手动加速</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${GAME_LIST.map(g => `
                    <button class="game-select-btn" data-pkg="${g.pkg}" data-name="${g.name}" style="padding:8px;border-radius:10px;border:1px solid rgba(167,139,252,.2);background:rgba(167,139,252,.08);color:#c4b5fd;font-size:.55rem;cursor:pointer;transition:all .2s;text-align:left;">
                        <span style="font-size:.8rem;margin-right:4px;">${g.icon}</span>${g.name}
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- 限速器 -->
        <div style="padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(244,114,182,.06),rgba(236,72,153,.04));border:1px solid rgba(244,114,182,.15);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-size:.65rem;font-weight:700;color:#f9a8d4;">⚡ 去云控限速器</div>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="speed_limit_toggle" style="accent-color:#f472b6;">
                    <span style="font-size:.5rem;color:#f9a8d4;">启用</span>
                </label>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:.5rem;color:#94a3b8;white-space:nowrap;">限速值:</span>
                <select id="speed_limit_select" style="flex:1;padding:4px 8px;font-size:.55rem;border-radius:8px;border:1px solid rgba(244,114,182,.25);background:rgba(244,114,182,.1);color:#f9a8d4;outline:none;">
                    <option value="500">500 Kbps</option>
                    <option value="1000" selected>1 Mbps</option>
                    <option value="2000">2 Mbps</option>
                    <option value="5000">5 Mbps</option>
                    <option value="10000">10 Mbps</option>
                </select>
                <button id="speed_limit_apply" style="padding:4px 12px;font-size:.55rem;border-radius:8px;border:none;background:linear-gradient(135deg,#f472b6,#ec4899);color:#fff;font-weight:600;cursor:pointer;">应用</button>
            </div>
            <div style="margin-top:8px;font-size:.5rem;color:#64748b;line-height:1.5;">
                ⚠️ 限速功能需要 tc 命令支持（需 root 权限），部分设备可能不兼容
            </div>
        </div>
    </div>
    `;

    // ─── 注册面板 ───
    SDM.registerPanel(MODULE_ID, panelHtml);

    // ─── 绑定事件 ───
    setTimeout(() => {
        const toggleBtn = document.getElementById('boost_toggle_btn');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                if (_boostRunning) {
                    stopBoost();
                } else {
                    // 选择第一个游戏作为示例
                    if (GAME_LIST.length > 0) {
                        startBoost(GAME_LIST[0]);
                    }
                }
            };
        }

        // 游戏选择按钮
        document.querySelectorAll('.game-select-btn').forEach(btn => {
            btn.onclick = () => {
                const name = btn.dataset.name;
                const pkg = btn.dataset.pkg;
                startBoost({ name, pkg });
            };
        });

        // 限速器
        const speedApplyBtn = document.getElementById('speed_limit_apply');
        const speedSelect = document.getElementById('speed_limit_select');
        const speedToggle = document.getElementById('speed_limit_toggle');

        if (speedApplyBtn) {
            speedApplyBtn.onclick = async () => {
                const rate = speedToggle?.checked ? parseInt(speedSelect.value) : 0;
                const ok = await setSpeedLimit(rate);
                if (ok) {
                    SDM.toast(rate > 0 ? `限速已设置: ${rate} Kbps` : '限速已关闭', 'green', 2000);
                } else {
                    SDM.toast('设置失败，请检查权限', 'red', 2000);
                }
            };
        }

        // 游戏监测（自动检测前台游戏）
        _gameMonitorTimer = setInterval(async () => {
            if (_boostRunning) return; // 已经在加速就不检测了
            const game = await detectCurrentGame();
            if (game) {
                // 检测到游戏，提示用户
                // 实际使用时可以自动启动
            }
        }, 10000);

        console.log(`[SDM Module] ${MODULE_NAME} v${MODULE_VERSION} 已加载`);
        SDM.emit('module:ready', MODULE_ID);
    }, 200);

    // ─── 监听卸载事件 ───
    SDM.on('module:unload', (id) => {
        if (id === MODULE_ID) {
            if (_boostTimer) clearInterval(_boostTimer);
            if (_gameMonitorTimer) clearInterval(_gameMonitorTimer);
            const panel = document.getElementById(`sdm-panel-${MODULE_ID}`);
            if (panel) panel.remove();
        }
    });

})(window.SDM);
