# BIG ALIEN GIFT CARD — Customer and Admin Portals

## GitHub Pages URLs
- Customer portal: `https://bigalien12.github.io/big-alien-gift-card/`
- Separate admin portal: `https://bigalien12.github.io/big-alien-gift-card/admin.html`

## Upload these files to the repository root
`index.html`, `admin.html`, `styles.css`, `app.js`, `admin.js`, `config.js`, `supabase-schema.sql`, and `fix-schema.sql`.

## Important setup
1. If your first SQL setup was the shorter version shared in chat, run `fix-schema.sql` in Supabase SQL Editor. It adds the `gift_card_id` column used when a customer submits a selected card.
2. Sign in at `/admin.html` with the owner account whose `profiles.role` is `admin`.
3. Add gift-card brands and verified rates in the admin portal. The customer catalogue is populated from active rows in `gift_cards`; if it is empty, customers cannot select a card. You can add as many brands and regions as your business supports.
4. In Supabase Authentication URL Configuration, add both the customer site URL and `https://bigalien12.github.io/big-alien-gift-card/admin.html` to allowed redirect URLs if email confirmation is enabled.
5. Test with a separate customer account and confirm RLS blocks customers from editing rates, approving trades, viewing other customers' bank details, or marking payouts paid.

## Security and production notes
The separate admin HTML page is a convenience, not the security boundary. Supabase Auth and Row Level Security must enforce all permissions. Never publish a service-role/secret key or database password. Bank account numbers are sensitive; assess encryption/tokenisation, retention, audit logs and applicable Nigerian privacy obligations. Payouts are manual transfers; mark a payout Paid only after verifying the transfer. Payout creation and automated bank verification are not yet implemented. Do not collect gift-card PINs or claim codes in ordinary forms.
