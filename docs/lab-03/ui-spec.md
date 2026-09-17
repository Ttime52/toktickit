# Lab 3 UI Specification — Zen Green Extension

This is an extension of Lab 2's Zen Green design system, not a replacement.
Reuse the exact tokens below, the 4 px spacing scale, typography, form
controls, focus ring, status badges and desktop/tablet/mobile breakpoints. Do
not reintroduce the Development Requester selector or another visual system.
Functional requirements and role decisions are normative in
[specification.md](specification.md); request/response behavior is defined in
[api-spec.md](api-spec.md).

## 0. Inherited Zen Green tokens

These values are inherited unchanged from `docs/lab-02/ui-spec.md` and must be
implemented as shared CSS custom properties (or equivalent theme values).

| Token | Value | Use in Lab 3 |
|---|---|---|
| `--zen-primary` | `#006B3C` | Header and primary actions |
| `--zen-secondary` | `#0B7A46` | Navigation, links and focus accents |
| `--zen-pale` | `#EAF6EF` | Selected/success surfaces and Requester badge |
| `--zen-page` | `#F5F7F6` | Page background |
| `--zen-surface` | `#FFFFFF` | Cards, tables and inputs |
| `--zen-border` | `#C7D3CD` | Borders and dividers |
| `--zen-text` | `#17352A` | Primary text |
| `--zen-muted` | `#5C6F65` | Helper text and timestamps |
| `--zen-readonly` | `#EEF3F0` | Read-only Ticket fields |
| `--zen-error` / `--zen-error-bg` | `#A12A2A` / `#FFF1F1` | Errors and validation |
| `--zen-warning` / `--zen-warning-bg` | `#9A6700` / `#FFF8E1` | Warnings and Administrator badge |
| `--zen-success` | `#0B7A46` | Success feedback |
| `--zen-danger` | `#B42318` | Destructive actions |
| `--zen-disabled-bg` / `--zen-disabled-text` | `#DDE5E0` / `#7B8981` | Disabled controls |
| `--zen-focus` | `#0B7A46` | 3 px focus outline, 2 px offset |

Inherited typography is `Inter, ui-sans-serif, system-ui, -apple-system,
"Segoe UI", sans-serif`; body text is 16 px/1.5, helper text 14 px/1.4,
labels 14 px/600, page titles 28 px/1.2 (24 px/1.25 on mobile), and section
titles 20 px/1.3. Ticket Numbers use a monospace face. Base spacing is 4 px;
inputs/buttons are at least 44 px high, and textareas start at 144 px high;
common spacing values are 8, 12, 16, 24 and 32 px; cards use 10 px radius,
1 px border and
`0 2px 8px rgba(23, 53, 42, 0.08)` shadow. Content max width is 1,200 px with
24 px desktop and 16 px mobile gutters. No new hex colour may be introduced
for a role or message when an inherited semantic token applies.

## Screen modes

| Screen | Primary mode | Editable data |
|---|---|---|
| Login | Authenticate | Email/password for this request only |
| Mandatory Change Password | First-login or voluntary password change | Current/new/confirm password |
| My Tickets | View/list | None |
| Create Ticket | Create | Requester-entered Ticket fields and post-create Attachment actions |
| Requester Ticket Detail | View/detail | Attachments, Public Comment composer and Problem Appears Resolved indication only when authorized |
| IT Staff Ticket Queue | View/list | None |
| IT Staff Ticket Detail | View plus operational edit | Assignee, IT Priority, status and permitted communication composers |
| Administrator Ticket Inspection | View/detail | None; read-only Ticket, Public Comments and Internal Notes |
| Administrator User Management | View/list, Create, Edit | User name/email/one role/activation and initial-password action |

Ticket core fields remain read-only in every view/detail mode. No screen edits a
Ticket requester, Ticket Number or generated dates.

## 1. Shared shell and role navigation

After authentication, the 64 px header shows the TokTickIT brand, current user's
display name/email, a semantic role badge, permitted Change Password action and
Logout. The role badge is text
as well as colour: `Requester`, `IT Staff`, or `Administrator`. Use
`--zen-pale` for Requester, `--zen-secondary` with white text for IT Staff,
and `--zen-warning-bg`/`--zen-warning` for Administrator; all labels remain
readable in grayscale.

| Role | Navigation | Direct-route result |
|---|---|---|
| Requester | My Tickets, Create Ticket | Staff/Admin routes show a safe Forbidden page; no data flashes. |
| IT Staff | Ticket Queue | Requester/Admin routes show safe Forbidden. |
| Administrator | User Management; read-only Ticket inspection when opened by an authorized link | Staff queue/mutation routes show safe Forbidden; inspection data is read-only. |

On mobile, navigation collapses into an accessible button named **Open navigation**; keyboard
focus order follows visual order. The Logout action remains available. The
shell fetches `/auth/me` before rendering protected content; expired/inactive
sessions return to Login. A `mustChangePassword` User sees only Change Password
and Logout. The active navigation link exposes `aria-current="page"`; the
mobile menu button exposes its expanded state and returns focus after closing.
Canonical client routes are `/tickets`, `/tickets/new` and `/tickets/:ticketId`
for Requester screens, `/staff/tickets` and `/staff/tickets/:ticketId` for IT
Staff, and `/admin/users` for User Management. An Administrator's read-only
Ticket inspection uses the shared `/tickets/:ticketId` detail only when an
authorized link is supplied; it is not a navigable queue route.

## 2. Authentication screens

### Login

Centered Zen Green card with email, password, labelled visibility toggle,
Sign in button, loading/busy state and generic failed-login/throttle feedback.
When the server returns `429`, show a safe retry-later message without saying
whether the email exists. Labels remain visible; required fields use an
asterisk plus text/screen-reader hint.
Do not distinguish unknown email from wrong password or reveal an inactive
account. Successful login routes by role or to Change Password.

### Mandatory Change Password

Shows current password, new password and confirmation, password rule help,
inline validation and submit/busy/safe failure feedback. It has no normal
navigation when `mustChangePassword=true`; a voluntary Change Password action
uses the same screen inside the authenticated shell. On success, confirm the
change and open/retain the permitted role shell.

## 3. Requester regression screens

My Tickets, Create Ticket, Ticket Detail and Attachment presentation retain
the Lab 2 layout, tokens, validation and responsive table/card behavior. Ticket
Detail explicitly shows Ticket Number, Ticket Date, Category, Related System,
Requested Priority, IT Priority (read-only and initially equal to Requested
Priority), Current Status, Summary,
Description and Last Updated. The identity comes from the shell and is
read-only; there is no selector, Change Requester action, requester query
parameter or editable requester control.

Ticket Detail adds a **Public Comments** card below attachments. It has a
chronological feed (author, role badge, time, content), empty state, a labelled
comment textarea and Post button. Requester sees only this public discussion;
there is no empty Internal Notes placeholder that could suggest private data
exists. When the Ticket is `IN_PROGRESS` or `WAITING_FOR_REQUESTER` and no
indication has been recorded, show a labelled **Problem Appears Resolved**
button with a confirmation step. Success shows a non-editable “Indication sent
to IT Staff” banner and keeps the formal status unchanged; it never offers a
Requester control for `RESOLVED` or `CLOSED`.

## 4. IT Staff Ticket Queue

Desktop uses a readable table; tablet may reduce secondary columns; mobile uses
stacked Ticket cards. Each item includes Ticket Number, Created Date, Summary,
Category, Requester, Ticket Owner / Assignee (active IT Staff or Administrator),
Requested Priority, IT Priority, Current Status and Last Updated. Ticket Owner /
Assignee refers to the same primary work owner; badges use both colour and text.
The unassigned badge is visually neutral and explicitly says `Unassigned`.

Above results: search, category/system/requested-priority/IT-priority/status/
assignment filters, sort, Clear Filters and pagination. Controls have labels;
filters can combine; loading skeleton, first-use empty, no-results and retry
failure are distinct. The primary row action is Open Ticket. Do not make a
desktop mega-grid: less useful columns collapse before the screen scrolls.

Priority/status badges retain the Lab 2 shape (8 px horizontal and 4 px
vertical padding, 999 px radius, 12–14 px text) and always show their label.
`LOW`/`MEDIUM`/`HIGH`/`URGENT` use the inherited muted-green/green/amber/red
semantics. Status labels are `New`, `Open`, `In Progress`, `Waiting for Requester`,
`Resolved`, `Closed`, `Reopened` and `Cancelled`;
the full text is available to assistive technology and is never conveyed by
colour alone. `Unassigned` is a text label, not an empty cell.

## 5. IT Staff Ticket Detail

The Lab 2 Ticket core remains clearly read-only. A separate **Work controls**
card contains only permitted editable fields: Ticket Owner/assignee (loaded
from active IT Staff and Administrator options), IT Priority, Current Status
and contextual Claim/Assign/Reassign/Save actions. Present only the status
transitions allowed by BR-05 and retain a server conflict message for a stale
selection. Show the **Problem Appears
Resolved** indication from the Requester as a read-only banner; it is not a
staff status action. IT Staff may formally move a Ticket to **Resolved** or
**Closed** only after an explicit confirmation dialog. The `Waiting for
Requester` status is shown when staff are waiting for the Requester and is
never renamed to a private implementation label. Show assignee-option
loading/empty/failure feedback without allowing an arbitrary user ID. Show
current owner, requested priority and status badges near the Ticket identity;
the initial IT Priority visibly matches Requested Priority until a permitted
operation changes it. Disable Save
while busy and preserve selections after safe failure.

The existing Attachment section is retained for staff investigation: show safe
metadata and authorized Preview/Download for active files, and retained
Removed/Unavailable states. IT Staff do not receive upload or remove controls;
those remain Requester-owner actions.

Below the core, render two deliberately different communication regions:

| Region | Visual and behavioural distinction |
|---|---|
| **Public Comments** | `--zen-surface` white/standard surface, `Visible to requester, IT staff and Administrator` helper text, public conversation icon, post composer only for permitted roles. |
| **Internal Notes** | `--zen-warning-bg`/`--zen-warning` accent surface with a left lock icon and `IT Staff/Administrator only — never visible to requester` label. IT Staff gets the post composer; Administrator gets read-only inspection content. Never use colour alone. |

Both regions show author, role, UTC-localized timestamp, feed loading/empty/
failure states and no edit/delete control. Internal Notes must not render until
the authorized response has arrived; Requester never receives the data.

An Administrator opening an authorized Ticket inspection link sees the same
read-only Ticket, Public Comments and Internal Notes regions, but no Work
controls or composer. Ticket inspection is not added as a normal Administrator
navigation destination; a staff queue link or mutation route is still
forbidden. Attachment metadata and bytes are omitted from this role's view.

## 6. Administrator User Management

One intentionally simple screen: title, explanatory text, Create User action,
search by name/email, optional Role filter, and Clear Filters. Search and Role
filters combine with AND. The desktop table contains Name, Email, Role, Status
and Edit; mobile turns each row into a card with the same information and Edit
action. No pagination, bulk selection, delete, import, export or sorting
controls.

Create/Edit is a labelled dialog or page with display name, email, one Role
select, an active/inactive switch with a visible text state, initial password
on create or reset plus a client-only confirmation field, and save/cancel. On
create, the selected switch state is required and the submit payload MUST
include the matching boolean `isActive` (there is no implicit active default);
the UI also sends the required `initialPassword` and never sends the
confirmation field. Edit presents a Reset Initial Password action rather
than a password value. Surface duplicate email, invalid role, self-deactivation,
last-active-administrator and assigned-Ticket-owner safety errors next to the
relevant control. A confirmation is required before deactivation; an
unavailable action explains why it is blocked and asks staff to reassign owned
Tickets first.

User Management has loading, first-use empty, no-results, success, forbidden,
conflict and safe API-failure states. Search/filter values survive a failed
request, and a successful create/edit/reset refreshes the list without exposing
the submitted password.

## 7. States, accessibility and responsiveness

Every main screen identifies create/view/edit modes and supplies loading,
empty/no-results, validation, busy/saving, success, forbidden/not-found and
safe API-failure feedback. Keep form values after a failed API call. Use native
buttons/labels where possible, visible keyboard focus, error summary linked to
invalid fields, sufficient contrast, semantic tables with card alternatives,
and no information conveyed by colour alone.

At desktop (>=992 px), tablet (768–991 px) and mobile (<768 px), no page has
horizontal overflow, clipped controls, overlapping badges or unreachable
actions. Touch controls remain comfortably sized; dialog focus is trapped and
returns to its invoking control when closed.

## 8. Visual QA evidence

Capture readable, non-cropped screenshots at 1440×900 desktop, 1024×768 tablet
and 390×844 mobile for Login/Change Password, Requester Ticket Detail, IT Staff
Queue, IT Staff Ticket Detail and Administrator User Management. Store them in
these explicit folders:

| Screen | Evidence folder |
|---|---|
| Login and Change Password | `artifacts/lab-03/screenshots/authentication/` |
| Requester Ticket Detail | `artifacts/lab-03/screenshots/requester-regression/` |
| IT Staff Queue | `artifacts/lab-03/screenshots/staff-queue/` |
| IT Staff Ticket Detail | `artifacts/lab-03/screenshots/staff-ticket-detail/` |
| Administrator User Management | `artifacts/lab-03/screenshots/user-management/` |

Review each against the exact
tokens in §0 and record that the shell role badge/navigation, editable versus
read-only controls, Public Comments/Internal Notes distinction, validation,
loading/empty/failure states and overflow all pass. A screenshot is evidence of
presentation only; API authorization tests remain the evidence of security.
