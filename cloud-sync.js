(function () {
  const PROJECT_URL = "https://faqzsjpdxeeuflusudjy.supabase.co";
  const ANON_KEY =
    "sb_publishable_EQjWw8Un9js04SLKhMBdUA_Utq-kiR6";
  const TABLE_NAME = "app_settings";
  const KEY_PREFIX = "idCardCreator";
  const DELETED_SENTINEL = "__IDCARD_DELETED__";
  const LOCAL_ONLY_KEYS = new Set([
    "idCardCreatorEntryLoginSessionV1",
    "idCardCreatorAdminSessionV1",
    "idCardCreatorApprovedIdsNavContextV1",
    "idCardCreatorLogoutTsV1"
  ]);

  function shouldSyncKey(key) {
    const k = String(key || "");
    return k.startsWith(KEY_PREFIX) && !LOCAL_ONLY_KEYS.has(k);
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

  if (supabaseClient) {
    window.__idCardSupabaseClient = supabaseClient;
  }

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
    return readLocalStorageValue(key);
  }

  function setLocalOnlyValue(key, value) {
    const k = String(key || "");
    const nextValue = value === null || value === undefined ? null : String(value);
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
