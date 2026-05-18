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
  document.getElementById(id).classList.add('active');
  if (id === 'zagotovka_form') {
    document.getElementById('products_list').innerHTML = '';
    productCount = 0;
    addProductField();
    addProductField();
  }
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email || !password) return alert('Введи email и пароль');
  
  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert('Ошибка входа: ' + error.message);
  
  const { data: membership } = await db.from('memberships')
    .select('role, org_id').eq('user_id', auth.user.id).single();
  if (!membership) return alert('Ты не привязан к организации. Обратись к шефу.');
  
  currentUser = auth.user;
  currentRole = membership.role;
  currentOrgId = membership.org_id;

  const { data: items } = await db.from('items')
    .select('id, name, type').eq('org_id', currentOrgId).order('name');
  allItems = items || [];

  if (currentRole === 'owner' || currentRole === 'chef') {
    go('chef.html');
  } else {
    document.getElementById('povar_name').innerText = 'Повар';
    go('povar.html');
  }
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentRole = null;
  currentOrgId = null;
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
  
  if (!currentOrgId) {
    const { data: membership } = await db.from('memberships')
      .select('role, org_id').eq('user_id', session.user.id).single();
    if (membership) {
      currentOrgId = membership.org_id;
      currentRole = membership.role;
      localStorage.setItem('org_id', currentOrgId);
      localStorage.setItem('role', currentRole);
    }
  }
  
  return session;
}

// ===== АКТ РАЗДЕЛКИ =====
function openYield() {
  showScreen('yield_form');
  document.getElementById('yield_error').textContent = '';
  document.getElementById('yield_input_qty').value = '';
  document.getElementById('yield_outputs').innerHTML = '';
  
  const rawItems = allItems.filter(i => i.type === 'raw' || i.type === 'product');
  document.getElementById('yield_input_item').innerHTML = rawItems.map(i => 
    `<option value="${i.id}">${i.name}</option>`
  ).join('');
  
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
  document.getElementById('yield_error').textContent = '';
  
  const inputItemId = document.getElementById('yield_input_item').value;
  const inputQty = parseFloat(document.getElementById('yield_input_qty').value);
  
  if (!inputQty || inputQty <= 0) {
    document.getElementById('yield_error').textContent = 'Введи количество';
    return;
  }

  const outputs = [];
  document.querySelectorAll('#yield_outputs .card').forEach(div => {
    const itemId = div.querySelector('.yield_output_item').value;
    const qty = parseFloat(div.querySelector('.yield_output_qty').value);
    if (qty > 0) outputs.push({ item_id: itemId, qty });
  });

  if (outputs.length === 0) {
    document.getElementById('yield_error').textContent = 'Добавь хотя бы одну позицию выхода';
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

  if (error) return document.getElementById('yield_error').textContent = error.message;

  const itemsToInsert = outputs.map(o => ({
    act_id: act.id,
    item_id: o.item_id,
    qty: o.qty,
    is_waste: false
  }));

  const { error: itemsError } = await db.from('yield_act_items').insert(itemsToInsert);
  if (itemsError) return document.getElementById('yield_error').textContent = itemsError.message;

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

  if (error || !data || !data.length) {
    document.getElementById('yield_report_table').innerHTML = '<div class="card">Пока нет актов</div>';
    return;
  }

  let html = '<div class="table-wrap"><table><tr><th>Дата</th><th>Повар</th><th>Вход</th><th>Выход</th></tr>';
  data.forEach(act => {
    const outputs = act.items.map(i => `${i.item.name} ${i.qty}кг`).join(', ');
    html += `<tr>
      <td>${new Date(act.act_date).toLocaleDateString('ru')}</td>
      <td>${act.done_by_profile?.name || '—'}</td>
      <td>${act.input_item.name}</td>
      <td>${outputs}</td>
    </tr>`;
  });
  html += '</table></div>';
  
  document.getElementById('yield_report_table').innerHTML = html;
}

// ===== ЗАГОТОВКИ =====
function addProductField() {
  productCount++;
  const html = `<div class="card" id="prod_${productCount}" style="margin-top:10px; position:relative;">
    <button onclick="removeProduct(${productCount})" style="position:absolute; right:10px; top:10px; background:#ff3b30; border:none; color:#fff; border-radius:50%; width:25px; height:25px; font-size:16px;">×</button>
    <label>Продукт ${productCount}:</label>
    <input type="text" id="z_product${productCount}" placeholder="Название продукта">
    <label>Сколько кг:</label>
    <input type="number" id="z_kg${productCount}" placeholder="0.00" step="0.01" oninput="calcMusor()">
  </div>`;
  document.getElementById('products_list').insertAdjacentHTML('beforeend', html);
}

function removeProduct(id) {
  document.getElementById('prod_' + id).remove();
  calcMusor();
}

function calcMusor() {
  const syrye = parseFloat(document.getElementById('z_syrye_kg').value) || 0;
  let sumProducts = 0;
  document.querySelectorAll('[id^="z_kg"]').forEach(input => {
    if (!input.id.includes('syrye')) sumProducts += parseFloat(input.value) || 0;
  });
  const musor = +(syrye - sumProducts).toFixed(3);
  document.getElementById('raschet_musora').innerText = musor >= 0 ? `Отходы/потери: ${musor} кг` : 'Ошибка: больше чем взял';
}

async function sohranitZagotovku() {
  const syrye = document.getElementById('z_syrye').value;
  const syrye_kg = parseFloat(document.getElementById('z_syrye_kg').value);
  if (!syrye || !syrye_kg) return alert('Заполни что взял и сколько');
  
  let products = [];
  let sumProducts = 0;
  for (let i = 1; i <= productCount; i++) {
    const nameInput = document.getElementById(`z_product${i}`);
    const kgInput = document.getElementById(`z_kg${i}`);
    if (nameInput && kgInput && nameInput.value && kgInput.value) {
      const kg = parseFloat(kgInput.value);
      products.push({ name: nameInput.value, kg: kg });
      sumProducts += kg;
    }
  }
  if (products.length === 0) return alert('Добавь хотя бы 1 продукт');
  
  // Тут твоя логика сохранения в Supabase
  // Я оставил как было у тебя, допиши сам запрос
}

// ===== СКЛАД И ЗАДАНИЯ =====
async function loadPovarsForZadanie() {
  const { data } = await db.from('profiles').select('id, name').eq('org_id', currentOrgId);
  const select = document.getElementById('komu_povar');
  select.innerHTML = '';
  data.forEach(p => select.innerHTML += `<option value="${p.id}">${p.name}</option>`);
  showScreen('zadanie_form');
}

async function saveZadanie() {
  const komu = document.getElementById('komu_povar').value;
  const text = document.getElementById('text_zadaniya').value;
  if (!text) return alert('Напиши текст задания');
  const { error } = await db.from('zadaniya').insert({ 
    text_zadaniya: text, 
    komu: komu, 
    ot_kogo: currentUser.id, 
    status: 'новое', 
    org_id: currentOrgId 
  });
  if (error) return alert('Ошибка: ' + error.message);
  alert('Задание отправлено');
  document.getElementById('text_zadaniya').value = '';
  showScreen('shef');
}

async function savePrihod() {
  const name = document.getElementById('tovar_name').value;
  const kg = parseFloat(document.getElementById('tovar_kg').value);
  const postavshik = document.getElementById('postavshik').value;
  if (!name || !kg) return alert('Заполни Товар и Вес');
  const { error } = await db.from('sklad_zapisi').insert({ 
    tovar: name, 
    kg: kg, 
    tip: 'приход', 
    postavshik: postavshik, 
    otvetstvenniy: currentUser.id, 
    org_id: currentOrgId 
  });
  if (error) return alert('Ошибка: ' + error.message);
  alert(`Приход сохранён: ${name} ${kg} кг`);
  document.getElementById('tovar_name').value = '';
  document.getElementById('tovar_kg').value = '';
  document.getElementById('postavshik').value = '';
  showScreen('shef');
}

async function loadSklad() {
  const { data } = await db.from('sklad_zapisi').select().eq('org_id', currentOrgId);
  const ostatki = {};
  data.forEach(z => {
    if (!ostatki[z.tovar]) ostatki[z.tovar] = 0;
    if (z.tip === 'приход') ostatki[z.tovar] += z.kg;
    if (z.tip === 'расход' || z.tip === 'списание') ostatki[z.tovar] -= z.kg;
  });
  let html = '<div class="table-wrap"><table><tr><th>Товар</th><th class="kg">Остаток, кг</th></tr>';
  for (let tovar in ostatki) html += `<tr><td>${tovar}</td><td class="kg">${ostatki[tovar].toFixed(2)}</td></tr>`;
  html += '</table></div>';
  if (Object.keys(ostatki).length === 0) html = 'Склад пустой';
  document.getElementById('sklad_table').innerHTML = html;
  showScreen('sklad_screen');
}

async function saveVzyal() {
  const name = document.getElementById('vzyal_tovar').value;
  const kg = parseFloat(document.getElementById('vzyal_kg').value);
  if (!name || !kg) return alert('Заполни Товар и Вес');
  const { error } = await db.from('sklad_zapisi').insert({ 
    tovar: name, 
    kg: kg, 
    tip: 'расход', 
    otvetstvenniy: currentUser.id, 
    org_id: currentOrgId 
  });
  if (error) return alert('Ошибка: ' + error.message);
  alert(`Списано: ${name} ${kg} кг`);
  document.getElementById('vzyal_tovar').value = '';
  document.getElementById('vzyal_kg').value = '';
  showScreen('povar');
                               }
