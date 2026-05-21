// ========== 数据管理 ==========
const STORAGE_KEY = 'six-year-promise';
const START_DATE = '2024-12-31';
const END_DATE = '2030-12-31';
const APP_VERSION = '1.0.1';
const UPDATE_URL = 'https://api.github.com/repos/wanysys8/six-year-promise/releases/latest';

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return {
    users: {},
    currentUser: null,
    checkins: {},
    savings: { goal: 1000000, goalDesc: '六年之约 · 百万目标', current: 0, records: [] }
  };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (typeof scheduleSync === 'function') scheduleSync();
}

function getData() {
  return loadData();
}

function getCheckin(dateStr) {
  const data = loadData();
  return data.checkins[dateStr] || null;
}

function setCheckin(dateStr, entry) {
  const data = loadData();
  data.checkins[dateStr] = entry;
  saveData(data);
}

function getAllCheckins() {
  return loadData().checkins;
}

// ========== 日期工具 ==========
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const w = weekdays[d.getDay()];
  return `${m}月${day}日 周${w}`;
}

function daysBetween(d1, d2) {
  return Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

// ========== 登录系统 ==========
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!username || !password) {
    showToast('请输入账号和密码');
    return;
  }

  const data = loadData();
  const user = data.users[username];

  // 辅助：完成本地登录并跳转首页
  function finishLocalLogin(u) {
    data.currentUser = username;
    saveData(data);
    applyProfileToUI(u);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'flex';
    refreshHome();
    showToast(`欢迎回来，${u.nickname || username}！`);
  }

  // 本地用户存在 + 密码正确 → 快速登录
  if (user && user.password === password) {
    finishLocalLogin(user);
    // 后台尝试 Leancloud 登录，拉取云端数据
    if (typeof lcLogin === 'function') {
      lcLogin(username, password).then(() => {
        return syncOnStartup();
      }).then(() => {
        refreshHome();
      }).catch(() => {});
    }
    return;
  }

  // 本地用户不存在 → 尝试 Leancloud 登录（新设备场景）
  if (!user && typeof lcLogin === 'function') {
    try {
      await lcLogin(username, password);
      // 云端登录成功，创建本地用户
      let userProfile = { username, password, avatar: username.charAt(0).toUpperCase(), nickname: username, createdAt: Date.now() };
      // 尝试拉取云端的用户资料
      try {
        const profile = await lcLoadProfile();
        if (profile) {
          userProfile.nickname = profile.nickname || username;
          userProfile.avatar = profile.avatar || username.charAt(0).toUpperCase();
          userProfile.avatarImage = profile.avatarImage || '';
        }
      } catch (e) {}
      data.users[username] = userProfile;
      finishLocalLogin(userProfile);
      // 拉取云端打卡/存款数据
      try {
        const changed = await pullFromCloud();
        if (changed) refreshHome();
      } catch (e) {}
      return;
    } catch (e) {
      showToast('账号不存在，请先注册');
      return;
    }
  }

  // 本地用户存在但密码错误
  if (user) {
    showToast('密码错误');
  } else {
    showToast('账号不存在，请先注册');
  }
}

function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  if (!username || !password) {
    showToast('请输入账号和密码');
    return;
  }

  if (username.length < 2) {
    showToast('账号至少2个字符');
    return;
  }

  if (password.length < 3) {
    showToast('密码至少3个字符');
    return;
  }

  const data = loadData();
  if (data.users[username]) {
    showToast('账号已存在，请直接登录');
    return;
  }

  const defaultAvatar = username.charAt(0).toUpperCase();
  data.users[username] = {
    username,
    password,
    avatar: defaultAvatar,
    nickname: username,
    createdAt: Date.now()
  };
  data.currentUser = username;
  saveData(data);
  applyProfileToUI(data.users[username]);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.querySelector('.bottom-nav').style.display = 'flex';
  refreshHome();
  showToast('注册成功！欢迎加入六年之约');

  // 后台注册 Leancloud 账号（非阻塞，失败不影响使用）
  if (typeof lcRegister === 'function') {
    lcRegister(username, password).then(() => {
      return syncProfileToCloud();
    }).catch(() => {});
  }
}

function toggleRegister() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm.style.display === 'none') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }
}

function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  const data = loadData();
  data.currentUser = null;
  saveData(data);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-login').classList.add('active');
  document.querySelector('.bottom-nav').style.display = 'none';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  // 退出 Supabase
  if (typeof lcLogout === 'function') lcLogout();
}

// ========== 个人资料 ==========
function applyProfileToUI(user) {
  if (!user) return;

  // Home header
  const homeAvatar = document.getElementById('home-avatar');
  const homeNickname = document.getElementById('home-nickname');
  homeNickname.textContent = user.nickname;

  if (user.avatarImage) {
    homeAvatar.style.backgroundImage = `url(${user.avatarImage})`;
    homeAvatar.classList.add('has-image');
    homeAvatar.textContent = '';
  } else {
    homeAvatar.style.backgroundImage = '';
    homeAvatar.classList.remove('has-image');
    homeAvatar.textContent = user.avatar;
  }

  // Profile modal
  document.getElementById('profile-avatar').value = user.avatar;
  document.getElementById('profile-nickname').value = user.nickname;
  const preview = document.getElementById('profile-avatar-preview');
  if (user.avatarImage) {
    preview.style.backgroundImage = `url(${user.avatarImage})`;
    preview.classList.add('has-image');
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.classList.remove('has-image');
    preview.textContent = user.avatar;
  }

  document.getElementById('settings-nickname').textContent = user.nickname;
}

function editProfile() {
  const data = loadData();
  const user = data.users[data.currentUser];
  if (!user) return;
  document.getElementById('profile-avatar').value = user.avatar;
  document.getElementById('profile-nickname').value = user.nickname;

  const preview = document.getElementById('profile-avatar-preview');
  delete preview.dataset.imageData; // Clear any unsaved upload
  if (user.avatarImage) {
    preview.style.backgroundImage = `url(${user.avatarImage})`;
    preview.classList.add('has-image');
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.classList.remove('has-image');
    preview.textContent = user.avatar;
  }

  openModal('profile-modal', 'profile-sheet');
}

// Generic modal open/close
function openModal(modalId, sheetId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'flex';
  modal.onclick = function(e) {
    if (e.target === modal) {
      modal.style.display = 'none';
      modal.onclick = null;
    }
  };
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
    modal.onclick = null;
  }
}

// Avatar image upload
function triggerAvatarUpload() {
  document.getElementById('avatar-file-input').click();
}

function handleAvatarFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('图片不能超过2MB');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    const preview = document.getElementById('profile-avatar-preview');
    preview.style.backgroundImage = `url(${base64})`;
    preview.classList.add('has-image');
    preview.textContent = '';

    // Store temporarily for save
    preview.dataset.imageData = base64;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function submitProfile() {
  const avatar = document.getElementById('profile-avatar').value.trim() || 'J';
  const nickname = document.getElementById('profile-nickname').value.trim() || 'Jack叔叔';
  const preview = document.getElementById('profile-avatar-preview');
  const imageData = preview.dataset.imageData || '';

  const data = loadData();
  if (!data.users[data.currentUser]) return;

  data.users[data.currentUser].avatar = avatar.charAt(0).toUpperCase();
  data.users[data.currentUser].nickname = nickname;
  if (imageData) {
    data.users[data.currentUser].avatarImage = imageData;
  }
  saveData(data);
  applyProfileToUI(data.users[data.currentUser]);

  closeModal('profile-modal');
  showToast('资料已更新');

  if (typeof syncProfileToCloud === 'function') syncProfileToCloud();
}

// ========== 导航 ==========
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  window.scrollTo(0, 0);

  if (page === 'home') refreshHome();
  if (page === 'history') refreshHistory();
  if (page === 'stats') refreshStats();
  if (page === 'savings') refreshSavings();
}

// Bottom nav
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (btn.dataset.page === 'checkin') return;
    navigateTo(btn.dataset.page);
  });
});

// ========== Toast ==========
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ========== 本月热力图（横向7列日历） ==========
function buildMonthlyHeatmap() {
  const grid = document.getElementById('heatmap-grid');
  grid.innerHTML = '';

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  const checkins = getAllCheckins();
  const monthStr = String(month + 1).padStart(2, '0');

  document.getElementById('heatmap-title').textContent = `📅 ${year}年${month + 1}月 打卡记录`;

  const totalCells = daysInMonth + firstDayOfWeek;
  const totalWeeks = Math.ceil(totalCells / 7);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  // Header row
  let html = '<div class="heatmap-row heatmap-header">';
  weekdays.forEach(d => {
    html += `<span class="heatmap-weekday">${d}</span>`;
  });
  html += '</div>';

  // Week rows
  for (let w = 0; w < totalWeeks; w++) {
    html += '<div class="heatmap-row">';
    for (let dow = 0; dow < 7; dow++) {
      const dayNum = w * 7 + dow - firstDayOfWeek + 1;

      if (dayNum < 1 || dayNum > daysInMonth) {
        html += '<div class="heatmap-cell empty"></div>';
        continue;
      }

      const dateStr = `${year}-${monthStr}-${String(dayNum).padStart(2, '0')}`;
      const entry = checkins[dateStr];
      let level = 0;
      if (entry) {
        const total = (entry.happy?.length || 0) + (entry.sad?.length || 0) + (entry.thought?.length || 0);
        if (total > 200) level = 4;
        else if (total > 100) level = 3;
        else if (total > 30) level = 2;
        else level = 1;
      }

      const isToday = dateStr === todayStr();
      html += `<div class="heatmap-cell"
        data-level="${level}"
        data-date="${dateStr}"
        onclick="showDayDetail('${dateStr}')"
        title="${dateStr}${entry ? ' ✓已打卡' : ''}"
        ${isToday ? 'style="box-shadow:0 0 0 2.5px #2758CE"' : ''}
      >${dayNum}</div>`;
    }
    html += '</div>';
  }

  grid.innerHTML = html;
}

// ========== 首页刷新 ==========
function refreshHome() {
  const today = todayStr();
  const entry = getCheckin(today);
  const checkins = getAllCheckins();

  // Day count
  const startDate = new Date(START_DATE);
  const now = new Date();
  const dayCount = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  document.getElementById('day-count').textContent = dayCount;

  // Apply profile
  const data = loadData();
  if (data.currentUser && data.users[data.currentUser]) {
    applyProfileToUI(data.users[data.currentUser]);
  }

  // Today card
  const todayCard = document.getElementById('today-card');
  const todayIcon = document.getElementById('today-icon');
  const todayTitle = document.getElementById('today-title');
  const todayDesc = document.getElementById('today-desc');
  const btnCheckin = document.getElementById('btn-checkin');

  if (entry) {
    todayCard.classList.add('checked');
    todayIcon.textContent = '✅';
    todayTitle.textContent = '今日已打卡';
    const totalChars = (entry.happy?.length || 0) + (entry.sad?.length || 0) + (entry.thought?.length || 0);
    todayDesc.textContent = `共记录 ${totalChars} 字 · 点击查看详情`;
    btnCheckin.textContent = '查看详情';
    btnCheckin.classList.add('done');
    btnCheckin.onclick = (e) => {
      e.stopPropagation();
      showDayDetail(today);
    };
  } else {
    todayCard.classList.remove('checked');
    todayIcon.textContent = '📝';
    todayTitle.textContent = '今日尚未打卡';
    todayDesc.textContent = '点击开始记录今天的三件事';
    btnCheckin.textContent = '开始打卡';
    btnCheckin.classList.remove('done');
    btnCheckin.onclick = (e) => {
      e.stopPropagation();
      openCheckin();
    };
  }

  // Streaks
  const streakInfo = calculateStreaks(checkins);
  document.getElementById('current-streak').textContent = streakInfo.current;
  document.getElementById('max-streak').textContent = streakInfo.max;
  document.getElementById('total-days').textContent = streakInfo.total;

  // Checkin rate for current month
  const now2 = new Date();
  const monthStart = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-01`;
  const daysInMonth = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate();
  let checkedThisMonth = 0;
  Object.keys(checkins).forEach(d => {
    if (d >= monthStart && d <= today) checkedThisMonth++;
  });
  const rate = Math.round((checkedThisMonth / Math.max(1, now2.getDate())) * 100);
  document.getElementById('checkin-rate').textContent = rate + '%';

  // Monthly heatmap
  buildMonthlyHeatmap();
}

// ========== 连续打卡计算 ==========
function calculateStreaks(checkins) {
  const dates = Object.keys(checkins).sort();
  if (dates.length === 0) return { current: 0, max: 0, total: 0 };

  const today = todayStr();
  let current = 0;
  let max = 0;
  let streak = 0;
  let prevDate = null;

  for (const d of dates) {
    if (!prevDate) {
      streak = 1;
    } else {
      const diff = daysBetween(prevDate, d);
      if (diff === 1) {
        streak++;
      } else {
        max = Math.max(max, streak);
        streak = 1;
      }
    }
    prevDate = d;
  }
  max = Math.max(max, streak);

  // Current streak (from today backwards)
  let check = new Date(today);
  while (true) {
    const ds = `${check.getFullYear()}-${String(check.getMonth()+1).padStart(2,'0')}-${String(check.getDate()).padStart(2,'0')}`;
    if (checkins[ds]) {
      current++;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }

  return { current, max, total: dates.length };
}

// ========== 打卡页 ==========
function openCheckin(dateStr) {
  const date = dateStr || todayStr();
  document.getElementById('checkin-date').textContent = formatDate(date);

  const entry = getCheckin(date);
  document.getElementById('input-happy').value = entry?.happy || '';
  document.getElementById('input-sad').value = entry?.sad || '';
  document.getElementById('input-thought').value = entry?.thought || '';

  updateCharCounts();
  navigateTo('checkin');
}

['input-happy', 'input-sad', 'input-thought'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateCharCounts);
});

function updateCharCounts() {
  document.getElementById('happy-count').textContent = document.getElementById('input-happy').value.length;
  document.getElementById('sad-count').textContent = document.getElementById('input-sad').value.length;
  document.getElementById('thought-count').textContent = document.getElementById('input-thought').value.length;
}

function submitCheckin() {
  const happy = document.getElementById('input-happy').value.trim();
  const sad = document.getElementById('input-sad').value.trim();
  const thought = document.getElementById('input-thought').value.trim();

  if (!happy && !sad && !thought) {
    showToast('请至少填写一项内容');
    return;
  }

  const today = todayStr();
  setCheckin(today, { date: today, happy, sad, thought, timestamp: Date.now() });
  showToast('✅ 打卡成功！');
  navigateTo('home');
}

// ========== 日详情弹窗 ==========
function closeDetailModal() {
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(m => {
    // Only remove dynamic modals (no id attribute)
    if (!m.id) m.remove();
  });
}

function showDayDetail(dateStr) {
  const entry = getCheckin(dateStr);
  closeDetailModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.onclick = (e) => e.stopPropagation();

  let html = `<div class="modal-handle"></div><div class="modal-date">${formatDate(dateStr)}</div>`;

  if (entry) {
    html += `
      <div class="modal-section"><div class="modal-section-label">😊 一件开心的事</div><div class="modal-section-text">${entry.happy || '（未填写）'}</div></div>
      <div class="modal-section"><div class="modal-section-label">😞 一件不开心的事</div><div class="modal-section-text">${entry.sad || '（未填写）'}</div></div>
      <div class="modal-section"><div class="modal-section-label">💭 一个思考/感悟</div><div class="modal-section-text">${entry.thought || '（未填写）'}</div></div>`;
    if (dateStr === todayStr()) {
      html += `<button class="btn-submit" style="margin-top:12px;background:linear-gradient(135deg, var(--blue), #4B78F0);">✏️ 编辑今日打卡</button>`;
    }
  } else {
    html += `<div class="empty-state" style="padding:30px"><div class="empty-icon">📝</div><div>这天还没有打卡记录</div></div>`;
  }

  sheet.innerHTML = html;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const editBtn = sheet.querySelector('.btn-submit');
  if (editBtn) {
    editBtn.onclick = () => { overlay.remove(); openCheckin(dateStr); };
  }
}

// ========== 历史记录 ==========
let historyFilter = 'all';

function filterHistory(filter, btn) {
  historyFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  refreshHistory();
}

function refreshHistory() {
  const checkins = getAllCheckins();
  const dates = Object.keys(checkins).sort((a, b) => b.localeCompare(a));
  const list = document.getElementById('history-list');

  if (dates.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div>暂无打卡记录</div></div>`;
    return;
  }

  let html = '';
  for (const dateStr of dates) {
    if (historyFilter === '2026' && !dateStr.startsWith('2026')) continue;
    if (historyFilter === '2025' && !dateStr.startsWith('2025')) continue;

    const entry = checkins[dateStr];
    const preview = [];
    if (entry.happy) preview.push(`😊 ${entry.happy}`);
    if (entry.sad) preview.push(`😞 ${entry.sad}`);
    if (entry.thought) preview.push(`💭 ${entry.thought}`);

    html += `<div class="history-item" onclick="showDayDetail('${dateStr}')">
      <div class="history-date">${formatDate(dateStr)}</div>
      <div class="history-preview">${preview.join(' · ')}</div>
      <div class="history-mood">
        ${entry.happy ? '<span class="mood-tag happy">开心</span>' : ''}
        ${entry.sad ? '<span class="mood-tag sad">不开心</span>' : ''}
        ${entry.thought ? '<span class="mood-tag thought">思考</span>' : ''}
      </div></div>`;
  }

  list.innerHTML = html || `<div class="empty-state"><div class="empty-icon">📭</div><div>该年份暂无打卡记录</div></div>`;
}

// ========== 存款系统 ==========
function refreshSavings() {
  const data = loadData();
  const savings = data.savings;

  document.getElementById('savings-goal-display').textContent = '¥ ' + savings.goal.toLocaleString();
  document.getElementById('savings-goal-desc').textContent = savings.goalDesc;
  document.getElementById('savings-current-display').textContent = '¥ ' + savings.current.toLocaleString();
  document.getElementById('savings-goal-label').textContent = '¥' + savings.goal.toLocaleString();

  const percent = savings.goal > 0 ? Math.min(100, Math.round((savings.current / savings.goal) * 100)) : 0;
  document.getElementById('savings-percent').textContent = percent + '%';
  document.getElementById('savings-fill').style.width = percent + '%';

  // Records
  const recordsDiv = document.getElementById('savings-records');
  if (savings.records.length === 0) {
    recordsDiv.innerHTML = `<div class="empty-state"><div class="empty-icon">💰</div><div>暂无存款记录</div></div>`;
  } else {
    let html = '';
    const sorted = [...savings.records].reverse();
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const origIdx = savings.records.indexOf(r);
      html += `<div class="savings-record-item">
        <div style="flex:1;min-width:0;">
          <div class="savings-record-amount">+ ¥${r.amount.toLocaleString()}</div>
          ${r.note ? `<div class="savings-record-note">${r.note}</div>` : ''}
          <div class="savings-record-date">${r.date}</div>
        </div>
        <div class="savings-record-actions">
          <button class="btn-record-action" onclick="editSavingsRecord(${origIdx})" title="编辑">✏️</button>
          <button class="btn-record-action delete" onclick="deleteSavingsRecord(${origIdx})" title="删除">🗑</button>
        </div>
      </div>`;
    }
    recordsDiv.innerHTML = html;
  }
}

function submitSavings() {
  const amountEl = document.getElementById('savings-amount');
  const noteEl = document.getElementById('savings-note');
  const amount = parseFloat(amountEl.value);
  const note = noteEl.value.trim();

  if (isNaN(amount) || amount <= 0) {
    showToast('请输入有效金额');
    return;
  }

  const data = loadData();
  if (!data.savings) {
    data.savings = { goal: 1000000, goalDesc: '六年之约 · 百万目标', current: 0, records: [] };
  }
  data.savings.current += amount;
  data.savings.records.push({
    amount,
    note,
    date: todayStr(),
    timestamp: Date.now()
  });
  saveData(data);

  // Clear form
  amountEl.value = '';
  noteEl.value = '';

  refreshSavings();
  showToast(`已存入 ¥${amount.toLocaleString()}`);
}

function editSavingsRecord(idx) {
  const data = loadData();
  const record = data.savings.records[idx];
  if (!record) return;

  const newAmount = prompt('修改金额：', record.amount);
  if (newAmount === null) return;
  const amount = parseFloat(newAmount);
  if (isNaN(amount) || amount <= 0) {
    showToast('请输入有效金额');
    return;
  }

  const diff = amount - record.amount;
  record.amount = amount;
  record.note = prompt('修改备注：', record.note || '') || '';
  data.savings.current += diff;
  saveData(data);
  refreshSavings();
  showToast('记录已更新');
}

function deleteSavingsRecord(idx) {
  if (!confirm('确定要删除这条存款记录吗？')) return;

  const data = loadData();
  const record = data.savings.records[idx];
  if (!record) return;

  data.savings.current -= record.amount;
  if (data.savings.current < 0) data.savings.current = 0;
  data.savings.records.splice(idx, 1);
  saveData(data);
  refreshSavings();
  showToast('记录已删除');
}

function editSavingsGoal() {
  const data = loadData();
  document.getElementById('goal-amount').value = data.savings.goal;
  document.getElementById('goal-desc').value = data.savings.goalDesc;
  openModal('goal-modal', 'goal-sheet');
}

function submitGoal() {
  const amount = parseFloat(document.getElementById('goal-amount').value);
  const desc = document.getElementById('goal-desc').value.trim();

  if (!amount || amount <= 0) {
    showToast('请输入有效目标金额');
    return;
  }

  const data = loadData();
  data.savings.goal = amount;
  data.savings.goalDesc = desc || '六年之约 · 百万目标';
  saveData(data);

  closeModal('goal-modal');
  refreshSavings();
  showToast('存款目标已更新');
}

// ========== 统计页 ==========
function refreshStats() {
  const checkins = getAllCheckins();
  const dates = Object.keys(checkins).sort();
  const today = todayStr();

  const streakInfo = calculateStreaks(checkins);
  document.getElementById('stat-total').textContent = streakInfo.total;
  document.getElementById('stat-streak').textContent = streakInfo.max;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let checkedYear = 0, checkedMonth = 0;
  const yearStart = `${now.getFullYear()}-01-01`;
  dates.forEach(d => {
    if (d >= yearStart && d <= today) checkedYear++;
    if (d >= monthStart && d <= today) checkedMonth++;
  });
  const daysSince = Math.max(1, daysBetween(yearStart, today) + 1);
  document.getElementById('stat-rate').textContent = Math.round((checkedYear / daysSince) * 100) + '%';
  document.getElementById('stat-month').textContent = checkedMonth;

  // Monthly chart
  const chart = document.getElementById('monthly-chart');
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`;
    const count = dates.filter(d => d.startsWith(key)).length;
    months.push({
      label: `${m.getMonth()+1}月`,
      count,
      maxDays: new Date(m.getFullYear(), m.getMonth()+1, 0).getDate()
    });
  }

  const maxCount = Math.max(...months.map(m => m.count), 1);
  let chartHtml = '';
  months.forEach(m => {
    const h = Math.max(4, Math.round((m.count / m.maxDays) * 100));
    chartHtml += `<div class="chart-bar-wrap"><div class="chart-value">${m.count}</div><div class="chart-bar" style="height:${h}%"></div><div class="chart-label">${m.label}</div></div>`;
  });
  chart.innerHTML = chartHtml;

  // Six-year progress
  const totalDays = daysBetween(START_DATE, END_DATE);
  const elapsed = daysBetween(START_DATE, today);
  const remaining = totalDays - elapsed;
  const progress = Math.min(100, Math.round((elapsed / totalDays) * 100));

  document.getElementById('progress-percent').textContent = progress + '%';
  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('days-elapsed').textContent = elapsed;
  document.getElementById('days-remaining').textContent = remaining;
}

// ========== 导出数据（适配本地/WebView） ==========
function exportData() {
  const data = loadData();
  const json = JSON.stringify(data, null, 2);

  // Try clipboard first (works in Capacitor WebView)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(() => {
      showToast('数据已复制到剪贴板，可粘贴保存');
    }).catch(() => {
      showExportModal(json);
    });
  } else {
    showExportModal(json);
  }
}

function showExportModal(json) {
  closeDetailModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.onclick = (e) => e.stopPropagation();
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-date">📋 导出数据</div>
    <textarea class="export-textarea" readonly>${json}</textarea>
    <button class="btn-submit" style="margin-top:12px;">📋 点击复制</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const btn = sheet.querySelector('.btn-submit');
  const textarea = sheet.querySelector('.export-textarea');
  btn.onclick = () => {
    textarea.select();
    document.execCommand('copy');
    showToast('已复制到剪贴板');
  };
}

// ========== 滑动切换页面 ==========
let touchStartX = 0;
let touchStartY = 0;
const pageOrder = ['home', 'checkin', 'savings', 'history', 'stats'];

document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    // Only trigger if horizontal swipe > 60px and not too vertical
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const currentPage = getCurrentPage();
      const idx = pageOrder.indexOf(currentPage);
      if (dx < -30 && idx < pageOrder.length - 1) {
        // Swipe left → next page
        const next = pageOrder[idx + 1];
        if (next === 'checkin') openCheckin();
        else navigateTo(next);
      } else if (dx > 30 && idx > 0) {
        // Swipe right → previous page
        const prev = pageOrder[idx - 1];
        if (prev === 'checkin') openCheckin();
        else navigateTo(prev);
      }
    }
  }, { passive: true });
});

function getCurrentPage() {
  for (const p of pageOrder) {
    const el = document.getElementById('page-' + p);
    if (el && el.classList.contains('active')) return p;
  }
  return 'home';
}

// ========== 分享 ==========
function shareApp() {
  const checkins = getAllCheckins();
  const dates = Object.keys(checkins);
  const entry = getCheckin(todayStr());
  const streakInfo = calculateStreaks(checkins);
  const data = loadData();

  const text = `📋 六年之约 · ${data.users[data.currentUser]?.nickname || '我'}\n\n` +
    `🔥 连续打卡：${streakInfo.current} 天\n` +
    `📅 累计打卡：${dates.length} 天\n` +
    `💰 存款进度：¥${data.savings.current.toLocaleString()} / ¥${data.savings.goal.toLocaleString()}\n\n` +
    `${entry ? '✅ 今日已打卡！' : '⏳ 今日尚未打卡'}\n` +
    `#六年之约 #自律 #存款`;

  if (navigator.share) {
    navigator.share({ title: '六年之约', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('已复制分享文案到剪贴板')).catch(() => showToast('分享失败，请尝试截图分享'));
  }
}

// ========== 数据导入导出 ==========
function exportData() {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `六年之约_备份_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('数据已导出');
}

function importData() {
  document.getElementById('import-file').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.checkins) throw new Error('Invalid format');
      const existing = loadData();
      existing.checkins = { ...existing.checkins, ...imported.checkins };
      if (imported.savings) existing.savings = imported.savings;
      saveData(existing);
      showToast('数据导入成功！');
      refreshHome();
    } catch (err) {
      showToast('文件格式不正确');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetData() {
  if (confirm('确定要清除所有打卡数据吗？此操作不可恢复！')) {
    const data = loadData();
    data.checkins = {};
    data.savings = { goal: 1000000, goalDesc: '六年之约 · 百万目标', current: 0, records: [] };
    saveData(data);
    showToast('数据已清除');
    refreshHome();
  }
}

// ========== 版本更新检测 ==========
async function checkUpdate(silent) {
  try {
    const resp = await fetch(UPDATE_URL, { cache: 'no-cache' });
    if (!resp.ok) return;
    const release = await resp.json();
    const latestVer = release.tag_name.replace('v', '');

    if (latestVer > APP_VERSION) {
      showUpdateModal(release);
    } else if (!silent) {
      showToast('已是最新版本');
    }
  } catch (e) {
    if (!silent) showToast('网络异常，检查失败');
  }
}

function showUpdateModal(release) {
  closeDetailModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.onclick = (e) => e.stopPropagation();

  const body = (release.body || '').replace(/\n/g, '<br>');
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-date">🔔 发现新版本</div>
    <div style="text-align:center;margin-bottom:12px;">
      <div style="font-size:24px;font-weight:800;color:#2758CE;">${release.tag_name}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">当前版本 v${APP_VERSION}</div>
    </div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.6;">${body}</div>
    <button class="btn-submit" style="background:linear-gradient(135deg,#2758CE,#4B78F0);">⬇ 立即下载更新</button>
    <button class="btn-logout" style="margin-top:8px;">以后再说</button>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  sheet.querySelector('.btn-submit').onclick = () => {
    window.open(release.html_url + '/download', '_system');
    overlay.remove();
  };
  sheet.querySelector('.btn-logout').onclick = () => overlay.remove();
}

// ========== 初始化 ==========
function init() {
  const data = loadData();

  // Check if logged in
  if (data.currentUser && data.users[data.currentUser]) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'flex';
    applyProfileToUI(data.users[data.currentUser]);
    refreshHome();
    checkUpdate(true); // silent check on startup
    // 后台从云端拉取最新数据
    if (typeof syncOnStartup === 'function') {
      syncOnStartup().then(() => {
        refreshHome();
      }).catch(() => {});
    }
  } else {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-login').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'none';
  }

  // Midnight auto-refresh
  const now = new Date();
  const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  setTimeout(() => {
    refreshHome();
    setInterval(refreshHome, 86400000);
  }, msToMidnight + 1000);
}

// Global exports
window.navigateTo = navigateTo;
window.openCheckin = openCheckin;
window.submitCheckin = submitCheckin;
window.showDayDetail = showDayDetail;
window.filterHistory = filterHistory;
window.shareApp = shareApp;
window.exportData = exportData;
window.importData = importData;
window.handleImport = handleImport;
window.resetData = resetData;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.toggleRegister = toggleRegister;
window.handleLogout = handleLogout;
window.editProfile = editProfile;
window.submitProfile = submitProfile;
window.submitSavings = submitSavings;
window.editSavingsRecord = editSavingsRecord;
window.deleteSavingsRecord = deleteSavingsRecord;
window.editSavingsGoal = editSavingsGoal;
window.submitGoal = submitGoal;
window.triggerAvatarUpload = triggerAvatarUpload;
window.checkUpdate = checkUpdate;
window.handleAvatarFile = handleAvatarFile;

function bindEvents() {
  // Goal submit button
  const btnGoal = document.getElementById('btn-submit-goal');
  if (btnGoal) btnGoal.addEventListener('click', submitGoal);

  // Profile submit button
  const btnProfile = document.getElementById('btn-submit-profile');
  if (btnProfile) btnProfile.addEventListener('click', submitProfile);

  // Logout button in profile
  const btnLogout = document.getElementById('btn-logout-profile');
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);

  // Avatar upload trigger
  const avatarArea = document.getElementById('profile-avatar-edit-area');
  if (avatarArea) avatarArea.addEventListener('click', triggerAvatarUpload);

  // Avatar file input
  const fileInput = document.getElementById('avatar-file-input');
  if (fileInput) fileInput.addEventListener('change', handleAvatarFile);

  // Profile text avatar live preview
  const avatarText = document.getElementById('profile-avatar');
  if (avatarText) {
    avatarText.addEventListener('input', function() {
      const preview = document.getElementById('profile-avatar-preview');
      if (preview && !preview.classList.contains('has-image')) {
        preview.textContent = this.value.charAt(0).toUpperCase() || 'J';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  init();
});
