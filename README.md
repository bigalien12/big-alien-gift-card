# BIG ALIEN GIFT CARD — Supabase-connected website

## GitHub Pages update
Upload/replace these files in the root of your GitHub repository:
- `index.html`
- `styles.css`
- `app.js`
- `config.js`

Keep `config.js` in the same folder as `index.html`.

## Connected Supabase project
The browser config uses the project URL and publishable key supplied by the project owner. Publishable keys are intended for browser use; never add a service-role/secret key or database password to GitHub.

## Current connected features
- Supabase email/password sign-up and login.
- Customer profile role lookup.
- Live active gift-card catalogue.
- Trade request submission and customer trade history.
- Private withdrawal account save/read/update.
- Admin-only card/rate management, trade status updates and payout status updates.
- WhatsApp support link.

## Before real use — important
1. In Supabase Authentication → URL Configuration, add your exact GitHub Pages site URL to Site URL and Redirect URLs.
2. In Authentication → Providers → Email, decide whether to require email confirmation. If confirmation is enabled, customers must confirm before logging in.
3. Confirm the SQL schema and RLS policies have been run successfully.
4. Test with a separate ordinary customer account. Verify that it cannot read other users' bank accounts or trades, update rates, approve trades or mark payouts paid.
5. Never expose a Supabase service-role/secret key in frontend files.
6. Payouts are manual bank transfers. Mark a payout Paid only after the transfer is actually completed and verified.
7. Sample rate values should be set by the admin to your actual verified rates before you advertise quotes.
8. Do not collect gift card PINs/claim codes through this website's ordinary forms. Use a separate, secure verification process with strict access controls.
9. Bank account numbers are sensitive financial data. Assess encryption/tokenisation, data retention, audit logs, access controls and Nigerian privacy obligations before production.

The browser UI is not a substitute for server-side controls. Supabase RLS is the security boundary. Test policies carefully before accepting money or gift cards.
