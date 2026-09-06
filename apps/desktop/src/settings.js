const urlInput = document.getElementById('url')
const errorEl = document.getElementById('error')
const saveBtn = document.getElementById('save')
const cancelBtn = document.getElementById('cancel')

async function boot() {
  try {
    const cfg = await window.hexaDesktop.getConfig()
    urlInput.value = cfg.appUrl || ''
  } catch (err) {
    errorEl.textContent = err?.message || 'Failed to load config'
  }
}

cancelBtn.addEventListener('click', () => {
  window.close()
})

saveBtn.addEventListener('click', async () => {
  errorEl.textContent = ''
  try {
    await window.hexaDesktop.setAppUrl(urlInput.value)
    window.close()
  } catch (err) {
    errorEl.textContent = err?.message || 'Could not save URL'
  }
})

urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') saveBtn.click()
})

boot()
