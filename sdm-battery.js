// ─────────────────────────────────────────────────────────────────────────────
// 插件: 电池监控pro
// ID: sdm-battery
// 版本: 3.6.9.0
// 此文件为独立插件，由 SDM 统一更新管理器管理
// ─────────────────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'sdm-battery';
const PLUGIN_VERSION = '3.6.9.0';

// 注册到统一更新管理器
if (typeof SDMUpdater !== 'undefined' && SDMUpdater && SDMUpdater.register) {
    SDMUpdater.register({ id: PLUGIN_ID, name: '电池监控pro', version: PLUGIN_VERSION, file: 'plugins/sdm-battery.js' });
}
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
// ── sdm-battery 插件结束 ──