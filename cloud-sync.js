(function () {
  const PROJECT_URL = "https://faqzsjpdxeeuflusudjy.supabase.co";
  const ANON_KEY =
    "sb_publishable_EQjWw8Un9js04SLKhMBdUA_Utq-kiR6";
  const TABLE_NAME = "app_settings";
  const KEY_PREFIX = "idCardCreator";
  const DELETED_SENTINEL = "__IDCARD_DELETED__";
  const ENTRY_SESSION_KEY = "idCardCreatorEntryLoginSessionV1";
  const ADMIN_SESSION_KEY = "idCardCreatorAdminSessionV1";
  const NAV_CONTEXT_KEY = "idCardCreatorApprovedIdsNavContextV1";
  const LOGOUT_TS_KEY = "idCardCreatorLogoutTsV1";
  const HARD_LOGOUT_MS = 24 * 60 * 60 * 1000;
  const LOCAL_ONLY_KEYS = new Set([
    ENTRY_SESSION_KEY,
    ADMIN_SESSION_KEY,
    NAV_CONTEXT_KEY,
    LOGOUT_TS_KEY
  ]);

  function shouldSyncKey(key) {
    const k = String(key || "");
    return k.startsWith(KEY_PREFIX) && !LOCAL_ONLY_KEYS.has(k);
  }

  function readLocalStorageValue(key) {
    try {
      return window.localStorage.getItem(String(key || ""));
    } catch {
      return null;
    }
  }

  function writeLocalStorageValue(key, value) {
    const k = String(key || "");
    try {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(k);
      } else {
        window.localStorage.setItem(k, String(value));
      }
    } catch {
      // ignore local storage quota/privacy failures
    }
  }

  function removeLocalStorageValue(key) {
    writeLocalStorageValue(key, null);
  }

  function clearLocalLoginState() {
    removeLocalStorageValue(ENTRY_SESSION_KEY);
    removeLocalStorageValue(ADMIN_SESSION_KEY);
    removeLocalStorageValue(NAV_CONTEXT_KEY);
  }

  function getLogoutTs() {
    const raw = Number(readLocalStorageValue(LOGOUT_TS_KEY) || 0);
    return Number.isFinite(raw) ? raw : 0;
  }

  function isHardLogoutActive() {
    const ts = getLogoutTs();
    return !!ts && Date.now() - ts < HARD_LOGOUT_MS;
  }

  function markHardLogout() {
    clearLocalLoginState();
    writeLocalStorageValue(LOGOUT_TS_KEY, String(Date.now()));
  }

  function clearHardLogout() {
    removeLocalStorageValue(LOGOUT_TS_KEY);
  }

  const hasSupabase = !!(window.supabase && PROJECT_URL && ANON_KEY);
  const supabaseClient = hasSupabase
    ? window.supabase.createClient(PROJECT_URL, ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      })
    : null;

  if (supabaseClient && supabaseClient.auth) {
    const originalGetSession = supabaseClient.auth.getSession.bind(supabaseClient.auth);
    const originalSignIn = supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth);
    const originalSignOut = supabaseClient.auth.signOut.bind(supabaseClient.auth);

    supabaseClient.auth.getSession = async function guardedGetSession() {
      if (isHardLogoutActive()) {
        clearLocalLoginState();
        return { data: { session: null }, error: null };
      }
      return originalGetSession();
    };

    supabaseClient.auth.signInWithPassword = async function guardedSignInWithPassword(credentials) {
      clearHardLogout();
      const result = await originalSignIn(credentials);
      if (result && result.data && result.data.session) clearHardLogout();
      return result;
    };

    supabaseClient.auth.signOut = async function guardedSignOut(options) {
      markHardLogout();
      try {
        return await originalSignOut(options);
      } finally {
        clearLocalLoginState();
      }
    };

    if (isHardLogoutActive()) {
      clearLocalLoginState();
      originalSignOut().catch(() => {});
    }
  }

  if (supabaseClient) {
    window.__idCardSupabaseClient = supabaseClient;
  }

  document.addEventListener(
    "click",
    (evt) => {
      const target = evt.target && typeof evt.target.closest === "function" ? evt.target.closest("#entryLogoutBtn") : null;
      if (target) markHardLogout();
    },
    true
  );

  window.__idCardMarkHardLogout = markHardLogout;
  window.__idCardIsHardLogoutActive = isHardLogoutActive;

  const cache = new Map();
  const pendingUpserts = new Map();
  const pendingDeletes = new Set();
  const WRITE_DEBOUNCE_MS = 650;
  const CLOUD_POLL_INTERVAL_MS = 5 * 60 * 1000;
  const MIN_PULL_GAP_MS = 45 * 1000;
  const FAST_READY_TIMEOUT_MS = 250;
  let flushTimer = null;
  let pullInProgress = null;
  let lastPullAt = 0;

  function notifyChange(key, oldValue, newValue) {
    window.dispatchEvent(
      new CustomEvent("id-card-store", { detail: { key, oldValue, newValue } })
    );
  }

  function setCacheValue(key, value, options = {}) {
    const k = String(key || "");
    const oldValue = cache.has(k) ? cache.get(k) : null;
    const nextValue = value === null || value === undefined ? null : String(value);
    if (nextValue === null) {
      if (cache.has(k)) cache.delete(k);
    } else {
      cache.set(k, nextValue);
    }
    if (options.persist && k) writeLocalStorageValue(k, nextValue);
    if (oldValue !== nextValue) notifyChange(k, oldValue, nextValue);
  }

  function getLocalOnlyValue(key) {
    const k = String(key || "");
    if (isHardLogoutActive() && (k === ENTRY_SESSION_KEY || k === ADMIN_SESSION_KEY || k === NAV_CONTEXT_KEY)) {
      clearLocalLoginState();
      return null;
    }
    return readLocalStorageValue(k);
  }

  function setLocalOnlyValue(key, value) {
    const k = String(key || "");
    const nextValue = value === null || value === undefined ? null : String(value);
    if (k === ENTRY_SESSION_KEY && nextValue) clearHardLogout();
    writeLocalStorageValue(k, nextValue);
    setCacheValue(k, nextValue);
  }

  function queueUpsert(key, value) {
    if (!supabaseClient || !shouldSyncKey(key)) return;
    const k = String(key);
    if (String(value) !== DELETED_SENTINEL) {
      pendingDeletes.delete(k);
    }
    pendingUpserts.set(k, String(value));
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushQueuedWrites().catch(() => {});
    }, WRITE_DEBOUNCE_MS);
  }

  async function flushQueuedWrites() {
    if (!supabaseClient || !pendingUpserts.size) return;
    const rows = Array.from(pendingUpserts.entries()).map(([key, value]) => ({ key, value }));
    pendingUpserts.clear();
    const { error } = await supabaseClient.from(TABLE_NAME).upsert(rows, { onConflict: "key" });
    if (error) throw error;
  }

  async function applyCloudSettings() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.from(TABLE_NAME).select("key, value");
    if (error) throw error;

    const cloudMap = new Map();
    (Array.isArray(data) ? data : []).forEach((row) => {
      const key = row && typeof row.key === "string" ? row.key : "";
      if (!shouldSyncKey(key)) return;
      const value = typeof row.value === "string" ? row.value : "";
      cloudMap.set(key, value);
    });

    Array.from(cache.keys()).forEach((key) => {
      if (shouldSyncKey(key) && !cloudMap.has(key)) {
        setCacheValue(key, null, { persist: true });
      }
    });

    cloudMap.forEach((value, key) => {
      if (pendingDeletes.has(key) && value !== DELETED_SENTINEL) {
        return;
      }
      if (value === DELETED_SENTINEL) {
        setCacheValue(key, null, { persist: true });
        pendingDeletes.delete(key);
        return;
      }
      setCacheValue(key, value, { persist: true });
    });
  }

  async function pullCloudNow(options = {}) {
    if (!supabaseClient) return;
    const force = !!(options && options.force);
    const now = Date.now();
    if (!force && !pendingUpserts.size && now - lastPullAt < MIN_PULL_GAP_MS) {
      return;
    }
    if (pullInProgress) return pullInProgress;
    pullInProgress = (async () => {
      try {
        await applyCloudSettings();
        lastPullAt = Date.now();
      } finally {
        pullInProgress = null;
      }
    })();
    return pullInProgress;
  }

  const cloudStore = {
    getItem(key) {
      const k = String(key || "");
      if (LOCAL_ONLY_KEYS.has(k)) {
        const local = getLocalOnlyValue(k);
        if (local !== null) {
          setCacheValue(k, local);
          return local;
        }
        return cache.has(k) ? cache.get(k) : null;
      }
      if (!shouldSyncKey(k)) return null;
      if (cache.has(k)) return cache.get(k);
      const local = readLocalStorageValue(k);
      if (local !== null && local !== undefined) {
        setCacheValue(k, local);
        return local;
      }
      return null;
    },
    setItem(key, value) {
      const k = String(key || "");
      if (LOCAL_ONLY_KEYS.has(k)) {
        setLocalOnlyValue(k, value);
        return;
      }
      if (!shouldSyncKey(k)) return;
      const nextValue = String(value);
      setCacheValue(k, nextValue, { persist: true });
      queueUpsert(k, nextValue);
    },
    removeItem(key) {
      const k = String(key || "");
      if (LOCAL_ONLY_KEYS.has(k)) {
        setLocalOnlyValue(k, null);
        return;
      }
      if (!shouldSyncKey(k)) return;
      pendingDeletes.add(k);
      setCacheValue(k, null, { persist: true });
      queueUpsert(k, DELETED_SENTINEL);
    },
    clear() {
      Array.from(cache.keys()).forEach((key) => {
        if (shouldSyncKey(key)) cloudStore.removeItem(key);
      });
    },
    pull() {
      return pullCloudNow();
    },
    flush() {
      if (!supabaseClient) return Promise.resolve();
      return flushQueuedWrites();
    },
    ready: null
  };

  window.idCardCloudStore = cloudStore;

  const backgroundInitialPull = (async function () {
    try {
      await pullCloudNow({ force: true });
      return true;
    } catch {
      return false;
    }
  })();

  cloudStore.ready = Promise.race([
    backgroundInitialPull,
    new Promise((resolve) => setTimeout(() => resolve(false), FAST_READY_TIMEOUT_MS))
  ]);

  window.__idCardCloudReady = cloudStore.ready;

  backgroundInitialPull.catch(() => {});

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullCloudNow().catch(() => {});
  });
  window.addEventListener("focus", () => pullCloudNow().catch(() => {}));
  setInterval(() => {
    pullCloudNow().catch(() => {});
  }, CLOUD_POLL_INTERVAL_MS);
})();
