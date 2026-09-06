# Place release files here for download + auto-update:
#   HexaOne-Setup.exe
#   latest.yml
#   HexaOne-Setup.exe.blockmap
#
# Build & publish into this folder:
#   pnpm --filter @fashion-erp/desktop dist:publish
#
# Or manually:
#   pnpm desktop:dist
#   pnpm --filter @fashion-erp/desktop publish:web
#
# Auto-update reads:  {tenant-origin}/downloads/latest.yml
# Manual download:    {tenant-origin}/downloads/HexaOne-Setup.exe
