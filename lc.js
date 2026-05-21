// ========== Supabase 云存储封装（直接 REST API，零依赖）==========
const SB_URL = 'https://vrwtrcxejksmrzznczvk.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyd3RyY3hlamtzbXJ6em5jenZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ1MjcsImV4cCI6MjA5NDkwMDUyN30.L7_MIO0ktPVO0GhCkrlM5U9QSOy_lSmbwKP_L0etltw';
const LC_ENABLED = true;

let _sbToken = null;

// ========== 通用请求 ==========
function sbHeaders() {
  const h = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
  if (_sbToken) h['Authorization'] = 'Bearer ' + _sbToken;
  return h;
}

async function sbFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || err.message || res.statusText);
  }
  return res.json();
}

// ========== 用户 ==========
function sbEmail(username) {
  return username + '@user.sixyear.org';
}

async function lcRegister(username, password) {
  if (!LC_ENABLED) return null;
  const res = await sbFetch(SB_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      email: sbEmail(username),
      password: password,
      data: { nickname: username, avatar: username.charAt(0).toUpperCase(), avatarImage: '' }
    })
  });
  if (res.access_token) _sbToken = res.access_token;
  return res.user || res;
}

async function lcLogin(username, password) {
  if (!LC_ENABLED) return null;
  const res = await sbFetch(SB_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ email: sbEmail(username), password: password })
  });
  _sbToken = res.access_token;
  if (res.refresh_token) {
    try { localStorage.setItem('sb_refresh_token', res.refresh_token); } catch (e) {}
  }
  return res.user;
}

async function lcLogout() {
  if (!LC_ENABLED || !_sbToken) return;
  try {
    await sbFetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: sbHeaders() });
  } catch (e) {} finally {
    _sbToken = null;
    try { localStorage.removeItem('sb_refresh_token'); } catch (e) {}
  }
}

async function lcRestoreSession() {
  if (!LC_ENABLED) return null;
  const rt = localStorage.getItem('sb_refresh_token');
  if (!rt) return null;
  try {
    const res = await sbFetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ refresh_token: rt })
    });
    _sbToken = res.access_token;
    if (res.refresh_token) localStorage.setItem('sb_refresh_token', res.refresh_token);
    return res.user;
  } catch (e) {
    localStorage.removeItem('sb_refresh_token');
    _sbToken = null;
    return null;
  }
}

function lcGetCurrentUser() {
  return !!_sbToken;
}

async function lcGetUserData() {
  if (!LC_ENABLED || !_sbToken) return null;
  try {
    return await sbFetch(SB_URL + '/auth/v1/user', { method: 'GET', headers: sbHeaders() });
  } catch (e) { return null; }
}

// ========== 数据同步 ==========
async function lcPushData(localData) {
  if (!LC_ENABLED || !_sbToken) return;
  const user = await lcGetUserData();
  if (!user) return;

  const payload = {
    user_id: user.id,
    checkins: localData.checkins || {},
    savings: localData.savings || { goal: 1000000, goalDesc: '六年之约 · 百万目标', current: 0, records: [] },
    updated_at: new Date().toISOString()
  };

  // Check existing → update or insert
  const rows = await sbFetch(
    SB_URL + '/rest/v1/sync_data?select=id&user_id=eq.' + encodeURIComponent(user.id),
    { method: 'GET', headers: sbHeaders() }
  ).catch(() => []);

  if (Array.isArray(rows) && rows.length > 0) {
    await sbFetch(SB_URL + '/rest/v1/sync_data?user_id=eq.' + encodeURIComponent(user.id), {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify(payload)
    }).catch(e => console.warn('[SB] Push:', e.message));
  } else {
    await sbFetch(SB_URL + '/rest/v1/sync_data', {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload)
    }).catch(e => console.warn('[SB] Push:', e.message));
  }
}

async function lcPullData() {
  if (!LC_ENABLED || !_sbToken) return null;
  const user = await lcGetUserData();
  if (!user) return null;

  const rows = await sbFetch(
    SB_URL + '/rest/v1/sync_data?select=*&user_id=eq.' + encodeURIComponent(user.id),
    { method: 'GET', headers: sbHeaders() }
  ).catch(() => []);

  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) return null;

  return { checkins: data.checkins || {}, savings: data.savings || null };
}

// ========== 用户资料 ==========
async function lcSaveProfile(nickname, avatar, avatarImage) {
  if (!LC_ENABLED || !_sbToken) return;
  const meta = { nickname, avatar };
  if (avatarImage && avatarImage.length < 200 * 1024) meta.avatarImage = avatarImage;
  await sbFetch(SB_URL + '/auth/v1/user', {
    method: 'PUT',
    headers: sbHeaders(),
    body: JSON.stringify({ data: meta })
  }).catch(e => console.warn('[SB] Profile:', e.message));
}

async function lcLoadProfile() {
  if (!LC_ENABLED || !_sbToken) return null;
  const user = await lcGetUserData();
  if (!user) return null;
  const meta = user.user_metadata || {};
  const name = (user.email || '').split('@')[0];
  return {
    nickname: meta.nickname || name,
    avatar: meta.avatar || name.charAt(0).toUpperCase(),
    avatarImage: meta.avatarImage || ''
  };
}
