// Version: 1.0.0
//@@SDM_MODULE_game-booster@@
(function(SDM) {
    'use strict';
    if (!SDM) return;

    var MODULE_ID = 'game-booster';
    var _bs = 'border:none;border-radius:12px;font-weight:bold;color:white;cursor:pointer;';

    // ─── requestInterval fallback (global helper from UFI app) ───
    var _ri = (typeof requestInterval === 'function') ? requestInterval : function(fn, ms) {
        var id = setInterval(fn, ms);
        return function() { clearInterval(id); };
    };

    // ════════════════════════════════════════════════════════════
    //  Game package database — identify games by package name
    // ════════════════════════════════════════════════════════════
    var GAME_PKG_DB = {
        // Tencent
        'com.tencent.tmgp.pubgmhd':'和平精英','com.tencent.tmgp.sgame':'王者荣耀',
        'com.tencent.tmgp.cf':'穿越火线','com.tencent.tmgp.speedmobile':'QQ飞车',
        'com.tencent.tmgp.dnf':'DNF手游','com.tencent.tmgp.lolm':'英雄联盟手游',
        'com.tencent.tmgp.mbsj':'使命召唤手游','com.tencent.tmgp.nns':'火影忍者',
        'com.tencent.tmgp.hyr':'火影忍者','com.tencent.tmgp.viv':'天天酷跑',
        'com.tencent.tmgp.honor':'QQ华夏','com.tencent.tmgp.mg':'全民枪王',
        'com.tencent.tmgp.dj':'天天炫斗','com.tencent.mobileqq':'QQ(游戏大厅)',
        'com.tencent.qggames':'QQ游戏大厅','com.tencent.androidqqgame':'QQ游戏',
        'com.tencent.tmgp.bns':'剑灵','com.tencent.tmgp.mc':'我的世界(腾讯版)',
        'com.tencent.tmgp.chess':'天天象棋','com.tencent.tmgp.mj':'欢乐麻将',
        'com.tencent.tmgp.poker':'欢乐斗地主','com.tencent.tmgp.landlord':'欢乐斗地主',
        'com.tencent.cloudgame':'腾讯START云游戏',
        // Ace War
        'com.yingxiong.hero.aligames':'王牌战争','com.yingxiong.hero':'王牌战争','com.yingxiong.hero4399':'王牌战争',
        // miHoYo
        'com.miHoYo.GenshinImpact':'原神','com.miHoYo.YuanShen':'原神B服',
        'com.miHoYo.enterprise.NGHSoD':'崩坏：星穹铁道','com.miHoYo.Hokai3':'崩坏3',
        'com.miHoYo.ZenlessZoneZero':'绝区零','com.miHoYo.HoYoPlay':'米哈游启动器',
        'com.miHoYo.enterprise.QYHF':'未定事件簿','com.miHoYo.incave':'天空之傲',
        'com.miHoYo.enterprise.NHOTHP':'崩坏3(测试)',
        // NetEase
        'com.netease.onmyoji':'阴阳师','com.netease.mrzh':'率土之滨','com.netease.zjz':'决战平安京',
        'com.netease.sky':'Sky光遇','com.netease.dwrg':'第五人格','com.netease.g27':'荒野行动',
        'com.netease.hyhd':' hypergryph','com.netease.mrzh.hd':'率土之滨HD',
        'com.netease.ez':'大话西游','com.netease.x60':'梦幻西游','com.netease.df':'大航海之路',
        'com.netease.cloudgame':'网易云游戏','com.netease.chinasword':'逆水寒',
        'com.netease.lxhy':'流星蝴蝶剑',
        'com.netease.win':'战意','com.netease.dao':'永劫无间手游',
        // Supercell
        'com.supercell.clashroyale':'皇室战争','com.supercell.clashofclans':'部落冲突',
        'com.supercell.clashofclans.cn':'部落冲突(中国版)','com.supercell.brawlstars':'荒野乱斗',
        'com.supercell.squadbusters':'squadbusters','com.supercell.hayday':'卡通农场',
        'com.supercell.boombeach':'海岛奇兵',
        // Other popular games
        'com.mojang.minecraftpe':'我的世界','com.lilithgame.roc.gp':'万国觉醒',
        'com.lilithgame.xgame.ios':'剑与远征','com.lilithgame.roc.gp.cn':'万国觉醒(国服)',
        'com.lilithgame.afk.gp':'剑与远征','com.lilithgame.hw.gp':'剑与家园',
        'com.ea.game.pvz2_free':'植物大战僵尸2','com.ea.game.fifa15_row':'FIFA足球',
        'com.ea.game.nfsmw_row':'极品飞车','com.ea.game.simsmobile_row':'模拟人生',
        'com.gameloft.android.ANMP.GloftA8HM':'狂野飙车8','com.gameloft.android.ANMP.GloftA9HM':'狂野飙车9',
        'com.gameloft.android.ANMP.GloftM5HM':'现代战争5','com.gameloft.android.ANMP.GloftHM5HM':'现代战争',
        'com.kiloo.subwaysurf':'地铁跑酷','com.king.candycrushsaga':'糖果传奇',
        'com.king.candycrushsodasaga':'糖果苏打传奇','com.king.farmheroessaga':'农场英雄传奇',
        // Anime / card games
        'com.hypergryph.zjsn':'明日方舟','com.hypergryph.arknights':'明日方舟',
        'com.bilibili.fatego':'FGO','com.bilibili.priconne':'公主连结',
        'com.bilibili.dl.fgo':'FGO(渠道)','com.bilibili.mrzh':'率土之滨(B服)',
        'com.hermes.bili':'哔哩哔哩',
        'com.kuro.marvelous':'战双帕弥什','com.kuro.wuthering':'鸣潮',
        'com.pwrd.hotta':'幻塔','com.pwrd.ro':'幻塔',
        'com.tencent.tmgp.gcx':'光遇(腾讯)','com.igg.android.lordsmobile':'lordsmobile',
        'com.igg.android.im':'IGG游戏',
        'com.camelgames.lordsmobile':'王国纪事',
        'com.cil.thgame':'时空猎人','com.cib.animals':'动物餐厅',
        'com.funplus.familyfarm.familyfarmseaside':'家庭农场',
        'com.dts.freefireth':'FreeFire','com.dts.freefire':'FreeFire',
        'com.garena.game.freefire':'Free Fire','com.garena.game.freefireth':'Free Fire(泰)',
        'com.riotgames.league.wildrift':'英雄联盟手游(拳头)',
        'com.riotgames.teamfighttactics':'云顶之弈手游',
        'com.blizzard.diabloimmortal':'暗黑破坏神：不朽',
        'com.blizzard.hearthstone':'炉石传说',
        'com.blizzard.wtcg.hearthstone':'炉石传说',
        'com.activision.callofduty.shooter':'使命召唤',
        'com.dena.ten':'十罗',
        'com.square_enix.android_googleplay':'Square Enix',
        'com.levelinfinite.honkaiimpact3rd':'崩坏3(国际)',
        'com.kwai.game':'快手游戏',
        'com.ssandsaga.heroes':'英雄杀',
        'com.hero.entertainment.gp':'英雄娱乐',
        // Casual / puzzle
        'com.outfit7.talkingtom':'汤姆猫',
        'com.outfit7.mytalkingtomfree':'我的汤姆猫','com.outfit7.mytalkingtom2':'我的汤姆猫2',
        'com.rovio.baba':'愤怒的小鸟','com.rovio.angrybirds':'愤怒的小鸟',
        'com.disney.trolopus':'迪士尼游戏',
        'com.king.farmheros':'农场英雄',
        // Sports / racing
        'com.ea.game.fifa14_row':'FIFA14','com.ea.game.nfsshift':'极品飞车',
        'com.ea.game.needforspeed':'极品飞车','com.ea.game.fifa':'FIFA',
        'com.gameloft.android.ANMP.GloftA6HP':'狂野飙车6',
        'com.gameloft.android.ANMP.GloftA7HM':'狂野飙车7',
        // MOBA / strategy
        'com.lilithgame.hw':'剑与家园',
        'com.funplus.familyfarm':'家庭农场',
        'com.funplus.discord.gp':'Discord',
        'com.discord':'Discord',
        'com.tencent.qqlive':'腾讯视频(游戏中心)',
        'com.ss.android.ugc.aweme':'抖音',
        'com.smile.gifmaker':'快手',
        'com.kuaishou.nebula':'快手极速版',
        // Other
        'com.joycity.odin':'奥丁','com.netease.tom':'汤姆猫跑酷',
        'com.hero3.utk':'英雄无敌','com.hero3.legends':'英雄无敌传奇',
        'com.camelgames.dota':'刀塔传奇',
        'com.screw.scruner':'螺丝拧'
    };

    // ════════════════════════════════════════════════════════════
    //  Game detection anti-false-positive system
    // ════════════════════════════════════════════════════════════
    var _deviceTypeCache = null;

    var isTabletDevice = async function() {
        if (_deviceTypeCache !== null) return _deviceTypeCache;
        try {
            var res = await SDM.runShell('getprop ro.build.characteristics 2>/dev/null; echo ---; wm size 2>/dev/null | tail -1');
            var text = (res && res.content) || '';
            if (text.indexOf('tablet') >= 0 || text.indexOf('Tablet') >= 0) { _deviceTypeCache = true; return true; }
            var m = text.match(/(\d+)x(\d+)/);
            if (m && (parseInt(m[1]) >= 1280 || parseInt(m[2]) >= 1280)) { _deviceTypeCache = true; return true; }
        } catch(e) {}
        _deviceTypeCache = false;
        return false;
    };

    // Desktop / system UI package keywords — never treat as games
    var _skipPkgKeys = ['launcher', 'systemui', 'com.android.', 'android.', 'com.google.android'];

    // Common non-game apps (social / video / shopping / tools)
    var _notGamePkgs = {
        'com.tencent.mm':'微信', 'com.tencent.mobileqq':'手机QQ', 'com.tencent.qzone':'QQ空间',
        'com.eg.android.AlipayGphone':'支付宝', 'com.ss.android.ugc.aweme':'抖音',
        'com.smile.gifmaker':'快手', 'com.kuaishou.nebula':'快手极速版',
        'com.tencent.qqlive':'腾讯视频', 'com.hermes.bili':'哔哩哔哩', 'tv.danmaku.bili':'哔哩哔哩',
        'com.ss.android.article.news':'今日头条', 'com.xunmeng.pinduoduo':'拼多多',
        'com.tencent.android.qqdownloader':'应用宝', 'com.android.browser':'浏览器',
        'com.android.chrome':'Chrome', 'com.mi.globalbrowser':'浏览器'
    };

    var isRealGame = function(pkg) {
        if (!pkg) return false;
        if (_notGamePkgs[pkg]) return false;
        var lower = pkg.toLowerCase();
        for (var i = 0; i < _skipPkgKeys.length; i++) {
            if (lower.indexOf(_skipPkgKeys[i]) >= 0) return false;
        }
        return true;
    };

    var guessGameByPkg = function(pkg) {
        if (!pkg) return '';
        // 1) Exact match (fastest, most accurate)
        if (GAME_PKG_DB[pkg]) return GAME_PKG_DB[pkg];
        var lower = pkg.toLowerCase();
        // 2) Prefix match (channel packages, multi-arch package names)
        for (var key in GAME_PKG_DB) {
            var lk = key.toLowerCase();
            if (lower.indexOf(lk + '.') === 0 || lk.indexOf(lower + '.') === 0) return GAME_PKG_DB[key];
        }
        // 3) Tencent channel aggregation: com.tencent.tmgp.* are all Tencent games
        if (lower.indexOf('com.tencent.tmgp.') === 0) return '腾讯游戏';
        if (lower.indexOf('com.supercell.') === 0) return 'Supercell游戏';
        if (lower.indexOf('clash') >= 0) return '部落冲突/皇室战争';
        if (lower.indexOf('moba') >= 0 || lower.indexOf('lol') >= 0) return 'MOBA类';
        if (lower.indexOf('fps') >= 0 || lower.indexOf('shoot') >= 0) return '射击类';
        if (lower.indexOf('rpg') >= 0 || lower.indexOf('mmo') >= 0) return '角色扮演';
        // Unrecognized -> return empty, never guess blindly
        return '';
    };

    // ════════════════════════════════════════════════════════════
    //  Game boost state
    // ════════════════════════════════════════════════════════════
    var GAME_BOOST_ACTIVE = false;
    var GAME_BOOST_START_TIME = 0;
    var GAME_BOOST_CURRENT = '';
    var GAME_BOOST_PKG = '';
    var GAME_BOOST_DETECTED_BY = '';
    var DETECT_SOURCE_MAP = { 'focus':'窗口焦点', 'topActivity':'栈顶应用', 'fgActivity':'前台应用' };
    var getDetectSourceLabel = function(src) { return DETECT_SOURCE_MAP[src] || src || ''; };
    var GAME_LAST_SEEN_TIME = 0;
    var PREV_RETRANS = 0;
    var PREV_TOTAL = 0;
    var PACKET_LOSS_BEFORE = 0;
    var PACKET_REPAIR_RATE = 0;
    var LATENCY_BEFORE = 0;
    var LATENCY_AFTER = 0;
    var LATENCY_IMPROVE = 0;
    var LATENCY_LAST_UPDATE = 0;
    var _latencyHistory = [];
    var GAME_BOOST_ENABLED = false;
    var GAME_MONITOR_INTERVAL = null;
    var _panelReady = false;

    // ════════════════════════════════════════════════════════════
    //  Game traffic detection
    // ════════════════════════════════════════════════════════════
    var detectGameTraffic = async function() {
        try {
            var isTablet = await isTabletDevice();

            // ===== Method 1 (most accurate): window focus mCurrentFocus / mFocusedWindow =====
            var focusRes = await SDM.runShell('dumpsys window windows 2>/dev/null | grep -iE "mCurrentFocus|mFocusedWindow" | head -2');
            var focusText = (focusRes && focusRes.content || '').trim();
            if (focusText) {
                var fLines = focusText.split('\n');
                for (var fi = 0; fi < fLines.length; fi++) {
                    var fm = fLines[fi].match(/([a-zA-Z][\w]*(?:\.[\w]+)+)\//);
                    if (fm) {
                        var fpkg = fm[1];
                        if (!isRealGame(fpkg)) return null;
                        var fgName = guessGameByPkg(fpkg);
                        if (fgName) return { pkg: fpkg, name: fgName, source: 'focus', isGame: true };
                    }
                }
            }

            // ===== Method 2 (phone only): topResumedActivity =====
            // Tablets have background Activities that cause false positives -> skip on tablets
            if (!isTablet) {
                var topRes = await SDM.runShell('dumpsys activity activities 2>/dev/null | grep -iE "topResumedActivity|mResumedActivity|topActivity" | head -3');
                var topText = (topRes && topRes.content || '').trim();
                if (topText) {
                    var tLines = topText.split('\n');
                    for (var ti = 0; ti < tLines.length; ti++) {
                        var tm = tLines[ti].match(/([a-zA-Z][\w]*(?:\.[\w]+)+)\/(\w+)/);
                        if (tm) {
                            var tpkg = tm[1];
                            if (!isRealGame(tpkg)) continue;
                            var tName = guessGameByPkg(tpkg);
                            if (tName) return { pkg: tpkg, name: tName, source: 'topActivity', isGame: true };
                        }
                    }
                }
            }
        } catch(e) {
            SDM.addDiagLog('检测异常:' + String(e), 'error');
        }
        return null;
    };

    // ════════════════════════════════════════════════════════════
    //  Kernel network parameter tuning — remove speed limits
    // ════════════════════════════════════════════════════════════
    var applyBoostKernelParams = async function() {
        await SDM.runShell(
            'echo 1 > /proc/sys/net/ipv4/tcp_low_latency 2>/dev/null;' +
            'echo 1 > /proc/sys/net/ipv4/tcp_fin_timeout 2>/dev/null;' +
            'echo 1 > /proc/sys/net/ipv4/tcp_no_metrics_save 2>/dev/null;' +
            'echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse 2>/dev/null;' +
            // Remove speed limit: enlarge receive buffer max to 16M, default also to 4M
            'echo "4096 425984 16777216" > /proc/sys/net/ipv4/tcp_rmem 2>/dev/null;' +
            // Remove speed limit: enlarge send buffer max to 16M, default also to 4M
            'echo "4096 425984 16777216" > /proc/sys/net/ipv4/tcp_wmem 2>/dev/null;' +
            // Remove speed limit: raise default send/receive buffers
            'echo 425984 > /proc/sys/net/core/rmem_default 2>/dev/null;' +
            'echo 425984 > /proc/sys/net/core/wmem_default 2>/dev/null;' +
            'echo 16777216 > /proc/sys/net/core/rmem_max 2>/dev/null;' +
            'echo 16777216 > /proc/sys/net/core/wmem_max 2>/dev/null;' +
            'echo 1 > /proc/sys/net/ipv4/tcp_window_scaling 2>/dev/null;' +
            // Remove speed limit: auto-tune receive buffer
            'echo 1 > /proc/sys/net/ipv4/tcp_moderate_rcvbuf 2>/dev/null;' +
            // Remove speed limit: optimize window scaling factor
            'echo 1 > /proc/sys/net/ipv4/tcp_adv_win_scale 2>/dev/null;' +
            'echo 3 > /proc/sys/net/ipv4/tcp_fastopen 2>/dev/null;' +
            'echo 1 > /proc/sys/net/ipv4/tcp_mtu_probing 2>/dev/null;' +
            // Remove speed limit: max retries to 15, never disconnect early
            'echo 15 > /proc/sys/net/ipv4/tcp_retries2 2>/dev/null;' +
            // Remove speed limit: disable slow start after idle, avoid speed fallback
            'echo 0 > /proc/sys/net/ipv4/tcp_slow_start_after_idle 2>/dev/null;' +
            // Remove speed limit: don't save slow start threshold, always full speed
            'echo 1 > /proc/sys/net/ipv4/tcp_no_ssthresh_metrics_save 2>/dev/null;' +
            'echo "bbr" > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null;' +
            'echo "fq_codel" > /proc/sys/net/core/default_qdisc 2>/dev/null;' +
            // Remove speed limit: enlarge network device send queue, reduce packet loss
            'echo 10000 > /proc/sys/net/core/netdev_max_backlog 2>/dev/null;' +
            // Remove speed limit: enlarge receive socket queue
            'echo 8192 > /proc/sys/net/core/netdev_budget 2>/dev/null;' +
            // Remove speed limit: enlarge processing time, avoid packet loss
            'echo 20000 > /proc/sys/net/core/netdev_budget_usecs 2>/dev/null;' +
            // Remove speed limit: enlarge somaxconn connection queue
            'echo 8192 > /proc/sys/net/core/somaxconn 2>/dev/null;' +
            // Remove speed limit: enlarge SYN queue
            'echo 8192 > /proc/sys/net/ipv4/tcp_max_syn_backlog 2>/dev/null;' +
            // Remove speed limit: expand local port range
            'echo "1024 65535" > /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null;' +
            // Remove speed limit: enlarge orphan socket count
            'echo 32768 > /proc/sys/net/ipv4/tcp_max_orphans 2>/dev/null;' +
            // Prevent time-wait state attacks
            'echo 1 > /proc/sys/net/ipv4/tcp_rfc1337 2>/dev/null;' +
            // Enable ECN, reduce congestion packet loss
            'echo 1 > /proc/sys/net/ipv4/tcp_ecn 2>/dev/null;' +
            'echo GAME_AUTO_ON'
        );
    };

    var restoreBoostKernelParams = async function() {
        try {
            await SDM.runShell(
                'echo 0 > /proc/sys/net/ipv4/tcp_low_latency 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_no_metrics_save 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_tw_reuse 2>/dev/null;' +
                'echo "4096 87380 6291456" > /proc/sys/net/ipv4/tcp_rmem 2>/dev/null;' +
                'echo "4096 16384 4194304" > /proc/sys/net/ipv4/tcp_wmem 2>/dev/null;' +
                'echo 212992 > /proc/sys/net/core/rmem_default 2>/dev/null;' +
                'echo 212992 > /proc/sys/net/core/wmem_default 2>/dev/null;' +
                'echo 212992 > /proc/sys/net/core/rmem_max 2>/dev/null;' +
                'echo 212992 > /proc/sys/net/core/wmem_max 2>/dev/null;' +
                'echo 1 > /proc/sys/net/ipv4/tcp_window_scaling 2>/dev/null;' +
                'echo 1 > /proc/sys/net/ipv4/tcp_moderate_rcvbuf 2>/dev/null;' +
                'echo 1 > /proc/sys/net/ipv4/tcp_adv_win_scale 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_fastopen 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_mtu_probing 2>/dev/null;' +
                'echo 15 > /proc/sys/net/ipv4/tcp_retries2 2>/dev/null;' +
                'echo 1 > /proc/sys/net/ipv4/tcp_slow_start_after_idle 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_no_ssthresh_metrics_save 2>/dev/null;' +
                'echo "cubic" > /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null;' +
                'echo "fq_codel" > /proc/sys/net/core/default_qdisc 2>/dev/null;' +
                'echo 1000 > /proc/sys/net/core/netdev_max_backlog 2>/dev/null;' +
                'echo 300 > /proc/sys/net/core/netdev_budget 2>/dev/null;' +
                'echo 8000 > /proc/sys/net/core/netdev_budget_usecs 2>/dev/null;' +
                'echo 4096 > /proc/sys/net/core/somaxconn 2>/dev/null;' +
                'echo 1024 > /proc/sys/net/ipv4/tcp_max_syn_backlog 2>/dev/null;' +
                'echo "32768 60999" > /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null;' +
                'echo 32768 > /proc/sys/net/ipv4/tcp_max_orphans 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_rfc1337 2>/dev/null;' +
                'echo 0 > /proc/sys/net/ipv4/tcp_ecn 2>/dev/null;' +
                'echo GAME_AUTO_OFF'
            );
            return true;
        } catch(e) { return false; }
    };

    // ════════════════════════════════════════════════════════════
    //  TCP stats & packet loss measurement
    // ════════════════════════════════════════════════════════════
    var readTcpStats = async function() {
        try {
            var res = await SDM.runShell('cat /proc/net/snmp 2>/dev/null');
            var lines = (res.content || '').split('\n');
            var retrans = 0, totalSegs = 0;
            var tcpLines = lines.filter(function(l) { return l.indexOf('Tcp:') === 0; });
            if (tcpLines.length >= 2) {
                var dataParts = tcpLines[1].trim().split(/\s+/);
                if (dataParts.length >= 12) { totalSegs = parseInt(dataParts[3]) || 0; retrans = parseInt(dataParts[6]) || 0; }
            }
            return { retrans: retrans, total: totalSegs };
        } catch(e) { return { retrans: 0, total: 0 }; }
    };

    var calcPacketLossDelta = function(currentStats) {
        if (!currentStats) return 0;
        var deltaRetrans = currentStats.retrans - PREV_RETRANS;
        var deltaTotal = currentStats.total - PREV_TOTAL;
        PREV_RETRANS = currentStats.retrans;
        PREV_TOTAL = currentStats.total;
        if (deltaTotal <= 0) return 0;
        return (deltaRetrans / deltaTotal * 100);
    };

    // ════════════════════════════════════════════════════════════
    //  Latency measurement
    // ════════════════════════════════════════════════════════════
    var readLatency = async function() {
        try {
            var res = await SDM.runShell('timeout 3s ping -c 2 -i 0.3 -W 2 223.5.5.5 2>/dev/null | tail -1');
            var text = res.content || '';
            var m = text.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
            if (m) {
                var lat = parseFloat(m[2]);
                _latencyHistory.push(lat);
                if (_latencyHistory.length > 5) _latencyHistory.shift();
                var sum = 0;
                for (var i = 0; i < _latencyHistory.length; i++) sum += _latencyHistory[i];
                return sum / _latencyHistory.length;
            }
            return 0;
        } catch(e) { return 0; }
    };

    // ════════════════════════════════════════════════════════════
    //  Panel update
    // ════════════════════════════════════════════════════════════
    var updateGameBoostPanel = function() {
        var panelEl = SDM.getCachedEl('#smart_game_boost_panel');
        if (!panelEl) {
            panelEl = document.querySelector('#smart_game_boost_panel');
        }
        if (!panelEl) return;
        var statusEl = document.querySelector('#smart_boost_status');
        var gameEl = document.querySelector('#smart_current_game');
        var durationEl = document.querySelector('#smart_boost_duration');
        var repairEl = document.querySelector('#smart_repair_rate');
        var latencyEl = document.querySelector('#smart_latency_improve');
        var pkgEl = document.querySelector('#smart_boost_pkg');
        if (!GAME_BOOST_ACTIVE) {
            if (statusEl) { statusEl.textContent = '待机中'; statusEl.style.color = '#888'; }
            if (gameEl) gameEl.textContent = '无';
            if (durationEl) durationEl.textContent = '0s';
            if (repairEl) repairEl.textContent = '0%';
            if (latencyEl) latencyEl.textContent = '0ms';
            if (pkgEl) pkgEl.textContent = '-';
            return;
        }
        if (statusEl) { statusEl.textContent = '加速中'; statusEl.style.color = '#4ade80'; }
        if (gameEl) gameEl.textContent = GAME_BOOST_CURRENT || '检测中...';
        if (pkgEl) pkgEl.textContent = GAME_BOOST_PKG || '-';
        if (GAME_BOOST_START_TIME > 0 && durationEl) {
            var elapsed = Math.floor((Date.now() - GAME_BOOST_START_TIME) / 1000);
            var h = Math.floor(elapsed / 3600);
            var m2 = Math.floor((elapsed % 3600) / 60);
            var s = elapsed % 60;
            durationEl.textContent = h > 0 ? h+'h '+m2+'m '+s+'s' : (m2 > 0 ? m2+'m '+s+'s' : s+'s');
        }
        if (repairEl) {
            repairEl.textContent = PACKET_REPAIR_RATE.toFixed(1)+'%';
            repairEl.style.color = PACKET_REPAIR_RATE > 80 ? '#4ade80' : (PACKET_REPAIR_RATE > 50 ? '#fbbf24' : '#ef4444');
        }
        if (latencyEl) {
            latencyEl.textContent = LATENCY_BEFORE > 0 ? LATENCY_BEFORE.toFixed(0)+'→'+LATENCY_AFTER.toFixed(0)+'ms' : LATENCY_AFTER.toFixed(0)+'ms';
            latencyEl.style.color = LATENCY_IMPROVE > 0 ? '#4ade80' : '#fbbf24';
        }
        var lossBeforeEl = document.querySelector('#smart_loss_before');
        if (lossBeforeEl) {
            lossBeforeEl.textContent = PACKET_LOSS_BEFORE > 0 ? PACKET_LOSS_BEFORE.toFixed(2)+'%' : '0%';
        }
    };

    // ════════════════════════════════════════════════════════════
    //  Game monitor loop — detect games, apply boost, measure metrics
    // ════════════════════════════════════════════════════════════
    var gameMonitorLoop = async function() {
        try {
            var detected = await detectGameTraffic();
            var now = Date.now();
            if (detected && detected.isGame) {
                GAME_LAST_SEEN_TIME = now;
                var gameName = detected.name;
                var gameId = detected.pkg;
                if (!GAME_BOOST_ACTIVE) {
                    GAME_BOOST_ACTIVE = true;
                    GAME_BOOST_START_TIME = Date.now();
                    GAME_BOOST_CURRENT = gameName;
                    GAME_BOOST_PKG = gameId;
                    GAME_BOOST_DETECTED_BY = detected.source;
                    // Read baseline stats in parallel
                    var _baseResults = await Promise.all([readTcpStats(), readLatency()]);
                    var baseStats = _baseResults[0];
                    PREV_RETRANS = baseStats.retrans;
                    PREV_TOTAL = baseStats.total;
                    PACKET_LOSS_BEFORE = 0;
                    PACKET_REPAIR_RATE = 0;
                    LATENCY_BEFORE = _baseResults[1];
                    await applyBoostKernelParams();
                    SDM.addLog('检测到游戏: '+gameName+' ['+getDetectSourceLabel(detected.source)+']，自动开启加速');
                    SDM.addDiagLog('游戏: '+gameName+' (来源:'+getDetectSourceLabel(detected.source)+', 标识:'+gameId+')，自动开启加速', 'game');
                    SDM.addDiagLog('丢包基线: r='+baseStats.retrans+' total='+baseStats.total, 'info');
                    SDM.addDiagLog('延迟基线: '+LATENCY_BEFORE+'ms', 'info');
                    SDM.addDiagLog('内核: bbr+fq_codel', 'success');
                    SDM.toast('检测到 '+gameName+'，已自动加速！', 'green', 4000);
                } else if (GAME_BOOST_CURRENT !== gameName) {
                    GAME_BOOST_CURRENT = gameName;
                    GAME_BOOST_PKG = gameId;
                    GAME_BOOST_DETECTED_BY = detected.source;
                    SDM.addLog('游戏切换: '+gameName+' ['+getDetectSourceLabel(detected.source)+']');
                    SDM.addDiagLog('切换: '+gameName+' ['+getDetectSourceLabel(detected.source)+']', 'game');
                    SDM.toast('切换加速: '+gameName, 'pink', 3000);
                }
            } else {
                if (GAME_BOOST_ACTIVE && (now - GAME_LAST_SEEN_TIME) > 5000) {
                    var duration = Math.floor((Date.now() - GAME_BOOST_START_TIME) / 1000);
                    LATENCY_AFTER = await readLatency();
                    if (LATENCY_BEFORE > 0 && LATENCY_AFTER > 0) {
                        LATENCY_IMPROVE = LATENCY_BEFORE - LATENCY_AFTER;
                    }
                    SDM.addLog('游戏结束: '+GAME_BOOST_CURRENT+' 时长:'+duration+'s 丢包修复:'+PACKET_REPAIR_RATE.toFixed(1)+'% 延迟改善:'+LATENCY_IMPROVE.toFixed(0)+'ms');
                    SDM.addDiagLog('结束: '+GAME_BOOST_CURRENT+' 加速'+duration+'s 丢包修复率:'+PACKET_REPAIR_RATE.toFixed(1)+'% 延迟:'+LATENCY_BEFORE.toFixed(0)+'→'+LATENCY_AFTER.toFixed(0)+'ms', 'game');
                    SDM.toast(GAME_BOOST_CURRENT+' 加速结束', '', 3000);
                    GAME_BOOST_ACTIVE = false;
                    GAME_BOOST_START_TIME = 0;
                    GAME_BOOST_CURRENT = '';
                    GAME_BOOST_PKG = '';
                    GAME_BOOST_DETECTED_BY = '';
                    GAME_LAST_SEEN_TIME = 0;
                    PACKET_REPAIR_RATE = 0;
                    LATENCY_IMPROVE = 0;
                    var _restoreOk = await restoreBoostKernelParams();
                    SDM.addDiagLog(_restoreOk ? '游戏结束: 内核网络参数已还原(cubic+默认缓冲区)' : '游戏结束: 内核参数还原失败', _restoreOk ? 'success' : 'warn');
                }
            }
            if (GAME_BOOST_ACTIVE) {
                var _results = await Promise.all([readTcpStats(), readLatency()]);
                var currentStats = _results[0];
                var currentLoss = calcPacketLossDelta(currentStats);
                if (PACKET_LOSS_BEFORE === 0 && currentLoss > 0) {
                    PACKET_LOSS_BEFORE = currentLoss;
                    SDM.addDiagLog('丢包基线='+currentLoss.toFixed(3)+'%', 'warn');
                }
                if (PACKET_LOSS_BEFORE > 0) {
                    PACKET_REPAIR_RATE = Math.max(0, Math.min(100, ((PACKET_LOSS_BEFORE - currentLoss) / PACKET_LOSS_BEFORE * 100)));
                    if (currentLoss > 0 && PACKET_REPAIR_RATE < 50) {
                        SDM.addDiagLog('丢包高: '+currentLoss.toFixed(3)+'% 修复率='+PACKET_REPAIR_RATE.toFixed(1)+'%', 'warn');
                    }
                } else if (currentLoss === 0) {
                    PACKET_REPAIR_RATE = 100;
                } else {
                    PACKET_REPAIR_RATE = Math.max(0, 100 - currentLoss * 5);
                }
                LATENCY_LAST_UPDATE = Date.now();
                LATENCY_AFTER = _results[1];
                if (LATENCY_BEFORE > 0 && LATENCY_AFTER > 0) {
                    LATENCY_IMPROVE = LATENCY_BEFORE - LATENCY_AFTER;
                    SDM.addDiagLog('延迟: '+LATENCY_BEFORE.toFixed(0)+'→'+LATENCY_AFTER.toFixed(0)+'ms ('+(LATENCY_IMPROVE>0?'+':'')+LATENCY_IMPROVE.toFixed(0)+'ms)', 'net');
                }
            }
            updateGameBoostPanel();
        } catch(e) {
            SDM.addDiagLog('监控异常:'+String(e), 'error');
        }
    };

    // ════════════════════════════════════════════════════════════
    //  Panel HTML
    // ════════════════════════════════════════════════════════════
    var panelHtml = '' +
    '<div id="smart_game_boost_panel" class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(255,158,205,.09),rgba(134,239,172,.06),rgba(192,132,252,.08));border:1px solid rgba(255,158,205,.22);">' +
        '<span class="sdm2-deco d1">✨</span><span class="sdm2-deco d2">⭐</span><span class="sdm2-deco d3">💫</span><span class="sdm2-paw">🐾</span>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#86efac,#4ade80,#a7f3d0);display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 2px 14px rgba(134,239,172,.5),0 0 18px rgba(74,222,128,.35);animation:sdm2_pet_dance 3s ease-in-out infinite;">🎮</div>' +
                '<div>' +
                    '<div style="font-size:.7rem;" class="smart-grad-text sdm2-title-glow">游戏自动加速</div>' +
                    '<div style="font-size:.5rem;opacity:.5;">状态: <span id="smart_boost_status">待机中</span> <span class="sdm2-chip-star">🌟</span></div>' +
                '</div>' +
            '</div>' +
            '<span class="sdm2-kawaii-note">🎀 检测到游戏自动开启</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div style="padding:10px;border-radius:12px;background:rgba(134,239,172,.09);text-align:center;border:1px solid rgba(134,239,172,.15);">' +
                '<div style="font-size:.45rem;opacity:.5;">当前游戏</div>' +
                '<div style="font-size:.6rem;font-weight:bold;color:#86efac;" id="smart_current_game">无</div>' +
                '<div style="font-size:.4rem;opacity:.4;" id="smart_boost_pkg">-</div>' +
            '</div>' +
            '<div style="padding:10px;border-radius:12px;background:rgba(192,132,252,.1);text-align:center;border:1px solid rgba(192,132,252,.16);">' +
                '<div style="font-size:.45rem;opacity:.5;">加速时长</div>' +
                '<div style="font-size:.6rem;font-weight:bold;color:#c084fc;" id="smart_boost_duration">0s</div>' +
            '</div>' +
            '<div style="padding:10px;border-radius:12px;background:rgba(253,230,138,.09);text-align:center;border:1px solid rgba(253,230,138,.16);">' +
                '<div style="font-size:.45rem;opacity:.5;">丢包修复率</div>' +
                '<div style="font-size:.6rem;font-weight:bold;color:#fde68a;" id="smart_repair_rate">0%</div>' +
            '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
            '<div style="padding:8px;border-radius:12px;background:rgba(125,211,252,.09);text-align:center;border:1px solid rgba(125,211,252,.16);">' +
                '<div style="font-size:.45rem;opacity:.5;">延迟改善</div>' +
                '<div style="font-size:.55rem;font-weight:bold;color:#7dd3fc;" id="smart_latency_improve">0ms</div>' +
            '</div>' +
            '<div style="padding:8px;border-radius:12px;background:rgba(255,158,205,.1);text-align:center;border:1px solid rgba(255,158,205,.16);">' +
                '<div style="font-size:.45rem;opacity:.5;">丢包基线</div>' +
                '<div style="font-size:.55rem;font-weight:bold;color:#ff9ecd;" id="smart_loss_before">0%</div>' +
            '</div>' +
        '</div>' +
        '<div style="font-size:.4rem;opacity:.45;margin-top:6px;text-align:center;">✨ 打开游戏自动检测并加速，优先游戏流量，实时监控丢包修复率和延迟改善 ✨</div>' +
    '</div>';

    // ════════════════════════════════════════════════════════════
    //  Register panel and auto-start monitoring
    // ════════════════════════════════════════════════════════════
    SDM.registerPanel(MODULE_ID, panelHtml);

    var _init = function() {
        if (_panelReady) return;
        _panelReady = true;

        // Auto-start game monitoring loop (3-second interval)
        GAME_BOOST_ENABLED = true;
        if (!GAME_MONITOR_INTERVAL) {
            gameMonitorLoop();
            GAME_MONITOR_INTERVAL = _ri(function() { gameMonitorLoop(); }, 3000);
        }
        SDM.addDiagLog('游戏加速模块已加载，自动检测已启动', 'success');
        SDM.emit('module:ready', MODULE_ID);
    };

    // Delay init to ensure DOM is ready
    setTimeout(_init, 100);

    // Listen for unload
    SDM.on('module:unload', function(id) {
        if (id === MODULE_ID) {
            GAME_BOOST_ENABLED = false;
            if (GAME_MONITOR_INTERVAL) {
                try { GAME_MONITOR_INTERVAL(); } catch(e) {}
                GAME_MONITOR_INTERVAL = null;
            }
            if (GAME_BOOST_ACTIVE) {
                restoreBoostKernelParams();
                GAME_BOOST_ACTIVE = false;
                GAME_BOOST_START_TIME = 0;
                GAME_BOOST_CURRENT = '';
                GAME_BOOST_PKG = '';
                GAME_BOOST_DETECTED_BY = '';
            }
            var panel = document.getElementById('sdm-panel-' + MODULE_ID);
            if (panel) panel.remove();
            _panelReady = false;
        }
    });

})(window.SDM);
//@@SDM_MODULE_game-booster_END@@
