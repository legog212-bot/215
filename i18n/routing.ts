import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ka', 'ru', 'en'],
  defaultLocale: 'ka',
  localePrefix: 'always',
});
