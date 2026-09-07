// ─────────────────────────────────────────────────────────
// 插件: 电池监控pro+充电控制器
// ID: sdm-battery
// 版本: 3.6.9.0
// 此文件为独立插件,由 SDM 统一更新管理器管理
// ─────────────────────────────────────────────────────────

var PLUGIN_ID = 'sdm-battery';
var PLUGIN_VERSION = '3.6.9.0';

if (typeof SDMUpdater !== 'undefined' && SDMUpdater && SDMUpdater.register) {
    SDMUpdater.register({ id: PLUGIN_ID, name: '电池监控pro+充电控制器', version: PLUGIN_VERSION, file: 'plugins/sdm-battery.js' });
}

    (function(){
        try {
            var CURRENT_BP_VERSION = 'bp-v2-flex';
            var _old = document.getElementById('BATTERY_PRO_CONTAINER');
            if (_old && _old.getAttribute('data-bp-version') !== CURRENT_BP_VERSION) {
                // 用 sessionStorage 防止反复自愈（同一会话只触发一次）
                if (sessionStorage.getItem('bp-selfheal-done') === '1') {
                    console.log('[BP] 自愈本会话已执行过，跳过以避免循环');
                    return;
                }
                console.log('[BP] 检测到旧版面板（bp-version=' + (_old.getAttribute('data-bp-version') || 'missing') +
                            '，当前=' + CURRENT_BP_VERSION + '），移除后重新注入新版...');
                _old.remove();
                // 移除旧版注入的同名 style 元素（不含新版本标识的）
                try {
                    document.querySelectorAll('style').forEach(function(s) {
                        if (s._bpMarked) return;
                        if (s.textContent && s.textContent.indexOf('bp-header-block') >= 0
                            && s.textContent.indexOf('bp-header-row-actions') < 0) {
                            s.remove();
                        }
                    });
                } catch(e) {}
                sessionStorage.setItem('bp-selfheal-done', '1');
            }
        } catch(e) {}
    })();

(async () => {
    if (!document.getElementById('BATTERY_PRO_CONTAINER')) {
        console.log("Battery Pro plugin initializing...");

    // 0. 🛠️ 工具函数：智能等待元素出现 
    const waitForElement = (selector, timeout = 10000) => {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            const observer = new MutationObserver((mutations, obs) => {
                const el = document.querySelector(selector);
                if (el) {
                    resolve(el);
                    obs.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null); 
            }, timeout);
        });
    };

    const style = document.createElement('style');
    style.textContent = `
    /* 【字体修复】多源@font-face：本地文件优先 → jsdelivr CDN(fastly镜像) → jsdelivr CDN(默认)
       注意：src里只能放字体文件(woff2)，不能放CSS链接 */
    @font-face {
        font-family: 'JetBrains Mono';
        src: url('fonts/JetBrainsMono-700.woff2') format('woff2'),
             url('https://fastly.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-700-normal.woff2') format('woff2'),
             url('https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-700-normal.woff2') format('woff2');
        font-weight: 700;
        font-display: swap;
    }
    @font-face {
        font-family: 'JetBrains Mono';
        src: url('fonts/JetBrainsMono-800.woff2') format('woff2'),
             url('https://fastly.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-800-normal.woff2') format('woff2'),
             url('https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-800-normal.woff2') format('woff2');
        font-weight: 800;
        font-display: swap;
    }
    #BATTERY_PRO_CONTAINER, #BATTERY_PRO_CONTAINER * { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    box-sizing: border-box; }
    .bp-preload, .bp-preload * { transition: none !important;
    }
    #BATTERY_PRO_CONTAINER { width: 100%; margin: 10px 0; display: flex; flex-direction: column; position: relative; gap: 0;
    transform: translateZ(0); opacity: 1;
    }
    /* ===== 琥珀呼吸光晕边框（新版：替代彩虹流水灯） ===== */
    .bp-flowing-border {
        position: relative;
        border-radius: 20px;
        overflow: hidden;
    }
    .bp-flowing-border::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 20px;
        border: 1px solid rgba(245, 158, 11, .35);
        box-shadow: inset 0 0 18px rgba(245, 158, 11, .06);
        animation: bp-amber-breathe 3.2s ease-in-out infinite;
        pointer-events: none;
        z-index: 10;
    }
    @keyframes bp-amber-breathe {
        0%, 100% { border-color: rgba(245, 158, 11, .28); box-shadow: inset 0 0 12px rgba(245, 158, 11, .04); }
        50% { border-color: rgba(251, 191, 36, .65); box-shadow: inset 0 0 24px rgba(245, 158, 11, .12); }
    }
    /* ===== 暖光扫过效果（新版：替代水中倒影） ===== */
    .bp-water-reflection {
        position: relative;
    }
    .bp-water-reflection::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(115deg,
            transparent 30%,
            rgba(251, 191, 36, .05) 44%,
            rgba(254, 243, 199, .09) 50%,
            rgba(251, 191, 36, .05) 56%,
            transparent 70%);
        animation: bp-warm-sweep 5s ease-in-out infinite;
        pointer-events: none;
        z-index: 1;
    }
    @keyframes bp-warm-sweep {
        0%, 100% { transform: translateX(0); opacity: .4; }
        50% { transform: translateX(6px); opacity: .85; }
    }
    /* ===== 交互悬浮效果 ===== */
    .bp-interactive {
        transition: transform .3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
                    box-shadow .3s ease,
                    filter .3s ease;
    }
    .bp-interactive:hover {
        transform: translateY(-2px) scale(1.005);
        box-shadow: 0 8px 30px rgba(245, 158, 11, .13);
        filter: brightness(1.06);
    }
    .bp-interactive:active {
        transform: translateY(0) scale(0.99);
        transition: transform .1s ease;
    }
    .bp-interactive .bp-data-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(245, 158, 11, .15);
    }
   #battery_ring, #header_ring_path {
        transition: stroke-dashoffset 0.3s cubic-bezier(0.25, 1, 0.5, 1); //圆环特效
    }
    .bp-header-block { background: linear-gradient(135deg, rgba(32, 24, 12, .88), rgba(15, 18, 26, .92)); backdrop-filter: blur(30px) saturate(140%); border-radius: 20px 20px 0 0;
    padding: 16px 20px; display: flex; align-items: center; gap: 10px; border: 1px solid rgba(245, 158, 11, .18); border-bottom: none; margin-bottom: 0;
    box-shadow: 0 6px 24px rgba(0, 0, 0, .35); position: relative; z-index: 2;
    transition: border-radius 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275), margin-bottom 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .bp-header-block.is-collapsed { border-radius: 20px !important; border-bottom: 1px solid rgba(245, 158, 11, .18);
    }
    .bp-logo-area { display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    .bp-logo-box { width: 42px; height: 42px; background: linear-gradient(145deg, rgba(245, 158, 11, .2), rgba(120, 53, 15, .3)); border-radius: 50% 50% 50% 10px; display: flex;
    align-items: center; justify-content: center; position: relative; overflow: hidden; border: 1px solid rgba(251, 191, 36, .38); flex-shrink: 0; transition: 0.2s;
    box-shadow: 0 0 14px rgba(245, 158, 11, .18);
    }
    .bp-title-group { display: flex; flex-direction: column; justify-content: center; white-space: nowrap;
    }
    .bp-main-title { font-size: 17px; font-weight: 800; color: #fef3c7; line-height: 1.1; display: flex; align-items: center; gap: 6px;
    letter-spacing: 1px; }
    .bp-sub-title { font-size: 12px; color: rgba(251, 191, 36, .75); font-weight: 600; margin-top: 4px; letter-spacing: 1px;
    }
    /* 中间弹性区（.bp-header-row-actions）：占据 logo 与右侧按钮组之间的剩余空间，
       无电池模式按钮（及折叠态摘要）在其中居中；flex 流内元素物理上不可能重叠 */
    .bp-header-row-actions { flex: 1; min-width: 0; display: flex; justify-content: center; align-items: center; gap: 10px; }
   .bp-header-summary { display: none; align-items: center; gap: 18px; }

    .bp-header-block.is-collapsed .bp-header-summary { display: flex; }
    #header_cpu_temp_container { display: none; }
    .bp-header-block.is-collapsed #header_cpu_temp_container { display: flex; }
    .bp-summary-item { display: flex; align-items: center; gap: 3px; font-size: 14px; font-weight: 700;
    color: rgba(254, 243, 199, .92); }
    .bp-summary-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; display: inline-block; text-align: right;
    }
    #header_power { min-width: 45px; } #header_temp { min-width: 30px;
    }
    /* 充电管理按钮：flex 流内元素贴右侧开关（前有中间弹性区撑开），与无电池模式按钮绝不重叠 */
    .bp-charge-ctrl-btn { display: flex; align-items: center; flex-shrink: 0;
    gap: 6px; background: linear-gradient(135deg, rgba(245, 158, 11, .22), rgba(180, 83, 9, .3)); border: 1px solid rgba(251, 191, 36, .45); color: #fbbf24; border-radius: 999px;
   padding: 6px 12px; font-size: 12px; font-weight: bold; cursor: pointer; opacity: 1; pointer-events: auto; transition: all 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    z-index: 24; box-shadow: 0 0 10px rgba(245, 158, 11, .2); }
    .bp-charge-ctrl-btn:active { background: rgba(245, 158, 11, .35);
    }
    /* 充电管理按钮在所有状态都显示（展开态可点；折叠态也可点，与无电池按钮由 flex 布局错开） */
    /* 无电池模式按钮：始终显示，flex 流内元素在中间弹性区居中，与右侧充电管理按钮天然错开不重叠 */
    #bp_no_battery_toggle { display: inline-block; flex-shrink: 0;
    font-size: .5rem; font-weight: bold; color: white; cursor: pointer; padding: 4px 12px; border-radius: 12px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b); border: 1px solid rgba(251, 191, 36, .5);
    box-shadow: 0 1px 6px rgba(251, 191, 36, .3); transition: all 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    z-index: 23; white-space: nowrap; }
    /* 无电池模式激活时青色高亮 */
    #bp_no_battery_toggle.no-battery-active {
        background: linear-gradient(135deg, #22d3ee, #0891b2); border-color: rgba(34, 211, 238, .6); box-shadow: 0 0 14px rgba(34, 211, 238, .35);
    }
    /* 无电池模式按钮在所有状态都显示；与充电管理由 flex 布局错开（中间弹性区居中 vs 右侧贴开关） */
    .bp-monitor-switch { position: relative; width: 44px; height: 24px; display: inline-block; flex-shrink: 0;
    }
    .bp-monitor-switch input { opacity: 0; width: 0; height: 0;
    }
    .bp-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(254, 243, 199, .08);
    transition: .4s; border-radius: 34px; border: 1px solid rgba(245, 158, 11, .25); }
    .bp-slider:before { position: absolute; content: ""; height: 18px;
    width: 18px; left: 3px; top: 50%; transform: translateY(-50%); background: linear-gradient(180deg, #fde68a, #f59e0b); transition: .4s; border-radius: 50%; box-shadow: 0 2px 6px rgba(245, 158, 11, .5);
    }
    input:checked + .bp-slider { background-color: rgba(245, 158, 11, .35); border-color: rgba(251, 191, 36, .6);
    }
    input:checked + .bp-slider:before { transform: translate(20px, -50%);
    }
   .bp-body-block { background: linear-gradient(180deg, rgba(15, 18, 26, .92), rgba(12, 15, 22, .96)); backdrop-filter: blur(30px); border-radius: 0 0 20px 20px;
    border: 1px solid rgba(245, 158, 11, .12); border-top: none; overflow: hidden; display: flex; flex-direction: column; position: relative; z-index: 1; max-height: 500px; opacity: 1;
    transition: max-height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
    }
    .bp-body-block.collapsed { max-height: 0; opacity: 0; padding-bottom: 0 !important; border-bottom: none !important; pointer-events: none;
    }
    .bp-content-container { padding: 22px; transform: translateY(0); transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.6); }
    .bp-body-block.collapsed .bp-content-container { transform: translateY(-20px); }
    .bp-layout-grid { display: grid; grid-template-columns: 1fr 1.2fr;
    gap: 18px; align-items: center; }
   .bp-ring-container { display: flex; flex-direction: column; align-items: center; justify-content: center; background: none; border: none; padding: 15px; }
    .bp-ring-box-inner { position: relative; width: 130px; height: 130px;
    }
    .bp-data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    }
    /* 新版数据卡：对角切角 + 左侧能量条 */
    .bp-data-card { background: linear-gradient(160deg, rgba(245, 158, 11, .08), rgba(32, 26, 15, .38)); padding: 10px 10px 10px 14px; border-radius: 4px 14px 4px 14px; height: 70px; box-sizing: border-box;
    display: flex; flex-direction: column; justify-content: center; align-items: flex-start; border: 1px solid rgba(245, 158, 11, .16); border-left: 3px solid rgba(251, 191, 36, .55); transition: all .3s cubic-bezier(0.175,0.885,0.32,1.275);
    position: relative; overflow: hidden;
    }
    .bp-data-card:hover { background: linear-gradient(160deg, rgba(245, 158, 11, .16), rgba(42, 34, 18, .5)); transform: translateY(-2px) scale(1.02);
        box-shadow: 0 4px 15px rgba(245, 158, 11, .18);
        border-color: rgba(251, 191, 36, .4); border-left-color: #fbbf24;
    }
    .bp-data-card:active { transform: translateY(0) scale(0.98); }
    .bp-data-card::after { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(251, 191, 36, .12), transparent);
        transition: left .6s ease;
    }
    .bp-data-card:hover::after { left: 100%; }
    .bp-data-label { font-size: 12px; color: #fbbf24; margin-bottom: 4px; width: 100%; text-align: left; letter-spacing: .5px; }
    .bp-data-val { font-size: 18px; font-weight: 700; color: #fef3c7; font-family: 'JetBrains Mono', monospace; width: 100%; text-align: center; }
    .bp-unit { font-size: 12px; color: rgba(254, 243, 199, .4); margin-left: 2px;
    }
/* 可点击光环样式与温度卡片样式 */
.bp-ring-clickable { cursor: pointer; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.bp-ring-clickable:active { transform: scale(0.92); }
.bp-temp-card { display: block !important; padding: 8px 10px !important; position: relative; overflow: hidden; }
.bp-temp-header { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 2; }

    @media (max-width: 768px) {
        .bp-header-block { padding: 12px 14px;
        }
        .bp-logo-box { width: 36px; height: 36px;
        }
        .bp-main-title { font-size: 15px;
        }
        .bp-sub-title { font-size: 11px;
        }
        .bp-content-container { padding: 12px;
        }
        .bp-layout-grid { grid-template-columns: 1fr 1.3fr; gap: 10px; align-items: center;
        }
        .bp-ring-container { padding: 0; background: none; border: none; display: flex; justify-content: center;
        align-items: center; }
        .bp-ring-box-inner { transform: scale(0.9); transform-origin: center;
        }
        .bp-data-grid { gap: 6px;
        }
        .bp-data-card { height: 55px; padding: 6px 8px 6px 12px;
        }
        .bp-data-label { font-size: 10px; margin-bottom: 2px;
        }
        .bp-data-val { font-size: 15px;
        }

        /* 手机端卡片右上角的温度和功率字号统一调小 */
        #battery_temp, #battery_power { font-size: 11px !important; }
        #battery_temp { margin-right: -7px; }
        #battery_power { margin-right: -2px; }

        /* 统一调小手机端右上角的单位（°C 和 W） */
        #battery_temp .bp-unit, #battery_power .bp-unit {
            font-size: 9px !important;
            margin-left: 1px;
        }
        /* 手机端按钮紧凑化：充电管理贴紧右侧开关，无电池模式在中间弹性区居中且缩小 */
        .bp-charge-ctrl-btn { padding: 4px 8px; font-size: 10px;
        }
        #bp_no_battery_toggle { font-size: .48rem; padding: 3px 10px;
        }
        /* 手机端空间极窄：折叠态不显示摘要（摘要+按钮塞不下），只保留无电池按钮居中 */
        .bp-header-block.is-collapsed .bp-header-summary { display: none; }
        .bp-header-summary { gap: 6px;
        }
        .bp-summary-item { font-size: 11px; gap: 0px;
        }
        .bp-summary-val { font-size: 13px; white-space: nowrap;
        }
        #header_power { min-width: 38px; text-align: right; display: inline-block;
        }
        #header_temp { min-width: 30px; text-align: right; display: inline-block;
        }
    }

/* 能量脉冲动效*/
    @keyframes bp-energy-pulse {
        0%, 100% { 
            transform: translate(-50%, -50%) scale(1);
        }
        50% { 
            transform: translate(-50%, -50%) scale(1.3); 
        }
    }
    .bp-pulse-active {
        animation: bp-energy-pulse 1.5s ease-in-out infinite;
    }

    /* ===== ★ 美化增强：玻璃拟态 + 高级动效 ===== */
    /* 容器多层光晕背景 */
    #BATTERY_PRO_CONTAINER {
        background: linear-gradient(180deg, rgba(32,24,12,.12), rgba(15,18,26,.08));
        border-radius: 20px;
        position: relative;
    }
    #BATTERY_PRO_CONTAINER::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 20px;
        background:
            radial-gradient(circle at 20% 10%, rgba(251,191,36,.06), transparent 50%),
            radial-gradient(circle at 80% 90%, rgba(34,211,238,.04), transparent 50%);
        pointer-events: none;
        z-index: 0;
    }
    /* 标题区霓虹辉光 */
    .bp-header-block {
        background: linear-gradient(135deg, rgba(32,24,12,.92), rgba(20,16,30,.95)) !important;
        backdrop-filter: blur(30px) saturate(160%) !important;
        border-top: 1px solid rgba(251,191,36,.25) !important;
        box-shadow: 0 6px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(251,191,36,.12) !important;
    }
    .bp-logo-box {
        background: linear-gradient(145deg, rgba(245,158,11,.25), rgba(120,53,15,.35)) !important;
        border: 1px solid rgba(251,191,36,.45) !important;
        box-shadow: 0 0 16px rgba(245,158,11,.25), inset 0 1px 0 rgba(255,255,255,.08) !important;
    }
    .bp-main-title {
        background: linear-gradient(135deg, #fef3c7, #fbbf24, #f59e0b);
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text;
        text-shadow: none;
    }
    /* 主体区深度玻璃 */
    .bp-body-block {
        background: linear-gradient(180deg, rgba(15,18,26,.95), rgba(10,12,18,.98)) !important;
        backdrop-filter: blur(30px) saturate(140%) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
    }
    /* 圆环发光脉冲 */
    .bp-ring-box-inner {
        position: relative;
    }
    .bp-ring-box-inner::before {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(251,191,36,.08), transparent 70%);
        animation: bp-ring-glow 3s ease-in-out infinite;
        pointer-events: none;
    }
    @keyframes bp-ring-glow {
        0%,100% { opacity: .4; transform: scale(.95); }
        50% { opacity: .8; transform: scale(1.05); }
    }
    /* 数据卡玻璃拟态增强 */
    .bp-data-card {
        background: linear-gradient(160deg, rgba(245,158,11,.1), rgba(32,26,15,.42)) !important;
        border: 1px solid rgba(245,158,11,.18) !important;
        border-left: 3px solid rgba(251,191,36,.55) !important;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.04) !important;
    }
    .bp-data-card:hover {
        background: linear-gradient(160deg, rgba(245,158,11,.2), rgba(42,34,18,.55)) !important;
        border-color: rgba(251,191,36,.45) !important;
        border-left-color: #fbbf24 !important;
        box-shadow: 0 8px 24px rgba(245,158,11,.15), inset 0 1px 0 rgba(255,255,255,.08) !important;
    }
    .bp-data-label {
        text-shadow: 0 0 8px rgba(251,191,36,.3);
    }
    .bp-data-val {
        text-shadow: 0 0 12px rgba(254,243,199,.2);
    }
    /* 折叠开关滑块高级感 */
    .bp-slider {
        box-shadow: inset 0 2px 4px rgba(0,0,0,.2);
    }
    .bp-slider:before {
        box-shadow: 0 2px 8px rgba(245,158,11,.6), inset 0 1px 0 rgba(255,255,255,.3) !important;
    }
    input:checked + .bp-slider {
        box-shadow: inset 0 2px 4px rgba(0,0,0,.2), 0 0 10px rgba(251,191,36,.3) !important;
    }
    /* 充电管理按钮高光 */
    .bp-charge-ctrl-btn {
        background: linear-gradient(135deg, rgba(245,158,11,.25), rgba(180,83,9,.35)) !important;
        border: 1px solid rgba(251,191,36,.5) !important;
        box-shadow: 0 2px 10px rgba(245,158,11,.2), inset 0 1px 0 rgba(255,255,255,.06) !important;
        text-shadow: 0 0 6px rgba(251,191,36,.3);
    }
    .bp-charge-ctrl-btn:hover {
        box-shadow: 0 4px 16px rgba(245,158,11,.3), inset 0 1px 0 rgba(255,255,255,.1) !important;
        filter: brightness(1.1);
    }
    /* 无电池模式按钮玻璃质感 */
    #bp_no_battery_toggle {
        box-shadow: 0 2px 8px rgba(251,191,36,.25), inset 0 1px 0 rgba(255,255,255,.15) !important;
        text-shadow: 0 0 4px rgba(255,255,255,.3);
    }
    #bp_no_battery_toggle.no-battery-active {
        box-shadow: 0 2px 12px rgba(34,211,238,.3), inset 0 1px 0 rgba(255,255,255,.15) !important;
    }
    /* 温度卡片进度条发光 */
    .bp-temp-card canvas {
        filter: drop-shadow(0 0 4px rgba(251,191,36,.15));
    }
    /* 闪烁粒子（充电时） */
    .bp-sparkle {
        position: absolute;
        width: 3px; height: 3px;
        border-radius: 50%;
        background: #fef3c7;
        pointer-events: none;
        animation: bp-sparkle-rise 1.5s ease-out forwards;
    }
    @keyframes bp-sparkle-rise {
        0% { opacity: 0; transform: translateY(0) scale(.5); }
        20% { opacity: 1; }
        100% { opacity: 0; transform: translateY(-30px) scale(1.2); }
    }

    /* ===== ★ 无电池模式温度面板美化（青色玻璃拟态） ===== */
    .bp-temp-panel {
        display: none; width: 100%; margin-top: 0; padding: 20px;
        border-radius: 0 0 20px 20px;
        background: linear-gradient(180deg, rgba(8,20,28,.95), rgba(6,14,20,.98));
        backdrop-filter: blur(30px) saturate(140%);
        border: 1px solid rgba(34,211,238,.15); border-top: none;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        position: relative; overflow: hidden;
    }
    .bp-temp-panel::before {
        content: ''; position: absolute; inset: 0;
        background:
            radial-gradient(circle at 30% 20%, rgba(34,211,238,.06), transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(6,182,212,.04), transparent 50%);
        pointer-events: none;
    }
    .bp-temp-header {
        display: flex; align-items: center; justify-content: space-around;
        margin-bottom: 16px; padding: 12px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(34,211,238,.06), rgba(8,145,178,.04));
        border: 1px solid rgba(34,211,238,.12);
        position: relative; z-index: 1;
    }
    .bp-temp-main-display { text-align: center; flex: 1; }
    .bp-temp-label { font-size: 12px; color: rgba(34,211,238,.7); margin-bottom: 6px; font-weight: 600; letter-spacing: 1px; }
    .bp-temp-value-wrap { display: flex; align-items: baseline; justify-content: center; gap: 4px; }
    .bp-temp-value {
        font-size: 42px; font-weight: 800; color: #4CAF50;
        font-family: 'JetBrains Mono', monospace;
        text-shadow: 0 0 20px rgba(76,175,80,.4);
        transition: color .3s ease, text-shadow .3s ease;
    }
    .bp-temp-unit { font-size: 16px; color: rgba(34,211,238,.6); font-weight: 600; }
    .bp-temp-status-wrap { flex: 1; text-align: center; }
    .bp-temp-status-label { font-size: 12px; color: rgba(34,211,238,.7); margin-bottom: 8px; font-weight: 600; }
    .bp-temp-status-ring {
        width: 64px; height: 64px; margin: 0 auto; border-radius: 50%;
        background: conic-gradient(#4CAF50 0%, rgba(51,51,51,.06) 0%);
        display: flex; align-items: center; justify-content: center; position: relative;
        transition: background .4s ease;
        box-shadow: 0 0 12px rgba(76,175,80,.15);
    }
    .bp-temp-status-ring::before {
        content: ''; position: absolute; inset: -3px; border-radius: 50%;
        background: radial-gradient(circle, rgba(34,211,238,.1), transparent 70%);
        animation: bp-ring-glow 3s ease-in-out infinite;
    }
    .bp-temp-status-inner {
        width: 50px; height: 50px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; color: #fff; font-weight: bold;
        background: linear-gradient(135deg, rgba(15,17,24,.95), rgba(10,12,18,.98));
        border: 1px solid rgba(34,211,238,.15);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        position: relative; z-index: 1;
    }
    .bp-temp-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px; position: relative; z-index: 1; }
    .bp-temp-card-lg, .bp-temp-card-sm {
        border-radius: 12px; padding: 12px;
        background: linear-gradient(160deg, rgba(34,211,238,.08), rgba(8,20,28,.4));
        border: 1px solid rgba(34,211,238,.12);
        border-left: 3px solid rgba(34,211,238,.4);
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.04);
        transition: all .3s ease;
    }
    .bp-temp-card-lg:hover, .bp-temp-card-sm:hover {
        border-color: rgba(34,211,238,.3);
        box-shadow: 0 4px 16px rgba(34,211,238,.1), inset 0 1px 0 rgba(255,255,255,.06);
    }
    .bp-temp-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .bp-temp-card-title { font-size: 12px; color: #22d3ee; font-weight: 700; letter-spacing: .5px; text-shadow: 0 0 6px rgba(34,211,238,.2); }
    .bp-temp-card-sub { font-size: 10px; color: rgba(34,211,238,.5); }
    .bp-temp-trend-chart { height: 54px; display: flex; align-items: end; gap: 2px; padding: 4px 0; }
    .bp-temp-data-list { display: flex; flex-direction: column; gap: 8px; }
    .bp-temp-data-row { display: flex; justify-content: space-between; align-items: center; }
    .bp-temp-data-key { font-size: 11px; color: rgba(34,211,238,.55); }
    .bp-temp-data-val { font-size: 12px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .bp-temp-legend {
        padding: 10px 12px; border-radius: 10px;
        background: linear-gradient(135deg, rgba(34,211,238,.04), rgba(8,145,178,.02));
        border: 1px solid rgba(34,211,238,.1);
        font-size: 10px; line-height: 1.3; display: flex; justify-content: space-between;
        position: relative; z-index: 1;
    }
    @media (max-width: 768px) {
        .bp-temp-panel { padding: 14px; }
        .bp-temp-value { font-size: 32px; }
        .bp-temp-status-ring { width: 52px; height: 52px; }
        .bp-temp-status-inner { width: 42px; height: 42px; font-size: 10px; }
        .bp-temp-grid { grid-template-columns: 1.5fr 1fr; gap: 8px; }
        .bp-temp-card-lg, .bp-temp-card-sm { padding: 8px; }
        .bp-temp-legend { font-size: 9px; }
    }

    `;
    style._bpMarked = 'bp-v2-flex';
    document.head.appendChild(style);

    // 【字体修复】延迟3秒下载字体，避免阻塞初始化
    setTimeout(function() {
        (async () => {
            try {
                var _rs = typeof runShellWithRoot !== 'undefined' ? runShellWithRoot : null
                if (!_rs) return
                var fontDir = '/data/data/com.minikano.f50_sms/files/fonts'
                await _rs('mkdir -p ' + fontDir + ' 2>/dev/null')
                // 检查是否已有字体文件
                var checkRes = await _rs('[ -f ' + fontDir + '/JetBrainsMono-700.woff2 ] && echo yes || echo no')
                if ((checkRes.content || '').trim() === 'yes') return // 已有则跳过
                // 【字体修复】下载700(粗体)和800(特粗)两个字重，使用fastly镜像优先+jsdelivr兜底
                var _f700 = 'https://fastly.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-700-normal.woff2'
                var _f800 = 'https://fastly.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-800-normal.woff2'
                var _f700b = 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-700-normal.woff2'
                var _f800b = 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-800-normal.woff2'
                await _rs('timeout 10s wget -q -O ' + fontDir + '/JetBrainsMono-700.woff2 "' + _f700 + '" 2>/dev/null || timeout 10s curl -sL -o ' + fontDir + '/JetBrainsMono-700.woff2 "' + _f700 + '" 2>/dev/null || timeout 10s curl -sL -o ' + fontDir + '/JetBrainsMono-700.woff2 "' + _f700b + '" 2>/dev/null')
                await _rs('timeout 10s wget -q -O ' + fontDir + '/JetBrainsMono-800.woff2 "' + _f800 + '" 2>/dev/null || timeout 10s curl -sL -o ' + fontDir + '/JetBrainsMono-800.woff2 "' + _f800 + '" 2>/dev/null || timeout 10s curl -sL -o ' + fontDir + '/JetBrainsMono-800.woff2 "' + _f800b + '" 2>/dev/null')
                await _rs('chmod 644 ' + fontDir + '/*.woff2 2>/dev/null')
                console.log('[BP] JetBrains Mono font downloaded to local')
            } catch(e) { console.log('[BP] Font download skipped:', e) }
        })()
    }, 3000)

// 1. 预读取折叠状态
const COLLAPSE_KEY = 'bp_collapse_status';
const isClosed = localStorage.getItem(COLLAPSE_KEY) === 'closed';

// 2. 动态生成 HTML（琥珀能量核心主题）
const htmlStructure = `
    <div id="BATTERY_PRO_CONTAINER" data-bp-version="bp-v2-flex" class="bp-preload bp-flowing-border bp-water-reflection bp-interactive" style="display:none;">
        <div class="bp-header-block ${isClosed ? 'is-collapsed' : ''}" id="bp_header">
            <div class="bp-logo-area">
                <div class="bp-logo-box">
                    <svg width="32" height="32" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(245,158,11,.2)" stroke-width="4" />
                        <path id="header_ring_path" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="transparent" stroke-width="4" stroke-dasharray="100, 100" stroke-dashoffset="100" stroke-linecap="round" />
                    </svg>
                    <div id="header_icon_container" style="width:18px; height:18px; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); display:flex; align-items:center; justify-content:center; color:#fbbf24;"></div>
                </div>
                <div class="bp-title-group">
                    <div class="bp-main-title">🔋 电池管家</div>
                    <div class="bp-sub-title" id="header_status_text">状态检测...</div>
                </div>
            </div>

            <div class="bp-header-row-actions">
                <div class="bp-header-summary">
                    <div class="bp-summary-item">
                        <span style="color:#fbbf24">功率</span>
                        <span class="bp-summary-val" id="header_power">--</span>W
                    </div>
                    <div class="bp-summary-item" id="header_cpu_temp_container">
                    <span style="color:#22d3ee; margin-right: 4px;">CPU</span>
                    <span class="bp-summary-val" id="header_cpu_temp">--.-</span><span style="font-size: 14px;">℃</span>
                  </div>
                </div>

                <span id="bp_no_battery_toggle" title="切换电池管理/无电池模式（点击后面板自动打开并切换到对应内容）">🔋 电池模式</span>
            </div>

            <div class="bp-charge-ctrl-btn" id="bp_open_charge_btn"><span>⚡ 充电管理</span></div>

            <label class="bp-monitor-switch">
                <input type="checkbox" id="bp_collapse_toggle" ${isClosed ? '' : 'checked'}>
                <span class="bp-slider"></span>
            </label>
        </div>

        <div class="bp-body-block ${isClosed ? 'collapsed' : ''}" id="bp_body_main">
           <div class="bp-content-container">
                <div class="bp-layout-grid">
                     <div class="bp-ring-container">
                        <div class="bp-ring-box-inner bp-ring-clickable" id="bp_ring_trigger" title="点击查看电量使用曲线">
                             <svg width="130" height="130" viewBox="0 0 160 160">
                                 <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(245,158,11,.16)" stroke-width="9" />
                                <circle id="battery_ring" cx="80" cy="80" r="70" fill="none" stroke="transparent" stroke-width="9" stroke-dasharray="439.6" stroke-dashoffset="439.6" stroke-linecap="round" transform="rotate(-90 80 80)" />
                                <text id="battery_percent" x="80" y="76" text-anchor="middle" dominant-baseline="middle" font-size="28" fill="#fef3c7" font-weight="800">--%</text>
                                 <text id="battery_time_label" x="80" y="108" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="600" fill="#fbbf24">预估</text>
                                 <text id="battery_time_val" x="80" y="126" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="700" font-family="'JetBrains Mono', monospace" fill="#fef3c7">计算中</text>
                             </svg>
                             <div id="battery_icon_main" style="width:24px; height:24px; position: absolute; top: 26px; left: 50%; transform: translateX(-50%); display:flex; align-items:center; justify-content:center;"></div>
                        </div>
                    </div>

                    <div class="bp-data-grid">
                        <div class="bp-data-card">
                            <div class="bp-data-label">电压 </div>
                            <div id="battery_voltage" class="bp-data-val">--</div>
                        </div>

                        <div class="bp-data-card">
                             <div class="bp-data-label">电流 </div>
                            <div id="battery_current" class="bp-data-val">--</div>
                        </div>

                        <div class="bp-data-card bp-temp-card">
                            <div class="bp-temp-header">
                                <div class="bp-data-label" style="width: auto; margin:0;">功率 </div>
                                <div id="battery_power" class="bp-data-val" style="width: auto; text-align: right; color: #fef3c7;">--</div>
                            </div>
                            <canvas id="power_chart_canvas" style="position: absolute; bottom: 0; left: 0; width: 100%; height: 45px; z-index: 1; pointer-events: none; opacity: 0.85;"></canvas>
                        </div>

                        <div class="bp-data-card bp-temp-card">
                        <div class="bp-temp-header">
                        <div class="bp-data-label" style="width: auto; margin:0;">温度 </div>
                        <div id="battery_temp" class="bp-data-val" style="width: auto; text-align: right; color: #22d3ee;">--</div>
                        </div>
                        <canvas id="temp_chart_canvas" style="position: absolute; bottom: 0; left: 0; width: 100%; height: 45px; z-index: 1; pointer-events: none; opacity: 0.85;"></canvas>
                       </div>
                    </div>
                </div>
             </div>

             <div id="bp_battery_chart_modal" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 17, 24, 0.97); backdrop-filter: blur(10px); z-index: 10; border-radius: 0 0 20px 20px; flex-direction: column; padding: 20px; box-sizing: border-box;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                     <div style="color: #fef3c7; font-weight: bold; font-size: 14px;">🔋 电量使用曲线 (24小时)</div>
                     <div id="bp_close_chart_btn" style="color: #f87171; cursor: pointer; font-size: 26px; line-height: 1; font-weight: normal; padding: 0 10px;">×</div>
                 </div>
                 <div style="flex: 1; position: relative; width: 100%; height: 100%;">
                     <canvas id="level_chart_canvas" style="width: 100%; height: 100%;"></canvas>
                 </div>
             </div>
             </div> </div>

    <!-- 温度监测面板（无电池模式时显示）★ 美化版：青色玻璃拟态 -->
    <div id="TEMP_MONITOR_PANEL" class="bp-temp-panel">
        <div class="bp-temp-header">
            <div class="bp-temp-main-display">
                <div class="bp-temp-label">🌡️ 当前温度</div>
                <div class="bp-temp-value-wrap">
                    <span id="temp_current" class="bp-temp-value">--</span>
                    <span class="bp-temp-unit">°C</span>
                </div>
            </div>
            <div class="bp-temp-status-wrap">
                <div class="bp-temp-status-label">设备状态</div>
                <div id="temp_status_ring" class="bp-temp-status-ring">
                    <div class="bp-temp-status-inner">
                        <span id="temp_status_text">正常</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="bp-temp-grid">
            <div class="bp-temp-card-lg">
                <div class="bp-temp-card-header">
                    <span class="bp-temp-card-title">📈 温度趋势</span>
                    <span class="bp-temp-card-sub">最近 <span id="temp_trend_count">0</span> 次</span>
                </div>
                <div id="temp_trend_chart" class="bp-temp-trend-chart"></div>
            </div>
            <div class="bp-temp-card-sm">
                <div class="bp-temp-card-title">📊 实时数据</div>
                <div class="bp-temp-data-list">
                    <div class="bp-temp-data-row"><span class="bp-temp-data-key">最高</span><span id="temp_max" class="bp-temp-data-val" style="color:#ff6b6b;">--°C</span></div>
                    <div class="bp-temp-data-row"><span class="bp-temp-data-key">平均</span><span id="temp_avg" class="bp-temp-data-val" style="color:#4ecdc4;">--°C</span></div>
                    <div class="bp-temp-data-row"><span class="bp-temp-data-key">趋势</span><span id="temp_trend" class="bp-temp-data-val" style="color:#45b7d1;">--</span></div>
                    <div class="bp-temp-data-row"><span class="bp-temp-data-key">传感器</span><span id="temp_sensors" class="bp-temp-data-val" style="color:#96ceb4;">--</span></div>
                </div>
            </div>
        </div>
        <div class="bp-temp-legend">
            <span style="color:#4CAF50;">正常 &lt;50°C</span>
            <span style="color:#FFC107;">注意 50-70°C</span>
            <span style="color:#FF9800;">警告 70-85°C</span>
            <span style="color:#f44336;">危险 ≥85°C</span>
        </div>
    </div>

    `;

     const container = await waitForElement('.functions-container');
    if (container) {
        container.insertAdjacentHTML("afterend", htmlStructure);
setTimeout(() => {
    const el = document.getElementById('BATTERY_PRO_CONTAINER');
    if(el) {
        el.style.display = '';
        el.classList.add('bp-loaded');
        setTimeout(() => {
             el.classList.remove('bp-preload');
        }, 20);
    }
}, 15);

// 【布局强制矫正 v2.2】内联 !important 样式优先级高于任何 <style> 规则（包括残留的旧版绝对定位 CSS），
// 确保 header 必为 flex 流内布局、两个按钮必为流内元素——流内元素物理上不可能重叠。
// 在注入后 30ms / 800ms 各执行一次，覆盖初始化竞态和后续动态修改。
(function _bpForceLayout(){
    // 用 cssText 追加内联 !important 样式（老 WebView 兼容性最好），
    // 优先级高于任何 <style> 规则（包括残留的旧版绝对定位 CSS）——流内元素物理上不可能重叠
    var fix = function(el, css){
        if (!el) return;
        try {
            if (el.getAttribute('data-bp-fix') !== '1') {
                el.style.cssText = el.style.cssText + ';' + css;
                el.setAttribute('data-bp-fix', '1');
            }
        } catch(e) {}
    };
    var force = function(){
        try {
            var h = document.getElementById('bp_header');
            var row = document.querySelector('.bp-header-row-actions');
            var ch = document.getElementById('bp_open_charge_btn');
            var nb = document.getElementById('bp_no_battery_toggle');
            var logo = document.querySelector('.bp-logo-area');
            var sw = document.querySelector('.bp-monitor-switch');
            // header 与中间弹性区：flex 流内布局
            fix(h, 'display:flex !important;align-items:center !important;gap:10px !important');
            fix(row, 'flex:1 1 0 !important;min-width:0 !important;display:flex !important;' +
                     'justify-content:center !important;align-items:center !important;gap:10px !important;' +
                     'position:static !important;left:auto !important;right:auto !important;' +
                     'top:auto !important;transform:none !important');
            // 充电管理按钮：流内、贴右侧
            fix(ch, 'position:static !important;right:auto !important;top:auto !important;' +
                    'left:auto !important;transform:none !important;flex-shrink:0 !important;' +
                    'opacity:1 !important;pointer-events:auto !important');
            // 无电池模式按钮：流内、在中间弹性区居中
            fix(nb, 'position:static !important;left:auto !important;top:auto !important;' +
                    'right:auto !important;transform:none !important;flex-shrink:0 !important;' +
                    'margin-left:0 !important;margin-right:0 !important');
            fix(logo, 'flex-shrink:0 !important');
            fix(sw, 'flex-shrink:0 !important');
        } catch(e) {}
    };
    force();                    // 立即同步执行（DOM 已注入，不依赖定时器）
    setTimeout(force, 30);      // 兜底：等布局稳定后再校准一次
    setTimeout(force, 800);
})();
    } else {
        console.error("BATTERY_PRO: 超时未找到挂载点 .functions-container，插件停止加载");
    }

  
    // ==========================================
    // 模块一：充电控制器 
    // ==========================================
    const CONFIG_FILE = "/sdcard/kano_charge_control_config.conf"
    const SH_FILE = "/sdcard/kano_charge_control.sh"
    const LOG_FILE = "/sdcard/kano_charge_control_log.log"
    const BOOT_SH_FILE = "/sdcard/ufi_tools_boot.sh"
    const NAME = "kano_charge_control"
    
    let CONFIG = { enabled: false, max_charge: 80, start_charge: 1 }

    // 原版 Shell 脚本
    const SCRIPT_CONTENT = `#!/system/bin/sh
CONFIG_FILE="${CONFIG_FILE}"
LOG_FILE="${LOG_FILE}"
CHECK_INTERVAL=10

CHARGE_PATHS=(
  "/sys/class/power_supply/interface/battery_charging_enabled"
  "/sys/class/zte_power_supply/zte_battery/battery_charging_enabled"
  "/sys/class/power_supply/battery/battery_charging_enabled"
)

BATTERY_STATUS_PATH="/sys/class/power_supply/battery/status"
CAPACITY_PATH="/sys/class/power_supply/battery/capacity"

rm -rf "$LOG_FILE"

is_magisk_env() {
    [ -d /sbin/.magisk ] || command -v magisk >/dev/null
}

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
    # 头部保留3行(含新增提示)，尾部保留10行，总共13行
    # 如果总行数超过 13 行，触发拼接裁剪
    if [ "$(wc -l < "$LOG_FILE")" -gt 13 ]; then
        (head -n 3 "$LOG_FILE"; tail -n 10 "$LOG_FILE") > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    fi
}

get_current_switch_state() {
    for path in "\${CHARGE_PATHS[@]}"; do
        if [ -r "$path" ]; then
            state=$(cat "$path" 2>/dev/null)
            if [ "$state" = "0" ] || [ "$state" = "1" ]; then
                echo "$state"
                return
            fi
        fi
    done
    echo "-1"
}

get_physical_charging_status() {
    if [ -r "$BATTERY_STATUS_PATH" ]; then
        status=$(cat "$BATTERY_STATUS_PATH" 2>/dev/null)
        case "$status" in
            "Charging"|"Full") echo "1" ;;
            "Discharging") echo "0" ;;
            *) echo "-1" ;;
        esac
    else
        echo "-1"
    fi
}

apply_switch_state() {
    target="$1"
    for path in "\${CHARGE_PATHS[@]}"; do
        if [ -w "$path" ]; then
            echo "$target" > "$path"
            sleep 0.1
            if [ "$(cat "$path" 2>/dev/null)" = "$target" ]; then
                log "充电开关已设置为 $target"
                return
            fi
        fi
    done
    log "未能成功设置充电开关为 $target"
}

handle_charging_logic() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log "配置文件不存在：$CONFIG_FILE"
        return
    fi

    MAX_CHARGE=$(grep '^max_charge=' "$CONFIG_FILE" | cut -d= -f2)
    START_CHARGE=$(grep '^start_charge=' "$CONFIG_FILE" | cut -d= -f2)

    if [ -z "$MAX_CHARGE" ] || [ -z "$START_CHARGE" ]; then
        log "配置文件格式错误"
        return
    fi

    if [ ! -f "$CAPACITY_PATH" ]; then
        log "无法读取电池容量"
        return
    fi

    CAPACITY=$(cat "$CAPACITY_PATH")
    CURRENT_SWITCH_STATE=$(get_current_switch_state)
    CURRENT_PHYSICAL_CHARGING=$(get_physical_charging_status)

    TARGET_SWITCH_STATE=$CURRENT_SWITCH_STATE

    if [ "$CAPACITY" -ge "$MAX_CHARGE" ]; then
        TARGET_SWITCH_STATE=0
    elif [ "$CAPACITY" -ge "$START_CHARGE" ] && [ "$CAPACITY" -lt "$MAX_CHARGE" ]; then
        TARGET_SWITCH_STATE=1
    else
        TARGET_SWITCH_STATE=$CURRENT_SWITCH_STATE
    fi

    if [ "$LAST_PHYSICAL_CHARGING" = "0" ] && [ "$CURRENT_PHYSICAL_CHARGING" = "1" ]; then
        log "检测到插入充电器，电量 $CAPACITY%"
        if [ "$CAPACITY" -gt "$START_CHARGE" ] && [ "$CAPACITY" -lt "$MAX_CHARGE" ]; then
            TARGET_SWITCH_STATE=1
        fi
    fi

    if [ "$TARGET_SWITCH_STATE" != "$CURRENT_SWITCH_STATE" ] && [ "$TARGET_SWITCH_STATE" != "-1" ]; then
        if [ "$TARGET_SWITCH_STATE" = "0" ]; then
            if [ "$CAPACITY" -ge "$MAX_CHARGE" ]; then
                REASON="电量 $CAPACITY% >= 最大 $MAX_CHARGE%，强制关闭充电"
            else
                REASON="其他原因触发关闭充电"
            fi
            log "准备关闭充电：$REASON"
        else
            if [ "$CAPACITY" -ge "$START_CHARGE" ] && [ "$CAPACITY" -lt "$MAX_CHARGE" ]; then
                REASON="电量 $CAPACITY% 在区间 $START_CHARGE%~$MAX_CHARGE%，强制开启充电"
            else
                REASON="其他原因触发开启充电"
            fi
            log "准备开启充电：$REASON"
        fi
        apply_switch_state "$TARGET_SWITCH_STATE"
    fi

    LAST_PHYSICAL_CHARGING=$CURRENT_PHYSICAL_CHARGING
}

LAST_PHYSICAL_CHARGING=$(get_physical_charging_status)
log "充电控制脚本启动..."

inotify_callback() {
    log "检测到充电状态文件变化"
    handle_charging_logic
}

TMP_DIR="/data/local/tmp"
FIFO="$TMP_DIR/inotify_pipe"
rm -f "$FIFO"
mkfifo "$FIFO"

if is_magisk_env; then
    log "检测到 Magisk 环境,正常启动"
    inotifyd /system/bin/sh -c "echo event >> $FIFO" "$BATTERY_STATUS_PATH:m" &
else
    log "非 Magisk 环境,正常启动"
    inotifyd "$FIFO":"$BATTERY_STATUS_PATH" &
fi

# 第3行固定提示，永远保留
log "日志文件仅保留最近10行"

(
    while read -r event; do
        inotify_callback
    done < "$FIFO"
) &

while true; do
    handle_charging_logic
    sleep "$CHECK_INTERVAL"
done`

    // 原版弹窗 HTML
    const charge_html = `
<div class="title" style="justify-content:space-between">
    <span>充电控制器</span>
    <button onclick="showHelp()" style="border-radius: 50%">?</button>
    </div>
<div class="content" style="max-height: 90%;font-size:14px;overflow-y: scroll; padding-top: 10px;">
    <span>自动模式</span>
    <div style="margin-top: 8px;display: inline-block;" id="collapse_charge_plugin_btn"></div>
    <button style="margin-left: 6px;" onclick="disable_charge()">直供电开</button>
    <button onclick="enable_charge()">直供电关</button>
    <div id="collapse_charge_plugin" class="collapse" data-name="close" style="height: 0px; overflow: auto;">
        <div class="collapse_box" style="overflow:hidden">
            <div style="margin: 10px 0;display:flex;justify-content:space-between;align-items:center">
                <span style="min-width: 6em;">停止充电(%):</span><input id="stop_charge_val" style="flex:1;width:100%" type="range" id="charge-threshold" min="1" max="100" value="20"><span id="stop_charge_label" style="min-width: 4em">20 %</span>
            </div>
           
            <div style="display:flex;gap:10px;margin-bottom:10px">
                <button onclick="submit_charge_settings()" style="flex:1" data-i18n="submit_btn">提交</button>
            </div>
            
            <div style="box-sizing:border-box">
                <div class="title" style="font-size:14px;margin-bottom:10px">日志</div>
            
    <textarea id="charger_log" disabled style="margin-bottom:10px;border:none;box-sizing:border-box;width:100%;min-height:100px"></textarea>
            </div>
        </div>
    </div>
</div>
<div class="btn" style="text-align: right;margin-top:6px;">
    <button type="button" onclick="close_charge_settings()" data-i18n="close_btn">关闭</button>
</div>
`

    // --- 充电控制器逻辑 ---
    // 安全获取 runShellWithRoot

    const runShellSafe = typeof runShellWithRoot !== 'undefined' ? runShellWithRoot : async () => ({ content: '' });
    const checkRoot = async () => {
        try {
            const res = await runShellSafe('whoami');
            return res.success && res.content.includes('root');
        } catch { return false; }
    };
    const uploadFile = async (filename, content, destPath) => {
        try {
            const file = new File([content], filename, { type: "text/plain" });
            const formData = new FormData();
            formData.append("file", file);
            // 【网络优化】添加10秒超时控制，防止fetch挂起导致内存泄漏
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const uploadRes = await (await fetch(`${KANO_baseURL}/upload_img`, {
                method: "POST", headers: common_headers, body: formData, signal: controller.signal,
            })).json();
            clearTimeout(timeoutId);
            if (uploadRes.url) {
                const tempPath = `/data/data/com.minikano.f50_sms/files${uploadRes.url}`;
                const moveRes = await runShellSafe(`mv ${tempPath} ${destPath}`);
                return moveRes.success;
            } else { return false;
            }
        } catch (e) { return false; }
    };
    // 写入逻辑
    const toggleCharge = async (enableCharge) => {
        try {
            const flag = enableCharge ? "1" : "0";
            const res = await runShellSafe(`
                echo ${flag} > /sys/class/power_supply/interface/battery_charging_enabled
                echo ${flag} > /sys/class/zte_power_supply/zte_battery/battery_charging_enabled
                echo ${flag} > /sys/class/power_supply/battery/battery_charging_enabled
            `);
            return res.success;
        } catch (e) { return false; }
    };
    const getConfig = async () => {
        if (!(await checkRoot())) return false;
        const res = await runShellSafe(`timeout 2s  awk \'{print}\' ${CONFIG_FILE}`);
        const res1 = await runShellSafe(`timeout 2s  awk \'{print}\' ${BOOT_SH_FILE}`);
        if (res.success) {
            const configText = res.content
            const maxMatch = configText.match(/max_charge=(\d+)/);
            const startMatch = configText.match(/start_charge=(\d+)/);
            if (maxMatch) CONFIG.max_charge = parseInt(maxMatch[1], 10);
            if (startMatch) CONFIG.start_charge = parseInt(startMatch[1], 10);
      // 强制保护：开始充电值绝对不能大于等于停止充电值
            if (CONFIG.start_charge >= CONFIG.max_charge) {
                CONFIG.start_charge = Math.max(1, CONFIG.max_charge - 10);
            }
        }
        if (res1) {
            let enabled = res1.content.includes(NAME)
            CONFIG.enabled = enabled
            localStorage.setItem('collapse_charge_plugin', enabled ? 'open' : 'close')
        }
    }

    let oldLog = null
    const getLog = async () => {
        if (!(await checkRoot())) return false;
        const charger_log = document.querySelector('#charger_log')
        if (charger_log) {
            let res = await runShellSafe(`timeout 2s  awk \'{print}\' ${LOG_FILE}`);
            if ((res.content != oldLog) || (oldLog == null)) {
                setTimeout(() => {
                    charger_log.scrollTo({ top: charger_log.scrollHeight, behavior: "smooth" })
                }, 100);
            }
            oldLog = res.content
            charger_log.value = res.content
        }
    }

    const killProcessByName = async (processName) => {
        const psResult = await runShellSafe(`ps -ef | grep "${processName}" | grep -v grep`);
        const lines = psResult.content.trim().split('\n');
        
        if (lines.length > 0 && lines[0].trim() !== '') {
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[1]; // 提取 PID
                if (pid && /^\d+$/.test(pid)) {
                    await runShellSafe(`kill -9 ${pid}`);
                }
            }
        }
        
        const inotifyResult = await runShellSafe(`ps -ef | grep "inotify_pipe" | grep -v grep`);
        const inotifyLines = inotifyResult.content.trim().split('\n');
        if (inotifyLines.length > 0 && inotifyLines[0].trim() !== '') {
            for (const line of inotifyLines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[1];
                if (pid && /^\d+$/.test(pid)) {
                    await runShellSafe(`kill -9 ${pid}`);
                }
            }
        }
        
        return { success: true };
    };

    const setRange = async () => {
        if (!(await checkRoot())) return createToast("未root", "red");
        await runShellSafe(`timeout 2s  echo "max_charge=${CONFIG.max_charge}\nstart_charge=${CONFIG.start_charge}" > ${CONFIG_FILE}`);
        await killProcessByName(NAME)
        await runShellSafe(`/system/bin/sh ${SH_FILE} &`)
        createToast("设置成功，等待日志刷新...")
    }

    const uninstall = async () => {
        if (!(await checkRoot())) return createToast("未root", "red");
        await runShellSafe(`sed -i '/kano_charge_control/d' /sdcard/ufi_tools_boot.sh`)
        await runShellSafe(`rm -rf ${CONFIG_FILE} ${SH_FILE} ${LOG_FILE}`)
        await killProcessByName(NAME)
        createToast("恢复充电模式...")
        await toggleCharge(true)
        createToast("脚本已停用")
    }

    const install = async () => {
        if (!(await checkRoot())) return createToast("未root", "red");
        if (!await uploadFile("kano_charge_control.sh", SCRIPT_CONTENT, SH_FILE)) return createToast("文件失败", "red");
        await runShellSafe(`grep -qxF '/system/bin/sh ${SH_FILE} &' /sdcard/ufi_tools_boot.sh || echo '/system/bin/sh ${SH_FILE} &' >> /sdcard/ufi_tools_boot.sh`)
        await runShellSafe(`/system/bin/sh ${SH_FILE} &`)
        return createToast("已启用并设为自启动")
    }

    // ==============================================
    // 界面操作逻辑
    // ==============================================
    window.submit_charge_settings = async () => {
        const stop_charge_val = document.querySelector('#stop_charge_val');
        if (stop_charge_val) CONFIG.max_charge = stop_charge_val.value;
        
        if (Number(CONFIG.max_charge) <= Number(CONFIG.start_charge)) return createToast("触发充电值必须大于1%", 'red');
    await setRange()
    
        if (typeof pluginState !== 'undefined') {
            pluginState.lastStatus = "FORCE_UPDATE";
            pluginState.statusStartTime = Date.now(); // 开启“3秒空余+5秒检测”
            pluginState.smoothedCurrent = null;
            pluginState.cachedTimeLabel = Number(CONFIG.max_charge) < 100 ? `距${CONFIG.max_charge}%预计` : "充满预计";
            pluginState.cachedTimeVal = "计算中";
            
            const L = document.getElementById('battery_time_label');
            const V = document.getElementById('battery_time_val');
            if (L) L.textContent = pluginState.cachedTimeLabel;
            if (V) V.textContent = pluginState.cachedTimeVal;
        }
        
        await setRange();
        setTimeout(() => { if(typeof fetchBatteryInfo === 'function') fetchBatteryInfo(); }, 200);
    }

// 启用充电（直供电关）
    window.enable_charge = async () => {
        if(CONFIG.enabled) return createToast("请先关闭自动模式", "red");
        
        // UI秒切
        if (typeof pluginState !== 'undefined') {
            pluginState.lastStatus = "FORCE_UPDATE";
            pluginState.statusStartTime = Date.now();
            pluginState.smoothedCurrent = null;
            pluginState.cachedTimeLabel = "预估";
            pluginState.cachedTimeVal = "计算中";
            const L = document.getElementById('battery_time_label');
            const V = document.getElementById('battery_time_val');
            if(L) L.textContent = pluginState.cachedTimeLabel;
            if(V) V.textContent = pluginState.cachedTimeVal;
        }
        
        await toggleCharge(true); 
        createToast("设置成功");
        setTimeout(() => { if(typeof fetchBatteryInfo === 'function') fetchBatteryInfo(); }, 200);
    }
    
    // 禁用充电（直供电开）
    window.disable_charge = async () => {
        if(CONFIG.enabled) return createToast("请先关闭自动模式", "red");
        
        if (typeof pluginState !== 'undefined') {
            pluginState.lastStatus = "FORCE_UPDATE";
            pluginState.statusStartTime = Date.now();
            pluginState.smoothedCurrent = null;
            pluginState.cachedTimeLabel = "当前";
            pluginState.cachedTimeVal = "直供电中";
            const L = document.getElementById('battery_time_label');
            const V = document.getElementById('battery_time_val');
            if(L) L.textContent = pluginState.cachedTimeLabel;
            if(V) V.textContent = pluginState.cachedTimeVal;
        }
        
        await toggleCharge(false); 
        createToast("设置成功");
        setTimeout(() => { if(typeof fetchBatteryInfo === 'function') fetchBatteryInfo(); }, 200);
    }

    const initWindow = async () => {
        const stop_charge_val = document.querySelector('#stop_charge_val')
        if (stop_charge_val) {
            const stop_charge_label = document.querySelector('#stop_charge_label')
            stop_charge_label.innerHTML = CONFIG.max_charge + " %"
            stop_charge_val.value = CONFIG.max_charge
            stop_charge_val.oninput = (e) => {
                const target = e.target
                stop_charge_label.innerHTML = target.value + " %"
                CONFIG.max_charge = target.value
            }
        }
    }

    const el = document.createElement('div')
    el.id = "charge_plugin"
    el.classList.add('modal')
    el.style.opacity = "1"
    el.style.maxWidth = "400px"
    el.style.width = '90%'
    el.style.display = "none"
    el.innerHTML = charge_html
    const modalContainer = document.querySelector('.container') || document.body;
    modalContainer.appendChild(el);

    await getConfig()
    initWindow()

    collapseGen('#collapse_charge_plugin_btn', '#collapse_charge_plugin', 'collapse_charge_plugin', async (status) => {
        if (status == "open") {
            createToast("开启中..")
            await setRange()
            await install()
            CONFIG.enabled = true
        } else {
            createToast("关闭中..")
            await uninstall()
            CONFIG.enabled = false
        }
    })

    

    let timer = null
    const openChargeSettings = async () => {
        showModal("#charge_plugin")
        timer && timer()
        getLog()
        timer = requestInterval(getLog, 2000)
        await getConfig()
        initWindow()
    }

    window.close_charge_settings = () => {
        timer && timer()
        closeModal('#charge_plugin')
    }

    window.showHelp = () => {
        const message = `安装并配置充电百分比后，插件会自动管理充电
              当电量在低于设定值时自动开启充电，达到设定值上限会自动关闭充电
            插入充电器时，若电量在设定值以下时也会自动开启充电。
            所有操作均有日志记录，无需用户手动干预，保证电池健康和充电安全。
            您也可以将“禁用充电”视为直供电模式，此时充电电流为0
            `.replaceAll('\n', "<br>")
        const { el, close } = createFixedToast('kano_help_message', `
                    <div style="pointer-events:all;width:80vw;max-width:300px">
                        <div class="title" style="margin:0" data-i18n="system_notice">使用说明</div>
                        <div style="margin:10px 0">${message}</div>
                        <div style="text-align:right">
                             <button style="font-size:.64rem" id="close_message_btn" data-i18n="pay_btn_dismiss">${t('pay_btn_dismiss')}</button>
                        </div>
                    </div>
                    `)
        const btn = el.querySelector('#close_message_btn')
        if (!btn) { close(); return }
        btn.onclick = async () => { close() }
    }


    // ==========================================
    // 模块二：电池监控 V2.0 (UI 逻辑)
    // ==========================================
    
    const PLUGIN_CONFIG = {
        BATTERY_PATHS: {
            CAPACITY: "/sys/class/power_supply/battery/capacity",
            STATUS: "/sys/class/power_supply/battery/status",
            HEALTH: "/sys/class/power_supply/battery/health",
            TEMP: "/sys/class/power_supply/battery/temp",
            VOLTAGE: "/sys/class/power_supply/battery/voltage_now",
            CURRENT: "/sys/class/power_supply/battery/current_now",
            CHARGE_FULL: "/sys/class/power_supply/battery/charge_full",
            CHARGE_FULL_DESIGN: "/sys/class/power_supply/battery/charge_full_design"
        },
        STATUS_MAP: {
            "Charging": {text: "充电中", color: "#50fa7b"},
            "Discharging": {text: "放电中", color: "#ffb86c"},
             "Full": {text: "已充满", color: "#8be9fd"},
            "Not charging": {text: "未充电", color: "#6272a4"},
            "Unknown": {text: "未知", color: "#bd93f9"}
        },
        HEALTH_MAP: {
            "Good": "良好", "Overheat": "过热", "Dead": "损坏",
            "Over voltage": "过压", "Cold": "过冷", "Unknown": "未知"
        },
        VOLTAGE_CURRENT_UPDATE_INTERVAL: 1000,
        FULL_UPDATE_INTERVAL: 3000,
        RING_CIRCUMFERENCE: 439.6
    };
    const ICONS = {
        BOLT: `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z"></path></svg>`,
        BATTERY: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><rect x="2" y="7" width="16" height="10" rx="2" ry="2"></rect><line x1="22" y1="11" x2="22" y2="13"></line></svg>`
    };
    const pluginState = {
        monitoring: false,
        updateTimer: null,
        voltageCurrentTimer: null,
        initTime: Date.now(),         // 记录网页刚打开的时间
        smoothedCurrent: null,     // 存储平滑处理后的电流
        lastStatus: "",       
        lastTimeCalc: 0,      
        cachedTimeLabel: "预估", 
        cachedTimeVal: "计算中", 
        cachedTimeColor: "#bd93f9",
        batteryData: {
            level: 0, status: "Unknown", health: "Unknown", temperature: 0,
            voltage: 0, current: 0, chargeFull: 0, chargeFullDesign: 0,
            chargingEnabled: "1" 
        },
       history: { time: [], temp: [], level: [], power: [] }
    };

    const getElement = (id) => document.getElementById(id);
    // 基于绝对时间戳的提取器
    const getChartData = (dataArr, timeArr, hours, maxPoints) => {
        if (!dataArr || !timeArr || dataArr.length === 0) return { data: [], time: [] };
        const cutoff = Date.now() - hours * 3600 * 1000;
        const bucketSize = (hours * 3600 * 1000) / maxPoints; 
        
        const resData = [], resTime = [];
        let lastBucket = -1;

        for (let i = 0; i < timeArr.length; i++) {
            if (timeArr[i] >= cutoff) {
                const currentBucket = Math.floor(timeArr[i] / bucketSize);
                
                if (currentBucket !== lastBucket || i === timeArr.length - 1) {
                    resData.push(dataArr[i]);
                    resTime.push(timeArr[i]);
                    lastBucket = currentBucket;
                }
            }
        }
        
        if (resData.length === 0) return { data: dataArr.slice(-1), time: timeArr.slice(-1) };
        return { data: resData, time: resTime };
    };

    // 基础画图函数
    const drawChart = (canvasId, dataArray, currentColorHex, isFill, showLabels = false, animProgress = 1, timeArray = null) => {
        const canvas = getElement(canvasId);
        if (!canvas || !dataArray || dataArray.length < 2) return;
        
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const w = rect.width, h = rect.height;
        ctx.clearRect(0, 0, w, h);

        if (animProgress < 1) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w * animProgress, h);
            ctx.clip();
        }

        let max = Math.max(...dataArray), min = Math.min(...dataArray);
        if (max === min) { max += 1; min -= 1; }

        if (canvasId === 'power_chart_canvas') {
            let actualMax = Math.max(max, 0.5);
            let actualMin = Math.min(min, -0.5);
            const largest = Math.max(actualMax, Math.abs(actualMin) * 2);
            max = largest;
            min = -largest / 2;
        }

        const padTop = h * 0.2, padBottom = h * 0.2, usableH = h - padTop - padBottom, range = max - min, stepX = w / (dataArray.length - 1);
        const getY = (val) => h - padBottom - ((val - min) / range) * usableH;
        const getOff = (val) => Math.max(0, Math.min(1, getY(val) / h));

        ctx.beginPath();
        const isSmooth = (canvasId === 'temp_chart_canvas' || canvasId === 'power_chart_canvas');
        if (isSmooth && dataArray.length > 2) {
            const pts = dataArray.map((val, i) => ({ x: i * stepX, y: getY(val) }));
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 2; i++) {
                const xc = (pts[i].x + pts[i + 1].x) / 2;
                const yc = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            ctx.quadraticCurveTo(pts[pts.length - 2].x, pts[pts.length - 2].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
        } else {
            dataArray.forEach((val, i) => {
                const x = i * stepX, y = getY(val);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
        }
        
        let lineStyle = currentColorHex;
        if (canvasId === 'temp_chart_canvas') {
            lineStyle = ctx.createLinearGradient(0, 0, 0, h);
            lineStyle.addColorStop(0, '#ff5555'); lineStyle.addColorStop(getOff(45), '#ff5555');
            lineStyle.addColorStop(getOff(45), '#ffb86c'); lineStyle.addColorStop(getOff(35), '#ffb86c');
            lineStyle.addColorStop(getOff(35), '#50fa7b'); lineStyle.addColorStop(1, '#50fa7b');
        } 

        ctx.strokeStyle = lineStyle; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

        if (isFill) {
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
            const gradFill = ctx.createLinearGradient(0, 0, 0, h);
            const hexToRgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;
            try {
                if (canvasId === 'temp_chart_canvas') {
                    gradFill.addColorStop(0, hexToRgba('#50fa7b', 0.35));
                    gradFill.addColorStop(1, hexToRgba('#50fa7b', 0.05));
                } else {
                    gradFill.addColorStop(0, hexToRgba(currentColorHex, 0.5));
                    gradFill.addColorStop(1, hexToRgba(currentColorHex, 0));
                }
                ctx.fillStyle = gradFill;
                ctx.fill();
            } catch(e) {}
        }
        
        if (canvasId === 'power_chart_canvas') {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'; 
            ctx.setLineDash([2, 2]); 
            const y0 = getY(0); 
            ctx.moveTo(0, y0); ctx.lineTo(w, y0); ctx.stroke();
            ctx.setLineDash([]);
        }

        if (showLabels) {
            const isMobile = window.innerWidth <= 768;
            const fontSize = isMobile ? 10 : 11;
            ctx.font = `${fontSize}px 'JetBrains Mono', sans-serif`;
            let midnightX = -1;
            
            const times = timeArray || pluginState.history.time;
            if (canvasId === 'level_chart_canvas' && times && times.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255,255,255,0.2)'; 
                ctx.setLineDash([4, 4]); 
                for (let i = 1; i < times.length; i++) {
                    const dPrev = new Date(times[i - 1]);
                    const dCurr = new Date(times[i]);
                    if (dPrev.getDate() !== dCurr.getDate()) {
                        const xPos = i * stepX;
                        midnightX = xPos; 
                        ctx.moveTo(xPos, 33);
                        ctx.lineTo(xPos, h - 35);
                    }
                }
                ctx.stroke();
                ctx.setLineDash([]); 
            }

            if (canvasId === 'level_chart_canvas' && dataArray.length > 1) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;

                const drawnX = [];
                const drawTimeIfSpace = (text, align, renderX) => {
                    for (let dx of drawnX) {
                        if (Math.abs(renderX - dx) < 35) return;
                    }
                    ctx.textAlign = align;
                    ctx.fillText(text, renderX, h - 16);
                    drawnX.push(renderX);
                };

                if (times && times[dataArray.length - 1]) {
                    const dEnd = new Date(times[dataArray.length - 1]);
                    const hhEnd = String(dEnd.getHours()).padStart(2, '0');
                    const mmEnd = String(dEnd.getMinutes()).padStart(2, '0');
                    drawTimeIfSpace(`${hhEnd}:${mmEnd}`, 'right', w - 5);
                }

                if (midnightX !== -1 && midnightX > 35) {
                    drawTimeIfSpace("00:00", 'center', midnightX);
                }

                const segments = dataArray.length < 5 ? 1 : 4;
                for (let i = 1; i < segments; i++) {
                    const xPos = i * (w / segments);
                    const dataIdx = Math.floor(i * (dataArray.length - 1) / segments);
                    if (times && times[dataIdx]) {
                        const d = new Date(times[dataIdx]);
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        drawTimeIfSpace(`${hh}:${mm}`, 'center', xPos);
                    }
                }
            }

            ctx.fillStyle ='#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top'; 
            ctx.fillText(`最高: ${max.toFixed(0)}`, 5, 5); 
            
            ctx.textBaseline = 'bottom'; 
            ctx.fillText(`最低: ${min.toFixed(0)}`, 5, h - 16);
            const current = dataArray[dataArray.length - 1];
            ctx.fillStyle = currentColorHex; 
            ctx.textAlign = 'right'; 
            ctx.textBaseline = 'middle';
            let yCurrent = getY(current);
            if (yCurrent < 15) yCurrent = 15; 
            if (yCurrent > h - 15) yCurrent = h - 15;
            ctx.fillText(`当前: ${current.toFixed(0)}`, w - 5, yCurrent - 10);
        }
        if (animProgress < 1) ctx.restore();
    };

    // 动效引擎（支持透传时间数组）
    const animateChart = (canvasId, dataArray, currentColorHex, isFill, showLabels = false, timeArray = null) => {
        let start = null;
        const duration = 500; 
        const step = (timestamp) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            drawChart(canvasId, dataArray, currentColorHex, isFill, showLabels, easeProgress, timeArray);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };
    const checkRootAccess = async () => {
        try {
            const res = await runShellWithRoot('whoami');
            if (res && res.content && res.content.includes('root')) return true;
        } catch {}
        createToast("需要开启高级功能才能使用此插件", 'red');
        return false;
    };
    
    const getBatteryColor = (level) => {
        if (level <= 10) return "#ff5555";
        if (level <= 20) return "#ffb86c";
        if (level <= 40) return "#f1fa8c";
        if (level <= 80) return "#8be9fd";
        return "#50fa7b";
    };

    const getTemperatureColor = (tempC) => {
        if (tempC <= 35) return "#50fa7b";
        if (tempC <= 45) return "#ffb86c";
        return "#ff5555";
    };

    const safeCheck = () => {
        if (!document.getElementById('BATTERY_PRO_CONTAINER')) {
            clearInterval(pluginState.updateTimer);
            clearInterval(pluginState.voltageCurrentTimer);
            pluginState.monitoring = false;
            return false;
        }
        return true;
    };

    const updateCpuTempDisplay = () => {
        if (!safeCheck()) return;
        
        const cpuTempEl = getElement('header_cpu_temp');

        if (cpuTempEl) {
            if (window.UFI_DATA && typeof window.UFI_DATA.cpu_temp !== 'undefined') {
                const cpuTemp = window.UFI_DATA.cpu_temp / 1000;
                cpuTempEl.textContent = cpuTemp.toFixed(1); 
                
                let tempColor = "#50fa7b"; // 默认绿色（45度及以下）
                if (cpuTemp > 55) {
                    tempColor = "#ff5555"; // 55度以上：红色
                } else if (cpuTemp > 45) {
                    tempColor = "#ffb86c"; // 45度到55度之间：橙色
                }
                
                cpuTempEl.style.color = tempColor; // 只有数字变色
            } else {
                cpuTempEl.textContent = "--.-";
                cpuTempEl.style.color = "rgba(255,255,255,0.6)"; 
            }
        }
    };
// 一次性打包读取，增加柔性容错防卡死
    const fetchBatteryInfo = async () => {
        if (!safeCheck()) return;
        const p = PLUGIN_CONFIG.BATTERY_PATHS;
        // ★ 读取优先级修正：标准 power_supply 节点优先（与系统电量一致），zte 私有节点兜底。
        //   原逻辑 zte 节点优先，zte 节点在部分固件上存在但数值陈旧/不刷新，导致面板数据与系统电量对不上。
        const cmd = `awk '{print}' ${p.CAPACITY} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/capacity 2>/dev/null || echo "KEEP"; awk '{print}' ${p.STATUS} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/status 2>/dev/null || echo "KEEP"; awk '{print}' ${p.HEALTH} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/health 2>/dev/null || echo "KEEP"; awk '{print}' ${p.TEMP} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/temp 2>/dev/null || echo "KEEP"; awk '{print}' ${p.CHARGE_FULL} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/charge_full 2>/dev/null || echo "KEEP"; awk '{print}' ${p.CHARGE_FULL_DESIGN} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/charge_full_design 2>/dev/null || echo "KEEP"; if [ -f "/sys/class/power_supply/battery/battery_charging_enabled" ]; then awk '{print}' /sys/class/power_supply/battery/battery_charging_enabled || echo "KEEP"; elif [ -f "/sys/class/power_supply/interface/battery_charging_enabled" ]; then awk '{print}' /sys/class/power_supply/interface/battery_charging_enabled || echo "KEEP"; elif [ -f "/sys/class/zte_power_supply/zte_battery/battery_charging_enabled" ]; then awk '{print}' /sys/class/zte_power_supply/zte_battery/battery_charging_enabled || echo "KEEP"; else echo "KEEP"; fi`;
        
        try {
            const res = await runShellWithRoot(cmd);
            if (res && res.success) {
                const lines = res.content.trim().split('\n');
                const getSafeValue = (index, fallback) => {
                    if (lines[index] !== undefined && lines[index] !== "KEEP" && lines[index] !== "") {
                        return lines[index].trim();
                    }
                    return fallback;
                };

                const capacity = getSafeValue(0, pluginState.batteryData.level);
                const status = getSafeValue(1, pluginState.batteryData.status);
                const health = getSafeValue(2, pluginState.batteryData.health);
                const temp = getSafeValue(3, pluginState.batteryData.temperature);
                const chargeFull = getSafeValue(4, pluginState.batteryData.chargeFull);
                const chargeFullDesign = getSafeValue(5, pluginState.batteryData.chargeFullDesign);
                const chargingEnabled = getSafeValue(6, pluginState.batteryData.chargingEnabled);

                // ★ 数值合法性校验：超出物理范围的数据视为无效，保留上一次值。
                //   同时修复「parseInt(x) || 旧值」会把真实的 0（如 0% 电量）误判为读取失败的 bug。
                const _num = (v, old, min, max) => {
                    const n = parseInt(v);
                    return (isNaN(n) || n < min || n > max) ? old : n;
                };
                pluginState.batteryData = {
                    ...pluginState.batteryData,
                    level: _num(capacity, pluginState.batteryData.level, 0, 100),
                    status: status in PLUGIN_CONFIG.STATUS_MAP ? status : "Unknown",
                    health: health in PLUGIN_CONFIG.HEALTH_MAP ? health : "Unknown",
                    temperature: _num(temp, pluginState.batteryData.temperature, -200, 1000),
                    chargeFull: _num(chargeFull, pluginState.batteryData.chargeFull, 0, 100000000),
                    chargeFullDesign: _num(chargeFullDesign, pluginState.batteryData.chargeFullDesign, 0, 100000000),
                    chargingEnabled: chargingEnabled
                };
                
                updateBatteryDisplay(); 
            }
        } catch (e) {
            console.error("Batch read failed", e);
        }
    };
const fetchVoltageCurrentInfo = async () => {
    if (!safeCheck()) return;
    const p = PLUGIN_CONFIG.BATTERY_PATHS;
    
   // ★ 标准节点优先（zte 私有节点兜底），与面板其他字段的读取来源保持一致
   const cmd = `awk '{print}' ${p.VOLTAGE} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/voltage_now 2>/dev/null || echo "0"; awk '{print}' ${p.CURRENT} 2>/dev/null || awk '{print}' /sys/class/zte_power_supply/zte_battery/current_now 2>/dev/null || echo "0"`;

    try {
        const res = await runShellWithRoot(cmd);
        if (res && res.success) {
             const lines = res.content.trim().split('\n');
             if(lines.length < 2) return;

             const [voltage, current] = lines.map(l => l.trim());

             // 保留符号信息（放电为负），单位自适应在显示层统一处理
             const _pv = parseInt(voltage), _pi = parseInt(current);
             pluginState.batteryData.voltage = isNaN(_pv) ? 0 : _pv;
             pluginState.batteryData.current = isNaN(_pi) ? 0 : _pi;
             updateVoltageCurrentDisplay();
             updateCpuTempDisplay();
        }
    } catch(e) {}
};

// ★ 电压/电流单位自适应：高通/ZTE 平台多为 µV/µA（如 4300000 / 1500000），
//   个别固件节点单位为 mV/mA（如 4300 / 1500）。硬编码按 µV/µA 换算在非标设备上
//   会显示 0.00V 或电流/功率差 1000 倍，这是「电池管家数据不准」的主要来源之一。
const bpNormVoltageV = (raw) => {
    const a = Math.abs(raw);
    if (a === 0) return 0;
    let v = a / 1000000;          // 先按 µV 换算
    if (v > 20) v = a / 1000;     // 超过 20V 物理不可能，说明单位实为 mV
    return v;
};
const bpNormCurrentMa = (raw, voltageV) => {
    const a = Math.abs(raw);
    if (a === 0) return 0;
    let ma = a / 1000;            // 先按 µA 换算
    // 用功率做合理性校验：便携设备充放电功率不可能超过 100W，超过说明电流单位实为 mA
    if (voltageV > 0 && (voltageV * ma / 1000) > 100) ma = a;
    return ma;
};
const updateVoltageCurrentDisplay = () => {
        const battery = pluginState.batteryData;

        const voltageV = bpNormVoltageV(battery.voltage);
        const currentMa = bpNormCurrentMa(battery.current, voltageV);

        const vEl = getElement('battery_voltage');
        if(vEl) vEl.innerHTML = voltageV > 0 ? `${voltageV.toFixed(2)}<span class="bp-unit">V</span>` : "--";

        const cEl = getElement('battery_current');
        if(cEl) cEl.innerHTML = `${currentMa.toFixed(0)}<span class="bp-unit">mA</span>`;

        let powerVal = "--";
        if (voltageV > 0 && currentMa > 0) {
            // ★ 取绝对值：放电时 current_now 为负的内核上，功率不再显示负值
            powerVal = (voltageV * currentMa / 1000).toFixed(2);
        } else if (battery.voltage === 0 || battery.current === 0) {
            powerVal = "0.00";
        }

        const pEl = getElement('battery_power');
        if(pEl) pEl.innerHTML = powerVal !== "--" ? `${powerVal}<span class="bp-unit">W</span>` : "--";

        const headerPowerEl = getElement('header_power');
        if(headerPowerEl) headerPowerEl.textContent = powerVal;
    };
   const updateBatteryDisplay = () => {
        const battery = pluginState.batteryData;
        const statusInfo = PLUGIN_CONFIG.STATUS_MAP[battery.status] || PLUGIN_CONFIG.STATUS_MAP.Unknown;
        const themeColor = getBatteryColor(battery.level);
        const isCharging = battery.status === 'Charging';
        const iconSvg = isCharging ? ICONS.BOLT : ICONS.BATTERY;
        const iconColor = isCharging ? '#f1fa8c' : themeColor;
        
        const headerIconContainer = getElement('header_icon_container');
        if(headerIconContainer) {
            headerIconContainer.innerHTML = iconSvg;
            headerIconContainer.style.width = isCharging ? "16px" : "18px";
            headerIconContainer.style.height = isCharging ? "16px" : "18px";
            
            // 给顶部小闪电加能量脉冲动效
            if (battery.status === 'Charging' && String(battery.chargingEnabled).trim() !== '0') {
                headerIconContainer.style.color = "#50fa7b";
                headerIconContainer.classList.add('bp-pulse-active'); // 启动脉冲
            } else {
                headerIconContainer.style.color = isCharging ? "#fff" : themeColor;
                headerIconContainer.classList.remove('bp-pulse-active'); // 停止脉冲
            }
        }

        const mainIconContainer = getElement('battery_icon_main');
        if(mainIconContainer) {
            mainIconContainer.innerHTML = iconSvg;
            mainIconContainer.style.color = iconColor;
        }

        const ring = getElement('battery_ring');
        if(ring) {
            const dashoffset = PLUGIN_CONFIG.RING_CIRCUMFERENCE * (1 - battery.level / 100);
            ring.style.strokeDashoffset = dashoffset;
            ring.style.stroke = themeColor;
        }
        
       getElement('battery_percent').textContent = `${battery.level}%`;
        let currentStatusText = statusInfo.text;
        
        // --- 1. 顶部折叠文字  ---
        const headerSub = getElement('header_status_text');
        if (headerSub) {
             if (battery.status === 'Charging' && String(battery.chargingEnabled).trim() !== '0') {
                 headerSub.textContent = ` 充电中 ${battery.level}%`;
                 headerSub.style.color ="#50fa7b"; // 充电中绿字
                     } else {
                 if (battery.status === 'Full' || (battery.status === 'Charging' && String(battery.chargingEnabled).trim() === '0')) {
                     currentStatusText = "直供电中";
                     headerSub.style.color ="#8be9fd"; // 直供电蓝
                 } else {
                     // 放电状态下颜色
                     headerSub.style.color ="rgba(255,255,255,0.6)";  
                 }
                 headerSub.textContent = `${currentStatusText} ${battery.level}%`;
             }
             headerSub.classList.remove('bp-pulse-active');
        }
        
        // ---顶部小圆环和温度 ---
        const headerRing = getElement('header_ring_path');
        if(headerRing) {
             const headerDash = 100 * (1 - battery.level / 100);
             headerRing.style.strokeDashoffset = headerDash;
             headerRing.style.stroke = themeColor;
        }

        const tempC = battery.temperature / 10;
        const tempColor = getTemperatureColor(tempC);
        
const tempElement = getElement('battery_temp');
        if (tempElement) {
            tempElement.innerHTML = `${tempC}<span class="bp-unit">°C</span>`;
            tempElement.style.color = tempColor;
        }
        
        const headerTempEl = getElement('header_temp');
        if(headerTempEl) {
             headerTempEl.textContent = tempC;
             headerTempEl.style.color = tempColor;
        } 

      // --- 提取数据并画图 ---
        // 1. 温度曲线 ( 2 小时，一分钟一帧 = 120 个点)
        let tempRes = getChartData(pluginState.history.temp, pluginState.history.time, 2, 120);
        if (tempRes.data.length > 1) { 
            if (!pluginState.tempAnimated) {
                animateChart('temp_chart_canvas', tempRes.data, tempColor, true, false);
                pluginState.tempAnimated = true;
            } else {
                drawChart('temp_chart_canvas', tempRes.data, tempColor, true, false);
            }
        }

        // 2. 功率曲线 ( 1 小时！一分钟一帧 = 60 个点)
        if (pluginState.history.power && pluginState.history.power.length > 0) {
            let powerRes = getChartData(pluginState.history.power, pluginState.history.time, 1, 60);
            if (powerRes.data.length > 1) { 
                if (!pluginState.powerAnimated) {
                    animateChart('power_chart_canvas', powerRes.data, '#fbbf24', false, false);
                    pluginState.powerAnimated = true;
                } else {
                    drawChart('power_chart_canvas', powerRes.data, '#fbbf24', false, false);
                }
            }
        }

        // 3. 24小时大图表 ( 24 小时，一分钟一帧 = 1440 个点)
        if (getElement('bp_battery_chart_modal') && getElement('bp_battery_chart_modal').style.display === 'flex') {
            let levelRes = getChartData(pluginState.history.level, pluginState.history.time, 24, 1440);
            drawChart('level_chart_canvas', levelRes.data, '#fbbf24', true, true, 1, levelRes.time);
        }


// --- 2. 动态续航预估逻辑 (8秒防抖 + 智能目标感知 + 滑动平滑计算) ---
        const timeLabelEl = getElement('battery_time_label');
        const timeValEl = getElement('battery_time_val');
        
        if (timeLabelEl && timeValEl) {
            const now = Date.now();
            const currentChargeState = battery.status + battery.chargingEnabled;
            const isDirectPower = (battery.status === 'Full' || (battery.status === 'Charging' && String(battery.chargingEnabled).trim() === '0'));
            
            const formatTimeStr = (hours) => {
                if (!isFinite(hours) || hours <= 0) return "--";
                if (hours > 99) return "99h+";
                const h = Math.floor(hours);
                const m = Math.floor((hours - h) * 60);
                return h === 0 ? `${m}m` : `${h}h ${m}m`;
            };

            // 状态突变或你点击了按钮强制更新时
            if (pluginState.lastStatus !== currentChargeState || pluginState.lastStatus === "FORCE_UPDATE") {
                if (pluginState.lastStatus !== "FORCE_UPDATE") {
                    pluginState.statusStartTime = now;
                }
                pluginState.lastStatus = currentChargeState;
                pluginState.smoothedCurrent = null; // 清空旧电流
                
                if (isDirectPower) {
                    pluginState.cachedTimeLabel = "当前";
                    pluginState.cachedTimeVal = "直供电中";
                    pluginState.cachedTimeColor = "#8be9fd";    //当前字体颜色
                } else {
                    // 如果开启自动模式，立刻显示目标电量
                    let targetPercent = 100;
                    if (typeof CONFIG !== 'undefined' && CONFIG.enabled) {
                        targetPercent = Number(CONFIG.max_charge) || 100;
                    }
                    pluginState.cachedTimeLabel = (battery.status === 'Charging' && targetPercent < 100) ? `距${targetPercent}%预计` : "预估";
                    pluginState.cachedTimeVal = "计算中";
                    pluginState.cachedTimeColor = "#bd93f9"; 
                }
            }
            
            const timeSinceInit = now - pluginState.initTime;
            const timeSinceStateChange = now - pluginState.statusStartTime;

            if (!isDirectPower) {
                // 前 8 秒（3秒稳定空余 + 5秒静默采集电流），UI 锁死在“计算中”
                if (timeSinceInit < 8000 || timeSinceStateChange < 8000) {
                    
                       if (timeSinceInit < 3000 && pluginState.lastStatus !== "FORCE_UPDATE") {
                        try {
                            const saved = JSON.parse(localStorage.getItem('bp_time_cache') || '{}');
                            if (saved.state === currentChargeState && saved.remainMs) {
                                const elapsed = now - saved.timestamp;
                                const newRemainMs = saved.remainMs - elapsed;
                                if (newRemainMs > 0) {
                                    pluginState.cachedTimeLabel = saved.label;
                                    pluginState.cachedTimeVal = formatTimeStr(newRemainMs / 3600000);
                                    pluginState.cachedTimeColor = saved.color;
                                }
                            }
                        } catch(e) {}
                    }
                    
                    if ((timeSinceInit > 3000 || timeSinceStateChange > 3000) && (timeSinceInit < 8000 || timeSinceStateChange < 8000)) {
                        const raw_current_mA = bpNormCurrentMa(battery.current, bpNormVoltageV(battery.voltage));
                        if (pluginState.smoothedCurrent === null) {
                            pluginState.smoothedCurrent = raw_current_mA;
                        } else {
                            pluginState.smoothedCurrent = (raw_current_mA * 0.3) + (pluginState.smoothedCurrent * 0.7);
                        }
                    }
                } 

                else if (pluginState.cachedTimeVal === "计算中" || now - pluginState.lastTimeCalc > 60000) {
                    pluginState.lastTimeCalc = now;
                    // 老化折损系数(0.85)
                    const capacity_mAh = ((battery.chargeFull / 1000) || 3000) * 0.85;
                    const raw_current_mA = bpNormCurrentMa(battery.current, bpNormVoltageV(battery.voltage));
                    
                    if (pluginState.smoothedCurrent === null) {
                        pluginState.smoothedCurrent = raw_current_mA;
                    } else {
                        pluginState.smoothedCurrent = (raw_current_mA * 0.3) + (pluginState.smoothedCurrent * 0.7);
                    }
                    
                    let remain_hours = 0;
                    
                    if (pluginState.smoothedCurrent < 50) { 
                         pluginState.cachedTimeLabel = "预估";
                         pluginState.cachedTimeVal = "计算中";
                         pluginState.cachedTimeColor = "#bd93f9";
                    } else if (battery.status === 'Charging') {
                         
                         let targetPercent = 100;
                         if (typeof CONFIG !== 'undefined' && CONFIG.enabled) {
                             targetPercent = Number(CONFIG.max_charge) || 100;
                         }
                         
                         if (battery.level >= targetPercent && targetPercent < 100) {
                             pluginState.cachedTimeLabel = "即将直供电";
                             pluginState.cachedTimeVal = "--";
                         } else {

                             const remain_mAh = capacity_mAh * ((targetPercent - battery.level) / 100);
                             remain_hours = remain_mAh / pluginState.smoothedCurrent;
                             pluginState.cachedTimeLabel = targetPercent < 100 ? `距${targetPercent}%预计` : "充满预计";
                             pluginState.cachedTimeVal = formatTimeStr(remain_hours);
                         }
                         pluginState.cachedTimeColor = "#61d882"; 
                         
                    } else if (battery.status === 'Discharging') {
                         const remain_mAh = capacity_mAh * (battery.level / 100);
                         remain_hours = remain_mAh / pluginState.smoothedCurrent;
                         pluginState.cachedTimeLabel = "预计剩余";
                         pluginState.cachedTimeVal = formatTimeStr(remain_hours);
                         pluginState.cachedTimeColor = "#ffb86c"; 
                    }

                    // 写入缓存
                    if (remain_hours > 0) {
                        localStorage.setItem('bp_time_cache', JSON.stringify({
                            timestamp: now,
                            remainMs: remain_hours * 3600000,
                            state: currentChargeState,
                            label: pluginState.cachedTimeLabel,
                            color: pluginState.cachedTimeColor
                        }));
                    }
                }
            }
                    
 // 统一渲染UI
            timeLabelEl.textContent = pluginState.cachedTimeLabel;
            timeValEl.textContent = pluginState.cachedTimeVal;
            timeLabelEl.style.fill = pluginState.cachedTimeColor;
        }

        const container = document.getElementById('BATTERY_PRO_CONTAINER');
        if(container) container.classList.add('bp-loaded');
    };

// === 后台记录器 ===
    const installDeviceLogger = async () => {
        const checkContent = await runShellWithRoot(`cat /sdcard/kano_battery_logger.sh 2>/dev/null`);
        const needFix = checkContent.content && (!checkContent.content.includes('# v7') || checkContent.content.includes("\\$"));
        
        const checkProc = await runShellWithRoot(`ps -ef | grep kano_battery_logger | grep -v grep`);
        if (!checkProc.content || needFix) {
            console.log("检测到需要升级 V7 温度限速版守护进程...");
            
            const lines = checkProc.content ? checkProc.content.trim().split('\n') : [];
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[1];
                if (pid && /^\d+$/.test(pid)) {
                    await runShellWithRoot(`kill -9 ${pid}`);
                }
            }
            
            // V7脚本（标准 power_supply 节点优先，zte 私有节点兜底，与面板读取来源一致）
            const script = `#!/system/bin/sh\n# v7\nLAST_T=0\nt=0\nwhile true;\ndo\n  NOW=$(date +%s)\n  c=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null || echo 0)\n  if [ $((NOW - LAST_T)) -ge 30 ]; then\n    t=$(cat /sys/class/power_supply/battery/temp 2>/dev/null || echo 0)\n    LAST_T=$NOW\n  fi\n  v=$(cat /sys/class/power_supply/battery/voltage_now 2>/dev/null || cat /sys/class/zte_power_supply/zte_battery/voltage_now 2>/dev/null || echo 0)\n  i=$(cat /sys/class/power_supply/battery/current_now 2>/dev/null || cat /sys/class/zte_power_supply/zte_battery/current_now 2>/dev/null || echo 0)\n  echo "$NOW,$c,$t,$v,$i" >> /sdcard/kano_battery_history.log\n  if [ $(wc -l < /sdcard/kano_battery_history.log) -gt 20000 ];\nthen\n    tail -n 19000 /sdcard/kano_battery_history.log > /sdcard/kano_battery_history.tmp && mv /sdcard/kano_battery_history.tmp /sdcard/kano_battery_history.log\n  fi\n  ACTIVE_TIME=$(cat /dev/bp_web_active 2>/dev/null || echo 0)\n  if [ $((NOW - ACTIVE_TIME)) -lt 12 ];\nthen\n    sleep 5\n  else\n    sleep 30\n  fi\ndone`;
            
            await runShellWithRoot(`cat << 'EOF' > /sdcard/kano_battery_logger.sh\n${script}\nEOF`);
            await runShellWithRoot(`chmod 777 /sdcard/kano_battery_logger.sh`);
            await runShellWithRoot(`nohup /system/bin/sh /sdcard/kano_battery_logger.sh >/dev/null 2>&1 &`);
            await runShellWithRoot(`grep -qxF '/system/bin/sh /sdcard/kano_battery_logger.sh &' /sdcard/ufi_tools_boot.sh || echo '/system/bin/sh /sdcard/kano_battery_logger.sh &' >> /sdcard/ufi_tools_boot.sh`);
        }
    };

// 从设备物理文件拉取过去 24 小时的数据
    const fetchDeviceHistory = async () => {
        const res = await runShellWithRoot(`cat /sdcard/kano_battery_history.log 2>/dev/null`);
        if (res && res.success && res.content) {
            const lines = res.content.trim().split('\n');
            const times = [], temps = [], levels = [], powers = [];
            
            lines.forEach(line => {
                const parts = line.split(',');
                if (parts.length >= 3) {
                    times.push(parseInt(parts[0]) * 1000);
                    levels.push(parseInt(parts[1]));
                    temps.push(parseInt(parts[2]) / 10);

                    if (parts.length >= 5) {
                        const vol = parseInt(parts[3]) || 0;
                        const cur = parseInt(parts[4]) || 0;
                        // ★ 单位自适应 + 绝对值：放电负电流不再产生负功率点，mV/mA 单位设备不再差 1000 倍
                        const vv = bpNormVoltageV(vol);
                        const pwr = vv * (bpNormCurrentMa(cur, vv) / 1000);
                        powers.push(pwr);
                    } else {
                        powers.push(0);
                    }
                }
            });
            
            if (levels.length > 0) {
                pluginState.history.time = times;
                pluginState.history.level = levels;
                pluginState.history.temp = temps;
                pluginState.history.power = powers; 
            }
        }
    };
const startMonitoring = async () => {
        if (pluginState.monitoring) return;
        
        // 瞬间读取当前硬件状态，不被日志读取阻塞
        fetchBatteryInfo(); 
        fetchVoltageCurrentInfo();
        
        pluginState.updateTimer = setInterval(() => {
            fetchBatteryInfo(); 
        }, 3000);
        if(pluginState.voltageCurrentTimer) clearInterval(pluginState.voltageCurrentTimer);
        pluginState.voltageCurrentTimer = setInterval(fetchVoltageCurrentInfo, 1000);
        updateCpuTempDisplay(); // 先立刻执行一次防闪烁
        
        pluginState.monitoring = true;

        // 底层日志后台异步执行
        installDeviceLogger().then(async () => {
            await fetchDeviceHistory();
            if (typeof updateBatteryDisplay === 'function') updateBatteryDisplay();
        });

       // 首次打开网页，发送一次激活心跳
        runShellWithRoot(`date +%s > /dev/bp_web_active`);
        // 网页开启期间：每 5 秒发送心跳保持激活，拉取图表数据
        // 【内存优化】保存定时器引用，防止重复创建导致内存泄漏
        pluginState.heartbeatTimer = setInterval(async () => {
            runShellWithRoot(`date +%s > /dev/bp_web_active`); 
            await fetchDeviceHistory();
            if (typeof updateBatteryDisplay === 'function') updateBatteryDisplay();
        }, 5000);
        pluginState.configTimer = setInterval(async () => {
            if (typeof getConfig === 'function') await getConfig();
        }, 30000);
    };

    const applyCollapseState = (isOpen) => {
        const toggle = document.getElementById('bp_collapse_toggle');
        const main = document.getElementById('bp_body_main');
        const header = document.getElementById('bp_header');
        const tempPanel = document.getElementById('TEMP_MONITOR_PANEL');
        
        if (!main || !header || !toggle) return;
        if(isOpen){ 
            main.classList.remove('collapsed');
            main.style.maxHeight = '500px'; 
            main.style.opacity = '1';
            header.classList.remove('is-collapsed');
            toggle.checked = true;
            // 无电池模式：同步展开温度监测面板
            if (typeof _noBatteryMode !== 'undefined' && _noBatteryMode && tempPanel) {
                tempPanel.style.display = 'block';
            }
        } else { 
            main.classList.add('collapsed');
            main.style.maxHeight = '0';
            main.style.opacity = '0';
            header.classList.add('is-collapsed');
            toggle.checked = false;
            // 无电池模式：同步收起温度监测面板
            if (typeof _noBatteryMode !== 'undefined' && _noBatteryMode && tempPanel) {
                tempPanel.style.display = 'none';
            }
        }
    };
    const initializeToggle = () => {
        const toggle = document.getElementById('bp_collapse_toggle');
        const COLLAPSE_KEY = 'bp_collapse_status';
        
        if(!toggle) return;

        const savedState = localStorage.getItem(COLLAPSE_KEY);
        if (savedState === 'closed') applyCollapseState(false);
        else applyCollapseState(true);
        toggle.onchange = function() {
            if(this.checked){ 
                applyCollapseState(true);
                localStorage.setItem(COLLAPSE_KEY, 'open');
            } else { 
                applyCollapseState(false);
                localStorage.setItem(COLLAPSE_KEY, 'closed');
                if(typeof window.close_charge_settings === 'function') {
                    window.close_charge_settings();
                }
                const chartModal = document.getElementById('bp_battery_chart_modal');
                if (chartModal) chartModal.style.display = 'none';
            }
        };
    };

const initializeMonitoring = async (retryCount = 0) => {
    // 1. 先检查 Root 
    if (await checkRootAccess()) {
     
        startMonitoring();

    } else {
        if (retryCount < 3) {
            setTimeout(() => initializeMonitoring(retryCount + 1), 1000);
        }
    }
};

   // 3. 绑定“充电管理”按钮事件
    document.getElementById('bp_open_charge_btn').onclick = openChargeSettings;
    const ringTrigger = getElement('bp_ring_trigger');
    const chartModal = getElement('bp_battery_chart_modal');
    const closeBtn = getElement('bp_close_chart_btn');
    if (ringTrigger && chartModal && closeBtn) {
        ringTrigger.onclick = () => {
            chartModal.style.display = 'flex';
            setTimeout(() => { 
                let levelRes = getChartData(pluginState.history.level, pluginState.history.time, 24, 1440);
                animateChart('level_chart_canvas', levelRes.data, '#fbbf24', true, true, levelRes.time);
            }, 50);
           };
        closeBtn.onclick = () => { chartModal.style.display = 'none'; };
    }
    // 4. 初始化折叠状态
    initializeToggle();

    // 5. 启动数据监控
    setTimeout(() => initializeMonitoring(0), 10);

    // ===== 无电池模式开关 + 温度监测面板 =====
    var _noBatteryMode = false;
    try { _noBatteryMode = localStorage.getItem('bp_no_battery_mode') === '1'; } catch(e) {}

    // 温度监测数据
    var _tempData = { history: [], maxTemp: 0, timer: null, elements: new Map() };
    var _tempEl = (id) => { if (!_tempData.elements.has(id)) _tempData.elements.set(id, document.getElementById(id)); return _tempData.elements.get(id); };

    var _tempGetStatus = function(temp) {
        if (temp < 50) return { status: '正常', color: '#4CAF50', pct: (temp / 50) * 100 };
        if (temp < 70) return { status: '注意', color: '#FFC107', pct: 50 + ((temp - 50) / 20) * 50 };
        if (temp < 85) return { status: '警告', color: '#FF9800', pct: 75 + ((temp - 70) / 15) * 25 };
        return { status: '危险', color: '#f44336', pct: 100 };
    };

    var _tempCalcTrend = function(h) {
        if (h.length < 3) return '稳定';
        var r = h.slice(-3);
        var d = r[2].temp - r[0].temp;
        if (d > 1) return '上升 ↗';
        if (d < -1) return '下降 ↘';
        return '稳定 →';
    };

    var _tempUpdateChart = function(h) {
        var c = _tempEl('temp_trend_chart'); if (!c || !h.length) return;
        var recent = h.slice(-16);
        var mx = Math.max.apply(null, recent.map(function(r){return r.temp}));
        var mn = Math.min.apply(null, recent.map(function(r){return r.temp}));
        var rng = Math.max(mx - mn, 10);
        c.innerHTML = '';
        recent.forEach(function(rec, i) {
            var s = _tempGetStatus(rec.temp);
            var bar = document.createElement('div');
            bar.style.cssText = 'height:' + (((rec.temp - mn) / rng) * 44 + 8) + 'px;background:' + s.color + ';border-radius:2px;flex:1;min-width:0;opacity:' + (i === recent.length - 1 ? 1 : 0.7) + ';transition:all .3s ease;box-shadow:0 0 4px ' + s.color + '40;';
            bar.title = rec.temp.toFixed(1) + '°C';
            c.appendChild(bar);
        });
        var tc = _tempEl('temp_trend_count'); if (tc) tc.textContent = recent.length;
    };

    var _tempUpdate = function() {
        var temp = 0, sensorCount = 0;
        try {
            if (window.UFI_DATA && typeof window.UFI_DATA.cpu_temp !== 'undefined') {
                temp = window.UFI_DATA.cpu_temp / 1000;
                sensorCount = (window.UFI_DATA.cpu_temp_list && window.UFI_DATA.cpu_temp_list.length) || 1;
            }
        } catch(e) { return; }
        if (!temp) return;

        _tempData.history.push({ temp: temp, ts: Date.now() });
        if (_tempData.history.length > 20) _tempData.history.shift();
        if (temp > _tempData.maxTemp) _tempData.maxTemp = temp;

        var s = _tempGetStatus(temp);
        var el;
        if (el = _tempEl('temp_current')) { el.textContent = temp.toFixed(1); el.style.color = s.color; el.style.textShadow = '0 0 10px ' + s.color + '40'; }
        if (el = _tempEl('temp_status_text')) el.textContent = s.status;
        if (el = _tempEl('temp_status_ring')) el.style.background = 'conic-gradient(' + s.color + ' 0% ' + s.pct + '%, #3333330e ' + s.pct + '% 100%)';
        if (el = _tempEl('temp_max')) el.textContent = _tempData.maxTemp.toFixed(1) + '°C';
        var avg = _tempData.history.reduce(function(s, h) { return s + h.temp; }, 0) / _tempData.history.length;
        if (el = _tempEl('temp_avg')) el.textContent = avg.toFixed(1) + '°C';
        if (el = _tempEl('temp_trend')) el.textContent = _tempCalcTrend(_tempData.history);
        if (el = _tempEl('temp_sensors')) el.textContent = sensorCount;
        _tempUpdateChart(_tempData.history);
    };

    var _startTempMonitor = function() {
        if (_tempData.timer) clearInterval(_tempData.timer);
        _tempData.elements.clear(); // 清缓存让元素重新查找
        _tempUpdate();
        _tempData.timer = setInterval(_tempUpdate, 1000);
    };

    var _stopTempMonitor = function() {
        if (_tempData.timer) { clearInterval(_tempData.timer); _tempData.timer = null; }
    };

    var _applyNoBatteryMode = function() {
        var bpBody = document.getElementById('bp_body_main');
        var tempPanel = document.getElementById('TEMP_MONITOR_PANEL');
        var btn = document.getElementById('bp_no_battery_toggle');
        // 读取当前折叠状态，切换模式后保持一致（折叠时温度面板也不显示）
        var _collapsed = false;
        try { _collapsed = localStorage.getItem('bp_collapse_status') === 'closed'; } catch(e) {}
        if (_noBatteryMode) {
            if (bpBody) bpBody.style.display = 'none';
            if (tempPanel) tempPanel.style.display = _collapsed ? 'none' : 'block';
            // 停止电池管理所有定时器
            if (typeof pluginState !== 'undefined') {
                if (pluginState.updateTimer) { clearInterval(pluginState.updateTimer); pluginState.updateTimer = null; }
                if (pluginState.voltageCurrentTimer) { clearInterval(pluginState.voltageCurrentTimer); pluginState.voltageCurrentTimer = null; }
                if (pluginState.heartbeatTimer) { clearInterval(pluginState.heartbeatTimer); pluginState.heartbeatTimer = null; }
                if (pluginState.configTimer) { clearInterval(pluginState.configTimer); pluginState.configTimer = null; }
                pluginState.monitoring = false;
            }
            _startTempMonitor();
        } else {
            if (bpBody) {
                bpBody.style.display = '';
                // 恢复电池面板为当前折叠状态应有的样式（避免切回后意外展开/收起）
                if (_collapsed) {
                    bpBody.classList.add('collapsed');
                    bpBody.style.maxHeight = '0';
                    bpBody.style.opacity = '0';
                } else {
                    bpBody.classList.remove('collapsed');
                    bpBody.style.maxHeight = '500px';
                    bpBody.style.opacity = '1';
                }
            }
            if (tempPanel) tempPanel.style.display = 'none';
            _stopTempMonitor();
            // 恢复电池管理监控
            if (typeof startMonitoring === 'function' && typeof pluginState !== 'undefined' && !pluginState.monitoring) {
                startMonitoring();
            }
        }
        if (btn) {
            btn.textContent = _noBatteryMode ? '🌡️ 无电池模式' : '🔋 电池模式';
            // 用 class 控制激活态颜色，CSS 负责实际渲染（避免行内样式被覆盖）
            if (_noBatteryMode) {
                btn.style.background = '';
                btn.style.boxShadow = '';
                btn.classList.add('no-battery-active');
            } else {
                btn.classList.remove('no-battery-active');
                btn.style.background = '';
                btn.style.boxShadow = '';
            }
        }
    };

    var _toggleNoBattery = function() {
        _noBatteryMode = !_noBatteryMode;
        try { localStorage.setItem('bp_no_battery_mode', _noBatteryMode ? '1' : '0'); } catch(e) {}
        // 模式按钮 = 功能应用：点一下面板自动打开并切换到对应模式的内容
        // 面板的开/关由右侧折叠开关控制，这里同步为"打开"
        try { localStorage.setItem('bp_collapse_status', 'open'); } catch(e) {}
        _applyNoBatteryMode();
        if (typeof applyCollapseState === 'function') applyCollapseState(true);
        var _ct = document.getElementById('bp_collapse_toggle');
        if (_ct) _ct.checked = true;
        if (typeof createToast === 'function') {
            createToast(_noBatteryMode ? '已切换到无电池模式 🌡️' : '已切换到电池管理模式 🔋', _noBatteryMode ? 'cyan' : 'yellow', 2000);
        }
    };

    // 绑定开关按钮
    var _nbBtn = document.getElementById('bp_no_battery_toggle');
    if (_nbBtn) _nbBtn.onclick = function() { _toggleNoBattery(); };

    // 启动时应用模式（延迟等面板渲染完）
    setTimeout(function() { _applyNoBatteryMode(); }, 100);

    } // end of 防重复注入 if块

    collapseGen("#collapse_SMART_btn", "#collapse_SMART", "#collapse_SMART", (newVal) => {
        if (newVal == 'open') {
            SCAN_INTERVAL && SCAN_INTERVAL()
            // 恢复用户设置的扫描间隔
            var _savedInt = null
            try { _savedInt = localStorage.getItem('smart_scan_interval_ms') } catch(e) {}
            if (_savedInt) SCAN_INTERVAL_MS = parseInt(_savedInt) || 10000
            SCAN_INTERVAL = requestInterval(function() { scanDevices() }, SCAN_INTERVAL_MS)
            scanDevices()
            addLog('面板已展开，开始监控')
            addDiagLog('启动 v'+PLUGIN_VERSION+'，开始扫描+游戏检测 (间隔:'+(SCAN_INTERVAL_MS/1000)+'秒)', 'success')
            // 启动游戏识别循环（只认前台应用，窗口焦点优先，平板只认焦点）
            GAME_BOOST_ENABLED = true
            if (!GAME_MONITOR_INTERVAL) {
                gameMonitorLoop()
                GAME_MONITOR_INTERVAL = requestInterval(function() { gameMonitorLoop() }, 3000)
            }
            loadTickets()
        } else {
            SCAN_INTERVAL && SCAN_INTERVAL()
            addLog('面板已收起')
            addDiagLog('面板收起', 'info')
        }
    })
    if (localStorage.getItem("#collapse_SMART") == 'open') {
        var _savedInt2 = null
        try { _savedInt2 = localStorage.getItem('smart_scan_interval_ms') } catch(e) {}
        if (_savedInt2) SCAN_INTERVAL_MS = parseInt(_savedInt2) || 10000
        SCAN_INTERVAL = requestInterval(function() { scanDevices() }, SCAN_INTERVAL_MS)
        scanDevices()
        addLog('智能设备管理器已启动')
        addDiagLog('启动 v'+PLUGIN_VERSION+'，已启动扫描 (间隔:'+(SCAN_INTERVAL_MS/1000)+'秒)', 'success')
        // 启动游戏识别循环（只认前台应用，窗口焦点优先，平板只认焦点）
        GAME_BOOST_ENABLED = true
        if (!GAME_MONITOR_INTERVAL) {
            gameMonitorLoop()
            GAME_MONITOR_INTERVAL = requestInterval(function() { gameMonitorLoop() }, 3000)
        }
        loadTickets()
    }

    // 捕获当前插件代码，供保存按钮使用
    if (!window.__SMART_PLUGIN_CODE__) {
        try {
            var _scripts = document.querySelectorAll('script')
            for (var _si = _scripts.length - 1; _si >= 0; _si--) {
                var _sc = _scripts[_si].textContent || ''
                if (_sc.indexOf('PLUGIN_VERSION') >= 0 && _sc.indexOf('SmartDeviceManager') >= 0) {
                    window.__SMART_PLUGIN_CODE__ = _sc; break
                }
            }
        } catch(e) {}
    }
})();
// ── sdm-battery 插件结束 ──
