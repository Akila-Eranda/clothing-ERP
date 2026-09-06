const titleEl = document.getElementById('title')
const detailEl = document.getElementById('detail')
const actionBtn = document.getElementById('action')
const laterBtn = document.getElementById('later')
const barEl = document.getElementById('bar')
const fillEl = document.getElementById('fill')

/** @type {'available' | 'downloading' | 'ready'} */
let mode = 'available'

function applyState(state) {
  mode = state.mode || 'available'
  const version = state.version ? `v${state.version}` : 'a new version'
  if (mode === 'available') {
    titleEl.textContent = 'Update available'
    detailEl.textContent = `HexaOne ${version} is available. Click Update to download and install.`
    actionBtn.textContent = 'Update'
    actionBtn.disabled = false
    laterBtn.hidden = false
    barEl.classList.remove('show')
  } else if (mode === 'downloading') {
    const pct = Math.max(0, Math.min(100, Math.round(state.percent || 0)))
    titleEl.textContent = 'Downloading update'
    detailEl.textContent = `HexaOne ${version} — ${pct}%`
    actionBtn.textContent = `${pct}%`
    actionBtn.disabled = true
    laterBtn.hidden = true
    barEl.classList.add('show')
    fillEl.style.width = `${pct}%`
  } else {
    titleEl.textContent = 'Update ready'
    detailEl.textContent = `HexaOne ${version} downloaded. Restart to finish updating.`
    actionBtn.textContent = 'Restart & Update'
    actionBtn.disabled = false
    laterBtn.hidden = false
    laterBtn.textContent = 'Later'
    barEl.classList.add('show')
    fillEl.style.width = '100%'
  }
}

laterBtn.addEventListener('click', () => {
  window.hexaDesktop?.dismissUpdate?.()
})

actionBtn.addEventListener('click', () => {
  if (mode === 'available') window.hexaDesktop?.startUpdateDownload?.()
  else if (mode === 'ready') window.hexaDesktop?.installUpdateNow?.()
})

window.hexaDesktop?.onUpdateBannerState?.((state) => applyState(state))
window.hexaDesktop?.getUpdateBannerState?.().then((state) => {
  if (state) applyState(state)
})
