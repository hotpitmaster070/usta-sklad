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
