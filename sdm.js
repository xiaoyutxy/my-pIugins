//<script>
//@@SDM_PLUGIN_ID:a1b2c3@@
// SDM 分片加载器 v3.7.0 - 自动下载所有片段并拼接执行
(async () => {
    const PLUGIN_VERSION = '3.7.0';
    const GH_RAW = 'https://raw.githubusercontent.com/xiaoyutxy/my-pIugins/main/';
    const CDN_BASE = 'https://cdn.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/';
    const CDN_FASTLY = 'https://fastly.jsdelivr.net/gh/xiaoyutxy/my-pIugins@main/';
    const TOTAL = 6;
    const VER_FILE = '/data/sdm/.version';
    const PENDING_JS = '/data/local/tmp/_sdm_pending.js';

    const run = async (cmd, timeout) => {
        try { const r = await runShellWithRoot(cmd, timeout||30000); return r || {success:false, content:''}; }
        catch(e) { return {success:false, content:'', error:e?.message||String(e)}; }
    };
    const sq = v => "'" + String(v??'').replace(/'/g, "'\\''") + "'";

    const download = async (idx) => {
        const fn = 'sdm_part' + idx + '.txt';
        const urls = [
            GH_RAW + fn + '?t=' + Date.now(),
            CDN_BASE + fn + '?_=' + Date.now(),
            CDN_FASTLY + fn
        ];
        for (const url of urls) {
            try {
                const tmp = '/data/local/tmp/_sdm_p' + idx;
                const r = await run('curl -sL --fail --connect-timeout 8 --max-time 30 ' + sq(url) + ' -o ' + sq(tmp) + '; echo -n $?', 35000);
                if (String(r?.content||'').trim() === '0') {
                    const rd = await run('cat ' + sq(tmp), 3000);
                    if (rd?.content && rd.content.length > 50) return rd.content;
                }
            } catch(e) {}
        }
        throw new Error('片段' + idx + '下载失败');
    };

    try {
        // 并发下载所有片段
        const tasks = [];
        for (let i = 1; i <= TOTAL; i++) tasks.push(download(i));
        const parts = await Promise.all(tasks);
        // 拼接
        const fullCode = parts.join('');
        // 写入版本号文件（供更新逻辑判断）
        await run('mkdir -p /data/sdm && echo ' + sq(PLUGIN_VERSION) + ' > ' + sq(VER_FILE), 2000);
        // 执行完整代码
        eval(fullCode);
    } catch(e) {
        console.error('SDM加载失败:', e);
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#e53935;color:#fff;padding:14px 20px;border-radius:8px;z-index:99999;font-size:13px;max-width:80%;';
            d.textContent = 'SDM加载失败: ' + (e?.message || e);
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 5000);
        } catch(e2) {}
    }
})();
