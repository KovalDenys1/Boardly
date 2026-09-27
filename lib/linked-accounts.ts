/**
 * DELETE /api/user/linked-accounts answers with this code when the provider is the only
 * way the account can sign in (#1140). The profile maps it to
 * profile.linkedAccounts.lastSignInMethod, which says what the person can actually do:
 * add a password through "Forgot password?" (it sets one on an account that has none),
 * then remove the provider.
 */
export const LAST_SIGN_IN_METHOD_CODE = 'LAST_SIGN_IN_METHOD'
