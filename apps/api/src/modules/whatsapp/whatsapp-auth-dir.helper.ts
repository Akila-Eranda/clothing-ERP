import * as path from 'path';

/**
 * Where WhatsApp (Baileys) login credentials live. They are secrets: anyone who can read creds.json can
 * act as the shop's WhatsApp account. They must NOT sit under the upload root, because that folder is
 * served publicly (nginx `/uploads/`). Pure functions, unit-tested.
 */
export function resolveWhatsappAuthRoot(opts: {
  configured?: string | null;
  cwd: string;
}): string {
  const configured = opts.configured?.trim();
  if (configured) return path.resolve(configured);
  // Default is a sibling of (not inside) the uploads folder.
  return path.resolve(opts.cwd, 'private', 'whatsapp-sessions');
}

/** True when `candidate` is the same as, or inside, `root` (after resolving both). */
export function isInsideDir(candidate: string, root: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** A warning message when the credentials folder is inside a publicly served folder, else null. */
export function publicExposureWarning(authRoot: string, uploadRoot: string): string | null {
  return isInsideDir(authRoot, uploadRoot)
    ? `WhatsApp auth folder (${authRoot}) is inside the public upload folder (${uploadRoot}). ` +
      'Move it outside (set WHATSAPP_AUTH_DIR) and make sure the web server does not serve it.'
    : null;
}
