import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // The cookie is client-controlled: only a language we ship reaches the import.
  const asked = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = asked === 'vi' ? 'vi' : 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
