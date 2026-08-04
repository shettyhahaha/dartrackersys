/* =========================================================
   VOUCHER TRACKING REGISTRY
   Roles: superadmin > admin > staff / viewer
   ========================================================= */

/* =========================================================
   LARAVEL / MYSQL CONNECTION
   ---------------------------------------------------------
   Data is stored server-side in MySQL through Laravel routes.
   ========================================================= */
const API = window.DAR_APP || {};

async function apiFetch(url, options={}){
  const headers = Object.assign({'Accept':'application/json','X-CSRF-TOKEN':API.csrf||''}, options.headers||{});
  if(options.body && !(options.body instanceof FormData)) headers['Content-Type']='application/json';
  const res = await fetch(url, Object.assign({}, options, {headers}));
  if(res.status === 401){ session.user=null; state.loading=false; render(); return null; }
  let data=null; try{ data=await res.json(); }catch(e){}
  if(!res.ok) throw new Error(data?.message || 'Server request failed.');
  return data;
}

const FUND_OPTIONS = ["101","Split LP","Split GOP","ARF 103","ARF 107"];
const STATUS_OPTIONS = ["Pending","Processing","Returned","Paid","Unpaid","Released"];
const TYPE_OPTIONS = ["Incoming","Outgoing"];
const ACTION_OPTIONS = ["Login","Failed Login Attempt","Voucher Added","Voucher Edited","Voucher Deleted","User Created","User Removed","Profile Photo Updated","Bulk Import"];
/* ---------------------------------------------------------------
   Location / Office dropdown options.
   --------------------------------------------------------------- */
const OFFICE_OPTIONS = ["ACCOUNTING SECTION","BUDGET SECTION","CASHIERING SECTION","SUPPLY SECTION","HRMO","RECORDS SECTION","OFFICE OF THE PCAO","OFFICE OF THE PARPO II","PBDD","LEGAL","DARAB","LTID"];
const OFFICE_OTHER_VALUE = "__other__";

let DB = { users: [], vouchers: [], auditLog: [] };
let session = { user: null };
let state = {
  page: 'vouchers',
  loading: true,
  loginError: '',
  filters: { text:'', type:'All', fund:'All', status:'All', office:'All', enteredBy:'All' },
  modal: null,        // 'voucher' | 'user' | 'avatar' | null
  editingVoucherId: null,
  avatarTargetUserId: null,
  page_num: 1,
  selectedVoucherIds: [],
  pageSize: 12,
  banner: null,
  reportPeriod: 'monthly',   // 'weekly' | 'monthly' | 'yearly'
  reportPage: 1,
  auditFilters: { text:'', action:'All' },
  auditPage: 1,
};

function esc(s){
  if(s===undefined||s===null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function uid(prefix){ return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

/* ---------------- profile photos ---------------- */
// Temporary holders for a picked-but-not-yet-saved photo (kept outside `state`
// so selecting a file doesn't trigger a full re-render and lose the <input>).
let pendingNewUserAvatar = null;
let pendingEditAvatar = null;

function getInitials(name){
  if(!name) return '?';
  const parts = name.trim().split(/\s+/);
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
function avatarColor(seed){
  const palette = ['#123524','#B6901F','#2F6F4E','#2E5C8A','#6A4C93','#8C3B1B','#1D5138'];
  let hash = 0;
  (seed||'').split('').forEach(c=>{ hash = (hash*31 + c.charCodeAt(0)) % 997; });
  return palette[Math.abs(hash) % palette.length];
}
function avatarHTML(user, size){
  size = size || 32;
  if(user && user.avatar){
    return `<img src="${user.avatar}" alt="${esc(user.name||user.username||'')}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;border:1px solid rgba(0,0,0,.08);">`;
  }
  const initials = getInitials(user ? (user.name||user.username) : '');
  const color = avatarColor(user ? user.username : '');
  const fontSize = Math.round(size*0.4);
  return `<div style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:50%;background:${color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:${fontSize}px;vertical-align:middle;font-family:var(--font-body);">${esc(initials)}</div>`;
}
// Resizes/compresses an uploaded image client-side before it's stored, so
// profile photos stay small (a few KB) no matter what the original file was.
function fileToResizedDataURL(file, maxSize, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject(new Error('Could not read file'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=>reject(new Error('Could not read image'));
      img.onload = ()=>{
        let w = img.width, h = img.height;
        const scale = Math.min(1, (maxSize||200) / Math.max(w,h));
        w = Math.max(1, Math.round(w*scale));
        h = Math.max(1, Math.round(h*scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function handleNewUserAvatarSelect(e){
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 8*1024*1024){ alert('That image is too large (max 8MB).'); e.target.value=''; return; }
  try{
    pendingNewUserAvatar = await fileToResizedDataURL(file, 220, 0.85);
    const img = document.getElementById('new-user-avatar-preview');
    if(img){ img.src = pendingNewUserAvatar; img.style.display = 'block'; }
    const ph = document.getElementById('new-user-avatar-placeholder');
    if(ph){ ph.style.display = 'none'; }
  }catch(err){ alert('Could not read that image. Please try a different file.'); }
}
async function handleEditAvatarSelect(e){
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 8*1024*1024){ alert('That image is too large (max 8MB).'); e.target.value=''; return; }
  try{
    pendingEditAvatar = await fileToResizedDataURL(file, 220, 0.85);
    const img = document.getElementById('edit-avatar-preview');
    if(img){ img.src = pendingEditAvatar; img.style.display = 'block'; }
    const ph = document.getElementById('edit-avatar-placeholder');
    if(ph){ ph.style.display = 'none'; }
  }catch(err){ alert('Could not read that image. Please try a different file.'); }
}
function canEditAvatar(target){
  if(!target || !session.user) return false;
  if(session.user.id === target.id) return true; // anyone can update their own photo
  const role = session.user.role;
  if(role==='superadmin') return true;
  if(role==='admin') return target.createdBy === session.user.username;
  return false;
}
function openAvatarModal(userId){
  pendingEditAvatar = null;
  state.modal = 'avatar';
  state.avatarTargetUserId = userId;
  render();
}
function saveAvatar(){
  const u = DB.users.find(x=>x.id===state.avatarTargetUserId);
  if(!u) { closeModal(); return; }
  if(pendingEditAvatar){
    u.avatar = pendingEditAvatar;
    if(session.user.id === u.id) session.user.avatar = u.avatar;
    logAudit('Profile Photo Updated', 'Photo updated for "' + u.username + '" (' + u.name + ').');
    saveUsers();
  }
  pendingEditAvatar = null;
  closeModal();
}
function removeAvatar(){
  const u = DB.users.find(x=>x.id===state.avatarTargetUserId);
  if(!u) { closeModal(); return; }
  if(u.avatar){
    u.avatar = null;
    if(session.user.id === u.id) session.user.avatar = null;
    logAudit('Profile Photo Updated', 'Photo removed for "' + u.username + '" (' + u.name + ').');
    saveUsers();
  }
  pendingEditAvatar = null;
  closeModal();
}

function fmtMoney(n){
  n = Number(n)||0;
  return '₱' + n.toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtDateTime(iso){
  const d = new Date(iso);
  if(isNaN(d)) return iso||'';
  return d.toLocaleString('en-PH', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

/* ---------------- storage ---------------- */
async function loadDB(){
  try{
    const data=await apiFetch(API.bootstrapUrl);
    if(!data){ return; }
    DB.users=data.users||[]; DB.vouchers=data.vouchers||[]; DB.auditLog=data.auditLog||[];
    session.user=data.user||null;
  }catch(e){
    console.error('Could not load database:',e);
    state.loginError='Could not connect to the Laravel database. Please check your server configuration.';
    session.user=null;
  }
  state.loading=false; render();
}
async function saveUsers(){
  try{ await apiFetch(API.usersSyncUrl,{method:'POST',body:JSON.stringify({users:DB.users})}); }catch(e){ console.error('save users failed',e); alert(e.message); }
}
async function saveVouchers(){
  try{ await apiFetch(API.vouchersSyncUrl,{method:'POST',body:JSON.stringify({vouchers:DB.vouchers})}); }catch(e){ console.error('save vouchers failed',e); alert(e.message); }
}
async function saveAuditLog(){
  try{ await apiFetch(API.auditSyncUrl,{method:'POST',body:JSON.stringify({auditLog:DB.auditLog})}); }catch(e){ console.error('save audit log failed',e); }
}
function logAudit(action, details){
  DB.auditLog.unshift({id:uid('a'),timestamp:new Date().toISOString(),actor:(session.user&&session.user.username)||'unknown',role:(session.user&&session.user.role)||'',action,details:details||''});
  if(DB.auditLog.length>2000) DB.auditLog.length=2000;
  saveAuditLog();
}

/* ---------------- permissions ---------------- */
function canManageUsers(role){ return role==='superadmin' || role==='admin'; }
function creatableRoles(role){
  if(role==='superadmin') return ['admin'];
  if(role==='admin') return ['staff','viewer'];
  return [];
}
function canAddVoucher(role){ return role==='superadmin' || role==='admin' || role==='staff'; }
function canEditDeleteVoucher(role){ return role==='superadmin' || role==='admin' || role==='staff'; }
function canImport(role){ return role==='superadmin' || role==='admin'; }

/* ---------------- auth ---------------- */
async function handleLogin(e){
  e.preventDefault();
  const username=document.getElementById('login-username').value.trim();
  const password=document.getElementById('login-password').value;
  try{
    const data=await apiFetch(API.loginUrl,{method:'POST',body:JSON.stringify({username,password})});
    if(!data) return;
    state.loginError=''; state.loading=true; render(); await loadDB();
  }catch(err){
    state.loginError=err.message||'Incorrect username or password.'; state.loading=false; render();
  }
}
async function handleLogout(){
  try{ await apiFetch(API.logoutUrl,{method:'POST',body:JSON.stringify({})}); }catch(e){}
  session.user=null; state.page='vouchers'; state.loading=false; render();
}
// Toggles the login password field between masked and plain text.
function toggleLoginPasswordVisibility(){
  const input=document.getElementById('login-password'); const icon=document.getElementById('login-password-toggle-icon');
  if(!input) return; const showing=input.type==='text'; input.type=showing?'password':'text'; if(icon) icon.className=showing?'bi bi-eye':'bi bi-eye-slash'; input.focus();
}

/* ---------------- voucher CRUD ---------------- */
// Shows/hides the free-text "Other" office field without a full re-render,
// so the rest of the form (and anything the person already typed) is untouched.
function toggleOfficeOther(selectEl){
  const otherInput = document.getElementById('office-other-input');
  if(!otherInput) return;
  if(selectEl.value === OFFICE_OTHER_VALUE){
    otherInput.style.display = 'block';
    otherInput.focus();
  } else {
    otherInput.style.display = 'none';
    otherInput.value = '';
  }
}
function openAddVoucher(){
  state.modal = 'voucher';
  state.editingVoucherId = null;
  render();
}
function openEditVoucher(id){
  state.modal = 'voucher';
  state.editingVoucherId = id;
  render();
}
function closeModal(){
  state.modal = null;
  state.editingVoucherId = null;
  state.avatarTargetUserId = null;
  render();
}
// Returns the name of the first field ('DV Number', 'ORS Number', or 'Particulars')
// that two vouchers share a non-empty, trimmed, case-insensitive value for — or null
// if they don't conflict on any of those fields.
function voucherConflictField(a, b){
  if(a.dvNumber && b.dvNumber && a.dvNumber.trim().toLowerCase() === b.dvNumber.trim().toLowerCase()) return 'DV Number';
  if(a.orsNumber && b.orsNumber && a.orsNumber.trim().toLowerCase() === b.orsNumber.trim().toLowerCase()) return 'ORS Number';
  if(a.particulars && b.particulars && a.particulars.trim().toLowerCase() === b.particulars.trim().toLowerCase()) return 'Particulars';
  return null;
}
function submitVoucherForm(e){
  e.preventDefault();
  const f = e.target;
  const officeValue = f.officeSelect.value === OFFICE_OTHER_VALUE
    ? f.officeOther.value.trim()
    : f.officeSelect.value;
  const payload = {
    type: f.type.value,
    dvNumber: f.dvNumber.value.trim(),
    orsNumber: f.orsNumber.value.trim(),
    voucherName: f.voucherName.value.trim(),
    particulars: f.particulars.value.trim(),
    amount: parseFloat(f.amount.value) || 0,
    fund: f.fund.value,
    status: f.status.value,
    office: officeValue,
  };
  if(!payload.dvNumber || !payload.voucherName || !payload.office){
    alert('DV Number, Voucher Name, and Location/Office are required.');
    return;
  }
  const conflict = DB.vouchers.find(v => v.id !== state.editingVoucherId && voucherConflictField(payload, v));
  if(conflict){
    const field = voucherConflictField(payload, conflict);
    alert('This ' + field + ' is already used by another voucher (DV ' + conflict.dvNumber + ' — ' + conflict.voucherName + '). Please use a unique value.');
    return;
  }
  if(state.editingVoucherId){
    const v = DB.vouchers.find(x=>x.id===state.editingVoucherId);
    if(v){
      Object.assign(v, payload);
      v.updatedAt = new Date().toISOString(); v.updatedBy = session.user.username;
      logAudit('Voucher Edited', 'DV ' + payload.dvNumber + ' — ' + payload.voucherName + ' (' + fmtMoney(payload.amount) + ', status: ' + payload.status + ')');
    }
  } else {
    DB.vouchers.unshift(Object.assign({
      id: uid('v'),
      dateTime: new Date().toISOString(),
      enteredBy: session.user.username,
    }, payload));
    logAudit('Voucher Added', 'DV ' + payload.dvNumber + ' — ' + payload.voucherName + ' (' + fmtMoney(payload.amount) + ')');
  }
  saveVouchers();
  closeModal();
}
function deleteVoucher(id){
  if(!confirm('Delete this voucher record? This cannot be undone.')) return;
  const v = DB.vouchers.find(x=>x.id===id);
  if(v){ logAudit('Voucher Deleted', 'DV ' + v.dvNumber + ' — ' + v.voucherName + ' (' + fmtMoney(v.amount) + ')'); }
  DB.vouchers = DB.vouchers.filter(v=>v.id!==id);
  state.selectedVoucherIds = state.selectedVoucherIds.filter(x=>x!==id);
  saveVouchers();
  render();
}

/* ---------------- bulk selection / bulk delete ---------------- */
function toggleVoucherSelection(id){
  const idx = state.selectedVoucherIds.indexOf(id);
  if(idx > -1) state.selectedVoucherIds.splice(idx, 1);
  else state.selectedVoucherIds.push(id);
  render();
}
// Selects or unselects every voucher currently shown on this page of the table.
// Selections persist while paging through a filtered list, so multiple pages
// can be built up before deleting; changing a filter clears the selection.
function toggleSelectAllOnPage(idsCsv){
  const ids = idsCsv ? idsCsv.split(',') : [];
  const allSelected = ids.length > 0 && ids.every(id => state.selectedVoucherIds.includes(id));
  if(allSelected){
    state.selectedVoucherIds = state.selectedVoucherIds.filter(id => !ids.includes(id));
  } else {
    ids.forEach(id => { if(!state.selectedVoucherIds.includes(id)) state.selectedVoucherIds.push(id); });
  }
  render();
}
function bulkDeleteSelected(){
  const ids = state.selectedVoucherIds.slice();
  if(ids.length === 0) return;
  if(!confirm('Delete ' + ids.length + ' selected voucher record(s)? This cannot be undone.')) return;
  DB.vouchers.filter(v => ids.includes(v.id)).forEach(v=>{
    logAudit('Voucher Deleted', 'DV ' + v.dvNumber + ' — ' + v.voucherName + ' (' + fmtMoney(v.amount) + ')');
  });
  DB.vouchers = DB.vouchers.filter(v => !ids.includes(v.id));
  state.selectedVoucherIds = [];
  saveVouchers();
  render();
}

/* ---------------- user CRUD ---------------- */
function openAddUser(){ pendingNewUserAvatar = null; state.modal='user'; render(); }
function submitUserForm(e){
  e.preventDefault();
  const f = e.target;
  const username = f.username.value.trim();
  const password = f.password.value;
  const name = f.name.value.trim();
  const role = f.role.value;
  if(!username || !password || !name){ alert('All fields are required.'); return; }
  if(DB.users.some(u=>u.username.toLowerCase()===username.toLowerCase())){
    alert('That username already exists.'); return;
  }
  if(!creatableRoles(session.user.role).includes(role)){
    alert('You are not permitted to create that role.'); return;
  }
  DB.users.push({ id: uid('u'), username, password, name, role, avatar: pendingNewUserAvatar || null, createdBy: session.user.username, createdAt: new Date().toISOString() });
  logAudit('User Created', role + ' account "' + username + '" (' + name + ') created.');
  pendingNewUserAvatar = null;
  saveUsers();
  state.modal = null;
  render();
}
function deleteUser(id){
  const u = DB.users.find(x=>x.id===id);
  if(!u) return;
  if(!confirm('Remove user "'+u.username+'"? They will no longer be able to log in.')) return;
  logAudit('User Removed', u.role + ' account "' + u.username + '" (' + u.name + ') removed.');
  DB.users = DB.users.filter(x=>x.id!==id);
  saveUsers();
  render();
}

/* ---------------- filtering ---------------- */
function filteredVouchers(){
  const f = state.filters;
  return DB.vouchers.filter(v=>{
    if(f.type!=='All' && v.type!==f.type) return false;
    if(f.fund!=='All' && v.fund!==f.fund) return false;
    if(f.status!=='All' && v.status!==f.status) return false;
    if(f.office!=='All' && v.office!==f.office) return false;
    if(f.enteredBy!=='All' && v.enteredBy!==f.enteredBy) return false;{
      const t = f.text.toLowerCase();
      const hay = [v.dvNumber,v.orsNumber,v.voucherName,v.particulars].join(' ').toLowerCase();
      if(!hay.includes(t)) return false;
    }
    return true;
  });
}
function setFilter(key, val){
  state.filters[key] = val;
  state.page_num = 1;
  state.selectedVoucherIds = [];
  render();
}

/* ---------------- reports (weekly / monthly / yearly) ---------------- */
function weekLabel(d){
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return d.getFullYear() + ' — Week ' + String(week).padStart(2,'0');
}
function periodKeyLabel(dateStr, period){
  const d = new Date(dateStr);
  if(isNaN(d)) return null;
  if(period === 'weekly'){
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
    const week = Math.ceil(dayOfYear / 7);
    const key = d.getFullYear() + '-W' + String(week).padStart(2,'0');
    return { key, label: weekLabel(d) };
  }
  if(period === 'yearly'){
    const key = String(d.getFullYear());
    return { key, label: key };
  }
  // monthly (default)
  const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  const label = d.toLocaleString('en-PH', {month:'long', year:'numeric'});
  return { key, label };
}
function buildReport(period){
  const map = new Map();
  DB.vouchers.forEach(v=>{
    const pk = periodKeyLabel(v.dateTime, period);
    if(!pk) return;
    if(!map.has(pk.key)) map.set(pk.key, { key:pk.key, label:pk.label, count:0, total:0, incoming:0, outgoing:0, paid:0 });
    const b = map.get(pk.key);
    const amt = Number(v.amount) || 0;
    b.count++;
    b.total += amt;
    if(v.type === 'Incoming') b.incoming += amt; else b.outgoing += amt;
    if(v.status === 'Paid' || v.status === 'Released') b.paid += amt;
  });
  return Array.from(map.values()).sort((a,b)=> b.key.localeCompare(a.key));
}
function setReportPeriod(p){
  state.reportPeriod = p;
  state.reportPage = 1;
  render();
}
function exportReportCSV(){
  const rows = buildReport(state.reportPeriod);
  if(rows.length===0){ alert('No data to export for this period.'); return; }
  const headers = ['Period','Entries','Total Amount','Incoming','Outgoing','Paid/Released'];
  const lines = [headers.join(',')];
  rows.forEach(r=> lines.push([csvEscape(r.label), r.count, r.total.toFixed(2), r.incoming.toFixed(2), r.outgoing.toFixed(2), r.paid.toFixed(2)].join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'voucher-report-'+state.reportPeriod+'-'+Date.now()+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- audit trail ---------------- */
function filteredAuditLog(){
  const f = state.auditFilters;
  return DB.auditLog.filter(a=>{
    if(f.action!=='All' && a.action!==f.action) return false;
    if(f.text){
      const t = f.text.toLowerCase();
      const hay = [a.actor, a.action, a.details].join(' ').toLowerCase();
      if(!hay.includes(t)) return false;
    }
    return true;
  });
}
function setAuditFilter(key, val){
  state.auditFilters[key] = val;
  state.auditPage = 1;
  render();
}

/* ---------------- export / import ---------------- */
function exportRows(){
  return filteredVouchers().map(v=>({
    'Date/Time': fmtDateTime(v.dateTime),
    'Voucher Name': v.voucherName,
    'DV Number': v.dvNumber,
    'ORS Number': v.orsNumber,
    'Fund': v.fund,
    'Particulars': v.particulars,
    'Type': v.type,
    'Status': v.status,
    'Location/Office': v.office,
    'Amount': v.amount,
    'Entered By': v.enteredBy,
  }));
}
function csvEscape(val){
  const s = (val===undefined||val===null) ? '' : String(val);
  if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}
function exportCSV(){
  const rows = exportRows();
  if(rows.length===0){ alert('No records to export.'); return; }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(r=> lines.push(headers.map(h=>csvEscape(r[h])).join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'vouchers_'+Date.now()+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function exportXLSX(){
  if(typeof XLSX==='undefined'){ alert('Excel engine still loading, please try again in a moment.'); return; }
  const rows = exportRows();
  if(rows.length===0){ alert('No records to export.'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vouchers');
  XLSX.writeFile(wb, 'vouchers_'+Date.now()+'.xlsx');
}
function triggerImport(){
  document.getElementById('import-input').click();
}
function parseCSVText(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1]==='"'){ field+='"'; i++; } else { inQuotes=false; }
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n' || c === '\r'){
        if(c==='\r' && text[i+1]==='\n') i++;
        row.push(field); field=''; rows.push(row); row=[];
      } else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  if(!rows.length) return [];
  const headers = rows[0].map(h=>h.trim());
  return rows.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>{
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = r[idx]!==undefined ? r[idx] : '');
    return obj;
  });
}
// Reduces a header name to just its letters/numbers, lowercased, so
// "DV No.", "dv_no", "DV  No", and "DV#" are all treated as the same column.
function normalizeHeaderKey(s){
  return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
// Matches an imported office/location value against the configured dropdown
// list (case/whitespace-insensitive). Falls back to the raw imported text
// if it doesn't match anything on the list, so no data is ever lost.
function matchOfficeOption(raw){
  if(!raw) return '';
  const norm = raw.trim().toLowerCase();
  const found = OFFICE_OPTIONS.find(o=>o.toLowerCase()===norm);
  return found || raw.trim();
}
function mapImportedRow(row){
  // Build a normalized lookup of this row's actual column headers once,
  // so we can match them against many possible naming variants below.
  const normalizedMap = {};
  Object.keys(row).forEach(rk=>{ normalizedMap[normalizeHeaderKey(rk)] = rk; });
  const get = (...aliases)=>{
    for(const alias of aliases){
      const originalKey = normalizedMap[normalizeHeaderKey(alias)];
      if(originalKey !== undefined){
        const val = row[originalKey];
        if(val !== undefined && String(val).trim() !== '') return String(val).trim();
      }
    }
    return '';
  };
  const dt = get('Date/Time','DateTime','Date Time','Date','Timestamp','Date Entered');
  const rawType = get('Type','Transaction Type','Voucher Type');
  const rawFund = get('Fund','Fund Source','Fund Code');
  const rawStatus = get('Status','Voucher Status');
  return {
    id: uid('v'),
    dateTime: dt ? (isNaN(new Date(dt)) ? new Date().toISOString() : new Date(dt).toISOString()) : new Date().toISOString(),
    type: TYPE_OPTIONS.find(t=>t.toLowerCase()===rawType.toLowerCase()) || 'Incoming',
    dvNumber: get('DV Number','DV No','DV No.','DV#','DV Num','Disbursement Voucher Number'),
    orsNumber: get('ORS Number','ORS No','ORS No.','ORS#','Obligation Request Number','Obligation Request and Status Number'),
    voucherName: get('Voucher Name','VoucherName','Name','Payee','Payee Name'),
    particulars: get('Particulars','Description','Remarks'),
    amount: parseFloat(get('Amount','Amount (PHP)','Amount PHP','Total Amount').replace(/,/g,'')) || 0,
    fund: FUND_OPTIONS.find(f=>f.toLowerCase()===rawFund.toLowerCase()) || FUND_OPTIONS[0],
    status: STATUS_OPTIONS.find(s=>s.toLowerCase()===rawStatus.toLowerCase()) || 'Pending',
    office: matchOfficeOption(get('Location/Office','Office/Location','Office','Location','Branch','Section','Office Location')),
    enteredBy: get('Entered By','EnteredBy','Encoder','Prepared By') || session.user.username,
  };
}
// Filters out any imported rows that would duplicate an existing voucher's
// DV Number, ORS Number, or Particulars — or duplicate another row earlier
// in the same import batch. Returns the accepted rows plus how many were skipped.
function dedupeImportBatch(candidateRows){
  const accepted = [];
  let skipped = 0;
  candidateRows.forEach(row=>{
    const conflictsExisting = DB.vouchers.some(v => voucherConflictField(row, v));
    const conflictsBatch = accepted.some(v => voucherConflictField(row, v));
    if(conflictsExisting || conflictsBatch) skipped++;
    else accepted.push(row);
  });
  return { accepted, skipped };
}
function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if(ext==='csv'){
    const reader = new FileReader();
    reader.onload = evt=>{
      const rows = parseCSVText(evt.target.result);
      const candidates = rows.map(mapImportedRow).filter(v=>v.dvNumber || v.voucherName);
      const { accepted, skipped } = dedupeImportBatch(candidates);
      DB.vouchers = accepted.concat(DB.vouchers);
      saveVouchers();
      state.banner = {type:'success', text: accepted.length+' record(s) imported from CSV.' + (skipped>0 ? ' ' + skipped + ' skipped as duplicate DV/ORS/Particulars.' : '')};
      logAudit('Bulk Import', accepted.length + ' voucher record(s) imported from a CSV file' + (skipped>0 ? ' (' + skipped + ' duplicates skipped)' : '') + '.');
      render();
    };
    reader.readAsText(file);
  } else {
    if(typeof XLSX==='undefined'){ alert('Excel engine still loading, please try again in a moment.'); return; }
    const reader = new FileReader();
    reader.onload = evt=>{
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, {defval:''});
      const candidates = json.map(mapImportedRow).filter(v=>v.dvNumber || v.voucherName);
      const { accepted, skipped } = dedupeImportBatch(candidates);
      DB.vouchers = accepted.concat(DB.vouchers);
      saveVouchers();
      state.banner = {type:'success', text: accepted.length+' record(s) imported from Excel.' + (skipped>0 ? ' ' + skipped + ' skipped as duplicate DV/ORS/Particulars.' : '')};
      logAudit('Bulk Import', accepted.length + ' voucher record(s) imported from an Excel file' + (skipped>0 ? ' (' + skipped + ' duplicates skipped)' : '') + '.');
      render();
    };
    reader.readAsArrayBuffer(file);
  }
  e.target.value = '';
}

/* ---------------- clock ---------------- */
function startClock(){
  setInterval(()=>{
    const el = document.getElementById('live-clock');
    if(el){
      const now = new Date();
      el.textContent = now.toLocaleString('en-PH', {weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'});
    }
  }, 1000);
}

/* ================= RENDER ================= */
function render(){
  const app = document.getElementById('app');

  // Preserve focus + cursor position across the full re-render (e.g. while typing in a filter box)
  const active = document.activeElement;
  let focusKey = null, selStart = null, selEnd = null;
  if(active && active.getAttribute && active.getAttribute('data-focus-key')){
    focusKey = active.getAttribute('data-focus-key');
    try{ selStart = active.selectionStart; selEnd = active.selectionEnd; }catch(e){}
  }

  if(state.loading){
    app.innerHTML = '<div class="login-wrap"><div style="color:#fff;font-family:var(--font-body);font-size:14px;">Loading registry…</div></div>';
    return;
  }
  if(!session.user){
    app.innerHTML = renderLogin();
    const form = document.getElementById('login-form');
    if(form) form.addEventListener('submit', handleLogin);
    return;
  }
  app.innerHTML = renderShell();
  attachShellHandlers();

  if(focusKey){
    const el = app.querySelector('[data-focus-key="'+focusKey+'"]');
    if(el){
      el.focus();
      if(selStart!==null && el.setSelectionRange){
        try{ el.setSelectionRange(selStart, selEnd); }catch(e){}
      }
    }
  }
}

function renderLogin(){
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-head">
        <div class="seal seal-photo"><img src="DAR.png"></div>
        <h1>Accounting Section Tracker</h1>
        <p>Disbursement Voucher Registry</p>
      </div>
      <div class="login-body">
        ${state.loginError ? `<div class="login-error">${esc(state.loginError)}</div>` : ''}
        <form id="login-form">
          <div class="field">
            <label>Username</label>
            <input id="login-username" type="text" autocomplete="username" required>
          </div>
          <div class="field">
            <label>Password</label>
            <div style="position:relative;">
              <input id="login-password" type="password" autocomplete="current-password" required style="padding-right:40px;width:100%;box-sizing:border-box;">
              <button type="button" onclick="toggleLoginPasswordVisibility()" title="Show/hide password" style="position:absolute;top:0;right:0;height:100%;width:38px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;cursor:pointer;color:var(--slate,#5b6472);padding:0;">
                <i id="login-password-toggle-icon" class="bi bi-eye"></i>
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block"><i class="bi bi-box-arrow-in-right"></i> Log In</button>
        </form>
        <div class="login-hint">
          Need access? Ask your registry administrator to create an account for you.
        </div>
      </div>
    </div>
  </div>`;
}


function renderShell(){
  const role = session.user.role;
  const isVouchers = state.page==='vouchers';
  const isUsers = state.page==='users';
  const isReports = state.page==='reports';
  const isAudit = state.page==='audit';
  return `
  <div class="shell">
    <div class="sidebar">
      <div class="sidebar-brand">
        <div class="seal seal-photo"><img src="data:image/jpeg;base64,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" alt="DAR Zamboanga Sibugay official seal"></div>
        <div class="sidebar-brand-text">Accounting<br>Section Tracker</div>
      </div>
      <div class="nav-item ${isVouchers?'active':''}" onclick="state.page='vouchers';state.banner=null;render()"><i class="bi bi-journal-text"></i> Vouchers</div>
      <div class="nav-item ${isReports?'active':''}" onclick="state.page='reports';state.banner=null;render()"><i class="bi bi-bar-chart-line-fill"></i> Reports</div>
      ${canManageUsers(role) ? `<div class="nav-item ${isUsers?'active':''}" onclick="state.page='users';state.banner=null;render()"><i class="bi bi-people-fill"></i> Users</div>` : ''}
      ${canManageUsers(role) ? `<div class="nav-item ${isAudit?'active':''}" onclick="state.page='audit';state.banner=null;render()"><i class="bi bi-shield-lock-fill"></i> Audit Trail</div>` : ''}
      <div class="nav-spacer"></div>
      <div class="sidebar-foot">
        <div style="cursor:pointer;display:inline-block;position:relative;" onclick="openAvatarModal('${session.user.id}')" title="Update your photo">
          ${avatarHTML(session.user, 44)}
          <div style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:var(--brass-light);display:flex;align-items:center;justify-content:center;border:2px solid var(--navy);"><i class="bi bi-camera-fill" style="font-size:8px;color:var(--navy-deep);"></i></div>
        </div>
        <div class="role-badge" style="margin-top:10px;">${esc(role)}</div>
        <div class="user-name">${esc(session.user.name)}</div>
        <div class="user-sub">@${esc(session.user.username)}</div>
        <button class="btn btn-ghost btn-sm" style="width:100%;background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.18);" onclick="handleLogout()"><i class="bi bi-box-arrow-right"></i> Log Out</button>
      </div>
    </div>
    <div class="main">
      <div class="topbar">
        <h2>${isVouchers ? 'Voucher Registry' : isReports ? 'Data Reports' : isAudit ? 'Audit Trail' : 'User Management'}</h2>
        <div class="clock" id="live-clock"></div>
      </div>
      <div class="content">
        ${state.banner ? `<div class="banner banner-${state.banner.type}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <span>${esc(state.banner.text)}</span>
          <button class="vt-modal-close" style="color:inherit;" onclick="state.banner=null;render()">&times;</button>
        </div>` : ''}
        ${isVouchers ? renderVouchersPage() : isReports ? renderReportsPage() : isAudit ? renderAuditPage() : renderUsersPage()}
      </div>
    </div>
  </div>
  ${state.modal==='voucher' ? renderVoucherModal() : ''}
  ${state.modal==='user' ? renderUserModal() : ''}
  ${state.modal==='avatar' ? renderAvatarModal() : ''}
  <input type="file" id="import-input" class="hidden-file-input" accept=".csv,.xlsx,.xls" onchange="handleImportFile(event)">
  `;
}

function renderVouchersPage(){
  const role = session.user.role;
  const all = DB.vouchers;
  const list = filteredVouchers();
  const totalAmount = list.reduce((s,v)=>s+(Number(v.amount)||0),0);
  const incomingCount = all.filter(v=>v.type==='Incoming').length;
  const outgoingCount = all.filter(v=>v.type==='Outgoing').length;

  const pageSize = state.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length/pageSize));
  if(state.page_num > totalPages) state.page_num = totalPages;
  const start = (state.page_num-1)*pageSize;
  const pageItems = list.slice(start, start+pageSize);
  const canBulkDelete = canEditDeleteVoucher(role);
  const pageIds = pageItems.map(v=>v.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id=>state.selectedVoucherIds.includes(id));

  const rows = pageItems.map(v=>`
    <tr>
      ${canBulkDelete ? `<td><input type="checkbox" ${state.selectedVoucherIds.includes(v.id)?'checked':''} onchange="toggleVoucherSelection('${v.id}')"></td>` : ''}
      <td class="mono" style="white-space:nowrap;color:var(--slate);">${esc(fmtDateTime(v.dateTime))}</td>
      <td>${esc(v.voucherName)}</td>
      <td class="mono">${esc(v.dvNumber)}</td>
      <td class="mono">${esc(v.orsNumber)}</td>
      <td class="mono">${esc(v.fund)}</td>
      <td class="cell-particulars">${esc(v.particulars)}</td>
      <td><span class="type-pill ${v.type==='Incoming'?'type-in':'type-out'}">${esc(v.type)}</span></td>
      <td><span class="stamp stamp-${v.status.toLowerCase()}">${esc(v.status)}</span></td>
      <td class="cell-office">${esc(v.office)}</td>
      <td class="amount-cell">${fmtMoney(v.amount)}</td>
      <td style="white-space:nowrap;">${avatarHTML(DB.users.find(u=>u.username===v.enteredBy), 20)} <span style="margin-left:4px;">${esc(v.enteredBy||'')}</span></td>
      <td style="white-space:nowrap;">${v.updatedBy ? `${avatarHTML(DB.users.find(u=>u.username===v.updatedBy), 20)} <span style="margin-left:4px;">${esc(v.updatedBy)}</span><div class="mono" style="color:var(--slate);font-size:11px;margin-top:2px;">${esc(fmtDateTime(v.updatedAt))}</div>` : `<span style="color:var(--slate);">—</span>`}</td>
      <td>
        <div class="row-actions">
          ${canEditDeleteVoucher(role) ? `<button class="icon-btn" onclick="openEditVoucher('${v.id}')"><i class="bi bi-pencil-square"></i> Edit</button>` : ''}
          ${canEditDeleteVoucher(role) ? `<button class="icon-btn danger" onclick="deleteVoucher('${v.id}')"><i class="bi bi-trash3"></i> Delete</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Total Records</div><div class="stat-value">${all.length}</div></div>
      <div class="stat-card"><div class="stat-label">Filtered Total</div><div class="stat-value" style="font-size:17px;">${fmtMoney(totalAmount)}</div></div>
      <div class="stat-card"><div class="stat-label">Incoming</div><div class="stat-value">${incomingCount}</div></div>
      <div class="stat-card"><div class="stat-label">Outgoing</div><div class="stat-value">${outgoingCount}</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>Voucher Entries</h3>
        <div class="toolbar-btns">
          ${canBulkDelete && state.selectedVoucherIds.length>0 ? `<button class="btn btn-danger btn-sm" onclick="bulkDeleteSelected()"><i class="bi bi-trash3"></i> Delete Selected (${state.selectedVoucherIds.length})</button>` : ''}
          ${canAddVoucher(role) ? `<button class="btn btn-brass btn-sm" onclick="openAddVoucher()"><i class="bi bi-plus-lg"></i> Add Voucher</button>` : ''}
          ${canImport(role) ? `<button class="btn btn-ghost btn-sm" onclick="triggerImport()"><i class="bi bi-upload"></i> Import CSV/Excel</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="exportCSV()"><i class="bi bi-filetype-csv"></i> Export CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="exportXLSX()"><i class="bi bi-file-earmark-excel"></i> Export Excel</button>
        </div>
      </div>
      <div class="filters">
        <input type="text" class="search-wide" data-focus-key="search-text" placeholder="Search voucher name, DV No., ORS No., particulars…" value="${esc(state.filters.text)}" oninput="setFilter('text', this.value)">
        <select onchange="setFilter('type', this.value)">
          <option value="All" ${state.filters.type==='All'?'selected':''}>All Types</option>
          ${TYPE_OPTIONS.map(t=>`<option value="${t}" ${state.filters.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <select onchange="setFilter('fund', this.value)">
          <option value="All" ${state.filters.fund==='All'?'selected':''}>All Funds</option>
          ${FUND_OPTIONS.map(f=>`<option value="${f}" ${state.filters.fund===f?'selected':''}>${f}</option>`).join('')}
        </select>
        <select onchange="setFilter('status', this.value)">
          <option value="All" ${state.filters.status==='All'?'selected':''}>All Statuses</option>
          ${STATUS_OPTIONS.map(s=>`<option value="${s}" ${state.filters.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select onchange="setFilter('office', this.value)">
          <option value="All" ${state.filters.office==='All'?'selected':''}>All Offices</option>
          ${OFFICE_OPTIONS.map(o=>`<option value="${esc(o)}" ${state.filters.office===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
        <select onchange="setFilter('enteredBy', this.value)">
          <option value="All" ${state.filters.enteredBy==='All'?'selected':''}>All Encoders</option>
          ${[...new Set(DB.vouchers.map(v=>v.enteredBy).filter(Boolean))].sort().map(u=>`<option value="${esc(u)}" ${state.filters.enteredBy===u?'selected':''}>${esc(u)}</option>`).join('')}
        </select>
      </div>
      ${list.length===0 ? `
        <div class="empty-state">
          <div class="big">No matching records</div>
          <div>Adjust your filters, or add a new voucher to begin the ledger.</div>
        </div>
      ` : `
      <div style="overflow-x:auto;">
        <table>
          <thead><tr>
            ${canBulkDelete ? `<th><input type="checkbox" ${allOnPageSelected?'checked':''} onchange="toggleSelectAllOnPage('${pageIds.join(',')}')" title="Select/unselect all on this page"></th>` : ''}
            <th>Date / Time</th><th>Voucher Name</th><th>DV No.</th><th>ORS No.</th><th>Fund</th>
            <th>Particulars</th><th>Type</th><th>Status</th><th>Office</th><th>Amount</th><th>Entered By</th><th>Edited By</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="pager">
        <div>Showing ${start+1}–${Math.min(start+pageSize,list.length)} of ${list.length}</div>
        <div class="pager-btns">
          <button class="btn btn-ghost btn-sm" ${state.page_num<=1?'disabled':''} onclick="state.page_num--;render()"><i class="bi bi-chevron-left"></i> Prev</button>
          <button class="btn btn-ghost btn-sm" ${state.page_num>=totalPages?'disabled':''} onclick="state.page_num++;render()">Next <i class="bi bi-chevron-right"></i></button>
        </div>
      </div>
      `}
    </div>
  `;
}

function statusColor(s){
  const map = { Pending:'var(--amber)', Processing:'var(--blue)', Returned:'var(--red)', Paid:'var(--green)', Unpaid:'var(--rust)', Released:'var(--purple)' };
  return map[s] || 'var(--slate)';
}
function typeColor(t){
  return t === 'Incoming' ? 'var(--green)' : 'var(--rust)';
}
function analyticsBar(label, count, total, totalCount, color){
  const pct = totalCount>0 ? Math.round((count/totalCount)*100) : 0;
  return `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;margin-bottom:5px;">
        <span style="font-weight:600;color:var(--navy);">${esc(label)}</span>
        <span class="mono" style="color:var(--slate);">${count} entries · ${fmtMoney(total)}</span>
      </div>
      <div style="background:#EEF0F2;border-radius:50rem;height:10px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:50rem;transition:width .3s ease-in-out;"></div>
      </div>
    </div>
  `;
}
function renderReportsPage(){
  const rows = buildReport(state.reportPeriod);
  const grandTotal = rows.reduce((s,r)=>s+r.total, 0);
  const grandCount = rows.reduce((s,r)=>s+r.count, 0);

  // Overall breakdown by status and by transaction type (across all vouchers, not just the selected period)
  const totalVoucherCount = DB.vouchers.length;
  const statusMap = {}; STATUS_OPTIONS.forEach(s=>{ statusMap[s] = {count:0, total:0}; });
  const typeMap = {}; TYPE_OPTIONS.forEach(t=>{ typeMap[t] = {count:0, total:0}; });
  DB.vouchers.forEach(v=>{
    const amt = Number(v.amount) || 0;
    if(statusMap[v.status]){ statusMap[v.status].count++; statusMap[v.status].total += amt; }
    if(typeMap[v.type]){ typeMap[v.type].count++; typeMap[v.type].total += amt; }
  });

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(rows.length/pageSize));
  if(state.reportPage > totalPages) state.reportPage = totalPages;
  const start = (state.reportPage-1)*pageSize;
  const pageItems = rows.slice(start, start+pageSize);

  const tableRows = pageItems.map(r=>`
    <tr>
      <td style="font-weight:600;color:var(--navy);">${esc(r.label)}</td>
      <td class="mono">${r.count}</td>
      <td class="amount-cell">${fmtMoney(r.total)}</td>
      <td class="amount-cell" style="color:var(--green);">${fmtMoney(r.incoming)}</td>
      <td class="amount-cell" style="color:var(--rust);">${fmtMoney(r.outgoing)}</td>
      <td class="amount-cell">${fmtMoney(r.paid)}</td>
    </tr>
  `).join('');

  return `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Periods Shown</div><div class="stat-value">${rows.length}</div></div>
      <div class="stat-card"><div class="stat-label">Total Entries</div><div class="stat-value">${grandCount}</div></div>
      <div class="stat-card"><div class="stat-label">Total Amount</div><div class="stat-value" style="font-size:17px;">${fmtMoney(grandTotal)}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:22px;">
      <div class="panel">
        <div class="panel-head"><h3><i class="bi bi-pie-chart-fill" style="color:var(--brass-light);"></i> By Status</h3></div>
        <div style="padding:20px 22px;">
          ${STATUS_OPTIONS.map(s=>analyticsBar(s, statusMap[s].count, statusMap[s].total, totalVoucherCount, statusColor(s))).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3><i class="bi bi-arrow-left-right" style="color:var(--brass-light);"></i> By Transaction Type</h3></div>
        <div style="padding:20px 22px;">
          ${TYPE_OPTIONS.map(t=>analyticsBar(t, typeMap[t].count, typeMap[t].total, totalVoucherCount, typeColor(t))).join('')}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>Voucher Activity by Period</h3>
        <div class="toolbar-btns">
          <div class="tabs">
            <div class="tab ${state.reportPeriod==='weekly'?'active':''}" onclick="setReportPeriod('weekly')">Weekly</div>
            <div class="tab ${state.reportPeriod==='monthly'?'active':''}" onclick="setReportPeriod('monthly')">Monthly</div>
            <div class="tab ${state.reportPeriod==='yearly'?'active':''}" onclick="setReportPeriod('yearly')">Yearly</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="exportReportCSV()"><i class="bi bi-download"></i> Export CSV</button>
        </div>
      </div>
      ${rows.length===0 ? `
        <div class="empty-state">
          <div class="big">No voucher activity yet</div>
          <div>Once vouchers are added, they'll be summarized here by ${esc(state.reportPeriod)} period.</div>
        </div>
      ` : `
      <div style="overflow-x:auto;">
        <table>
          <thead><tr>
            <th>Period</th><th>Entries</th><th>Total Amount</th><th>Incoming</th><th>Outgoing</th><th>Paid / Released</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="pager">
        <div>Showing ${start+1}–${Math.min(start+pageSize,rows.length)} of ${rows.length} periods</div>
        <div class="pager-btns">
          <button class="btn btn-ghost btn-sm" ${state.reportPage<=1?'disabled':''} onclick="state.reportPage--;render()"><i class="bi bi-chevron-left"></i> Prev</button>
          <button class="btn btn-ghost btn-sm" ${state.reportPage>=totalPages?'disabled':''} onclick="state.reportPage++;render()">Next <i class="bi bi-chevron-right"></i></button>
        </div>
      </div>
      `}
      <div class="footnote">Periods are calculated from each voucher's recorded date/time. Weekly periods run Jan 1 in 7-day blocks (not strict ISO week numbering).</div>
    </div>
  `;
}

function renderUsersPage(){
  const role = session.user.role;
  let managed, addLabel, roleOptions;
  if(role==='superadmin'){
    managed = DB.users.filter(u=>u.role==='admin');
    addLabel = '<i class="bi bi-person-plus"></i> Add Administrator';
    roleOptions = ['admin'];
  } else {
    managed = DB.users.filter(u=>u.createdBy===session.user.username);
    addLabel = '<i class="bi bi-person-plus"></i> Add Staff / Viewer';
    roleOptions = ['staff','viewer'];
  }
  const cards = managed.map(u=>`
    <div class="user-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        ${avatarHTML(u, 44)}
        <div>
          <div class="uname">${esc(u.name)}</div>
          <div class="urole" style="margin-bottom:0;">${esc(u.role)}</div>
        </div>
      </div>
      <div class="umeta">@${esc(u.username)} · added ${esc(fmtDateTime(u.createdAt))}</div>
      <div style="display:flex;gap:6px;">
        ${canEditAvatar(u) ? `<button class="btn btn-ghost btn-sm" onclick="openAvatarModal('${u.id}')"><i class="bi bi-camera"></i> Photo</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')"><i class="bi bi-trash3"></i> Remove</button>
      </div>
    </div>
  `).join('');

  let allStaffViewersPanel = '';
  if(role==='superadmin'){
    const allStaffViewers = DB.users.filter(u=>u.role==='staff' || u.role==='viewer');
    const rows = allStaffViewers.map(u=>`
      <tr>
        <td>${avatarHTML(u, 32)}</td>
        <td>${esc(u.name)}</td>
        <td class="mono">@${esc(u.username)}</td>
        <td style="text-transform:capitalize;">${esc(u.role)}</td>
        <td>${esc(u.createdBy)}</td>
        <td class="mono" style="white-space:nowrap;color:var(--slate);">${esc(fmtDateTime(u.createdAt))}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" onclick="openAvatarModal('${u.id}')"><i class="bi bi-camera"></i> Photo</button>
            <button class="icon-btn danger" onclick="deleteUser('${u.id}')"><i class="bi bi-trash3"></i> Remove</button>
          </div>
        </td>
      </tr>
    `).join('');
    allStaffViewersPanel = `
      <div class="panel" style="margin-top:20px;">
        <div class="panel-head">
          <h3>All Staff &amp; Viewers</h3>
        </div>
        ${allStaffViewers.length===0 ? `
          <div class="empty-state">
            <div class="big">No staff or viewer accounts yet</div>
            <div>These are created by individual administrators. Once an administrator adds staff or viewer accounts, they'll appear here for oversight.</div>
          </div>
        ` : `
        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Photo</th><th>Name</th><th>Username</th><th>Role</th><th>Created By (Admin)</th><th>Added</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        `}
        <div class="footnote">As Super Administrator, you can see and remove every staff and viewer account across all administrators, for full oversight of the registry.</div>
      </div>
    `;
  }

  return `
    <div class="panel">
      <div class="panel-head">
        <h3>${role==='superadmin' ? 'Administrators' : 'Staff & Viewers'}</h3>
        <button class="btn btn-brass btn-sm" onclick="openAddUser()">${addLabel}</button>
      </div>
      ${managed.length===0 ? `
        <div class="empty-state">
          <div class="big">No accounts yet</div>
          <div>${role==='superadmin' ? 'Create administrator accounts to delegate day-to-day management.' : 'Create staff accounts for data entry, or viewer accounts for read-only access.'}</div>
        </div>
      ` : `<div class="users-grid">${cards}</div>`}
      <div class="footnote">
        ${role==='superadmin'
          ? 'As Super Administrator, you can create an unlimited number of administrator accounts. Each administrator can, in turn, create their own staff and viewer accounts.'
          : 'Staff accounts can add, edit, and delete voucher entries. Viewer accounts are read-only and cannot add, edit, or delete records.'}
      </div>
    </div>
    ${allStaffViewersPanel}
  `;
}

function renderAuditPage(){
  const list = filteredAuditLog();
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(list.length/pageSize));
  if(state.auditPage > totalPages) state.auditPage = totalPages;
  const start = (state.auditPage-1)*pageSize;
  const pageItems = list.slice(start, start+pageSize);

  const actionColor = a=>{
    if(a==='Login') return 'var(--green)';
    if(a==='Failed Login Attempt') return 'var(--red)';
    if(a==='Voucher Deleted' || a==='User Removed') return 'var(--red)';
    if(a==='Voucher Added' || a==='User Created' || a==='Bulk Import') return 'var(--blue)';
    return 'var(--amber)';
  };

  const rows = pageItems.map(a=>`
    <tr>
      <td class="mono" style="white-space:nowrap;color:var(--slate);">${esc(fmtDateTime(a.timestamp))}</td>
      <td style="white-space:nowrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${avatarHTML(DB.users.find(u=>u.username===a.actor), 24)}
          <div>${esc(a.actor)}<div style="font-size:10.5px;color:var(--slate);text-transform:capitalize;">${esc(a.role)}</div></div>
        </div>
      </td>
      <td><span style="font-weight:700;font-size:11.5px;color:${actionColor(a.action)};">${esc(a.action)}</span></td>
      <td style="color:var(--slate);">${esc(a.details)}</td>
    </tr>
  `).join('');

  return `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Total Log Entries</div><div class="stat-value">${DB.auditLog.length}</div></div>
      <div class="stat-card"><div class="stat-label">Matching Filters</div><div class="stat-value">${list.length}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>Audit Trail</h3>
      </div>
      <div class="filters">
        <input type="text" data-focus-key="audit-search" placeholder="Search user, action, details…" value="${esc(state.auditFilters.text)}" oninput="setAuditFilter('text', this.value)">
        <select onchange="setAuditFilter('action', this.value)">
          <option value="All" ${state.auditFilters.action==='All'?'selected':''}>All Actions</option>
          ${ACTION_OPTIONS.map(a=>`<option value="${a}" ${state.auditFilters.action===a?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
      ${list.length===0 ? `
        <div class="empty-state">
          <div class="big">No matching activity</div>
          <div>Every login, voucher change, and account change will be recorded here.</div>
        </div>
      ` : `
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="pager">
        <div>Showing ${start+1}–${Math.min(start+pageSize,list.length)} of ${list.length}</div>
        <div class="pager-btns">
          <button class="btn btn-ghost btn-sm" ${state.auditPage<=1?'disabled':''} onclick="state.auditPage--;render()"><i class="bi bi-chevron-left"></i> Prev</button>
          <button class="btn btn-ghost btn-sm" ${state.auditPage>=totalPages?'disabled':''} onclick="state.auditPage++;render()">Next <i class="bi bi-chevron-right"></i></button>
        </div>
      </div>
      `}
      <div class="footnote">The audit trail is append-only — entries cannot be edited or deleted from within the app, preserving an honest record of activity.</div>
    </div>
  `;
}

function renderVoucherModal(){
  const editing = state.editingVoucherId ? DB.vouchers.find(v=>v.id===state.editingVoucherId) : null;
  const v = editing || {type:'Incoming', dvNumber:'', orsNumber:'', voucherName:'', particulars:'', amount:'', fund:FUND_OPTIONS[0], status:'Pending', office:''};
  const isOtherOffice = !!(v.office && !OFFICE_OPTIONS.includes(v.office));
  return `
  <div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="vt-modal">
      <div class="vt-modal-head">
        <h3>${editing ? 'Edit Voucher' : 'Add Voucher'}</h3>
        <button class="vt-modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="voucher-form" onsubmit="submitVoucherForm(event)">
        <div class="vt-modal-body">
          <div class="grid-2">
            <div class="field">
              <label>Transaction Type</label>
              <select name="type">${TYPE_OPTIONS.map(t=>`<option value="${t}" ${v.type===t?'selected':''}>${t}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>Fund</label>
              <select name="fund">${FUND_OPTIONS.map(f=>`<option value="${f}" ${v.fund===f?'selected':''}>${f}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>DV Number</label>
              <input type="text" name="dvNumber" value="${esc(v.dvNumber)}" required>
            </div>
            <div class="field">
              <label>ORS Number</label>
              <input type="text" name="orsNumber" value="${esc(v.orsNumber)}">
            </div>
          </div>
          <div class="field">
            <label>Voucher Name</label>
            <input type="text" name="voucherName" value="${esc(v.voucherName)}" required>
          </div>
          <div class="field">
            <label>Particulars</label>
            <textarea name="particulars" rows="3">${esc(v.particulars)}</textarea>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Amount (₱)</label>
              <input type="number" step="0.01" min="0" name="amount" value="${esc(v.amount)}" required>
            </div>
            <div class="field">
              <label>Status</label>
              <select name="status">${STATUS_OPTIONS.map(s=>`<option value="${s}" ${v.status===s?'selected':''}>${s}</option>`).join('')}</select>
            </div>
          </div>
          <div class="field">
            <label>Location / Office</label>
            <select name="officeSelect" id="office-select" onchange="toggleOfficeOther(this)">
              ${OFFICE_OPTIONS.map(o=>`<option value="${esc(o)}" ${(!isOtherOffice && v.office===o)?'selected':''}>${esc(o)}</option>`).join('')}
              <option value="${OFFICE_OTHER_VALUE}" ${isOtherOffice?'selected':''}>Other (type below)</option>
            </select>
            <input type="text" id="office-other-input" name="officeOther" placeholder="Type the office / location" value="${isOtherOffice?esc(v.office):''}" style="margin-top:8px;${isOtherOffice?'':'display:none;'}">
          </div>
        </div>
        <div class="vt-modal-foot">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${editing ? '<i class=\"bi bi-check-lg\"></i> Save Changes' : '<i class=\"bi bi-plus-lg\"></i> Add Voucher'}</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderUserModal(){
  const role = session.user.role;
  const opts = creatableRoles(role);
  return `
  <div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="vt-modal">
      <div class="vt-modal-head">
        <h3>Add Account</h3>
        <button class="vt-modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="submitUserForm(event)">
        <div class="vt-modal-body">
          <div class="field">
            <label>Profile Picture (optional)</label>
            <div style="display:flex;align-items:center;gap:14px;">
              <img id="new-user-avatar-preview" src="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:1px solid var(--hairline);display:none;">
              <div id="new-user-avatar-placeholder" style="width:56px;height:56px;border-radius:50%;background:#F1F3F5;display:flex;align-items:center;justify-content:center;color:var(--slate);font-size:22px;"><i class="bi bi-person"></i></div>
              <input type="file" accept="image/*" onchange="handleNewUserAvatarSelect(event)" style="flex:1;">
            </div>
          </div>
          <div class="field">
            <label>Full Name</label>
            <input type="text" name="name" required>
          </div>
          <div class="field">
            <label>Username</label>
            <input type="text" name="username" required>
          </div>
          <div class="field">
            <label>Password</label>
            <input type="text" name="password" required>
          </div>
          <div class="field">
            <label>Role</label>
            <select name="role">${opts.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>
          </div>
        </div>
        <div class="vt-modal-foot">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Create Account</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderAvatarModal(){
  const u = DB.users.find(x=>x.id===state.avatarTargetUserId);
  if(!u) return '';
  return `
  <div class="overlay" onclick="if(event.target===this) closeModal()">
    <div class="vt-modal" style="max-width:420px;">
      <div class="vt-modal-head">
        <h3>Update Photo</h3>
        <button class="vt-modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="vt-modal-body" style="text-align:center;">
        <div style="margin-bottom:16px;color:var(--slate);font-size:13px;">${esc(u.name)} — @${esc(u.username)}</div>
        <div style="position:relative;display:inline-block;margin-bottom:16px;">
          <img id="edit-avatar-preview" src="${u.avatar||''}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:1px solid var(--hairline);display:${u.avatar?'block':'none'};">
          <div id="edit-avatar-placeholder" style="width:120px;height:120px;display:${u.avatar?'none':'flex'};">${avatarHTML(u, 120)}</div>
        </div>
        <div class="field" style="text-align:left;">
          <label>Choose a new photo</label>
          <input type="file" accept="image/*" onchange="handleEditAvatarSelect(event)">
        </div>
      </div>
      <div class="vt-modal-foot">
        ${u.avatar ? `<button type="button" class="btn btn-danger" onclick="removeAvatar()"><i class="bi bi-trash3"></i> Remove Photo</button>` : ''}
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveAvatar()"><i class="bi bi-check-lg"></i> Save Photo</button>
      </div>
    </div>
  </div>`;
}

function attachShellHandlers(){ /* inline handlers used throughout; nothing extra to bind */ }

// Laravel owns authentication and database state.
DB.users=[]; DB.vouchers=[]; DB.auditLog=[];
state.loading=true;
render();
startClock();
if(document.readyState === 'complete'){ loadDB(); }
else { window.addEventListener('load', loadDB); }
