// ========== 数据同步层 ==========
// 负责协调 localStorage ↔ Leancloud 之间的数据同步
// 原则：本地优先，云端后台上传；云端有新数据则合并

let _syncTimer = null;
let _syncInProgress = false;

// 延迟同步（防抖：数据变动后 3 秒自动推送）
function scheduleSync() {
  if (!LC_ENABLED) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => pushToCloud(), 3000);
}

// 推送本地数据到云端
async function pushToCloud() {
  if (!LC_ENABLED || _syncInProgress) return;
  _syncInProgress = true;
  try {
    const data = loadData();
    await lcPushData(data);
  } catch (e) {
    console.warn('[Sync] 推送失败:', e.message);
  } finally {
    _syncInProgress = false;
  }
}

// 从云端拉取并合并到本地（返回 true 表示云端有更新）
async function pullFromCloud() {
  if (!LC_ENABLED) return false;
  try {
    const cloudData = await lcPullData();
    if (!cloudData) return false;

    const localData = loadData();
    let changed = false;

    // 合并打卡数据（云端覆盖本地，以云端为准）
    if (cloudData.checkins && Object.keys(cloudData.checkins).length > 0) {
      const mergedCheckins = { ...localData.checkins, ...cloudData.checkins };
      // 如果云端有本地没有的数据，或者云端数据更新
      localData.checkins = mergedCheckins;
      changed = true;
    }

    // 合并存款数据
    if (cloudData.savings) {
      localData.savings = cloudData.savings;
      changed = true;
    }

    if (changed) {
      saveData(localData);
    }

    return changed;
  } catch (e) {
    console.warn('[Sync] 拉取失败:', e.message);
    return false;
  }
}

// 同步用户资料到云端
async function syncProfileToCloud() {
  if (!LC_ENABLED) return;
  try {
    const data = loadData();
    const user = data.users[data.currentUser];
    if (!user) return;
    await lcSaveProfile(user.nickname, user.avatar, user.avatarImage || '');
  } catch (e) {
    console.warn('[Sync] 资料同步失败:', e.message);
  }
}

// 从云端拉取用户资料
async function syncProfileFromCloud() {
  if (!LC_ENABLED) return null;
  try {
    const profile = await lcLoadProfile();
    if (!profile) return null;

    const data = loadData();
    if (data.currentUser && data.users[data.currentUser]) {
      // 合并：云端资料优先
      if (profile.nickname) data.users[data.currentUser].nickname = profile.nickname;
      if (profile.avatar) data.users[data.currentUser].avatar = profile.avatar;
      if (profile.avatarImage) data.users[data.currentUser].avatarImage = profile.avatarImage;
      saveData(data);
      applyProfileToUI(data.users[data.currentUser]);
    }
    return profile;
  } catch (e) {
    console.warn('[Sync] 资料拉取失败:', e.message);
    return null;
  }
}

// 首次启动时从云端拉取
async function syncOnStartup() {
  if (!LC_ENABLED) return;

  // 先尝试恢复 Leancloud 登录态
  try {
    const lcUser = AV.User.current();
    if (lcUser) {
      // 已登录 Leancloud，拉取最新数据
      await syncProfileFromCloud();
      const changed = await pullFromCloud();
      if (changed) {
        refreshHome();
      }
    }
  } catch (e) {
    // 忽略，本地数据仍然可用
  }
}
