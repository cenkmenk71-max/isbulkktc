import "server-only";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getLocalePrefix, isAppLocale, routing } from "./routing";

/**
 * Redirects to `path` under the locale the request is being served in.
 *
 * `next/navigation`'s `redirect` cannot see the locale, so an unprefixed path
 * silently drops a localized visitor into the default-locale page (e.g.
 * `/fa/reset-password` used to land on the Turkish `/forgot-password`). Use
 * this whenever the current user is unknown and their stored locale is not
 * available yet.
 */
export async function redirectLocalized(path: string): Promise<never> {
  const requested = await getLocale();
  const locale = isAppLocale(requested) ? requested : routing.defaultLocale;
  const prefix = getLocalePrefix(locale);
  const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;

  redirect(`${prefix}${suffix}` || "/");
}
