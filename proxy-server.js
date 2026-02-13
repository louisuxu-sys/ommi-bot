const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3939;
const STATIC_DIR = __dirname;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  // /fetch?url=<encoded_url>
  if (parsed.pathname === '/fetch' && parsed.query.url) {
    const targetUrl = parsed.query.url;
    console.log(`[PROXY] ${new Date().toLocaleTimeString()} → ${targetUrl}`);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    };

    https.get(targetUrl, options, (proxyRes) => {
      let data = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(data);
        console.log(`[PROXY] ✓ ${data.length} bytes`);
      });
    }).on('error', (err) => {
      console.error(`[PROXY] ✗ ${err.message}`);
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // /parse?allianceid=3&gamedate=20260208 — 直接解析並回傳 JSON
  if (parsed.pathname === '/parse' && parsed.query.allianceid) {
    const aid = parsed.query.allianceid;
    const gd = parsed.query.gamedate || new Date().toISOString().slice(0,10).replace(/-/g,'');
    const liveUrl = `https://www.playsport.cc/livescore/${aid}?gamedate=${gd}`;
    const preUrl  = `https://www.playsport.cc/livescore/${aid}?gamedate=${gd}&mode=2`;
    console.log(`[PARSE] ${new Date().toLocaleTimeString()} → ${liveUrl} + mode=2`);

    const fetchOpts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    };

    // 同時抓取兩個頁面：預設模式（有比分）+ mode=2（有賽前資料/盤口）
    const fetchPage = (targetUrl) => new Promise((resolve, reject) => {
      https.get(targetUrl, fetchOpts, (proxyRes) => {
        let data = '';
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => resolve(data));
      }).on('error', reject);
    });

    Promise.all([fetchPage(liveUrl), fetchPage(preUrl)])
      .then(([liveHtml, preHtml]) => {
        try {
          // 從 mode=2 取得賽前資料（隊名、戰績、盤口）
          const games = parsePlaySportHTML(preHtml, aid, gd);
          // 從預設模式取得比分和狀態
          const scoreData = parseScoresFromLiveHTML(liveHtml);
          // 合併比分到 games
          for (const game of games) {
            const sd = scoreData[game.gameId];
            if (sd) {
              if (sd.awayScore !== null) game.awayScore = sd.awayScore;
              if (sd.homeScore !== null) game.homeScore = sd.homeScore;
              if (sd.status) game.status = sd.status;
              if (sd.quarterScores) game.quarterScores = sd.quarterScores;
            }
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, count: games.length, games, source: 'playsport.cc', date: gd }));
          console.log(`[PARSE] ✓ ${games.length} games found (scores: ${Object.keys(scoreData).length})`);
        } catch(e) {
          console.error(`[PARSE] parse error:`, e.message);
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      })
      .catch((err) => {
        console.error(`[PARSE] ✗ ${err.message}`);
        res.writeHead(502);
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // /check-dates?allianceid=3&dates=20260207,20260208,20260209
  // 快速檢查哪些日期有賽事（用 data-oid 日期驗證）
  if (parsed.pathname === '/check-dates' && parsed.query.allianceid && parsed.query.dates) {
    const aid = parsed.query.allianceid;
    const datesToCheck = parsed.query.dates.split(',');
    const fetchOpts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Encoding': 'identity',
      },
      timeout: 10000,
    };
    const fetchPage = (url) => new Promise((resolve, reject) => {
      https.get(url, fetchOpts, (r) => {
        let d = '';
        r.setEncoding('utf8');
        r.on('data', c => { d += c; });
        r.on('end', () => resolve(d));
      }).on('error', reject);
    });

    const results = {};
    const checks = datesToCheck.map(async (gd) => {
      try {
        const url = `https://www.playsport.cc/livescore/${aid}?gamedate=${gd}&mode=2`;
        const html = await fetchPage(url);
        // 檢查 data-oid 中是否有符合此日期的賽事
        const oidRegex = /data-oid="([^"]*)"/g;
        let match, count = 0;
        while ((match = oidRegex.exec(html)) !== null) {
          const parts = match[1].split('_');
          if (parts[1] === gd) count++;
        }
        results[gd] = count;
      } catch(e) {
        results[gd] = -1; // error
      }
    });

    Promise.all(checks).then(() => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, dates: results }));
      console.log(`[CHECK-DATES] ${Object.entries(results).map(([d,c])=>`${d}:${c}`).join(' ')}`);
    }).catch(err => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Health check
  if (parsed.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  // 靜態檔案服務（預設 sports-analysis.html）
  let filePath = parsed.pathname === '/' ? '/sports-analysis.html' : parsed.pathname;
  const fullPath = path.join(STATIC_DIR, filePath);
  const ext = path.extname(fullPath).toLowerCase();
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.setHeader('Content-Type', (mimeTypes[ext] || 'text/plain') + '; charset=utf-8');
    res.writeHead(200);
    res.end(data);
  });
});

/* ========== 從預設模式 HTML 解析比分和狀態 ========== */
function parseScoresFromLiveHTML(html) {
  const scoreData = {};

  // 先收集所有 gameId（從 outer-gamebox）
  const boxRegex = /id="outer-gamebox-(\d+)"/g;
  let boxMatch;
  const gameIds = [];
  while ((boxMatch = boxRegex.exec(html)) !== null) {
    gameIds.push(boxMatch[1]);
  }

  // 對每個 gameId，在整個 HTML 中搜尋比分（比分在 js-gameOnbox 區塊，不在 outer-gamebox 內）
  for (const gameId of gameIds) {
    let awayScore = null, homeScore = null;
    let status = null;
    let quarterScores = { away: [], home: [] };

    // 取得總分（大比分 strong 標籤）
    const asrBig = html.match(new RegExp(`id="${gameId}_asr_big"[^>]*>(\\d+)<`));
    const hsrBig = html.match(new RegExp(`id="${gameId}_hsr_big"[^>]*>(\\d+)<`));
    if (asrBig) awayScore = parseInt(asrBig[1]);
    if (hsrBig) homeScore = parseInt(hsrBig[1]);

    // 備援：普通 score td 標籤
    if (awayScore === null) {
      const asr = html.match(new RegExp(`id="${gameId}_asr"[^>]*>(\\d+)<`));
      if (asr) awayScore = parseInt(asr[1]);
    }
    if (homeScore === null) {
      const hsr = html.match(new RegExp(`id="${gameId}_hsr"[^>]*>(\\d+)<`));
      if (hsr) homeScore = parseInt(hsr[1]);
    }

    // 取得節比分（Q1~Q4 + OT）
    // playsport.cc 有兩種 ID 格式：_as1/_hs1 或 _a1/_h1
    for (let q = 1; q <= 8; q++) {
      const aq = html.match(new RegExp(`id="${gameId}_as${q}"[^>]*>(\\d+)<`))
              || html.match(new RegExp(`id="${gameId}_a${q}"[^>]*>(\\d+)<`));
      const hq = html.match(new RegExp(`id="${gameId}_hs${q}"[^>]*>(\\d+)<`))
              || html.match(new RegExp(`id="${gameId}_h${q}"[^>]*>(\\d+)<`));
      if (aq) quarterScores.away.push(parseInt(aq[1]));
      if (hq) quarterScores.home.push(parseInt(hq[1]));
    }

    // 判斷狀態：用 gamebox class 區分已結束 vs 進行中
    // 找到此 gamebox 的 HTML 範圍
    const gbLiveStart = html.indexOf(`id="outer-gamebox-${gameId}"`);
    const gbLiveEnd = html.indexOf('<!--outer-gamebox-->', gbLiveStart);
    const gbLiveHtml = (gbLiveStart > -1 && gbLiveEnd > -1) ? html.substring(gbLiveStart, gbLiveEnd) : '';

    if (awayScore !== null && homeScore !== null) {
      if (gbLiveHtml.includes('gamebox-notend')) {
        // gamebox-notend + 有比分 = 比賽進行中
        status = 'live';
      } else {
        // 有比分但沒有 gamebox-notend = 已結束
        status = 'finished';
      }
    }

    scoreData[gameId] = {
      awayScore,
      homeScore,
      status,
      quarterScores: (quarterScores.away.length > 0 || quarterScores.home.length > 0) ? quarterScores : null,
    };
  }

  return scoreData;
}

/* ========== HTML 解析（mode=2 賽前資料） ========== */
function parsePlaySportHTML(html, allianceid, gamedate) {
  const games = [];

  // 方法1：從 <select id="gamebattle"> 取得賽事清單 + 從 outer-gamebox 取得詳細資料
  // 先取得所有 outer-gamebox 的 data-oid
  const gameboxRegex = /<div[^>]*class="outer-gamebox"[^>]*id="outer-gamebox-(\d+)"[^>]*data-oid="([^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*class="outer-gamebox"|<div style="clear: both"><\/div>)/gi;
  
  // 更簡單的方法：用 select option 取得賽事列表
  const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi;
  const selectGames = [];
  let m;
  while ((m = optionRegex.exec(html)) !== null) {
    const val = m[1], text = m[2].trim();
    if (!val || val === '0' || !text.includes('vs')) continue;
    const parts = text.split(/\s*vs\s*/);
    if (parts.length === 2) {
      selectGames.push({ value: val, away: parts[0].trim(), home: parts[1].trim() });
    }
  }

  // 取得每場比賽的詳細資料
  // 從 outer-gamebox 取得 team names, time, odds, records
  const boxIdRegex = /id="outer-gamebox-(\d+)"[^>]*data-oid="([^"]*)"/g;
  const boxes = [];
  while ((m = boxIdRegex.exec(html)) !== null) {
    boxes.push({ id: m[1], oid: m[2] });
  }

  // 從 js-gamePreviewBox 取得隊名和時間
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const gameId = box.id;
    const oid = box.oid;
    const oidParts = oid.split('_');
    const teamCodes = oidParts[2] || '';

    // 驗證日期：data-oid 格式為 "NBA_20260208_WAS@BKN"，第二段是日期
    const oidDate = oidParts[1] || '';
    if (oidDate && gamedate && oidDate !== gamedate) {
      console.log(`[PARSE] skip game ${gameId}: oid date ${oidDate} != requested ${gamedate}`);
      continue; // 日期不符，跳過（playsport.cc 無賽事時會回傳其他日期資料）
    }

    // 找到對應的 previewBox 區塊
    const previewStart = html.indexOf(`id="gamebox-preview-${gameId}"`);
    let away = '', home = '', time = '';
    let record = {}, odds = {};

    if (previewStart > -1) {
      // 取得 preview 區塊（到下一個 gamebox 或 outer-gamebox）
      const previewEnd = html.indexOf('<!--====== 開打前的gamebox END======-->', previewStart);
      const previewHtml = previewEnd > -1 ? html.substring(previewStart, previewEnd) : html.substring(previewStart, previewStart + 10000);

      // 隊名：team_left 和 team_right
      const teamLeftMatch = previewHtml.match(/class="team_left[^"]*"[^>]*>[\s\S]*?(?:<a[^>]*>)?\s*([^<\n]+?)\s*(?:<\/a>)?/);
      const teamRightMatch = previewHtml.match(/class="team_right[^"]*"[^>]*>[\s\S]*?(?:<a[^>]*>)?\s*([^<\n]+?)\s*(?:<\/a>)?/);
      const teamCenterMatch = previewHtml.match(/class="team_cinter"[^>]*>\s*([^<]+)/);

      if (teamLeftMatch) away = teamLeftMatch[1].trim();
      if (teamRightMatch) home = teamRightMatch[1].trim();
      if (teamCenterMatch) time = teamCenterMatch[1].trim();

      // 戰績資料
      const recordMatch = previewHtml.match(/class="datd_c"[^>]*>\s*戰績[\s\S]*?class="datd_l"[^>]*>([\s\S]*?)<\/td>[\s\S]*?class="datd_r"[^>]*>([\s\S]*?)<\/td>/);
      if (recordMatch) {
        record.awayRecord = recordMatch[1].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
        record.homeRecord = recordMatch[2].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
      }

      const recentMatch = previewHtml.match(/class="datd_c"[^>]*>\s*近十場[\s\S]*?class="datd_l"[^>]*>([\s\S]*?)<\/td>[\s\S]*?class="datd_r"[^>]*>([\s\S]*?)<\/td>/);
      if (recentMatch) {
        record.awayRecent = recentMatch[1].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
        record.homeRecent = recentMatch[2].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
      }

      const h2hMatch = previewHtml.match(/class="datd_c"[^>]*>\s*對戰紀錄[\s\S]*?class="datd_l"[^>]*>([\s\S]*?)<\/td>[\s\S]*?class="datd_r"[^>]*>([\s\S]*?)<\/td>/);
      if (h2hMatch) {
        record.awayH2H = h2hMatch[1].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
        record.homeH2H = h2hMatch[2].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
      }

      const avgMatch = previewHtml.match(/class="datd_c"[^>]*>\s*平均得 \/ 失分[\s\S]*?class="datd_l"[^>]*>([\s\S]*?)<\/td>[\s\S]*?class="datd_r"[^>]*>([\s\S]*?)<\/td>/);
      if (avgMatch) {
        record.awayAvg = avgMatch[1].replace(/<[^>]+>/g, '').trim();
        record.homeAvg = avgMatch[2].replace(/<[^>]+>/g, '').trim();
      }

      const recentAvgMatch = previewHtml.match(/class="datd_c"[^>]*>\s*近十場平均得 \/ 失分[\s\S]*?class="datd_l"[^>]*>([\s\S]*?)<\/td>[\s\S]*?class="datd_r"[^>]*>([\s\S]*?)<\/td>/);
      if (recentAvgMatch) {
        record.awayRecentAvg = recentAvgMatch[1].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
        record.homeRecentAvg = recentAvgMatch[2].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
      }

      const mainAwayMatch = previewHtml.match(/class="datd_c"[^>]*>\s*主 \/ 客戰績[\s\S]*?class="datd_l"[^>]*>([\s\S]*?)<\/td>[\s\S]*?class="datd_r"[^>]*>([\s\S]*?)<\/td>/);
      if (mainAwayMatch) {
        record.awayHomeAway = mainAwayMatch[1].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
        record.homeHomeAway = mainAwayMatch[2].replace(/<[^>]+>/g, '').replace(/詳細比分/g, '').trim();
      }

      // 讓分盤口
      const spreadMatch = previewHtml.match(/今日讓分盤口[\s\S]*?class="datd_[lr]"[^>]*>([\s\S]*?)<\/td>/);
      // 大小盤口
      const ouMatch = previewHtml.match(/今日大小盤口[\s\S]*?class="datd_[lr]"[^>]*>([\s\S]*?)<\/td>/);
    }

    // 從 js-gameOnbox 取得讓分盤口
    const onboxRegex = new RegExp(`id="gamebox-${gameId}"[^>]*data-aheadprice="([^"]*)"[^>]*data-aheadodds="([^"]*)"`);
    const onboxMatch = html.match(onboxRegex);
    if (onboxMatch) {
      odds.spread = onboxMatch[1];
      odds.spreadOdds = onboxMatch[2];
    }

    // 如果 previewBox 沒取到隊名，從 select 找
    if (!away || !home) {
      const selectGame = selectGames.find(g => g.value === oid);
      if (selectGame) {
        away = away || selectGame.away;
        home = home || selectGame.home;
      }
    }

    // 從 onBox 的 data-nameh/data-namea 取得（最後手段）
    if (!away || !home) {
      const nameRegex = new RegExp(`id="gamebox-\\d+"[^>]*data-[^>]*data-nameh="([^"]*)"[^>]*data-namea="([^"]*)"`);
      // 找到與此 outer-gamebox 對應的 onbox
      const boxStart = html.indexOf(`id="outer-gamebox-${gameId}"`);
      const boxEnd = html.indexOf('</div><!--outer-gamebox-->', boxStart);
      if (boxStart > -1 && boxEnd > -1) {
        const boxHtml = html.substring(boxStart, boxEnd);
        const nameMatch = boxHtml.match(/data-nameh="([^"]*)"[^>]*data-namea="([^"]*)"/);
        if (nameMatch) {
          if (!home) home = nameMatch[1];
          if (!away) away = nameMatch[2];
        }
      }
    }

    // ===== 判斷賽事狀態 =====
    let status = 'upcoming';
    let homeScore = null, awayScore = null;

    // 找到此 gamebox 的完整 HTML 範圍
    const gbStart = html.indexOf(`id="outer-gamebox-${gameId}"`);
    const gbEnd = html.indexOf('</div><!--outer-gamebox-->', gbStart);
    const gbHtml = (gbStart > -1 && gbEnd > -1) ? html.substring(gbStart, gbEnd) : '';

    // 0. 檢查延期（PPD / 延期 / 延賽 / Postponed）
    if (/PPD|延期|延賽|改期|Postponed|postponed/i.test(gbHtml)) {
      status = 'postponed';
    }

    // 1. 取得比分（允許 1~3 位數，適用 NBA / SBL 等各聯賽）
    const scoreAMatch = gbHtml.match(new RegExp(`id="${gameId}_asr"[^>]*>(\\d{1,3})</span>`));
    const scoreHMatch = gbHtml.match(new RegExp(`id="${gameId}_hsr"[^>]*>(\\d{1,3})</span>`));
    if (scoreAMatch) awayScore = parseInt(scoreAMatch[1]);
    if (scoreHMatch) homeScore = parseInt(scoreHMatch[1]);

    // 2. 用 playsport.cc 的 class 判斷狀態
    //    gamebox-end = 已結束（含 "gamebox-end" class）
    //    gamebox-notend = 尚未結束（可能進行中或未開始）
    if (status !== 'postponed') {
      if (gbHtml.includes('gamebox-end') && !gbHtml.includes('gamebox-notend')) {
        status = 'finished';
      } else if (gbHtml.includes('gamebox-notend') && (homeScore !== null || awayScore !== null)) {
        status = 'live'; // 有 notend + 有比分 = 進行中
      }
    }

    // 3. 備援：用比賽時間判斷（當 class 無法判定時）
    if (status === 'upcoming' && time) {
      const now = new Date();
      const year = gamedate.substring(0, 4);
      const month = gamedate.substring(4, 6);
      const day = gamedate.substring(6, 8);
      const [hh, mm] = time.split(':').map(Number);
      // playsport.cc 時間是台灣時間 (UTC+8)
      const gameTime = new Date(`${year}-${month}-${day}T${String(hh).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00+08:00`);
      const diffMs = now - gameTime;
      if (diffMs > 3.5 * 60 * 60 * 1000) {
        status = 'finished'; // 超過 3.5 小時 → 已結束
      } else if (diffMs > 0) {
        status = 'live'; // 已開始但未超過 3.5 小時 → 進行中
      }
    }

    if (away || home) {
      games.push({
        id: `ps_${allianceid}_${gamedate}_${gameId}`,
        gameId,
        oid,
        league: allianceid,
        away: away || '—',
        home: home || '—',
        time: time || '',
        teamCodes,
        record,
        odds,
        status,
        homeScore,
        awayScore,
      });
    }
  }

  // 如果 outer-gamebox 解析失敗，用 select 作為備援（同樣驗證日期）
  if (games.length === 0 && selectGames.length > 0) {
    selectGames.forEach((g, idx) => {
      // 驗證日期：value 格式為 "NBA_20260208_WAS@BKN"
      const valParts = g.value.split('_');
      const valDate = valParts[1] || '';
      if (valDate && gamedate && valDate !== gamedate) return; // 日期不符，跳過

      games.push({
        id: `ps_${allianceid}_${gamedate}_sel_${idx}`,
        gameId: `sel_${idx}`,
        oid: g.value,
        league: allianceid,
        away: g.away,
        home: g.home,
        time: '',
        teamCodes: valParts[2] || '',
        record: {},
        odds: {},
        status: 'upcoming',
        homeScore: null,
        awayScore: null,
      });
    });
  }

  return games;
}

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  SPORTIQ Proxy Server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`========================================`);
  console.log(`\nEndpoints:`);
  console.log(`  /parse?allianceid=3&gamedate=20260208  → 解析 playsport.cc 賽事`);
  console.log(`  /fetch?url=<encoded_url>               → 原始 HTML 代理`);
  console.log(`  /health                                → 健康檢查\n`);
  console.log(`Alliance IDs:`);
  console.log(`  3=NBA, 8=歐洲職籃, 1=MLB, 2=日職, 6=中職`);
  console.log(`  4=足球, 91=NHL, 21=網球\n`);

  // ===== Keep-Alive：防止 Render 免費方案休眠 =====
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_URL;
  if (RENDER_URL) {
    const PING_INTERVAL = 14 * 60 * 1000; // 每 14 分鐘 ping 一次
    setInterval(() => {
      const pingUrl = `${RENDER_URL}/health`;
      https.get(pingUrl, (r) => {
        console.log(`[Keep-Alive] ${new Date().toLocaleTimeString()} → ${r.statusCode}`);
      }).on('error', (e) => {
        console.log(`[Keep-Alive] ping failed: ${e.message}`);
      });
    }, PING_INTERVAL);
    console.log(`[Keep-Alive] 已啟動，每 14 分鐘自動 ping ${RENDER_URL}/health`);
  } else {
    console.log(`[Keep-Alive] 本地模式，不啟動 keep-alive`);
  }
});
