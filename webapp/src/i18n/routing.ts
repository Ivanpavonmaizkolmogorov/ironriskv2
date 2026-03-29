import {defineRouting} from 'next-intl/routing';
import {createNavigation} from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localePrefix: 'as-needed' // Only prefixes `/es/`, keeps `/en/` as root `/`
});

export const {Link, redirect, usePathname, useRouter} = createNavigation(routing);
