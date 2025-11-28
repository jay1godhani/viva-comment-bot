popup.css
// popup.js

const enabledEl = document.getElementById('enabled')
const messageEl = document.getElementById('message')
const saveBtn = document.getElementById('save')
const statusEl = document.getElementById('status')

// Load stored settings
chrome.storage.sync.get(['enabled', 'message'], (items) => {
  enabledEl.checked = items.enabled !== undefined ? items.enabled : true
  messageEl.value = items.message || 'Thanks for the update!'
})

saveBtn.addEventListener('click', () => {
  const enabled = enabledEl.checked
  const message = messageEl.value || 'Thanks for the update!'

  chrome.storage.sync.set({ enabled, message }, () => {
    statusEl.textContent = 'Saved'
    setTimeout(() => (statusEl.textContent = ''), 1500)
  })
})
