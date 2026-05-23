import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithCredential, getRedirectResult, onAuthStateChanged, signOut, sendEmailVerification, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc, deleteDoc, where, limit, getDocs, writeBatch, increment } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD7LmaYPSp93uBdFnU5PO1CW9T3acVzLhY",
    authDomain: "anime-chat-d6383.firebaseapp.com",
    projectId: "anime-chat-d6383",
    storageBucket: "anime-chat-d6383.appspot.com",
    messagingSenderId: "4379327452",
    appId: "1:4379327452:web:cbb815e031294ef832d19"
};

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/ddaqhf75h/image/upload";
const CLOUDINARY_PRESET = "Chat Slayer";
const MAX_MSG_LENGTH = 500;
const REPLY_COOLDOWN = 10000;

// معرّف OAuth 2.0 Web Client من Google Cloud Console
// مأخوذ من REVERSED_CLIENT_ID في config.xml
const WEB_CLIENT_ID = "4379327452-lidtepv1ns6bujtlpva2bkfmc2h6qmdf.apps.googleusercontent.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

// ثبات الجلسة دائماً حتى لا يخرج المستخدم عند إغلاق التطبيق
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ─── Cordova deviceready ────────────────────────────────────
// يُحلّ فوراً في المتصفح، وينتظر حدث deviceready داخل APK
const _deviceReadyPromise = new Promise(resolve => {
    if (typeof window.cordova === 'undefined') {
        resolve(); // بيئة المتصفح العادي
    } else {
        document.addEventListener('deviceready', resolve, { once: true });
    }
});

// كشف بيئة APK/WebView
const isWebView = () => {
    const ua = navigator.userAgent;
    return /wv\b|WebView/i.test(ua) ||
        (ua.includes('Android') && !/Chrome\/[0-9]/.test(ua)) ||
        (ua.includes('iPhone') && !ua.includes('Safari'));
};

const SUPER_ADMINS = [
    "yLrGfmBd7QfrQkz6JMji3PCkTFq2"
];

let currentUser = null;
let currentThreadId = null;
let isAnonymousMode = false;
let settingsAnonMode = localStorage.getItem('settingsAnonMode') === 'true';
let hideAnonMode = localStorage.getItem('hideAnonMode') === 'true';
let hideOnePiecePosts = localStorage.getItem('hideOnePiecePosts') === 'true';
let hiddenAnonUsers = [];
let blockedUsersList = [];
let blockedByUsersList = [];
let unsubscribePosts = null;
let unsubscribeReplies = null;
let unsubscribeCurrentUser = null;
let unsubscribeReports = null;
let _personalUnread = 0;
let _broadcastUnread = 0;
let isSending = false;
let currentEditPostId = null;
let currentReplyFilter = 'oldest';
let replyCountdownInterval = null;
let mainCountdownInterval = null;
let currentProfileData = null;
let previousScreen = 'chat';
let postsLimit = 20;
let lastVisiblePost = null;
let currentPostsFilter = 'newest';
// ─── خريطةهه تفاعلات المستخدم (تُحمَّل عند تسجيل الدخول)he   ───
const reactionsMap = new Map(); // key → 'like'|'dislike'
const replyCountMap = new Map(); // postId → عدد الردود الفعلي

// ─── مساعدات ────────────────────────────────────────────
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById("auth").style.display = 'none';
    const el = document.getElementById(screenId);
    if (el) el.style.display = 'flex';
}

function showLoading(show) {
    const el = document.getElementById("loadingOverlay");
    if (el) el.style.display = show ? "flex" : "none";
}

function timeAgo(date) {
    if (!date) return "";
    const s = Math.floor((new Date() - date) / 1000);
    if (s < 10) return "الآن";
    if (s < 60) return `منذ ${s} ثانية`;
    const m = Math.floor(s / 60);
    if (m === 1) return "منذ دقيقة";
    if (m === 2) return "منذ دقيقتين";
    if (m < 11) return `منذ ${m} دقائق`;
    if (m < 60) return `منذ ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h === 1) return "منذ ساعة";
    if (h === 2) return "منذ ساعتين";
    if (h < 11) return `منذ ${h} ساعات`;
    if (h < 24) return `منذ ${h} ساعة`;
    const d = Math.floor(h / 24);
    if (d === 1) return "أمس";
    if (d === 2) return "منذ يومين";
    if (d < 8) return `منذ ${d} أيام`;
    if (d < 14) return "منذ أسبوع";
    if (d < 21) return "منذ أسبوعين";
    if (d < 30) return "منذ 3 أسابيع";
    const mo = Math.floor(d / 30);
    if (mo === 1) return "منذ شهر";
    if (mo === 2) return "منذ شهرين";
    if (mo < 11) return `منذ ${mo} أشهر`;
    if (mo < 12) return `منذ ${mo} شهراً`;
    const y = Math.floor(d / 365);
    if (y === 1) return "منذ سنة";
    if (y === 2) return "منذ سنتين";
    return `منذ ${y} سنوات`;
}

function spinRefreshIcon(iconId) {
    const icon = document.getElementById(iconId);
    if (!icon) return;
    icon.classList.add('spinning');
    setTimeout(() => icon.classList.remove('spinning'), 800);
}

// ─── Apple Emoji ────────────────────────────────────────────
const _TW_OPTS = {
    folder: '64',
    ext: '.png',
    base: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/',
    onerror(el) {
        // fallback: أظهر الإيموجي كنص عادي بدل إخفائه
        const txt = document.createTextNode(el.alt || '');
        el.replaceWith(txt);
    }
};
function parseEmoji(rawText) {
    if (!rawText) return rawText;
    if (typeof twemoji === 'undefined') return rawText;
    try { return twemoji.parse(rawText, _TW_OPTS); }
    catch (_) { return rawText; }
}

// للاستدعاء على DOM (إشعارات وما شابه) — المكتبة الرسمية تتولى كل شيء
function parseTwemoji(el) {
    if (!el || typeof twemoji === 'undefined') return;
    try { twemoji.parse(el, _TW_OPTS); } catch (_) {}
}

// تطبيق الإيموجي على كامل الصفحة بعد التحميل
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => parseTwemoji(document.body), 800);
    });
}

function safeEsc(s) {
    if (!s) return '';
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

// ─── مودالات النظام المخصصة ─────────────────────────────────
function showAlert(msg) {
    return new Promise(resolve => {
        window._sysAlertResolve = () => {
            document.getElementById('sysAlertModal').style.display = 'none';
            resolve();
        };
        document.getElementById('sysAlertMsg').textContent = msg;
        document.getElementById('sysAlertModal').style.display = 'flex';
        document.getElementById('sysAlertOk').onclick = window._sysAlertResolve;
    });
}
function showConfirm(msg) {
    return new Promise(resolve => {
        const close = (v) => { document.getElementById('sysConfirmModal').style.display = 'none'; resolve(v); };
        window._sysConfirmResolve = (v) => close(v);
        document.getElementById('sysConfirmMsg').textContent = msg;
        document.getElementById('sysConfirmModal').style.display = 'flex';
        document.getElementById('sysConfirmOk').onclick = () => close(true);
        document.getElementById('sysConfirmCancel').onclick = () => close(false);
    });
}
function showPrompt(msg, placeholder = '') {
    return new Promise(resolve => {
        const inp = document.getElementById('sysPromptInput');
        const close = (v) => { document.getElementById('sysPromptModal').style.display = 'none'; resolve(v); };
        window._sysPromptResolve = (v) => close(v);
        document.getElementById('sysPromptMsg').textContent = msg;
        inp.value = ''; inp.placeholder = placeholder || 'اكتب هنا...';
        document.getElementById('sysPromptModal').style.display = 'flex';
        setTimeout(() => inp.focus(), 80);
        document.getElementById('sysPromptOk').onclick = () => close(inp.value.trim() || null);
        document.getElementById('sysPromptCancel').onclick = () => close(null);
    });
}

let _cropperInstance = null;
let _cropTarget = null; // 'avatar' | 'cover'
let _croppedAvatarBlob = null;
let _croppedCoverBlob = null;

window._cropperInstance = null; // تعريض للـ HTML buttons

window.previewFile = (input, previewId) => {
    if (!input.files || !input.files[0]) return;
    _cropTarget = previewId === 'avatarPreview' ? 'avatar' : 'cover';
    const title = _cropTarget === 'avatar' ? 'قص الأفتار' : 'قص الغلاف';
    document.getElementById('cropModalTitle').textContent = title;

    const reader = new FileReader();
    reader.onload = (e) => {
        const cropImg = document.getElementById('cropImage');
        cropImg.src = e.target.result;
        document.getElementById('cropModal').style.display = 'flex';

        if (_cropperInstance) { _cropperInstance.destroy(); _cropperInstance = null; window._cropperInstance = null; }

        cropImg.onload = () => {
            _cropperInstance = new Cropper(cropImg, {
                aspectRatio: _cropTarget === 'avatar' ? 1 : 3,
                viewMode: 1,
                autoCropArea: 0.85,
                movable: true,
                zoomable: true,
                rotatable: false,
                scalable: false,
                responsive: true,
                background: false,
                guides: false,
                highlight: false,
            });
            window._cropperInstance = _cropperInstance;
        };
    };
    reader.readAsDataURL(input.files[0]);
};

window.confirmCrop = () => {
    if (!_cropperInstance) return;
    const isAvatar = _cropTarget === 'avatar';
    const w = isAvatar ? 400 : 1200;
    const h = isAvatar ? 400 : 400;
    _cropperInstance.getCroppedCanvas({ width: w, height: h, imageSmoothingQuality: 'high' })
        .toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            if (isAvatar) {
                _croppedAvatarBlob = blob;
                const p = document.getElementById('avatarPreview');
                p.src = url; p.style.display = 'block';
            } else {
                _croppedCoverBlob = blob;
                const p = document.getElementById('coverPreview');
                const wrap = document.getElementById('coverPreviewWrap');
                p.src = url;
                if (wrap) wrap.style.display = 'block';
            }
            _cropperInstance.destroy(); _cropperInstance = null; window._cropperInstance = null;
            document.getElementById('cropModal').style.display = 'none';
        }, 'image/jpeg', 0.92);
};

window.cancelCrop = () => {
    if (_cropperInstance) { _cropperInstance.destroy(); _cropperInstance = null; window._cropperInstance = null; }
    document.getElementById('cropModal').style.display = 'none';
    if (_cropTarget === 'avatar') document.getElementById('editAvatarFile').value = '';
    else document.getElementById('editCoverFile').value = '';
};

window.showAvatarPopup = (uid, photoURL, name) => {
    const src = photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=300&background=random`;
    document.getElementById('avatarPopupImg').src = src;
    document.getElementById('avatarPopupName').textContent = name;
    document.getElementById('avatarPopupBtn').onclick = () => {
        document.getElementById('avatarPopup').style.display = 'none';
        window.openProfile(uid);
    };
    document.getElementById('avatarPopup').style.display = 'flex';
};

window.showMiniAvatarPreview = (uid, photoURL, name, event) => {
    event.stopPropagation();
    const src = photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=300&background=random`;

    const openProfile = () => {
        window.closeMiniAvatarPopup();
        window.openProfile(uid);
    };

    const img = document.getElementById('miniAvatarImg');
    const nameEl = document.getElementById('miniAvatarName');
    const btn = document.getElementById('miniAvatarOpenBtn');
    const popup = document.getElementById('miniAvatarPopup');
    const overlay = document.getElementById('miniAvatarOverlay');

    img.src = src;
    nameEl.textContent = name;
    img.onclick = openProfile;
    btn.onclick = openProfile;

    overlay.style.display = 'block';
    popup.style.display = 'flex';
};

window.closeMiniAvatarPopup = () => {
    document.getElementById('miniAvatarPopup').style.display = 'none';
    document.getElementById('miniAvatarOverlay').style.display = 'none';
};

window.updateCharCount = (textarea, counterId) => {
    const el = document.getElementById(counterId);
    if (!el) return;
    const len = textarea.value.length;
    el.textContent = `${len}/${MAX_MSG_LENGTH}`;
    el.style.color = len >= MAX_MSG_LENGTH ? 'var(--danger)' : (len >= MAX_MSG_LENGTH * 0.85 ? 'orange' : '#777');
};

async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_PRESET);
    try {
        const res = await fetch(CLOUDINARY_URL, { method: "POST", body: fd });
        if (!res.ok) throw new Error("Cloudinary Error");
        return (await res.json()).secure_url;
    } catch (e) {
        console.error(e);
        alert("تعذر رفع الصورة، تحقق من اتصالك بالإنترنت");
        return null;
    }
}

const isSuperAdmin = (uid) => SUPER_ADMINS.includes(uid || currentUser?.uid);
const isModerator = () => currentUser && (isSuperAdmin(currentUser.uid) || currentUser.isModerator === true);

// ─── Lightbox ────────────────────────────────────────────
window.openCoverImage = () => {
    if (!currentProfileData?.coverURL) return;
    const img = document.getElementById("modalImage");
    img.style.width = '100%';
    img.style.height = '165px';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '165px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '0';
    openLightbox(currentProfileData.coverURL);
};
window.openAvatarImage = () => {
    const img = document.getElementById("modalImage");
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '95%';
    img.style.maxHeight = '92vh';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '';
    const src = currentProfileData?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentProfileData?.name || 'U')}&size=300`;
    openLightbox(src);
};
function openLightbox(src) {
    const modal = document.getElementById("imageModal");
    document.getElementById("modalImage").src = src;
    modal.style.display = "flex";
}

// ─── المصادقة ─────────────────────────────────────────────
window.signup = async () => {
    if (localStorage.getItem("acc_created")) return alert("حساب واحد فقط للجهاز");
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    if (!email || !pass) return alert("أدخل البيانات");
    showLoading(true);
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const gen = email.split('@')[0].replace(/[^\w]/g, '') + Math.floor(Math.random() * 1000);
        await setDoc(doc(db, "users", cred.user.uid), {
            name: email.split('@')[0], username: gen, email,
            photoURL: null, coverURL: null, bio: "واحد جديد 🥳",
            joinDate: serverTimestamp(), allowDM: true,
            blockedUsers: [], blockedByUsers: [], isBanned: false, isModerator: false
        });
        await setDoc(doc(db, "usernames", gen), { uid: cred.user.uid });
        // رسالة ترحيب للمستخدم الجديد
        addDoc(collection(db, "users", cred.user.uid, "notifications"), {
            type: "welcome", fromName: "Chat Slayer",
            message: "أهلاً بك في Chat Slayer! نتمنى لك وقتاً ممتعاً 🎉",
            createdAt: serverTimestamp(), read: false
        }).catch(() => {});
        await sendEmailVerification(cred.user);
        localStorage.setItem("acc_created", "true");
        alert("تم التسجيل! راجع بريدك لتفعيل الحساب.");
        await signOut(auth);
    } catch (e) { console.error(e); alert("خطأ: " + e.message); }
    finally { showLoading(false); }
};

window.login = async () => {
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    if (!email || !pass) return alert("البيانات ناقصة");
    showLoading(true);
    try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        if (!cred.user.emailVerified) {
            alert("الحساب غير مفعل. فعّل بريدك الإلكتروني.");
            await signOut(auth);
        }
    } catch (e) { console.error(e); alert("خطأ: " + e.message); }
    finally { showLoading(false); }
};

window.loginGoogle = async () => {
    const btn = document.querySelector('.google-btn');
    const resetBtn = () => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-google"></i> استمرار بجوجل'; }
    };
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...'; }

    // ───────────────────────────────────────────────────────────────
    // بيئة Cordova / APK: انتظر deviceready أولاً ثم استخدم البلاجن
    // يفتح نافذة Google الرسمية للنظام (لا WebView) ويُعيد idToken
    // ───────────────────────────────────────────────────────────────
    await _deviceReadyPromise;
    if (isWebView() && window.plugins?.googleplus) {
        window.plugins.googleplus.login(
            {
                webClientId: WEB_CLIENT_ID,
                offline: true   // نطلب serverAuthCode أيضاً إذا احتجناه مستقبلاً
            },
            async (userData) => {
                try {
                    // userData.idToken هو الـ JWT الصادر من Google
                    const credential = GoogleAuthProvider.credential(userData.idToken);
                    await signInWithCredential(auth, credential);
                    // onAuthStateChanged سيتولى الباقي تلقائياً
                } catch (firebaseErr) {
                    resetBtn();
                    showAlert('خطأ Firebase: ' + firebaseErr.message);
                }
            },
            (err) => {
                resetBtn();
                // تجاهل إلغاء المستخدم بصمت
                const cancelMsgs = ['The user canceled the sign-in flow.', '12501', 'Sign in action cancelled'];
                if (!cancelMsgs.some(m => String(err).includes(m))) {
                    showAlert('خطأ في تسجيل الدخول: ' + err);
                }
            }
        );
        return;
    }

    // ───────────────────────────────────────────────────────────────
    // بيئة المتصفح العادي: Popup أولاً، ثم Redirect كاحتياطي
    // ───────────────────────────────────────────────────────────────
    try {
        await signInWithPopup(auth, googleProvider);
        // onAuthStateChanged سيتولى الباقي تلقائياً
    } catch (e) {
        const ignoredCodes = [
            'auth/popup-closed-by-user',
            'auth/cancelled-popup-request',
            'auth/user-cancelled'
        ];
        if (e.code === 'auth/popup-blocked') {
            try {
                await signInWithRedirect(auth, googleProvider);
            } catch (e2) {
                resetBtn();
                showAlert('خطأ في تسجيل الدخول: ' + (e2.message || e.message));
            }
        } else if (ignoredCodes.includes(e.code)) {
            resetBtn();
        } else {
            resetBtn();
            showAlert('خطأ في تسجيل الدخول: ' + e.message);
        }
    }
};

// معالجة نتيجة الـ redirect (احتياطي عند منع النوافذ المنبثقة)
getRedirectResult(auth).then(result => {
    if (result?.user) console.log("تسجيل دخول ناجح عبر redirect");
}).catch(e => {
    const silentCodes = [
        'auth/no-auth-event', 'auth/null-user',
        'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'
    ];
    if (!silentCodes.includes(e.code))
        console.error("redirect result:", e.code);
});

window.logout = async () => {
    if (unsubscribePosts) { unsubscribePosts(); unsubscribePosts = null; }
    if (unsubscribeReplies) { unsubscribeReplies(); unsubscribeReplies = null; }
    if (unsubscribeCurrentUser) { unsubscribeCurrentUser(); unsubscribeCurrentUser = null; }
    if (unsubscribeReports) { unsubscribeReports(); unsubscribeReports = null; }
    currentUser = null; currentThreadId = null; isAnonymousMode = false;
    blockedUsersList = []; blockedByUsersList = []; hiddenAnonUsers = [];
    reactionsMap.clear(); replyCountMap.clear();
    _personalUnread = 0; _broadcastUnread = 0;
    const ml = document.getElementById("messagesList");
    const nl = document.getElementById("notificationsList");
    if (ml) ml.innerHTML = '';
    if (nl) nl.innerHTML = '';
    const emailEl = document.getElementById("email");
    const passEl = document.getElementById("password");
    if (emailEl) emailEl.value = "";
    if (passEl) passEl.value = "";
    const googleBtn = document.querySelector('.google-btn');
    if (googleBtn) { googleBtn.disabled = false; googleBtn.innerHTML = '<i class="fab fa-google"></i> استمرار بجوجل'; }
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const authSection = document.getElementById("auth");
    if (authSection) authSection.style.display = "flex";
    showLoading(false);
    try { await signOut(auth); } catch(e) { console.error(e); }
};

// مراقب مستمر لوثيقة المستخدم الحالي (يكتشف تغييرات isModerator فور حدوثها)
function watchCurrentUser(uid) {
    if (unsubscribeCurrentUser) unsubscribeCurrentUser();
    unsubscribeCurrentUser = onSnapshot(doc(db, "users", uid), (snap) => {
        if (!snap.exists() || !currentUser) return;
        const data = snap.data();
        currentUser.isModerator  = data.isModerator;
        currentUser.isTrusted   = data.isTrusted;
        currentUser.isBanned    = data.isBanned;
        currentUser.isBadBehavior = data.isBadBehavior || false;
        blockedUsersList   = data.blockedUsers   || [];
        blockedByUsersList = data.blockedByUsers || [];
        hiddenAnonUsers    = data.hiddenAnonUsers || [];
        // منع صاحب السلوك السيئ من استخدام وضع المجهول حتى من الإعدادات
        if (currentUser.isBadBehavior && settingsAnonMode) {
            settingsAnonMode = false;
            localStorage.setItem('settingsAnonMode', 'false');
            _updateAnonUI();
            _updateSettingsToggles();
        }
        if (data.isBanned) {
            alert("تم حظر حسابك.");
            signOut(auth).then(() => location.reload());
            return;
        }
        // زر البلاغات للمشرفين
        const isNowMod = isModerator();
        const reportsBtn = document.getElementById("reportsBtnWrapper");
        if (isNowMod) { reportsBtn.style.display = "inline-flex"; monitorReports(); }
        else            reportsBtn.style.display = "none";
        // زر البث للسوبر أدمن فقط
        const broadcastBtn = document.getElementById("broadcastBtnWrapper");
        if (broadcastBtn) broadcastBtn.style.display = isSuperAdmin(uid) ? "inline-flex" : "none";
    });
}

onAuthStateChanged(auth, async (user) => {
    showLoading(true);
    const isGoogle = user?.providerData?.some(p => p.providerId === 'google.com');

    if (user && (user.emailVerified || isGoogle)) {
        try {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                currentUser = snap.data();
                currentUser.uid = user.uid;
            } else {
                // معالجة الحسابات الجديدة عند التسجيل أول مرة بجوجل بأمان
                const safeEmail = user.email || "user@animechat.com";
                const baseName = safeEmail.split('@')[0].replace(/[^\w\u0600-\u06FF]/g, '');
                const gUser = (baseName || "user") + Math.floor(1000 + Math.random() * 9000);

                const nd = {
                    name: user.displayName || "مستخدم جديد",
                    username: gUser,
                    email: safeEmail,
                    photoURL: user.photoURL || null,
                    coverURL: null,
                    bio: "مستخدم جديد 🥳",
                    joinDate: serverTimestamp(),
                    allowDM: true,
                    blockedUsers: [],
                    blockedByUsers: [],
                    isBanned: false,
                    isModerator: false
                };

                // حفظ بيانات المستخدم الأساسية أولاً
                await setDoc(userRef, nd);

                // رسالة ترحيب للمستخدم الجديد عبر Google
                addDoc(collection(db, "users", user.uid, "notifications"), {
                    type: "welcome", fromName: "Chat Slayer",
                    message: "أهلاً بك في Chat Slayer! نتمنى لك وقتاً ممتعاً 🎉",
                    createdAt: serverTimestamp(), read: false
                }).catch(() => {});

                // محاولة حفظ اليوزرنيم بشكل منفصل لمنع انهيار الحساب إذا فشلت
                try {
                    await setDoc(doc(db, "usernames", gUser), { uid: user.uid });
                } catch (usernameErr) {
                    console.warn("تعذر حفظ اليوزرنيم في usernames، الحساب الأساسي جاهز.", usernameErr);
                }

                currentUser = nd;
                currentUser.uid = user.uid;
            }

            if (currentUser.isBanned) {
                alert("تم حظر حسابك.");
                await signOut(auth);
                showLoading(false);
                return;
            }

            blockedUsersList = currentUser.blockedUsers || [];
            blockedByUsersList = currentUser.blockedByUsers || [];

            const headerPic = document.getElementById("headerProfilePic");
            if (headerPic) {
                headerPic.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}`;
            }

            // مراقب مستمر لاكتشاف أي تغيير في الأدوار فور حدوثه
            watchCurrentUser(user.uid);
            await loadUserReactions();
            showScreen("chat");
            loadPosts();
            initPullToRefresh();
            setupNotifications();
            _updateSettingsToggles();
            _updateAnonUI();

        } catch (err) {
            console.error("تفاصيل خطأ جلب البيانات:", err);
            alert("حدث خطأ في جلب البيانات، يرجى تحديث الصفحة والمحاولة مجدداً.");
        }
    } else {
        if (unsubscribeCurrentUser) { unsubscribeCurrentUser(); unsubscribeCurrentUser = null; }
        const authSection = document.getElementById("auth");
        if (authSection) authSection.style.display = "flex";
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    }
    showLoading(false);
});

// ─── المنشورات ────────────────────────────────────────────
window.manualRefresh = () => {
    spinRefreshIcon('mainRefreshIcon');
    loadPosts();
};

// ─── Pull-to-Refresh ──────────────────────────────────────
function setupPullToRefresh(listId, ptrId, onRefresh) {
    const el = document.getElementById(listId);
    const ptr = document.getElementById(ptrId);
    if (!el || !ptr) return;
    let startY = 0, pulling = false, refreshing = false;
    el.addEventListener('touchstart', e => {
        if (el.scrollTop === 0) { startY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });
    el.addEventListener('touchend', () => {
        if (pulling && !refreshing) {
            pulling = false;
            ptr.style.display = 'none';
        }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
        if (!pulling || refreshing) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 60 && el.scrollTop === 0) {
            refreshing = true; pulling = false;
            ptr.style.display = 'block';
            setTimeout(() => {
                ptr.style.display = 'none';
                refreshing = false;
                onRefresh();
            }, 700);
        }
    }, { passive: true });
}

function initPullToRefresh() {
    setupPullToRefresh('messagesList', 'ptr-home', () => {
        spinRefreshIcon('mainRefreshIcon');
        loadPosts();
    });
    setupPullToRefresh('repliesList', 'ptr-replies', () => {
        if (window.refreshReplies) window.refreshReplies();
    });
    setupPullToRefresh('notificationsList', 'ptr-notif', () => {
        if (window.refreshNotifications) window.refreshNotifications();
    });
}

window.setFilter = (type, elem) => {
    document.querySelectorAll('#chat .filter-chip').forEach(c => c.classList.remove('active'));
    elem.classList.add('active');
    currentPostsFilter = type;
    postsLimit = 20;
    lastVisiblePost = null;
    loadPosts(type);
};

function loadPosts(filter = 'newest') {
    if (unsubscribePosts) unsubscribePosts();
    document.getElementById("messagesList").innerHTML = '';
    replyCountMap.clear();
    currentPostsFilter = filter;
    const dir = filter === 'oldest' ? "asc" : "desc";
    const q = query(collection(db, "posts"), orderBy("createdAt", dir), limit(postsLimit));
    let retryTimeout = null;
    const subscribe = () => {
        if (unsubscribePosts) unsubscribePosts();
        unsubscribePosts = onSnapshot(q, (snap) => {
            if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
            if (!snap.empty) lastVisiblePost = snap.docs[snap.docs.length - 1];
            _handlePostsSnap(snap);
            // إظهار/إخفاء زر "تحميل المزيد"
            const moreBtn = document.getElementById('loadMoreBtn');
            if (moreBtn) moreBtn.style.display = snap.docs.length >= postsLimit ? 'block' : 'none';
        }, (err) => {
            console.warn("خطأ في مستمع المنشورات، إعادة الاتصال...", err);
            retryTimeout = setTimeout(subscribe, 4000);
        });
    };
    subscribe();
}

window.loadMorePosts = async () => {
    if (!lastVisiblePost) return;
    const btn = document.getElementById('loadMoreBtn');
    if (btn) btn.textContent = 'جاري التحميل...';
    postsLimit += 20;
    loadPosts(currentPostsFilter);
};
function _handlePostsSnap(snap) {
    const el = document.getElementById("messagesList");
    if (!el) return;

    const orderedIds = [];
    const dataMap = new Map();
    snap.forEach(d => {
        const data = d.data();
        // المحجوب لا يرى أي شيء من الحاجب (حتى المجهول)
        const theyBlockedMe = blockedByUsersList.includes(data.uid);
        if (theyBlockedMe) return;
        // الحاجب يرى المنشورات المجهولة للمحجوب لكن لا يرى المنشورات العادية
        const iBlockedThem = blockedUsersList.includes(data.uid);
        if (iBlockedThem && !data.isAnonymous) return;
        // إخفاء مجهولين محددين كلياً من الفيد (بدون وِيل - إخفاء تام)
        if (data.isAnonymous && data.uid !== currentUser?.uid && hiddenAnonUsers.includes(data.uid)) return;
        // إخفاء الكل عدا منشورات المحضورين المجهولة (نريد رؤية ما يكتبون)
        if (hideAnonMode && data.isAnonymous && data.uid !== currentUser?.uid && !blockedUsersList.includes(data.uid)) return;
        // إخفاء منشورات ون بيس (السوبر أدمن) إذا فعّل المستخدم هذا الخيار
        if (hideOnePiecePosts && isSuperAdmin(data.uid) && data.uid !== currentUser?.uid) return;
        orderedIds.push(d.id);
        dataMap.set(d.id, data);
    });

    // حذف المنشورات التي أُزيلت
    [...el.querySelectorAll('.post-card')].forEach(card => {
        const cardId = card.id.replace('post-', '');
        if (!dataMap.has(cardId)) card.remove();
    });

    // إضافة أو تحديث المنشورات
    orderedIds.forEach((postId, index) => {
        const data = dataMap.get(postId);
        let card = document.getElementById(`post-${postId}`);

        if (!card) {
            const div = document.createElement('div');
            div.innerHTML = createPostHTML(postId, data, false);
            card = div.firstElementChild;
            const allCards = [...el.querySelectorAll('.post-card')];
            if (index >= allCards.length) {
                el.appendChild(card);
            } else {
                el.insertBefore(card, allCards[index]);
            }
            parseTwemoji(card);
        } else {
            const rKey = reactionKey(postId, false);
            const myR = reactionsMap.get(rKey);
            const likeBtn = card.querySelector('.like-btn');
            const dislikeBtn = card.querySelector('.dislike-btn');
            if (likeBtn) {
                const isL = myR === 'like';
                likeBtn.classList.toggle('active', isL);
                const li = likeBtn.querySelector('i');
                if (li) li.className = isL ? 'fas fa-heart' : 'far fa-heart';
            }
            if (dislikeBtn) {
                const isD = myR === 'dislike';
                dislikeBtn.classList.toggle('active', isD);
                const di = dislikeBtn.querySelector('i');
                if (di) di.className = isD ? 'fas fa-thumbs-down' : 'far fa-thumbs-down';
            }
            // تحديث عداد الردود من Firestore دائماً
            if (data.replyCount !== undefined) {
                const localCount = replyCountMap.get(postId);
                const serverCount = data.replyCount;
                const displayCount = (localCount !== undefined && localCount > serverCount) ? localCount : serverCount;
                replyCountMap.set(postId, displayCount);
                const rcSpan = card.querySelector('.rc');
                if (rcSpan) rcSpan.textContent = displayCount;
            }
            const allCards = [...el.querySelectorAll('.post-card')];
            if (allCards[index] !== card) {
                if (index >= allCards.length) el.appendChild(card);
                else el.insertBefore(card, allCards[index]);
            }
        }
    });

    if (orderedIds.length === 0) el.innerHTML = '';

    if (el && el.scrollTop < 200) {
        el.scrollTop = 0;
    }
}

function renderMentions(text) {
    // يدعم الأسماء التي تحتوي على نقطة أو شرطة أو أرقام مع منع النقطة في النهاية
    return text.replace(/@([\u0600-\u06FFa-zA-Z\d][\u0600-\u06FFa-zA-Z\d_.]*)/g,
        (match, name) => {
            const cleanName = name.replace(/\.+$/, ''); // إزالة النقاط من نهاية الاسم
            return `<span class="mention-badge" onclick="window.findProfileByName('${safeEsc(cleanName)}')">${match}</span>`;
        }
    );
}

// ─── كاش التفاعلات في localStorage (لضمان البقاء بعد إعادة التحميل) ──────
function _rxCacheKey() { return `rxmap_${currentUser?.uid || ''}`; }
function _saveRxCache() {
    try {
        if (!currentUser) return;
        const obj = {};
        reactionsMap.forEach((v, k) => { obj[k] = v; });
        localStorage.setItem(_rxCacheKey(), JSON.stringify(obj));
    } catch (_) {}
}
function _loadRxCache() {
    try {
        const raw = localStorage.getItem(_rxCacheKey());
        if (!raw) return;
        Object.entries(JSON.parse(raw)).forEach(([k, v]) => reactionsMap.set(k, v));
    } catch (_) {}
}

// تحميل تفاعلات المستخدم من Firestore مع كاش localStorage للبقاء الفوري
async function loadUserReactions() {
    reactionsMap.clear();
    // 1) تحميل فوري من الكاش المحلي
    _loadRxCache();
    try {
        // 2) تحميل موثوق من Firestore ويُحدِّث الكاش
        const snap = await getDocs(collection(db, "users", currentUser.uid, "reactions"));
        reactionsMap.clear();
        snap.forEach(d => reactionsMap.set(d.id, d.data().type));
        _saveRxCache();
    } catch (_) {}
}

function reactionKey(id, isReply) {
    return (isReply === true || isReply === 'true') ? `${id}_r` : id;
}

function createPostHTML(id, data, isReply) {
    const rKey = reactionKey(id, isReply);
    const myReaction = reactionsMap.get(rKey);
    const isLiked = myReaction === 'like';
    const isDisliked = myReaction === 'dislike';
    const text = renderMentions(data.text || ""); // parseTwemoji يتولى الإيموجي بعد إدراج الـ DOM
    const isSA = isSuperAdmin(data.uid);
    const isMod = data.isModerator && !isSA;
    const isTrusted = data.isTrusted && !isSA && !isMod;
    const isBadBehavior = !!data.isBadBehavior;
    const isAnon = !!data.isAnonymous;
    const isFromSettingsAnon = !!data.fromSettingsAnon;
    const isMyAnon = isAnon && data.uid === currentUser.uid;
    const iAmSA = isSuperAdmin(currentUser.uid);
    const canDelete = currentUser.uid === data.uid || (isModerator() && !isSA);
    const canEdit = currentUser.uid === data.uid && !isAnon;
    const canReport = currentUser.uid !== data.uid;
    const canReplyArrow = isReply && data.uid !== currentUser.uid;

    const avatarSrc = isAnon
        ? 'https://ui-avatars.com/api/?name=?&background=333&color=aaa'
        : (data.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.user || 'U'));
    const avatarClick = (isAnon && !isMyAnon) ? '' : `onclick="window.showMiniAvatarPreview('${data.uid}','${safeEsc(data.photoURL||'')}','${safeEsc(data.user||'')}',event)"`;
    const nameClick = (isAnon && !isMyAnon) ? '' : `onclick="window.openProfile('${data.uid}')"`;

    const makeBadge = (color, icon, label) =>
        `<span class="badge-wrap" onclick="event.stopPropagation();window.toggleBadgeLabel(this)" style="display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;line-height:1;vertical-align:middle;">` +
        `<i class="${icon}" style="color:${color};font-size:.9rem;"></i>` +
        `<span class="badge-label" style="display:none;color:${color};font-size:.58rem;white-space:nowrap;margin-top:1px;">${label}</span>` +
        `</span>`;

    const isOnePiece = isSA && !isAnon;
    const badgeHtml = !isAnon ? [
        isSA        ? makeBadge('gold',    'fas fa-check-circle',      'سوبر ادمن') : '',
        isOnePiece  ? makeBadge('#f97316', 'fas fa-hat-wizard',        'ون بيس') : '',
        isMod       ? makeBadge('#60a5fa', 'fas fa-check-circle',      'مشرف') : '',
        isTrusted   ? makeBadge('#4ade80', 'fas fa-check-circle',      'موثوق') : '',
        isBadBehavior ? makeBadge('#f4212e','fas fa-exclamation-circle','صاحب الحساب ذو سلوك سيئ انتبه') : ''
    ].join('') : '';

    const saAnonBtn = (isAnon && iAmSA && data.uid)
        ? `<div style="margin-top:5px;"><button class="act-btn" style="color:gold;font-size:.75rem" onclick="window.showAnonAuthor('${data.uid}',this)"><i class="fas fa-eye"></i> كشف الكاتب</button></div>`
        : '';
    // أزرار التفاعل المشتركة
    const reactionBtns = `
        <button class="act-btn like-btn ${isLiked ? 'active' : ''}" onclick="window.toggleReaction('${id}',${isReply},'like')">
            <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> <span class="lc">${data.likesCount || 0}</span>
        </button>
        <button class="act-btn dislike-btn ${isDisliked ? 'active' : ''}" onclick="window.toggleReaction('${id}',${isReply},'dislike')">
            <i class="${isDisliked ? 'fas' : 'far'} fa-thumbs-down"></i> <span class="dc">${data.dislikesCount || 0}</span>
        </button>`;

    const contentHtml = `
        <div class="post-text">${text}</div>
        <div class="post-actions">
            ${reactionBtns}
            ${!isReply ? `<button class="act-btn" onclick="window.openThread('${id}')"><i class="far fa-comment"></i> <span class="rc">${replyCountMap.has(id) ? replyCountMap.get(id) : (data.replyCount || 0)}</span></button>` : ''}
            ${canReplyArrow ? `<button class="act-btn" onclick="window.replyWithMention('${safeEsc(data.user || '')}','${id}')"><i class="fas fa-share"></i></button>` : ''}
            ${canEdit ? `<button class="act-btn" onclick="window.openEditPostModal('${id}','${safeEsc(data.text)}',${isReply})"><i class="fas fa-edit"></i></button>` : ''}
            ${canDelete ? `<button class="act-btn" style="color:var(--danger)" onclick="window.deletePost('${id}',${isReply})"><i class="fas fa-trash"></i></button>` : ''}
            ${canReport ? `<button class="act-btn" onclick="window.reportPost('${id}','${data.uid}',${isReply})"><i class="far fa-flag"></i></button>` : ''}
        </div>`;

    return `
    <div class="post-card${isAnon ? ' anon-card' : ''}" id="post-${id}">
        <img src="${avatarSrc}" class="avatar" ${(isAnon && !isMyAnon) ? '' : avatarClick} style="cursor:${(isAnon && !isMyAnon) ? 'default' : 'pointer'};">
        <div class="post-content">
            <div class="user-info">
                <span class="username" ${(isAnon && !isMyAnon) ? '' : nameClick} style="cursor:${(isAnon && !isMyAnon) ? 'default' : 'pointer'};display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;">
                    ${isAnon ? '<span style="color:#a78bfa">مجهول</span>' : (data.user || '')}
                    ${badgeHtml}
                </span>
                <span style="color:#777;font-size:.8rem">${timeAgo(data.createdAt?.toDate())}</span>
            </div>
            ${contentHtml}
            ${saAnonBtn}
        </div>
    </div>`;
}

// ─── المنشن باللقب ────────────────────────────────────────
// يضع @لقب_المستخدم في حقل الرد
window.replyWithMention = (displayName, id) => {
    const input = document.getElementById("replyInput");
    // استبدل المسافات بشرطة سفلية حتى يعمل الذكر بشكل صحيح
    const mentionKey = displayName.trim().replace(/\s+/g, '_');
    input.value = `@${mentionKey} ` + input.value;
    input.focus();
    window.updateCharCount(input, "replyCharCount");
};

// يبحث عن المستخدم بالاسم (مع دعم الشرطة السفلية بدل المسافة) أو اليوزرنيم
window.findProfileByName = async (rawName) => {
    showLoading(true);
    // حوّل الشرطة السفلية لمسافة للبحث بالاسم الحقيقي
    const name = rawName.replace(/_/g, ' ');
    try {
        // بحث بالاسم الأصلي
        const q1 = query(collection(db, "users"), where("name", "==", name), limit(1));
        const s1 = await getDocs(q1);
        if (!s1.empty) { window.openProfile(s1.docs[0].id); return; }
        // بحث باليوزرنيم (بدون تحويل)
        const unSnap = await getDoc(doc(db, "usernames", rawName));
        if (unSnap.exists()) { window.openProfile(unSnap.data().uid); return; }
        // بحث باليوزرنيم (مع تحويل)
        if (rawName !== name) {
            const unSnap2 = await getDoc(doc(db, "usernames", name));
            if (unSnap2.exists()) { window.openProfile(unSnap2.data().uid); return; }
        }
        alert("المستخدم غير موجود");
    } catch (e) { console.error(e); }
    finally { showLoading(false); }
};

// ─── معالجة المنشنات عند الإرسال ─────────────────────────
// ترسل إشعارات الذكر وتُعيد Set بـ UIDs المذكورين (بدون المستخدم الحالي)
async function handleMentions(text, postId, isReply) {
    const regex = /@([\u0600-\u06FFa-zA-Z\d][\u0600-\u06FFa-zA-Z\d_.]*)/g;
    let match;
    const seenKeys = new Set();
    const mentionedUids = new Set();
    while ((match = regex.exec(text)) !== null) {
        const rawKey = match[1].replace(/\.+$/, '').trim(); // إزالة النقاط من النهاية
        if (!rawKey || seenKeys.has(rawKey)) continue;
        seenKeys.add(rawKey);
        const nameKey = rawKey.replace(/_/g, ' ');
        try {
            let targetUid = null;
            const nameQ = query(collection(db, "users"), where("name", "==", nameKey), limit(1));
            const nameSnap = await getDocs(nameQ);
            if (!nameSnap.empty) {
                targetUid = nameSnap.docs[0].id;
            } else {
                const unSnap = await getDoc(doc(db, "usernames", rawKey));
                if (unSnap.exists()) targetUid = unSnap.data().uid;
            }
            if (targetUid && targetUid !== currentUser.uid) {
                mentionedUids.add(targetUid);
                addDoc(collection(db, "users", targetUid, "notifications"), {
                    type: "mention", fromUid: currentUser.uid, fromName: currentUser.name,
                    mentionedName: nameKey, postId,
                    threadId: isReply ? currentThreadId : null,
                    isReply: !!isReply, createdAt: serverTimestamp(), read: false
                }).catch(() => {});
            }
        } catch (e) { console.error("mention error:", e); }
    }
    return mentionedUids;
}

// ─── الإرسال ──────────────────────────────────────────────
const POST_COOLDOWN_NORMAL   = 3600000;   // ساعة للجميع
const POST_COOLDOWN_BAD      = 36000000;  // 10 ساعات لسيئ السلوك
const getPostCooldown = () => currentUser?.isBadBehavior ? POST_COOLDOWN_BAD : POST_COOLDOWN_NORMAL;

window.sendMainMessage = async () => {
    if (isSending) return;
    const txt = document.getElementById("mainInput").value.trim();
    if (!txt) return;
    if (txt.length > MAX_MSG_LENGTH) return alert(`الحد الأقصى ${MAX_MSG_LENGTH} حرف.`);
    if (!isSuperAdmin(currentUser.uid)) {
        const last = Number(localStorage.getItem("lastPost") || 0);
        if (last && Date.now() - last < getPostCooldown()) {
            startMainCountdown();
            return;
        }
    }
    const ml = document.getElementById("messagesList");
    if (ml) ml.scrollTop = 0;
    localStorage.setItem("lastPost", Date.now());
    startMainCountdown();
    isSending = true;
    try {
        const postAsAnon = isAnonymousMode || settingsAnonMode;
        const ref = await addDoc(collection(db, "posts"), {
            text: txt,
            uid: currentUser.uid,
            user: postAsAnon ? 'مجهول' : currentUser.name,
            username: postAsAnon ? '' : (currentUser.username || ''),
            photoURL: postAsAnon ? null : (currentUser.photoURL || null),
            isAnonymous: postAsAnon,
            fromSettingsAnon: settingsAnonMode || false,
            isTrusted: currentUser.isTrusted || false,
            createdAt: serverTimestamp(), likes: [], dislikes: [],
            likesCount: 0, dislikesCount: 0, replyCount: 0,
            isModerator: postAsAnon ? false : isModerator()
        });
        document.getElementById("mainInput").value = "";
        window.updateCharCount(document.getElementById("mainInput"), "mainCharCount");
        if (postAsAnon) {
            const key = settingsAnonMode ? `settingsAnonPosts_${currentUser.uid}` : `anonPosts_${currentUser.uid}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            list.push(ref.id);
            localStorage.setItem(key, JSON.stringify(list));
            if (isAnonymousMode && !settingsAnonMode) {
                isAnonymousMode = false;
                _updateAnonUI();
            }
        } else {
            await handleMentions(txt, ref.id, false);
        }
    } catch (e) {
        console.error(e);
        localStorage.removeItem("lastPost");
    } finally {
        isSending = false;
    }
};

window.sendAsAnonymousMain = () => window.toggleSettingsAnon();
window.sendAsAnonymousReply = () => window.toggleSettingsAnon();

function startMainCountdown() {
    const btn = document.getElementById("sendBtnMain");
    if (!btn) return;
    if (mainCountdownInterval) clearInterval(mainCountdownInterval);
    if (isSuperAdmin(currentUser?.uid)) return;

    const tick = () => {
        const last = Number(localStorage.getItem("lastPost") || 0);
        const rem = Math.ceil((getPostCooldown() - (Date.now() - last)) / 60000);
        if (rem <= 0) {
            clearInterval(mainCountdownInterval);
            mainCountdownInterval = null;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            btn.disabled = false;
            btn.style.background = 'var(--primary)';
        } else {
            btn.innerHTML = `<span style="font-size:.72rem;font-weight:bold;line-height:1">${rem}<br><span style="font-size:.6rem">د</span></span>`;
            btn.disabled = true;
            btn.style.background = '#444';
        }
    };
    tick();
    mainCountdownInterval = setInterval(tick, 10000);
}

window.sendReply = async () => {
    if (isSending || !currentThreadId) return;

    // تحقق من الكولداون
    if (!isSuperAdmin(currentUser.uid)) {
        const last = Number(localStorage.getItem("lastReply") || 0);
        if (last && Date.now() - last < REPLY_COOLDOWN) {
            const rem = Math.ceil((REPLY_COOLDOWN - (Date.now() - last)) / 1000);
            return alert(`انتظر ${rem} ثانية قبل الرد التالي`);
        }
    }

    const txt = document.getElementById("replyInput").value.trim();
    if (!txt) return;
    if (txt.length > MAX_MSG_LENGTH) return alert(`الحد الأقصى ${MAX_MSG_LENGTH} حرف.`);

    // افرغ الحقل فوراً وسجل الوقت قبل الانتظار
    document.getElementById("replyInput").value = "";
    window.updateCharCount(document.getElementById("replyInput"), "replyCharCount");
    localStorage.setItem("lastReply", Date.now());
    startReplyCountdown();

    isSending = true;
    let replyRef;
    const replyAsAnon = isAnonymousMode || settingsAnonMode;
    try {
        replyRef = await addDoc(collection(db, "posts", currentThreadId, "replies"), {
            text: txt,
            uid: currentUser.uid,
            user: replyAsAnon ? 'مجهول' : currentUser.name,
            username: replyAsAnon ? '' : (currentUser.username || ''),
            photoURL: replyAsAnon ? null : (currentUser.photoURL || null),
            isAnonymous: replyAsAnon,
            fromSettingsAnon: settingsAnonMode || false,
            isTrusted: currentUser.isTrusted || false,
            createdAt: serverTimestamp(), likes: [], dislikes: [],
            likesCount: 0, dislikesCount: 0,
            isModerator: replyAsAnon ? false : isModerator()
        });
        if (replyAsAnon) {
            const key = settingsAnonMode ? `settingsAnonReplies_${currentUser.uid}` : `anonReplies_${currentUser.uid}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            list.push({ threadId: currentThreadId, replyId: replyRef.id });
            localStorage.setItem(key, JSON.stringify(list));
            if (isAnonymousMode && !settingsAnonMode) {
                isAnonymousMode = false;
                _updateAnonUI();
            }
        }
    } catch (e) {
        console.error(e);
        isSending = false;
        return;
    }

    // تحديث فوري لعداد الردود في الواجهة قبل انتظار Firestore
    replyCountMap.set(currentThreadId, (replyCountMap.get(currentThreadId) || 0) + 1);
    const rcSpan = document.querySelector(`#post-${currentThreadId} .rc`);
    if (rcSpan) rcSpan.textContent = replyCountMap.get(currentThreadId);
    // تحديث عداد الردود في Firestore
    updateDoc(doc(db, "posts", currentThreadId), { replyCount: increment(1) }).catch(() => {});

    // لا نرسل إشعارات في الوضع المجهول
    if (!replyAsAnon) {
        let mentionedUids = new Set();
        try { mentionedUids = await handleMentions(txt, replyRef.id, true); } catch (_) {}
        try {
            const snap = await getDoc(doc(db, "posts", currentThreadId));
            if (snap.exists() && snap.data().uid !== currentUser.uid) {
                const ownerUid = snap.data().uid;
                if (!mentionedUids.has(ownerUid)) {
                    addDoc(collection(db, "users", ownerUid, "notifications"), {
                        type: "reply", fromUid: currentUser.uid, fromName: currentUser.name,
                        postId: currentThreadId, replyId: replyRef.id,
                        threadId: currentThreadId, isReply: true,
                        createdAt: serverTimestamp(), read: false
                    }).catch(() => {});
                }
            }
        } catch (_) {}
    }

    isSending = false;
};

// مؤقت العد التنازلي على زر الإرسال
function startReplyCountdown() {
    const btn = document.getElementById("sendBtnReply");
    if (!btn) return;
    if (replyCountdownInterval) clearInterval(replyCountdownInterval);

    const tick = () => {
        const last = Number(localStorage.getItem("lastReply") || 0);
        const rem = Math.ceil((REPLY_COOLDOWN - (Date.now() - last)) / 1000);
        if (rem <= 0) {
            clearInterval(replyCountdownInterval);
            replyCountdownInterval = null;
            btn.innerHTML = '<i class="fas fa-reply"></i>';
            btn.disabled = false;
            btn.style.background = 'var(--primary)';
        } else {
            btn.innerHTML = `<span style="font-size:.9rem;font-weight:bold">${rem}</span>`;
            btn.disabled = true;
            btn.style.background = '#444';
        }
    };
    tick();
    replyCountdownInterval = setInterval(tick, 500);
}

// ─── حذف إشعار موجود ─────────────────────────────────────
// نستخدم شرط واحد فقط لتجنب الحاجة لـ composite index في Firestore
async function deleteNotifByType(targetUid, type, postId) {
    try {
        const q = query(
            collection(db, "users", targetUid, "notifications"),
            where("postId", "==", postId),
            limit(20)
        );
        const snap = await getDocs(q);
        if (snap.empty) return;
        const batch = writeBatch(db);
        let hasChanges = false;
        snap.forEach(d => {
            const data = d.data();
            if (data.type === type && data.fromUid === currentUser.uid) {
                batch.delete(d.ref);
                hasChanges = true;
            }
        });
        if (hasChanges) await batch.commit();
    } catch (e) { console.error("deleteNotif error:", e); }
}

// ─── تحديث DOM فوري للتفاعل ───────────────────────────────
function applyReactionDOM(id, type) {
    const card = document.getElementById(`post-${id}`);
    if (!card) return;
    const likeBtn = card.querySelector('.like-btn');
    const dislikeBtn = card.querySelector('.dislike-btn');
    const lcSpan = card.querySelector('.lc');
    const dcSpan = card.querySelector('.dc');

    const wasLiked = likeBtn?.classList.contains('active');
    const wasDisliked = dislikeBtn?.classList.contains('active');

    if (type === 'like') {
        const nowLiked = !wasLiked;
        if (likeBtn) {
            likeBtn.classList.toggle('active', nowLiked);
            likeBtn.querySelector('i').className = nowLiked ? 'fas fa-heart' : 'far fa-heart';
        }
        if (lcSpan) lcSpan.textContent = Math.max(0, parseInt(lcSpan.textContent || 0) + (nowLiked ? 1 : -1));
        if (wasDisliked) {
            dislikeBtn?.classList.remove('active');
            if (dislikeBtn) dislikeBtn.querySelector('i').className = 'far fa-thumbs-down';
            if (dcSpan) dcSpan.textContent = Math.max(0, parseInt(dcSpan.textContent || 0) - 1);
        }
    } else {
        const nowDisliked = !wasDisliked;
        if (dislikeBtn) {
            dislikeBtn.classList.toggle('active', nowDisliked);
            dislikeBtn.querySelector('i').className = nowDisliked ? 'fas fa-thumbs-down' : 'far fa-thumbs-down';
        }
        if (dcSpan) dcSpan.textContent = Math.max(0, parseInt(dcSpan.textContent || 0) + (nowDisliked ? 1 : -1));
        if (wasLiked) {
            likeBtn?.classList.remove('active');
            if (likeBtn) likeBtn.querySelector('i').className = 'far fa-heart';
            if (lcSpan) lcSpan.textContent = Math.max(0, parseInt(lcSpan.textContent || 0) - 1);
        }
    }
}

// ─── التفاعلات (like / dislike موحّدتان) ──────────────────
window.toggleReaction = async (id, isReply, type) => {
    if (!currentUser) return;
    if (isAnonymousMode) return showAlert("لا يمكن التفاعل في وضع المجهول 🚫");
    if (type === 'dislike' && currentUser.isBadBehavior) return showAlert("⚠️ لا يمكن لأصحاب السلوك السيئ استخدام الديس");
    const rKey = reactionKey(id, isReply);
    const current = reactionsMap.get(rKey);
    const isSame = current === type;
    const opposite = type === 'like' ? 'dislike' : 'like';
    const wasOpposite = current === opposite;

    // تحديث فوري للواجهة
    applyReactionDOM(id, type);

    // تحديث الخريطة المحلية وحفظ الكاش فوراً
    if (isSame) reactionsMap.delete(rKey);
    else reactionsMap.set(rKey, type);
    _saveRxCache();

    // حفظ التفاعل في مجموعة المستخدم
    const rRef = doc(db, "users", currentUser.uid, "reactions", rKey);
    try {
        if (isSame) {
            await deleteDoc(rRef);
        } else {
            await setDoc(rRef, {
                type, postId: id,
                isReply: !!(isReply === true || isReply === 'true'),
                threadId: currentThreadId || null,
                at: serverTimestamp()
            });
        }
    } catch (e) { console.error("reaction save error:", e); }

    // تحديث العداد في وثيقة المنشور
    const colPath = (isReply === true || isReply === 'true') ? `posts/${currentThreadId}/replies` : "posts";
    const arrField = type === 'like' ? 'likes' : 'dislikes';
    const cntField = type === 'like' ? 'likesCount' : 'dislikesCount';
    const oppArr   = type === 'like' ? 'dislikes' : 'likes';
    const oppCnt   = type === 'like' ? 'dislikesCount' : 'likesCount';

    const postUpdates = {
        [arrField]: isSame ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        [cntField]: increment(isSame ? -1 : 1)
    };
    if (wasOpposite) {
        postUpdates[oppArr] = arrayRemove(currentUser.uid);
        postUpdates[oppCnt] = increment(-1);
    }
    updateDoc(doc(db, colPath, id), postUpdates).catch(() => {});

    // إشعارات — مستقلة (لا إشعارات على المنشورات المجهولة لحماية الهوية)
    if (!isSame) {
        try {
            const snap = await getDoc(doc(db, colPath, id));
            if (snap.exists() && snap.data().uid !== currentUser.uid && !snap.data().isAnonymous) {
                if (wasOpposite) deleteNotifByType(snap.data().uid, opposite, id);
                addDoc(collection(db, "users", snap.data().uid, "notifications"), {
                    type, fromUid: currentUser.uid, fromName: currentUser.name,
                    postId: id,
                    threadId: (isReply === true || isReply === 'true') ? currentThreadId : null,
                    isReply: !!(isReply === true || isReply === 'true'),
                    createdAt: serverTimestamp(), read: false
                }).catch(() => {});
            }
        } catch (_) {}
    } else {
        try {
            const snap = await getDoc(doc(db, colPath, id));
            if (snap.exists() && !snap.data().isAnonymous) deleteNotifByType(snap.data().uid, type, id);
        } catch (_) {}
    }
};

window.openEditPostModal = (id, text, isReply) => {
    currentEditPostId = { id, isReply };
    document.getElementById("editPostText").value = text;
    document.getElementById("editPostModal").style.display = 'flex';
};

window.submitPostEdit = async () => {
    if (!currentEditPostId) return;
    const newText = document.getElementById("editPostText").value.trim();
    if (!newText) return alert("النص فارغ!");
    if (newText.length > MAX_MSG_LENGTH) return alert(`الحد الأقصى ${MAX_MSG_LENGTH} حرف.`);
    showLoading(true);
    try {
        const ref = doc(db, currentEditPostId.isReply ? `posts/${currentThreadId}/replies` : "posts", currentEditPostId.id);
        await updateDoc(ref, { text: newText });
        document.getElementById("editPostModal").style.display = 'none';
    } catch (e) { console.error(e); alert("فشل التعديل"); }
    finally { showLoading(false); }
};

window.deletePost = async (id, isReply) => {
    if (!(await showConfirm("حذف المنشور؟"))) return;
    try {
        await deleteDoc(doc(db, isReply ? `posts/${currentThreadId}/replies` : "posts", id));
    } catch (e) { console.error(e); return; }
    // تحديث عداد الردود — عملية ثانوية، لا تظهر خطأ
    if (isReply && currentThreadId) {
        updateDoc(doc(db, "posts", currentThreadId), { replyCount: increment(-1) }).catch(() => {});
    }
};

window.reportPost = async (id, uid, isReply) => {
    const reason = await showPrompt("سبب الإبلاغ؟");
    if (reason) {
        await addDoc(collection(db, "reports"), {
            type: "post", postId: id, targetUid: uid, isReply,
            threadId: currentThreadId || null, reason,
            by: currentUser.uid, at: serverTimestamp(), status: 'open'
        });
        await showAlert("تم إرسال البلاغ");
    }
};

// ─── الردود ───────────────────────────────────────────────
// ─── تفضيل المستخدم للتصفية (يُحفظ دائماً) ──────────────
function getReplyFilterPref() { return localStorage.getItem('replyFilterPref') || 'oldest'; }
function setReplyFilterPref(t) { localStorage.setItem('replyFilterPref', t); }
function applyFilterChip(f) {
    document.getElementById("replyChipOldest")?.classList.toggle('active', f === 'oldest');
    document.getElementById("replyChipNewest")?.classList.toggle('active', f === 'newest');
}


window.setReplyFilter = (type, elem) => {
    document.querySelectorAll('#threadView .filter-chip').forEach(c => c.classList.remove('active'));
    elem.classList.add('active');
    currentReplyFilter = type;
    setReplyFilterPref(type); // احفظ تفضيل المستخدم دائماً
    loadReplies(currentThreadId, type);
};

window.refreshReplies = () => {
    spinRefreshIcon('replyRefreshIcon');
    loadReplies(currentThreadId, currentReplyFilter);
};

function loadReplies(id, filter = 'oldest') {
    if (unsubscribeReplies) unsubscribeReplies();
    if (!id) return;
    const dir = filter === 'oldest' ? "asc" : "desc";
    const q = query(collection(db, "posts", id, "replies"), orderBy("createdAt", dir));
    let retryTimeout = null;
    const subscribe = () => {
        if (unsubscribeReplies) unsubscribeReplies();
        unsubscribeReplies = onSnapshot(q, (snap) => {
            if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
            _handleRepliesSnap(snap, id);
        }, (err) => {
            console.warn("خطأ في مستمع الردود، إعادة الاتصال...", err);
            retryTimeout = setTimeout(subscribe, 4000);
        });
    };
    subscribe();
}

function _handleRepliesSnap(snap, id) {
    const el = document.getElementById("repliesList");
    if (!el) return;

    const orderedIds = [];
    const dataMap = new Map();
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        // المحجوب لا يرى أي ردود من الحاجب (حتى المجهولة)
        const theyBlockedMe = blockedByUsersList.includes(data.uid);
        if (theyBlockedMe) return;
        // الحاجب يرى الردود المجهولة للمحجوب فقط (لا العادية)
        const iBlockedThem = blockedUsersList.includes(data.uid);
        if (iBlockedThem && !data.isAnonymous) return;
        // إخفاء مجهولين محددين كلياً من الردود (بدون وِيل - إخفاء تام)
        if (data.isAnonymous && data.uid !== currentUser?.uid && hiddenAnonUsers.includes(data.uid)) return;
        // إخفاء الكل عدا ردود المحضورين المجهولة (نريد رؤية ما يكتبون)
        if (hideAnonMode && data.isAnonymous && data.uid !== currentUser?.uid && !blockedUsersList.includes(data.uid)) return;
        orderedIds.push(d.id);
        dataMap.set(d.id, data);
        count++;
    });

    if (orderedIds.length === 0) {
        if (!snap.metadata.fromCache) {
            el.innerHTML = '<p class="no-replies-msg" style="color:#777;padding:20px;text-align:center;">لا ردود بعد</p>';
        } else if (!el.querySelector('.post-card')) {
            el.innerHTML = '';
        }
    } else {
        el.querySelector('.no-replies-msg')?.remove();
        [...el.querySelectorAll('.post-card')].forEach(card => {
            const cardId = card.id.replace('post-', '');
            if (!dataMap.has(cardId)) card.remove();
        });

        orderedIds.forEach((replyId, index) => {
            const data = dataMap.get(replyId);
            let card = document.getElementById(`post-${replyId}`);

            if (!card) {
                const div = document.createElement('div');
                div.innerHTML = createPostHTML(replyId, data, true);
                card = div.firstElementChild;
                const allCards = [...el.querySelectorAll('.post-card')];
                if (index >= allCards.length) {
                    el.appendChild(card);
                } else {
                    el.insertBefore(card, allCards[index]);
                }
                parseTwemoji(card);
            } else {
                // لا نحدث lc/dc تلقائياً في الردود — فقط عند تفاعل المستخدم أو ريفرش يدوي
                const rKey = reactionKey(replyId, true);
                const myR = reactionsMap.get(rKey);
                const likeBtn = card.querySelector('.like-btn');
                const dislikeBtn = card.querySelector('.dislike-btn');
                if (likeBtn) {
                    const isL = myR === 'like';
                    likeBtn.classList.toggle('active', isL);
                    const li = likeBtn.querySelector('i');
                    if (li) li.className = isL ? 'fas fa-heart' : 'far fa-heart';
                }
                if (dislikeBtn) {
                    const isD = myR === 'dislike';
                    dislikeBtn.classList.toggle('active', isD);
                    const di = dislikeBtn.querySelector('i');
                    if (di) di.className = isD ? 'fas fa-thumbs-down' : 'far fa-thumbs-down';
                }
                const allCards = [...el.querySelectorAll('.post-card')];
                if (allCards[index] !== card) {
                    if (index >= allCards.length) el.appendChild(card);
                    else el.insertBefore(card, allCards[index]);
                }
            }
        });
    }

    replyCountMap.set(id, count);
    // لا نحدث عداد الردود في الواجهة — سيُحدَّث فقط عند الريفرش اليدوي

    if (el) {
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
        if (nearBottom) el.scrollTop = el.scrollHeight;
    }
}

async function openThreadAndScrollToReply(threadId, replyId) {
    currentThreadId = threadId;
    currentReplyFilter = getReplyFilterPref();
    applyFilterChip(currentReplyFilter);
    showScreen("threadView");
    loadReplies(threadId, currentReplyFilter);
    if (replyId) {
        setTimeout(() => {
            const el = document.getElementById(`post-${replyId}`);
            if (!el) return;
            const container = document.getElementById('repliesList');
            // نستخدم scrollTop يدوياً لتجنب قلتش block:center عند قلة المحتوى
            const targetTop = el.offsetTop - 80;
            container.scrollTop = Math.max(0, targetTop);
            el.classList.add('highlight-post');
            setTimeout(() => el.classList.remove('highlight-post'), 2000);
        }, 1200);
    }
}

window.openThreadAndScrollToReply = openThreadAndScrollToReply;

window.closeThread = () => {
    if (unsubscribeReplies) { unsubscribeReplies(); unsubscribeReplies = null; }
    currentThreadId = null;
    const inp = document.getElementById("replyInput");
    if (inp) { inp.value = ""; window.updateCharCount(inp, "replyCharCount"); }
    history.back();
};

window.openThread = (id) => {
    currentThreadId = id;
    currentReplyFilter = getReplyFilterPref();
    applyFilterChip(currentReplyFilter);
    document.getElementById("repliesList").innerHTML = '';
    const last = Number(localStorage.getItem("lastReply") || 0);
    if (!isSuperAdmin(currentUser?.uid) && Date.now() - last < REPLY_COOLDOWN)
        startReplyCountdown();
    history.pushState({ screen: 'chat' }, '', '');
    showScreen("threadView");
    loadReplies(id, currentReplyFilter);
};

// ─── الملف الشخصي ─────────────────────────────────────────
window.openProfile = async (uid) => {
    showLoading(true);
    // تحديد الشاشة الحالية للرجوع إليها لاحقاً
    const screens = ['chat','threadView','notificationsView','searchView','archiveView','settingsView','reportsView'];
    for (const s of screens) {
        const el = document.getElementById(s);
        if (el && el.style.display !== 'none') { previousScreen = s; break; }
    }
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return showAlert("المستخدم غير موجود");
        currentProfileData = snap.data();
        currentProfileData.uid = uid;
        displayProfile(uid, currentProfileData);
        history.pushState({ screen: previousScreen }, '', '');
        showScreen("profileView");
    } catch (e) { console.error(e); }
    finally { showLoading(false); }
};

window.openMyProfile = () => window.openProfile(currentUser.uid);
window.closeProfile = () => history.back();

function displayProfile(uid, data) {
    const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}`;
    document.getElementById("profileAvatar").src = avatar;
    const cover = document.getElementById("profileCover");
    if (data.coverURL) {
        cover.style.backgroundImage = `url(${data.coverURL})`;
        cover.style.cursor = 'zoom-in';
    } else {
        cover.style.backgroundImage = '';
        cover.style.cursor = 'default';
    }
    document.getElementById("profileAvatar").style.cursor = 'zoom-in';
    document.getElementById("profileAvatar").onclick = window.openAvatarImage;
    cover.onclick = data.coverURL ? window.openCoverImage : null;
    document.getElementById("displayProfileName").textContent = data.name;

    // عرض شارات الملف الشخصي
    const badgesEl = document.getElementById("profileBadges");
    if (badgesEl) {
        const pSA = isSuperAdmin(uid);
        const pMod = data.isModerator && !pSA;
        const pTrusted = data.isTrusted && !pSA && !pMod;
        const pBadBehavior = !!data.isBadBehavior;
        let bHtml = '';
        if (pSA)          bHtml += '<span style="color:gold;font-size:.9rem;display:flex;align-items:center;gap:3px"><i class="fas fa-check-circle"></i> سوبر أدمن</span>';
        if (pMod)         bHtml += '<span style="color:#60a5fa;font-size:.9rem;display:flex;align-items:center;gap:3px"><i class="fas fa-check-circle"></i> مشرف</span>';
        if (pTrusted)     bHtml += '<span style="color:#4ade80;font-size:.9rem;display:flex;align-items:center;gap:3px"><i class="fas fa-check-circle"></i> موثوق</span>';
        if (pBadBehavior) bHtml += '<span style="color:#f4212e;font-size:.9rem;display:flex;align-items:center;gap:3px"><i class="fas fa-exclamation-circle"></i> سلوكه سيئ انتبه</span>';
        badgesEl.innerHTML = bHtml;
    }

    document.getElementById("displayProfileUsername").textContent = `@${data.username}`;
    document.getElementById("displayBio").textContent = data.bio || "";
    const locEl = document.getElementById("displayLocation");
    const locTxt = document.getElementById("locationText");
    if (data.location && data.location.trim()) {
        locTxt.textContent = data.location;
        locEl.style.display = "block";
    } else {
        locEl.style.display = "none";
    }
    const joinDate = data.joinDate?.toDate();
    document.getElementById("displayJoinDate").textContent =
        joinDate ? `انضم في ${joinDate.toLocaleDateString('ar-SA')}` : "";

    const settingsBtn = document.getElementById("settingsBtn");
    const actionsDiv = document.getElementById("profileActionsBtns");
    const superAdminControls = document.getElementById("superAdminControls");
    settingsBtn.style.display = "none";
    superAdminControls.style.display = "none";
    actionsDiv.innerHTML = "";

    if (uid === currentUser.uid) {
        settingsBtn.style.display = "flex";
        actionsDiv.innerHTML = `
            <button class="action-btn filled" onclick="window.openEditProfile()"><i class="fas fa-edit"></i> تعديل</button>`;
    } else {
        const isBlocked = blockedUsersList.includes(uid);
        const targetIsSA  = isSuperAdmin(uid);
        const targetIsMod = !!data.isModerator && !targetIsSA;
        const currentIsSA = isSuperAdmin(currentUser?.uid);
        const currentIsMod = isModerator() && !currentIsSA;
        // منع المشرفين من حظر بعضهم ومنع الجميع من حظر SA
        const canBlock = !targetIsSA && !(targetIsMod && !currentIsSA);

        if (canBlock) {
            actionsDiv.innerHTML = isBlocked
                ? `<span class="action-btn danger" style="cursor:default;opacity:0.9">
                       <i class="fas fa-ban"></i> محظور
                   </span>
                   <button class="action-btn" onclick="window.toggleBlock('${uid}')">
                       <i class="fas fa-unlock"></i> إلغاء الحظر
                   </button>`
                : `<button class="action-btn" onclick="window.toggleBlock('${uid}')">
                       <i class="fas fa-ban"></i> حظر
                   </button>`;
        } else {
            actionsDiv.innerHTML = '';
        }
        if (isSuperAdmin(currentUser?.uid)) {
            superAdminControls.style.display = "block";
            const modBtn = document.getElementById("toggleModBtn");
            modBtn.textContent = data.isModerator ? "إزالة المشرف" : "تعيين كمشرف";
            modBtn.onclick = () => window.toggleMod(uid, data.isModerator);
            const trustedBtn = document.getElementById("toggleTrustedBtn");
            trustedBtn.textContent = data.isTrusted ? "إزالة الموثوق" : "تعيين موثوق";
            trustedBtn.onclick = () => window.toggleTrusted(uid, !!data.isTrusted);
            const banBtn = document.getElementById("toggleBanBtn");
            const isBanned = !!data.isBanned;
            banBtn.textContent = isBanned ? "رفع الطرد" : "طرد المستخدم";
            banBtn.style.color = isBanned ? "#0f0" : "var(--danger)";
            banBtn.style.borderColor = isBanned ? "#0f0" : "var(--danger)";
            banBtn.onclick = () => window.toggleBan(uid, isBanned);
            const badBehaviorBtn = document.getElementById("toggleBadBehaviorBtn");
            if (badBehaviorBtn) {
                const isBad = !!data.isBadBehavior;
                badBehaviorBtn.textContent = isBad ? "إزالة شارة السلوك السيئ" : "تعيين سلوك سيئ";
                badBehaviorBtn.style.color = '#f4212e';
                badBehaviorBtn.style.borderColor = '#f4212e';
                badBehaviorBtn.onclick = () => window.toggleBadBehavior(uid, isBad);
            }
            const deleteAccountBtn = document.getElementById("deleteUserAccountBtn");
            if (deleteAccountBtn) {
                deleteAccountBtn.onclick = () => window.deleteUserAccount(uid);
            }
        }
    }
}

window.openEditProfile = () => {
    document.getElementById("editName").value = currentUser.name || "";
    document.getElementById("editUsername").value = currentUser.username || "";
    document.getElementById("editBio").value = currentUser.bio || "";
    document.getElementById("editLocation").value = currentUser.location || "";
    document.getElementById("editAvatarFile").value = "";
    document.getElementById("editCoverFile").value = "";
    _croppedAvatarBlob = null;
    _croppedCoverBlob = null;
    const ap = document.getElementById("avatarPreview");
    const cp = document.getElementById("coverPreview");
    const cw = document.getElementById("coverPreviewWrap");
    if (ap) { ap.style.display = "none"; ap.src = ""; }
    if (cp) { cp.src = ""; }
    if (cw) cw.style.display = "none";
    document.getElementById("editProfileModal").style.display = "flex";
};

window.saveProfileChanges = async () => {
    const name = document.getElementById("editName").value.trim();
    const rawUsername = document.getElementById("editUsername").value.trim();
    const username = rawUsername.replace(/[^\w\u0600-\u06FF]/g, '');
    const bio = document.getElementById("editBio").value.trim();
    const location = document.getElementById("editLocation").value.trim();
    const avatarFile = document.getElementById("editAvatarFile").files[0];
    const coverFile = document.getElementById("editCoverFile").files[0];

    if (!name) return alert("الاسم مطلوب");
    if (!/[a-zA-Z\u0600-\u06FF]/.test(name)) return alert("يجب أن يحتوي الاسم على حرف واحد على الأقل");
    if (!username) return alert("اليوزر مطلوب — يجب أن يحتوي على أحرف أو أرقام فقط");

    showLoading(true);
    try {
        let updates = { name, username, bio, location };
        // استخدم الصورة المقصوصة إن وُجدت، وإلا الملف الأصلي
        const avatarSrc = _croppedAvatarBlob
            ? new File([_croppedAvatarBlob], 'avatar.jpg', { type: 'image/jpeg' })
            : avatarFile;
        const coverSrc = _croppedCoverBlob
            ? new File([_croppedCoverBlob], 'cover.jpg', { type: 'image/jpeg' })
            : coverFile;
        // دعم رابط URL مباشر (للبيئة APK التي لا تدعم رفع الملفات)
        const avatarUrlOverride = document.getElementById('avatarPreview')._urlOverride;
        const coverUrlOverride  = document.getElementById('coverPreview')._urlOverride;
        if (avatarSrc) { const url = await uploadImage(avatarSrc); if (url) updates.photoURL = url; }
        else if (avatarUrlOverride) { updates.photoURL = avatarUrlOverride; }
        if (coverSrc) { const url = await uploadImage(coverSrc); if (url) updates.coverURL = url; }
        else if (coverUrlOverride) { updates.coverURL = coverUrlOverride; }

        // تغيير اليوزرنيم — التحقق من التفرد ثم الحفظ
        if (username !== currentUser.username) {
            // التحقق من عدم الاستخدام بطريقتين
            try {
                const existCheck = await getDoc(doc(db, "usernames", username));
                if (existCheck.exists() && existCheck.data()?.uid !== currentUser.uid) {
                    showLoading(false);
                    return alert("اليوزر مأخوذ");
                }
            } catch (_) {
                // إذا فشلت قراءة usernames نتحقق من users مباشرةً
                const q = query(collection(db, "users"), where("username", "==", username), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty && snap.docs[0].id !== currentUser.uid) {
                    showLoading(false);
                    return alert("اليوزر مأخوذ");
                }
            }
            // حفظ المعرف الجديد وحذف القديم — عمليات غير إلزامية
            setDoc(doc(db, "usernames", username), { uid: currentUser.uid }).catch(() => {});
            if (currentUser.username) {
                deleteDoc(doc(db, "usernames", currentUser.username)).catch(() => {});
            }
        }

        // الحفظ الرئيسي في مجموعة users (هذا هو الأهم)
        await updateDoc(doc(db, "users", currentUser.uid), updates);

        // تحديث كل المنشورات القديمة
        const postUpdates = {};
        if (updates.name) postUpdates.user = updates.name;
        if (updates.username) postUpdates.username = updates.username;
        if (updates.photoURL) postUpdates.photoURL = updates.photoURL;
        if (Object.keys(postUpdates).length > 0) {
            const postsSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", currentUser.uid), limit(100)));
            const batch = writeBatch(db);
            postsSnap.forEach(d => batch.update(d.ref, postUpdates));
            await batch.commit();
        }

        Object.assign(currentUser, updates);
        document.getElementById("headerProfilePic").src =
            currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}`;
        document.getElementById("editProfileModal").style.display = "none";
        currentProfileData = { ...currentProfileData, ...updates };
        displayProfile(currentUser.uid, currentProfileData);
        await showAlert("تم حفظ التغييرات");
    } catch (e) { console.error(e); showAlert("فشل الحفظ: " + e.message); }
    finally { showLoading(false); }
};

// ─── الحظر ────────────────────────────────────────────────
// نكتب فقط في وثيقة المستخدم الحالي لتجنب أخطاء صلاحيات Firestore
window.toggleBlock = async (uid) => {
    // منع حظر السوبر أدمن مطلقاً
    if (isSuperAdmin(uid)) return showAlert("❌ لا يمكن حظر السوبر أدمن");
    // منع حظر المشرفين من قبل غير السوبر أدمن
    if (!isSuperAdmin(currentUser?.uid)) {
        try {
            const tSnap = await getDoc(doc(db, "users", uid));
            if (tSnap.exists() && tSnap.data().isModerator) {
                return showAlert("❌ لا يمكن حظر المشرفين");
            }
        } catch (_) {}
    }
    const isBlocked = blockedUsersList.includes(uid);
    showLoading(true);
    try {
        const userRef = doc(db, "users", currentUser.uid);
        if (isBlocked) {
            await updateDoc(userRef, { blockedUsers: arrayRemove(uid) });
            blockedUsersList = blockedUsersList.filter(id => id !== uid);
            // حاول تحديث الطرف الآخر (قد يفشل بسبب الصلاحيات — لا يوقف العملية)
            updateDoc(doc(db, "users", uid), { blockedByUsers: arrayRemove(currentUser.uid) }).catch(() => {});
            showAlert("تم إلغاء الحظر");
        } else {
            await updateDoc(userRef, { blockedUsers: arrayUnion(uid) });
            blockedUsersList.push(uid);
            updateDoc(doc(db, "users", uid), { blockedByUsers: arrayUnion(currentUser.uid) }).catch(() => {});
            showAlert("تم الحظر");
        }
        const settingsVisible = document.getElementById("settingsView")?.style.display === 'flex';
        if (settingsVisible) {
            // أعد تحميل القائمة بدون إغلاقها
            _loadBlockedListData();
        } else {
            window.closeProfile();
            loadPosts();
        }
    } catch (e) {
        console.error("toggleBlock error:", e);
        showAlert("فشل الحظر: " + (e.code || e.message));
    }
    finally { showLoading(false); }
};

// ─── طرد المستخدم (بان) ───────────────────────────────────
window.toggleBan = async (uid, currentBanned) => {
    const action = currentBanned ? "رفع الحظر عن" : "طرد";
    if (!(await showConfirm(`هل تريد ${action} هذا المستخدم؟`))) return;
    showLoading(true);
    try {
        const newBanned = !currentBanned;
        await updateDoc(doc(db, "users", uid), {
            isBanned: newBanned,
            bannedBy: newBanned ? (currentUser.name || currentUser.uid) : null
        });
        // إذا كان المستخدم مشرفاً نزيل صلاحياته أيضاً عند الطرد
        if (newBanned) {
            await updateDoc(doc(db, "users", uid), { isModerator: false });
            const postsSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", uid), limit(100)));
            if (!postsSnap.empty) {
                const batch = writeBatch(db);
                postsSnap.forEach(d => batch.update(d.ref, { isModerator: false }));
                await batch.commit();
            }
        }
        await showAlert(newBanned ? "تم طرد المستخدم" : "تم رفع الحظر عن المستخدم");
        window.openProfile(uid);
    } catch (e) { console.error(e); alert("فشل: " + e.message); }
    finally { showLoading(false); }
};

window.toggleMod = async (uid, currentStatus) => {
    showLoading(true);
    try {
        const newStatus = !currentStatus;
        await updateDoc(doc(db, "users", uid), { isModerator: newStatus });
        const postsSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", uid), limit(100)));
        if (!postsSnap.empty) {
            const batch = writeBatch(db);
            postsSnap.forEach(d => batch.update(d.ref, { isModerator: newStatus }));
            await batch.commit();
        }
        if (newStatus) {
            addDoc(collection(db, "users", uid, "notifications"), {
                type: "system", fromName: "الإدارة",
                text:"تهانينا! تم تعيينك كمشرف🎉\n يمكنك حذف المنشورات المسيىئة و ستحصل على شارة الأشراف",
                      createdAt: serverTimestamp(), read: false
            }).catch(() => {});
        }
        await showAlert(newStatus ? "✅ تم تعيين المشرف" : "تم إزالة المشرف وصلاحياته");
        window.openProfile(uid);
    } catch (e) { console.error(e); }
    finally { showLoading(false); }
};

// ─── الشارة الثالثة: الموثوق (سوبر أدمن فقط) ─────────────
window.toggleTrusted = async (uid, currentStatus) => {
    if (!isSuperAdmin(currentUser?.uid)) return;
    showLoading(true);
    try {
        const newStatus = !currentStatus;
        await updateDoc(doc(db, "users", uid), { isTrusted: newStatus });
        const postsSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", uid), limit(100)));
        if (!postsSnap.empty) {
            const batch = writeBatch(db);
            postsSnap.forEach(d => batch.update(d.ref, { isTrusted: newStatus }));
            await batch.commit();
        }
        if (newStatus) {
            addDoc(collection(db, "users", uid, "notifications"), {
                type: "system", fromName: "الإدارة",
                text: "✅ تهانينا! تم تعيينك كمستخدم موثوق ",
                createdAt: serverTimestamp(), read: false
            }).catch(() => {});
        }
        await showAlert(newStatus ? "✅ تم تعيين المستخدم كموثوق" : "تم إزالة شارة الموثوق");
        window.openProfile(uid);
    } catch (e) { console.error(e); alert("فشل: " + e.message); }
    finally { showLoading(false); }
};

// ─── الشارة الرابعة: صاحب السلوك السيئ (سوبر أدمن فقط) ────
window.toggleBadBehavior = async (uid, currentStatus) => {
    if (!isSuperAdmin(currentUser?.uid)) return;
    showLoading(true);
    try {
        const newStatus = !currentStatus;
        await updateDoc(doc(db, "users", uid), { isBadBehavior: newStatus });
        const postsSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", uid), limit(100)));
        if (!postsSnap.empty) {
            const batch = writeBatch(db);
            postsSnap.forEach(d => batch.update(d.ref, { isBadBehavior: newStatus }));
            await batch.commit();
        }
        if (newStatus) {
            addDoc(collection(db, "users", uid, "notifications"), {
                type: "system", fromName: "الإدارة",
                text: "⚠️ تنبيه من الإدارة: تم تعيينك كصاحب سلوك سيئ بسبب مخالفة القواعد.\n🚫 سلبيات هذه الشارة:\n• لا يمكنك النشر كمجهول\n• لا يمكنك استخدام زر الديس لايك\n•  زيادة حد النشر إلى 10 ساعات\n• منشوراتك قد تُحذف في أي وقت من قِبل الإدارة\n• تظهر شارة تحذيرية على حسابك\n\nنرجو الالتزام بقواعد المجموعة لرفع هذه الشارة مستقبلاً.",
                createdAt: serverTimestamp(), read: false
            }).catch(() => {});
        }
        await showAlert(newStatus ? "⚠️ تم تعيين المستخدم كصاحب سلوك سيئ" : "تم إزالة شارة السلوك السيئ");
        window.openProfile(uid);
    } catch (e) { console.error(e); alert("فشل: " + e.message); }
    finally { showLoading(false); }
};

// ─── مساعد: حذف مجموعة مراجع على دفعات (Firestore batch limit = 500) ───
async function _batchDelete(refs) {
    const CHUNK = 450;
    for (let i = 0; i < refs.length; i += CHUNK) {
        const b = writeBatch(db);
        refs.slice(i, i + CHUNK).forEach(r => b.delete(r));
        await b.commit();
    }
}

// ─── حذف حساب مستخدم بالكامل (سوبر أدمن فقط) ────────────
window.deleteUserAccount = async (uid) => {
    if (!isSuperAdmin(currentUser?.uid)) return;
    if (!(await showConfirm("⚠️ هل أنت متأكد من حذف هذا الحساب نهائياً؟\nسيتم حذف جميع منشوراته وردوده وبياناته بشكل كامل ولا يمكن التراجع!"))) return;
    if (!(await showConfirm("⛔ تأكيد أخير — هذا الإجراء لا يمكن التراجع عنه. هل تريد المتابعة؟"))) return;

    showLoading(true);
    try {
        const replyRefs = [];
        const postRefs  = [];

        // 1. جلب جميع منشوراته مع ردودها
        const postsSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", uid)));
        for (const postDoc of postsSnap.docs) {
            postRefs.push(postDoc.ref);
            const rSnap = await getDocs(collection(db, "posts", postDoc.id, "replies"));
            rSnap.forEach(r => replyRefs.push(r.ref));
        }

        // 2. جلب ردوده على منشورات الآخرين (collectionGroup)
        try {
            const othersReplies = await getDocs(query(collectionGroup(db, "replies"), where("uid", "==", uid)));
            othersReplies.forEach(r => {
                if (!replyRefs.some(ref => ref.path === r.ref.path)) replyRefs.push(r.ref);
            });
        } catch (_) {}

        // 3. جلب إشعاراته
        const notifSnap = await getDocs(collection(db, "users", uid, "notifications"));
        const notifRefs = notifSnap.docs.map(d => d.ref);

        // 4. تنفيذ الحذف بالتسلسل (ردود → منشورات → إشعارات)
        await _batchDelete(replyRefs);
        await _batchDelete(postRefs);
        await _batchDelete(notifRefs);

        // 5. حذف اليوزرنيم من مجموعة usernames
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const uname = userDoc.data().username;
            if (uname) await deleteDoc(doc(db, "usernames", uname)).catch(() => {});
        }

        // 6. حذف وثيقة المستخدم نهائياً
        await deleteDoc(doc(db, "users", uid));

        await showAlert("✅ تم حذف الحساب وجميع بياناته بنجاح");
        showScreen("chat");
    } catch (e) {
        console.error("deleteUserAccount error:", e);
        await showAlert("❌ فشل الحذف: " + (e.code || e.message));
    } finally {
        showLoading(false);
    }
};

// ─── بث رسالة للجميع (سوبر أدمن فقط) ────────────────────
window.sendBroadcast = async () => {
    if (!isSuperAdmin(currentUser?.uid)) return showAlert("❌ هذه الميزة للسوبر أدمن فقط");
    const msg = await showPrompt("✉️ اكتب رسالة للجميع:", "اكتب رسالتك هنا...");
    if (!msg || !msg.trim()) return;
    showLoading(true);
    try {
        // حفظ في مجموعة broadcasts للمراقبة الفورية
        await addDoc(collection(db, "broadcasts"), {
            message: msg.trim(),
            fromName: currentUser.name || "الإدارة",
            fromUid: currentUser.uid,
            createdAt: serverTimestamp(),
            clientTime: Date.now()
        });
        await showAlert("📢 تم إرسال الرسالة للجميع بنجاح");
    } catch (e) {
        console.error("sendBroadcast error:", e);
        await showAlert("فشل الإرسال: " + (e.code || e.message));
    }
    finally { showLoading(false); }
};

// ─── الوضع المجهول ─────────────────────────────────────────
window.toggleAnonymous = () => {
    if (currentUser?.isBadBehavior) return;
    isAnonymousMode = !isAnonymousMode;
    _updateAnonUI();
};

window.revealAnonPost = (postId) => {
    const card = document.getElementById(`post-${postId}`);
    if (!card) return;
    const veil = card.querySelector('.anon-veil');
    const content = card.querySelector('.anon-revealed');
    if (veil) veil.style.display = 'none';
    if (content) content.style.display = 'block';
};

window.showAnonAuthor = async (uid, btnEl) => {
    btnEl.disabled = true;
    try {
        const snap = await getDoc(doc(db, "users", uid));
        const name = snap.exists() ? (snap.data().name || uid) : uid;
        btnEl.innerHTML = `<i class="fas fa-user" style="color:gold"></i> صاحب المنشور: ${name}`;
        btnEl.style.color = 'gold';
        btnEl.onclick = () => window.openProfile(uid);
        btnEl.disabled = false;
    } catch(e) { btnEl.textContent = 'خطأ في الجلب'; btnEl.disabled = false; }
};

window.toggleBadgeLabel = (wrapper) => {
    const label = wrapper.querySelector('.badge-label');
    if (!label) return;
    label.style.display = label.style.display === 'none' ? 'block' : 'none';
};

function _updateAnonUI() {
    const active = isAnonymousMode || settingsAnonMode;
    document.querySelectorAll('.anon-btn').forEach(btn => {
        btn.classList.toggle('anon-active', active);
        // تلوين مختلف لوضع المجهول الكامل من الإعدادات مقارنة بالزر العادي
        if (settingsAnonMode) {
            btn.title = 'وضع المجهول مفعّل';
        } else if (isAnonymousMode) {
            btn.title = 'وضع المجهول مفعّل — المنشور التالي فقط';
        } else {
            btn.title = 'وضع المجهول';
        }
    });
}

window.toggleSettingsHideAnon = () => {
    hideAnonMode = !hideAnonMode;
    localStorage.setItem('hideAnonMode', hideAnonMode);
    _updateSettingsToggles();
    _updateAnonUI(); // تحديث حالة زر المجهول لتجنب أي قلتش مرئي
    loadPosts();
    if (currentThreadId) loadReplies(currentThreadId, currentReplyFilter);
};

window.toggleSettingsAnon = async () => {
    if (!settingsAnonMode && currentUser?.isBadBehavior) {
        return showAlert("⚠️ لا يمكن لأصحاب السلوك السيئ استخدام وضع المجهول");
    }
    if (!settingsAnonMode) {
        settingsAnonMode = true;
        localStorage.setItem('settingsAnonMode', 'true');
        _updateSettingsToggles();
    } else {
        const ok = await showConfirm("عند الإيقاف ستحذف جميع منشوراتك وردودك المُرسلة كمجهول");
        if (!ok) return;
        showLoading(true);
        try {
            const postsKey = `settingsAnonPosts_${currentUser.uid}`;
            const postIds = JSON.parse(localStorage.getItem(postsKey) || '[]');
            for (const id of postIds) {
                deleteDoc(doc(db, "posts", id)).catch(() => {});
            }
            localStorage.removeItem(postsKey);
            const repliesKey = `settingsAnonReplies_${currentUser.uid}`;
            const replyData = JSON.parse(localStorage.getItem(repliesKey) || '[]');
            for (const { threadId, replyId } of replyData) {
                deleteDoc(doc(db, "posts", threadId, "replies", replyId)).catch(() => {});
                updateDoc(doc(db, "posts", threadId), { replyCount: increment(-1) }).catch(() => {});
            }
            localStorage.removeItem(repliesKey);
        } catch (e) { console.error(e); }
        finally { showLoading(false); }
        settingsAnonMode = false;
        localStorage.setItem('settingsAnonMode', 'false');
        _updateSettingsToggles();
    }
};

window.hideAnonUser = async (uid) => {
    if (!currentUser || hiddenAnonUsers.includes(uid)) return;
    hiddenAnonUsers = [...hiddenAnonUsers, uid];
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { hiddenAnonUsers: arrayUnion(uid) });
    } catch (e) { console.error(e); }
    loadPosts();
    if (currentThreadId) loadReplies(currentThreadId, currentReplyFilter);
};

function _updateSettingsToggles() {
    const saBtn = document.getElementById('settingsAnonToggle');
    const haBtn = document.getElementById('settingsHideAnonToggle');
    const opBtn = document.getElementById('settingsHideOnePieceToggle');
    if (saBtn) {
        saBtn.style.background = settingsAnonMode ? '#a78bfa' : '#333';
        saBtn.style.color      = settingsAnonMode ? '#fff' : '#aaa';
        saBtn.textContent      = settingsAnonMode ? 'مفعّل' : 'معطّل';
    }
    if (haBtn) {
        haBtn.style.background = hideAnonMode ? '#f87171' : '#333';
        haBtn.style.color      = hideAnonMode ? '#fff' : '#aaa';
        haBtn.textContent      = hideAnonMode ? 'مفعّل' : 'معطّل';
    }
    if (opBtn) {
        opBtn.style.background = hideOnePiecePosts ? '#f97316' : '#333';
        opBtn.style.color      = hideOnePiecePosts ? '#fff' : '#aaa';
        opBtn.textContent      = hideOnePiecePosts ? 'مفعّل' : 'معطّل';
    }
}

window.toggleHideOnePiece = () => {
    hideOnePiecePosts = !hideOnePiecePosts;
    localStorage.setItem('hideOnePiecePosts', hideOnePiecePosts);
    _updateSettingsToggles();
    loadPosts(currentPostsFilter);
    if (currentThreadId) loadReplies(currentThreadId, currentReplyFilter);
};


async function _clearAnonContent() {
    showLoading(true);
    try {
        const postsKey   = `anonPosts_${currentUser.uid}`;
        const repliesKey = `anonReplies_${currentUser.uid}`;
        const postsIds   = JSON.parse(localStorage.getItem(postsKey)   || '[]');
        const repliesArr = JSON.parse(localStorage.getItem(repliesKey) || '[]');

        if (postsIds.length > 0 || repliesArr.length > 0) {
            const batch = writeBatch(db);
            postsIds.forEach(pid => batch.delete(doc(db, "posts", pid)));
            repliesArr.forEach(({ threadId, replyId }) =>
                batch.delete(doc(db, "posts", threadId, "replies", replyId))
            );
            await batch.commit();
            // تخفيض عدادات الردود
            repliesArr.forEach(({ threadId }) =>
                updateDoc(doc(db, "posts", threadId), { replyCount: increment(-1) }).catch(() => {})
            );
        }
        localStorage.removeItem(postsKey);
        localStorage.removeItem(repliesKey);
    } catch (e) { console.error("clearAnon error:", e); }
    finally { showLoading(false); }
}

// ─── الأرشيف ──────────────────────────────────────────────
window.openArchive = async () => {
    showScreen("archiveView");
    showLoading(true);
    try {
        // بدون orderBy لتجنب الحاجة لـ composite index — نرتب يدوياً
        const q = query(collection(db, "posts"), where("uid", "==", currentUser.uid), limit(100));
        const snap = await getDocs(q);
        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        // ترتيب تنازلي حسب وقت الإنشاء
        docs.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
        });
        let html = "";
        docs.forEach(d => html += createPostHTML(d.id, d, false));
        const archEl = document.getElementById("archiveList");
        archEl.innerHTML = html || '<p style="color:#777;padding:20px;text-align:center;">لا منشورات بعد</p>';
        parseTwemoji(archEl);
    } catch (e) { console.error(e); alert("فشل تحميل المنشورات: " + e.message); }
    finally { showLoading(false); }
};

window.closeArchive = () => showScreen("chat");

// ─── الإشعارات ────────────────────────────────────────────
function _updateNotifBadge() {
    const total = _personalUnread + _broadcastUnread;
    const badge = document.getElementById("notifBadge");
    if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? "flex" : "none";
    }
}

function setupNotifications() {
    // مراقبة الإشعارات الشخصية
    const q = query(collection(db, "users", currentUser.uid, "notifications"), orderBy("createdAt", "desc"), limit(30));
    onSnapshot(q, (snap) => {
        _personalUnread = 0;
        snap.forEach(d => { if (!d.data().read) _personalUnread++; });
        _updateNotifBadge();
    });

    // مراقبة رسائل البث وحساب غير المقروءة منها
    const bq = query(collection(db, "broadcasts"), orderBy("createdAt", "desc"), limit(20));
    const _broadcastInitTime = Date.now();
    let _lastBroadcastAlertTs = 0;
    onSnapshot(bq, (snap) => {
        const lastSeen = Number(localStorage.getItem('lastSeenBroadcast') || 0);
        _broadcastUnread = 0;
        let latestMsg = null;
        snap.forEach(d => {
            const data = d.data();
            const ts = data.createdAt?.toMillis?.() || data.clientTime || 0;
            if (ts > lastSeen) _broadcastUnread++;
            if (!latestMsg || ts > latestMsg.ts) latestMsg = { ...data, ts };
        });
        // إظهار تنبيه فوري للمستخدمين المتصلين عند وصول رسالة بث جديدة
        if (latestMsg && latestMsg.ts > _lastBroadcastAlertTs && latestMsg.ts > _broadcastInitTime) {
            _lastBroadcastAlertTs = latestMsg.ts;
            showAlert(`📢 رسالة من الإدارة:\n${latestMsg.message}`);
        }
        _updateNotifBadge();
    });
}

async function renderNotifications() {
    let snapNotif, snapBroadcasts;
    try {
        [snapNotif, snapBroadcasts] = await Promise.all([
            getDocs(query(collection(db, "users", currentUser.uid, "notifications"), orderBy("createdAt", "desc"), limit(50))),
            getDocs(query(collection(db, "broadcasts"), orderBy("createdAt", "desc"), limit(20)))
        ]);
    } catch (e) {
        console.error("renderNotifications error:", e);
        // محاولة تحميل الإشعارات الشخصية فقط في حالة فشل تحميل البث
        try {
            snapNotif = await getDocs(query(collection(db, "users", currentUser.uid, "notifications"), orderBy("createdAt", "desc"), limit(50)));
            snapBroadcasts = { forEach: () => {} };
        } catch (_) {
            document.getElementById("notificationsList").innerHTML = '<p style="color:#777;padding:20px;text-align:center">خطأ في تحميل الإشعارات</p>';
            return;
        }
    }

    const icons = { like: '<i class="fas fa-heart" style="color: var(--danger);"></i>', dislike: '👎', reply: '💬', mention: '🔔', welcome: '🎉', broadcast: '📢', system: '📋' };
    const getNotifText = (d) => {
        if (d.type === 'system')    return (d.text || '').replace(/\n/g, '<br>');
        if (d.type === 'welcome')   return d.message || 'مرحباً بك!';
        if (d.type === 'like')      return d.isReply ? 'أعجب بردك' : 'أعجب بمنشورك';
        if (d.type === 'dislike')   return d.isReply ? 'لم يعجبه ردك' : 'لم يعجبه منشورك';
        if (d.type === 'reply')     return 'رد على منشورك';
        if (d.type === 'mention')   return 'ذكرك في منشور';
        return '';
    };

    // دمج الإشعارات الشخصية مع البث العام
    const notifDocs = [];
    snapNotif.forEach(d => notifDocs.push({ id: d.id, ...d.data(), _src: 'notif' }));
    snapBroadcasts.forEach(d => notifDocs.push({ id: d.id, ...d.data(), type: 'broadcast', _src: 'broadcast' }));

    // ترتيب موحّد من الأحدث للأقدم
    notifDocs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    let html = "";
    for (const data of notifDocs) {
        if (data._src === 'broadcast') {
            html += `<div class="post-card notif-item" style="border-right:3px solid #a78bfa;">
                <div style="font-size:1.4rem;padding:5px 8px;flex-shrink:0">📢</div>
                <div class="post-content">
                    <div class="user-info">
                        <span class="username" style="color:#a78bfa">${data.fromName || 'الإدارة'}</span>
                        <span style="color:#777;font-size:.8rem">${timeAgo(data.createdAt?.toDate())}</span>
                    </div>
                    <p style="color:#e7e9ea;font-size:.9rem">${data.message || ''}</p>
                </div>
            </div>`;
            continue;
        }
        const action = buildNotifAction(data);
        const fromUid = data.fromUid ? `window.openProfile('${data.fromUid}')` : '';
        html += `<div class="post-card notif-item ${data.read ? '' : 'unread-notif'}" onclick="${action}" style="cursor:pointer;">
            <div style="font-size:1.4rem;padding:5px 8px;flex-shrink:0">${icons[data.type] || '🔔'}</div>
            <div class="post-content">
                <div class="user-info">
                    <span class="username" ${fromUid ? `onclick="event.stopPropagation();${fromUid}" style="cursor:pointer;text-decoration:underline;"` : ''}>${data.fromName || ''}</span>
                    <span style="color:#777;font-size:.8rem">${timeAgo(data.createdAt?.toDate())}</span>
                </div>
                <p style="color:#aaa;font-size:.9rem">${getNotifText(data)}</p>
                ${action !== 'void(0)' ? '<p style="color:var(--primary);font-size:.78rem;margin-top:2px"><i class="fas fa-arrow-left"></i> اضغط للانتقال</p>' : ''}
            </div>
        </div>`;
        if (!data.read)
            updateDoc(doc(db, "users", currentUser.uid, "notifications", data.id), { read: true }).catch(() => {});
    }
    const notifEl = document.getElementById("notificationsList");
    notifEl.innerHTML = html || '<p style="color:#777;padding:20px;text-align:center">لا إشعارات</p>';
    parseTwemoji(notifEl);
}

window.openNotifications = async () => {
    // تسجيل آخر وقت فُتحت فيه الإشعارات لحساب غير المقروءة من البث
    localStorage.setItem('lastSeenBroadcast', Date.now());
    _broadcastUnread = 0;
    _updateNotifBadge();
    showScreen("notificationsView");
    await renderNotifications();
};

window.refreshNotifications = async () => {
    spinRefreshIcon('notifRefreshIcon');
    await renderNotifications();
};

function buildNotifAction(data) {
    const tid = data.threadId && data.threadId !== 'null' ? data.threadId : null;
    const rid = data.replyId && data.replyId !== 'null' ? data.replyId : null;
    const pid = data.postId && data.postId !== 'null' ? data.postId : null;
    if (data.type === 'reply' && tid)
        return `window.closeNotifications();window.openThreadAndScrollToReply('${tid}','${rid || ''}')`;
    if (data.type === 'mention') {
        if (data.isReply && tid)
            return `window.closeNotifications();window.openThreadAndScrollToReply('${tid}','${rid || pid || ''}')`;
        if (pid) return `window.closeNotifications();window.scrollToPost('${pid}')`;
    }
    if ((data.type === 'like' || data.type === 'dislike') && pid) {
        if (data.isReply && tid)
            return `window.closeNotifications();window.openThreadAndScrollToReply('${tid}','${pid}')`;
        // تفاعل على منشور رئيسي → معاينة المنشور في صفحة خاصة
        return `window.closeNotifications();window.openPostPreview('${pid}')`;
    }
    return 'void(0)';
}

// ─── معاينة المنشور الرئيسي ───────────────────────────────
window.openPostPreview = async (postId) => {
    showScreen("postPreviewView");
    const container = document.getElementById("postPreviewContent");
    container.innerHTML = '<p style="color:#777;padding:20px;text-align:center;">جاري التحميل...</p>';
    try {
        const snap = await getDoc(doc(db, "posts", postId));
        if (!snap.exists()) {
            container.innerHTML = '<p style="color:#777;padding:20px;text-align:center;">المنشور غير موجود</p>';
            return;
        }
        const data = snap.data();
        let html = createPostHTML(postId, data, false);
        // عرض الردود أسفل المنشور
        html += `<div style="border-top:1px solid #2f3336;padding:8px 14px;color:#a78bfa;font-size:.85rem;font-weight:700;">
            <i class="fas fa-comments" style="margin-left:5px;"></i> الردود
        </div>`;
        try {
            const repliesSnap = await getDocs(query(
                collection(db, "posts", postId, "replies"),
                orderBy("createdAt", "asc")
            ));
            if (repliesSnap.empty) {
                html += '<p style="color:#777;padding:12px 14px;font-size:.85rem;">لا ردود بعد</p>';
            } else {
                repliesSnap.forEach(rd => {
                    const rdata = rd.data();
                    if (blockedByUsersList.includes(rdata.uid)) return;
                    html += createPostHTML(rd.id, rdata, true);
                });
            }
        } catch(re) {
            console.warn("replies in preview:", re);
        }
        container.innerHTML = html;
        parseTwemoji(container);
    } catch (e) {
        console.error("openPostPreview error:", e);
        container.innerHTML = '<p style="color:#f44;padding:20px;text-align:center;">حدث خطأ أثناء التحميل</p>';
    }
};

window.closePostPreview = () => showScreen("chat");

window.scrollToPost = (postId) => {
    showScreen("chat");
    setTimeout(() => {
        const el = document.getElementById(`post-${postId}`);
        if (!el) return;
        const container = document.getElementById('messagesList');
        const targetTop = el.offsetTop - 80;
        container.scrollTop = Math.max(0, targetTop);
        el.classList.add('highlight-post');
        setTimeout(() => el.classList.remove('highlight-post'), 2000);
    }, 400);
};

window.closeNotifications = () => showScreen("chat");

window.deleteAllNotifications = async () => {
    if (!(await showConfirm("حذف جميع الإشعارات نهائياً؟"))) return;
    showLoading(true);
    try {
        const snap = await getDocs(collection(db, "users", currentUser.uid, "notifications"));
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        document.getElementById("notificationsList").innerHTML = '<p style="color:#777;padding:20px;text-align:center;">لا إشعارات</p>';
        _personalUnread = 0;
        _updateNotifBadge();
    } catch(e) { console.error(e); await showAlert("فشل الحذف: " + (e.code || e.message)); }
    finally { showLoading(false); }
};

// ─── البلاغات ─────────────────────────────────────────────
function monitorReports() {
    // منع تكرار الاستماع إذا كان مفعلاً مسبقاً
    if (unsubscribeReports) return;
    try {
        const q = query(collection(db, "reports"), where("status", "==", "open"));
        unsubscribeReports = onSnapshot(q, (snap) => {
            const badge = document.getElementById("reportsBadge");
            if (!badge) return;
            badge.textContent = snap.size;
            badge.style.display = snap.size > 0 ? "flex" : "none";
        }, (err) => {
            console.warn("monitorReports error:", err.code, err.message);
            unsubscribeReports = null;
        });
    } catch (e) {
        console.warn("monitorReports setup error:", e);
    }
}

window.openReports = async () => {
    showScreen("reportsView");
    const listEl = document.getElementById("reportsList");
    listEl.innerHTML = '<p style="color:#777;padding:20px;text-align:center">جارٍ التحميل...</p>';
    try {
        // بدون orderBy لتجنّب الحاجة لفهرس مركّب في Firestore
        const q = query(collection(db, "reports"), where("status", "==", "open"));
        const snap = await getDocs(q);
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        // ترتيب يدوي من الأحدث للأقدم
        items.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));

        let html = "";
        for (const data of items) {
            const tid = data.threadId && data.threadId !== 'null' && data.threadId !== '' ? data.threadId : '';
            const isR = data.isReply === true;
            // فتح المنشور (أو الثريد الأصلي للرد) في شاشة المعاينة مع الردود
            const previewId = isR && tid ? tid : data.postId;
            const nav = `window.closeReports();window.openPostPreview('${previewId}')`;
            // جلب اسم المُبلَّغ عنه
            let reportedName = data.targetUid || '';
            try {
                const uSnap = await getDoc(doc(db, "users", data.targetUid));
                if (uSnap.exists()) reportedName = uSnap.data().name || reportedName;
            } catch (_) {}

            html += `<div class="post-card">
                <div class="post-content">
                    <div class="user-info" style="margin-bottom:4px">
                        <span class="username" style="color:var(--danger)"><i class="fas fa-flag"></i> بلاغ جديد</span>
                        <span style="color:#777;font-size:.75rem">${timeAgo(data.at?.toDate?.())}</span>
                    </div>
                    <p style="color:#e7e9ea;margin-bottom:2px"><b>السبب:</b> ${data.reason || '—'}</p>
                    <p style="color:#777;font-size:.8rem;margin-bottom:6px">المُبلَّغ عنه: ${reportedName} · ${isR ? 'رد' : 'منشور'}</p>
                    <div class="post-actions" style="flex-wrap:wrap;gap:6px">
                        <button class="act-btn" style="color:var(--primary)" onclick="${nav}"><i class="fas fa-eye"></i> عرض</button>
                        <button class="act-btn" style="color:var(--danger)" onclick="window.resolveReport('${data.id}','${data.postId}','${data.targetUid}',${isR},'${tid}')"><i class="fas fa-trash"></i> حذف المنشور</button>
                        <button class="act-btn" onclick="window.dismissReport('${data.id}')"><i class="fas fa-times"></i> تجاهل</button>
                        <button class="act-btn" style="color:orange" onclick="window.banUser('${data.targetUid}')"><i class="fas fa-ban"></i> حظر المستخدم</button>
                    </div>
                </div>
            </div>`;
        }
        listEl.innerHTML = html || '<p style="color:#777;padding:20px;text-align:center">لا بلاغات مفتوحة</p>';
        parseTwemoji(listEl);
    } catch (e) {
        console.error(e);
        listEl.innerHTML = `<p style="color:var(--danger);padding:20px;text-align:center">خطأ في تحميل البلاغات: ${e.message}</p>`;
    }
};

window.closeReports = () => showScreen("chat");

window.resolveReport = async (reportId, postId, targetUid, isReply, threadId) => {
    if (!(await showConfirm("حذف هذا المنشور؟"))) return;
    showLoading(true);
    try {
        const validTid = threadId && threadId !== 'null' && threadId !== '' ? threadId : null;
        const isR = isReply === true || isReply === 'true';
        const path = isR && validTid ? `posts/${validTid}/replies` : "posts";
        await deleteDoc(doc(db, path, postId));
        if (isR && validTid) {
            await updateDoc(doc(db, "posts", validTid), { replyCount: increment(-1) });
        }
        await updateDoc(doc(db, "reports", reportId), { status: 'resolved' });
        await showAlert("تم حذف المنشور");
        window.openReports();
    } catch (e) { console.error(e); alert("فشل: " + e.message); }
    finally { showLoading(false); }
};

window.dismissReport = async (reportId) => {
    await updateDoc(doc(db, "reports", reportId), { status: 'dismissed' });
    window.openReports();
};

window.banUser = async (uid) => {
    if (await showConfirm("حظر هذا المستخدم نهائياً؟")) {
        showLoading(true);
        try {
            await updateDoc(doc(db, "users", uid), { isBanned: true });
            await showAlert("تم حظر المستخدم");
            window.openReports();
        } catch (e) { console.error(e); }
        finally { showLoading(false); }
    }
};

// ─── الإعدادات ────────────────────────────────────────────
window.openSettings = async () => {
    showScreen("settingsView");
    _updateSettingsToggles();
    const div = document.getElementById("blockedList");
    div.style.display = "none";
    div.innerHTML = "";
    _loadBlockedListData();
    // قسم السوبر أدمن - يظهر فقط للسوبر أدمن
    const saSection = document.getElementById("superAdminSettingsSection");
    if (saSection) saSection.style.display = isSuperAdmin(currentUser?.uid) ? "block" : "none";
    const bannedDiv = document.getElementById("bannedList");
    if (bannedDiv) { bannedDiv.style.display = "none"; bannedDiv.innerHTML = ""; }
};

window.toggleBannedList = async () => {
    const div = document.getElementById("bannedList");
    if (!div) return;
    if (div.style.display === "block") { div.style.display = "none"; return; }
    div.style.display = "block";
    div.innerHTML = '<p style="color:#777;padding:10px 0;">جاري التحميل...</p>';
    try {
        const q = query(collection(db, "users"), where("isBanned", "==", true), limit(50));
        const snap = await getDocs(q);
        if (snap.empty) {
            div.innerHTML = '<p style="color:#777;padding:10px 0;">لا يوجد مطرودون</p>';
            return;
        }
        let html = "";
        snap.forEach(d => {
            const ud = d.data();
            const name = ud.name || '—';
            const uname = ud.username || '—';
            const avatar = ud.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
            const bannedByHtml = ud.bannedBy
                ? `<p style="color:#f87171;font-size:.75rem;margin:2px 0 0;">طُرد بواسطة: ${ud.bannedBy}</p>`
                : '';
            html += `<div class="post-card">
                <img src="${avatar}" class="avatar">
                <div class="post-content">
                    <div class="user-info"><span class="username">${name}</span></div>
                    <p style="color:#777;font-size:.82rem;">@${uname}</p>
                    ${bannedByHtml}
                    <button class="act-btn" style="margin-top:5px;color:#4ade80" onclick="window.toggleBan('${d.id}',true)">
                        <i class="fas fa-unlock"></i> رفع الطرد
                    </button>
                </div>
            </div>`;
        });
        div.innerHTML = html;
    } catch(e) {
        console.error(e);
        div.innerHTML = `<p style="color:var(--danger);padding:10px 0;">خطأ: ${e.code||e.message}</p>`;
    }
};

async function _loadBlockedListData() {
    const div = document.getElementById("blockedList");
    if (blockedUsersList.length === 0) {
        div.innerHTML = '<p style="color:#777;padding:15px 0">لا يوجد محظورين</p>';
        return;
    }
    let html = "";
    for (const uid of [...new Set(blockedUsersList)]) {
        try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const d = snap.data();
                html += `<div class="post-card">
                    <img src="${d.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}`}" class="avatar">
                    <div class="post-content">
                        <div class="user-info"><span class="username">${d.name}</span></div>
                        <p style="color:#777">@${d.username}</p>
                        <button class="act-btn" style="margin-top:5px" onclick="window.toggleBlock('${uid}')">
                            <i class="fas fa-unlock"></i> إلغاء الحظر
                        </button>
                    </div>
                </div>`;
            }
        } catch (e) {}
    }
    div.innerHTML = html || '<p style="color:#777;padding:15px 0">لا محظورين</p>';
}

window.toggleBlockedList = () => {
    const div = document.getElementById("blockedList");
    div.style.display = div.style.display === "none" ? "block" : "none";
};

window.closeSettings = () => {
    if (currentUser && currentProfileData?.uid === currentUser.uid)
        showScreen("profileView");
    else
        showScreen("chat");
};

window.openTerms = () => {
    previousScreen = 'settingsView';
    const settingsEl = document.getElementById('settingsView');
    if (settingsEl?.style.display !== 'none') previousScreen = 'settingsView';
    else previousScreen = 'auth';
    history.pushState({ screen: previousScreen }, '', '');
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById('auth').style.display = 'none';
    const tv = document.getElementById('termsView');
    if (tv) { tv.style.display = 'flex'; }
};

window.closeTerms = () => history.back();
// ─── زر الرجوع والملاحة ───────────────────────────────────
// دفع حالة أولية لمنع الخروج من التطبيق عند الضغط على رجوع
history.pushState({ screen: 'chat' }, '', '');

window.addEventListener('popstate', (event) => {
    const profileEl  = document.getElementById('profileView');
    const threadEl   = document.getElementById('threadView');
    const settingsEl = document.getElementById('settingsView');
    const notifEl    = document.getElementById('notificationsView');
    const archiveEl  = document.getElementById('archiveView');
    const searchEl   = document.getElementById('searchView');

    if (profileEl?.style.display !== 'none') {
        showScreen(previousScreen || 'chat');
        return;
    }
    if (threadEl?.style.display !== 'none') {
        if (unsubscribeReplies) { unsubscribeReplies(); unsubscribeReplies = null; }
        currentThreadId = null;
        const inp = document.getElementById("replyInput");
        if (inp) { inp.value = ""; window.updateCharCount?.(inp, "replyCharCount"); }
        showScreen('chat');
        return;
    }
    if (settingsEl?.style.display !== 'none') { showScreen('chat'); return; }
    if (notifEl?.style.display !== 'none')    { showScreen('chat'); return; }
    if (archiveEl?.style.display !== 'none')  { showScreen('chat'); return; }
    if (searchEl?.style.display !== 'none')   { showScreen('chat'); return; }
    const termsEl = document.getElementById('termsView');
    if (termsEl?.style.display !== 'none') {
        termsEl.style.display = 'none';
        if (previousScreen && previousScreen !== 'auth') showScreen(previousScreen);
        else {
            document.getElementById('auth').style.display = 'flex';
        }
        return;
    }
    // في شاشة chat — أعد دفع الحالة لمنع الخروج
    history.pushState({ screen: 'chat' }, '', '');
});

// ─── مؤشر انقطاع الإنترنت ─────────────────────────────────
function _setOfflineBanner(offline) {
    const el = document.getElementById('offlineBanner');
    if (!el) return;
    el.style.display = offline ? 'flex' : 'none';
}
window.addEventListener('online',  () => _setOfflineBanner(false));
window.addEventListener('offline', () => _setOfflineBanner(true));
// تحقق عند التحميل
if (typeof navigator !== 'undefined' && !navigator.onLine) _setOfflineBanner(true);

// ─── رفع الصور بديل عبر رابط URL (لبيئة APK) ─────────────
window.showImageUrlInput = (target) => {
    const url = prompt('أدخل رابط الصورة (URL):');
    if (!url || !url.startsWith('http')) return;
    if (target === 'avatar') {
        document.getElementById('avatarPreview').src = url;
        document.getElementById('avatarPreview').style.display = 'block';
        document.getElementById('avatarPreview')._urlOverride = url;
    } else if (target === 'cover') {
        document.getElementById('coverPreview').src = url;
        document.getElementById('coverPreview').style.display = 'block';
        document.getElementById('coverPreviewWrap').style.display = 'block';
        document.getElementById('coverPreview')._urlOverride = url;
    }
};

/* REMOVED: loadOnePieceCommentsDirectly — dead code
async function loadOnePieceCommentsDirectly() {
    const apiUrl = 'https://anslayer.com/anime/public/anime/get-comments';
    
    // المعطيات والـ Headers السرية التي استخرجتها من تيرمكس
    const requestOptions = {
        method: 'POST',
        headers: {
            'Client-Id': 'android-app2',
            'Client-Secret': '7befba6263cc14c90d2f1d6da2c5cf9b251bfbbd',
            'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 11; Build/RP1A.200720.011)',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            anime_id: '2025' // معرف ون بيس
        })
    };

    try {
        console.log("⏳ جاري جلب التعليقات مباشرة من المصدر...");
        const response = await fetch(apiUrl, requestOptions);
        const data = await response.json();
        
        // استخراج مصفوفة التعليقات (تأكد من اسمها في الـ JSON القادم، بافتراض أنها لستة مباشرة أو داخل حقل comments)
        const comments = data.comments || data; 
        
        if (Array.isArray(comments)) {
            console.log(`✅ تم جلب ${comments.length} تعليق بنجاح!`);
            
            // هنا تقوم بتمرير التعليقات مباشرة للدالة التي تعرض المنشورات في تطبيقك
            displayFetchedComments(comments);
        } else {
            console.error("❌ صيغة البيانات القادمة غريبة، ليست مصفوفة.");
        }
    } catch (error) {
        console.error("❌ فشل الجلب المباشر بسبب حظر المتصفح الحالي (CORS) - سيعمل فوراً عند تحويله لتطبيق موبايل:", error);
    }
}

// دالة تجريبية لتوزيع التعليقات على الشاشة
function displayFetchedComments(comments) {
    const postsContainer = document.getElementById('posts-container'); // غيره حسب الـ ID عندك
    
    comments.forEach(comment => {
        // بناء تصميم التعليق وحقن حقل الـ category يدوياً أثناء العرض ليظهر وسم "ون بيس"
        const commentHTML = `
            <div class="post-card">
                <div class="post-header">
                    <strong>${comment.user_name || 'مستخدم أنمي سلاير'}</strong>
                    <span class="badge" style="background: var(--primary); color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:4px;">ون بيس ☠️</span>
                </div>
                <div class="post-body">
                    <p>${comment.comment_text || comment.text || ''}</p>
                </div>
            </div>
        `;
        postsContainer.insertAdjacentHTML('beforeend', commentHTML);
    });
}
// تشغيل الدالة تلقائياً عند فتح الصفحة
// loadOnePieceCommentsDirectly();
*/
