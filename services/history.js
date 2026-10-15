const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(process.cwd(), 'downloads', 'history.json');

function getHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading history:', err.message);
    return [];
  }
}

function addHistoryItem(item) {
  try {
    const list = getHistory();
    const newItem = {
      id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      ...item
    };
    list.unshift(newItem);
    // Keep last 100 items
    if (list.length > 100) list.pop();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2));
    return newItem;
  } catch (err) {
    console.error('Error saving history item:', err.message);
    return null;
  }
}

function removeHistoryItem(id) {
  try {
    let list = getHistory();
    list = list.filter(item => item.id !== id);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2));
    return true;
  } catch (err) {
    console.error('Error removing history item:', err.message);
    return false;
  }
}

function clearHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  getHistory,
  addHistoryItem,
  removeHistoryItem,
  clearHistory
};
