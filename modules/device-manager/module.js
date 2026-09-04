// Version: 1.0.0
//@@SDM_MODULE_device-manager@@
(function(SDM) {
    'use strict';
    if (!SDM) return;

    var MODULE_ID = 'device-manager';
    var _bs = 'border:none;border-radius:12px;font-weight:bold;color:white;cursor:pointer;';

    // ─── requestInterval fallback (global helper from UFI app) ───
    var _ri = (typeof requestInterval === 'function') ? requestInterval : function(fn, ms) {
        var id = setInterval(fn, ms);
        return function() { clearInterval(id); };
    };

    // ════════════════════════════════════════════════════════════
    //  Constants — hotspot traffic monitor data files
    // ════════════════════════════════════════════════════════════
    var HOTSPOT_DATA_FILE = '/data/hotspot_traffic/data.json';
    var HOTSPOT_DATA_FALLBACK = '/sdcard/hotspot_traffic_data.json';
    var HOTSPOT_POLICY_FILE = '/data/hotspot_traffic/device_policy.json';
    var HOTSPOT_PID_FILE = '/data/hotspot_traffic/.pid';
    var HOTSPOT_TRAFFIC_PROC = '/data/local/tmp/hotspot_traffic';
    var HOTSPOT_BIN_FILE = '/sdcard/hotspot_traffic';
    var HOTSPOT_CUSTOM_NAMES_FILE = '/data/hotspot_traffic/custom_names.txt';
    var HOTSPOT_LS_PN_PREFIX = 'hotspot_traffic_pn_';
    var HOTSPOT_NAME_CACHE_TTL = 30000;

    // ════════════════════════════════════════════════════════════
    //  Module state
    // ════════════════════════════════════════════════════════════
    var _isScanning = false;
    var SCAN_INTERVAL = null;
    var SCAN_INTERVAL_MS = 10000;
    var _hotspotNameMap = {};
    var _hotspotNameMapCacheTime = 0;
    var _hotspotDaemonChecked = false;
    var _hotspotLastRecoverTs = 0;
    var _hotspotDataCache = null;
    var _hotspotDataCacheTime = 0;
    var _panelReady = false;

    // ════════════════════════════════════════════════════════════
    //  MAC OUI database — brand detection by MAC address prefix
    // ════════════════════════════════════════════════════════════
    var MAC_OUI_DB = {
        'AC:DE:48':'Apple','A4:5E:60':'Apple','DC:A4:CA':'Apple','F0:18:98':'Apple','28:E0:2C':'Apple','3C:07:54':'Apple','AC:3C:0A':'Apple','70:73:CB':'Apple','64:20:DA':'Apple','D0:81:7D':'Apple','90:8D:78':'Apple','B0:19:D6':'Apple','A0:99:9B':'Apple','1C:91:80':'Apple','F4:5C:89':'Apple','30:90:8F':'Apple','7C:C5:37':'Apple','8C:85:90':'Apple','C0:63:13':'Apple','68:96:7B':'Apple','D8:30:62':'Apple','9C:20:31':'Apple','40:33:1A':'Apple','88:66:5B':'Apple','50:7A:F5':'Apple','AC:CF:85':'Apple','58:1F:AA':'Apple','B4:4B:D6':'Apple',
        '00:9A:CD':'Huawei','AC:4E:91':'Huawei','CC:B1:1A':'Huawei','A4:CF:5A':'Huawei','B0:C5:54':'Huawei','80:9A:58':'Huawei','00:E0:4C':'Huawei','7C:1C:4E':'Huawei','4C:CC:8A':'Huawei','C8:E3:19':'Huawei','34:29:12':'Huawei','28:31:52':'Huawei','FC:64:74':'Huawei','A0:AF:CB':'Huawei','50:01:4A':'Huawei','84:DB:21':'Huawei','E0:43:DB':'Huawei','F0:7B:8C':'Huawei','48:00:BF':'Huawei','E4:61:3E':'Huawei','2C:AB:00':'Huawei','74:E5:43':'Huawei','D0:2E:AB':'Huawei','1C:F2:A4':'Huawei','EC:74:BA':'Huawei','04:65:9D':'Huawei',
        '64:09:80':'Xiaomi','F8:A4:5F':'Xiaomi','4C:49:62':'Xiaomi','C4:0B:CB':'Xiaomi','34:80:40':'Xiaomi','C8:1C:54':'Xiaomi','5C:02:72':'Xiaomi','A4:50:46':'Xiaomi','B0:E2:35':'Xiaomi','DC:08:0D':'Xiaomi','94:65:9C':'Xiaomi','C0:EE:FB':'Xiaomi','58:44:98':'Redmi','7C:5C:71':'Redmi','8C:5C:8B':'iQOO','38:F9:D3':'Xiaomi','CC:B1:5A':'Xiaomi','B0:0E:65':'Xiaomi','AC:C1:EE':'Xiaomi','A0:8D:22':'Xiaomi','B0:48:1A':'Xiaomi',
        '3C:BD:3A':'OPPO','C0:F8:10':'OPPO','94:EB:CD':'OPPO','A0:37:42':'OPPO','90:1B:71':'OPPO','7C:11:6A':'OPPO','20:A6:08':'OPPO','C0:EE:18':'OnePlus','64:16:66':'OnePlus','A0:8D:22':'OnePlus','A4:9A:58':'Honor','C8:9C:12':'Honor','A0:8A:2E':'Honor','B4:CD:27':'Honor','2C:AB:00':'realme','B0:82:7C':'realme','C0:38:78':'OPPO','94:2E:B0':'OPPO','44:63:49':'OPPO',
        '5C:31:2E':'vivo','A0:59:35':'vivo','9C:2E:A1':'vivo','B0:CC:DF':'vivo','14:9F:E3':'vivo','8C:25:30':'vivo','D4:AD:51':'vivo','20:82:A9':'vivo','B0:15:BD':'vivo','F0:79:59':'vivo','54:0E:85':'vivo','24:8A:07':'vivo',
        '00:12:FB':'Samsung','C0:97:3E':'Samsung','50:CC:F7':'Samsung','8C:8E:8E':'Samsung','5C:0A:5B':'Samsung','FC:8A:E5':'Samsung','AC:5F:3F':'Samsung','B0:5C:99':'Samsung','38:AA:3C':'Samsung','A8:F8:39':'Samsung','E0:2A:ED':'Samsung','B0:09:DA':'Samsung','D4:97:0B':'Samsung','88:32:1F':'Samsung','34:14:49':'Samsung','14:1F:BA':'Samsung',
        '00:1F:E2':'ZTE','C8:64:68':'ZTE','24:05:0F':'ZTE','5C:EA:1D':'ZTE','08:D2:7B':'ZTE','F0:5C:77':'ZTE','58:7A:6B':'ZTE','00:11:92':'nubia','C4:0B:4D':'nubia','C0:EE:FB':'ZTE','D8:E0:E1':'ZTE','F4:EE:3A':'ZTE',
        '04:92:5A':'Meizu','8C:BE:BE':'Meizu','B0:13:2D':'Meizu','E0:1C:88':'Meizu','E4:54:C3':'Meizu',
        '00:24:54':'Lenovo','14:5A:05':'Lenovo','C8:FF:28':'Lenovo','00:24:E4':'Lenovo PC','F0:76:1C':'Lenovo PC','C0:38:0E':'Lenovo','50:46:78':'Lenovo',
        '00:0D:3A':'Microsoft','5C:7F:17':'Microsoft','00:14:A4':'Dell','00:14:22':'Dell','F8:DB:88':'Dell','D4:AE:52':'Dell','00:1A:A0':'HP','00:24:A8':'HP','3C:5A:B4':'HP','A0:48:1C':'HP','F4:5C:89':'HP',
        '00:0C:29':'ASUS','00:11:2F':'ASUS','F8:DB:7F':'ASUS','AC:9B:0A':'ASUS','38:D5:47':'ASUS','E0:3F:49':'ASUS',
        '00:25:9C':'Cisco','00:1A:6C':'Cisco','FC:FB:FB':'Cisco','00:1D:0F':'TPLink','50:BD:5F':'TPLink','F4:EC:38':'TPLink','EC:08:6B':'TPLink','00:0C:43':'TP-Link','14:CC:82':'TP-Link','B0:48:1A':'TP-Link','00:E0:4C':'Realtek','00:13:46':'Realtek','00:1B:DE':'Netgear','00:1F:33':'Netgear','28:3B:71':'Netgear','00:11:95':'Netgear','C0:3F:0E':'Netgear','44:94:FC':'Netgear','9C:3D:CF':'Netgear','E0:46:9A':'Netgear','A0:21:B7':'Netgear',
        'B8:27:EB':'RaspberryPi','DC:A6:32':'RaspberryPi','E4:5F:01':'RaspberryPi','28:CD:C1':'RaspberryPi',
        'B0:F1:1C':'Google','F4:F5:E8':'Google','3C:28:6D':'Google','F4:6A:6D':'Google','94:18:65':'Google','30:95:65':'Google',
        'A4:34:D9':'Sony','B8:8D:12':'Sony','5C:9D:5E':'Sony','10:68:45':'Sony','7C:11:BE':'Sony',
        '00:19:86':'Nokia','48:43:B7':'Nokia','00:1C:D7':'Motorola','00:23:76':'Motorola','E0:73:E7':'Motorola','90:03:B7':'TCL','5C:52:2E':'TCL','B4:0B:44':'Letv','7C:B2:32':'Letv','90:B1:0D':'Letv',
        '04:E6:57':'SmartTV','C0:8A:DE':'SmartTV','70:7E:2D':'SmartTV','A0:C9:E4':'SmartTV','5C:49:8C':'SmartTV','80:3F:54':'SmartTV','74:03:BD':'SmartTV','CC:6E:73':'SmartTV','D4:05:DB':'SmartTV','E8:40:41':'SmartTV','F0:79:38':'SmartTV','48:BF:6B':'SmartTV',
        '18:05:32':'IoT','68:9E:19':'IoT','A0:02:42':'IoT','74:DA:38':'IoT','D0:03:04':'IoT','7C:DD:A1':'IoT','EC:11:21':'IoT',
        '00:1D:72':'Acer','00:1D:7B':'Acer','30:5A:3A':'Acer','D4:9E:FC':'Acer','00:1B:38':'MSI','00:11:0A':'MSI','C0:4A:00':'MSI',
        '00:1A:9B':'Teclast','20:82:E0':'Teclast','C0:3E:0A':'Teclast','10:02:B4':'Cube','C0:97:3E':'Cube',
        'C0:EE:FB':'Meta','D4:1E:28':'Meta','54:35:4D':'Meta',
        '00:0C:6E':'Nintendo','00:17:AB':'Nintendo','00:1D:83':'Nintendo','00:1F:C5':'Nintendo','00:23:31':'Nintendo','00:23:CC':'Nintendo','00:26:32':'Nintendo','00:2B:32':'Nintendo'
    };

    var BRAND_INFO = {
        'Apple':{bg:'linear-gradient(135deg,#555,#999)',text:'',label:'Apple'},
        'Huawei':{bg:'linear-gradient(135deg,#C8102E,#E63946)',text:'HW',label:'华为'},
        'Xiaomi':{bg:'linear-gradient(135deg,#FF6900,#FF8C42)',text:'MI',label:'小米'},
        'Redmi':{bg:'linear-gradient(135deg,#FF4D4D,#FF6B35)',text:'红',label:'红米'},
        'OPPO':{bg:'linear-gradient(135deg,#00A651,#0EAE57)',text:'OP',label:'OPPO'},
        'vivo':{bg:'linear-gradient(135deg,#415FFF,#6B8CFF)',text:'vivo',label:'vivo'},
        'iQOO':{bg:'linear-gradient(135deg,#000,#333)',text:'iQ',label:'iQOO'},
        'Samsung':{bg:'linear-gradient(135deg,#1428A0,#243BD8)',text:'SS',label:'三星'},
        'OnePlus':{bg:'linear-gradient(135deg,#EB0028,#FF4D5A)',text:'1+',label:'一加'},
        'Honor':{bg:'linear-gradient(135deg,#1A237E,#3949AB)',text:'荣耀',label:'荣耀'},
        'ZTE':{bg:'linear-gradient(135deg,#005BAC,#0080D0)',text:'ZTE',label:'中兴'},
        'realme':{bg:'linear-gradient(135deg,#FFC601,#FFD73C)',text:'R',label:'真我'},
        'Meizu':{bg:'linear-gradient(135deg,#00A6E0,#00C2FF)',text:'MZ',label:'魅族'},
        'Lenovo':{bg:'linear-gradient(135deg,#E2231A,#E8484B)',text:'LE',label:'联想'},
        'nubia':{bg:'linear-gradient(135deg,#C8102E,#E63946)',text:'NZ',label:'努比亚'},
        'Microsoft':{bg:'linear-gradient(135deg,#0078D4,#00A4EF)',text:'MS',label:'微软'},
        'Dell':{bg:'linear-gradient(135deg,#007DB8,#00A4D8)',text:'DE',label:'戴尔'},
        'HP':{bg:'linear-gradient(135deg,#0096D6,#00B4E0)',text:'HP',label:'惠普'},
        'ASUS':{bg:'linear-gradient(135deg,#003087,#0055B3)',text:'AS',label:'华硕'},
        'Lenovo PC':{bg:'linear-gradient(135deg,#E2231A,#E8484B)',text:'LE',label:'联想'},
        'Cisco':{bg:'linear-gradient(135deg,#1BA0E2,#0A7CAB)',text:'CI',label:'思科'},
        'TPLink':{bg:'linear-gradient(135deg,#0A7CBA,#1B9FE0)',text:'TP',label:'TP-Link'},
        'TP-Link':{bg:'linear-gradient(135deg,#0A7CBA,#1B9FE0)',text:'TP',label:'TP-Link'},
        'Realtek':{bg:'linear-gradient(135deg,#00B388,#00C994)',text:'RT',label:'瑞昱'},
        'Netgear':{bg:'linear-gradient(135deg,#4B3A8A,#6B52B5)',text:'NG',label:'网件'},
        'RaspberryPi':{bg:'linear-gradient(135deg,#C51A4A,#E83E68)',text:'RPi',label:'树莓派'},
        'Google':{bg:'linear-gradient(135deg,#4285F4,#5A9BF5)',text:'GG',label:'Google'},
        'Sony':{bg:'linear-gradient(135deg,#333,#555)',text:'SO',label:'索尼'},
        'Nokia':{bg:'linear-gradient(135deg,#124191,#1B5FCC)',text:'NK',label:'诺基亚'},
        'Motorola':{bg:'linear-gradient(135deg,#0A5CB8,#1273E0)',text:'MT',label:'摩托罗拉'},
        'TCL':{bg:'linear-gradient(135deg,#0082C8,#009FE3)',text:'TCL',label:'TCL'},
        'Letv':{bg:'linear-gradient(135deg,#D33A2C,#E8584C)',text:'LE',label:'乐视'},
        'SmartTV':{bg:'linear-gradient(135deg,#1a237e,#283593)',text:'TV',label:'智能电视'},
        'IoT':{bg:'linear-gradient(135deg,#455a64,#607d8b)',text:'IoT',label:'智能设备'},
        'Acer':{bg:'linear-gradient(135deg,#83b81a,#a4d637)',text:'AC',label:'宏碁'},
        'MSI':{bg:'linear-gradient(135deg,#c8102e,#e63946)',text:'MSI',label:'微星'},
        'Teclast':{bg:'linear-gradient(135deg,#ff6d00,#ff9100)',text:'TE',label:'台电'},
        'Cube':{bg:'linear-gradient(135deg,#5c6bc0,#7986cb)',text:'CB',label:'酷比魔方'},
        'Meta':{bg:'linear-gradient(135deg,#1d44b4,#3b5fd9)',text:'MT',label:'Meta'},
        'Nintendo':{bg:'linear-gradient(135deg,#d62828,#e63946)',text:'ND',label:'任天堂'}
    };

    var HOSTNAME_MODEL_DB = {
        'iphone':'iPhone','ipad':'iPad','ipod':'iPod','macbook':'MacBook','imac':'iMac','macmini':'Mac mini','apple':'Apple设备',
        'sm-g998':'三星 S21 Ultra','sm-g991':'三星 S21','sm-g996':'三星 S21+','sm-g990':'三星 S21 FE',
        'sm-g970':'三星 S10','sm-g975':'三星 S10+','sm-g960':'三星 S9','sm-g965':'三星 S9+',
        'sm-g930':'三星 S8','sm-g935':'三星 S8+','sm-g950':'三星 S8','sm-g955':'三星 S8+',
        'sm-g9':'三星 S系列','sm-a':'三星 A系列','sm-m':'三星 M系列','sm-n':'三星 Note系列','sm-s':'三星 S系列',
        'sm-t':'三星 Tab系列','sm-p':'三星 Tab系列',
        'redmi':'红米','redmi-note':'红米 Note','redmi-k':'红米 K系列','redmi-pad':'红米 Pad',
        'mi-':'小米','miui':'小米','hmnote':'红米 Note','miphone':'小米手机','xiaomi':'小米',
        'm2007':'红米 K30','m2012':'红米 K40','m2104':'红米 K40 Gaming','2201':'红米 Note 11','2202':'红米 Note 11 Pro',
        '2301':'红米 Note 12','2302':'红米 Note 12 Pro','2312':'红米 K70','2311':'红米 K70 Pro',
        '2401':'小米14','23127':'小米14 Pro',
        'huawei':'华为','honor':'荣耀','nova':'华为 Nova','p30':'华为 P30','p40':'华为 P40','p50':'华为 P50','mate':'华为 Mate',
        'p60':'华为 P60','p70':'华为 Pura 70','aln':'华为 Mate 60','bgo':'华为 Mate 50','cma':'华为 Nova 11',
        'honor-v':'荣耀 V系列','honor-play':'荣耀 Play','honor-x':'荣耀 X系列','honor-magic':'荣耀 Magic',
        'oppo':'OPPO','oneplus':'一加','realme':'真我','oneplus8':'一加 8','oneplus9':'一加 9','oneplus10':'一加 10',
        'oneplus11':'一加 11','oneplus12':'一加 12','op5953':'OPPO Find X6','op5951':'OPPO Find X5',
        'cph':'OPPO 手机','phb':'OPPO 手机','pjp':'OPPO 手机',
        'vivo':'vivo','iqoo':'iQOO','vivo-x':'vivo X系列','vivo-s':'vivo S系列','vivo-y':'vivo Y系列',
        'v2204':'vivo X80','v2241':'vivo X90','v2304':'vivo X100','v2316':'iQOO 12','v2309':'iQOO 11',
        'pd2':'vivo 手机','pd4':'vivo 手机',
        'pixel':'Google Pixel','pixel-5':'Pixel 5','pixel-6':'Pixel 6','pixel-7':'Pixel 7','pixel-8':'Pixel 8',
        'nokia':'诺基亚','motorola':'摩托罗拉','moto':'摩托罗拉','moto-edge':'摩托罗拉 Edge',
        'lenovo':'联想','thinkpad':'ThinkPad','ideapad':'IdeaPad','thinkbook':'ThinkBook','yoga':'Yoga',
        'dell':'戴尔','latitude':'Latitude','inspiron':'Inspiron','xps':'XPS','hp':'惠普','pavilion':'Pavilion','omen':'OMEN','elitebook':'EliteBook',
        'asus':'华硕','rog':'ROG','zenbook':'ZenBook','tuf':'TUF','acernitro':'Acer Nitro','aspire':'Aspire',
        'msi':'MSI','raider':'Raider','stealth':'Stealth','vector':'Vector',
        'raspberrypi':'树莓派','raspberry':'树莓派','esp8266':'ESP8266','esp32':'ESP32','arduino':'Arduino',
        'alexa':'Echo','echo':'Echo','google-home':'Google Home','home-assistant':'Home Assistant',
        'androidtv':'Android TV','smarttv':'智能电视','firetv':'Fire TV','appletv':'Apple TV','chromecast':'Chromecast',
        'xiaomi-tv':'小米电视','redmi-tv':'红米电视','hisense':'海信','tcl-tv':'TCL电视','skyworth':'创维',
        'nintendo':'任天堂','switch':'Nintendo Switch','steamdeck':'Steam Deck',
        'metaquest':'Meta Quest','oculus':'Oculus Quest'
    };

    var GAME_DNS_DB = {
        '部落冲突':['supercell','clashofclans','clash-of-clans'],
        '皇室战争':['clashroyale','clash-royale','royale'],
        '荒野乱斗':['brawlstars','brawl-stars','brawl'],
        '和平精英':['pubgm','pubgmobile','igame','cdntencent','pubgmhd','tencentmobile'],
        '王者荣耀':['sgame','tmgp-sgame','tencentmob','honoraryking','pvp.qq.com','kfc.qq.com'],
        '原神':['mihoyo','genshin','yuanshen','hoyolab','hoyoverse','hoyowiki'],
        '崩坏':['bh3','honkai','starrail','ngsod','honkai3rd','star-rail'],
        '绝区零':['zenless','zzz','zenlesszonezero'],
        '英雄联盟':['lolm','leagueoflegends','lol.qq','wildrift','riot'],
        '穿越火线':['cf.qq','crossfire','cfmobile'],
        '使命召唤':['callofduty','codmobile','codm','activision'],
        'QQ飞车':['speedmobile','qqspeed','speed.qq'],
        'DNF':['dnf.qq','dnfmobile','dungeon','neople'],
        '火影忍者':['naruto','hyr.qq','nns.qq','bandai'],
        '阴阳师':['onmyoji','yys.netease'],
        '第五人格':['dwrg','identityv','idv.netease'],
        '荒野行动':['knivesout','g27.netease','cyberhunter'],
        '光遇':['sky.netease','thatgamecompany','skychildrenoflight'],
        '我的世界':['minecraft','mojang','mcpe'],
        '万国觉醒':['rok.lilith','riseofkingdoms','lilithgame'],
        '狂野飙车':['gameloft','asphalt','gloft'],
        '糖果传奇':['candycrushsaga','candycrush','king.com'],
        '地铁跑酷':['subwaysurf','subway-surfers','kiloo'],
        '哈利波特':['hpmagic','hp.netease','harrypotter'],
        '云游戏':['cloudgame','start.qq','cloudgame.netease'],
        '明日方舟':['arknights','hypergryph','skland'],
        'FGO':['fate-go','fategrandorder','fgo','aniplex'],
        '公主连结':['priconne','princessconnect','cr.pcr'],
        '战双帕弥什':['pgr','kurogame','punishing'],
        '鸣潮':['wuthering','kurogame','wutheringwaves'],
        '幻塔':['hotta','pwrd','toweroffantasy'],
        'Free Fire':['freefire','garena','ff.garena'],
        '暗黑破坏神':['diablo','blizzard','diabloimmortal'],
        '炉石传说':['hearthstone','blizzard','battle.net'],
        '永劫无间':['narakabladepoint','netease.naraka','narakagame'],
        '逆水寒':['chinasword','netease.nssb','justice.netease'],
        '金铲铲之战':['tft','teamfight','riotgames'],
        '金铲铲':['tftmobile','cloudtft','riotgames'],
        'Apex':['apex','ea.com','apexmobile'],
        '球球大作战':['supercell.boom','ballbattle','ballfight'],
        '球球英雄':['ballhero','heroball']
    };

    var GAME_PORT_DB = {
        '8430':'部落冲突','9339':'部落冲突','5222':'皇室战争','5223':'荒野乱斗',
        '9331':'部落冲突','9332':'荒野乱斗','9330':'皇室战争',
        '23456':'和平精英','8053':'王者荣耀','17000':'王者荣耀',
        '18080':'穿越火线','10012':'QQ飞车','10013':'DNF手游',
        '10030':'QQ飞车','10031':'穿越火线','10032':'王者荣耀',
        '22102':'原神','22103':'原神','22101':'崩坏：星穹铁道',
        '22104':'绝区零','21004':'崩坏3',
        '5050':'阴阳师','5051':'第五人格','5052':'荒野行动',
        '5053':'率土之滨','5054':'决战平安京','5055':'大话西游',
        '5229':'英雄联盟手游','5230':'云顶之弈',
        '1119':'炉石传说','3724':'暗黑破坏神',
        '43300':'Apex','43301':'FIFA','43310':'极品飞车',
        '10001':'我的世界','25565':'我的世界(MP)','19132':'我的世界(PE)',
        '9001':'万国觉醒','9002':'剑与远征',
        '27015':'Steam游戏','27016':'Steam游戏','3478':'语音/游戏',
        '6112':'暴雪游戏','6113':'暴雪游戏','6881':'暴雪游戏',
        '3498':'游戏服务','3535':'游戏服务','3658':'游戏服务'
    };

    // ════════════════════════════════════════════════════════════
    //  Helper functions
    // ════════════════════════════════════════════════════════════
    var getBrandByMac = function(mac) {
        if (!mac) return '网络设备';
        var prefix = mac.toUpperCase().substring(0, 8);
        if (MAC_OUI_DB[prefix]) return MAC_OUI_DB[prefix];
        var prefix6 = mac.toUpperCase().replace(/:/g, '').substring(0, 6);
        for (var oui in MAC_OUI_DB) {
            if (oui.replace(/:/g, '') === prefix6) return MAC_OUI_DB[oui];
        }
        return '网络设备';
    };

    var getModelByHostname = function(hostname) {
        if (!hostname) return '';
        var lower = hostname.toLowerCase();
        for (var key in HOSTNAME_MODEL_DB) {
            if (lower.indexOf(key) >= 0) return HOSTNAME_MODEL_DB[key];
        }
        return '';
    };

    var isRandomMac = function(mac) {
        if (!mac || typeof mac !== 'string') return false;
        var parts = mac.split(':');
        if (parts.length !== 6) return false;
        return (parseInt(parts[0], 16) & 0x02) !== 0;
    };

    var maskMac = function(mac) {
        if (!mac) return '';
        var parts = mac.split(':');
        if (parts.length !== 6) return mac;
        return parts[0]+':'+parts[1]+':'+parts[2]+':**:**:**';
    };

    var formatBytes = function(bytes) {
        var num = parseInt(bytes) || 0;
        var abs = Math.abs(num);
        if (abs >= 1073741824) return (num/1073741824).toFixed(2)+'GB';
        if (abs >= 1048576) return (num/1048576).toFixed(2)+'MB';
        if (abs >= 1024) return (num/1024).toFixed(1)+'KB';
        return num+'B';
    };

    var guessGameByDns = function(dnsText) {
        if (!dnsText) return '';
        var lower = dnsText.toLowerCase();
        var bestMatch = '', bestScore = 0;
        for (var gameName in GAME_DNS_DB) {
            var domains = GAME_DNS_DB[gameName];
            for (var i = 0; i < domains.length; i++) {
                if (lower.indexOf(domains[i].toLowerCase()) >= 0) {
                    if (domains[i].length > bestScore) { bestScore = domains[i].length; bestMatch = gameName; }
                }
            }
        }
        return bestMatch;
    };

    var guessGameByPort = function(ports) {
        if (!ports || ports.length === 0) return '';
        for (var i = 0; i < ports.length; i++) {
            var p = ports[i].replace(/.*:/, '');
            if (GAME_PORT_DB[p]) return GAME_PORT_DB[p];
        }
        return '';
    };

    // ════════════════════════════════════════════════════════════
    //  Hotspot traffic monitor data reading
    // ════════════════════════════════════════════════════════════
    var loadHotspotNameMap = async function() {
        try {
            if (Date.now() - _hotspotNameMapCacheTime < HOTSPOT_NAME_CACHE_TTL) return;
            var r = await SDM.runShell("timeout 2s awk '{print}' " + HOTSPOT_CUSTOM_NAMES_FILE + " 2>/dev/null || echo ''");
            var map = {};
            var lines = (r && r.content) ? r.content.split('\n') : [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var idx = line.indexOf('|');
                if (idx > 0) map[line.slice(0, idx).toUpperCase()] = line.slice(idx + 1).trim();
            }
            _hotspotNameMap = map;
            _hotspotNameMapCacheTime = Date.now();
        } catch(e) {
            _hotspotNameMap = {};
        }
    };

    var resolveDisplayName = function(device) {
        var uMac = (device.mac || '').toUpperCase();
        var pendingKey = HOTSPOT_LS_PN_PREFIX + uMac;
        var pending = null;
        try { pending = localStorage.getItem(pendingKey); } catch(e) {}
        if (pending !== null) {
            return pending || ((device.hostname || '').trim() || '未知设备');
        }
        var customName = (device.customName || '').trim();
        if (!customName && _hotspotNameMap[uMac]) {
            customName = _hotspotNameMap[uMac];
        }
        return customName || ((device.hostname || '').trim() || '未知设备');
    };

    var readHotspotTrafficData = async function() {
        try {
            var res = await SDM.runShell("echo __DATA__ && timeout 3s awk '{print}' " + HOTSPOT_DATA_FILE + " 2>/dev/null || timeout 2s awk '{print}' " + HOTSPOT_DATA_FALLBACK + " 2>/dev/null || echo ''");
            var text = (res && res.content) ? res.content.trim() : '';
            if (text.indexOf('__DATA__') >= 0) {
                text = text.split('__DATA__')[1] || '';
                text = text.trim();
            }
            if (text && text[0] === '{') {
                var parsed = JSON.parse(text);
                if (parsed && parsed.devices && typeof parsed.devices === 'object') {
                    await loadHotspotNameMap();
                    return parsed;
                }
            }
        } catch(e) {
            SDM.addDiagLog('读取热点流量数据失败: ' + String(e), 'error');
        }
        return null;
    };

    var readHotspotVersion = async function() {
        try {
            var res = await SDM.runShell("timeout 2s awk '{print}' /data/hotspot_traffic/.version 2>/dev/null || echo ''");
            return (res && res.content) ? res.content.trim().replace(/^pending:/, '') : '';
        } catch(e) { return ''; }
    };

    var readHotspotPolicy = async function() {
        try {
            var res = await SDM.runShell("timeout 2s awk '{print}' " + HOTSPOT_POLICY_FILE + " 2>/dev/null || echo ''");
            var text = (res && res.content) ? res.content.trim() : '';
            if (text && (text[0] === '{' || text[0] === '[')) {
                return JSON.parse(text);
            }
        } catch(e) {}
        return {};
    };

    var checkHotspotDaemon = async function() {
        try {
            var checkRes = await SDM.runShell(
                "_p=$(timeout 1s awk '{print}' " + HOTSPOT_PID_FILE + " 2>/dev/null); " +
                "[ -n \"$_p\" ] && kill -0 \"$_p\" 2>/dev/null && echo running=1 || echo running=0"
            );
            var checkText = (checkRes.content || '').trim();
            if (checkText === 'running=1') return true;

            if (Date.now() - _hotspotLastRecoverTs < 30000) return false;
            _hotspotLastRecoverTs = Date.now();

            var binRes = await SDM.runShell('[ -f ' + HOTSPOT_BIN_FILE + ' ] && echo exists || echo none');
            if ((binRes.content || '').trim() === 'none') {
                SDM.addDiagLog('热点流量监控二进制文件不存在(/sdcard/hotspot_traffic)，请先安装热点流量监控插件', 'error');
                return false;
            }

            SDM.addDiagLog('热点流量监控守护进程未运行，尝试启动...', 'net');
            await SDM.runShell(
                'cp ' + HOTSPOT_BIN_FILE + ' ' + HOTSPOT_TRAFFIC_PROC + ' && ' +
                'chmod 755 ' + HOTSPOT_TRAFFIC_PROC + ' && ' +
                'nohup ' + HOTSPOT_TRAFFIC_PROC + ' >/dev/null 2>&1 &'
            );
            await SDM.wait(1500);

            var recheckRes = await SDM.runShell(
                "_p=$(timeout 1s awk '{print}' " + HOTSPOT_PID_FILE + " 2>/dev/null); " +
                "[ -n \"$_p\" ] && kill -0 \"$_p\" 2>/dev/null && echo running=1 || echo running=0"
            );
            if ((recheckRes.content || '').trim() === 'running=1') {
                SDM.addDiagLog('热点流量监控守护进程已自动恢复启动', 'success');
                return true;
            }
            SDM.addDiagLog('热点流量监控守护进程启动失败', 'error');
        } catch(e) {
            SDM.addDiagLog('热点守护进程检查失败: ' + String(e), 'error');
        }
        return false;
    };

    // ════════════════════════════════════════════════════════════
    //  Listen for hotspot:data events from hotspot-monitor module
    // ════════════════════════════════════════════════════════════
    SDM.on('hotspot:data', function(data) {
        if (data && data.devices) {
            _hotspotDataCache = data;
            _hotspotDataCacheTime = Date.now();
            if (_hotspotNameMapCacheTime === 0 || Date.now() - _hotspotNameMapCacheTime > HOTSPOT_NAME_CACHE_TTL) {
                loadHotspotNameMap();
            }
        }
    });

    // Get hotspot data: use cached event data if recent, otherwise read via shell
    var getHotspotData = async function() {
        if (_hotspotDataCache && Date.now() - _hotspotDataCacheTime < 10000) {
            return _hotspotDataCache;
        }
        return await readHotspotTrafficData();
    };

    // ════════════════════════════════════════════════════════════
    //  Device scanning
    // ════════════════════════════════════════════════════════════
    var scanDevices = async function() {
        if (_isScanning) return;
        _isScanning = true;
        try {
            await _doScanDevices();
        } catch(e) {
            SDM.addDiagLog('扫描异常: ' + String(e), 'error');
        }
        _isScanning = false;
    };

    var _doScanDevices = async function() {
        var listEl = SDM.getCachedEl('#smart_scan_list');
        if (!listEl) {
            listEl = document.querySelector('#smart_scan_list');
        }
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center;padding:15px;opacity:.5;font-size:.6rem">⏳ 正在扫描设备...</div>';

        // Check hotspot daemon
        var daemonRunning = await checkHotspotDaemon();

        // Batch get all network data in one shell call
        var batchRes = await SDM.runShell(
            'echo __ARP__\n' +
            'timeout 2s cat /proc/net/arp 2>/dev/null | grep -v "00:00:00:00:00:00" | grep -v "IP " || echo ""\n' +
            'echo __NEIGH__\n' +
            'timeout 2s ip neigh 2>/dev/null | grep -v "FAILED" | grep -v "^$" || echo ""\n' +
            'echo __DHCP__\n' +
            'timeout 2s cat /data/misc/dhcp/dnsmasq.leases 2>/dev/null || echo ""\n' +
            'echo __DNS__\n' +
            'timeout 2s cat /data/misc/dhcp/dnsmasq.log 2>/dev/null | tail -300 | grep -i "query" | awk \'{print $NF}\' | sort -u || echo ""\n' +
            'echo __CONNTRACK__\n' +
            'timeout 3s cat /proc/net/nf_conntrack 2>/dev/null || echo ""\n' +
            'echo __END__'
        );
        var batchText = (batchRes && batchRes.content) ? batchRes.content : '';

        var arpText = '', neighText = '', dhcpText = '', dnsText = '', conntrackText = '';
        if (batchText.indexOf('__ARP__') >= 0) {
            arpText = batchText.split('__ARP__')[1] || '';
            arpText = arpText.split('__NEIGH__')[0] || '';
        }
        if (batchText.indexOf('__NEIGH__') >= 0) {
            neighText = batchText.split('__NEIGH__')[1] || '';
            neighText = neighText.split('__DHCP__')[0] || '';
        }
        if (batchText.indexOf('__DHCP__') >= 0) {
            dhcpText = batchText.split('__DHCP__')[1] || '';
            dhcpText = dhcpText.split('__DNS__')[0] || '';
        }
        if (batchText.indexOf('__DNS__') >= 0) {
            dnsText = batchText.split('__DNS__')[1] || '';
            dnsText = dnsText.split('__CONNTRACK__')[0] || '';
        }
        if (batchText.indexOf('__CONNTRACK__') >= 0) {
            conntrackText = batchText.split('__CONNTRACK__')[1] || '';
            conntrackText = conntrackText.split('__END__')[0] || '';
        }
        dnsText = dnsText.toLowerCase();
        var dnsTextLower = dnsText;
        var conntrackLower = conntrackText.toLowerCase();

        var devices = [];

        // Read from hotspot traffic monitor (event cache or direct shell)
        var hotspotData = await getHotspotData();
        var hotspotPolicy = await readHotspotPolicy();
        if (hotspotData && hotspotData.devices) {
            var htCount = 0;
            for (var macKey in hotspotData.devices) {
                var dev = hotspotData.devices[macKey];
                if (!dev || !dev.mac) continue;
                htCount++;
                var displayName = resolveDisplayName(dev);
                devices.push({
                    ip: dev.ip || '',
                    mac: dev.mac,
                    hostname: displayName,
                    brand: '',
                    model: '',
                    randomMac: false,
                    online: dev.online !== undefined ? dev.online : true,
                    connections: 0,
                    txBytes: dev.txBytes || 0,
                    rxBytes: dev.rxBytes || 0,
                    apps: [],
                    game: '',
                    connType: dev.connType || '',
                    customName: displayName,
                    htDevice: true,
                    blocked: hotspotPolicy && hotspotPolicy[dev.mac] && hotspotPolicy[dev.mac].type === 'blacklist'
                });
            }
            SDM.addDiagLog('从热点流量监控获取 ' + htCount + ' 台设备 (守护进程:' + (daemonRunning ? '运行' : '未运行') + ')', 'net');
        }

        // Supplement from ARP table
        if (arpText.trim()) {
            var arpLines = arpText.trim().split('\n').filter(function(l) { return l.trim(); });
            for (var ai = 0; ai < arpLines.length; ai++) {
                var parts = arpLines[ai].trim().split(/\s+/);
                if (parts.length >= 4) {
                    var ip = parts[0];
                    var mac = parts[3];
                    if (mac && mac !== '00:00:00:00:00:00' && mac !== '*') {
                        var exists = devices.some(function(d) { return d.mac.toUpperCase() === mac.toUpperCase(); });
                        if (!exists) {
                            var arpName = _hotspotNameMap[mac.toUpperCase()] || '';
                            devices.push({ ip: ip, mac: mac, hostname: arpName, brand: '', model: '', randomMac: false, online: true, connections: 0, txBytes: 0, rxBytes: 0, apps: [], game: '', htDevice: false, customName: arpName });
                        } else {
                            var existing = devices.find(function(d) { return d.mac.toUpperCase() === mac.toUpperCase(); });
                            if (existing && !existing.ip) existing.ip = ip;
                        }
                    }
                }
            }
        }

        // Supplement from ip neigh
        if (neighText.trim()) {
            var neighLines = neighText.trim().split('\n').filter(function(l) { return l.trim(); });
            for (var ni = 0; ni < neighLines.length; ni++) {
                var nparts = neighLines[ni].trim().split(/\s+/);
                if (nparts.length >= 4) {
                    var nip = nparts[0];
                    var nmac = nparts[4] || nparts[3] || '';
                    var lineStr = neighLines[ni];
                    var macMatch = lineStr.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/);
                    if (macMatch) nmac = macMatch[1];
                    if (nmac && nmac !== '00:00:00:00:00:00' && nmac.indexOf(':') > 0) {
                        var nexists = devices.some(function(d) { return d.mac.toUpperCase() === nmac.toUpperCase(); });
                        if (!nexists) {
                            var nName = _hotspotNameMap[nmac.toUpperCase()] || '';
                            var nState = lineStr.match(/(REACHABLE|STALE|DELAY|PROBE|INCOMPLETE)/);
                            devices.push({ ip: nip, mac: nmac, hostname: nName, brand: '', model: '', randomMac: false, online: nState && nState[1] !== 'INCOMPLETE', connections: 0, txBytes: 0, rxBytes: 0, apps: [], game: '', htDevice: false, customName: nName });
                        } else {
                            var nexisting = devices.find(function(d) { return d.mac.toUpperCase() === nmac.toUpperCase(); });
                            if (nexisting && !nexisting.ip) nexisting.ip = nip;
                        }
                    }
                }
            }
        }

        // Supplement device names from DHCP leases
        if (dhcpText.trim()) {
            var dhcpLines = dhcpText.trim().split('\n').filter(function(l) { return l.trim(); });
            for (var di = 0; di < devices.length; di++) {
                var dd = devices[di];
                if (!dd.hostname) {
                    for (var dj = 0; dj < dhcpLines.length; dj++) {
                        var dparts = dhcpLines[dj].trim().split(/\s+/);
                        if (dparts.length >= 2 && dparts[1] === dd.mac) {
                            var dhcpHostname = dparts[3] || dparts[2] || '';
                            if (dhcpHostname) {
                                dd.hostname = dhcpHostname;
                                if (!dd.customName) dd.customName = dhcpHostname;
                            }
                        }
                    }
                    if (!dd.hostname) {
                        var htName = _hotspotNameMap[dd.mac.toUpperCase()];
                        if (htName) {
                            dd.hostname = htName;
                            dd.customName = htName;
                        }
                    }
                }
            }
        }

        // Batch parse conntrack for connections and traffic
        for (var bi = 0; bi < devices.length; bi++) {
            var bd = devices[bi];
            bd.brand = getBrandByMac(bd.mac);
            bd.model = getModelByHostname(bd.hostname);
            bd.randomMac = isRandomMac(bd.mac);

            if (bd.ip && conntrackText) {
                var ipLines = conntrackText.split('\n').filter(function(l) { return l.indexOf(bd.ip) >= 0; });
                bd.connections = ipLines.length;
                if (!bd.htDevice || !bd.txBytes) {
                    var totalBytes = 0;
                    for (var cli = 0; cli < ipLines.length; cli++) {
                        var matches = ipLines[cli].match(/bytes=(\d+)/g) || [];
                        for (var mi = 0; mi < matches.length; mi++) {
                            var bval = matches[mi].match(/bytes=(\d+)/);
                            if (bval) totalBytes += parseInt(bval[1]) || 0;
                        }
                    }
                    bd.txBytes = totalBytes;
                }
                var ports = new Set();
                for (var pli = 0; pli < ipLines.length && pli < 30; pli++) {
                    var dportMatches = ipLines[pli].match(/dport=(\d+)/g) || [];
                    for (var dpi = 0; dpi < dportMatches.length; dpi++) {
                        var dval = dportMatches[dpi].match(/dport=(\d+)/);
                        if (dval) ports.add(dval[1]);
                    }
                }
                var detectedApps = new Set();
                ports.forEach(function(p) {
                    if (p === '443' || p === '80') detectedApps.add('网页浏览');
                    else if (p === '1935') detectedApps.add('直播流');
                });
                var connDetail = ipLines.join('\n').toLowerCase();
                var gameByDns = guessGameByDns(dnsTextLower + '\n' + connDetail);
                if (gameByDns) {
                    detectedApps.add('游戏: ' + gameByDns);
                    bd.game = gameByDns;
                }
                var gameByPort = guessGameByPort(Array.from(ports));
                if (gameByPort) {
                    detectedApps.add('游戏: ' + gameByPort);
                    bd.game = gameByPort;
                }
                if (bd.connections > 50 && !bd.game) detectedApps.add('高流量');
                if (detectedApps.size === 0 && bd.connections > 0) detectedApps.add('在线活动');
                if (detectedApps.size === 0) detectedApps.add('空闲');
                bd.apps = Array.from(new Set(detectedApps));
            } else {
                bd.apps = ['空闲'];
            }
        }

        // Refresh list element reference (may have been re-registered)
        listEl = document.querySelector('#smart_scan_list');
        var countEl = document.querySelector('#smart_device_count');
        if (countEl) countEl.textContent = devices.length;
        if (devices.length === 0) {
            if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;opacity:.5;font-size:.6rem">暂无设备连接<br><span style="font-size:.45rem;opacity:.5;">' + (daemonRunning ? '热点监控守护进程运行中，但未检测到设备' : '热点监控守护进程未运行，无法识别设备！请先安装运行热点流量监控插件') + '</span></div>';
            SDM.addDiagLog('扫描完成: 0台设备 (守护进程:' + (daemonRunning ? '运行' : '未运行') + ')', 'net');
            return;
        }

        // Sort: online first, then by traffic descending
        devices.sort(function(a, b) {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            return ((b.txBytes || 0) + (b.rxBytes || 0)) - ((a.txBytes || 0) + (a.rxBytes || 0));
        });

        if (listEl) {
            listEl.innerHTML = devices.map(function(d, i) {
                var brandInfo = BRAND_INFO[d.brand] || { bg: 'linear-gradient(135deg,#ff9ecd,#ffd1e3)', text: (d.brand || '?').substring(0,2), label: d.brand };
                var modelText = d.model ? d.model : (d.brand && d.brand !== '网络设备' ? brandInfo.label : '');
                var onlineDot = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:middle;background:'+(d.online ? '#4CAF50' : '#666')+'"></span>';
                var brandLogo = '<div style="width:36px;height:36px;border-radius:50%;background:'+brandInfo.bg+';display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:bold;color:white;flex-shrink:0;">'+(brandInfo.text || (d.brand || '?').substring(0,2))+'</div>';
                var randomTag = d.randomMac ? '<span style="background:rgba(255,193,7,.2);color:#ffc107;padding:1px 5px;border-radius:8px;font-size:.4rem;margin-left:4px;">随机MAC</span>' : '';
                var gameTag = d.game ? '<span style="background:linear-gradient(135deg,#4ade80,#22c55e);color:white;padding:2px 6px;border-radius:10px;font-size:.45rem;margin-left:4px;">🎮 '+d.game+'</span>' : '';
                var htTag = d.htDevice ? '<span style="background:rgba(96,165,250,.15);color:#60a5fa;padding:1px 5px;border-radius:8px;font-size:.4rem;margin-left:4px;">热点监控</span>' : '';
                var blockedTag = d.blocked ? '<span style="background:rgba(239,68,68,.2);color:#ef4444;padding:1px 5px;border-radius:8px;font-size:.4rem;margin-left:4px;">已拉黑</span>' : '';
                var appBadges = d.apps.map(function(a) {
                    var color = a.indexOf('游戏') >= 0 ? '#4ade80' : (a.indexOf('视频') >= 0 || a.indexOf('直播') >= 0 ? '#fbbf24' : '#a78bfa');
                    return '<span style="background:'+color+'22;color:'+color+';padding:1px 6px;border-radius:8px;font-size:.45rem;margin-right:4px;">'+a+'</span>';
                }).join('');
                var totalBytes = (d.txBytes || 0) + (d.rxBytes || 0);
                var trafficInfo = totalBytes > 0 ? '<span style="font-size:.45rem;opacity:.5;color:#60a5fa;">流量:'+formatBytes(totalBytes) + (d.txBytes > 0 && d.rxBytes > 0 ? ' (↑'+formatBytes(d.txBytes)+' ↓'+formatBytes(d.rxBytes)+')' : '') + '</span>' : '<span style="font-size:.45rem;opacity:.5;">流量:'+formatBytes(d.txBytes)+'</span>';
                var wifiTag = d.connType === 'wifi' ? '<span style="font-size:.4rem;opacity:.5;">📶 WiFi</span>' : '';
                var macDisplay = maskMac(d.mac);
                return '<div style="display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:6px;border-radius:12px;background:rgba(255,158,205,.04);border:1px solid rgba(255,158,205,.06);' + (d.blocked ? 'opacity:.7;' : '') + '">' +
                    brandLogo +
                    '<div style="flex:1;min-width:0;">' +
                        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
                            onlineDot +
                            '<span style="font-size:.6rem;font-weight:bold;">'+(d.hostname || d.customName || modelText || ('设备'+(i+1)))+'</span>' +
                            randomTag + gameTag + htTag + blockedTag +
                        '</div>' +
                        '<div style="font-size:.5rem;opacity:.5;margin-top:2px;">'+(modelText || d.brand || '未知型号')+' | '+macDisplay+' | '+(d.ip || '无IP')+'</div>' +
                        '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;align-items:center;">'+appBadges+trafficInfo+wifiTag+'</div>' +
                    '</div>' +
                    '<div style="font-size:.45rem;opacity:.4;text-align:right;flex-shrink:0;">'+d.connections+'连接</div>' +
                '</div>';
            }).join('');
        }
        SDM.addDiagLog('扫描完成: '+devices.length+'台设备 (热点监控'+(hotspotData && hotspotData.devices ? Object.keys(hotspotData.devices).length : 0)+'台, 守护进程:'+(daemonRunning?'运行':'未运行')+')', 'net');
    };

    // ════════════════════════════════════════════════════════════
    //  Panel HTML
    // ════════════════════════════════════════════════════════════
    var panelHtml = '' +
    '<div class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(255,158,205,.05),rgba(125,211,252,.04));border:1px solid rgba(255,158,205,.14);">' +
        '<span class="sdm2-deco d1">📡</span><span class="sdm2-deco d2">✨</span><span class="sdm2-paw">🐾</span>' +
        '<div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span class="smart-grad-text sdm2-title-glow">📡 已连接设备</span>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:.55rem;opacity:.6;">共 <span id="smart_device_count">0</span> 台 <span class="sdm2-chip-star">💕</span></span>' +
                '<select id="smart_scan_interval" style="font-size:.45rem;padding:2px 6px;border-radius:8px;border:1px solid rgba(255,158,205,.25);background:rgba(255,158,205,.1);color:rgba(255,255,255,.85);outline:none;">' +
                    '<option value="3000">3秒</option>' +
                    '<option value="5000">5秒</option>' +
                    '<option value="10000" selected>10秒</option>' +
                    '<option value="15000">15秒</option>' +
                    '<option value="30000">30秒</option>' +
                '</select>' +
                '<button style="'+_bs+'background:linear-gradient(135deg,#7dd3fc,#38bdf8,#60a5fa);font-size:.45rem;padding:3px 10px;box-shadow:0 2px 10px rgba(56,189,248,.35);" id="smart_refresh_now">🔄 刷新</button>' +
            '</div>' +
        '</div>' +
        '<div id="smart_scan_list" style="max-height:300px;overflow-y:auto;">' +
            '<div style="text-align:center;padding:20px;opacity:.55;font-size:.6rem">🌸 点击刷新按钮扫描设备 🌸</div>' +
        '</div>' +
        '<div id="smart_action_box" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;"></div>' +
    '</div>' +
    '<div class="sdm2-card" style="padding:14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(135deg,rgba(192,132,252,.05),rgba(255,158,205,.04));border:1px solid rgba(192,132,252,.14);">' +
        '<span class="sdm2-deco d1">⭐</span><span class="sdm2-deco d3">✨</span>' +
        '<div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span class="smart-grad-text sdm2-title-glow">📜 活动日志</span>' +
            '<button style="'+_bs+'background:linear-gradient(135deg,#fb7185,#f43f5e);font-size:.45rem;padding:3px 10px;box-shadow:0 2px 10px rgba(244,63,94,.35);" id="smart_clear_log">清空</button>' +
        '</div>' +
        '<textarea id="smart_log_area" disabled style="font-size:.5rem !important;border:none;padding:8px;margin:0;width:100%;height:120px;border-radius:12px;overflow-x:hidden;background:linear-gradient(135deg,rgba(20,12,28,.55),rgba(30,18,44,.45));color:rgba(255,214,232,.7);border:1px solid rgba(192,132,252,.2);" placeholder="暂无日志 ✨"></textarea>' +
    '</div>' +
    '<div class="sdm2-card" style="padding:14px;border-radius:18px;margin-bottom:10px;border:1px solid rgba(255,158,205,.2);background:linear-gradient(135deg,rgba(255,158,205,.07),rgba(196,79,196,.05),rgba(192,132,252,.05));">' +
        '<span class="sdm2-deco d1">💫</span><span class="sdm2-deco d2">📊</span><span class="sdm2-paw">🐱</span>' +
        '<div class="title" style="font-size:.7rem;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span class="smart-grad-text sdm2-title-glow">📊 网络诊断日志</span>' +
            '<button id="smart_clear_diaglog" style="font-size:.45rem;padding:3px 10px;'+_bs+'background:linear-gradient(135deg,#fb7185,#f43f5e);box-shadow:0 2px 10px rgba(244,63,94,.35);">清空</button>' +
        '</div>' +
        '<textarea id="smart_diag_log" disabled style="font-size:.5rem !important;border:none;padding:8px;margin:0;width:100%;height:100px;border-radius:12px;overflow-x:hidden;background:linear-gradient(135deg,rgba(20,12,28,.55),rgba(30,18,44,.45));color:rgba(255,214,232,.7);border:1px solid rgba(255,158,205,.18);" placeholder="暂无诊断日志 ✨"></textarea>' +
    '</div>';

    // ════════════════════════════════════════════════════════════
    //  Register panel and bind events
    // ════════════════════════════════════════════════════════════
    SDM.registerPanel(MODULE_ID, panelHtml);

    var _init = function() {
        if (_panelReady) return;
        _panelReady = true;

        // Scan device action button
        var actionBox = document.querySelector('#smart_action_box');
        if (actionBox) {
            var scanBtn = document.createElement('button');
            scanBtn.textContent = '📡 扫描设备';
            scanBtn.className = 'smart_action_btn';
            scanBtn.style.cssText = 'font-size:.55rem;padding:8px 16px;background:linear-gradient(135deg,#7dd3fc,#38bdf8,#60a5fa);background-size:200% 100%;color:white;border:1px solid rgba(186,230,253,.5);border-radius:12px;font-weight:bold;cursor:pointer;';
            scanBtn.onclick = async function() {
                if (!(await SDM.checkAdvance())) {
                    SDM.toast('未开启高级功能', 'red');
                    return;
                }
                SDM.toast('正在扫描...', 'pink', 3000);
                await scanDevices();
            };
            actionBox.appendChild(scanBtn);
        }

        // Clear log button
        var clearLogBtn = document.querySelector('#smart_clear_log');
        if (clearLogBtn) {
            clearLogBtn.onclick = function() {
                SDM.toast('日志已清空', 'green', 1500);
            };
        }

        // Clear diag log button
        var clearDiagBtn = document.querySelector('#smart_clear_diaglog');
        if (clearDiagBtn) {
            clearDiagBtn.onclick = function() {
                SDM.toast('诊断日志已清空', 'green', 1500);
            };
        }

        // Scan interval selector
        var intervalSelect = document.querySelector('#smart_scan_interval');
        if (intervalSelect) {
            var savedInterval = null;
            try { savedInterval = localStorage.getItem('smart_scan_interval_ms'); } catch(e) {}
            if (savedInterval) {
                intervalSelect.value = savedInterval;
                SCAN_INTERVAL_MS = parseInt(savedInterval) || 10000;
            }
            intervalSelect.onchange = function() {
                SCAN_INTERVAL_MS = parseInt(this.value) || 10000;
                try { localStorage.setItem('smart_scan_interval_ms', String(SCAN_INTERVAL_MS)); } catch(e) {}
                if (SCAN_INTERVAL) { try { SCAN_INTERVAL(); } catch(e) {} SCAN_INTERVAL = null; }
                SCAN_INTERVAL = _ri(function() { scanDevices(); }, SCAN_INTERVAL_MS);
                SDM.addDiagLog('扫描间隔已设为 ' + (SCAN_INTERVAL_MS / 1000) + ' 秒', 'success');
                SDM.toast('刷新间隔: ' + (SCAN_INTERVAL_MS / 1000) + '秒', 'pink', 2000);
            };
        }

        // Refresh button
        var refreshBtn = document.querySelector('#smart_refresh_now');
        if (refreshBtn) {
            refreshBtn.onclick = async function() {
                if (_isScanning) {
                    SDM.toast('正在扫描中，请稍候...', 'pink', 2000);
                    return;
                }
                SDM.toast('正在刷新设备列表...', 'pink', 2000);
                await scanDevices();
            };
        }

        // Start auto-scan
        SCAN_INTERVAL = _ri(function() { scanDevices(); }, SCAN_INTERVAL_MS);
        scanDevices();
        SDM.addDiagLog('设备管理器模块已加载 (扫描间隔:' + (SCAN_INTERVAL_MS / 1000) + '秒)', 'success');
        SDM.emit('module:ready', MODULE_ID);
    };

    // Delay init to ensure DOM is ready
    setTimeout(_init, 100);

    // Listen for unload
    SDM.on('module:unload', function(id) {
        if (id === MODULE_ID) {
            if (SCAN_INTERVAL) { try { SCAN_INTERVAL(); } catch(e) {} SCAN_INTERVAL = null; }
            var panel = document.getElementById('sdm-panel-' + MODULE_ID);
            if (panel) panel.remove();
            _panelReady = false;
        }
    });

})(window.SDM);
//@@SDM_MODULE_device-manager_END@@
