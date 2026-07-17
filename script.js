// Streakline — a small, dependency-free habit tracker.
// State lives in localStorage as a list of habits, each with a history of
// completed dates. Everything below is plain DOM manipulation on purpose —
// no framework — so the code itself is easy to read as a portfolio piece.

const STORAGE_KEY = 'streakline.habits.v1';
const RING_CIRCUMFERENCE = 213.6; // 2 * PI * r(34), matches the SVG circle

let state = {
  habits: [],       // { id, name, category, history: { 'YYYY-MM-DD': true } }
  activeCategory: 'all',
};

// ---------- persistence ----------

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state.habits = parsed.habits || [];
    } catch (e) {
      state.habits = [];
    }
  } else {
    // Seed with a couple of examples so the board isn't empty on first run.
    state.habits = seedHabits();
    saveState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits: state.habits }));
}

function seedHabits() {
  const today = new Date();
  const dateStr = (offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offsetDays);
    return toDateKey(d);
  };
  return [
    {
      id: crypto.randomUUID(),
      name: 'Morning run',
      category: 'Health',
      history: { [dateStr(1)]: true, [dateStr(2)]: true, [dateStr(3)]: true },
    },
    {
      id: crypto.randomUUID(),
      name: 'Read 20 minutes',
      category: 'Growth',
      history: { [dateStr(1)]: true, [dateStr(4)]: true },
    },
  ];
}

// ---------- date helpers ----------

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function todayKey() {
  return toDateKey(new Date());
}

function lastNDays(n) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toDateKey(d));
  }
  return days; // most recent first
}

function computeStreak(history) {
  let streak = 0;
  let cursor = new Date();
  // If today isn't done yet, streak counts back from yesterday instead —
  // otherwise adding a habit and not checking it yet would show 0 unfairly.
  if (!history[todayKey()]) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (history[toDateKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeWeeklyRate(history) {
  const days = lastNDays(7);
  const done = days.filter((d) => history[d]).length;
  return done / 7;
}

// ---------- derived data ----------

function getCategories() {
  const set = new Set(state.habits.map((h) => h.category));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getVisibleHabits() {
  if (state.activeCategory === 'all') return state.habits;
  return state.habits.filter((h) => h.category === state.activeCategory);
}

// ---------- rendering ----------

function render() {
  renderStats();
  renderCategories();
  renderBoard();
  saveState();
}

function renderStats() {
  const today = todayKey();
  const total = state.habits.length;
  const doneToday = state.habits.filter((h) => h.history[today]).length;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  const best = state.habits.reduce(
    (max, h) => Math.max(max, computeStreak(h.history)),
    0
  );

  document.getElementById('statToday').textContent = `${pct}%`;
  document.getElementById('statActive').textContent = String(total);
  document.getElementById('statBest').textContent = String(best);

  document.getElementById('boardDate').textContent = new Date().toLocaleDateString(
    'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' }
  );
}

function renderCategories() {
  const list = document.getElementById('categoryList');
  const categories = getCategories();

  list.innerHTML = '';

  const allItem = makeCategoryItem('all', 'All', state.habits.length);
  list.appendChild(allItem);

  categories.forEach((cat) => {
    const count = state.habits.filter((h) => h.category === cat).length;
    list.appendChild(makeCategoryItem(cat, cat, count));
  });
}

function makeCategoryItem(value, label, count) {
  const li = document.createElement('li');
  li.className = 'category-item' + (state.activeCategory === value ? ' active' : '');
  li.dataset.category = value;
  li.innerHTML = `<span>${escapeHtml(label)}</span><span class="count">${count}</span>`;
  li.addEventListener('click', () => {
    state.activeCategory = value;
    render();
  });
  return li;
}

function renderBoard() {
  const grid = document.getElementById('habitGrid');
  const emptyState = document.getElementById('emptyState');
  const title = document.getElementById('boardTitle');
  const visible = getVisibleHabits();

  title.textContent = state.activeCategory === 'all' ? 'All habits' : state.activeCategory;
  grid.innerHTML = '';

  if (visible.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const template = document.getElementById('habitCardTemplate');

  visible.forEach((habit) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.habit-card');
    const ringProgress = node.querySelector('.ring-progress');
    const checkBtn = node.querySelector('.ring-check');
    const nameEl = node.querySelector('.habit-name');
    const catEl = node.querySelector('.habit-category');
    const streakEl = node.querySelector('.habit-streak');
    const deleteBtn = node.querySelector('.habit-delete');

    const rate = computeWeeklyRate(habit.history);
    const streak = computeStreak(habit.history);
    const doneToday = Boolean(habit.history[todayKey()]);

    ringProgress.style.strokeDashoffset = String(
      RING_CIRCUMFERENCE * (1 - rate)
    );
    if (rate >= 1) ringProgress.style.stroke = 'var(--accent)';

    checkBtn.classList.toggle('done', doneToday);
    checkBtn.setAttribute(
      'aria-label',
      doneToday ? 'Marked done today — click to undo' : 'Mark done today'
    );
    checkBtn.addEventListener('click', () => toggleToday(habit.id));

    nameEl.textContent = habit.name;
    catEl.textContent = habit.category;
    streakEl.textContent =
      streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} streak` : 'no streak yet';

    deleteBtn.addEventListener('click', () => deleteHabit(habit.id));

    grid.appendChild(node);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- actions ----------

function toggleToday(habitId) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const key = todayKey();
  if (habit.history[key]) {
    delete habit.history[key];
  } else {
    habit.history[key] = true;
  }
  render();
}

function deleteHabit(habitId) {
  state.habits = state.habits.filter((h) => h.id !== habitId);
  render();
}

function addHabit(name, category) {
  state.habits.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    category: category.trim(),
    history: {},
  });
  render();
}

// ---------- wiring ----------

document.getElementById('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('habitName');
  const catInput = document.getElementById('habitCategory');
  if (!nameInput.value.trim() || !catInput.value.trim()) return;
  addHabit(nameInput.value, catInput.value);
  nameInput.value = '';
  catInput.value = '';
  nameInput.focus();
});

loadState();
render();
