# HRIS Identity Lifecycle Simulator

An offline portfolio exercise that validates fictional HRIS-style joiner, mover, and leaver rows, suggests allowlisted access mappings, and flags records for human review. Microsoft Graph content is reference-only. The demo does not enforce approvals or perform account or group changes.

## Run it

Open `index.html` directly in a modern browser. It runs locally without a server, account, API key, installation, or network connection. Edit the sample CSV or use **Reset sample** to restore it.

To run the logic checks with Node.js:

```powershell
node --test simulator.test.js
```

## Workflow rules

- Require the documented columns and a unique employee ID.
- Accept only `join`, `move`, and `leave`, with active status for join/move and terminated status for leave.
- Reject unknown departments, invalid dates, malformed rows, and manager addresses outside the reserved `.test` domain.
- For valid join and move events, suggest one mapped baseline group and flag HR/manager review. For leave events, suggest no group and flag HR confirmation/reviewer assessment.
- Treat every approval and access recommendation as a review prompt only: there is no approval workflow, account provisioning, group membership change, or account disablement in the demo.
- Generate a review record and audit preview. Every output explicitly reports that no external side effect occurred.

The Graph notes reflect the official [Create user](https://learn.microsoft.com/en-us/graph/api/user-post-users?view=graph-rest-1.0) and [Update user](https://learn.microsoft.com/en-us/graph/api/user-update?view=graph-rest-1.0) documentation. For a join event, the page shows a reference endpoint and least-privileged permission but omits the request body because a real create requires tenant-specific values and a password profile. For a leave event, it shows the reference `accountEnabled: false` patch shape and the documented least-privileged permission combination. These are explanatory previews only; the demo does not build or send authenticated requests. Group names are suggestions, and no group membership operations are implemented. A real implementation must review required app roles, administrator consent, and tenant policies.

## Boundaries

All names, employee IDs, and `.test` addresses in the sample are fictional. The page does not store inputs, call any service, create or disable accounts, or perform group changes. It is not a live HRIS or Microsoft Entra integration, production workflow, credential, or proof of work for an employer. It does not implement credential handling, approval actions or enforcement, access review, retries/idempotency, rollback, monitoring, privacy review, or production testing.

An honest description after personally reviewing and running the demo is: “Built an offline identity-lifecycle simulator using synthetic HRIS events, validation rules, human-review recommendations, suggested access mappings, and Microsoft Graph reference previews.”

## Licensing

The code is original and uses no third-party libraries, copied source, fonts, or images. It relies on standard browser APIs and the Node.js built-in test runner. No third-party license obligations are introduced. No public reuse license has been selected; choose one before publishing the source publicly if reuse is intended.
