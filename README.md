# SDM 模块化插件系统 - 部署说明

## 📁 仓库结构

```
your-repo/
├── core/
│   ├── sdm-core.js          # 核心框架（宿主插件）
│   └── _latest.json         # 核心版本清单
└── modules/
    ├── device-manager/
    │   ├── module.js        # 设备管理器模块
    │   └── _latest.json     # 版本清单
    ├── ai-assistant/
    │   ├── module.js        # AI智能助手模块
    │   └── _latest.json     # 版本清单
    ├── signal-monitor/
    │   ├── module.js        # 5G信号监控模块
    │   └── _latest.json     # 版本清单
    ├── hotspot-monitor/
    │   ├── module.js        # 热点流量监控模块
    │   └── _latest.json     # 版本清单
    └── game-booster/
        ├── module.js        # 游戏加速与限速模块
        └── _latest.json     # 版本清单
```

## 🚀 快速开始

### 1. 创建 GitHub 仓库

1. 在 GitHub 上创建一个新仓库（如 `sdm-modular-plugins`）
2. 将 `repo-template/` 目录下的所有文件上传到你的仓库
3. 确保仓库是公开的（或你有访问权限）

### 2. 修改核心框架配置

编辑 `core/sdm-core.js`，修改以下配置为你自己的：

```javascript
const MY_GITHUB_USER = 'your-github-username';   // 改成你的 GitHub 用户名
const MY_GITHUB_REPO = 'sdm-modular-plugins';     // 改成你的仓库名
const MY_GITHUB_BRANCH = 'main';                   // 分支名
```

### 3. 安装核心插件

1. 打开你的设备管理界面
2. 导入 `sdm-core.js` 作为新插件
3. 启用插件

### 4. 安装模块

1. 在插件界面点击「📦 模块管理」
2. 点击对应模块的「安装」按钮
3. 等待安装完成，模块会自动加载

## 🔄 如何更新单个模块

### 示例：更新「设备管理器」模块

1. 修改 `modules/device-manager/module.js` 中的代码
2. 更新 `modules/device-manager/_latest.json` 中的版本号：
   ```json
   {
     "rev": "1.0.1",   // 版本号 +1
     "js": "modules/device-manager/module.js",
     "changelog": [
       {
         "title": "设备管理器 v1.0.1",
         "items": [
           "修复了xxx问题",
           "新增了xxx功能"
         ]
       }
     ]
   }
   ```
3. 将修改后的两个文件推送到 GitHub 仓库
4. 在设备上点击「检查所有更新」或在对应模块卡片上点击「更新」

**重要：版本号必须大于当前已安装的版本，否则不会提示更新！**

## 🎯 5个模块说明

| 模块ID | 名称 | 功能说明 |
|--------|------|----------|
| `device-manager` | 设备管理器 | 设备扫描、活动日志、网络诊断 |
| `ai-assistant` | AI智能助手 | 设备巡检、网络监控、悬浮球面板 |
| `signal-monitor` | 5G信号监控 | 信号强度监控、质量评估、历史统计 |
| `hotspot-monitor` | 热点流量监控 | 热点设备列表、实时流量统计 |
| `game-booster` | 游戏加速与限速 | 游戏加速、去云控限速 |

## 🔧 开发新模块

### 模块基本结构

```javascript
// SDM Module: your-module-id
//@@SDM_MODULE_your-module-id@@    // ★ 必须有，用于校验模块身份
// Version: 1.0.0
// Description: 模块描述

(function(SDM) {
    if (!SDM) return;
    const MODULE_ID = 'your-module-id';
    const MODULE_NAME = '模块名称';
    const MODULE_VERSION = '1.0.0';

    // 你的模块代码...

    // 注册 UI 面板
    SDM.registerPanel(MODULE_ID, `<div>你的HTML</div>`);

    // 监听卸载事件（清理资源）
    SDM.on('module:unload', (id) => {
        if (id === MODULE_ID) {
            // 清理定时器、移除DOM等
        }
    });

})(window.SDM);
```

### SDM 全局 API

```javascript
// 事件总线
SDM.on('event', callback)     // 监听事件
SDM.off('event', callback)    // 取消监听
SDM.emit('event', data)       // 触发事件

// 工具函数
SDM.runShell(cmd, timeout)    // 执行 shell 命令
SDM.wait(ms)                  // 等待
SDM.toast(msg, color, dur)    // 显示提示

// UI
SDM.registerPanel(moduleId, html)  // 注册模块面板
SDM.getContainer()                 // 获取模块容器
```

### 模块间通信

```javascript
// 模块A发送事件
SDM.emit('device:scanned', devices);

// 模块B监听事件
SDM.on('device:scanned', (devices) => {
    console.log('收到设备列表:', devices);
});
```

## 📝 更新推送原理

1. **核心框架**启动时读取本地已安装的模块版本
2. 点击「检查更新」时，核心框架从 GitHub 拉取每个模块的 `_latest.json`
3. 比较云端版本号和本地版本号
4. 如果云端版本更新，显示「更新」按钮
5. 点击「更新」后：
   - 下载新的模块 JS 文件
   - 校验模块签名（`@@SDM_MODULE_xxx@@`）
   - 保存到本地 `/data/sdm-modular/modules/`
   - 动态加载执行新代码
6. 所有模块更新互不影响，只更新你选择的那个

## ⚠️ 注意事项

1. **模块签名校验**：每个模块必须包含 `//@@SDM_MODULE_模块ID@@` 标记，否则会被拒绝安装
2. **版本号格式**：使用 `x.y.z` 格式，数字越大版本越新
3. **CDN 缓存**：jsDelivr CDN 有缓存，刚推送的文件可能需要等几分钟才能拉到
4. **不影响原包**：本系统使用独立的存储路径 (`/data/sdm-modular/`) 和独立的插件签名，完全不会影响原始 SDM 插件
5. **模块依赖**：所有模块共享 `window.SDM` 全局对象，可以通过事件总线通信

## 🔧 故障排查

### 检查更新没反应？
1. 确认 GitHub 仓库是公开的
2. 确认 `_latest.json` 文件格式正确（是合法 JSON）
3. 确认版本号 `rev` 大于已安装版本
4. 可以试试切换网络，或等待 CDN 缓存刷新

### 模块安装失败？
1. 检查模块文件是否包含正确的签名标记
2. 检查文件大小是否正常（不能太小）
3. 查看控制台错误信息

### 如何完全卸载？
1. 在模块管理面板逐个卸载模块
2. 移除核心插件
3. 执行命令删除数据：`rm -rf /data/sdm-modular/`
