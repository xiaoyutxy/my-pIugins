// Version: 1.0.0
//@@SDM_MODULE_signal-monitor@@
(function(SDM) {
    if (!SDM) return;
    var MODULE_ID = 'signal-monitor';

    // ============ 5G信号监控模块 ============
    // Panel HTML (includes RSRP/SINR/RSRQ cards, chart, score, trends)
    var panelHtml = '\
<style>\
    @media (max-width: 340px) {\
        .kfk_cards { grid-template-columns: 1fr !important; }\
    }\
</style>\
<div id="SIGNAL_MONITOR" class="sSIGNAL_MONITOR" style="width: 100%; padding:0;margin-top: 8px;padding-left:0">\
    <div class="title" style="margin: 4px 0; color: var(--dark-text-color); display: flex; align-items: center; justify-content: space-between;">\
        <div style="display: flex; align-items: center; gap: 8px;">\
            <strong style="color:var(--dark-text-color); font-size: 14px;">📶 5G信号监控</strong>\
            <div style="display: inline-block;" id="collapse_signal_btn"></div>\
        </div>\
        <div style="display: flex; align-items: center; gap: 6px; margin-right: 4px;">\
            <select id="update_interval_select" class="btn" style="padding: 3px 5px;font-size: .75rem; background: #333; color: var(--dark-text-color); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px;">\
                <option value="500">0.5秒</option>\
                <option value="1000" selected>1秒</option>\
                <option value="3000">3秒</option>\
                <option value="5000">5秒</option>\
                <option value="10000">10秒</option>\
            </select>\
            <button id="refresh_signal_btn" class="btn" style="padding: 3px 5px; font-size: .75rem;">刷新</button>\
            <button id="auto_monitor_btn" class="btn" style="padding: 3px 5px; font-size: .75rem; background: #4caf5075;">监控中</button>\
        </div>\
    </div>\
    <div class="collapse" id="collapse_signal" data-name="close" style="height: 0px; overflow: hidden;">\
        <div class="collapse_box">\
            <div style="margin-bottom: 8px; padding: 4px; background: rgba(255,255,255,0.05); border-radius: 4px;">\
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: .77rem; color: var(--dark-text-color);">\
                    <span>数据源: <span id="data_source_indicator" style="color:#52ef58;">实时解析</span></span>\
                    <span>更新: <span id="last_update_time">-</span></span>\
                    <span>样本数: <span id="sample_count">0</span></span>\
                </div>\
            </div>\
            <div class="kfk_cards" style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 8px;">\
                <div class="kfk_card" style="padding: .55rem; background: linear-gradient(135deg, rgba(76,175,80,0.15) 0%, rgba(76,175,80,0.05) 100%); border-radius: 10px; border: 1px solid rgba(76,175,80,0.3); position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">\
                    <div style="position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #52ef58; box-shadow: 0 0 6px #52ef58;"></div>\
                    <div style="text-align: center; margin-bottom: 10px;">\
                        <div style="font-size: .75rem; color: #52ef58; margin-bottom: 4px; font-weight: 600;">信号强度</div>\
                        <div id="signal_power" style="font-size: 20px; font-weight: bold; color: #52ef58; margin-bottom: 4px;">- dBm</div>\
                        <div style="font-size: .8rem; color: #52ef58; opacity: 0.8;">RSRP</div>\
                    </div>\
                    <div style="display: flex; justify-content: center; margin-bottom: 8px;">\
                        <div id="status_dots_power" style="display: flex; gap: 3px; align-items: center; height: 10px; overflow: hidden;"></div>\
                    </div>\
                    <div style="display: flex; justify-content: space-between; font-size: .8rem; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">\
                        <div style="color: var(--dark-text-color); font-weight: bold;" id="signal_quality">检测中</div>\
                        <div style="width: 1px; background: rgba(255,255,255,0.2);"></div>\
                        <div style="color: var(--dark-text-color); font-weight: bold;" id="stability_power">-</div>\
                    </div>\
                </div>\
            </div>\
            <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">\
                <div style="display: flex; justify-content: space-between; font-size: .7rem; color: var(--dark-text-color);">\
                    <span>平均: <span id="avg_power" style="color:#52ef58;font-weight:bold;">- dBm</span></span>\
                    <span>最佳: <span id="best_power" style="color:#52ef58;font-weight:bold;">- dBm</span></span>\
                    <span>RSRP &lt;-85优秀, &lt;-95良好</span>\
                </div>\
            </div>\
            <div class="kfk_cards" style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 8px;">\
                <div class="kfk_card" style="padding: .55rem; background: linear-gradient(135deg, rgba(33,150,243,0.15) 0%, rgba(33,150,243,0.05) 100%); border-radius: 10px; border: 1px solid rgba(33,150,243,0.3); position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">\
                    <div style="position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #2196F3; box-shadow: 0 0 6px #2196F3;"></div>\
                    <div style="text-align: center; margin-bottom: 10px;">\
                        <div style="font-size: .75rem; color: #2196F3; margin-bottom: 4px; font-weight: 600;">信号质量</div>\
                        <div id="signal_sinr" style="font-size: 20px; font-weight: bold; color: #2196F3; margin-bottom: 4px;">-</div>\
                        <div style="font-size: .8rem; color: #2196F3; opacity: 0.8;">SINR</div>\
                    </div>\
                    <div style="display: flex; justify-content: center; margin-bottom: 8px;">\
                        <div id="status_dots_sinr" style="display: flex; gap: 3px; align-items: center; height: 10px; overflow: hidden;"></div>\
                    </div>\
                    <div style="display: flex; justify-content: space-between; font-size: .8rem; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">\
                        <div style="color: var(--dark-text-color); font-weight: bold;" id="sinr_quality">检测中</div>\
                        <div style="width: 1px; background: rgba(255,255,255,0.2);"></div>\
                        <div style="color: var(--dark-text-color); font-weight: bold;" id="stability_sinr">-</div>\
                    </div>\
                </div>\
            </div>\
            <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">\
                <div style="display: flex; justify-content: space-between; font-size: .7rem; color: var(--dark-text-color);">\
                    <span>平均: <span id="avg_sinr" style="color:#2196F3;font-weight:bold;">-</span></span>\
                    <span>最佳: <span id="best_sinr" style="color:#2196F3;font-weight:bold;">-</span></span>\
                    <span>SINR &gt;22优秀, &gt;16良好</span>\
                </div>\
            </div>\
            <div class="kfk_cards" style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 8px;">\
                <div class="kfk_card" style="padding: .55rem; background: linear-gradient(135deg, rgba(255,152,0,0.15) 0%, rgba(255,152,0,0.05) 100%); border-radius: 10px; border: 1px solid rgba(255,152,0,0.3); position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">\
                    <div style="position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #FF9800; box-shadow: 0 0 6px #FF9800;"></div>\
                    <div style="text-align: center; margin-bottom: 10px;">\
                        <div style="font-size: .75rem; color: #FF9800; margin-bottom: 4px; font-weight: 600;">连接质量</div>\
                        <div id="signal_rsrq" style="font-size: 20px; font-weight: bold; color: #FF9800; margin-bottom: 4px;">- dB</div>\
                        <div style="font-size: .8rem; color: #FF9800; opacity: 0.8;">RSRQ</div>\
                    </div>\
                    <div style="display: flex; justify-content: center; margin-bottom: 8px;">\
                        <div id="status_dots_rsrq" style="display: flex; gap: 3px; align-items: center; height: 10px; overflow: hidden;"></div>\
                    </div>\
                    <div style="display: flex; justify-content: space-between; font-size: .8rem; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px;">\
                        <div style="color: var(--dark-text-color); font-weight: bold;" id="rsrq_quality">检测中</div>\
                        <div style="width: 1px; background: rgba(255,255,255,0.2);"></div>\
                        <div style="color: var(--dark-text-color); font-weight: bold;" id="stability_rsrq">-</div>\
                    </div>\
                </div>\
            </div>\
            <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">\
                <div style="display: flex; justify-content: space-between; font-size: .7rem; color: var(--dark-text-color);">\
                    <span>平均: <span id="avg_rsrq" style="color:#FF9800;font-weight:bold;">- dB</span></span>\
                    <span>最佳: <span id="best_rsrq" style="color:#FF9800;font-weight:bold;">- dB</span></span>\
                    <span>RSRQ &gt;-7优秀, &gt;-9良好</span>\
                </div>\
            </div>\
            <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">\
                <div style="display: flex; justify-content: space-around; font-size: .7rem; color: var(--dark-text-color); margin-bottom: 6px;">\
                    <span>RSRP: <span id="current_power" style="color:#52ef58;font-weight:bold;">- dBm</span></span>\
                    <span>SINR: <span id="current_sinr" style="color:#2196F3;font-weight:bold;">-</span></span>\
                    <span>RSRQ: <span id="current_rsrq" style="color:#FF9800;font-weight:bold;">- dB</span></span>\
                </div>\
                <div style="display: flex; justify-content: space-around; font-size: .65rem; color: var(--dark-text-color);">\
                    <span>RSRP趋势: <span id="trend_power">-</span></span>\
                    <span>SINR趋势: <span id="trend_sinr">-</span></span>\
                    <span>RSRQ趋势: <span id="trend_rsrq">-</span></span>\
                </div>\
            </div>\
            <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">\
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: .77rem; color: var(--dark-text-color);">\
                    <span>综合评分: <span id="overall_score" style="font-weight: bold; color: #52ef58;">0</span></span>\
                    <span id="score_description" style="font-size: .7rem; opacity: 0.8;">数据不足</span>\
                </div>\
            </div>\
            <div style="margin-bottom: 8px;">\
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">\
                    <button id="toggle_chart_display_btn" class="btn" style="padding: 3px 5px; font-size: .75rem;">📊 显示图表</button>\
                    <button id="toggle_chart_btn" class="btn" style="padding: 3px 5px; font-size: .75rem;">视图: 全部</button>\
                    <span style="font-size: .65rem; color: var(--dark-text-color); opacity: 0.6;" id="chart_stats">数据点: 0</span>\
                </div>\
                <div class="collapse" id="collapse_chart_content" data-name="close" style="height: 0px; overflow: hidden;">\
                    <div id="chart_placeholder" style="display: flex; align-items: center; justify-content: center; height: 100px; color: #666; font-size: .7rem;">暂无数据</div>\
                    <canvas id="signal_chart" style="width: 100%; height: 100px;"></canvas>\
                </div>\
            </div>\
        </div>\
    </div>\
</div>';

    // Register panel via core API
    SDM.registerPanel(MODULE_ID, panelHtml);

    // Inject dedicated styles
    var _smStyle = document.createElement('style');
    _smStyle.textContent = '\
#SIGNAL_MONITOR { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial; border-radius: 6px; padding: 4px; padding-left:0; width: 100%; box-sizing: border-box; }\
.sSIGNAL_MONITOR { padding-left:0 !important; }\
#SIGNAL_MONITOR .collapse_box { padding: 6px; backdrop-filter: blur(20px); background: var(--dark-card-bg); border-radius: 10px; }\
#SIGNAL_MONITOR .btn { background: transparent; border: 1px solid rgba(255,255,255,0.2); padding: 3px 6px; border-radius: 3px; cursor: pointer; color: var(--dark-text-color); font-weight: 600; font-size: .77rem; transition: all 0.2s ease; }\
#SIGNAL_MONITOR .btn:hover { background: rgba(255,255,255,0.1); transform: translateY(-1px); }\
#SIGNAL_MONITOR .btn:active { transform: scale(0.98); }\
#SIGNAL_MONITOR .status-dot { width: 5px; height: 5px; border-radius: 50%; background-color: #666; flex-shrink: 0; transition: all 0.3s ease; box-shadow: 0 0 3px rgba(0,0,0,0.3); }\
#SIGNAL_MONITOR select { -webkit-appearance: none; -moz-appearance: none; appearance: none; background: #333 url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 4 5\'%3e%3cpath fill=\'%23ffffff\' d=\'M2 0L0 2h4zm0 5L0 3h4z\'/%3e%3c/svg%3e") no-repeat right 8px center/8px 10px; padding-right: 24px; }\
#SIGNAL_MONITOR select option { background: #333; color: var(--dark-text-color); }\
';
    document.head.appendChild(_smStyle);

    var SM_CONFIG = {
        MAX_DOTS: 12,
        CHART_MAX_POINTS: 30,
        COLORS: { EXCELLENT:'#52ef58', GOOD:'#8BC34A', FAIR:'#FFC107', POOR:'#FF9800', BAD:'#f44336', PENDING:'#666' }
    };

    var smState = {
        isMonitoring: true,
        monitorInterval: null,
        history: { power: [], sinr: [], rsrq: [] },
        chartData: { power: [], sinr: [], rsrq: [], timestamps: [] },
        bestValues: { power: -999, sinr: -999, rsrq: -999 },
        sampleCount: 0,
        lastDataTime: null,
        dataSource: 'parsing',
        chartView: 'all',
        currentValues: { power: null, sinr: null, rsrq: null },
        previousValues: { power: null, sinr: null, rsrq: null },
        trends: { power: 'stable', sinr: 'stable', rsrq: 'stable' },
        chartVisible: false
    };

    function getPowerQuality(power) {
        var pv = parseInt(power);
        if (pv >= -83) return { quality:"优", level:"excellent", color:SM_CONFIG.COLORS.EXCELLENT };
        else if (pv >= -93) return { quality:"良", level:"good", color:SM_CONFIG.COLORS.GOOD };
        else if (pv >= -103) return { quality:"中", level:"fair", color:SM_CONFIG.COLORS.FAIR };
        else if (pv >= -113) return { quality:"差", level:"poor", color:SM_CONFIG.COLORS.POOR };
        else return { quality:"断", level:"bad", color:SM_CONFIG.COLORS.BAD };
    }

    function getSinrQuality(sinr) {
        var sv = parseInt(sinr);
        if (sv > 22) return { quality:"优", level:"excellent", color:SM_CONFIG.COLORS.EXCELLENT };
        else if (sv > 16) return { quality:"良", level:"good", color:SM_CONFIG.COLORS.GOOD };
        else if (sv > 11) return { quality:"中", level:"fair", color:SM_CONFIG.COLORS.FAIR };
        else if (sv > 6) return { quality:"差", level:"poor", color:SM_CONFIG.COLORS.POOR };
        else return { quality:"断", level:"bad", color:SM_CONFIG.COLORS.BAD };
    }

    function getRsrqQuality(rsrq) {
        var rv = parseInt(rsrq);
        if (rv >= -7) return { quality:"优", level:"excellent", color:SM_CONFIG.COLORS.EXCELLENT };
        else if (rv >= -9) return { quality:"良", level:"good", color:SM_CONFIG.COLORS.GOOD };
        else if (rv >= -11) return { quality:"中", level:"fair", color:SM_CONFIG.COLORS.FAIR };
        else if (rv >= -14) return { quality:"差", level:"poor", color:SM_CONFIG.COLORS.POOR };
        else return { quality:"断", level:"bad", color:SM_CONFIG.COLORS.BAD };
    }

    function getStabilityRating(history, type) {
        if (!history || history.length < 8) return "检测中";
        var changes = [];
        for (var i = 1; i < history.length; i++) {
            var prev = parseInt(history[i-1]), curr = parseInt(history[i]);
            if (Math.abs(curr - prev) < 20) changes.push(Math.abs(curr - prev));
        }
        if (changes.length === 0) return "检测中";
        var avgChange = changes.reduce(function(a,b){return a+b},0) / changes.length;
        var th = { power:{excellent:1,good:3,fair:6}, sinr:{excellent:0.5,good:1.5,fair:3}, rsrq:{excellent:0.3,good:0.8,fair:1.5} };
        var t = th[type] || th.power;
        if (avgChange < t.excellent) return "极稳";
        if (avgChange < t.good) return "稳定";
        if (avgChange < t.fair) return "一般";
        return "波动";
    }

    function createStatusDot(bg, title) {
        var dot = document.createElement('div');
        dot.className = 'status-dot';
        dot.style.backgroundColor = bg || SM_CONFIG.COLORS.PENDING;
        dot.title = title || '等待';
        return dot;
    }

    function initializeStatusDots() {
        var containers = ['status_dots_power', 'status_dots_sinr', 'status_dots_rsrq'];
        containers.forEach(function(cid) {
            var c = document.getElementById(cid);
            if (!c) return;
            var frag = document.createDocumentFragment();
            for (var i = 0; i < SM_CONFIG.MAX_DOTS; i++) frag.appendChild(createStatusDot());
            c.innerHTML = '';
            c.appendChild(frag);
        });
    }

    function updateStatusDots(containerId, value, type) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var dots = container.children;
        var activeDots = 0, color = SM_CONFIG.COLORS.PENDING, title = '等待数据';

        if (type === 'power') {
            var pv = parseInt(value);
            if (pv >= -83) { activeDots=12; color=SM_CONFIG.COLORS.EXCELLENT; title="信号极佳" }
            else if (pv >= -88) { activeDots=10; color=SM_CONFIG.COLORS.EXCELLENT; title="信号很好" }
            else if (pv >= -93) { activeDots=8; color=SM_CONFIG.COLORS.GOOD; title="信号良好" }
            else if (pv >= -98) { activeDots=6; color=SM_CONFIG.COLORS.FAIR; title="信号中等" }
            else if (pv >= -103) { activeDots=5; color=SM_CONFIG.COLORS.FAIR; title="信号一般" }
            else if (pv >= -108) { activeDots=4; color=SM_CONFIG.COLORS.POOR; title="信号较差" }
            else if (pv >= -113) { activeDots=3; color=SM_CONFIG.COLORS.POOR; title="信号差" }
            else if (pv >= -118) { activeDots=2; color=SM_CONFIG.COLORS.BAD; title="信号很差" }
            else { activeDots=1; color=SM_CONFIG.COLORS.BAD; title="信号极差或断开" }
        } else if (type === 'sinr') {
            var sv = parseInt(value);
            if (sv > 25) { activeDots=12; color=SM_CONFIG.COLORS.EXCELLENT; title="质量极佳" }
            else if (sv > 22) { activeDots=10; color=SM_CONFIG.COLORS.EXCELLENT; title="质量很好" }
            else if (sv > 18) { activeDots=8; color=SM_CONFIG.COLORS.GOOD; title="质量良好" }
            else if (sv > 14) { activeDots=6; color=SM_CONFIG.COLORS.FAIR; title="质量中等" }
            else if (sv > 11) { activeDots=5; color=SM_CONFIG.COLORS.FAIR; title="质量一般" }
            else if (sv > 8) { activeDots=4; color=SM_CONFIG.COLORS.POOR; title="质量较差" }
            else if (sv > 6) { activeDots=3; color=SM_CONFIG.COLORS.POOR; title="质量差" }
            else if (sv > 3) { activeDots=2; color=SM_CONFIG.COLORS.BAD; title="质量很差" }
            else { activeDots=1; color=SM_CONFIG.COLORS.BAD; title="质量极差" }
        } else if (type === 'rsrq') {
            var rv = parseInt(value);
            if (rv >= -6) { activeDots=12; color=SM_CONFIG.COLORS.EXCELLENT; title="连接极佳" }
            else if (rv >= -7) { activeDots=10; color=SM_CONFIG.COLORS.EXCELLENT; title="连接很好" }
            else if (rv >= -8) { activeDots=8; color=SM_CONFIG.COLORS.GOOD; title="连接良好" }
            else if (rv >= -9) { activeDots=6; color=SM_CONFIG.COLORS.FAIR; title="连接中等" }
            else if (rv >= -10) { activeDots=5; color=SM_CONFIG.COLORS.FAIR; title="连接一般" }
            else if (rv >= -11) { activeDots=4; color=SM_CONFIG.COLORS.POOR; title="连接较差" }
            else if (rv >= -12) { activeDots=3; color=SM_CONFIG.COLORS.POOR; title="连接差" }
            else if (rv >= -14) { activeDots=2; color=SM_CONFIG.COLORS.BAD; title="连接很差" }
            else { activeDots=1; color=SM_CONFIG.COLORS.BAD; title="连接极差" }
        }

        for (var i = 0; i < dots.length; i++) {
            if (i < activeDots) {
                dots[i].style.backgroundColor = color;
                dots[i].title = title;
                dots[i].style.boxShadow = '0 0 4px ' + color;
            } else {
                dots[i].style.backgroundColor = SM_CONFIG.COLORS.PENDING;
                dots[i].title = '未激活';
                dots[i].style.boxShadow = '0 0 3px rgba(0,0,0,0.3)';
            }
        }
    }

    function calculateAverage(history, currentValue) {
        var nv = parseInt(currentValue);
        if (history.length > 0) {
            var currentAvg = history.reduce(function(a,b){return a+b},0) / history.length;
            if (Math.abs(nv - currentAvg) > 15) history.push(currentAvg * 0.7 + nv * 0.3);
            else history.push(nv);
        } else { history.push(nv) }
        if (history.length > 15) history.shift();
        if (history.length > 0) {
            var ws = 0, ws2 = 0;
            history.forEach(function(v, i) { var w = (i+1)/history.length; ws += v*w; ws2 += w });
            return ws / ws2;
        }
        return nv;
    }

    function updateBestValues(data) {
        if (data.receivePower) { var pv = parseInt(data.receivePower); if (pv > smState.bestValues.power) smState.bestValues.power = pv }
        if (data.sinr) { var sv = parseInt(data.sinr); if (sv > smState.bestValues.sinr) smState.bestValues.sinr = sv }
        if (data.rsrq) { var rv = parseInt(data.rsrq); if (rv > smState.bestValues.rsrq) smState.bestValues.rsrq = rv }
        var bp = document.getElementById('best_power');
        if (bp) bp.textContent = smState.bestValues.power !== -999 ? smState.bestValues.power + ' dBm' : '- dBm';
        var bs = document.getElementById('best_sinr');
        if (bs) bs.textContent = smState.bestValues.sinr !== -999 ? smState.bestValues.sinr : '-';
        var br = document.getElementById('best_rsrq');
        if (br) br.textContent = smState.bestValues.rsrq !== -999 ? smState.bestValues.rsrq + ' dB' : '- dB';
    }

    function calculateOverallScore(data) {
        if (!data.receivePower || !data.sinr || !data.rsrq) return { score:0, description:"数据不足" };
        var power = parseInt(data.receivePower), sinr = parseInt(data.sinr), rsrq = parseInt(data.rsrq), score = 0;
        if (power >= -83) score += 40; else if (power >= -88) score += 35; else if (power >= -93) score += 30; else if (power >= -98) score += 25; else if (power >= -103) score += 20; else if (power >= -108) score += 15; else if (power >= -113) score += 10; else score += 5;
        if (sinr > 25) score += 35; else if (sinr > 22) score += 30; else if (sinr > 18) score += 25; else if (sinr > 14) score += 20; else if (sinr > 11) score += 15; else if (sinr > 8) score += 10; else if (sinr > 6) score += 8; else score += 5;
        if (rsrq >= -6) score += 25; else if (rsrq >= -7) score += 20; else if (rsrq >= -8) score += 15; else if (rsrq >= -9) score += 12; else if (rsrq >= -10) score += 10; else if (rsrq >= -11) score += 8; else if (rsrq >= -12) score += 6; else score += 4;
        var desc;
        if (score >= 90) desc = "信号极佳，网络体验优秀";
        else if (score >= 80) desc = "信号良好，网络体验流畅";
        else if (score >= 70) desc = "信号一般，网络体验尚可";
        else if (score >= 60) desc = "信号较差，网络体验一般";
        else if (score >= 50) desc = "信号差，网络体验不佳";
        else desc = "信号极差，建议调整位置";
        return { score:score, description:desc };
    }

    function calculateTrends(data) {
        if (!data.receivePower || !data.sinr || !data.rsrq) return;
        var cp = parseInt(data.receivePower), cs = parseInt(data.sinr), cr = parseInt(data.rsrq);
        if (smState.previousValues.power !== null) { var d = cp - smState.previousValues.power; if (d > 2) smState.trends.power = 'improving'; else if (d < -2) smState.trends.power = 'deteriorating'; else smState.trends.power = 'stable' }
        if (smState.previousValues.sinr !== null) { var d2 = cs - smState.previousValues.sinr; if (d2 > 1) smState.trends.sinr = 'improving'; else if (d2 < -1) smState.trends.sinr = 'deteriorating'; else smState.trends.sinr = 'stable' }
        if (smState.previousValues.rsrq !== null) { var d3 = cr - smState.previousValues.rsrq; if (d3 > 0.5) smState.trends.rsrq = 'improving'; else if (d3 < -0.5) smState.trends.rsrq = 'deteriorating'; else smState.trends.rsrq = 'stable' }
        smState.previousValues.power = cp; smState.previousValues.sinr = cs; smState.previousValues.rsrq = cr;
        updateTrendDisplay();
    }

    function updateTrendDisplay() {
        var pe = document.getElementById('trend_power'), se = document.getElementById('trend_sinr'), re = document.getElementById('trend_rsrq');
        if (pe) { pe.textContent = getTrendText(smState.trends.power); pe.style.color = getTrendColor(smState.trends.power) }
        if (se) { se.textContent = getTrendText(smState.trends.sinr); se.style.color = getTrendColor(smState.trends.sinr) }
        if (re) { re.textContent = getTrendText(smState.trends.rsrq); re.style.color = getTrendColor(smState.trends.rsrq) }
    }

    function getTrendText(t) { return t === 'improving' ? '↑ 改善中' : t === 'deteriorating' ? '↓ 恶化中' : t === 'stable' ? '→ 稳定' : '-'; }
    function getTrendColor(t) { return t === 'improving' ? '#52ef58' : t === 'deteriorating' ? '#f44336' : t === 'stable' ? '#FFC107' : 'var(--dark-text-color)'; }

    function updateCurrentValues(data) {
        if (data.receivePower) { smState.currentValues.power = data.receivePower; var el = document.getElementById('current_power'); if (el) el.textContent = data.receivePower + ' dBm' }
        if (data.sinr) { smState.currentValues.sinr = data.sinr; var el2 = document.getElementById('current_sinr'); if (el2) el2.textContent = data.sinr }
        if (data.rsrq) { smState.currentValues.rsrq = data.rsrq; var el3 = document.getElementById('current_rsrq'); if (el3) el3.textContent = data.rsrq + ' dB' }
    }

    function updateChartData(data) {
        var now = new Date(), ts = now.toLocaleTimeString();
        if (data.receivePower) smState.chartData.power.push(parseInt(data.receivePower));
        if (data.sinr) smState.chartData.sinr.push(parseInt(data.sinr));
        if (data.rsrq) smState.chartData.rsrq.push(parseInt(data.rsrq));
        smState.chartData.timestamps.push(ts);
        if (smState.chartData.power.length > SM_CONFIG.CHART_MAX_POINTS) { smState.chartData.power.shift(); smState.chartData.sinr.shift(); smState.chartData.rsrq.shift(); smState.chartData.timestamps.shift() }
        if (smState.chartVisible) drawSignalChart();
        var cs = document.getElementById('chart_stats');
        if (cs) cs.textContent = '数据点: ' + smState.chartData.power.length;
        if (smState.chartData.power.length > 0 && smState.chartVisible) { var cp = document.getElementById('chart_placeholder'); if (cp) cp.style.display = 'none' }
    }

    function drawSignalChart() {
        var canvas = document.getElementById('signal_chart');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var dw = canvas.clientWidth, dh = canvas.clientHeight;
        if (canvas.width !== dw * dpr || canvas.height !== dh * dpr) { canvas.width = dw * dpr; canvas.height = dh * dpr }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var w = dw, h = dh;
        ctx.clearRect(0, 0, w, h);
        if (!smState.chartData || smState.chartData.power.length === 0) return;
        var powerData = smState.chartData.power, sinrData = smState.chartData.sinr, rsrqData = smState.chartData.rsrq;
        var datasets = [];
        if (smState.chartView === 'all' || smState.chartView === 'power') datasets.push({ data: powerData, color: '#52ef58', label: 'RSRP' });
        if (smState.chartView === 'all' || smState.chartView === 'sinr') datasets.push({ data: sinrData, color: '#2196F3', label: 'SINR' });
        if (smState.chartView === 'all' || smState.chartView === 'rsrq') datasets.push({ data: rsrqData, color: '#FF9800', label: 'RSRQ' });
        var minValue = Infinity, maxValue = -Infinity;
        datasets.forEach(function(ds) { ds.data.forEach(function(v) { if (v < minValue) minValue = v; if (v > maxValue) maxValue = v }) });
        var range = maxValue - minValue;
        minValue = minValue - range * 0.1; maxValue = maxValue + range * 0.1;
        if (minValue === maxValue) { minValue -= 1; maxValue += 1 }
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
        for (var i = 0; i <= 4; i++) { var y = h - (i * h / 4); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
        var ordered = [];
        if (smState.chartView === 'all' || smState.chartView === 'rsrq') ordered.push({ data: rsrqData, color: '#FF9800', label: 'RSRQ' });
        if (smState.chartView === 'all' || smState.chartView === 'sinr') ordered.push({ data: sinrData, color: '#2196F3', label: 'SINR' });
        if (smState.chartView === 'all' || smState.chartView === 'power') ordered.push({ data: powerData, color: '#52ef58', label: 'RSRP' });
        ordered.forEach(function(ds) {
            var data = ds.data;
            if (data.length < 2) return;
            ctx.strokeStyle = ds.color; ctx.lineWidth = 1.5; ctx.beginPath();
            data.forEach(function(v, i) { var x = (i / (data.length - 1)) * w; var y2 = h - ((v - minValue) / (maxValue - minValue)) * h; if (i === 0) ctx.moveTo(x, y2); else ctx.lineTo(x, y2) });
            ctx.stroke();
            ctx.fillStyle = ds.color;
            data.forEach(function(v, i) { var x = (i / (data.length - 1)) * w; var y2 = h - ((v - minValue) / (maxValue - minValue)) * h; ctx.beginPath(); ctx.arc(x, y2, 2, 0, Math.PI * 2); ctx.fill(); if (i === data.length - 1) { ctx.fillStyle = 'var(--dark-text-color)'; ctx.font = '8px Arial'; ctx.textAlign = 'center'; ctx.fillText(v, x - 10, y2 - 8); ctx.fillStyle = ds.color } })
        });
    }

    function toggleChartView() {
        var views = ['all','power','sinr','rsrq'];
        var ci = views.indexOf(smState.chartView);
        smState.chartView = views[(ci + 1) % views.length];
        var btn = document.getElementById('toggle_chart_btn');
        var names = { all:'全部', power:'RSRP', sinr:'SINR', rsrq:'RSRQ' };
        if (btn) btn.textContent = '视图: ' + names[smState.chartView];
        if (smState.chartVisible) drawSignalChart();
    }

    function toggleChartDisplay() {
        var el = document.getElementById('collapse_chart_content');
        var btn = document.getElementById('toggle_chart_display_btn');
        if (!el || !btn) return;
        if (el.getAttribute('data-name') === 'close') {
            el.style.height = 'auto'; el.setAttribute('data-name', 'open'); btn.textContent = '📊 隐藏图表'; smState.chartVisible = true;
            if (smState.chartData.power.length > 0) { var cp = document.getElementById('chart_placeholder'); if (cp) cp.style.display = 'none'; drawSignalChart() }
        } else {
            el.style.height = '0px'; el.style.overflow = 'hidden'; el.setAttribute('data-name', 'close'); btn.textContent = '📊 显示图表'; smState.chartVisible = false;
        }
    }

    function clearChartData() {
        smState.chartData = { power:[], sinr:[], rsrq:[], timestamps:[] };
        var cs = document.getElementById('chart_stats'); if (cs) cs.textContent = '数据点: 0';
        var cp = document.getElementById('chart_placeholder'); if (cp) cp.style.display = 'flex';
        if (smState.chartVisible) drawSignalChart();
    }

    function parseSignalFromPage() {
        return new Promise(function(resolve) {
            try {
                setTimeout(function() {
                    try {
                        var pageText = document.body.innerText;
                        var signalData = null;
                        var patterns = [
                            { power: pageText.match(/5G接收功率[：:\s]*(-?\d+)/), band: pageText.match(/5G注册频段[：:\s]*([^\s]+)/), sinr: pageText.match(/5G SINR[：:\s]*(-?\d+)/), rsrq: pageText.match(/5G RSRQ[：:\s]*(-?\d+)/), pci: pageText.match(/5G PCI[：:\s]*(\d+)/) },
                            { power: pageText.match(/RSRP[：:\s]*(-?\d+)/), band: pageText.match(/频段[：:\s]*([^\s]+)/), sinr: pageText.match(/SINR[：:\s]*(-?\d+)/), rsrq: pageText.match(/RSRQ[：:\s]*(-?\d+)/), pci: pageText.match(/PCI[：:\s]*(\d+)/) },
                            { power: pageText.match(/RSRP[:\s]*(-?\d+)/), band: pageText.match(/Band[:\s]*([^\s]+)/), sinr: pageText.match(/SINR[:\s]*(-?\d+)/), rsrq: pageText.match(/RSRQ[:\s]*(-?\d+)/), pci: pageText.match(/PCI[:\s]*(\d+)/) }
                        ];
                        for (var i = 0; i < patterns.length; i++) {
                            var p = patterns[i];
                            var vc = Object.values(p).filter(function(m){return m !== null}).length;
                            if (vc >= 3) {
                                signalData = { receivePower: p.power ? p.power[1] : null, band: p.band ? p.band[1] : null, sinr: p.sinr ? p.sinr[1] : null, rsrq: p.rsrq ? p.rsrq[1] : null, pci: p.pci ? p.pci[1] : null };
                                break;
                            }
                        }
                        if (signalData) {
                            if (signalData.receivePower && (signalData.receivePower > -50 || signalData.receivePower < -150)) signalData.receivePower = null;
                            if (signalData.sinr && (signalData.sinr > 50 || signalData.sinr < -10)) signalData.sinr = null;
                            if (signalData.rsrq && (signalData.rsrq > 0 || signalData.rsrq < -30)) signalData.rsrq = null;
                        }
                        var hasData = signalData && Object.values(signalData).some(function(v){return v !== null});
                        resolve(hasData ? signalData : null);
                    } catch(e) { resolve(null) }
                }, 150);
            } catch(e) { resolve(null) }
        });
    }

    async function fetchSignalData() {
        try {
            var signalData = await parseSignalFromPage();
            var isSimulated = false;
            if (!signalData) {
                isSimulated = true;
                var bp = smState.history.power.length > 0 ? smState.history.power[smState.history.power.length - 1] : -85;
                var bs = smState.history.sinr.length > 0 ? smState.history.sinr[smState.history.sinr.length - 1] : 20;
                var br = smState.history.rsrq.length > 0 ? smState.history.rsrq[smState.history.rsrq.length - 1] : -8;
                signalData = { receivePower: (bp - 2 + Math.random() * 4).toFixed(0), band: 'N78', sinr: (bs - 1 + Math.random() * 2).toFixed(0), rsrq: (br - 0.5 + Math.random() * 1).toFixed(0), pci: '313' };
            }
            updateBestValues(signalData);
            updateChartData(signalData);
            updateCurrentValues(signalData);
            calculateTrends(signalData);
            var scoreData = calculateOverallScore(signalData);
            var os = document.getElementById('overall_score'); if (os) os.textContent = scoreData.score;
            var sd = document.getElementById('score_description'); if (sd) sd.textContent = scoreData.description;
            smState.dataSource = isSimulated ? 'simulated' : 'parsing';
            smState.sampleCount++;
            smState.lastDataTime = new Date();
            updateSignalDisplay(signalData);
        } catch(e) { console.error('获取信号数据错误:', e) }
    }

    function updateSignalDisplay(data) {
        var dsi = document.getElementById('data_source_indicator');
        if (dsi) { dsi.textContent = smState.dataSource === 'parsing' ? '实时解析' : '模拟数据'; dsi.style.color = smState.dataSource === 'parsing' ? '#52ef58' : '#FF9800' }
        var sc = document.getElementById('sample_count'); if (sc) sc.textContent = smState.sampleCount;
        var lut = document.getElementById('last_update_time'); if (lut) lut.textContent = smState.lastDataTime ? smState.lastDataTime.toLocaleTimeString() : '-';

        if (data.receivePower) {
            var pq = getPowerQuality(data.receivePower);
            var sp = document.getElementById('signal_power'); if (sp) { sp.textContent = data.receivePower + ' dBm'; sp.style.color = '#52ef58' }
            var sq = document.getElementById('signal_quality'); if (sq) { sq.textContent = pq.quality; sq.style.color = 'var(--dark-text-color)' }
            var avgP = calculateAverage(smState.history.power, data.receivePower);
            var ap = document.getElementById('avg_power'); if (ap) { ap.textContent = avgP.toFixed(0) + ' dBm'; ap.style.color = '#52ef58' }
            var stp = document.getElementById('stability_power'); if (stp) { stp.textContent = getStabilityRating(smState.history.power, 'power'); stp.style.color = 'var(--dark-text-color)' }
            updateStatusDots('status_dots_power', data.receivePower, 'power');
        }
        if (data.sinr) {
            var sq2 = getSinrQuality(data.sinr);
            var ss = document.getElementById('signal_sinr'); if (ss) { ss.textContent = data.sinr; ss.style.color = '#2196F3' }
            var sq2e = document.getElementById('sinr_quality'); if (sq2e) { sq2e.textContent = sq2.quality; sq2e.style.color = 'var(--dark-text-color)' }
            var avgS = calculateAverage(smState.history.sinr, data.sinr);
            var as = document.getElementById('avg_sinr'); if (as) { as.textContent = avgS.toFixed(0); as.style.color = '#2196F3' }
            var sts = document.getElementById('stability_sinr'); if (sts) { sts.textContent = getStabilityRating(smState.history.sinr, 'sinr'); sts.style.color = 'var(--dark-text-color)' }
            updateStatusDots('status_dots_sinr', data.sinr, 'sinr');
        }
        if (data.rsrq) {
            var rq = getRsrqQuality(data.rsrq);
            var sr = document.getElementById('signal_rsrq'); if (sr) { sr.textContent = data.rsrq + ' dB'; sr.style.color = '#FF9800' }
            var rqe = document.getElementById('rsrq_quality'); if (rqe) { rqe.textContent = rq.quality; rqe.style.color = 'var(--dark-text-color)' }
            var avgR = calculateAverage(smState.history.rsrq, data.rsrq);
            var ar = document.getElementById('avg_rsrq'); if (ar) { ar.textContent = avgR.toFixed(0) + ' dB'; ar.style.color = '#FF9800' }
            var str = document.getElementById('stability_rsrq'); if (str) { str.textContent = getStabilityRating(smState.history.rsrq, 'rsrq'); str.style.color = 'var(--dark-text-color)' }
            updateStatusDots('status_dots_rsrq', data.rsrq, 'rsrq');
        }
    }

    function getCurrentInterval() {
        var sel = document.getElementById('update_interval_select');
        return sel ? parseInt(sel.value) : 1000;
    }

    function restartMonitoring() {
        if (smState.isMonitoring) {
            clearInterval(smState.monitorInterval);
            smState.monitorInterval = setInterval(fetchSignalData, getCurrentInterval());
        }
    }

    function toggleAutoMonitor() {
        if (smState.isMonitoring) {
            clearInterval(smState.monitorInterval);
            var btn = document.getElementById('auto_monitor_btn');
            if (btn) { btn.textContent = '开始监控'; btn.style.background = '#666' }
            smState.isMonitoring = false;
        } else {
            smState.monitorInterval = setInterval(fetchSignalData, getCurrentInterval());
            var btn2 = document.getElementById('auto_monitor_btn');
            if (btn2) { btn2.textContent = '监控中'; btn2.style.background = '#52ef58' }
            smState.isMonitoring = true;
        }
    }

    function initSignalMonitor() {
        initializeStatusDots();
        var rsb = document.getElementById('refresh_signal_btn'); if (rsb) rsb.onclick = fetchSignalData;
        var amb = document.getElementById('auto_monitor_btn'); if (amb) amb.onclick = toggleAutoMonitor;
        var uis = document.getElementById('update_interval_select'); if (uis) uis.onchange = restartMonitoring;
        var tcb = document.getElementById('toggle_chart_btn'); if (tcb) tcb.onclick = toggleChartView;
        var tdb = document.getElementById('toggle_chart_display_btn'); if (tdb) tdb.onclick = toggleChartDisplay;
        fetchSignalData();
        smState.monitorInterval = setInterval(fetchSignalData, getCurrentInterval());
    }

    // Set up collapse toggle
    if (typeof collapseGen === 'function') {
        collapseGen('#collapse_signal_btn', '#collapse_signal', '#collapse_signal', function() {});
    } else {
        var collapseBtn = document.getElementById('collapse_signal_btn');
        var collapseElement = document.getElementById('collapse_signal');
        if (collapseBtn && collapseElement) {
            collapseBtn.innerHTML = '<button class="btn" style="padding: 2px 4px; font-size: .8rem;">展开</button>';
            collapseBtn.onclick = function() {
                var isClosed = collapseElement.getAttribute('data-name') === 'close';
                if (isClosed) {
                    collapseElement.style.height = 'auto'; collapseElement.setAttribute('data-name', 'open');
                    collapseBtn.innerHTML = '<button class="btn" style="padding: 2px 4px; font-size: .8rem;">收起</button>';
                } else {
                    collapseElement.style.height = '0px'; collapseElement.setAttribute('data-name', 'close');
                    collapseBtn.innerHTML = '<button class="btn" style="padding: 2px 4px; font-size: .8rem;">展开</button>';
                }
            };
        }
    }

    // Auto-start monitoring when loaded
    setTimeout(initSignalMonitor, 500);
    SDM.addDiagLog('5G信号监控模块已加载', 'success');

    // Module lifecycle
    SDM.emit('module:ready', MODULE_ID);
    SDM.on('module:unload', function(id) {
        if (id === MODULE_ID) {
            if (smState.monitorInterval) clearInterval(smState.monitorInterval);
            var panel = document.getElementById('sdm-panel-' + MODULE_ID);
            if (panel) panel.remove();
        }
    });
})(window.SDM);
//@@SDM_MODULE_signal-monitor_END@@
