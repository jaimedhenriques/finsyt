# Enterprise SSO & SCIM Setup Guide

This document explains the one-time Clerk Dashboard configuration required
to activate SAML/enterprise SSO and SCIM provisioning for Finsyt.

---

## 1. Enable Enterprise Connections in Clerk

1. Open the **Clerk Dashboard** → your application → **User & Authentication** → **Enterprise Connections**.
2. Click **Add connection** and choose **SAML**.
3. Fill in the IdP metadata (Okta, Azure AD, Google Workspace, etc.).  
   Clerk will generate a **SP Entity ID** and **ACS URL** to paste back in your IdP.
4. Set **Domain** to the customer's email domain (e.g. `acme.com`).  
   Users who sign in with an `@acme.com` email are automatically routed to the SAML IdP.
5. Leave **Sync User Attributes** enabled so name/email stay current.

After saving, test a SAML sign-in. The user will be placed into the Clerk
organization associated with the enterprise connection.

---

## 2. Enable SCIM Provisioning

1. In Clerk Dashboard → **Enterprise Connections** → your SAML connection → **SCIM**.
2. Toggle SCIM **on** and copy the **SCIM Base URL** and **Bearer token**.
3. Paste these into your IdP's SCIM provisioning settings.
4. Enable **Push Users** and **Push Groups** (groups map to organization memberships).

When the IdP pushes a user or group change, Clerk fires the corresponding
`organizationMembership.*` webhook event — the application handler syncs it
to the local `memberships` table automatically (see step 3).

---

## 3. Register the Clerk Webhook

1. Clerk Dashboard → **Webhooks** → **Add endpoint**.
2. **URL**: `https://<your-domain>/platform/api/webhooks/clerk`
3. **Events to subscribe**:
   - `organizationMembership.created`
   - `organizationMembership.updated`
   - `organizationMembership.deleted`
   - `user.deleted`
4. Click **Save**. Copy the **Signing Secret** shown on the endpoint page.
5. In the Replit **Secrets** pane, create a secret:  
   `CLERK_WEBHOOK_SECRET` = `<the signing secret>`

The platform reads this secret at request time to verify every inbound
webhook with an HMAC signature, so spoofed events are rejected with HTTP 400.

---

## 4. Role Mapping

Clerk organization roles are mapped to Finsyt's four-level model:

| Clerk role        | Finsyt role |
|-------------------|-------------|
| `org:owner`       | owner       |
| `org:admin`       | admin       |
| `org:member`      | member      |
| `org:viewer` / `guest_member` | viewer |

SCIM-provisioned users default to **member** unless the IdP group assigns
an `org:admin` role. You can override individual roles from the Finsyt
**Team** settings page after provisioning.

---

## 5. Verify the Setup

### SAML sign-in
1. Open a private window and go to `/platform/sign-in`.
2. Click **Enterprise SSO** and enter an email on the enterprise domain.
3. You should be redirected to the IdP login page, then land in `/platform/app`.
4. Confirm the user appears in **Settings → Team** with the expected role.

### SCIM provisioning
1. In your IdP, assign a new user to the Finsyt SCIM app.
2. Clerk fires `organizationMembership.created`; the webhook handler upserts
   a row in the `memberships` table.
3. The new member appears in **Settings → Team** without any manual invite.

### SCIM deprovisioning
1. In your IdP, unassign the user from the Finsyt SCIM app.
2. Clerk fires `organizationMembership.deleted`; the webhook handler removes
   the local membership row.
3. The user can no longer sign in or access any tenant data.

---

## 6. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Enterprise SSO button produces "No enterprise connection found" | The email domain does not match any configured SAML connection in Clerk |
| Webhook returns 503 | `CLERK_WEBHOOK_SECRET` is not set in Replit Secrets |
| Webhook returns 400 | Signing secret mismatch — re-copy from Clerk Dashboard |
| SCIM user lands in wrong org | Check the SCIM group → Clerk org mapping in your IdP |
| Membership not created after SCIM push | Confirm the `organizationMembership.created` event is selected on the webhook endpoint |
