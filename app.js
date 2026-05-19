// Показываем ошибки прямо на экране
window.onerror = function(msg, url, line) {
  alert('Ошибка: ' + msg + '\nСтрока: ' + line);
}

const SUPABASE_URL = 'https://xljogkyropyocvuuodfl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsam9na3lyb3B5b2N2dXVvZGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyODA5MjgsImV4cCI6MjA5Mzg1NjkyOH0.e7m1owNpYoqTpnGRKeEiMlTAIp0T0bAe28v6MX-MyVs';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentRole = null;
let currentOrgId = null;
let productCount = 0;
let allItems = [];

function go(page) {
  window.location.href = page;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  if (id === 'zagotovka_form') {
    const list = document.getElementById('products_list');
    if (list) {
      list.innerHTML = '';
      productCount = 0;
      addProductField();
      addProductField();
    }
  }
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email ||!password) return alert('Введи email и пароль');

  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert('Ошибка входа: ' + error.message);

  const { data: membership } = await db.from('memberships')
   .select('role, org_id').eq('user_id', auth.user.id).single();
  if (!membership) return alert('Ты не привязан к организации. Обратись к шефу.');

  currentUser = auth.user;
  currentRole = membership.role;
  currentOrgId = membership.org_id;

  localStorage.setItem('org_id', currentOrgId);
  localStorage.setItem('role', currentRole);

  const { data: items } = await db.from('items')
   .select('id, name, type').eq('org_id', currentOrgId).order('name');
  allItems = items || [];

  if (currentRole === 'owner' || currentRole === 'chef') {
    go('chef.html');
  } else {
    go('povar.html');
  }
}

async function logout() {
  await db.auth.signOut();
  localStorage.clear();
  go('index.html');
}

async function checkAuth() {
  const { data: { session } = await db.auth.getSession();
  if (!session) {
    if (!window.location.pathname.endsWith('index.html') &&
       !window.location.pathname.endsWith('signup.html')) {
      go('index.html');
    }
    return null;
  }

  currentUser = session.user;
  currentOrgId = localStorage.getItem('org_id');
  currentRole = localStorage.getItem('role');
  return session;
}

// ===== АКТ РАЗДЕЛКИ =====
function openYield() {
  showScreen('yield_form');
  const errEl = document.getElementById('yield_error');
  if (errEl) errEl.textContent = '';

  const qtyEl = document.getElementById('yield_input_qty');
  if (qtyEl) qtyEl.value = '';

  const outEl = document.getElementById('yield_outputs');
  if (outEl) outEl.innerHTML = '';

  const rawItems = allItems.filter(i => i.type === 'raw' || i.type === 'product');
  const inputEl = document.getElementById('yield_input_item');
  if (inputEl) {
    inputEl.innerHTML = rawItems.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  }

  addYieldOutput();
}

function addYieldOutput() {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="row">
      <div>
        <label>Продукт:</label>
        <select class="yield_output_item">
          ${allItems.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Кг:</label>
        <input type="number" class="yield_output_qty" step="0.01" placeholder="0.5">
      </div>
    </div>
    <button class="btn btn-grey" style="margin-top:10px" onclick="this.parentElement.remove()">УДАЛИТЬ</button>
  `;
  document.getElementById('yield_outputs').appendChild(div);
}

async function saveYield() {
  const errEl = document.getElementById('yield_error');
  if (errEl) errEl.textContent = '';

  const inputItemId = document.getElementById('yield_input_item').value;
  const inputQty = parseFloat(document.getElementById('yield_input_qty').value);

  if (!inputQty || inputQty <= 0) {
    if (errEl) errEl.textContent = 'Введи количество';
    return;
  }

  const outputs = [];
  document.querySelectorAll('#yield_outputs.card').forEach(div => {
    const itemId = div.querySelector('.yield_output_item').value;
    const qty = parseFloat(div.querySelector('.yield_output_qty').value);
    if (qty > 0) outputs.push({ item_id: itemId, qty });
  });

  if (outputs.length === 0) {
    if (errEl) errEl.textContent = 'Добавь хотя бы одну позицию выхода';
    return;
  }

  const { data: act, error } = await db
   .from('yield_acts')
   .insert({
      org_id: currentOrgId,
      input_item_id: inputItemId,
      input_qty: inputQty,
      act_date: new Date().toISOString().split('T')[0],
      done_by: currentUser.id
    })
   .select()
   .single();

  if (error) {
    if (errEl) errEl.textContent = error.message;
    return;
  }

  const itemsToInsert = outputs.map(o => ({
    act_id: act.id,
    item_id: o.item_id,
    qty: o.qty,
    is_waste: false
  }));

  const { error: itemsError } = await db.from('yield_act_items').insert(itemsToInsert);
  if (itemsError) {
    if (errEl) errEl.textContent = itemsError.message;
    return;
  }

  alert('Акт сохранён!');
  showScreen('povar');
}

async function openReport() {
  showScreen('yield_report');

  const { data, error } = await db
   .from('yield_acts')
   .select(`
      id, act_date,
      input_item:items!yield_acts_input_item_id_fkey(name),
      done_by_profile:profiles!yield_acts_done_by_fkey(name),
      items:yield_act_items(qty, item:items(name))
    `)
   .eq('org_id', currentOrgId)
   .order('created_at', { ascending: false })
   .limit(50);

  const reportEl = document.getElementById('yield_report_table');
  if (error ||!data ||!data.length) {
    if (reportEl) reportEl.innerHTML = '<div class="card">Пока нет актов</div>';
    return;
  }

  let html = '<div class="table-wrap"><table><tr><th>
