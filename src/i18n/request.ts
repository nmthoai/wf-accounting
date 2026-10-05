import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./locale";
import { MESSAGES } from "./messages";

export default getRequestConfig(async () => {
  // Only a language we ship is ever chosen (see resolveLocale).
  const locale = await resolveLocale();
  return {
    locale,
    messages: MESSAGES[locale],
    timeZone: "Asia/Ho_Chi_Minh",
  };
});
