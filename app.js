import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, signOut as fbOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- CAPACITOR DETECT ---
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
console.log('✅ App loaded. isNative:', isNative);

// --- ТОХИРГОО ---
const cfg = {
    apiKey: "AIzaSyAIG54jlntVl7b5Y4MHR2IxDNHA7Xp3KeE",
    authDomain: "talst-act.firebaseapp.com",
    projectId: "talst-act",
    storageBucket: "talst-act.firebasestorage.app",
    messagingSenderId: "306368853099",
    appId: "1:306368853099:web:c94fa0ae7f9a02a3f72d2e"
};

const EJS_SVC = 'service_op473um';
const EJS_TPL = 'template_k05csyl';
emailjs.init('Bck-y_wlCHwjWp7pA');

const CHAIN = [
    { name: 'Координатор', email: 'unumunkh@talstgroup.mn' },
    { name: 'Инженер', email: 'unursaikhan@talstgroup.mn' },
    { name: 'Захирал', email: 'enkhtuul@talstgroup.mn' },
    { name: 'Нягтлан', email: 'naranzul@talstgroup.mn' },
];

const ROLES = {
    'unumunkh@talstgroup.mn': 'Координатор',
    'unursaikhan@talstgroup.mn': 'Инженер',
    'enkhtuul@talstgroup.mn': 'Захирал',
    'naranzul@talstgroup.mn': 'Нягтлан',
    // ★ ШИНЭ: Хяналтын erkh (read-only + comment)
    'ulziisaikhan@talstgroup.mn': 'CEO',
    'narankhuu@talstgroup.mn': 'CFO',
};

// ★ ШИНЭ: Хяналтын role-ийн жагсаалт (read-only)
const VIEWER_ROLES = ['CEO', 'CFO'];

function isViewer(r) { return VIEWER_ROLES.includes(r); }

const ROLE_COLORS = {
    'Координатор': '#e74c3c', 'Инженер': '#3498db',
    'Захирал': '#8e44ad', 'Нягтлан': '#27ae60', 'Гүйцэтгэгч': '#e67e22',
    'CEO': '#0f172a', 'CFO': '#1e293b',
};

// ★ ШИНЭ: Avatar background gradient (Актууд табын role card-уудтай ижил тон)
const ROLE_AVATAR_BG = {
    'Координатор': 'linear-gradient(135deg, #ef4444, #dc2626)',
    'Инженер':     'linear-gradient(135deg, #3b82f6, #2563eb)',
    'Захирал':     'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    'Нягтлан':     'linear-gradient(135deg, #10b981, #059669)',
    'Гүйцэтгэгч':  'linear-gradient(135deg, #f59e0b, #d97706)',
    // CEO / CFO — хар, executive өнгө
    'CEO':         'linear-gradient(135deg, #1e293b, #0f172a)',
    'CFO':         'linear-gradient(135deg, #334155, #1e293b)',
};

const RSTEP = { 'Координатор': 0, 'Инженер': 1, 'Захирал': 2, 'Нягтлан': 3 };
const SN = ['Координатор', 'Инженер', 'Захирал', 'Нягтлан'];
const SE = ['unumunkh@talstgroup.mn', 'unursaikhan@talstgroup.mn', 'enkhtuul@talstgroup.mn', 'naranzul@talstgroup.mn'];

const EIGHT_HOURS = 8 * 60 * 60 * 1000;

// --- FIREBASE INIT ---
const fapp = initializeApp(cfg);
const auth = getAuth(fapp);
const db = getFirestore(fapp);

let cu = null, role = 'Гүйцэтгэгч', acts = [], prev = 2, ctab = 0, unsub = null;
let pdfDataList = [];
let cachedFont = null;
let autoDeleteInterval = null;
let rejectedCountdownInterval = null; // ★ ШИНЭ: Countdown timer-д

// Modal state
let currentPartialActId = null;
let currentRemainingActId = null;
let remainingPdfList = [];

const e = id => document.getElementById(id);

// --- ТУСЛАХ ФУНКЦҮҮД ---
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function ts() { return new Date().toLocaleString('mn-MN') }
function gh() { return 'sha256:' + Math.random().toString(36).substr(2, 8) + '...' + Math.random().toString(36).substr(2, 4) }

// Прогресс хувь — partial болон remaining-ийг бас тооцно
function pct(a) {
    if (a.status === 'done') return 100;
    if (a.status === 'partial_done') return a.approvedPercent || 100;
    if (a.status === 'partial') return Math.round(((a.step || 0) / 4 * 100));
    if (a.status === 'remaining') return 0;
    return Math.round((a.step || 0) / 4 * 100);
}

// Badge класс
function bc(a) {
    if (a.status === 'done') return 'bd';
    if (a.status === 'partial_done') return 'bpartial-done';
    if (a.status === 'rejected') return 'br';
    if (a.status === 'partial') return 'bpartial';
    if (a.status === 'remaining') return 'bremaining';
    const s = a.step || 0;
    return ['bw', 'bp', 'b1', 'b2', 'b3'][s] || 'bp';
}

// Badge текст
function bt(a) {
    if (a.status === 'done') {
        if (a.completedViaRemaining) return '✓ 100% дууссан (Нэгдсэн)';
        return '✓ Батлагдсан';
    }
    if (a.status === 'partial_done') return '⚠ Хэсэгчлэн дууссан (' + (a.approvedPercent || 0) + '%)';
    if (a.status === 'rejected') return '✕ Буцаагдсан';
    if (a.status === 'partial') return '⚠ Хэсэгчлэн (' + (a.approvedPercent || 0) + '%) · ' + SN[a.step || 0];
    if (a.status === 'remaining') return '⏳ Үлдэгдэл гүйцээх';
    return SN[a.step || 0] + ' хүлээж байна';
}

function fmtN(n) { return parseInt(n || 0).toLocaleString('mn-MN') }

function todayYMD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${dd}`;
}

window.fmtAmt = () => { const v = e('fa').value; e('amtFmt').textContent = v && !isNaN(v) ? '₮ ' + parseInt(v).toLocaleString() : ''; };

window.addPdfs = async (input) => {
    const files = Array.from(input.files); if (!files.length) return;
    e('compInfo').textContent = 'PDF боловсруулж байна...';
    for (const f of files) {
        if (f.type !== 'application/pdf') { toast('Зөвхөн PDF файл сонгоно уу: ' + f.name, 'err'); continue; }
        pdfDataList.push(await readPdfAsBase64(f));
    }
    renderPdfList();
    const total = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    e('compInfo').textContent = `${pdfDataList.length} PDF · нийт ~${total}KB`;
    input.value = '';
};

window.rmPdf = (i) => {
    pdfDataList.splice(i, 1); renderPdfList();
    const total = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    e('compInfo').textContent = pdfDataList.length ? `${pdfDataList.length} PDF · ~${total}KB` : '';
};

// ★ REMAINING MODAL — PDF upload
window.addRemainingPdfs = async (input) => {
    const files = Array.from(input.files); if (!files.length) return;
    for (const f of files) {
        if (f.type !== 'application/pdf') { toast('Зөвхөн PDF файл: ' + f.name, 'err'); continue; }
        remainingPdfList.push(await readPdfAsBase64(f));
    }
    renderRemainingPdfList();
    input.value = '';
};

window.rmRemainingPdf = (i) => {
    remainingPdfList.splice(i, 1);
    renderRemainingPdfList();
};

function renderRemainingPdfList() {
    e('rmPdfList').innerHTML = remainingPdfList.map((d, i) => `
    <div class="pdf-item">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmRemainingPdf(${i})">✕</div>
    </div>`).join('');
}

// ★★★ GOOGLE SIGN-IN ★★★
window.signInGoogle = async () => {
    try {
        if (isNative) {
            const FirebaseAuthentication = window.Capacitor?.Plugins?.FirebaseAuthentication;
            if (!FirebaseAuthentication) throw new Error('FirebaseAuthentication plugin олдсонгүй');
            const result = await FirebaseAuthentication.signInWithGoogle();
            const idToken = result?.credential?.idToken;
            const accessToken = result?.credential?.accessToken;
            if (idToken) {
                const credential = GoogleAuthProvider.credential(idToken, accessToken);
                const fbResult = await signInWithCredential(auth, credential);
                if (fbResult.user) {
                    setTimeout(() => {
                        if (e('loginPage')?.style.display !== 'none') location.reload();
                    }, 1000);
                }
            } else {
                toast('Google-аас хариу ирсэнгүй', 'err');
            }
        } else {
            await signInWithPopup(auth, new GoogleAuthProvider());
        }
    } catch (err) {
        console.error('SIGN-IN ERROR:', err);
        toast('Алдаа: ' + (err?.message || 'Тодорхойгүй'), 'err');
    }
};

window.doSignOut = async () => {
    if (!confirm('Гарах уу?')) return;
    if (unsub) unsub();
    if (autoDeleteInterval) { clearInterval(autoDeleteInterval); autoDeleteInterval = null; }
    if (rejectedCountdownInterval) { clearInterval(rejectedCountdownInterval); rejectedCountdownInterval = null; }
    try {
        if (isNative && window.Capacitor?.Plugins?.FirebaseAuthentication) {
            await window.Capacitor.Plugins.FirebaseAuthentication.signOut();
        }
        await fbOut(auth);
    } catch (err) { console.error('Sign-out error:', err); }
};

window.go = go; window.bk = bk; window.opd = opd;
window.submitAct = submitAct; window.approve = approve; window.reject = reject;
window.downloadFinalPdf = downloadFinalPdf;

// ★ ШИНЭ FUNCTIONS — partial approval & remaining
window.openPartialModal = openPartialModal;
window.closePartialModal = closePartialModal;
window.updatePartialPreview = updatePartialPreview;
window.confirmPartialApprove = confirmPartialApprove;
window.openRemainingModal = openRemainingModal;
window.closeRemainingModal = closeRemainingModal;
window.confirmSubmitRemaining = confirmSubmitRemaining;
// ★ ШИНЭ: CEO/CFO коммент бичих
window.submitComment = submitComment;

function readPdfAsBase64(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = ev => resolve({ name: file.name, base64: ev.target.result, sizeKb: Math.round(file.size / 1024) });
        reader.readAsDataURL(file);
    });
}

function renderPdfList() {
    e('pdfList').innerHTML = pdfDataList.map((d, i) => `
    <div class="pdf-item">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmPdf(${i})">✕</div>
    </div>`).join('');
}

function toast(m, t = 'ok') {
    const el = e('toast'); el.textContent = m;
    el.className = 'toast ' + (t === 'ok' ? 'tok' : 'terr');
    el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 4000);
}

// ════════════════════════════════════════════════════════════
// ★★★ EMAIL SENDING — Шинэчилсэн ★★★
// ════════════════════════════════════════════════════════════
// Үндсэн илгээх функц (батлах chain-д явах энгийн email)
function sendMail(toEmail, toName, act, fromName, opts = {}) {
    const params = {
        to_email: toEmail,
        to_name: toName,
        company: act.company || '',
        contract: act.contract || '',
        work: act.work || '',
        amount: fmtN(act.amount),
        from_name: fromName,
        email: toEmail,
        name: fromName,
        // Шинэ нэмэлт талбарууд (template-д ашиглагдана)
        subject: opts.subject || `Шинэ акт: ${act.actId || ''}`,
        message: opts.message || `${fromName} танд акт илгээлээ. Батлуулна уу.`,
        notification_type: opts.type || 'approval_request',
        act_id: act.actId || '',
        reason: opts.reason || '',
        approved_percent: opts.approvedPercent || '',
        approved_amount: opts.approvedAmount || '',
        remaining_amount: opts.remainingAmount || '',
    };
    return emailjs.send(EJS_SVC, EJS_TPL, params)
        .then(r => console.log('✅ Email sent:', r))
        .catch(err => { console.error('❌ Email error:', err); throw err; });
}

// ★ ШИНЭ: Гүйцэтгэгчид буцаах мэдэгдэл
function sendRejectionMail(act, reason, rejectorName, rejectorRole) {
    if (!act.submittedBy) return Promise.resolve();
    const subject = `❌ Таны акт буцаагдлаа: ${act.actId}`;
    const message = `Хүндэт ${act.submittedByName || 'гүйцэтгэгч'},\n\n`
        + `Таны илгээсэн акт буцаагдлаа.\n\n`
        + `АКТ: ${act.actId}\n`
        + `Компани: ${act.company}\n`
        + `Гэрээ: ${act.contract}\n`
        + `Ажил: ${act.work}\n`
        + `Дүн: ₮${fmtN(act.amount)}\n\n`
        + `Буцаасан: ${rejectorName} (${rejectorRole})\n`
        + `ШАЛТГААН: ${reason}\n\n`
        + `Та шалтгааныг нягталж дахин илгээнэ үү.`;
    return sendMail(act.submittedBy, act.submittedByName || 'Гүйцэтгэгч', act, rejectorName, {
        subject,
        message,
        type: 'rejection',
        reason: reason,
    });
}

// ★ ШИНЭ: Гүйцэтгэгчид хэсэгчлэн батласан мэдэгдэл
function sendPartialMail(act, approvedPct, approvedAmt, remainingAmt, reason, coordinatorName) {
    if (!act.submittedBy) return Promise.resolve();
    const subject = `⚠ Таны акт хэсэгчлэн батлагдлаа: ${act.actId} (${approvedPct}%)`;
    const message = `Хүндэт ${act.submittedByName || 'гүйцэтгэгч'},\n\n`
        + `Таны илгээсэн акт ХЭСЭГЧЛЭН батлагдлаа.\n\n`
        + `АКТ: ${act.actId}\n`
        + `Компани: ${act.company}\n`
        + `Гэрээ: ${act.contract}\n`
        + `Ажил: ${act.work}\n`
        + `Анхны нийт дүн: ₮${fmtN(act.amount)}\n\n`
        + `═══════════════════════════════════\n`
        + `✓ БАТЛАГДСАН: ${approvedPct}% (₮${fmtN(approvedAmt)})\n`
        + `⏳ ҮЛДЭГДЭЛ: ${100 - approvedPct}% (₮${fmtN(remainingAmt)})\n`
        + `═══════════════════════════════════\n\n`
        + `ХЭСЭГЧЛЭН БАТЛАСАН ШАЛТГААН:\n${reason}\n\n`
        + `Координатор: ${coordinatorName}\n\n`
        + `Үлдэгдэл ажлаа гүйцээгээд шинэ актаар дахин илгээнэ үү. `
        + `"Илгээх" таб-д "Үлдэгдэл гүйцээх" хэсэг үүссэн байгаа.`;
    return sendMail(act.submittedBy, act.submittedByName || 'Гүйцэтгэгч', act, coordinatorName, {
        subject,
        message,
        type: 'partial_approval',
        reason: reason,
        approvedPercent: approvedPct + '%',
        approvedAmount: '₮' + fmtN(approvedAmt),
        remainingAmount: '₮' + fmtN(remainingAmt),
    });
}

// ★ ШИНЭ: Avatar дотор үсгийн оронд үүрэгт тохирсон icon
const ROLE_AVATAR_ICONS = {
    'Координатор': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M3 21v-2a7 7 0 0 1 14 0v2"></path></svg>',
    'Инженер': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    'Захирал': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 11l-3 3-3-3"></path><path d="M19 14V6"></path></svg>',
    'Нягтлан': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',
    'Гүйцэтгэгч': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
    // ★ ШИНЭ: CEO = Crown (титэм), CFO = Briefcase (цүнх)
    'CEO': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"></path></svg>',
    'CFO': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
};

onAuthStateChanged(auth, u => {
    if (u) {
        cu = u; role = ROLES[u.email] || 'Гүйцэтгэгч';
        e('loginPage').style.display = 'none'; e('appPage').style.display = 'block';
        // Үсэг биш, үүргийн icon оруулах
        e('uav').innerHTML = ROLE_AVATAR_ICONS[role] || ROLE_AVATAR_ICONS['Гүйцэтгэгч'];
        e('uav').style.background = ROLE_AVATAR_BG[role] || 'linear-gradient(135deg, #6b7280, #4b5563)';
        e('uav').style.color = '#fff';
        const SHORT_NAMES = {
            'unumunkh@talstgroup.mn': 'Б.Өнөмөнх',
            'unursaikhan@talstgroup.mn': 'Инженер',
            'enkhtuul@talstgroup.mn': 'Захирал',
            'naranzul@talstgroup.mn': 'Нягтлан',
            'ulziisaikhan@talstgroup.mn': 'CEO',
            'narankhuu@talstgroup.mn': 'CFO',
        };
        e('uname').textContent = SHORT_NAMES[u.email] || u.displayName || u.email;
        e('urole').textContent = role;
        e('aplbl').textContent = role + ' горимд батлах актууд';

        // ★ ШИНЭ: CEO/CFO үед Илгээх таб болон Батлах таб нуух
        applyViewerMode();

        listen();
        startAutoDeleteRejected();
        startRejectedCountdownRefresh();
    } else {
        cu = null; e('loginPage').style.display = 'flex'; e('appPage').style.display = 'none';
        if (unsub) { unsub(); unsub = null; }
        if (autoDeleteInterval) { clearInterval(autoDeleteInterval); autoDeleteInterval = null; }
        if (rejectedCountdownInterval) { clearInterval(rejectedCountdownInterval); rejectedCountdownInterval = null; }
    }
});

function listen() {
    const q = query(collection(db, 'acts'), orderBy('createdAt', 'desc'));
    unsub = onSnapshot(q, snap => {
        acts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cleanupExpiredRejected();
        if (ctab === 0) rA0();
        if (ctab === 1) rA();
        if (ctab === 2) rL();
        if (ctab === 3) rD();
        if (e('pd').style.display !== 'none') {
            const idx = parseInt(e('dc').dataset.idx || '-1');
            if (idx >= 0) e('dc').innerHTML = detH(idx);
        }
    });
}

async function cleanupExpiredRejected() {
    const now = Date.now();
    const expired = acts.filter(a => {
        if (a.status !== 'rejected') return false;
        const rejTime = a.rejectedAt ? (a.rejectedAt.toMillis?.() || a.rejectedAt) : null;
        if (!rejTime) return true;
        return (now - rejTime) > EIGHT_HOURS;
    });
    if (!expired.length) return;
    for (const a of expired) {
        try {
            await deleteDoc(doc(db, 'acts', a.id));
            console.log('🗑 Устгасан:', a.actId);
        } catch (err) { console.error('Устгах алдаа:', err); }
    }
}

function startAutoDeleteRejected() {
    if (autoDeleteInterval) clearInterval(autoDeleteInterval);
    autoDeleteInterval = setInterval(cleanupExpiredRejected, 5 * 60 * 1000);
}

// ★ ШИНЭ: Буцаагдсан карт дээрх countdown timer-ыг 30 секунд тутамд шинэчлэх
function startRejectedCountdownRefresh() {
    if (rejectedCountdownInterval) clearInterval(rejectedCountdownInterval);
    rejectedCountdownInterval = setInterval(() => {
        // Зөвхөн "Актууд" таб дээр + буцаагдсан role идэвхтэй үед шинэчлэх
        if (ctab === 2) {
            // Хэрвээ буцаагдсан role card сонгогдсон бол body-г refresh хийнэ
            if (listFilter === 'rejected') renderListBody();
            // Эсвэл home screen дээр бол card-ийн тоог шинэчилнэ
            else if (!listFilter) renderListBody();
        }
    }, 30 * 1000); // 30 секунд тутамд
}

function go(n) {
    // ★ ШИНЭ: CEO/CFO нь зөвхөн Актууд (2) болон Дашборд (3) хардаг
    if (isViewer(role) && (n === 0 || n === 1)) {
        n = 2; // автоматаар Актууд таб руу шилжих
    }
    [0, 1, 2, 3].forEach(i => { e('p' + i).style.display = 'none'; e('tb' + i).classList.remove('on') });
    e('pd').style.display = 'none';
    e('p' + n).style.display = 'block'; e('tb' + n).classList.add('on'); ctab = n;
    if (n === 0) rA0();
    if (n === 1) rA();
    if (n === 2) rL();
    if (n === 3) rD();
}

function bk() {
    e('pd').style.display = 'none';
    e('p' + prev).style.display = 'block'; e('tb' + prev).classList.add('on'); ctab = prev;
}

function opd(idx, from) {
    prev = from;
    [0, 1, 2, 3].forEach(i => { e('p' + i).style.display = 'none'; e('tb' + i).classList.remove('on') });
    e('pd').style.display = 'block'; e('dc').dataset.idx = idx; e('dc').innerHTML = detH(idx);
}

// ★ ШИНЭ: CEO/CFO үед UI-г hide/show хийх
function applyViewerMode() {
    if (isViewer(role)) {
        // Илгээх (0) болон Батлах (1) таб-ыг нуух
        const tab0 = e('tb0'); const tab1 = e('tb1');
        if (tab0) tab0.style.display = 'none';
        if (tab1) tab1.style.display = 'none';
        // CEO/CFO эхлээд Актууд (2) таб дээр нээгдэнэ
        go(2);
    } else {
        // Бусад role-уудад бүх таб харагдана
        const tab0 = e('tb0'); const tab1 = e('tb1');
        if (tab0) tab0.style.display = '';
        if (tab1) tab1.style.display = '';
    }
}

function rA0() {
    if (role !== 'Гүйцэтгэгч') return;
    const myRemaining = acts.filter(a =>
        a.status === 'remaining' &&
        a.submittedBy === cu.email
    );
    let existing = e('p0RemainingSection');
    if (existing) existing.remove();
    if (myRemaining.length) {
        const html = `
            <div id="p0RemainingSection" style="margin-top:14px">
                <div class="remaining-section-label">⏳ Үлдэгдэл гүйцээх (${myRemaining.length})</div>
                ${myRemaining.map(a => liHRemainingForExecutor(a, acts.indexOf(a))).join('')}
            </div>`;
        e('p0').insertAdjacentHTML('beforeend', html);
    }
}

function liHRemainingForExecutor(a, idx) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li remaining" onclick="opd(${idx},0)">
        <div class="li-top">
            <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
            <span class="badge bremaining">⏳ Үлдэгдэл</span>
        </div>
        <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
        ${a.partialReason ? `<div class="remaining-reason">${esc(a.partialReason)}</div>` : ''}
        <button class="bcomplete" onclick="event.stopPropagation(); openRemainingModal('${a.id}')">+ Гүйцээх ажил илгээх</button>
    </div>`;
}

async function submitAct() {
    const c = e('fc').value.trim(), g = e('fg').value.trim(), w = e('fw').value.trim(), a = e('fa').value.trim();
    if (!c || !g || !w || !a) { toast('Компани, гэрээ, ажил, дүн заавал!', 'err'); return; }
    const totalKb = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    if (totalKb > 2048) { toast(`PDF нийт ${totalKb}KB — 2MB-аас бага байх ёстой.`, 'err'); return; }
    const btn = e('sbtn'); btn.disabled = true; btn.textContent = 'Илгээж байна...';
    e('progWrap').style.display = 'block'; e('progText').style.display = 'block';
    e('progBar').style.width = '20%'; e('progText').textContent = 'Мэдээлэл бэлдэж байна...';
    const aid = 'АКТ-' + new Date().getFullYear() + '-' + String(Date.now()).substr(-4);
    try {
        e('progBar').style.width = '60%'; e('progText').textContent = 'Firestore-д хадгалж байна...';
        const actData = {
            actId: aid, date: todayYMD(),
            company: c, contract: g, work: w, dateFrom: e('fd1').value, dateTo: e('fd2').value, amount: a,
            pdfs: pdfDataList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb })),
            pdfCount: pdfDataList.length, step: 0, status: 'pending',
            submittedBy: cu.email, submittedByName: cu.displayName || cu.email,
            createdAt: serverTimestamp(),
            evs: [{
                type: 'submit', who: cu.displayName || cu.email, whoEmail: cu.email,
                title: 'Акт илгээсэн',
                detail: c + ' · ' + g + ' · ₮' + fmtN(a) + (pdfDataList.length ? ` · ${pdfDataList.length} PDF (~${totalKb}KB)` : ' · Баримтгүй'),
                time: ts(), hash: gh()
            }]
        };
        await addDoc(collection(db, 'acts'), actData);
        e('progBar').style.width = '85%'; e('progText').textContent = 'Email илгээж байна...';
        await sendMail(CHAIN[0].email, CHAIN[0].name, actData, cu.displayName || cu.email);
        e('progBar').style.width = '100%';
        toast('✅ Акт илгээгдлээ! Координаторт email очлоо.');
        ['fc', 'fg', 'fw', 'fd1', 'fd2', 'fa'].forEach(id => e(id).value = '');
        pdfDataList = []; e('pdfList').innerHTML = ''; e('compInfo').textContent = ''; e('amtFmt').textContent = '';
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); console.error(err); }
    btn.disabled = false; btn.textContent = 'Акт илгээх';
    setTimeout(() => { e('progWrap').style.display = 'none'; e('progText').style.display = 'none'; e('progBar').style.width = '0%'; }, 1500);
}

async function approve(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a || (a.status !== 'pending' && a.status !== 'partial')) { toast('Батлах боломжгүй!', 'err'); return; }
    if (RSTEP[role] !== a.step) { toast('Та энэ актыг батлах эрхгүй!', 'err'); return; }

    const isPartialAct = a.status === 'partial' || a.approvedPercent;
    const isRemainingAct = !!a.parentDocId;

    const newEvs = [...(a.evs || []), {
        type: 'approve', who: cu.displayName || cu.email, whoEmail: cu.email,
        title: role + ' батлав ✓',
        detail: cu.email + ' · Google нэвтрэлтээр баталгаажсан'
            + (isPartialAct ? ` · Хэсэгчилсэн дүн ₮${fmtN(a.approvedAmount || a.amount)} (${a.approvedPercent}%)` : '')
            + (isRemainingAct ? ` · Үлдэгдэл ₮${fmtN(a.amount)} (${100 - (a.parentApprovedPercent || 0)}%)` : ''),
        time: ts(), hash: gh()
    }];
    const ns = (a.step || 0) + 1;
    const finishedAllSteps = ns >= 4;
    const upd = { step: ns, evs: newEvs };
    let finalEvs = newEvs;

    if (finishedAllSteps) {
        if (isPartialAct) {
            upd.status = 'partial_done';
            finalEvs = [...newEvs, {
                type: 'partial_done', who: 'Систем',
                title: `⚠ Хэсэгчлэн дууссан (${a.approvedPercent}%)`,
                detail: `${a.approvedPercent}% (₮${fmtN(a.approvedAmount)}) бүрэн батлагдсан · Үлдэгдэл (${100 - a.approvedPercent}%) гүйцээгдэхийг хүлээж байна`,
                time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;
        } else if (isRemainingAct) {
            upd.status = 'done';
            finalEvs = [...newEvs, {
                type: 'done', who: 'Систем',
                title: '🎉 Үлдэгдэл бүрэн батлагдсан',
                detail: `Үлдэгдэл ажил гүйцээгдэж бүрэн батлагдлаа · Эх акт ${a.parentActId} 100% болж дууссан`,
                time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;

            const parentAct = acts.find(x => x.id === a.parentDocId);
            if (parentAct && parentAct.status === 'partial_done') {
                const parentEvs = [...(parentAct.evs || []), {
                    type: 'merged_done', who: 'Систем',
                    title: '🎉 100% бүрэн дууссан (Хэсэгчлэн + Үлдэгдэл)',
                    detail: `Үлдэгдэл акт ${a.actId} (₮${fmtN(a.amount)}) гүйцээгдэн бүрэн батлагдлаа · Нийт дүн ₮${fmtN(parentAct.amount)} 100% батлагдсан`,
                    time: ts(), hash: gh()
                }];
                try {
                    await updateDoc(doc(db, 'acts', a.parentDocId), {
                        status: 'done',
                        completedViaRemaining: true,
                        remainingActId: a.actId,
                        evs: parentEvs
                    });
                } catch (e) { console.error('Parent update error:', e); }
            }
        } else {
            upd.status = 'done';
            finalEvs = [...newEvs, {
                type: 'done', who: 'Систем', title: '🎉 Бүрэн батлагдсан',
                detail: 'Нягтланд мэдэгдэл очлоо · Гүйлгээ хийх боломжтой', time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;
        }
    }

    try {
        await updateDoc(doc(db, 'acts', docId), upd);
        if (finishedAllSteps) {
            await sendMail(CHAIN[3].email, CHAIN[3].name, a, cu.displayName || cu.email);

            if (isPartialAct) {
                toast(`⚠ Хэсэгчлэн дууслаа (${a.approvedPercent}%)! Үлдэгдэл хүлээгдэж байна.`);
            } else if (isRemainingAct) {
                toast('🎉 Үлдэгдэл батлагдан акт 100% болж дууслаа!');
                try {
                    const parentAct = acts.find(x => x.id === a.parentDocId);
                    if (parentAct) {
                        const remainingEvents = (a.evs || []).map(ev => ({
                            ...ev,
                            title: '⏳ ' + (ev.title || ''),
                            detail: '[Үлдэгдэл цикл] ' + (ev.detail || '')
                        }));

                        const mergedEvents = [
                            ...(parentAct.evs || []),
                            {
                                type: 'cycle_separator', who: 'Систем',
                                title: '═══════ ҮЛДЭГДЭЛ ЦИКЛ ЭХЭЛЛЭЭ ═══════',
                                detail: `Үлдэгдэл акт: ${a.actId} · ₮${fmtN(a.amount)}`,
                                time: ts(), hash: gh()
                            },
                            ...remainingEvents
                        ];

                        const mergedAct = {
                            ...parentAct,
                            status: 'done',
                            completedViaRemaining: true,
                            remainingActId: a.actId,
                            pdfs: [...(parentAct.pdfs || []), ...(a.pdfs || [])],
                            pdfCount: (parentAct.pdfCount || 0) + (a.pdfCount || 0),
                            evs: mergedEvents
                        };
                        await generateFinalPdf(mergedAct);
                        toast('✅ 100% НЭГДСЭН PDF бэлэн!');
                    }
                } catch (pdfErr) {
                    console.error('Merged PDF алдаа:', pdfErr);
                }
            } else {
                toast('🎉 Бүрэн батлагдлаа! Final PDF бэлдэж байна...');
                try {
                    const actWithFinal = { ...a, ...upd, evs: finalEvs };
                    await generateFinalPdf(actWithFinal);
                    toast('✅ Final PDF бэлэн!');
                } catch (pdfErr) {
                    console.error('Final PDF алдаа:', pdfErr);
                    toast('⚠️ PDF алдаа: ' + pdfErr.message, 'err');
                }
            }
        } else {
            await sendMail(CHAIN[ns].email, CHAIN[ns].name, a, cu.displayName || cu.email);
            toast('✅ ' + SN[ns] + ' уруу илгээгдлээ.');
        }
        rA();
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); }
}

// ★★★ REJECT — Гүйцэтгэгчид мэдэгдэл явуулах нэмэлттэй ★★★
async function reject(docId) {
    const a = acts.find(x => x.id === docId); if (!a) return;
    const reason = prompt('Буцаасан шалтгаан:') || 'Тодруулгатай байна';
    const newEvs = [...(a.evs || []), {
        type: 'reject', who: cu.displayName || cu.email, whoEmail: cu.email,
        title: role + ' буцаав ✕', detail: 'Шалтгаан: ' + reason, time: ts(), hash: gh()
    }];
    try {
        await updateDoc(doc(db, 'acts', docId), { status: 'rejected', evs: newEvs, rejectedAt: serverTimestamp() });
        toast('❌ Акт буцаагдлаа.');

        // ★ ШИНЭ: Гүйцэтгэгчид буцаасан шалтгааны хамт email явуулах
        try {
            await sendRejectionMail(a, reason, cu.displayName || cu.email, role);
            console.log('✅ Rejection email явуулсан →', a.submittedBy);
        } catch (mailErr) {
            console.error('❌ Rejection email алдаа:', mailErr);
            // Email алдаа гарсан ч UI-г өөрчлөхгүй (акт аль хэдийн буцаагдсан)
        }
        bk();
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); }
}

// ════════════════════════════════════════════════════════════
// ★★★ ХЭСЭГЧЛЭН БАТЛАХ MODAL — PARTIAL APPROVAL ★★★
// ════════════════════════════════════════════════════════════

function openPartialModal(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (role !== 'Координатор') { toast('Зөвхөн Координатор хэсэгчлэн батлах эрхтэй', 'err'); return; }
    if (a.status !== 'pending' || (a.step || 0) !== 0) { toast('Зөвхөн анхны шалгалтын үед хэсэгчлэн батлах боломжтой', 'err'); return; }

    currentPartialActId = docId;
    e('pmActId').textContent = a.actId;
    e('pmOriginalAmt').textContent = '₮' + fmtN(a.amount);
    e('pmSlider').value = 85;
    e('pmReason').value = '';
    updatePartialPreview();
    e('partialModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closePartialModal() {
    e('partialModal').classList.remove('open');
    document.body.style.overflow = '';
    currentPartialActId = null;
}

function updatePartialPreview() {
    const a = acts.find(x => x.id === currentPartialActId);
    if (!a) return;
    const pct = parseInt(e('pmSlider').value);
    const total = parseInt(a.amount);
    const approved = Math.round(total * pct / 100);
    const remaining = total - approved;

    e('pmPercentVal').textContent = pct + '%';
    e('pmApprovedAmt').textContent = '₮' + fmtN(approved);
    e('pmApprovedPct').textContent = pct + '% батлагдана';
    e('pmRemainingAmt').textContent = '₮' + fmtN(remaining);
    e('pmRemainingPct').textContent = (100 - pct) + '% гүйцэтгэгчид буцна';
    e('pmInfoApproved').textContent = '₮' + fmtN(approved);
    e('pmInfoRemaining').textContent = '₮' + fmtN(remaining);

    const slider = e('pmSlider');
    slider.style.background = `linear-gradient(to right, #f59e0b 0%, #f59e0b ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`;
}

async function confirmPartialApprove() {
    const a = acts.find(x => x.id === currentPartialActId);
    if (!a) return;
    const pct = parseInt(e('pmSlider').value);
    const reason = e('pmReason').value.trim();

    if (!reason) {
        toast('Шалтгаан заавал бичих ёстой!', 'err');
        e('pmReason').focus();
        return;
    }
    if (pct < 1 || pct > 99) {
        toast('Хувь 1-99 хооронд байх ёстой', 'err');
        return;
    }

    const total = parseInt(a.amount);
    const approvedAmount = Math.round(total * pct / 100);
    const remainingAmount = total - approvedAmount;

    const btn = e('pmConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Боловсруулж байна...';

    try {
        const newEvs = [...(a.evs || []), {
            type: 'partial', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: 'Координатор хэсэгчлэн батлав ⚠',
            detail: `${pct}% батлагдсан · ₮${fmtN(approvedAmount)} → Инженер уруу · ₮${fmtN(remainingAmount)} гүйцэтгэгчид буцсан · Шалтгаан: ${reason}`,
            time: ts(), hash: gh()
        }];

        const partialUpd = {
            status: 'partial',
            step: 1,
            approvedPercent: pct,
            approvedAmount: approvedAmount,
            partialReason: reason,
            evs: newEvs
        };
        await updateDoc(doc(db, 'acts', currentPartialActId), partialUpd);

        const remainingActId = a.actId + '-Б';
        const remainingActData = {
            actId: remainingActId,
            date: todayYMD(),
            company: a.company,
            contract: a.contract,
            work: a.work + ' (Үлдэгдэл ' + (100 - pct) + '%)',
            dateFrom: a.dateFrom || '',
            dateTo: a.dateTo || '',
            amount: String(remainingAmount),
            originalAmount: String(total),
            parentActId: a.actId,
            parentDocId: currentPartialActId,
            parentApprovedPercent: pct,
            remainingPercent: 100 - pct,
            partialReason: reason,
            pdfs: [],
            pdfCount: 0,
            step: 0,
            status: 'remaining',
            submittedBy: a.submittedBy,
            submittedByName: a.submittedByName,
            createdAt: serverTimestamp(),
            evs: [{
                type: 'remaining_created', who: cu.displayName || cu.email, whoEmail: cu.email,
                title: '⏳ Үлдэгдэл үүсгэв (' + (100 - pct) + '%)',
                detail: `Эх акт: ${a.actId} · Үлдэгдэл дүн: ₮${fmtN(remainingAmount)} (${100 - pct}%) · Шалтгаан: ${reason}`,
                time: ts(), hash: gh()
            }]
        };
        await addDoc(collection(db, 'acts'), remainingActData);

        // Инженерт мэдэгдэх
        try {
            await sendMail(CHAIN[1].email, CHAIN[1].name,
                { ...a, amount: String(approvedAmount) },
                cu.displayName || cu.email);
        } catch (e) { console.error('Engineer email:', e); }

        // ★ ШИНЭ: Гүйцэтгэгчид хэсэгчлэн батласан мэдэгдэл (хувь, дүн, шалтгааны хамт)
        try {
            await sendPartialMail(a, pct, approvedAmount, remainingAmount, reason, cu.displayName || cu.email);
            console.log('✅ Partial-approval email явуулсан →', a.submittedBy);
        } catch (mailErr) {
            console.error('❌ Partial email алдаа:', mailErr);
        }

        toast('✅ Хэсэгчлэн батлагдлаа! ' + pct + '% Инженер уруу, ' + (100 - pct) + '% гүйцэтгэгчид буцлаа.');
        closePartialModal();
        bk();
    } catch (err) {
        console.error('Partial approve error:', err);
        toast('Алдаа: ' + err.message, 'err');
    }
    btn.disabled = false;
    btn.textContent = '✓ Хэсэгчлэн батлах';
}

// ════════════════════════════════════════════════════════════
// ★★★ ҮЛДЭГДЭЛ ГҮЙЦЭЭХ MODAL — REMAINING SUBMIT ★★★
// ════════════════════════════════════════════════════════════

function openRemainingModal(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (a.status !== 'remaining') { toast('Энэ акт үлдэгдэл бус', 'err'); return; }
    if (a.submittedBy !== cu.email) { toast('Зөвхөн өөрийн актыг гүйцээх боломжтой', 'err'); return; }

    currentRemainingActId = docId;
    remainingPdfList = [];
    e('rmActId').textContent = a.actId;
    e('rmAmount').textContent = '₮' + fmtN(a.amount);
    e('rmPrevReason').textContent = a.partialReason || '—';
    e('rmCompletionNote').value = '';
    e('rmPdfList').innerHTML = '';
    e('remainingModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeRemainingModal() {
    e('remainingModal').classList.remove('open');
    document.body.style.overflow = '';
    currentRemainingActId = null;
    remainingPdfList = [];
}

async function confirmSubmitRemaining() {
    const a = acts.find(x => x.id === currentRemainingActId);
    if (!a) return;
    const note = e('rmCompletionNote').value.trim();
    if (!note) {
        toast('Гүйцээсэн ажлын тайлбар заавал бичнэ үү', 'err');
        e('rmCompletionNote').focus();
        return;
    }

    const totalKb = remainingPdfList.reduce((s, x) => s + x.sizeKb, 0);
    if (totalKb > 2048) { toast(`PDF ${totalKb}KB — 2MB-аас бага байх ёстой`, 'err'); return; }

    const btn = e('rmConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байна...';

    try {
        const newEvs = [...(a.evs || []), {
            type: 'submit', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: '📤 Гүйцээсэн ажил илгээв',
            detail: note + (remainingPdfList.length ? ` · ${remainingPdfList.length} PDF (~${totalKb}KB)` : ' · Баримтгүй'),
            time: ts(), hash: gh()
        }];

        const upd = {
            status: 'pending',
            step: 0,
            pdfs: remainingPdfList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb })),
            pdfCount: remainingPdfList.length,
            completionNote: note,
            submittedAt: serverTimestamp(),
            evs: newEvs
        };
        await updateDoc(doc(db, 'acts', currentRemainingActId), upd);

        try {
            await sendMail(CHAIN[0].email, CHAIN[0].name, a, cu.displayName || cu.email);
        } catch (e) { console.error('Mail error:', e); }

        toast('✅ Гүйцээсэн ажил Координаторт илгээгдлээ!');
        closeRemainingModal();
    } catch (err) {
        console.error('Submit remaining error:', err);
        toast('Алдаа: ' + err.message, 'err');
    }
    btn.disabled = false;
    btn.textContent = '📤 Илгээх';
}

// ════════════════════════════════════════════════════════════
// ★★★ ХЯНАЛТЫН ТЭМДЭГЛЭЛ — CEO/CFO COMMENT ★★★
// ════════════════════════════════════════════════════════════

async function submitComment(docId) {
    if (!isViewer(role)) { toast('Зөвхөн CEO/CFO тэмдэглэл бичих эрхтэй', 'err'); return; }
    const a = acts.find(x => x.id === docId);
    if (!a) { toast('Акт олдсонгүй', 'err'); return; }

    const inputEl = e('commentInput-' + docId);
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) {
        toast('Тэмдэглэл бичнэ үү', 'err');
        inputEl.focus();
        return;
    }
    if (text.length > 500) {
        toast('Тэмдэглэл 500 тэмдэгтээс хэтрэхгүй байх', 'err');
        return;
    }

    inputEl.disabled = true;

    try {
        const newEvs = [...(a.evs || []), {
            type: 'viewer_comment',
            who: cu.displayName || cu.email,
            whoEmail: cu.email,
            whoRole: role,
            title: `💬 ${role}-ийн тэмдэглэл`,
            detail: text,
            time: ts(),
            hash: gh()
        }];

        await updateDoc(doc(db, 'acts', docId), { evs: newEvs });

        // ★ Гүйцэтгэгчид имэйл мэдэгдэл (хэрэв байгаа бол)
        if (a.submittedBy) {
            try {
                const subject = `💬 ${role} таны акт дээр тэмдэглэл нэмлээ: ${a.actId}`;
                const message = `Хүндэт ${a.submittedByName || 'гүйцэтгэгч'},\n\n`
                    + `${role} (${cu.displayName || cu.email}) таны актад хяналтын тэмдэглэл нэмэв.\n\n`
                    + `АКТ: ${a.actId}\n`
                    + `Компани: ${a.company}\n`
                    + `Ажил: ${a.work}\n\n`
                    + `═══════════════════════════════════\n`
                    + `${role}-ИЙН ТЭМДЭГЛЭЛ:\n`
                    + `${text}\n`
                    + `═══════════════════════════════════\n\n`
                    + `Энэ тэмдэглэлийг бүх хэрэглэгч (Координатор, Инженер, Захирал, Нягтлан) харж болно.`;
                await sendMail(a.submittedBy, a.submittedByName || 'Гүйцэтгэгч', a, cu.displayName || cu.email, {
                    subject,
                    message,
                    type: 'viewer_comment',
                    reason: text,
                });
            } catch (mailErr) {
                console.error('Comment email алдаа:', mailErr);
            }
        }

        // Input цэвэрлэх (UI snapshot нэмж шинэчлэгдэнэ)
        toast(`✅ ${role} тэмдэглэл нэмэгдлээ!`);
    } catch (err) {
        console.error('Comment error:', err);
        toast('Алдаа: ' + err.message, 'err');
        inputEl.disabled = false;
    }
}

// ════════════════════════════════════════════════════════════
// FINAL PDF generation (өөрчлөгдөөгүй)
// ════════════════════════════════════════════════════════════

async function loadCyrillicFont() {
    if (cachedFont) return cachedFont;
    const ttfUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
    const res = await fetch(ttfUrl);
    if (!res.ok) throw new Error('Font татах алдаа: ' + res.status);
    cachedFont = await res.arrayBuffer();
    return cachedFont;
}

async function generateFinalPdf(act) {
    const { PDFDocument, rgb } = PDFLib;
    const finalDoc = await PDFDocument.create();
    finalDoc.registerFontkit(fontkit);
    toast('Font татаж байна...');
    const fontBytes = await loadCyrillicFont();
    const font = await finalDoc.embedFont(fontBytes, { subset: true });

    let page = finalDoc.addPage([595, 842]);
    let y = 800;
    const margin = 50;
    const lineH = 16;
    const pageWidth = 595;

    function drawText(text, x, yPos, options = {}) {
        const { size = 11, color = rgb(0, 0, 0) } = options;
        page.drawText(String(text || ''), { x, y: yPos, size, font, color });
    }
    function checkNewPage(needed = 30) {
        if (y < needed + margin) { page = finalDoc.addPage([595, 842]); y = 800; }
    }
    function drawLine(yPos, color = rgb(0.7, 0.7, 0.7)) {
        page.drawLine({ start: { x: margin, y: yPos }, end: { x: pageWidth - margin, y: yPos }, thickness: 0.5, color });
    }

    drawText('TALST · ACT', margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    y -= 4;
    page.drawLine({
        start: { x: margin, y: y - 2 },
        end: { x: margin + 50, y: y - 2 },
        thickness: 1.5,
        color: rgb(0.06, 0.73, 0.51)
    });
    y -= 24;

    drawText(act.actId, margin, y, { size: 26, color: rgb(0.06, 0.09, 0.16) });
    y -= 22;

    const subtitleParts = [act.date];
    if (act.company) subtitleParts.push(act.company);
    drawText(subtitleParts.join('  ·  '), margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    y -= 14;

    const isPartial = act.approvedPercent && act.approvedPercent < 100;
    const isMerged = act.completedViaRemaining;
    const statusText = isPartial
        ? `ХЭСЭГЧЛЭН ${act.approvedPercent}%`
        : isMerged
            ? '100% БҮРЭН (НЭГДСЭН)'
            : 'БҮРЭН БАТЛАГДСАН';
    const statusColor = isPartial
        ? rgb(0.96, 0.62, 0.04)
        : rgb(0.06, 0.73, 0.51);

    const badgeWidth = statusText.length * 5.5 + 16;
    page.drawRectangle({
        x: margin,
        y: y - 4,
        width: badgeWidth,
        height: 18,
        color: isPartial ? rgb(1, 0.95, 0.85) : rgb(0.86, 0.96, 0.91),
        borderColor: statusColor,
        borderWidth: 0.8,
    });
    drawText(statusText, margin + 8, y + 1, { size: 9, color: statusColor });
    y -= 28;

    drawLine(y, rgb(0.9, 0.92, 0.94));
    y -= 18;

    function drawMetaRow(label, value, valueColor = rgb(0.06, 0.09, 0.16), valueSize = 10.5) {
        checkNewPage();
        drawText(label, margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
        drawText(String(value || '—'), margin + 130, y, { size: valueSize, color: valueColor });
        y -= 17;
    }

    function drawMetaSeparator() {
        page.drawLine({
            start: { x: margin, y: y + 6 },
            end: { x: pageWidth - margin, y: y + 6 },
            thickness: 0.3,
            color: rgb(0.92, 0.94, 0.96)
        });
        y -= 6;
    }

    drawMetaRow('Гэрээний дугаар', act.contract);
    drawMetaRow('Ажлын хугацаа', (act.dateFrom || '—') + ' — ' + (act.dateTo || '—'));
    drawMetaRow('Илгээсэн', act.submittedByName || act.submittedBy);

    drawMetaSeparator();
    y -= 4;

    if (isMerged) {
        const approvedPart = parseInt(act.approvedAmount || 0);
        const remainingPart = parseInt(act.amount) - approvedPart;
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.amount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Эхний цикл (${act.approvedPercent}%)`, '₮ ' + fmtN(approvedPart), rgb(0.06, 0.4, 0.27), 11);
        drawMetaRow(`Үлдэгдэл цикл (${100 - act.approvedPercent}%)`, '₮ ' + fmtN(remainingPart), rgb(0.06, 0.4, 0.27), 11);
        drawMetaSeparator();
        drawMetaRow('Нийт батлагдсан', '₮ ' + fmtN(act.amount), rgb(0.06, 0.4, 0.27), 14);
    } else if (isPartial) {
        const remainingPart = parseInt(act.amount) - parseInt(act.approvedAmount);
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.amount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Батлагдсан дүн (${act.approvedPercent}%)`, '₮ ' + fmtN(act.approvedAmount), rgb(0.06, 0.4, 0.27), 13);
        drawMetaRow(`Үлдэгдэл (${100 - act.approvedPercent}%)`, '₮ ' + fmtN(remainingPart), rgb(0.85, 0.55, 0.04), 11);
    } else if (act.parentApprovedPercent && act.originalAmount) {
        const approvedPart = parseInt(act.originalAmount) - parseInt(act.amount);
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.originalAmount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Өмнө батлагдсан (${act.parentApprovedPercent}%)`, '₮ ' + fmtN(approvedPart), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Үлдэгдэл дүн (${act.remainingPercent || (100 - act.parentApprovedPercent)}%)`, '₮ ' + fmtN(act.amount), rgb(0.06, 0.4, 0.27), 13);
    } else {
        drawMetaRow('Батлагдсан дүн', '₮ ' + fmtN(act.approvedAmount || act.amount), rgb(0.06, 0.4, 0.27), 13);
    }

    drawMetaSeparator();
    y -= 4;

    if (act.work) {
        drawText('Ажил', margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
        y -= 12;
        const workWords = String(act.work).split(' ');
        let workLine = '';
        const maxWorkChars = 70;
        for (const w of workWords) {
            if ((workLine + ' ' + w).length > maxWorkChars) {
                checkNewPage();
                drawText(workLine, margin, y, { size: 11, color: rgb(0.06, 0.09, 0.16) });
                y -= 14;
                workLine = w;
            } else workLine = workLine ? workLine + ' ' + w : w;
        }
        if (workLine) {
            checkNewPage();
            drawText(workLine, margin, y, { size: 11, color: rgb(0.06, 0.09, 0.16) });
            y -= 14;
        }
        y -= 4;
    }

    if (act.pdfCount) {
        drawMetaRow('Хавсралт', act.pdfCount + ' PDF файл', rgb(0.42, 0.45, 0.5));
    }

    if (act.parentActId) {
        drawMetaRow('Эх акт', act.parentActId, rgb(0.42, 0.45, 0.5));
    }

    if (act.partialReason) {
        y -= 6;
        page.drawRectangle({
            x: margin,
            y: y - 30,
            width: pageWidth - margin * 2,
            height: 38,
            color: rgb(1, 0.97, 0.91),
            borderColor: rgb(0.96, 0.62, 0.04),
            borderWidth: 0.6,
            borderOpacity: 0.4,
        });
        page.drawRectangle({
            x: margin,
            y: y - 30,
            width: 3,
            height: 38,
            color: rgb(0.96, 0.62, 0.04),
        });
        drawText('ХЭСЭГЧЛЭН БАТЛАХ ШАЛТГААН', margin + 12, y - 4, { size: 8, color: rgb(0.58, 0.31, 0.04) });
        drawText(String(act.partialReason).substring(0, 80), margin + 12, y - 18, { size: 10, color: rgb(0.47, 0.21, 0.05) });
        y -= 44;
    }

    y -= 20;
    drawLine(y, rgb(0.9, 0.92, 0.94));
    y -= 22;

    drawText('ЯВЦЫН ТҮҮХ', margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    drawText('АУДИТ ЛОГ', pageWidth - margin - 60, y, { size: 9, color: rgb(0.65, 0.7, 0.75) });
    y -= 22;

    const events = act.evs || [];
    events.forEach((ev, i) => {
        if (ev.type === 'cycle_separator') {
            checkNewPage(50);
            y -= 8;
            page.drawLine({
                start: { x: margin, y: y + 4 },
                end: { x: pageWidth - margin, y: y + 4 },
                thickness: 1.5,
                color: rgb(0.96, 0.62, 0.04)
            });
            y -= 12;
            drawText('⏳ ҮЛДЭГДЭЛ ЦИКЛ', margin, y, { size: 11, color: rgb(0.85, 0.45, 0.04) });
            y -= 14;
            drawText(String(ev.detail || ''), margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
            y -= 10;
            page.drawLine({
                start: { x: margin, y: y + 4 },
                end: { x: pageWidth - margin, y: y + 4 },
                thickness: 0.5,
                color: rgb(0.96, 0.62, 0.04),
                opacity: 0.4
            });
            y -= 16;
            return;
        }

        checkNewPage(70);
        const isApprove = ev.type === 'approve' || ev.type === 'done' || ev.type === 'submit';
        const isReject = ev.type === 'reject';
        const isPartial = ev.type === 'partial' || ev.type === 'remaining_created';
        const dotColor = isApprove ? rgb(0.11, 0.62, 0.46)
            : isReject ? rgb(0.88, 0.29, 0.29)
                : isPartial ? rgb(0.96, 0.62, 0.04)
                    : rgb(0.5, 0.5, 0.5);
        const icon = isApprove ? '✓' : isReject ? '✕' : isPartial ? '⚠' : '→';
        page.drawCircle({ x: margin + 6, y: y + 4, size: 7, color: dotColor });
        drawText(icon, margin + 3, y + 1, { size: 10, color: rgb(1, 1, 1) });
        drawText(`${i + 1}. ${ev.title || ''}`, margin + 22, y, { size: 12, color: dotColor });
        y -= lineH;
        drawText(`Хэн: ${ev.who || '—'} (${ev.whoEmail || '—'})`, margin + 22, y, { size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= lineH - 2;
        drawText(`Хугацаа: ${ev.time || '—'}`, margin + 22, y, { size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= lineH - 2;
        const detail = String(ev.detail || '');
        const maxCharsPerLine = 75;
        if (detail) {
            const words = detail.split(' ');
            let line = '';
            for (const w of words) {
                if ((line + ' ' + w).length > maxCharsPerLine) {
                    checkNewPage();
                    drawText('  ' + line, margin + 22, y, { size: 9, color: rgb(0.25, 0.25, 0.25) });
                    y -= lineH - 3; line = w;
                } else line = line ? line + ' ' + w : w;
            }
            if (line) {
                checkNewPage();
                drawText('  ' + line, margin + 22, y, { size: 9, color: rgb(0.25, 0.25, 0.25) });
                y -= lineH - 3;
            }
        }
        if (ev.hash) {
            checkNewPage();
            drawText(`  🔐 ${ev.hash}`, margin + 22, y, { size: 8, color: rgb(0.55, 0.55, 0.55) });
            y -= lineH - 2;
        }
        y -= 10;
    });

    checkNewPage(50);
    y -= 10; drawLine(y); y -= 15;
    drawText(`Үүсгэсэн: ${new Date().toLocaleString('mn-MN')}`, margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;
    drawText('Talst Act System · Blockchain-style Audit Trail', margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;
    drawText(`Нийт ${events.length} арга хэмжээ · ${act.pdfCount || 0} хавсралт`, margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });

    if (act.pdfs && act.pdfs.length) {
        for (const pdf of act.pdfs) {
            try {
                const base64Data = (pdf.base64 || '').split(',')[1] || pdf.base64;
                if (!base64Data) continue;
                const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                const attachedDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
                const copiedPages = await finalDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
                copiedPages.forEach(p => finalDoc.addPage(p));
            } catch (err) {
                console.error('PDF алдаа:', pdf.name, err);
            }
        }
    }

    const finalBytes = await finalDoc.save();
    const fileName = `${act.actId}_FINAL.pdf`;

    if (isNative) {
        try {
            const Filesystem = window.Capacitor?.Plugins?.Filesystem;
            const Share = window.Capacitor?.Plugins?.Share;
            if (!Filesystem) throw new Error('Filesystem plugin олдсонгүй');
            let binary = '';
            const bytes = new Uint8Array(finalBytes);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);
            const result = await Filesystem.writeFile({
                path: fileName, data: base64, directory: 'DOCUMENTS', recursive: true
            });
            if (Share) {
                try {
                    await Share.share({
                        title: 'Батлагдсан акт',
                        text: `${act.actId} — Бүрэн батлагдсан акт`,
                        url: result.uri,
                        dialogTitle: 'Актыг хуваалцах'
                    });
                } catch (shareErr) { console.log('Share cancelled'); }
            }
        } catch (err) {
            console.error('Native save error:', err);
            toast('PDF хадгалахад алдаа: ' + err.message, 'err');
        }
    } else {
        const blob = new Blob([finalBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

async function downloadFinalPdf(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) { toast('Акт олдсонгүй', 'err'); return; }
    if (a.status !== 'done') { toast('Зөвхөн бүрэн батлагдсан актыг татах боломжтой', 'err'); return; }
    try {
        toast('PDF бэлдэж байна...');
        await generateFinalPdf(a);
        toast('✅ Татагдлаа!');
    } catch (err) {
        console.error(err);
        toast('Алдаа: ' + err.message, 'err');
    }
}

function evH(ev, isLast) {
    if (ev.type === 'cycle_separator') {
        return `<div class="cycle-sep">
            <div class="cycle-sep-line"></div>
            <div class="cycle-sep-text">${esc(ev.title)}</div>
            <div class="cycle-sep-detail">${esc(ev.detail)}</div>
            <div class="cycle-sep-line"></div>
        </div>`;
    }

    // ★ ШИНЭ: Хяналтын тэмдэглэл — өвөрмөц өнгөтэй
    if (ev.type === 'viewer_comment') {
        const roleColor = ev.whoRole === 'CEO' ? '#0f172a' : '#1e293b';
        return `<div class="tli">
            <div class="tll"><div class="dot dcomment">💬</div>${!isLast ? '<div class="dline lcomment"></div>' : ''}</div>
            <div class="tlr"><div class="tlcard tlcard-comment">
                <div class="tlch">
                    <div>
                        <div class="tlwho" style="color:${roleColor};font-weight:700">
                            ${esc(ev.whoRole || 'Хяналт')} · ${esc(ev.who)}
                        </div>
                        <div class="tltitle">${esc(ev.title)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:12px">📋</span>
                        <div class="tltime">${ev.time || ''}</div>
                    </div>
                </div>
                <div class="tlcb tlcb-comment">
                    <div class="tldtl tldtl-comment">${esc(ev.detail)}</div>
                </div>
            </div></div>
        </div>`;
    }

    let dc, ic, lk;
    if (ev.type === 'partial' || ev.type === 'remaining_created') {
        dc = 'dpartial'; ic = '⚠'; lk = '🔓';
    } else if (ev.type === 'approve' || ev.type === 'done' || ev.type === 'submit') {
        dc = 'dd'; ic = '✓'; lk = '🔒';
    } else if (ev.type === 'reject') {
        dc = 'dj'; ic = '✕'; lk = '🔓';
    } else {
        dc = 'da'; ic = '→'; lk = '🔓';
    }
    return `<div class="tli">
    <div class="tll"><div class="dot ${dc}">${ic}</div>${!isLast ? '<div class="dline ld"></div>' : ''}</div>
    <div class="tlr"><div class="tlcard">
      <div class="tlch">
        <div><div class="tlwho">${esc(ev.who)} · ${esc(ev.whoEmail || '')}</div><div class="tltitle">${esc(ev.title)}</div></div>
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:12px">${lk}</span><div class="tltime">${ev.time || ''}</div></div>
      </div>
      <div class="tlcb">
        <div class="tldtl">${esc(ev.detail)}</div>
        <div class="hashrow"><span style="font-size:10px">🔐</span><div class="hashval">${ev.hash || ''} · ${ev.time || ''}</div></div>
      </div>
    </div></div>
  </div>`;
}

function wevH(i, isLast) {
    return `<div class="tli">
    <div class="tll"><div class="dot dw" style="font-size:10px">${i + 1}</div>${!isLast ? '<div class="dline lw"></div>' : ''}</div>
    <div class="tlr"><div class="tlcard tlwait">
      <div class="tlch"><div><div class="tlwho">${SE[i]}</div><div class="tltitle">${SN[i]} хүлээгдэж байна...</div></div></div>
    </div></div>
  </div>`;
}

function detH(idx) {
    const a = acts[idx]; if (!a) return '';
    const p = pct(a); const step = a.step || 0;

    // ★ ӨӨРЧЛӨСӨН: CEO/CFO action хийж чадахгүй
    const canApprove = (a.status === 'pending' || a.status === 'partial')
        && role !== 'Гүйцэтгэгч'
        && !isViewer(role)
        && RSTEP[role] === step;
    const canPartial = a.status === 'pending' && role === 'Координатор' && step === 0;
    const canComplete = a.status === 'remaining' && a.submittedBy === cu?.email;
    // ★ ШИНЭ: CEO/CFO коммент бичих эрхтэй
    const canComment = isViewer(role);

    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : a.dateFrom || a.dateTo || '—';
    let pdfsHtml = '';
    if (a.pdfs && a.pdfs.length) {
        pdfsHtml = '<div class="det-pdfs">' + a.pdfs.map(pdf => `
      <div class="det-pdf-item">
        <span style="font-size:18px">📄</span>
        <span class="det-pdf-name">${esc(pdf.name)}</span>
        <span class="det-pdf-size">${pdf.sizeKb}KB</span>
        <a class="det-pdf-open" href="${pdf.base64}" download="${esc(pdf.name)}" onclick="event.stopPropagation()">Татах</a>
      </div>`).join('') + '</div>';
    }
    let tl = (a.evs || []).map(ev => evH(ev, false)).join('');
    if (a.status === 'pending' || a.status === 'partial') for (let i = step; i < 4; i++) tl += wevH(i, i === 3);

    const finalBtn = a.status === 'done' ? `
      <div class="abtns" style="margin-top:10px">
        <button class="bok" onclick="downloadFinalPdf('${a.id}')" style="background:#1d9e75">
          📥 Бүрэн PDF татах
        </button>
      </div>` : '';

    const partialReasonHtml = (a.status === 'partial' || a.status === 'remaining' || a.partialReason) && a.partialReason ? `
      <div class="partial-reason-card">
        <div class="partial-reason-label">⚠ Хэсэгчлэн батлах шалтгаан</div>
        <div class="partial-reason-text">${esc(a.partialReason)}</div>
      </div>` : '';

    const statusBadge = `<span class="badge ${bc(a)}">${bt(a)}</span>`;

    let actionBtns = '';
    if (canApprove && canPartial) {
        actionBtns = `<div class="abtns">
            <button class="bok" onclick="approve('${a.id}')">✓ Бүтэн батлах</button>
            <button class="bpartial-btn" onclick="openPartialModal('${a.id}')">⚠ Хэсэгчлэн</button>
            <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
        </div>`;
    } else if (canApprove) {
        actionBtns = `<div class="abtns">
            <button class="bok" onclick="approve('${a.id}')">✓ Батлах</button>
            <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
        </div>`;
    } else if (canComplete) {
        actionBtns = `<div class="abtns">
            <button class="bcomplete" onclick="openRemainingModal('${a.id}')">+ Гүйцээх ажил илгээх</button>
        </div>`;
    }

    let amountDisplay;
    if (a.originalAmount && a.parentApprovedPercent) {
        const approvedPart = parseInt(a.originalAmount) - parseInt(a.amount);
        amountDisplay = `<div class="row"><span class="rl">Анхны нийт дүн</span><span class="rv amt">₮ ${fmtN(a.originalAmount)}</span></div>
           <div class="row"><span class="rl">Батлагдсан (${a.parentApprovedPercent}%)</span><span class="rv" style="color:#059669;font-weight:700">₮ ${fmtN(approvedPart)}</span></div>
           <div class="row"><span class="rl">Үлдэгдэл (${a.remainingPercent || (100 - a.parentApprovedPercent)}%)</span><span class="rv" style="color:#d97706;font-weight:700">₮ ${fmtN(a.amount)}</span></div>`;
    } else if (a.approvedAmount && a.approvedAmount !== a.amount) {
        const remainingPart = parseInt(a.amount) - parseInt(a.approvedAmount);
        amountDisplay = `<div class="row"><span class="rl">Анхны дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>
           <div class="row"><span class="rl">Батлагдсан дүн (${a.approvedPercent}%)</span><span class="rv" style="color:#059669;font-weight:700">₮ ${fmtN(a.approvedAmount)}</span></div>
           <div class="row"><span class="rl">Үлдэгдэл (${100 - a.approvedPercent}%)</span><span class="rv" style="color:#d97706;font-weight:600">₮ ${fmtN(remainingPart)}</span></div>`;
    } else {
        amountDisplay = `<div class="row"><span class="rl">Дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>`;
    }

    // ★ ШИНЭ: Хяналтын тэмдэглэл хэсэг (зөвхөн CEO/CFO харагдана)
    const commentSection = canComment ? `
    <div class="comment-section">
      <div class="comment-header">
        <div class="comment-icon">${ROLE_AVATAR_ICONS[role] || ''}</div>
        <div>
          <div class="comment-title">Хяналтын тэмдэглэл нэмэх</div>
          <div class="comment-subtitle">${esc(role)} — Энэ тэмдэглэлийг бүх хэрэглэгч харна</div>
        </div>
      </div>
      <textarea id="commentInput-${a.id}" class="comment-input"
                placeholder="Хяналтын тэмдэглэл, асуулт, эсвэл сонор хүлээж байгаа зүйлээ бичнэ үү..."
                rows="3"></textarea>
      <button class="comment-submit-btn" onclick="submitComment('${a.id}')">
        💬 Тэмдэглэл нэмэх
      </button>
    </div>` : '';

    return `<div class="card">
    <div class="ch">
      <div><div class="cid">${esc(a.actId)} · ${esc(a.date)}</div><div class="ctitle">${esc(a.work)}</div></div>
      ${statusBadge}
    </div>
    <div class="cb">
      <div class="row"><span class="rl">Компани</span><span class="rv">${esc(a.company)}</span></div>
      <div class="row"><span class="rl">Гэрээний дугаар</span><span class="rv">${esc(a.contract)}</span></div>
      <div class="row"><span class="rl">Ажлын хугацаа</span><span class="rv">${esc(dr)}</span></div>
      ${amountDisplay}
      <div class="row"><span class="rl">Илгээсэн</span><span class="rv">${esc(a.submittedByName || a.submittedBy || '—')}</span></div>
      ${a.parentActId ? `<div class="row"><span class="rl">Эх акт</span><span class="rv">${esc(a.parentActId)}</span></div>` : ''}
      ${a.pdfCount ? `<div class="row"><span class="rl">Баримт бичгүүд</span><span class="rv">${a.pdfCount} PDF файл</span></div>` : ''}
    </div>
    ${partialReasonHtml}
    ${pdfsHtml}
    <div class="pbwrap"><div class="pb" style="width:${p}%"></div></div>
    <div class="plabel"><span>${p}% дууссан</span><span>${step}/4 батлалт</span></div>
    ${actionBtns}
    ${finalBtn}
    <div class="tl"><div class="tll-label">ЯВЦЫН ТҮҮХ · АУДИТ ЛОГ</div>${tl}</div>
    ${commentSection}
  </div>`;
}

function liH(a, idx, from) {
    const p = pct(a); const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const cls = a.status === 'partial' ? 'li partial' : 'li';
    return `<div class="${cls}" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge ${bc(a)}">${bt(a)}</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.approvedAmount || a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:${p}%"></div></div>
      <span class="mpct">${p}%</span>
    </div>
  </div>`;
}

function liHDone(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const isDone = a.status === 'done';
    const isMerged = a.completedViaRemaining;
    return `<div class="li done${isMerged ? ' merged' : ''}" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge ${isDone ? 'bd' : 'br'}">${isMerged ? '✓ 100% (Нэгдсэн)' : (isDone ? '✓ Батлагдсан' : '✕ Буцаагдсан')}</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}${isMerged ? ' · <span style="color:#059669;font-weight:600">Хэсэгчлэн+Үлдэгдэл нэгдсэн</span>' : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:100%;background:${isDone ? '#1d9e75' : '#e74c3c'}"></div></div>
      <span class="mpct" style="color:${isDone ? '#1d9e75' : '#e74c3c'}">${isDone ? '100%' : '✕'}</span>
    </div>
  </div>`;
}

// ★ ШИНЭЧИЛСЭН: Буцаагдсан карт — countdown timer-тэй (8 цаг доторх)
function liHRejected(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const now = Date.now();
    const rejTime = a.rejectedAt ? a.rejectedAt.toMillis?.() || a.rejectedAt : null;

    let timerHtml = '';
    let timerColor = '#e74c3c';
    if (rejTime) {
        const remaining = EIGHT_HOURS - (now - rejTime);
        if (remaining > 0) {
            const h = Math.floor(remaining / 3600000);
            const m = Math.floor((remaining % 3600000) / 60000);
            // Сүүлийн 1 цаг үлдсэн үед ягаан, эс бөгөөс улаан
            if (remaining < 60 * 60 * 1000) timerColor = '#dc2626';
            timerHtml = `<div class="reject-timer" style="color:${timerColor};font-weight:600">
                🗑 <strong>${h}ц ${m}мин</strong>-ын дараа автоматаар устах болно
            </div>`;
        } else {
            timerHtml = '<div class="reject-timer">🗑 Удахгүй устах гэж байна...</div>';
        }
    }

    // Буцаах шалтгаан хайх (events дотор)
    const rejectEv = (a.evs || []).reverse().find(ev => ev.type === 'reject');
    const reasonText = rejectEv ? rejectEv.detail.replace(/^Шалтгаан:\s*/, '') : '';
    const rejectorName = rejectEv ? rejectEv.who : '';

    return `<div class="li rejected" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge br">✕ Буцаагдсан</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    ${reasonText ? `<div class="remaining-reason" style="background:rgba(254,226,226,0.6);border-left-color:#dc2626;color:#7f1d1d">📝 ${esc(reasonText)}${rejectorName ? ` <span style="opacity:0.7">— ${esc(rejectorName)}</span>` : ''}</div>` : ''}
    <div style="display:flex;align-items:center;gap:7px;margin-top:8px">
      <div class="mbwrap"><div class="mb" style="width:100%;background:#e74c3c"></div></div>
      <span class="mpct" style="color:#e74c3c">✕</span>
    </div>
    ${timerHtml}
  </div>`;
}

function liHRemaining(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li remaining" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge bremaining">⏳ Үлдэгдэл</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    ${a.partialReason ? `<div class="remaining-reason">${esc(a.partialReason)}</div>` : ''}
  </div>`;
}

function rA() {
    const el = e('al');
    if (!acts.length) { el.innerHTML = '<div class="empty">Акт байхгүй байна</div>'; return; }
    if (role === 'Гүйцэтгэгч') { el.innerHTML = '<div class="empty">Акт илгээх таб ашиглана уу</div>'; return; }
    // ★ ШИНЭ: CEO/CFO энэ таб дээр орохгүй (UI hide), гэхдээ урьдчилан сэргийлэхийн тулд
    if (isViewer(role)) { el.innerHTML = '<div class="empty">Хяналт хэрэглэгч батлах эрхгүй</div>'; return; }

    let list;
    if (role === 'Нягтлан') {
        list = acts.filter(a => a.status === 'done' || a.status === 'partial_done');
    } else if (role === 'Координатор') {
        list = acts.filter(a =>
            (a.status === 'pending' && (a.step || 0) === 0)
        );
    } else {
        list = acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === RSTEP[role]
        );
    }
    el.innerHTML = list.length ? list.map(a => liH(a, acts.indexOf(a), 1)).join('') : '<div class="empty">Таны батлах акт байхгүй байна</div>';
}

// ════════════════════════════════════════════════════════
// АКТУУД ТАБ — 5 role card-тэй
// ════════════════════════════════════════════════════════

let listFilter = null;
let listSearch = '';
let listLimit = 10;

const ICONS = {
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    arrowLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
    coordinator: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M3 21v-2a7 7 0 0 1 14 0v2"></path><circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="none" opacity="0.4"></circle></svg>',
    engineer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    director: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 11l-3 3-3-3"></path><path d="M19 14V6"></path></svg>',
    accountant: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',
    // ★ ШИНЭ: Буцаагдсан icon
    rejected: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
};

window.setListFilter = (f) => {
    listFilter = f;
    listLimit = 10;
    rL();
    setTimeout(() => {
        const inp = e('listSearchInput');
        if (inp && document.activeElement !== inp && listSearch) inp.focus();
    }, 0);
};

window.clearListSearch = () => {
    listSearch = '';
    listLimit = 10;
    const inp = e('listSearchInput');
    if (inp) {
        inp.value = '';
        inp.focus();
    }
    rL();
};

window.showMoreActs = () => {
    listLimit += 10;
    rL();
};

let searchDebounceTimer = null;
window.handleSearchInput = (val) => {
    listSearch = (val || '').toLowerCase().trim();
    listLimit = 10;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        renderListBody();
    }, 150);
};

function rL() {
    const el = e('ll');
    el.innerHTML = renderListHeader() + '<div id="listBody">' + renderListBodyHtml() + '</div>';
}

function renderListHeader() {
    return `
        <div class="list-header">
            <div class="list-search-wrap">
                <input type="text" id="listSearchInput" class="list-search-input"
                    value="${esc(listSearch)}"
                    autocomplete="off"
                    oninput="handleSearchInput(this.value)">
                ${listSearch
        ? `<button class="list-search-clear" onclick="clearListSearch()">${ICONS.close}</button>`
        : `<span class="list-search-icon">${ICONS.search}</span>`}
            </div>
        </div>
    `;
}

function renderListBody() {
    const body = e('listBody');
    if (body) body.innerHTML = renderListBodyHtml();
}

function renderListBodyHtml() {
    function actsAtStep(step) {
        return acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === step
        );
    }

    // ★ ШИНЭ: Буцаагдсан акт (8 цаг доторх)
    function actsRejected() {
        const now = Date.now();
        return acts.filter(a => {
            if (a.status !== 'rejected') return false;
            const rejTime = a.rejectedAt ? (a.rejectedAt.toMillis?.() || a.rejectedAt) : null;
            if (!rejTime) return true; // Хэрвээ rejectedAt байхгүй бол 8 цаг хүлээгдсэн гэж тооцно (legacy)
            return (now - rejTime) <= EIGHT_HOURS;
        });
    }

    const stepLists = {
        coordinator: actsAtStep(0),
        engineer: actsAtStep(1),
        director: actsAtStep(2),
        accountant: actsAtStep(3),
        rejected: actsRejected(), // ★ ШИНЭ
    };

    const stepLabels = {
        coordinator: 'Координатор',
        engineer: 'Инженер',
        director: 'Захирал',
        accountant: 'Нягтлан',
        rejected: 'Буцаагдсан', // ★ ШИНЭ
    };

    const stepDescriptions = {
        coordinator: 'Анхны шалгалт хийгдэж байгаа',
        engineer: 'Инженерийн баталгаажуулалт',
        director: 'Захирлын батламж',
        accountant: 'Гүйлгээ хийгдэх гэж байгаа',
        rejected: '8 цагийн дотор автоматаар устана', // ★ ШИНЭ
    };

    function matchSearch(a) {
        if (!listSearch) return true;
        return (a.contract || '').toLowerCase().includes(listSearch);
    }

    if (listSearch) {
        const found = acts.filter(matchSearch);
        if (found.length === 0) {
            return `<div class="empty" style="padding: 40px 20px">
                ${ICONS.search} "<strong>${esc(listSearch)}</strong>" гэрээний дугаараар олдсонгүй
            </div>`;
        }
        const shown = found.slice(0, listLimit);
        const remaining = found.length - shown.length;
        let html = `<div class="search-result-hint">"${esc(listSearch)}" — ${found.length}ш олдов</div>`;
        html += shown.map(a => {
            // Хэрвээ буцаагдсан бол rejected card-аар
            if (a.status === 'rejected') return liHRejected(a, acts.indexOf(a), 2);
            return liH(a, acts.indexOf(a), 2);
        }).join('');
        if (remaining > 0) {
            html += `<button class="show-more-btn" onclick="showMoreActs()">
                Дараагийн ${Math.min(remaining, 10)} акт <span style="opacity:0.7">(${remaining} үлдсэн)</span>
            </button>`;
        }
        return html;
    }

    // ★ HOME SCREEN — 5 карт (4 шат + 1 буцаагдсан)
    if (!listFilter) {
        const cards = ['coordinator', 'engineer', 'director', 'accountant', 'rejected'];
        const colors = {
            coordinator: { bg: 'rgba(239, 68, 68, 0.06)', border: 'rgba(239, 68, 68, 0.2)', accent: '#dc2626' },
            engineer:    { bg: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.2)', accent: '#2563eb' },
            director:    { bg: 'rgba(139, 92, 246, 0.06)', border: 'rgba(139, 92, 246, 0.2)', accent: '#7c3aed' },
            accountant:  { bg: 'rgba(16, 185, 129, 0.06)', border: 'rgba(16, 185, 129, 0.2)', accent: '#059669' },
            // ★ ШИНЭ: Улаан өнгөтэй, бусдаас өвөрмөц
            rejected:    { bg: 'rgba(220, 38, 38, 0.08)', border: 'rgba(220, 38, 38, 0.3)', accent: '#b91c1c' },
        };

        return `<div class="role-cards">
            ${cards.map(key => {
            const list = stepLists[key];
            const c = colors[key];
            const isEmpty = list.length === 0;
            const isRejected = key === 'rejected';
            return `<div class="role-card ${isEmpty ? 'empty' : ''}${isRejected ? ' role-card-rejected' : ''}" 
                    style="--c-bg: ${c.bg}; --c-border: ${c.border}; --c-accent: ${c.accent}"
                    onclick="${isEmpty ? '' : `setListFilter('${key}')`}">
                    <div class="role-card-icon" style="color: ${c.accent}">${ICONS[key]}</div>
                    <div class="role-card-body">
                        <div class="role-card-title">${stepLabels[key]}</div>
                        <div class="role-card-desc">${stepDescriptions[key]}</div>
                    </div>
                    <div class="role-card-count" style="color: ${c.accent}">${list.length}</div>
                </div>`;
        }).join('')}
        </div>`;
    }

    // DETAIL SCREEN
    const list = stepLists[listFilter] || [];

    let html = `<div class="role-detail-header">
        <button class="back-to-roles" onclick="setListFilter(null)">
            ${ICONS.arrowLeft} <span>Бүх үүрэг</span>
        </button>
        <div class="role-detail-title">${stepLabels[listFilter]} <span class="role-detail-count">${list.length}</span></div>
    </div>`;

    if (list.length === 0) {
        html += `<div class="empty" style="padding: 40px 20px">
            <div style="font-size: 14px;">${stepLabels[listFilter]} дээр хүлээгдэж буй акт байхгүй</div>
        </div>`;
        return html;
    }

    const shown = list.slice(0, listLimit);
    const remaining = list.length - shown.length;

    // ★ Буцаагдсан role-ийн хувьд тусгай rejected card ашиглана
    if (listFilter === 'rejected') {
        html += shown.map(a => liHRejected(a, acts.indexOf(a), 2)).join('');
    } else {
        html += shown.map(a => liH(a, acts.indexOf(a), 2)).join('');
    }

    if (remaining > 0) {
        html += `<button class="show-more-btn" onclick="showMoreActs()">
            Дараагийн ${Math.min(remaining, 10)} акт <span style="opacity:0.7">(${remaining} үлдсэн)</span>
        </button>`;
    }

    return html;
}

function liHPartialDone(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li partial-done" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge bpartial-done">⚠ ${a.approvedPercent}% батлагдсан</span>
    </div>
    <div class="li-sub">${esc(a.company)} · <strong style="color:#d97706">₮${fmtN(a.approvedAmount)}</strong> / ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:${a.approvedPercent}%;background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div></div>
      <span class="mpct" style="color:#d97706;font-weight:700">${a.approvedPercent}%</span>
    </div>
    <div class="partial-done-hint">⏳ Үлдэгдэл ${100 - a.approvedPercent}% (₮${fmtN(parseInt(a.amount) - parseInt(a.approvedAmount))}) гүйцээгдэхийг хүлээж байна</div>
  </div>`;
}

function fmtM(n) { return '₮' + parseInt(n || 0).toLocaleString('mn-MN'); }

let dbBarChart = null;
function rD() {
    const total = acts.length;
    const pending = acts.filter(a => a.status === 'pending');
    const partial = acts.filter(a => a.status === 'partial');
    const remainingActs = acts.filter(a => a.status === 'remaining');
    const done = acts.filter(a => a.status === 'done');

    e('s0').textContent = total;
    e('s0sub').textContent = total + 'ш бүртгэгдсэн';
    e('s1').textContent = pending.length + partial.length;
    e('s1sub').textContent = (pending.length + partial.length) + 'ш батлуулж байна';
    e('s2').textContent = done.length;
    e('s2sub').textContent = done.length + 'ш бүрэн батлагдсан';

    const allActiveActs = [...pending, ...partial];
    const steps = [0, 1, 2, 3].map(i => allActiveActs.filter(a => (a.step || 0) === i).length);
    const partialCount = partial.length;
    const maxS = Math.max(...steps, done.length, partialCount, remainingActs.length, 1);

    [0, 1, 2, 3].forEach(i => {
        if (e('dBar' + i)) {
            e('dBar' + i).style.width = Math.round(steps[i] / maxS * 100) + '%';
            e('dV' + i).textContent = steps[i];
        }
    });
    if (e('dBarDone')) {
        e('dBarDone').style.width = Math.round(done.length / maxS * 100) + '%';
        e('dVDone').textContent = done.length;
    }
    if (e('dBarPartial')) {
        e('dBarPartial').style.width = Math.round(partialCount / maxS * 100) + '%';
        e('dVPartial').textContent = partialCount;
    }

    const totalAmt = acts.reduce((s, a) => s + parseInt(a.amount || 0), 0);
    const doneAmt = done.reduce((s, a) => s + parseInt(a.approvedAmount || a.amount || 0), 0);
    e('dTotalAmt').textContent = fmtM(totalAmt);
    e('dDoneAmt').textContent = fmtM(doneAmt);

    if (typeof Chart === 'undefined') return;

    function parseActDate(dateStr) {
        if (!dateStr) return null;
        if (typeof dateStr === 'object' && dateStr.seconds !== undefined) {
            const dt = new Date(dateStr.seconds * 1000);
            return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
        }
        const s = String(dateStr).trim();
        const p = s.replace(/[.\/\-]/g, '-').split('-').filter(Boolean);
        if (p.length === 3) {
            const a = parseInt(p[0]), b = parseInt(p[1]), c = parseInt(p[2]);
            if (a > 1900) return { y: a, m: b, d: c };
            if (c > 1900) return { y: c, m: a, d: b };
            if (c < 100) return { y: 2000 + c, m: a, d: b };
        }
        return null;
    }

    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push({ label: (d.getMonth() + 1) + '/' + (d.getDate()), m: d.getMonth() + 1, d: d.getDate(), y: d.getFullYear() });
    }
    function actsOfDay(day) {
        return acts.filter(a => {
            const pd = parseActDate(a.date);
            if (!pd) return false;
            return pd.y === day.y && pd.m === day.m && pd.d === day.d;
        });
    }

    // ★★★ ӨӨРЧИЛСӨН: Chart нь ӨДӨР ТУТМЫН НИЙТ ХҮСЭЛТИЙН ТОО харуулна
    const dayCounts = days.map(day => actsOfDay(day).length);
    const maxCount = Math.max(...dayCounts, 1);

    // Bar өндөр — нийт тоог chart-ийн max-аар нь масштаблах
    // Хоосон өдрийг 0, бусад өдөрт жинхэнэ тоог нь харуулна
    const displayCounts = dayCounts;

    // Өнгөнүүд — нэг өнгөтэй, тооноос хамаарч градиент байж болно
    // Хүсэлт олонтой бол илүү тод (gradient deeper), цөөн бол цайвар
    const dayColors = dayCounts.map(count => {
        if (count === 0) return '#ebebeb'; // хоосон өдөр
        const ratio = count / maxCount;
        // Brand цэнхэр (#378add) шиг, intensity бариулна
        if (ratio >= 0.75) return '#1d4ed8'; // их үед хар хөх
        if (ratio >= 0.5) return '#2563eb';
        if (ratio >= 0.25) return '#3b82f6';
        return '#60a5fa'; // цөөхөн үед цайвар
    });

    if (dbBarChart) { dbBarChart.destroy(); dbBarChart = null; }
    const ctx = e('dbBarChart'); if (!ctx) return;
    dbBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days.map(d => d.label),
            datasets: [{
                label: 'Хүсэлтийн тоо',
                data: displayCounts,
                backgroundColor: dayColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const day = days[ctx.dataIndex];
                            const da = actsOfDay(day);
                            if (!da.length) return 'Хүсэлт байхгүй';
                            const total = da.reduce((s, a) => s + parseInt(a.amount || 0), 0);
                            return `${da.length}ш хүсэлт · ₮${parseInt(total).toLocaleString('mn-MN')}`;
                        },
                        title: ctx => {
                            const day = days[ctx[0].dataIndex];
                            return `${day.label} · ${dayCounts[ctx[0].dataIndex]}ш хүсэлт`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#888', autoSkip: false, maxRotation: 0 }
                },
                y: {
                    beginAtZero: true,
                    min: 0,
                    ticks: {
                        font: { size: 10 },
                        color: '#888',
                        stepSize: 1,
                        precision: 0,
                        callback: v => Number.isInteger(v) ? v : null
                    },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                }
            },
        }
    });
}