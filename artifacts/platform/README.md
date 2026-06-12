This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Demo login

The platform ships with a pre-seeded demo workspace covering NVDA, AAPL,
MSFT, GOOGL, and META.

### One-click (preview / workspace dev only)

Open `/platform/sign-in` and click **"Sign in as demo user"** under the
password form. The button is server-rendered only when the environment
is non-production AND `DEMO_USER_PASSWORD` is set in Replit secrets, so
it never appears in the live deployment. Behind the scenes it calls a
preview-only endpoint (`POST /platform/api/dev/demo-sign-in`) which
mints a single-use Clerk sign-in ticket using the Backend API — the
literal demo password never leaves the server. The endpoint returns
`404 Not Found` in production.

### Manual (any environment)

Sign in at `/platform/sign-in` with:

- **Email:** `demo@finsyt.com`
- **Password:** value of the `DEMO_USER_PASSWORD` **Replit secret**.
  The literal value is intentionally not committed to source, `.replit`,
  or any docs — open the Secrets pane in the Replit workspace to read
  it. The seed script keeps Clerk in sync with whatever this secret is
  currently set to (see "Rotation procedure" in the root `replit.md`).
- **Or:** click **Continue with Google** to sign in via Google SSO.

To re-create the demo content after a database reset:

```bash
pnpm --filter @workspace/scripts run seed:demo
```

See the **Demo login** section of the root `replit.md` for full details,
including the password-rotation procedure.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
