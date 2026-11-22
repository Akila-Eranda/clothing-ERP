from pathlib import Path

path = Path(r"e:\clothing shop\apps\web\src\components\pos\pos-overlay.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        '                )}\n                {activePayment==="CASH"&&(\n                  <div ref={cashPanelRef} className="px-3 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}>\n                    <motion class="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span><span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>Type amount · F9 confirm</span><button onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></motion>',
        '                )}\n                </motion>\n                <motion class="flex flex-col min-h-0 lg:border-l" style={{borderColor:"#1e3356"}}>\n                {activePayment==="CASH"&&(\n                  <motion ref={cashPanelRef} tabIndex={-1} className="px-3 py-2 border-b shrink-0 outline-none" style={{borderColor:"#1e3356"}}>\n                    <motion class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">\n                      <span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span>\n                      <span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>0–9 · Ctrl+1–4 quick · F9 pay</span>\n                      <button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>\n                    </motion>',
    ),
]

# use div tags only
replacements = [
    (
        '                )}\n                {activePayment==="CASH"&&(\n                  <div ref={cashPanelRef} className="px-3 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}>\n                    <div className="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span><span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>Type amount · F9 confirm</span><button onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></div>',
        '                )}\n                </motion>\n                <motion class="flex flex-col min-h-0 lg:border-l" style={{borderColor:"#1e3356"}}>\n                {activePayment==="CASH"&&(\n                  <motion ref={cashPanelRef} tabIndex={-1} className="px-3 py-2 border-b shrink-0 outline-none" style={{borderColor:"#1e3356"}}>\n                    <motion class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">\n                      <span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span>\n                      <span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>0–9 · Ctrl+1–4 quick · F9 pay</span>\n                      <button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>\n                    </motion>',
    ),
]

new_right = (
    '                )}\n'
    '                </motion>\n'
    '                <motion class="flex flex-col min-h-0 lg:border-l" style={{borderColor:"#1e3356"}}>\n'
    '                {activePayment==="CASH"&&(\n'
    '                  <motion ref={cashPanelRef} tabIndex={-1} className="px-3 py-2 border-b shrink-0 outline-none" style={{borderColor:"#1e3356"}}>\n'
    '                    <motion class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">\n'
    '                      <span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span>\n'
    '                      <span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>0–9 · Ctrl+1–4 quick · F9 pay</span>\n'
    '                      <button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>\n'
    '                    </motion>'
)
new_right = new_right.replace("<motion", "<motion")
new_right = (
    '                )}\n'
    '                </motion>\n'
    '                <motion class="flex flex-col min-h-0 lg:border-l" style={{borderColor:"#1e3356"}}>\n'
    '                {activePayment==="CASH"&&(\n'
    '                  <motion ref={cashPanelRef} tabIndex={-1} className="px-3 py-2 border-b shrink-0 outline-none" style={{borderColor:"#1e3356"}}>\n'
    '                    <motion class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">\n'
    '                      <span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span>\n'
    '                      <span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>0–9 · Ctrl+1–4 quick · F9 pay</span>\n'
    '                      <button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>\n'
    '                    </motion>'
)

new_right = """                )}
                </motion>
                <motion class="flex flex-col min-h-0 lg:border-l" style={{borderColor:"#1e3356"}}>
                {activePayment==="CASH"&&(
                  <motion ref={cashPanelRef} tabIndex={-1} className="px-3 py-2 border-b shrink-0 outline-none" style={{borderColor:"#1e3356"}}>
                    <motion class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span>
                      <span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>0–9 · Ctrl+1–4 quick · F9 pay</span>
                      <button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>
                    </motion>"""

new_right = new_right.replace("<motion", "<motion")
new_right = new_right.replace("<motion", "<div").replace("</motion>", "</motion>")
new_right = new_right.replace("</motion>", "</div>")

old = """                )}
                {activePayment==="CASH"&&(
                  <motion ref={cashPanelRef} className="px-3 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}>
                    <motion class="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span><span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>Type amount · F9 confirm</span><button onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></motion>"""

old = """                )}
                {activePayment==="CASH"&&(
                  <motion ref={cashPanelRef} className="px-3 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}>
                    <motion class="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span><span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>Type amount · F9 confirm</span><button onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></motion>"""

old = text[text.rfind('                )}\n                {activePayment==="CASH"', 0, text.find('ref={cashPanelRef}')):text.find('<div className="h-11 rounded-xl flex items-center px-3 mb-2')]

new_right = """                )}
                </motion>
                <motion class="flex flex-col min-h-0 lg:border-l" style={{borderColor:"#1e3356"}}>
                {activePayment==="CASH"&&(
                  <motion ref={cashPanelRef} tabIndex={-1} className="px-3 py-2 border-b shrink-0 outline-none" style={{borderColor:"#1e3356"}}>
                    <motion class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span>
                      <span className="text-[10px] font-mono" style={{color:"#4a6a8a"}}>0–9 · Ctrl+1–4 quick · F9 pay</span>
                      <button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>
                    </motion>"""
new_right = new_right.replace("<motion", "<div").replace("</motion>", "</div>")

if old not in text:
    print('OLD NOT FOUND')
    print(old[:200])
    raise SystemExit(1)

text = text.replace(old, new_right, 1)
text = text.replace('onClick={()=>isQuick?setNumpad(k):handleNumpad(k)}', 'onClick={()=>isQuick?setQuickCash(parseInt(k,10)):handleNumpad(k)}')
text = text.replace(
    '<button onClick={() => void handleCheckout()} disabled={checkoutLoading||items.length===0}',
    '<button ref={checkoutConfirmRef} onClick={() => void handleCheckout()} disabled={checkoutLoading||items.length===0}',
    1,
)

footer_old = """                  <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
                </motion>
              </motion>
              </motion>
            )}"""

footer_old = """                  <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
                </motion>
              </motion>
              </motion>
            )}"""

footer_old = """                  <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
                </motion>
              </motion>
              </motion>
            )}"""

footer_old = """                  <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
                </motion>
              </motion>
              </motion>
            )}"""

footer_old = """                  <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
                </motion>
              </motion>
              </motion>
            )}"""

footer_old = """                  <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
                </motion>
              </motion>
              </motion>
            )}"""

# read actual footer from file
fidx = text.find('handleThermalPrint')
footer_old = text[fidx-200:fidx+250]
print(footer_old)
