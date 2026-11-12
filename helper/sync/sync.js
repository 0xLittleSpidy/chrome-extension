/**
 * Storage File Sync Controller
 * Manages binding with local JSON files via File System Access API.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const syncStatusBadge = document.getElementById('sync-status-badge');
  const connectedFileName = document.getElementById('connected-file-name');
  const lastSyncTime = document.getElementById('last-sync-time');
  const autoSyncStatus = document.getElementById('auto-sync-status');
  const connectFileBtn = document.getElementById('connect-file-btn');
  const syncNowBtn = document.getElementById('sync-now-btn');
  const pullFromFileBtn = document.getElementById('pull-from-file-btn');
  const disconnectFileBtn = document.getElementById('disconnect-file-btn');
  const toggleAutoSync = document.getElementById('toggle-auto-sync');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const toast = document.getElementById('toast');

  // Modal elements
  const collisionModal = document.getElementById('collision-modal');
  const collisionSummary = document.getElementById('collision-summary');
  const collisionMergeBtn = document.getElementById('collision-merge-btn');
  const collisionOverwriteFileBtn = document.getElementById('collision-overwrite-file-btn');
  const collisionReplaceLocalBtn = document.getElementById('collision-replace-local-btn');
  const collisionCancelBtn = document.getElementById('collision-cancel-btn');

  let activeFileHandle = null;
  let pendingFileContent = null;
  let autoSyncEnabled = false;

  function showToast(message, type = 'success') {
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-visible`;
    setTimeout(() => {
      if (toast.textContent === message) {
        toast.className = 'toast';
      }
    }, 3000);
  }

  // Theme setup
  async function initTheme() {
    const currentTheme = await StorageManager.getTheme();
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (themeToggleBtn) {
      themeToggleBtn.textContent = `Theme: ${currentTheme === 'light' ? 'Light' : 'Dark'}`;
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      themeToggleBtn.textContent = `Theme: ${next === 'light' ? 'Light' : 'Dark'}`;
      await StorageManager.setTheme(next);
    });
  }

  function updateStatusUI() {
    if (activeFileHandle) {
      syncStatusBadge.textContent = 'Connected';
      syncStatusBadge.className = 'badge badge-connected';
      connectedFileName.textContent = activeFileHandle.name || 'helper-data.json';
      syncNowBtn.disabled = false;
      pullFromFileBtn.disabled = false;
      disconnectFileBtn.style.display = 'inline-block';
    } else {
      syncStatusBadge.textContent = 'Disconnected';
      syncStatusBadge.className = 'badge badge-disconnected';
      connectedFileName.textContent = 'No file connected';
      syncNowBtn.disabled = true;
      pullFromFileBtn.disabled = true;
      disconnectFileBtn.style.display = 'none';
      lastSyncTime.textContent = 'Never';
    }
    autoSyncStatus.textContent = autoSyncEnabled ? 'Enabled' : 'Disabled';
  }

  async function writeToFile(contentString) {
    if (!activeFileHandle) return;
    const writable = await activeFileHandle.createWritable();
    await writable.write(contentString);
    await writable.close();
    lastSyncTime.textContent = new Date().toLocaleTimeString();
  }

  async function handleConnectFile() {
    if (!window.showOpenFilePicker && !window.showSaveFilePicker) {
      showToast('File System Access API is not supported in this browser.', 'error');
      return;
    }

    try {
      let handle;
      try {
        [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Helper Configuration Data (*.json)',
            accept: { 'application/json': ['.json'] }
          }],
          multiple: false
        });
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Fallback to Save File Picker if open cancelled or new file
        handle = await window.showSaveFilePicker({
          suggestedName: 'helper-data.json',
          types: [{
            description: 'Helper Configuration Data (*.json)',
            accept: { 'application/json': ['.json'] }
          }]
        });
      }

      if (!handle) return;
      activeFileHandle = handle;

      // Check if file contains existing data
      const file = await handle.getFile();
      const text = await file.text();

      let parsed = null;
      if (text && text.trim().length > 0) {
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          // File not valid JSON, treat as empty
        }
      }

      const hasExistingData = parsed && (
        (Array.isArray(parsed.snippets) && parsed.snippets.length > 0) ||
        (Array.isArray(parsed.replacer_rules) && parsed.replacer_rules.length > 0) ||
        (Array.isArray(parsed.allowlist) && parsed.allowlist.length > 0) ||
        (Array.isArray(parsed.blacklist) && parsed.blacklist.length > 0)
      );

      if (hasExistingData) {
        pendingFileContent = text;
        const snipCount = Array.isArray(parsed.snippets) ? parsed.snippets.length : 0;
        const ruleCount = Array.isArray(parsed.replacer_rules) ? parsed.replacer_rules.length : 0;
        const allowCount = Array.isArray(parsed.allowlist) ? parsed.allowlist.length : 0;
        const blackCount = Array.isArray(parsed.blacklist) ? parsed.blacklist.length : 0;

        collisionSummary.textContent = `Found in file: ${snipCount} snippets, ${ruleCount} rules, ${allowCount} whitelist items, ${blackCount} blacklist items.`;
        collisionModal.style.display = 'flex';
      } else {
        // Write initial export to file
        const config = await StorageManager.exportConfiguration();
        await writeToFile(JSON.stringify(config, null, 2));
        updateStatusUI();
        showToast(`Connected and initialized ${handle.name}!`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast(`Connection failed: ${err.message}`, 'error');
      }
    }
  }

  // Collision Dialog handlers
  if (collisionMergeBtn) {
    collisionMergeBtn.addEventListener('click', async () => {
      try {
        if (pendingFileContent) {
          await StorageManager.importConfiguration(pendingFileContent, 'merge');
          const mergedConfig = await StorageManager.exportConfiguration();
          await writeToFile(JSON.stringify(mergedConfig, null, 2));
          showToast('Data successfully merged and synced to file!');
        }
      } catch (err) {
        showToast(`Merge failed: ${err.message}`, 'error');
      } finally {
        collisionModal.style.display = 'none';
        pendingFileContent = null;
        updateStatusUI();
      }
    });
  }

  if (collisionOverwriteFileBtn) {
    collisionOverwriteFileBtn.addEventListener('click', async () => {
      try {
        const config = await StorageManager.exportConfiguration();
        await writeToFile(JSON.stringify(config, null, 2));
        showToast('File overwritten with local data!');
      } catch (err) {
        showToast(`Overwrite failed: ${err.message}`, 'error');
      } finally {
        collisionModal.style.display = 'none';
        pendingFileContent = null;
        updateStatusUI();
      }
    });
  }

  if (collisionReplaceLocalBtn) {
    collisionReplaceLocalBtn.addEventListener('click', async () => {
      try {
        if (pendingFileContent) {
          await StorageManager.importConfiguration(pendingFileContent, 'replace');
          lastSyncTime.textContent = new Date().toLocaleTimeString();
          showToast('Local storage replaced with file data!');
        }
      } catch (err) {
        showToast(`Replace failed: ${err.message}`, 'error');
      } finally {
        collisionModal.style.display = 'none';
        pendingFileContent = null;
        updateStatusUI();
      }
    });
  }

  if (collisionCancelBtn) {
    collisionCancelBtn.addEventListener('click', () => {
      collisionModal.style.display = 'none';
      pendingFileContent = null;
      activeFileHandle = null;
      updateStatusUI();
      showToast('File connection cancelled.');
    });
  }

  // Sync Now button
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      if (!activeFileHandle) return;
      try {
        const config = await StorageManager.exportConfiguration();
        await writeToFile(JSON.stringify(config, null, 2));
        showToast('Successfully synced data to local file!');
      } catch (err) {
        showToast(`Sync failed: ${err.message}`, 'error');
      }
    });
  }

  // Load from File button
  if (pullFromFileBtn) {
    pullFromFileBtn.addEventListener('click', async () => {
      if (!activeFileHandle) return;
      try {
        const file = await activeFileHandle.getFile();
        const text = await file.text();
        await StorageManager.importConfiguration(text, 'replace');
        lastSyncTime.textContent = new Date().toLocaleTimeString();
        showToast('Successfully updated from file!');
      } catch (err) {
        showToast(`Load failed: ${err.message}`, 'error');
      }
    });
  }

  // Disconnect button
  if (disconnectFileBtn) {
    disconnectFileBtn.addEventListener('click', () => {
      activeFileHandle = null;
      pendingFileContent = null;
      updateStatusUI();
      showToast('File disconnected.');
    });
  }

  // Auto-sync toggle
  if (toggleAutoSync) {
    toggleAutoSync.addEventListener('change', () => {
      autoSyncEnabled = toggleAutoSync.checked;
      updateStatusUI();
      showToast(autoSyncEnabled ? 'Auto-sync enabled' : 'Auto-sync disabled');
    });
  }

  // Listen for storage changes if auto-sync is enabled
  chrome.storage.onChanged.addListener(async () => {
    if (autoSyncEnabled && activeFileHandle) {
      try {
        const config = await StorageManager.exportConfiguration();
        await writeToFile(JSON.stringify(config, null, 2));
      } catch (err) {
        // Ignore background auto-sync write error
      }
    }
  });

  await initTheme();
  updateStatusUI();
});