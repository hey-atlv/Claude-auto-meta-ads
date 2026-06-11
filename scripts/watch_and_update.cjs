/**
 * watch_and_update.cjs
 * Watches Downloads folder for new/updated Excel files matching known patterns.
 * When detected: runs process_excel.cjs → inject_cache.cjs → notifies server to reload.
 *
 * Usage: node scripts/watch_and_update.cjs
 * (Or run via Windows Task Scheduler — see setup instructions below)
 *
 * Task Scheduler setup (auto-run on login):
 *   schtasks /create /tn "AutoMetaAds-Watch" /tr "\"C:\Program Files\nodejs\node.exe\" \"<full-path-to-this-file>\"" /sc onlogon /ru %USERNAME% /f
 */

const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const WATCH_DIR  = path.join(process.env.USERPROFILE, 'Downloads');
const SCRIPT_DIR = __dirname;
const NODE       = '"C:\\Program Files\\nodejs\\node.exe"';

// Files we care about (partial name match)
const PATTERNS = [
  'Meta_Ads_Master_Database',
  'Meta_Ads_Master_Database_Content',
  'Meta_Ads_Master_Database_01',
];

// Track last-modified times to detect real changes
const lastMtimes = {};
let debounceTimer = null;
let isProcessing  = false;

function log(msg) {
  const ts = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${ts}] ${msg}`);
}

function matchesPattern(filename) {
  return PATTERNS.some(p => filename.includes(p)) && filename.endsWith('.xlsx');
}

function runPipeline() {
  if (isProcessing) {
    log('Pipeline already running, skipping duplicate trigger.');
    return;
  }
  isProcessing = true;
  log('▶ Phát hiện file mới/cập nhật. Bắt đầu xử lý...');

  try {
    log('  [1/2] Chạy process_excel.cjs...');
    execSync(`${NODE} "${path.join(SCRIPT_DIR, 'process_excel.cjs')}"`, {
      stdio: 'inherit',
      timeout: 300000, // 5 min
    });

    log('  [2/2] Chạy inject_cache.cjs...');
    execSync(`${NODE} "${path.join(SCRIPT_DIR, 'inject_cache.cjs')}"`, {
      stdio: 'inherit',
      timeout: 60000,
    });

    log('✅ Cập nhật hoàn tất! Server cache đã sẵn sàng.');
    log('   → Reload trang http://localhost:3000 để thấy dữ liệu mới.');

  } catch (err) {
    log('❌ Lỗi trong pipeline: ' + err.message);
  } finally {
    isProcessing = false;
  }
}

function checkFiles() {
  let changed = false;
  try {
    const files = fs.readdirSync(WATCH_DIR);
    for (const f of files) {
      if (!matchesPattern(f)) continue;
      const fullPath = path.join(WATCH_DIR, f);
      const mtime = fs.statSync(fullPath).mtimeMs;
      if (lastMtimes[f] !== undefined && lastMtimes[f] !== mtime) {
        log(`  📄 Phát hiện thay đổi: ${f}`);
        changed = true;
      }
      lastMtimes[f] = mtime;
    }
  } catch (e) {
    // Ignore read errors
  }
  return changed;
}

// Initialize baseline mtimes
function init() {
  try {
    const files = fs.readdirSync(WATCH_DIR);
    for (const f of files) {
      if (!matchesPattern(f)) continue;
      const fullPath = path.join(WATCH_DIR, f);
      lastMtimes[f] = fs.statSync(fullPath).mtimeMs;
    }
    log(`Đang theo dõi ${Object.keys(lastMtimes).length} file Excel trong: ${WATCH_DIR}`);
    log('Nhấn Ctrl+C để dừng.\n');
  } catch (e) {
    log('Không thể đọc thư mục Downloads: ' + e.message);
  }
}

// fs.watch with debounce (avoid multiple triggers for same save)
function startWatch() {
  init();

  // Poll every 5 seconds (fs.watch unreliable on Windows for some apps)
  setInterval(() => {
    if (checkFiles()) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runPipeline, 3000); // wait 3s after last change
    }
  }, 5000);

  log('👀 Watcher started (polling every 5s)...\n');
}

// ── ONE-SHOT MODE: run pipeline once immediately ──────────────────────────────
if (process.argv[2] === '--run-now') {
  log('Chế độ one-shot: chạy pipeline ngay bây giờ...');
  runPipeline();
} else {
  startWatch();
}
