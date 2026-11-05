# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Sizing `ready-for-agent` tickets

Soft guideline (lemfleet#16/#19, no enforcement code): a `ready-for-agent` ticket prefers **one focused implementable unit, verifiable in one session**. The factory controller carries a ticket across up to three worker dispatches (multi-dispatch continuation, lemfleet ADR-0007), so honest oversizing survives — but that budget is a safety net, not capacity planning. Epic parents without runnable children stay unlabeled: they are not implementable units, and labeling them invites a dispatch that cannot verify anything.
