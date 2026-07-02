(() => {
  const CLIENT_ID_KEY = "owenDiary.googleClientId";
  const DRIVE_FOLDERS_KEY = "owenDiary.driveFolders";
  const DRAFT_PREFIX = "owenDiary.draft.";
  const SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/documents.readonly"
  ].join(" ");
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const JSON_MIME = "application/json";
  const CACHE_VERSION = "2026-07-01";
  const GOOGLE_READY_TIMEOUT_MS = 5000;
  const GOOGLE_READY_POLL_MS = 100;

  const state = {
    accessToken: "",
    tokenClient: null,
    tokenClientId: "",
    tokenRequestMode: "",
    tokenRequestResolver: null,
    autoRestoreAttempted: false,
    connectionState: "notConfigured",
    drive: null,
    currentFile: null,
    currentEntry: null,
    currentMonthStatus: new Map(),
    draftTimer: 0,
    importPreview: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    bindEvents();
    setInitialDates();
    loadSettings();
    updateConnectionState(getSavedClientId() ? "configured" : "notConfigured");
    setDriveStatus("Drive 資料夾尚未確認");
    updatePwaStatus();
    loadDate(els.entryDate.value);
    restoreGoogleSessionOnLoad();
    registerServiceWorker();
  }

  function bindElements() {
    [
      "connectionDot", "connectionText", "entryDate", "entryTitle", "entryContent",
      "entryImportant", "entryMeta", "editorMessage", "draftNotice",
      "restoreDraftButton", "deleteDraftButton", "todayButton", "loadDateButton",
      "saveDraftButton", "saveEntryButton", "calendarMonth", "calendarGrid",
      "calendarMessage", "prevMonthButton", "nextMonthButton", "refreshCalendarButton",
      "docInput", "previewImportButton", "writeImportButton", "importSummary",
      "previewList", "unresolvedList", "importMessage", "clientIdInput",
      "saveClientButton", "connectButton", "disconnectButton", "driveStatus",
      "draftStatus", "pwaStatus", "settingsMessage"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.view));
    });

    els.todayButton.addEventListener("click", () => loadDate(todayIso()));
    els.loadDateButton.addEventListener("click", () => loadDate(els.entryDate.value));
    els.entryDate.addEventListener("change", () => loadDate(els.entryDate.value));
    els.entryTitle.addEventListener("input", scheduleDraftSave);
    els.entryContent.addEventListener("input", scheduleDraftSave);
    els.entryImportant.addEventListener("change", scheduleDraftSave);
    els.restoreDraftButton.addEventListener("click", restoreCurrentDraft);
    els.deleteDraftButton.addEventListener("click", deleteCurrentDraft);
    els.saveDraftButton.addEventListener("click", () => saveDraft(true));
    els.saveEntryButton.addEventListener("click", saveEntry);

    els.calendarMonth.addEventListener("change", () => loadCalendarMonth(els.calendarMonth.value));
    els.prevMonthButton.addEventListener("click", () => shiftMonth(-1));
    els.nextMonthButton.addEventListener("click", () => shiftMonth(1));
    els.refreshCalendarButton.addEventListener("click", () => loadCalendarMonth(els.calendarMonth.value));

    els.saveClientButton.addEventListener("click", saveClientId);
    els.connectButton.addEventListener("click", connectGoogle);
    els.disconnectButton.addEventListener("click", disconnectGoogle);

    els.previewImportButton.addEventListener("click", previewImport);
    els.writeImportButton.addEventListener("click", writeImport);
  }

  function setInitialDates() {
    const today = todayIso();
    els.entryDate.value = today;
    els.calendarMonth.value = today.slice(0, 7);
  }

  function loadSettings() {
    els.clientIdInput.value = localStorage.getItem(CLIENT_ID_KEY) || "";
  }

  function getSavedClientId() {
    return localStorage.getItem(CLIENT_ID_KEY) || "";
  }

  function showView(viewId) {
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === viewId);
    });

    if (viewId === "calendarView") {
      loadCalendarMonth(els.calendarMonth.value);
    }
  }

  function todayIso() {
    const now = new Date();
    return formatLocalDate(now);
  }

  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function nowIsoWithOffset() {
    const date = new Date();
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${formatLocalDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${sign}${hh}:${mm}`;
  }

  function draftKey(date) {
    return `${DRAFT_PREFIX}${date}`;
  }

  function scheduleDraftSave() {
    window.clearTimeout(state.draftTimer);
    state.draftTimer = window.setTimeout(() => saveDraft(false), 7000);
  }

  function saveDraft(showMessage) {
    const date = els.entryDate.value;
    if (!date) {
      return;
    }

    window.clearTimeout(state.draftTimer);
    state.draftTimer = 0;

    const draft = {
      title: els.entryTitle.value,
      content: els.entryContent.value,
      isImportant: els.entryImportant.checked,
      savedAt: nowIsoWithOffset()
    };
    localStorage.setItem(draftKey(date), JSON.stringify(draft));
    updateDraftNotice(date);
    if (showMessage) {
      setMessage(els.editorMessage, "草稿已儲存。", "success");
    }
  }

  function readDraft(date) {
    try {
      const raw = localStorage.getItem(draftKey(date));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraft(date) {
    localStorage.removeItem(draftKey(date));
    if (els.entryDate && els.entryDate.value === date) {
      updateDraftNotice(date);
    }
  }

  function updateDraftNotice(date = els.entryDate.value) {
    const hasDraft = Boolean(date && readDraft(date));
    els.draftNotice.hidden = !hasDraft;
    els.restoreDraftButton.disabled = !hasDraft;
    els.deleteDraftButton.disabled = !hasDraft;
  }

  async function loadDate(date) {
    if (!date) {
      return;
    }

    els.entryDate.value = date;
    els.calendarMonth.value = date.slice(0, 7);
    state.currentFile = null;
    state.currentEntry = null;
    setMessage(els.editorMessage, "讀取中...");

    if (!state.accessToken) {
      applyEntry(newEntry(date), null);
      const hasDraft = showDraftPromptIfNeeded(date);
      if (!hasDraft) {
        setMessage(els.editorMessage, "尚未連線 Google，會先保留本機草稿。");
      }
      return;
    }

    try {
      const result = await getDiary(date);
      state.currentFile = result.file;
      state.currentEntry = result.entry;
      applyEntry(result.entry, result.file);
      const hasDraft = showDraftPromptIfNeeded(date);
      if (!hasDraft) {
        setMessage(els.editorMessage, result.file ? "已讀取 Drive 日記。" : "這天還沒有日記。", "success");
      }
    } catch (error) {
      applyEntry(newEntry(date), null);
      const hasDraft = showDraftPromptIfNeeded(date);
      if (!hasDraft) {
        setMessage(els.editorMessage, friendlyError(error), "error");
      }
    }
  }

  function newEntry(date) {
    return {
      date,
      sourceDateText: date,
      title: "",
      content: "",
      isImportant: false,
      history: [],
      createdAt: `${date}T00:00:00+08:00`,
      updatedAt: ""
    };
  }

  function applyEntry(entry, file) {
    els.entryTitle.value = entry.title || "";
    els.entryContent.value = entry.content || "";
    els.entryImportant.checked = Boolean(entry.isImportant);
    els.entryMeta.textContent = file
      ? `Drive 檔案：${file.name}，最後更新：${entry.updatedAt || "未知"}`
      : "尚未建立 Drive JSON。";
  }

  function showDraftPromptIfNeeded(date) {
    const draft = readDraft(date);
    updateDraftNotice(date);
    if (!draft) {
      return false;
    }

    setMessage(els.editorMessage, "這天有本機草稿，可選擇恢復或刪除。", "success");
    return true;
  }

  function restoreCurrentDraft() {
    const date = els.entryDate.value;
    const draft = readDraft(date);
    if (!draft) {
      updateDraftNotice(date);
      setMessage(els.editorMessage, "這天沒有本機草稿。");
      return;
    }

    applyDraft(draft);
    updateDraftNotice(date);
    setMessage(els.editorMessage, "已恢復本機草稿。", "success");
  }

  function applyDraft(draft) {
    els.entryTitle.value = draft.title || "";
    els.entryContent.value = draft.content || "";
    els.entryImportant.checked = Boolean(draft.isImportant);
  }

  function deleteCurrentDraft() {
    const date = els.entryDate.value;
    if (!date) {
      return;
    }

    window.clearTimeout(state.draftTimer);
    state.draftTimer = 0;

    if (!readDraft(date)) {
      updateDraftNotice(date);
      setMessage(els.editorMessage, "這天沒有本機草稿。");
      return;
    }

    clearDraft(date);
    setMessage(els.editorMessage, "已刪除本機草稿。Google Drive 日記不會被刪除。", "success");
  }

  async function saveEntry() {
    const date = els.entryDate.value;
    if (!date) {
      setMessage(els.editorMessage, "請先選擇日期。", "error");
      return;
    }

    if (!state.accessToken) {
      saveDraft(false);
      setMessage(els.editorMessage, "尚未連線 Google，已保留本機草稿。", "error");
      return;
    }

    els.saveEntryButton.disabled = true;
    setMessage(els.editorMessage, "儲存中...");

    try {
      const existing = await getDiary(date);
      const payload = buildDiaryPayload(date, existing.entry, Boolean(existing.file));
      const file = await upsertDiaryFile(date, payload, existing.file);
      state.currentFile = file;
      state.currentEntry = payload;
      clearDraft(date);
      applyEntry(payload, file);
      setMessage(els.editorMessage, "已儲存到 Google Drive。", "success");
      if (els.calendarMonth.value === date.slice(0, 7)) {
        loadCalendarMonth(els.calendarMonth.value);
      }
    } catch (error) {
      saveDraft(false);
      setMessage(els.editorMessage, `${friendlyError(error)} 草稿已保留。`, "error");
    } finally {
      els.saveEntryButton.disabled = false;
    }
  }

  function buildDiaryPayload(date, previous, hasExistingFile) {
    const title = els.entryTitle.value.trim();
    const content = els.entryContent.value;
    const isImportant = els.entryImportant.checked;
    const history = Array.isArray(previous.history) ? [...previous.history] : [];

    if (hasExistingFile) {
      const changed = previous.content !== content ||
        (previous.title || "") !== title ||
        Boolean(previous.isImportant) !== isImportant;

      if (changed) {
        history.unshift({
          title: previous.title || "",
          content: previous.content || "",
          isImportant: Boolean(previous.isImportant),
          updatedAt: previous.updatedAt || ""
        });
      }
    }

    return {
      date,
      sourceDateText: previous.sourceDateText || date,
      title,
      content,
      isImportant,
      history: history.slice(0, 3),
      createdAt: previous.createdAt || `${date}T00:00:00+08:00`,
      updatedAt: nowIsoWithOffset()
    };
  }

  function saveClientId() {
    const clientId = els.clientIdInput.value.trim();
    if (!clientId) {
      localStorage.removeItem(CLIENT_ID_KEY);
      state.accessToken = "";
      setMessage(els.settingsMessage, "已清除 Client ID。");
      resetGoogleConnectionState("notConfigured");
      return;
    }
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    resetGoogleConnectionState("configured");
    initializeTokenClientIfReady(clientId);
    setMessage(els.settingsMessage, "設定已儲存。", "success");
  }

  async function connectGoogle() {
    const clientId = els.clientIdInput.value.trim() || localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      setMessage(els.settingsMessage, "請先填入 Google OAuth Client ID。", "error");
      updateConnectionState("notConfigured");
      showView("settingsView");
      return;
    }

    updateConnectionState("preparing");
    setMessage(els.settingsMessage, "正在準備 Google 連線...");
    const ready = await waitForGoogleIdentity();
    if (!ready) {
      updateConnectionState("needsReconnect");
      setMessage(els.settingsMessage, "Google 登入程式尚未載入，請稍後再試。", "error");
      return;
    }

    if (!initializeTokenClient(clientId)) {
      updateConnectionState("needsReconnect");
      setMessage(els.settingsMessage, "Google 連線初始化失敗，請稍後再試。", "error");
      return;
    }

    requestGoogleAccessToken(state.accessToken ? "" : "consent", "manual");
  }

  function disconnectGoogle() {
    if (state.accessToken && window.google && window.google.accounts) {
      window.google.accounts.oauth2.revoke(state.accessToken);
    }
    state.accessToken = "";
    state.drive = null;
    state.currentFile = null;
    updateConnectionState(getSavedClientId() ? "configured" : "notConfigured");
    setDriveStatus("Drive 資料夾尚未確認");
    setMessage(els.settingsMessage, "已中斷 Google 連線。");
  }

  function resetGoogleConnectionState(nextState) {
    state.tokenClient = null;
    state.tokenClientId = "";
    state.tokenRequestMode = "";
    state.tokenRequestResolver = null;
    state.autoRestoreAttempted = false;
    state.drive = null;
    state.currentFile = null;
    updateConnectionState(nextState);
    setDriveStatus("Drive 資料夾尚未確認");
  }

  function updateConnectionState(nextState) {
    state.connectionState = nextState;
    renderConnectionState();
  }

  function renderConnectionState() {
    const connected = Boolean(state.accessToken);
    els.connectionDot.classList.toggle("connected", connected);
    els.connectionDot.classList.toggle("warning", !connected);
    const labels = {
      notConfigured: "未設定 Client ID",
      configured: "已設定，尚未授權",
      preparing: "正在準備 Google 連線",
      restoring: "正在恢復 Google 連線",
      connected: "已連線",
      needsReconnect: "需要重新連接 Google"
    };
    els.connectionText.textContent = connected ? "已連線" : labels[state.connectionState] || "未連線";
  }

  async function restoreGoogleSessionOnLoad() {
    const clientId = getSavedClientId();
    if (!clientId || state.autoRestoreAttempted) {
      return;
    }

    state.autoRestoreAttempted = true;
    updateConnectionState("preparing");
    setDriveStatus("Drive 資料夾尚未確認");
    const ready = await waitForGoogleIdentity();
    if (!ready) {
      updateConnectionState("needsReconnect");
      setMessage(els.settingsMessage, "已保留 Client ID；需要重新連接 Google。");
      return;
    }

    if (!initializeTokenClient(clientId)) {
      updateConnectionState("needsReconnect");
      setMessage(els.settingsMessage, "Google 連線初始化失敗，請手動重新連接。", "error");
      return;
    }

    updateConnectionState("restoring");
    requestGoogleAccessToken("", "restore");
  }

  function googleIdentityReady() {
    return Boolean(window.google && window.google.accounts && window.google.accounts.oauth2);
  }

  function waitForGoogleIdentity(timeoutMs = GOOGLE_READY_TIMEOUT_MS) {
    if (googleIdentityReady()) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        if (googleIdentityReady()) {
          window.clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          window.clearInterval(timer);
          resolve(false);
        }
      }, GOOGLE_READY_POLL_MS);
    });
  }

  function initializeTokenClientIfReady(clientId) {
    if (!clientId || !googleIdentityReady()) {
      return false;
    }
    return initializeTokenClient(clientId);
  }

  function initializeTokenClient(clientId) {
    if (!clientId || !googleIdentityReady()) {
      return false;
    }
    if (state.tokenClient && state.tokenClientId === clientId) {
      return true;
    }

    state.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: handleTokenResponse
    });
    state.tokenClientId = clientId;
    return true;
  }

  function requestGoogleAccessToken(prompt, mode) {
    if (!state.tokenClient || state.tokenRequestResolver) {
      return Promise.resolve(false);
    }

    updateConnectionState(mode === "restore" ? "restoring" : "preparing");
    return new Promise((resolve) => {
      state.tokenRequestMode = mode;
      state.tokenRequestResolver = resolve;
      try {
        state.tokenClient.requestAccessToken({ prompt });
      } catch {
        finishTokenRequest(false);
        updateConnectionState("needsReconnect");
        setMessage(
          els.settingsMessage,
          mode === "restore"
            ? "需要重新連接 Google。Client ID 與本機草稿已保留。"
            : "Google 連線失敗，請稍後再試。",
          mode === "restore" ? undefined : "error"
        );
      }
    });
  }

  async function handleTokenResponse(response) {
    const mode = state.tokenRequestMode;
    if (response.error || !response.access_token) {
      finishTokenRequest(false);
      updateConnectionState("needsReconnect");
      setDriveStatus("Drive 資料夾尚未確認");
      setMessage(
        els.settingsMessage,
        mode === "restore"
          ? "需要重新連接 Google。Client ID 與本機草稿已保留。"
          : "Google 連線失敗。",
        mode === "restore" ? undefined : "error"
      );
      return;
    }

    state.accessToken = response.access_token;
    updateConnectionState("connected");
    setMessage(els.settingsMessage, mode === "restore" ? "已恢復 Google 連線。" : "Google 已連線。", "success");

    try {
      await ensureBaseFolders();
      await loadDate(els.entryDate.value);
      finishTokenRequest(true);
    } catch (error) {
      finishTokenRequest(false);
      setMessage(els.settingsMessage, friendlyError(error), "error");
    }
  }

  function finishTokenRequest(result) {
    const resolver = state.tokenRequestResolver;
    state.tokenRequestMode = "";
    state.tokenRequestResolver = null;
    if (resolver) {
      resolver(result);
    }
  }

  async function ensureBaseFolders() {
    setDriveStatus("Drive 資料夾檢查中");
    const root = await ensureDriveFolder("root", "Owen Diary", null);
    const data = await ensureDriveFolder("data", "data", root.id);
    const exportsFolder = await ensureDriveFolder("exports", "exports", root.id);
    const settings = await ensureDriveFolder("settings", "settings", root.id);
    state.drive = { root, data, exports: exportsFolder, settings };
    writeDriveFolderCache(state.drive);
    setDriveStatus("Drive 資料夾已就緒");
    return state.drive;
  }

  async function ensureMonthFolder(date) {
    if (!state.drive) {
      await ensureBaseFolders();
    }
    const year = date.slice(0, 4);
    const month = date.slice(0, 7);
    const yearFolder = await ensureFolder(year, state.drive.data.id);
    const monthFolder = await ensureFolder(month, yearFolder.id);
    return monthFolder;
  }

  async function findMonthFolder(date) {
    const data = state.drive && state.drive.data
      ? state.drive.data
      : await findBaseDataFolder();
    if (!data) return null;
    const year = await findFolder(date.slice(0, 4), data.id);
    if (!year) return null;
    return findFolder(date.slice(0, 7), year.id);
  }

  async function findBaseDataFolder() {
    const root = await validateCachedFolder("root", "Owen Diary", null) || await findFolder("Owen Diary", null);
    if (!root) return null;
    cacheDriveFolder("root", root);
    const data = await validateCachedFolder("data", "data", root.id) || await findFolder("data", root.id);
    if (data) {
      cacheDriveFolder("data", data);
    }
    return data || null;
  }

  async function ensureDriveFolder(cacheKey, name, parentId) {
    const cached = await validateCachedFolder(cacheKey, name, parentId);
    if (cached) {
      return cached;
    }

    const folder = await ensureFolder(name, parentId);
    cacheDriveFolder(cacheKey, folder);
    return folder;
  }

  async function validateCachedFolder(cacheKey, name, parentId) {
    const cached = readDriveFolderCache()[cacheKey];
    if (!cached || !cached.id) {
      return null;
    }

    try {
      const folder = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cached.id)}?fields=id,name,mimeType,trashed,parents`
      );
      if (!folder || folder.trashed || folder.mimeType !== FOLDER_MIME || folder.name !== name) {
        return null;
      }
      if (parentId && (!Array.isArray(folder.parents) || !folder.parents.includes(parentId))) {
        return null;
      }
      return folder;
    } catch {
      return null;
    }
  }

  function readDriveFolderCache() {
    try {
      const raw = localStorage.getItem(DRIVE_FOLDERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeDriveFolderCache(drive) {
    const cache = {
      root: compactFolder(drive.root),
      data: compactFolder(drive.data),
      exports: compactFolder(drive.exports),
      settings: compactFolder(drive.settings)
    };
    localStorage.setItem(DRIVE_FOLDERS_KEY, JSON.stringify(cache));
  }

  function cacheDriveFolder(cacheKey, folder) {
    const cache = readDriveFolderCache();
    cache[cacheKey] = compactFolder(folder);
    localStorage.setItem(DRIVE_FOLDERS_KEY, JSON.stringify(cache));
  }

  function compactFolder(folder) {
    return {
      id: folder.id,
      name: folder.name
    };
  }

  async function ensureFolder(name, parentId) {
    const existing = await findFolder(name, parentId);
    if (existing) {
      return existing;
    }

    const metadata = {
      name,
      mimeType: FOLDER_MIME
    };
    if (parentId) {
      metadata.parents = [parentId];
    }

    return driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata)
    });
  }

  async function findFolder(name, parentId) {
    const parentClause = parentId ? `'${parentId}' in parents and ` : "";
    const q = `${parentClause}mimeType='${FOLDER_MIME}' and name='${escapeDriveQuery(name)}' and trashed=false`;
    const results = await driveList(q, "files(id,name,mimeType)");
    return results[0] || null;
  }

  async function findDiaryFile(date, createFolders) {
    const folder = createFolders ? await ensureMonthFolder(date) : await findMonthFolder(date);
    if (!folder) {
      return null;
    }
    const name = `${date}.json`;
    const q = `'${folder.id}' in parents and name='${name}' and mimeType='${JSON_MIME}' and trashed=false`;
    const results = await driveList(q, "files(id,name,mimeType,modifiedTime)");
    return results[0] || null;
  }

  async function getDiary(date) {
    const file = await findDiaryFile(date, false);
    if (!file) {
      return { file: null, entry: newEntry(date) };
    }

    const entry = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    return {
      file,
      entry: normalizeDiaryEntry(date, entry)
    };
  }

  function normalizeDiaryEntry(date, entry) {
    return {
      ...newEntry(date),
      ...entry,
      date,
      history: Array.isArray(entry.history) ? entry.history.slice(0, 3) : []
    };
  }

  async function upsertDiaryFile(date, payload, existingFile) {
    const folder = await ensureMonthFolder(date);
    const metadata = {
      name: `${date}.json`,
      mimeType: JSON_MIME
    };
    if (!existingFile) {
      metadata.parents = [folder.id];
    }

    const url = existingFile
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart&fields=id,name,mimeType,modifiedTime`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime";

    return driveFetch(url, {
      method: existingFile ? "PATCH" : "POST",
      body: multipartBody(metadata, JSON.stringify(payload, null, 2)),
      headers: {
        "Content-Type": `multipart/related; boundary=${CACHE_VERSION}`
      }
    });
  }

  function multipartBody(metadata, content) {
    return [
      `--${CACHE_VERSION}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${CACHE_VERSION}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      content,
      `--${CACHE_VERSION}--`
    ].join("\r\n");
  }

  async function previewImport() {
    const docId = extractDocId(els.docInput.value);
    if (!docId) {
      setMessage(els.importMessage, "請填入 Google Doc 連結或 ID。", "error");
      return;
    }
    if (!state.accessToken) {
      setMessage(els.importMessage, "請先連線 Google。", "error");
      return;
    }

    els.previewImportButton.disabled = true;
    els.writeImportButton.disabled = true;
    clearImportPreview();
    setMessage(els.importMessage, "讀取 Google Doc 中...");

    try {
      const doc = await driveFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}`);
      const sections = extractDocSections(doc);
      const parsed = window.OwenDiaryParser.parseSections(sections);
      const entries = [];

      for (const entry of parsed.entries) {
        const conflict = await findDiaryFile(entry.date, false);
        entries.push({
          ...entry,
          conflict: Boolean(conflict),
          conflictFileId: conflict ? conflict.id : ""
        });
      }

      state.importPreview = {
        entries,
        unresolved: parsed.unresolved
      };
      renderImportPreview();
      const writableCount = entries.filter((entry) => !entry.conflict).length;
      els.writeImportButton.disabled = writableCount === 0;
      setMessage(els.importMessage, "預覽完成，請確認後再寫入。", "success");
    } catch (error) {
      setMessage(els.importMessage, friendlyError(error), "error");
    } finally {
      els.previewImportButton.disabled = false;
    }
  }

  function extractDocId(input) {
    const clean = String(input || "").trim();
    const match = clean.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : clean.match(/^[a-zA-Z0-9_-]+$/) ? clean : "";
  }

  function extractDocSections(doc) {
    const sections = [];
    let current = [];
    const content = doc && doc.body && Array.isArray(doc.body.content) ? doc.body.content : [];

    content.forEach((structuralElement) => {
      const paragraph = structuralElement.paragraph;
      if (!paragraph || !Array.isArray(paragraph.elements)) {
        return;
      }

      let text = "";
      let hasHorizontalRule = false;

      paragraph.elements.forEach((element) => {
        if (element.horizontalRule) {
          hasHorizontalRule = true;
        }
        if (element.textRun && element.textRun.content) {
          text += element.textRun.content;
        }
      });

      if (hasHorizontalRule) {
        if (current.join("").trim()) {
          sections.push(current.join(""));
        }
        current = [];
        return;
      }

      current.push(text);
    });

    if (current.join("").trim()) {
      sections.push(current.join(""));
    }

    return sections;
  }

  function renderImportPreview() {
    const preview = state.importPreview || { entries: [], unresolved: [] };
    const conflicts = preview.entries.filter((entry) => entry.conflict).length;
    const writable = preview.entries.length - conflicts;

    els.importSummary.innerHTML = [
      summaryBox("可寫入", writable),
      summaryBox("衝突", conflicts),
      summaryBox("未解析", preview.unresolved.length),
      summaryBox("總段落", preview.entries.length + preview.unresolved.length)
    ].join("");

    els.previewList.innerHTML = preview.entries.map((entry) => {
      const previewText = escapeHtml(entry.content.slice(0, 64));
      const badge = entry.conflict
        ? '<span class="badge conflict">衝突</span>'
        : '<span class="badge">可寫入</span>';
      return `
        <article class="preview-item ${entry.conflict ? "conflict" : ""}">
          <div class="preview-head">
            <span>${escapeHtml(entry.date)} / ${escapeHtml(entry.sourceDateText)}</span>
            ${badge}
          </div>
          <p>${escapeHtml(entry.fileName)}</p>
          <p>${previewText || "空白內容"}</p>
        </article>
      `;
    }).join("");

    els.unresolvedList.innerHTML = preview.unresolved.map((item) => `
      <article class="unresolved-item">
        <div class="preview-head">
          <span>未解析：${escapeHtml(item.sourceDateText || "空白")}</span>
          <span class="badge conflict">略過</span>
        </div>
        <p>${escapeHtml(item.preview || "")}</p>
      </article>
    `).join("");
  }

  function summaryBox(label, value) {
    return `<div><span>${label}</span><strong>${value}</strong></div>`;
  }

  function clearImportPreview() {
    state.importPreview = null;
    els.importSummary.innerHTML = "";
    els.previewList.innerHTML = "";
    els.unresolvedList.innerHTML = "";
  }

  async function writeImport() {
    if (!state.importPreview) {
      return;
    }

    els.writeImportButton.disabled = true;
    let success = 0;
    let failed = 0;
    let conflicts = 0;

    for (const entry of state.importPreview.entries) {
      try {
        const existing = await findDiaryFile(entry.date, true);
        if (existing) {
          conflicts += 1;
          continue;
        }
        const payload = {
          date: entry.date,
          sourceDateText: entry.sourceDateText,
          title: "",
          content: entry.content,
          isImportant: false,
          history: [],
          createdAt: `${entry.date}T00:00:00+08:00`,
          updatedAt: nowIsoWithOffset()
        };
        await upsertDiaryFile(entry.date, payload, null);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    setMessage(
      els.importMessage,
      `寫入完成：成功 ${success}，失敗 ${failed}，衝突 ${conflicts}，未解析 ${state.importPreview.unresolved.length}。`,
      failed ? "error" : "success"
    );
    loadCalendarMonth(els.calendarMonth.value);
  }

  async function loadCalendarMonth(month) {
    if (!month) {
      return;
    }

    renderCalendar(month, new Map());
    if (!state.accessToken) {
      setMessage(els.calendarMessage, "尚未連線 Google。");
      return;
    }

    setMessage(els.calendarMessage, "讀取月曆中...");
    const statusMap = new Map();

    try {
      const folder = await findMonthFolder(`${month}-01`);
      if (!folder) {
        renderCalendar(month, statusMap);
        setMessage(els.calendarMessage, "這個月份尚未建立資料夾。");
        return;
      }

      const q = `'${folder.id}' in parents and mimeType='${JSON_MIME}' and name contains '.json' and trashed=false`;
      const files = await driveList(q, "files(id,name,mimeType)");
      for (const file of files) {
        const match = file.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
        if (!match || !match[1].startsWith(month)) {
          continue;
        }
        try {
          const entry = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
          statusMap.set(match[1], { hasEntry: true, isImportant: Boolean(entry.isImportant) });
        } catch {
          statusMap.set(match[1], { hasEntry: true, isImportant: false });
        }
      }
      state.currentMonthStatus = statusMap;
      renderCalendar(month, statusMap);
      setMessage(els.calendarMessage, "月曆已更新。", "success");
    } catch (error) {
      setMessage(els.calendarMessage, friendlyError(error), "error");
    }
  }

  function renderCalendar(month, statusMap) {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const blanks = first.getDay();
    const today = todayIso();
    const cells = [];

    for (let i = 0; i < blanks; i += 1) {
      cells.push('<button class="day-cell blank" type="button" tabindex="-1"></button>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const status = statusMap.get(date);
      const classes = [
        "day-cell",
        date === today ? "today" : "",
        status && status.hasEntry ? "has-entry" : "",
        status && status.isImportant ? "important" : ""
      ].filter(Boolean).join(" ");
      cells.push(`<button class="${classes}" type="button" data-date="${date}" aria-label="${date}">${day}</button>`);
    }

    els.calendarGrid.innerHTML = cells.join("");
    els.calendarGrid.querySelectorAll("[data-date]").forEach((button) => {
      button.addEventListener("click", () => {
        showView("editorView");
        loadDate(button.dataset.date);
      });
    });
  }

  function shiftMonth(delta) {
    const [year, month] = els.calendarMonth.value.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    els.calendarMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    loadCalendarMonth(els.calendarMonth.value);
  }

  async function driveList(q, fields) {
    const files = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,${fields}`,
        pageSize: "100"
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }
      const result = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      files.push(...(result.files || []));
      pageToken = result.nextPageToken || "";
    } while (pageToken);
    return files;
  }

  async function driveFetch(url, options = {}) {
    if (!state.accessToken) {
      throw new Error("尚未連線 Google。");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${state.accessToken}`);

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const message = await extractErrorMessage(response);
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  async function extractErrorMessage(response) {
    try {
      const data = await response.json();
      if (data.error && data.error.message) {
        return data.error.message;
      }
    } catch {
      return `Google API 錯誤：${response.status}`;
    }
    return `Google API 錯誤：${response.status}`;
  }

  function escapeDriveQuery(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setMessage(element, message, type) {
    element.textContent = message || "";
    element.classList.toggle("error", type === "error");
    element.classList.toggle("success", type === "success");
  }

  function setDriveStatus(text) {
    els.driveStatus.textContent = text;
  }

  function friendlyError(error) {
    return error && error.message ? error.message : "操作失敗，請稍後再試。";
  }

  function updatePwaStatus() {
    els.pwaStatus.textContent = "serviceWorker" in navigator ? "可用" : "不支援";
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        els.pwaStatus.textContent = "註冊失敗";
      });
    });
  }
})();
