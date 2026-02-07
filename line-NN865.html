<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>賽特智慧預測系統</title>
    <style>
        /* 全屏科技背景层 */
        .bg-container {
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100vw; 
            height: 100vh; 
            z-index: -1; 
            overflow: hidden;
        }
        .bg-gradient {
            position: absolute; 
            width: 100%; 
            height: 100%; 
            background: linear-gradient(135deg, #000a14 0%, #000e1a 100%);
        }
        .bg-grid {
            position: absolute; 
            width: 100%; 
            height: 100%;
            background-image: linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
            background-size: 25px 25px; 
            animation: gridMove 40s linear infinite;
        }
        .bg-light {
            position: absolute; 
            top: 0; 
            width: 2px; 
            height: 100%;
            background: linear-gradient(to bottom, transparent, rgba(0, 255, 255, 0.6), transparent);
            animation: flowLight 12s ease-in-out infinite;
        }
        @keyframes gridMove {
            0% { background-position: 0 0; }
            100% { background-position: 25px 25px; }
        }
        @keyframes flowLight {
            0%, 100% { opacity: 0.2; transform: translateY(-15%); }
            50% { opacity: 0.5; transform: translateY(15%); }
        }

        /* 主内容容器 */
        #container {
            width: 100%; 
            min-height: 100vh; 
            padding: 30px 15px;
            color: #00ffff; 
            font-family: '微軟正黑體', sans-serif;
            position: relative; 
            z-index: 1;
            display: flex; 
            flex-direction: column; 
            justify-content: center;
        }
        h1 {
            font-size: 32px; 
            text-align: center; 
            letter-spacing: 3px; 
            margin-bottom: 40px;
            text-shadow: 0 0 15px rgba(0,255,255,0.8), 0 0 30px rgba(0,255,255,0.4);
        }
        .form-step {
            max-width: 550px; 
            margin: 0 auto 50px; 
            display: flex; 
            flex-direction: column; 
            gap: 20px;
            background: rgba(0, 255, 255, 0.05); 
            padding: 30px 25px; 
            border-radius: 20px;
            border: 1px solid rgba(0,255,255,0.3);
            box-shadow: 0 0 20px rgba(0,255,255,0.1), 0 0 10px rgba(0,255,255,0.2) inset;
            transition: all 0.3s ease;
        }
        label {
            font-weight: bold; 
            display: block; 
            margin-bottom: 8px;
            text-shadow: 0 0 5px rgba(0,255,255,0.5);
        }
        input {
            width: 100%; 
            padding: 12px; 
            background: transparent; 
            border: 1px solid rgba(0,255,255,0.5);
            border-radius: 6px; 
            color: #00ffff; 
            transition: all 0.3s ease;
            box-shadow: 0 0 5px transparent;
        }
        input:focus {
            outline: none;
            border-color: #00ffff !important;
            box-shadow: 0 0 12px rgba(0,255,255,0.8) !important;
        }
        input:invalid:not(:placeholder-shown) {
            border-color: #ff4444;
            box-shadow: 0 0 8px rgba(255,68,68,0.5);
        }
        button {
            padding: 14px 35px; 
            background: linear-gradient(90deg, #00ffff 0%, #00ccff 100%); 
            color: #000; 
            border: none; 
            border-radius: 8px; 
            font-weight: bold; 
            font-size: 17px;
            box-shadow: 0 0 15px rgba(0,255,255,0.6); 
            cursor: pointer; 
            transition: all 0.3s ease; 
            transform: scale(1);
        }
        button:hover {
            transform: scale(1.08) !important;
            box-shadow: 0 0 20px rgba(0,255,255,0.8) !important;
        }
        button:active {
            transform: scale(0.95) !important;
        }
        .loading-area {
            text-align: center; 
            display: none; 
            margin: 50px auto; 
            opacity: 0; 
            transition: opacity 0.5s ease;
            max-width: 500px;
        }
        .loading-text {
            font-size: 18px; 
            margin-bottom: 15px; 
            text-shadow: 0 0 8px rgba(0,255,255,0.6);
        }
        .progress-bar {
            width: 100%; 
            height: 16px; 
            border: 1px solid #00ffff; 
            border-radius: 10px; 
            overflow: hidden; 
            margin: auto; 
            box-shadow: 0 0 12px rgba(0,255,255,0.4);
        }
        .progress {
            height: 100%; 
            width: 0%; 
            background: linear-gradient(90deg, #00ffff 0%, #00ccaa 100%);
            transition: width 0.3s ease; 
            position: relative; 
            overflow: hidden;
        }
        .progress::before {
            content: "";
            position: absolute; 
            top: 0; 
            left: -100%; 
            width: 50%; 
            height: 100%;
            background: rgba(255,255,255,0.3); 
            transform: skewX(-20deg);
            animation: progressFlow 1.5s infinite;
        }
        @keyframes progressFlow {
            0% { left: -100%; }
            100% { left: 200%; }
        }
        .result-area {
            display: none; 
            text-align: center; 
            margin: 50px auto; 
            opacity: 0; 
            transform: translateY(20px);
            transition: all 0.8s ease-out; 
            max-width: 600px;
        }
        .result-area h2 {
            color: #ff4444; 
            font-size: 38px; 
            text-shadow: 0 0 15px rgba(255,68,68,0.8); 
            margin-bottom: 30px;
        }
        .result-area p {
            margin-top: 20px; 
            font-size: 18px; 
            color: #00ffff; 
            text-shadow: 0 0 8px rgba(0,255,255,0.4); 
            line-height: 1.6;
        }
        .result-area a {
            display: inline-block; 
            margin-top: 15px; 
            padding: 14px 30px; 
            background: linear-gradient(90deg, #00ffff 0%, #00ccff 100%); 
            color: #000; 
            border-radius: 6px; 
            font-weight: bold; 
            text-decoration: none; 
            box-shadow: 0 0 15px rgba(0,255,255,0.6); 
            transition: all 0.3s ease; 
            transform: scale(1);
        }
        .result-area a:hover {
            transform: scale(1.08);
            box-shadow: 0 0 20px rgba(0,255,255,0.8);
        }
        @media (max-width: 600px) {
            h1 { font-size: 28px !important; }
            .form-step { padding: 25px 20px !important; }
            .result-area h2 { font-size: 28px !important; }
            input, button, a { font-size: 15px !important; }
        }
    </style>
</head>
<body>
    <!-- 全屏科技背景 -->
    <div class="bg-container">
        <div class="bg-gradient"></div>
        <div class="bg-grid"></div>
        <div class="bg-light" style="left: 10%; animation-delay: 0s;"></div>
        <div class="bg-light" style="left: 30%; animation: flowLight 18s ease-in-out infinite 2s;"></div>
        <div class="bg-light" style="left: 70%; animation: flowLight 22s ease-in-out infinite 4s;"></div>
    </div>

    <!-- 主内容容器 -->
    <div id="container">
        <h1>賽特智慧預測系統</h1>

        <!-- 第一步：娱乐城输入 -->
        <div id="firstStep" class="form-step">
            <label>
                使用娛樂城：
                <input type="text" id="casinoName" required placeholder="請輸入娛樂城名稱">
            </label>
            <button onclick="connectDatabase()">連接數據庫</button>
        </div>

        <!-- 数据库连接进度（初始隐藏） -->
        <div id="dbLoadingArea" class="loading-area">
            <p class="loading-text" id="dbText">正在連接數據庫...</p>
            <div class="progress-bar">
                <div class="progress" id="dbProgressBar"></div>
            </div>
            <p class="loading-text" id="dbPercentText">0%</p>
        </div>

        <!-- 第二步：完整表单（初始隐藏） -->
        <div id="fullForm" class="form-step" style="display: none; opacity: 0; transform: translateY(20px);">
            <label>
                已連接娛樂城：
                <input type="text" id="casinoDisplay" readonly>
            </label>
            <label>
                選定的房間：
                <input type="text" id="room" required placeholder="請輸入房間信息">
            </label>
            <label>
                未開（ ）轉：
                <input type="number" id="unopenedTurns" required placeholder="請輸入未開轉數">
            </label>
            <label>
                前一（ ）轉開：
                <input type="number" id="prevTurn1" required placeholder="請輸入前一轉開數">
            </label>
            <label>
                前二（ ）轉開：
                <input type="number" id="prevTurn2" required placeholder="請輸入前二轉開數">
            </label>
            <label>
                今日 總下注金額：
                <input type="number" id="dailyBet" required placeholder="請輸入今日總下注金額">
            </label>
            <label>
                今日 得分率%：
                <input type="number" id="dailyRate" required placeholder="請輸入今日得分率">
            </label>
            <label>
                近30天 總下注金額：
                <input type="number" id="monthBet" required placeholder="請輸入近30天總下注金額">
            </label>
            <label>
                近30天 得分率%：
                <input type="number" id="monthRate" required placeholder="請輸入近30天得分率">
            </label>
            <button onclick="startAnalysis()">開始分析</button>
        </div>

        <!-- 分析进度（初始隐藏） -->
        <div id="analysisLoadingArea" class="loading-area">
            <p class="loading-text" id="analysisText">分析模型初始化中...</p>
            <div class="progress-bar">
                <div class="progress" id="analysisProgressBar"></div>
            </div>
        </div>

        <!-- 结果区域（初始隐藏） -->
        <div id="resultArea" class="result-area">
            <h2>你好笨，你被騙了 🤣</h2>
            <p>還想拿我們家的真預測系統？<br>分享到兩個你有在用的群組，截圖給小幫手，<br>我們就送你完整版本系統。</p>
            <p>LINE 問小幫手就對了👇</p>
            <a href="https://line.me/ti/p/sAcfLwFjDw" target="_blank">➤ 點我加入 LINE 免費領系統</a>
            <hr style="margin: 50px auto; width: 80%; border: 0; border-top: 1px solid rgba(0,255,255,0.3);">
            <p>不過既然你都被整了，給你點真誠的：<br><br>
               我們家娛樂城現在介紹朋友註冊，<br>
               <strong style="color:#00ff99; text-shadow:0 0 10px rgba(0,255,153,0.6);">
                 【好友只要有儲值，你就拿到 500 現金 + 888 禮金】
               </strong><br>
               不是什麼套路，不用抽獎、不用刷碼。<br><br>
               ✦ 推薦成功就發錢 ✦<br>
               ✦ 出金快 ✦ 活動多 ✦ 分潤穩 ✦<br><br>
               要不要認真賺點外快？
            </p>
        </div>
    </div>

    <script>
        let casinoName = "";

        // 第一步：连接数据库（校验“使用娛樂城”必填）
        function connectDatabase() {
            const casinoInput = document.getElementById('casinoName');
            casinoName = casinoInput.value.trim();
            
            if (!casinoName) {
                alert("請填寫「使用娛樂城」！");
                casinoInput.focus();
                return;
            }

            // 隐藏第一步，显示数据库连接进度
            const firstStep = document.getElementById('firstStep');
            const dbLoadingArea = document.getElementById('dbLoadingArea');
            
            firstStep.style.opacity = "0";
            firstStep.style.transform = "translateY(20px)";
            setTimeout(() => {
                firstStep.style.display = "none";
                dbLoadingArea.style.display = "block";
                setTimeout(() => dbLoadingArea.style.opacity = "1", 80);
                
                // 模拟连接数据库进度
                const dbText = document.getElementById('dbText');
                const dbProgressBar = document.getElementById('dbProgressBar');
                const dbPercentText = document.getElementById('dbPercentText');
                let progress = 0;
                
                const dbTexts = [
                    `正在驗證${casinoName}數據庫...`,
                    `建立加密連接...`,
                    `獲取數據訪問權限...`,
                    `同步基礎數據...`,
                    `連接成功，準備就緒`
                ];
                
                const interval = setInterval(() => {
                    progress += Math.random() * 8;
                    if (progress > 100) progress = 100;
                    
                    dbProgressBar.style.width = progress + "%";
                    dbPercentText.textContent = Math.floor(progress) + "%";
                    
                    if (progress > 10 && progress <= 30) dbText.textContent = dbTexts[0];
                    if (progress > 30 && progress <= 50) dbText.textContent = dbTexts[1];
                    if (progress > 50 && progress <= 70) dbText.textContent = dbTexts[2];
                    if (progress > 70 && progress <= 90) dbText.textContent = dbTexts[3];
                    if (progress > 90) dbText.textContent = dbTexts[4];
                    
                    if (progress === 100) {
                        clearInterval(interval);
                        setTimeout(() => {
                            dbLoadingArea.style.opacity = "0";
                            setTimeout(() => {
                                dbLoadingArea.style.display = "none";
                                showFullForm(); // 连接完成后显示完整表单
                            }, 600);
                        }, 1000);
                    }
                }, 300);
            }, 400);
        }

        // 显示完整表单（第二步）
        function showFullForm() {
            const fullForm = document.getElementById('fullForm');
            // 显示用户输入的娱乐城名称（只读）
            document.getElementById('casinoDisplay').value = casinoName;
            
            fullForm.style.display = "flex";
            setTimeout(() => {
                fullForm.style.opacity = "1";
                fullForm.style.transform = "translateY(0)";
            }, 80);
        }

        // 第三步：开始分析
        function startAnalysis() {
            // 获取所有输入框（排除只读的“已連接娛樂城”）
            const inputs = document.querySelectorAll('#fullForm input:not([readonly])');
            let isAllFilled = true;
            let firstEmptyInput = null;

            // 遍历校验
            inputs.forEach(input => {
                if (input.value.trim() === "" && isAllFilled) {
                    isAllFilled = false;
                    firstEmptyInput = input;
                    // 获取标签文本
                    const labelText = input.closest('label').textContent.trim();
                    alert(`請填寫「${labelText.replace('：', '')}」！`);
                }
            });

            // 若有空值，阻止分析并聚焦到第一个空输入框
            if (!isAllFilled && firstEmptyInput) {
                firstEmptyInput.focus();
                return;
            }

            // 隐藏表单，显示分析进度
            const fullForm = document.getElementById('fullForm');
            const analysisLoadingArea = document.getElementById('analysisLoadingArea');
            
            fullForm.style.opacity = "0";
            fullForm.style.transform = "translateY(20px)";
            setTimeout(() => {
                fullForm.style.display = "none";
                analysisLoadingArea.style.display = "block";
                setTimeout(() => analysisLoadingArea.style.opacity = "1", 80);

                // 模拟分析进度
                let progress = 0;
                const progressBar = document.getElementById('analysisProgressBar');
                const analysisText = document.getElementById('analysisText');
                const texts = [
                    "正在收集歷史數據...",
                    "建立預測模型...",
                    "運行深度學習算法...",
                    "校正參數誤差...",
                    "生成預測結果..."
                ];
                
                const interval = setInterval(() => {
                    progress += Math.random() * 6;
                    if (progress > 100) progress = 100;
                    
                    progressBar.style.width = progress + "%";
                    
                    if (progress > 20 && progress <= 40) analysisText.textContent = texts[0];
                    if (progress > 40 && progress <= 60) analysisText.textContent = texts[1];
                    if (progress > 60 && progress <= 80) analysisText.textContent = texts[2];
                    if (progress > 80 && progress <= 95) analysisText.textContent = texts[3];
                    if (progress > 95) analysisText.textContent = texts[4];
                    
                    if (progress === 100) {
                        clearInterval(interval);
                        setTimeout(() => {
                            analysisLoadingArea.style.opacity = "0";
                            setTimeout(() => {
                                analysisLoadingArea.style.display = "none";
                                const resultArea = document.getElementById('resultArea');
                                resultArea.style.display = "block";
                                setTimeout(() => {
                                    resultArea.style.opacity = "1";
                                    resultArea.style.transform = "translateY(0)";
                                }, 80);
                            }, 600);
                        }, 1200);
                    }
                }, 350);
            }, 400);
        }
    </script>
</body>
</html>
