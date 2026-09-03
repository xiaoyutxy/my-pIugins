// Version: 1.0.0
//@@SDM_MODULE_hotspot-monitor@@
(function(SDM) {
    if (!SDM) return;
    var MODULE_ID = 'hotspot-monitor';

    // ═══════════════════════════════════════════════════════════════════════════
    // 热点流量监控模块（集成自 hotspot_traffic 2.0，已剔除QQ群号与自动更新机制）
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── constants ────────────────────────────────────────────────────────────
    var _PREV_VER = '';
    var NAME = 'hotspot_traffic';
    var MODAL = 'hotspot_traffic_panel';
    var STYLE = 'hotspot_traffic_style';
    var LS_KEY = 'hotspot_traffic_';
    var DATA_DIR = '/data/hotspot_traffic';
    var DATA_FILE = DATA_DIR + '/data.json';
    var DIAG_RESULT_FILE = DATA_DIR + '/diag_result.json';
    var LAST_REPORT_TS_FILE = DATA_DIR + '/_last_report_ts';
    var JQ = '/data/data/com.minikano.f50_sms/files/jq';
    var POLICY_FILE = DATA_DIR + '/device_policy.json';
    var POLICY_TRIGGER = DATA_DIR + '/.policy_trigger';
    var DIAG_LOCK_FILE = DATA_DIR + '/diag.lock';
    var LOG_FILE = '/sdcard/hotspot_traffic_log.log';
    var DIAG_BIN_FILE = '/sdcard/hotspot_diag';
    var TRAFFIC_PROC = '/data/local/tmp/hotspot_traffic';
    var DIAG_PROC = '/data/local/tmp/hotspot_diag';
    var PID_FILE = DATA_DIR + '/.pid';
    var BOOT_SH_FILE = '/sdcard/ufi_tools_boot.sh';
    var BOOT_LINE = 'cp /sdcard/hotspot_traffic ' + TRAFFIC_PROC + ' && chmod 755 ' + TRAFFIC_PROC + ' && nohup ' + TRAFFIC_PROC + ' >/dev/null 2>&1 &';
    var WEBHOOK_FILE = DATA_DIR + '/.webhook';
    var DIAG_COOLDOWN = 1000 * 60 * 5;
    var REPORT_COOLDOWN = 1000 * 60 * 15;
    var CDN_ORIGIN = 'cdn.jsdelivr.net';
    var CDN_MIRRORS = ['cdn.jsdmirror.com','jsd.onmicrosoft.cn'];
    var GH_VERSION_BASE = 'https://' + CDN_ORIGIN + '/gh/qybgh/UFI-TOOLS-assets@refs/heads/main/hotspot_traffic/';
    var CDN_RETRY_PER_NODE = 3;
    var CDN_RETRY_DELAY = 800;
    var _probedBestNode = null;
    var TRAFFIC_BIN_FILE = '/sdcard/hotspot_traffic';
    var PENDING_JS_FILE = '/data/local/tmp/_ht_pending.js';

    var cdnUrlForNode = function(url, node) { return url ? url.replace(CDN_ORIGIN, node) : url; };

    var _dataEvtBound = false;

    // ─── utils ────────────────────────────────────────────────────────────────
    var sq = function(v) { return "'" + String(v == null ? '' : v).replace(/'/g, "'\\''") + "'"; };
    var wait = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
    var esc = function(v) {
        return String(v == null ? '' : v)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    };
    var parseTs = function(ts) { return ts ? new Date(String(ts).replace(' ', 'T')).getTime() : NaN; };
    var run = async function(cmd, timeout) {
        timeout = timeout || 30000;
        try {
            var r = await SDM.runShell(cmd, timeout);
            return r || { success: false, content: '' };
        } catch (e) {
            console.warn('[HT] run error:', e && e.message || e);
            return { success: false, content: '', error: e && e.message || String(e) };
        }
    };

    var CURL_ERR_MAP = { 6:'网络域名解析失败', 7:'无法连接到服务器', 22:'服务器返回错误', 28:'网络连接超时', 35:'网络安全连接失败', 56:'网络连接中断（网络不稳定，可稍后重试）', 92:'HTTP/2帧错误（网络异常）' };
    var curlErrText = function(c) { return CURL_ERR_MAP[parseInt(c)] || ('网络传输异常(码' + c + ')'); };
    var CURL_WK = '--connect-timeout 8 --max-time 60 --speed-limit 1 --speed-time 45';
    var CURL_RESUME_ECS = new Set(['18','28','56','92']);
    var htErr = function(userMsg, detail) { var e = new Error(userMsg); e.htDetail = String(detail == null ? '' : detail); return e; };

    var cdnRetry = async function(fn) {
        var bestNode = await probeBestCdn();
        var candidates = [bestNode].concat(CDN_MIRRORS.filter(function(m) { return m !== bestNode; }), [CDN_ORIGIN]).filter(function(v, i, a) { return a.indexOf(v) === i; });
        var lastErr = null;
        for (var n = 0; n < candidates.length; n++) {
            var node = candidates[n];
            var retries = n === 0 ? CDN_RETRY_PER_NODE : 2;
            for (var r = 0; r < retries; r++) {
                try { return await fn(node, r, r === 0); }
                catch (e) {
                    lastErr = e;
                    if (r < retries - 1) await wait(CDN_RETRY_DELAY * Math.pow(2, r));
                }
            }
        }
        if (lastErr && typeof lastErr === 'object') lastErr.htAttempts = candidates.reduce(function(s, _, i) { return s + (i === 0 ? CDN_RETRY_PER_NODE : 2); }, 0);
        throw lastErr;
    };

    var policySet = async function(mac, type) {
        await run('[ -s ' + sq(POLICY_FILE) + ' ] || printf \'{}\' > ' + sq(POLICY_FILE));
        var r = await run('timeout 2s ' + sq(JQ) + ' -c --arg m ' + sq(mac) + ' --arg t ' + sq(type) + ' \'.[$m]={"type":$t}\' ' + sq(POLICY_FILE) + ' > ' + sq(POLICY_FILE) + '.tmp && mv ' + sq(POLICY_FILE) + '.tmp ' + sq(POLICY_FILE) + ' && printf 1 > ' + sq(POLICY_TRIGGER) + ' && echo __OK__ || { rm -f ' + sq(POLICY_FILE) + '.tmp; echo __FAIL__; }');
        return { success: (r && r.content || '').includes('__OK__'), content: r && r.content };
    };

    var policyRemove = async function(mac) {
        await run('[ -s ' + sq(POLICY_FILE) + ' ] || printf \'{}\' > ' + sq(POLICY_FILE));
        var r = await run('timeout 2s ' + sq(JQ) + ' -c --arg m ' + sq(mac) + ' \'del(.[$m])\' ' + sq(POLICY_FILE) + ' > ' + sq(POLICY_FILE) + '.tmp && mv ' + sq(POLICY_FILE) + '.tmp ' + sq(POLICY_FILE) + ' && printf 1 > ' + sq(POLICY_TRIGGER) + ' && echo __OK__ || { rm -f ' + sq(POLICY_FILE) + '.tmp; echo __FAIL__; }');
        return { success: (r && r.content || '').includes('__OK__'), content: r && r.content };
    };

    var loadPolicyMap = async function() {
        var r = await run('timeout 1s ' + sq(JQ) + ' -r \'to_entries[] | "\\(.key)|\\(.value.type // "normal")"\' ' + sq(POLICY_FILE) + ' 2>/dev/null || echo \'\'', 3000);
        var map = {};
        String(r && r.content || '').trim().split('\n').forEach(function(line) {
            if (!line) return;
            var parts = line.split('|');
            var mac = parts[0], type = parts[1];
            if (mac && type && type !== 'normal') map[mac] = { type: type };
        });
        state.policyMap = map;
    };

    // ─── state ────────────────────────────────────────────────────────────────
    var state = {
        installed: false,
        dataCache: null,
        lastUpdated: '',
        summary: null,
        autoData: false,
        autoDataTimer: null,
        diagStatus: 'idle',
        diagResult: null,
        _installing: false,
        _uninstalling: false,
        _deviceVersion: '',
        _clientIp: '',
        policyMap: {},
        _lastMtimeKey: '',
    };

    var _manifest = null;
    var _lastManifestErr = '';

    var probeBestCdn = async function() {
        if (_probedBestNode) return _probedBestNode;
        var candidates = [CDN_ORIGIN].concat(CDN_MIRRORS);
        var results = [];
        for (var i = 0; i < candidates.length; i++) {
            var node = candidates[i];
            var testUrl = 'https://' + node + '/gh/qybgh/UFI-TOOLS-assets@refs/heads/main/hotspot_traffic/_latest.json?_=' + Date.now();
            var start = Date.now();
            var r = await run('curl -sL --connect-timeout 3 --max-time 5 -w \'%{http_code}\' -o /dev/null ' + sq(testUrl), 8000).catch(function() { return { content: '0' }; });
            var elapsed = Date.now() - start;
            if (String(r && r.content || '').trim() === '200') results.push({ node: node, rtt: elapsed });
        }
        _probedBestNode = results.length > 0
            ? results.sort(function(a, b) { return a.rtt - b.rtt; })[0].node
            : CDN_MIRRORS[0];
        return _probedBestNode;
    };

    var fetchManifestWithProbe = async function(jsonFileName, node, retries) {
        var bestNode = node || await probeBestCdn();
        var url = GH_VERSION_BASE.replace(CDN_ORIGIN, bestNode) + jsonFileName + '?_=' + Date.now();
        var tmp = '/data/local/tmp/_ht_manifest.tmp';
        var maxR = retries || 3;
        var codes = [];
        await run('rm -f ' + sq(tmp), 1000);
        for (var retry = 0; retry < maxR; retry++) {
            var resumeFlag = retry > 0 ? '-C - ' : '';
            var dlR = await run('curl -sL --fail ' + resumeFlag + CURL_WK + ' ' + sq(url) + ' -o ' + sq(tmp) + '; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo "__FAIL__:$ec"', 45000);
            var out = String(dlR && dlR.content || '');
            if (out.includes('__OK__')) {
                var rd = await run('cat ' + sq(tmp), 3000);
                var text = String(rd && rd.content || '').trim();
                await run('rm -f ' + sq(tmp), 1000);
                if (text && text[0] === '{') {
                    try {
                        var j = JSON.parse(text);
                        if (j.rev && j.guard && j.diag && j.deploy && j.js) return j;
                        codes.push('bad_fields');
                    } catch (e2) { codes.push('json_err'); }
                } else { codes.push('not_json'); }
            } else {
                var m = out.match(/__FAIL__:(\d+)/);
                codes.push(m && m[1] || '?');
                if (!CURL_RESUME_ECS.has(m && m[1])) await run('rm -f ' + sq(tmp), 1000);
            }
            if (retry < maxR - 1) await wait(CDN_RETRY_DELAY * Math.pow(2, retry));
        }
        await run('rm -f ' + sq(tmp), 1000);
        _lastManifestErr = bestNode + ':' + jsonFileName + '=[' + codes.join(',') + ']';
        return null;
    };

    var fetchManifestAllNodes = async function(jsonFile) {
        var errs = [];
        var raw = await fetchManifestWithProbe(jsonFile);
        if (raw) return raw;
        errs.push(_lastManifestErr);
        var nodes = [CDN_ORIGIN].concat(CDN_MIRRORS).filter(function(n) { return n !== _probedBestNode; });
        for (var i = 0; i < nodes.length; i++) {
            raw = await fetchManifestWithProbe(jsonFile, nodes[i], 2);
            if (raw) return raw;
            errs.push(_lastManifestErr);
        }
        _lastManifestErr = errs.join(' | ');
        return null;
    };

    var parseManifest = function(j) {
        if (!j || !j.rev || !j.guard || !j.diag || !j.deploy || !j.js) return null;
        return {
            version: j.rev,
            guardUrl: j.guard,
            diagUrl: j.diag,
            deployUrl: j.deploy,
            jsUrl: j.js,
            md5: j.md5 || '',
            notes: j.notes || '',
        };
    };

    var downloadDeployScript = async function(url, progress) {
        var bin = '/data/local/tmp/ht_deploy';
        var b64 = bin + '.b64';
        await cdnRetry(async function(node, retryIdx, isNewNode) {
            if (retryIdx > 0 || node !== _probedBestNode) progress('dl_deploy', 'running', '重试');
            var _url = cdnUrlForNode(url, node);
            if (isNewNode) await run('rm -f ' + sq(b64), 2000);
            var resumeFlag = !isNewNode ? '-C - ' : '';
            var dlR = await run('curl -sL --fail ' + resumeFlag + CURL_WK + ' ' + sq(_url) + ' -o ' + sq(b64) + '; ec=$?; [ "$ec" -eq 0 ] && echo __DL_OK__ || echo "__DL_FAIL__:$ec"', 75000);
            if (!String(dlR && dlR.content || '').includes('__DL_OK__')) {
                var m = String(dlR && dlR.content || '').match(/__DL_FAIL__:(\d+)/);
                if (!CURL_RESUME_ECS.has(m && m[1])) await run('rm -f ' + sq(b64), 2000);
                throw htErr('部署脚本下载失败', curlErrText(m && m[1] || '?'));
            }
            var chk = await run('_i=$(tr -d \'A-Za-z0-9+/=\\n\\r\' < ' + sq(b64) + ' | wc -c); _s=$(wc -c < ' + sq(b64) + '); echo "$_i|$_s"', 5000);
            var parts = String(chk && chk.content || '').trim().split('|');
            var inv = parts[0], sz = parts[1];
            if (parseInt(inv || '1') > 0 || parseInt(sz || '0') < 200) {
                await run('rm -f ' + sq(b64), 2000);
                throw htErr('部署脚本格式异常');
            }
            var dec = await run('base64 -d ' + sq(b64) + ' > ' + sq(bin) + ' && rm -f ' + sq(b64) + ' && echo __OK__', 10000);
            if (!String(dec && dec.content || '').includes('__OK__')) throw htErr('部署脚本解码失败');
        });
        await run('chmod 755 ' + sq(bin));
        return bin;
    };

    // ─── helpers ──────────────────────────────────────────────────────────────
    var getCustomName = function(mac) { return localStorage.getItem(LS_KEY + 'name_' + mac) || ''; };
    var setCustomName = function(mac, name) {
        if (name.trim()) localStorage.setItem(LS_KEY + 'name_' + mac, name.trim());
        else localStorage.removeItem(LS_KEY + 'name_' + mac);
    };
    var htFormatBytes = function(bytes) {
        var num = parseInt(bytes) || 0;
        var sign = num < 0 ? '-' : '';
        var abs = Math.abs(num);
        if (abs >= 1099511627776) return sign + (abs / 1099511627776).toFixed(2) + ' TB';
        if (abs >= 1073741824) return sign + (abs / 1073741824).toFixed(2) + ' GB';
        if (abs >= 1048576) return sign + (abs / 1048576).toFixed(1) + ' MB';
        if (abs >= 1024) return sign + (abs / 1024).toFixed(0) + ' KB';
        return sign + abs + ' B';
    };
    var htFormatRate = function(bps) { return htFormatBytes(bps) + '/s'; };
    var renderTrafficRateCell = function(device, total, tx, rx) {
        return '<span>' + esc(htFormatBytes(total)) + ' <span style="font-size:.48rem;opacity:.7;white-space:nowrap">↑' + esc(htFormatBytes(tx)) + ' ↓' + esc(htFormatBytes(rx)) + '</span></span> <span class="ht-rate-seg" style="font-size:.48rem;opacity:.85;white-space:nowrap"><span class="ht-up">↑' + esc(htFormatRate(device.txRateBps)) + '</span> <span class="ht-down">↓' + esc(htFormatRate(device.rxRateBps)) + '</span></span>';
    };
    var maskMac = function(mac) {
        if (!mac || typeof mac !== 'string') return mac || '';
        var parts = mac.split(':');
        if (parts.length !== 6) return mac;
        return parts[0] + ':' + parts[1] + ':**:**:**:' + parts[5];
    };
    var sortDevices = function(devicesMap) {
        return Object.values(devicesMap || {}).sort(function(a, b) {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            return ((b.rxBytes || 0) + (b.txBytes || 0)) - ((a.rxBytes || 0) + (a.txBytes || 0));
        });
    };

    var calcSummaryMetrics = function(summary, deviceList) {
        var sysDelta = summary.sysDeltaBytes || 0;
        var iptTotal = summary.iptTotalBytes || 0;
        var iptV4 = summary.iptTotalV4Bytes || 0;
        var iptV6 = summary.iptTotalV6Bytes || 0;
        var onlineCount = deviceList.filter(function(d) { return d.online; }).length;
        var deviceCount = summary.deviceCount || 0;
        var deviceTotalBytes = summary.deviceTotalBytes || 0;
        var sysTxDelta = summary.sysDeltaTxBytes || 0;
        var sysRxDelta = summary.sysDeltaRxBytes || 0;
        var diffSigned = sysDelta - iptTotal;
        var diffAbs = Math.abs(diffSigned);
        var unattrSigned = iptTotal - deviceTotalBytes;
        var unattrAbs = Math.abs(unattrSigned);
        var startMs = parseTs(summary.scriptStartAt);
        var runtimeSec = Number.isFinite(startMs) ? Math.max(0, (Date.now() - startMs) / 1000) : 0;
        var isWarmup = runtimeSec < 1800 || sysDelta < 104857600;
        var diffThreshold = Math.max(sysDelta * 0.1, 10485760);
        var unattrThreshold = Math.max(iptTotal * 0.3, 10485760);
        var diffCls = (diffSigned < 0) ? 'ht-status-alert' : isWarmup ? 'ht-status-info' : (diffAbs > diffThreshold ? 'ht-status-warn' : 'ht-status-ok');
        var unattrCls = (unattrSigned < 0) ? 'ht-status-alert' : isWarmup ? 'ht-status-info' : (unattrAbs > unattrThreshold ? 'ht-status-warn' : 'ht-status-ok');
        var deviceTxBytes = deviceList.reduce(function(s, d) { return s + (d.txBytes || 0); }, 0);
        var deviceRxBytes = deviceList.reduce(function(s, d) { return s + (d.rxBytes || 0); }, 0);
        return { sysDelta: sysDelta, iptTotal: iptTotal, iptV4: iptV4, iptV6: iptV6, onlineCount: onlineCount, deviceCount: deviceCount, deviceTotalBytes: deviceTotalBytes, sysTxDelta: sysTxDelta, sysRxDelta: sysRxDelta, diffSigned: diffSigned, unattrSigned: unattrSigned, diffCls: diffCls, unattrCls: unattrCls, deviceTxBytes: deviceTxBytes, deviceRxBytes: deviceRxBytes };
    };

    var renderUlDl = function(tx, rx) {
        return '<div style="font-size:.48rem;opacity:.7;white-space:nowrap"><span class="ht-up">↑' + esc(htFormatBytes(tx)) + '</span> <span class="ht-down">↓' + esc(htFormatBytes(rx)) + '</span></div>';
    };

    var summaryHtmls = function(m) {
        var _pv = Object.values(state.policyMap);
        var blCount = _pv.filter(function(p) { return p.type === 'blacklist'; }).length;
        return [
            '<div class="ht-summary-val">' + esc(htFormatBytes(m.sysDelta)) + '</div>' + (m.sysTxDelta || m.sysRxDelta ? renderUlDl(m.sysTxDelta, m.sysRxDelta) : '') + '<div class="ht-summary-lbl">系统增量</div>',
            '<div class="ht-summary-val">' + esc(htFormatBytes(m.iptTotal)) + ' <span style="font-size:.48rem;opacity:.7">偏差:<span class="' + m.diffCls + '">' + esc(htFormatBytes(m.diffSigned)) + '</span></span></div><div style="font-size:.48rem;opacity:.7;white-space:nowrap">v4:<span class="ht-up">' + esc(htFormatBytes(m.iptV4)) + '</span> v6:<span class="ht-down">' + esc(htFormatBytes(m.iptV6)) + '</span></div><div class="ht-summary-lbl">热点合计</div>',
            '<div class="ht-summary-val">在线 <span class="' + (m.onlineCount > 0 ? 'ht-status-ok' : 'ht-muted') + '">' + m.onlineCount + '</span> / 总 ' + m.deviceCount + '</div>' + (blCount ? '<div style="font-size:.48rem;opacity:.7;white-space:nowrap">拉黑 <span class="ht-status-alert">' + blCount + '</span></div>' : '') + '<div class="ht-summary-lbl">接入设备</div>',
            '<div class="ht-summary-val">' + esc(htFormatBytes(m.deviceTotalBytes)) + ' <span style="font-size:.48rem;opacity:.7">未归属:<span class="' + m.unattrCls + '">' + esc(htFormatBytes(m.unattrSigned)) + '</span></span></div>' + renderUlDl(m.deviceTxBytes, m.deviceRxBytes) + '<div class="ht-summary-lbl">设备合计</div>',
        ];
    };

    var resolveDisplayName = function(device) {
        var customName = getCustomName(device.mac);
        var hostname = (device.hostname || '').trim();
        return customName || hostname || '未知设备';
    };

    // ─── config read/write ────────────────────────────────────────────────────
    var readStatus = async function() {
        var result = await run(
            'echo __BOOT__\n' +
            'timeout 2s awk \'{print}\' ' + sq(BOOT_SH_FILE) + ' 2>/dev/null || true\n' +
            'echo __PROC__\n' +
            '_p=$(timeout 1s awk \'{print}\' ' + sq(PID_FILE) + ' 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && echo running=1 || echo running=0\n' +
            'echo __DATA__\n' +
            'timeout 3s awk \'{print}\' ' + sq(DATA_FILE) + ' 2>/dev/null || true\n' +
            'echo __VER__\n' +
            'timeout 2s awk \'{print}\' ' + sq(DATA_DIR + '/.version') + ' 2>/dev/null || true\n'
        );
        var text = String(result && result.content || '');
        var bootPart = text.includes('__BOOT__') ? text.split('__BOOT__')[1].split('__PROC__')[0] : '';
        var procPart = text.includes('__PROC__') ? text.split('__PROC__')[1].split('__DATA__')[0] : '';
        var dataPart = text.includes('__DATA__') ? text.split('__DATA__')[1].split('__VER__')[0] : '';
        var verPart = text.includes('__VER__') ? text.split('__VER__')[1].trim() : '';
        state._deviceVersion = verPart || '';
        state.installed = bootPart.includes(NAME) && procPart.includes('running=1');
        if (dataPart.trim()) {
            try {
                var parsed = JSON.parse(dataPart.trim());
                if (parsed && parsed.devices && typeof parsed.devices === 'object') {
                    state.dataCache = parsed;
                    state.lastUpdated = parsed.updatedAt || '';
                    state.summary = parsed.summary || null;
                }
            } catch (e) { }
        }
    };

    // ─── install / uninstall ──────────────────────────────────────────────────
    var _recoverTried = false;
    var recoverDaemonOnce = async function() {
        if (_recoverTried || state.installed) return;
        _recoverTried = true;
        var r = await run('grep -q ' + sq(NAME) + ' ' + sq(BOOT_SH_FILE) + ' 2>/dev/null || exit 0; _p=$(timeout 1s awk \'{print}\' ' + sq(PID_FILE) + ' 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && echo __ALIVE__ || echo __DEAD__', 5000);
        if (!String(r && r.content || '').includes('__DEAD__')) return;
        await run('cp /sdcard/hotspot_traffic ' + TRAFFIC_PROC + ' && chmod 755 ' + TRAFFIC_PROC + ' && nohup ' + TRAFFIC_PROC + ' >/dev/null 2>&1 &', 10000);
        await wait(1500);
        await readStatus();
        if (state.installed) SDM.toast('检测到后台服务已停止，已自动恢复', 'green');
    };

    var cleanResidue = async function() {
        try {
            await run(
                '_p=$(awk \'{print}\' ' + sq(PID_FILE) + ' 2>/dev/null)\n' +
                'if [ -n "$_p" ]; then\n' +
                'kill -15 "$_p" 2>/dev/null\n' +
                '_i=0; while kill -0 "$_p" 2>/dev/null && [ "$_i" -lt 15 ]; do sleep 0.1; _i=$((_i+1)); done\n' +
                '_ep=$(awk \'{print}\' ' + sq(DATA_DIR + '/.engine_pid') + ' 2>/dev/null)\n' +
                '[ -n "$_ep" ] && kill -9 "$_ep" 2>/dev/null\n' +
                '_tp=$(awk \'{print}\' ' + sq(DATA_DIR + '/.tcpdump_pid') + ' 2>/dev/null)\n' +
                '[ -n "$_tp" ] && kill -9 "$_tp" 2>/dev/null\n' +
                'kill -9 "$_p" 2>/dev/null\n' +
                'fi\n' +
                'rm -f ' + sq(PID_FILE) + ' ' + sq(DATA_DIR + '/.engine_pid') + ' ' + sq(DATA_DIR + '/.tcpdump_pid') + '\n' +
                'rm -rf ' + sq(DATA_DIR + '/.lock_dir') + '\n' +
                'sed -i \'/' + NAME + '/d\' ' + sq(BOOT_SH_FILE) + ' 2>/dev/null\n' +
                'rm -f /sdcard/hotspot_traffic /sdcard/hotspot_diag ' + sq(LOG_FILE) + ' ' + TRAFFIC_PROC + ' ' + DIAG_PROC + '\n' +
                'rm -rf ' + sq(DATA_DIR) + '\n' +
                'mkdir -p ' + sq(DATA_DIR) + '\n',
                10000);
        } catch (e) { console.error('cleanResidue:', e); }
    };

    var pollDeployHeartbeat = function(progress, timeoutMs) {
        timeoutMs = timeoutMs || 120000;
        return new Promise(function(resolve, reject) {
            var startTs = Date.now();
            var hbFile = DATA_DIR + '/.deploy_heartbeat';
            var readLines = 0, lastBeatTs = Date.now(), hadBeat = false;
            var poll = setInterval(async function() {
                if (Date.now() - startTs > timeoutMs) { clearInterval(poll); reject(htErr('部署超时(' + Math.round((Date.now() - startTs) / 1000) + 's)')); return; }
                if (Date.now() - lastBeatTs > 70000) { clearInterval(poll); reject(htErr('后台无响应(心跳中断' + Math.round((Date.now() - lastBeatTs) / 1000) + 's)')); return; }
                var r = await run('awk -v s=' + readLines + ' \'NR>s\' ' + sq(hbFile) + ' 2>/dev/null', 2000);
                var content = String(r && r.content || '').trim();
                if (!content) {
                    if (hadBeat) {
                        var chk = await run('[ -f ' + sq(hbFile) + ' ] && echo 1', 1000);
                        if (!String(chk && chk.content || '').trim()) {
                            clearInterval(poll); reject(htErr('后台进程异常终止')); return;
                        }
                    }
                    return;
                }
                var lines = content.split('\n');
                readLines += lines.length;
                lastBeatTs = Date.now();
                hadBeat = true;
                for (var li = 0; li < lines.length; li++) {
                    var parts = lines[li].split('|');
                    var step = parts[1], status = parts[2], detail = parts[3] || '';
                    if (['running','done','warn'].includes(status)) progress(step, status, detail);
                    if (status === 'failed') { progress(step, 'failed', detail); clearInterval(poll); var _e = htErr(detail || step); _e.htStep = step; reject(_e); return; }
                    if (step === 'complete' && status === 'done') { clearInterval(poll); resolve(); return; }
                }
            }, 500);
        });
    };

    var executeDeploy = async function(deployBin, manifest, prevVer, progress) {
        await run('rm -f ' + sq(DATA_DIR + '/.deploy_heartbeat'));
        var bestNode = await probeBestCdn();
        var allNodes = [bestNode].concat(CDN_MIRRORS.filter(function(m) { return m !== bestNode; }), [CDN_ORIGIN]).filter(function(v, i, a) { return a.indexOf(v) === i; });
        var mirrors = allNodes.join(' ');
        var cmd = [sq(deployBin), sq(manifest.version),
            sq(manifest.guardUrl), sq(manifest.diagUrl),
            sq(manifest.jsUrl), sq(manifest.md5),
            sq(prevVer), sq(mirrors)].join(' ');
        var proc = run(cmd, 120000);
        await pollDeployHeartbeat(progress);
        await proc;
        await run('rm -f ' + sq(deployBin));
    };

    // ─── 启用/更新进度弹窗 ───
    var DEPLOY_STEPS = [
        { id: 'env',        label: '检查设备环境' },
        { id: 'manifest',   label: '获取版本信息' },
        { id: 'dl_deploy',  label: '下载部署脚本' },
        { id: 'dl_guard',   label: '下载监控组件' },
        { id: 'dl_diag',    label: '下载诊断组件' },
        { id: 'dl_js',      label: '下载界面组件' },
        { id: 'prepare_js', label: '准备界面更新' },
        { id: 'deploy',     label: '部署文件' },
        { id: 'restart',    label: '切换服务' },
        { id: 'complete',   label: '完成' },
    ];
    var VERIFY_STEP = { id: 'verify', label: '校验完整性' };

    var showFlowProgress = function(title, steps, failPrefix) {
        failPrefix = failPrefix || '启用失败';
        document.querySelector('#ht_flow_progress') && document.querySelector('#ht_flow_progress').remove();
        var st = {};
        var stHint = {};
        steps.forEach(function(s) { st[s.id] = 'pending'; stHint[s.id] = ''; });
        var failInfo = null;
        var finished = false;
        var ICONS = {
            pending: '<span style="color:#94a3b8;flex-shrink:0">○</span>',
            running: '<span style="flex-shrink:0;display:inline-block;animation:ht_spin 1s linear infinite">⏳</span>',
            done: '<span style="color:#86efac;flex-shrink:0">✓</span>',
            warn: '<span style="color:#fbbf24;flex-shrink:0">!</span>',
            failed: '<span style="color:#f87171;flex-shrink:0">✗</span>',
        };
        var renderBody = function() {
            var doneN = steps.filter(function(s) { return st[s.id] === 'done'; }).length;
            var pct = finished ? 100 : Math.round(doneN / steps.length * 100);
            var rows = steps.map(function(s) {
                return '<div style="display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:5px;font-size:.62rem;line-height:1.5;' + (st[s.id] === 'running' ? 'background:rgba(59,130,246,.15);' : '') + '">' + (ICONS[st[s.id]] || ICONS.pending) + '<span>' + esc(s.label) + (stHint[s.id] ? ' <span style="opacity:.6;font-size:.56rem">(' + esc(stHint[s.id]) + ')</span>' : '') + '</span></div>';
            }).join('');
            var failHtml = '';
            if (failInfo) {
                failHtml = '<div style="margin-top:8px;color:#f87171;font-size:.62rem;line-height:1.6">' + esc(failPrefix) + '：' + esc(failInfo.userMsg) + '</div>' +
                    '<div style="margin-top:6px"><button id="ht_flow_detail_btn" style="font-size:.58rem">查看详细信息</button></div>' +
                    '<div id="ht_flow_detail" style="display:none;margin-top:6px;font-family:monospace;font-size:.52rem;max-height:22vh;overflow-y:auto;word-break:break-all;background:rgba(0,0,0,.3);border-radius:6px;padding:8px">' + failInfo.detailHtml + '</div>' +
                    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button id="ht_flow_retry" style="font-size:.62rem;padding:5px 14px;border-radius:7px;border:1px solid rgba(34,197,94,.4);background:rgba(34,197,94,.25);color:#86efac;cursor:pointer;">重试</button><button id="ht_flow_close" style="font-size:.62rem;padding:5px 14px;border-radius:7px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:inherit;cursor:pointer;">关闭</button></div>';
            }
            return '<div class="title" style="margin:0;display:flex;align-items:center;justify-content:space-between">' + esc(title) + '</div>' +
                '<div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:8px 0;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#4ade80;border-radius:2px;transition:width .3s"></div></div>' +
                '<div>' + rows + '</div>' + failHtml;
        };
        var fixedResult = createFixedToast('ht_flow_progress', '<div id="ht_flow_box" style="pointer-events:all;width:88vw;max-width:380px"></div>');
        var el = fixedResult.el, close = fixedResult.close;
        var box = el.querySelector('#ht_flow_box');
        var redraw = function() {
            box.innerHTML = renderBody();
            var db = box.querySelector('#ht_flow_detail_btn');
            if (db) db.onclick = function() { var d = box.querySelector('#ht_flow_detail'); if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none'; };
            var rb = box.querySelector('#ht_flow_retry');
            if (rb) rb.onclick = function() { close(); if (typeof failInfo && failInfo.onRetry === 'function') failInfo.onRetry(); };
            var cb = box.querySelector('#ht_flow_close');
            if (cb) cb.onclick = function() { close(); };
        };
        redraw();
        return {
            setStep: function(id, status, hint) { if (st[id] !== undefined) { st[id] = status; stHint[id] = hint || ''; redraw(); } },
            addStep: function(afterId, stepDef) { var idx = steps.findIndex(function(s) { return s.id === afterId; }); if (idx === -1) return; steps.splice(idx + 1, 0, stepDef); st[stepDef.id] = 'pending'; stHint[stepDef.id] = ''; redraw(); },
            fail: function(id, userMsg, detail, onRetry) {
                if (st[id] !== undefined) st[id] = 'failed';
                var detailHtml = esc(new Date().toLocaleString() + ' | 插件版本: ' + (_PREV_VER || '初装') + '→' + ((_manifest && _manifest.version) || '?') + ' | 阶段: ' + id + ' | 详情: ' + (detail || '(无)') + ' | UA: ' + (navigator.userAgent || '').slice(0, 80) + ((navigator.userAgent || '').length > 80 ? '…' : ''));
                failInfo = { userMsg: userMsg, detailHtml: detailHtml, onRetry: onRetry };
                redraw();
            },
            done: function() {
                steps.forEach(function(s) { if (st[s.id] !== 'warn') st[s.id] = 'done'; });
                finished = true; failInfo = null; redraw();
                setTimeout(close, 800);
            },
            close: close,
        };
    };

    var install = async function() {
        if (state._installing) return SDM.toast('正在启用中，请稍候', 'yellow');
        if (!(await checkAdvancedFunc())) return SDM.toast('没有开启高级功能，无法使用！', 'red');
        state._installing = true;
        var flow = showFlowProgress('启用热点流量监控', DEPLOY_STEPS);
        var curStep = 'env';
        var at = function(id) { curStep = id; flow.setStep(id, 'running'); };
        var ok = function(id) { flow.setStep(id, 'done'); };
        try {
            at('env');
            var probeR = await run('iptables -w 5 -L FORWARD -n 2>&1 && echo __OK__', 8000);
            if (!String(probeR && probeR.content || '').includes('__OK__'))
                throw htErr('设备网络组件检查未通过', String(probeR && probeR.content || '').trim().slice(0, 200));
            ok('env');

            at('manifest');
            var rawManifest = await fetchManifestAllNodes(
                _PREV_VER ? 'v' + _PREV_VER + '.json' : 'latest.json'
            );
            if (!rawManifest && _PREV_VER) {
                flow.setStep('manifest', 'running', '兜底源');
                rawManifest = await fetchManifestAllNodes('latest.json');
            }
            if (!rawManifest) throw htErr('无法获取版本信息，请检查网络后重试', _lastManifestErr);
            _manifest = parseManifest(rawManifest);
            if (!_manifest) throw htErr('版本信息格式异常');
            ok('manifest');
            if (_manifest.md5) flow.addStep('dl_js', VERIFY_STEP);

            await cleanResidue();
            await run('mkdir -p ' + sq(DATA_DIR));

            at('dl_deploy');
            var deployBin = await downloadDeployScript(
                _manifest.deployUrl,
                function(id, st, hint) { flow.setStep(id, st, hint); }
            );
            ok('dl_deploy');

            curStep = 'deploy';
            await executeDeploy(deployBin, _manifest, _PREV_VER || '', function(step, status, detail) {
                flow.setStep(step, status, detail);
            });

            await run('grep -qxF ' + sq(BOOT_LINE) + ' ' + sq(BOOT_SH_FILE) + ' || echo ' + sq(BOOT_LINE) + ' >> ' + sq(BOOT_SH_FILE));

            state.installed = true;
            state._deviceVersion = _manifest.version;
            flow.done();
            SDM.toast('已启用 v' + _manifest.version + '，2秒后刷新', 'green');
            setTimeout(function() { location.reload(); }, 2000);
        } catch (e) {
            flow.fail(e && e.htStep || curStep, e && e.message || String(e), (e && e.htDetail || '') + (e && e.htAttempts ? ' | 已重试' + e.htAttempts + '次' : ''), startInstallFlow);
        } finally { state._installing = false; }
    };

    var startInstallFlow = async function() {
        await install();
        if (state.installed) await loadData();
        renderIntoPanel();
        if (state.installed) setAutoData(true);
    };

    var uninstall = async function() {
        if (state._uninstalling) return SDM.toast('正在卸载中，请稍候', 'yellow');
        if (!(await checkAdvancedFunc())) return SDM.toast('没有开启高级功能，无法使用！', 'red');
        state._uninstalling = true;
        setAutoData(false);
        _dataEvtBound = false;
        try {
            await run(
                'sed -i \'/' + NAME + '/d\' ' + sq(BOOT_SH_FILE) + ' 2>/dev/null\n' +
                '_p=$(awk \'{print}\' ' + sq(PID_FILE) + ' 2>/dev/null)\n' +
                'if [ -n "$_p" ]; then\n' +
                'kill -15 "$_p" 2>/dev/null\n' +
                '_i=0; while kill -0 "$_p" 2>/dev/null && [ "$_i" -lt 15 ]; do sleep 0.1; _i=$((_i+1)); done\n' +
                '_ep=$(awk \'{print}\' ' + sq(DATA_DIR + '/.engine_pid') + ' 2>/dev/null)\n' +
                '[ -n "$_ep" ] && kill -9 "$_ep" 2>/dev/null\n' +
                '_tp=$(awk \'{print}\' ' + sq(DATA_DIR + '/.tcpdump_pid') + ' 2>/dev/null)\n' +
                '[ -n "$_tp" ] && kill -9 "$_tp" 2>/dev/null\n' +
                'kill -9 "$_p" 2>/dev/null\n' +
                'fi\n' +
                'rm -f ' + sq(PID_FILE) + ' ' + sq(DATA_DIR + '/.engine_pid') + ' ' + sq(DATA_DIR + '/.tcpdump_pid') + '\n' +
                'rm -rf ' + sq(DATA_DIR + '/.lock_dir') + '\n' +
                'rm -f ' + sq(TRAFFIC_BIN_FILE) + ' ' + sq(DIAG_BIN_FILE) + ' ' + sq(LOG_FILE) + ' ' + TRAFFIC_PROC + ' ' + DIAG_PROC + ' ' + sq(WEBHOOK_FILE) + ' ' + sq(TRAFFIC_BIN_FILE + '.b64') + ' ' + sq(DIAG_BIN_FILE + '.b64') + ' ' + sq(PENDING_JS_FILE) + '\n' +
                'rm -rf ' + sq(DATA_DIR) + '\n',
                10000);
            state.installed = false; state.dataCache = null; state.lastUpdated = ''; state.summary = null;
            clearDiagState();
            SDM.toast('热点流量监控已停用');
        } catch (e) {
            SDM.toast('停用失败：' + (e && e.message ? e.message : String(e)), 'red');
        }
        state._uninstalling = false;
    };

    var showUninstallConfirm = function() {
        var existing = document.querySelector('#ht_uninstall_confirm');
        if (existing) existing.remove();
        var clicks = 0;
        var fixedResult = createFixedToast('ht_uninstall_confirm',
            '<div style="pointer-events:all;width:80vw;max-width:300px">' +
            '<div class="title" style="margin:0;display:flex;align-items:center;justify-content:space-between">停用插件</div>' +
            '<div style="margin:10px 0;font-size:.64rem;line-height:1.6">停用后，流量统计数据将被清除，且无法找回。是否继续？</div>' +
            '<div style="display:flex;gap:6px;justify-content:flex-end"><button style="font-size:.62rem" id="ht_uninstall_confirm_confirm">确认</button><button style="font-size:.62rem" id="ht_uninstall_confirm_close">取消</button></div>' +
            '</div>');
        var el = fixedResult.el, close = fixedResult.close;
        var onConfirm = async function() {
            clicks++;
            if (clicks < 3) {
                var remain = 3 - clicks;
                var btn = el.querySelector('#ht_uninstall_confirm_confirm');
                if (btn) btn.textContent = '确认(再点' + remain + '次)';
                SDM.toast('再点 ' + remain + ' 次即可停用', 'pink', 1500);
                return false;
            }
            var btn2 = el.querySelector('#ht_uninstall_confirm_confirm');
            if (btn2) btn2.disabled = true;
            close();
            var loadingResult = createFixedToast('ht_uninstall_loading', '正在停用...');
            var closeLoading = loadingResult.close;
            try {
                await uninstall();
                renderIntoPanel();
            } finally { closeLoading(); }
            return false;
        };
        el.querySelector('#ht_uninstall_confirm_confirm').onclick = async function() { if (await onConfirm()) close(); };
        el.querySelector('#ht_uninstall_confirm_close').onclick = function() { close(); };
    };

    // ─── data ─────────────────────────────────────────────────────────────────
    var loadData = async function(preloaded) {
        if (preloaded && preloaded.devices && typeof preloaded.devices === 'object') {
            state.dataCache = preloaded;
            state.lastUpdated = preloaded.updatedAt || '';
            state.summary = preloaded.summary || null;
            SDM.emit('hotspot:data', preloaded);
            return;
        }
        try {
            var result = await run('[ -f ' + sq(DATA_FILE) + ' ] && timeout 3s awk \'{print}\' ' + sq(DATA_FILE) + ' 2>/dev/null || echo \'{}\'', 5000);
            var raw = String(result && result.content != null ? result.content : '').trim();
            if (!raw || !raw.startsWith('{')) return;

            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.devices !== 'object' || !parsed.summary) {
                console.warn('[HT] data.json 结构不完整，跳过本轮');
                return;
            }
            state.dataCache = parsed;
            state.lastUpdated = parsed.updatedAt || '';
            state.summary = parsed.summary || null;

            // Emit hotspot data for other modules to use
            SDM.emit('hotspot:data', parsed);

            if (!state._clientIp) {
                try {
                    var ufi = null;
                    if (typeof getUFIData === 'function') {
                        ufi = await getUFIData();
                    } else if (typeof SDM.getUFIData === 'function') {
                        ufi = await SDM.getUFIData();
                    }
                    if (ufi && ufi.client_ip) state._clientIp = ufi.client_ip;
                } catch (e) {}
            }
        } catch (e) { console.warn('[HT] loadData:', e); }
    };

    var dataLoading = false;
    var refreshDataArea = async function(preloaded) {
        var area = document.querySelector('#' + MODAL + ' #ht_data_area');
        if (!area) return;
        if (area.querySelector('[data-ht]')) {
            await patchDataArea(preloaded);
            return;
        }
        if (dataLoading) return;
        dataLoading = true;
        try {
            await loadData(preloaded);
            area.innerHTML = renderDataArea();
            initDataDelegate();
        } finally { dataLoading = false; }
    };

    var patchDataArea = async function(preloaded) {
        if (dataLoading) return;
        dataLoading = true;
        try {
            await loadData(preloaded);
            var el = document.querySelector('#' + MODAL + ' #ht_data_area');
            if (!el || !state.dataCache) return;

            var devicesMap = state.dataCache.devices || {};
            var deviceList = sortDevices(devicesMap);
            var summary = state.summary;

            if (summary) {
                var m = calcSummaryMetrics(summary, deviceList);
                summaryHtmls(m).forEach(function(html, i) {
                    var n = el.querySelector('[data-ht="si_' + i + '"]');
                    if (n && n.innerHTML !== html) n.innerHTML = html;
                });
            }

            var tbody = el.querySelector('tbody');
            if (!tbody) {
                if (deviceList.length > 0) { el.innerHTML = renderDataArea(); initDataDelegate(); }
                return;
            }

            if (tbody.querySelector('tr') && (!tbody.querySelector('[data-ht="tf"]') || !tbody.querySelector('td:nth-child(2) > [data-edit-mac]') || !tbody.querySelector('td:nth-child(4)'))) {
                tbody.innerHTML = deviceList.map(function(d, i) { return renderDeviceRow(d, i); }).join('');
            }

            var domMacs = [];
            tbody.querySelectorAll('tr[data-mac]').forEach(function(tr) { domMacs.push(tr.dataset.mac); });
            var newMacs = deviceList.map(function(d) { return d.mac; });
            var orderChanged = domMacs.length !== newMacs.length || domMacs.some(function(m, i) { return m !== newMacs[i]; });

            if (orderChanged) {
                tbody.innerHTML = deviceList.map(function(d, i) { return renderDeviceRow(d, i); }).join('');
            } else {
                deviceList.forEach(function(device, index) {
                    var tr = tbody.querySelector('tr[data-mac="' + esc(device.mac) + '"]');
                    if (!tr) return;
                    var displayName = resolveDisplayName(device);
                    var txBytes = device.txBytes || 0;
                    var rxBytes = device.rxBytes || 0;
                    var totalBytes = txBytes + rxBytes;
                    var p = function(attr, val) { var n = tr.querySelector('[data-ht="' + attr + '"]'); if (n && n.textContent !== val) n.textContent = val; };
                    p('idx', String(index + 1));
                    var isMe = device.ip && device.ip === state._clientIp;
                    var meTag = isMe ? '<span style="color:#999;font-size:.55rem"> (我)</span>' : '';
                    var nameHtml = esc(displayName) + meTag;
                    var nameEl = tr.querySelector('[data-ht="name"]');
                    if (nameEl && nameEl.innerHTML !== nameHtml) nameEl.innerHTML = nameHtml;
                    p('ip', device.ip || '');
                    var tfEl = tr.querySelector('[data-ht="tf"]');
                    var tfHtml = renderTrafficRateCell(device, totalBytes, txBytes, rxBytes);
                    if (tfEl && tfEl.innerHTML !== tfHtml) tfEl.innerHTML = tfHtml;
                    var polEl = tr.querySelector('[data-ht="pol"]');
                    if (polEl) {
                        var pol = state.policyMap[device.mac];
                        var wantBg = pol && pol.type === 'blacklist' ? '#f87171' : '';
                        if (polEl.style.background !== wantBg) {
                            polEl.style.display = pol ? 'inline-block' : 'none';
                            polEl.style.background = wantBg;
                        }
                    }
                    var dot = tr.querySelector('[data-ht="dot"]');
                    if (dot) { var cls = device.online ? 'ht-dot ht-dot-green' : 'ht-dot ht-dot-gray'; if (dot.className !== cls) dot.className = cls; }
                });
            }

            var updatedShort = state.lastUpdated ? state.lastUpdated.slice(11, 19) : '';
            var dateEl = el.querySelector('[data-ht="sum_date"]');
            if (dateEl) { var txt = updatedShort ? '（更新时间 ' + updatedShort + '）' : ''; if (dateEl.textContent !== txt) dateEl.textContent = txt; }

        } finally { dataLoading = false; }
    };

    // ─── log popup ────────────────────────────────────────────────────────────
    var copyToClipboard = async function(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text); return true;
            }
        } catch (e) {}
        try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e2) { return false; }
    };

    var showLogPopup = async function() {
        var fetchLog = async function() {
            var r = await run('[ -f ' + sq(LOG_FILE) + ' ] && timeout 2s tail -80 ' + sq(LOG_FILE) + ' || echo "(暂无日志)"', 5000);
            return String(r && r.content != null ? r.content : '').trim();
        };
        var logText = await fetchLog();
        var fixedResult = createFixedToast('ht_log_toast', '<div style="pointer-events:all;width:90vw;max-width:420px"><div class="title" style="margin:0 0 6px;display:flex;align-items:center;justify-content:space-between">运行日志</div><textarea id="ht_log_area" readonly style="width:100%;height:40vh;font-size:.56rem;line-height:1.5;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:6px;color:inherit;resize:none;"></textarea><div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px"><button id="ht_log_refresh" style="font-size:.6rem">刷新</button><button id="ht_log_copy" style="font-size:.6rem">复制</button><button id="ht_log_close" style="font-size:.6rem">关闭</button></div></div>');
        var toastEl = fixedResult.el, close = fixedResult.close;
        var area = toastEl.querySelector('#ht_log_area');
        area.value = logText; area.scrollTop = area.scrollHeight;
        toastEl.querySelector('#ht_log_refresh').onclick = async function() { area.value = await fetchLog(); area.scrollTop = area.scrollHeight; };
        toastEl.querySelector('#ht_log_copy').onclick = async function() { await copyToClipboard(area.value); SDM.toast('日志已复制', 'green'); };
        toastEl.querySelector('#ht_log_close').onclick = function() { close(); };
    };

    // ─── auto data ────────────────────────────────────────────────────────────
    var stopAutoData = function() { if (state.autoDataTimer) clearInterval(state.autoDataTimer); state.autoDataTimer = null; };
    var setAutoData = function(enabled) {
        state.autoData = Boolean(enabled && state.installed);
        stopAutoData();
        if (state.autoData) {
            state.autoDataTimer = setInterval(async function() {
                var collapseEl = document.querySelector('#collapse_ht');
                if (!collapseEl || collapseEl.dataset.name !== 'open' || !state.installed || !state.autoData) { setAutoData(false); return; }
                var r = await run('_mt=$(stat -c %Y ' + sq(DATA_FILE) + ' 2>/dev/null || echo 0)\necho "$_mt"\nif [ "$_mt" != ' + sq(state._lastMtimeKey || '0') + ' ]; then timeout 2s awk \'{print}\' ' + sq(DATA_FILE) + ' 2>/dev/null; fi', 5000);
                var raw = String(r && r.content || '');
                var nl = raw.indexOf('\n');
                var mtKey = (nl >= 0 ? raw.slice(0, nl) : raw).trim();
                var body = nl >= 0 ? raw.slice(nl + 1).trim() : '';
                if (mtKey === state._lastMtimeKey && state.dataCache) return;
                state._lastMtimeKey = mtKey;
                if (body) {
                    try { refreshDataArea(JSON.parse(body)); return; } catch (e) { console.warn('[HT] poll parse:', e); }
                }
                refreshDataArea();
            }, 5000);
        }
    };

    // ─── style ────────────────────────────────────────────────────────────────
    var ensureStyle = function() {
        var s = document.getElementById(STYLE);
        if (!s) {
            s = document.createElement('style');
            s.id = STYLE;
            document.head.appendChild(s);
        }
        s.textContent = '\
      #' + MODAL + ' .ht-wrap{display:flex;flex-direction:column;gap:2px;font-size:.72rem;}\
      #' + MODAL + ' .ht-card{border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));border-radius:12px;padding:8px 10px;}\
      #' + MODAL + ' .ht-wrap>.ht-card:first-child{padding-top:6px;padding-bottom:6px;}\
      #' + MODAL + ' #ht_data_area{display:flex;flex-direction:column;gap:2px;}\
      #' + MODAL + ' .ht-row{display:flex;align-items:center;gap:5px;}\
      #' + MODAL + ' .ht-btn{border-radius:7px;padding:5px 10px;font-size:.64rem;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:inherit;transition:background .15s,opacity .15s;}\
      #' + MODAL + ' .ht-btn:hover{background:rgba(255,255,255,.14);}\
      #' + MODAL + ' .ht-btn:disabled{opacity:.35;cursor:not-allowed;}\
      #' + MODAL + ' .ht-btn-success{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.35);color:#86efac;}\
      #' + MODAL + ' .ht-btn-stop{background:rgba(249,115,22,.22);border-color:rgba(249,115,22,.35);color:#fdba74;}\
      #' + MODAL + ' .ht-btn-ghost{background:transparent;border-color:rgba(255,255,255,.12);opacity:.8;}\
      #' + MODAL + ' .ht-btn-ghost:hover{opacity:1;background:rgba(255,255,255,.06);}\
      #' + MODAL + ' .ht-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:3px;vertical-align:middle;}\
      #' + MODAL + ' .ht-dot-green{background:#4ade80;box-shadow:0 0 4px rgba(74,222,128,.5);}\
      #' + MODAL + ' .ht-dot-gray{background:rgba(255,255,255,.25);}\
      #' + MODAL + ' .ht-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}\
      #' + MODAL + ' .ht-tbl{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.62rem;}\
      #' + MODAL + ' .ht-tbl th{font-size:.54rem;opacity:.45;font-weight:500;text-align:left;padding:3px 2px;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap;}\
      #' + MODAL + ' .ht-tbl td{padding:1px 2px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;}\
      #' + MODAL + ' .ht-tbl th:first-child,#' + MODAL + ' .ht-tbl td:first-child{padding-left:0;}\
      #' + MODAL + ' .ht-tbl th:last-child,#' + MODAL + ' .ht-tbl td:last-child{padding-right:0;}\
      #' + MODAL + ' .ht-tbl tr:last-child td{border-bottom:none;}\
      #' + MODAL + ' .ht-tbl .ht-td-name{font-weight:600;display:flex;align-items:center;gap:3px;line-height:1.2;}\
      #' + MODAL + ' .ht-tbl .ht-td-meta{font-size:.52rem;opacity:.4;line-height:1.3;word-break:break-all;margin-top:1px;}\
      #' + MODAL + ' .ht-tbl .ht-td-num{font-weight:600;white-space:nowrap;font-size:.6rem;font-variant-numeric:tabular-nums;}\
      #' + MODAL + ' .ht-rate-seg{display:inline;}\
      #' + MODAL + ' .ht-mac{cursor:pointer;border-bottom:1px dashed rgba(255,255,255,.2);}\
      #' + MODAL + ' .ht-mac:hover{opacity:.85;}\
      #' + MODAL + ' .ht-edit-mini{background:rgba(102,126,234,.15);border:none;cursor:pointer;opacity:1;font-size:.6rem;padding:4px 4.5px;color:#a5b4fc;line-height:1;flex-shrink:0;border-radius:4px;transition:background .15s,color .15s;}\
      #' + MODAL + ' .ht-edit-mini:hover{background:rgba(102,126,234,.3);color:#fff;}\
      #' + MODAL + ' .ht-up{color:#67e8f9;}\
      #' + MODAL + ' .ht-down{color:#86efac;}\
      #' + MODAL + ' .ht-total{color:rgba(255,255,255,.7);}\
      #' + MODAL + ' .ht-summary-item .ht-up,#' + MODAL + ' .ht-summary-item .ht-down{color:inherit;}\
      #' + MODAL + ' .ht-muted{color:rgba(255,255,255,.35);}\
      #' + MODAL + ' .ht-status-ok{color:#86efac;}\
      #' + MODAL + ' .ht-status-warn{color:#fdba74;}\
      #' + MODAL + ' .ht-status-alert{color:#fca5a5;}\
      #' + MODAL + ' .ht-status-info{color:#9ca3af;}\
      #' + MODAL + ' .ht-empty{padding:10px;border:1px dashed rgba(255,255,255,.12);border-radius:9px;opacity:.55;text-align:center;font-size:.6rem;}\
      @keyframes ht_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}\
      #' + MODAL + ' .ht-updated{font-size:.52rem;opacity:.35;margin-left:auto;}\
      #' + MODAL + ' .ht-date{font-size:.56rem;opacity:.5;margin-left:6px;color:#93c5fd;}\
      #' + MODAL + ' .ht-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}\
      #' + MODAL + ' .ht-summary-item{background:rgba(0,0,0,.12);border-radius:8px;padding:6px 8px;}\
      #' + MODAL + ' .ht-summary-val{font-size:.76rem;font-weight:700;margin-bottom:1px;line-height:1.15;}\
      #' + MODAL + ' .ht-summary-lbl{font-size:.52rem;opacity:.45;line-height:1.25;}\
      #' + MODAL + ' .ht-diag-item{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.58rem;line-height:1.35;word-break:break-all;}\
      @media(max-width:570px){#' + MODAL + ' .ht-summary-grid{grid-template-columns:repeat(2,1fr);}}\
      @media(max-width:380px){#' + MODAL + ' .ht-wrap{font-size:.66rem;gap:2px;} #' + MODAL + ' .ht-card{padding:7px 9px;} #' + MODAL + ' .ht-summary-val{font-size:.7rem;} #' + MODAL + ' .ht-tbl{font-size:.58rem;} #' + MODAL + ' .ht-btn{padding:4px 8px;font-size:.6rem;}}\
      @media(max-width:480px){#' + MODAL + ' .ht-rate-seg{display:block;margin-top:1px;} #' + MODAL + ' .ht-tbl td.ht-total{white-space:normal;}}\
    ';
    };

    // ─── render ───────────────────────────────────────────────────────────────
    var renderDeviceRow = function(device, index) {
        var displayName = resolveDisplayName(device);
        var txBytes = device.txBytes || 0;
        var rxBytes = device.rxBytes || 0;
        var totalBytes = txBytes + rxBytes;
        var safeMac = esc(device.mac || '');
        var online = device.online;
        var dotCls = online ? 'ht-dot-green' : 'ht-dot-gray';
        var isMe = device.ip && device.ip === state._clientIp;
        var meTag = isMe ? '<span style="color:#999;font-size:.55rem"> (我)</span>' : '';
        var pol = state.policyMap[device.mac];
        var polBg = pol && pol.type === 'blacklist' ? '#f87171' : '';
        var polDot = '<span data-ht="pol" style="display:' + (pol ? 'inline-block' : 'none') + ';width:6px;height:6px;border-radius:50%;margin-right:3px;vertical-align:middle;opacity:.7' + (polBg ? ';background:' + polBg : '') + '"></span>';
        return '<tr data-mac="' + safeMac + '">\
        <td style="opacity:.4;font-size:.54rem;width:10px;text-align:center;" data-ht="idx">' + (index + 1) + '</td>\
        <td><button class="ht-edit-mini" data-edit-mac="' + safeMac + '" title="自定义名称">✎</button></td>\
        <td>\
          <div class="ht-td-name">\
            <span class="ht-dot ' + dotCls + '" data-ht="dot"></span>\
            ' + polDot + '<span data-ht="name">' + esc(displayName) + meTag + '</span>\
          </div>\
          <div class="ht-td-meta"><span data-ht="ip">' + esc(device.ip || '') + '</span> | <span class="ht-mac" data-full-mac="' + safeMac + '" data-masked="1" title="点击查看完整 MAC">' + esc(maskMac(device.mac || '')) + '</span></div>\
        </td>\
        <td class="ht-td-num ht-total" data-ht="tf">' + renderTrafficRateCell(device, totalBytes, txBytes, rxBytes) + '</td>\
      </tr>';
    };

    var showDeviceModal = async function(mac, displayName, ip) {
        var _r = await run('timeout 1s ' + sq(JQ) + ' -r --arg m ' + sq(mac) + ' \'.[$m] // {"type":"normal"}\' ' + sq(POLICY_FILE) + ' 2>/dev/null || echo \'{"type":"normal"}\'');
        var curPolicy = { type: 'normal' };
        try { curPolicy = JSON.parse((_r && _r.content || '').trim()); } catch (e) { console.warn('[HT] parse policy json failed:', e, _r && _r.content); }
        var curPol = curPolicy.type || 'normal';
        var customName = getCustomName(mac) || '';
        var masked = maskMac(mac);
        var content = '\
      <div style="font-size:.72rem;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">\
        <b style="color:#e2e8f0">' + esc(displayName || '未知设备') + '</b>\
        <span>' + esc(ip || '') + '</span>\
        <span class="ht-mac-toggle" style="cursor:pointer;color:#64748b;border-bottom:1px dashed #475569" data-masked="' + esc(masked) + '" data-full="' + esc(mac) + '">' + esc(masked) + '</span>\
      </div>\
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">\
        <input type="text" id="ht_dev_name" value="' + esc(customName) + '" placeholder="' + esc(displayName) + '" style="flex:1;padding:6px 10px;background:#1e2030;border:1px solid #334155;border-radius:5px;color:#e2e8f0;font-size:.7rem;outline:none">\
        <button id="ht_dev_name_clear" style="padding:5px 10px;font-size:.62rem;border:1px solid #334155;border-radius:5px;background:transparent;color:#94a3b8;cursor:pointer">清除</button>\
      </div>\
      ' + (!customName && (!displayName || displayName === '未知设备') ? '<div style="font-size:.54rem;color:#64748b;line-height:1.4;margin:-4px 0 6px">设备重新连接WiFi后可自动识别名称，也可在上方手动设置</div>' : '') + '\
      <div style="border-top:1px solid #1e293b;margin:10px 0"></div>\
      <div style="display:flex;flex-direction:column;gap:8px;font-size:.7rem;color:#e2e8f0">\
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="pol" value="normal" ' + (curPol === 'normal' ? 'checked' : '') + ' style="accent-color:#667eea"> 正常（无限制）</label>\
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="pol" value="blacklist" ' + (curPol === 'blacklist' ? 'checked' : '') + ' style="accent-color:#667eea"> 拉黑（禁止联网）</label>\
      </div>';
        var modalResult = createModal({
            name: 'ht_device_modal',
            title: '热点流量监控 · 设备管理',
            content: content,
            showConfirm: true,
            confirmBtnText: '应用',
            onClose: function() { return true; },
            onConfirm: async function() {
                var newName = (el2.querySelector('#ht_dev_name') && el2.querySelector('#ht_dev_name').value || '').trim() || '';
                var typeEl = el2.querySelector('input[name="pol"]:checked');
                var type = typeEl ? typeEl.value : null;
                var policyOk = true;
                if (type === 'normal') {
                    var r = await policyRemove(mac);
                    if (!r || !r.success) policyOk = false;
                } else if (type) {
                    var r2 = await policySet(mac, type);
                    if (!r2 || !r2.success) policyOk = false;
                }
                if (!policyOk) {
                    SDM.toast('策略保存失败，请稍后重试', 'red', 3000);
                    return false;
                }
                await loadPolicyMap();
                setCustomName(mac, newName);
                patchDataArea();
                return true;
            }
        });
        var id = modalResult.id, el2 = modalResult.el;
        var macEl = el2.querySelector('.ht-mac-toggle');
        if (macEl) macEl.onclick = function() { macEl.textContent = macEl.textContent === macEl.dataset.full ? macEl.dataset.masked : macEl.dataset.full; };
        var clearBtn = el2.querySelector('#ht_dev_name_clear');
        if (clearBtn) clearBtn.addEventListener('click', function() { var inp = el2.querySelector('#ht_dev_name'); if (inp) inp.value = ''; });
        showModal(id);
    };

    var renderDataArea = function() {
        var installed = state.installed;
        var devicesMap = (state.dataCache && state.dataCache.devices) ? state.dataCache.devices : {};
        var deviceList = sortDevices(devicesMap);
        var summary = state.summary;
        var dataDate = (state.dataCache && state.dataCache.date) || new Date().toISOString().slice(0, 10);

        var summaryHtml;
        if (summary) {
            var m = calcSummaryMetrics(summary, deviceList);
            var zeroWarn = (summary.zeroStreak >= 3 && installed) ? '<div class="ht-status-alert" style="font-size:.55rem;margin-top:4px;">热点合计持续为0，可能受硬件加速影响，建议点击「诊断」排查</div>' : '';
            summaryHtml = '<div class="ht-summary-grid">' +
                summaryHtmls(m).map(function(html, i) { return '<div class="ht-summary-item" data-ht="si_' + i + '">' + html + '</div>'; }).join('\n') +
                '</div>' + zeroWarn;
        } else {
            summaryHtml = '<div class="ht-empty" style="font-size:.58rem;">' + (installed ? '已启用，等待首次采集数据' : '启用并等待首次采集后显示') + '</div>';
        }

        var devicesHtml = deviceList.length > 0
            ? '<div class="ht-tbl-wrap"><table class="ht-tbl">\
                <thead><tr><th style="width:10px;text-align:center;">#</th><th style="width:20px;">操作</th><th style="width:49%;">设备</th><th class="ht-td-num">Σ 流量 · 网速</th></tr></thead>\
                <tbody>' + deviceList.map(function(d, i) { return renderDeviceRow(d, i); }).join('') + '</tbody>\
               </table></div>'
            : '<div class="ht-empty">' + (installed ? '已启用，等待首次采集到接入设备...' : '启用后开始统计各接入设备的流量') + '</div>';

        var updatedShort = state.lastUpdated ? state.lastUpdated.slice(11, 19) : '';

        return '\
        <div class="ht-card">\
          <div class="ht-row" style="justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;">\
            <div class="ht-row"><b>流量概览</b><span class="ht-date">' + esc(dataDate) + '<span data-ht="sum_date">' + (installed && updatedShort ? '（更新时间 ' + esc(updatedShort) + '）' : '') + '</span></span></div>\
            <button id="ht_devices_toggle" class="ht-btn ht-btn-ghost" style="font-size:.56rem;padding:2px 8px;">' + (localStorage.getItem('hotspot_traffic_devices_collapsed') === '1' ? '设备明细 ▼' : '设备明细 ▲') + '</button>\
          </div>\
          ' + summaryHtml + '\
        </div>\
        <div class="ht-card" id="ht_devices_card" style="' + (localStorage.getItem('hotspot_traffic_devices_collapsed') === '1' ? 'display:none' : '') + '">\
          ' + devicesHtml + '\
        </div>';
    };

    var render = function() {
        var installed = state.installed;
        var dotCls = installed ? 'ht-dot-green' : 'ht-dot-gray';
        var statusText = installed ? '运行中' : '未启用';
        var toggleCls = installed ? 'ht-btn-stop' : 'ht-btn-success';
        var toggleTxt = installed ? '<span class="ht-dot ht-dot-green"></span>停用' : '▶ 启用';
        var diagBtnText = state.diagStatus === 'done' ? '🔧 诊断结果' : state.diagStatus === 'running' ? '🔧 诊断中...' : '🔧 诊断';
        var _remoteVer = (_manifest && _manifest.version) || '';
        var _devVer = state._deviceVersion;
        var _verDisplay = state.installed ? (_devVer || '') : _remoteVer;
        var _hasUpdate = _remoteVer && _devVer && _remoteVer !== _devVer;
        var _updateBtnHtml = '';
        var _verHtml = _verDisplay ? '<span id="ht-ver-tap" style="font-size:.5rem;opacity:.35;margin-left:4px;cursor:pointer;-webkit-user-select:none;user-select:none;">v' + esc(_verDisplay) + '</span>' + _updateBtnHtml : '';

        return '<div class="ht-wrap">\
        <div class="ht-card">\
          <div class="ht-row" style="justify-content:space-between;">\
            <div class="ht-row"><span class="ht-dot ' + dotCls + '"></span><span style="font-size:.68rem;">' + esc(statusText) + '</span>' + _verHtml + '</div>\
            <div class="ht-row">\
              <button class="ht-btn ht-btn-ghost" data-act="log" ' + (installed ? '' : 'disabled') + '>日志</button>\
              <button class="ht-btn ht-btn-ghost" data-act="diag" ' + (installed ? '' : 'disabled') + '>' + diagBtnText + '</button>\
              <button class="ht-btn ' + toggleCls + '" data-act="toggle">' + toggleTxt + '</button>\
            </div>\
          </div>\
        </div>\
        <div id="ht_data_area">' + renderDataArea() + '</div>\
      </div>';
    };

    // ─── diag ─────────────────────────────────────────────────────────────────
    var clearDiagState = function() {
        state.diagStatus = 'idle';
        state.diagResult = null;
    };

    var updateDiagBtn = function() {
        var btn = document.querySelector('#' + MODAL + ' [data-act="diag"]');
        if (!btn) return;
        btn.textContent = state.diagStatus === 'done' ? '🔧 诊断结果' : state.diagStatus === 'running' ? '🔧 诊断中...' : '🔧 诊断';
    };

    var startDiag = async function() {
        if (!state.installed) return SDM.toast('请先启用插件', 'pink');
        if (state.diagStatus === 'running') return;
        state.diagStatus = 'running';
        updateDiagBtn();
        var _resetDiag = function() { state.diagStatus = 'idle'; updateDiagBtn(); };
        try { await readStatus(); } catch (e) { state.summary = null; console.warn('[HT] readStatus in diag:', e); }
        if (state.summary && state.summary.scriptStartAt) {
            var startMs = parseTs(state.summary.scriptStartAt);
            if (!Number.isFinite(startMs)) { _resetDiag(); return SDM.toast('插件数据尚未就绪，请等待采集完成后再诊断', 'pink'); }
            var elapsed = Date.now() - startMs;
            if (elapsed < DIAG_COOLDOWN) {
                var sec = Math.floor(elapsed / 1000);
                var t = sec >= 60 ? (Math.floor(sec / 60) + '分' + (sec % 60 ? sec % 60 + '秒' : '')) : (sec + '秒');
                _resetDiag();
                return SDM.toast('插件当前启动' + t + '，请等待至少5分钟后再诊断', 'pink');
            }
        } else if (!state.summary) {
            _resetDiag();
            return SDM.toast('插件数据尚未就绪，请等待采集完成后再诊断', 'pink');
        }
        var now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) { _resetDiag(); return SDM.toast('跨日数据重建中，请1分钟后再诊断', 'pink'); }
        var preChk = await run('_probe=0; [ -f ' + sq(DIAG_BIN_FILE) + ' ] && _probe=1\n_lock=0; _stale=0; if [ -f ' + sq(DIAG_LOCK_FILE) + ' ]; then _age=$(( $(date +%s) - $(stat -c %Y ' + sq(DIAG_LOCK_FILE) + ' 2>/dev/null || echo 0) )); if [ "$_age" -gt 60 ]; then rm -f ' + sq(DIAG_LOCK_FILE) + '; _stale=1; else _p=$(awk \'{print}\' ' + sq(DIAG_LOCK_FILE) + ' 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && _lock=1 || rm -f ' + sq(DIAG_LOCK_FILE) + '; fi; fi\n_ver=$(timeout 2s awk \'{print}\' ' + sq(DATA_DIR + '/.version') + ' 2>/dev/null)\necho "$_probe|$_lock|$_stale|$_ver"', 8000);
        var parts = String(preChk && preChk.content || '').trim().split('|');
        var _probeOk = parts[0], _lockAlive = parts[1], _stale = parts[2], _instVer = parts[3];
        if (_probeOk !== '1') { _resetDiag(); return SDM.toast('诊断脚本未就绪，请停用后重新启用插件', 'pink'); }
        if (_lockAlive === '1') { _resetDiag(); return SDM.toast('诊断正在进行中，请等待完成', 'pink'); }
        if (_stale === '1') SDM.toast('检测到残留锁文件已清理，正在重新诊断...', 'green', 2000);
        var currentVer = state._deviceVersion || '';
        if (_instVer && currentVer && _instVer.trim() !== currentVer) { _resetDiag(); return SDM.toast('插件已更新(' + currentVer + ')，请重新启用插件以生效', 'pink', 5000); }
        var loadingResult = createFixedToast('ht_diag_loading', '诊断中...');
        var closeLoading = loadingResult.close;
        await run('rm -f ' + sq(DIAG_RESULT_FILE) + ' 2>/dev/null\ncp ' + sq(DIAG_BIN_FILE) + ' ' + DIAG_PROC + ' && chmod 755 ' + DIAG_PROC + ' && nohup ' + DIAG_PROC + ' >/dev/null 2>&1 &', 15000);
        closeLoading();
        SDM.toast('诊断已启动，后台执行中...', 'green', 2000);
        var _diagPoll = setInterval(async function() {
            try {
                var dr = await run('[ -s ' + sq(DIAG_RESULT_FILE) + ' ] && echo __DONE__ || echo __WAIT__', 3000);
                if (String(dr && dr.content || '').includes('__DONE__')) {
                    clearInterval(_diagPoll);
                    var dtxt = await run('timeout 3s awk \'{print}\' ' + sq(DIAG_RESULT_FILE) + ' 2>/dev/null', 5000);
                    var dc = String(dtxt && dtxt.content || '').trim();
                    if (dc) {
                        try {
                            state.diagResult = JSON.parse(dc);
                            state.diagStatus = 'done';
                            updateDiagBtn();
                            SDM.toast('诊断完成', 'green', 2000);
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }, 3000);
        setTimeout(function() {
            clearInterval(_diagPoll);
            if (state.diagStatus === 'running') {
                state.diagStatus = 'idle';
                updateDiagBtn();
                SDM.toast('诊断超时或失败，请稍后重试', 'pink');
            }
        }, 95000);
    };

    var _lastReportTime = 0;

    var showDiagResult = function() {
        if (!state.diagResult) return SDM.toast('暂无诊断结果', 'pink');
        var j = state.diagResult;
        var hasIssue = Array.isArray(j.checks) && j.checks.some(function(c) { return !c.startsWith('\u2713') && !c.startsWith('\u2139'); });
        var reportStatus = j.auto_reported ? '<span style="color:#4ade80">\u2714 已上报</span>'
            : !hasIssue ? '<span style="opacity:.4">无异常，无需上报</span>'
            : '<span style="color:#93c5fd">↑ 建议上报</span>';
        var html = '';

        if (Array.isArray(j.checks)) {
            html += '<div style="margin-bottom:6px;display:flex;align-items:baseline;justify-content:space-between"><span><b>检查项</b>' + (j.timestamp ? '<span style="font-size:.5rem;opacity:.45;margin-left:6px">' + esc(j.timestamp) + '</span>' : '') + '</span><span style="font-size:.5rem">' + reportStatus + '</span></div>';
            j.checks.forEach(function(c) {
                var idx1 = c.indexOf(':');
                var idx2 = c.indexOf(':', idx1 + 1);
                var sym = c.substring(0, idx1);
                var id = c.substring(idx1 + 1, idx2);
                var detail = c.substring(idx2 + 1);
                var color = sym === '\u2713' ? '#86efac' : sym === '!' ? '#fdba74' : sym === '\u2139' ? '#9ca3af' : '#fca5a5';
                html += '<div class="ht-diag-item"><span style="color:' + color + ';margin-right:2px">' + sym + '</span><span style="font-weight:600">' + esc(id) + '</span><span style="opacity:.4">: </span><span style="opacity:.55">' + esc(detail) + '</span></div>';
            });
        }

        var text = JSON.stringify(j);
        var diagVer = j.version || state._deviceVersion || '';
        var fixedResult = createFixedToast('ht_diag_result_toast', '<div style="pointer-events:all;width:92vw;max-width:420px;max-height:75vh;display:flex;flex-direction:column"><div class="title" style="margin:0 0 6px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between">诊断结果<span style="font-size:.5rem;opacity:.35;margin-left:6px;font-weight:400">v' + esc(diagVer) + '</span></div><div style="flex:1;overflow:auto;min-height:0">' + html + '</div><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0"><button id="ht_diag_copy" class="ht-btn ht-btn-success" style="font-size:.62rem">复制报告</button><button id="ht_diag_report" class="ht-btn ht-btn-ghost" style="font-size:.62rem">上报</button><button id="ht_diag_redo" class="ht-btn ht-btn-ghost" style="font-size:.62rem">重新诊断</button><button id="ht_diag_close" class="ht-btn ht-btn-ghost" style="font-size:.62rem">关闭</button></div></div>');
        var toastEl = fixedResult.el, close = fixedResult.close;
        toastEl.querySelector('#ht_diag_close').onclick = function() { close(); };
        toastEl.querySelector('#ht_diag_copy').onclick = async function() {
            await copyToClipboard(text);
            SDM.toast('已复制', 'green');
        };
        toastEl.querySelector('#ht_diag_report').onclick = async function() {
            if (!hasIssue) return SDM.toast('诊断结果无异常，如有问题请反馈', 'pink', 3000);
            var markReported = async function() {
                var _sec = Math.floor(Date.now() / 1000);
                await run('printf \'%s\' ' + sq(_sec) + ' > ' + sq(LAST_REPORT_TS_FILE) + '\n_m=$(' + sq(JQ) + ' \'.auto_reported=true\' ' + sq(DIAG_RESULT_FILE) + ' 2>/dev/null); [ -n "$_m" ] && printf \'%s\' "$_m" > ' + sq(DIAG_RESULT_FILE + '.tmp') + ' && mv ' + sq(DIAG_RESULT_FILE + '.tmp') + ' ' + sq(DIAG_RESULT_FILE), 5000);
                _lastReportTime = _sec * 1000;
                j.auto_reported = true;
            };
            var _st = await run('_ts=$(awk \'{print $1+0}\' ' + sq(LAST_REPORT_TS_FILE) + ' 2>/dev/null); _ar=$(awk \'/auto_reported/{c=1} END{print c+0}\' ' + sq(DIAG_RESULT_FILE) + ' 2>/dev/null); echo "ts=$_ts ar=$_ar"', 3000);
            var _out = String(_st && _st.content || '');
            var _tsm = _out.match(/ts=(\d+)/);
            var _fts = _tsm ? parseInt(_tsm[1]) : 0;
            if (_fts) _lastReportTime = Math.max(_lastReportTime, _fts * 1000);
            var autoReported = j.auto_reported || _out.includes('ar=1');
            if (autoReported) return SDM.toast('当前诊断已上报', 'green', 3000);
            if (_lastReportTime && Date.now() - _lastReportTime < REPORT_COOLDOWN) return SDM.toast('上报间隔未达' + Math.round(REPORT_COOLDOWN / 60000) + '分钟，请稍后重新诊断', 'pink');
            try {
                var whRes = await run('cat ' + sq(WEBHOOK_FILE) + ' 2>/dev/null', 3000);
                var webhookUrl = String(whRes && whRes.content || '').trim();
                if (!webhookUrl) return SDM.toast('未获取到上报通道', 'red');
                var body = JSON.stringify({ msgtype: 'text', text: { content: text } });
                var tmpFile = DATA_DIR + '/_report.tmp';
                var r = await run('printf \'%s\' ' + sq(body) + ' > ' + sq(tmpFile) + ' && _r=$(timeout 10s curl -s -X POST -H \'Content-Type: application/json;charset=UTF-8\' -d @' + sq(tmpFile) + ' ' + sq(webhookUrl) + ' 2>/dev/null) && rm -f ' + sq(tmpFile) + ' && echo "$_r" || { rm -f ' + sq(tmpFile) + '; echo \'{"errcode":-1}\'; }', 15000);
                var output = String(r && r.content || '').trim();
                if (output.includes('"errcode":0') || output.includes('"errcode": 0')) {
                    await markReported();
                    return SDM.toast('上报成功', 'green');
                } else if (output.includes('310000')) {
                    return SDM.toast('当前插件版本过旧，请更新到最新版本后重试', 'red', 5000);
                } else {
                    return SDM.toast('上报失败', 'red');
                }
            } catch (e) {
                return SDM.toast('上报失败', 'red');
            }
        };
        toastEl.querySelector('#ht_diag_redo').onclick = async function() { close(); await startDiag(); };
    };

    var restoreDiagState = async function() {
        var r = await run('echo __TS__\nawk \'{print $1+0}\' ' + sq(LAST_REPORT_TS_FILE) + ' 2>/dev/null\necho __RESULT__\n[ -s ' + sq(DIAG_RESULT_FILE) + ' ] && timeout 3s awk \'{print}\' ' + sq(DIAG_RESULT_FILE) + ' 2>/dev/null || echo', 5000);
        var text = String(r && r.content || '');
        var _tsStr = text.includes('__TS__') ? text.split('__TS__')[1].split('__RESULT__')[0].trim() : '';
        var _fts = parseInt(_tsStr) || 0;
        if (_fts) _lastReportTime = Math.max(_lastReportTime, _fts * 1000);
        var resultStr = text.includes('__RESULT__') ? text.split('__RESULT__')[1].trim() : '';
        if (resultStr) {
            try {
                state.diagResult = JSON.parse(resultStr);
                state.diagStatus = 'done';
            } catch (e) { state.diagStatus = 'idle'; state.diagResult = null; }
        } else {
            state.diagStatus = 'idle';
            state.diagResult = null;
        }
    };

    // ─── bind ─────────────────────────────────────────────────────────────────
    var initDataDelegate = function() {
        if (_dataEvtBound) return;
        var area = document.querySelector('#' + MODAL + ' #ht_data_area');
        if (!area) return;
        _dataEvtBound = true;
        area.addEventListener('click', function(e) {
            var toggleBtn = e.target.closest('#ht_devices_toggle');
            if (toggleBtn) {
                e.stopPropagation();
                var card = document.querySelector('#' + MODAL + ' #ht_devices_card');
                if (!card) return;
                var isCollapsed = card.style.display === 'none';
                card.style.display = isCollapsed ? '' : 'none';
                toggleBtn.textContent = isCollapsed ? '设备明细 ▲' : '设备明细 ▼';
                localStorage.setItem('hotspot_traffic_devices_collapsed', isCollapsed ? '0' : '1');
                return;
            }
            var macSpan = e.target.closest('[data-full-mac]');
            if (macSpan) {
                e.stopPropagation();
                var full = macSpan.dataset.fullMac || '';
                var masked = macSpan.dataset.masked === '1';
                if (masked) { macSpan.textContent = full; macSpan.dataset.masked = '0'; macSpan.title = '点击隐藏部分 MAC'; }
                else { macSpan.textContent = maskMac(full); macSpan.dataset.masked = '1'; macSpan.title = '点击查看完整 MAC'; }
                return;
            }
            var editBtn = e.target.closest('[data-edit-mac]');
            if (editBtn) {
                e.stopPropagation();
                var mac = editBtn.dataset.editMac;
                var row = editBtn.closest('tr');
                var nameEl = row ? row.querySelector('[data-ht="name"]') : null;
                var ipEl = row ? row.querySelector('[data-ht="ip"]') : null;
                var displayName = (nameEl && nameEl.textContent ? nameEl.textContent.replace(/\s*\(我\)$/, '') : '') || '';
                var ip = (ipEl && ipEl.textContent) || '';
                showDeviceModal(mac, displayName, ip);
            }
        });
    };

    var renderIntoPanel = function() {
        var box = document.querySelector('#' + MODAL + ' .collapse_box');
        if (!box) return;
        _dataEvtBound = false;
        box.innerHTML = render();
        bind(document.querySelector('#' + MODAL));
    };

    var bind = function(el) {
        if (!el) return;
        var toggleBtn = el.querySelector('[data-act="toggle"]');
        if (toggleBtn) toggleBtn.onclick = async function(e) {
            var btn = e.currentTarget;
            if (btn.disabled) return;
            if (state.installed) { showUninstallConfirm(); return; }
            btn.disabled = true;
            try {
                var probeR = await run('_p=$(timeout 1s awk \'{print}\' ' + sq(PID_FILE) + ' 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && echo __ALIVE__ || echo __DEAD__', 5000);
                if (String(probeR && probeR.content || '').includes('__ALIVE__')) {
                    await run('grep -qxF ' + sq(BOOT_LINE) + ' ' + sq(BOOT_SH_FILE) + ' || echo ' + sq(BOOT_LINE) + ' >> ' + sq(BOOT_SH_FILE));
                    await readStatus();
                    if (state.installed) await loadData();
                    renderIntoPanel();
                    if (state.installed) setAutoData(true);
                    SDM.toast('插件已在后台运行，已刷新状态', 'green');
                } else {
                    await startInstallFlow();
                }
            } catch (err) {
                SDM.toast('操作异常：' + (err && err.message ? err.message : String(err)), 'red');
            } finally { btn.disabled = false; }
        };
        var logBtn = el.querySelector('[data-act="log"]');
        if (logBtn) logBtn.onclick = function(e) { e.stopPropagation(); showLogPopup(); };
        var diagBtn = el.querySelector('[data-act="diag"]');
        if (diagBtn) diagBtn.onclick = async function(e) {
            e.stopPropagation();
            if (state.diagStatus === 'done') { showDiagResult(); return; }
            if (state.diagStatus === 'idle') { await startDiag(); return; }
        };
        initDataDelegate();
    };

    // ─── help ─────────────────────────────────────────────────────────────────
    var HELP_TEXT = '<b>功能</b><br>统计热点接入设备的流量，每天 0 点自动重置。<br><br><b>流量概览</b><br>系统增量 = 插件启用后或今日开始的系统总流量；热点合计 = 热点转发的流量；偏差 = 两者之差，主UFI本机进程流量和可能的硬件加速偏差。未归属 = 热点合计与设备合计的差值，通常占比较小。<br><br><b>设备明细</b><br>按设备展示上传/下载流量。点击设备右侧 ✎ 可设置自定义名称或拉黑策略。<br><br><b>诊断</b><br>检测常见问题，可一键上报诊断结果给作者分析。';

    var showHelp = function() {
        var fixedResult = createFixedToast('ht_help_toast', '<div style="pointer-events:all;width:80vw;max-width:300px"><div class="title" style="margin:0;display:flex;align-items:center;justify-content:space-between">使用说明</div><div style="margin:10px 0;font-size:.64rem;line-height:1.6">' + HELP_TEXT + '</div><div style="text-align:right"><button style="font-size:.62rem" id="ht_help_dismiss">关闭</button></div></div>');
        var el = fixedResult.el, close = fixedResult.close;
        el.querySelector('#ht_help_dismiss').onclick = function() { close(); };
    };

    var injectHelpButton = function(container) {
        var titleEl = container.querySelector('.title strong');
        if (!titleEl) return;
        var helpBtn = document.createElement('button');
        helpBtn.textContent = '?';
        helpBtn.style.cssText = 'width:16px;height:16px;border-radius:50%;padding:0;font-size:.5rem;line-height:16px;text-align:center;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);margin-left:8px;vertical-align:middle;flex-shrink:0;';
        helpBtn.onclick = function(e) { e.stopPropagation(); showHelp(); };
        titleEl.insertAdjacentElement('afterend', helpBtn);
    };

    // ─── panel HTML ────────────────────────────────────────────────────────────
    var panelHtml = '<div id="' + MODAL + '" style="width:100%;margin-top:10px;">\
        <div class="title" style="margin:6px 0;">\
            <strong>🔥 热点流量监控</strong>\
            <div style="display:inline-block;" id="collapse_ht_btn"></div>\
        </div>\
        <div class="collapse" id="collapse_ht" data-name="close" style="height:0;overflow:hidden;">\
            <div class="collapse_box"></div>\
        </div>\
    </div>';

    // ─── register panel ────────────────────────────────────────────────────────
    SDM.registerPanel(MODULE_ID, panelHtml);

    // ─── init panel state ──────────────────────────────────────────────────────
    var initPanelState = async function() {
        try {
            await readStatus();
            if (!state.installed) {
                var bootChk = await run('grep -q ' + sq(NAME) + ' ' + sq(BOOT_SH_FILE) + ' 2>/dev/null && echo 1 || echo 0', 3000);
                if (String(bootChk && bootChk.content || '').includes('1')) {
                    await wait(800);
                    await readStatus();
                }
            }
            await recoverDaemonOnce();
            await restoreDiagState();
            if (state.installed) await loadData();
            await loadPolicyMap();
            renderIntoPanel();
            setAutoData(state.installed);
        } catch (e) {
            console.warn('[HT] initPanelState error:', e);
        }
    };

    // ─── setup ─────────────────────────────────────────────────────────────────
    ensureStyle();

    setTimeout(function() {
        var panelEl = document.querySelector('#' + MODAL);
        if (panelEl) injectHelpButton(panelEl);

        // Set up collapse behavior
        collapseGen('#collapse_ht_btn', '#collapse_ht', '#collapse_ht', async function(newVal) {
            if (newVal === 'open') await initPanelState();
            else setAutoData(false);
        });

        // Auto-start monitoring when loaded
        initPanelState().catch(function(e) { console.warn('[HT] init error:', e); });
    }, 300);

    // ─── module lifecycle ─────────────────────────────────────────────────────
    try { SDM.addDiagLog('热点流量监控模块已加载', 'success'); } catch(e) {}
    SDM.emit('module:ready', MODULE_ID);

    SDM.on('module:unload', function(id) {
        if (id === MODULE_ID) {
            stopAutoData();
            _dataEvtBound = false;
            var styleEl = document.getElementById(STYLE);
            if (styleEl) styleEl.remove();
            var panel = document.getElementById('sdm-panel-' + MODULE_ID);
            if (panel) panel.remove();
            try { SDM.addDiagLog('热点流量监控模块已卸载', 'info'); } catch(e) {}
        }
    });

})(window.SDM);
//@@SDM_MODULE_hotspot-monitor_END@@
