# Social sign-in provider setup

The application supports Google, LinkedIn OpenID Connect, and Facebook through
Supabase Auth. Providers are enabled only when their identifiers are explicitly listed in
the server-side `AUTH_OAUTH_PROVIDERS` environment variable. Login and
registration show a status card for each supported provider; providers outside
this allowlist are marked as awaiting setup and disabled. This switch is not
evidence that the provider is configured: complete every provider and redirect
step below before enabling it.

The login and registration forms use the same OAuth flow for candidate and
employer audiences, with the Google, LinkedIn, Facebook, and Instagram brand
marks rendered from Font Awesome 6's brand icon set via React Icons. Instagram
is informational only and is not a sign-in option. The OAuth flow requests no
additional profile permissions. Supabase currently lists 50,000 monthly active users on
its Free plan; this has plan limits and may change. Provider app access and
review requirements still apply.

## Supabase and application URLs

1. Set the Supabase Auth **Site URL** to the exact HTTPS origin configured as
   `NEXT_PUBLIC_APP_URL` (HTTP is allowed only for local loopback development).
2. In Supabase Auth **URL Configuration**, allow the application's callback
   URLs: `/auth/callback` for the default Turkish locale, plus
   `/{locale}/auth/callback` for each enabled non-default locale. Add the local
   equivalents when testing locally.
3. In each provider's developer console, register Supabase's callback URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. In the Supabase Auth provider settings, enter the provider's client ID and
   secret. Keep those credentials in the provider console and Supabase; never
   put them in browser variables, source control, or chat.
5. Set the non-secret server-side allowlist on the deployed app only after
   Supabase configuration is complete, for example:

   ```text
   AUTH_OAUTH_PROVIDERS=google,linkedin_oidc,facebook
   ```

   Remove any provider that has not completed its own configuration and
   approval requirements. When empty, the provider cards remain visible but
   disabled, and email/password remains available.

## Provider-specific requirements

- **Google:** configure the OAuth consent screen and web client in Google Cloud.
  Register the Supabase callback URI as an authorized redirect URI. The app
  requests account selection and uses only standard identity claims.
- **LinkedIn:** configure the LinkedIn OpenID Connect sign-in product and
  credentials in the LinkedIn developer portal. The Supabase provider key is
  `linkedin_oidc`; required product access and review are controlled by
  LinkedIn.
- **Facebook:** create a Meta app, configure Facebook Login and its valid
  OAuth redirect settings, and supply the app ID/secret in Supabase. Meta may
  require additional review or verification before production access.

OAuth establishes an authenticated account; choosing the candidate or employer
destination does not grant an application role. The current profile trigger may
use a provider-supplied display name, full name, or name after bounding and
cleaning it. Email remains managed by Supabase Auth. The product does not
receive CVs, work history, skills, social posts, or company details through
these login scopes. Review and explicitly save profile data imported from a CV
or company document through their separate on-device flows.

Instagram Login is not a general-purpose candidate/employer identity or CV
import API, and WhatsApp Business is a messaging API rather than an account
login provider; neither is presented as a sign-in option.

For a basic social-login path that does not rely on paid SMS/WhatsApp messaging,
the app's supported options are Google, LinkedIn OpenID Connect, and Facebook
Login. The current Supabase Free plan includes up to 50,000 monthly active
users, subject to plan limits; this does not waive provider approval or account
requirements. Instagram's current Login API is aimed at professional accounts
and account-management access rather than general consumer identity. WhatsApp
OTP/messaging is a separate product and can incur messaging charges; it is not
a free substitute for OAuth login. Check current provider terms and Supabase
quotas before production use:

- [Supabase Auth social login](https://supabase.com/docs/guides/auth/social-login)
- [Supabase pricing](https://supabase.com/pricing)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [LinkedIn OpenID Connect sign-in](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Facebook Login](https://developers.facebook.com/documentation/facebook-login/overview)
- [Instagram Login API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login)
- [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)

The Playwright configuration clears `AUTH_OAUTH_PROVIDERS` by default, so the
regular E2E suite verifies the safe unconfigured state and does not contact
external providers. To verify button visibility without contacting a provider,
set `PLAYWRIGHT_AUTH_OAUTH_PROVIDERS` to an allowed provider in the E2E runner.
A visible button is not proof of a live integration; test OAuth itself only
after its application, Supabase callback, and redirect allowlist are configured
in a non-production environment.
