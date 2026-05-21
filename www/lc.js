// ========== Supabase 云存储封装（自建用户系统，零邮箱依赖）==========
const SB_URL = 'https://vrwtrcxejksmrzznczvk.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyd3RyY3hlamtzbXJ6em5jenZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ1MjcsImV4cCI6MjA5NDkwMDUyN30.L7_MIO0ktPVO0GhCkrlM5U9QSOy_lSmbwKP_L0etltw';
const LC_ENABLED = true;

let _userId = null;

// ========== 通用请求 ==========

function sbHeaders() {
  return { 'apikey': SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
}

async function sbFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || res.statusText);
  }
  return res.json();
}

// ========== 密码哈希 ==========

async function sbHash(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 用户 ==========

async function lcRegister(username, password) {
  if (!LC_ENABLED) return null;

  // 先查重
  const exist = await sbFetch(
    SB_URL + '/rest/v1/app_users?select=id&username=eq.' + encodeURIComponent(username),
    { method: 'GET', headers: { apikey: SB_KEY } }
  ).catch(() => []);
  if (Array.isArray(exist) && exist.length > 0) {
    throw new Error('账号已存在');
  }

  const pwHash = await sbHash(password);
  const rows = await sbFetch(SB_URL + '/rest/v1/app_users', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      username: username,
      password_hash: pwHash,
      nickname: username,
      avatar: username.charAt(0).toUpperCase(),
      avatar_image: ''
    })
  });

  const user = Array.isArray(rows) ? rows[0] : null;
  if (user) {
    _userId = user.id;
    localStorage.setItem('sb_user_id', user.id);
  }
  return user;
}

async function lcLogin(username, password) {
  if (!LC_ENABLED) return null;
  const pwHash = await sbHash(password);

  const rows = await sbFetch(
    SB_URL + '/rest/v1/app_users?select=*&username=eq.' + encodeURIComponent(username) + '&password_hash=eq.' + pwHash,
    { method: 'GET', headers: { apikey: SB_KEY } }
  ).catch(() => []);

  const user = Array.isArray(rows) ? rows[0] : null;
  if (!user) throw new Error('账号或密码错误');

  _userId = user.id;
  localStorage.setItem('sb_user_id', user.id);
  return user;
}

function lcGetCurrentUser() {
  return !!_userId;
}

async function lcLogout() {
  _userId = null;
  localStorage.removeItem('sb_user_id');
}

async function lcRestoreSession() {
  const saved = localStorage.getItem('sb_user_id');
  if (saved) {
    _userId = saved;
    return true;
  }
  return null;
}

// ========== 数据同步 ==========

async function lcPushData(localData) {
  if (!LC_ENABLED || !_userId) return;

  const payload = {
    user_id: _userId,
    checkins: localData.checkins || {},
    savings: localData.savings || { goal: 1000000, goalDesc: '六年之约 · 百万目标', current: 0, records: [] },
    updated_at: new Date().toISOString()
  };

  // upsert by user_id
  const exist = await sbFetch(
    SB_URL + '/rest/v1/sync_data?select=id&user_id=eq.' + encodeURIComponent(_userId),
    { method: 'GET', headers: { apikey: SB_KEY } }
  ).catch(() => []);

  if (Array.isArray(exist) && exist.length > 0) {
    await sbFetch(SB_URL + '/rest/v1/sync_data?user_id=eq.' + encodeURIComponent(_userId), {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify(payload)
    }).catch(e => console.warn('[Sync] Push:', e.message));
  } else {
    await sbFetch(SB_URL + '/rest/v1/sync_data', {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(payload)
    }).catch(e => console.warn('[Sync] Push:', e.message));
  }
}

async function lcPullData() {
  if (!LC_ENABLED || !_userId) return null;

  const rows = await sbFetch(
    SB_URL + '/rest/v1/sync_data?select=*&user_id=eq.' + encodeURIComponent(_userId),
    { method: 'GET', headers: { apikey: SB_KEY } }
  ).catch(() => []);

  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) return null;

  return { checkins: data.checkins || {}, savings: data.savings || null };
}

// ========== 用户资料 ==========

async function lcSaveProfile(nickname, avatar, avatarImage) {
  if (!LC_ENABLED || !_userId) return;

  const body = { nickname, avatar };
  if (avatarImage && avatarImage.length < 200 * 1024) {
    body.avatar_image = avatarImage;
  }

  await sbFetch(SB_URL + '/rest/v1/app_users?id=eq.' + encodeURIComponent(_userId), {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body)
  }).catch(e => console.warn('[Sync] Profile:', e.message));
}

async function lcLoadProfile() {
  if (!LC_ENABLED || !_userId) return null;

  const rows = await sbFetch(
    SB_URL + '/rest/v1/app_users?select=*&id=eq.' + encodeURIComponent(_userId),
    { method: 'GET', headers: { apikey: SB_KEY } }
  ).catch(() => []);

  const user = Array.isArray(rows) ? rows[0] : null;
  if (!user) return null;

  return {
    nickname: user.nickname || user.username,
    avatar: user.avatar || user.username.charAt(0).toUpperCase(),
    avatarImage: user.avatar_image || ''
  };
}
