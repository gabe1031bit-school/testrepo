// ==UserScript==
// @name         WorldGuessr 2026 CHEAT/MOD | AUTO PING | LOCATION REVEAL | CHAT
// @namespace    http://tampermonkey.net/
// @version      421.69.67.1337.555
// @description  Shows locations on WorldGuessr. Auto-pin & live community chat with Discord bridge. No new tabs needed.
// @author       143X - DXXTHLY - SMURK
// @license      MIT
// @match        *://worldguessr.com/*
// @match        *://www.worldguessr.com/*
// @grant        none
// ==/UserScript==
 
(function () {
    'use strict';
 
    // ─── Profanity Filter ─────────────────────────────────────────────────────────
    const BANNED_WORDS = [
        'nigger','nigga','faggot','kike','spic','chink','cunt','retard',
        'tranny','wetback','gook','cracker','dyke','shithead','motherfucker',
        'fuck','shit','bitch','asshole','dickhead','bastard','whore'
    ];
 
    function filterProfanity(text) {
        if (!text || typeof text !== 'string') return text;
        let out = text;
        for (const word of BANNED_WORDS) {
            const re = new RegExp(word, 'gi');
            out = out.replace(re, '*'.repeat(word.length));
        }
        return out;
    }
 
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
 
    function isValidHex(c) { return /^#([0-9a-fA-F]{3}){1,2}$/.test(c); }
 
    // ─── Coord Helpers ────────────────────────────────────────────────────────────
    function getCoords() {
        const iframe = document.getElementById('streetview');
        if (!iframe) return null;
        const src = iframe.src || iframe.getAttribute('src') || '';
        const lngMatch = src.match(/!2d([-\d.]+)/);
        const latMatch = src.match(/!1d([-\d.]+)/);
        if (lngMatch && latMatch) return { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) };
        const old = src.match(/location=([-\d.]+),([-\d.]+)/);
        if (old) return { lat: parseFloat(old[1]), lng: parseFloat(old[2]) };
        return null;
    }
 
    async function reverseGeocode(lat, lng) {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'en' } });
            const data = await res.json();
            const a = data.address || {};
            return [a.city || a.town || a.village || a.county, a.state || a.region, a.country].filter(Boolean).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
    }
 
    // ─── Leaflet Map Finder ───────────────────────────────────────────────────────
    function isLeafletMap(v) {
        return v && typeof v === 'object'
            && typeof v.latLngToContainerPoint === 'function'
            && typeof v.getContainer === 'function'
            && typeof v.fire === 'function';
    }
 
    function searchObjectForMap(obj, depth, visited) {
        if (depth <= 0 || !obj || typeof obj !== 'object') return null;
        if (visited.has(obj)) return null;
        visited.add(obj);
        try {
            for (const key of Object.keys(obj)) {
                try {
                    const v = obj[key];
                    if (isLeafletMap(v)) return v;
                    if (v && typeof v === 'object' && depth > 1) {
                        const found = searchObjectForMap(v, depth - 1, visited);
                        if (found) return found;
                    }
                } catch {}
            }
        } catch {}
        return null;
    }
 
    function getLeafletMap() {
        const containers = Array.from(document.querySelectorAll('.leaflet-container'));
        for (const el of containers) {
            if (el._leaflet_map && isLeafletMap(el._leaflet_map)) return { map: el._leaflet_map, el };
            try {
                const allKeys = [...Object.keys(el), ...Object.getOwnPropertyNames(el)];
                for (const key of allKeys) {
                    try { const v = el[key]; if (isLeafletMap(v)) return { map: v, el }; } catch {}
                }
            } catch {}
            try {
                const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                if (fiberKey) {
                    let fiber = el[fiberKey]; let limit = 30;
                    while (fiber && limit-- > 0) {
                        for (const s of [fiber.memoizedState, fiber.memoizedProps, fiber.stateNode]) {
                            const found = searchObjectForMap(s, 3, new Set());
                            if (found) return { map: found, el };
                        }
                        fiber = fiber.return;
                    }
                }
            } catch {}
        }
        try {
            if (window.L) {
                const instances = window.L.Map && (window.L.Map._instances || window.L.Map._maps);
                if (instances) {
                    const vals = Object.values(instances);
                    if (vals.length > 0) return { map: vals[0], el: vals[0].getContainer() };
                }
            }
        } catch {}
        try {
            for (const key of Object.keys(window)) {
                try { const v = window[key]; if (isLeafletMap(v)) return { map: v, el: v.getContainer() }; } catch {}
            }
        } catch {}
        return null;
    }
 
    // ─── Pin Logic ────────────────────────────────────────────────────────────────
    function fireClick(el, clientX, clientY) {
        const base = { bubbles: true, cancelable: true, clientX, clientY, view: window };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { ...base, button: 0, buttons: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { ...base, button: 0, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('click', { ...base, button: 0, buttons: 0 }));
    }
 
    function latlngToMercatorPixel(lat, lng, rect) {
        const x = (lng + 180) / 360 * rect.width;
        const sinLat = Math.sin(lat * Math.PI / 180);
        const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * rect.height;
        return { clientX: rect.left + x, clientY: rect.top + y };
    }
 
    function firePinOnMap(lat, lng) {
        const result = getLeafletMap();
        if (result) {
            const { map, el } = result;
            try {
                const pt = map.latLngToContainerPoint([lat, lng]);
                const rect = el.getBoundingClientRect();
                const clientX = rect.left + pt.x, clientY = rect.top + pt.y;
                fireClick(el, clientX, clientY);
                map.fire('click', {
                    latlng: window.L ? window.L.latLng(lat, lng) : { lat, lng },
                    layerPoint: map.latLngToLayerPoint([lat, lng]),
                    containerPoint: pt,
                    originalEvent: new MouseEvent('click', { bubbles: true, clientX, clientY })
                });
                return true;
            } catch (e) { console.warn('[WG v11]', e); }
        }
        const candidates = Array.from(document.querySelectorAll('.leaflet-container, #miniMapArea, [class*="mapContainer"]'));
        candidates.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (rb.width * rb.height) - (ra.width * ra.height); });
        for (const container of candidates) {
            const rect = container.getBoundingClientRect();
            if (rect.width < 200 || rect.height < 150) continue;
            const { clientX, clientY } = latlngToMercatorPixel(lat, lng, rect);
            if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
            fireClick(container, clientX, clientY);
            container.querySelectorAll('canvas').forEach(c => fireClick(c, clientX, clientY));
            return true;
        }
        return false;
    }
 
    // ─── Auto-Pin ─────────────────────────────────────────────────────────────────
    let autoPinEnabled = false, lastPinnedSrc = '', autoPinInterval = null, autoPinRetries = 0;
    const MAX_RETRIES = 25;
 
    function tryAutoPin() {
        const iframe = document.getElementById('streetview');
        if (!iframe) return;
        const src = iframe.src || iframe.getAttribute('src') || '';
        if (!src || src === lastPinnedSrc) return;
        const coords = getCoords();
        if (!coords) return;
        lastPinnedSrc = src; autoPinRetries = 0;
        setTimeout(() => attemptPin(coords), 600);
    }
 
    function attemptPin(coords) {
        const ok = firePinOnMap(coords.lat, coords.lng);
        const btn = document.getElementById('wg-autopin-btn');
        if (ok) { autoPinRetries = 0; if (btn && autoPinEnabled) btn.innerHTML = '🎯 Pinned ✓'; return; }
        autoPinRetries++;
        if (autoPinRetries <= MAX_RETRIES) {
            if (btn && autoPinEnabled) btn.innerHTML = `🎯 Pinning… (${autoPinRetries})`;
            setTimeout(() => attemptPin(coords), 500 + autoPinRetries * 100);
        } else { if (btn && autoPinEnabled) btn.innerHTML = '🎯 Pin Failed'; }
    }
 
    function startAutoPinWatcher() {
        if (autoPinInterval) return;
        lastPinnedSrc = '';
        autoPinInterval = setInterval(() => { if (autoPinEnabled) tryAutoPin(); }, 800);
        setTimeout(tryAutoPin, 600);
    }
 
    function stopAutoPinWatcher() { if (autoPinInterval) { clearInterval(autoPinInterval); autoPinInterval = null; } }
 
    // ─── Debug ────────────────────────────────────────────────────────────────────
    window._wgDebug = function () {
        console.group('[WG v11] Debug');
        const coords = getCoords();
        console.log('coords:', coords);
        const leafletResult = getLeafletMap();
        console.log('leaflet map found:', !!leafletResult);
        if (coords) { console.log('attempting pin...'); firePinOnMap(coords.lat, coords.lng); }
        console.groupEnd();
    };
 
    // ─── Firebase Chat ────────────────────────────────────────────────────────────
    const FB_CONFIG = {
        apiKey: "AIzaSyCtTloqGNdhmI3Xt0ta11vF0MQJHiKpO7Q",
        authDomain: "chatforslither.firebaseapp.com",
        databaseURL: "https://chatforslither-default-rtdb.firebaseio.com",
        projectId: "chatforslither",
        storageBucket: "chatforslither.appspot.com",
        messagingSenderId: "1045559625491",
        appId: "1:1045559625491:web:79eb8200eb87edac00bce6"
    };
 
    // do as you please kek; come tlk to us
 
    const CHAT_MAX = 60;
    const CHAT_COOLDOWN = 8000;
    let fbReady = false, fbAuth = null, fbDb = null;
    let lastMsgTime = 0, chatMsgsArray = [], latestTimeLoaded = 0;
 
    // ─── DEV UIDs ─────────────────────────────────────────────────────────────────
    // Populated at runtime from Firebase Roles — any UID with role "dev" gets the tag
    let devUids = new Set();
 
    function loadDevUids(onFirstLoad) {
        if (!fbDb) return;
        let firstLoad = true;
        fbDb.ref('Roles').on('value', snap => {
            devUids.clear();
            if (snap.exists()) {
                snap.forEach(child => {
                    if (['dev','owner','admin'].includes(child.val())) devUids.add(child.key);
                });
            }
            console.log('[WG] devUids loaded:', [...devUids]);
            if (firstLoad) {
                firstLoad = false;
                if (typeof onFirstLoad === 'function') onFirstLoad();
            } else {
                // Roles changed live — re-render all visible messages so tags update
                reRenderAllMessages();
            }
        }, err => {
            console.warn('[WG] Roles read error:', err.code, err.message);
            // Still start chat even if Roles is unreadable
            if (firstLoad) { firstLoad = false; if (typeof onFirstLoad === 'function') onFirstLoad(); }
        });
    }
 
    function reRenderAllMessages() {
        const chatBody = document.getElementById('wg-chat-body');
        if (!chatBody || chatMsgsArray.length === 0) return;
        const scrollBottom = chatBody.scrollTop >= chatBody.scrollHeight - chatBody.clientHeight - 80;
        chatBody.innerHTML = '';
        chatMsgsArray.forEach(msg => renderMsg(msg, chatBody));
        if (scrollBottom) chatBody.scrollTop = chatBody.scrollHeight;
    }
 
    function loadFirebase(cb) {
        if (window.firebase && window.firebase.database) { cb(); return; }
        const load = (src, next) => {
            const s = document.createElement('script');
            s.src = src; s.onload = next; document.head.appendChild(s);
        };
        load('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js', () =>
        load('https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js', () =>
        load('https://www.gstatic.com/firebasejs/8.10.0/firebase-auth.js', cb)));
    }
 
    function initFirebase() {
        if (!window.firebase) return;
        if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
        fbDb = firebase.database();
        fbAuth = firebase.auth();
        fbAuth.signInAnonymously().then(cred => {
            const uid = cred.user.uid;
            const nick = localStorage.getItem('wg-chat-nick') || 'Scout';
            const color = localStorage.getItem('wg-chat-color') || '#EA4335';
            const userRef = fbDb.ref('onlineUsers/' + uid);
            userRef.update({ name: nick, uid, lastActive: Date.now(), chatNameColor: color });
            userRef.onDisconnect().remove();
            setInterval(() => userRef.update({ lastActive: Date.now() }), 30000);
            fbReady = true;
            // Load dev UIDs AFTER auth so Firebase rules allow the read,
            // then start the chat listener once we have the first snapshot.
            loadDevUids(() => startChatListener());
        }).catch(err => console.warn('[WG Chat] Auth error:', err));
    }
 
    function startChatListener() {
        const chatBody = document.getElementById('wg-chat-body');
        if (!chatBody || !fbDb) return;
        fbDb.ref('slitherChat').orderByChild('time').limitToLast(CHAT_MAX).once('value', snap => {
            chatMsgsArray = [];
            if (snap.exists()) {
                snap.forEach(child => chatMsgsArray.push({ key: child.key, ...child.val() }));
                chatMsgsArray.sort((a, b) => a.time - b.time);
                if (chatMsgsArray.length > 0) latestTimeLoaded = chatMsgsArray[chatMsgsArray.length - 1].time;
            }
            chatBody.innerHTML = '';
            chatMsgsArray.forEach(msg => renderMsg(msg, chatBody));
            chatBody.scrollTop = chatBody.scrollHeight;
 
            fbDb.ref('slitherChat').orderByChild('time').startAt(latestTimeLoaded + 1).on('child_added', newSnap => {
                const msg = { key: newSnap.key, ...newSnap.val() };
                if (chatMsgsArray.some(m => m.key === msg.key)) return;
                chatMsgsArray.push(msg);
                if (chatMsgsArray.length > CHAT_MAX) chatMsgsArray.shift();
                if (chatBody.children.length >= CHAT_MAX) chatBody.removeChild(chatBody.firstChild);
                renderMsg(msg, chatBody, true);
            });
        });
    }
 
    function renderMsg(msg, container, scroll = false) {
        if (!msg || !msg.uid) return;
        let nameColor = isValidHex(msg.chatNameColor) ? msg.chatNameColor : '#EA4335';
        const name = filterProfanity(escapeHTML(msg.name || 'Scout'));
        const rawText = msg.text || '';
 
        // Check if this message is a GIF/image URL
        const imageRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i;
        const imageMatch = rawText.match(imageRegex);
 
        const isSelf = fbAuth && fbAuth.currentUser && msg.uid === fbAuth.currentUser.uid;
        const time = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
 
        const el = document.createElement('div');
 
        // ── DEV tag check (rainbow glow) ─────────────────────────────────────────
        const isDev = devUids.has(msg.uid);
 
        el.style.cssText = `
            padding:7px 10px; margin-bottom:5px; border-radius:6px; word-break:break-word;
            background:${isSelf ? 'rgba(234,67,53,0.12)' : isDev ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)'};
            border-left:3px solid ${isSelf ? '#EA4335' : nameColor};
            font-size:12px; line-height:1.5; color:#ddd;
            ${isDev ? 'box-shadow: 0 0 8px rgba(255,100,255,0.15);' : ''}
        `;
 
        let textContent;
        if (imageMatch) {
            textContent = `<br><img src="${imageMatch[0]}" style="max-width:100%;height:auto;border-radius:4px;margin-top:4px;cursor:pointer;" onclick="window.open('${imageMatch[0]}','_blank')">`;
        } else {
            textContent = filterProfanity(escapeHTML(rawText));
        }
 
        // Discord messages get a tag
        const isDiscord = msg.uid === 'discord_bot' || (msg.name || '').startsWith('Discord(');
        let nameDisplay = name;
        let tagHTML = '';
 
        if (isDev) {
            // Rainbow glow DEV tag — applied regardless of Discord status
            const devName = escapeHTML(msg.name || 'Scout');
            nameDisplay = `<span class="wg-dev-name">${filterProfanity(devName)}</span>`;
            tagHTML = ` <span class="wg-dev-tag">DEV</span>`;
            // Override the border to rainbow too
            el.style.borderLeft = '3px solid transparent';
            el.style.borderImage = 'linear-gradient(180deg,#ff0080,#ff8c00,#ffe100,#00e676,#00b0ff,#d500f9) 1';
        } else if (isDiscord) {
            const nameMatch = (msg.name || '').match(/^Discord\((.*)\)$/);
            nameDisplay = nameMatch ? escapeHTML(nameMatch[1]) : name;
            tagHTML = ` <span style="background:#7289DA;color:#fff;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">DISCORD</span>`;
        }
 
        el.innerHTML = `<span style="color:#666;font-size:10px;">${time}</span> <b style="color:${isDev ? 'transparent' : nameColor};${isDev ? 'background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe100,#00e676,#00b0ff,#d500f9);-webkit-background-clip:text;background-clip:text;' : ''}">${nameDisplay}</b>${tagHTML}: ${textContent}`;
        container.appendChild(el);
        if (scroll || container.scrollTop >= container.scrollHeight - container.clientHeight - 80) {
            container.scrollTop = container.scrollHeight;
        }
        // Notify if chat is minimised or hidden
        if (scroll) bumpUnread();
    }
 
    // ─── Send Message (with Discord bridge) ───────────────────────────────────────
    function sendMessage(text) {
        if (!fbReady || !fbAuth || !fbAuth.currentUser) return;
        const clean = text.trim().slice(0, 120);
        if (!clean) return;
        const now = Date.now();
        if (now - lastMsgTime < CHAT_COOLDOWN) {
            const left = Math.ceil((CHAT_COOLDOWN - (now - lastMsgTime)) / 1000);
            showChatNotice(`Slow mode: wait ${left}s`);
            return;
        }
        const nick = localStorage.getItem('wg-chat-nick') || 'Scout';
        const color = localStorage.getItem('wg-chat-color') || '#EA4335';
 
        const messagePayload = {
            uid: fbAuth.currentUser.uid,
            name: nick,
            text: filterProfanity(clean),
            time: firebase.database.ServerValue.TIMESTAMP,
            chatNameColor: isValidHex(color) ? color : '#EA4335'
        };
 
        // Push to main chat
        fbDb.ref('slitherChat').push(messagePayload);
 
        // ── Discord Bridge (same as Slither mod) ──────────────────────────────────
        fbDb.ref('discordBridge').push(messagePayload);
 
        lastMsgTime = now;
    }
 
    // ─── Dev: /clear command ──────────────────────────────────────────────────────
    function devClearChat() {
        if (!fbDb || !fbAuth || !fbAuth.currentUser) return;
        if (!devUids.has(fbAuth.currentUser.uid)) {
            showChatNotice('⛔ Dev only command.');
            return;
        }
        // Remove every message in slitherChat
        fbDb.ref('slitherChat').once('value', snap => {
            if (!snap.exists()) { showChatNotice('Chat is already empty.'); return; }
            const updates = {};
            snap.forEach(child => { updates[child.key] = null; });
            fbDb.ref('slitherChat').update(updates).then(() => {
                // Log the clear action to discordBridge so Discord knows
                const nick = localStorage.getItem('wg-chat-nick') || 'Dev';
                fbDb.ref('discordBridge').push({
                    uid: fbAuth.currentUser.uid,
                    name: nick,
                    text: '🧹 Chat was cleared by a dev.',
                    time: firebase.database.ServerValue.TIMESTAMP,
                    chatNameColor: '#ff0080'
                });
                // Clear local UI immediately
                const chatBody = document.getElementById('wg-chat-body');
                if (chatBody) {
                    chatMsgsArray = [];
                    chatBody.innerHTML = '';
                    const notice = document.createElement('div');
                    notice.style.cssText = 'text-align:center;color:#555;font-size:11px;padding:16px 0;font-style:italic;';
                    notice.textContent = '🧹 Chat cleared by a dev.';
                    chatBody.appendChild(notice);
                }
                showChatNotice('🧹 Chat cleared.');
            }).catch(err => {
                console.warn('[WG] Clear failed:', err);
                showChatNotice('Clear failed — check console.');
            });
        });
    }
 
    function showChatNotice(msg) {
        const notice = document.getElementById('wg-chat-notice');
        if (!notice) return;
        notice.textContent = msg;
        notice.style.height = '22px';
        notice.style.padding = '2px 10px';
        notice.style.opacity = '1';
        setTimeout(() => {
            notice.style.opacity = '0';
            notice.style.height = '0';
            notice.style.padding = '0 10px';
        }, 2500);
    }
 
    // ─── Name Setup Modal ─────────────────────────────────────────────────────────
    function showNameModal(onDone) {
        const existing = document.getElementById('wg-name-modal');
        if (existing) existing.remove();
 
        const overlay = document.createElement('div');
        overlay.id = 'wg-name-modal';
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;
            display:flex;align-items:center;justify-content:center;
            font-family:'Google Sans',Roboto,sans-serif;
        `;
        overlay.innerHTML = `
            <div style="background:#1a1a2e;border-radius:16px;padding:28px 32px;width:320px;
                border:1px solid rgba(234,67,53,0.4);box-shadow:0 16px 48px rgba(0,0,0,0.6);color:#fff;">
                <div style="font-size:20px;font-weight:700;margin-bottom:6px;">👋 Join the Chat</div>
                <div style="font-size:13px;color:#888;margin-bottom:20px;">Pick a name to chat with other WorldGuessr players</div>
                <input id="wg-name-input" type="text" placeholder="Your name..." maxlength="20"
                    style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
                    background:rgba(255,255,255,0.07);color:#fff;font-size:14px;box-sizing:border-box;outline:none;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
                    <label style="font-size:13px;color:#aaa;">Chat color:</label>
                    <input id="wg-color-input" type="color" value="#EA4335"
                        style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;background:transparent;outline:2px solid rgba(255,255,255,0.2);">
                </div>
                <div id="wg-name-error" style="color:#f66;font-size:12px;min-height:16px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:8px;">
                    <button id="wg-name-skip" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
                        background:transparent;color:#888;cursor:pointer;font-size:13px;">Skip</button>
                    <button id="wg-name-join" style="flex:2;padding:10px;border-radius:8px;border:none;
                        background:#EA4335;color:#fff;cursor:pointer;font-size:14px;font-weight:700;">Join Chat</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
 
        const input = overlay.querySelector('#wg-name-input');
        const colorIn = overlay.querySelector('#wg-color-input');
        const errEl = overlay.querySelector('#wg-name-error');
        const savedName = localStorage.getItem('wg-chat-nick');
        const savedColor = localStorage.getItem('wg-chat-color');
        if (savedName) input.value = savedName;
        if (savedColor) colorIn.value = savedColor;
        setTimeout(() => input.focus(), 50);
 
        const join = () => {
            const name = input.value.trim();
            if (!name) { errEl.textContent = 'Please enter a name.'; return; }
            if (name.length < 2) { errEl.textContent = 'Name must be at least 2 characters.'; return; }
            if (!/^[a-zA-Z0-9_\- ]+$/.test(name)) { errEl.textContent = 'Letters, numbers, spaces, - and _ only.'; return; }
            localStorage.setItem('wg-chat-nick', filterProfanity(name));
            localStorage.setItem('wg-chat-color', colorIn.value);
            overlay.remove();
            onDone();
        };
 
        overlay.querySelector('#wg-name-join').onclick = join;
        overlay.querySelector('#wg-name-skip').onclick = () => {
            localStorage.setItem('wg-chat-nick', 'Scout' + Math.floor(Math.random() * 9999));
            localStorage.setItem('wg-chat-color', '#EA4335');
            overlay.remove();
            onDone();
        };
        input.onkeydown = e => { if (e.key === 'Enter') join(); };
    }
 
    // ─── Chat UI ──────────────────────────────────────────────────────────────────
    let chatMinimized = false;
    let chatVisible = false;
    let unreadCount = 0;
    let dragState = { dragging: false, startX: 0, startY: 0, origLeft: 0, origTop: 0 };
 
    function clearUnread() {
        unreadCount = 0;
        const dot = document.getElementById('wg-pill-dot');
        if (dot) dot.style.display = 'none';
        const pillText = document.getElementById('wg-pill-text');
        if (pillText) { pillText.textContent = 'Click to expand'; pillText.style.color = '#888'; }
        const pill = document.getElementById('wg-chat-pill');
        if (pill) pill.style.borderColor = 'rgba(234,67,53,0.3)';
        const btnDot = document.getElementById('wg-chatbtn-dot');
        if (btnDot) btnDot.style.display = 'none';
    }
 
    function bumpUnread() {
        if (!chatMinimized && chatVisible) return;
        unreadCount++;
        const dot = document.getElementById('wg-pill-dot');
        if (dot) dot.style.display = 'inline-block';
        const pillText = document.getElementById('wg-pill-text');
        if (pillText) {
            pillText.textContent = `${unreadCount} new message${unreadCount === 1 ? '' : 's'} — tap to expand`;
            pillText.style.color = '#EA4335';
        }
        const pill = document.getElementById('wg-chat-pill');
        if (pill) pill.style.borderColor = 'rgba(234,67,53,0.7)';
        const btnDot = document.getElementById('wg-chatbtn-dot');
        if (btnDot) btnDot.style.display = 'inline-block';
    }
 
    function buildChatWindow() {
        if (document.getElementById('wg-chat-window')) return;
 
        const win = document.createElement('div');
        win.id = 'wg-chat-window';
        win.style.cssText = `
            position:fixed;bottom:80px;right:20px;
            width:300px;z-index:2147483646;
            font-family:'Google Sans',Roboto,sans-serif;
            display:none;
            filter:drop-shadow(0 8px 32px rgba(0,0,0,0.5));
        `;
 
        win.innerHTML = `
            <div id="wg-chat-header" style="
                background:linear-gradient(135deg,#1a1a2e,#16213e);
                border:1px solid rgba(234,67,53,0.5);
                border-bottom:none;
                border-radius:12px 12px 0 0;
                padding:10px 12px;
                display:flex;align-items:center;justify-content:space-between;
                cursor:move;user-select:none;
            ">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:15px;">💬</span>
                    <span style="font-size:13px;font-weight:700;color:#fff;">143X Chat</span>
                    <span id="wg-chat-online" style="font-size:10px;color:#888;"></span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <button id="wg-chat-settings-btn" title="Change name/color" style="
                        background:none;border:none;color:#888;cursor:pointer;
                        font-size:14px;padding:2px 5px;border-radius:4px;
                        transition:color 0.2s;
                    ">⚙</button>
                    <button id="wg-chat-minimize-btn" title="Minimize" style="
                        background:none;border:none;color:#888;cursor:pointer;
                        font-size:16px;padding:2px 5px;border-radius:4px;line-height:1;
                        transition:color 0.2s;
                    ">−</button>
                    <button id="wg-chat-close-btn" title="Close" style="
                        background:none;border:none;color:#888;cursor:pointer;
                        font-size:16px;padding:2px 5px;border-radius:4px;line-height:1;
                        transition:color 0.2s;
                    ">✕</button>
                </div>
            </div>
 
            <div id="wg-chat-body-wrap" style="
                background:rgba(10,10,20,0.97);
                border:1px solid rgba(234,67,53,0.3);
                border-top:none;border-bottom:none;
                overflow:hidden;
                transition:height 0.2s ease;
                height:260px;
            ">
                <div id="wg-chat-body" style="
                    height:260px;overflow-y:auto;padding:10px;
                    scrollbar-width:thin;scrollbar-color:#EA4335 rgba(0,0,0,0.1);
                ">
                    <div style="text-align:center;color:#555;font-size:12px;padding:20px 0;">
                        Connecting to chat...
                    </div>
                </div>
            </div>
 
            <div id="wg-chat-notice" style="
                background:rgba(234,67,53,0.15);color:#f88;
                font-size:11px;text-align:center;padding:0 10px;
                height:0;overflow:hidden;opacity:0;
                transition:opacity 0.3s,height 0.2s,padding 0.2s;
                border-left:1px solid rgba(234,67,53,0.3);
                border-right:1px solid rgba(234,67,53,0.3);
            "></div>
 
            <div id="wg-chat-input-wrap" style="
                background:rgba(10,10,20,0.97);
                border:1px solid rgba(234,67,53,0.3);
                border-top:1px solid rgba(234,67,53,0.15);
                border-radius:0 0 12px 12px;
                display:flex;align-items:center;
                padding:8px 10px;gap:6px;
            ">
                <input id="wg-chat-input" type="text" placeholder="Type a message..." maxlength="120"
                    style="
                        flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                        border-radius:6px;padding:7px 10px;color:#fff;font-size:12px;outline:none;
                        font-family:inherit;transition:border-color 0.2s;
                    ">
                <button id="wg-chat-send-btn" style="
                    background:#EA4335;border:none;border-radius:6px;
                    padding:7px 12px;color:#fff;cursor:pointer;
                    font-size:12px;font-weight:700;transition:background 0.2s;white-space:nowrap;
                ">Send</button>
            </div>
 
            <div id="wg-chat-pill" style="
                display:none;
                background:rgba(10,10,20,0.97);
                border:1px solid rgba(234,67,53,0.3);
                border-radius:0 0 12px 12px;
                padding:7px 12px;
                font-size:11px;color:#888;text-align:center;cursor:pointer;
                display:none;
            "><span id="wg-pill-dot" style="display:none;width:8px;height:8px;border-radius:50%;background:#EA4335;box-shadow:0 0 6px rgba(234,67,53,0.9);margin-right:6px;vertical-align:middle;animation:wg-pulse 1.4s ease-in-out infinite;"></span><span id="wg-pill-text">Click to expand</span></div>
        `;
 
        document.body.appendChild(win);
 
        // Header drag
        const header = win.querySelector('#wg-chat-header');
        header.addEventListener('mousedown', e => {
            if (e.target.closest('button')) return;
            dragState.dragging = true;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            const rect = win.getBoundingClientRect();
            dragState.origLeft = rect.left;
            dragState.origTop = rect.top;
            win.style.right = 'auto';
            win.style.bottom = 'auto';
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';
            e.preventDefault();
        });
 
        document.addEventListener('mousemove', e => {
            if (!dragState.dragging) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            let newLeft = dragState.origLeft + dx;
            let newTop = dragState.origTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - win.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));
            win.style.left = newLeft + 'px';
            win.style.top = newTop + 'px';
        });
 
        document.addEventListener('mouseup', () => { dragState.dragging = false; });
 
        // Minimize
        const minimizeBtn = win.querySelector('#wg-chat-minimize-btn');
        minimizeBtn.onmouseenter = () => minimizeBtn.style.color = '#fff';
        minimizeBtn.onmouseleave = () => minimizeBtn.style.color = '#888';
        minimizeBtn.onclick = () => toggleMinimize(win);
        win.querySelector('#wg-chat-pill').onclick = () => toggleMinimize(win);
 
        // Close
        const closeBtn = win.querySelector('#wg-chat-close-btn');
        closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseleave = () => closeBtn.style.color = '#888';
        closeBtn.onclick = () => {
            win.style.display = 'none';
            chatVisible = false;
            const chatToggle = document.getElementById('wg-chat-btn');
            if (chatToggle) {
                const lbl = document.getElementById('wg-chatbtn-label');
                if (lbl) lbl.textContent = '💬 Chat';
                chatToggle.classList.remove('active');
            }
        };
 
        // Settings
        const settingsBtn = win.querySelector('#wg-chat-settings-btn');
        settingsBtn.onmouseenter = () => settingsBtn.style.color = '#fff';
        settingsBtn.onmouseleave = () => settingsBtn.style.color = '#888';
        settingsBtn.onclick = () => {
            showNameModal(() => {
                const nick = localStorage.getItem('wg-chat-nick');
                const color = localStorage.getItem('wg-chat-color') || '#EA4335';
                if (fbReady && fbAuth && fbAuth.currentUser) {
                    fbDb.ref('onlineUsers/' + fbAuth.currentUser.uid).update({ name: nick, chatNameColor: color });
                }
            });
        };
 
        // Send
        const input = win.querySelector('#wg-chat-input');
        const sendBtn = win.querySelector('#wg-chat-send-btn');
        input.onfocus = () => input.style.borderColor = 'rgba(234,67,53,0.5)';
        input.onblur = () => input.style.borderColor = 'rgba(255,255,255,0.1)';
        sendBtn.onmouseenter = () => sendBtn.style.background = '#c0392b';
        sendBtn.onmouseleave = () => sendBtn.style.background = '#EA4335';
 
        const doSend = () => {
            const val = input.value.trim();
            if (!val) return;
            if (!fbReady) { showChatNotice('Connecting…'); return; }
            // ── Dev commands ──────────────────────────────────────────────────────
            if (val.toLowerCase() === '/clear') {
                input.value = '';
                if (!fbAuth || !fbAuth.currentUser || !devUids.has(fbAuth.currentUser.uid)) {
                    showChatNotice('⛔ Dev only command.');
                    return;
                }
                devClearChat();
                return;
            }
            sendMessage(val);
            input.value = '';
        };
        sendBtn.onclick = doSend;
        input.onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); doSend(); }
            e.stopPropagation();
        };
        input.addEventListener('keyup', e => e.stopPropagation());
 
        // Online count
        setInterval(() => {
            if (!fbDb) return;
            fbDb.ref('onlineUsers').once('value', snap => {
                const users = snap.val() || {};
                const now = Date.now();
                const online = Object.values(users).filter(u => now - (u.lastActive || 0) < 300000).length;
                const el = document.getElementById('wg-chat-online');
                if (el) el.textContent = online > 0 ? `${online} online` : '';
            });
        }, 15000);
    }
 
    function toggleMinimize(win) {
        chatMinimized = !chatMinimized;
        const bodyWrap = win.querySelector('#wg-chat-body-wrap');
        const inputWrap = win.querySelector('#wg-chat-input-wrap');
        const pill = win.querySelector('#wg-chat-pill');
        const minimizeBtn = win.querySelector('#wg-chat-minimize-btn');
        if (chatMinimized) {
            bodyWrap.style.display = 'none';
            inputWrap.style.display = 'none';
            pill.style.display = 'block';
            minimizeBtn.textContent = '+';
        } else {
            bodyWrap.style.display = 'block';
            inputWrap.style.display = 'flex';
            pill.style.display = 'none';
            minimizeBtn.textContent = '−';
            const chatBody = document.getElementById('wg-chat-body');
            if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
            clearUnread();
        }
    }
 
    function openChat() {
        const win = document.getElementById('wg-chat-window');
        if (!win) { buildChatWindow(); return openChat(); }
        chatVisible = true;
        win.style.display = 'block';
        if (chatMinimized) toggleMinimize(win);
        clearUnread();
        if (!fbReady) {
            loadFirebase(() => {
                initFirebase();
            });
        } else {
            startChatListener();
        }
    }
 
    // ─── Map Canvas Animation ─────────────────────────────────────────────────────
    const LAND = [
        [[-168,72],[-140,72],[-120,74],[-85,73],[-65,68],[-55,62],[-52,46],[-66,44],[-70,41],[-75,34],[-80,25],[-87,15],[-77,8],[-82,9],[-90,13],[-92,19],[-97,22],[-97,30],[-94,30],[-90,29],[-82,29],[-80,27],[-81,24],[-81,30],[-77,35],[-75,38],[-72,41],[-70,43],[-67,47],[-61,46],[-60,47],[-65,54],[-79,57],[-82,62],[-88,65],[-93,68],[-105,70],[-120,70],[-135,68],[-148,62],[-152,58],[-160,55],[-163,54],[-165,60],[-168,60],[-168,72]],
        [[-73,76],[-50,83],[-25,83],[-18,76],[-22,70],[-25,65],[-44,59],[-55,65],[-68,70],[-73,76]],
        [[-80,8],[-77,8],[-75,11],[-63,10],[-60,5],[-52,5],[-50,0],[-48,-5],[-35,-10],[-35,-20],[-40,-22],[-44,-23],[-45,-29],[-52,-33],[-53,-34],[-58,-38],[-62,-40],[-65,-45],[-65,-55],[-68,-55],[-70,-52],[-72,-48],[-75,-40],[-74,-35],[-73,-28],[-70,-18],[-75,-14],[-77,-8],[-80,0],[-80,8]],
        [[-5,36],[0,35],[5,43],[10,44],[13,44],[18,40],[21,37],[24,37],[26,40],[28,40],[30,46],[28,50],[24,55],[18,57],[12,56],[8,58],[5,62],[0,58],[-5,48],[-5,44],[-8,44],[-8,42],[-5,36]],
        [[5,58],[8,58],[12,56],[18,57],[24,55],[28,56],[30,60],[30,70],[28,70],[20,70],[15,68],[10,63],[5,62],[5,58]],
        [[-5,36],[0,35],[10,37],[15,37],[25,37],[32,30],[37,20],[43,12],[50,12],[43,5],[35,-5],[36,-17],[34,-25],[30,-32],[18,-34],[16,-28],[12,-22],[9,-5],[8,5],[4,5],[0,5],[-5,10],[-12,12],[-15,14],[-17,15],[-17,20],[-12,28],[-5,36]],
        [[28,40],[28,50],[24,55],[30,60],[38,65],[48,68],[60,70],[70,72],[80,72],[100,70],[120,68],[130,68],[135,65],[132,50],[130,42],[125,40],[120,40],[115,38],[105,35],[100,30],[95,28],[92,22],[88,22],[80,20],[72,22],[62,22],[58,22],[56,25],[55,30],[52,30],[50,35],[48,38],[42,38],[38,38],[34,37],[32,37],[28,40]],
        [[114,-22],[116,-20],[122,-18],[128,-14],[130,-12],[136,-12],[138,-14],[140,-16],[144,-18],[148,-18],[150,-22],[152,-26],[152,-30],[150,-34],[148,-38],[144,-38],[140,-36],[136,-36],[132,-32],[128,-34],[124,-34],[120,-34],[116,-32],[114,-30],[113,-26],[114,-22]],
        [[172,-41],[174,-38],[176,-37],[178,-38],[178,-40],[176,-41],[174,-42],[172,-41]],
        [[-24,63],[-22,65],[-14,66],[-14,64],[-18,63],[-24,63]],
    ];
 
    function mercatorProject(lng, lat, centerLng, centerLat, zoom, W, H) {
        const DEG = Math.PI / 180, mapW = W * zoom, mapH = mapW / 2;
        const toX = l => (l + 180) / 360 * mapW;
        const toY = la => { const s = Math.max(-0.9999, Math.min(0.9999, Math.sin(la * DEG))); return mapH / 2 - (mapH / (2 * Math.PI)) * Math.log((1 + s) / (1 - s)); };
        return { x: W / 2 + (toX(lng) - toX(centerLng)), y: H / 2 + (toY(lat) - toY(centerLat)) };
    }
 
    function startMapAnimation(canvas, pinLat, pinLng) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr; canvas.height = canvas.offsetHeight * dpr;
        canvas.style.width = canvas.offsetWidth + 'px'; canvas.style.height = canvas.offsetHeight + 'px';
        const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
        let frame = 0, animId;
        const CYCLE = 280;
        const easeInOut = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
        const drawPoly = (poly, cLng, cLat, zoom) => {
            if (!poly || poly.length < 2) return;
            ctx.beginPath(); let first = true;
            for (const [lng, lat] of poly) { const p = mercatorProject(lng, lat, cLng, cLat, zoom, W, H); first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false; }
            ctx.closePath();
        };
        const render = () => {
            ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0d1b3e'; ctx.fillRect(0, 0, W, H);
            const t = (frame % CYCLE) / CYCLE, phase = t < 0.7 ? easeInOut(t / 0.7) : 1;
            const zoom = Math.exp(Math.log(35) * (1 - phase) + Math.log(1) * phase);
            ctx.fillStyle = '#1e3a1e'; ctx.strokeStyle = '#2d5a2d'; ctx.lineWidth = 0.8 * dpr;
            for (const poly of LAND) { drawPoly(poly, pinLng, pinLat, zoom); ctx.fill(); ctx.stroke(); }
            const vig = ctx.createRadialGradient(W/2, H/2, H*0.1, W/2, H/2, H*0.75);
            vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,10,0.55)');
            ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
            const pin = mercatorProject(pinLng, pinLat, pinLng, pinLat, zoom, W, H);
            const pinAlpha = Math.max(0, 1 - phase * 2.8);
            if (pinAlpha > 0.01) {
                const pulse = (Math.sin(frame * 0.18) + 1) / 2;
                ctx.save(); ctx.globalAlpha = pinAlpha * 0.35 * (0.4 + pulse * 0.6);
                ctx.beginPath(); ctx.arc(pin.x, pin.y, (16 + pulse * 10) * dpr, 0, Math.PI * 2); ctx.fillStyle = '#EA4335'; ctx.fill(); ctx.restore();
                ctx.save(); ctx.globalAlpha = pinAlpha;
                ctx.beginPath(); ctx.arc(pin.x, pin.y, 5.5 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
                ctx.beginPath(); ctx.arc(pin.x, pin.y, 3.5 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#EA4335'; ctx.fill(); ctx.restore();
            }
            const crossAlpha = Math.max(0, (phase - 0.65) / 0.35);
            if (crossAlpha > 0.01) {
                ctx.save(); ctx.globalAlpha = crossAlpha;
                ctx.beginPath(); ctx.arc(pin.x, pin.y, 4 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#EA4335'; ctx.fill();
                ctx.strokeStyle = 'rgba(234,67,53,0.7)'; ctx.lineWidth = 1.5 * dpr;
                ctx.beginPath(); ctx.moveTo(pin.x - 11*dpr, pin.y); ctx.lineTo(pin.x + 11*dpr, pin.y);
                ctx.moveTo(pin.x, pin.y - 11*dpr); ctx.lineTo(pin.x, pin.y + 11*dpr);
                ctx.stroke(); ctx.restore();
            }
            frame++; animId = requestAnimationFrame(render);
        };
        render();
        return () => cancelAnimationFrame(animId);
    }
 
    // ─── YouTube Easter Egg ───────────────────────────────────────────────────────
    let ytPlayer = null, ytReady = false;
    function loadYTApi() { if (document.getElementById('wg-yt-api')) return; const t = document.createElement('script'); t.id = 'wg-yt-api'; t.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(t); }
    function ensureYTContainer() { if (document.getElementById('wg-yt-container')) return; const c = document.createElement('div'); c.id = 'wg-yt-container'; c.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;'; const i = document.createElement('div'); i.id = 'wg-yt-player'; c.appendChild(i); document.body.appendChild(c); }
    function initYTPlayer() { ensureYTContainer(); if (ytPlayer) return; ytPlayer = new YT.Player('wg-yt-player', { videoId: 'vK2EBHMYyq4', playerVars: { autoplay:0, controls:0, disablekb:1, fs:0, modestbranding:1, rel:0 }, events: { onReady: () => { ytReady = true; ytPlayer.setVolume(10); } } }); }
    function preloadYT() { loadYTApi(); const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); initYTPlayer(); }; if (window.YT && window.YT.Player) initYTPlayer(); }
    function playEggMusic() { if (ytReady && ytPlayer) { ytPlayer.seekTo(0); ytPlayer.playVideo(); } }
    function stopEggMusic() { if (ytReady && ytPlayer) ytPlayer.stopVideo(); }
 
    // ─── Styles ───────────────────────────────────────────────────────────────────
    const css = `
        #wg-scout-btn {
            position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;
            font-weight:600;font-size:14px;font-family:'Google Sans',Roboto,sans-serif;
            padding:10px 22px;background:rgba(0,0,0,0.18);color:rgba(255,255,255,0.35);
            border:1px solid rgba(255,255,255,0.12);border-radius:10px;cursor:pointer;
            backdrop-filter:blur(4px);transition:background 0.2s,color 0.2s,border-color 0.2s,box-shadow 0.2s;white-space:nowrap;
        }
        #wg-scout-btn:hover { background:#EA4335;color:#fff;border-color:transparent;box-shadow:0 4px 16px rgba(234,67,53,0.45); }
        #wg-scout-btn.loading { background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.4);cursor:wait; }
        #wg-autopin-btn {
            position:fixed;top:52px;left:50%;transform:translateX(-50%);z-index:2147483647;
            font-weight:600;font-size:12px;font-family:'Google Sans',Roboto,sans-serif;
            padding:7px 18px;background:rgba(0,0,0,0.18);color:rgba(255,255,255,0.3);
            border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;
            backdrop-filter:blur(4px);transition:background 0.2s,color 0.2s,box-shadow 0.2s;white-space:nowrap;
        }
        #wg-autopin-btn:hover { background:rgba(0,0,0,0.35);color:rgba(255,255,255,0.6); }
        #wg-autopin-btn.active { background:#EA4335;color:#fff;border-color:transparent;box-shadow:0 3px 12px rgba(234,67,53,0.5); }
        #wg-autopin-btn.active:hover { background:#c0392b; }
        #wg-chat-btn {
            position:fixed;top:86px;left:50%;transform:translateX(-50%);z-index:2147483647;
            font-weight:600;font-size:12px;font-family:'Google Sans',Roboto,sans-serif;
            padding:7px 18px;background:rgba(0,0,0,0.18);color:rgba(255,255,255,0.3);
            border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;
            backdrop-filter:blur(4px);transition:background 0.2s,color 0.2s,box-shadow 0.2s;white-space:nowrap;
            overflow:visible;
        }
        #wg-chat-btn:hover { background:rgba(0,0,0,0.35);color:rgba(255,255,255,0.6); }
        #wg-chat-btn.active { background:#5865F2;color:#fff;border-color:transparent;box-shadow:0 3px 12px rgba(88,101,242,0.5); }
        #wg-popup-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483646;display:flex;align-items:center;justify-content:center; }
        #wg-popup { background:#1a1a2e;border-radius:18px;width:380px;max-width:92vw;box-shadow:0 16px 60px rgba(0,0,0,0.7);font-family:'Google Sans',Roboto,sans-serif;color:#fff;position:relative;overflow:hidden; }
        #wg-map-canvas { width:100%;height:200px;display:block;border-radius:18px 18px 0 0;cursor:pointer; }
        .wg-map-hint { position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:rgba(255,255,255,0.7);font-size:10px;font-family:monospace;padding:3px 8px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity 0.2s; }
        #wg-popup:hover .wg-map-hint { opacity:1; }
        #wg-popup .popup-body { padding:18px 20px 20px; }
        #wg-popup .location-row { display:flex;align-items:flex-start;gap:10px;margin-bottom:16px; }
        #wg-popup .pin { font-size:26px;line-height:1;flex-shrink:0;margin-top:2px; }
        #wg-popup .location-name { font-size:17px;font-weight:700;line-height:1.3;margin:0 0 4px;color:#fff; }
        #wg-popup .coords { font-size:11px;color:#aaa;margin:0 0 3px;font-family:monospace; }
        #wg-popup .roughly { font-size:10px;color:#555;margin:0;font-style:italic; }
        #wg-popup .actions { display:flex;gap:8px; }
        #wg-popup .btn-link { flex:1;padding:11px 8px;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity 0.15s,transform 0.1s; }
        #wg-popup .btn-link:hover { opacity:0.85;transform:translateY(-1px); }
        #wg-popup .btn-site { background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff; }
        #wg-popup .btn-discord { background:#5865F2;color:#fff; }
        #wg-popup .btn-close { position:absolute;top:10px;right:12px;background:rgba(0,0,0,0.5);border:none;font-size:15px;cursor:pointer;color:#ddd;padding:5px 7px;border-radius:6px;z-index:10; }
        #wg-popup .btn-close:hover { background:rgba(0,0,0,0.8);color:#fff; }
        #wg-egg { position:fixed;bottom:16px;left:16px;z-index:2147483647;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.12);user-select:none;transition:background 0.2s; }
        #wg-egg:hover { background:rgba(255,255,255,0.1); }
        #wg-egg-blast { position:fixed;inset:0;z-index:2147483645;pointer-events:none;overflow:hidden; }
        #wg-egg-modal { position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);animation:wg-modal-in 0.25s ease forwards; }
        @keyframes wg-modal-in { from{opacity:0}to{opacity:1} }
        #wg-egg-card { background:#f0eeff;border:none;border-radius:20px;padding:32px 36px;max-width:360px;width:90vw;text-align:center;font-family:'Google Sans',Roboto,sans-serif;color:#111;box-shadow:0 0 80px rgba(124,58,237,0.6);animation:wg-egg-pop 0.45s cubic-bezier(0.17,0.67,0.35,1.3) forwards; }
        @keyframes wg-egg-pop { from{transform:scale(0.4) rotate(-12deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1} }
        #wg-egg-card .egg-eyeball { font-size:48px;display:block;margin:0 0 10px; }
        #wg-egg-card .egg-title { font-size:22px;font-weight:700;margin:0 0 12px;color:#7c3aed; }
        #wg-egg-card .egg-body { font-size:14px;color:#111;line-height:1.75;margin:0 0 12px; }
        #wg-egg-card .egg-fine { font-size:11px;color:#333;margin:0 0 20px;font-style:italic; }
        #wg-egg-card .egg-dc-btn { display:block;width:100%;margin:10px 0 0;padding:11px 20px;border:none;border-radius:9px;background:#5865F2;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit; }
        #wg-egg-card .egg-dismiss { display:block;margin:8px auto 0;background:none;border:none;color:#555;font-size:11px;cursor:pointer;font-family:inherit; }
        @keyframes wg-ptcl { 0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}100%{transform:translate(var(--tx),var(--ty)) rotate(var(--rot)) scale(0.1);opacity:0} }
        #wg-chat-body::-webkit-scrollbar { width:4px; }
        #wg-chat-body::-webkit-scrollbar-track { background:rgba(0,0,0,0.1); }
        #wg-chat-body::-webkit-scrollbar-thumb { background:#EA4335;border-radius:2px; }
        @keyframes wg-pulse {
            0%,100% { opacity:1; transform:scale(1); }
            50%      { opacity:0.5; transform:scale(1.35); }
        }
        #wg-chatbtn-dot {
            display:none;
            position:fixed;
            width:10px;height:10px;border-radius:50%;
            background:#EA4335;
            box-shadow:0 0 6px rgba(234,67,53,0.9);
            animation:wg-pulse 1.4s ease-in-out infinite;
            pointer-events:none;
            z-index:2147483647;
        }
 
        /* ── DEV Tag — rainbow glow ───────────────────────────────────────────── */
        @keyframes wg-rainbow-shift {
            0%   { background-position: 0% 50%; }
            50%  { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes wg-rainbow-glow {
            0%   { box-shadow: 0 0 6px 1px #ff0080, 0 0 12px 2px #ff000055; }
            17%  { box-shadow: 0 0 6px 1px #ff8c00, 0 0 12px 2px #ff8c0055; }
            33%  { box-shadow: 0 0 6px 1px #ffe100, 0 0 12px 2px #ffe10055; }
            50%  { box-shadow: 0 0 6px 1px #00e676, 0 0 12px 2px #00e67655; }
            67%  { box-shadow: 0 0 6px 1px #00b0ff, 0 0 12px 2px #00b0ff55; }
            83%  { box-shadow: 0 0 6px 1px #d500f9, 0 0 12px 2px #d500f955; }
            100% { box-shadow: 0 0 6px 1px #ff0080, 0 0 12px 2px #ff000055; }
        }
        @keyframes wg-name-rainbow {
            0%   { filter: drop-shadow(0 0 3px #ff0080); }
            17%  { filter: drop-shadow(0 0 3px #ff8c00); }
            33%  { filter: drop-shadow(0 0 3px #ffe100); }
            50%  { filter: drop-shadow(0 0 3px #00e676); }
            67%  { filter: drop-shadow(0 0 3px #00b0ff); }
            83%  { filter: drop-shadow(0 0 3px #d500f9); }
            100% { filter: drop-shadow(0 0 3px #ff0080); }
        }
        .wg-dev-tag {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: #fff;
            background: linear-gradient(90deg, #ff0080, #ff8c00, #ffe100, #00e676, #00b0ff, #d500f9, #ff0080);
            background-size: 300% 300%;
            animation: wg-rainbow-shift 2.5s ease infinite, wg-rainbow-glow 2.5s ease infinite;
            vertical-align: middle;
            position: relative;
            top: -1px;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        .wg-dev-name {
            background: linear-gradient(90deg, #ff0080, #ff8c00, #ffe100, #00e676, #00b0ff, #d500f9, #ff0080);
            background-size: 300% 300%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: wg-rainbow-shift 2.5s ease infinite, wg-name-rainbow 2.5s ease infinite;
            font-weight: 700;
        }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
 
    // ─── Popup ────────────────────────────────────────────────────────────────────
    function showPopup(coords, locationName) {
        const overlay = document.createElement('div');
        overlay.id = 'wg-popup-overlay';
        overlay.innerHTML = `
            <div id="wg-popup">
                <button class="btn-close">✕</button>
                <div style="position:relative">
                    <canvas id="wg-map-canvas"></canvas>
                    <div class="wg-map-hint">🗺 click to open in google maps</div>
                </div>
                <div class="popup-body">
                    <div class="location-row">
                        <div class="pin">📍</div>
                        <div>
                            <p class="location-name">${locationName}</p>
                            <p class="coords">${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}</p>
                            <p class="roughly">~ roughly this area</p>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-link btn-site">🌐 dxxthly.com</button>
                        <button class="btn-link btn-discord">💬 143X Discord</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const canvas = overlay.querySelector('#wg-map-canvas');
        const stopAnim = startMapAnimation(canvas, coords.lat, coords.lng);
        canvas.onclick = () => window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=14`, '_blank');
        const close = () => { stopAnim(); overlay.remove(); };
        overlay.querySelector('.btn-close').onclick = close;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('.btn-site').onclick = () => window.open('https://dxxthly.com', '_blank');
        overlay.querySelector('.btn-discord').onclick = () => window.open('https://dsc.gg/143x', '_blank');
    }
 
    // ─── Buttons ──────────────────────────────────────────────────────────────────
    function addMainButton() {
        if (document.getElementById('wg-scout-btn')) return;
 
        const btn = document.createElement('button');
        btn.id = 'wg-scout-btn';
        btn.innerHTML = '📍 Where Am I?';
        btn.onclick = async () => {
            const coords = getCoords();
            if (!coords) { alert('Get in the game first.'); return; }
            btn.classList.add('loading'); btn.innerHTML = '⏳ Locating...';
            const name = await reverseGeocode(coords.lat, coords.lng);
            btn.classList.remove('loading'); btn.innerHTML = '📍 Where Am I?';
            showPopup(coords, name);
        };
        document.body.appendChild(btn);
 
        const pinBtn = document.createElement('button');
        pinBtn.id = 'wg-autopin-btn';
        pinBtn.innerHTML = '🎯 Auto-Pin: OFF';
        pinBtn.onclick = () => {
            autoPinEnabled = !autoPinEnabled;
            if (autoPinEnabled) {
                pinBtn.innerHTML = '🎯 Auto-Pin: ON';
                pinBtn.classList.add('active');
                startAutoPinWatcher();
            } else {
                pinBtn.innerHTML = '🎯 Auto-Pin: OFF';
                pinBtn.classList.remove('active');
                stopAutoPinWatcher();
            }
        };
        document.body.appendChild(pinBtn);
 
        const chatBtn = document.createElement('button');
        chatBtn.id = 'wg-chat-btn';
        chatBtn.innerHTML = '<span id="wg-chatbtn-label">💬 Chat</span><span id="wg-chatbtn-dot"></span>';
 
        const setChatBtnLabel = (txt) => {
            const lbl = document.getElementById('wg-chatbtn-label');
            if (lbl) lbl.textContent = txt;
        };
 
        chatBtn.onclick = () => {
            if (!localStorage.getItem('wg-chat-nick')) {
                showNameModal(() => {
                    openChat();
                    chatBtn.classList.add('active');
                    setChatBtnLabel('💬 Chat ✓');
                });
            } else {
                if (!chatVisible) {
                    openChat();
                    chatBtn.classList.add('active');
                    setChatBtnLabel('💬 Chat ✓');
                } else {
                    const win = document.getElementById('wg-chat-window');
                    if (win) win.style.display = 'none';
                    chatVisible = false;
                    chatBtn.classList.remove('active');
                    setChatBtnLabel('💬 Chat');
                }
            }
        };
        document.body.appendChild(chatBtn);
 
        function repositionDot() {
            const dot = document.getElementById('wg-chatbtn-dot');
            if (!dot || !chatBtn) return;
            const r = chatBtn.getBoundingClientRect();
            dot.style.top = (r.top - 4) + 'px';
            dot.style.left = (r.right - 4) + 'px';
        }
        setTimeout(repositionDot, 100);
        window.addEventListener('resize', repositionDot);
    }
 
    // ─── Easter Egg ───────────────────────────────────────────────────────────────
    let eggGone = false, musicOn = false;
 
    function spawnParticles() {
        const blast = document.createElement('div'); blast.id = 'wg-egg-blast'; document.body.appendChild(blast);
        const colors = ['#a855f7','#5865F2','#EA4335','#34a853','#FBBC04','#ff6eb4','#00e5ff','#ff9100','#fff'];
        const shapes = ['●','★','◆','▲','♥','✦','✿'];
        for (let i = 0; i < 120; i++) {
            const p = document.createElement('div');
            p.textContent = shapes[i % shapes.length];
            p.style.cssText = `position:absolute;left:${5+Math.random()*90}%;top:${10+Math.random()*80}%;color:${colors[i%colors.length]};font-size:${10+Math.random()*28}px;line-height:1;pointer-events:none;animation:wg-ptcl ${1.2+Math.random()*1.8}s ${Math.random()*0.6}s ease-out forwards;--tx:${(Math.random()-0.5)*900}px;--ty:${-100-Math.random()*700}px;--rot:${(Math.random()-0.5)*1080}deg;`;
            blast.appendChild(p);
        }
        setTimeout(() => blast.remove(), 4000);
    }
 
    function showEasterEgg() {
        if (eggGone) return;
        spawnParticles(); playEggMusic(); musicOn = true;
        const modal = document.createElement('div'); modal.id = 'wg-egg-modal';
        modal.innerHTML = `<div id="wg-egg-card"><span class="egg-eyeball">👀</span><div class="egg-title">oh, you found this.</div><div class="egg-body">need locations <em>blocked</em>?<br>i know a guy who knows a guy<br><strong style="color:#1a0030;text-decoration:underline">who builds basically anything.</strong><br>he's always up for hire. 😏</div><div class="egg-fine">confidential. self-destructs on reload.</div><button class="egg-dc-btn">💬 join the WorldGuessr discord</button><button class="egg-dismiss">okay okay, disappear 🫣</button></div>`;
        document.body.appendChild(modal);
        const dismiss = () => { eggGone=true; document.getElementById('wg-egg')?.remove(); modal.remove(); if(musicOn) stopEggMusic(); };
        modal.querySelector('.egg-dc-btn').onclick = () => { window.open('https://discord.gg/ADw47GAyS5','_blank'); dismiss(); };
        modal.querySelector('.egg-dismiss').onclick = dismiss;
        modal.addEventListener('click', e => { if (e.target===modal) dismiss(); });
    }
 
    function addEasterEgg() {
        if (document.getElementById('wg-egg') || eggGone) return;
        const egg = document.createElement('div'); egg.id='wg-egg'; egg.textContent='·'; egg.onclick=showEasterEgg; document.body.appendChild(egg);
    }
 
    // ─── Init ─────────────────────────────────────────────────────────────────────
    function init() {
        addMainButton(); addEasterEgg(); preloadYT();
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                document.getElementById('wg-scout-btn')?.remove();
                document.getElementById('wg-autopin-btn')?.remove();
                document.getElementById('wg-chat-btn')?.remove();
                setTimeout(addMainButton, 600);
            }
        }).observe(document.body, { subtree:true, childList:true });
    }
 
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
 
// 1k offer lmao
