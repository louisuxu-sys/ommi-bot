const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// ===== Firebase Admin SDK =====
const admin = require('firebase-admin');

if (process.env.FIREBASE_CREDENTIALS) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('[Firebase] ✓ 已連接 Firestore');
} else {
  console.warn('[Firebase] ✗ 未設定 FIREBASE_CREDENTIALS，用戶資料將使用本地 JSON 檔案');
}

const db = admin.apps.length ? admin.firestore() : null;
const USERS_COLLECTION = 'users';

// Firestore 用戶操作
const getUser = async (username) => {
  if (!db) return getLocalUser(username);
  const doc = await db.collection(USERS_COLLECTION).doc(username).get();
  return doc.exists ? doc.data() : null;
};
const getAllUsers = async () => {
  if (!db) return getLocalAllUsers();
  const snapshot = await db.collection(USERS_COLLECTION).get();
  const users = {};
  snapshot.forEach(doc => { users[doc.id] = doc.data(); });
  return users;
};
const setUser = async (username, data) => {
  if (!db) return setLocalUser(username, data);
  await db.collection(USERS_COLLECTION).doc(username).set(data, { merge: true });
};
const deleteUserDoc = async (username) => {
  if (!db) return deleteLocalUser(username);
  await db.collection(USERS_COLLECTION).doc(username).delete();
};

// 本地 JSON fallback（開發用）
const USERS_FILE = path.join(__dirname, 'users.json');
const getLocalUser = (username) => {
  try { const u = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); return u[username] || null; } catch(e) { return null; }
};
const getLocalAllUsers = () => {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) { return {}; }
};
const setLocalUser = (username, data) => {
  const users = getLocalAllUsers();
  users[username] = { ...users[username], ...data };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
};
const deleteLocalUser = (username) => {
  const users = getLocalAllUsers();
  delete users[username];
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
};

// 啟動時確保 admin 帳號存在
(async () => {
  try {
    const adminUser = await getUser('admin');
    if (!adminUser) {
      await setUser('admin', {
        username: 'admin', password: 'admin', role: 'admin',
        active: true, createdAt: new Date().toISOString().slice(0, 10), note: '系統管理員'
      });
      console.log('[Firebase] 已建立預設 admin 帳號');
    }
  } catch(e) { console.error('[Firebase] 初始化 admin 帳號失敗:', e.message); }
})();

const PORT = process.env.PORT || 3939;
const STATIC_DIR = __dirname;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  // ===== 用戶認證 API =====
  // 讀取 POST body
  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch(e) { resolve({}); }
    });
  });

  // Token 驗證（簡易 base64 token）
  const generateToken = (username, role) => {
    const payload = JSON.stringify({ u: username, r: role, t: Date.now() });
    return Buffer.from(payload).toString('base64');
  };
  const verifyToken = (token) => {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      // Token 有效期 7 天
      if (Date.now() - payload.t > 7 * 24 * 60 * 60 * 1000) return null;
      return payload;
    } catch(e) { return null; }
  };
  const getTokenFromReq = () => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    return parsed.query.token || null;
  };

  // POST /api/register — 用戶自助註冊（預設待審核）
  if (parsed.pathname === '/api/register' && req.method === 'POST') {
    const body = await readBody();
    if (!body.username || !body.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '請填寫帳號和密碼' }));
    }
    if (body.username.length < 2 || body.username.length > 20) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號長度需 2-20 個字元' }));
    }
    if (body.password.length < 4) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '密碼至少 4 個字元' }));
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(body.username)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號只能包含英文、數字、底線或中文' }));
    }
    const existing = await getUser(body.username);
    if (existing) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已被使用' }));
    }
    await setUser(body.username, {
      username: body.username,
      password: body.password,
      role: 'user',
      active: false,
      createdAt: new Date().toISOString().slice(0, 10),
      note: body.note || '自助註冊',
    });
    console.log(`[AUTH] 新用戶註冊：${body.username}（待審核）`);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: '註冊成功！請等待管理員審核開通。' }));
  }

  // POST /api/login
  if (parsed.pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody();
    const user = await getUser(body.username);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號不存在' }));
    }
    if (user.password !== body.password) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '密碼錯誤' }));
    }
    if (user.frozen) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已被凍結，請聯繫管理員' }));
    }
    if (!user.active) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號尚未開通，請聯繫管理員' }));
    }
    // 檢查是否到期
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      await setUser(body.username, { active: false });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已到期，請聯繫管理員續期' }));
    }
    const token = generateToken(user.username, user.role);
    console.log(`[AUTH] ${user.username} 登入成功`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ token, username: user.username, role: user.role }));
  }

  // GET /api/verify — 驗證 token
  if (parsed.pathname === '/api/verify') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Token 無效或已過期' }));
    }
    const user = await getUser(payload.u);
    if (!user || !user.active) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已停用' }));
    }
    if (user.frozen) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已被凍結' }));
    }
    // 檢查到期
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      await setUser(payload.u, { active: false });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已到期' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ username: payload.u, role: payload.r }));
  }

  // GET /api/users — 取得所有用戶（管理員限定）
  if (parsed.pathname === '/api/users' && req.method === 'GET') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const users = await getAllUsers();
    // 不回傳密碼
    const list = Object.values(users).map(u => ({
      username: u.username, role: u.role, active: u.active,
      createdAt: u.createdAt, note: u.note || '',
      frozen: u.frozen || false,
      expiresAt: u.expiresAt || null
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ users: list }));
  }

  // POST /api/users — 新增用戶（管理員限定）
  if (parsed.pathname === '/api/users' && req.method === 'POST') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const body = await readBody();
    if (!body.username || !body.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '請提供帳號和密碼' }));
    }
    const existingUser = await getUser(body.username);
    if (existingUser) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '帳號已存在' }));
    }
    await setUser(body.username, {
      username: body.username,
      password: body.password,
      role: body.role || 'user',
      active: body.active !== false,
      createdAt: new Date().toISOString().slice(0, 10),
      note: body.note || '',
    });
    console.log(`[AUTH] 管理員 ${payload.u} 新增用戶 ${body.username}`);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: `用戶 ${body.username} 已建立` }));
  }

  // POST /api/users/toggle — 開通/停用用戶（管理員限定）
  if (parsed.pathname === '/api/users/toggle' && req.method === 'POST') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const body = await readBody();
    const toggleUser = await getUser(body.username);
    if (!toggleUser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '用戶不存在' }));
    }
    if (body.username === 'admin') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '不能停用管理員帳號' }));
    }
    const newActive = !toggleUser.active;
    await setUser(body.username, { active: newActive });
    const status = newActive ? '開通' : '停用';
    console.log(`[AUTH] 管理員 ${payload.u} ${status}用戶 ${body.username}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, active: newActive, message: `用戶 ${body.username} 已${status}` }));
  }

  // POST /api/users/delete — 刪除用戶（管理員限定）
  if (parsed.pathname === '/api/users/delete' && req.method === 'POST') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const body = await readBody();
    const delUser = await getUser(body.username);
    if (!delUser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '用戶不存在' }));
    }
    if (body.username === 'admin') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '不能刪除管理員帳號' }));
    }
    await deleteUserDoc(body.username);
    console.log(`[AUTH] 管理員 ${payload.u} 刪除用戶 ${body.username}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: `用戶 ${body.username} 已刪除` }));
  }

  // POST /api/users/password — 修改密碼（管理員限定）
  if (parsed.pathname === '/api/users/password' && req.method === 'POST') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const body = await readBody();
    const pwUser = await getUser(body.username);
    if (!pwUser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '用戶不存在' }));
    }
    if (!body.newPassword || body.newPassword.length < 4) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '密碼至少 4 個字元' }));
    }
    await setUser(body.username, { password: body.newPassword });
    console.log(`[AUTH] 管理員 ${payload.u} 重設用戶 ${body.username} 密碼`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, message: `用戶 ${body.username} 密碼已更新` }));
  }

  // POST /api/users/set-days — 設定開放天數（管理員限定）
  if (parsed.pathname === '/api/users/set-days' && req.method === 'POST') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const body = await readBody();
    const daysUser = await getUser(body.username);
    if (!daysUser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '用戶不存在' }));
    }
    const days = parseInt(body.days);
    if (!days || days < 1 || days > 3650) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '天數需為 1~3650' }));
    }
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await setUser(body.username, { expiresAt, active: true });
    console.log(`[AUTH] 管理員 ${payload.u} 設定 ${body.username} 開放 ${days} 天（到期：${expiresAt.slice(0,10)}）`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, expiresAt, message: `用戶 ${body.username} 已開通 ${days} 天（到期：${expiresAt.slice(0,10)}）` }));
  }

  // POST /api/users/freeze — 凍結/解凍帳號（管理員限定）
  if (parsed.pathname === '/api/users/freeze' && req.method === 'POST') {
    const token = getTokenFromReq();
    const payload = verifyToken(token);
    if (!payload || payload.r !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '需要管理員權限' }));
    }
    const body = await readBody();
    const freezeUser = await getUser(body.username);
    if (!freezeUser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '用戶不存在' }));
    }
    if (body.username === 'admin') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '不能凍結管理員帳號' }));
    }
    const newFrozen = !freezeUser.frozen;
    await setUser(body.username, { frozen: newFrozen });
    const action = newFrozen ? '凍結' : '解凍';
    console.log(`[AUTH] 管理員 ${payload.u} ${action}用戶 ${body.username}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, frozen: newFrozen, message: `用戶 ${body.username} 已${action}` }));
  }

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

    // allianceid 對應的運動關鍵字（用來驗證 playsport 回傳的頁面是否正確）
    const ALLIANCE_SPORT = {
      '1':'棒球','2':'棒球','6':'棒球','9':'棒球','83':'棒球','114':'棒球',
      '3':'籃球','7':'籃球','8':'籃球','12':'籃球','16':'籃球','18':'籃球',
      '89':'籃球','92':'籃球','94':'籃球','97':'籃球','110':'籃球','121':'籃球',
      '4':'足球',
      '91':'冰球','87':'冰球',
      '21':'網球',
      '93':'美式足球',
    };

    // 對所有聯賽都額外抓取 guess 頁面取得盤口（vueData）
    // livescore 可能沒有盤口（WBC、國際賽等），guess 頁面有完整讓分/大小/獨贏
    const guessUrl = `https://www.playsport.cc/guess/${aid}`;
    const fetchPromises = [fetchPage(liveUrl), fetchPage(preUrl)];
    fetchPromises.push(fetchPage(guessUrl).catch(() => ''));

    Promise.all(fetchPromises)
      .then(([liveHtml, preHtml, guessHtml]) => {
        try {
          // 從 guess 頁面提取 vueData 盤口（用隊名配對，因為 gameid 與 livescore boxId 不同）
          const guessOddsList = [];
          if (guessHtml) {
            try {
              const vdMatch = guessHtml.match(/var vueData = ({[\s\S]*?});\s*<\/script>/);
              if (vdMatch) {
                const vd = JSON.parse(vdMatch[1]);
                for (const games2 of Object.values(vd.betGamesList || {})) {
                  for (const g of games2) {
                    const gt = g.gametypes || {};
                    const odds = {};
                    // 優先從頂層欄位取隊名（WBC 等國際賽 gametypes 內可能無隊名）
                    let homeName = (g.home || g.homeShortName || '').trim();
                    let awayName = (g.away || g.awayShortName || '').trim();
                    // gametypes[1] = 讓分(spread): threshold 負=主讓, 正=客讓
                    if (gt['1'] && gt['1']['1']) {
                      const home = gt['1']['1'];
                      const away = gt['1']['2'];
                      if (!homeName) homeName = home.optionName || '';
                      if (!awayName) awayName = away.optionName || '';
                      const spreadVal = parseFloat(home.threshold);
                      if (!isNaN(spreadVal) && spreadVal !== 0) {
                        odds.spread = -spreadVal;
                        odds.spreadHome = `${home.optionName} ${home.threshold}`;
                        odds.spreadAway = `${away.optionName} ${away.threshold}`;
                        odds.spreadOddsHome = home.odds;
                        odds.spreadOddsAway = away.odds;
                      }
                    }
                    // gametypes[5] = 讓分(spread) — WBC 等國際賽用此 ID
                    if (!odds.spread && gt['5'] && gt['5']['1']) {
                      const home = gt['5']['1'];
                      const away = gt['5']['2'];
                      if (!homeName) homeName = home.optionName || '';
                      if (!awayName) awayName = away.optionName || '';
                      const spreadVal = parseFloat(home.threshold);
                      if (!isNaN(spreadVal) && spreadVal !== 0) {
                        odds.spread = -spreadVal;
                        odds.spreadHome = `${home.optionName} ${home.threshold}`;
                        odds.spreadAway = `${away.optionName} ${away.threshold}`;
                        odds.spreadOddsHome = home.odds;
                        odds.spreadOddsAway = away.odds;
                      }
                    }
                    // gametypes[2] = 大小(total)
                    if (gt['2'] && gt['2']['1']) {
                      odds.total = gt['2']['1'].threshold;
                    }
                    // gametypes[6] = 大小(total) — WBC 等國際賽用此 ID
                    if (!odds.total && gt['6'] && gt['6']['1']) {
                      odds.total = gt['6']['1'].threshold;
                    }
                    // gametypes[3] = 獨贏(moneyline)
                    if (gt['3'] && gt['3']['1']) {
                      odds.mlHome = gt['3']['1'].odds;
                      odds.mlAway = gt['3']['2'] ? gt['3']['2'].odds : null;
                      if (!homeName) homeName = gt['3']['1'].optionName || '';
                      if (!awayName) awayName = gt['3']['2'] ? gt['3']['2'].optionName : '';
                    }
                    if (Object.keys(odds).length > 0 && (homeName || awayName)) {
                      guessOddsList.push({ homeName, awayName, odds });
                    }
                  }
                }
                console.log(`[PARSE] guess page: ${guessOddsList.length} games with odds`);
              }
            } catch(ge) {
              console.log(`[PARSE] guess parse error: ${ge.message}`);
            }
          }

          // 驗證 playsport 回傳的頁面是否為正確的運動
          const expectedSport = ALLIANCE_SPORT[aid];
          if (expectedSport) {
            const titleMatch = liveHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
            const pageTitle = titleMatch ? titleMatch[1] : '';
            if (pageTitle && !pageTitle.includes(expectedSport)) {
              console.log(`[PARSE] ⚠ 頁面不匹配：請求 ${expectedSport}(aid=${aid})，收到「${pageTitle.trim()}」→ 返回空結果`);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, count: 0, games: [], source: 'playsport.cc', date: gd, note: 'sport_mismatch' }));
              return;
            }
          }

          // 從 mode=2 取得賽前資料（隊名、戰績、盤口）
          const games = parsePlaySportHTML(preHtml, aid, gd);
          // 從預設模式取得比分和狀態
          const scoreData = parseScoresFromLiveHTML(liveHtml);

          // 合併 guess 盤口到 games（用隊名配對）
          if (guessOddsList.length > 0) {
            for (const game of games) {
              // 嘗試用隊名配對 guess 盤口
              const gHome = (game.home || '').trim();
              const gAway = (game.away || '').trim();
              if (!gHome && !gAway) continue;
              const matched = guessOddsList.find(go =>
                (go.homeName && go.awayName && gHome && gAway &&
                  (go.homeName === gHome || go.homeName.includes(gHome) || gHome.includes(go.homeName)) &&
                  (go.awayName === gAway || go.awayName.includes(gAway) || gAway.includes(go.awayName)))
              );
              if (matched) {
                if (!game.odds) game.odds = {};
                const gOdds = matched.odds;
                if (!game.odds.spread || parseFloat(game.odds.spread) === 0) {
                  if (gOdds.spread) game.odds.spread = String(gOdds.spread);
                }
                if (gOdds.total && !game.odds.total) game.odds.total = gOdds.total;
                if (gOdds.mlHome) game.odds.mlHome = gOdds.mlHome;
                if (gOdds.mlAway) game.odds.mlAway = gOdds.mlAway;
                if (gOdds.spreadHome) game.odds.spreadHome = gOdds.spreadHome;
                if (gOdds.spreadAway) game.odds.spreadAway = gOdds.spreadAway;
                if (gOdds.spreadOddsHome) game.odds.spreadOddsHome = gOdds.spreadOddsHome;
                if (gOdds.spreadOddsAway) game.odds.spreadOddsAway = gOdds.spreadOddsAway;
                console.log(`[PARSE] guess matched: ${gAway} vs ${gHome} → spread=${gOdds.spread}`);
              }
            }
          }

          // 合併比分和隊名到 games
          // 計算台灣時間的今天日期字串 YYYYMMDD（用於日期防護）
          const _now = new Date();
          const _twNow = new Date(_now.getTime() + (8 * 60 * 60 * 1000 - _now.getTimezoneOffset() * 60 * 1000));
          const _todayStr = _twNow.toISOString().slice(0, 10).replace(/-/g, '');

          for (const game of games) {
            const sd = scoreData[game.gameId];
            if (sd) {
              if (sd.awayScore !== null) game.awayScore = sd.awayScore;
              if (sd.homeScore !== null) game.homeScore = sd.homeScore;
              if (sd.status) game.status = sd.status;
              if (sd.quarterScores) game.quarterScores = sd.quarterScores;
              // 用 live HTML 的完整隊名覆蓋短名稱
              if (sd.liveAway && sd.liveAway.length > (game.away || '').length) game.away = sd.liveAway;
              if (sd.liveHome && sd.liveHome.length > (game.home || '').length) game.home = sd.liveHome;
            }
            // 日期防護：未來日期的賽事不可能是 live 或 finished
            if (gd > _todayStr && (game.status === 'live' || game.status === 'finished')) {
              game.status = 'upcoming';
              game.homeScore = null;
              game.awayScore = null;
              game.quarterScores = null;
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

  // 判斷是否為二進位檔案（圖片等）
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svg'];
  const isBinary = binaryExts.includes(ext);

  fs.readFile(fullPath, isBinary ? null : 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    let output = data;
    // HTML 檔案自動壓縮（minify），讓原始碼難以閱讀
    // 只壓縮 HTML/CSS 部分，保留 <script> 內容不動（避免 JS 語法錯誤）
    if (ext === '.html') {
      output = data.replace(/<!--[\s\S]*?-->/g, ''); // 移除 HTML 註解
      const parts = output.split(/(<script[\s\S]*?<\/script>)/gi);
      output = parts.map(part => {
        if (/^<script/i.test(part)) return part; // script 區塊保持不動
        return part
          .replace(/\n\s*/g, '')
          .replace(/\s{2,}/g, ' ')
          .replace(/>\s+</g, '><');
      }).join('').trim();
    }
    const mime = mimeTypes[ext] || 'text/plain';
    res.setHeader('Content-Type', isBinary ? mime : mime + '; charset=utf-8');
    res.writeHead(200);
    res.end(output);
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

    // 從 <h6> 標籤取隊名（live HTML 有完整中文名稱）
    let liveAway = '', liveHome = '';
    if (gbLiveHtml) {
      const h6s = gbLiveHtml.match(/<h6[^>]*>([\s\S]*?)<\/h6>/gi);
      if (h6s && h6s.length >= 2) {
        liveAway = h6s[0].replace(/<[^>]+>/g, '').trim();
        liveHome = h6s[1].replace(/<[^>]+>/g, '').trim();
      }
    }

    scoreData[gameId] = {
      awayScore,
      homeScore,
      status,
      quarterScores: (quarterScores.away.length > 0 || quarterScores.home.length > 0) ? quarterScores : null,
      liveAway,
      liveHome,
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

    // 從 js-gameOnbox 取得讓分盤口（data-aheadprice = 主隊讓分，正=主隊讓，負=客隊讓）
    const onboxRegex = new RegExp(`id="gamebox-${gameId}"[^>]*data-aheadprice="([^"]*)"[^>]*data-aheadodds="([^"]*)"`);
    const onboxMatch = html.match(onboxRegex);
    if (onboxMatch) {
      odds.spread = onboxMatch[1];
      odds.spreadOdds = onboxMatch[2];
    }

    // 從 gamebox HTML 提取國際盤讓分 (-X.5 格式) 和大小盤口
    const gbStartSpread = html.indexOf(`id="outer-gamebox-${gameId}"`);
    const gbEndSpread = html.indexOf('</div><!--outer-gamebox-->', gbStartSpread);
    if (gbStartSpread > -1 && gbEndSpread > -1) {
      const gbSpreadHtml = html.substring(gbStartSpread, gbEndSpread);
      // 國際盤讓分（通常出現在 ±X.5）
      const intlSpread = gbSpreadHtml.match(/([+-]\d+\.5)/);
      if (intlSpread && !odds.spread) {
        odds.spread = intlSpread[1];
      }
      if (intlSpread) {
        odds.intlSpread = intlSpread[1];
      }
      // 大小盤口
      const ouTotal = gbSpreadHtml.match(/大(\d+\.?\d*)/);
      if (ouTotal) {
        odds.total = ouTotal[1];
      }
    }

    // HTML 標籤清除
    const stripTags = (s) => s.replace(/<[^>]+>/g, '').trim();
    away = stripTags(away);
    home = stripTags(home);

    // 從 previewBox 的 title / alt 屬性取完整隊名
    if (previewStart > -1) {
      const previewEnd2 = html.indexOf('<!--====== 開打前的gamebox END======-->', previewStart);
      const ph = previewEnd2 > -1 ? html.substring(previewStart, previewEnd2) : html.substring(previewStart, previewStart + 15000);
      // title 屬性
      const leftTitle = ph.match(/team_left[\s\S]*?title="([^"]+)"/);
      const rightTitle = ph.match(/team_right[\s\S]*?title="([^"]+)"/);
      if (leftTitle && stripTags(leftTitle[1]).length > away.length) away = stripTags(leftTitle[1]);
      if (rightTitle && stripTags(rightTitle[1]).length > home.length) home = stripTags(rightTitle[1]);
      // <a> title
      const leftATitle = ph.match(/team_left[\s\S]*?<a[^>]*title="([^"]+)"/);
      const rightATitle = ph.match(/team_right[\s\S]*?<a[^>]*title="([^"]+)"/);
      if (leftATitle && stripTags(leftATitle[1]).length > away.length) away = stripTags(leftATitle[1]);
      if (rightATitle && stripTags(rightATitle[1]).length > home.length) home = stripTags(rightATitle[1]);
      // img alt
      const leftAlt = ph.match(/team_left[\s\S]*?alt="([^"]+)"/);
      const rightAlt = ph.match(/team_right[\s\S]*?alt="([^"]+)"/);
      if (leftAlt && stripTags(leftAlt[1]).length > away.length) away = stripTags(leftAlt[1]);
      if (rightAlt && stripTags(rightAlt[1]).length > home.length) home = stripTags(rightAlt[1]);
    }

    // 從 onBox 的 data-nameh/data-namea 取得（總是嘗試，取較長的）
    const boxStart2 = html.indexOf(`id="outer-gamebox-${gameId}"`);
    const boxEnd2 = html.indexOf('</div><!--outer-gamebox-->', boxStart2);
    if (boxStart2 > -1 && boxEnd2 > -1) {
      const boxHtml = html.substring(boxStart2, boxEnd2);
      const nhMatch = boxHtml.match(/data-nameh="([^"]*)"/);
      const naMatch = boxHtml.match(/data-namea="([^"]*)"/);
      if (nhMatch && stripTags(nhMatch[1]).length > home.length) home = stripTags(nhMatch[1]);
      if (naMatch && stripTags(naMatch[1]).length > away.length) away = stripTags(naMatch[1]);
    }

    // 從完整 HTML 搜尋 data-nameh / data-namea（範圍更廣）
    const fullNameH = html.match(new RegExp(`outer-gamebox-${gameId}[\\s\\S]{0,5000}data-nameh="([^"]*)"`));
    const fullNameA = html.match(new RegExp(`outer-gamebox-${gameId}[\\s\\S]{0,5000}data-namea="([^"]*)"`));
    if (fullNameH && stripTags(fullNameH[1]).length > home.length) home = stripTags(fullNameH[1]);
    if (fullNameA && stripTags(fullNameA[1]).length > away.length) away = stripTags(fullNameA[1]);

    // 從 <h6> 標籤取隊名（足球等運動使用此格式）
    const gbStartH6 = html.indexOf(`id="outer-gamebox-${gameId}"`);
    const gbEndH6 = html.indexOf('<!--outer-gamebox-->', gbStartH6);
    if (gbStartH6 > -1 && gbEndH6 > -1) {
      const gbFullHtml = html.substring(gbStartH6, gbEndH6);
      const h6Matches = gbFullHtml.match(/<h6[^>]*>([\s\S]*?)<\/h6>/gi);
      if (h6Matches && h6Matches.length >= 2) {
        const h6Away = h6Matches[0].replace(/<[^>]+>/g, '').trim();
        const h6Home = h6Matches[1].replace(/<[^>]+>/g, '').trim();
        if (h6Away.length > away.length) away = h6Away;
        if (h6Home.length > home.length) home = h6Home;
      }
    }

    // 從 select 取得隊名（總是嘗試，取較長的名稱）
    const selectGame = selectGames.find(g => g.value === oid || g.value === gameId);
    if (selectGame) {
      if (selectGame.home && selectGame.home.length > home.length) home = selectGame.home;
      if (selectGame.away && selectGame.away.length > away.length) away = selectGame.away;
    }

    // 最後清理
    home = stripTags(home);
    away = stripTags(away);
    if (away.length <= 2 || home.length <= 2) {
      console.log(`[PARSE] ⚠ short name: "${away}" vs "${home}" (gameId=${gameId})`);
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

    // 2. 時間防護：如果比賽時間還沒到，強制 upcoming（最優先判斷）
    let gameNotStarted = false;
    if (time && status !== 'postponed') {
      const now = new Date();
      const year = gamedate.substring(0, 4);
      const month = gamedate.substring(4, 6);
      const day = gamedate.substring(6, 8);
      const [hh, mm] = time.split(':').map(Number);
      const gameTime = new Date(`${year}-${month}-${day}T${String(hh).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00+08:00`);
      const diffMs = now - gameTime;
      if (diffMs < -60000) {
        // 比賽時間還沒到（提前1分鐘容許），強制 upcoming
        gameNotStarted = true;
        status = 'upcoming';
        homeScore = null;
        awayScore = null;
      }
    }

    // 3. 用 playsport.cc 的 class 判斷狀態（僅在時間已到時才判斷）
    //    gamebox-end = 已結束（含 "gamebox-end" class）
    //    gamebox-notend = 尚未結束（可能進行中或未開始）
    if (status !== 'postponed' && !gameNotStarted) {
      if (gbHtml.includes('gamebox-end') && !gbHtml.includes('gamebox-notend')) {
        status = 'finished';
      } else if (gbHtml.includes('gamebox-notend') && (homeScore !== null || awayScore !== null)) {
        // 額外檢查：0-0 且時間未超過開賽 5 分鐘 → 仍視為 upcoming
        let suspiciousZero = false;
        if (homeScore === 0 && awayScore === 0 && time) {
          const now2 = new Date();
          const year2 = gamedate.substring(0, 4), month2 = gamedate.substring(4, 6), day2 = gamedate.substring(6, 8);
          const [hh2, mm2] = time.split(':').map(Number);
          const gt2 = new Date(`${year2}-${month2}-${day2}T${String(hh2).padStart(2,'0')}:${String(mm2||0).padStart(2,'0')}:00+08:00`);
          if (now2 - gt2 < 5 * 60 * 1000) suspiciousZero = true; // 開賽不到5分鐘且0:0
        }
        if (!suspiciousZero) {
          status = 'live';
        }
      }
    }

    // 4. 備援：用比賽時間判斷（當 class 無法判定時，且未被時間防護攔截）
    if (status === 'upcoming' && time && !gameNotStarted) {
      const now = new Date();
      const year = gamedate.substring(0, 4);
      const month = gamedate.substring(4, 6);
      const day = gamedate.substring(6, 8);
      const [hh, mm] = time.split(':').map(Number);
      const gameTime = new Date(`${year}-${month}-${day}T${String(hh).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00+08:00`);
      const diffMs = now - gameTime;
      if (diffMs > 3.5 * 60 * 60 * 1000) {
        status = 'finished';
      } else if (diffMs > 5 * 60 * 1000) {
        status = 'live'; // 開賽超過5分鐘才判為 live
      }
    }

    // 5. 日期防護：如果賽事日期在未來，強制設為 upcoming（最後防線）
    if (status === 'live' || status === 'finished') {
      const now = new Date();
      const twNow = new Date(now.getTime() + (8 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000));
      const todayStr = twNow.toISOString().slice(0, 10).replace(/-/g, '');
      if (gamedate > todayStr) {
        console.log(`[PARSE] ⚠ game ${gameId} date ${gamedate} is future (today=${todayStr}), forcing upcoming`);
        status = 'upcoming';
        homeScore = null;
        awayScore = null;
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
