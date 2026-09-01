import fs from "fs";
import path from "path";

const SRC = path.resolve("src");
const IMPORT_LINE =
  'import { Loading, LoadingCenter, LoadingScreen } from "@/components/ui/loading";';

const replacements = [
  [
    /<div className="min-h-screen flex items-center justify-center bg-background">\s*<div className="h-8 w-8 rounded-full border-2 border-primary\/30 border-t-primary animate-spin" \/>\s*<\/div>/g,
    "<LoadingScreen />",
  ],
  [
    /<div className="flex h-screen items-center justify-center bg-\[#f8fafc\]">\s*<div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" \/>\s*<\/div>/g,
    '<LoadingScreen className="min-h-0 h-screen bg-[#f8fafc]" />',
  ],
  [
    /<div className="min-h-\[420px\] grid place-items-center">\s*<Loader2 className="h-8 w-8 animate-spin text-primary" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[420px] py-0" size={88} />',
  ],
  [
    /<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>/g,
    "<LoadingCenter />",
  ],
  [
    /return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>;/g,
    "return <LoadingCenter />;",
  ],
  [
    /<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>/g,
    '<LoadingCenter className="py-16" />',
  ],
  [
    /return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>;/g,
    'return <LoadingCenter className="py-16" />;',
  ],
  [
    /<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>/g,
    '<LoadingCenter className="py-10" />',
  ],
  [
    /<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>/g,
    '<LoadingCenter className="py-20" />',
  ],
  [
    /<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary"\/?><\/div>/g,
    '<LoadingCenter className="py-8" />',
  ],
  [
    /<div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" \/><\/div>/g,
    '<LoadingCenter className="py-8" size={56} />',
  ],
  [
    /<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/><\/div>/g,
    "<LoadingCenter size={88} />",
  ],
  [
    /<div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" \/><\/div>/g,
    '<LoadingCenter className="py-8" size={56} />',
  ],
  [
    /<div className="flex items-center justify-center flex-1"><Loader2 className="h-7 w-7 animate-spin" style=\{\{color:"var\(--pos-accent\)"\}\}\/><\/div>/g,
    '<LoadingCenter className="flex-1 py-0" size={80} />',
  ],
  [
    /<div className="flex items-center justify-center flex-1"><Loader2 className="h-8 w-8 animate-spin" style=\{\{color:"var\(--pos-accent\)"\}\}\/><\/div>/g,
    '<LoadingCenter className="flex-1 py-0" size={88} />',
  ],
  [
    /<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" style=\{\{color:"var\(--pos-accent\)"\}\}\/><\/div>/g,
    "<LoadingCenter size={88} />",
  ],
  [
    /<div className="flex flex-col items-center justify-center py-16 gap-3">\s*<Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" size={88} />',
  ],
  [
    /<div className="flex flex-col items-center justify-center py-20 gap-3">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-20" size={88} />',
  ],
  [
    /<div className="flex flex-col items-center justify-center py-12 gap-3">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-12">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-16">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-20">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-20" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-8">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter className="py-8" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-12">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-16">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center flex-1 py-12">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter className="flex-1 py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-10">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-10" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-12">\s*<Loader2 className="h-8 w-8 animate-spin text-gray-300" \/>\s*<\/div>/g,
    '<LoadingCenter size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-16">\s*<Loader2 className="h-8 w-8 animate-spin text-gray-300" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-20">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-20" />',
  ],
  [
    /<div className="flex items-center justify-center py-12">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    "<LoadingCenter />",
  ],
  [
    /<div className="flex items-center justify-center py-16">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" />',
  ],
  [
    /<div className="flex items-center justify-center min-h-\[200px\]">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[200px] py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center min-h-\[240px\]">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[240px] py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center min-h-\[300px\]">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[300px] py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center min-h-\[400px\]">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[400px] py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center flex-1 min-h-0">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="flex-1 min-h-0 py-0" size={88} />',
  ],
  [
    /<div className="flex flex-1 items-center justify-center">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="flex-1 py-0" size={88} />',
  ],
  [
    /<div className="flex justify-center items-center py-12">\s*<Loader2 className="h-8 w-8 animate-spin text-amber-400" \/>\s*<\/div>/g,
    "<LoadingCenter size={88} />",
  ],
  [
    /<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>/g,
    '<LoadingCenter className="py-8" />',
  ],
  [
    /<div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/><\/div>/g,
    '<LoadingCenter className="py-6" />',
  ],
  // Multiline: outer div + Loader2 child (page/section loaders only)
  [
    /<div className="flex justify-center py-16">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" />',
  ],
  [
    /return \(\s*<div className="flex justify-center py-16">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>\s*\);/g,
    "return <LoadingCenter className=\"py-16\" />;",
  ],
  [
    /<div className="flex justify-center py-12">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    "<LoadingCenter />",
  ],
  [
    /<div className="flex justify-center py-8">\s*<Loader2 className="h-6 w-6 animate-spin text-primary" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-8" />',
  ],
  [
    /<div className="flex justify-center py-16">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-16" />',
  ],
  [
    /<div className="flex-1 flex items-center justify-center py-20">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="flex-1 py-20" />',
  ],
  [
    /<div className="flex-1 flex items-center justify-center">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter className="flex-1 py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center flex-1">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter className="flex-1 py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center h-48">\s*<Loader2 className="h-8 w-8 animate-spin" style=\{\{ color: "var\(--pos-accent\)" \}\} \/>\s*<\/div>/g,
    '<LoadingCenter className="h-48 py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center min-h-\[40vh\]">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[40vh] py-0" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center h-64">\s*<Loader2 className="h-8 w-8 animate-spin text-gray-300" \/>\s*<\/div>/g,
    '<LoadingCenter className="h-64 py-0" size={88} />',
  ],
  [
    /<div className="py-10 flex justify-center">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-10" />',
  ],
  [
    /<div className="page-shell min-h-\[420px\] grid place-items-center">\s*<div className="text-center">\s*<Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" \/>\s*<\/div>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[420px] py-0" size={88} />',
  ],
  [
    /<div className="flex min-h-\[200px\] items-center justify-center rounded-\[18px\] border border-border bg-card shadow-\[0_2px_10px_rgba\(15,23,42,0\.04\)\]">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="min-h-[200px] py-0 rounded-[18px] border border-border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]" />',
  ],
  [
    /<div className="flex items-center justify-center py-12 rounded-xl border bg-card">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-12 rounded-xl border bg-card" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-10 rounded-xl border bg-card">\s*<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-10 rounded-xl border bg-card" size={88} />',
  ],
  [
    /<div className="flex items-center justify-center py-24 rounded-\[18px\] border border-border bg-card shadow-\[0_2px_10px_rgba\(15,23,42,0\.04\)\]">\s*<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" \/>\s*<\/div>/g,
    '<LoadingCenter className="py-24 rounded-[18px] border border-border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]" />',
  ],
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

function addImport(content) {
  if (content.includes('@/components/ui/loading')) return content;
  const usesLoading = /<(Loading|LoadingCenter|LoadingScreen)\b/.test(content);
  if (!usesLoading) return content;

  if (content.includes('"use client"') || content.includes("'use client'")) {
    return content.replace(
      /(['"])use client\1;?\s*\n/,
      (m) => `${m}${IMPORT_LINE}\n`,
    );
  }
  return `${IMPORT_LINE}\n${content}`;
}

let changed = 0;
for (const file of walk(SRC)) {
  if (file.includes("components/ui/loading.tsx")) continue;
  if (file.includes("scripts/")) continue;
  let content = fs.readFileSync(file, "utf8");
  const before = content;
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  content = addImport(content);
  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
    console.log("updated:", path.relative(SRC, file));
  }
}

console.log(`Done. ${changed} files updated.`);
