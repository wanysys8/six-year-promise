// ========== Leancloud 云存储封装 ==========
// 使用前请先创建 Leancloud 应用：
//   1. 访问 https://console.leancloud.cn 注册/登录
//   2. 创建应用 → 设置 → 应用凭证
//   3. 将下方的 YOUR_APP_ID / YOUR_APP_KEY 替换为你的凭证
//   4. serverURL 填控制台显示的「API 域名」
const LC_CONFIG = {
  appId: 'YOUR_APP_ID',
  appKey: 'YOUR_APP_KEY',
  serverURL: 'https://please-replace.lc-cn-n1-shared.com'
};

const LC_ENABLED = LC_CONFIG.appId !== 'YOUR_APP_ID';

(function () {
  if (!LC_ENABLED) return;
  AV.init({
    appId: LC_CONFIG.appId,
    appKey: LC_CONFIG.appKey,
    serverURL: LC_CONFIG.serverURL
  });
})();

// ========== 用户相关 ==========

async function lcRegister(username, password) {
  if (!LC_ENABLED) return null;
  const user = new AV.User();
  user.setUsername(username);
  user.setPassword(password);
  user.set('nickname', username);
  user.set('avatar', username.charAt(0).toUpperCase());
  user.set('avatarImage', '');
  await user.signUp();
  return user;
}

async function lcLogin(username, password) {
  if (!LC_ENABLED) return null;
  const user = await AV.User.logIn(username, password);
  return user;
}

function lcGetCurrentUser() {
  if (!LC_ENABLED) return null;
  return AV.User.current();
}

// ========== 数据同步（核心） ==========

// 将本地数据推送到云端
async function lcPushData(localData) {
  if (!LC_ENABLED) return;
  const user = AV.User.current();
  if (!user) return;

  // 查找现有的 SyncData 记录
  const query = new AV.Query('SyncData');
  query.equalTo('user', user);
  let record = await query.first();

  if (!record) {
    record = new AV.Object('SyncData');
    record.set('user', user);
  }

  const payload = JSON.stringify({
    checkins: localData.checkins || {},
    savings: localData.savings || { goal: 1000000, goalDesc: '六年之约 · 百万目标', current: 0, records: [] }
  });

  // 30MB 上限保护（极不可能）
  if (payload.length > 30 * 1024 * 1024) {
    console.warn('[LC] 数据过大，跳过同步');
    return;
  }

  record.set('dataJSON', payload);
  await record.save();
}

// 从云端拉取数据
async function lcPullData() {
  if (!LC_ENABLED) return null;
  const user = AV.User.current();
  if (!user) return null;

  const query = new AV.Query('SyncData');
  query.equalTo('user', user);
  const record = await query.first();

  if (!record) return null;

  try {
    const parsed = JSON.parse(record.get('dataJSON'));
    return {
      checkins: parsed.checkins || {},
      savings: parsed.savings || null
    };
  } catch (e) {
    console.warn('[LC] 云端数据解析失败', e);
    return null;
  }
}

// ========== 用户资料同步 ==========

async function lcSaveProfile(nickname, avatar, avatarImage) {
  if (!LC_ENABLED) return;
  const user = AV.User.current();
  if (!user) return;

  user.set('nickname', nickname);
  user.set('avatar', avatar);
  // 头像图片超过 200KB 则不同步（Leancloud 单字段限制）
  if (avatarImage && avatarImage.length < 200 * 1024) {
    user.set('avatarImage', avatarImage);
  }
  await user.save();
}

async function lcLoadProfile() {
  if (!LC_ENABLED) return null;
  const user = AV.User.current();
  if (!user) return null;

  // 刷新用户数据
  await user.fetch();

  return {
    nickname: user.get('nickname') || user.getUsername(),
    avatar: user.get('avatar') || user.getUsername().charAt(0).toUpperCase(),
    avatarImage: user.get('avatarImage') || ''
  };
}
