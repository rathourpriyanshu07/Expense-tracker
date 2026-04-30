let transactions = JSON.parse(localStorage.getItem("nex_transactions")) || [];
let budgets      = JSON.parse(localStorage.getItem("nex_budgets"))      || {};
let currentType  = "income";
let currentPage  = 1;
const PER_PAGE   = 8;

const CATEGORY_EMOJIS = {
  General: "🌐", Food: "🍜", Transport: "🚌", Shopping: "🛍",
  Health: "💊", Entertainment: "🎬", Salary: "💼",
  Investment: "📈", Rent: "🏠", Utilities: "⚡"
};

const CATEGORY_COLORS = [
  "#63ddb7","#5b8fff","#ff5e7d","#f5a623","#a78bfa",
  "#38bdf8","#fb923c","#34d399","#f472b6","#facc15"
];

// ── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Set today's date as default
  document.getElementById("date").valueAsDate = new Date();

  // Theme
  const saved = localStorage.getItem("nex_theme") || "dark";
  if (saved === "light") document.documentElement.setAttribute("data-theme","light");

  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);

  // Enter key on inputs
  ["text","amount","note"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", e => {
      if (e.key === "Enter") addTransaction();
    });
  });

  updateAll();
  populateCategoryFilter();
});

// ── Type Toggle ─────────────────────────────────────────────
function setType(type) {
  currentType = type;
  const iBtn = document.getElementById("incomeBtn");
  const eBtn = document.getElementById("expenseBtn");
  const addBtn = document.getElementById("addBtn");
  const addText = document.getElementById("addBtnText");

  iBtn.classList.toggle("active", type === "income");
  eBtn.classList.toggle("active", type === "expense");
  eBtn.classList.toggle("expense-active", type === "expense");

  addBtn.classList.toggle("expense-mode", type === "expense");
  addText.textContent = type === "income" ? "Add Income" : "Add Expense";
}

// ── Add Transaction ─────────────────────────────────────────
function addTransaction() {
  const text     = document.getElementById("text").value.trim();
  const amount   = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const date     = document.getElementById("date").value || new Date().toISOString().split("T")[0];
  const note     = document.getElementById("note").value.trim();

  if (!text)         return showToast("Please enter a description", "error");
  if (!amount || amount <= 0) return showToast("Please enter a valid amount", "error");

  let isEditing = editId !== null;
  if (editId !== null) {
  transactions = transactions.map(t =>
    t.id === editId
      ? {
          ...t,
          text,
          amount: currentType === "expense" ? -Math.abs(amount) : Math.abs(amount),
          category,
          date,
          note,
          type: currentType
        }
      : t
  );
  editId = null;
} else {
  const tx = {
    id: Date.now(),
    text,
    amount: currentType === "expense" ? -Math.abs(amount) : Math.abs(amount),
    category,
    date,
    note,
    type: currentType
  };

  transactions.unshift(tx);
}
save();
updateAll();

showToast(
  isEditing
    ? "Transaction updated ✏️"
    : (currentType === "income"
        ? `+₹${amount.toFixed(2)} added! 🎉`
        : `-₹${amount.toFixed(2)} logged`),
  currentType === "income" ? "success" : "info"
);

  // Reset form
  document.getElementById("text").value   = "";
  document.getElementById("amount").value = "";
  document.getElementById("note").value   = "";
  document.getElementById("date").valueAsDate = new Date();

  

  populateCategoryFilter();
}

// ── Delete ──────────────────────────────────────────────────
function deleteTransaction(id) {
  if (!confirm("Delete this transaction?")) return;
  transactions = transactions.filter(t => t.id !== id);
  if ((currentPage - 1) * PER_PAGE >= filtered().length && currentPage > 1) currentPage--;
  save();
  updateAll();
  showToast("Transaction deleted", "info");
}

// ── Save ────────────────────────────────────────────────────
function save() {
  localStorage.setItem("nex_transactions", JSON.stringify(transactions));
  localStorage.setItem("nex_budgets",      JSON.stringify(budgets));
}

// ── Master Update ────────────────────────────────────────────
function updateAll() {
  updateSummary();
  renderHistory();
  updateChart();
  updateBarChart();
  updateBudgetBars();
}

// ── Summary ─────────────────────────────────────────────────
function updateSummary() {
  const income  = transactions.filter(t => t.amount > 0).reduce((a,t) => a + t.amount, 0);
  const expense = transactions.filter(t => t.amount < 0).reduce((a,t) => a + t.amount, 0);
  const balance = income + expense;
  const rate    = income > 0 ? Math.max(0, ((income + expense) / income) * 100) : 0;

  const fmt = n => "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const balEl = document.getElementById("balance");
  balEl.textContent = (balance < 0 ? "-" : "") + fmt(balance);
  balEl.classList.toggle("negative", balance < 0);

  document.getElementById("income").textContent  = fmt(income);
  document.getElementById("expense").textContent = fmt(expense);
  document.getElementById("savingsRate").textContent = rate.toFixed(1) + "%";

  // Progress bars
  const total = income + Math.abs(expense);
  const ipct  = total > 0 ? (income / total) * 100 : 0;
  const epct  = total > 0 ? (Math.abs(expense) / total) * 100 : 0;
  document.getElementById("incomeBar").style.width  = ipct + "%";
  document.getElementById("expenseBar").style.width = epct + "%";
  document.getElementById("savingsBar").style.width = Math.min(rate, 100) + "%";

  // Trend
  const trendEl = document.getElementById("balanceTrend");
  if (transactions.length === 0) { trendEl.textContent = "No transactions yet"; return; }
  const recent = transactions.slice(0, Math.min(5, transactions.length));
  const recentNet = recent.reduce((a,t) => a + t.amount, 0);
  trendEl.textContent = recentNet >= 0
    ? `↑ Looking good! Recent net: +₹${recentNet.toFixed(2)}`
    : `↓ Recent net: -₹${Math.abs(recentNet).toFixed(2)} — watch your spending`;

  // Footer
  document.getElementById("txCount").textContent = transactions.length + " transaction" + (transactions.length !== 1 ? "s" : "");
}

// ── Filtered List ────────────────────────────────────────────
function filtered() {
  const search   = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const type     = document.getElementById("filterType")?.value || "all";
  const cat      = document.getElementById("filterCategory")?.value || "all";
  const sort     = document.getElementById("sortBy")?.value || "date-desc";

  let list = transactions.filter(t => {
    const matchSearch = t.text.toLowerCase().includes(search) ||
                        (t.note||"").toLowerCase().includes(search) ||
                        t.category.toLowerCase().includes(search);
    const matchType   = type === "all" || t.type === type;
    const matchCat    = cat  === "all" || t.category === cat;
    return matchSearch && matchType && matchCat;
  });

  list.sort((a,b) => {
    if (sort === "date-desc")   return b.id - a.id;
    if (sort === "date-asc")    return a.id - b.id;
    if (sort === "amount-desc") return Math.abs(b.amount) - Math.abs(a.amount);
    if (sort === "amount-asc")  return Math.abs(a.amount) - Math.abs(b.amount);
    return 0;
  });

  return list;
}

// ── Render History ───────────────────────────────────────────
function renderHistory() {
  const list = filtered();
  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;
  const page = list.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE);

  const container = document.getElementById("historyList");

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        No transactions found.
      </div>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  container.innerHTML = page.map((t, i) => {
    const isIncome = t.amount > 0;
    const emoji = CATEGORY_EMOJIS[t.category] || "🌐";
    const emojiColor = isIncome ? "rgba(99,221,183,0.1)" : "rgba(255,94,125,0.1)";
    const formatted = new Date(t.date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    return `
    <div class="tx-item" style="animation-delay:${i*0.04}s">
      <div class="tx-emoji" style="background:${emojiColor}">${emoji}</div>
      <div class="tx-info">
        <div class="tx-name">${escHtml(t.text)}</div>
        <div class="tx-meta">${t.category}${t.note ? " · " + escHtml(t.note) : ""}</div>
      </div>
      <span class="tx-badge ${isIncome?"badge-income":"badge-expense"}">${isIncome?"INCOME":"EXPENSE"}</span>
      <div class="tx-right">
        <div class="tx-amount ${isIncome?"income":"expense"}">${isIncome?"+":"-"}₹${Math.abs(t.amount).toLocaleString("en-IN",{minimumFractionDigits:2})}</div>
        <div class="tx-date">${formatted}</div>
      </div>
       <div class="tx-actions">
  <button onclick="editTransaction(${t.id})" title="Edit">✏️</button>
  <button class="tx-delete" onclick="deleteTransaction(${t.id})" title="Delete">✕</button>
</div>
    </div>`;
  }).join("");

  // Pagination
  const pag = document.getElementById("pagination");
  if (totalPages <= 1) { pag.innerHTML = ""; return; }
  let html = "";
  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="page-btn ${p===currentPage?"active":""}" onclick="goPage(${p})">${p}</button>`;
  }
  pag.innerHTML = html;
}

function goPage(p) { currentPage = p; renderHistory(); }

// ── Populate Category Filter ─────────────────────────────────
function populateCategoryFilter() {
  const cats = [...new Set(transactions.map(t => t.category))];
  const sel  = document.getElementById("filterCategory");
  const cur  = sel.value;
  sel.innerHTML = `<option value="all">All Categories</option>` +
    cats.map(c => `<option value="${c}" ${c===cur?"selected":""}>${CATEGORY_EMOJIS[c]||""} ${c}</option>`).join("");
}

// ── Donut Chart ──────────────────────────────────────────────
function updateChart() {
  const filter = document.getElementById("chartFilter")?.value || "all";
  const now    = new Date();

  let txs = transactions.filter(t => t.amount < 0);

  if (filter === "month") {
    txs = txs.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  } else if (filter === "week") {
    const weekAgo = new Date(now - 7*24*60*60*1000);
    txs = txs.filter(t => new Date(t.date) >= weekAgo);
  }

  const catMap = {};
  txs.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount);
  });

  const cats   = Object.keys(catMap);
  const values = cats.map(c => catMap[c]);
  const total  = values.reduce((a,b) => a+b, 0);

  const canvas = document.getElementById("donutChart");
  const ctx    = canvas.getContext("2d");
  const size   = 160;
  canvas.width = canvas.height = size;
  const cx = cy = size / 2;
  const r = 58, ir = 36;

  ctx.clearRect(0, 0, size, size);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.arc(cx, cy, ir, 0, Math.PI*2, true);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    document.getElementById("chartCenterVal").textContent = "₹0";
    document.getElementById("chartLegend").innerHTML = "";
    return;
  }

  let angle = -Math.PI / 2;
  cats.forEach((cat, i) => {
    const slice = (values[i] / total) * Math.PI * 2;
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.arc(cx, cy, ir, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    angle += slice;
  });

  document.getElementById("chartCenterVal").textContent =
    "₹" + total.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  document.getElementById("chartLegend").innerHTML = cats.map((c,i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></div>
      ${CATEGORY_EMOJIS[c]||""} ${c} (${((values[i]/total)*100).toFixed(0)}%)
    </div>`).join("");
}

// ── Monthly Bar Chart ────────────────────────────────────────
function updateBarChart() {
  const container = document.getElementById("barChart");
  const months = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString("default",{month:"short"}), year: d.getFullYear(), month: d.getMonth() });
  }

  const maxVal = Math.max(...months.map(m => {
    const inc = transactions.filter(t => {
      const d = new Date(t.date);
      return t.amount > 0 && d.getMonth() === m.month && d.getFullYear() === m.year;
    }).reduce((a,t) => a+t.amount, 0);
    const exp = transactions.filter(t => {
      const d = new Date(t.date);
      return t.amount < 0 && d.getMonth() === m.month && d.getFullYear() === m.year;
    }).reduce((a,t) => a+Math.abs(t.amount), 0);
    return Math.max(inc, exp);
  }), 1);

  container.innerHTML = months.map(m => {
    const inc = transactions.filter(t => {
      const d = new Date(t.date);
      return t.amount > 0 && d.getMonth() === m.month && d.getFullYear() === m.year;
    }).reduce((a,t) => a+t.amount, 0);
    const exp = transactions.filter(t => {
      const d = new Date(t.date);
      return t.amount < 0 && d.getMonth() === m.month && d.getFullYear() === m.year;
    }).reduce((a,t) => a+Math.abs(t.amount), 0);

    const iH = Math.max((inc / maxVal) * 72, inc > 0 ? 4 : 0);
    const eH = Math.max((exp / maxVal) * 72, exp > 0 ? 4 : 0);

    return `
    <div class="bar-col">
      <div class="bar-group">
        <div class="bar-item bar-income" style="height:${iH}px"
          data-tip="+₹${inc.toFixed(0)}"></div>
        <div class="bar-item bar-expense" style="height:${eH}px"
          data-tip="-₹${exp.toFixed(0)}"></div>
      </div>
      <div class="bar-label">${m.label}</div>
    </div>`;
  }).join("");
}

// ── Budget ───────────────────────────────────────────────────
function toggleBudgetForm() {
  document.getElementById("budgetForm").classList.toggle("hidden");
}

function setBudget() {
  const cat = document.getElementById("budgetCategory").value;
  const amt = parseFloat(document.getElementById("budgetAmount").value);
  if (!amt || amt <= 0) return showToast("Enter valid budget", "error");
  budgets[cat] = amt;
  save();
  updateBudgetBars();
  document.getElementById("budgetAmount").value = "";
  document.getElementById("budgetForm").classList.add("hidden");
  showToast(`Budget set for ${cat}: ₹${amt}`, "success");
}

function updateBudgetBars() {
  const container = document.getElementById("budgetBars");
  const keys = Object.keys(budgets);
  if (keys.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px">No budgets set yet.</div>`;
    return;
  }

  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  container.innerHTML = keys.map(cat => {
    const spent = transactions.filter(t => {
      const d = new Date(t.date);
      return t.amount < 0 && t.category === cat &&
             d.getMonth() === month && d.getFullYear() === year;
    }).reduce((a,t) => a + Math.abs(t.amount), 0);

    const limit = budgets[cat];
    const pct   = Math.min((spent/limit)*100, 100);
    const cls   = pct >= 100 ? "budget-over" : pct >= 80 ? "budget-warn" : "budget-ok";
    const emoji = CATEGORY_EMOJIS[cat] || "🌐";

    return `
    <div class="budget-row">
      <div class="budget-row-header">
        <span class="budget-row-name">${emoji} ${cat}</span>
        <span class="budget-row-vals">₹${spent.toFixed(0)} / ₹${limit.toFixed(0)} (${pct.toFixed(0)}%)</span>
      </div>
      <div class="budget-track">
        <div class="budget-fill ${cls}" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join("");
}

// ── Theme ────────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  document.documentElement.setAttribute("data-theme", isLight ? "dark" : "light");
  localStorage.setItem("nex_theme", isLight ? "dark" : "light");
}

// ── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  if (transactions.length === 0) return showToast("No transactions to export", "info");
  const rows = [["Date","Description","Category","Type","Amount","Note"]];
  transactions.forEach(t => {
    rows.push([t.date, t.text, t.category, t.type, Math.abs(t.amount).toFixed(2), t.note||""]);
  });
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "nexspend_export.csv"; a.click();
  URL.revokeObjectURL(url);
  showToast("Exported successfully!", "success");
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// ── Reset ────────────────────────────────────────────────────
function openResetModal() {
  const label = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("currentMonthLabel").textContent = label;
  document.getElementById("resetModal").classList.remove("hidden");
}

function closeResetModal() {
  document.getElementById("resetModal").classList.add("hidden");
}

function doReset(type) {
  const now = new Date();

  if (type === "month") {
    const before = transactions.length;
    transactions = transactions.filter(t => {
      const d = new Date(t.date);
      return !(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear());
    });
    const removed = before - transactions.length;
    save();
    updateAll();
    closeResetModal();
    showToast(`Cleared ${removed} transaction${removed !== 1 ? "s" : ""} from this month`, "info");

  } else if (type === "all") {
    transactions = [];
    save();
    updateAll();
    closeResetModal();
    showToast("All transactions cleared. Fresh start! 🚀", "success");

  } else if (type === "budgets") {
    budgets = {};
    save();
    updateBudgetBars();
    closeResetModal();
    showToast("All budgets cleared", "info");

  } else if (type === "everything") {
    transactions = [];
    budgets = {};
    localStorage.removeItem("nex_theme");
    document.documentElement.removeAttribute("data-theme");
    save();
    updateAll();
    closeResetModal();
    showToast("Everything wiped. Brand new start! ✨", "success");
  }

  currentPage = 1;
  populateCategoryFilter();
}

// Close modal on overlay click
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("resetModal").addEventListener("click", function(e) {
    if (e.target === this) closeResetModal();
  });
  document.getElementById("resetBtn").addEventListener("click", openResetModal);
});
function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}


let editId = null;

function editTransaction(id) {
  const t = transactions.find(tr => tr.id === id);

  document.getElementById("text").value = t.text;
  document.getElementById("amount").value = Math.abs(t.amount);
  document.getElementById("category").value = t.category;
  document.getElementById("date").value = t.date;
  document.getElementById("note").value = t.note || "";

  currentType = t.type;
  setType(t.type);

  editId = id;
}