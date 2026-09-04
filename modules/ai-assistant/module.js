// Version: 1.0.0
//@@SDM_MODULE_ai-assistant@@
(function(SDM) {
    'use strict';
    var MODULE_ID = 'ai-assistant';

    // Register panel with the framework
    SDM.registerPanel(MODULE_ID, '<div style="display:none" id="ai_assistant_module_marker"></div>');

    // Find or create action box for toolbar buttons
    var actionBox = document.querySelector('#SMART_action_box') || document.body;

    // ================================================================
    // Module: Music Player + AI Assistant + Desktop Pet
    // Extracted from sdm.js and adapted for the SDM modular framework.
    // All runShellWithRoot->SDM.runShell, createToast->SDM.toast,
    // addLog->SDM.addLog, addDiagLog->SDM.addDiagLog,
    // getCachedEl->SDM.getCachedEl replacements applied.
    // ================================================================

    // 🎵 音乐播放器
    var musicBtn = document.createElement('button')
    musicBtn.textContent = '🎵 音乐'
    musicBtn.className = 'smart_action_btn'
    musicBtn.style.cssText = 'font-size:.55rem;padding:8px 16px;background:linear-gradient(135deg,#f9a8d4,#f472b6,#ec4899);background-size:200% 100%;animation:sdm2_rainbow_flow 6s linear infinite, sdm2_glow_breath 3.5s ease-in-out infinite;color:white;border:1px solid rgba(249,168,212,.5);'
    musicBtn.onclick = function() { toggleMusicPlayer() }
    actionBox.appendChild(musicBtn)

    // 🤖 AI 智能助手
    var aiBtn = document.createElement('button')
    aiBtn.textContent = '🤖 AI助手'
    aiBtn.className = 'smart_action_btn'
    aiBtn.style.cssText = 'font-size:.55rem;padding:8px 16px;background:linear-gradient(135deg,#d8b4fe,#c084fc,#a855f7);background-size:200% 100%;animation:sdm2_rainbow_flow 6s linear infinite, sdm2_glow_breath 3.5s ease-in-out infinite;color:white;border:1px solid rgba(216,180,254,.5);'
    aiBtn.onclick = function() { toggleAIPanel() }
    actionBox.appendChild(aiBtn)

    ;(function() {
        // ---- 状态 ----
        var _playlist = []        // {url, title, lrc}
        var _currentIndex = -1
        var _audio = null
        var _lrcData = []          // [{time, text}]
        var _lrcLineIndex = -1
        var _isPlaying = false
        var _panelVisible = false
        var _lyricsOverlayVisible = false
        var _progressTimer = null
        var _playMode = 'sequence'   // 'sequence' 顺序播放 | 'single' 单曲循环
        var _retryCount = 0          // 播放失败重试计数（防止无限重试）
        var _bgPlayEnabled = false   // 后台持续播放开关
        var _wakeLock = null         // WakeLock 实例
        var _bgKeepAliveTimer = null  // 后台保活定时器
        var _autoPlayEnabled = false  // 打开页面自动续播

        // ---- 从 localStorage 恢复 ----
        try {
            var saved = localStorage.getItem('smart_music_playlist')
            if (saved) _playlist = JSON.parse(saved) || []
        } catch(e) {}
        try { _playMode = localStorage.getItem('smart_music_playmode') || 'sequence' } catch(e) {}
        try { _bgPlayEnabled = localStorage.getItem('smart_music_bgplay') === '1' } catch(e) {}
        try { _autoPlayEnabled = localStorage.getItem('smart_music_autoplay') === '1' } catch(e) {}

        var savePlaylist = function() {
            try { localStorage.setItem('smart_music_playlist', JSON.stringify(_playlist)) } catch(e) {}
        }

        // ---- 收藏列表 ----
        var _favorites = []
        try {
            var savedFav = localStorage.getItem('smart_music_favorites')
            if (savedFav) _favorites = JSON.parse(savedFav) || []
        } catch(e) {}

        var saveFavorites = function() {
            try { localStorage.setItem('smart_music_favorites', JSON.stringify(_favorites)) } catch(e) {}
        }

        var isFavorited = function(songId) {
            return _favorites.some(function(f) { return f.id === songId })
        }

        var toggleFavorite = function(song) {
            if (!song || !song.id) return
            var idx = _favorites.findIndex(function(f) { return f.id === song.id })
            if (idx >= 0) {
                _favorites.splice(idx, 1)
                showToast('已取消收藏', 'pink', 1500)
            } else {
                _favorites.push({
                    id: song.id,
                    name: song.name || '',
                    artists: song.artists || [],
                    album: song.album || '',
                    platform: song.platform || '',
                    pfName: song.pfName || '',
                    songId: song.songId || song.id || '',
                    albumId: song.albumId || '',
                    duration: song.duration || 0
                })
                showToast('已收藏: ' + (song.name || '未知'), 'green', 1500)
            }
            saveFavorites()
            renderFavorites()
            renderSearchResults()
            renderPlaylist()
        }

        var renderFavorites = function() {
            var container = document.getElementById('sm_favorites_container')
            if (!container) return
            if (!_favorites.length) {
                container.innerHTML = '<div class="sm-empty" style="text-align:center;padding:30px 10px;color:rgba(255,255,255,.35);font-size:.75rem;">💗 暂无收藏<br><span style="font-size:.65rem;color:rgba(255,255,255,.25);">在搜索结果中点击 ♡ 即可收藏</span></div>'
                return
            }
            var html = ''
            for (var i = 0; i < _favorites.length; i++) {
                var fav = _favorites[i]
                var name = escapeHtml(fav.name || '未知歌曲')
                var artists = escapeHtml((fav.artists || []).join(' / '))
                var pfTag = fav.platform ? '<span class="sm-search-pf-tag _' + fav.platform + '">' + (fav.pfName || fav.platform) + '</span>' : ''
                var isCurrent = _currentIndex >= 0 && _playlist[_currentIndex] && _playlist[_currentIndex].pfId === fav.id
                html += '<div class="sm-fav-item' + (isCurrent ? ' _active' : '') + '" data-fav-idx="' + i + '">'
                    + pfTag
                    + '<span class="_fav-title">' + name + (artists ? ' - ' + artists : '') + '</span>'
                    + '<span class="_fav-del" data-fav-del="' + i + '">✕</span>'
                    + '</div>'
            }
            container.innerHTML = html
        }

        var playFavorite = async function(fav) {
            if (!fav || !fav.id) return
            // 检查是否已在播放列表
            for (var i = 0; i < _playlist.length; i++) {
                if (_playlist[i].pfId === fav.id) {
                    // 验证已有URL是否仍然有效，如果失效则重新获取
                    var existingUrl = _playlist[i].url || ''
                    var urlValid = true
                    if (existingUrl && _playlist[i].songRef) {
                        urlValid = await validateAudioUrl(existingUrl)
                    }
                    if (urlValid) {
                        loadSong(i)
                        play()
                        renderFavorites()
                        return
                    }
                    // URL已过期，重新获取
                    showToast('播放地址已过期，正在重新获取...', 'pink', 3000)
                    var newUrl = await getPlayUrl(_playlist[i].songRef)
                    if (newUrl) {
                        _playlist[i].url = newUrl
                        savePlaylist()
                        renderPlaylist()
                        loadSong(i)
                        play()
                        renderFavorites()
                        return
                    }
                    // 重新获取也失败，从播放列表移除旧条目，走下方重新添加流程
                    _playlist.splice(i, 1)
                    savePlaylist()
                    renderPlaylist()
                    break
                }
            }
            showToast('正在获取播放地址...', 'pink', 2000)
            // 构造song对象
            var song = {
                id: fav.id,
                name: fav.name,
                artists: fav.artists || [],
                album: fav.album || '',
                platform: fav.platform || '',
                pfName: fav.pfName || '',
                songId: fav.songId || fav.id || '',
                albumId: fav.albumId || '',
                duration: fav.duration || 0
            }
            var playUrl = await getPlayUrl(song)
            if (!playUrl) {
                showToast('获取播放地址失败，该歌曲可能需要VIP', 'red', 4000)
                return
            }
            var title = (fav.artists && fav.artists.length ? fav.artists.join(' / ') + ' - ' : '') + (fav.name || '未知歌曲')
            _playlist.push({ url: playUrl, title: title, lrc: '', pfId: fav.id, platform: fav.platform, songRef: song })
            savePlaylist()
            renderPlaylist()
            loadSong(_playlist.length - 1)
            play()
            renderFavorites()
            showToast('正在播放: ' + title + ' [' + (_playMode === 'single' ? '单曲循环' : '顺序播放') + ']', 'green', 2500)
            // 异步获取歌词
            fetchLyricsForSong(song)
        }

        // ---- LRC 解析 ----
        var parseLRC = function(lrcText) {
            if (!lrcText || !lrcText.trim()) return []
            var lines = lrcText.split('\n')
            var result = []
            var timeReg = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i]
                var matches = []
                var m
                timeReg.lastIndex = 0
                while ((m = timeReg.exec(line)) !== null) {
                    var min = parseInt(m[1]) || 0
                    var sec = parseInt(m[2]) || 0
                    var ms = m[3] ? parseInt(m[3]) : 0
                    if (m[3] && m[3].length === 2) ms = parseInt(m[3]) * 10
                    var time = min * 60 + sec + ms / 1000
                    matches.push(time)
                }
                var text = line.replace(timeReg, '').trim()
                if (matches.length === 0) continue
                // 跳过元数据行（没有文本且有特殊标记）
                if (!text && matches.length > 0) continue
                for (var j = 0; j < matches.length; j++) {
                    result.push({ time: matches[j], text: text })
                }
            }
            result.sort(function(a, b) { return a.time - b.time })
            return result
        }

        // ---- 查找当前歌词行 ----
        var findLrcIndex = function(currentTime) {
            if (!_lrcData.length) return -1
            for (var i = _lrcData.length - 1; i >= 0; i--) {
                if (currentTime >= _lrcData[i].time) return i
            }
            return -1
        }

        // ---- CSS 样式 ----
        var style = document.createElement('style')
        style.textContent = `
        #smart_music_panel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 380px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
            z-index: 100000; border-radius: 18px; padding: 0;
            background: linear-gradient(135deg, rgba(30,20,35,.97), rgba(45,25,50,.97), rgba(35,28,55,.97));
            border: 1px solid rgba(255,182,193,.45);
            box-shadow: 0 8px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(255,182,193,.2), 0 0 36px rgba(255,158,205,.25), 0 0 60px rgba(167,139,250,.18);
            display: none; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #smart_music_panel._show { display: block; animation: smart_music_fadein .25s ease; }
        @keyframes smart_music_fadein { from { opacity:0; transform:translate(-50%,-48%) } to { opacity:1; transform:translate(-50%,-50%) } }
        #smart_music_overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,.45); z-index: 99999; display: none;
        }
        #smart_music_overlay._show { display: block; }
        #smart_music_lyrics_bar {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            z-index: 100001; max-width: 80vw; text-align: center; cursor: grab;
            display: none; user-select: none; -webkit-user-select: none;
            touch-action: none;
        }
        #smart_music_lyrics_bar._dragging { cursor: grabbing; opacity: .85; }
        #smart_music_lyrics_bar._show { display: block; animation: smart_lyric_pop .3s ease; }
        @keyframes smart_lyric_pop { from { opacity:0; transform:translateX(-50%) translateY(8px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }
        #smart_music_lyrics_bar .lyric-current {
            font-size: 18px; font-weight: 900; line-height: 1.5;
            color: #fff;
            text-shadow: 
                0 0 2px #000,
                0 0 4px #000,
                0 0 8px rgba(0,0,0,.8),
                0 2px 6px rgba(0,0,0,.9),
                0 0 20px rgba(255,182,193,.5);
            background: linear-gradient(135deg, rgba(0,0,0,.65), rgba(20,10,30,.7));
            backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
            padding: 12px 32px; border-radius: 32px;
            border: 2px solid rgba(255,182,193,.35);
            box-shadow: 
                0 6px 28px rgba(0,0,0,.5),
                0 0 0 1px rgba(255,255,255,.06),
                inset 0 1px 0 rgba(255,255,255,.1);
            display: inline-block; max-width: 80vw; word-break: break-word;
            letter-spacing: .3px;
        }
        #smart_music_lyrics_bar .lyric-next {
            font-size: 13px; color: rgba(255,255,255,.7); margin-top: 6px;
            text-shadow: 0 1px 4px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.6);
            font-weight: 500;
        }
        .sm-section { padding: 12px 16px; }
        .sm-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 14px 16px; border-bottom: 1px solid rgba(255,182,193,.15);
            background: linear-gradient(135deg, rgba(255,182,193,.08), rgba(167,139,250,.06));
            border-radius: 18px 18px 0 0;
        }
        .sm-title { font-size: 15px; font-weight: bold; background: linear-gradient(90deg,#ff9ecd,#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .sm-close { background: rgba(255,255,255,.1); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .2s; }
        .sm-close:hover { background: rgba(255,100,100,.3); }
        .sm-input {
            width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 10px;
            border: 1px solid rgba(255,182,193,.2); background: rgba(255,255,255,.06);
            color: #fff; font-size: 13px; outline: none; transition: border-color .2s;
        }
        .sm-input:focus { border-color: rgba(255,182,193,.5); }
        .sm-input::placeholder { color: rgba(255,255,255,.35); }
        .sm-btn {
            border: none; border-radius: 10px; padding: 8px 16px; font-size: 13px;
            font-weight: bold; color: #fff; cursor: pointer; transition: all .2s;
        }
        .sm-btn:active { transform: scale(.95); }
        .sm-btn-add { background: linear-gradient(135deg,#f472b6,#ec4899); }
        .sm-btn-play { background: linear-gradient(135deg,#22c55e,#16a34a); }
        .sm-btn-pause { background: linear-gradient(135deg,#f59e0b,#d97706); }
        .sm-btn-prev { background: linear-gradient(135deg,#60a5fa,#3b82f6); }
        .sm-btn-next { background: linear-gradient(135deg,#60a5fa,#3b82f6); }
        .sm-btn-lrc { background: linear-gradient(135deg,#a78bfa,#8b5cf6); }
        .sm-btn-scan { background: linear-gradient(135deg,#06b6d4,#0891b2); }
        .sm-btn-del { background: rgba(239,68,68,.2); color: rgba(252,165,165,1); border: 1px solid rgba(239,68,68,.3); padding: 4px 10px; font-size: 11px; }
        .sm-btn-del:hover { background: rgba(239,68,68,.35); }
        .sm-playlist-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 12px; border-radius: 10px; margin-bottom: 4px;
            background: rgba(255,255,255,.04); border: 1px solid transparent;
            cursor: pointer; transition: all .15s; font-size: 13px;
        }
        .sm-playlist-item:hover { background: rgba(255,182,193,.08); }
        .sm-playlist-item._active { background: linear-gradient(135deg, rgba(255,182,193,.15), rgba(167,139,250,.1)); border-color: rgba(255,182,193,.3); }
        .sm-playlist-item ._title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-playlist-item ._del { flex-shrink: 0; margin-left: 8px; }
        .sm-fav-item { display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .2s;border:1px solid transparent; }
        .sm-fav-item:hover { background:rgba(244,114,182,.08);border-color:rgba(244,114,182,.12); }
        .sm-fav-item._active { background:linear-gradient(135deg,rgba(244,114,182,.12),rgba(236,72,153,.08));border-color:rgba(244,114,182,.2); }
        .sm-fav-item ._fav-title { flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;color:#e2e8f0; }
        .sm-fav-item ._fav-pf { font-size:.6rem;padding:1px 5px;border-radius:4px;flex-shrink:0; }
        .sm-fav-item ._fav-del { flex-shrink:0;font-size:.6rem;color:#f87171;cursor:pointer;padding:2px 6px;border-radius:4px; }
        .sm-fav-item ._fav-del:hover { background:rgba(248,113,113,.15); }
        .sm-fav-btn { cursor:pointer;font-size:.85rem;flex-shrink:0;padding:2px 4px;transition:transform .15s; }
        .sm-fav-btn:hover { transform:scale(1.2); }
        .sm-fav-btn._active { color:#f472b6; }
        .sm-controls { display: flex; align-items: center; gap: 8px; justify-content: center; flex-wrap: wrap; }
        .sm-seek-wrap { width: 100%; margin-top: 8px; display: flex; align-items: center; gap: 8px; }
        .sm-seek-bar { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,.15); cursor: pointer; position: relative; overflow: hidden; }
        .sm-seek-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg,#ff9ecd,#a78bfa); width: 0%; transition: width .1s linear; }
        .sm-time { font-size: 11px; color: rgba(255,255,255,.5); font-variant-numeric: tabular-nums; min-width: 36px; text-align: center; }
        .sm-vol-wrap { display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 6px; }
        .sm-vol-bar { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,.15); cursor: pointer; position: relative; overflow: hidden; }
        .sm-vol-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg,#4ade80,#22c55e); width: 80%; }
        .sm-tab-bar { display: flex; gap: 4px; margin-bottom: 10px; }
        .sm-tab { flex: 1; text-align: center; padding: 8px; border-radius: 10px; font-size: 13px; font-weight: bold; cursor: pointer; background: rgba(255,255,255,.05); color: rgba(255,255,255,.5); border: 1px solid transparent; transition: all .2s; }
        .sm-tab._active { background: linear-gradient(135deg, rgba(255,182,193,.15), rgba(167,139,250,.1)); color: #ff9ecd; border-color: rgba(255,182,193,.25); }
        .sm-lrc-area { width: 100%; box-sizing: border-box; height: 120px; resize: vertical; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,182,193,.2); background: rgba(255,255,255,.06); color: #fff; font-size: 12px; line-height: 1.6; outline: none; font-family: monospace; }
        .sm-lrc-area:focus { border-color: rgba(255,182,193,.5); }
        .sm-now-playing { text-align: center; font-size: 13px; font-weight: bold; color: #ff9ecd; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-empty { text-align: center; padding: 20px; color: rgba(255,255,255,.3); font-size: 13px; }
        .sm-hint { font-size: 11px; color: rgba(255,255,255,.3); margin-top: 6px; line-height: 1.5; }
        .sm-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .sm-switch { position: relative; width: 40px; height: 22px; border-radius: 11px; background: rgba(255,255,255,.15); cursor: pointer; transition: background .25s; flex-shrink: 0; }
        .sm-switch._on { background: linear-gradient(135deg,#ff9ecd,#a78bfa); }
        .sm-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .25s; }
        .sm-switch._on::after { transform: translateX(18px); }
        .sm-switch-label { font-size: 12px; color: rgba(255,255,255,.7); }
        .sm-search-item { display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:10px;margin-bottom:4px;background:rgba(255,255,255,.04);border:1px solid transparent;cursor:pointer;transition:all .15s; }
        .sm-search-item:hover { background:rgba(255,100,100,.08);border-color:rgba(255,100,100,.15); }
        .sm-search-item._loading { opacity:.4;pointer-events:none; }
        .sm-search-info { flex:1;overflow:hidden; }
        .sm-search-title { font-size:12px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sm-search-artist { font-size:10px;color:rgba(255,255,255,.4);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sm-search-dur { font-size:10px;color:rgba(255,255,255,.3);flex-shrink:0;margin-left:6px; }
        .sm-search-playing { color:#4ade80;font-size:10px;flex-shrink:0;margin-left:6px; }
        .sm-search-loading { text-align:center;padding:16px;color:rgba(255,255,255,.3);font-size:12px; }
        .sm-pf-btn { font-size:10px;padding:2px 10px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.05);color:rgba(255,255,255,.4);border:1px solid transparent;transition:all .2s; }
        .sm-pf-btn._on { background:rgba(236,72,153,.15);color:#f9a8d4;border-color:rgba(236,72,153,.3); }
        .sm-pf-btn._searching { background:rgba(99,102,241,.2);color:#a5b4fc;border-color:rgba(99,102,241,.3); }
        .sm-search-pf-tag { font-size:9px;padding:1px 6px;border-radius:6px;margin-right:4px;font-weight:bold;display:inline-block;flex-shrink:0; }
        .sm-search-pf-tag._netease { background:rgba(239,68,68,.15);color:#f87171; }
        .sm-search-pf-tag._qq { background:rgba(59,130,246,.15);color:#60a5fa; }
        .sm-search-pf-tag._kugou { background:rgba(34,197,94,.15);color:#4ade80; }
        .sm-search-pf-tag._kuwo { background:rgba(234,179,8,.15);color:#fbbf24; }
        .sm-search-pf-tag._migu { background:rgba(168,85,247,.15);color:#c084fc; }
        `
        document.head.appendChild(style)

        // ---- 创建面板 HTML ----
        var overlay = document.createElement('div')
        overlay.id = 'smart_music_overlay'
        document.body.appendChild(overlay)

        var panel = document.createElement('div')
        panel.id = 'smart_music_panel'
        panel.innerHTML = `
            <div class="sm-header">
                <span class="sm-title">🎵 音乐播放器</span>
                <div style="display:flex;align-items:center;">
                    <span class="sm-minimize-btn" id="sm_minimize_btn" title="最小化为小窗">📌</span>
                    <button class="sm-close" id="sm_close_btn">×</button>
                </div>
            </div>

            <div class="sm-section">
                <div class="sm-now-playing" id="sm_now_playing">未播放</div>
                <div class="sm-controls">
                    <button class="sm-btn sm-btn-prev" id="sm_prev_btn">⏮</button>
                    <button class="sm-btn sm-btn-play" id="sm_play_btn" style="min-width:64px">▶ 播放</button>
                    <button class="sm-btn sm-btn-next" id="sm_next_btn">⏭</button>
                    <button class="sm-btn" id="sm_mode_btn" style="min-width:48px;font-size:14px;background:linear-gradient(135deg,#f59e0b,#d97706);" title="点击切换播放模式">🔁</button>
                </div>
                <div class="sm-seek-wrap">
                    <span class="sm-time" id="sm_cur_time">0:00</span>
                    <div class="sm-seek-bar" id="sm_seek_bar"><div class="sm-seek-fill" id="sm_seek_fill"></div></div>
                    <span class="sm-time" id="sm_dur_time">0:00</span>
                </div>
                <div class="sm-vol-wrap">
                    <span style="font-size:12px">🔊</span>
                    <div class="sm-vol-bar" id="sm_vol_bar"><div class="sm-vol-fill" id="sm_vol_fill"></div></div>
                    <span class="sm-time" id="sm_vol_pct">80%</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:6px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:.5rem;opacity:.6;">后台播放</span>
                        <span class="sm-bg-switch" id="sm_bg_switch" title="开启后音乐在后台持续播放"></span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="sm-autoplay-label" style="font-size:.5rem;opacity:.6;">⏯ 自动续播</span>
                        <span class="sm-bg-switch" id="sm_autoplay_switch" title="开启后打开页面自动播放上次的歌曲"></span>
                    </div>
                </div>
            </div>

            <div class="sm-adb-section">
                <div style="font-size:.6rem;font-weight:bold;margin-bottom:6px;color:#60a5fa;">📱 设备播放</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <button class="sm-adb-btn" id="sm_adb_play_btn">▶ 推送到设备播放</button>
                    <button class="sm-adb-btn" id="sm_adb_stop_btn" style="background:linear-gradient(135deg,#ef4444,#dc2626);">⏹ 停止设备播放</button>
                </div>
                <div class="sm-adb-status" id="sm_adb_status">未连接设备</div>
            </div>

            <div class="sm-adb-section" style="background:linear-gradient(135deg,rgba(167,139,250,.08),rgba(236,72,153,.04));border-color:rgba(167,139,250,.2);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div style="font-size:.6rem;font-weight:bold;background:linear-gradient(135deg,#a78bfa,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">🔮 高级后台同步</div>
                    <span class="sm-bg-switch" id="sm_bgsync_switch" style="width:32px;height:18px;" title="开启后同步系统后台播放的音乐"></span>
                </div>
                <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                    <button class="sm-adb-btn" id="sm_bg_prev_btn" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);min-width:44px;">⏮</button>
                    <button class="sm-adb-btn" id="sm_bg_play_btn" style="background:linear-gradient(135deg,#10b981,#059669);min-width:60px;">▶ 播放</button>
                    <button class="sm-adb-btn" id="sm_bg_next_btn" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);min-width:44px;">⏭</button>
                </div>
                <div class="sm-adb-status" id="sm_bgsync_status">未开启同步</div>
            </div>

            <div class="sm-section" style="border-top:1px solid rgba(255,182,193,.1)">
                <div class="sm-tab-bar">
                    <div class="sm-tab _active" id="sm_tab_playlist">📋 播放列表</div>
                    <div class="sm-tab" id="sm_tab_favorites">❤️ 收藏</div>
                    <div class="sm-tab" id="sm_tab_lyrics">🎤 歌词</div>
                </div>

                <div id="sm_playlist_tab">
                    <div style="display:flex;gap:6px;margin-bottom:8px;">
                        <input type="text" class="sm-input" id="sm_search_input" placeholder="搜索歌曲/歌手（多平台聚合）..." style="flex:1" />
                        <button class="sm-btn sm-btn-search" id="sm_search_btn" style="background:linear-gradient(135deg,#ec4899,#8b5cf6)">🔍 Listen1搜索</button>
                    </div>
                    <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;" id="sm_platform_filter">
                        <span style="font-size:10px;color:rgba(255,255,255,.4);padding:2px 6px;">平台:</span>
                        <span class="sm-pf-btn _on" data-pf="netease">网易云</span>
                        <span class="sm-pf-btn _on" data-pf="qq">QQ音乐</span>
                        <span class="sm-pf-btn _on" data-pf="kugou">酷狗</span>
                        <span class="sm-pf-btn _on" data-pf="kuwo">酷我</span>
                        <span class="sm-pf-btn _on" data-pf="migu">咪咕</span>
                    </div>
                    <div id="sm_search_results" style="max-height:260px;overflow-y:auto;margin-bottom:10px;display:none"></div>
                    <div style="display:flex;gap:6px;margin-bottom:8px;border-top:1px dashed rgba(255,182,193,.12);padding-top:8px;">
                        <input type="text" class="sm-input" id="sm_url_input" placeholder="或粘贴音频直链 URL" style="flex:1" />
                        <input type="text" class="sm-input" id="sm_title_input" placeholder="歌名" style="width:90px" />
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:10px;">
                        <button class="sm-btn sm-btn-add" id="sm_add_btn" style="flex:1">➕ 添加</button>
                        <button class="sm-btn sm-btn-scan" id="sm_scan_btn">📱 扫描本地</button>
                    </div>
                    <div id="sm_playlist_container" style="max-height:200px;overflow-y:auto"></div>
                </div>

                <div id="sm_favorites_tab" style="display:none">
                    <div id="sm_favorites_container" style="max-height:350px;overflow-y:auto"></div>
                </div>

                <div id="sm_lyrics_tab" style="display:none">
                    <div style="display:flex;gap:6px;margin-bottom:8px;">
                        <input type="text" class="sm-input" id="sm_lrc_url_input" placeholder="粘贴 LRC 歌词直链 URL（可选）" style="flex:1" />
                        <button class="sm-btn sm-btn-scan" id="sm_fetch_lrc_btn">获取</button>
                    </div>
                    <textarea class="sm-lrc-area" id="sm_lrc_textarea" placeholder="粘贴 LRC 歌词到这里，格式：&#10;[00:12.34]这是第一句歌词&#10;[00:18.56]这是第二句歌词&#10;&#10;或粘贴纯文本歌词，将逐行滚动显示"></textarea>
                    <div style="display:flex;gap:6px;margin-top:8px;">
                        <button class="sm-btn sm-btn-lrc" id="sm_apply_lrc_btn" style="flex:1">✅ 应用歌词</button>
                        <button class="sm-btn sm-btn-lrc" id="sm_save_lrc_btn" style="background:linear-gradient(135deg,#06b6d4,#0891b2)">💾 存到歌曲</button>
                    </div>
                    <div class="sm-toggle-row" style="margin-top:10px">
                        <span class="sm-switch-label">歌词悬浮条（屏幕底部居中）</span>
                        <div class="sm-switch _on" id="sm_lyrics_toggle"></div>
                    </div>
                    <div class="sm-hint">开启后，播放时歌词会以悬浮条形式显示在屏幕底部居中位置，支持时间同步滚动</div>
                </div>
            </div>
        `
        document.body.appendChild(panel)

        // ---- 歌词悬浮条 ----
        var lyricsBar = document.createElement('div')
        lyricsBar.id = 'smart_music_lyrics_bar'
        lyricsBar.innerHTML = '<div class="lyric-current" id="sm_lyric_cur">🎵</div><div class="lyric-next" id="sm_lyric_next"></div>'
        document.body.appendChild(lyricsBar)

        // ---- audio 元素 ----
        _audio = new Audio()
        _audio.volume = 0.8

        // ---- 后台持续播放支持 ----
        var _requestWakeLock = async function() {
            try {
                if ('wakeLock' in navigator) {
                    _wakeLock = await navigator.wakeLock.request('screen')
                }
            } catch(e) {}
        }
        var _releaseWakeLock = async function() {
            if (_wakeLock) {
                try { await _wakeLock.release() } catch(e) {}
                _wakeLock = null
            }
        }
        // 页面可见性变化时重新获取 WakeLock + 保存播放进度
        document.addEventListener('visibilitychange', async function() {
            if (document.visibilityState === 'hidden') {
                _savePlayProgress()
            }
            if (_bgPlayEnabled && document.visibilityState === 'visible' && _isPlaying) {
                await _requestWakeLock()
            }
        })
        // 页面关闭前保存进度
        window.addEventListener('beforeunload', function() {
            _savePlayProgress()
        })
        // 后台保活：定时器保持主线程活跃，确保音频不中断
        var _startBgKeepAlive = function() {
            if (_bgKeepAliveTimer) return
            _bgKeepAliveTimer = setInterval(function() {
                // 空操作定时器，保持主线程唤醒
                if (!_isPlaying) {
                    _stopBgKeepAlive()
                }
            }, 1000)
        }
        var _stopBgKeepAlive = function() {
            if (_bgKeepAliveTimer) { clearInterval(_bgKeepAliveTimer); _bgKeepAliveTimer = null }
        }

        // ---- MediaSession API 支持（锁屏/通知栏控制） ----
        var _updateMediaSession = function() {
            if (!('mediaSession' in navigator) || _currentIndex < 0) return
            var song = _playlist[_currentIndex]
            if (!song) return
            var titleParts = (song.title || '未知歌曲').split(' - ')
            var artist = titleParts.length > 1 ? titleParts[0] : ''
            var title = titleParts.length > 1 ? titleParts.slice(1).join(' - ') : song.title
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: title || '未知歌曲',
                    artist: artist || '未知歌手',
                    album: song.album || '',
                })
            } catch(e) {}
        }
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', function() { play() })
                navigator.mediaSession.setActionHandler('pause', function() { pause() })
                navigator.mediaSession.setActionHandler('previoustrack', function() { playPrev() })
                navigator.mediaSession.setActionHandler('nexttrack', function() { playNext() })
            } catch(e) {}
        }

        // ---- 后台播放开关 ----
        var _updateBgSwitch = function() {
            var sw = document.getElementById('sm_bg_switch')
            if (!sw) return
            if (_bgPlayEnabled) sw.classList.add('_on')
            else sw.classList.remove('_on')
        }
        var _toggleBgPlay = function() {
            _bgPlayEnabled = !_bgPlayEnabled
            try { localStorage.setItem('smart_music_bgplay', _bgPlayEnabled ? '1' : '0') } catch(e) {}
            _updateBgSwitch()
            if (_bgPlayEnabled) {
                _requestWakeLock()
                if (_isPlaying) _startBgKeepAlive()
                showToast('后台播放已开启', 'green', 2000)
            } else {
                _releaseWakeLock()
                _stopBgKeepAlive()
                showToast('后台播放已关闭', 'pink', 2000)
            }
        }

        // ---- ADB 设备播放 ----
        var _shellCurl2 = (typeof shellCurl !== 'undefined') ? shellCurl : null
        var _runShell = (typeof SDM.runShell !== 'undefined') ? SDM.runShell : null
        var _adbPlaying = false

        var _checkAdbAvailable = async function() {
            if (!_runShell) return false
            try {
                var res = await _runShell('pidof adbd')
                if (res && res.content && res.content.trim()) return true
                // 尝试网络ADB
                var res2 = await _runShell('getprop service.adb.tcp.port')
                if (res2 && res2.content && res2.content.trim() !== '0' && res2.content.trim() !== '') return true
                // 检查 adb 二进制
                var res3 = await _runShell('ls /data/data/com.minikano.f50_sms/files/adb 2>/dev/null')
                if (res3 && res3.content && res3.content.includes('adb')) return true
                return true  // 有root权限默认认为可用
            } catch(e) {
                return true
            }
        }

        var _updateAdbStatus = function(text, isPlaying) {
            var el = document.getElementById('sm_adb_status')
            var btn = document.getElementById('sm_adb_play_btn')
            if (el) el.textContent = text
            if (btn) {
                if (isPlaying) {
                    btn.classList.add('_playing')
                    btn.textContent = '▶ 设备播放中'
                } else {
                    btn.classList.remove('_playing')
                    btn.textContent = '▶ 推送到设备播放'
                }
            }
            _adbPlaying = isPlaying
        }

        var playOnDevice = async function() {
            if (_adbPlaying) {
                showToast('设备正在播放中，先停止当前播放', 'pink', 2000)
                return
            }
            if (_currentIndex < 0 || !_playlist[_currentIndex]) {
                showToast('请先在播放列表中选择一首歌曲', 'pink', 2000)
                return
            }
            var song = _playlist[_currentIndex]
            if (!song.url) {
                showToast('当前歌曲没有可用的播放地址', 'red', 3000)
                return
            }
            if (!_runShell) {
                showToast('没有 Root/Shell 权限，无法推送到设备', 'red', 3000)
                return
            }
            _updateAdbStatus('正在推送到设备...', false)
            showToast('正在推送: ' + (song.title || '未知歌曲') + ' 到设备...', 'pink', 3000)
            try {
                // 方法1: 用 am start 直接在设备上播放音频URL
                var audioUrl = song.url.replace(/'/g, '')
                var cmd1 = "am start -a android.intent.action.VIEW -d '" + audioUrl + "' -t audio/*"
                var res = await _runShell(cmd1, 15000)
                if (res && res.success) {
                    _updateAdbStatus('已在设备上播放: ' + (song.title || '未知歌曲'), true)
                    showToast('已在设备上播放！', 'green', 3000)
                    return
                }
                // 方法2: 用媒体控制器
                var cmd2 = "am start -n com.android.music/.MediaPlaybackActivity -d '" + audioUrl + "' -t audio/*"
                var res2 = await _runShell(cmd2, 15000)
                if (res2 && res2.success) {
                    _updateAdbStatus('已在设备上播放: ' + (song.title || '未知歌曲'), true)
                    showToast('已在设备上播放！', 'green', 3000)
                    return
                }
                // 方法3: 用 noice/app
                var cmd3 = "am start -a android.intent.action.MUSIC_PLAYER"
                var res3 = await _runShell(cmd3, 10000)
                _updateAdbStatus('已尝试打开设备音乐播放器', true)
                showToast('已尝试打开设备音乐播放器，请手动播放', 'pink', 3000)
            } catch(e) {
                _updateAdbStatus('推送失败: ' + (e.message || '未知错误'), false)
                showToast('推送到设备失败: ' + (e.message || ''), 'red', 4000)
            }
        }

        var stopDevicePlay = async function() {
            if (!_runShell) {
                showToast('没有 Root/Shell 权限', 'red', 2000)
                return
            }
            try {
                // 停止设备上的媒体播放
                await _runShell('am broadcast -a com.android.music.musicservicecommand.pause', 10000)
                // 备用：用 media session 命令
                await _runShell('cmd media_session dispatch pause', 10000)
                _updateAdbStatus('已停止设备播放', false)
                showToast('已停止设备播放', 'pink', 2000)
            } catch(e) {
                showToast('停止设备播放失败', 'red', 2000)
            }
        }

        // ---- 小窗模式 ----
        var _isMiniMode = false
        var _miniPos = { x: 0, y: 0 }
        var _miniDrag = { dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 }

        var toggleMiniMode = function() {
            if (!_isMiniMode) {
                // 进入小窗模式
                _isMiniMode = true
                panel.classList.add('_mini')
                overlay.classList.remove('_show')
                // 恢复保存的位置
                try {
                    var saved = localStorage.getItem('smart_music_mini_pos')
                    if (saved) {
                        var pos = JSON.parse(saved)
                        panel.style.left = pos.x + 'px'
                        panel.style.top = pos.y + 'px'
                        panel.style.right = 'auto'
                    }
                } catch(e) {}
                showToast('已切换为小窗模式，可拖动 · 点击恢复', 'pink', 2500)
            } else {
                // 退出小窗模式，恢复正常
                _isMiniMode = false
                panel.classList.remove('_mini')
                panel.style.left = ''
                panel.style.top = ''
                panel.style.right = ''
                overlay.classList.add('_show')
            }
        }

        // 小窗拖动
        var _onMiniDragStart = function(e) {
            if (!_isMiniMode) return
            var touch = e.touches ? e.touches[0] : e
            _miniDrag.dragging = true
            _miniDrag.startX = touch.clientX
            _miniDrag.startY = touch.clientY
            var rect = panel.getBoundingClientRect()
            _miniDrag.origX = rect.left
            _miniDrag.origY = rect.top
            e.preventDefault()
        }
        var _onMiniDragMove = function(e) {
            if (!_miniDrag.dragging) return
            var touch = e.touches ? e.touches[0] : e
            var dx = touch.clientX - _miniDrag.startX
            var dy = touch.clientY - _miniDrag.startY
            var newX = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, _miniDrag.origX + dx))
            var newY = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, _miniDrag.origY + dy))
            panel.style.left = newX + 'px'
            panel.style.top = newY + 'px'
            panel.style.right = 'auto'
            e.preventDefault()
        }
        var _onMiniDragEnd = function(e) {
            if (!_miniDrag.dragging) return
            _miniDrag.dragging = false
            // 计算移动距离
            var touch = e && e.changedTouches ? e.changedTouches[0] : (e || { clientX: _miniDrag.startX, clientY: _miniDrag.startY })
            var dx = Math.abs((touch.clientX || 0) - _miniDrag.startX)
            var dy = Math.abs((touch.clientY || 0) - _miniDrag.startY)
            
            // 保存位置
            try {
                var rect = panel.getBoundingClientRect()
                localStorage.setItem('smart_music_mini_pos', JSON.stringify({ x: rect.left, y: rect.top }))
            } catch(e) {}
            
            // 如果移动距离很小（小于5像素），认为是点击，恢复成大窗口
            // 但要排除点击了按钮/开关的情况
            if (dx < 5 && dy < 5 && e && e.target) {
                var target = e.target
                // 如果点的是按钮、开关、进度条等控件，不恢复
                var isControl = target.closest('button') || 
                               target.closest('.sm-bg-switch') ||
                               target.closest('.sm-seek-bar') ||
                               target.closest('.sm-vol-bar') ||
                               target.closest('.sm-minimize-btn') ||
                               target.closest('input') ||
                               target.closest('select') ||
                               target.closest('.sm-tab')
                if (!isControl && _isMiniMode) {
                    toggleMiniMode()
                }
            }
        }

        // ---- 高级后台音乐同步 ----
        var _bgSyncEnabled = false
        var _bgSyncTimer = null
        var _lastBgTrack = ''
        var _isSyncingFromBg = false  // 防止双向同步死循环

        var _getBgMusicInfo = async function() {
            if (!_runShell) return null
            try {
                // 通过 dumpsys 获取当前媒体播放信息
                var cmd = 'dumpsys media_session 2>/dev/null | grep -A 30 "ACTIVE" | head -40'
                var res = await _runShell(cmd, 8000)
                if (!res || !res.content) return null
                var text = res.content

                // 提取歌曲信息
                var title = ''
                var artist = ''
                var state = ''

                // 匹配 state
                var stateMatch = text.match(/state=(\w+)/i)
                if (stateMatch) state = stateMatch[1].toLowerCase()

                // 匹配 metadata
                var titleMatch = text.match(/title=([^\n]+)/i)
                if (titleMatch) title = titleMatch[1].trim()

                var artistMatch = text.match(/artist=([^\n]+)/i)
                if (artistMatch) artist = artistMatch[1].trim()

                // 如果没找到，尝试从 notification 中获取
                if (!title) {
                    var cmd2 = 'dumpsys notification --noredact 2>/dev/null | grep -B 2 -A 2 "media.session\|MediaStyle\|android.media.session.MediaSession" | head -30'
                    var res2 = await _runShell(cmd2, 8000)
                    if (res2 && res2.content) {
                        var tMatch = res2.content.match(/android\.title=([^\n]+)/i)
                        if (tMatch) title = tMatch[1].trim()
                        var aMatch = res2.content.match(/android\.text=([^\n]+)/i)
                        if (aMatch) artist = aMatch[1].trim()
                    }
                }

                if (!title && !artist) return null

                return {
                    title: title,
                    artist: artist,
                    isPlaying: state === 'playing' || state === 'active'
                }
            } catch(e) {
                return null
            }
        }

        var _startBgSync = function() {
            if (_bgSyncTimer) return
            _bgSyncEnabled = true
            try { localStorage.setItem('smart_music_bgsync', '1') } catch(e) {}
            _bgSyncTimer = setInterval(async function() {
                if (_isSyncingFromBg) return
                var info = await _getBgMusicInfo()
                if (info && info.title) {
                    var trackKey = info.artist + ' - ' + info.title
                    if (trackKey !== _lastBgTrack) {
                        _lastBgTrack = trackKey
                        _isSyncingFromBg = true
                        // 更新显示
                        var nowPlayingEl = document.getElementById('sm_now_playing')
                        if (nowPlayingEl) {
                            nowPlayingEl.textContent = (info.artist ? info.artist + ' - ' : '') + info.title + ' 📱'
                        }
                        // 更新后台同步状态显示
                        var syncStatusEl = document.getElementById('sm_bgsync_status')
                        if (syncStatusEl) {
                            syncStatusEl.textContent = '🎵 ' + (info.title || '未知歌曲')
                        }
                        // 更新 MediaSession
                        _updateMediaSession()
                        _isSyncingFromBg = false
                    }
                    // 同步播放状态
                    if (info.isPlaying !== _isPlaying && !_isSyncingFromBg) {
                        _isPlaying = info.isPlaying
                        updatePlayBtn()
                        if (info.isPlaying) {
                            startProgressTimer()
                        } else {
                            stopProgressTimer()
                        }
                    }
                }
            }, 2000)
             showToast('高级后台同步已开启', 'green', 2000)
             var statusEl = document.getElementById('sm_bgsync_status')
             if (statusEl) statusEl.textContent = '同步中...'
         }

        var _stopBgSync = function() {
            _bgSyncEnabled = false
            try { localStorage.setItem('smart_music_bgsync', '0') } catch(e) {}
            if (_bgSyncTimer) { clearInterval(_bgSyncTimer); _bgSyncTimer = null }
            _lastBgTrack = ''
            showToast('高级后台同步已关闭', 'pink', 2000)
            var statusEl = document.getElementById('sm_bgsync_status')
            if (statusEl) statusEl.textContent = '未开启同步'
        }

        var _toggleBgSync = function() {
            if (_bgSyncEnabled) {
                _stopBgSync()
            } else {
                if (!_runShell) {
                    showToast('需要 Root/Shell 权限才能使用后台同步', 'red', 3000)
                    return
                }
                _startBgSync()
            }
            _updateBgSyncSwitch()
        }

        var _updateBgSyncSwitch = function() {
            var sw = document.getElementById('sm_bgsync_switch')
            if (!sw) return
            if (_bgSyncEnabled) sw.classList.add('_on')
            else sw.classList.remove('_on')
        }

        // 后台音乐控制（上一曲/播放暂停/下一曲）
        var bgMusicPrev = async function() {
            if (!_runShell) { showToast('需要 Root/Shell 权限', 'red', 2000); return }
            try {
                await _runShell('cmd media_session dispatch previous', 5000)
                showToast('上一曲', 'pink', 1500)
            } catch(e) {
                showToast('控制失败', 'red', 2000)
            }
        }

        var bgMusicPlayPause = async function() {
            if (!_runShell) { showToast('需要 Root/Shell 权限', 'red', 2000); return }
            try {
                var info = await _getBgMusicInfo()
                if (info && info.isPlaying) {
                    await _runShell('cmd media_session dispatch pause', 5000)
                    _isPlaying = false
                    showToast('暂停', 'pink', 1500)
                } else {
                    await _runShell('cmd media_session dispatch play', 5000)
                    _isPlaying = true
                    showToast('播放', 'pink', 1500)
                }
                updatePlayBtn()
            } catch(e) {
                showToast('控制失败', 'red', 2000)
            }
        }

        var bgMusicNext = async function() {
            if (!_runShell) { showToast('需要 Root/Shell 权限', 'red', 2000); return }
            try {
                await _runShell('cmd media_session dispatch next', 5000)
                showToast('下一曲', 'pink', 1500)
            } catch(e) {
                showToast('控制失败', 'red', 2000)
            }
        }

        // ---- 辅助 ----
        var fmtTime = function(sec) {
            if (!sec || isNaN(sec) || sec < 0) return '0:00'
            var m = Math.floor(sec / 60)
            var s = Math.floor(sec % 60)
            return m + ':' + (s < 10 ? '0' : '') + s
        }

        var showToast = function(msg, color, dur) {
            try { if (typeof SDM.toast === 'function') SDM.toast(msg, color || 'pink', dur || 2500) } catch(e) {}
        }

        // ---- 渲染播放列表 ----
        var renderPlaylist = function() {
            var container = document.getElementById('sm_playlist_container')
            if (!container) return
            if (!_playlist.length) {
                container.innerHTML = '<div class="sm-empty">播放列表为空，添加音频 URL 或扫描本地音乐</div>'
                return
            }
            var html = ''
            for (var i = 0; i < _playlist.length; i++) {
                var item = _playlist[i]
                var isActive = i === _currentIndex
                var hasLrc = item.lrc ? ' 🎤' : ''
                var isFav = item.pfId ? isFavorited(item.pfId) : false
                var favBtn = item.pfId ? '<span class="sm-fav-btn' + (isFav ? ' _active' : '') + '" data-pl-fav="' + i + '">' + (isFav ? '❤️' : '🤍') + '</span>' : ''
                html += '<div class="sm-playlist-item' + (isActive ? ' _active' : '') + '" data-idx="' + i + '">'
                    + '<span class="_title">' + (item.title || ('歌曲' + (i+1))) + hasLrc + '</span>'
                    + favBtn
                    + '<button class="sm-btn sm-btn-del _del" data-del="' + i + '">删除</button>'
                    + '</div>'
            }
            container.innerHTML = html
        }

        // ---- 加载歌曲 ----
        var loadSong = function(idx) {
            if (idx < 0 || idx >= _playlist.length) return
            _currentIndex = idx
            _retryCount = 0
            var song = _playlist[idx]
            _audio.src = song.url
            _audio.load()
            _updateMediaSession()

            // 更新标题
            var np = document.getElementById('sm_now_playing')
            if (np) np.textContent = song.title || ('歌曲' + (idx + 1))

            // 解析歌词
            _lrcData = parseLRC(song.lrc || '')
            _lrcLineIndex = -1

            // 更新歌词输入框
            var ta = document.getElementById('sm_lrc_textarea')
            if (ta) ta.value = song.lrc || ''

            renderPlaylist()
            updateLyricsBar()
        }

        // ---- 播放/暂停 ----
        var play = function() {
            if (_currentIndex < 0 && _playlist.length > 0) loadSong(0)
            if (_currentIndex < 0) { showToast('请先添加歌曲', 'red'); return }
            _audio.play().then(function() {
                _isPlaying = true
                updatePlayBtn()
                startProgressTimer()
                _updateMediaSession()
                if (_bgPlayEnabled) {
                    _requestWakeLock()
                    _startBgKeepAlive()
                }
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'playing'
                }
            }).catch(function(e) {
                showToast('播放失败: ' + (e.message || '浏览器限制'), 'red', 4000)
            })
        }

        var pause = function() {
            _audio.pause()
            _isPlaying = false
            updatePlayBtn()
            stopProgressTimer()
            _stopBgKeepAlive()
            _savePlayProgress()  // 保存播放进度
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused'
            }
        }

        // 保存播放进度到 localStorage
        var _savePlayProgress = function() {
            try {
                if (_currentIndex >= 0 && _audio && _audio.currentTime >= 0) {
                    localStorage.setItem('smart_music_progress', JSON.stringify({
                        idx: _currentIndex,
                        time: _audio.currentTime || 0
                    }))
                }
            } catch(e) {}
        }

        // 恢复播放进度并自动播放
        var _tryAutoResume = function() {
            if (!_autoPlayEnabled || _playlist.length === 0) return
            try {
                var saved = localStorage.getItem('smart_music_progress')
                if (saved) {
                    var data = JSON.parse(saved)
                    var idx = data.idx || 0
                    var time = data.time || 0
                    if (idx >= 0 && idx < _playlist.length) {
                        loadSong(idx)
                        // 等 canplay 再 play + seek
                        var onCanPlay = function() {
                            _audio.removeEventListener('canplay', onCanPlay)
                            if (time > 0) _audio.currentTime = time
                            _audio.play().then(function() {
                                _isPlaying = true
                                updatePlayBtn()
                                startProgressTimer()
                                if (_bgPlayEnabled) {
                                    _requestWakeLock()
                                    _startBgKeepAlive()
                                }
                                if ('mediaSession' in navigator) {
                                    navigator.mediaSession.playbackState = 'playing'
                                }
                                showToast('⏯ 自动续播已恢复', 'green', 1500)
                            }).catch(function(e) {
                                // 自动播放被浏览器阻止了，等用户交互再播
                                console.log('auto play blocked:', e.message)
                                // 先加载好歌曲，用户点播放按钮就能续播
                                _isPlaying = false
                                updatePlayBtn()
                                if (time > 0) _audio.currentTime = time
                                // 提示用户
                                showToast('⏯ 自动续播已就绪，点播放开始', 'yellow', 3000)
                                // 监听第一次用户交互后自动播放
                                var autoPlayOnInteract = function() {
                                    if (_autoPlayEnabled && !_isPlaying && _audio.src) {
                                        _audio.play().then(function() {
                                            _isPlaying = true
                                            updatePlayBtn()
                                            startProgressTimer()
                                            if ('mediaSession' in navigator) {
                                                navigator.mediaSession.playbackState = 'playing'
                                            }
                                        }).catch(function(){})
                                    }
                                    document.removeEventListener('click', autoPlayOnInteract)
                                    document.removeEventListener('touchstart', autoPlayOnInteract)
                                }
                                setTimeout(function() {
                                    document.addEventListener('click', autoPlayOnInteract, { once: true })
                                    document.addEventListener('touchstart', autoPlayOnInteract, { once: true })
                                }, 500)
                            })
                        }
                        _audio.addEventListener('canplay', onCanPlay)
                    }
                }
            } catch(e) {}
        }

        var togglePlay = function() {
            if (_isPlaying) pause(); else play()
        }

        var updatePlayBtn = function() {
            var btn = document.getElementById('sm_play_btn')
            if (!btn) return
            if (_isPlaying) {
                btn.textContent = '⏸ 暂停'
                btn.className = 'sm-btn sm-btn-pause'
            } else {
                btn.textContent = '▶ 播放'
                btn.className = 'sm-btn sm-btn-play'
            }
        }

        // ---- 进度条 ----
        var startProgressTimer = function() {
            stopProgressTimer()
            _progressTimer = setInterval(updateProgress, 300)
        }

        var stopProgressTimer = function() {
            if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null }
        }

        var _lastSaveTime = 0
        var updateProgress = function() {
            var cur = _audio.currentTime || 0
            var dur = _audio.duration || 0
            var pct = dur > 0 ? (cur / dur * 100) : 0
            var fill = document.getElementById('sm_seek_fill')
            if (fill) fill.style.width = pct + '%'
            var ct = document.getElementById('sm_cur_time')
            if (ct) ct.textContent = fmtTime(cur)
            var dt = document.getElementById('sm_dur_time')
            if (dt) dt.textContent = fmtTime(dur)

            // 更新歌词
            updateLyricsByTime(cur)

            // 每30秒自动保存一次进度
            if (_isPlaying && cur - _lastSaveTime > 30) {
                _lastSaveTime = cur
                _savePlayProgress()
            }
        }

        // ---- 歌词同步 ----
        var updateLyricsByTime = function(time) {
            if (!_lrcData.length) return
            var newIdx = findLrcIndex(time)
            if (newIdx !== _lrcLineIndex) {
                _lrcLineIndex = newIdx
                updateLyricsBar()
            }
        }

        var updateLyricsBar = function() {
            var curEl = document.getElementById('sm_lyric_cur')
            var nextEl = document.getElementById('sm_lyric_next')
            if (!curEl) return

            if (!_lrcData.length || _lrcLineIndex < 0) {
                var np = document.getElementById('sm_now_playing')
                curEl.textContent = np ? ('🎵 ' + np.textContent) : '🎵'
                if (nextEl) nextEl.textContent = ''
                return
            }
            curEl.textContent = _lrcData[_lrcLineIndex].text || '🎵'
            if (nextEl && _lrcLineIndex + 1 < _lrcData.length) {
                nextEl.textContent = _lrcData[_lrcLineIndex + 1].text || ''
            } else {
                if (nextEl) nextEl.textContent = ''
            }
        }

        // ---- 切歌 ----
        var playNext = function() {
            if (!_playlist.length) return
            var next = (_currentIndex + 1) % _playlist.length
            loadSong(next)
            play()
        }

        var playPrev = function() {
            if (!_playlist.length) return
            var prev = (_currentIndex - 1 + _playlist.length) % _playlist.length
            loadSong(prev)
            play()
        }

        // ---- Listen 1 多源音乐搜索（网易云 / QQ音乐 / 酷狗） ----
        var _searchResults = []
        var _searching = false
        var _activePlatforms = { netease: true, qq: true, kugou: true, kuwo: true, migu: true }
        var _searchStatus = { netease: 'idle', qq: 'idle', kugou: 'idle', kuwo: 'idle', migu: 'idle' }

        var searchAll = async function() {
            if (_searching) return
            var input = document.getElementById('sm_search_input')
            var keyword = (input && input.value || '').trim()
            if (!keyword) { showToast('请输入歌曲名或歌手', 'red'); return }

            _searching = true
            _searchResults = []
            showSearchLoading('🔍 聚合音源多平台搜索中...')
            _searchStatus = { netease: 'idle', qq: 'idle', kugou: 'idle', kuwo: 'idle', migu: 'idle' }

            var tasks = []
            if (_activePlatforms.netease) {
                _searchStatus.netease = 'searching'
                tasks.push(searchNetease(keyword))
            }
            if (_activePlatforms.qq) {
                _searchStatus.qq = 'searching'
                tasks.push(searchQQ(keyword))
            }
            if (_activePlatforms.kugou) {
                _searchStatus.kugou = 'searching'
                tasks.push(searchKugou(keyword))
            }
            if (_activePlatforms.kuwo) {
                _searchStatus.kuwo = 'searching'
                tasks.push(searchKuwo(keyword))
            }
            if (_activePlatforms.migu) {
                _searchStatus.migu = 'searching'
                tasks.push(searchMigu(keyword))
            }

            // 并行搜索，结果陆续展示
            Promise.all(tasks.map(function(p) {
                return p.catch(function(e) { return [] })
            })).then(function(results) {
                _searching = false
                updatePlatformButtons()
                if (_searchResults.length === 0) {
                    showSearchEmpty()
                    showToast('未找到相关歌曲，试试其他平台', 'pink', 2500)
                } else {
                    renderSearchResults()
                    showToast('找到 ' + _searchResults.length + ' 首歌曲', 'green', 2000)
                }
            })
        }

        var updatePlatformButtons = function() {
            var btns = document.querySelectorAll('#sm_platform_filter .sm-pf-btn')
            btns.forEach(function(btn) {
                var pf = btn.getAttribute('data-pf')
                if (_searchStatus[pf] === 'searching') btn.classList.add('_searching')
                else btn.classList.remove('_searching')
            })
        }

        var shellCurl = async function(url, extraHeaders) {
            var _rs = typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
            if (!_rs) return null
            var hdr = extraHeaders || ''
            var cmd = "curl -s --max-time 10 '" + url + "' " + hdr + " 2>/dev/null"
            var res = await _rs(cmd)
            var text = (res && res.content || '').trim()
            var jsonStart = text.indexOf('{')
            if (jsonStart > 0) text = text.substring(jsonStart)
            return text
        }

        // 网易云搜索
        var searchNetease = async function(keyword) {
            try {
                var text = await shellCurl(
                    'https://music.163.com/api/search/get?s=' + encodeURIComponent(keyword) + '&type=1&offset=0&limit=15',
                    "-H 'Referer: https://music.163.com' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10)'"
                )
                if (!text) throw new Error('无返回')
                var data = JSON.parse(text)
                if (data && data.result && data.result.songs) {
                    var list = data.result.songs.map(function(s) {
                        return {
                            id: 'wy_' + s.id,
                            platform: 'netease',
                            pfName: '网易云',
                            songId: s.id,
                            name: s.name,
                            artists: (s.artists || []).map(function(a) { return a.name }),
                            album: s.album ? s.album.name : '',
                            duration: s.duration || 0
                        }
                    })
                    _searchResults = _searchResults.concat(list)
                    renderSearchResults()
                    _searchStatus.netease = 'done'
                    updatePlatformButtons()
                    return list
                }
                _searchStatus.netease = 'failed'
                return []
            } catch(e) {
                _searchStatus.netease = 'failed'
                updatePlatformButtons()
                return []
            }
        }

        // QQ音乐搜索
        var searchQQ = async function(keyword) {
            try {
                var text = await shellCurl(
                    'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent(keyword) + '&n=15&p=1&format=json',
                    "-H 'Referer: https://y.qq.com' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10)'"
                )
                if (!text) throw new Error('无返回')
                // QQ可能返回callback包裹，去掉
                if (text.indexOf('callback') >= 0 || text.charAt(0) !== '{') {
                    var s = text.indexOf('{')
                    var e = text.lastIndexOf('}')
                    if (s >= 0 && e > s) text = text.substring(s, e + 1)
                }
                var data = JSON.parse(text)
                var songs = []
                if (data && data.data && data.data.song && data.data.song.list) {
                    songs = data.data.song.list.map(function(s) {
                        var artists = (s.singer || []).map(function(a) { return a.name })
                        return {
                            id: 'qq_' + s.songmid,
                            platform: 'qq',
                            pfName: 'QQ音乐',
                            songId: s.songmid,
                            songIdNum: s.songid,
                            name: s.songname,
                            artists: artists,
                            album: s.albumname || '',
                            duration: (s.interval || 0) * 1000
                        }
                    })
                    _searchResults = _searchResults.concat(songs)
                    renderSearchResults()
                }
                _searchStatus.qq = 'done'
                updatePlatformButtons()
                return songs
            } catch(e) {
                _searchStatus.qq = 'failed'
                updatePlatformButtons()
                return []
            }
        }

        // 酷狗搜索
        var searchKugou = async function(keyword) {
            try {
                var text = await shellCurl(
                    'https://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent(keyword) + '&pagesize=15&page=1&platform=WebFilter',
                    "-H 'Referer: https://www.kugou.com' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10)'"
                )
                if (!text) throw new Error('无返回')
                var data = JSON.parse(text)
                var songs = []
                if (data && data.data && data.data.lists) {
                    songs = data.data.lists.map(function(s) {
                        // 2026-08-27: HQFileHash(320k)播放可用，FileHash(128k)经常无URL，优先用HQ
                        var bestHash = s.HQFileHash || s.FileHash
                        return {
                            id: 'kg_' + bestHash,
                            platform: 'kugou',
                            pfName: '酷狗',
                            songId: bestHash,
                            backupHash: s.FileHash || '',  // 128k备用hash
                            albumId: s.AlbumID,
                            name: s.SongName,
                            artists: s.SingerName ? [s.SingerName] : [],
                            album: s.AlbumName || '',
                            duration: (s.Duration || 0) * 1000
                        }
                    })
                    _searchResults = _searchResults.concat(songs)
                    renderSearchResults()
                }
                _searchStatus.kugou = 'done'
                updatePlatformButtons()
                return songs
            } catch(e) {
                _searchStatus.kugou = 'failed'
                updatePlatformButtons()
                return []
            }
        }

        // 酷我搜索
        var searchKuwo = async function(keyword) {
            try {
                // 2026-08-27 更新：旧API已失效，使用search.kuwo.cn备用接口
                var text = await shellCurl(
                    'http://search.kuwo.cn/r.s?all=' + encodeURIComponent(keyword) + '&ft=music&itemset=web_2013&client=kt&pn=0&rn=15&rformat=json&encoding=utf8',
                    "-H 'User-Agent: Mozilla/5.0 (Linux; Android 10)'"
                )
                if (!text) throw new Error('无返回')
                // search.kuwo.cn返回Python dict风格（单引号），用正则提取歌曲信息
                var songs = []
                var songBlocks = text.match(/\{'[^']*?MUSICRID[^']*?\}/g) || []
                songBlocks.forEach(function(block) {
                    function getField(field) {
                        var m = block.match(new RegExp("'" + field + "':'([^']*)'"))
                        return m ? m[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&') : ''
                    }
                    var rid = getField('MUSICRID').replace('MUSIC_', '')
                    var name = getField('SONGNAME') || getField('NAME')
                    var artist = getField('ARTIST')
                    var album = getField('ALBUM')
                    var duration = parseInt(getField('DURATION')) || 0
                    if (rid && name) {
                        songs.push({
                            id: 'kw_' + rid,
                            platform: 'kuwo',
                            pfName: '酷我',
                            songId: rid,
                            name: name,
                            artists: artist ? [artist] : [],
                            album: album || '',
                            duration: duration * 1000
                        })
                    }
                })
                _searchResults = _searchResults.concat(songs)
                renderSearchResults()
                _searchStatus.kuwo = 'done'
                updatePlatformButtons()
                return songs
            } catch(e) {
                // 如果备用接口也失败，尝试旧API
                try {
                    var text2 = await shellCurl(
                        'http://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=' + encodeURIComponent(keyword) + '&pn=1&rn=15&httpsStatus=1&reqId=' + Date.now(),
                        "-H 'Referer: http://www.kuwo.cn/' -H 'csrf: 00000000000000000000000000000000' -H 'Cookie: kw_token=00000000000000000000000000000000' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10)'"
                    )
                    if (!text2) throw new Error('无返回')
                    var data2 = JSON.parse(text2)
                    var songs2 = []
                    if (data2 && data2.data && data2.data.list) {
                        songs2 = data2.data.list.map(function(s) {
                            return {
                                id: 'kw_' + s.rid,
                                platform: 'kuwo',
                                pfName: '酷我',
                                songId: s.rid,
                                name: s.name,
                                artists: s.artist ? s.artist.split('&') : [],
                                album: s.album || '',
                                duration: (s.duration || 0) * 1000
                            }
                        })
                        _searchResults = _searchResults.concat(songs2)
                        renderSearchResults()
                    }
                    _searchStatus.kuwo = 'done'
                    updatePlatformButtons()
                    return songs2
                } catch(e2) {
                    _searchStatus.kuwo = 'failed'
                    updatePlatformButtons()
                    return []
                }
            }
        }

        // 咪咕搜索
        var searchMigu = async function(keyword) {
            try {
                // 2026-08-27 更新：旧API已失效（301），使用app.c.nf.migu.cn新接口
                var text = await shellCurl(
                    'https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent(keyword) + '&pageSize=15&pageNo=1&searchSwitch=' + encodeURIComponent('{"song":1}'),
                    "-H 'Referer: https://m.music.migu.cn/' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10)'"
                )
                if (!text) throw new Error('无返回')
                var data = JSON.parse(text)
                var songs = []
                if (data && data.songResultData && data.songResultData.result) {
                    songs = data.songResultData.result.map(function(s) {
                        return {
                            id: 'mg_' + (s.contentId || s.copyrightId || s.id || ''),
                            platform: 'migu',
                            pfName: '咪咕',
                            songId: s.contentId || s.copyrightId || s.id || '',
                            name: s.name || s.songName || s.title || '',
                            artists: (s.singers || []).map(function(a) { return a.name }),
                            album: (s.albums && s.albums.length) ? s.albums[0].name : '',
                            duration: 0
                        }
                    })
                    _searchResults = _searchResults.concat(songs)
                    renderSearchResults()
                }
                _searchStatus.migu = 'done'
                updatePlatformButtons()
                return songs
            } catch(e) {
                _searchStatus.migu = 'failed'
                updatePlatformButtons()
                return []
            }
        }

        // 获取播放地址
        // ---- 提取URL的辅助函数 ----
        var extractPlayUrl = function(obj, paths) {
            for (var p = 0; p < paths.length; p++) {
                var val = obj
                for (var k = 0; k < paths[p].length; k++) {
                    if (val == null) { val = undefined; break }
                    val = val[paths[p][k]]
                }
                if (Array.isArray(val)) val = val[0]
                if (typeof val === 'string' && (val.indexOf('http://') === 0 || val.indexOf('https://') === 0)) return val
                if (typeof val === 'string' && val.indexOf('//') === 0) return 'https:' + val
            }
            return ''
        }

        // ---- 验证音频URL是否可访问且为音频内容 ----
        var validateAudioUrl = async function(url) {
            if (!url) return false
            var _rs = typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
            if (!_rs) return true  // 无shell权限无法验证，默认通过
            try {
                // 用 curl -sI 做HEAD请求检查 Content-Type，-L 跟随重定向
                var cmd = "curl -sI --max-time 6 -L '" + url + "' 2>/dev/null | head -30"
                var res = await _rs(cmd)
                var text = (res && res.content || '').trim()
                if (!text) return true  // 无返回，不确定，默认通过

                // 检查 HTTP 状态码（取最后一次重定向的状态）
                var statusLines = text.match(/HTTP\/[\d.]+\s+(\d{3})/gi) || []
                var lastStatus = statusLines.length ? parseInt(statusLines[statusLines.length - 1].replace(/HTTP\/[\d.]+\s+/i, '')) : 0
                if (lastStatus >= 400 && lastStatus < 600) return false  // 4xx/5xx 错误

                // 检查 Content-Type
                var ctMatch = text.match(/Content-Type:\s*([^\r\n]+)/i)
                if (ctMatch) {
                    var ct = ctMatch[1].trim().toLowerCase()
                    // 明确是音频类型
                    if (ct.indexOf('audio') >= 0 || ct.indexOf('octet-stream') >= 0 || ct.indexOf('mpeg') >= 0) return true
                    // 明确是HTML错误页面
                    if (ct.indexOf('text/html') >= 0 || ct.indexOf('text/plain') >= 0) return false
                }
                return true  // 无法确定，默认通过
            } catch(e) {
                return true  // 验证失败，默认通过
            }
        }

        // ---- 音源后端：逐个尝试，哪个成功用哪个 ----
        // 2026-08-29 更新：接入 Meting-API 公共实例（GitHub 开源项目 meting-api），
        // 直接返回音频流，网易云/酷狗/酷我多平台可用；保留原有 GD Studio、酷我 antiserver 作为备用。
        var METING_SERVERS = {
            netease: 'netease',
            qq: 'tencent',
            kugou: 'kugou',
            kuwo: 'kuwo'
        }
        var METING_BACKENDS = function(platform) {
            var svr = METING_SERVERS[platform] || 'netease'
            return [
                { url: function(id) { return 'https://api.injahow.cn/meting/?server=' + svr + '&type=url&id=' + id }, direct: true, name: 'Meting-Injahow' },
                { url: function(id) { return 'https://meting.jinghuashang.cn/api?server=' + svr + '&type=url&id=' + id }, direct: true, name: 'Meting-Jinghua' },
                { url: function(id) { return 'https://meting.mikus.ink/api?server=' + svr + '&type=url&id=' + id }, direct: true, name: 'Meting-Mikus' },
            ]
        }

        var NETEASE_BACKENDS = METING_BACKENDS('netease').concat([
            // GD Studio（JSON 格式，长期可用）
            { url: function(id) { return 'https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' + id + '&br=320' }, extract: [['url']], name: 'GD-320' },
            { url: function(id) { return 'https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' + id + '&br=999' }, extract: [['url']], name: 'GD-lossless' },
        ])

        var QQ_BACKENDS = METING_BACKENDS('qq').concat([
            // GD Studio 腾讯源（偶尔可用）
            { url: function(id) { return 'https://music-api.gdstudio.xyz/api.php?types=url&source=tx&id=' + id + '&br=320' }, extract: [['url']], name: 'GD-tx' },
        ])

        var KUGOU_BACKENDS = METING_BACKENDS('kugou').concat([
            // 官方移动接口已不稳定（经常 errcode 2），保留作为最后尝试
            { url: function(id) { return 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + id }, extract: [['url'],['playUrl'],['play_url'],['backup_url']], name: 'Kugou-Mobile' },
            { url: function(id, albumId, song) {
                if (!song || !song.backupHash || song.backupHash === id) return null
                return 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + song.backupHash
              }, extract: [['url'],['playUrl'],['play_url'],['backup_url']], name: 'Kugou-Mobile-backup' },
        ])

        var KUWO_BACKENDS = METING_BACKENDS('kuwo').concat([
            // 酷我 antiserver（纯文本直链）
            { url: function(id) { return 'http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=MUSIC_' + id }, extract: [], textUrl: true, name: 'KuWo-anti' },
            { url: function(id) { return 'http://antiserver.kuwo.cn/anti.s?type=convert_url&format=aac&response=url&rid=MUSIC_' + id }, extract: [], textUrl: true, name: 'KuWo-anti-aac' },
        ])

        // ---- 咪咕后端 ----
        // 咪咕官方接口已长期失效，Meting 也不支持咪咕；播放失败时会走网易云跨平台回退
        var MIGU_BACKENDS = []

        // ---- 汽水VIP后端（跨平台搜索+获取） ----
        var QISHUI_API = 'https://api.vsaa.cn/api/music.qishui.vip'
        var QISHUI_API_HTTP = 'http://api.vsaa.cn/api/music.qishui.vip'
        var QISHUI_PROXY_API = 'https://proxy.qishui.vsaa.cn/qishui/proxy'

        var getPlayUrl = async function(song) {
            if (!song || !song.platform) return ''
            var _rs = typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
            if (!_rs) {
                // 无shell权限时，网易云还能用直链
                if (song.platform === 'netease') {
                    return 'https://music.163.com/song/media/outer/url?id=' + song.songId + '.mp3'
                }
                return ''
            }

            var backends = []
            var songId = song.songId || ''
            var albumId = song.albumId || ''

            if (song.platform === 'netease') {
                backends = NETEASE_BACKENDS
            } else if (song.platform === 'qq') {
                backends = QQ_BACKENDS
            } else if (song.platform === 'kugou') {
                backends = KUGOU_BACKENDS
            } else if (song.platform === 'kuwo') {
                backends = KUWO_BACKENDS
            } else if (song.platform === 'migu') {
                backends = MIGU_BACKENDS
            }

            if (!backends.length) return ''

            for (var i = 0; i < backends.length; i++) {
                var backend = backends[i]
                try {
                    var apiUrl = backend.url(songId, albumId, song)
                    if (!apiUrl) continue  // needSong类型的后端可能返回null

                    // 直接音频流后端（如 Meting-API）：接口本身返回音频二进制，无需再解析 JSON
                    if (backend.direct) {
                        var isDirectValid = await validateAudioUrl(apiUrl)
                        if (isDirectValid) {
                            aiLogSafe('[' + song.pfName + '] ' + (backend.name || '后端' + (i+1)) + ' 获取成功', 'success')
                            return apiUrl
                        }
                        aiLogSafe('[' + song.pfName + '] ' + (backend.name || '后端' + (i+1)) + ' URL无效或已过期，尝试下一个', 'warn')
                        continue
                    }

                    var hdr = backend.headers ? '-H \'' + backend.headers + '\'' : "-H 'User-Agent: Mozilla/5.0'"
                    var text

                    if (backend.method === 'POST' && backend.postBody) {
                        var body = backend.postBody(songId)
                        text = await shellCurl(apiUrl, hdr + " -X POST -H 'Content-Type: application/json' -d '" + body.replace(/'/g, "'\\''") + "'")
                    } else {
                        text = await shellCurl(apiUrl, hdr)
                    }

                    if (!text) continue

                    // 纯文本直链类型后端（如酷我antiserver）
                    if (backend.textUrl) {
                        var plainUrl = text.trim()
                        if (plainUrl && plainUrl.indexOf('http') === 0) {
                            var isPlainValid = await validateAudioUrl(plainUrl)
                            if (isPlainValid) {
                                aiLogSafe('[' + song.pfName + '] ' + (backend.name || '后端' + (i+1)) + ' 获取成功', 'success')
                                return plainUrl
                            }
                            aiLogSafe('[' + song.pfName + '] ' + (backend.name || '后端' + (i+1)) + ' URL无效或已过期，尝试下一个', 'warn')
                        }
                        continue
                    }

                    var data
                    try { data = JSON.parse(text) } catch(e) { continue }
                    if (!data) continue

                    // 提取URL
                    var playUrl = extractPlayUrl(data, backend.extract)

                    // 如果返回的URL没有http前缀但有url字段
                    if (!playUrl && data.url && typeof data.url === 'string' && data.url.indexOf('http') === 0) {
                        playUrl = data.url
                    }
                    if (!playUrl && data.data && data.data.url && typeof data.data.url === 'string' && data.data.url.indexOf('http') === 0) {
                        playUrl = data.data.url
                    }
                    // 汽水VIP的musicInfo字段
                    if (!playUrl && data.musicInfo && typeof data.musicInfo === 'string' && data.musicInfo.indexOf('http') === 0) {
                        playUrl = data.musicInfo
                    }

                    if (playUrl) {
                        // 验证URL是否可访问且为音频内容
                        var isValid = await validateAudioUrl(playUrl)
                        if (isValid) {
                            aiLogSafe('[' + song.pfName + '] ' + (backend.name || '后端' + (i+1)) + ' 获取成功', 'success')
                            return playUrl
                        }
                        // URL无效，继续尝试下一个后端
                        aiLogSafe('[' + song.pfName + '] ' + (backend.name || '后端' + (i+1)) + ' URL无效或已过期，尝试下一个', 'warn')
                    }
                } catch(e) {
                    // 继续尝试下一个后端
                    continue
                }
            }

            // 所有后端都失败，尝试汽水VIP搜索回退
            try {
                var qishuiUrl = await qishuiFallbackGetUrl(song)
                if (qishuiUrl) {
                    aiLogSafe('[' + song.pfName + '] 汽水VIP回退获取成功', 'success')
                    return qishuiUrl
                }
            } catch(e) {}

            // 汽水VIP也失败，跨平台网易云回退（用歌名搜索网易云同曲播放）
            if (song.name && song.platform !== 'netease') {
                try {
                    var neteaseFallbackUrl = await neteaseCrossPlatformFallback(song)
                    if (neteaseFallbackUrl) {
                        aiLogSafe('[' + song.pfName + '] 网易云跨平台回退获取成功', 'success')
                        return neteaseFallbackUrl
                    }
                } catch(e) {}
            }

            // 所有后端都失败，网易云兜底用直链
            if (song.platform === 'netease') {
                return 'https://music.163.com/song/media/outer/url?id=' + song.songId + '.mp3'
            }

            return ''
        }

        // 网易云跨平台回退：其他平台播放失败时，用歌名+歌手在网易云搜索同曲播放
        var neteaseCrossPlatformFallback = async function(song) {
            if (!song || !song.name) return ''
            var keyword = song.name
            if (song.artists && song.artists.length) keyword += ' ' + song.artists[0]
            try {
                var searchText = await shellCurl(
                    'https://music.163.com/api/search/get?s=' + encodeURIComponent(keyword) + '&type=1&offset=0&limit=5',
                    "-H 'User-Agent: Mozilla/5.0 (Linux; Android 10)' -H 'Referer: https://music.163.com/'"
                )
                if (!searchText) return ''
                var searchData
                try { searchData = JSON.parse(searchText) } catch(e) { return '' }
                var songs = searchData && searchData.result && searchData.result.songs
                if (!songs || !songs.length) return ''

                // 取第一条结果依次用 Meting / GD Studio 获取播放地址
                var neteaseId = songs[0].id
                if (!neteaseId) return ''

                var metingUrls = [
                    'https://api.injahow.cn/meting/?server=netease&type=url&id=' + neteaseId,
                    'https://meting.jinghuashang.cn/api?server=netease&type=url&id=' + neteaseId,
                    'https://meting.mikus.ink/api?server=netease&type=url&id=' + neteaseId,
                ]
                for (var m = 0; m < metingUrls.length; m++) {
                    var isValid = await validateAudioUrl(metingUrls[m])
                    if (isValid) return metingUrls[m]
                }

                var urlText = await shellCurl(
                    'https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' + neteaseId + '&br=320',
                    "-H 'User-Agent: Mozilla/5.0'"
                )
                if (!urlText) return ''
                var urlData
                try { urlData = JSON.parse(urlText) } catch(e) { return '' }
                if (urlData && urlData.url && urlData.url.indexOf('http') === 0) {
                    return urlData.url
                }
            } catch(e) {}
            return ''
        }

        // 汽水VIP跨平台搜索回退（所有平台后端失败后尝试）
        var qishuiFallbackGetUrl = async function(song) {
            if (!song || !song.name) return ''
            var keyword = song.name
            if (song.artists && song.artists.length) keyword += ' ' + song.artists.join(' ')
            try {
                // 搜索
                var searchText = await shellCurl(
                    QISHUI_API + '?act=search&keywords=' + encodeURIComponent(keyword) + '&page=1&pagesize=5&type=music',
                    "-H 'User-Agent: Mozilla/5.0'"
                )
                if (!searchText) return ''
                var searchData
                try { searchData = JSON.parse(searchText) } catch(e) { return '' }
                var list = searchData && searchData.data && searchData.data.lists
                if (!list || !list.length) return ''

                // 取第一条结果获取URL
                var firstSong = list[0]
                var qishuiId = firstSong.id || firstSong.vid || ''
                if (!qishuiId) return ''

                var urlText = await shellCurl(
                    QISHUI_API + '?act=song&id=' + qishuiId + '&quality=low',
                    "-H 'User-Agent: Mozilla/5.0'"
                )
                if (!urlText) return ''
                var urlData
                try { urlData = JSON.parse(urlText) } catch(e) { return '' }
                var songData = urlData && urlData.data
                if (Array.isArray(songData)) songData = songData[0]
                if (songData && songData.url) {
                    // 如果有ekey需要代理解密
                    if (songData.ekey) {
                        try {
                            var proxyCmd = "curl -s --max-time 20 -X POST '" + QISHUI_PROXY_API + "' " +
                                "-H 'Content-Type: application/json' " +
                                "-d '{\"url\":\"" + songData.url + "\",\"key\":\"" + (songData.ekey || '') + "\",\"filename\":\"KMusic\",\"ext\":\"aac\"}' 2>/dev/null"
                            var _rs2 = typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
                            var proxyRes = _rs2 ? await _rs2(proxyCmd) : null
                            var proxyText = (proxyRes && proxyRes.content || '').trim()
                            if (proxyText) {
                                var proxyJson = JSON.parse(proxyText)
                                if (Number(proxyJson.code) === 200 && proxyJson.url) return String(proxyJson.url)
                            }
                        } catch(e) {}
                    }
                    return String(songData.url)
                }
            } catch(e) {}
            return ''
        }

        var aiLogSafe = function(msg, level) {
            try { if (typeof SDM.addDiagLog === 'function') SDM.addDiagLog(msg, level || 'info') } catch(e) {}
        }

        var escapeHtml = function(s) {
            if (!s) return ''
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
        }

        var showSearchLoading = function(text) {
            var container = document.getElementById('sm_search_results')
            if (!container) return
            container.innerHTML = '<div class="sm-search-loading">' + (text || '🔍 搜索中...') + '</div>'
            container.style.display = 'block'
        }

        var showSearchEmpty = function() {
            var container = document.getElementById('sm_search_results')
            if (!container) return
            container.innerHTML = '<div class="sm-search-loading">未找到歌曲，试试其他关键词或平台</div>'
            container.style.display = 'block'
        }

        var renderSearchResults = function() {
            var container = document.getElementById('sm_search_results')
            if (!container) return
            if (!_searchResults.length) { showSearchEmpty(); return }

            var html = ''
            for (var i = 0; i < _searchResults.length; i++) {
                var song = _searchResults[i]
                var name = escapeHtml(song.name || '')
                var artists = escapeHtml((song.artists || []).join(' / '))
                var album = escapeHtml(song.album || '')
                var dur = song.duration ? fmtTime(song.duration / 1000) : ''
                var isCurrent = _currentIndex >= 0 && _playlist[_currentIndex] && _playlist[_currentIndex].pfId === song.id
                var isFav = isFavorited(song.id)
                html += '<div class="sm-search-item' + (isCurrent ? ' _loading' : '') + '" data-search-idx="' + i + '">' +
                    '<div class="sm-search-info">' +
                    '<div class="sm-search-title"><span class="sm-search-pf-tag _' + song.platform + '">' + song.pfName + '</span>' + name + (isCurrent ? ' <span class="sm-search-playing">▶ 播放中</span>' : '') + '</div>' +
                    '<div class="sm-search-artist">' + artists + (album ? ' · ' + album : '') + '</div>' +
                    '</div>' +
                    '<span class="sm-fav-btn' + (isFav ? ' _active' : '') + '" data-fav-toggle="' + i + '" title="收藏">' + (isFav ? '❤️' : '🤍') + '</span>' +
                    '<span class="sm-search-dur">' + dur + '</span>' +
                    '</div>'
            }
            container.innerHTML = html
            container.style.display = 'block'
        }

        var playSearchSong = async function(song) {
            if (!song || !song.id) return
            var title = (song.artists && song.artists.length ? song.artists.join(' / ') + ' - ' : '') + (song.name || '未知歌曲')

            // 检查是否已在播放列表
            for (var i = 0; i < _playlist.length; i++) {
                if (_playlist[i].pfId === song.id) {
                    loadSong(i)
                    play()
                    renderSearchResults()
                    return
                }
            }

            showToast('正在获取播放地址...', 'pink', 2000)

            // 获取真实播放地址
            var playUrl = await getPlayUrl(song)
            if (!playUrl) {
                showToast('获取播放地址失败，该歌曲可能需要VIP', 'red', 4000)
                return
            }

            // 添加到播放列表
            _playlist.push({ url: playUrl, title: title, lrc: '', pfId: song.id, platform: song.platform, songRef: song })
            savePlaylist()
            renderPlaylist()

            // 加载并播放
            loadSong(_playlist.length - 1)
            play()
            renderSearchResults()

            showToast('正在播放: ' + title, 'green', 2500)

            // 异步获取歌词
            fetchLyricsForSong(song)
        }

        var fetchLyricsForSong = async function(song) {
            var _rs = typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
            if (!_rs) return

            try {
                var lrcText = ''

                if (song.platform === 'netease') {
                    var text = await shellCurl(
                        'https://music.163.com/api/song/lyric?id=' + song.songId + '&lv=1&tv=-1',
                        "-H 'Referer: https://music.163.com' -H 'User-Agent: Mozilla/5.0'"
                    )
                    if (text) {
                        var data = JSON.parse(text)
                        if (data.lrc && data.lrc.lyric) lrcText = data.lrc.lyric
                    }
                } else if (song.platform === 'qq') {
                    var text = await shellCurl(
                        'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' + song.songId + '&format=json',
                        "-H 'Referer: https://y.qq.com' -H 'User-Agent: Mozilla/5.0'"
                    )
                    if (text) {
                        if (text.charAt(0) !== '{') {
                            var s = text.indexOf('{'), e = text.lastIndexOf('}')
                            if (s >= 0 && e > s) text = text.substring(s, e + 1)
                        }
                        var data = JSON.parse(text)
                        if (data && data.lyric) {
                            // QQ歌词是base64的
                            try { lrcText = atob(data.lyric) } catch(e) { lrcText = data.lyric }
                        }
                    }
                } else if (song.platform === 'kugou') {
                    var text = await shellCurl(
                        'https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + song.songId + '&album_id=' + (song.albumId || ''),
                        "-H 'Referer: https://www.kugou.com' -H 'User-Agent: Mozilla/5.0'"
                    )
                    if (text) {
                        var data = JSON.parse(text)
                        if (data && data.data && data.data.lyrics) lrcText = data.data.lyrics
                    }
                }

                if (lrcText) {
                    _lrcData = parseLRC(lrcText)
                    _lrcLineIndex = -1

                    if (_currentIndex >= 0 && _playlist[_currentIndex] && _playlist[_currentIndex].pfId === song.id) {
                        _playlist[_currentIndex].lrc = lrcText
                        savePlaylist()
                    }

                    var ta = document.getElementById('sm_lrc_textarea')
                    if (ta) ta.value = lrcText

                    updateLyricsBar()
                }
            } catch(e) {}
        }

        // ---- 扫描本地音乐 ----
        var scanLocalMusic = async function() {
            try {
                var _rs = typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
                if (!_rs) { showToast('设备 Shell 不可用', 'red'); return }
                showToast('正在扫描本地音乐...', 'pink', 3000)
                var dirs = ['/sdcard/Music', '/sdcard/Download', '/sdcard/music', '/sdcard/songs', '/sdcard/Audio']
                var exts = ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac']
                var found = []
                for (var d = 0; d < dirs.length; d++) {
                    var dir = dirs[d]
                    var extPattern = exts.map(function(e) { return '-iname "*.' + e + '"' }).join(' -o ')
                    var cmd = 'find "' + dir + '" -type f \\( ' + extPattern + ' \\) 2>/dev/null | head -50'
                    var res = await _rs(cmd)
                    if (res && res.content) {
                        var lines = res.content.trim().split('\n').filter(function(l) { return l.trim() })
                        for (var i = 0; i < lines.length; i++) {
                            var path = lines[i].trim()
                            if (!path) continue
                            var name = path.split('/').pop()
                            // 尝试构造可播放的 URL
                            var url = path
                            // 检查是否已有 HTTP 前缀可用
                            var prefix = ''
                            try { prefix = localStorage.getItem('smart_http_prefix') || '' } catch(e) {}
                            if (prefix) {
                                // 将 /sdcard/ 路径映射到 HTTP 静态路径
                                var relPath = path.replace(/^\/sdcard\//, '').replace(/^\/data\//, '')
                                url = prefix + 'sdm_update/../' + relPath
                            }
                            found.push({ url: url, title: name.replace(/\.[^.]+$/, ''), lrc: '', _local: true, _path: path })
                        }
                    }
                }
                if (!found.length) {
                    showToast('未找到本地音乐文件', 'pink', 3000)
                    return
                }
                // 去重：按 URL
                var existing = {}
                for (var i2 = 0; i2 < _playlist.length; i2++) existing[_playlist[i2].url] = true
                var added = 0
                for (var j = 0; j < found.length; j++) {
                    if (!existing[found[j].url]) {
                        _playlist.push(found[j])
                        added++
                    }
                }
                savePlaylist()
                renderPlaylist()
                showToast('扫描完成，新增 ' + added + ' 首歌曲（共 ' + _playlist.length + ' 首）', 'green', 4000)
            } catch(e) {
                showToast('扫描失败: ' + e, 'red', 4000)
            }
        }

        // ---- 获取远程歌词 ----
        var fetchRemoteLRC = async function() {
            var urlInput = document.getElementById('sm_lrc_url_input')
            var url = (urlInput && urlInput.value || '').trim()
            if (!url) { showToast('请输入歌词 URL', 'red'); return }
            try {
                showToast('正在获取歌词...', 'pink', 2000)
                var resp = await fetch(url, { cache: 'no-store' })
                if (!resp.ok) throw new Error('HTTP ' + resp.status)
                var text = await resp.text()
                var ta = document.getElementById('sm_lrc_textarea')
                if (ta) ta.value = text
                showToast('歌词已获取，点「应用歌词」生效', 'green', 3000)
            } catch(e) {
                showToast('获取歌词失败: ' + (e.message || e), 'red', 4000)
            }
        }

        // ---- 歌词开关 ----
        var setLyricsOverlay = function(on) {
            _lyricsOverlayVisible = on
            var sw = document.getElementById('sm_lyrics_toggle')
            if (sw) { if (on) sw.classList.add('_on'); else sw.classList.remove('_on') }
            if (on) {
                lyricsBar.classList.add('_show')
                updateLyricsBar()
                // 恢复位置
                try {
                    var pos = localStorage.getItem('smart_music_lyrics_pos')
                    if (pos) {
                        var p = JSON.parse(pos)
                        setLyricsPosition(p.x, p.y)
                    }
                } catch(e) {}
            } else {
                lyricsBar.classList.remove('_show')
            }
            try { localStorage.setItem('smart_music_lyrics_bar', on ? '1' : '0') } catch(e) {}
        }

        // ---- 歌词拖动功能 ----
        var _dragState = { dragging: false, startX: 0, startY: 0, origLeft: 0, origBottom: 0, moved: false }
        var _lyricPosX = null  // null = 居中
        var _lyricPosY = null  // null = 默认底部20px

        var setLyricsPosition = function(x, y) {
            _lyricPosX = x
            _lyricPosY = y
            lyricsBar.style.left = '0'
            lyricsBar.style.right = 'auto'
            lyricsBar.style.bottom = 'auto'
            lyricsBar.style.top = y + 'px'
            lyricsBar.style.transform = 'none'
            // 水平居中于拖动点
            lyricsBar.style.left = x + 'px'
            lyricsBar.style.marginLeft = '0'
        }

        var resetLyricsPosition = function() {
            _lyricPosX = null
            _lyricPosY = null
            lyricsBar.style.left = '50%'
            lyricsBar.style.right = ''
            lyricsBar.style.bottom = '20px'
            lyricsBar.style.top = ''
            lyricsBar.style.transform = 'translateX(-50%)'
            try { localStorage.removeItem('smart_music_lyrics_pos') } catch(e) {}
        }

        var onLyricDragStart = function(e) {
            _dragState.dragging = true
            _dragState.moved = false
            var pt = e.touches ? e.touches[0] : e
            _dragState.startX = pt.clientX
            _dragState.startY = pt.clientY
            var rect = lyricsBar.getBoundingClientRect()
            _dragState.origLeft = rect.left + rect.width / 2  // 中心点X
            _dragState.origBottom = rect.bottom              // 底部Y
            lyricsBar.classList.add('_dragging')
            e.preventDefault()
        }

        var onLyricDragMove = function(e) {
            if (!_dragState.dragging) return
            var pt = e.touches ? e.touches[0] : e
            var dx = pt.clientX - _dragState.startX
            var dy = pt.clientY - _dragState.startY
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragState.moved = true
            var newX = _dragState.origLeft + dx
            var newBottom = window.innerHeight - (_dragState.origBottom + dy)
            // 限制在屏幕内
            var rect = lyricsBar.getBoundingClientRect()
            var halfW = rect.width / 2
            newX = Math.max(halfW, Math.min(window.innerWidth - halfW, newX))
            newBottom = Math.max(10, Math.min(window.innerHeight - rect.height - 10, newBottom))
            setLyricsPosition(newX, window.innerHeight - newBottom - rect.height)
            e.preventDefault()
        }

        var onLyricDragEnd = function() {
            if (!_dragState.dragging) return
            _dragState.dragging = false
            lyricsBar.classList.remove('_dragging')
            if (_dragState.moved && _lyricPosX !== null && _lyricPosY !== null) {
                try {
                    localStorage.setItem('smart_music_lyrics_pos', JSON.stringify({ x: _lyricPosX, y: _lyricPosY }))
                } catch(e) {}
            }
        }

        // 绑定拖动事件
        lyricsBar.addEventListener('mousedown', onLyricDragStart)
        document.addEventListener('mousemove', onLyricDragMove)
        document.addEventListener('mouseup', onLyricDragEnd)
        lyricsBar.addEventListener('touchstart', onLyricDragStart, { passive: false })
        document.addEventListener('touchmove', onLyricDragMove, { passive: false })
        document.addEventListener('touchend', onLyricDragEnd)
        // 双击重置位置
        lyricsBar.addEventListener('dblclick', function() {
            resetLyricsPosition()
            showToast('歌词位置已重置', 'pink', 1500)
        })

        // ---- 面板显示/隐藏 ----
        window.toggleMusicPlayer = function() {
            if (_panelVisible) hidePanel(); else showPanel()
        }

        var showPanel = function() {
            _panelVisible = true
            panel.classList.add('_show')
            overlay.classList.add('_show')
            renderPlaylist()
            renderFavorites()
            // 恢复歌词开关状态
            var savedLyrics = '1'
            try { savedLyrics = localStorage.getItem('smart_music_lyrics_bar') || '1' } catch(e) {}
            setLyricsOverlay(savedLyrics === '1')
        }

        var hidePanel = function() {
            _panelVisible = false
            panel.classList.remove('_show')
            overlay.classList.remove('_show')
        }

        // ---- 事件绑定 ----
        document.getElementById('sm_close_btn').onclick = hidePanel
        overlay.onclick = hidePanel

        document.getElementById('sm_play_btn').onclick = togglePlay
        document.getElementById('sm_prev_btn').onclick = playPrev
        document.getElementById('sm_next_btn').onclick = playNext

        // 播放模式切换（单曲循环 / 顺序播放）
        var updatePlayModeBtn = function() {
            var btn = document.getElementById('sm_mode_btn')
            if (!btn) return
            if (_playMode === 'single') {
                btn.textContent = '🔂'
                btn.title = '单曲循环（点击切换为顺序播放）'
                btn.style.background = 'linear-gradient(135deg,#ec4899,#be185d)'
            } else {
                btn.textContent = '🔁'
                btn.title = '顺序播放（点击切换为单曲循环）'
                btn.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)'
            }
        }
        document.getElementById('sm_mode_btn').onclick = function() {
            _playMode = _playMode === 'single' ? 'sequence' : 'single'
            try { localStorage.setItem('smart_music_playmode', _playMode) } catch(e) {}
            updatePlayModeBtn()
            showToast(_playMode === 'single' ? '已切换为单曲循环' : '已切换为顺序播放', _playMode === 'single' ? 'green' : 'pink', 2000)
        }
        updatePlayModeBtn()

        // 后台播放开关
        _updateBgSwitch()
        var _bgSw = document.getElementById('sm_bg_switch')
        if (_bgSw) _bgSw.onclick = _toggleBgPlay

        // 自动续播开关
        var _updateAutoPlaySwitch = function() {
            var sw = document.getElementById('sm_autoplay_switch')
            if (sw) {
                if (_autoPlayEnabled) sw.classList.add('_on')
                else sw.classList.remove('_on')
            }
        }
        _updateAutoPlaySwitch()
        var _autoPlaySw = document.getElementById('sm_autoplay_switch')
        if (_autoPlaySw) {
            _autoPlaySw.onclick = function() {
                _autoPlayEnabled = !_autoPlayEnabled
                try { localStorage.setItem('smart_music_autoplay', _autoPlayEnabled ? '1' : '0') } catch(e) {}
                _updateAutoPlaySwitch()
                showToast('自动续播: ' + (_autoPlayEnabled ? '开启' : '关闭'), 'green', 1500)
            }
        }

        // ADB 设备播放按钮
        var _adbPlayBtn = document.getElementById('sm_adb_play_btn')
        if (_adbPlayBtn) _adbPlayBtn.onclick = function() { playOnDevice() }
        var _adbStopBtn = document.getElementById('sm_adb_stop_btn')
        if (_adbStopBtn) _adbStopBtn.onclick = function() { stopDevicePlay() }
        // 初始化 ADB 状态显示
        ;(async function() {
            if (_runShell) {
                var available = await _checkAdbAvailable()
                _updateAdbStatus(available ? '设备可用，点击推送播放' : '未检测到可用设备', false)
            } else {
                _updateAdbStatus('需要 Root/Shell 权限', false)
            }
        })()

        // 小窗模式按钮
        var _miniBtn = document.getElementById('sm_minimize_btn')
        if (_miniBtn) _miniBtn.onclick = toggleMiniMode

        // 小窗拖动事件
        panel.addEventListener('mousedown', _onMiniDragStart)
        panel.addEventListener('touchstart', _onMiniDragStart, { passive: false })
        document.addEventListener('mousemove', _onMiniDragMove)
        document.addEventListener('touchmove', _onMiniDragMove, { passive: false })
        document.addEventListener('mouseup', _onMiniDragEnd)
        document.addEventListener('touchend', _onMiniDragEnd)

        // 高级后台同步开关
        _updateBgSyncSwitch()
        var _bgSyncSw = document.getElementById('sm_bgsync_switch')
        if (_bgSyncSw) _bgSyncSw.onclick = _toggleBgSync

        // 后台音乐控制按钮
        var _bgPrevBtn = document.getElementById('sm_bg_prev_btn')
        if (_bgPrevBtn) _bgPrevBtn.onclick = function() { bgMusicPrev() }
        var _bgPlayBtn = document.getElementById('sm_bg_play_btn')
        if (_bgPlayBtn) _bgPlayBtn.onclick = function() { bgMusicPlayPause() }
        var _bgNextBtn = document.getElementById('sm_bg_next_btn')
        if (_bgNextBtn) _bgNextBtn.onclick = function() { bgMusicNext() }

        // 从 localStorage 恢复后台同步状态
        try {
            if (localStorage.getItem('smart_music_bgsync') === '1' && _runShell) {
                _startBgSync()
                _updateBgSyncSwitch()
            }
        } catch(e) {}

        // 添加歌曲
        document.getElementById('sm_add_btn').onclick = function() {
            var urlInput = document.getElementById('sm_url_input')
            var titleInput = document.getElementById('sm_title_input')
            var url = (urlInput.value || '').trim()
            var title = (titleInput.value || '').trim()
            if (!url) { showToast('请输入音频 URL', 'red'); return }
            if (!title) {
                title = url.split('/').pop().replace(/\.[^.]+$/, '') || ('歌曲' + (_playlist.length + 1))
            }
            _playlist.push({ url: url, title: title, lrc: '' })
            savePlaylist()
            renderPlaylist()
            urlInput.value = ''
            titleInput.value = ''
            showToast('已添加: ' + title, 'green', 2000)
            // 如果是第一首，自动选中
            if (_currentIndex < 0) loadSong(_playlist.length - 1)
        }

        // 回车添加
        document.getElementById('sm_url_input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('sm_add_btn').click()
        })

        // 扫描本地
        document.getElementById('sm_scan_btn').onclick = scanLocalMusic

        // Listen1 多源搜索
        document.getElementById('sm_search_btn').onclick = searchAll
        document.getElementById('sm_search_input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') searchAll()
        })
        // 平台切换
        var pfBtns = document.querySelectorAll('#sm_platform_filter .sm-pf-btn')
        pfBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var pf = btn.getAttribute('data-pf')
                _activePlatforms[pf] = !_activePlatforms[pf]
                if (_activePlatforms[pf]) btn.classList.add('_on')
                else btn.classList.remove('_on')
            })
        })
        // 搜索结果点击播放
        document.getElementById('sm_search_results').addEventListener('click', function(e) {
            var favBtn = e.target.closest('.sm-fav-btn')
            if (favBtn) {
                e.stopPropagation()
                var favIdx = parseInt(favBtn.getAttribute('data-fav-toggle'))
                if (!isNaN(favIdx) && _searchResults[favIdx]) {
                    toggleFavorite(_searchResults[favIdx])
                }
                return
            }
            var item = e.target.closest('.sm-search-item')
            if (!item || item.classList.contains('_loading')) return
            var idx = parseInt(item.getAttribute('data-search-idx'))
            if (!isNaN(idx) && _searchResults[idx]) {
                playSearchSong(_searchResults[idx])
            }
        })

        // 播放列表点击
        document.getElementById('sm_playlist_container').addEventListener('click', function(e) {
            var plFavBtn = e.target.closest('[data-pl-fav]')
            if (plFavBtn) {
                e.stopPropagation()
                var plFavIdx = parseInt(plFavBtn.getAttribute('data-pl-fav'))
                if (!isNaN(plFavIdx) && _playlist[plFavIdx] && _playlist[plFavIdx].songRef) {
                    toggleFavorite(_playlist[plFavIdx].songRef)
                }
                return
            }
            var delBtn = e.target.closest('._del')
            if (delBtn) {
                e.stopPropagation()
                var delIdx = parseInt(delBtn.getAttribute('data-del'))
                _playlist.splice(delIdx, 1)
                savePlaylist()
                if (delIdx === _currentIndex) {
                    _audio.pause()
                    _isPlaying = false
                    _currentIndex = -1
                    updatePlayBtn()
                    if (_playlist.length > 0) loadSong(0)
                }
                renderPlaylist()
                showToast('已删除', 'pink', 1500)
                return
            }
            var item = e.target.closest('.sm-playlist-item')
            if (item) {
                var idx = parseInt(item.getAttribute('data-idx'))
                loadSong(idx)
                play()
            }
        })

        // 进度条点击
        document.getElementById('sm_seek_bar').addEventListener('click', function(e) {
            var rect = this.getBoundingClientRect()
            var pct = (e.clientX - rect.left) / rect.width
            if (_audio.duration) {
                _audio.currentTime = _audio.duration * pct
                updateProgress()
            }
        })

        // 音量条点击
        document.getElementById('sm_vol_bar').addEventListener('click', function(e) {
            var rect = this.getBoundingClientRect()
            var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            _audio.volume = pct
            var fill = document.getElementById('sm_vol_fill')
            if (fill) fill.style.width = (pct * 100) + '%'
            var pctEl = document.getElementById('sm_vol_pct')
            if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%'
        })

        // Tab 切换
        document.getElementById('sm_tab_playlist').onclick = function() {
            this.classList.add('_active')
            document.getElementById('sm_tab_favorites').classList.remove('_active')
            document.getElementById('sm_tab_lyrics').classList.remove('_active')
            document.getElementById('sm_playlist_tab').style.display = ''
            document.getElementById('sm_favorites_tab').style.display = 'none'
            document.getElementById('sm_lyrics_tab').style.display = 'none'
        }
        document.getElementById('sm_tab_favorites').onclick = function() {
            this.classList.add('_active')
            document.getElementById('sm_tab_playlist').classList.remove('_active')
            document.getElementById('sm_tab_lyrics').classList.remove('_active')
            document.getElementById('sm_playlist_tab').style.display = 'none'
            document.getElementById('sm_favorites_tab').style.display = ''
            document.getElementById('sm_lyrics_tab').style.display = 'none'
            renderFavorites()
        }
        document.getElementById('sm_tab_lyrics').onclick = function() {
            this.classList.add('_active')
            document.getElementById('sm_tab_playlist').classList.remove('_active')
            document.getElementById('sm_tab_favorites').classList.remove('_active')
            document.getElementById('sm_playlist_tab').style.display = 'none'
            document.getElementById('sm_favorites_tab').style.display = 'none'
            document.getElementById('sm_lyrics_tab').style.display = ''
        }

        // 收藏列表点击
        document.getElementById('sm_favorites_container').addEventListener('click', function(e) {
            var favDel = e.target.closest('[data-fav-del]')
            if (favDel) {
                e.stopPropagation()
                var delIdx = parseInt(favDel.getAttribute('data-fav-del'))
                if (!isNaN(delIdx) && _favorites[delIdx]) {
                    var removedName = _favorites[delIdx].name || '未知'
                    _favorites.splice(delIdx, 1)
                    saveFavorites()
                    renderFavorites()
                    renderSearchResults()
                    renderPlaylist()
                    showToast('已移除收藏: ' + removedName, 'pink', 1500)
                }
                return
            }
            var favItem = e.target.closest('.sm-fav-item')
            if (favItem) {
                var idx = parseInt(favItem.getAttribute('data-fav-idx'))
                if (!isNaN(idx) && _favorites[idx]) {
                    playFavorite(_favorites[idx])
                }
            }
        })

        // 应用歌词
        document.getElementById('sm_apply_lrc_btn').onclick = function() {
            var ta = document.getElementById('sm_lrc_textarea')
            var lrcText = (ta.value || '').trim()
            _lrcData = parseLRC(lrcText)
            _lrcLineIndex = -1
            if (_lrcData.length) {
                showToast('歌词已应用（' + _lrcData.length + ' 行）', 'green', 2500)
            } else {
                // 纯文本歌词：按行存储，时间间隔均匀
                var lines = lrcText.split('\n').filter(function(l) { return l.trim() })
                if (lines.length) {
                    _lrcData = lines.map(function(line, i) {
                        return { time: i * 5, text: line.trim() }
                    })
                    showToast('纯文本歌词已应用（' + lines.length + ' 行，每5秒切换）', 'green', 3000)
                } else {
                    showToast('歌词为空', 'red')
                }
            }
            updateLyricsBar()
        }

        // 保存歌词到当前歌曲
        document.getElementById('sm_save_lrc_btn').onclick = function() {
            if (_currentIndex < 0) { showToast('请先选择歌曲', 'red'); return }
            var ta = document.getElementById('sm_lrc_textarea')
            _playlist[_currentIndex].lrc = (ta.value || '').trim()
            savePlaylist()
            showToast('歌词已保存到「' + _playlist[_currentIndex].title + '」', 'green', 2500)
        }

        // 获取远程歌词
        document.getElementById('sm_fetch_lrc_btn').onclick = fetchRemoteLRC

        // 歌词悬浮条开关
        document.getElementById('sm_lyrics_toggle').onclick = function() {
            setLyricsOverlay(!_lyricsOverlayVisible)
        }

        // audio 事件
        _audio.addEventListener('ended', function() {
            _isPlaying = false
            updatePlayBtn()
            stopProgressTimer()
            if (_playMode === 'single' && _currentIndex >= 0) {
                // 单曲循环：重新播放当前歌曲
                _audio.currentTime = 0
                _audio.play().then(function() {
                    _isPlaying = true
                    updatePlayBtn()
                    startProgressTimer()
                }).catch(function() {})
            } else {
                // 顺序播放：播放下一首
                playNext()
            }
        })

        _audio.addEventListener('loadedmetadata', function() {
            updateProgress()
        })

        _audio.addEventListener('error', function() {
            _isPlaying = false
            updatePlayBtn()
            stopProgressTimer()

            // 自动重试：如果当前歌曲有 songRef，尝试重新获取播放地址
            if (_currentIndex >= 0 && _playlist[_currentIndex] && _playlist[_currentIndex].songRef && _retryCount < 2) {
                _retryCount++
                showToast('播放地址已过期，正在重新获取...（第' + _retryCount + '次）', 'pink', 3000)
                ;(async function() {
                    var songObj = _playlist[_currentIndex].songRef
                    var newUrl = await getPlayUrl(songObj)
                    if (newUrl) {
                        _playlist[_currentIndex].url = newUrl
                        savePlaylist()
                        renderPlaylist()
                        _audio.src = newUrl
                        _audio.load()
                        _audio.play().then(function() {
                            _isPlaying = true
                            updatePlayBtn()
                            startProgressTimer()
                        }).catch(function(e) {
                            showToast('重新获取后仍无法播放: ' + (e.message || ''), 'red', 4000)
                        })
                    } else {
                        showToast('音频加载失败，该歌曲可能需要VIP或暂无可用音源', 'red', 4000)
                    }
                })()
            } else {
                showToast('音频加载失败，请检查 URL 是否可访问', 'red', 4000)
            }
        })

        // 初始渲染
        renderPlaylist()

        // 初始化音量条
        var volFill = document.getElementById('sm_vol_fill')
        if (volFill) volFill.style.width = '80%'

        // 自动续播（延迟一下确保 DOM 就绪）
        if (_autoPlayEnabled) {
            setTimeout(function() { _tryAutoResume() }, 800)
        }

        SDM.addDiagLog('音乐播放器模块已加载（播放列表 ' + _playlist.length + ' 首）', 'success')
    })()


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
            try { if (typeof SDM.toast === 'function') SDM.toast(msg, color || 'pink', dur || 3000) } catch(e) {}
        }

        // getShell 兼容层（基于全局 SDM.runShell）
        // 修复：getShell is not defined
        var getShell = function() {
            if (typeof SDM.runShell !== 'function') return null
            // 返回一个兼容对象，调用方式: _rs(cmd, timeout)
            return function(cmd, timeoutMs) {
                return new Promise(function(resolve) {
                    try {
                        SDM.runShell(cmd, timeoutMs || 5000).then(function(r) {
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
            return typeof SDM.runShell !== 'undefined' ? SDM.runShell : null
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

        // ---- 面板切换 ----
        window.toggleAIPanel = function() {
            if (_panelVisible) hidePanel(); else showPanel()
        }

        var showPanel = function() {
            _panelVisible = true
            panel.classList.add('_show')
            overlay.classList.add('_show')
            renderPendingCommands()
            renderAILogs()
            updateStats()
            updateRunStatus()
        }

        var hidePanel = function() {
            _panelVisible = false
            panel.classList.remove('_show')
            overlay.classList.remove('_show')
        }

        // ---- 全局回调 ----
        window.__aiExec = function(id) { executeCommand(id) }
        window.__aiReject = function(id) { rejectCommand(id) }

        // ---- 事件绑定 ----
        document.getElementById('ai_close_btn').onclick = hidePanel
        overlay.onclick = hidePanel

        document.getElementById('ai_start_btn').onclick = function() {
            if (_aiRunning) stopAI(); else startAI()
        }

        document.getElementById('ai_scan_now_btn').onclick = function() {
            showToast('🤖 正在执行立即检查...', 'pink', 2000)
            runDeviceCheck()
        }

        // AI 深度诊断（PicoClaw 驱动，失败时自动降级为本地诊断）
        document.getElementById('ai_deep_diag_btn').onclick = async function() {
            if (!_picoclawInstalled || !_picoclawConfigured) {
                if (!_picoclawInstalled) {
                    showToast('请先安装 PicoClaw 小龙虾', 'red', 2500)
                } else {
                    showToast('请先配置 PicoClaw API Key', 'red', 2500)
                }
                // 切到 PicoClaw 聊天 tab
                switchAITab('chat')
                return
            }

            var btn = document.getElementById('ai_deep_diag_btn')
            var originalText = btn.textContent
            btn.disabled = true
            btn.textContent = '🔍 正在收集信息...'
            aiLog('🦞 PicoClaw 深度诊断开始...', 'info')

            try {
                var _rs = getShell()
                // 1. 收集系统信息（更全面）
                var diagData = {}
                if (_rs) {
                    try {
                        var sysCmd = 'echo "=== 系统信息 ===" && ' +
                            'uname -a && echo "" && ' +
                            'echo "=== 内核版本 ===" && cat /proc/version 2>/dev/null && echo "" && ' +
                            'echo "=== CPU ===" && cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1 && echo "" && ' +
                            'echo "=== 内存 ===" && cat /proc/meminfo 2>/dev/null | head -5 && echo "" && ' +
                            'echo "=== 温度 ===" && cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null && echo "" && ' +
                            'echo "=== 存储 ===" && df -h / /data 2>/dev/null && echo "" && ' +
                            'echo "=== 网络 ===" && ip addr show 2>/dev/null | grep "inet " && echo "" && ' +
                            'echo "=== 进程TOP ===" && top -bn1 2>/dev/null | head -10 && echo "" && ' +
                            'echo "=== 开机时长 ===" && cat /proc/uptime 2>/dev/null'
                        var sysRes = await _rs(sysCmd, 8000)
                        diagData.system = sysRes.content || ''
                    } catch(e) { diagData.system = '获取失败: ' + String(e) }
                }

                // 2. 先显示本地收集的信息（确保有东西看）
                aiLog('--- 系统信息（已收集） ---', 'info')
                var sysLines = (diagData.system || '').split('\n')
                for (var sli = 0; sli < Math.min(sysLines.length, 30); sli++) {
                    if (sysLines[sli].trim()) aiLog(sysLines[sli], 'info')
                }
                aiLog('--- 信息收集完成 ---', 'info')

                // 3. 尝试用 AI 分析
                btn.textContent = '🤖 AI 分析中...'
                aiLog('📤 正在发送给 PicoClaw 分析...', 'info')
                
                var prompt = '你是一个专业的 Android/CPE 设备诊断专家。请根据以下系统信息进行深度分析，找出潜在问题并给出修复建议。\n\n'
                prompt += '## 系统信息\n```\n' + (diagData.system || '无法获取') + '\n```\n\n'
                prompt += '请按以下格式回答：\n'
                prompt += '## 诊断结论\n（总体评估）\n\n'
                prompt += '## 发现的问题\n1. 问题1 - 严重程度：高/中/低\n2. 问题2...\n\n'
                prompt += '## 修复建议\n（给出具体的 Shell 命令或操作步骤）\n\n'
                prompt += '请用中文回答，简洁明了。'
                
                var result = await sendToPicoClaw(prompt)
                if (result.success && result.content) {
                    aiLog('✅ AI 诊断完成', 'success')
                    // 显示结果
                    addPendingCommand(
                        'echo "PicoClaw 深度诊断报告已生成，查看 AI 日志"',
                        'AI 深度诊断报告',
                        result.content.substring(0, 200),
                        'ai_diagnosis',
                        true
                    )
                    // 同时在日志里显示完整结果
                    aiLog('--- 🤖 AI 诊断报告 ---', 'success')
                    var lines = result.content.split('\n')
                    for (var li = 0; li < lines.length; li++) {
                        if (lines[li].trim()) aiLog(lines[li], 'info')
                    }
                    aiLog('--- 报告结束 ---', 'success')
                    showToast('✅ 深度诊断完成，查看 AI 日志', 'green', 3000)
                    // 切到 AI 日志区域
                    var logArea = document.getElementById('ai_log_area')
                    if (logArea) logArea.scrollTop = logArea.scrollHeight
                } else {
                    // AI 分析失败，但系统信息已经收集了
                    var errMsg = result.error || '未知错误'
                    aiLog('⚠️ AI 分析失败: ' + errMsg, 'warn')
                    aiLog('💡 但系统信息已收集完成，可手动查看上方日志', 'info')
                    
                    // 如果是余额不足，给出充值和免费方案建议
                    if (errMsg.indexOf('余额不足') >= 0 || errMsg.indexOf('insufficient') >= 0) {
                        aiLog('💡 推荐免费方案：硅基流动(SiliconFlow)每日有免费额度', 'info')
                        aiLog('   注册地址: https://cloud.siliconflow.cn', 'info')
                    }
                    
                    showToast('AI 分析失败，系统信息已记录在日志', 'yellow', 4000)
                    
                    // 添加到待审批（方便查看）
                    addPendingCommand(
                        'echo "查看 AI 日志中的系统信息"',
                        '系统诊断报告（本地模式）',
                        'AI 分析失败，但系统信息已收集，查看 AI 日志',
                        'ai_diagnosis_local',
                        true
                    )
                }
            } catch(e) {
                aiLog('❌ 诊断异常：' + String(e), 'error')
                showToast('诊断异常', 'red', 2000)
            } finally {
                btn.disabled = false
                btn.textContent = originalText
            }
        }

        document.getElementById('ai_approve_all_btn').onclick = approveAllPending

        // AI代码任务按钮
        document.getElementById('ai_gen_btn').onclick = async function() {
            var input = document.getElementById('ai_task_input')
            var desc = (input && input.value || '').trim()
            if (!desc) { showToast('请输入任务描述', 'red'); return }

            document.getElementById('ai_task_loading').style.display = 'block'
            document.getElementById('ai_task_result').style.display = 'none'

            try {
                var result = await generateCommand(desc)
                showTaskResult(result)
            } catch(e) {
                document.getElementById('ai_task_loading').style.display = 'none'
                showToast('生成失败: ' + (e.message || e), 'red', 3000)
            }
        }
        document.getElementById('ai_task_input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('ai_gen_btn').click()
        })
        document.getElementById('ai_task_exec_btn').onclick = executeTaskCmd
        document.getElementById('ai_task_cancel_btn').onclick = function() {
            document.getElementById('ai_task_result').style.display = 'none'
            _currentTaskCmd = null
        }

        // 待审批命令的事件委托（替代内联onclick，兼容性更好）
        document.getElementById('ai_pending_container').addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]')
            if (!btn) return
            e.stopPropagation()
            var action = btn.getAttribute('data-action')
            var id = parseInt(btn.getAttribute('data-cmd-id'))
            if (isNaN(id)) return
            if (action === 'exec') executeCommand(id)
            else if (action === 'reject') rejectCommand(id)
        })

        // AI悬浮按钮显示开关
        var _fabVisible = true
        try { _fabVisible = localStorage.getItem('smart_ai_fab_visible') !== '0' } catch(e) {}

        var updateFABVisibility = function() {
            var fab = document.getElementById('smart_ai_fab')
            if (!fab) return
            if (_fabVisible) {
                fab.style.display = 'flex'
            } else {
                fab.style.display = 'none'
            }
        }

        document.getElementById('ai_fab_switch').onclick = function() {
            _fabVisible = !_fabVisible
            if (_fabVisible) this.classList.add('_on')
            else this.classList.remove('_on')
            try { localStorage.setItem('smart_ai_fab_visible', _fabVisible ? '1' : '0') } catch(e) {}
            updateFABVisibility()
            aiLog('AI悬浮按钮: ' + (_fabVisible ? '显示' : '隐藏'), 'info')
        }

        document.getElementById('ai_auto_approve_switch').onclick = function() {
            _autoApproveSafe = !_autoApproveSafe
            if (_autoApproveSafe) this.classList.add('_on')
            else this.classList.remove('_on')
            try { localStorage.setItem('smart_ai_auto_safe', _autoApproveSafe ? '1' : '0') } catch(e) {}
            aiLog('自动批准安全命令: ' + (_autoApproveSafe ? '开启' : '关闭'), 'info')
        }

        // 恢复自动批准开关
        if (_autoApproveSafe) {
            var sw = document.getElementById('ai_auto_approve_switch')
            if (sw) sw.classList.add('_on')
        }

        // 恢复悬浮按钮显示状态
        if (!_fabVisible) {
            var fabSw = document.getElementById('ai_fab_switch')
            if (fabSw) fabSw.classList.remove('_on')
            updateFABVisibility()
        }

        // ============================================================
        // ===== PicoClaw 聊天集成（小龙虾 AI 助手）=====
        // ============================================================
        var _picoclawPath = '/data/picoclaw'
        var _picoclawBin = _picoclawPath + '/picoclaw'
        var _picoclawHomeEnv = 'HOME=' + _picoclawPath
        var _picoclawSslEnv = 'SSL_CERT_DIR=/system/etc/security/cacerts'
        var _chatHistory = []  // {role: 'user'|'ai', content: string, time: string}
        var _chatLoading = false
        var _picoclawInstalled = false   // 是否已安装
        var _picoclawRunning = false     // 进程是否在运行
        var _picoclawConfigured = false  // 是否已配置 API（能正常回复）
        var _deviceCtx = ''              // ★ 设备上下文（型号/系统/架构），发给 AI 让它知道自己"住在"哪台设备上

        // ★ 采集设备信息作为 AI 的"身体感知"
        var _collectDeviceCtx = async function(_rs) {
            try {
                var r = await _rs('getprop ro.product.model; getprop ro.product.brand; getprop ro.build.version.release; getprop ro.build.version.sdk; uname -m; cat /proc/meminfo 2>/dev/null | head -1', 3000)
                var lines = (r.content || '').trim().split('\n').map(function(l) { return l.trim() })
                if (lines.length >= 5 && lines[0]) {
                    var memPart = ''
                    var memMatch = (lines[5] || '').match(/MemTotal:\s*(\d+)\s*kB/)
                    if (memMatch) memPart = ', ' + Math.round(parseInt(memMatch[1]) / 1024 / 1024) + 'GB 内存'
                    _deviceCtx = '[设备环境: ' + (lines[1] || '') + ' ' + lines[0] +
                                 ', Android ' + (lines[2] || '?') + ' (SDK ' + (lines[3] || '?') + ')' +
                                 ', ' + (lines[4] || '?') + ' 架构' + memPart + '] '
                }
            } catch(e) {}
        }

        // 切换聊天视图：'install' | 'config' | 'chat'
        var showChatView = function(viewName) {
            var installView = document.getElementById('chat_setup_install')
            var configView = document.getElementById('chat_setup_config')
            var msgBox = document.getElementById('chat_messages')
            var quickActions = document.getElementById('chat_quick_actions')
            var inputArea = document.getElementById('chat_input_area')
            var localTools = document.getElementById('chat_local_tools')
            var cmdOutput = document.getElementById('chat_cmd_output')

            if (installView) installView.style.display = viewName === 'install' ? 'flex' : 'none'
            if (configView) configView.style.display = viewName === 'config' ? 'flex' : 'none'
            if (msgBox) msgBox.style.display = viewName === 'chat' ? 'flex' : 'none'
            if (quickActions) quickActions.style.display = viewName === 'chat' ? 'flex' : 'none'
            if (inputArea) inputArea.style.display = viewName === 'chat' ? 'flex' : 'none'
            if (localTools) localTools.style.display = viewName === 'local' ? 'block' : 'none'
            if (cmdOutput) cmdOutput.style.display = 'none'  // 切换视图时隐藏输出
        }

        // 完整检测 PicoClaw 状态（安装 + 运行 + 配置）
        var checkPicoClawStatus = async function() {
            try {
                var _rs = getShell()
                if (!_rs) {
                    _picoclawInstalled = false
                    _picoclawRunning = false
                    _picoclawConfigured = false
                    updatePicoClawStatusUI()
                    showChatView('install')
                    return
                }
                // 1. 检测是否安装
                var instRes = await _rs('[ -x "' + _picoclawBin + '" ] && echo INSTALLED || echo NOT_INSTALLED', 2000)
                _picoclawInstalled = (instRes.content || '').indexOf('INSTALLED') >= 0 && (instRes.content || '').indexOf('NOT_INSTALLED') < 0

                if (!_picoclawInstalled) {
                    _picoclawRunning = false
                    _picoclawConfigured = false
                    updatePicoClawStatusUI()
                    showChatView('install')
                    return
                }

                // 2. 检测配置文件是否存在（PicoClaw agent 模式不需要后台进程）
                var cfgFile = _picoclawPath + '/.picoclaw/config.json'
                var cfgRes = await _rs('[ -f "' + cfgFile + '" ] && echo HAS_CONFIG || echo NO_CONFIG', 2000)
                var hasConfig = (cfgRes.content || '').indexOf('HAS_CONFIG') >= 0
                
                // 检查进程是否在运行（可选，agent 模式不需要常驻）
                var runRes = await _rs('pgrep picoclaw 2>/dev/null', 2000)
                _picoclawRunning = !!(runRes.content && runRes.content.trim())

                // 3. 检测配置是否有效
                _picoclawConfigured = false
                if (hasConfig) {
                    // 读取配置文件验证 API Key 是否存在
                    try {
                        var cfgContent = await _rs('cat ' + cfgFile + ' 2>/dev/null', 2000)
                        var cfgText = cfgContent.content || ''
                        // 兼容 PicoClaw V2 格式（model_list/api_keys）与旧格式（api_key），不再依赖 sk- 前缀
                        var _hasKeyV2 = cfgText.indexOf('"api_keys"') >= 0 || cfgText.indexOf('"api_key"') >= 0
                        var _hasModelList = cfgText.indexOf('model_list') >= 0
                        var _hasOldCfg = cfgText.indexOf('llm') >= 0 && cfgText.indexOf('providers') >= 0
                        if (_hasKeyV2 && (_hasModelList || _hasOldCfg)) {
                            _picoclawConfigured = true
                            // 如果有后台进程就显示运行中，否则也认为可用（agent模式）
                            if (!_picoclawRunning) {
                                _picoclawRunning = true  // agent 模式随时可用，标记为 true
                            }
                            // ★ 采集设备上下文，让 AI 知道自己"住"在哪台设备上
                            if (!_deviceCtx) await _collectDeviceCtx(_rs)
                        }
                    } catch(e) {}
                }
                
                // 如果配置了，尝试发一条测试消息确认能用
                if (_picoclawConfigured) {
                    try {
                        var testResult = await sendToPicoClaw('请只回复"OK"')
                        if (!testResult.success) {
                            // 测试失败但配置存在，可能是网络或余额问题，仍保留可用状态
                            _installLog('PicoClaw 测试消息失败: ' + (testResult.error || '未知'))
                        }
                    } catch(e) {}
                }

                // 根据状态决定显示哪个视图
                if (_picoclawConfigured) {
                    showChatView('chat')
                } else {
                    // 没配置 API 也显示本地工具箱（无需AI就能用）
                    showChatView('local')
                }
            } catch(e) {
                _picoclawInstalled = false
                _picoclawRunning = false
                _picoclawConfigured = false
                showChatView('install')
            }
            updatePicoClawStatusUI()
        }

        var updatePicoClawStatusUI = function() {
            var dot = document.getElementById('picoclaw_status_dot')
            var txt = document.getElementById('picoclaw_status_text')
            if (!dot || !txt) return
            if (!_picoclawInstalled) {
                dot.className = 'chat-status-dot _bad'
                txt.textContent = '未安装'
            } else if (!_picoclawConfigured) {
                dot.className = 'chat-status-dot _bad'
                txt.textContent = '未配置 API'
            } else if (!_picoclawRunning) {
                dot.className = 'chat-status-dot _warn'
                txt.textContent = '已配置 · 待启动'
            } else {
                dot.className = 'chat-status-dot _ok'
                txt.textContent = '已就绪 · 可用'
            }
        }

        // Tab 切换
        var switchAITab = function(tabName) {
            var tabs = panel.querySelectorAll('.ai-tab')
            tabs.forEach(function(t) {
                if (t.getAttribute('data-tab') === tabName) t.classList.add('_active')
                else t.classList.remove('_active')
            })
            var contents = panel.querySelectorAll('.ai-tab-content')
            contents.forEach(function(c) { c.classList.remove('_active') })
            var target = document.getElementById('ai_tab_' + tabName)
            if (target) target.classList.add('_active')

            // 切到聊天 tab 时刷新状态
            if (tabName === 'chat') {
                checkPicoClawStatus()
                scrollChatToBottom()
            }
        }

        // 绑定 Tab 点击
        panel.querySelectorAll('.ai-tab').forEach(function(tab) {
            tab.onclick = function() {
                var name = tab.getAttribute('data-tab')
                if (name) switchAITab(name)
            }
        })

        // 简单的 Markdown 渲染（只处理代码块、行内代码、换行）
        var renderMarkdownSimple = function(text) {
            var html = String(text || '')
            // 转义 HTML
            html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            // 代码块 ```
            html = html.replace(/```([a-z]*)\n?([\s\S]*?)```/gi, function(m, lang, code) {
                return '<pre><code>' + code.trim() + '</code></pre>'
            })
            // 行内代码 `code`
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
            // 粗体 **text**
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // 换行保留
            return html
        }

        // 添加聊天消息
        var addChatMessage = function(role, content) {
            var empty = document.getElementById('chat_empty')
            if (empty) empty.style.display = 'none'

            var msgBox = document.getElementById('chat_messages')
            if (!msgBox) return

            var now = new Date()
            var timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0')

            var msgDiv = document.createElement('div')
            msgDiv.className = 'chat-msg _' + role
            msgDiv.innerHTML =
                '<div class="chat-avatar">' + (role === 'user' ? '👤' : '🦞') + '</div>' +
                '<div class="chat-bubble">' + renderMarkdownSimple(content) + '</div>'
            msgBox.appendChild(msgDiv)

            _chatHistory.push({ role: role, content: content, time: timeStr })
            if (_chatHistory.length > 100) _chatHistory.shift()

            scrollChatToBottom()
        }

        var scrollChatToBottom = function() {
            var msgBox = document.getElementById('chat_messages')
            if (msgBox) msgBox.scrollTop = msgBox.scrollHeight
        }

        // 显示"正在思考"状态
        var showTypingIndicator = function() {
            var msgBox = document.getElementById('chat_messages')
            if (!msgBox) return
            var typing = document.createElement('div')
            typing.id = 'chat_typing'
            typing.className = 'chat-msg _ai'
            typing.innerHTML =
                '<div class="chat-avatar">🦞</div>' +
                '<div class="chat-bubble"><span class="chat-typing">正在思考...</span></div>'
            msgBox.appendChild(typing)
            scrollChatToBottom()
        }

        var removeTypingIndicator = function() {
            var t = document.getElementById('chat_typing')
            if (t) t.remove()
        }

        // 直接调用 API（备用方案，绕过 PicoClaw 内部 curl 问题）
        var _callApiDirect = async function(_rs, message) {
            try {
                // 读取配置文件获取 API Key 和 base_url（兼容 PicoClaw V2 model_list 与旧 llm.providers 格式）
                var cfgFile = _picoclawPath + '/.picoclaw/config.json'
                var cfgRes = await _rs('cat ' + cfgFile + ' 2>/dev/null', 2000)
                var cfgText = cfgRes.content || ''
                if (!cfgText || (cfgText.indexOf('api_key') < 0 && cfgText.indexOf('api_keys') < 0)) {
                    return { success: false, error: '未找到 API 配置' }
                }
                
                var apiKey = ''
                var baseUrl = 'https://api.deepseek.com/v1/chat/completions'
                var model = 'deepseek-chat'
                
                try {
                    var cfg = JSON.parse(cfgText)

                    // 新格式：PicoClaw V2（model_list）
                    if (cfg.model_list && cfg.model_list.length > 0) {
                        var wantName = (cfg.agents && cfg.agents.defaults && cfg.agents.defaults.model_name) || ''
                        var entry = null
                        for (var mi = 0; mi < cfg.model_list.length; mi++) {
                            if (!wantName || cfg.model_list[mi].model_name === wantName) { entry = cfg.model_list[mi]; break }
                        }
                        if (!entry) entry = cfg.model_list[0]
                        apiKey = (entry.api_keys && entry.api_keys[0]) || entry.api_key || ''
                        if (entry.api_base) {
                            baseUrl = entry.api_base.replace(/\/$/, '') + '/chat/completions'
                        }
                        if (entry.model) {
                            // "vendor/model-id" → 发给 API 时去掉厂商前缀
                            var si = entry.model.indexOf('/')
                            model = si >= 0 ? entry.model.substring(si + 1) : entry.model
                        }
                    }

                    // 兼容旧格式（llm.providers.default）
                    if (!apiKey && cfg.llm && cfg.llm.providers && cfg.llm.providers.default) {
                        var prov = cfg.llm.providers.default
                        apiKey = prov.api_key || ''
                        if (prov.base_url) {
                            baseUrl = prov.base_url.replace(/\/$/, '') + '/chat/completions'
                        }
                        if (prov.default_model) {
                            model = prov.default_model
                        }
                    }
                } catch(e) {
                    // JSON 解析失败，用 grep 提取
                    var keyMatch = cfgText.match(/"api_keys?"\s*:\s*\[?\s*"([^"]+)"/)
                    if (keyMatch) apiKey = keyMatch[1]
                    var urlMatch = cfgText.match(/"api_base"\s*:\s*"([^"]+)"/) || cfgText.match(/"base_url"\s*:\s*"([^"]+)"/)
                    if (urlMatch) baseUrl = urlMatch[1].replace(/\/$/, '') + '/chat/completions'
                }
                
                if (!apiKey) return { success: false, error: '未找到 API Key' }
                
                // 构造请求体
                var body = JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: '你是一个有帮助的AI助手。' },
                        { role: 'user', content: message }
                    ],
                    max_tokens: 2000,
                    temperature: 0.7
                })
                
                // 转义 body 里的单引号
                var escapedBody = body.replace(/'/g, "'\\''")
                
                // 用 timeout + curl 调用
                var cmd = "timeout 60 curl -s -k " +
                    "-X POST '" + baseUrl + "' " +
                    "-H 'Content-Type: application/json' " +
                    "-H 'Authorization: Bearer " + apiKey + "' " +
                    "-d '" + escapedBody + "' 2>&1"
                
                var res = await _rs(cmd, 70000)
                var output = (res && res.content) || ''
                
                // 解析响应
                if (!output || output.trim().length === 0) {
                    return { success: false, error: 'API 返回为空' }
                }
                
                try {
                    var data = JSON.parse(output)
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        var content = data.choices[0].message.content
                        if (content) {
                            return { success: true, content: content.trim() }
                        }
                    }
                    if (data.error) {
                        var errMsg = data.error.message || JSON.stringify(data.error)
                        // 余额不足
                        if (errMsg.toLowerCase().indexOf('insufficient') >= 0 || 
                            errMsg.toLowerCase().indexOf('balance') >= 0 ||
                            errMsg.toLowerCase().indexOf('quota') >= 0) {
                            return { success: false, error: 'API 余额不足\n\n💡 推荐免费方案：硅基流动(SiliconFlow)每日有免费额度\n注册地址：https://cloud.siliconflow.cn' }
                        }
                        return { success: false, error: 'API错误: ' + errMsg.substring(0, 80) }
                    }
                    return { success: false, error: 'API 响应格式异常' }
                } catch(e) {
                    // 不是 JSON，检查是不是 curl 错误
                    if (output.indexOf('curl:') >= 0) {
                        return { success: false, error: '网络请求失败: ' + output.substring(0, 80) }
                    }
                    return { success: false, error: '响应解析失败: ' + output.substring(0, 80) }
                }
            } catch(e) {
                return { success: false, error: '直接调用API失败: ' + String(e).substring(0, 50) }
            }
        }

        // ★★★ 命令规范化：修掉小模型的"拼写幻觉"，把设备上不存在的写法纠正成真实命令 ★★★
        // 7B 模型常把 svc data 记成 svc mobile / svc* 之类，靠提示词约束不稳定，这里做硬兜底
        var _normalizeAgentCmd = function(raw) {
            var c = (raw || '').trim()
            if (!c) return { cmd: c, note: '' }
            var before = c
            var rules = [
                // svc 的合法子命令只有 data/wifi/bluetooth/usb/nfc/power，模型常编造其他
                [/\bsvc\s+(mobile|cellular|lte|radio|net|network|internet)\b/gi, 'svc data'],
                // svc* / svc data* 之类带星号的幻影写法
                [/\bsvc\s*\*+/gi, 'svc data'],
                [/\bsvc\s+data\s*\*/gi, 'svc data enable'],
                [/\bsvc\s+data\s+restart\b/gi, 'svc data disable && sleep 2 && svc data enable'],
                [/\bsvc\s+data\s+reconnect\b/gi, 'svc data disable && sleep 2 && svc data enable'],
                // nddc / flushif 等拼错的 ndc 子命令
                [/\bnddc\b/gi, 'ndc'],
                [/\bndc\s+resolver\s+flushif\b/gi, 'ndc resolver flushdefaultif'],
                [/\bflushif\b/gi, 'flushdefaultif'],
                // 安卓 toolbox 没 ipconfig；ifconfig 输出格式差，统一换成 ip addr
                [/\bipconfig\b/gi, 'ip addr'],
                [/\bifconfig\b/gi, 'ip addr'],
                // 另一些常见幻觉
                [/\bnetcfg\b/gi, 'ip addr'],
                [/\biptables\s+-L\b/gi, 'iptables -L -n'],
                [/\bping\s+-c\s+\d+\s+8\.8\.8\.8\b/gi, 'ping -c 3 223.5.5.5'],
                [/\bping\s+8\.8\.8\.8\b/gi, 'ping -c 3 223.5.5.5'],
                [/\bping\s+-c\s+\d+\s+baidu\.com\b/gi, 'ping -c 3 223.5.5.5']
            ]
            for (var i = 0; i < rules.length; i++) {
                if (rules[i][0].test(c)) c = c.replace(rules[i][0], rules[i][1])
            }
            // 去掉命令首尾多余的星号/问号（模型偶尔输出通配符当占位符）
            c = c.replace(/\s*\*+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
            if (c !== before) {
                return { cmd: c, note: '(注意：你写的 `' + before + '` 在这台设备上不适用或不存在，我已自动调整为 `' + c + '` 并执行。以后请直接使用调整后的写法。)' }
            }
            return { cmd: c, note: '' }
        }

        // ★★★ 退化检测：小模型在多轮循环中会陷入"复读机"状态，输出 " " " " / 2 2 23.5 之类垃圾 ★★★
        // 一旦检测到，立即打断并要求重说，避免用垃圾命令去执行、也避免污染后续上下文
        var _isDegenerate = function(text) {
            if (!text || text.length < 8) return false
            // 1. 某个 2~10 字符片段连续重复 4 次以上（如 '" " " " '、'svc svc svc'）
            //    只匹配长度≥2 的片段，避免误杀 '=====' 这类分隔线
            if (/(.{2,10}?)\1{4,}/.test(text)) return true
            // 2. 单字符/短串被空格隔开花式重复（如 '2 2 2 23.5'）
            if (/(^|\s)(\S)(\s+\2){5,}/.test(text)) return true
            // 3. IP/数字被空格拆散（如 'ping -c 3 2 2 23.5.5.5'）——正常命令不会这样
            if (/(^|\s)\d\s+\d\s+[\d.]+/.test(text)) return true
            // 3. 引号垃圾：引号很多但去掉引号和空格后几乎没内容
            var quotes = (text.match(/[\u201c\u201d"\u2018\u2019']/g) || []).length
            if (quotes > 10 && text.replace(/[\u201c\u201d"\u2018\u2019'\s]/g, '').length < 20) return true
            // 4. 碎片化：大量 ≤2 字符的碎片（正常命令不会有这种结构）
            var frags = text.split(/\s+/).filter(function(s) { return s.length > 0 })
            if (frags.length > 25 && frags.filter(function(s) { return s.length <= 2 }).length / frags.length > 0.8) return true
            return false
        }

        // 检查命令引号是否配平（模型常输出半截命令，如 grep -i "data 少了右引号）
        var _fixUnbalancedQuotes = function(c) {
            var q = (c.match(/"/g) || []).length
            var sq = (c.match(/'/g) || []).length
            if (q % 2 !== 0) {
                // 奇数个双引号：补一个到末尾（最常见的情况是尾部截断）
                c = c + '"'
                return { cmd: c, note: '(注意：你给的命令双引号没有闭合，我已在末尾补齐。如果这不是你的本意，请重新给出完整命令。)' }
            }
            if (sq % 2 !== 0) {
                c = c + "'"
                return { cmd: c, note: '(注意：你给的命令单引号没有闭合，我已在末尾补齐。)' }
            }
            return { cmd: c, note: '' }
        }

        // 判断是否为"修复/写入类"命令（这类命令执行成功时常无输出，与查询命令的空输出要区别对待）
        var _isWriteCmd = function(c) {
            return /^(svc\s|cmd\s|settings\s|setprop|killall|ndc\s|rm\s|sync|am\s|pm\s|input\s|chmod\s|stop\s|start\s)/i.test((c || '').trim())
        }

        // ★★★ 网络修复「剧本模式」★★★
        // 小模型（7B）在长对话里容易失控、乱拼命令。所以网络修复这类高频场景不走自由循环：
        // 诊断序列、修复动作、复测都由脚本确定性执行，AI 只做两件事——①从编号列表里选方案 ②读结果写总结。
        // 把"问答题"降维成"选择题+总结题"，7B 也能稳定跑通。
        var _NET_FIX_PLANS = [
            { id: 1, name: '重启移动数据连接', cmd: 'svc data disable && sleep 2 && svc data enable', risk: '无副作用，毫秒级闪断' },
            { id: 2, name: '切换飞行模式再切回', cmd: 'cmd connectivity airplane-mode enable; sleep 3; cmd connectivity airplane-mode disable', risk: '会短暂断开所有连接约3秒' },
            { id: 3, name: '清除DNS缓存', cmd: 'ndc resolver flushdefaultif', risk: '无副作用' },
            { id: 4, name: '换用公共DNS', cmd: 'settings put global private_dns_mode off; setprop net.dns1 223.5.5.5; setprop net.dns2 119.29.29.29', risk: '会改变DNS配置' },
            { id: 5, name: '重启WiFi', cmd: 'svc wifi disable && sleep 2 && svc wifi enable', risk: 'WiFi会断开重连' },
            { id: 6, name: '重启网络相关进程(系统会自动拉起)', cmd: 'killall netd 2>/dev/null; sleep 3', risk: '网络会闪断约3秒' }
        ]
        var _NET_DIAG_CMDS = [
            { key: '外网连通性', cmd: 'ping -c 3 223.5.5.5 2>&1 | tail -4' },
            { key: '移动数据状态', cmd: 'dumpsys telephony.registry 2>/dev/null | grep -iE "mDataConnectionState|mServiceState|mSignalStrength" | head -5' },
            { key: 'SIM卡', cmd: 'getprop gsm.sim.state; getprop gsm.operator.alpha' },
            { key: '网卡与IP', cmd: 'ip addr | grep -E "inet |^[0-9]+:" | head -10' },
            { key: '路由表', cmd: 'ip route | head -5' },
            { key: '连接管理', cmd: 'dumpsys connectivity 2>/dev/null | grep -iE "Active default network|Internet detection|CONNECTED|DISCONNECTED" | head -8' }
        ]

        var _runNetworkPlaybook = async function(_rs, baseUrl, apiKey, model, deviceInfo, onProgress) {
            var callLLM = async function(msgs, maxtok) {
                var body = JSON.stringify({ model: model, messages: msgs, max_tokens: maxtok || 500, temperature: 0.3 })
                var curlCmd = "timeout 45 curl -s -k -X POST '" + baseUrl + "' " +
                    "-H 'Content-Type: application/json' -H 'Authorization: Bearer " + apiKey + "' " +
                    "-d '" + body.replace(/'/g, "'\\''") + "' 2>&1"
                var res = await _rs(curlCmd, 55000)
                var out = (res && res.content) || ''
                try {
                    var d = JSON.parse(out)
                    if (d.error) {
                        var em = d.error.message || ''
                        if (em.toLowerCase().indexOf('insufficient') >= 0 || em.toLowerCase().indexOf('balance') >= 0) return { error: 'API 余额不足，请充值后重试' }
                        return { error: 'API错误: ' + em.substring(0, 80) }
                    }
                    return { content: (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '' }
                } catch(e) {
                    return { error: '响应解析失败' }
                }
            }
            var runDiag = async function(tag) {
                var lines = []
                for (var i = 0; i < _NET_DIAG_CMDS.length; i++) {
                    var it = _NET_DIAG_CMDS[i]
                    if (onProgress) onProgress('diag', tag + ' · ' + it.key)
                    var r = await _rs('timeout 15 ' + it.cmd + ' 2>&1 | head -20', 20000)
                    var v = ((r && r.content) || '').trim()
                    lines.push('【' + it.key + '】\n' + (v || '(无输出)'))
                }
                return lines.join('\n')
            }

            // ① 脚本自主诊断（不经过AI）
            if (onProgress) onProgress('diag', '正在诊断网络')
            var diagBefore = await runDiag('诊断')

            // ② AI 只做选择题：读诊断结果 → 从编号方案里挑一个
            if (onProgress) onProgress('think', '分析根因中')
            var planList = _NET_FIX_PLANS.map(function(p) { return p.id + '. ' + p.name + '（' + p.risk + '）' }).join('\n')
            var chooseRes = await callLLM([
                { role: 'system', content: deviceInfo + '你是Android设备的网络诊断专家。下面是一台设备的真实诊断输出。请判断最可能的原因，并从给定方案中选择一个最对症的。\n\n可选择的修复方案：\n' + planList + '\n\n如果认为这些方案都无效、必须人工处理（如需要重启设备、SIM卡欠费），请选择 0。\n\n输出格式（严格遵守，不要其他内容）：\n[原因]一句话说明根因[/原因]\n[选择]方案编号，如 2[/选择]' },
                { role: 'user', content: diagBefore }
            ], 300)
            var reason = ''
            var pick = -1
            var aiUsable = true
            if (chooseRes.error) {
                aiUsable = false   // AI 不可用（余额/网络/接口问题）→ 走规则兜底，照样修
            } else if (_isDegenerate(chooseRes.content)) {
                aiUsable = false
            } else {
                // 兼容 [原因]xxx[/原因] 与 [原因]xxx[原因] 两种写法（小模型经常漏掉斜杠）
                var rm = chooseRes.content.match(/\[原因\]([\s\S]*?)\[\/?原因\]/)
                if (rm) reason = rm[1].trim()
                var pm = chooseRes.content.match(/\[选择\]\s*(\d+)/)
                if (pm) pick = parseInt(pm[1], 10)
            }
            // ★ 规则兜底：AI 选不出/不可用/瞎选时，脚本基于诊断文本自己判断
            var _rulePick = function(t) {
                var s = t || ''
                if (/0%\s*packet loss/i.test(s) && /connected|CONNECTED/i.test(s)) return 0   // 其实是通的，不用修
                if (/mDataConnectionState=0|DataConnectionState:\s*0/i.test(s)) return 1        // 移动数据断了 → 重连
                if (/Network is unreachable|100%\s*packet loss/i.test(s)) {
                    if (/ABSENT|SIM.*not|NOSIM/i.test(s)) return 0                              // 没SIM卡，修不了
                    if (/mServiceState=OUT_OF_SERVICE|OUT_OF_SERVICE/i.test(s)) return 2        // 无服务 → 飞行模式重搜网
                    return 2                                                                     // 整体不通 → 飞行模式
                }
                if (/Internet detection:\s*FAIL/i.test(s)) return 3                             // 能连上但上网检测失败 → 清DNS
                return 1
            }
            if (!aiUsable || isNaN(pick) || pick < 0 || pick > _NET_FIX_PLANS.length) {
                pick = _rulePick(diagBefore)
                if (!reason) reason = '（AI 未能判断，由插件内置规则分析）'
            }

            // ③ 执行选中的修复动作（脚本执行）
            var fixName = '（未执行修复）'
            var fixOut = ''
            if (pick > 0) {
                var plan = _NET_FIX_PLANS[pick - 1]
                fixName = plan.name
                if (onProgress) onProgress('fix', plan.name)
                var fr = await _rs('timeout 25 ' + plan.cmd + ' 2>&1 | head -20; echo "[exit=$?]"', 32000)
                fixOut = ((fr && fr.content) || '').trim()
                // 给网络一点恢复时间
                await _rs('sleep 4', 8000)
            }

            // ④ 复测：跑同一套诊断，拿客观对比证据
            if (onProgress) onProgress('diag', '正在验证结果')
            var diagAfter = await runDiag('复测')

            // ⑤ AI 只做总结：读前后对比，说人话（这里不再给命令权限）
            if (onProgress) onProgress('think', '整理结论')
            var sumRes = await callLLM([
                { role: 'system', content: deviceInfo + '你是Android设备的AI管家。下面是修复前后的两次真实诊断输出对比。\n\n请判断网络是否真的恢复了，并用简洁中文向用户汇报。\n\n规则：\n- **必须有客观证据才能说"已修复"**：复测里 ping 出现 0% packet loss、或状态显示 connected / CONNECTED，才算恢复\n- 证据不足就说"未确认恢复"，并给出下一步建议\n- 不要编造数据，不要提到"方案编号""[原因]"这类内部标记\n- 3-6句话，重要的数字和结论加粗' },
                { role: 'user', content: '用户反馈：网络有问题，要求修复。\n\n我采用的修复动作：' + fixName + '\n执行输出：' + (fixOut || '(无输出，此类命令成功时通常无输出)') + '\n\n===== 修复前诊断 =====\n' + diagBefore + '\n\n===== 修复后复测 =====\n' + diagAfter }
            ], 600)
            var summary = ''
            if (!sumRes.error && !_isDegenerate(sumRes.content)) summary = sumRes.content
            // 清掉模型可能残留的内部标记，别让用户看到这些
            if (summary) {
                summary = summary.replace(/\[\/?原因\][\s\S]*?\[\/?原因\]/g, '').replace(/\[\/?选择\]\s*\d*\s*/g, '').trim()
            }
            if (!summary) {
                // ★ AI 总结失败（余额不足/输出乱码/空回复）也要给出可用结论，不能开天窗
                //    脚本基于前后对比的规则判断，不依赖模型
                var okPing = /0%\s*packet loss/i.test(diagAfter)
                var okConn = /mDataConnectionState=2|DataConnectionState:\s*2|CONNECTED/i.test(diagAfter)
                var wasBroken = /Network is unreachable|100%\s*packet loss|Internet detection:\s*FAIL/i.test(diagBefore)
                var verdict = (okPing || okConn)
                    ? '**✅ 网络已恢复**'
                    : (wasBroken ? '**⚠️ 仍未恢复**' : '**ℹ️ 未发现明显异常**')
                var detail = []
                if (okPing) detail.push('ping 测试 **0% 丢包**')
                if (okConn) detail.push('移动数据状态 **已连接**')
                if (!okPing && !okConn) detail.push('复测未检测到连通证据')
                summary = verdict + '\n\n' +
                    (reason ? '**判断原因**：' + reason + '\n' : '') +
                    '**已执行**：' + fixName + '\n' +
                    '**验证结果**：' + detail.join('，') + '\n'
                if (wasBroken && !okPing && !okConn) {
                    summary += '\n建议：\n1. 检查 SIM 卡是否欠费或接触不良\n2. 确认所在位置有运营商信号\n3. 若以上都正常，可能需要**手动重启设备**（重启会断开与插件的连接，我不便自行执行）'
                }
                if (sumRes.error) {
                    summary += '\n\n---\n（注：AI 文字总结未能生成：' + sumRes.error + '。以上结论由插件内置规则根据真实诊断数据得出。）\n\n**修复后复测数据**\n' + diagAfter
                }
            }
            return { success: true, content: summary, pick: pick, reason: reason }
        }

        // ★★★ 原生智能体循环：AI 通过 [CMD]协议 直接操控设备 ★★★
        // 不依赖 PicoClaw，插件自己实现：发消息给 LLM → AI 请求执行命令 → 执行 → 回传结果 → AI 继续
        var _runAgentLoop = async function(_rs, message) {
            try {
                // 读取配置
                var cfgFile = _picoclawPath + '/.picoclaw/config.json'
                var cfgRes = await _rs('cat ' + cfgFile + ' 2>/dev/null', 2000)
                var cfgText = cfgRes.content || ''
                if (!cfgText) return { success: false, error: '未找到 API 配置，请先配置 API Key' }

                var apiKey = ''
                var baseUrl = 'https://api.siliconflow.cn/v1/chat/completions'
                var model = 'Qwen/Qwen2.5-7B-Instruct'

                try {
                    var cfg = JSON.parse(cfgText)
                    if (cfg.model_list && cfg.model_list.length > 0) {
                        var wantName = (cfg.agents && cfg.agents.defaults && cfg.agents.defaults.model_name) || ''
                        var entry = null
                        for (var mi = 0; mi < cfg.model_list.length; mi++) {
                            if (!wantName || cfg.model_list[mi].model_name === wantName) { entry = cfg.model_list[mi]; break }
                        }
                        if (!entry) entry = cfg.model_list[0]
                        apiKey = (entry.api_keys && entry.api_keys[0]) || entry.api_key || ''
                        if (entry.api_base) baseUrl = entry.api_base.replace(/\/$/, '') + '/chat/completions'
                        if (entry.model) {
                            var si = entry.model.indexOf('/')
                            model = si >= 0 ? entry.model.substring(si + 1) : entry.model
                        }
                    }
                    if (!apiKey && cfg.llm && cfg.llm.providers && cfg.llm.providers.default) {
                        apiKey = cfg.llm.providers.default.api_key || ''
                        if (cfg.llm.providers.default.base_url) baseUrl = cfg.llm.providers.default.base_url.replace(/\/$/, '') + '/chat/completions'
                        if (cfg.llm.providers.default.default_model) model = cfg.llm.providers.default.default_model
                    }
                } catch(e) {
                    var keyMatch = cfgText.match(/"api_keys?"\s*:\s*\[?\s*"([^"]+)"/)
                    if (keyMatch) apiKey = keyMatch[1]
                    var urlMatch = cfgText.match(/"api_base"\s*:\s*"([^"]+)"/)
                    if (urlMatch) baseUrl = urlMatch[1].replace(/\/$/, '') + '/chat/completions'
                }

                if (!apiKey) return { success: false, error: '未找到 API Key' }

                // 采集设备上下文
                if (!_deviceCtx) await _collectDeviceCtx(_rs)
                var deviceInfo = _deviceCtx || '[设备环境: Android 随身WiFi设备] '

                // ★ 网络修复走「剧本模式」：脚本负责确定性流程，AI 只做选择+总结，稳定得多
                // 排除体检类（体检里也会提到"网络"，但那是全面排查，该走自由循环）
                var _isCheckup = /体检|全面.*检查|检查一遍|优化|存储|内存|CPU/i.test(message)
                var _netFixIntent = !_isCheckup && /没网|断网|上不了网|连不上|不能上网|无法上网|没信号|掉线|联网失败|无法访问|wi-?fi|流量.*(没|用不了|不能)|信号.*(差|弱|无|没有)|网速.*(慢|卡)|网络.*(坏|故障|不行|异常|有问题|修复|重连|卡|慢)/i.test(message)
                if (_netFixIntent) {
                    var _pbTyping = document.getElementById('chat_typing')
                    var _pbSet = function(kind, text) {
                        if (!_pbTyping) return
                        var b = _pbTyping.querySelector('.chat-typing')
                        if (!b) return
                        var icon = kind === 'fix' ? '🔧 修复动作: ' : (kind === 'think' ? '🤔 ' : '🔍 ')
                        b.textContent = icon + text
                    }
                    var pbRes = await _runNetworkPlaybook(_rs, baseUrl, apiKey, model, deviceInfo, _pbSet)
                    if (pbRes && pbRes.success) {
                        return { success: true, content: pbRes.content }
                    }
                    // 剧本模式失败（多为余额/网络问题），降级到下面的自由循环
                }

                // 构建系统提示词（自主修复专家版）
                var systemPrompt = deviceInfo + '你是这台Android随身WiFi设备的AI管家，与设备一体。你拥有**自主判断力和修复能力**——用户交给你的问题，你要自己诊断、自己修复、自己验证，而不是给用户教程让他自己做。\n\n' +
                    '## 工作流（处理任何问题必须走完整闭环）\n' +
                    '1. 诊断：执行命令收集真实信息（状态/日志/配置）\n' +
                    '2. 定位：基于输出判断根因\n' +
                    '3. 修复：直接执行修复动作（从副作用最小的开始试）\n' +
                    '4. 验证：再执行命令确认问题已解决\n' +
                    '5. 汇报：告诉用户你做了什么、结果如何；没修好就说清楚卡在哪、下一步建议\n\n' +
                    '## 修复原则\n' +
                    '- 优先级：无副作用方案（清缓存/重连）＞ 轻量方案（重启服务/开关数据连接）＞ 重方案（改配置/改DNS）\n' +
                    '- 每次修复动作后必须验证，失败就换下一个方案，不要死磕\n' +
                    '- 修复网络类问题前先看日志找根因，不盲目重启\n' +
                    '- 不确定时宁可汇报也不乱改\n' +
                    '- **验证纪律：宣称"已修好"必须有明确成功证据（如 ping 显示 0% loss、状态显示 connected）；只看到"无输出"或拿不到证据时，只能报告"未确认恢复"，严禁乐观宣布成功**\n' +
                    '- **命令必须逐字准确：修复命令请严格使用下面手册中给出的写法，不要凭记忆拼写**\n\n' +
                    '## 常用诊断命令\n' +
                    '- 网络状态: dumpsys connectivity | head -40, ip addr, ip route, ping -c 3 223.5.5.5\n' +
                    '- 信号强度: cat /proc/net/wireless, dumpsys telephony.registry | grep -i signal\n' +
                    '- SIM卡: dumpsys telephony.registry | grep -iE "sim|data", getprop gsm.sim.state\n' +
                    '- 网络日志: logcat -d -b radio | tail -30, dmesg | grep -iE "net|wifi|err" | tail -20\n' +
                    '- DNS测试: ping -c 2 223.5.5.5 与 nslookup www.baidu.com 对比\n' +
                    '- 系统: getprop ro.product.model, uname -a, free -m, df -h, top -n 1 | head -15\n' +
                    '- 温度: cat /sys/class/thermal/thermal_zone*/temp（原始值÷1000=°C）, dumpsys battery | grep temperature\n' +
                    '- 电池: dumpsys battery, cat /sys/class/power_supply/battery/*\n' +
                    '- 存储: df -h, du -sh /data /sdcard /system 2>/dev/null\n' +
                    '- 流量/进程: cat /proc/net/dev | grep rmnet, top -bn1 | head -20, pm list packages | wc -l\n\n' +
                    '## 常用修复手段（按副作用从小到大）\n' +
                    '- 清DNS缓存: ndc resolver flushdefaultif\n' +
                    '- 重启数据连接: svc data disable && sleep 2 && svc data enable\n' +
                    '- 重启WiFi: svc wifi disable && sleep 2 && svc wifi enable\n' +
                    '- 切飞行模式: cmd connectivity airplane-mode enable; sleep 3; cmd connectivity airplane-mode disable\n' +
                    '- 换DNS: settings put global private_dns_mode off; setprop net.dns1 223.5.5.5\n' +
                    '- 重启网络进程(系统自动拉起): killall wpa_supplicant 或 killall netd\n' +
                    '- 清理: rm -rf /data/local/tmp/* (只清临时目录), sync\n\n' +
                    '## 命令协议\n' +
                    '当你需要执行命令时，严格按以下格式输出（一次一条命令）：\n' +
                    '[CMD]你的命令[/CMD]\n\n' +
                    '系统会执行命令并把输出告诉你（格式：[OUTPUT]...[/OUTPUT]），然后你继续。\n' +
                    '当你有了最终答案时，直接回复（不要再包含[CMD]标记）。\n\n' +
                    '## 安全边界\n' +
                    '- 可以自主执行：所有查询、诊断、上述修复手段\n' +
                    '- 交给用户手动做：reboot（重启设备会断开连接）、恢复出厂、刷机——需要这些时说明原因，建议用户操作\n' +
                    '- 严禁编造数据：所有结论必须有命令输出支撑\n' +
                    '- 单次任务最多执行10条命令，合理分配（诊断2-4条、修复1-3条、验证1-2条）\n' +
                    '- 用简洁中文汇报，重要的数字和结论加粗\n\n' +
                    '## 标准示范（务必照着这个顺序走）\n' +
                    '用户：没网了\n' +
                    '你：[CMD]ping -c 3 223.5.5.5[/CMD]\n' +
                    '系统：[OUTPUT]ping: connect: Network is unreachable[/OUTPUT]\n' +
                    '你：[CMD]dumpsys telephony.registry | grep -i state[/CMD]\n' +
                    '系统：[OUTPUT]mDataConnectionState=0 (disconnected)[/OUTPUT]\n' +
                    '你：[CMD]svc data disable && sleep 2 && svc data enable[/CMD]\n' +
                    '系统：[OUTPUT][/OUTPUT]\n' +
                    '你：[CMD]ping -c 3 223.5.5.5[/CMD]\n' +
                    '系统：[OUTPUT]3 packets transmitted, 3 received, 0% packet loss[/OUTPUT]\n' +
                    '你：**已修复 ✅** 原因：移动数据连接意外断开。已执行重连，ping 测试 0% 丢包，网络恢复正常。\n\n' +
                    '（注意这个顺序：**先 ping 诊断 → 查状态定位根因 → 执行修复 → 再 ping 验证 → 基于证据汇报**）\n\n' +
                    '## 纯查询任务示范（温度/电池/存储/流量等，不需要修复）\n' +
                    '用户：查看温度\n' +
                    '你：[CMD]cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null; echo "---"; dumpsys battery | grep -E "temperature|level|status"[/CMD]\n' +
                    '系统：[OUTPUT]43000\\n---\\ntemperature: 320\\nlevel: 87\\nstatus: Charging[/OUTPUT]\n' +
                    '你：**当前温度** 🌡️\\n- CPU: **43.0°C**（thermal_zone0）\\n- 电池: **32.0°C**\\n电量: **87%** 充电中。温度正常，无需处理。\n\n' +
                    '用户：查一下存储空间\n' +
                    '你：[CMD]df -h 2>/dev/null[/CMD]\n' +
                    '系统：[OUTPUT]/data    4.0G  2.1G  1.8G  54%\\n/sdcard  28G   12G   15G  44%[/OUTPUT]\n' +
                    '你：**存储情况** 💾\\n- /data（系统分区）: 已用 2.1G / 4.0G (**54%**)\\n- /sdcard（内部存储）: 已用 12G / 28G (**44%**)\\n空间充足，暂不需要清理。'

                // 构建对话消息（包含最近历史以维持上下文）
                var messages = [{ role: 'system', content: systemPrompt }]
                var histCount = Math.min(_chatHistory.length, 6)
                for (var hi = _chatHistory.length - histCount; hi < _chatHistory.length; hi++) {
                    var h = _chatHistory[hi]
                    if (h && h.content && h.content.length < 2000) {
                        messages.push({ role: h.role === 'ai' ? 'assistant' : 'user', content: h.content.substring(0, 1000) })
                    }
                }
                messages.push({ role: 'user', content: message })

                // 智能体循环（修复任务需要更多轮次：诊断2-4 + 修复1-3 + 验证1-2）
                var MAX_ITER = 10
                var _agentCmdHistory = {}   // ★ 防死循环：记录命令执行次数
                var finalContent = ''
                var cmdExecuted = 0
                var _degenCount = 0         // ★ 连续退化次数

                for (var iter = 0; iter < MAX_ITER; iter++) {
                    // 调用 LLM（temperature 调低、max_tokens 收窄：长输出更容易让小模型跑飞进入复读）
                    var body = JSON.stringify({
                        model: model,
                        messages: messages,
                        max_tokens: 700,
                        temperature: 0.3
                    })
                    var escapedBody = body.replace(/'/g, "'\\''")
                    var curlCmd = "timeout 45 curl -s -k " +
                        "-X POST '" + baseUrl + "' " +
                        "-H 'Content-Type: application/json' " +
                        "-H 'Authorization: Bearer " + apiKey + "' " +
                        "-d '" + escapedBody + "' 2>&1"

                    var res = await _rs(curlCmd, 55000)
                    var output = (res && res.content) || ''
                    if (!output || output.trim().length === 0) {
                        return { success: false, error: 'API 返回为空（网络问题）' }
                    }

                    var aiContent = ''
                    try {
                        var data = JSON.parse(output)
                        if (data.error) {
                            var errMsg = data.error.message || JSON.stringify(data.error)
                            if (errMsg.toLowerCase().indexOf('insufficient') >= 0 || errMsg.toLowerCase().indexOf('balance') >= 0) {
                                return { success: false, error: 'API 余额不足' }
                            }
                            return { success: false, error: 'API错误: ' + errMsg.substring(0, 80) }
                        }
                        if (data.choices && data.choices[0] && data.choices[0].message) {
                            aiContent = data.choices[0].message.content || ''
                        }
                    } catch(e) {
                        if (output.indexOf('curl:') >= 0) {
                            return { success: false, error: '网络请求失败: ' + output.substring(0, 80) }
                        }
                        return { success: false, error: '响应解析失败: ' + output.substring(0, 80) }
                    }

                    if (!aiContent) {
                        // ★ 空回复重试（最多2次）：小模型对非标准任务常返回空 content，
                        //   尤其是温度/存储/电池等非网络类查询——换一种 prompt 角度再问一次
                        if (iter < 2) {
                            messages.push({ role: 'assistant', content: '(无回复)' })
                            messages.push({ role: 'user', content: '你上一条回复是空的。请直接回答用户的问题，用简洁中文回复即可（不需要执行命令）。如果需要查数据，用 [CMD]命令[/CMD] 格式给出一条具体命令。' })
                            continue
                        }
                        // 重试仍空 → 用最简 prompt 再试一次（纯文本问答，不要求工具调用）
                        var _simpleMsgs = [
                            { role: 'system', content: deviceInfo + '你是Android设备AI助手。请用简洁中文回答以下问题。不要使用任何标记格式，直接说答案。' },
                            { role: 'user', content: message }
                        ]
                        var _simpleBody = JSON.stringify({ model: model, messages: _simpleMsgs, max_tokens: 300, temperature: 0.4 })
                        var _simpleCmd = "timeout 30 curl -s -k -X POST '" + baseUrl + "' -H 'Content-Type: application/json' -H 'Authorization: Bearer " + apiKey + "' -d '" + _simpleBody.replace(/'/g, "'\\''") + "' 2>&1"
                        var _simpleRes = await _rs(_simpleCmd, 40000)
                        try {
                            var _sd = JSON.parse((_simpleRes && _simpleRes.content) || '{}')
                            aiContent = (_sd.choices && _sd.choices[0] && _sd.choices[0].message && _sd.choices[0].message.content) || ''
                        } catch(e3) { aiContent = '' }
                        if (!aiContent) {
                            return { success: false, error: 'AI 回复为空（模型可能不支持此任务或余额不足）' }
                        }
                        finalContent = aiContent.trim()
                        break
                    }

                    // ★ 退化检测：模型陷入复读机时，打断它重来，而不是拿垃圾去执行
                    if (_isDegenerate(aiContent)) {
                        _degenCount++
                        if (_degenCount >= 3) {
                            // 连续退化3次：模型状态已不可靠，降级为纯文本回答（不带工具）
                            messages.push({ role: 'assistant', content: aiContent })
                            messages.push({ role: 'user', content: '停止输出命令。请只用中文文字（不要任何[CMD]标记、不要引号堆砌）总结你现在掌握的信息和给用户的建议。' })
                            var _rescue = await _rs('timeout 45 curl -s -k -X POST \'' + baseUrl + '\' -H \'Content-Type: application/json\' -H \'Authorization: Bearer ' + apiKey + '\' -d \'' + JSON.stringify({ model: model, messages: messages, max_tokens: 500, temperature: 0.3 }).replace(/'/g, "'\\''") + '\' 2>&1', 55000)
                            try {
                                var _rd = JSON.parse((_rescue && _rescue.content) || '{}')
                                finalContent = (_rd.choices && _rd.choices[0] && _rd.choices[0].message && _rd.choices[0].message.content) || ''
                            } catch(e2) { finalContent = '' }
                            if (_isDegenerate(finalContent)) finalContent = ''
                            if (!finalContent) finalContent = '抱歉，这次模型输出出现了异常重复，我已中断执行。\n\n7B 级别的小模型在长对话里容易陷入复读，建议：\n1. 换用参数更大的模型（如 Qwen2.5-32B-Instruct），稳定性会好很多\n2. 或者直接点「🛠️ 修复网络」按钮走剧本模式，不依赖模型推理'
                            break
                        }
                        messages.push({ role: 'assistant', content: aiContent })
                        messages.push({ role: 'user', content: '[OUTPUT]你上一条回复出现了重复乱码。请重新输出，要求：只输出一条简短命令，格式为 [CMD]命令[/CMD]，不要多余文字、不要引号堆砌。[/OUTPUT]' })
                        continue
                    }
                    _degenCount = 0   // 输出正常，重置计数

                    // 检查是否包含 [CMD] 标记
                    var cmdMatch = aiContent.match(/\[CMD\]([\s\S]*?)\[\/CMD\]/)
                    if (cmdMatch && cmdExecuted < MAX_ITER) {
                        // ★ 先做命令规范化，把模型拼错的命令纠正成设备上真实存在的写法
                        var _norm = _normalizeAgentCmd(cmdMatch[1].trim())
                        // ★ 再补引号：模型经常输出半截命令（如 grep -i "data 少了右引号）
                        var _qf = _fixUnbalancedQuotes(_norm.cmd)
                        _norm.cmd = _qf.cmd
                        if (_qf.note) _norm.note = _norm.note ? (_norm.note + '\n' + _qf.note) : _qf.note
                        var cmdToRun = _norm.cmd
                        if (!cmdToRun) {
                            messages.push({ role: 'assistant', content: aiContent })
                            messages.push({ role: 'user', content: '[OUTPUT]命令为空，请给出具体命令，或直接给出结论。[/OUTPUT]' })
                            continue
                        }
                        // 安全检查：拒绝毁灭性命令 + reboot（重启会断开连接，AI回复会丢失，应交给用户手动执行）
                        var dangerous = /^(rm\s+-rf\s+\/|mkfs|dd\s+if=.*of=\/dev|flash_image|wipe\s|reboot|stop\s+zygote|killall\s+zygote|killall\s+system_server)/i
                        if (dangerous.test(cmdToRun)) {
                            messages.push({ role: 'assistant', content: aiContent })
                            messages.push({ role: 'user', content: '[OUTPUT]命令被安全策略拒绝（毁灭性命令或会导致连接断开）。请在最终汇报中向用户说明原因，建议用户手动操作。[/OUTPUT]' })
                            continue
                        }
                        // ★ 防死循环：同一命令失败3次后，提示AI换命令（修复场景需要重试验证，放宽到3次）
                        var cmdKey = cmdToRun.replace(/\s+/g, ' ')
                        _agentCmdHistory[cmdKey] = (_agentCmdHistory[cmdKey] || 0) + 1
                        if (_agentCmdHistory[cmdKey] > 3) {
                            messages.push({ role: 'assistant', content: aiContent })
                            messages.push({ role: 'user', content: '[OUTPUT]此命令已失败多次，请换一条不同的命令，或基于已有信息给出结论。[/OUTPUT]' })
                            continue
                        }
                        // ★ 达到上限前2轮：提醒AI该收尾了
                        if (cmdExecuted >= MAX_ITER - 2) {
                            aiContent += '\n(提示：命令额度快用完了，如果信息足够请直接给出结论)'
                        }
                        // 执行命令（修复命令常带sleep，超时放宽到25秒）
                        cmdExecuted++
                        var execRes = await _rs('timeout 25 ' + cmdToRun + ' 2>&1 | head -60', 32000)
                        var execOut = (execRes && execRes.content) || ''
                        if (!execOut || execOut.trim().length === 0) {
                            // ★ 空输出必须区分语义：修复类命令无输出＝正常；查询类命令无输出＝查不到
                            if (_isWriteCmd(cmdToRun)) {
                                execOut = '(修复/设置类命令已执行完毕。这类命令成功时通常没有输出，所以"无输出"不等于失败，也不等于成功——请用状态查询命令（如 ping -c 3 223.5.5.5、dumpsys connectivity）验证效果后，再基于证据下结论。)'
                            } else {
                                execOut = '(查询命令无任何输出：可能是查询无结果、命令拼写错误、或该命令在此设备不存在。请检查拼写或换一条命令)'
                            }
                        }
                        // ★ 如果命令被自动纠正过，明确告知AI，避免它以为自己发的是原命令
                        if (_norm.note) execOut = _norm.note + '\n' + execOut
                        if (execOut.length > 1500) execOut = execOut.substring(0, 1500) + '\n...(截断)'

                        // 把 AI 的响应和命令输出都加入对话
                        messages.push({ role: 'assistant', content: aiContent })
                        messages.push({ role: 'user', content: '[OUTPUT]' + execOut + '[/OUTPUT]' })

                        // 更新UI提示正在执行（区分诊断/修复类命令）
                        var typingEl = document.getElementById('chat_typing')
                        if (typingEl) {
                            var bubble = typingEl.querySelector('.chat-typing')
                            if (bubble) {
                                var isFixCmd = _isWriteCmd(cmdToRun)
                                bubble.textContent = (isFixCmd ? '🔧 修复动作: ' : '🔍 执行命令: ') + cmdToRun.substring(0, 44) + ' (' + cmdExecuted + '/' + MAX_ITER + ')'
                            }
                        }
                        continue
                    }

                    // 没有 [CMD] 了 → 最终回复（清除残留标记）
                    finalContent = aiContent.replace(/\[CMD\][\s\S]*?\[\/CMD\]/g, '').trim()
                    if (!finalContent) finalContent = aiContent.trim()
                    break
                }

                if (!finalContent) {
                    finalContent = '(AI 执行了 ' + cmdExecuted + ' 条命令但未给出最终结论，请重试)'
                }

                return { success: true, content: finalContent, cmdsExecuted: cmdExecuted }

            } catch(e) {
                return { success: false, error: '智能体循环异常: ' + String(e).substring(0, 80) }
            }
        }

        // 调用 PicoClaw 发送消息（★ 现在优先使用原生智能体循环，不再依赖 PicoClaw 二进制）
        var sendToPicoClaw = async function(message) {
            var _rs = getShell()
            if (!_rs) return { success: false, error: 'Shell 不可用' }
            if (!_picoclawInstalled) return { success: false, error: '未安装，请先配置 API Key' }

            try {
                // ★ 优先使用原生智能体循环：AI 通过 [CMD] 协议直接操控设备
                _installLog('使用原生智能体模式...')
                var agentResult = await _runAgentLoop(_rs, message)
                if (agentResult.success) {
                    _installLog('✅ 智能体回复成功' + (agentResult.cmdsExecuted ? '（执行了 ' + agentResult.cmdsExecuted + ' 条命令）' : ''))
                    return agentResult
                }
                _installLog('智能体模式失败: ' + (agentResult.error || '未知'), '降级到直接 API 调用...')

                // 降级：直接调用 API（纯聊天，无工具）
                var directResult = await _callApiDirect(_rs, message)
                if (directResult.success) {
                    _installLog('直接调用 API 成功（降级模式）')
                    return directResult
                }
                return { success: false, error: agentResult.error || directResult.error || '调用失败' }

                // 降级：直接调用 API（纯聊天，无工具）
                var directResult = await _callApiDirect(_rs, message)
                if (directResult.success) {
                    _installLog('直接调用 API 成功（降级模式）')
                    return directResult
                }
                return { success: false, error: agentResult.error || directResult.error || '调用失败' }
            } catch(e) {
                // 异常了也试试直接调用 API
                var _rs2 = getShell()
                if (_rs2) {
                    var directRes2 = await _callApiDirect(_rs2, message)
                    if (directRes2.success) return directRes2
                }
                return { success: false, error: String(e) }
            }
        }

        // ★ 暴露给桌面宠物模块调用
        try { window._petSendToAI = sendToPicoClaw; window._picoclawReady = function() { return _picoclawConfigured; }; } catch(e) {}

        // 发送聊天消息
        var sendChatMessage = async function() {
            if (_chatLoading) return
            var input = document.getElementById('chat_input')
            var text = input ? input.value.trim() : ''
            if (!text) return

            if (!_picoclawInstalled) {
                showToast('请先安装 PicoClaw（小龙虾插件）', 'red', 3000)
                return
            }

            _chatLoading = true
            var sendBtn = document.getElementById('chat_send_btn')
            if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '发送中...' }

            // 添加用户消息
            addChatMessage('user', text)
            input.value = ''
            input.style.height = 'auto'

            // 显示思考中
            showTypingIndicator()

            try {
                var result = await sendToPicoClaw(text)
                removeTypingIndicator()

                if (result.success) {
                    addChatMessage('ai', result.content)
                } else {
                    addChatMessage('ai', '❌ 出错了：' + (result.error || '未知错误'))
                }
            } catch(e) {
                removeTypingIndicator()
                addChatMessage('ai', '❌ 异常：' + String(e))
            } finally {
                _chatLoading = false
                if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '发送' }
                input.focus()
            }
        }

        // 聊天输入框事件
        var chatInput = document.getElementById('chat_input')
        if (chatInput) {
            chatInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendChatMessage()
                }
            })
            // 自动调整高度
            chatInput.addEventListener('input', function() {
                this.style.height = 'auto'
                this.style.height = Math.min(this.scrollHeight, 120) + 'px'
            })
        }

        // 发送按钮
        var chatSendBtn = document.getElementById('chat_send_btn')
        if (chatSendBtn) chatSendBtn.onclick = sendChatMessage

        // 快捷问题按钮
        var quickBtns = document.querySelectorAll('.chat-quick-btn')
        quickBtns.forEach(function(btn) {
            btn.onclick = function() {
                var q = btn.getAttribute('data-q')
                if (q) {
                    var input = document.getElementById('chat_input')
                    if (input) { input.value = q; sendChatMessage() }
                }
            }
        })

        // 本地工具箱按钮
        var localBtns = document.querySelectorAll('.chat-local-btn')
        localBtns.forEach(function(btn) {
            btn.onclick = async function() {
                var cmd = btn.getAttribute('data-cmd')
                if (!cmd) return
                
                // 跳转到配置页的按钮
                if (btn.id === 'local_goto_config_btn') {
                    showChatView('config')
                    return
                }
                
                var _rs = getShell()
                if (!_rs) {
                    showToast('Shell 不可用', 'red', 2000)
                    return
                }
                
                var outputEl = document.getElementById('chat_cmd_output')
                if (outputEl) {
                    outputEl.style.display = 'block'
                    outputEl.textContent = '⏳ 执行中...'
                }
                
                btn.disabled = true
                var origText = btn.textContent
                btn.textContent = '执行中...'
                
                try {
                    var result = await _rs(cmd, 10000)
                    var output = (result && result.content) || '无输出'
                    if (outputEl) {
                        outputEl.textContent = '📌 执行结果:\n\n' + output
                        outputEl.scrollTop = 0
                    }
                } catch(e) {
                    if (outputEl) {
                        outputEl.textContent = '❌ 执行失败: ' + String(e)
                    }
                } finally {
                    btn.disabled = false
                    btn.textContent = origText
                }
            }
        })

        // 打开 PicoClaw 面板
        var openPanelBtn = document.getElementById('picoclaw_open_panel')
        if (openPanelBtn) {
            openPanelBtn.onclick = function() {
                // 直接打开配置面板，不刷新/不重新检测状态
                showChatView('config');
                var cfgInput = document.getElementById('pc_config_api_input');
                if (cfgInput) cfgInput.focus();
                showToast('配置面板已打开，请在此配置 API Key', 'green', 2000);
            }
        }

        // 打开 PicoClaw 面板的通用函数（兼容旧调用）
        var openPicoClawPanel = async function() {
            await checkPicoClawStatus();
            if (_picoclawConfigured) {
                showChatView('chat');
                var chatInput = document.getElementById('chat_input');
                if (chatInput) chatInput.focus();
            } else if (_picoclawInstalled) {
                showChatView('config');
            } else {
                showChatView('install');
            }
        }

        // ===== PicoClaw 一键安装 =====
        var _installSleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }
        var _installLog = function(msg) {
            var logEl = document.getElementById('pc_install_log')
            if (logEl) logEl.textContent = msg
            aiLog('[PicoClaw安装] ' + msg, 'info')
        }
        var _setInstallProgress = function(pct, statusText) {
            var fill = document.getElementById('pc_progress_fill')
            var status = document.getElementById('pc_install_status')
            if (fill) fill.style.width = pct + '%'
            if (status && statusText) status.textContent = statusText
        }

        // 从 APK/APP 提取 PicoClaw 二进制（全面搜索）
        var _extractFromApk = async function(_rs) {
            _installLog('正在搜索系统中的 PicoClaw...')

            // 第0步（最靠谱）：从正在运行的进程找 exe 路径
            try {
                var pgrepRes0 = await _rs('ps -ef 2>/dev/null | grep -i picoclaw | grep -v grep | head -5', 2000)
                _installLog('进程列表: ' + (pgrepRes0.content || '').replace(/\n/g, ' | ').substring(0, 120))

                var pgrepPid = await _rs('pgrep -f "picoclaw" 2>/dev/null | head -5', 2000)
                var pids0 = (pgrepPid.content || '').trim().split('\n')
                for (var p0 = 0; p0 < pids0.length; p0++) {
                    var pid0 = pids0[p0].trim()
                    if (!pid0) continue
                    var exe0 = await _rs('ls -l /proc/' + pid0 + '/exe 2>/dev/null; cat /proc/' + pid0 + '/cmdline 2>/dev/null | tr "\\0" " " | head -c 200', 1000)
                    var exeOut0 = exe0.content || ''
                    _installLog('进程 ' + pid0 + ': ' + exeOut0.replace(/\n/g, ' ').substring(0, 100))
                    if (exeOut0.indexOf('->') >= 0) {
                        var idx0 = exeOut0.indexOf('->') + 2
                        var endIdx0 = exeOut0.indexOf('\n')
                        var path0 = exeOut0.substring(idx0, endIdx0 > idx0 ? endIdx0 : idx0 + 200).trim()
                        if (path0 && path0.length > 5) {
                            _installLog('从进程找到二进制: ' + path0)
                            return path0
                        }
                    }
                }
            } catch(e) {}

            // 第一步：用 pm 列出所有包，找含 picoclaw/claw/小龙虾/xingyue 的包
            var pkgPaths = []
            try {
                var pmRes = await _rs('pm list packages -f 2>/dev/null | grep -iE "picoclaw|claw|xiaolong|lobster" | head -10', 3000)
                var pmLines = (pmRes.content || '').trim().split('\n')
                for (var pi = 0; pi < pmLines.length; pi++) {
                    var line = pmLines[pi].trim()
                    if (!line) continue
                    // pm list packages -f 格式: package:/data/app/xxx/base.apk=com.xxx
                    var eqIdx = line.lastIndexOf('=')
                    var pkgIdx = line.indexOf('package:')
                    if (eqIdx > 0 && pkgIdx >= 0) {
                        var apkPath = line.substring(8, eqIdx)
                        var pkgName = line.substring(eqIdx + 1)
                        pkgPaths.push({ apk: apkPath, pkg: pkgName })
                        _installLog('找到包: ' + pkgName)
                    }
                }
            } catch(e) {}

            // 第二步：从找到的包中提取 lib 目录
            for (var pki = 0; pki < pkgPaths.length; pki++) {
                var pkgInfo = pkgPaths[pki]
                try {
                    // 找 native library 目录
                    var libDir = '/data/app/' + pkgInfo.pkg + '-*/lib/*/'
                    var libFindCmd = 'for d in ' + libDir + '; do [ -d "$d" ] && echo "LIBDIR:$d" && ls "$d" | head -10 && break; done 2>/dev/null'
                    var libRes = await _rs(libFindCmd, 2000)
                    var libOut = libRes.content || ''
                    if (libOut.indexOf('LIBDIR:') >= 0) {
                        _installLog('找到 lib 目录: ' + libOut.substring(libOut.indexOf('LIBDIR:') + 7).trim().split('\n')[0])
                    }

                    // 找可能的 picoclaw 二进制（so 文件）
                    var soFindCmd = 'find /data/app/' + pkgInfo.pkg + '* -name "*.so" -type f 2>/dev/null | xargs -I{} ls -la {} 2>/dev/null | sort -k5 -n -r | head -5'
                    var soRes = await _rs(soFindCmd, 3000)
                    var soOut = soRes.content || ''
                    _installLog('搜索 so 文件: ' + soOut.substring(0, 100))

                    // 找最大的 so 文件（可能是 picoclaw）
                    var bigSoCmd = 'find /data/app/' + pkgInfo.pkg + '* -name "*.so" -type f -exec ls -l {} \\; 2>/dev/null | awk "{print \\$5, \\$9}" | sort -n -r | head -3'
                    var bigSoRes = await _rs(bigSoCmd, 3000)
                    var bigSoOut = bigSoRes.content || ''
                    var bigSoLines = bigSoOut.trim().split('\n')
                    for (var bi = 0; bi < bigSoLines.length; bi++) {
                        var parts = bigSoLines[bi].trim().split(' ')
                        if (parts.length >= 2) {
                            var size = parseInt(parts[0]) || 0
                            var path = parts[1]
                            if (size > 5000000) {  // 大于 5MB 的 so 很可能是 picoclaw
                                _installLog('找到大文件 (' + (size/1024/1024).toFixed(1) + 'MB): ' + path)
                                return path
                            }
                        }
                    }
                } catch(e) {}
            }

            // 第三步：全局搜索 picoclaw 相关文件
            try {
                var globalFind = 'find /data -maxdepth 6 -type f \\( -name "picoclaw" -o -name "*picoclaw*" -o -name "*pico_claw*" \\) 2>/dev/null | head -10'
                var gRes = await _rs(globalFind, 5000)
                var gOut = gRes.content || ''
                var gLines = gOut.trim().split('\n')
                for (var gi = 0; gi < gLines.length; gi++) {
                    var gPath = gLines[gi].trim()
                    if (gPath) {
                        _installLog('找到文件: ' + gPath)
                        // 检查是否是可执行文件
                        var chkRes = await _rs('file ' + gPath + ' 2>/dev/null || echo UNKNOWN', 1000)
                        if ((chkRes.content || '').indexOf('ELF') >= 0) {
                            return gPath
                        }
                    }
                }
            } catch(e) {}

            // 第四步：搜索 pgrep 找到的进程的可执行文件路径
            try {
                var pgrepRes = await _rs('pgrep -f picoclaw 2>/dev/null | head -3', 1000)
                var pids = (pgrepRes.content || '').trim().split('\n')
                for (var pidi = 0; pidi < pids.length; pidi++) {
                    var pid = pids[pidi].trim()
                    if (!pid) continue
                    var exeRes = await _rs('ls -l /proc/' + pid + '/exe 2>/dev/null || echo NOPATH', 1000)
                    var exeOut = exeRes.content || ''
                    if (exeOut.indexOf('->') >= 0) {
                        var exePath = exeOut.substring(exeOut.indexOf('->') + 2).trim()
                        _installLog('从进程找到: ' + exePath)
                        return exePath
                    }
                }
            } catch(e) {}

            // 第五步：常用路径兜底（扩大搜索范围）
            var fallbackPaths = [
                '/data/data/com.xingyue.toolbate/files/picoclaw',
                '/data/data/com.xingyue.toolbate/app_picoclaw/picoclaw',
                '/data/data/com.xingyue.toolbate/*/picoclaw',
                '/data/user/0/com.xingyue.toolbate/files/picoclaw',
                '/data/picoclaw/picoclaw',
                '/data/local/picoclaw/picoclaw',
                '/data/local/tmp/picoclaw/picoclaw',
                '/sdcard/picoclaw/picoclaw',
                '/sdcard/Download/picoclaw',
                '/storage/emulated/0/picoclaw/picoclaw'
            ]
            for (var fi = 0; fi < fallbackPaths.length; fi++) {
                try {
                    var fcmd = 'for f in ' + fallbackPaths[fi] + '; do [ -f "$f" ] && echo "FOUND:$f" && break; done 2>/dev/null'
                    var fres = await _rs(fcmd, 1000)
                    if ((fres.content || '').indexOf('FOUND:') >= 0) {
                        var fpath = fres.content.substring(fres.content.indexOf('FOUND:') + 6).trim().split('\n')[0].trim()
                        if (fpath) {
                            _installLog('兜底找到: ' + fpath)
                            return fpath
                        }
                    }
                } catch(e) {}
            }

            _installLog('未在系统中找到 PicoClaw 二进制')
            return null
        }

        // 从网络下载 PicoClaw（带进度显示，优先国内镜像）
        var _downloadPicoClaw = async function(_rs) {
            var tmpFile = '/data/local/tmp/picoclaw.tar.gz'

            _installLog('正在下载 PicoClaw...')
            _setInstallProgress(15, '下载中 0%')

            // 先测试网络连通性
            var netOk = false
            try {
                var pingRes = await _rs('getprop net.dns1 2>/dev/null; echo ---; ping -c 1 -W 2 223.5.5.5 2>&1 | head -2', 5000)
                _installLog('网络检测: ' + (pingRes.content || '').replace(/\n/g, ' ').substring(0, 80))
                // 尝试用 IP 直连测试
                var ipTest = await _rs('curl -s --connect-timeout 5 --max-time 8 -o /dev/null -w "%{http_code}" "http://223.5.5.5/" 2>/dev/null || echo "000"', 10000)
                if ((ipTest.content || '').trim() !== '000') {
                    netOk = true
                }
            } catch(e) {}

            // 如果网络不通，尝试临时设置 DNS
            if (!netOk) {
                _installLog('网络可能有问题，尝试设置 DNS...')
                await _rs('setprop net.dns1 223.5.5.5 2>/dev/null; setprop net.dns2 8.8.8.8 2>/dev/null', 1000)
                await _installSleep(1000)
            }

            // 下载源列表（按优先级，国内镜像优先）
            var downloadUrls = [
                // 国内镜像优先
                { name: '国内镜像1', url: 'https://mirror.ghproxy.com/https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw_Linux_arm64.tar.gz' },
                { name: '国内镜像2', url: 'https://gh-proxy.com/https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw_Linux_arm64.tar.gz' },
                { name: '国内镜像3', url: 'https://gh.api.99988866.xyz/https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw_Linux_arm64.tar.gz' },
                // GitHub 直连（备用）
                { name: 'GitHub直连', url: 'https://github.com/sipeed/picoclaw/releases/latest/download/picoclaw_Linux_arm64.tar.gz' }
            ]

            // 检测 curl 是否支持 -# 进度条
            var curlAvailable = false
            var curlCheck = await _rs('which curl 2>/dev/null && echo HAS_CURL || echo NO_CURL', 1000)
            curlAvailable = (curlCheck.content || '').indexOf('HAS_CURL') >= 0

            var downloaded = false
            for (var ui = 0; ui < downloadUrls.length; ui++) {
                var dl = downloadUrls[ui]
                var url = dl.url
                var sourceName = dl.name
                _installLog('尝试' + sourceName + '下载...')

                try {
                    if (curlAvailable) {
                        // curl 带进度（-# 输出进度条到 stderr）
                        // 超时 90 秒，每 3 秒检查一次文件大小变化
                        var cleanCmd = 'rm -f ' + tmpFile + ' 2>/dev/null'
                        await _rs(cleanCmd, 1000)

                        // 后台启动下载
                        var bgCmd = 'curl -L -k --connect-timeout 10 --max-time 90 -o ' + tmpFile + ' "' + url + '" >/dev/null 2>&1 & echo $!'
                        var pidRes = await _rs(bgCmd, 2000)
                        var pid = (pidRes.content || '').trim().split('\n')[0].trim()

                        if (!pid || isNaN(parseInt(pid))) {
                            _installLog('启动下载失败')
                            continue
                        }

                        // 轮询进度
                        var lastSize = 0
                        var sameCount = 0
                        var maxWait = 90  // 最多等 90 次（每次1秒）
                        for (var wi = 0; wi < maxWait; wi++) {
                            await _installSleep(1000)

                            // 检查文件大小
                            var sizeRes = await _rs('ls -l ' + tmpFile + ' 2>/dev/null | awk "{print \\$5}"', 1000)
                            var sizeStr = (sizeRes.content || '').trim()
                            var sizeBytes = parseInt(sizeStr) || 0

                            // 检查进程是否还在
                            var procRes = await _rs('kill -0 ' + pid + ' 2>/dev/null && echo RUNNING || echo DONE', 1000)
                            var isRunning = (procRes.content || '').indexOf('RUNNING') >= 0

                            // 估算进度（PicoClaw arm64 大约 20-30MB，取25M做估算）
                            var estSize = 25 * 1024 * 1024  // 25MB
                            var pct = Math.min(95, Math.floor((sizeBytes / estSize) * 100))
                            var sizeMB = (sizeBytes / 1024 / 1024).toFixed(1)
                            _setInstallProgress(15 + Math.floor(pct * 0.35), '下载中 ' + pct + '% (' + sizeMB + 'MB)')

                            // 检查是否卡住（连续5秒大小没变化）
                            if (sizeBytes === lastSize && isRunning) {
                                sameCount++
                                if (sameCount > 15) {
                                    _installLog('下载卡住了，换下一个源...')
                                    await _rs('kill ' + pid + ' 2>/dev/null', 500)
                                    break
                                }
                            } else {
                                sameCount = 0
                            }
                            lastSize = sizeBytes

                            if (!isRunning) break
                        }

                        // 检查下载结果
                        var finalRes = await _rs('[ -f ' + tmpFile + ' ] && ls -l ' + tmpFile + ' | awk "{print \\$5}"', 1000)
                        var finalSize = parseInt((finalRes.content || '').trim()) || 0
                        if (finalSize > 1000000) {  // 大于 1MB 认为下载成功
                            _installLog(sourceName + '下载完成 (' + (finalSize / 1024 / 1024).toFixed(1) + 'MB)')
                            downloaded = true
                            break
                        } else {
                            _installLog(sourceName + '下载失败，文件太小')
                        }
                    } else {
                        // 没有 curl 用 wget（无进度）
                        _installLog('使用 wget 下载...')
                        var wgetCmd = 'wget -q --timeout=15 --tries=2 -O ' + tmpFile + ' "' + url + '" 2>&1 && echo DOWNLOAD_OK'
                        var wgetRes = await _rs(wgetCmd, 60000)
                        if ((wgetRes.content || '').indexOf('DOWNLOAD_OK') >= 0) {
                            var szRes = await _rs('ls -l ' + tmpFile + ' | awk "{print \\$5}"', 1000)
                            var sz = parseInt((szRes.content || '').trim()) || 0
                            if (sz > 1000000) {
                                _installLog('下载完成 (' + (sz / 1024 / 1024).toFixed(1) + 'MB)')
                                downloaded = true
                                break
                            }
                        }
                    }
                } catch(e) {
                    _installLog(sourceName + '出错: ' + String(e).substring(0, 30))
                }
            }

            if (!downloaded) {
                _installLog('所有下载源均失败')
                return null
            }

            _setInstallProgress(50, '下载完成，解压中...')
            _installLog('正在解压...')

            // 解压
            var extractCmd = 'mkdir -p /data/local/tmp/pico_extract && cd /data/local/tmp/pico_extract && tar xzf ' + tmpFile + ' 2>&1 && ls -la picoclaw 2>&1 && echo EXTRACT_OK'
            var extRes = await _rs(extractCmd, 15000)
            if ((extRes.content || '').indexOf('EXTRACT_OK') < 0) {
                _installLog('解压失败: ' + (extRes.content || '').substring(0, 50))
                return null
            }

            return '/data/local/tmp/pico_extract/picoclaw'
        }

        // 直接通过 curl 验证 API Key 是否有效（不依赖 PicoClaw 进程）
        // 返回 { valid: boolean, error: string, detail: string }
        var _validateApiKey = async function(_rs, apiKey, provider, customEp) {
            if (!apiKey || !_rs) return { valid: false, error: '参数错误', detail: 'API Key 或 Shell 不可用' }

            var endpoints = {
                deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
                openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
                siliconflow: { url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct' },
                dashscope: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
                custom: { url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' }
            }
            // 自定义服务商：用用户提供的地址和模型验证（OpenAI 兼容协议）
            if (provider === 'custom' && customEp && customEp.url) {
                endpoints.custom = { url: customEp.url.replace(/\/$/, '') + '/chat/completions', model: customEp.model }
            }

            var ep = endpoints[provider] || endpoints.deepseek
            var body = '{"model":"' + ep.model + '","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'

            // 方法1: 先用 --resolve 强制解析 IP 避免 DNS 问题
            var testIps = {
                'api.deepseek.com': '104.18.28.130',
                'api.siliconflow.cn': '104.18.30.122',
                'api.openai.com': '104.18.4.10'
            }

            var tryValidate = async function(extraArgs) {
                // 用 timeout 命令包裹 curl，兼容不同版本的 curl
                var cmd = 'timeout 18 curl -s ' +
                    (extraArgs || '') + ' ' +
                    '-X POST "' + ep.url + '" ' +
                    '-H "Content-Type: application/json" ' +
                    '-H "Authorization: Bearer ' + apiKey + '" ' +
                    "-d '" + body + "' 2>&1"
                try {
                    var res = await _rs(cmd, 25000)
                    return res.content || ''
                } catch(e) {
                    return 'ERROR: ' + String(e)
                }
            }

            var checkResult = function(out) {
                var lowerOut = out.toLowerCase()
                
                // 余额不足（Key 是对的，只是没钱了）—— 最先检查，避免被 error 匹配误判
                if (lowerOut.indexOf('insufficient') >= 0 || 
                    lowerOut.indexOf('insufficient balance') >= 0 ||
                    lowerOut.indexOf('余额不足') >= 0 ||
                    lowerOut.indexOf('quota_exceeded') >= 0 ||
                    (lowerOut.indexOf('balance') >= 0 && lowerOut.indexOf('error') >= 0)) {
                    return { valid: true, error: null, detail: 'Key 有效（余额不足）' }
                }
                
                // 成功
                if (out.indexOf('"choices"') >= 0 && out.indexOf('"message"') >= 0) {
                    return { valid: true, error: null, detail: '验证成功' }
                }
                if (out.indexOf('"id"') >= 0 && out.indexOf('"object"') >= 0) {
                    return { valid: true, error: null, detail: '验证成功' }
                }
                // Key 无效
                if (lowerOut.indexOf('invalid_api_key') >= 0 || 
                    lowerOut.indexOf('unauthorized') >= 0 || 
                    lowerOut.indexOf('"401"') >= 0 || 
                    lowerOut.indexOf('authentication') >= 0 ||
                    lowerOut.indexOf('auth_error') >= 0) {
                    return { valid: false, error: 'API Key 无效', detail: out.substring(0, 120) }
                }
                // 模型不存在等其他错误（Key 是对的）
                if (lowerOut.indexOf('model_not_found') >= 0 || 
                    (lowerOut.indexOf('"model"') >= 0 && lowerOut.indexOf('not found') >= 0)) {
                    return { valid: true, error: null, detail: 'Key 有效（模型名可能不同）' }
                }
                // 网络错误
                if (out.indexOf('Could not resolve') >= 0 || out.indexOf('Connection timed out') >= 0 ||
                    out.indexOf('Failed to connect') >= 0 || out.indexOf('curl: (') >= 0) {
                    return { valid: false, error: '网络连接失败', detail: out.substring(0, 120) }
                }
                // invalid_request_error 但包含余额相关 → Key 有效
                if (lowerOut.indexOf('invalid_request_error') >= 0 && 
                    (lowerOut.indexOf('insufficient') >= 0 || lowerOut.indexOf('balance') >= 0 || lowerOut.indexOf('quota') >= 0)) {
                    return { valid: true, error: null, detail: 'Key 有效（余额不足）' }
                }
                // 其他错误（长度小于300才认为是明确的错误响应）
                if (out.indexOf('error') >= 0 && out.length < 300) {
                    return { valid: false, error: '验证出错', detail: out.substring(0, 150) }
                }
                return null  // 不确定
            }

            // 尝试1: 普通请求
            _installLog('验证 API Key（方式1: 普通请求）...')
            var out1 = await tryValidate('')
            var r1 = checkResult(out1)
            if (r1 && r1.valid) return r1
            if (r1 && r1.error === 'API Key 无效') return r1

            // 尝试2: 指定 DNS 服务器
            _installLog('验证 API Key（方式2: 强制 IPv4）...')
            var out2 = await tryValidate('-4')
            var r2 = checkResult(out2)
            if (r2 && r2.valid) return r2
            if (r2 && r2.error === 'API Key 无效') return r2

            // 尝试3: 用 -k 忽略 SSL 证书问题
            _installLog('验证 API Key（方式3: 跳过 SSL 验证）...')
            var out3 = await tryValidate('-k')
            var r3 = checkResult(out3)
            if (r3 && r3.valid) return r3
            if (r3 && r3.error === 'API Key 无效') return r3

            // 尝试4: 直接 ping 检测网络连通性
            _installLog('验证 API Key（方式4: 检测网络连通性）...')
            var host = ep.url.replace('https://', '').replace('http://', '').split('/')[0]
            var pingRes = await _rs('ping -c 2 -W 2 ' + host + ' 2>&1 | head -5', 6000)
            var pingOut = pingRes.content || ''

            // 如果所有方式都失败，返回最后一次的结果
            var lastResult = r3 || r2 || r1
            if (lastResult) {
                if (lastResult.error === '网络连接失败') {
                    lastResult.detail += ' | Ping: ' + pingOut.trim().replace(/\n/g, ' | ').substring(0, 80)
                }
                return lastResult
            }

            return { valid: false, error: '验证失败', detail: (out3 || out2 || out1 || '未知错误').substring(0, 150) }
        }

        // ★ 根据Key格式猜测服务商（仅用于自动识别的优先顺序，最终以实际验证为准）
        // 硅基流动: sk- + 48位纯小写字母；DeepSeek/百炼: sk- + 32位十六进制；OpenAI: sk-proj- 或更长混合
        var _guessProviderByKey = function(key) {
            var m = (key || '').match(/^sk-([A-Za-z0-9-]+)$/)
            if (!m) return null
            var body = m[1]
            if (body.length === 48 && /^[a-z]+$/.test(body)) return 'siliconflow'
            if (body.length === 32 && /^[a-f0-9]+$/i.test(body)) return 'deepseek'
            if (/^proj-/.test(body) || body.length > 60) return 'openai'
            return null
        }

        // ★ 自动识别服务商：当所选服务商报"Key无效"时，依次尝试其他服务商
        // （Key送错门口是"一直提示无效"的头号原因：比如硅基流动的Key被拿去DeepSeek验证）
        var _autoDetectProvider = async function(_rs, apiKey, selectedProvider, customEp) {
            var provNames = { deepseek: 'DeepSeek', openai: 'OpenAI', siliconflow: '硅基流动', dashscope: '阿里云百炼' }
            var candidates = []
            var guess = _guessProviderByKey(apiKey)
            if (guess && guess !== selectedProvider) candidates.push(guess)
            var all = ['siliconflow', 'deepseek', 'dashscope', 'openai']
            for (var i = 0; i < all.length; i++) {
                if (all[i] !== selectedProvider && candidates.indexOf(all[i]) < 0) candidates.push(all[i])
            }
            for (var j = 0; j < candidates.length; j++) {
                _installLog('自动识别：尝试 ' + (provNames[candidates[j]] || candidates[j]) + ' ...')
                var r = await _validateApiKey(_rs, apiKey, candidates[j], null)
                if (r.valid) {
                    return { provider: candidates[j], name: provNames[candidates[j]] || candidates[j], result: r }
                }
            }
            return null
        }

        // 配置 API Key 到 PicoClaw（按官方 V2 schema 写入：model_list + agents.defaults.model_name + api_keys 数组）
        var _configureApiKey = async function(_rs, apiKey, provider, customEp) {
            if (!apiKey) return false

            _installLog('正在配置 API Key...')
            _setInstallProgress(80, '配置中...')

            var configDir = _picoclawPath + '/.picoclaw'
            var configFile = configDir + '/config.json'

            // 确保配置目录和工作区存在
            await _rs('mkdir -p ' + configDir + '/workspace', 1000)

            // 各服务商的配置（model 字段为 PicoClaw 的 vendor/model-id 格式）
            var providerConfigs = {
                deepseek:    { model_name: 'deepseek',    model: 'deepseek/deepseek-chat',          api_base: '' },
                openai:      { model_name: 'openai',      model: 'openai/gpt-4o-mini',              api_base: 'https://api.openai.com/v1' },
                siliconflow: { model_name: 'siliconflow', model: 'openai/Qwen/Qwen2.5-7B-Instruct', api_base: 'https://api.siliconflow.cn/v1' },
                dashscope:   { model_name: 'dashscope',   model: 'openai/qwen-plus',                api_base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }
            }

            var cfg
            if (provider === 'custom' && customEp && customEp.url) {
                // 自定义：用用户输入的地址和模型名，走 OpenAI 兼容协议
                cfg = { model_name: 'custom', model: 'openai/' + customEp.model, api_base: customEp.url.replace(/\/$/, '') }
            } else {
                cfg = providerConfigs[provider] || providerConfigs.deepseek
            }

            var entry = {
                model_name: cfg.model_name,
                model: cfg.model,
                api_keys: [apiKey]        // ★ 必须是数组 api_keys；单数 api_key 在 V2 会被忽略
            }
            if (cfg.api_base) entry.api_base = cfg.api_base

            // 生成 PicoClaw 官方 schema 的 config.json（设备共体模式：放开沙盒 + 启用工具）
            var configJson = JSON.stringify({
                version: 3,
                agents: {
                    defaults: {
                        model_name: cfg.model_name,          // ★ 默认模型指向 model_list 里的别名
                        restrict_to_workspace: false,        // ★ 共体核心：允许访问整个文件系统（默认true会锁在workspace里）
                        max_tool_iterations: 30,             // 允许多轮工具调用，AI能"查→想→做"连续操作设备
                        max_llm_retries: 2
                    }
                },
                model_list: [entry],
                tools: {
                    exec: {                                  // ★ 共体核心：AI 可在设备上直接执行命令
                        enabled: true,
                        enable_deny_patterns: true           // 保留危险命令拦截兜底（rm -rf / 等）
                    },
                    web: { enabled: true },                  // 允许联网搜索
                    cron: { enabled: true },                 // 允许设定时任务
                    read_file: { enabled: true },
                    write_file: { enabled: true },
                    edit_file: { enabled: true },
                    list_dir: { enabled: true },
                    spawn: { enabled: true }
                },
                gateway: {
                    host: '127.0.0.1',
                    port: 18790
                }
            }, null, 2)

            // 写入配置文件
            var escapedJson = configJson.replace(/'/g, "'\\''")
            var writeCmd = "echo '" + escapedJson + "' > " + configFile + " && echo CONFIG_OK"
            var writeRes = await _rs(writeCmd, 2000)
            return (writeRes.content || '').indexOf('CONFIG_OK') >= 0
        }

        // 一键安装主函数
        var oneClickInstallPicoClaw = async function() {
            var _rs = getShell()
            if (!_rs) {
                showToast('Shell 不可用，无法安装', 'red')
                return false
            }

            var apiKeyInput = document.getElementById('pc_api_key_input')
            var providerSelect = document.getElementById('pc_provider_select')
            var apiKey = apiKeyInput ? apiKeyInput.value.trim() : ''
            var provider = providerSelect ? providerSelect.value : 'deepseek'

            // 自定义服务商：让用户输入 API 地址和模型名（OpenAI 兼容）
            var customEp = null
            if (provider === 'custom' && apiKey) {
                var cuUrl = prompt('请输入自定义服务商 API 地址（OpenAI 兼容，如 https://api.moonshot.cn/v1）：', '')
                if (!cuUrl || cuUrl.indexOf('http') !== 0) {
                    showToast('未输入有效的 API 地址，已按 DeepSeek 处理', 'yellow', 2500)
                    provider = 'deepseek'
                } else {
                    var cuModel = prompt('请输入模型名（如 moonshot-v1-8k）：', '')
                    if (!cuModel) {
                        showToast('未输入模型名，已按 DeepSeek 处理', 'yellow', 2500)
                        provider = 'deepseek'
                    } else {
                        customEp = { url: cuUrl.replace(/\/$/, ''), model: cuModel }
                    }
                }
            }

            // 显示进度条
            var progressDiv = document.getElementById('chat_install_progress')
            if (progressDiv) progressDiv.style.display = 'block'
            _setInstallProgress(5, '开始安装...')

            try {
                var sourceBin = null
                var installMethod = ''

                // 1. 先尝试从已安装的APP提取
                _installLog('正在检测小龙虾APP...')
                _setInstallProgress(10, '检测本地资源...')
                sourceBin = await _extractFromApk(_rs)

                if (sourceBin) {
                    installMethod = '从APP提取'
                    _installLog('找到本地二进制文件')
                } else {
                    // 2. 从网络下载
                    installMethod = '网络下载'
                    _installLog('未找到本地安装，从网络下载...')
                    sourceBin = await _downloadPicoClaw(_rs)
                    if (!sourceBin) {
                        showToast('下载失败，请检查网络', 'red')
                        _installLog('下载失败')
                        return false
                    }
                }

                _setInstallProgress(60, '安装中...')
                _installLog('正在安装到 ' + _picoclawPath + '...')

                // 3. 创建目录并复制二进制
                await _rs('mkdir -p ' + _picoclawPath, 1000)
                var copyCmd = 'cp ' + sourceBin + ' ' + _picoclawBin + ' && chmod 755 ' + _picoclawBin + ' && echo COPY_OK'
                var copyRes = await _rs(copyCmd, 5000)
                if ((copyRes.content || '').indexOf('COPY_OK') < 0) {
                    showToast('安装文件复制失败', 'red')
                    _installLog('复制失败')
                    return false
                }

                // 4. 验证二进制
                var verRes = await _rs('cd ' + _picoclawPath + ' && env HOME=' + _picoclawPath + ' ./picoclaw --version 2>&1', 5000)
                _installLog('版本: ' + (verRes.content || '未知').trim().substring(0, 50))

                _setInstallProgress(70, '安装完成，配置中...')

                // 5. 验证并配置 API Key
                if (apiKey) {
                    _setInstallProgress(72, '验证 API Key...')
                    _installLog('正在验证 API Key...')
                    var valResult = await _validateApiKey(_rs, apiKey, provider, customEp)

                    // ★ Key 在所选服务商处报"无效"时，自动尝试其他服务商（Key送错门口的典型场景）
                    if (!valResult.valid && valResult.error === 'API Key 无效') {
                        var detected = await _autoDetectProvider(_rs, apiKey, provider, customEp)
                        if (detected) {
                            provider = detected.provider
                            valResult = detected.result
                            _installLog('✅ 自动识别：你的 Key 属于【' + detected.name + '】，已自动切换服务商')
                            showToast('已自动识别为 ' + detected.name, 'green', 3000)
                        }
                    }

                    if (valResult.valid) {
                        _installLog('✅ API Key 验证通过: ' + valResult.detail)
                    } else {
                        _installLog('⚠️ API Key 验证未通过: ' + valResult.error + ' - ' + valResult.detail.substring(0, 60))
                        _installLog('  （仍会写入配置，PicoClaw 启动后会自行尝试连接）')
                    }
                    
                    _setInstallProgress(75, '写入配置...')
                    var configured = await _configureApiKey(_rs, apiKey, provider, customEp)
                    if (configured) {
                        _installLog('API Key 配置写入成功')
                    } else {
                        _installLog('API Key 配置失败，请手动配置')
                    }
                } else {
                    _installLog('未输入 API Key，跳过配置')
                }

                // 6. 初始化（首次运行自动初始化，这里只做简单验证）
                _setInstallProgress(90, '初始化中...')
                _installLog('正在初始化 PicoClaw...')
                // 不调用 onboard（可能没有 --no-interactive 参数导致卡住）
                // 直接通过 version 命令验证二进制可用
                var initRes = await _rs('cd ' + _picoclawPath + ' && env HOME=' + _picoclawPath + ' ./picoclaw --help 2>&1 | head -5', 8000)
                _installLog('初始化完成')

                _setInstallProgress(100, '安装完成！')
                _installLog('✅ 安装完成！方式：' + installMethod)

                // 更新状态
                _picoclawInstalled = true
                showToast('PicoClaw 安装成功！', 'green', 2500)

                // 重新检测状态
                await checkPicoClawStatus()
                return true

            } catch(e) {
                _installLog('安装异常: ' + String(e))
                showToast('安装失败：' + String(e).substring(0, 30), 'red', 3000)
                return false
            }
        }

        // 一键安装按钮
        var oneClickBtn = document.getElementById('pc_oneclick_install_btn')
        if (oneClickBtn) {
            oneClickBtn.onclick = async function() {
                oneClickBtn.disabled = true
                var originalText = oneClickBtn.textContent
                oneClickBtn.textContent = '安装中...'
                try {
                    await oneClickInstallPicoClaw()
                } finally {
                    oneClickBtn.disabled = false
                    oneClickBtn.textContent = originalText
                }
            }
        }

        // 安装向导：检测安装状态按钮
        var checkInstallBtn = document.getElementById('pc_check_install_btn')
        if (checkInstallBtn) {
            checkInstallBtn.onclick = async function() {
                checkInstallBtn.disabled = true
                checkInstallBtn.textContent = '检测中...'
                try {
                    await checkPicoClawStatus()
                    if (_picoclawInstalled) {
                        if (_picoclawConfigured) {
                            showToast('PicoClaw 已就绪！', 'green', 2000)
                        } else {
                            showToast('已安装，请配置 API', 'yellow', 2500)
                        }
                    } else {
                        showToast('未检测到 PicoClaw 安装', 'red', 2500)
                    }
                } finally {
                    checkInstallBtn.disabled = false
                    checkInstallBtn.textContent = '🔍 检测安装状态'
                }
            }
        }

        // 安装向导：从小龙虾APP提取按钮
        var openPluginBtn = document.getElementById('pc_open_plugin_btn')
        if (openPluginBtn) {
            openPluginBtn.onclick = async function() {
                // 先尝试直接从APP提取
                var _rs = getShell()
                if (_rs) {
                    var found = await _extractFromApk(_rs)
                    if (found) {
                        // 找到了，直接走一键安装流程（会优先用找到的文件）
                        showToast('找到 PicoClaw 文件，开始安装...', 'green', 2000)
                        openPluginBtn.disabled = true
                        try {
                            await oneClickInstallPicoClaw()
                        } finally {
                            openPluginBtn.disabled = false
                        }
                        return
                    }
                }
                // 没找到，尝试打开APP
                if (_rs) {
                    _rs('am start -n com.sipeed.picoclaw/.MainActivity 2>/dev/null || am start -n com.picoclaw.app/.MainActivity 2>/dev/null || echo NO_APP', 3000)
                }
                showToast('未找到小龙虾APP，请先安装小龙虾插件', 'yellow', 3000)
            }
        }

        // 配置向导：一键配置 API 按钮
        var quickConfigBtn = document.getElementById('pc_quick_config_btn')
        if (quickConfigBtn) {
            quickConfigBtn.onclick = async function() {
                var apiInput = document.getElementById('pc_config_api_input')
                var provSelect = document.getElementById('pc_config_provider_select')
                var apiKey = apiInput ? apiInput.value.trim() : ''
                var provider = provSelect ? provSelect.value : 'deepseek'

                if (!apiKey) {
                    showToast('请输入 API Key', 'red', 2000)
                    return
                }

                // 自定义服务商：让用户输入 API 地址和模型名（OpenAI 兼容）
                var customEp = null
                if (provider === 'custom') {
                    var cuUrl = prompt('请输入自定义服务商 API 地址（OpenAI 兼容，如 https://api.moonshot.cn/v1）：', '')
                    if (!cuUrl || cuUrl.indexOf('http') !== 0) {
                        showToast('未输入有效的 API 地址', 'red', 2500)
                        return
                    }
                    var cuModel = prompt('请输入模型名（如 moonshot-v1-8k）：', '')
                    if (!cuModel) {
                        showToast('未输入模型名', 'red', 2500)
                        return
                    }
                    customEp = { url: cuUrl.replace(/\/$/, ''), model: cuModel }
                }

                var _rs = getShell()
                if (!_rs) {
                    showToast('Shell 不可用', 'red')
                    return
                }

                quickConfigBtn.disabled = true
                var origText = quickConfigBtn.textContent
                quickConfigBtn.textContent = '验证中...'

                try {
                    // 先验证 API Key
                    _installLog('正在验证 API Key（最多 30 秒）...')
                    var validateResult = await _validateApiKey(_rs, apiKey, provider, customEp)

                    // ★ Key 在所选服务商处报"无效"时，自动尝试其他服务商（Key送错门口的典型场景）
                    if (!validateResult.valid && validateResult.error === 'API Key 无效') {
                        var detected = await _autoDetectProvider(_rs, apiKey, provider, customEp)
                        if (detected) {
                            provider = detected.provider
                            validateResult = detected.result
                            _installLog('✅ 自动识别：你的 Key 属于【' + detected.name + '】，已自动切换服务商')
                            showToast('已自动识别为 ' + detected.name + '，继续配置...', 'green', 3000)
                        }
                    }

                    if (!validateResult.valid) {
                        // 验证失败，询问用户是否跳过
                        var errMsg = 'Key 验证失败：' + validateResult.error
                        _installLog(errMsg + ' | 详情: ' + validateResult.detail)
                        
                        // 如果是网络问题，提示用户并允许跳过
                        if (validateResult.error === '网络连接失败') {
                            var skipConfirm = confirm('网络连接失败，无法验证 API Key。\n\n可能原因：\n1. 设备网络不通\n2. DNS 解析失败\n3. 防火墙限制\n\n是否跳过验证，直接写入配置？\n（如果 Key 是对的，PicoClaw 启动后会自动连接）')
                            if (!skipConfirm) {
                                showToast('已取消：' + validateResult.error, 'red', 3000)
                                return
                            }
                            _installLog('用户选择跳过验证（网络问题）')
                        } else if (validateResult.error === 'API Key 无效') {
                            showToast('❌ API Key 在所有已支持的服务商处均验证无效（已自动尝试 DeepSeek/硅基流动/OpenAI/百炼），请到对应平台确认 Key 状态', 'red', 5000)
                            return
                        } else {
                            var skipConfirm2 = confirm('API Key 验证失败：' + validateResult.error + '\n\n详情: ' + validateResult.detail.substring(0, 80) + '\n\n是否跳过验证，直接写入配置？')
                            if (!skipConfirm2) {
                                showToast('已取消验证', 'yellow', 2000)
                                return
                            }
                            _installLog('用户选择跳过验证')
                        }
                    } else {
                        _installLog('✅ API Key 验证通过: ' + validateResult.detail)
                        showToast('Key 验证通过，正在配置...', 'green', 1500)
                    }

                    quickConfigBtn.textContent = '配置中...'

                    // 写入配置
                    var ok = await _configureApiKey(_rs, apiKey, provider, customEp)
                    if (ok) {
                        showToast('配置写入成功，正在启动 PicoClaw...', 'green', 2000)

                        // 启动 PicoClaw 后台服务（尝试多种方式）
                        _installLog('启动 PicoClaw 服务...')
                        
                        // 先杀掉旧进程，确保干净启动
                        await _rs('pkill -9 -f "picoclaw" 2>/dev/null; sleep 1', 3000)
                        
                        // 清空旧日志
                        await _rs('> /data/local/tmp/picoclaw_launcher.log 2>/dev/null', 1000)
                        
                        var started = false
                        var startMethods = [
                            // PicoClaw 唯一有效的常驻子命令是 gateway（launcher/serve/daemon 均不存在，会直接报错）
                            {
                                name: 'gateway模式',
                                cmd: 'cd ' + _picoclawPath + ' && env ' + _picoclawHomeEnv + ' ' + _picoclawSslEnv + 
                                     ' nohup ./picoclaw gateway >/data/local/tmp/picoclaw_launcher.log 2>&1 & echo "PID:$!"'
                            }
                        ]
                        
                        for (var mi = 0; mi < startMethods.length; mi++) {
                            var method = startMethods[mi]
                            _installLog('尝试启动方式' + (mi+1) + ': ' + method.name)
                            var startRes = await _rs(method.cmd, 3000)
                            _installLog('  启动输出: ' + (startRes.content || '').trim())
                            
                            // 等2秒检查进程
                            await _installSleep(2000)
                            var pgrepRes = await _rs('pgrep -f "picoclaw" 2>/dev/null | head -5; echo "---COUNT---"; pgrep -f "picoclaw" 2>/dev/null | wc -l', 2000)
                            var pgrepOut = pgrepRes.content || ''
                            var countMatch = pgrepOut.match(/---COUNT---\s*(\d+)/)
                            var count = countMatch ? parseInt(countMatch[1]) : 0
                            
                            _installLog('  进程数: ' + count)
                            
                            if (count > 0) {
                                _installLog('✅ 启动成功！方式: ' + method.name)
                                started = true
                                break
                            } else {
                                // 看日志
                                var logRes = await _rs('tail -10 /data/local/tmp/picoclaw_launcher.log 2>/dev/null', 1000)
                                _installLog('  启动日志: ' + (logRes.content || '空').trim().substring(0, 150))
                            }
                        }
                        
                        // 如果都没启动成功，试试用 agent 模式测试一下能不能跑
                        if (!started) {
                            _installLog('所有启动方式失败，测试二进制是否可用...')
                            var testRes = await _rs('cd ' + _picoclawPath + ' && env ' + _picoclawHomeEnv + ' ' + _picoclawSslEnv + ' ./picoclaw --help 2>&1 | head -15', 8000)
                            _installLog('  --help 输出: ' + (testRes.content || '空').trim().substring(0, 200))
                        }
                        
                        // 多等一会再确认
                        await _installSleep(2000)
                        var finalPgrep = await _rs('pgrep -f "picoclaw" 2>/dev/null | wc -l', 2000)
                        var finalCount = parseInt((finalPgrep.content || '0').trim())
                        _installLog('最终进程数: ' + finalCount)
                        
                        var hasProcess = finalCount > 0

                        if (hasProcess) {
                            _picoclawConfigured = true
                            _picoclawInstalled = true
                            _picoclawRunning = true
                            // 保存 Key 到本地存储，下次自动填充
                            try {
                                localStorage.setItem('pc_saved_api_key', apiKey)
                                localStorage.setItem('pc_saved_provider', provider)
                            } catch(e) {}
                            showChatView('chat')
                            updatePicoClawStatusUI()
                            showToast('✅ 配置成功！PicoClaw 已启动', 'green', 2500)
                            // 自动发一条欢迎消息验证
                            var _provNames2 = { deepseek: 'DeepSeek', openai: 'OpenAI', siliconflow: '硅基流动', dashscope: '阿里云百炼', custom: '自定义服务商' }
                            setTimeout(function() {
                                _appendMessage('assistant', '你好！我是设备AI管家 🦞\n\n已接入 ' + (_provNames2[provider] || provider) + '。我长在这台设备上，能**自己动手修**，不是只会给你教程：\n\n**🛠️ 网络问题 → 剧本模式**（说"没网了""连不上""信号差"即触发）\n  · 我先自己跑一整套诊断（ping、数据连接、SIM、路由、日志）\n  · 选一个最对症的方案执行，再复测一遍拿证据\n  · 全程脚本驱动，AI 只负责判断和总结——所以**即使模型弱、甚至 API 挂了，照样能修**\n\n**🔍 其他问题 → 自主诊断**（存储、发热、耗电、性能等）\n  · 我按需执行命令，看到结果再决定下一步，修完自己验证\n\n遇到解决不了的（比如需要重启设备），我会说明原因让你手动操作，绝不擅自重启。\n试试「🛠️ 修复网络」或直接说"网有点卡，帮我看看"')
                            }, 500)
                        } else {
                            // 进程没起来，但配置已经写了，也让用户进入聊天界面（可能只是启动慢）
                            _picoclawConfigured = true
                            // 保存 Key 到本地存储，下次自动填充
                            try {
                                localStorage.setItem('pc_saved_api_key', apiKey)
                                localStorage.setItem('pc_saved_provider', provider)
                            } catch(e) {}
                            showChatView('chat')
                            updatePicoClawStatusUI()
                            showToast('配置已写入，服务启动中...稍后再试', 'yellow', 3000)
                            // 显示启动日志给用户排查
                            var logRes = await _rs('tail -30 /data/local/tmp/picoclaw_launcher.log 2>/dev/null || echo "无日志"', 2000)
                            _installLog('启动日志: ' + (logRes.content || '').substring(0, 200))
                        }
                    } else {
                        showToast('配置失败', 'red')
                    }
                } finally {
                    quickConfigBtn.disabled = false
                    quickConfigBtn.textContent = origText
                }
            }
        }

        // 配置向导：打开配置面板按钮
        var openConfigBtn = document.getElementById('pc_open_config_btn')
        if (openConfigBtn) {
            openConfigBtn.onclick = function() {
                openPicoClawPanel()
            }
        }

        // 配置向导：重新检测按钮
        var retryCheckBtn = document.getElementById('pc_retry_check_btn')
        if (retryCheckBtn) {
            retryCheckBtn.onclick = async function() {
                retryCheckBtn.disabled = true
                retryCheckBtn.textContent = '检测中...'
                try {
                    await checkPicoClawStatus()
                    if (_picoclawConfigured) {
                        showToast('配置成功！可以开始聊天了', 'green', 2000)
                    } else {
                        showToast('仍未检测到可用配置，请检查 API Key', 'red', 3000)
                    }
                } finally {
                    retryCheckBtn.disabled = false
                    retryCheckBtn.textContent = '🔄 重新检测'
                }
            }
        }

        // 诊断按钮：详细检测 PicoClaw 状态
        var diagBtn = document.getElementById('pc_diagnose_btn')
        if (diagBtn) {
            diagBtn.onclick = async function() {
                var _rs = getShell()
                if (!_rs) {
                    showToast('Shell 不可用', 'red')
                    return
                }

                diagBtn.disabled = true
                var origText = diagBtn.textContent
                diagBtn.textContent = '诊断中...'

                try {
                    var lines = []
                    lines.push('===== PicoClaw 诊断报告 =====')

                    // 1. 安装路径
                    lines.push('')
                    lines.push('【1/6】安装路径检测')
                    lines.push('  _picoclawPath: ' + _picoclawPath)
                    lines.push('  二进制文件: ' + _picoclawPath + '/picoclaw')
                    var existsRes = await _rs('ls -la ' + _picoclawPath + '/picoclaw 2>&1', 1000)
                    lines.push('  文件信息: ' + (existsRes.content || '').trim())

                    // 2. 二进制可执行性测试
                    lines.push('')
                    lines.push('【2/6】二进制测试')
                    var helpRes = await _rs('cd ' + _picoclawPath + ' && env HOME=' + _picoclawPath + ' ./picoclaw --help 2>&1 | head -10', 5000)
                    lines.push('  --help 输出: ' + (helpRes.content || '空').trim().substring(0, 150))

                    var versionRes = await _rs('cd ' + _picoclawPath + ' && env HOME=' + _picoclawPath + ' ./picoclaw --version 2>&1 | head -3', 5000)
                    lines.push('  --version 输出: ' + (versionRes.content || '空').trim().substring(0, 100))

                    // 3. 配置文件检测
                    lines.push('')
                    lines.push('【3/6】配置文件检测')
                    var cfgRes = await _rs('ls -la ' + _picoclawPath + '/.picoclaw/config.json 2>&1', 1000)
                    lines.push('  config.json: ' + (cfgRes.content || '').trim())
                    var cfgContent = await _rs('cat ' + _picoclawPath + '/.picoclaw/config.json 2>&1 | head -20', 1000)
                    var cfgText = (cfgContent.content || '').trim()
                    // 隐藏 api_key
                    cfgText = cfgText.replace(/"api_key"\s*:\s*"[^"]+"/g, '"api_key": "***隐藏***"')
                    lines.push('  配置内容: ' + cfgText.substring(0, 200))

                    // 4. 进程检测
                    lines.push('')
                    lines.push('【4/6】进程检测')
                    var psRes = await _rs('ps -ef 2>/dev/null | grep -i picoclaw | grep -v grep | head -10', 2000)
                    lines.push('  运行中进程:')
                    var psLines = (psRes.content || '').trim().split('\n')
                    for (var pli = 0; pli < psLines.length; pli++) {
                        if (psLines[pli].trim()) {
                            lines.push('    ' + psLines[pli].trim().substring(0, 100))
                        }
                    }
                    if ((psRes.content || '').trim() === '') {
                        lines.push('    （无运行中进程）')
                    }

                    // 5. 网络检测
                    lines.push('')
                    lines.push('【5/6】网络检测')
                    var dnsRes = await _rs('getprop net.dns1; getprop net.dns2; ping -c 1 -W 2 api.deepseek.com 2>&1 | head -3', 8000)
                    lines.push('  DNS & 连通性: ' + (dnsRes.content || '').trim().replace(/\n/g, ' | ').substring(0, 200))
                    
                    // curl 测试
                    lines.push('')
                    lines.push('  Curl 测试 api.deepseek.com:')
                    var curlTest = await _rs('curl -s --connect-timeout 5 --max-time 8 -o /dev/null -w "HTTP_CODE:%{http_code} TIME:%{time_total}s" https://api.deepseek.com/v1/models 2>&1', 12000)
                    lines.push('    ' + (curlTest.content || '').trim())

                    // 6. API Key 验证（如果配置了）
                    lines.push('')
                    lines.push('【6/6】API Key 验证')
                    try {
                        var cfgJson = JSON.parse((cfgContent.content || '{}'))
                        var cfgKey = ''
                        var cfgProvider = 'deepseek'
                        var diagEp = null
                        // 新格式：PicoClaw V2（model_list）
                        if (cfgJson.model_list && cfgJson.model_list.length > 0) {
                            var wantName2 = (cfgJson.agents && cfgJson.agents.defaults && cfgJson.agents.defaults.model_name) || ''
                            var entry2 = null
                            for (var di = 0; di < cfgJson.model_list.length; di++) {
                                if (!wantName2 || cfgJson.model_list[di].model_name === wantName2) { entry2 = cfgJson.model_list[di]; break }
                            }
                            if (!entry2) entry2 = cfgJson.model_list[0]
                            cfgKey = (entry2.api_keys && entry2.api_keys[0]) || entry2.api_key || ''
                            var mBase = entry2.api_base || ''
                            if (mBase.indexOf('deepseek') >= 0) cfgProvider = 'deepseek'
                            else if (mBase.indexOf('openai') >= 0) cfgProvider = 'openai'
                            else if (mBase.indexOf('siliconflow') >= 0) cfgProvider = 'siliconflow'
                            else if (mBase.indexOf('dashscope') >= 0) cfgProvider = 'dashscope'
                            else if (mBase) {
                                // 无法识别的地址 → 按自定义处理
                                cfgProvider = 'custom'
                                var mSlash = (entry2.model || '').indexOf('/')
                                diagEp = {
                                    url: mBase,
                                    model: mSlash >= 0 ? entry2.model.substring(mSlash + 1) : (entry2.model || 'gpt-3.5-turbo')
                                }
                            }
                        }
                        // 兼容旧格式（llm.providers.default）
                        if (!cfgKey && cfgJson.llm && cfgJson.llm.providers && cfgJson.llm.providers.default) {
                            cfgKey = cfgJson.llm.providers.default.api_key || ''
                            var baseUrl = cfgJson.llm.providers.default.base_url || ''
                            if (baseUrl.indexOf('deepseek') >= 0) cfgProvider = 'deepseek'
                            else if (baseUrl.indexOf('openai') >= 0) cfgProvider = 'openai'
                            else if (baseUrl.indexOf('siliconflow') >= 0) cfgProvider = 'siliconflow'
                            else if (baseUrl.indexOf('dashscope') >= 0) cfgProvider = 'dashscope'
                        }
                        
                        if (cfgKey) {
                            lines.push('  已配置 API Key: ' + cfgKey.substring(0, 6) + '...' + cfgKey.substring(cfgKey.length - 4))
                            lines.push('  服务商: ' + cfgProvider)
                            lines.push('  正在验证...（约 15 秒）')
                            var valRes = await _validateApiKey(_rs, cfgKey, cfgProvider, diagEp)
                            if (valRes.valid) {
                                lines.push('  ✅ API Key 验证通过: ' + valRes.detail)
                            } else {
                                lines.push('  ❌ API Key 验证失败')
                                lines.push('     错误: ' + valRes.error)
                                lines.push('     详情: ' + valRes.detail.substring(0, 120))
                            }
                        } else {
                            lines.push('  未检测到配置的 API Key')
                        }
                    } catch(e) {
                        lines.push('  解析配置失败: ' + String(e))
                    }

                    // 显示诊断结果
                    var report = lines.join('\n')
                    _installLog(report)
                    showToast('诊断完成，查看日志', 'green', 2000)
                    console.log(report)
                } finally {
                    diagBtn.disabled = false
                    diagBtn.textContent = origText
                }
            }
        }

        // 初始检测 PicoClaw 状态
        checkPicoClawStatus()
        
        // 自动填充保存的 API Key
        try {
            var savedKey = localStorage.getItem('pc_saved_api_key')
            var savedProvider = localStorage.getItem('pc_saved_provider')
            if (savedKey) {
                var installInput = document.getElementById('pc_api_key_input')
                var configInput = document.getElementById('pc_config_api_input')
                if (installInput) installInput.value = savedKey
                if (configInput) configInput.value = savedKey
            }
            if (savedProvider) {
                var installSelect = document.getElementById('pc_provider_select')
                var configSelect = document.getElementById('pc_config_provider_select')
                if (installSelect) installSelect.value = savedProvider
                if (configSelect) configSelect.value = savedProvider
            }
        } catch(e) {}

        // ============================================================
        // ===== PicoClaw 聊天集成 结束 =====
        // ============================================================

        // 初始渲染
        renderPendingCommands()
        renderAILogs()
        updateStats()
        updateRunStatus()
        updateFAB()

        // 如果之前在运行，自动恢复
        if (_aiRunning) {
            setTimeout(function() {
                aiLog('AI助手自动恢复运行', 'success')
                startAI()
            }, 2000)
        }

        SDM.addDiagLog('AI智能助手模块已加载', 'success')
    })()


    ;(function() {
        if (window._desktopPetLoaded) return;
        window._desktopPetLoaded = true;

        // ---- 防重复 ----
        var oldPet = document.getElementById('desktop_pet_root');
        if (oldPet) oldPet.remove();

        // ---- 工具函数 ----
        var _toast = function(msg, color, dur) {
            try { if (typeof SDM.toast === 'function') SDM.toast(msg, color || 'pink', dur || 3000); } catch(e) {}
        };
        var _rs = function(cmd, timeout) {
            return new Promise(function(resolve) {
                try {
                    if (typeof SDM.runShell !== 'function') { resolve({ content: '', success: false }); return; }
                    SDM.runShell(cmd, timeout || 10000).then(function(r) {
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


    SDM.emit('module:ready', MODULE_ID);
    console.log('[SDM Module] ai-assistant v1.0.0 loaded (music + AI + desktop pet)');
})(window.SDM);
//@@SDM_MODULE_ai-assistant_END@@
