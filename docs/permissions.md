# Permissions

## Modes

| Mode | Behavior |
|---|---|
| **Manual** (default) | Approve each action unless the site is Always-allow and risk is low |
| **Auto** | Fewer prompts on trusted sites; still pauses for protected actions |
| **Skip** | No prompts for low-risk; **still blocks prohibited**; requires confirm to enable |

## Prohibited (never execute)

Purchases / pay now / checkout completes, account creation, financial trades, permanent deletes, CAPTCHA bypass, credit-card-like input, cookie/storage evaluate.

## Protected (always confirm)

Password and sensitive fields, downloads/export, OAuth “Allow access”, payment URLs, injection-heuristic hits.

## Site controls

- Blocklist: default banking/investing hosts + custom
- Allowlist-only mode: only listed hosts
- Always-allow site list is revocable in settings (storage)
