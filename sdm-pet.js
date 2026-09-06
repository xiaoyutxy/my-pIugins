// ─────────────────────────────────────────────────────────────────────────────
// 插件: 桌面悬浮宠物
// ID: sdm-pet
// 版本: 3.6.9.0
// 此文件为独立插件，由 SDM 统一更新管理器管理
// ─────────────────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'sdm-pet';
const PLUGIN_VERSION = '3.6.9.0';

// 注册到统一更新管理器
if (typeof SDMUpdater !== 'undefined' && SDMUpdater && SDMUpdater.register) {
    SDMUpdater.register({ id: PLUGIN_ID, name: '桌面悬浮宠物', version: PLUGIN_VERSION, file: 'plugins/sdm-pet.js' });
}
    // 功能：屏幕内自由走动、AI聊天、天气播报、穿衣建议、版本更新提醒、设备状态汇报
    // ═══════════════════════════════════════════════════════════════════════════
    setTimeout(function() {
    ;(function() {
        if (window._desktopPetLoaded) return;
        window._desktopPetLoaded = true;

        // ---- 防重复 ----
        var oldPet = document.getElementById('desktop_pet_root');
        if (oldPet) oldPet.remove();

        // ---- 工具函数 ----
        var _toast = function(msg, color, dur) {
            try { if (typeof createToast === 'function') createToast(msg, color || 'pink', dur || 3000); } catch(e) {}
        };
        var _rs = function(cmd, timeout) {
            return new Promise(function(resolve) {
                try {
                    if (typeof runShellWithRoot !== 'function') { resolve({ content: '', success: false }); return; }
                    runShellWithRoot(cmd, timeout || 10000).then(function(r) {
                        if (typeof r === 'string') resolve({ content: r, success: true });
                        else if (r && typeof r === 'object') resolve({ content: r.content || r.stdout || '', success: !!r.success });
                        else resolve({ content: '', success: false });
                    }).catch(function() { resolve({ content: '', success: false }); });
                } catch(e) { resolve({ content: '', success: false }); }
            });
        };
        var _rand = function(min, max) { return Math.random() * (max - min) + min; };
        var _randInt = function(min, max) { return Math.floor(_rand(min, max + 1)); };
        var _pick = function(arr) { return arr[_randInt(0, arr.length - 1)]; };

        // ---- CSS ----
        var petStyle = document.createElement('style');
        petStyle.textContent = '\
#desktop_pet_root { position: fixed; z-index: 99998; pointer-events: none; top: 0; left: 0; width: 100%; height: 100%; }\
.pet-wrap { position: absolute; pointer-events: auto; cursor: pointer; transition: filter .3s ease; will-change: transform; }\
.pet-wrap:hover { filter: brightness(1.1) drop-shadow(0 0 8px rgba(251,191,36,.4)); }\
.pet-sprite { width: 64px; height: 64px; position: relative; animation: pet-idle-bob 2.5s ease-in-out infinite; }\
.pet-sprite.walking { animation: pet-walk-bob .4s ease-in-out infinite; }\
.pet-sprite.sleeping { animation: pet-sleep-breathe 3s ease-in-out infinite; }\
.pet-sprite.happy { animation: pet-happy-bounce .3s ease-in-out infinite; }\
@keyframes pet-idle-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }\
@keyframes pet-walk-bob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-4px) rotate(2deg); } }\
@keyframes pet-sleep-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }\
@keyframes pet-happy-bounce { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.05); } }\
.pet-shadow { position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); width: 40px; height: 6px; background: radial-gradient(ellipse, rgba(0,0,0,.25), transparent 70%); border-radius: 50%; animation: pet-shadow-pulse 2.5s ease-in-out infinite; }\
@keyframes pet-shadow-pulse { 0%,100% { opacity: .3; width: 40px; } 50% { opacity: .15; width: 32px; } }\
.pet-eye { transform-origin: center; animation: pet-blink 4s ease-in-out infinite; }\
.pet-eye-right { animation-delay: .1s; }\
@keyframes pet-blink { 0%,90%,100% { transform: scaleY(1); } 93%,97% { transform: scaleY(.1); } }\
.pet-tail { transform-origin: 70px 75px; animation: pet-tail-wag 1.5s ease-in-out infinite; }\
@keyframes pet-tail-wag { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(15deg); } }\
.pet-zzz { position: absolute; top: -10px; right: -5px; font-size: 14px; color: rgba(255,255,255,.6); animation: pet-zzz-float 2s ease-out infinite; opacity: 0; }\
.pet-zzz.show { opacity: 1; }\
@keyframes pet-zzz-float { 0% { opacity: 0; transform: translateY(0) scale(.5); } 30% { opacity: .8; } 100% { opacity: 0; transform: translateY(-20px) scale(1.2); } }\
.pet-think { position: absolute; top: -8px; right: -2px; font-size: 16px; animation: pet-think-pulse 1s ease-in-out infinite; opacity: 0; }\
.pet-think.show { opacity: 1; }\
@keyframes pet-think-pulse { 0%,100% { transform: scale(1); opacity: .7; } 50% { transform: scale(1.2); opacity: 1; } }\
.pet-sparkle { position: absolute; pointer-events: none; }\
.pet-sparkle span { position: absolute; font-size: 10px; animation: pet-sparkle-fly 1s ease-out forwards; }\
@keyframes pet-sparkle-fly { 0% { opacity: 1; transform: translate(0,0) scale(.5); } 100% { opacity: 0; transform: translate(var(--dx),var(--dy)) scale(1.2); } }\
\
/* 聊天气泡 */\
.pet-bubble { position: absolute; max-width: 260px; min-width: 80px; padding: 10px 14px; border-radius: 14px; background: linear-gradient(135deg, rgba(251,191,36,.95), rgba(245,158,11,.9)); color: #1a1208; font-size: 13px; line-height: 1.5; font-weight: 500; box-shadow: 0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.2); backdrop-filter: blur(8px); pointer-events: auto; opacity: 0; transform: translateY(10px) scale(.9); transition: all .3s cubic-bezier(.175,.885,.32,1.275); z-index: 99999; word-break: break-word; }\
.pet-bubble.show { opacity: 1; transform: translateY(0) scale(1); }\
.pet-bubble::after { content: ""; position: absolute; bottom: -8px; left: 20px; border: 8px solid transparent; border-top-color: rgba(245,158,11,.9); border-bottom: 0; }\
.pet-bubble.ai-bubble { background: linear-gradient(135deg, rgba(34,211,238,.95), rgba(8,145,178,.9)); color: #f0fdfa; }\
.pet-bubble.ai-bubble::after { border-top-color: rgba(8,145,178,.9); }\
.pet-bubble.warn-bubble { background: linear-gradient(135deg, rgba(239,68,68,.95), rgba(185,28,28,.9)); color: #fef2f2; }\
.pet-bubble.warn-bubble::after { border-top-color: rgba(185,28,28,.9); }\
\
/* 聊天输入框 */\
.pet-chat-input-wrap { position: absolute; display: none; flex-direction: column; gap: 6px; z-index: 99999; pointer-events: auto; }\
.pet-chat-input-wrap.show { display: flex; }\
.pet-chat-input { width: 220px; padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(251,191,36,.4); background: rgba(15,18,26,.95); color: #fef3c7; font-size: 13px; outline: none; backdrop-filter: blur(10px); box-shadow: 0 4px 16px rgba(0,0,0,.3); }\
.pet-chat-input::placeholder { color: rgba(251,191,36,.4); }\
.pet-chat-send { padding: 6px 14px; border-radius: 10px; border: none; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1a1208; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(245,158,11,.3); transition: all .2s ease; }\
.pet-chat-send:active { transform: scale(.95); }\
.pet-chat-hint { font-size: 10px; color: rgba(251,191,36,.5); text-align: center; }\
\
/* 控制面板 */\
.pet-menu { position: absolute; display: none; flex-direction: column; gap: 4px; z-index: 99999; pointer-events: auto; padding: 8px; border-radius: 12px; background: rgba(15,18,26,.95); border: 1px solid rgba(251,191,36,.2); backdrop-filter: blur(10px); box-shadow: 0 4px 20px rgba(0,0,0,.4); min-width: 120px; }\
.pet-menu.show { display: flex; }\
.pet-menu-btn { padding: 6px 10px; border-radius: 8px; border: none; background: transparent; color: #fef3c7; font-size: 12px; cursor: pointer; text-align: left; transition: background .2s ease; }\
.pet-menu-btn:hover { background: rgba(251,191,36,.15); }\
\
/* 移动端适配 */\
@media (max-width: 768px) {\
.pet-sprite { width: 52px; height: 52px; }\
.pet-bubble { max-width: 200px; font-size: 12px; }\
.pet-chat-input { width: 180px; }\
}\
';
        document.head.appendChild(petStyle);

        // ---- 创建DOM ----
        var root = document.createElement('div');
        root.id = 'desktop_pet_root';
        root.innerHTML = '\
<div class="pet-wrap" id="pet_wrap">\
    <div class="pet-sprite" id="pet_sprite">\
        <svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible;">\
            <defs>\
                <radialGradient id="petBodyGrad" cx="40%" cy="35%">\
                    <stop offset="0%" stop-color="#fde68a"/>\
                    <stop offset="60%" stop-color="#fbbf24"/>\
                    <stop offset="100%" stop-color="#d97706"/>\
                </radialGradient>\
                <radialGradient id="petHeadGrad" cx="40%" cy="35%">\
                    <stop offset="0%" stop-color="#fef3c7"/>\
                    <stop offset="50%" stop-color="#fcd34d"/>\
                    <stop offset="100%" stop-color="#f59e0b"/>\
                </radialGradient>\
            </defs>\
            <!-- 阴影 -->\
            <ellipse cx="50" cy="93" rx="22" ry="3" fill="rgba(0,0,0,.15)"/>\
            <!-- 尾巴 -->\
            <path class="pet-tail" d="M72,72 Q88,66 82,52" stroke="#f59e0b" stroke-width="7" fill="none" stroke-linecap="round"/>\
            <path class="pet-tail" d="M72,72 Q88,66 82,52" stroke="#fbbf24" stroke-width="4" fill="none" stroke-linecap="round" style="animation-delay:.1s;"/>\
            <!-- 身体 -->\
            <ellipse cx="50" cy="72" rx="20" ry="16" fill="url(#petBodyGrad)"/>\
            <!-- 脚 -->\
            <ellipse cx="42" cy="86" rx="6" ry="4" fill="#d97706"/>\
            <ellipse cx="58" cy="86" rx="6" ry="4" fill="#d97706"/>\
            <!-- 头 -->\
            <circle cx="50" cy="42" r="20" fill="url(#petHeadGrad)"/>\
            <!-- 耳朵 -->\
            <path d="M36,30 L32,14 L44,26 Z" fill="#f59e0b"/>\
            <path d="M64,30 L68,14 L56,26 Z" fill="#f59e0b"/>\
            <path d="M37,27 L35,18 L41,24 Z" fill="#fcd34d"/>\
            <path d="M63,27 L65,18 L59,24 Z" fill="#fcd34d"/>\
            <!-- 眼睛(开) -->\
            <g id="pet_eyes_open">\
                <ellipse class="pet-eye pet-eye-left" cx="43" cy="42" rx="3.5" ry="4.5" fill="#1a1a2e"/>\
                <ellipse class="pet-eye pet-eye-right" cx="57" cy="42" rx="3.5" ry="4.5" fill="#1a1a2e"/>\
                <circle cx="44" cy="40" r="1.2" fill="#fff"/>\
                <circle cx="58" cy="40" r="1.2" fill="#fff"/>\
            </g>\
            <!-- 眼睛(闭) -->\
            <g id="pet_eyes_closed" style="display:none;">\
                <path d="M40,42 Q43,44 46,42" stroke="#1a1a2e" stroke-width="2" fill="none" stroke-linecap="round"/>\
                <path d="M54,42 Q57,44 60,42" stroke="#1a1a2e" stroke-width="2" fill="none" stroke-linecap="round"/>\
            </g>\
            <!-- 鼻子 -->\
            <path d="M48,48 L52,48 L50,51 Z" fill="#fb7185"/>\
            <!-- 嘴 -->\
            <path d="M50,51 Q46,55 43,53" stroke="#1a1a2e" stroke-width="1.5" fill="none" stroke-linecap="round"/>\
            <path d="M50,51 Q54,55 57,53" stroke="#1a1a2e" stroke-width="1.5" fill="none" stroke-linecap="round"/>\
            <!-- 腮红 -->\
            <circle cx="37" cy="47" r="2.5" fill="rgba(251,113,133,.35)"/>\
            <circle cx="63" cy="47" r="2.5" fill="rgba(251,113,133,.35)"/>\
        </svg>\
        <div class="pet-zzz" id="pet_zzz">💤</div>\
        <div class="pet-think" id="pet_think">💭</div>\
        <div class="pet-sparkle" id="pet_sparkle"></div>\
    </div>\
    <div class="pet-shadow"></div>\
</div>\
<div class="pet-bubble" id="pet_bubble"></div>\
<div class="pet-chat-input-wrap" id="pet_chat_input_wrap">\
    <input type="text" class="pet-chat-input" id="pet_chat_input" placeholder="跟宠物说点什么..." maxlength="200"/>\
    <button class="pet-chat-send" id="pet_chat_send">发送</button>\
    <div class="pet-chat-hint">Enter发送 · 长按宠物打开菜单</div>\
</div>\
<div class="pet-menu" id="pet_menu">\
    <button class="pet-menu-btn" data-act="chat">💬 聊天</button>\
    <button class="pet-menu-btn" data-act="weather">🌤️ 天气</button>\
    <button class="pet-menu-btn" data-act="status">📊 设备状态</button>\
    <button class="pet-menu-btn" data-act="update">📦 检查更新</button>\
    <button class="pet-menu-btn" data-act="walk">🚶 去散步</button>\
    <button class="pet-menu-btn" data-act="sleep">😴 休息</button>\
    <button class="pet-menu-btn" data-act="hide">👁️ 隐藏</button>\
</div>\
';
        document.body.appendChild(root);

        // ---- 元素引用 ----
        var petWrap = document.getElementById('pet_wrap');
        var petSprite = document.getElementById('pet_sprite');
        var petBubble = document.getElementById('pet_bubble');
        var chatWrap = document.getElementById('pet_chat_input_wrap');
        var chatInput = document.getElementById('pet_chat_input');
        var chatSend = document.getElementById('pet_chat_send');
        var petMenu = document.getElementById('pet_menu');
        var eyesOpen = document.getElementById('pet_eyes_open');
        var eyesClosed = document.getElementById('pet_eyes_closed');
        var zzzEl = document.getElementById('pet_zzz');
        var thinkEl = document.getElementById('pet_think');
        var sparkleEl = document.getElementById('pet_sparkle');

        // ---- 状态 ----
        var petX = window.innerWidth * 0.3;
        var petY = window.innerHeight * 0.7;
        var targetX = petX;
        var targetY = petY;
        var petFacing = 1; // 1=right, -1=left
        var petState = 'idle';
        var bubbleTimer = null;
        var isDragging = false;
        var dragOffX = 0, dragOffY = 0;
        var longPressTimer = null;
        var lastBehaviorTime = 0;
        var weatherCache = null;
        var weatherCacheTime = 0;
        var updateCheckCooldown = 0;
        var _petHidden = false;

        // ---- 位置更新 ----
        var updatePosition = function() {
            petWrap.style.transform = 'translate(' + petX + 'px,' + petY + 'px) scaleX(' + petFacing + ')';
            // 气泡跟随
            var bx = petX + 30;
            var by = petY - 50;
            petBubble.style.left = bx + 'px';
            petBubble.style.top = by + 'px';
            // 聊天框跟随
            chatWrap.style.left = (petX - 80) + 'px';
            chatWrap.style.top = (petY - 70) + 'px';
            // 菜单跟随
            petMenu.style.left = (petX + 50) + 'px';
            petMenu.style.top = (petY - 10) + 'px';
        };

        // ---- 状态切换 ----
        var setPetState = function(state) {
            petState = state;
            petSprite.className = 'pet-sprite';
            if (state === 'walking') petSprite.classList.add('walking');
            else if (state === 'sleeping') petSprite.classList.add('sleeping');
            else if (state === 'happy') petSprite.classList.add('happy');
            // 眼睛
            if (state === 'sleeping') {
                eyesOpen.style.display = 'none';
                eyesClosed.style.display = '';
                zzzEl.classList.add('show');
            } else {
                eyesOpen.style.display = '';
                eyesClosed.style.display = 'none';
                zzzEl.classList.remove('show');
            }
            // 思考
            if (state === 'thinking') thinkEl.classList.add('show');
            else thinkEl.classList.remove('show');
        };

        // ---- 气泡显示 ----
        var showBubble = function(text, type, duration) {
            if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
            petBubble.textContent = text;
            petBubble.className = 'pet-bubble show';
            if (type === 'ai') petBubble.classList.add('ai-bubble');
            else if (type === 'warn') petBubble.classList.add('warn-bubble');
            updatePosition();
            if (duration !== 0) {
                bubbleTimer = setTimeout(function() {
                    petBubble.classList.remove('show');
                }, duration || 5000);
            }
        };
        var hideBubble = function() {
            if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
            petBubble.classList.remove('show');
        };

        // ---- 火花特效 ----
        var sparkles = function() {
            sparkleEl.innerHTML = '';
            var emojis = ['✨','⭐','💛','🌟'];
            for (var i = 0; i < 5; i++) {
                var s = document.createElement('span');
                s.textContent = _pick(emojis);
                s.style.left = _rand(20, 50) + 'px';
                s.style.top = _rand(10, 30) + 'px';
                s.style.setProperty('--dx', _rand(-30, 30) + 'px');
                s.style.setProperty('--dy', _rand(-40, -10) + 'px');
                s.style.animationDelay = (i * 0.1) + 's';
                sparkleEl.appendChild(s);
            }
            setTimeout(function() { sparkleEl.innerHTML = ''; }, 1500);
        };

        // ---- AI 聊天 ----
        var sendToAI = async function(message) {
            // 优先用已暴露的函数
            if (typeof window._petSendToAI === 'function' && (typeof window._picoclawReady !== 'function' || window._picoclawReady())) {
                setPetState('thinking');
                try {
                    var result = await window._petSendToAI(message);
                    if (result && result.success && result.content) {
                        return result.content;
                    }
                    return null;
                } catch(e) { return null; }
                finally { setPetState('idle'); }
            }
            // 降级：直接读PicoClaw配置调API
            return await _callAIDirect(message);
        };

        var _callAIDirect = async function(message) {
            try {
                var cfgRes = await _rs('cat /data/picoclaw/.picoclaw/config.json 2>/dev/null', 3000);
                var cfgText = cfgRes.content || '';
                if (!cfgText) return null;
                var cfg = JSON.parse(cfgText);
                var apiKey = '', baseUrl = 'https://api.deepseek.com/v1/chat/completions', model = 'deepseek-chat';
                if (cfg.model_list && cfg.model_list.length > 0) {
                    var entry = cfg.model_list[0];
                    apiKey = (entry.api_keys && entry.api_keys[0]) || entry.api_key || '';
                    if (entry.api_base) baseUrl = entry.api_base.replace(/\/$/, '') + '/chat/completions';
                    if (entry.model) { var si = entry.model.indexOf('/'); model = si >= 0 ? entry.model.substring(si + 1) : entry.model; }
                }
                if (cfg.llm && cfg.llm.providers && cfg.llm.providers.default) {
                    var prov = cfg.llm.providers.default;
                    if (!apiKey) apiKey = prov.api_key || '';
                    if (prov.base_url) baseUrl = prov.base_url.replace(/\/$/, '') + '/chat/completions';
                    if (prov.default_model) model = prov.default_model;
                }
                if (!apiKey) return null;
                setPetState('thinking');
                var sysPrompt = '你是一个住在用户手机/平板上的可爱桌面宠物猫，性格活泼温暖。用户用中文跟你聊天，你也用简短可爱的中文回复（50字以内），偶尔加emoji。';
                var body = JSON.stringify({ model: model, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: message }], max_tokens: 200, temperature: 0.8 });
                var escapedBody = body.replace(/'/g, "'\\''");
                var cmd = "timeout 30 curl -s -k -X POST '" + baseUrl + "' -H 'Content-Type: application/json' -H 'Authorization: Bearer " + apiKey + "' -d '" + escapedBody + "' 2>&1";
                var res = await _rs(cmd, 35000);
                var output = res.content || '';
                var resp = JSON.parse(output);
                if (resp && resp.choices && resp.choices[0] && resp.choices[0].message) {
                    return resp.choices[0].message.content;
                }
                return null;
            } catch(e) { return null; }
            finally { setPetState('idle'); }
        };

        // ---- 聊天交互 ----
        var toggleChatInput = function() {
            if (chatWrap.classList.contains('show')) {
                chatWrap.classList.remove('show');
            } else {
                hideBubble();
                petMenu.classList.remove('show');
                chatWrap.classList.add('show');
                setTimeout(function() { chatInput && chatInput.focus(); }, 100);
            }
        };

        var sendChat = async function() {
            var text = chatInput.value.trim();
            if (!text) return;
            chatInput.value = '';
            chatWrap.classList.remove('show');
            showBubble('💬 ' + text, 'user', 3000);
            var reply = await sendToAI(text);
            if (reply) {
                setTimeout(function() {
                    showBubble(reply, 'ai', 8000);
                    setPetState('happy');
                    sparkles();
                    setTimeout(function() { setPetState('idle'); }, 2000);
                }, 500);
            } else {
                showBubble('呜...AI还没配置好，先去AI助手那边设置一下API吧~', 'warn', 5000);
            }
        };

        chatSend.onclick = sendChat;
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
            if (e.key === 'Escape') { chatWrap.classList.remove('show'); }
        });

        // ---- 走动逻辑 ----
        var pickNewTarget = function() {
            var margin = 80;
            targetX = _rand(margin, window.innerWidth - margin - 64);
            targetY = _rand(margin, window.innerHeight - margin - 100);
        };

        var walkLoop = function() {
            if (_petHidden) return;
            if (isDragging) { requestAnimationFrame(walkLoop); return; }
            if (petState === 'sleeping' || petState === 'thinking') {
                requestAnimationFrame(walkLoop); return;
            }
            var dx = targetX - petX;
            var dy = targetY - petY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 5) {
                // 到达目标
                if (petState === 'walking') {
                    setPetState('idle');
                    // 随机休息一会儿再走
                    var restTime = _rand(2000, 6000);
                    setTimeout(function() {
                        if (petState === 'idle' && !_petHidden) {
                            pickNewTarget();
                            setPetState('walking');
                        }
                    }, restTime);
                }
            } else {
                if (petState !== 'walking') setPetState('walking');
                var speed = 0.8;
                petX += (dx / dist) * speed;
                petY += (dy / dist) * speed;
                petFacing = dx > 0 ? 1 : -1;
            }
            updatePosition();
            requestAnimationFrame(walkLoop);
        };

        // ---- 拖拽 + 长按 ----
        var pressStartX = 0, pressStartY = 0, pressTime = 0, hasMoved = false;
        petWrap.addEventListener('mousedown', function(e) {
            isDragging = true;
            hasMoved = false;
            pressStartX = e.clientX;
            pressStartY = e.clientY;
            pressTime = Date.now();
            var rect = petWrap.getBoundingClientRect();
            dragOffX = e.clientX - petX;
            dragOffY = e.clientY - petY;
            longPressTimer = setTimeout(function() {
                if (!hasMoved) {
                    petMenu.classList.add('show');
                    chatWrap.classList.remove('show');
                    hideBubble();
                }
            }, 600);
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            var mx = e.clientX - pressStartX;
            var my = e.clientY - pressStartY;
            if (Math.abs(mx) > 5 || Math.abs(my) > 5) {
                hasMoved = true;
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                petMenu.classList.remove('show');
            }
            if (hasMoved) {
                petX = e.clientX - dragOffX;
                petY = e.clientY - dragOffY;
                petX = Math.max(0, Math.min(window.innerWidth - 64, petX));
                petY = Math.max(0, Math.min(window.innerHeight - 80, petY));
                targetX = petX;
                targetY = petY;
                updatePosition();
            }
        });
        document.addEventListener('mouseup', function(e) {
            if (!isDragging) return;
            isDragging = false;
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            var dt = Date.now() - pressTime;
            if (!hasMoved && dt < 600) {
                // 点击
                petMenu.classList.remove('show');
                if (chatWrap.classList.contains('show')) {
                    chatWrap.classList.remove('show');
                } else {
                    toggleChatInput();
                }
            }
        });

        // 触摸事件
        petWrap.addEventListener('touchstart', function(e) {
            e.preventDefault();
            var t = e.touches[0];
            isDragging = true;
            hasMoved = false;
            pressStartX = t.clientX;
            pressStartY = t.clientY;
            pressTime = Date.now();
            dragOffX = t.clientX - petX;
            dragOffY = t.clientY - petY;
            longPressTimer = setTimeout(function() {
                if (!hasMoved) {
                    petMenu.classList.add('show');
                    chatWrap.classList.remove('show');
                    hideBubble();
                }
            }, 600);
        }, { passive: false });
        document.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            var t = e.touches[0];
            var mx = t.clientX - pressStartX;
            var my = t.clientY - pressStartY;
            if (Math.abs(mx) > 5 || Math.abs(my) > 5) {
                hasMoved = true;
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                petMenu.classList.remove('show');
            }
            if (hasMoved) {
                e.preventDefault();
                petX = t.clientX - dragOffX;
                petY = t.clientY - dragOffY;
                petX = Math.max(0, Math.min(window.innerWidth - 64, petX));
                petY = Math.max(0, Math.min(window.innerHeight - 80, petY));
                targetX = petX;
                targetY = petY;
                updatePosition();
            }
        }, { passive: false });
        document.addEventListener('touchend', function(e) {
            if (!isDragging) return;
            isDragging = false;
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            var dt = Date.now() - pressTime;
            if (!hasMoved && dt < 600) {
                petMenu.classList.remove('show');
                if (chatWrap.classList.contains('show')) {
                    chatWrap.classList.remove('show');
                } else {
                    toggleChatInput();
                }
            }
        });

        // 菜单按钮
        petMenu.addEventListener('click', function(e) {
            var btn = e.target.closest('.pet-menu-btn');
            if (!btn) return;
            var act = btn.getAttribute('data-act');
            petMenu.classList.remove('show');
            if (act === 'chat') toggleChatInput();
            else if (act === 'weather') doWeatherReport(true);
            else if (act === 'status') doDeviceReport(true);
            else if (act === 'update') doUpdateCheck(true);
            else if (act === 'walk') { pickNewTarget(); setPetState('walking'); showBubble('好嘞，出发散步啦~🚶', 'user', 3000); }
            else if (act === 'sleep') { setPetState('sleeping'); showBubble('困了...先睡一会儿💤', 'user', 3000); setTimeout(function() { setPetState('idle'); pickNewTarget(); setPetState('walking'); }, 15000); }
            else if (act === 'hide') { hidePet(); }
        });

        // 点击外部关闭菜单
        document.addEventListener('click', function(e) {
            if (!petWrap.contains(e.target) && !petMenu.contains(e.target)) {
                petMenu.classList.remove('show');
            }
        });

        // ---- 隐藏/显示 ----
        var hidePet = function() {
            _petHidden = true;
            petWrap.style.opacity = '0';
            petWrap.style.pointerEvents = 'none';
            hideBubble();
            chatWrap.classList.remove('show');
            _toast('宠物已隐藏，点击屏幕右下角的小爪印恢复~', 'yellow', 4000);
            // 创建恢复按钮
            var restore = document.createElement('div');
            restore.id = 'pet_restore_btn';
            restore.style.cssText = 'position:fixed;right:16px;bottom:16px;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:99997;box-shadow:0 2px 12px rgba(245,158,11,.4);transition:transform .2s ease;';
            restore.innerHTML = '🐾';
            restore.title = '点击恢复宠物';
            restore.onmouseenter = function() { restore.style.transform = 'scale(1.1)'; };
            restore.onmouseleave = function() { restore.style.transform = 'scale(1)'; };
            restore.onclick = function() {
                _petHidden = false;
                petWrap.style.opacity = '1';
                petWrap.style.pointerEvents = 'auto';
                restore.remove();
                setPetState('happy');
                sparkles();
                showBubble('我回来啦！想我了吗~🐱', 'ai', 4000);
                setTimeout(function() { setPetState('idle'); pickNewTarget(); setPetState('walking'); }, 2000);
            };
            document.body.appendChild(restore);
        };

        // ═══════════════════════════════════════════════════════════════
        // ===== 自主行为系统 =====
        // ═══════════════════════════════════════════════════════════════

        // ---- 时间问候 ----
        var getTimeGreeting = function() {
            var h = new Date().getHours();
            if (h >= 5 && h < 9) return _pick(['早上好呀~今天也要元气满满哦！☀️', '早安！新的一天开始啦，加油~🐱', '哇~你起得真早！带我去看看今天的世界吧~✨']);
            if (h >= 9 && h < 12) return _pick(['上午好~工作/学习之余也要记得休息哦~☕', '嘿，到中午啦，记得吃午饭！🍱', '上午过了一半啦，进展如何？🐱']);
            if (h >= 12 && h < 14) return _pick(['午安~吃完午饭可以小憩一下哦~😴', '中午啦！别忘吃饭呀，饿着肚子我会心疼的~🥺', '午休时间到~给自己充充电吧！⚡']);
            if (h >= 14 && h < 18) return _pick(['下午好~来杯下午茶提提神？🍵', '下午时光漫漫，一起聊聊天吧~💬', '嘿~伸个懒腰活动活动吧！🧘']);
            if (h >= 18 && h < 22) return _pick(['晚上好~辛苦一天啦，放松一下吧~🌙', '夜晚来啦~今天过得怎么样？🐱', '晚上好呀~要不要跟我聊聊天解解闷？💬']);
            return _pick(['夜深了~注意休息，别熬太晚哦！🌙', '这么晚还不睡？我陪你一会儿~🥺', '嘘~深夜了，悄悄说晚安吧~💤', '该睡觉啦！熬夜对身体不好哦~😴']);
        };

        // ---- 天气获取 ----
        var getWeather = async function() {
            // 缓存30分钟
            if (weatherCache && Date.now() - weatherCacheTime < 1800000) return weatherCache;
            try {
                var res = await _rs('curl -s --max-time 8 "https://wttr.in/?format=%l|%t|%C|%h|%w|%p" 2>/dev/null', 12000);
                var text = String(res.content || '').trim();
                if (text && text.indexOf('|') >= 0 && text.indexOf('Unknown') < 0) {
                    var parts = text.split('|');
                    weatherCache = {
                        location: (parts[0] || '').trim(),
                        temp: (parts[1] || '').trim().replace('+', ''),
                        condition: (parts[2] || '').trim(),
                        humidity: (parts[3] || '').trim(),
                        wind: (parts[4] || '').trim(),
                        precipitation: (parts[5] || '').trim()
                    };
                    weatherCacheTime = Date.now();
                    return weatherCache;
                }
            } catch(e) {}
            // 降级：尝试设备传感器温度
            try {
                var tRes = await _rs('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null', 3000);
                var rawTemp = parseInt(String(tRes.content || '').trim());
                if (rawTemp > 1000) rawTemp = rawTemp / 1000;
                if (rawTemp > 0 && rawTemp < 100) {
                    weatherCache = { location: '设备位置', temp: rawTemp.toFixed(1) + '°C', condition: '设备传感器', humidity: '--', wind: '--', precipitation: '--', isDeviceTemp: true };
                    weatherCacheTime = Date.now();
                    return weatherCache;
                }
            } catch(e) {}
            return null;
        };

        // ---- 穿衣/活动建议 ----
        var suggestClothing = function(tempStr) {
            var t = parseFloat(tempStr);
            if (isNaN(t)) return '天气信息没拿到，建议出门前看看天气预报哦~';
            var temp = t.toFixed(0) + '°C';
            if (t >= 33) return '今天' + temp + '，热炸了！穿短袖短裤凉鞋，多喝水防中暑，适合在有空调的室内活动🏊';
            if (t >= 28) return '今天' + temp + '，挺热的。穿短袖薄裤，出门记得防晒打伞，适合早晚户外活动🌳';
            if (t >= 22) return '今天' + temp + '，温度正好。穿短袖或薄长袖都行，非常适合户外散步、运动🚶';
            if (t >= 15) return '今天' + temp + '，凉爽舒适。穿长袖加薄外套，适合户外活动、逛公园🍃';
            if (t >= 8) return '今天' + temp + '，有点冷了。穿厚外套或风衣，外出注意保暖，适合室内活动🧥';
            if (t >= 0) return '今天' + temp + '，很冷！穿棉衣羽绒服戴围巾，尽量减少户外活动🧣';
            return '今天' + temp + '，极寒！穿最厚的衣服，非必要不出门🥶';
        };

        var suggestActivity = function(tempStr, condition) {
            var t = parseFloat(tempStr);
            var cond = (condition || '').toLowerCase();
            if (isNaN(t)) return '';
            var activities = [];
            if (cond.indexOf('rain') >= 0 || cond.indexOf('雨') >= 0) {
                activities.push('今天有雨，记得带伞，适合室内活动');
            } else if (cond.indexOf('snow') >= 0 || cond.indexOf('雪') >= 0) {
                activities.push('今天下雪，注意保暖防滑');
            } else if (cond.indexOf('clear') >= 0 || cond.indexOf('晴') >= 0) {
                if (t >= 15 && t <= 28) activities.push('天气晴朗温度宜人，非常适合出门走走');
                else if (t > 28) activities.push('虽然晴天但太热，建议早晚出门');
                else activities.push('虽然晴天但较冷，注意保暖');
            } else if (cond.indexOf('cloud') >= 0 || cond.indexOf('阴') >= 0) {
                activities.push('多云天气，不晒不热，适合户外活动');
            }
            if (t > 30) activities.push('高温天注意防暑降温，多喝水');
            if (t < 5) activities.push('低温天注意保暖，穿厚点');
            return activities.length > 0 ? activities.join('；') : '';
        };

        // ---- 天气播报 ----
        var doWeatherReport = async function(manual) {
            showBubble('正在查天气...🌤️', 'user', 0);
            var w = await getWeather();
            if (!w) {
                showBubble('呜...天气信息获取失败，可能是网络问题，稍后再试吧~', 'warn', 5000);
                return;
            }
            var msg = '📍 ' + w.location + '\n🌡️ ' + w.temp;
            if (w.condition && !w.isDeviceTemp) msg += ' · ' + w.condition;
            if (w.humidity && w.humidity !== '--') msg += '\n💧 湿度 ' + w.humidity;
            if (w.wind && w.wind !== '--') msg += ' · 💨 ' + w.wind;
            showBubble(msg, 'ai', 6000);
            // 延迟后显示穿衣建议
            setTimeout(function() {
                var clothing = suggestClothing(w.temp);
                var activity = suggestActivity(w.temp, w.condition);
                var suggestion = clothing;
                if (activity) suggestion += '\n\n' + activity;
                showBubble(suggestion, 'ai', 8000);
            }, 6500);
        };

        // ---- 设备状态汇报 ----
        var doDeviceReport = async function(manual) {
            showBubble('正在体检设备...📊', 'user', 0);
            try {
                var cmds = [
                    'cat /sys/class/power_supply/battery/capacity 2>/dev/null',
                    'cat /sys/class/power_supply/battery/status 2>/dev/null',
                    'cat /sys/class/power_supply/battery/temperature 2>/dev/null',
                    'cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null',
                    'df -h /data 2>/dev/null | tail -1',
                    'free -m 2>/dev/null | head -2'
                ];
                var res = await _rs(cmds.join('; echo "|||"'), 8000);
                var parts = String(res.content || '').split('|||');
                var battCap = (parts[0] || '').trim();
                var battStatus = (parts[1] || '').trim();
                var battTemp = (parts[2] || '').trim();
                var cpuTempRaw = (parts[3] || '').trim();
                var disk = (parts[4] || '').trim();
                var mem = (parts[5] || '').trim();

                var msg = '📋 设备体检报告\n';
                if (battCap) {
                    var pct = parseInt(battCap);
                    msg += '🔋 电量: ' + battCap + '%';
                    if (battStatus) msg += ' (' + (battStatus === 'Charging' ? '充电中' : battStatus) + ')';
                    if (pct < 20) msg += ' ⚠️ 电量低，记得充电！';
                    msg += '\n';
                }
                if (battTemp) {
                    var bt = parseInt(battTemp);
                    if (bt > 100) bt = bt / 10;
                    msg += '🌡️ 电池温度: ' + bt.toFixed(1) + '°C';
                    if (bt > 45) msg += ' ⚠️ 温度过高！';
                    msg += '\n';
                }
                if (cpuTempRaw) {
                    var ct = parseInt(cpuTempRaw);
                    if (ct > 1000) ct = ct / 1000;
                    msg += '🔥 CPU温度: ' + ct.toFixed(1) + '°C';
                    if (ct > 70) msg += ' ⚠️ CPU过热！';
                    msg += '\n';
                }
                if (disk) {
                    var diskParts = disk.split(/\s+/);
                    if (diskParts.length >= 5) {
                        msg += '💾 存储: 已用' + diskParts[2] + '/' + diskParts[1];
                        var usage = diskParts[4];
                        if (usage && parseInt(usage) > 85) msg += ' ⚠️ 空间不足！';
                        msg += '\n';
                    }
                }
                if (mem) {
                    var memLines = mem.split('\n');
                    var memLine = memLines[1] || '';
                    var memParts = memLine.split(/\s+/);
                    if (memParts.length >= 4) {
                        var total = parseInt(memParts[1]) || 0;
                        var used = parseInt(memParts[2]) || 0;
                        if (total > 0) {
                            var memPct = Math.round(used / total * 100);
                            msg += '🧠 内存: ' + memPct + '% (' + used + '/' + total + 'MB)';
                            if (memPct > 85) msg += ' ⚠️ 内存紧张！';
                        }
                    }
                }
                if (msg === '📋 设备体检报告\n') msg += '暂未获取到设备信息';
                showBubble(msg, 'ai', 8000);
                if (msg.indexOf('⚠️') >= 0) setPetState('happy'); else setPetState('happy');
                sparkles();
                setTimeout(function() { setPetState('idle'); }, 2000);
            } catch(e) {
                showBubble('体检出了点小问题，稍后再试~', 'warn', 4000);
            }
        };

        // ---- 版本更新检查 ----
        var doUpdateCheck = async function(manual) {
            if (Date.now() - updateCheckCooldown < 60000 && !manual) return;
            updateCheckCooldown = Date.now();
            showBubble('正在检查更新...📦', 'user', 0);
            try {
                var res = await _rs('curl -s --max-time 8 "https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/_latest.json" 2>/dev/null', 12000);
                var text = String(res.content || '').trim();
                if (text) {
                    try {
                        var manifest = JSON.parse(text);
                        var latest = String(manifest.rev || '').trim();
                        var cur = PLUGIN_VERSION;
                        // 版本比较
                        var curP = cur.split('.').map(function(n) { return parseInt(n) || 0; });
                        var latP = latest.split('.').map(function(n) { return parseInt(n) || 0; });
                        var hasUpdate = false;
                        for (var i = 0; i < 3; i++) {
                            if ((latP[i] || 0) > (curP[i] || 0)) { hasUpdate = true; break; }
                            if ((latP[i] || 0) < (curP[i] || 0)) break;
                        }
                        if (hasUpdate) {
                            var changelog = '';
                            if (manifest.changelog && manifest.changelog.length > 0) {
                                manifest.changelog.forEach(function(cl) {
                                    if (cl.items && cl.items.length > 0) {
                                        changelog += (cl.title || '') + ': ' + cl.items.join(', ') + '\n';
                                    }
                                });
                            }
                            var msg = '🎉 发现新版本！\n当前: v' + cur + '\n最新: v' + latest;
                            if (changelog) msg += '\n\n' + changelog;
                            msg += '\n\n去AI助手或设置里检查更新吧~';
                            showBubble(msg, 'ai', 10000);
                            _toast('宠物发现新版本 v' + latest + '！快去更新吧~', 'green', 5000);
                        } else {
                            if (manual) showBubble('当前已是最新版本 v' + cur + ' ✅', 'ai', 4000);
                        }
                    } catch(e2) {
                        if (manual) showBubble('版本信息解析失败，稍后再试~', 'warn', 4000);
                    }
                } else {
                    if (manual) showBubble('网络不通，检查不到更新信息~', 'warn', 4000);
                }
            } catch(e) {
                if (manual) showBubble('检查更新出了点问题~', 'warn', 4000);
            }
        };

        // ---- 电池低电量提醒 ----
        var checkBatteryLow = async function() {
            try {
                var res = await _rs('cat /sys/class/power_supply/battery/capacity 2>/dev/null', 3000);
                var cap = parseInt(String(res.content || '').trim());
                if (!isNaN(cap) && cap > 0 && cap < 20) {
                    var chargingRes = await _rs('cat /sys/class/power_supply/battery/status 2>/dev/null', 2000);
                    if (String(chargingRes.content || '').trim() !== 'Charging') {
                        showBubble('⚠️ 电量只剩' + cap + '%啦！快去充电吧，不然我就要断电了~🥺', 'warn', 8000);
                    }
                }
            } catch(e) {}
        };

        // ---- 温度异常提醒 ----
        var checkTempHigh = async function() {
            try {
                var res = await _rs('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null', 3000);
                var temp = parseInt(String(res.content || '').trim());
                if (temp > 1000) temp = temp / 1000;
                if (temp > 75) {
                    showBubble('🔥 CPU温度' + temp.toFixed(1) + '°C有点高！歇一歇降降温吧~', 'warn', 6000);
                }
            } catch(e) {}
        };

        // ---- 随机闲聊 ----
        var randomChats = [
            '嘿~你在忙什么呢？🐱',
            '今天心情怎么样呀？',
            '我刚才做了个好梦，梦到变成了一只大老虎~😹',
            '你知道吗？我可是会帮你盯着设备的哦~💪',
            '好无聊啊，来聊聊天嘛~💬',
            '悄悄告诉你，我觉得你今天特别棒！✨',
            '我在巡逻屏幕呢，一切正常！🐱',
            '要不要我给你讲个猫笑话？算了怕你嫌冷~😅',
            '坐久了记得站起来活动活动哦~🧘',
            '喝水了吗？没喝的话快去喝一口！💧'
        ];

        var doRandomChat = async function() {
            // 有AI时偶尔用AI生成，否则用预设
            if (Math.random() < 0.4 && typeof window._petSendToAI === 'function') {
                var reply = await sendToAI('随机说一句有趣的话跟我打招呼，15字以内');
                if (reply) { showBubble(reply, 'ai', 6000); return; }
            }
            showBubble(_pick(randomChats), 'ai', 6000);
        };

        // ---- 自主行为调度 ----
        var lastGreetingHour = -1;
        var lastWeatherTime = 0;
        var lastStatusTime = 0;
        var lastUpdateCheckTime = 0;
        var lastRandomChatTime = 0;
        var lastBatteryCheckTime = 0;
        var lastTempCheckTime = 0;

        var behaviorLoop = function() {
            if (_petHidden) { setTimeout(behaviorLoop, 30000); return; }
            var now = Date.now();
            var hour = new Date().getHours();

            // 时间问候（每小时一次）
            if (hour !== lastGreetingHour) {
                lastGreetingHour = hour;
                // 只在白天7-23点主动问候
                if (hour >= 7 && hour <= 23) {
                    setTimeout(function() {
                        if (!_petHidden && petState !== 'sleeping') {
                            showBubble(getTimeGreeting(), 'ai', 6000);
                        }
                    }, _rand(1000, 5000));
                }
            }

            // 天气播报（每3小时，早上8点/中午12点/下午4点附近）
            if (now - lastWeatherTime > 10800000 && (hour === 8 || hour === 12 || hour === 16)) {
                lastWeatherTime = now;
                setTimeout(function() {
                    if (!_petHidden && petState !== 'sleeping') doWeatherReport(false);
                }, _rand(2000, 8000));
            }

            // 设备状态（每2小时）
            if (now - lastStatusTime > 7200000) {
                lastStatusTime = now;
                setTimeout(function() {
                    if (!_petHidden && petState !== 'sleeping') doDeviceReport(false);
                }, _rand(5000, 15000));
            }

            // 版本更新检查（每6小时）
            if (now - lastUpdateCheckTime > 21600000) {
                lastUpdateCheckTime = now;
                setTimeout(function() {
                    if (!_petHidden) doUpdateCheck(false);
                }, _rand(10000, 30000));
            }

            // 随机闲聊（每20-40分钟）
            if (now - lastRandomChatTime > _rand(1200000, 2400000)) {
                lastRandomChatTime = now;
                setTimeout(function() {
                    if (!_petHidden && petState !== 'sleeping' && petState !== 'thinking') doRandomChat();
                }, _rand(1000, 5000));
            }

            // 电池低电量检查（每30分钟）
            if (now - lastBatteryCheckTime > 1800000) {
                lastBatteryCheckTime = now;
                checkBatteryLow();
            }

            // 温度检查（每15分钟）
            if (now - lastTempCheckTime > 900000) {
                lastTempCheckTime = now;
                checkTempHigh();
            }

            // 夜晚自动睡觉（22:30以后）
            if (hour >= 23 && petState === 'idle') {
                if (Math.random() < 0.3) {
                    setPetState('sleeping');
                    showBubble('好困...先睡啦，晚安~💤', 'ai', 4000);
                    setTimeout(function() { setPetState('idle'); pickNewTarget(); setPetState('walking'); }, 30000);
                }
            }

            setTimeout(behaviorLoop, 60000); // 每分钟检查一次
        };

        // ---- 窗口大小变化 ----
        window.addEventListener('resize', function() {
            petX = Math.min(petX, window.innerWidth - 80);
            petY = Math.min(petY, window.innerHeight - 100);
            targetX = Math.min(targetX, window.innerWidth - 80);
            targetY = Math.min(targetY, window.innerHeight - 100);
            updatePosition();
        });

        // ---- 启动 ----
        setPetState('idle');
        updatePosition();
        pickNewTarget();
        setPetState('walking');
        requestAnimationFrame(walkLoop);

        // 启动后欢迎
        setTimeout(function() {
            showBubble('喵~我是你的桌面宠物猫🐱\n点击我可以聊天，长按打开菜单~\n我会帮你盯着设备、播报天气、提醒更新哦！', 'ai', 8000);
            setPetState('happy');
            sparkles();
            setTimeout(function() { setPetState('idle'); }, 3000);
        }, 2000);

        // 启动自主行为（延迟30秒让面板先加载）
        setTimeout(function() {
            behaviorLoop();
        }, 30000);

        console.log('[DesktopPet] 桌面宠物模块已启动 v1.0');
    })();
// ── sdm-pet 插件结束 ──