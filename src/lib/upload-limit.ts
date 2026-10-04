// Attachments per save. The server accepts a little more, for the rest of the
// form: next.config.ts (serverActions.bodySizeLimit 11mb, proxyClientMaxBodySize
// 12mb) and nginx client_max_body_size 12m on the server.
export const MAX_UPLOAD_MB = 10;

export function uploadProblem(files: File[]) {
  const total = files.reduce((s, f) => s + (f?.size ?? 0), 0);
  return total > MAX_UPLOAD_MB * 1024 * 1024
    ? `Attachments are limited to ${MAX_UPLOAD_MB} MB per save — these come to ${(total / 1048576).toFixed(1)} MB. Save them in smaller batches.`
    : null;
}
