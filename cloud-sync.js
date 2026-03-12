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
  const WRITE_DEBOUNCE_MS = 1200;
  const CLOUD_POLL_INTERVAL_MS = 5 * 60 * 1000;
  const MIN_PULL_GAP_MS = 45 * 1000;
  let flushTimer = null;
  let pullInProgress = null;
  let lastPullAt = 0;

  function notifyChange(key, oldValue, newValue) {
    window.dispatchEvent(
      new CustomEvent("id-card-store", { detail: { key, oldValue, newValue } })
    );
  }

  function setCacheValue(key, value) {
    const k = String(key || "");
    const oldValue = cache.has(k) ? cache.get(k) : null;
    const nextValue = value === null || value === undefined ? null : String(value);
    if (nextValue === null) {
      if (cache.has(k)) cache.delete(k);
    } else {
      cache.set(k, nextValue);
    }
    if (oldValue !== nextValue) notifyChange(k, oldValue, nextValue);
  }

  function getLocalOnlyValue(key) {
    try {
      return window.localStorage.getItem(String(key || ""));
    } catch {
      return null;
    }
  }

  function setLocalOnlyValue(key, value) {
    const k = String(key || "");
    const nextValue = value === null || value === undefined ? null : String(value);
    try {
      if (nextValue === null) {
        window.localStorage.removeItem(k);
      } else {
        window.localStorage.setItem(k, nextValue);
      }
    } catch {
      // ignore local storage failures and continue with in-memory cache
    }
    setCacheValue(k, nextValue);
  }

  function queueUpsert(key, value) {
    if (!supabaseClient || !shouldSyncKey(key)) return;
    const k = String(key);
    // Keep delete guards active until the delete sentinel is observed from cloud.
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
        setCacheValue(key, null);
      }
    });

    cloudMap.forEach((value, key) => {
      if (pendingDeletes.has(key) && value !== DELETED_SENTINEL) {
        return;
      }
      if (value === DELETED_SENTINEL) {
        setCacheValue(key, null);
        pendingDeletes.delete(key);
        return;
      }
      setCacheValue(key, value);
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
      return cache.has(k) ? cache.get(k) : null;
    },
    setItem(key, value) {
      const k = String(key || "");
      if (LOCAL_ONLY_KEYS.has(k)) {
        setLocalOnlyValue(k, value);
        return;
      }
      if (!shouldSyncKey(k)) return;
      setCacheValue(k, String(value));
      queueUpsert(k, String(value));
    },
    removeItem(key) {
      const k = String(key || "");
      if (LOCAL_ONLY_KEYS.has(k)) {
        setLocalOnlyValue(k, null);
        return;
      }
      if (!shouldSyncKey(k)) return;
      pendingDeletes.add(k);
      setCacheValue(k, null);
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

  cloudStore.ready = Promise.race([
    (async function () {
      await pullCloudNow({ force: true });
      return true;
    })(),
    new Promise((resolve) => setTimeout(() => resolve(false), 4000))
  ]);

  window.__idCardCloudReady = cloudStore.ready;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullCloudNow();
  });
  window.addEventListener("focus", pullCloudNow);
  setInterval(() => {
    pullCloudNow().catch(() => {});
  }, CLOUD_POLL_INTERVAL_MS);
})();
