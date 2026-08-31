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

    // ═══════════════════════════════════════════════════════════════════════════
    // ===== 桌面悬浮AI宠物模块 ★ 新增 =====
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
    }, 1500);
    // ===== 桌面悬浮AI宠物模块 END =====


} catch(initErr) {
    console.error('[SmartDeviceManager] 初始化错误:', initErr)
    try { createToast('插件初始化出错: '+initErr, 'red', 8000) } catch(e) {}
}
})()

// ═══════════════════════════════════════════════════════════════════════════
// 热点流量监控模块（集成自 hotspot_traffic 2.0，已剔除QQ群号与自动更新机制）
// GitHub资源：qybgh/UFI-TOOLS-assets / hotspot_traffic/
//   _latest.json → rev 1.0.4
//   guard_v1.0.3 → 守护进程二进制
//   diag_v1.0.2  → 诊断工具二进制
//   v1.0.2.js    → 插件主代码（已内置，无需远程拉取）
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
    const REQUIRED_APIS = ['runShellWithRoot', 'createToast', 'createFixedToast', 'saveConfig', 'checkAdvancedFunc', 'collapseGen', 'createModal', 'showModal', 'getUFIData', 'getCustomHead'];
    const missingApis = REQUIRED_APIS.filter((n) => {
        try { return typeof eval(n) !== 'function'; } catch { return true; }
    });
    if (missingApis.length) {
        const tip = 'UFI-TOOLS 版本过低，缺少 API: ' + missingApis.join(', ') + '，请升级到最新版本后再使用本插件';
        try { typeof createToast === 'function' ? createToast(tip, 'red', 6000) : alert(tip); } catch { try { alert(tip); } catch { } }
        return;
    }

    // ─── constants ────────────────────────────────────────────────────────────
    const _PREV_VER = '';
    const NAME = 'hotspot_traffic';
    const MODAL = 'hotspot_traffic_panel';
    const STYLE = 'hotspot_traffic_style';
    const LS_KEY = 'hotspot_traffic_';
    const DATA_DIR = '/data/hotspot_traffic';
    const DATA_FILE = `${DATA_DIR}/data.json`;
    const DIAG_RESULT_FILE = `${DATA_DIR}/diag_result.json`;
    const LAST_REPORT_TS_FILE = `${DATA_DIR}/_last_report_ts`;
    const JQ = '/data/data/com.minikano.f50_sms/files/jq';
    const POLICY_FILE = DATA_DIR + '/device_policy.json';
    const POLICY_TRIGGER = DATA_DIR + '/.policy_trigger';
    const DIAG_LOCK_FILE = `${DATA_DIR}/diag.lock`;
    const LOG_FILE = '/sdcard/hotspot_traffic_log.log';
    const DIAG_BIN_FILE = '/sdcard/hotspot_diag';
    const TRAFFIC_PROC = '/data/local/tmp/hotspot_traffic';
    const DIAG_PROC = '/data/local/tmp/hotspot_diag';
    const PID_FILE = `${DATA_DIR}/.pid`;
    const BOOT_SH_FILE = '/sdcard/ufi_tools_boot.sh';
    const BOOT_LINE = `cp /sdcard/hotspot_traffic ${TRAFFIC_PROC} && chmod 755 ${TRAFFIC_PROC} && nohup ${TRAFFIC_PROC} >/dev/null 2>&1 &`;
    const WEBHOOK_FILE = `${DATA_DIR}/.webhook`;
    const DIAG_COOLDOWN = 1000 * 60 * 5;
    const REPORT_COOLDOWN = 1000 * 60 * 15;
    const CDN_ORIGIN = 'cdn.jsdelivr.net';
    const CDN_MIRRORS = ['cdn.jsdmirror.com','jsd.onmicrosoft.cn'];
    const GH_VERSION_BASE = `https://${CDN_ORIGIN}/gh/qybgh/UFI-TOOLS-assets@refs/heads/main/hotspot_traffic/`;
    const CDN_RETRY_PER_NODE = 3;
    const CDN_RETRY_DELAY = 800;
    let _probedBestNode = null;
    const TRAFFIC_BIN_FILE = '/sdcard/hotspot_traffic';
    const PENDING_JS_FILE = '/data/local/tmp/_ht_pending.js';

    const cdnUrlForNode = (url, node) => url ? url.replace(CDN_ORIGIN, node) : url;



    const _M = [0x4b,0x41,0x4e,0x4f,0x5f,0x50,0x4c,0x55,0x47,0x49,0x4e].map(c=>String.fromCharCode(c)).join('');
    const _PS = `<!-- [${_M}_START]`;
    const _PE = `<!-- [${_M}_END]`;
    const _SIG = '@@HT_PLUGIN_ID:7f3a9c@@';
    let _dataEvtBound = false;

    // ─── utils ────────────────────────────────────────────────────────────────
    const sq = (v) => `'${String(v ?? '').replace(/'/g, `'\''`)}'`;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const esc = (v) => String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const parseTs = (ts) => ts ? new Date(String(ts).replace(' ', 'T')).getTime() : NaN;
    const run = async (cmd, timeout = 30000) => {
        try {
            const r = await runShellWithRoot(cmd, timeout);
            return r || { success: false, content: '' };
        } catch (e) {
            console.warn('[HT] run error:', e?.message || e);
            return { success: false, content: '', error: e?.message || String(e) };
        }
    };

    const CURL_ERR_MAP = { 6:'网络域名解析失败', 7:'无法连接到服务器', 22:'服务器返回错误', 28:'网络连接超时', 35:'网络安全连接失败', 56:'网络连接中断（网络不稳定，可稍后重试）', 92:'HTTP/2帧错误（网络异常）' };
    const curlErrText = (c) => CURL_ERR_MAP[parseInt(c)] || ('网络传输异常(码' + c + ')');
    const CURL_WK = '--connect-timeout 8 --max-time 60 --speed-limit 1 --speed-time 45';
    const CURL_RESUME_ECS = new Set(['18','28','56','92']);
    const htErr = (userMsg, detail) => { const e = new Error(userMsg); e.htDetail = String(detail ?? ''); return e; };
    const cdnRetry = async (fn) => {
        const bestNode = await probeBestCdn();
        const candidates = [bestNode, ...CDN_MIRRORS.filter(m => m !== bestNode), CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);
        let lastErr = null;
        for (let n = 0; n < candidates.length; n++) {
            const node = candidates[n];
            const retries = n === 0 ? CDN_RETRY_PER_NODE : 2;
            for (let r = 0; r < retries; r++) {
                try { return await fn(node, r, r === 0); }
                catch (e) {
                    lastErr = e;
                    if (r < retries - 1) await wait(CDN_RETRY_DELAY * Math.pow(2, r));
                }
            }
        }
        if (lastErr && typeof lastErr === 'object') lastErr.htAttempts = candidates.reduce((s, _, i) => s + (i === 0 ? CDN_RETRY_PER_NODE : 2), 0);
        throw lastErr;
    };

    const policySet = async (mac, type) => {
        await run(`[ -s ${sq(POLICY_FILE)} ] || printf '{}' > ${sq(POLICY_FILE)}`);
        const r = await run(`timeout 2s ${sq(JQ)} -c --arg m ${sq(mac)} --arg t ${sq(type)} '.[$m]={"type":$t}' ${sq(POLICY_FILE)} > ${sq(POLICY_FILE)}.tmp && mv ${sq(POLICY_FILE)}.tmp ${sq(POLICY_FILE)} && printf 1 > ${sq(POLICY_TRIGGER)} && echo __OK__ || { rm -f ${sq(POLICY_FILE)}.tmp; echo __FAIL__; }`);
        return { success: (r?.content || '').includes('__OK__'), content: r?.content };
    };

    const policyRemove = async (mac) => {
        await run(`[ -s ${sq(POLICY_FILE)} ] || printf '{}' > ${sq(POLICY_FILE)}`);
        const r = await run(`timeout 2s ${sq(JQ)} -c --arg m ${sq(mac)} 'del(.[$m])' ${sq(POLICY_FILE)} > ${sq(POLICY_FILE)}.tmp && mv ${sq(POLICY_FILE)}.tmp ${sq(POLICY_FILE)} && printf 1 > ${sq(POLICY_TRIGGER)} && echo __OK__ || { rm -f ${sq(POLICY_FILE)}.tmp; echo __FAIL__; }`);
        return { success: (r?.content || '').includes('__OK__'), content: r?.content };
    };

    const loadPolicyMap = async () => {
        const r = await run(`timeout 1s ${sq(JQ)} -r 'to_entries[] | "\\(.key)|\\(.value.type // "normal")"' ${sq(POLICY_FILE)} 2>/dev/null || echo ''`, 3000);
        const map = {};
        String(r?.content || '').trim().split('\n').forEach(line => {
            if (!line) return;
            const [mac, type] = line.split('|');
            if (mac && type && type !== 'normal') map[mac] = { type };
        });
        state.policyMap = map;
    };

    // ─── state ────────────────────────────────────────────────────────────────
    const state = {
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


    let _manifest = null;
    let _lastManifestErr = '';
    const probeBestCdn = async () => {
        if (_probedBestNode) return _probedBestNode;
        const candidates = [CDN_ORIGIN, ...CDN_MIRRORS];
        const results = [];
        for (const node of candidates) {
            const testUrl = `https://${node}/gh/qybgh/UFI-TOOLS-assets@refs/heads/main/hotspot_traffic/_latest.json?_=${Date.now()}`;
            const start = Date.now();
            const r = await run(
                `curl -sL --connect-timeout 3 --max-time 5 -w '%{http_code}' -o /dev/null ${sq(testUrl)}`, 8000
            ).catch(() => ({ content: '0' }));
            const elapsed = Date.now() - start;
            if (String(r?.content || '').trim() === '200') results.push({ node, rtt: elapsed });
        }
        _probedBestNode = results.length > 0
            ? results.sort((a, b) => a.rtt - b.rtt)[0].node
            : CDN_MIRRORS[0];
        return _probedBestNode;
    };

    const fetchManifestWithProbe = async (jsonFileName, node, retries) => {
        const bestNode = node || await probeBestCdn();
        const url = GH_VERSION_BASE.replace(CDN_ORIGIN, bestNode) + jsonFileName + '?_=' + Date.now();
        const tmp = '/data/local/tmp/_ht_manifest.tmp';
        const maxR = retries || 3;
        const codes = [];
        await run(`rm -f ${sq(tmp)}`, 1000);
        for (let retry = 0; retry < maxR; retry++) {
            const resumeFlag = retry > 0 ? '-C - ' : '';
            const dlR = await run(
                `curl -sL --fail ${resumeFlag}${CURL_WK} ${sq(url)} -o ${sq(tmp)}; ec=$?; [ "$ec" -eq 0 ] && echo __OK__ || echo "__FAIL__:$ec"`, 45000);
            const out = String(dlR?.content || '');
            if (out.includes('__OK__')) {
                const rd = await run(`cat ${sq(tmp)}`, 3000);
                const text = String(rd?.content || '').trim();
                await run(`rm -f ${sq(tmp)}`, 1000);
                if (text && text[0] === '{') {
                    try {
                        const j = JSON.parse(text);
                        if (j.rev && j.guard && j.diag && j.deploy && j.js) return j;
                        codes.push('bad_fields');
                    } catch { codes.push('json_err'); }
                } else { codes.push('not_json'); }
            } else {
                const m = out.match(/__FAIL__:(\d+)/);
                codes.push(m?.[1] || '?');
                if (!CURL_RESUME_ECS.has(m?.[1])) await run(`rm -f ${sq(tmp)}`, 1000);
            }
            if (retry < maxR - 1) await wait(CDN_RETRY_DELAY * Math.pow(2, retry));
        }
        await run(`rm -f ${sq(tmp)}`, 1000);
        _lastManifestErr = bestNode + ':' + jsonFileName + '=[' + codes.join(',') + ']';
        return null;
    };

    const fetchManifestAllNodes = async (jsonFile) => {
        const errs = [];
        let raw = await fetchManifestWithProbe(jsonFile);
        if (raw) return raw;
        errs.push(_lastManifestErr);
        const nodes = [CDN_ORIGIN, ...CDN_MIRRORS].filter(n => n !== _probedBestNode);
        for (const n of nodes) {
            raw = await fetchManifestWithProbe(jsonFile, n, 2);
            if (raw) return raw;
            errs.push(_lastManifestErr);
        }
        _lastManifestErr = errs.join(' | ');
        return null;
    };

    const parseManifest = (j) => {
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

    const downloadDeployScript = async (url, progress) => {
        const bin = '/data/local/tmp/ht_deploy';
        const b64 = bin + '.b64';
        await cdnRetry(async (node, retryIdx, isNewNode) => {
            if (retryIdx > 0 || node !== _probedBestNode) progress('dl_deploy', 'running', '重试');
            const _url = cdnUrlForNode(url, node);
            if (isNewNode) await run(`rm -f ${sq(b64)}`, 2000);
            const resumeFlag = !isNewNode ? '-C - ' : '';
            const dlR = await run(
                `curl -sL --fail ${resumeFlag}${CURL_WK} ${sq(_url)} -o ${sq(b64)}; ec=$?; [ "$ec" -eq 0 ] && echo __DL_OK__ || echo "__DL_FAIL__:$ec"`, 75000);
            if (!String(dlR?.content || '').includes('__DL_OK__')) {
                const m = String(dlR?.content || '').match(/__DL_FAIL__:(\d+)/);
                if (!CURL_RESUME_ECS.has(m?.[1])) await run(`rm -f ${sq(b64)}`, 2000);
                throw htErr('部署脚本下载失败', curlErrText(m?.[1] || '?'));
            }
            const chk = await run(`_i=$(tr -d 'A-Za-z0-9+/=\\n\\r' < ${sq(b64)} | wc -c); _s=$(wc -c < ${sq(b64)}); echo "$_i|$_s"`, 5000);
            const [inv, sz] = String(chk?.content || '').trim().split('|');
            if (parseInt(inv || '1') > 0 || parseInt(sz || '0') < 200) {
                await run(`rm -f ${sq(b64)}`, 2000);
                throw htErr('部署脚本格式异常');
            }
            const dec = await run(`base64 -d ${sq(b64)} > ${sq(bin)} && rm -f ${sq(b64)} && echo __OK__`, 10000);
            if (!String(dec?.content || '').includes('__OK__')) throw htErr('部署脚本解码失败');
        });
        await run(`chmod 755 ${sq(bin)}`);
        return bin;
    };

    // ─── helpers ──────────────────────────────────────────────────────────────
    const getCustomName = (mac) => localStorage.getItem(LS_KEY + 'name_' + mac) || '';
    const setCustomName = (mac, name) => {
        if (name.trim()) localStorage.setItem(LS_KEY + 'name_' + mac, name.trim());
        else localStorage.removeItem(LS_KEY + 'name_' + mac);
    };
    const htFormatBytes = (bytes) => {
        const num = parseInt(bytes) || 0;
        const sign = num < 0 ? '-' : '';
        const abs = Math.abs(num);
        if (abs >= 1099511627776) return sign + (abs / 1099511627776).toFixed(2) + ' TB';
        if (abs >= 1073741824) return sign + (abs / 1073741824).toFixed(2) + ' GB';
        if (abs >= 1048576) return sign + (abs / 1048576).toFixed(1) + ' MB';
        if (abs >= 1024) return sign + (abs / 1024).toFixed(0) + ' KB';
        return sign + abs + ' B';
    };

    const htFormatRate = (bps) => htFormatBytes(bps) + '/s';
    const renderTrafficRateCell = (device, total, tx, rx) => `<span>${esc(htFormatBytes(total))} <span style="font-size:.48rem;opacity:.7;white-space:nowrap">↑${esc(htFormatBytes(tx))} ↓${esc(htFormatBytes(rx))}</span></span> <span class="ht-rate-seg" style="font-size:.48rem;opacity:.85;white-space:nowrap"><span class="ht-up">↑${esc(htFormatRate(device.txRateBps))}</span> <span class="ht-down">↓${esc(htFormatRate(device.rxRateBps))}</span></span>`;

    const maskMac = (mac) => {
        if (!mac || typeof mac !== 'string') return mac || '';
        const parts = mac.split(':');
        if (parts.length !== 6) return mac;
        return `${parts[0]}:${parts[1]}:**:**:**:${parts[5]}`;
    };

    const sortDevices = (devicesMap) => Object.values(devicesMap || {}).sort((a, b) => {
        if (a.online && !b.online) return -1;
        if (!a.online && b.online) return 1;
        return ((b.rxBytes || 0) + (b.txBytes || 0)) - ((a.rxBytes || 0) + (a.txBytes || 0));
    });

    const calcSummaryMetrics = (summary, deviceList) => {
        const sysDelta = summary.sysDeltaBytes || 0;
        const iptTotal = summary.iptTotalBytes || 0;
        const iptV4 = summary.iptTotalV4Bytes || 0;
        const iptV6 = summary.iptTotalV6Bytes || 0;
        const onlineCount = deviceList.filter(d => d.online).length;
        const deviceCount = summary.deviceCount || 0;
        const deviceTotalBytes = summary.deviceTotalBytes || 0;
        const sysTxDelta = summary.sysDeltaTxBytes || 0;
        const sysRxDelta = summary.sysDeltaRxBytes || 0;
        const diffSigned = sysDelta - iptTotal;
        const diffAbs = Math.abs(diffSigned);
        const unattrSigned = iptTotal - deviceTotalBytes;
        const unattrAbs = Math.abs(unattrSigned);
        const startMs = parseTs(summary.scriptStartAt);
        const runtimeSec = Number.isFinite(startMs) ? Math.max(0, (Date.now() - startMs) / 1000) : 0;
        const isWarmup = runtimeSec < 1800 || sysDelta < 104857600;
        const diffThreshold = Math.max(sysDelta * 0.1, 10485760);
        const unattrThreshold = Math.max(iptTotal * 0.3, 10485760);
        const diffCls = (diffSigned < 0) ? 'ht-status-alert' : isWarmup ? 'ht-status-info' : (diffAbs > diffThreshold ? 'ht-status-warn' : 'ht-status-ok');
        const unattrCls = (unattrSigned < 0) ? 'ht-status-alert' : isWarmup ? 'ht-status-info' : (unattrAbs > unattrThreshold ? 'ht-status-warn' : 'ht-status-ok');
        const deviceTxBytes = deviceList.reduce((s, d) => s + (d.txBytes || 0), 0);
        const deviceRxBytes = deviceList.reduce((s, d) => s + (d.rxBytes || 0), 0);
        return { sysDelta, iptTotal, iptV4, iptV6, onlineCount, deviceCount, deviceTotalBytes, sysTxDelta, sysRxDelta, diffSigned, unattrSigned, diffCls, unattrCls, deviceTxBytes, deviceRxBytes };
    };

    const summaryHtmls = (m) => {
        const _pv = Object.values(state.policyMap);
        const blCount = _pv.filter(p => p.type === 'blacklist').length;
        return [
            `<div class="ht-summary-val">${esc(htFormatBytes(m.sysDelta))}</div>${(m.sysTxDelta || m.sysRxDelta) ? renderUlDl(m.sysTxDelta, m.sysRxDelta) : ''}<div class="ht-summary-lbl">系统增量</div>`,
            `<div class="ht-summary-val">${esc(htFormatBytes(m.iptTotal))} <span style="font-size:.48rem;opacity:.7">偏差:<span class="${m.diffCls}">${esc(htFormatBytes(m.diffSigned))}</span></span></div><div style="font-size:.48rem;opacity:.7;white-space:nowrap">v4:<span class="ht-up">${esc(htFormatBytes(m.iptV4))}</span> v6:<span class="ht-down">${esc(htFormatBytes(m.iptV6))}</span></div><div class="ht-summary-lbl">热点合计</div>`,
            `<div class="ht-summary-val">在线 <span class="${m.onlineCount > 0 ? 'ht-status-ok' : 'ht-muted'}">${m.onlineCount}</span> / 总 ${m.deviceCount}</div>${blCount ? `<div style="font-size:.48rem;opacity:.7;white-space:nowrap">拉黑 <span class="ht-status-alert">${blCount}</span></div>` : ''}<div class="ht-summary-lbl">接入设备</div>`,
            `<div class="ht-summary-val">${esc(htFormatBytes(m.deviceTotalBytes))} <span style="font-size:.48rem;opacity:.7">未归属:<span class="${m.unattrCls}">${esc(htFormatBytes(m.unattrSigned))}</span></span></div>${renderUlDl(m.deviceTxBytes, m.deviceRxBytes)}<div class="ht-summary-lbl">设备合计</div>`,
        ];
    };

    const resolveDisplayName = (device) => {
        const customName = getCustomName(device.mac);
        const hostname = (device.hostname || '').trim();
        return customName || hostname || '未知设备';
    };

    // ─── config read/write ────────────────────────────────────────────────────
    const readStatus = async () => {
        const result = await run(`
echo __BOOT__
timeout 2s awk '{print}' ${sq(BOOT_SH_FILE)} 2>/dev/null || true
echo __PROC__
_p=$(timeout 1s awk '{print}' ${sq(PID_FILE)} 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && echo running=1 || echo running=0
echo __DATA__
timeout 3s awk '{print}' ${sq(DATA_FILE)} 2>/dev/null || true
echo __VER__
timeout 2s awk '{print}' ${sq(DATA_DIR + '/.version')} 2>/dev/null || true
`);
        const text = String(result?.content || '');
        const bootPart = text.includes('__BOOT__') ? text.split('__BOOT__')[1].split('__PROC__')[0] : '';
        const procPart = text.includes('__PROC__') ? text.split('__PROC__')[1].split('__DATA__')[0] : '';
        const dataPart = text.includes('__DATA__') ? text.split('__DATA__')[1].split('__VER__')[0] : '';
        const verPart = text.includes('__VER__') ? text.split('__VER__')[1].trim() : '';
        state._deviceVersion = verPart || '';
        state.installed = bootPart.includes(NAME) && procPart.includes('running=1');
        if (dataPart.trim()) {
            try {
                const parsed = JSON.parse(dataPart.trim());
                if (parsed && parsed.devices && typeof parsed.devices === 'object') {
                    state.dataCache = parsed;
                    state.lastUpdated = parsed.updatedAt || '';
                    state.summary = parsed.summary || null;
                }
            } catch { }
        }
    };

    // ─── install / uninstall ──────────────────────────────────────────────────
    let _recoverTried = false;
    const recoverDaemonOnce = async () => {
        if (_recoverTried || state.installed) return;
        _recoverTried = true;
        const r = await run(`grep -q ${sq(NAME)} ${sq(BOOT_SH_FILE)} 2>/dev/null || exit 0; _p=$(timeout 1s awk '{print}' ${sq(PID_FILE)} 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && echo __ALIVE__ || echo __DEAD__`, 5000);
        if (!String(r?.content || '').includes('__DEAD__')) return;
        await run(`cp /sdcard/hotspot_traffic ${TRAFFIC_PROC} && chmod 755 ${TRAFFIC_PROC} && nohup ${TRAFFIC_PROC} >/dev/null 2>&1 &`, 10000);
        await wait(1500);
        await readStatus();
        if (state.installed) createToast('检测到后台服务已停止，已自动恢复', 'green');
    };

    const cleanResidue = async () => {
        try {
            await run(`
_p=$(awk '{print}' ${sq(PID_FILE)} 2>/dev/null)
if [ -n "$_p" ]; then
kill -15 "$_p" 2>/dev/null
_i=0; while kill -0 "$_p" 2>/dev/null && [ "$_i" -lt 15 ]; do sleep 0.1; _i=$((_i+1)); done
_ep=$(awk '{print}' ${sq(DATA_DIR + '/.engine_pid')} 2>/dev/null)
[ -n "$_ep" ] && kill -9 "$_ep" 2>/dev/null
_tp=$(awk '{print}' ${sq(DATA_DIR + '/.tcpdump_pid')} 2>/dev/null)
[ -n "$_tp" ] && kill -9 "$_tp" 2>/dev/null
kill -9 "$_p" 2>/dev/null
fi
rm -f ${sq(PID_FILE)} ${sq(DATA_DIR + '/.engine_pid')} ${sq(DATA_DIR + '/.tcpdump_pid')}
rm -rf ${sq(DATA_DIR + '/.lock_dir')}
sed -i '/${NAME}/d' ${sq(BOOT_SH_FILE)} 2>/dev/null
rm -f /sdcard/hotspot_traffic /sdcard/hotspot_diag ${sq(LOG_FILE)} ${TRAFFIC_PROC} ${DIAG_PROC}
rm -rf ${sq(DATA_DIR)}
mkdir -p ${sq(DATA_DIR)}
`, 10000);
        } catch (e) { console.error('cleanResidue:', e); }
    };

    const pollDeployHeartbeat = (progress, timeoutMs = 120000) => {
        return new Promise((resolve, reject) => {
            const startTs = Date.now();
            const hbFile = DATA_DIR + '/.deploy_heartbeat';
            let readLines = 0, lastBeatTs = Date.now(), hadBeat = false;
            const poll = setInterval(async () => {
                if (Date.now() - startTs > timeoutMs) { clearInterval(poll); reject(htErr('部署超时(' + Math.round((Date.now() - startTs) / 1000) + 's)')); return; }
                if (Date.now() - lastBeatTs > 70000) { clearInterval(poll); reject(htErr('后台无响应(心跳中断' + Math.round((Date.now() - lastBeatTs) / 1000) + 's)')); return; }
                const r = await run(`awk -v s=${readLines} 'NR>s' ${sq(hbFile)} 2>/dev/null`, 2000);
                const content = String(r?.content || '').trim();
                if (!content) {
                    if (hadBeat) {
                        const chk = await run(`[ -f ${sq(hbFile)} ] && echo 1`, 1000);
                        if (!String(chk?.content || '').trim()) {
                            clearInterval(poll); reject(htErr('后台进程异常终止')); return;
                        }
                    }
                    return;
                }
                const lines = content.split('\n');
                readLines += lines.length;
                lastBeatTs = Date.now();
                hadBeat = true;
                for (const line of lines) {
                    const parts = line.split('|');
                    const step = parts[1], status = parts[2], detail = parts[3] || '';
                    if (['running','done','warn'].includes(status)) progress(step, status, detail);
                    if (status === 'failed') { progress(step, 'failed', detail); clearInterval(poll); const _e = htErr(detail || step); _e.htStep = step; reject(_e); return; }
                    if (step === 'complete' && status === 'done') { clearInterval(poll); resolve(); return; }
                }
            }, 500);
        });
    };

    const executeDeploy = async (deployBin, manifest, prevVer, progress) => {
        await run(`rm -f ${sq(DATA_DIR + '/.deploy_heartbeat')}`);
        const bestNode = await probeBestCdn();
        const allNodes = [bestNode, ...CDN_MIRRORS.filter(m => m !== bestNode), CDN_ORIGIN].filter((v, i, a) => a.indexOf(v) === i);
        const mirrors = allNodes.join(' ');
        const cmd = [sq(deployBin), sq(manifest.version),
            sq(manifest.guardUrl), sq(manifest.diagUrl),
            sq(manifest.jsUrl), sq(manifest.md5),
            sq(prevVer), sq(mirrors)].join(' ');
        const proc = run(cmd, 120000);
        await pollDeployHeartbeat(progress);
        await proc;
        await run(`rm -f ${sq(deployBin)}`);

    };

    // ─── 启用/更新进度弹窗 ───
    const DEPLOY_STEPS = [
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
    const UPDATE_DEPLOY_STEPS = DEPLOY_STEPS.filter(s => s.id !== 'env');
    const VERIFY_STEP = { id: 'verify', label: '校验完整性' };

    const showFlowProgress = (title, steps, failPrefix = '启用失败') => {
        document.querySelector('#ht_flow_progress')?.remove();
        const st = {};
        const stHint = {};
        steps.forEach(s => { st[s.id] = 'pending'; stHint[s.id] = ''; });
        let failInfo = null;
        let finished = false;
        const ICONS = {
            pending: '<span style="color:#94a3b8;flex-shrink:0">○</span>',
            running: '<span style="flex-shrink:0;display:inline-block;animation:ht_spin 1s linear infinite">⏳</span>',
            done: '<span style="color:#86efac;flex-shrink:0">✓</span>',
            warn: '<span style="color:#fbbf24;flex-shrink:0">!</span>',
            failed: '<span style="color:#f87171;flex-shrink:0">✗</span>',
        };
        const renderBody = () => {
            const doneN = steps.filter(s => st[s.id] === 'done').length;
            const pct = finished ? 100 : Math.round(doneN / steps.length * 100);
            const rows = steps.map(s => `<div style="display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:5px;font-size:.62rem;line-height:1.5;${st[s.id] === 'running' ? 'background:rgba(59,130,246,.15);' : ''}">${ICONS[st[s.id]] || ICONS.pending}<span>${esc(s.label)}${stHint[s.id] ? ' <span style="opacity:.6;font-size:.56rem">(' + esc(stHint[s.id]) + ')</span>' : ''}</span></div>`).join('');
            let failHtml = '';
            if (failInfo) {
                failHtml = `
                <div style="margin-top:8px;color:#f87171;font-size:.62rem;line-height:1.6">${esc(failPrefix)}：${esc(failInfo.userMsg)}</div>
                <div style="margin-top:6px"><button id="ht_flow_detail_btn" style="font-size:.58rem">查看详细信息</button></div>
                <div id="ht_flow_detail" style="display:none;margin-top:6px;font-family:monospace;font-size:.52rem;max-height:22vh;overflow-y:auto;word-break:break-all;background:rgba(0,0,0,.3);border-radius:6px;padding:8px">${failInfo.detailHtml}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button id="ht_flow_retry" style="font-size:.62rem;padding:5px 14px;border-radius:7px;border:1px solid rgba(34,197,94,.4);background:rgba(34,197,94,.25);color:#86efac;cursor:pointer;">重试</button><button id="ht_flow_close" style="font-size:.62rem;padding:5px 14px;border-radius:7px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:inherit;cursor:pointer;">关闭</button></div>`;
            }
            return `
                <div class="title" style="margin:0;display:flex;align-items:center;justify-content:space-between">${esc(title)}</div>
                <div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:8px 0;overflow:hidden"><div style="height:100%;width:${pct}%;background:#4ade80;border-radius:2px;transition:width .3s"></div></div>
                <div>${rows}</div>${failHtml}`;
        };
        const { el, close } = createFixedToast('ht_flow_progress', `<div id="ht_flow_box" style="pointer-events:all;width:88vw;max-width:380px"></div>`);
        const box = el.querySelector('#ht_flow_box');
        const redraw = () => {
            box.innerHTML = renderBody();
            const db = box.querySelector('#ht_flow_detail_btn');
            if (db) db.onclick = () => { const d = box.querySelector('#ht_flow_detail'); if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none'; };
            const rb = box.querySelector('#ht_flow_retry');
            if (rb) rb.onclick = () => { close(); if (typeof failInfo?.onRetry === 'function') failInfo.onRetry(); };
            const cb = box.querySelector('#ht_flow_close');
            if (cb) cb.onclick = () => close();
        };
        redraw();
        return {
            setStep: (id, status, hint) => { if (st[id] !== undefined) { st[id] = status; stHint[id] = hint || ''; redraw(); } },
            addStep: (afterId, stepDef) => { const idx = steps.findIndex(s => s.id === afterId); if (idx === -1) return; steps.splice(idx + 1, 0, stepDef); st[stepDef.id] = 'pending'; stHint[stepDef.id] = ''; redraw(); },
            fail: (id, userMsg, detail, onRetry) => {
                if (st[id] !== undefined) st[id] = 'failed';
                const detailHtml = esc(new Date().toLocaleString() + ' | 插件版本: ' + (_PREV_VER || '初装') + '→' + (_manifest?.version || '?') + ' | 阶段: ' + id + ' | 详情: ' + (detail || '(无)') + ' | UA: ' + (navigator.userAgent || '').slice(0, 80) + ((navigator.userAgent || '').length > 80 ? '…' : ''));
                failInfo = { userMsg, detailHtml, onRetry };
                redraw();
            },
            done: () => {
                steps.forEach(s => { if (st[s.id] !== 'warn') st[s.id] = 'done'; });
                finished = true; failInfo = null; redraw();
                setTimeout(close, 800);
            },
            close,
        };
    };

    const install = async () => {
        if (state._installing) return createToast('正在启用中，请稍候', 'yellow');
        if (!(await checkAdvancedFunc())) return createToast('没有开启高级功能，无法使用！', 'red');
        state._installing = true;
        const flow = showFlowProgress('启用热点流量监控', DEPLOY_STEPS);
        let curStep = 'env';
        const at = (id) => { curStep = id; flow.setStep(id, 'running'); };
        const ok = (id) => flow.setStep(id, 'done');
        try {
            at('env');
            const probeR = await run(`iptables -w 5 -L FORWARD -n 2>&1 && echo __OK__`, 8000);
            if (!String(probeR?.content || '').includes('__OK__'))
                throw htErr('设备网络组件检查未通过', String(probeR?.content || '').trim().slice(0, 200));
            ok('env');

            at('manifest');
            let rawManifest = await fetchManifestAllNodes(
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
            await run(`mkdir -p ${sq(DATA_DIR)}`);

            at('dl_deploy');
            const deployBin = await downloadDeployScript(
                _manifest.deployUrl,
                (id, st, hint) => flow.setStep(id, st, hint)
            );
            ok('dl_deploy');

            curStep = 'deploy';
            await executeDeploy(deployBin, _manifest, _PREV_VER || '', (step, status, detail) => {
                flow.setStep(step, status, detail);
            });

            await run(`grep -qxF ${sq(BOOT_LINE)} ${sq(BOOT_SH_FILE)} || echo ${sq(BOOT_LINE)} >> ${sq(BOOT_SH_FILE)}`);

            state.installed = true;
            state._deviceVersion = _manifest.version;
            flow.done();
            createToast('已启用 v' + _manifest.version + '，2秒后刷新', 'green');
            setTimeout(() => location.reload(), 2000);
        } catch (e) {
            flow.fail(e?.htStep || curStep, e?.message || String(e), (e?.htDetail || '') + (e?.htAttempts ? ' | 已重试' + e.htAttempts + '次' : ''), startInstallFlow);
        } finally { state._installing = false; }
    };

    const startInstallFlow = async () => {
        await install();
        if (state.installed) await loadData();
        renderIntoPanel();
        if (state.installed) setAutoData(true);
    };

    const uninstall = async () => {
        if (state._uninstalling) return createToast('正在卸载中，请稍候', 'yellow');
        if (!(await checkAdvancedFunc())) return createToast('没有开启高级功能，无法使用！', 'red');
        state._uninstalling = true;
        setAutoData(false);
        _dataEvtBound = false;
        try {
            await run(`
sed -i '/${NAME}/d' ${sq(BOOT_SH_FILE)} 2>/dev/null
_p=$(awk '{print}' ${sq(PID_FILE)} 2>/dev/null)
if [ -n "$_p" ]; then
kill -15 "$_p" 2>/dev/null
_i=0; while kill -0 "$_p" 2>/dev/null && [ "$_i" -lt 15 ]; do sleep 0.1; _i=$((_i+1)); done
_ep=$(awk '{print}' ${sq(DATA_DIR + '/.engine_pid')} 2>/dev/null)
[ -n "$_ep" ] && kill -9 "$_ep" 2>/dev/null
_tp=$(awk '{print}' ${sq(DATA_DIR + '/.tcpdump_pid')} 2>/dev/null)
[ -n "$_tp" ] && kill -9 "$_tp" 2>/dev/null
kill -9 "$_p" 2>/dev/null
fi
rm -f ${sq(PID_FILE)} ${sq(DATA_DIR + '/.engine_pid')} ${sq(DATA_DIR + '/.tcpdump_pid')}
rm -rf ${sq(DATA_DIR + '/.lock_dir')}
rm -f ${sq(TRAFFIC_BIN_FILE)} ${sq(DIAG_BIN_FILE)} ${sq(LOG_FILE)} ${TRAFFIC_PROC} ${DIAG_PROC} ${sq(WEBHOOK_FILE)} ${sq(TRAFFIC_BIN_FILE + '.b64')} ${sq(DIAG_BIN_FILE + '.b64')} ${sq(PENDING_JS_FILE)}
rm -rf ${sq(DATA_DIR)}
`, 10000);
            state.installed = false; state.dataCache = null; state.lastUpdated = ''; state.summary = null;
            clearDiagState();
            createToast('热点流量监控已停用');
        } catch (e) {
            createToast('停用失败：' + (e && e.message ? e.message : String(e)), 'red');
        }
        state._uninstalling = false;
    };

    const showUninstallConfirm = () => {
        document.querySelector('#ht_uninstall_confirm')?.remove();
        let clicks = 0;
        const { el, close } = createFixedToast('ht_uninstall_confirm', `
            <div style="pointer-events:all;width:80vw;max-width:300px">
                <div class="title" style="margin:0;display:flex;align-items:center;justify-content:space-between">停用插件</div>
                <div style="margin:10px 0;font-size:.64rem;line-height:1.6">停用后，流量统计数据将被清除，且无法找回。是否继续？</div>
                <div style="display:flex;gap:6px;justify-content:flex-end"><button style="font-size:.62rem" id="ht_uninstall_confirm_confirm">确认</button><button style="font-size:.62rem" id="ht_uninstall_confirm_close">取消</button></div>
            </div>`);
        const onClose = () => true;
        const onConfirm = async () => {
            clicks++;
            if (clicks < 3) {
                const remain = 3 - clicks;
                const btn = el.querySelector('#ht_uninstall_confirm_confirm');
                if (btn) btn.textContent = `确认(再点${remain}次)`;
                createToast(`再点 ${remain} 次即可停用`, 'pink', 1500);
                return false;
            }
            const btn = el.querySelector('#ht_uninstall_confirm_confirm');
            if (btn) btn.disabled = true;
            close();
            const { close: closeLoading } = createFixedToast('ht_uninstall_loading', '正在停用...');
            try {
                await uninstall();
                renderIntoPanel();
            } finally { closeLoading(); }
            return false;
        };
        el.querySelector('#ht_uninstall_confirm_confirm').onclick = async () => { if (await onConfirm()) close(); };
        el.querySelector('#ht_uninstall_confirm_close').onclick = () => { if (onClose()) close(); };
    };

    // ─── data ─────────────────────────────────────────────────────────────────
    const loadData = async (preloaded) => {
        if (preloaded && preloaded.devices && typeof preloaded.devices === 'object') {
            state.dataCache = preloaded;
            state.lastUpdated = preloaded.updatedAt || '';
            state.summary = preloaded.summary || null;
            return;
        }
        try {
            const result = await run(`[ -f ${sq(DATA_FILE)} ] && timeout 3s awk '{print}' ${sq(DATA_FILE)} 2>/dev/null || echo '{}'`, 5000);
            const raw = String(result?.content ?? '').trim();
            if (!raw || !raw.startsWith('{')) return;

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.devices !== 'object' || !parsed.summary) {
                console.warn('[HT] data.json 结构不完整，跳过本轮');
                return;
            }
            state.dataCache = parsed;
            state.lastUpdated = parsed.updatedAt || '';
            state.summary = parsed.summary || null;

            if (!state._clientIp) {
                try {
                    const ufi = await getUFIData();
                    if (ufi?.client_ip) state._clientIp = ufi.client_ip;
                } catch {}
            }
        } catch (e) { console.warn('[HT] loadData:', e); }
    };

    let dataLoading = false;
    const refreshDataArea = async (preloaded) => {
        const area = document.querySelector(`#${MODAL} #ht_data_area`);
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

    const patchDataArea = async (preloaded) => {
        if (dataLoading) return;
        dataLoading = true;
        try {
            await loadData(preloaded);
            const el = document.querySelector(`#${MODAL} #ht_data_area`);
            if (!el || !state.dataCache) return;

            const devicesMap = state.dataCache.devices || {};
            const deviceList = sortDevices(devicesMap);
            const summary = state.summary;

            if (summary) {
                const m = calcSummaryMetrics(summary, deviceList);
                summaryHtmls(m).forEach((html, i) => { const n = el.querySelector(`[data-ht="si_${i}"]`); if (n && n.innerHTML !== html) n.innerHTML = html; });
            }

            const tbody = el.querySelector('tbody');
            if (!tbody) {
                if (deviceList.length > 0) { el.innerHTML = renderDataArea(); initDataDelegate(); }
                return;
            }

            if (tbody.querySelector('tr') && (!tbody.querySelector('[data-ht="tf"]') || !tbody.querySelector('td:nth-child(2) > [data-edit-mac]') || !tbody.querySelector('td:nth-child(4)'))) {
                tbody.innerHTML = deviceList.map((d, i) => renderDeviceRow(d, i)).join('');
            }

            const domMacs = [];
            tbody.querySelectorAll('tr[data-mac]').forEach(tr => domMacs.push(tr.dataset.mac));
            const newMacs = deviceList.map(d => d.mac);
            const orderChanged = domMacs.length !== newMacs.length || domMacs.some((m, i) => m !== newMacs[i]);

            if (orderChanged) {
                tbody.innerHTML = deviceList.map((d, i) => renderDeviceRow(d, i)).join('');
            } else {
                deviceList.forEach((device, index) => {
                    const tr = tbody.querySelector(`tr[data-mac="${esc(device.mac)}"]`);
                    if (!tr) return;
                    const displayName = resolveDisplayName(device);
                    const txBytes = device.txBytes || 0;
                    const rxBytes = device.rxBytes || 0;
                    const totalBytes = txBytes + rxBytes;
                    const p = (attr, val) => { const n = tr.querySelector(`[data-ht="${attr}"]`); if (n && n.textContent !== val) n.textContent = val; };
                    p('idx', String(index + 1));
                    const isMe = device.ip && device.ip === state._clientIp;
                    const meTag = isMe ? '<span style="color:#999;font-size:.55rem"> (我)</span>' : '';
                    const nameHtml = `${esc(displayName)}${meTag}`;
                    const nameEl = tr.querySelector('[data-ht="name"]');
                    if (nameEl && nameEl.innerHTML !== nameHtml) nameEl.innerHTML = nameHtml;
                    p('ip', device.ip || '');
                    const tfEl = tr.querySelector('[data-ht="tf"]');
                    const tfHtml = renderTrafficRateCell(device, totalBytes, txBytes, rxBytes);
                    if (tfEl && tfEl.innerHTML !== tfHtml) tfEl.innerHTML = tfHtml;
                    const polEl = tr.querySelector('[data-ht="pol"]');
                    if (polEl) {
                        const pol = state.policyMap[device.mac];
                        const wantBg = pol?.type === 'blacklist' ? '#f87171' : '';
                        if (polEl.style.background !== wantBg) {
                            polEl.style.display = pol ? 'inline-block' : 'none';
                            polEl.style.background = wantBg;
                        }
                    }
                    const dot = tr.querySelector('[data-ht="dot"]');
                    if (dot) { const cls = device.online ? 'ht-dot ht-dot-green' : 'ht-dot ht-dot-gray'; if (dot.className !== cls) dot.className = cls; }
                });
            }

            const updatedShort = state.lastUpdated ? state.lastUpdated.slice(11, 19) : '';
            const dateEl = el.querySelector('[data-ht="sum_date"]');
            if (dateEl) { const txt = updatedShort ? `（更新时间 ${updatedShort}）` : ''; if (dateEl.textContent !== txt) dateEl.textContent = txt; }

        } finally { dataLoading = false; }
    };

    // ─── log popup ────────────────────────────────────────────────────────────
    const copyToClipboard = async (text) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text); return true;
            }
        } catch {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch { return false; }
    };




    const stopAutoData = () => { if (state.autoDataTimer) clearInterval(state.autoDataTimer); state.autoDataTimer = null; };
    const setAutoData = (enabled) => {
        state.autoData = Boolean(enabled && state.installed);
        stopAutoData();
        if (state.autoData) {
            state.autoDataTimer = setInterval(async () => {
                if (document.querySelector('#collapse_ht')?.dataset?.name !== 'open' || !state.installed || !state.autoData) { setAutoData(false); return; }
                const r = await run(`_mt=$(stat -c %Y ${sq(DATA_FILE)} 2>/dev/null || echo 0)
echo "$_mt"
if [ "$_mt" != ${sq(state._lastMtimeKey || '0')} ]; then timeout 2s awk '{print}' ${sq(DATA_FILE)} 2>/dev/null; fi`, 5000);
                const raw = String(r?.content || '');
                const nl = raw.indexOf('\n');
                const mtKey = (nl >= 0 ? raw.slice(0, nl) : raw).trim();
                const body = nl >= 0 ? raw.slice(nl + 1).trim() : '';
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
    const ensureStyle = () => {
        let s = document.getElementById(STYLE);
        if (!s) {
            s = document.createElement('style');
            s.id = STYLE;
            document.head.appendChild(s);
        }
        s.textContent = `
      #${MODAL} .ht-wrap{display:flex;flex-direction:column;gap:2px;font-size:.72rem;}
      #${MODAL} .ht-card{border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));border-radius:12px;padding:8px 10px;}
      #${MODAL} .ht-wrap>.ht-card:first-child{padding-top:6px;padding-bottom:6px;}
      #${MODAL} #ht_data_area{display:flex;flex-direction:column;gap:2px;}
      #${MODAL} .ht-row{display:flex;align-items:center;gap:5px;}
      #${MODAL} .ht-btn{border-radius:7px;padding:5px 10px;font-size:.64rem;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:inherit;transition:background .15s,opacity .15s;}
      #${MODAL} .ht-btn:hover{background:rgba(255,255,255,.14);}
      #${MODAL} .ht-btn:disabled{opacity:.35;cursor:not-allowed;}
      #${MODAL} .ht-btn-success{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.35);color:#86efac;}
      #${MODAL} .ht-btn-stop{background:rgba(249,115,22,.22);border-color:rgba(249,115,22,.35);color:#fdba74;}
      #${MODAL} .ht-btn-ghost{background:transparent;border-color:rgba(255,255,255,.12);opacity:.8;}
      #${MODAL} .ht-btn-ghost:hover{opacity:1;background:rgba(255,255,255,.06);}
      #${MODAL} .ht-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:3px;vertical-align:middle;}
      #${MODAL} .ht-dot-green{background:#4ade80;box-shadow:0 0 4px rgba(74,222,128,.5);}
      #${MODAL} .ht-dot-gray{background:rgba(255,255,255,.25);}
      #${MODAL} .ht-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
      #${MODAL} .ht-tbl{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.62rem;}
      #${MODAL} .ht-tbl th{font-size:.54rem;opacity:.45;font-weight:500;text-align:left;padding:3px 2px;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap;}
      #${MODAL} .ht-tbl td{padding:1px 2px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;}
      #${MODAL} .ht-tbl th:first-child,#${MODAL} .ht-tbl td:first-child{padding-left:0;}
      #${MODAL} .ht-tbl th:last-child,#${MODAL} .ht-tbl td:last-child{padding-right:0;}
      #${MODAL} .ht-tbl tr:last-child td{border-bottom:none;}
      #${MODAL} .ht-tbl .ht-td-name{font-weight:600;display:flex;align-items:center;gap:3px;line-height:1.2;}
      #${MODAL} .ht-tbl .ht-td-meta{font-size:.52rem;opacity:.4;line-height:1.3;word-break:break-all;margin-top:1px;}
      #${MODAL} .ht-tbl .ht-td-num{font-weight:600;white-space:nowrap;font-size:.6rem;font-variant-numeric:tabular-nums;}
      #${MODAL} .ht-rate-seg{display:inline;}
      #${MODAL} .ht-mac{cursor:pointer;border-bottom:1px dashed rgba(255,255,255,.2);}
      #${MODAL} .ht-mac:hover{opacity:.85;}
      #${MODAL} .ht-edit-mini{background:rgba(102,126,234,.15);border:none;cursor:pointer;opacity:1;font-size:.6rem;padding:4px 4.5px;color:#a5b4fc;line-height:1;flex-shrink:0;border-radius:4px;transition:background .15s,color .15s;}
      #${MODAL} .ht-edit-mini:hover{background:rgba(102,126,234,.3);color:#fff;}
      #ht_dev_name::placeholder{color:#475569;opacity:1;}
      #${MODAL} .ht-up{color:#67e8f9;}
      #${MODAL} .ht-down{color:#86efac;}
      #${MODAL} .ht-total{color:rgba(255,255,255,.7);}
      #${MODAL} .ht-summary-item .ht-up,#${MODAL} .ht-summary-item .ht-down{color:inherit;}
      #${MODAL} .ht-muted{color:rgba(255,255,255,.35);}
      #${MODAL} .ht-status-ok{color:#86efac;}
      #${MODAL} .ht-status-warn{color:#fdba74;}
      #${MODAL} .ht-status-alert{color:#fca5a5;}
      #${MODAL} .ht-status-info{color:#9ca3af;}
      #${MODAL} .ht-empty{padding:10px;border:1px dashed rgba(255,255,255,.12);border-radius:9px;opacity:.55;text-align:center;font-size:.6rem;}
      @keyframes ht_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      #${MODAL} .ht-updated{font-size:.52rem;opacity:.35;margin-left:auto;}
      #${MODAL} .ht-date{font-size:.56rem;opacity:.5;margin-left:6px;color:#93c5fd;}
      #${MODAL} .ht-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}
      #${MODAL} .ht-summary-item{background:rgba(0,0,0,.12);border-radius:8px;padding:6px 8px;}
      #${MODAL} .ht-summary-val{font-size:.76rem;font-weight:700;margin-bottom:1px;line-height:1.15;}
      #${MODAL} .ht-summary-lbl{font-size:.52rem;opacity:.45;line-height:1.25;}
      #${MODAL} .ht-diag-item{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.58rem;line-height:1.35;word-break:break-all;}
      @media(max-width:570px){#${MODAL} .ht-summary-grid{grid-template-columns:repeat(2,1fr);}}
      @media(max-width:380px){#${MODAL} .ht-wrap{font-size:.66rem;gap:2px;} #${MODAL} .ht-card{padding:7px 9px;} #${MODAL} .ht-summary-val{font-size:.7rem;} #${MODAL} .ht-tbl{font-size:.58rem;} #${MODAL} .ht-btn{padding:4px 8px;font-size:.6rem;}}
      @media(max-width:480px){#${MODAL} .ht-rate-seg{display:block;margin-top:1px;} #${MODAL} .ht-tbl td.ht-total{white-space:normal;}}
    `;
    };

    // ─── render ───────────────────────────────────────────────────────────────
    const renderDeviceRow = (device, index) => {
        const displayName = resolveDisplayName(device);
        const txBytes = device.txBytes || 0;
        const rxBytes = device.rxBytes || 0;
        const totalBytes = txBytes + rxBytes;
        const safeMac = esc(device.mac || '');
        const online = device.online;
        const dotCls = online ? 'ht-dot-green' : 'ht-dot-gray';
        const isMe = device.ip && device.ip === state._clientIp;
        const meTag = isMe ? '<span style="color:#999;font-size:.55rem"> (我)</span>' : '';
        const pol = state.policyMap[device.mac];
        const polBg = pol?.type === 'blacklist' ? '#f87171' : '';
        const polDot = `<span data-ht="pol" style="display:${pol ? 'inline-block' : 'none'};width:6px;height:6px;border-radius:50%;margin-right:3px;vertical-align:middle;opacity:.7${polBg ? ';background:' + polBg : ''}"></span>`;
        return `<tr data-mac="${safeMac}">
        <td style="opacity:.4;font-size:.54rem;width:10px;text-align:center;" data-ht="idx">${index + 1}</td>
        <td><button class="ht-edit-mini" data-edit-mac="${safeMac}" title="自定义名称">✎</button></td>
        <td>
          <div class="ht-td-name">
            <span class="ht-dot ${dotCls}" data-ht="dot"></span>
            ${polDot}<span data-ht="name">${esc(displayName)}${meTag}</span>
          </div>
          <div class="ht-td-meta"><span data-ht="ip">${esc(device.ip || '')}</span> | <span class="ht-mac" data-full-mac="${safeMac}" data-masked="1" title="点击查看完整 MAC">${esc(maskMac(device.mac || ''))}</span></div>
        </td>
        <td class="ht-td-num ht-total" data-ht="tf">${renderTrafficRateCell(device, totalBytes, txBytes, rxBytes)}</td>
      </tr>`;
    };

    const showDeviceModal = async (mac, displayName, ip) => {
        const _r = await run(`timeout 1s ${sq(JQ)} -r --arg m ${sq(mac)} '.[$m] // {"type":"normal"}' ${sq(POLICY_FILE)} 2>/dev/null || echo '{"type":"normal"}'`);
        let curPolicy = {type: 'normal'};
        try { curPolicy = JSON.parse((_r?.content || '').trim()); } catch (e) { console.warn('[HT] parse policy json failed:', e, _r?.content); }
        const curPol = curPolicy.type || 'normal';
        const customName = getCustomName(mac) || '';
        const masked = maskMac(mac);
        const content = `
      <div style="font-size:.72rem;color:#94a3b8;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <b style="color:#e2e8f0">${esc(displayName || '未知设备')}</b>
        <span>${esc(ip || '')}</span>
        <span class="ht-mac-toggle" style="cursor:pointer;color:#64748b;border-bottom:1px dashed #475569" data-masked="${esc(masked)}" data-full="${esc(mac)}">${esc(masked)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <input type="text" id="ht_dev_name" value="${esc(customName)}" placeholder="${esc(displayName)}" style="flex:1;padding:6px 10px;background:#1e2030;border:1px solid #334155;border-radius:5px;color:#e2e8f0;font-size:.7rem;outline:none">
        <button id="ht_dev_name_clear" style="padding:5px 10px;font-size:.62rem;border:1px solid #334155;border-radius:5px;background:transparent;color:#94a3b8;cursor:pointer">清除</button>
      </div>
      ${!customName && (!displayName || displayName === '未知设备') ? '<div style="font-size:.54rem;color:#64748b;line-height:1.4;margin:-4px 0 6px">\u{1F4A1} 设备重新连接WiFi后可自动识别名称，也可在上方手动设置</div>' : ''}
      <div style="border-top:1px solid #1e293b;margin:10px 0"></div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:.7rem;color:#e2e8f0">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="pol" value="normal" ${curPol==='normal'?'checked':''} style="accent-color:#667eea"> 正常（无限制）</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="pol" value="blacklist" ${curPol==='blacklist'?'checked':''} style="accent-color:#667eea"> 拉黑（禁止联网）</label>
      </div>`;
        const { id, el } = createModal({
            name: 'ht_device_modal',
            title: '热点流量监控 · 设备管理',
            content,
            showConfirm: true,
            confirmBtnText: '应用',
            onClose: () => true,
            onConfirm: async () => {
                const newName = el.querySelector('#ht_dev_name')?.value?.trim() || '';
                const type = el.querySelector('input[name="pol"]:checked')?.value;
                let policyOk = true;
                if (type === 'normal') {
                    const r = await policyRemove(mac);
                    if (!r?.success) policyOk = false;
                } else if (type) {
                    const r = await policySet(mac, type);
                    if (!r?.success) policyOk = false;
                }
                if (!policyOk) {
                    createToast('策略保存失败，请稍后重试', 'red', 3000);
                    return false;
                }
                await loadPolicyMap();
                setCustomName(mac, newName);
                patchDataArea();
                return true;
            }
        });
        const macEl = el.querySelector('.ht-mac-toggle');
        if (macEl) macEl.onclick = () => { macEl.textContent = macEl.textContent === macEl.dataset.full ? macEl.dataset.masked : macEl.dataset.full; };
        el.querySelector('#ht_dev_name_clear')?.addEventListener('click', () => { el.querySelector('#ht_dev_name').value = ''; });
        showModal(id);
    };

    const renderUlDl = (tx, rx) => `<div style="font-size:.48rem;opacity:.7;white-space:nowrap"><span class="ht-up">↑${esc(htFormatBytes(tx))}</span> <span class="ht-down">↓${esc(htFormatBytes(rx))}</span></div>`;

    const renderDataArea = () => {
        const installed = state.installed;
        const devicesMap = (state.dataCache && state.dataCache.devices) ? state.dataCache.devices : {};
        const deviceList = sortDevices(devicesMap);
        const summary = state.summary;
        const dataDate = (state.dataCache && state.dataCache.date) || new Date().toISOString().slice(0, 10);

        let summaryHtml;
        if (summary) {
            const m = calcSummaryMetrics(summary, deviceList);
            const zeroWarn = (summary.zeroStreak >= 3 && installed) ? `<div class="ht-status-alert" style="font-size:.55rem;margin-top:4px;">热点合计持续为0，可能受硬件加速影响，建议点击「诊断」排查</div>` : '';
            summaryHtml = `<div class="ht-summary-grid">
${summaryHtmls(m).map((html, i) => `<div class="ht-summary-item" data-ht="si_${i}">${html}</div>`).join('\n')}
            </div>${zeroWarn}`;
        } else {
            summaryHtml = `<div class="ht-empty" style="font-size:.58rem;">${installed ? '已启用，等待首次采集数据' : '启用并等待首次采集后显示'}</div>`;
        }

        const devicesHtml = deviceList.length > 0
            ? `<div class="ht-tbl-wrap"><table class="ht-tbl">
                <thead><tr><th style="width:10px;text-align:center;">#</th><th style="width:20px;">操作</th><th style="width:49%;">设备</th><th class="ht-td-num">Σ 流量 · 网速</th></tr></thead>
                <tbody>${deviceList.map((d, i) => renderDeviceRow(d, i)).join('')}</tbody>
               </table></div>`
            : `<div class="ht-empty">${installed ? '已启用，等待首次采集到接入设备...' : '启用后开始统计各接入设备的流量'}</div>`;

        const updatedShort = state.lastUpdated ? state.lastUpdated.slice(11, 19) : '';

        return `
        <div class="ht-card">
          <div class="ht-row" style="justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;">
            <div class="ht-row"><b>流量概览</b><span class="ht-date">${esc(dataDate)}<span data-ht="sum_date">${installed && updatedShort ? `（更新时间 ${esc(updatedShort)}）` : ''}</span></span></div>
            <button id="ht_devices_toggle" class="ht-btn ht-btn-ghost" style="font-size:.56rem;padding:2px 8px;">${localStorage.getItem('hotspot_traffic_devices_collapsed') === '1' ? '设备明细 ▼' : '设备明细 ▲'}</button>
          </div>
          ${summaryHtml}
        </div>
        <div class="ht-card" id="ht_devices_card" style="${localStorage.getItem('hotspot_traffic_devices_collapsed') === '1' ? 'display:none' : ''}">
          ${devicesHtml}
        </div>`;
    };

    const render = () => {
        const installed = state.installed;
        const dotCls = installed ? 'ht-dot-green' : 'ht-dot-gray';
        const statusText = installed ? '运行中' : '未启用';
        const toggleCls = installed ? 'ht-btn-stop' : 'ht-btn-success';
        const toggleTxt = installed ? `<span class="ht-dot ht-dot-green"></span>停用` : '启用';
        const diagBtnText = state.diagStatus === 'done' ? '诊断结果' : state.diagStatus === 'running' ? '诊断中...' : '诊断';
        const _remoteVer = _manifest?.version || '';
        const _devVer = state._deviceVersion;
        const _verDisplay = state.installed ? (_devVer || '') : _remoteVer;
                const _updateBtnHtml = _hasUpdate ? '<span id="ht-update-btn" style="font-size:.5rem;color:#4ade80;cursor:pointer;margin-left:3px;-webkit-user-select:none;user-select:none;">更新 v' + esc(_remoteVer) + '</span>' : '';
        const _verHtml = _verDisplay ? `<span id="ht-ver-tap" style="font-size:.5rem;opacity:.35;margin-left:4px;cursor:pointer;-webkit-user-select:none;user-select:none;">v${esc(_verDisplay)}</span>${_updateBtnHtml}` : '';

        return `<div class="ht-wrap">
        <div class="ht-card">
          <div class="ht-row" style="justify-content:space-between;">
            <div class="ht-row"><span class="ht-dot ${dotCls}"></span><span style="font-size:.68rem;">${esc(statusText)}</span>${_verHtml}</div>
            <div class="ht-row">
              <button class="ht-btn ht-btn-ghost" data-act="log" ${installed ? '' : 'disabled'}>日志</button>
              <button class="ht-btn ht-btn-ghost" data-act="diag" ${installed ? '' : 'disabled'}>${diagBtnText}</button>
              <button class="ht-btn ${toggleCls}" data-act="toggle">${toggleTxt}</button>
            </div>
          </div>
        </div>
        <div id="ht_data_area">${renderDataArea()}</div>
      </div>`;
    };

    // ─── diag ─────────────────────────────────────────────────────────────────
    const clearDiagState = () => {
        state.diagStatus = 'idle';
        state.diagResult = null;
    };

    const updateDiagBtn = () => {
        const btn = document.querySelector(`#${MODAL} [data-act="diag"]`);
        if (!btn) return;
        btn.textContent = state.diagStatus === 'done' ? '诊断结果' : state.diagStatus === 'running' ? '诊断中...' : '诊断';
    };

    const startDiag = async () => {
        if (!state.installed) return createToast('请先启用插件', 'pink');
        if (state.diagStatus === 'running') return;
        state.diagStatus = 'running';
        updateDiagBtn();
        const _resetDiag = () => { state.diagStatus = 'idle'; updateDiagBtn(); };
        try { await readStatus(); } catch (e) { state.summary = null; console.warn('[HT] readStatus in diag:', e); }
        if (state.summary && state.summary.scriptStartAt) {
            const startMs = parseTs(state.summary.scriptStartAt);
            if (!Number.isFinite(startMs)) { _resetDiag(); return createToast('插件数据尚未就绪，请等待采集完成后再诊断', 'pink'); }
            const elapsed = Date.now() - startMs;
            if (elapsed < DIAG_COOLDOWN) {
                const sec = Math.floor(elapsed / 1000);
                const t = sec >= 60 ? `${Math.floor(sec / 60)}分${sec % 60 ? sec % 60 + '秒' : ''}` : `${sec}秒`;
                _resetDiag();
                return createToast(`插件当前启动${t}，请等待至少5分钟后再诊断`, 'pink');
            }
        } else if (!state.summary) {
            _resetDiag();
            return createToast('插件数据尚未就绪，请等待采集完成后再诊断', 'pink');
        }
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) { _resetDiag(); return createToast('跨日数据重建中，请1分钟后再诊断', 'pink'); }
        const preChk = await run(`_probe=0; [ -f ${sq(DIAG_BIN_FILE)} ] && _probe=1
_lock=0; _stale=0; if [ -f ${sq(DIAG_LOCK_FILE)} ]; then _age=$(( $(date +%s) - $(stat -c %Y ${sq(DIAG_LOCK_FILE)} 2>/dev/null || echo 0) )); if [ "$_age" -gt 60 ]; then rm -f ${sq(DIAG_LOCK_FILE)}; _stale=1; else _p=$(awk '{print}' ${sq(DIAG_LOCK_FILE)} 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && _lock=1 || rm -f ${sq(DIAG_LOCK_FILE)}; fi; fi
_ver=$(timeout 2s awk '{print}' ${sq(DATA_DIR + '/.version')} 2>/dev/null)
echo "$_probe|$_lock|$_stale|$_ver"`, 8000);
        const [_probeOk, _lockAlive, _stale, _instVer] = String(preChk?.content || '').trim().split('|');
        if (_probeOk !== '1') { _resetDiag(); return createToast('诊断脚本未就绪，请停用后重新启用插件', 'pink'); }
        if (_lockAlive === '1') { _resetDiag(); return createToast('诊断正在进行中，请等待完成', 'pink'); }
        if (_stale === '1') createToast('检测到残留锁文件已清理，正在重新诊断...', 'green', 2000);
        const currentVer = state._deviceVersion || '';
        if (_instVer && currentVer && _instVer.trim() !== currentVer) { _resetDiag(); return createToast(`插件已更新(${currentVer})，请重新启用插件以生效`, 'pink', 5000); }
        const { close: closeLoading } = createFixedToast('ht_diag_loading', '诊断中...');
        await run(`rm -f ${sq(DIAG_RESULT_FILE)} 2>/dev/null
cp ${sq(DIAG_BIN_FILE)} ${DIAG_PROC} && chmod 755 ${DIAG_PROC} && nohup ${DIAG_PROC} >/dev/null 2>&1 &`, 15000);
        closeLoading();
        createToast('诊断已启动，后台执行中...', 'green', 2000);
        const _diagPoll = setInterval(async () => {
            try {
                const dr = await run(`[ -s ${sq(DIAG_RESULT_FILE)} ] && echo __DONE__ || echo __WAIT__`, 3000);
                if (String(dr?.content || '').includes('__DONE__')) {
                    clearInterval(_diagPoll);
                    const dtxt = await run(`timeout 3s awk '{print}' ${sq(DIAG_RESULT_FILE)} 2>/dev/null`, 5000);
                    const dc = String(dtxt?.content || '').trim();
                    if (dc) {
                        try {
                            state.diagResult = JSON.parse(dc);
                            state.diagStatus = 'done';
                            updateDiagBtn();
                            createToast('诊断完成', 'green', 2000);
                        } catch {}
                    }
                }
            } catch {}
        }, 3000);
        setTimeout(() => {
            clearInterval(_diagPoll);
            if (state.diagStatus === 'running') {
                state.diagStatus = 'idle';
                updateDiagBtn();
                createToast('诊断超时或失败，请稍后重试', 'pink');
            }
        }, 95000);
    };

    let _lastReportTime = 0;

    const showDiagResult = () => {
        if (!state.diagResult) return createToast('暂无诊断结果', 'pink');
        const j = state.diagResult;
        const hasIssue = Array.isArray(j.checks) && j.checks.some(c => !c.startsWith('\u2713') && !c.startsWith('\u2139'));
        const reportStatus = j.auto_reported ? '<span style="color:#4ade80">\u2714 \u5df2\u4e0a\u62a5</span>'
            : !hasIssue ? '<span style="opacity:.4">\u65e0\u5f02\u5e38\uff0c\u65e0\u9700\u4e0a\u62a5</span>'
            : '<span style="color:#93c5fd">\u2191 \u5efa\u8bae\u4e0a\u62a5</span>';
        let html = '';

        if (Array.isArray(j.checks)) {
            html += `<div style="margin-bottom:6px;display:flex;align-items:baseline;justify-content:space-between"><span><b>检查项</b>${j.timestamp ? `<span style="font-size:.5rem;opacity:.45;margin-left:6px">${esc(j.timestamp)}</span>` : ''}</span><span style="font-size:.5rem">${reportStatus}</span></div>`;
            j.checks.forEach(c => {
                const idx1 = c.indexOf(':');
                const idx2 = c.indexOf(':', idx1 + 1);
                const sym = c.substring(0, idx1);
                const id = c.substring(idx1 + 1, idx2);
                const detail = c.substring(idx2 + 1);
                const color = sym === '\u2713' ? '#86efac' : sym === '!' ? '#fdba74' : sym === '\u2139' ? '#9ca3af' : '#fca5a5';
                html += `<div class="ht-diag-item"><span style="color:${color};margin-right:2px">${sym}</span><span style="font-weight:600">${esc(id)}</span><span style="opacity:.4">: </span><span style="opacity:.55">${esc(detail)}</span></div>`;
            });
        }

        const text = JSON.stringify(j);
        const diagVer = j.version || state._deviceVersion || '';
        const { el: toastEl, close } = createFixedToast('ht_diag_result_toast', `<div style="pointer-events:all;width:92vw;max-width:420px;max-height:75vh;display:flex;flex-direction:column"><div class="title" style="margin:0 0 6px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between">诊断结果<span style="font-size:.5rem;opacity:.35;margin-left:6px;font-weight:400">v${esc(diagVer)}</span></div><div style="flex:1;overflow:auto;min-height:0">${html}</div><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0"><button id="ht_diag_copy" class="ht-btn ht-btn-success" style="font-size:.62rem">复制报告</button><button id="ht_diag_report" class="ht-btn ht-btn-ghost" style="font-size:.62rem">上报</button><button id="ht_diag_redo" class="ht-btn ht-btn-ghost" style="font-size:.62rem">重新诊断</button><button id="ht_diag_close" class="ht-btn ht-btn-ghost" style="font-size:.62rem">关闭</button></div></div>`);
        toastEl.querySelector('#ht_diag_close').onclick = () => close();
        toastEl.querySelector('#ht_diag_copy').onclick = async () => {
            await copyToClipboard(text);
            createToast('已复制', 'green');
        };
        toastEl.querySelector('#ht_diag_report').onclick = async () => {
            if (!hasIssue) return createToast('诊断结果无异常，如有问题请加群反馈', 'pink', 3000);
            const markReported = async () => {
                const _sec = Math.floor(Date.now() / 1000);
                await run(`printf '%s' ${sq(_sec)} > ${sq(LAST_REPORT_TS_FILE)}
_m=$(${sq(JQ)} '.auto_reported=true' ${sq(DIAG_RESULT_FILE)} 2>/dev/null); [ -n "$_m" ] && printf '%s' "$_m" > ${sq(DIAG_RESULT_FILE + '.tmp')} && mv ${sq(DIAG_RESULT_FILE + '.tmp')} ${sq(DIAG_RESULT_FILE)}`, 5000);
                _lastReportTime = _sec * 1000;
                j.auto_reported = true;
            };
            const _st = await run(`_ts=$(awk '{print $1+0}' ${sq(LAST_REPORT_TS_FILE)} 2>/dev/null); _ar=$(awk '/auto_reported/{c=1} END{print c+0}' ${sq(DIAG_RESULT_FILE)} 2>/dev/null); echo "ts=$_ts ar=$_ar"`, 3000);
            const _out = String(_st?.content || '');
            const _tsm = _out.match(/ts=(\d+)/);
            const _fts = _tsm ? parseInt(_tsm[1]) : 0;
            if (_fts) _lastReportTime = Math.max(_lastReportTime, _fts * 1000);
            const autoReported = j.auto_reported || _out.includes('ar=1');
            if (autoReported) return createToast('当前诊断已上报，请加群跟进', 'green', 3000);
            if (_lastReportTime && Date.now() - _lastReportTime < REPORT_COOLDOWN) return createToast(`上报间隔未达${Math.round(REPORT_COOLDOWN / 60000)}分钟，请稍后重新诊断或加群跟进`, 'pink');
            try {
                const whRes = await run(`cat ${sq(WEBHOOK_FILE)} 2>/dev/null`, 3000);
                const webhookUrl = String(whRes?.content || '').trim();
                if (!webhookUrl) return createToast('未获取到上报通道，请加群反馈', 'red');
                const body = JSON.stringify({msgtype: 'text', text: {content: text}});
                const tmpFile = `${DATA_DIR}/_report.tmp`;
                const r = await run(`printf '%s' ${sq(body)} > ${sq(tmpFile)} && _r=$(timeout 10s curl -s -X POST -H 'Content-Type: application/json;charset=UTF-8' -d @${sq(tmpFile)} ${sq(webhookUrl)} 2>/dev/null) && rm -f ${sq(tmpFile)} && echo "$_r" || { rm -f ${sq(tmpFile)}; echo '{"errcode":-1}'; }`, 15000);
                const output = String(r?.content || '').trim();
                if (output.includes('"errcode":0') || output.includes('"errcode": 0')) {
                    await markReported();
                    return createToast('上报成功，可加群跟进', 'green');
                } else if (output.includes('310000')) {
                    return createToast('当前插件版本过旧，请更新到最新版本后重试或加群反馈', 'red', 5000);
                } else {
                    return createToast('上报失败，请加群反馈', 'red');
                }
            } catch {
                return createToast('上报失败，请加群反馈', 'red');
            }
        };
        toastEl.querySelector('#ht_diag_redo').onclick = async () => { close(); await startDiag(); };
    };

    const restoreDiagState = async () => {
        const r = await run(`echo __TS__
awk '{print $1+0}' ${sq(LAST_REPORT_TS_FILE)} 2>/dev/null
echo __RESULT__
[ -s ${sq(DIAG_RESULT_FILE)} ] && timeout 3s awk '{print}' ${sq(DIAG_RESULT_FILE)} 2>/dev/null || echo`, 5000);
        const text = String(r?.content || '');
        const _tsStr = text.includes('__TS__') ? text.split('__TS__')[1].split('__RESULT__')[0].trim() : '';
        const _fts = parseInt(_tsStr) || 0;
        if (_fts) _lastReportTime = Math.max(_lastReportTime, _fts * 1000);
        const resultStr = text.includes('__RESULT__') ? text.split('__RESULT__')[1].trim() : '';
        if (resultStr) {
            try {
                state.diagResult = JSON.parse(resultStr);
                state.diagStatus = 'done';
            } catch { state.diagStatus = 'idle'; state.diagResult = null; }
        } else {
            state.diagStatus = 'idle';
            state.diagResult = null;
        }
    };

    // ─── bind ─────────────────────────────────────────────────────────────────
    const initDataDelegate = () => {
        if (_dataEvtBound) return;
        const area = document.querySelector(`#${MODAL} #ht_data_area`);
        if (!area) return;
        _dataEvtBound = true;
        area.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('#ht_devices_toggle');
            if (toggleBtn) {
                e.stopPropagation();
                const card = document.querySelector(`#${MODAL} #ht_devices_card`);
                if (!card) return;
                const isCollapsed = card.style.display === 'none';
                card.style.display = isCollapsed ? '' : 'none';
                toggleBtn.textContent = isCollapsed ? '设备明细 ▲' : '设备明细 ▼';
                localStorage.setItem('hotspot_traffic_devices_collapsed', isCollapsed ? '0' : '1');
                return;
            }
            const macSpan = e.target.closest('[data-full-mac]');
            if (macSpan) {
                e.stopPropagation();
                const full = macSpan.dataset.fullMac || '';
                const masked = macSpan.dataset.masked === '1';
                if (masked) { macSpan.textContent = full; macSpan.dataset.masked = '0'; macSpan.title = '点击隐藏部分 MAC'; }
                else { macSpan.textContent = maskMac(full); macSpan.dataset.masked = '1'; macSpan.title = '点击查看完整 MAC'; }
                return;
            }
            const editBtn = e.target.closest('[data-edit-mac]');
            if (editBtn) {
                e.stopPropagation();
                const mac = editBtn.dataset.editMac;
                const row = editBtn.closest('tr');
                const nameEl = row?.querySelector('[data-ht="name"]');
                const ipEl = row?.querySelector('[data-ht="ip"]');
                const displayName = nameEl?.textContent?.replace(/\s*\(我\)$/, '') || '';
                const ip = ipEl?.textContent || '';
                showDeviceModal(mac, displayName, ip);
            }

        });
    };

    const renderIntoPanel = () => {
        const box = document.querySelector(`#${MODAL} .collapse_box`);
        if (!box) return;
        _dataEvtBound = false;
        box.innerHTML = render();
        bind(document.querySelector(`#${MODAL}`));
    };




    const bind = (el) => {
        if (!el) return;
        const toggleBtn = el.querySelector('[data-act="toggle"]');
        if (toggleBtn) toggleBtn.onclick = async (e) => {
            const btn = e.currentTarget;
            if (btn.disabled) return;
            if (state.installed) { showUninstallConfirm(); return; }
            btn.disabled = true;
            try {
                const probeR = await run(`_p=$(timeout 1s awk '{print}' ${sq(PID_FILE)} 2>/dev/null); [ -n "$_p" ] && kill -0 "$_p" 2>/dev/null && echo __ALIVE__ || echo __DEAD__`, 5000);
                if (String(probeR?.content || '').includes('__ALIVE__')) {
                    await run(`grep -qxF ${sq(BOOT_LINE)} ${sq(BOOT_SH_FILE)} || echo ${sq(BOOT_LINE)} >> ${sq(BOOT_SH_FILE)}`);
                    await readStatus();
                    if (state.installed) await loadData();
                    renderIntoPanel();
                    if (state.installed) setAutoData(true);
                    createToast('插件已在后台运行，已刷新状态', 'green');
                } else {
                    await startInstallFlow();
                }
            } catch (err) {
                createToast('操作异常：' + (err && err.message ? err.message : String(err)), 'red');
            } finally { btn.disabled = false; }
        };
        const logBtn = el.querySelector('[data-act="log"]');
        if (logBtn) logBtn.onclick = (e) => { e.stopPropagation(); showLogPopup(); };
        const diagBtn = el.querySelector('[data-act="diag"]');
        if (diagBtn) diagBtn.onclick = async (e) => {
            e.stopPropagation();
            if (state.diagStatus === 'done') { showDiagResult(); return; }
            if (state.diagStatus === 'idle') { await startDiag(); return; }
        };
        initDataDelegate();
    };

    // ─── help ─────────────────────────────────────────────────────────────────
    const HELP_TEXT = `<b>功能</b><br>统计热点接入设备的流量，每天 0 点自动重置。<br><br><b>流量概览</b><br>系统增量 = 插件启用后或今日开始的系统总流量；热点合计 = 热点转发的流量；偏差 = 两者之差，主UFI本机进程流量和可能的硬件加速偏差。未归属 = 热点合计与设备合计的差值，通常占比较小。<br><br><b>设备明细</b><br>按设备展示上传/下载流量。点击设备右侧 ✎ 可设置自定义名称或拉黑策略。<br><br><b>诊断</b><br>检测常见问题，可一键上报诊断结果给作者分析。`;

    const showHelp = () => {
        const { el, close } = createFixedToast('ht_help_toast', `<div style="pointer-events:all;width:80vw;max-width:300px"><div class="title" style="margin:0;display:flex;align-items:center;justify-content:space-between">使用说明</div><div style="margin:10px 0;font-size:.64rem;line-height:1.6">${HELP_TEXT}</div><div style="text-align:right"><button style="font-size:.62rem" id="ht_help_dismiss">关闭</button></div></div>`);
        el.querySelector('#ht_help_dismiss').onclick = () => close();
    };

    const injectHelpButton = (container) => {
        const titleEl = container.querySelector('.title strong');
        if (!titleEl) return;
        const helpBtn = document.createElement('button');
        helpBtn.textContent = '?';
        helpBtn.style.cssText = 'width:16px;height:16px;border-radius:50%;padding:0;font-size:.5rem;line-height:16px;text-align:center;cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);margin-left:8px;vertical-align:middle;flex-shrink:0;';
        helpBtn.onclick = (e) => { e.stopPropagation(); showHelp(); };
        titleEl.insertAdjacentElement('afterend', helpBtn);
    };

    // ─── mount ────────────────────────────────────────────────────────────────
    ensureStyle();
    const getPluginRoot = () => {
        let root = document.getElementById('kano_plugin_panels');
        if (!root) {
            root = document.createElement('div');
            root.id = 'kano_plugin_panels';
            root.style.width = '100%';
            const devMon = document.querySelector('.devices-mon');
            if (!devMon) return null;
            devMon.insertAdjacentElement('beforebegin', root);
        }
        return root;
    };
    const pluginRoot = getPluginRoot();
    if (!pluginRoot) return;
    pluginRoot.insertAdjacentHTML('beforeend', `
        <div id="${MODAL}" style="width:100%;margin-top:10px;">
            <div class="title" style="margin:6px 0;">
                <strong>热点流量监控</strong>
                <div style="display:inline-block;" id="collapse_ht_btn"></div>
            </div>
            <div class="collapse" id="collapse_ht" data-name="close" style="height:0;overflow:hidden;">
                <div class="collapse_box"></div>
            </div>
        </div>
    `);

    const panelEl = document.querySelector(`#${MODAL}`);
    injectHelpButton(panelEl);



    const initPanelState = async () => {
        await readStatus();
        if (!state.installed) {
            const bootChk = await run(`grep -q ${sq(NAME)} ${sq(BOOT_SH_FILE)} 2>/dev/null && echo 1 || echo 0`, 3000);
            if (String(bootChk?.content || '').includes('1')) {
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

    };

    collapseGen('#collapse_ht_btn', '#collapse_ht', '#collapse_ht', async (newVal) => {
        if (newVal === 'open') await initPanelState();
        else setAutoData(false);
    });

    if (localStorage.getItem('#collapse_ht') === 'open') {
        initPanelState().catch(e => console.warn('[HT] init error:', e));
    }
})();
