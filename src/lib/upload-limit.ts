// Attachments per save. The server accepts a little more, for the rest of the
// form: next.config.ts (serverActions.bodySizeLimit 11mb, proxyClientMaxBodySize
// 12mb) and nginx client_max_body_size 12m on the server.
export const MAX_UPLOAD_MB = 10;

// The message, in the user's language, when the files are too big together.
// Pass the common-namespace translator (useTranslations("common")).
export function uploadProblem(files: File[], t: (key: "upload.tooBig", values: { max: number; mb: string }) => string) {
  const total = files.reduce((s, f) => s + (f?.size ?? 0), 0);
  return total > MAX_UPLOAD_MB * 1024 * 1024
    ? t("upload.tooBig", { max: MAX_UPLOAD_MB, mb: (total / 1048576).toFixed(1) })
    : null;
}
