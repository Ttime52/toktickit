# TokTickIT Lab 4 UI Specification — Zen Green Extension

This document extends the Zen Green language established in Labs 2–3. It is
not a new visual system. Existing Ticket, Attachment, Public Comment,
Internal Note, authentication, queue, and User Management screens keep their
approved structure and states. Lab 4 adds role dashboards and the Actions
Taken list/form described here. Functional rules are in
[specification.md](specification.md); HTTP behavior is in
[api-spec.md](api-spec.md).

## 1. Inherited Zen Green foundation

### 1.1 Tokens

Implement these values as shared CSS custom properties (or equivalent theme
tokens). A Lab 4 component MUST reuse a semantic token rather than introduce a
new role/message color.

| Token | Value | Use |
|---|---|---|
| `--zen-primary` | `#006B3C` | Header, primary actions |
| `--zen-secondary` | `#0B7A46` | Navigation, links, focus accents |
| `--zen-pale` | `#EAF6EF` | Selected/success surfaces, Requester badge |
| `--zen-page` | `#F5F7F6` | Page background |
| `--zen-surface` | `#FFFFFF` | Cards, tables, inputs |
| `--zen-border` | `#C7D3CD` | Borders and dividers |
| `--zen-text` | `#17352A` | Primary text |
| `--zen-muted` | `#5C6F65` | Helper text, timestamps, secondary labels |
| `--zen-readonly` | `#EEF3F0` | Read-only Ticket and auto fields |
| `--zen-error` / `--zen-error-bg` | `#A12A2A` / `#FFF1F1` | Errors and invalid fields |
| `--zen-warning` / `--zen-warning-bg` | `#9A6700` / `#FFF8E1` | Follow-up warnings, private-note treatment, Administrator badge |
| `--zen-success` | `#0B7A46` | Success feedback |
| `--zen-danger` | `#B42318` | Destructive/cancel actions |
| `--zen-disabled-bg` / `--zen-disabled-text` | `#DDE5E0` / `#7B8981` | Disabled controls |
| `--zen-focus` | `#0B7A46` | 3 px focus outline, 2 px offset |

Typography remains `Inter, ui-sans-serif, system-ui, -apple-system,
"Segoe UI", sans-serif`; body is 16 px/1.5, helper text 14 px/1.4, labels
14 px/600, page titles 28 px/1.2 (24 px on mobile), and section titles 20
px/1.3. Use a monospace face for Ticket Numbers and numeric metric values when
that improves scanning. Use the existing 4 px spacing scale; common gaps are
8, 12, 16, 24, and 32 px. Cards use a 10 px radius, 1 px border, and the
existing light green shadow. Inputs and buttons are at least 44 px high.

### 1.2 Shared shell and navigation

The authenticated 64 px header keeps the TokTickIT brand, display name/email,
text role badge, Change Password, and Logout. Role labels remain readable in
grayscale and are never conveyed by color alone:

- Requester: `--zen-pale`, label **Requester**;
- IT Staff: `--zen-secondary` with white text, label **IT Staff**;
- Administrator: `--zen-warning-bg`/`--zen-warning`, label
  **Administrator**.

| Role | Primary navigation | Direct route behavior |
|---|---|---|
| Requester | Dashboard, My Tickets, Create Ticket | Staff/Admin routes show safe Forbidden; no protected data flashes |
| IT Staff | Dashboard, Ticket Queue | Requester/Admin mutation routes show safe Forbidden |
| Administrator | Dashboard, User Management | Staff queue/status/assignment mutations show safe Forbidden; `/admin/tickets` is a read-only dashboard drill-down and authorized Ticket inspection is read-only except Actions Taken |

The active link exposes `aria-current="page"`. On mobile, the nav collapses
behind an accessible **Open navigation** button with `aria-expanded`; closing
returns focus to that button. A User with `mustChangePassword=true` sees only
Change Password and Logout. Session expiry returns to Login without rendering
stale protected data.

Canonical new routes are `/dashboard`, `/requester-dashboard`,
`/staff-dashboard`, `/admin-dashboard`, `/my-tickets`, `/staff/tickets`,
`/admin/tickets`, `/staff/tickets/:ticketId`, and the existing
`/tickets/:ticketId` detail.
Role redirects may use one shared `/dashboard` route, but the visible content
and API request MUST remain role-appropriate.

## 2. Dashboard screens

### 2.1 Shared metric card component

`DashboardMetricCard` is the reusable component for every count card.

Each card contains:

1. a visible short label, such as **Unassigned active Tickets**;
2. a prominent numeric value with a text unit/context where needed;
3. an optional muted period line, such as **Asia/Bangkok · last 7 calendar
   days**;
4. a concise explanatory empty/zero state; and
5. an accessible **View details** link/button with the API-provided drill-down
   path and query.

The whole card is not an unlabeled click target: the value is exposed through
the label, and the drill-down has an explicit accessible name such as
`View unassigned active Tickets`. A disabled/unavailable drill-down explains
why. Metric values are API values, never client-recomputed counts.

Recommended structure:

```text
+--------------------------------------------------+
| Unassigned active Tickets              [icon]    |
| 12                                               |
| Current queue · all active statuses              |
| View unassigned Tickets                          |
+--------------------------------------------------+
```

Use the same border, radius, padding, focus ring, and semantic surface as
existing Zen Green cards. A warning/urgent card may use a semantic left accent,
but its label and icon/text must still identify the condition.

### 2.2 IT Staff Dashboard

The page title is **IT Staff Dashboard** with a short “operational starting
point” description. At desktop, the first row has four cards:

- Unassigned active Tickets;
- My active Tickets;
- Urgent active Tickets; and
- Recently updated Tickets.

The second area has two equal-width grouped cards/lists:

- **Tickets by Status** — all eight statuses, including visible zero buckets;
- **Tickets by IT Priority** — Low, Medium, High, Urgent, including zeros.

Each grouped row has a text count and a **View** action that opens the Queue
with the exact filter. Below the cards, show **Urgent work** first when nonempty
and **Recent updates** next. Preview rows contain Ticket Number, summary,
status badge, IT Priority badge, owner/unassigned label, and last updated time.
Each row has a single **Open Ticket** action to `/staff/tickets/:ticketId`.

The page does not become a second editable queue. Assignment, priority, Action
Taken, and status controls appear only after opening Ticket Detail.

Required states:

- loading skeletons preserve the final card grid shape;
- first-use empty state explains that no operational data exists yet;
- zero metric cards remain useful and do not disappear;
- no recent/urgent rows show an explicit empty message;
- `403` shows a safe Forbidden panel without any metric request data;
- API failure shows a retry action and keeps the shell/navigation usable;
- partial card rendering is not allowed when the dashboard response fails.

### 2.3 Requester Dashboard

The page title is **My Dashboard**. It summarizes only the authenticated
Requester’s Tickets and does not duplicate the full My Tickets table. Use four
primary cards:

- Open Tickets;
- Waiting for Requester;
- Recently updated; and
- Recently resolved.

If `resolutionIndicationCount` is nonzero, show a pale/warning **Problem
Appears Resolved** attention card with the count and a link to the filtered My
Tickets view. It remains advisory and never presents a formal status control.

The Recent Tickets list shows up to five owned summaries with status, the
priority fields permitted by the existing Requester serializer, and last
updated time. A zero/empty
state differentiates “You have no Tickets yet” from “No Tickets match this
period”. Every row links only to the authenticated owner’s Ticket Detail.

### 2.4 Administrator Dashboard

The page title is **Administrator Dashboard**. It uses the same metric-card
visual language as the IT Staff Dashboard but is read-only. Show operational
aggregate cards, active Users, and inactive Users. Grouped operational cards
drill down to `/admin/tickets` with the exact filter used by the metric;
recent/urgent preview rows open authorized `/tickets/:ticketId` inspection.
No card reveals a staff mutation control. If an aggregate is zero, keep the
card and show the defined zero message. The active/inactive User card links preserve an exact
`isActive=true|false` filter on User Management; the inherited User Management
toolbar must display that filter or clearly show a removable active-state
filter chip so the drill-down is visible and reversible.

## 3. Actions Taken on Ticket Detail

### 3.1 Placement and shared region

On `/staff/tickets/:ticketId` and authorized Administrator inspection, place an
**Actions Taken** card after the read-only Ticket core and before or alongside
the communication regions. Requester Ticket Detail shows the same card in
read-only mode for an owned Ticket. Keep Public Comments and Internal Notes as
separate regions; never mix Action Taken entries with private notes.

The card header includes:

- title **Actions Taken**;
- a short helper line: “Operational work recorded for this Ticket”;
- count and latest action time when available; and
- for IT Staff/Administrator, a primary **Add Action** button.

The list is chronological (`Action Date/Time` ascending; equal timestamps by
ID), with the newest item still easy to find. Do not visually imply that
`Performed by` is the primary Ticket Owner.

### 3.2 `ActionsTakenList` component

Desktop/tablet wide layouts may use a semantic table with these columns:

| Column | Rendering |
|---|---|
| Action Date/Time | Localized display plus a machine-readable `<time datetime>`; show UTC/local context in the accessible label |
| Action Description | Plain text with preserved line breaks and safe wrapping |
| Result | Plain text; do not truncate without an accessible “Show more” |
| Performed by | Display name plus role badge; read-only |
| Follow-Up Required? | Text `Yes`/`No` and a non-color icon/label |
| Follow-up Note | Show an em dash for `No`; show the note for `Yes` |
| Attachment Notes | Plain text or an explicit “None” |
| Actions | **Edit** for IT Staff/Administrator only; absent for Requester |

At mobile widths, each row becomes a bordered Action card with labelled
definition-list fields in the same order. Do not hide required fields behind
hover or a color-only icon. Long descriptions wrap at word boundaries; the
page must not gain horizontal overflow.

List states:

- loading: three skeleton Action cards/table rows;
- empty: “No Actions Taken have been recorded for this Ticket yet”; show
  **Add Action** only to a permitted role;
- populated: stable chronological list;
- validation/data failure: safe inline error with Retry, preserving the Ticket
  page;
- not found/forbidden: use the shared safe Ticket state and do not render a
  partial action list;
- stale response after save: refresh the list and show a non-destructive
  conflict panel; never silently replace an edited form.

### 3.3 `ActionTakenForm` component

The create and edit form uses the existing Zen Green form card/drawer pattern.
The form has a visible mode heading (**Add Action** or **Edit Action**) and
labels above controls:

| Field | Control and behavior |
|---|---|
| Action Date/Time | Native `datetime-local` or equivalent accessible control, rendered in `Asia/Bangkok` and prefilled with current time for create. Before submit, convert the selected value to an ISO timestamp with explicit `Z`/UTC offset; never send an ambiguous timezone-less value. The server remains authoritative. |
| Action Description | Required textarea; helper text “What was done?”; min-height 144 px. |
| Result | Required textarea; helper text “What happened as a result?” |
| Performed by | Read-only identity row populated from the session/create response; no select and no user ID input. |
| Follow-Up Required? | Required checkbox/switch with visible `Yes`/`No` text. |
| Follow-up Note | Textarea appears/enables when Yes; required error is linked to the field. When No, send `null` and do not preserve hidden stale text. |
| Attachment Notes | Optional textarea; explain that this describes an existing Ticket Attachment and does not upload a file. |

Primary action is **Save Action**; secondary is **Cancel**. Disable the primary
button while saving, but keep entered values visible. A failed validation maps
the server `fields` messages to inputs and includes an error summary above the
form. A failed request keeps all entered data. A successful create closes the
form, refreshes the list, updates the count/version, and announces success in
an `aria-live="polite"` region. A successful edit returns to view mode.

The form never includes `ticketId`, `performedBy`, `version`, `seedKey`, or a
physical file input. For a `412` stale conflict, keep the dirty values,
announce “This Action changed elsewhere; review the latest version”, provide
**Reload latest** and **Cancel**, and do not overwrite the user’s draft.

### 3.4 Role modes

| Role | List | Create | Edit | Detail fields |
|---|---:|---:|---:|---|
| Requester | Yes, own Ticket | No | No | All fields read-only; no edit affordance |
| IT Staff | Yes, all accessible Tickets | Yes | Yes | Performed by remains read-only |
| Administrator | Yes, permitted inspection | Yes | Yes | No assignment/status controls added by this component |

## 4. Ticket workflow and resolution UI

The existing IT Staff Work Controls card remains the only status/owner edit
surface. It renders only matrix-allowed transitions from the current status;
the UI cannot be treated as the authorization boundary.

- **Resolved** and **Closed** actions open a confirmation dialog containing the
  required confirmation checkbox and the required resolution/closure summary.
- **Cancelled** and **Reopened** show their required reason field.
- The dialog identifies the current and target status in text and has a
  keyboard-trapped focus order: heading, explanation, evidence, confirmation,
  Cancel, Confirm.
- On a server `400`, `403`, `409`, `412`, or `428`, retain the work-control
  selections, show an inline safe message, and refresh only after the user
  chooses to reload when needed.
- After success, refresh Ticket summary, status badge, version, dashboard
  counts where visible, and Action list. Show a text success announcement.
- Requester **Problem Appears Resolved** remains a separate confirmation action
  and displays the advisory banner without changing the formal status.

Status labels are always full text: New, Open, In Progress, Waiting for
Requester, Resolved, Closed, Reopened, Cancelled. Badges retain the existing
Zen Green shape and add icons/text or accessible labels so status is not
communicated by color alone.

## 5. Shared states, accessibility, and safety

All new screens/components must implement the established loading, empty,
no-results, validation, busy, success, forbidden, not-found, conflict, and
safe API-failure states. A recoverable error does not clear a user’s form or
filters.

- Use semantic `<main>`, headings in order, labelled controls, table headers,
  definition lists for mobile cards, and `aria-describedby` for helper/error
  text.
- Focus moves to the page heading or error summary after a route/API failure;
  after a modal/drawer closes, focus returns to its trigger.
- Every visible action is keyboard reachable and has a visible 3 px focus ring.
- Use `aria-live="polite"` for save success and non-blocking refresh messages;
  use `role="alert"` only for immediate validation/failure feedback.
- Do not expose internal notes or protected dashboard data while loading a
  forbidden response. Do not render raw HTML from Action Description, Result,
  or notes.
- Time displays may use local formatting for readability, but the accessible
  `<time>` value and API evidence remain UTC-aware. Dashboard period labels
  explicitly say `Asia/Bangkok`.
- Minimum contrast and 44 px target size from Labs 2–3 remain mandatory.

## 6. Responsive layout contract

Use the existing breakpoints and avoid page-level horizontal scrolling:

| Viewport | Dashboard | Action list/form | Ticket workflow |
|---|---|---|---|
| Desktop `>=1200 px` | Four-card first row; grouped cards and two preview lists | Semantic table may be used; form is a card or max 560 px drawer | Work controls and read-only core remain readable in two-column sections |
| Tablet `768–1199 px` | Two-card grid; grouped metrics stack below; previews remain single column | Table may switch to labelled cards before clipping; form is full-width card | Secondary fields collapse; primary actions remain visible |
| Mobile `<768 px` | One-column cards; no chart/text overlap; drill-down buttons full width | Stacked Action cards and one-column form; Save/Cancel are full-width or equal buttons | Status/owner controls stack; confirmation dialog fits viewport and scrolls internally |

At all sizes, long Ticket Numbers, names, notes, and action text wrap safely;
badges do not overlap; controls do not fall outside the viewport; and no page
requires horizontal scrolling. Capture evidence at 1440×900, 1024×768, and
390×844 (or the project’s approved mobile viewport).

## 7. Visual and accessibility inspection checklist

The final visual test/checklist must verify:

- [ ] Zen Green tokens, typography, spacing, shadows, badge shapes, and button
  states match Labs 2–3; no accidental second theme exists.
- [ ] Dashboard cards have clear labels, readable values, zero/empty text, and
  accessible drill-down names.
- [ ] Requester sees only own dashboard/action data; forbidden screens do not
  flash protected content.
- [ ] Action list visibly separates shared work history from Public Comments
  and private Internal Notes.
- [ ] All seven Action fields are visible in create/view/edit modes, with
  Performed by read-only and conditional Follow-up Note behavior.
- [ ] Status/priority/role badges include text or non-color cues and remain
  readable in grayscale.
- [ ] Loading, empty, error, forbidden, not-found, stale-conflict, and success
  states are intentional and not placeholder text.
- [ ] Keyboard tab order, focus ring, labels, error association, modal focus
  trap, Escape behavior, and focus restoration work.
- [ ] Desktop, tablet, and mobile screenshots show no clipping, overlap,
  unreachable action, or page-level horizontal overflow.
- [ ] Browser console has no React warnings, failed asset requests, or
  unhandled API errors during the evidence flows.
