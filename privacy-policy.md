# Privacy Policy

Effective date: 2026-01-31

This policy describes how the Vercel-deployed app and API in this
repository handle data, specifically the serverless endpoint
`/api/reflex4you`.

## Summary

- The API only processes the data you send to validate formulas and
  generate a shareable URL.
- We do not run user accounts and do not sell your data.
- We do not store request bodies or generated URLs on our servers.
- Vercel, our hosting provider, may collect standard server logs.

## Data we process

When you call `/api/reflex4you`, the API receives the JSON payload you
send, which can include:

- Formula source text
- Numeric values (including complex numbers) and labels
- Animation intervals and timing
- Base URL and feature flags (e.g., validate, compile, compress)

The API returns a response that includes the generated URL and query
string based on your input.

## How we use data

We use the data solely to:

- Validate formulas
- Generate a shareable URL and response payload
- Debug errors and prevent abuse (via standard hosting logs)

We do not use your data for advertising or marketing.

## Data retention

The API processes requests in memory and does not persist request bodies
or generated URLs.

Our hosting provider (Vercel) may store standard access logs (for
example, IP address, user agent, request path, timestamps) for a limited
period. See Vercel's privacy policy for details.

## Sharing and third parties

We do not share your data with third parties except for:

- Vercel, which hosts the API and provides infrastructure logs

If you share the generated URL, any data embedded in the query string
becomes visible to anyone with that link and may be logged by services
that receive it. Do not include sensitive or personal information in
formulas or parameters.

## Cookies and tracking

The API does not set cookies or use analytics trackers.

## Security

We use HTTPS for transport security, but no method of transmission is
100% secure. Please avoid sending sensitive data.

## Children's privacy

The service is not directed to children under 13, and we do not
knowingly collect personal information from children.

## Changes

We may update this policy from time to time. The "Effective date" above
indicates the latest revision.

## Contact

For questions or requests, please open an issue in the repository where
this policy is published.
