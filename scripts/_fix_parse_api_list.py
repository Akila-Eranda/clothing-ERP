#!/usr/bin/env python3
"""Replace unsafe API list extractions with parseApiList across web src."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "apps" / "web" / "src"
IMPORT = 'import { parseApiList } from "@/lib/parse-api-list";'

patterns = [
    (re.compile(r"setSales\(\(res\.data\?\.data \?\? res\.data \?\? \[\]\) as Sale\[\]\)"), "setSales(parseApiList<Sale>(res.data))"),
    (re.compile(r"setGrns\(grnR\.data\?\.data \?\? \[\]\)"), "setGrns(parseApiList<GrnRow>(grnR.data))"),
    (re.compile(r"setGrns\(grnR\.data\?\.data \?\? \[\]\)"), "setGrns(parseApiList<GrnRow>(grnR.data))"),
    (re.compile(r"setOrders\(r\.data\?\.data \?\? \[\]\)"), "setOrders(parseApiList(r.data))"),
    (re.compile(r"setVouchers\(r\.data\?\.data \?\? \[\]\)"), "setVouchers(parseApiList(r.data))"),
    (re.compile(r"setReturnSearchRes\(r\.data\?\.data\?\?\[\]\)"), "setReturnSearchRes(parseApiList(r.data))"),
    (re.compile(r"if\(\(r\.data\?\.data\?\?\[\]\)\.length===0\)"), "if(parseApiList(r.data).length===0)"),
    (re.compile(r"setGlAccounts\(a\.data\?\.data \?\? \[\]\)"), "setGlAccounts(parseApiList(a.data))"),
    (re.compile(r"setGlAccounts\(acc\.data\?\.data \?\? \[\]\)"), "setGlAccounts(parseApiList(acc.data))"),
    (re.compile(r"setCustomers\(r\.data\?\.data \?\? \[\]\)"), "setCustomers(parseApiList<Customer>(r.data))"),
    (re.compile(r"setUsers\(r\.data\?\.data \?\? \[\]\)"), "setUsers(parseApiList<UserOpt>(r.data))"),
    (re.compile(r"setSuppliers\(res\.data\?\.data \?\? \[\]\)"), "setSuppliers(parseApiList(res.data))"),
    (re.compile(r"setSuppliers\(r\.data\?\.data \?\? \[\]\)"), "setSuppliers(parseApiList(r.data))"),
    (re.compile(r"setSuppliers\(supplierRes\.data\?\.data \?\? \[\]\)"), "setSuppliers(parseApiList<Supplier>(supplierRes.data))"),
    (re.compile(r"const rows = r\.data\?\.data \?\? \[\]"), "const rows = parseApiList(r.data)"),
    (re.compile(r"const list = custRes\.data\?\.data \?\? \[\]"), "const list = parseApiList<Customer>(custRes.data)"),
    (re.compile(r"setLogs\(r\.data\?\.data \?\? \[\]\)"), "setLogs(parseApiList(r.data))"),
    (re.compile(r"setSales\(salesR\.data\?\.data \?\? \[\]\)"), "setSales(parseApiList(salesR.data))"),
    (re.compile(r"setRecent\(res\.data\?\.data \?\? \[\]\)"), "setRecent(parseApiList(res.data))"),
    (re.compile(r"setCheques\(cRes\.data\?\.data \?\? \[\]\)"), "setCheques(parseApiList(cRes.data))"),
    (re.compile(r"setCheques\(chR\.data\?\.data \?\? \[\]\)"), "setCheques(parseApiList(chR.data))"),
    (re.compile(r"setRows\(listRes\.data\?\.data \?\? \[\]\)"), "setRows(parseApiList(listRes.data))"),
    (re.compile(r"setPrs\(prR\.data\?\.data \?\? \[\]\)"), "setPrs(parseApiList(prR.data))"),
    (re.compile(r"setReturns\(retR\.data\?\.data \?\? \[\]\)"), "setReturns(parseApiList(retR.data))"),
    (re.compile(r"setInvoices\(invR\.data\?\.data \?\? \[\]\)"), "setInvoices(parseApiList(invR.data))"),
    (re.compile(r"setBrands\(res\.data \?\? \[\]\)"), "setBrands(parseApiList(res.data))"),
    (re.compile(r"setCategories\(res\.data \?\? \[\]\)"), "setCategories(parseApiList(res.data))"),
    (re.compile(r"setCategories\(catRes\.data \?\? \[\]\)"), "setCategories(parseApiList(catRes.data))"),
    (re.compile(r"setBrands\(brandRes\.data \?\? \[\]\)"), "setBrands(parseApiList(brandRes.data))"),
    (re.compile(r"setCategories\(r\.data \?\? \[\]\)"), "setCategories(parseApiList(r.data))"),
    (re.compile(r"setBrands\(r\.data \?\? \[\]\)"), "setBrands(parseApiList(r.data))"),
    (re.compile(r"setUsers\(d\.data \?\? \[\]\)"), "setUsers(parseApiList(d.data))"),
    (re.compile(r"setCostCenters\(costRes\.data \?\? \[\]\)"), "setCostCenters(parseApiList(costRes.data))"),
    (re.compile(r"setBudgets\(budgetRes\.data \?\? \[\]\)"), "setBudgets(parseApiList(budgetRes.data))"),
    (re.compile(r"setRecurring\(recurringRes\.data \?\? \[\]\)"), "setRecurring(parseApiList(recurringRes.data))"),
    (re.compile(r"setRates\(ratesRes\.data \?\? \[\]\)"), "setRates(parseApiList(ratesRes.data))"),
    (
        re.compile(
            r"setStock\(stockRes\.data\?\.data \?\? \(stockRes\.data as unknown as InventoryItem\[\]\) \?\? \[\]\)"
        ),
        "setStock(parseApiList<InventoryItem>(stockRes.data))",
    ),
    (
        re.compile(
            r"setLogs\(logsRes\.data\?\.data \?\? \(logsRes\.data as unknown as LedgerLog\[\]\) \?\? \[\]\)"
        ),
        "setLogs(parseApiList<LedgerLog>(logsRes.data))",
    ),
    (
        re.compile(r"setCustomers\(res\.data\?\.data \?\? \(res\.data as unknown as Customer\[\]\) \?\? \[\]\)"),
        "setCustomers(parseApiList<Customer>(res.data))",
    ),
    (
        re.compile(r"setSuppliers\(res\.data\?\.data \?\? \(res\.data as unknown as Supplier\[\]\) \?\? \[\]\)"),
        "setSuppliers(parseApiList<Supplier>(res.data))",
    ),
    (
        re.compile(r"setPos\(res\.data\?\.data \?\? \(res\.data as unknown as PurchaseOrder\[\]\) \?\? \[\]\)"),
        "setPos(parseApiList<PurchaseOrder>(res.data))",
    ),
    (
        re.compile(r"setBranches\(res\.data\?\.data \?\? \(res\.data as unknown as Branch\[\]\) \?\? \[\]\)"),
        "setBranches(parseApiList<Branch>(res.data))",
    ),
    (
        re.compile(r"setCustomers\(r\.data\?\.data \?\? \(r\.data as unknown as Customer\[\]\) \?\? \[\]\)"),
        "setCustomers(parseApiList<Customer>(r.data))",
    ),
    (
        re.compile(r"setSuppliers\(r\.data\?\.data \?\? \(r\.data as unknown as SupplierOpt\[\]\) \?\? \[\]\)"),
        "setSuppliers(parseApiList<SupplierOpt>(r.data))",
    ),
    (
        re.compile(
            r"setSuppliers\(supplierRes\.data\?\.data \?\? \(supplierRes\.data as unknown as SupplierOpt\[\]\) \?\? \[\]\)"
        ),
        "setSuppliers(parseApiList<SupplierOpt>(supplierRes.data))",
    ),
    (
        re.compile(r"setSuppliers\(supR\.data\?\.data \?\? \(supR\.data as unknown as Supplier\[\]\) \?\? \[\]\)"),
        "setSuppliers(parseApiList<Supplier>(supR.data))",
    ),
    (
        re.compile(r"const allPos = poRes\.data\?\.data \?\? \(poRes\.data as unknown as OpenPo\[\]\) \?\? \[\]"),
        "const allPos = parseApiList<OpenPo>(poRes.data)",
    ),
    (
        re.compile(r"const all = r\.data\?\.data \?\? \(r\.data as unknown as OpenPo\[\]\) \?\? \[\]"),
        "const all = parseApiList<OpenPo>(r.data)",
    ),
    (
        re.compile(r"setSuppliers\(r\.data\?\.data \?\? \(r\.data as unknown as Supplier\[\]\) \?\? \[\]\)"),
        "setSuppliers(parseApiList<Supplier>(r.data))",
    ),
    (
        re.compile(r"setBranches\(r\.data\?\.data \?\? \(r\.data as unknown as Branch\[\]\) \?\? \[\]\)"),
        "setBranches(parseApiList<Branch>(r.data))",
    ),
    (
        re.compile(
            r"setEntries\(jRes\.data\?\.data \?\? \(Array\.isArray\(jRes\.data\) \? \(jRes\.data as JournalEntry\[\]\) : \[\]\)\)"
        ),
        "setEntries(parseApiList<JournalEntry>(jRes.data))",
    ),
    (
        re.compile(
            r"const data = Array\.isArray\(res\.data\) \? \(res\.data as unknown as CoaNode\[\]\) : \(res\.data\?\.data \?\? \[\]\)"
        ),
        "const data = parseApiList<CoaNode>(res.data)",
    ),
    (
        re.compile(r"const list = Array\.isArray\(r\.data\) \? r\.data : \(r\.data\?\.data \?\? \[\]\)"),
        "const list = parseApiList(r.data)",
    ),
    (
        re.compile(r"const rows = Array\.isArray\(r\.data\) \? r\.data : \(r\.data\?\.data \?\? \[\]\)"),
        "const rows = parseApiList(r.data)",
    ),
    (re.compile(r"\(res\.data \?\? \[\]\)\.map"), "parseApiList(res.data).map"),
    (
        re.compile(r"setWarehouses\(\(r\.data \?\? \[\]\)\.map"),
        "setWarehouses(parseApiList<{id:string;name:string}>(r.data).map",
    ),
    (re.compile(r"setJournal\(\(je\?\.data \?\? \[\]\) as JournalEntry\[\]\)"), "setJournal(parseApiList<JournalEntry>(je?.data))"),
    (
        re.compile(r"const raw = br\.data\?\.data \?\? \(Array\.isArray\(br\.data\) \? br\.data : \[\]\)"),
        "const raw = parseApiList(br.data)",
    ),
    (
        re.compile(r"const raw = r\.data\?\.data \?\? \(Array\.isArray\(r\.data\) \? r\.data : \[\]\)"),
        "const raw = parseApiList(r.data)",
    ),
    (
        re.compile(r"setHistory\(\(res\.data as \{ data\?: CashRegister\[\] \}\)\?\.data \?\? \[\]\)"),
        "setHistory(parseApiList<CashRegister>(res.data))",
    ),
    (
        re.compile(r"setSuppliers\(Array\.isArray\(payload\) \? payload : \(payload\.data \?\? \[\]\)\)"),
        "setSuppliers(parseApiList(payload))",
    ),
]

changed_files: list[str] = []
for path in ROOT.rglob("*"):
    if path.suffix not in {".ts", ".tsx"}:
        continue
    text = path.read_text(encoding="utf-8")
    orig = text
    for pat, repl in patterns:
        text = pat.sub(repl, text)
    if text != orig:
        if "parseApiList" in text and "@/lib/parse-api-list" not in text:
            lines = text.splitlines()
            last_import = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    last_import = i
            lines.insert(last_import + 1, IMPORT)
            text = "\n".join(lines)
        path.write_text(text, encoding="utf-8")
        changed_files.append(str(path.relative_to(ROOT)))

print(f"Changed {len(changed_files)} files:")
for f in sorted(changed_files):
    print(f"  {f}")
