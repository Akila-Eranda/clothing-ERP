const urlInput = document.getElementById('url')
const errorEl = document.getElementById('error')
const saveBtn = document.getElementById('save')

function showError(message) {
  if (!message) {
    errorEl.hidden = true
    errorEl.textContent = ''
    return
  }
  errorEl.hidden = false
  errorEl.textContent = message
}

async function boot() {
  try {
    const cfg = await window.hexaDesktop.getConfig()
    urlInput.value = cfg.appUrl || 'https://shop.hexalyte.com/login'
    if (cfg.loadError) showError(cfg.loadError)
  } catch (err) {
    showError(err?.message || 'Could not load settings')
  }
}

saveBtn.addEventListener('click', async () => {
  showError('')
  try {
    await window.hexaDesktop.setAppUrl(urlInput.value)
  } catch (err) {
    showError(err?.message || 'Could not open URL')
  }
})

urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') saveBtn.click()
})

boot()
